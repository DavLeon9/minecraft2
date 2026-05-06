import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { World, WorldRenderer } from './world.js';
import { PlayerController }     from './player.js';
import { Network }               from './network.js';
import { PlayerAvatar }          from './avatar.js';
import { HandRenderer }          from './handRenderer.js';
import { Inventory }             from './inventory.js';
import { PLAYER_EYE_Y, BLOCK }   from './constants.js';
import { ITEM_ID, getItemInfo, ITEM_COLOR, ITEM_ICON, isBlockItem, getItemIconDataUrl } from './items.js';
import { matchRecipe, consumeIngredients, SMELT_RECIPES } from './crafting.js';

// ─── Utilidade de display de slot ─────────────────────────────────────────────
function renderSlotEl(el, item) {
  if (!item) {
    el.innerHTML = '';
    el.style.backgroundImage = '';
    el.style.backgroundColor = '';
    return;
  }
  const url = getItemIconDataUrl(item.id);
  el.style.backgroundImage    = `url(${url})`;
  el.style.backgroundSize     = '78% 78%';
  el.style.backgroundRepeat   = 'no-repeat';
  el.style.backgroundPosition = 'center';
  el.style.backgroundColor    = '';
  el.innerHTML = item.count > 1 ? `<span class="slot-qty">${item.count}</span>` : '';
}

export class Game {
  constructor() {
    this.renderer      = null;
    this.labelRenderer = null;
    this.handRenderer  = null;
    this.scene         = null;
    this.camera        = null;
    this.clock         = new THREE.Clock(false);

    this.world         = new World();
    this.network       = new Network();
    this.worldRenderer = null;
    this.player        = null;
    this.inventory     = new Inventory();
    this.localNick     = '';

    this.avatars       = new Map();

    this.ready         = false;
    this._frameCount   = 0;
    this._fpsTimer     = 0;

    // Estado do inventário / crafting
    this._invOpen      = false;
    this._craftMode    = 'inventory'; // 'inventory' | 'crafting' | 'furnace'
    this._craftSlots   = new Array(4).fill(null);  // 2x2
    this._craftSlots3  = new Array(9).fill(null);  // 3x3
    this._furnaceSlots = [null, null];             // [ingredient, fuel]
    this._heldItem     = null;                     // item no cursor
  }

