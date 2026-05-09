import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { World, WorldRenderer } from './world.js';
import { PlayerController }     from './player.js';
import { Network }               from './network.js';
import { PlayerAvatar }          from './avatar.js';
import { HandRenderer }          from './handRenderer.js';
import { Inventory }             from './inventory.js';
import { PLAYER_EYE_Y, BLOCK }   from './constants.js';
import { ITEM_ID, getItemInfo, ITEM_COLOR, isBlockItem, getItemIconDataUrl } from './items.js';
import { matchRecipe, consumeIngredients, SMELT_RECIPES, RECIPES } from './crafting.js';
import { MobManager } from './mobs.js';

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

    this.avatars          = new Map();
    this._avatarPositions = new Map(); // socketId → {x,y,z}
    this.mobManager       = null;

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

    // Ciclo dia/noite
    this._dayTime      = 0.25;   // 0-1 (0=meia-noite, 0.25=manhã, 0.5=meio-dia, 0.75=anoitecer)
    this._dayDuration  = 480;    // segundos por ciclo completo
    this._sun          = null;
    this._fill         = null;
    this._ambient      = null;

    // Saúde e fome
    this._health       = 20;     // 0-20 (10 corações)
    this._hunger       = 20;     // 0-20 (10 ícones de comida)
    this._hungerTimer  = 0;
    this._regenTimer   = 0;
    this._starvTimer   = 0;
    this._dead         = false;
    this._spawnPos     = null;   // {x,y,z} para respawn

    // Combate
    this._attackCooldown = 0;    // segundos até poder atacar de novo

    // Items no chão (drops de mobs)
    this._drops = [];            // [{ id, count, x, y, z, mesh, rotT }]
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
    this.scene.fog         = new THREE.Fog(0x87ceeb, 60, 130);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 200);

    this._ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this._ambient);

    this._sun = new THREE.DirectionalLight(0xfffde7, 0.85);
    this._sun.position.set(40, 70, 30);
    this._sun.castShadow = true;
    const sc = this._sun.shadow.camera;
    sc.left = sc.bottom = -80; sc.right = sc.top = 80;
    sc.near = 0.5; sc.far = 200;
    this._sun.shadow.mapSize.setScalar(2048);
    this._sun.shadow.bias = -0.0005;
    this.scene.add(this._sun);

    this._fill = new THREE.DirectionalLight(0xadd8e6, 0.25);
    this._fill.position.set(-20, 10, -20);
    this.scene.add(this._fill);

    this.mobManager = new MobManager(this.scene);
  }

  // ── Network handlers ──────────────────────────────────────────────────────
  _registerNetworkHandlers() {
    const { network } = this;

    network.on('world:init', (data) => {
      this.world.load(data);
      this.worldRenderer = new WorldRenderer(this.scene, this.world);
      this.worldRenderer.build();

      this._spawnPos = { x: data.spawnX, y: data.spawnY, z: data.spawnZ };
      this.player = new PlayerController(
        this.camera, this.scene, this.world, network, this.inventory,
        () => this.worldRenderer.rebuild(),
        (type) => this._openSpecial(type),
        this.handRenderer,
        (foodVal) => this._onEat(foodVal),
      );
      this.player.onFallDamage = (dmg) => {
        if (this._dead) return;
        this._health = Math.max(0, this._health - dmg);
        this._renderHealthHunger();
        this._flashDamage();
        if (this._health <= 0) this._onDeath('queda');
      };
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
      this.inventory.onChanged = () => { this._renderInventoryUI(); this._renderRecipeBook(); };

      this.ready = true;
      this._renderHealthHunger();
    });

    network.on('players:list', (list) => { list.forEach(p=>this._addAvatar(p.id,p)); this._updateCount(); });
    network.on('player:join',  (p)    => { this._addAvatar(p.id,p); this._updateCount(); });
    network.on('player:leave', ({id}) => { this._removeAvatar(id);  this._updateCount(); });
    network.on('player:move',  ({id,x,y,z,rotY,moving}) => {
      this.avatars.get(id)?.update(x, y-PLAYER_EYE_Y, z, rotY, moving);
      this._avatarPositions.set(id, { x, y: y - PLAYER_EYE_Y, z });
    });
    network.on('block:update', ({x,y,z,type}) => {
      this.world.setBlock(x,y,z,type); this.worldRenderer?.rebuild();
    });

    // Batch de blocos destruídos (explosão do Creeper)
    network.on('block:updates', (changes) => {
      for (const { x, y, z, type } of changes) this.world.setBlock(x, y, z, type);
      this.worldRenderer?.rebuild();
    });

    // ── Mobs ────────────────────────────────────────────────────────────────
    network.on('mob:init',  (list)  => this.mobManager?.spawnBatch(list));
    network.on('mob:spawn', (data)  => this.mobManager?.spawn(data));
    network.on('mob:batch', (list)  => this.mobManager?.updateBatch(list));
    network.on('mob:hit',  ({ id }) => this.mobManager?.flashMob(id));
    network.on('creeper:fuse',    ({ id, active }) => this.mobManager?.fuseMob(id, active));
    network.on('creeper:explode', ({ x, y, z })   => this._onCreeperExplode(x, y, z));
    network.on('mob:die',  ({ id, drops, x, y, z }) => {
      this.mobManager?.die(id);
      // Criar itens no chão para recolher
      if (drops?.length) drops.forEach(d => this._spawnDrop(d.id, d.count, x ?? 0, (y ?? 0) + 0.3, z ?? 0));
    });

    // ── Dano ao jogador (de mobs ou PvP) ──────────────────────────────────
    network.on('player:damage', ({ amount, sourceName }) => {
      if (this._dead) return;
      this._health = Math.max(0, this._health - amount);
      this._renderHealthHunger();
      this._flashDamage();
      if (this._health <= 0) this._onDeath(sourceName);
    });

    // ── Mensagens de morte ──────────────────────────────────────────────────
    network.on('chat:kill', ({ player, killedBy }) => {
      this._showKillFeed(`${player} foi morto por ${killedBy}`);
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
      // Q — dropa 1 item da mão
      if (e.code === 'KeyQ' && !this._invOpen && this.player?.controls.isLocked && !this._dead) {
        this._dropHeldItem();
      }
    });

    // Click ESQUERDO: pegar stack inteira / colocar stack inteira / trocar
    document.addEventListener('click', e => {
      if (!this._invOpen || e.button !== 0) return;
      if (e.target.closest('#craft-result-2,#craft-result-3')) {
        this._takeCraftResult(); return;
      }
      if (e.target.closest('#smelt-result-slot')) {
        this._takeSmeltResult(); return;
      }
      const slot = e.target.closest('.inv-slot');
      if (!slot) return;
      e.preventDefault();
      const idx  = parseInt(slot.dataset.idx);
      const area = slot.dataset.area;
      if (!this._heldItem) this._pickupSlot(idx, area, false);
      else                  this._placeSlot(idx, area, false);
      this._renderInventoryUI(); this._renderCursor();
    });

    // Click DIREITO: pegar metade / colocar 1 item
    document.addEventListener('contextmenu', e => {
      if (!this._invOpen) return;
      const slot = e.target.closest('.inv-slot');
      if (!slot) return;
      e.preventDefault();
      const idx  = parseInt(slot.dataset.idx);
      const area = slot.dataset.area;
      if (!this._heldItem) this._pickupSlot(idx, area, true);  // pegar metade
      else                  this._placeSlot(idx, area, true);   // colocar 1
      this._renderInventoryUI(); this._renderCursor();
    });

    document.getElementById('smelt-btn')?.addEventListener('click', () => this._doSmelt());
    document.getElementById('btn-respawn')?.addEventListener('click', () => this._respawn());

    // Fechar ao clicar no fundo escuro
    document.getElementById('inventory-screen')?.addEventListener('click', e => {
      if (e.target === document.getElementById('inventory-screen')) this._closeInventory();
    });

    // Tabs de craft
    document.querySelectorAll('.craft-tab').forEach(btn => {
      btn.addEventListener('click', () => this._switchCraftMode(btn.dataset.mode));
    });

    // ── Ataque a entidades (antes do PlayerController) ───────────────────────
    // Este listener é adicionado antes do PlayerController existir, por isso
    // corre primeiro e pode suprimir o breaking de blocos.
    window.addEventListener('mousedown', e => {
      if (e.button !== 0 || this._invOpen || !this.player?.controls.isLocked || this._dead) return;
      if (this._attackCooldown > 0) return;
      const hit = this._getEntityInCrosshair();
      if (hit) {
        this.player.suppressNextBreak();
        this._attackEntity(hit);
      }
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
    this._renderRecipeBook();
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
    // Try whichever panel is currently visible
    for (const mode of ['inventory','crafting']) {
      const slots = mode==='crafting' ? this._craftSlots3 : this._craftSlots;
      const size  = mode==='crafting' ? 3 : 2;
      const rows  = [];
      for (let r=0;r<size;r++) {
        const row=[]; for(let c=0;c<size;c++) row.push(slots[r*size+c]?.id||0);
        rows.push(row);
      }
      const result = matchRecipe(rows);
      if (result) {
        consumeIngredients(slots);
        this.inventory.addItem(result.id, result.count);
        this._updateCraftResult();
        this._renderInventoryUI();
        this._renderRecipeBook();
        return;
      }
    }
  }

  _updateCraftResult() {
    // Actualiza ambos os slots de resultado (2×2 e 3×3)
    for (const mode of ['inventory','crafting']) {
      const elId = mode==='crafting' ? 'craft-result-3' : 'craft-result-2';
      const el   = document.getElementById(elId);
      if (!el) continue;
      const slots = mode==='crafting' ? this._craftSlots3 : this._craftSlots;
      const size  = mode==='crafting' ? 3 : 2;
      const rows  = [];
      for (let r=0;r<size;r++) {
        const row=[]; for(let c=0;c<size;c++) row.push(slots[r*size+c]?.id||0);
        rows.push(row);
      }
      const result = matchRecipe(rows);
      renderSlotEl(el, result ? { id:result.id, count:result.count } : null);
    }
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

  // ── Livro de Receitas ─────────────────────────────────────────────────────

  _renderRecipeBook() {
    const list = document.getElementById('recipe-list');
    if (!list) return;
    list.innerHTML = '';

    for (const recipe of RECIPES) {
      const rows = recipe.grid.length;
      const cols = Math.max(...recipe.grid.map(r => r.length));
      const size = (rows <= 2 && cols <= 2) ? 2 : 3;
      const needs3 = size === 3;
      const hasMats = this._canCraftRecipe(recipe);

      // Só mostra receitas que o jogador pode fazer agora
      if (!hasMats) continue;

      const card = document.createElement('div');
      card.className = 'recipe-card has-mats';
      card.title = 'Clica para colocar na bancada';

      // Mini grelha de ingredientes
      const grid = document.createElement('div');
      grid.className = `rec-grid s${size}`;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const id = recipe.grid[r]?.[c] || 0;
          const slot = document.createElement('div');
          slot.className = 'rec-slot';
          if (id) {
            slot.style.backgroundImage = `url(${getItemIconDataUrl(id)})`;
          }
          grid.appendChild(slot);
        }
      }

      // Seta
      const arrow = document.createElement('div');
      arrow.className = 'rec-arrow';
      arrow.textContent = '→';

      // Resultado
      const res = document.createElement('div');
      res.className = 'rec-result';
      const resSlot = document.createElement('div');
      resSlot.className = 'rec-result-slot';
      resSlot.style.backgroundImage = `url(${getItemIconDataUrl(recipe.result.id)})`;
      const cnt = document.createElement('span');
      cnt.className = 'rec-count';
      cnt.textContent = recipe.result.count > 1 ? `×${recipe.result.count}` : '';
      res.appendChild(resSlot);
      res.appendChild(cnt);

      // Info: nome + tag 3×3
      const info = document.createElement('div');
      info.className = 'rec-info';
      const nm = document.createElement('div');
      nm.className = 'rec-name';
      nm.textContent = recipe.name;
      info.appendChild(nm);
      if (needs3) {
        const tag = document.createElement('div');
        tag.className = 'rec-tag';
        tag.textContent = '🪓 bancada';
        info.appendChild(tag);
      }

      card.appendChild(grid);
      card.appendChild(arrow);
      card.appendChild(res);
      card.appendChild(info);

      card.addEventListener('click', () => this._applyRecipe(recipe, size));
      list.appendChild(card);
    }
  }

  _canCraftRecipe(recipe) {
    const needed = {};
    for (const row of recipe.grid)
      for (const id of row)
        if (id) needed[id] = (needed[id] || 0) + 1;
    for (const [id, n] of Object.entries(needed))
      if (this._countInInventory(+id) < n) return false;
    return true;
  }

  _countInInventory(id) {
    let total = 0;
    for (const s of this.inventory.slots) if (s?.id === id) total += s.count;
    return total;
  }

  _takeFromInventory(id, count) {
    for (let i = 0; i < this.inventory.slots.length; i++) {
      const s = this.inventory.slots[i];
      if (s?.id === id && s.count >= count) {
        s.count -= count;
        if (s.count <= 0) this.inventory.slots[i] = null;
        this.inventory._changed();
        return true;
      }
    }
    return false;
  }

  _applyRecipe(recipe, size) {
    const needs3 = size === 3;
    // Mudar para o painel correcto
    this._switchCraftMode(needs3 ? 'crafting' : 'inventory');

    // Devolver ingredientes actuais ao inventário
    const slots = needs3 ? this._craftSlots3 : this._craftSlots;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]) { this.inventory.addItem(slots[i].id, slots[i].count); slots[i] = null; }
    }

    // Verificar materiais novamente após devolver
    if (!this._canCraftRecipe(recipe)) {
      this._updateCraftResult(); this._renderInventoryUI(); return;
    }

    // Preencher grelha com a receita
    for (let r = 0; r < recipe.grid.length; r++) {
      for (let c = 0; c < (recipe.grid[r]?.length || 0); c++) {
        const id = recipe.grid[r][c];
        if (!id) continue;
        if (this._takeFromInventory(id, 1)) {
          slots[r * size + c] = { id, count: 1 };
        }
      }
    }

    this._updateCraftResult();
    this._renderInventoryUI();
    this._renderRecipeBook();
  }

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

  // ── Combate e entidades ───────────────────────────────────────────────────

  _getPlayerDamage() {
    const held = this.inventory.getHotbar(this.player?.selectedSlot ?? 0);
    if (!held) return 1;
    const info = getItemInfo(held.id);
    if (info.tool === 'sword') return [3, 5, 7, 9][info.tier ?? 0];
    if (info.tool === 'axe')   return [2, 4, 6, 8][info.tier ?? 0];
    return 1;
  }

  /** Retorna { type:'mob'|'player', id } ou null se nada no crosshair */
  _getEntityInCrosshair() {
    if (!this.camera || !this.mobManager) return null;
    // Testar mobs
    const mobHit = this.mobManager.hitTest(this.camera);
    if (mobHit) return { type: 'mob', id: mobHit.mobId, dist: mobHit.dist };
    // Testar avatares (PvP)
    const pos = this.player.position;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    for (const [socketId, avPos] of this._avatarPositions) {
      const dx = avPos.x - pos.x, dy = avPos.y - pos.y + 0.9, dz = avPos.z - pos.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 5 || dist < 0.5) continue;
      const dot = (dx*dir.x + dy*dir.y + dz*dir.z) / dist;
      if (dot > 0.80) return { type: 'player', id: socketId, dist };
    }
    return null;
  }

  _attackEntity(hit) {
    const dmg = this._getPlayerDamage();
    this._attackCooldown = 0.45;
    this.handRenderer.swing?.();
    if (hit.type === 'mob') {
      this.mobManager?.flashMob(hit.id); // flash imediato (client-side)
      this.network.socket.emit('mob:attack', { mobId: hit.id, damage: dmg });
    } else if (hit.type === 'player') {
      this.network.socket.emit('pvp:attack', { targetId: hit.id, damage: dmg });
    }
  }

  _flashDamage() {
    const overlay = document.getElementById('damage-flash');
    if (!overlay) return;
    overlay.style.opacity = '0.45';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { overlay.style.opacity = '0'; }, 300);
  }

  /** Flash branco de explosão + reconstrução do mundo */
  _onCreeperExplode(x, y, z) {
    // Flash branco intenso no ecrã (se perto do jogador)
    if (this.player) {
      const pos = this.player.position;
      const dx = pos.x - x, dy = pos.y - y, dz = pos.z - z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist < 12) {
        const overlay = document.getElementById('damage-flash');
        if (overlay) {
          const intensity = Math.max(0.15, 0.9 - dist * 0.07);
          overlay.style.background = 'radial-gradient(ellipse at center, rgba(255,255,200,0.95) 0%, rgba(255,220,100,0.6) 60%, transparent 100%)';
          overlay.style.opacity = String(intensity);
          clearTimeout(this._explodeFlashTimer);
          this._explodeFlashTimer = setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.background = '';  // repõe o gradiente vermelho original
          }, 500);
        }
      }
    }
    // O worldRenderer.rebuild() já é chamado pelo handler 'block:updates'
  }

  _onDeath(killedByName) {
    if (this._dead) return;
    this._dead = true;
    this.network.socket.emit('player:died', { killedByName });
    // Mostrar écran de morte
    const el = document.getElementById('death-screen');
    if (el) {
      document.getElementById('death-cause').textContent = `Morto por: ${killedByName}`;
      el.style.display = 'flex';
    }
    if (this.player?.controls.isLocked) this.player.controls.unlock();
  }

  _respawn() {
    this._dead    = false;
    this._health  = 20;
    this._hunger  = 20;
    this._hungerTimer = 0;
    this._renderHealthHunger();
    const el = document.getElementById('death-screen');
    if (el) el.style.display = 'none';
    if (this._spawnPos) this.player.setSpawn(this._spawnPos.x, this._spawnPos.y, this._spawnPos.z);
    setTimeout(() => this.player?.controls.lock(), 100);
  }

  _onEat(foodVal) {
    this._hunger = Math.min(20, this._hunger + foodVal);
    this._renderHealthHunger();
    this._renderInventoryUI();
  }

  _showKillFeed(msg) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const line = document.createElement('div');
    line.className = 'kill-line';
    line.textContent = msg;
    feed.appendChild(line);
    setTimeout(() => line.remove(), 5000);
  }

  // ── Drops no chão ────────────────────────────────────────────────────────

  /** Dropa 1 item da mão (tecla Q) à frente do jogador */
  _dropHeldItem() {
    if (!this.player) return;
    const slot = this.player.selectedSlot;
    const item  = this.inventory.getHotbar(slot);
    if (!item) return;

    // Posição: ligeiramente à frente e no nível dos olhos
    const pos = this.player.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() > 0.0001) dir.normalize();
    const dropX = pos.x + dir.x * 0.8;
    const dropY = pos.y - 0.4;   // perto do nível dos pés
    const dropZ = pos.z + dir.z * 0.8;

    this.inventory.removeFromSlot(slot, 1);
    this._spawnDrop(item.id, 1, dropX, dropY, dropZ, 1.0); // 1s antes de poder recolher
  }

  _spawnDrop(id, count, x, y, z, pickupDelay = 0) {
    if (!this.scene) return;
    const col  = ITEM_COLOR[id] || '#ffcc00';
    const colHex = typeof col === 'string' && col.startsWith('#')
      ? parseInt(col.slice(1), 16) : 0xffcc00;
    const geo  = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const mat  = new THREE.MeshLambertMaterial({ color: colHex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.14, z);
    mesh.castShadow = false;
    this.scene.add(mesh);
    this._drops.push({ id, count, x, y: y + 0.14, z, mesh, rotT: Math.random() * Math.PI * 2, pickupDelay });
  }

  _updateDrops(dt) {
    if (!this._drops.length || !this.player) return;
    const px = this.player.position.x, py = this.player.position.y, pz = this.player.position.z;
    for (let i = this._drops.length - 1; i >= 0; i--) {
      const d = this._drops[i];
      if (d.pickupDelay > 0) d.pickupDelay -= dt;
      d.rotT += dt * 2.2;
      d.mesh.rotation.y = d.rotT;
      d.mesh.position.y = d.y + Math.sin(d.rotT * 1.4) * 0.08;
      // Auto-pickup quando próximo (e sem delay)
      if (d.pickupDelay <= 0) {
        const dx = d.x - px, dy = d.y - py, dz = d.z - pz;
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 1.8) {
          this.inventory.addItem(d.id, d.count);
          this.scene.remove(d.mesh);
          d.mesh.geometry.dispose();
          d.mesh.material.dispose();
          this._drops.splice(i, 1);
        }
      }
    }
  }

  // ── Ciclo Dia/Noite ───────────────────────────────────────────────────────
  _updateDayNight(dt) {
    if (!this._sun) return;
    this._dayTime = (this._dayTime + dt / this._dayDuration) % 1;
    const t = this._dayTime;

    // Sun arc: angle = t*2π — at t=0 (midnight) sun is below, t=0.5 (noon) sun is at top
    const angle = t * Math.PI * 2 - Math.PI / 2; // -PI/2 at midnight → PI/2 at noon → 3PI/2 at midnight
    const dist  = 100;
    this._sun.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 35);

    // sunFactor: 0 at horizon, 1 at noon (only positive when sun is up)
    const sunFactor = Math.max(0, Math.sin(angle + Math.PI / 2)); // sin of elevation

    // Sky and lighting based on time
    let skyR, skyG, skyB, ambI, sunI;

    if (sunFactor > 0) {
      // Daytime (sun above horizon)
      const day = Math.min(1, sunFactor * 2.5); // fast transition from orange to blue
      // Dawn/dusk = orange (255,112,67), Day = blue (135,206,235)
      skyR = Math.round(255 + (135 - 255) * day);
      skyG = Math.round(112 + (206 - 112) * day);
      skyB = Math.round( 67 + (235 -  67) * day);
      ambI = 0.18 + sunFactor * 0.55;
      sunI = sunFactor * 0.90;
      this._sun.color.setRGB(1, 0.9 + day * 0.1, 0.7 + day * 0.2);
    } else {
      // Nighttime
      skyR = 8; skyG = 10; skyB = 22;
      ambI = 0.06;
      sunI = 0;
    }

    const skyColor = new THREE.Color(skyR / 255, skyG / 255, skyB / 255);
    this.scene.background = skyColor;
    this.scene.fog.color.copy(skyColor);
    this._ambient.intensity = ambI;
    this._sun.intensity     = sunI;
    this._fill.intensity    = 0.08 + sunFactor * 0.18;
  }

  // ── Saúde e Fome ──────────────────────────────────────────────────────────
  _updateHealthHunger(dt) {
    // Fome: perde 1 ponto a cada 30 seg
    this._hungerTimer += dt;
    if (this._hungerTimer >= 30) {
      this._hungerTimer = 0;
      if (this._hunger > 0) { this._hunger--; this._renderHealthHunger(); }
    }

    // Regeneração: +1 vida a cada 1.5s se fome >= 18
    if (this._hunger >= 18 && this._health < 20) {
      this._regenTimer += dt;
      if (this._regenTimer >= 1.5) {
        this._regenTimer = 0;
        this._health = Math.min(20, this._health + 1);
        this._renderHealthHunger();
      }
    } else { this._regenTimer = 0; }

    // Dano por fome: -1 vida a cada 4s se fome == 0 (mín 1 HP)
    if (this._hunger === 0) {
      this._starvTimer += dt;
      if (this._starvTimer >= 4) {
        this._starvTimer = 0;
        if (this._health > 1) { this._health--; this._renderHealthHunger(); }
      }
    } else { this._starvTimer = 0; }
  }

  _renderHealthHunger() {
    const hEl = document.getElementById('health-bar');
    const fEl = document.getElementById('hunger-bar');
    if (!hEl || !fEl) return;

    // Corações (10 total, cada um vale 2 HP)
    let hHtml = '';
    for (let i = 0; i < 10; i++) {
      const hp = Math.max(0, Math.min(2, this._health - i * 2));
      const cls = hp >= 2 ? 'full' : hp === 1 ? 'half' : 'empty';
      hHtml += `<span class="heart ${cls}"></span>`;
    }
    hEl.innerHTML = hHtml;

    // Ícones de fome (10 total, cada um vale 2)
    let fHtml = '';
    for (let i = 0; i < 10; i++) {
      const fp = Math.max(0, Math.min(2, this._hunger - i * 2));
      const cls = fp >= 2 ? 'full' : fp === 1 ? 'half' : 'empty';
      fHtml += `<span class="hunger-icon ${cls}"></span>`;
    }
    fEl.innerHTML = fHtml;
  }

  // ── Avatares ──────────────────────────────────────────────────────────────
  _addAvatar(id, data) {
    if (this.avatars.has(id)) return;
    const av = new PlayerAvatar(this.scene, this.labelRenderer, data.name);
    av.update(data.x, data.y-PLAYER_EYE_Y, data.z, data.rotY??0, false);
    this.avatars.set(id, av);
    this._avatarPositions.set(id, { x: data.x, y: data.y - PLAYER_EYE_Y, z: data.z });
  }
  _removeAvatar(id) {
    const av=this.avatars.get(id); if(!av) return;
    av.dispose(this.scene); this.avatars.delete(id);
    this._avatarPositions.delete(id);
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
      this.mobManager?.animate(dt);
      this._updateDayNight(dt);
      if (!this._dead) {
        this._updateHealthHunger(dt);
        // Void: pés abaixo de y=-5 (5 blocos abaixo do bedrock)
        const feetY = this.player.position.y - 1.6;
        if (feetY < -5) this._onDeath('void');
      }
      if (this._attackCooldown > 0) this._attackCooldown -= dt;
      this._updateDrops(dt);
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
