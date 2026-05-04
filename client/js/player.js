import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  PLAYER_HEIGHT, PLAYER_EYE_Y, PLAYER_WIDTH,
  GRAVITY, JUMP_FORCE, MOVE_SPEED,
  REACH_DISTANCE, MOVE_SEND_RATE, BLOCK,
} from './constants.js';

// ─── Raio DDA (voxel traversal) ───────────────────────────────────────────────
/**
 * Percorre o raio da câmara bloco a bloco (passos pequenos).
 * Devolve { hit: {x,y,z}, prev: {x,y,z} } ou null se não bater em nada.
 */
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
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Scene}  scene
   * @param {World}        world   - instância de World (client/js/world.js)
   * @param {Network}      network - instância de Network
   * @param {Function}     onRebuild - callback chamado após quebrar/colocar bloco
   */
  constructor(camera, scene, world, network, onRebuild) {
    this.camera    = camera;
    this.world     = world;
    this.network   = network;
    this.onRebuild = onRebuild;

    // PointerLockControls (r160): getObject() devolve a própria câmara
    this.controls = new PointerLockControls(camera, document.body);
    scene.add(this.controls.getObject());

    // Física
    this.vel      = new THREE.Vector3();
    this.onGround = false;

    // Input
    this.keys          = {};
    this.selectedBlock = BLOCK.GRASS;  // bloco activo na hotbar
    this._moveSendTimer = 0;

    // Vectores reutilizáveis (evita GC pressure)
    this._fwd   = new THREE.Vector3();
    this._right = new THREE.Vector3();

    this._setupInput();
  }

  // ── API pública ───────────────────────────────────────────────────────────────

  get position()  { return this.camera.position; }
  get isLocked()  { return this.controls.isLocked; }

  /** Posiciona o jogador (pés). Câmara é o ponto dos olhos. */
  setSpawn(x, y, z) {
    this.camera.position.set(x, y + PLAYER_EYE_Y, z);
  }

  /** Chamado a cada frame; delta em segundos. */
  update(dt) {
    if (!this.controls.isLocked) return;

    this._applyGravity(dt);
    this._applyMovement(dt);
    this._moveAndCollide(dt);
    this._broadcastPosition(dt);
    this._updateHUD();
  }

  // ── Input ─────────────────────────────────────────────────────────────────────

  _setupInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;

      // Hotbar 1–4
      const n = parseInt(e.key);
      if (n >= 1 && n <= 4) this._selectBlock(n);
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    // Scroll para mudar de bloco
    window.addEventListener('wheel', e => {
      let b = this.selectedBlock + (e.deltaY > 0 ? 1 : -1);
      if (b < 1) b = 4;
      if (b > 4) b = 1;
      this._selectBlock(b);
    }, { passive: true });

    // Cliques de rato
    window.addEventListener('mousedown', e => {
      if (!this.controls.isLocked) return;
      e.preventDefault();
      if (e.button === 0) this._breakBlock();
      if (e.button === 2) this._placeBlock();
    });

    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  _selectBlock(n) {
    this.selectedBlock = n;
    document.querySelectorAll('#hotbar .slot').forEach(el => {
      el.classList.toggle('active', +el.dataset.block === n);
    });
  }

  // ── Física ────────────────────────────────────────────────────────────────────

  _applyGravity(dt) {
    this.vel.y -= GRAVITY * dt;
  }

  _applyMovement(dt) {
    // Direcção de olhar no plano XZ (sem pitch)
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() > 0.0001) this._fwd.normalize();

    // Eixo direita = forward × up
    this._right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0));

    let fx = 0, fz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    fz += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  fz -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) fx += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  fx -= 1;

    this.vel.x = (this._fwd.x * fz + this._right.x * fx) * MOVE_SPEED;
    this.vel.z = (this._fwd.z * fz + this._right.z * fx) * MOVE_SPEED;

    // Salto
    if ((this.keys['Space'] || this.keys['KeyE']) && this.onGround) {
      this.vel.y    = JUMP_FORCE;
      this.onGround = false;
    }
  }

  /**
   * Move o jogador eixo a eixo e resolve colisões AABB vs grelha de blocos.
   * A separação por eixo impede que o jogador "cole" em cantos.
   */
  _moveAndCollide(dt) {
    const pos = this.position;

    // ── X ──
    pos.x += this.vel.x * dt;
    if (this._collidesWorld()) {
      pos.x -= this.vel.x * dt;
      this.vel.x = 0;
    }

    // ── Y ──
    pos.y += this.vel.y * dt;
    if (this._collidesWorld()) {
      if (this.vel.y < 0) this.onGround = true;
      pos.y -= this.vel.y * dt;
      this.vel.y = 0;
    } else if (this.vel.y !== 0) {
      this.onGround = false;
    }

    // ── Z ──
    pos.z += this.vel.z * dt;
    if (this._collidesWorld()) {
      pos.z -= this.vel.z * dt;
      this.vel.z = 0;
    }
  }

  /**
   * Testa se a AABB actual do jogador intersecta algum bloco sólido.
   * AABB: centro = posição da câmara,
   *       extents = PLAYER_WIDTH/2 em X e Z,
   *       [pos.y - PLAYER_EYE_Y, pos.y - PLAYER_EYE_Y + PLAYER_HEIGHT] em Y.
   */
  _collidesWorld() {
    const pos   = this.position;
    const r     = PLAYER_WIDTH / 2;
    const feetY = pos.y - PLAYER_EYE_Y;
    const headY = feetY + PLAYER_HEIGHT;

    const x0 = Math.floor(pos.x   - r);
    const x1 = Math.floor(pos.x   + r - 0.001);
    const y0 = Math.floor(feetY);
    const y1 = Math.floor(headY   - 0.001);
    const z0 = Math.floor(pos.z   - r);
    const z1 = Math.floor(pos.z   + r - 0.001);

    for (let bx = x0; bx <= x1; bx++)
      for (let by = y0; by <= y1; by++)
        for (let bz = z0; bz <= z1; bz++)
          if (this.world.isSolid(bx, by, bz)) return true;

    return false;
  }

  // ── Interacção com blocos ─────────────────────────────────────────────────────

  _breakBlock() {
    const ray = castRay(this.camera, this.world);
    if (!ray) return;
    const { x, y, z } = ray.hit;
    this.world.setBlock(x, y, z, BLOCK.AIR);
    this.network.sendBlockBreak(x, y, z);
    // Não rebuild aqui — o servidor fará broadcast e o event 'block:update' rebuilda
  }

  _placeBlock() {
    const ray = castRay(this.camera, this.world);
    if (!ray) return;
    const { x, y, z } = ray.prev;
    if (this.world.isSolid(x, y, z)) return;       // já ocupado
    if (this._overlapsPlayer(x, y, z)) return;     // dentro do jogador

    this.world.setBlock(x, y, z, this.selectedBlock);
    this.network.sendBlockPlace(x, y, z, this.selectedBlock);
  }

  /** Verifica se o bloco (bx,by,bz) intersecta a AABB do jogador. */
  _overlapsPlayer(bx, by, bz) {
    const pos   = this.position;
    const r     = PLAYER_WIDTH / 2;
    const feetY = pos.y - PLAYER_EYE_Y;
    const headY = feetY + PLAYER_HEIGHT;

    return bx < pos.x + r && bx + 1 > pos.x - r &&
           by < headY      && by + 1 > feetY      &&
           bz < pos.z + r  && bz + 1 > pos.z - r;
  }

  // ── Rede ──────────────────────────────────────────────────────────────────────

  _broadcastPosition(dt) {
    this._moveSendTimer += dt;
    if (this._moveSendTimer < MOVE_SEND_RATE) return;
    this._moveSendTimer = 0;

    const pos   = this.position;
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    // moving = true se está a mexer no plano horizontal
    const moving = Math.abs(this.vel.x) > 0.1 || Math.abs(this.vel.z) > 0.1;
    this.network.sendMove(pos.x, pos.y, pos.z, euler.y, moving);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────────

  _updateHUD() {
    const { x, y, z } = this.position;
    const feetY = y - PLAYER_EYE_Y;
    document.getElementById('info-pos').textContent =
      `x:${x.toFixed(1)}  y:${feetY.toFixed(1)}  z:${z.toFixed(1)}`;
  }
}
