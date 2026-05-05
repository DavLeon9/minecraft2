import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  BLOCK, BREAK_TIME,
  PLAYER_HEIGHT, PLAYER_EYE_Y, PLAYER_WIDTH,
  GRAVITY, JUMP_FORCE, MOVE_SPEED,
  REACH_DISTANCE, MOVE_SEND_RATE,
} from './constants.js';

// ─── Raio DDA (voxel traversal) ───────────────────────────────────────────────
function castRay(camera, world) {
  const origin = new THREE.Vector3();
  const dir    = new THREE.Vector3();
  camera.getWorldPosition(origin);
  camera.getWorldDirection(dir);

  const STEP = 0.04;
  let px = origin.x | 0, py = origin.y | 0, pz = origin.z | 0;

  for (let t = STEP; t <= REACH_DISTANCE; t += STEP) {
    const x = Math.floor(origin.x + dir.x * t);
    const y = Math.floor(origin.y + dir.y * t);
    const z = Math.floor(origin.z + dir.z * t);

    if (world.isSolid(x, y, z)) {
      return { hit: { x, y, z }, prev: { x: px, y: py, z: pz } };
    }
    px = x; py = y; pz = z;
  }
  return null;
}

// ─── PlayerController ─────────────────────────────────────────────────────────
export class PlayerController {
  constructor(camera, scene, world, network, onRebuild) {
    this.camera    = camera;
    this.world     = world;
    this.network   = network;
    this.onRebuild = onRebuild;

    this.controls = new PointerLockControls(camera, document.body);
    scene.add(this.controls.getObject());

    // Física
    this.vel      = new THREE.Vector3();
    this.onGround = false;

    // Input
    this.keys          = {};
    this.selectedBlock = BLOCK.GRASS;
    this._moveSendTimer = 0;

    // Vectores reutilizáveis
    this._fwd   = new THREE.Vector3();
    this._right = new THREE.Vector3();

    // ── Estado de quebrar bloco ──────────────────────────────────────────────
    this._breakMouse   = false;   // botão esquerdo pressionado
    this._breaking     = null;    // { x, y, z, elapsed, total }

    this._setupInput();
  }

  // ── API pública ───────────────────────────────────────────────────────────

  get position() { return this.camera.position; }
  get isLocked()  { return this.controls.isLocked; }

  setSpawn(x, y, z) {
    this.camera.position.set(x, y + PLAYER_EYE_Y, z);
  }

