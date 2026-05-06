import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  BLOCK, PLAYER_HEIGHT, PLAYER_EYE_Y, PLAYER_WIDTH,
  GRAVITY, JUMP_FORCE, MOVE_SPEED, REACH_DISTANCE, MOVE_SEND_RATE,
} from './constants.js';
import { canMine, getBreakTime, getDrops, isBlockItem, getToolInfo } from './items.js';

// ─── Raio DDA ─────────────────────────────────────────────────────────────────
function castRay(camera, world) {
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  camera.getWorldPosition(o); camera.getWorldDirection(d);
  let px=o.x|0, py=o.y|0, pz=o.z|0;
  for (let t=0.04; t<=REACH_DISTANCE; t+=0.04) {
    const x=Math.floor(o.x+d.x*t), y=Math.floor(o.y+d.y*t), z=Math.floor(o.z+d.z*t);
    if (world.isSolid(x,y,z)) return { hit:{x,y,z}, prev:{x:px,y:py,z:pz} };
    px=x; py=y; pz=z;
  }
  return null;
}

// ─── PlayerController ─────────────────────────────────────────────────────────
export class PlayerController {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.Scene}  scene
   * @param {World}        world
   * @param {Network}      network
   * @param {Inventory}    inventory
   * @param {Function}     onRebuild
   * @param {Function}     onOpenCrafting   fn(type) — 'crafting' | 'furnace'
   * @param {HandRenderer} hand
   */
  constructor(camera, scene, world, network, inventory, onRebuild, onOpenSpecial, hand) {
    this.camera      = camera;
    this.world       = world;
    this.network     = network;
    this.inventory   = inventory;
    this.onRebuild   = onRebuild;
    this.onOpenSpecial = onOpenSpecial;
    this.hand        = hand;

    this.controls = new PointerLockControls(camera, document.body);
    scene.add(this.controls.getObject());

    this.vel      = new THREE.Vector3();
    this.onGround = false;

    this.keys          = {};
    this.selectedSlot  = 0;   // índice na hotbar 0-8
    this._moveSendTimer = 0;

    this._fwd   = new THREE.Vector3();
    this._right = new THREE.Vector3();

    // Estado de partida de bloco
    this._breakMouse = false;
    this._breaking   = null;  // { x, y, z, elapsed, total }

    this._setupInput();
  }

  // ── API pública ───────────────────────────────────────────────────────────
  get position()  { return this.camera.position; }
  get isLocked()  { return this.controls.isLocked; }
  get heldItem()  { return this.inventory.getHotbar(this.selectedSlot); }

  setSpawn(x, y, z) { this.camera.position.set(x, y + PLAYER_EYE_Y, z); }

  update(dt) {
    // ── Física sempre activa (mesmo em pausa) — evita flutuar ──────────────
    if (!this.controls.isLocked) {
      this.vel.x = 0; this.vel.z = 0;
      this._applyGravity(dt);
      this._moveAndCollide(dt);
      return;
    }

    this._applyGravity(dt);
    this._applyMovement(dt);
    this._moveAndCollide(dt);
    this._broadcastPosition(dt);
    this._updateHUD();
    this._updateBreaking(dt);
    this._updateHand();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _setupInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      const n = parseInt(e.key);
      if (n >= 1 && n <= 9) this._selectSlot(n - 1);
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    window.addEventListener('wheel', e => {
      let s = this.selectedSlot + (e.deltaY > 0 ? 1 : -1);
      if (s < 0) s = 8; if (s > 8) s = 0;
      this._selectSlot(s);
    }, { passive: true });

    window.addEventListener('mousedown', e => {
      if (!this.controls.isLocked) return;
      e.preventDefault();
      if (e.button === 0) { this._breakMouse = true;  this._tryStartBreaking(); }
      if (e.button === 2) this._placeOrInteract();
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this._breakMouse = false; this._cancelBreaking(); }
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  _selectSlot(n) {
    this.selectedSlot = n;
    document.querySelectorAll('#hotbar .slot').forEach((el, i) => {
      el.classList.toggle('active', i === n);
    });
    this._updateHand();
  }

  // ── Física ────────────────────────────────────────────────────────────────
  _applyGravity(dt) { this.vel.y -= GRAVITY * dt; }

  _applyMovement(dt) {
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() > 0.0001) this._fwd.normalize();
    this._right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0));

    let fx=0, fz=0;
    if (this.keys['KeyW']||this.keys['ArrowUp'])    fz += 1;
    if (this.keys['KeyS']||this.keys['ArrowDown'])  fz -= 1;
    if (this.keys['KeyD']||this.keys['ArrowRight'])  fx += 1;
    if (this.keys['KeyA']||this.keys['ArrowLeft'])   fx -= 1;

    this.vel.x = (this._fwd.x*fz + this._right.x*fx) * MOVE_SPEED;
    this.vel.z = (this._fwd.z*fz + this._right.z*fx) * MOVE_SPEED;

    if ((this.keys['Space']||this.keys['KeyE']) && this.onGround &&
        !document.getElementById('inventory-screen').classList.contains('open')) {
      this.vel.y = JUMP_FORCE; this.onGround = false;
    }
  }

  _moveAndCollide(dt) {
    const pos = this.position;
    pos.x += this.vel.x*dt;
    if (this._collides()) { pos.x -= this.vel.x*dt; this.vel.x=0; }
    pos.y += this.vel.y*dt;
    if (this._collides()) {
      if (this.vel.y<0) this.onGround=true;
      pos.y -= this.vel.y*dt; this.vel.y=0;
    } else if (this.vel.y!==0) this.onGround=false;
    pos.z += this.vel.z*dt;
    if (this._collides()) { pos.z -= this.vel.z*dt; this.vel.z=0; }
  }

  _collides() {
    const pos=this.position, r=PLAYER_WIDTH/2, fy=pos.y-PLAYER_EYE_Y, hy=fy+PLAYER_HEIGHT;
    for(let bx=Math.floor(pos.x-r);bx<=Math.floor(pos.x+r-.001);bx++)
      for(let by=Math.floor(fy);by<=Math.floor(hy-.001);by++)
        for(let bz=Math.floor(pos.z-r);bz<=Math.floor(pos.z+r-.001);bz++)
          if(this.world.isSolid(bx,by,bz)) return true;
    return false;
  }

  // ── Interacção com blocos ─────────────────────────────────────────────────

  _tryStartBreaking() {
    const ray = castRay(this.camera, this.world);
    if (!ray) { this._cancelBreaking(); return; }
    const {x,y,z} = ray.hit;
    if (this._breaking && this._breaking.x===x && this._breaking.y===y && this._breaking.z===z) return;

    const type  = this.world.getBlock(x,y,z);
    const heldId = this.heldItem?.id ?? null;
    const total  = getBreakTime(type, heldId);
    this._breaking = { x,y,z, elapsed:0, total };
    this._setProgress(0);
    this.hand?.swing();
  }

  _cancelBreaking() { this._breaking=null; this._setProgress(-1); }

  _updateBreaking(dt) {
    if (!this._breakMouse || !this._breaking) return;
    const ray = castRay(this.camera, this.world);
    const {x,y,z} = this._breaking;
    if (!ray||ray.hit.x!==x||ray.hit.y!==y||ray.hit.z!==z) {
      this._breaking=null; this._setProgress(-1);
      if (ray) this._tryStartBreaking();
      return;
    }
    if (this._breaking.total===Infinity) {
      // Bloco não pode ser minerado com esta ferramenta
      this._setProgress(0);
      return;
    }
    this._breaking.elapsed += dt;
    const p = Math.min(this._breaking.elapsed/this._breaking.total, 1);
    this._setProgress(p);

    if (p>=1) {
      // Minera o bloco e adiciona drops ao inventário
      const type   = this.world.getBlock(x,y,z);
      const heldId = this.heldItem?.id ?? null;
      const drops  = getDrops(type, heldId);
      drops.forEach(d => this.inventory.addItem(d.id, d.count));

      this.world.setBlock(x,y,z,BLOCK.AIR);
      this.network.sendBlockBreak(x,y,z);
      this._breaking=null; this._setProgress(-1);
      if (this._breakMouse) this._tryStartBreaking();
    }
  }

  _setProgress(p) {
    const bar=document.getElementById('break-progress');
    const fill=document.getElementById('break-fill');
    if(!bar||!fill) return;
    if (p<0) { bar.style.display='none'; }
    else { bar.style.display='block'; fill.style.width=(p*100).toFixed(1)+'%'; }
  }

  _placeOrInteract() {
    const ray = castRay(this.camera, this.world);
    if (!ray) return;
    const {hit, prev} = ray;

    // Interagir com blocos especiais (clique direito)
    const hitType = this.world.getBlock(hit.x, hit.y, hit.z);
    if (hitType === BLOCK.CRAFTING_TABLE) {
      this.onOpenSpecial?.('crafting'); return;
    }
    if (hitType === BLOCK.FURNACE) {
      this.onOpenSpecial?.('furnace'); return;
    }

    // Colocar bloco
    const item = this.heldItem;
    if (!item) return;
    if (!isBlockItem(item.id)) return;
    if (this.world.isSolid(prev.x,prev.y,prev.z)) return;
    if (this._overlapsPlayer(prev.x,prev.y,prev.z)) return;

    this.inventory.removeFromSlot(this.selectedSlot, 1);
    this.world.setBlock(prev.x,prev.y,prev.z, item.id);
    this.network.sendBlockPlace(prev.x,prev.y,prev.z, item.id);
  }

  _overlapsPlayer(bx,by,bz) {
    const p=this.position, r=PLAYER_WIDTH/2, fy=p.y-PLAYER_EYE_Y, hy=fy+PLAYER_HEIGHT;
    return bx<p.x+r&&bx+1>p.x-r&&by<hy&&by+1>fy&&bz<p.z+r&&bz+1>p.z-r;
  }

  // ── Rede ──────────────────────────────────────────────────────────────────
  _broadcastPosition(dt) {
    this._moveSendTimer += dt;
    if (this._moveSendTimer < MOVE_SEND_RATE) return;
    this._moveSendTimer = 0;
    const pos=this.position, e=new THREE.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');
    const moving = Math.abs(this.vel.x)>0.1||Math.abs(this.vel.z)>0.1;
    this.network.sendMove(pos.x,pos.y,pos.z,e.y,moving);
  }

  // ── HUD & mão ────────────────────────────────────────────────────────────
  _updateHUD() {
    const {x,y,z}=this.position, fy=y-PLAYER_EYE_Y;
    const el=document.getElementById('info-pos');
    if(el) el.textContent=`x:${x.toFixed(1)}  y:${fy.toFixed(1)}  z:${z.toFixed(1)}`;
  }

  _updateHand() {
    const item = this.heldItem;
    this.hand?.setHeldItem(item?.id ?? null);
  }
}