  // ── Inicialização ─────────────────────────────────────────────────────────
  init() {
    this._initRenderer();
    this._initScene();
    this._registerNetworkHandlers();
    this._setupInventoryUI();
    window.addEventListener('resize', () => this._onResize());
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.autoClear         = false;  // gerimos manualmente para o hand pass
    document.body.prepend(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.cssText='position:fixed;top:0;left:0;pointer-events:none;z-index:5;';
    document.body.appendChild(this.labelRenderer.domElement);

    this.handRenderer = new HandRenderer();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog         = new THREE.Fog(0x87ceeb, 45, 95);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 200);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfffde7, 0.85);
    sun.position.set(40, 70, 30); sun.castShadow=true;
    const sc=sun.shadow.camera; sc.left=sc.bottom=-70; sc.right=sc.top=70;
    sc.near=0.5; sc.far=180; sun.shadow.mapSize.setScalar(2048); sun.shadow.bias=-0.0005;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xadd8e6, 0.25);
    fill.position.set(-20, 10, -20);
    this.scene.add(fill);
  }

  // ── Network handlers ──────────────────────────────────────────────────────
  _registerNetworkHandlers() {
    const { network } = this;

    network.on('world:init', (data) => {
      this.world.load(data);
      this.worldRenderer = new WorldRenderer(this.scene, this.world);
      this.worldRenderer.build();

      this.player = new PlayerController(
        this.camera, this.scene, this.world, network, this.inventory,
        () => this.worldRenderer.rebuild(),
        (type) => this._openSpecial(type),
        this.handRenderer,
      );
      this.player.setSpawn(data.spawnX, data.spawnY, data.spawnZ);

      const btnPlay = document.getElementById('btn-play');
      const overlay = document.getElementById('overlay');
      btnPlay.style.display = 'block';
      btnPlay.addEventListener('click', () => this.player.controls.lock());
      this.player.controls.addEventListener('lock', () => { overlay.style.display='none'; });
      this.player.controls.addEventListener('unlock', () => {
        if (!this._invOpen) {
          overlay.style.display='flex';
          document.getElementById('overlay-msg').textContent='Premiste ESC — pausado';
        }
      });

      // Inventory callback
      this.inventory.onChanged = () => this._renderInventoryUI();

      this.ready = true;
    });

    network.on('players:list', (list) => { list.forEach(p=>this._addAvatar(p.id,p)); this._updateCount(); });
    network.on('player:join',  (p)    => { this._addAvatar(p.id,p); this._updateCount(); });
    network.on('player:leave', ({id}) => { this._removeAvatar(id);  this._updateCount(); });
    network.on('player:move',  ({id,x,y,z,rotY,moving}) => {
      this.avatars.get(id)?.update(x, y-PLAYER_EYE_Y, z, rotY, moving);
    });
    network.on('block:update', ({x,y,z,type}) => {
      this.world.setBlock(x,y,z,type); this.worldRenderer?.rebuild();
    });
    network.on('disconnect', () => {
      document.getElementById('overlay').style.display='flex';
      document.getElementById('overlay-msg').textContent='Desconectado. Recarrega.';
      document.getElementById('btn-play').style.display='none';
    });
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async login(nick) {
    this.localNick = nick;
    localStorage.setItem('mc2_nick', nick);
    document.getElementById('info-nick').textContent = `👤 ${nick}`;
    // Definir cor da camisa do braço com base no nick
    let h=5381; for(let i=0;i<nick.length;i++) h=Math.imul((h<<5)+h,1)^nick.charCodeAt(i);
    this.handRenderer.setNickHue(Math.abs(h)%360/360);
    await this.network.connect(nick);
  }

  start() { this.clock.start(); this._loop(); }

  // ── Inventário UI ─────────────────────────────────────────────────────────
  _setupInventoryUI() {
    // Tecla E abre/fecha inventário
    window.addEventListener('keydown', e => {
      if (!this.ready) return;
      if (e.code === 'KeyE') {
        if (!document.getElementById('inventory-screen').classList.contains('open')) {
          if (this.player?.controls.isLocked) this.player.controls.unlock();
          this._openInventory('inventory');
        } else {
          this._closeInventory();
        }
      }
      if (e.code === 'Escape' && this._invOpen) {
        this._closeInventory();
      }
    });

    // Drag: mousedown pega item, mouseup solta item noutro slot
    let _dragSrc = null;
    document.addEventListener('mousedown', e => {
      if (!this._invOpen) return;
      if (e.button !== 0) return;
      const slot = e.target.closest('.inv-slot');
      const isResult = e.target.closest('#craft-result-slot,#smelt-result-slot');
      if (isResult) { this._takeCraftResult(); return; }
      if (!slot) return;
      e.preventDefault();
      const idx = parseInt(slot.dataset.idx);
      const area = slot.dataset.area;
      _dragSrc = { idx, area };
      if (!this._heldItem) {
        // pegar item
        this._pickupSlot(idx, area);
        this._renderInventoryUI(); this._renderCursor();
      }
    });
    document.addEventListener('mouseup', e => {
      if (!this._invOpen || e.button !== 0) return;
      const slot = e.target.closest('.inv-slot');
      if (!slot || !this._heldItem) { _dragSrc = null; return; }
      const idx  = parseInt(slot.dataset.idx);
      const area = slot.dataset.area;
      // Não colocar de volta na mesma origem (seria no-op)
      if (_dragSrc && _dragSrc.idx === idx && _dragSrc.area === area) { _dragSrc = null; return; }
      _dragSrc = null;
      this._placeSlot(idx, area, false);
      this._renderInventoryUI(); this._renderCursor();
    });
    document.addEventListener('contextmenu', e => {
      if (!this._invOpen) return;
      const slot = e.target.closest('.inv-slot');
      if (!slot) return;
      e.preventDefault();
      const idx  = parseInt(slot.dataset.idx);
      const area = slot.dataset.area;
      if (!this._heldItem) this._pickupSlot(idx, area, true);
      else this._placeSlot(idx, area, true);
      this._renderInventoryUI(); this._renderCursor();
    });

    document.getElementById('smelt-btn')?.addEventListener('click', () => this._doSmelt());

    // Fechar ao clicar no fundo escuro
    document.getElementById('inventory-screen')?.addEventListener('click', e => {
      if (e.target === document.getElementById('inventory-screen')) this._closeInventory();
    });

    // Tabs de craft
    document.querySelectorAll('.craft-tab').forEach(btn => {
      btn.addEventListener('click', () => this._switchCraftMode(btn.dataset.mode));
    });

    // Cursor do item segurado
    document.addEventListener('mousemove', e => {
      const c = document.getElementById('cursor-item');
      if (c) { c.style.left=(e.clientX+8)+'px'; c.style.top=(e.clientY+8)+'px'; }
    });
  }

  _openInventory(mode='inventory') {
    this._invOpen = true;
    this._craftMode = mode;
    const scr = document.getElementById('inventory-screen');
    scr.classList.add('open');
    this._switchCraftMode(mode);
    this._renderInventoryUI();
    document.getElementById('overlay').style.display = 'none';
  }

  _openSpecial(type) {
    if (!this.player?.controls.isLocked) return;
    this.player.controls.unlock();
    this._openInventory(type);
  }

  _closeInventory() {
    this._invOpen = false;
    // Devolver item segurado ao inventário
    if (this._heldItem) {
      this.inventory.addItem(this._heldItem.id, this._heldItem.count);
      this._heldItem = null;
      this._renderCursor();
    }
    document.getElementById('inventory-screen').classList.remove('open');
    // Re-lock pointer (volta ao jogo)
    setTimeout(() => {
      if (this.player && !this._invOpen) this.player.controls.lock();
    }, 120);
  }

  _switchCraftMode(mode) {
    this._craftMode = mode;
    document.querySelectorAll('.craft-panel').forEach(p => p.style.display='none');
    const el = document.getElementById(`panel-${mode}`);
    if (el) el.style.display='';
    document.querySelectorAll('.craft-tab').forEach(b => b.classList.toggle('active', b.dataset.mode===mode));
    this._updateCraftResult();
  }

  // ── Slot logic — pickup / place ───────────────────────────────────────────

  _pickupSlot(idx, area, half=false) {
    const slots = this._slotsFor(area);
    if (!slots) return;
    const slot = area === 'inv' ? this.inventory.getSlot(idx) : slots[idx];
    if (!slot) return;
    if (half) {
      const n = Math.ceil(slot.count / 2);
      this._heldItem = { id: slot.id, count: n };
      const rem = slot.count - n;
      if (area === 'inv') this.inventory.setSlot(idx, rem > 0 ? { id: slot.id, count: rem } : null);
      else slots[idx] = rem > 0 ? { id: slot.id, count: rem } : null;
    } else {
      this._heldItem = { ...slot };
      if (area === 'inv') this.inventory.setSlot(idx, null);
      else slots[idx] = null;
    }
    if (area === 'inv') this.inventory._changed();
    if (area === 'craft2' || area === 'craft3') this._updateCraftResult();
  }

  _placeSlot(idx, area, one=false) {
    if (!this._heldItem) return;
    const slots = this._slotsFor(area);
    if (!slots) return;
    const cur = area === 'inv' ? this.inventory.getSlot(idx) : slots[idx];
    const put = one ? 1 : this._heldItem.count;

    if (!cur) {
      const n = Math.min(put, (getItemInfo(this._heldItem.id).max ?? 64));
      const placed = { id: this._heldItem.id, count: n };
      if (area === 'inv') this.inventory.setSlot(idx, placed);
      else slots[idx] = placed;
      this._heldItem.count -= n;
      if (this._heldItem.count <= 0) this._heldItem = null;
    } else if (cur.id === this._heldItem.id) {
      const max  = getItemInfo(cur.id).max ?? 64;
      const room = max - cur.count;
      const n    = Math.min(put, room);
      cur.count += n; this._heldItem.count -= n;
      if (area === 'inv') this.inventory.slots[idx] = cur;
      else slots[idx] = cur;
      if (this._heldItem.count <= 0) this._heldItem = null;
    } else {
      // swap
      const tmp = { ...cur };
      if (area === 'inv') this.inventory.setSlot(idx, this._heldItem);
      else slots[idx] = this._heldItem;
      this._heldItem = tmp;
    }
    if (area === 'inv') this.inventory._changed();
    if (area === 'craft2' || area === 'craft3') this._updateCraftResult();
  }

  _slotsFor(area) {
    if (area === 'inv')     return this.inventory.slots; // special-cased above
    if (area === 'craft2')  return this._craftSlots;
    if (area === 'craft3')  return this._craftSlots3;
    if (area === 'furnace') return this._furnaceSlots;
    return null;
  }

  _takeCraftResult() {
    const slots = this._craftMode==='crafting' ? this._craftSlots3 : this._craftSlots;
    const grid  = this._craftMode==='crafting'
      ? [[slots[0],slots[1],slots[2]],[slots[3],slots[4],slots[5]],[slots[6],slots[7],slots[8]]].map(r=>r.map(s=>s?.id||0))
      : [[slots[0],slots[1]],[slots[2],slots[3]]].map(r=>r.map(s=>s?.id||0));
    const result = matchRecipe(grid);
    if (!result) return;
    consumeIngredients(slots);
    this.inventory.addItem(result.id, result.count);
    this._updateCraftResult();
    this._renderInventoryUI();
  }

  _updateCraftResult() {
    const el = document.getElementById('craft-result-slot');
    if (!el) return;
    const slots = this._craftMode==='crafting' ? this._craftSlots3 : this._craftSlots;
    const size  = this._craftMode==='crafting' ? 3 : 2;
    const rows  = [];
    for (let r=0;r<size;r++) {
      const row=[]; for(let c=0;c<size;c++) row.push(slots[r*size+c]?.id||0);
      rows.push(row);
    }
    const result = matchRecipe(rows);
    renderSlotEl(el, result ? { id:result.id, count:result.count } : null);
  }

  _doSmelt() {
    const [ing, fuel] = this._furnaceSlots;
    if (!ing || !fuel) return;
    const rec = SMELT_RECIPES.find(r=>r.input===ing.id && r.fuel===fuel.id);
    if (!rec) return;
    ing.count--;  fuel.count--;
    if (ing.count<=0)  this._furnaceSlots[0]=null;
    if (fuel.count<=0) this._furnaceSlots[1]=null;
    this.inventory.addItem(rec.result.id, rec.result.count);
    this._renderInventoryUI();
  }

  _takeSmeltResult() { /* handled via _doSmelt */ }

  // ── Render do inventário ──────────────────────────────────────────────────
  _renderInventoryUI() {
    // Slots do inventário
    document.querySelectorAll('.inv-slot[data-area="inv"]').forEach((el,i)=>{
      renderSlotEl(el, this.inventory.getSlot(i));
    });
    // Slots de craft 2x2
    document.querySelectorAll('.inv-slot[data-area="craft2"]').forEach((el,i)=>{
      renderSlotEl(el, this._craftSlots[i]);
    });
    // Slots de craft 3x3
    document.querySelectorAll('.inv-slot[data-area="craft3"]').forEach((el,i)=>{
      renderSlotEl(el, this._craftSlots3[i]);
    });
    // Slots da fornalha
    document.querySelectorAll('.inv-slot[data-area="furnace"]').forEach((el,i)=>{
      renderSlotEl(el, this._furnaceSlots[i]);
    });
    this._updateCraftResult();
    this._renderHotbar();
  }

  _renderHotbar() {
    document.querySelectorAll('#hotbar .slot').forEach((el, i) => {
      const item = this.inventory.getHotbar(i);
      if (item) {
        const url = getItemIconDataUrl(item.id);
        el.style.backgroundImage    = `url(${url})`;
        el.style.backgroundSize     = '70% 70%';
        el.style.backgroundRepeat   = 'no-repeat';
        el.style.backgroundPosition = 'center';
        el.innerHTML = item.count > 1
          ? `<span class="slot-qty">${item.count}</span>` : '';
      } else {
        el.style.backgroundImage = '';
        el.innerHTML = '';
      }
      el.classList.toggle('active', i === (this.player?.selectedSlot ?? 0));
    });
  }

  _renderCursor() {
    const el = document.getElementById('cursor-item');
    if (!el) return;
    renderSlotEl(el, this._heldItem);
    el.style.display = this._heldItem ? 'flex' : 'none';
  }

  // ── Avatares ──────────────────────────────────────────────────────────────
  _addAvatar(id, data) {
    if (this.avatars.has(id)) return;
    const av = new PlayerAvatar(this.scene, this.labelRenderer, data.name);
    av.update(data.x, data.y-PLAYER_EYE_Y, data.z, data.rotY??0, false);
    this.avatars.set(id, av);
  }
  _removeAvatar(id) {
    const av=this.avatars.get(id); if(!av) return;
    av.dispose(this.scene); this.avatars.delete(id);
  }
  _updateCount() {
    document.getElementById('info-players').textContent=`Jogadores: ${this.avatars.size+1}`;
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.ready && this.player) {
      this.player.update(dt);
      for (const av of this.avatars.values()) av.animate(dt);
      this.handRenderer.animate(dt);
    }

    this._frameCount++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 1.0) {
      document.getElementById('info-fps').textContent=`FPS: ${this._frameCount}`;
      this._frameCount=0; this._fpsTimer=0;
    }

    // Render principal + braço (pass separado sobre depth buffer)
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    if (!this._invOpen) this.handRenderer.render(this.renderer);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth/window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.handRenderer.onResize();
  }
}