  update(dt) {
    if (!this.controls.isLocked) return;

    this._applyGravity(dt);
    this._applyMovement(dt);
    this._moveAndCollide(dt);
    this._broadcastPosition(dt);
    this._updateHUD();
    this._updateBreaking(dt);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  _setupInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      const n = parseInt(e.key);
      if (n >= 1 && n <= 5) this._selectBlock(n);
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    // Scroll para mudar de bloco (1–5)
    window.addEventListener('wheel', e => {
      let b = this.selectedBlock + (e.deltaY > 0 ? 1 : -1);
      if (b < 1) b = 5;
      if (b > 5) b = 1;
      this._selectBlock(b);
    }, { passive: true });

    // Botão esquerdo: começar a partir
    window.addEventListener('mousedown', e => {
      if (!this.controls.isLocked) return;
      e.preventDefault();
      if (e.button === 0) { this._breakMouse = true;  this._tryStartBreaking(); }
      if (e.button === 2) this._placeBlock();
    });

    // Soltar botão esquerdo: cancelar partida
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this._breakMouse = false; this._cancelBreaking(); }
    });

    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  _selectBlock(n) {
    this.selectedBlock = n;
    document.querySelectorAll('#hotbar .slot').forEach(el => {
      el.classList.toggle('active', +el.dataset.block === n);
    });
  }

  // ── Física ────────────────────────────────────────────────────────────────

  _applyGravity(dt) {
    this.vel.y -= GRAVITY * dt;
  }

  _applyMovement(dt) {
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() > 0.0001) this._fwd.normalize();
    this._right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0));

    let fx = 0, fz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    fz += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  fz -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) fx += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  fx -= 1;

    this.vel.x = (this._fwd.x * fz + this._right.x * fx) * MOVE_SPEED;
    this.vel.z = (this._fwd.z * fz + this._right.z * fx) * MOVE_SPEED;

    if ((this.keys['Space'] || this.keys['KeyE']) && this.onGround) {
      this.vel.y    = JUMP_FORCE;
      this.onGround = false;
    }
  }

  _moveAndCollide(dt) {
    const pos = this.position;

    pos.x += this.vel.x * dt;
    if (this._collidesWorld()) { pos.x -= this.vel.x * dt; this.vel.x = 0; }

    pos.y += this.vel.y * dt;
    if (this._collidesWorld()) {
      if (this.vel.y < 0) this.onGround = true;
      pos.y -= this.vel.y * dt;
      this.vel.y = 0;
    } else if (this.vel.y !== 0) {
      this.onGround = false;
    }

    pos.z += this.vel.z * dt;
    if (this._collidesWorld()) { pos.z -= this.vel.z * dt; this.vel.z = 0; }
  }

  _collidesWorld() {
    const pos   = this.position;
    const r     = PLAYER_WIDTH / 2;
    const feetY = pos.y - PLAYER_EYE_Y;
    const headY = feetY + PLAYER_HEIGHT;

    const x0 = Math.floor(pos.x - r),       x1 = Math.floor(pos.x + r - 0.001);
    const y0 = Math.floor(feetY),            y1 = Math.floor(headY - 0.001);
    const z0 = Math.floor(pos.z - r),        z1 = Math.floor(pos.z + r - 0.001);

    for (let bx = x0; bx <= x1; bx++)
      for (let by = y0; by <= y1; by++)
        for (let bz = z0; bz <= z1; bz++)
          if (this.world.isSolid(bx, by, bz)) return true;
    return false;
  }

  // ── Interacção com blocos ─────────────────────────────────────────────────

  /**
   * Começa a partir o bloco que o raio toca.
   * Se já estava a partir o mesmo bloco, não faz nada (continua).
   */
  _tryStartBreaking() {
    const ray = castRay(this.camera, this.world);
    if (!ray) { this._cancelBreaking(); return; }

    const { x, y, z } = ray.hit;

    // Já a partir este bloco — deixa continuar
    if (this._breaking &&
        this._breaking.x === x &&
        this._breaking.y === y &&
        this._breaking.z === z) return;

    const type  = this.world.getBlock(x, y, z);
    const total = BREAK_TIME[type] ?? 1.0;
    this._breaking = { x, y, z, elapsed: 0, total };
    this._setBreakProgress(0);
  }

  _cancelBreaking() {
    this._breaking = null;
    this._setBreakProgress(-1);
  }

  /**
   * Avança o temporizador de partida a cada frame.
   * Cancela se o jogador olhar para outro bloco.
   * Quebra o bloco quando o tempo se esgota.
   */
  _updateBreaking(dt) {
    if (!this._breakMouse || !this._breaking) return;

    // Verifica se ainda está a olhar para o mesmo bloco
    const ray = castRay(this.camera, this.world);
    if (!ray ||
        ray.hit.x !== this._breaking.x ||
        ray.hit.y !== this._breaking.y ||
        ray.hit.z !== this._breaking.z) {
      // Mudou de bloco — reinicia com o novo (ou cancela se não há)
      this._breaking = null;
      this._setBreakProgress(-1);
      if (ray) this._tryStartBreaking();
      return;
    }

    this._breaking.elapsed += dt;
    const progress = Math.min(this._breaking.elapsed / this._breaking.total, 1);
    this._setBreakProgress(progress);

    if (progress >= 1) {
      // QUEBRA!
      const { x, y, z } = this._breaking;
      this.world.setBlock(x, y, z, BLOCK.AIR);
      this.network.sendBlockBreak(x, y, z);
      this._breaking = null;
      this._setBreakProgress(-1);
      // Se o botão ainda está pressionado, começa no próximo bloco
      if (this._breakMouse) this._tryStartBreaking();
    }
  }

  _setBreakProgress(progress) {
    const bar  = document.getElementById('break-progress');
    const fill = document.getElementById('break-fill');
    if (!bar || !fill) return;
    if (progress < 0) {
      bar.style.display = 'none';
    } else {
      bar.style.display = 'block';
      fill.style.width  = (progress * 100).toFixed(1) + '%';
    }
  }

  _placeBlock() {
    const ray = castRay(this.camera, this.world);
    if (!ray) return;
    const { x, y, z } = ray.prev;
    if (this.world.isSolid(x, y, z)) return;
    if (this._overlapsPlayer(x, y, z)) return;

    this.world.setBlock(x, y, z, this.selectedBlock);
    this.network.sendBlockPlace(x, y, z, this.selectedBlock);
  }

  _overlapsPlayer(bx, by, bz) {
    const pos   = this.position;
    const r     = PLAYER_WIDTH / 2;
    const feetY = pos.y - PLAYER_EYE_Y;
    const headY = feetY + PLAYER_HEIGHT;

    return bx < pos.x + r && bx + 1 > pos.x - r &&
           by < headY      && by + 1 > feetY      &&
           bz < pos.z + r  && bz + 1 > pos.z - r;
  }

  // ── Rede ──────────────────────────────────────────────────────────────────

  _broadcastPosition(dt) {
    this._moveSendTimer += dt;
    if (this._moveSendTimer < MOVE_SEND_RATE) return;
    this._moveSendTimer = 0;

    const pos    = this.position;
    const euler  = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    const moving = Math.abs(this.vel.x) > 0.1 || Math.abs(this.vel.z) > 0.1;
    this.network.sendMove(pos.x, pos.y, pos.z, euler.y, moving);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  _updateHUD() {
    const { x, y, z } = this.position;
    const feetY = y - PLAYER_EYE_Y;
    document.getElementById('info-pos').textContent =
      `x:${x.toFixed(1)}  y:${feetY.toFixed(1)}  z:${z.toFixed(1)}`;
  }
}
