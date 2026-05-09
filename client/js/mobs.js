/**
 * Cliente — MobManager: renderiza mobs 3D com corpos detalhados distintos.
 * y=0 do grupo = nível do chão sob o mob.
 */
import * as THREE from 'three';

// ─── Helpers de construção ────────────────────────────────────────────────────
const lm = (col) => new THREE.MeshLambertMaterial({ color: col });

function mk(w, h, d, col) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lm(col));
  m.castShadow = true;
  return m;
}

/** Adiciona mesh ao parent, posiciona, regista em meshArr (opcional). */
function put(parent, meshArr, mesh, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  if (meshArr) meshArr.push(mesh);
  return mesh;
}

// Pivot group: a group whose pivot is the TOP of the child block.
// Useful for rotating limbs from shoulder/hip.
function pivotGroup(child, px = 0, py = 0, pz = 0) {
  const g = new THREE.Group();
  g.position.set(px, py, pz);
  g.add(child);
  return g;
}

// ─── Builders ─────────────────────────────────────────────────────────────────

/** Zombie / Zombie Líder: bípede humanóide com braços estendidos para a frente. */
function buildHumanoid(group, meshes, s, colors, armAngle = -1.1) {
  const { skin, shirt, pants, shoe, eye, eyeGlow } = colors;
  const legW = 0.26 * s, legH = 0.88 * s, legD = 0.27 * s;
  const torsoH = 0.60 * s, torsoW = 0.52 * s, torsoD = 0.28 * s;
  const armH = 0.60 * s, armW = 0.22 * s, armD = 0.22 * s;
  const headS = 0.50 * s;
  const torsoY = legH + torsoH / 2;
  const shoulderY = legH + torsoH - 0.04 * s;
  const headY = legH + torsoH + headS / 2 + 0.02 * s;

  // Pernas
  const legL = put(group, meshes, mk(legW, legH, legD, pants), -0.14 * s, legH / 2, 0);
  const legR = put(group, meshes, mk(legW, legH, legD, pants),  0.14 * s, legH / 2, 0);

  // Sapatos
  put(group, null, mk(legW + 0.05 * s, 0.12 * s, legD + 0.1 * s, shoe), -0.14 * s, 0.06 * s, 0.04 * s);
  put(group, null, mk(legW + 0.05 * s, 0.12 * s, legD + 0.1 * s, shoe),  0.14 * s, 0.06 * s, 0.04 * s);

  // Tronco
  put(group, meshes, mk(torsoW, torsoH, torsoD, shirt), 0, torsoY, 0);

  // Braços estendidos para a frente (zombie pose)
  for (const side of [-1, 1]) {
    const arm = mk(armW, armH, armD, shirt);
    arm.position.y = -armH / 2;          // pivot no ombro (topo do braço)
    const armGrp = new THREE.Group();
    armGrp.add(arm);
    armGrp.position.set(side * (torsoW / 2 + armW / 2) * 0.95, shoulderY, 0);
    armGrp.rotation.x = armAngle;
    group.add(armGrp);
    meshes.push(arm);
  }

  // Cabeça
  const head = put(group, meshes, mk(headS, headS, headS, skin), 0, headY, 0);

  // Olhos
  const eyeM = lm(eye);
  put(group, null, mk(0.12 * s, 0.10 * s, 0.02), eyeM, -0.12 * s, headY + 0.06 * s, headS / 2 + 0.005);
  put(group, null, mk(0.12 * s, 0.10 * s, 0.02), eyeM,  0.12 * s, headY + 0.06 * s, headS / 2 + 0.005);

  return { head, legL, legR };
}

/** Esqueleto: bípede muito fino, costelhas, arco na mão. */
function buildSkeleton(group, meshes) {
  const bone = 0xd8d8c0, dark = 0x1a1a18;
  const legW = 0.16, legH = 0.88, legD = 0.16;
  const torsoH = 0.60, torsoW = 0.44, torsoD = 0.18;
  const armW = 0.14, armH = 0.64;
  const headS = 0.44;
  const torsoY = legH + torsoH / 2;
  const shoulderY = legH + torsoH - 0.04;
  const headY = legH + torsoH + headS / 2 + 0.02;

  // Pernas
  const legL = put(group, meshes, mk(legW, legH, legD, bone), -0.12, legH / 2, 0);
  const legR = put(group, meshes, mk(legW, legH, legD, bone),  0.12, legH / 2, 0);

  // Tronco
  put(group, meshes, mk(torsoW, torsoH, torsoD, bone), 0, torsoY, 0);
  // Costelhas (faixas horizontais escuras)
  const ribM = lm(0x888880);
  for (let i = 0; i < 3; i++) {
    put(group, null, mk(torsoW + 0.01, 0.04, torsoD + 0.01, ribM), 0, legH + 0.12 + i * 0.16, 0);
  }

  // Braços normais (45° para baixo)
  for (const side of [-1, 1]) {
    const arm = mk(armW, armH, armW, bone);
    arm.position.y = -armH / 2;
    const armGrp = new THREE.Group();
    armGrp.add(arm);
    armGrp.position.set(side * (torsoW / 2 + armW / 2) * 0.98, shoulderY, 0);
    armGrp.rotation.x = -0.3;
    armGrp.rotation.z = -side * 0.25;
    group.add(armGrp);
    meshes.push(arm);
  }

  // Arco (braço esquerdo)
  const bow = mk(0.04, 0.55, 0.04, 0x8b5c2a);
  bow.position.set(-0.34, shoulderY - 0.25, 0.1);
  bow.rotation.z = 0.3;
  group.add(bow);

  // Cabeça
  const head = put(group, meshes, mk(headS, headS, headS, bone), 0, headY, 0);
  // Olhos ocos
  const eyeM = lm(dark);
  put(group, null, mk(0.12, 0.10, 0.02), eyeM, -0.10, headY + 0.05, headS / 2 + 0.005);
  put(group, null, mk(0.12, 0.10, 0.02), eyeM,  0.10, headY + 0.05, headS / 2 + 0.005);

  return { head, legL, legR };
}

/** Creeper: sem braços, 4 pernas curtas, cabeça grande com cara. */
function buildCreeper(group, meshes) {
  const green = 0x3a9a2a, dkGreen = 0x2a7818, faceSpot = 0x1a4010;
  const legH = 0.42, legW = 0.28, legD = 0.28;
  const bodyH = 0.72, bodyW = 0.50, bodyD = 0.50;
  const headS = 0.68;
  const bodyY = legH + bodyH / 2;
  const headY = legH + bodyH + headS / 2 + 0.02;

  // 4 pernas nos 4 cantos
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    put(group, meshes, mk(legW, legH, legD, dkGreen), sx * 0.12, legH / 2, sz * 0.12);
  }

  // Corpo
  put(group, meshes, mk(bodyW, bodyH, bodyD, green), 0, bodyY, 0);

  // Cabeça
  const head = put(group, meshes, mk(headS, headS, headS, green), 0, headY, 0);

  // Cara do Creeper: 2 olhos + boca
  const fM = lm(faceSpot);
  put(group, null, mk(0.16, 0.16, 0.02), fM, -0.15, headY + 0.10, headS / 2 + 0.005);
  put(group, null, mk(0.16, 0.16, 0.02), fM,  0.15, headY + 0.10, headS / 2 + 0.005);
  // Boca (forma de U invertido)
  put(group, null, mk(0.10, 0.12, 0.02), fM, -0.16, headY - 0.08, headS / 2 + 0.005);
  put(group, null, mk(0.10, 0.12, 0.02), fM,  0.16, headY - 0.08, headS / 2 + 0.005);
  put(group, null, mk(0.26, 0.10, 0.02), fM,      0, headY - 0.16, headS / 2 + 0.005);

  return { head };
}

/** Porco: quadrúpede horizontal, focinho saliente, orelhas. */
function buildPig(group, meshes) {
  const pink = 0xf5b8b8, dkPink = 0xe08888, snout = 0xf0a0a0, nostril = 0x804040;
  const legH = 0.38, legW = 0.22, legD = 0.22;
  const bodyW = 1.00, bodyH = 0.58, bodyD = 0.70;
  const bodyY = legH + bodyH / 2;
  const headW = 0.56, headH = 0.48, headD = 0.50;
  // Cabeça posicionada à frente do corpo e um pouco mais baixa
  const headZ = bodyD / 2 + headD / 2 - 0.08;
  const headY = legH + headH / 2 + 0.04;

  // 4 pernas (2 da frente, 2 de trás)
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    put(group, meshes, mk(legW, legH, legD, dkPink), sx * 0.32, legH / 2, sz * 0.24);
  }

  // Corpo horizontal
  put(group, meshes, mk(bodyW, bodyH, bodyD, pink), 0, bodyY, 0);
  // Barriga ligeiramente mais clara
  put(group, null, mk(bodyW * 0.7, bodyH * 0.3, bodyD + 0.02, 0xfcd8d8), 0, legH + bodyH * 0.15, 0);

  // Cabeça
  put(group, meshes, mk(headW, headH, headD, pink), 0, headY, headZ);
  // Focinho
  const snoutM = lm(snout);
  put(group, null, mk(0.36, 0.24, 0.12), snoutM, 0, headY - 0.04, headZ + headD / 2 + 0.05);
  // Narinas
  const nostrilM = lm(nostril);
  put(group, null, mk(0.08, 0.07, 0.02), nostrilM, -0.09, headY - 0.04, headZ + headD / 2 + 0.12);
  put(group, null, mk(0.08, 0.07, 0.02), nostrilM,  0.09, headY - 0.04, headZ + headD / 2 + 0.12);
  // Olhos
  const eyeM = lm(0x301010);
  put(group, null, mk(0.10, 0.10, 0.02), eyeM, -0.16, headY + 0.10, headZ + headD / 2 + 0.005);
  put(group, null, mk(0.10, 0.10, 0.02), eyeM,  0.16, headY + 0.10, headZ + headD / 2 + 0.005);
  // Orelhas
  put(group, null, mk(0.16, 0.14, 0.06), dkPink, -0.20, headY + headH / 2 + 0.04, headZ - 0.04);
  put(group, null, mk(0.16, 0.14, 0.06), dkPink,  0.20, headY + headH / 2 + 0.04, headZ - 0.04);
  // Rabo
  put(group, null, mk(0.10, 0.10, 0.10), dkPink, 0, bodyY + 0.05, -bodyD / 2 - 0.03);

  return {};
}

/** Vaca: quadrúpede grande, chifres, úbere, manchas. */
function buildCow(group, meshes) {
  const brown = 0x7a5030, white = 0xe8e0d0, tan = 0xd4a870, horn = 0xf0f0d8, udder = 0xf0c0c0;
  const legH = 0.60, legW = 0.26, legD = 0.26;
  const bodyW = 1.15, bodyH = 0.68, bodyD = 0.90;
  const bodyY = legH + bodyH / 2;
  const headW = 0.62, headH = 0.56, headD = 0.58;
  const headZ = bodyD / 2 + headD / 2 - 0.10;
  const headY = bodyY - 0.04;

  // 4 pernas
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    put(group, meshes, mk(legW, legH, legD, brown), sx * 0.38, legH / 2, sz * 0.30);
  }

  // Corpo
  put(group, meshes, mk(bodyW, bodyH, bodyD, brown), 0, bodyY, 0);
  // Manchas brancas
  put(group, null, mk(0.45, bodyH + 0.02, 0.55, 0xe8e8e0), 0.15, bodyY, -0.10);
  // Barriga branca
  put(group, null, mk(bodyW * 0.65, bodyH * 0.25, bodyD + 0.02, white), 0, legH + bodyH * 0.10, 0);
  // Úbere
  put(group, null, mk(0.42, 0.18, 0.38, udder), 0, legH - 0.05, bodyD * 0.20);

  // Cabeça
  put(group, meshes, mk(headW, headH, headD, brown), 0, headY, headZ);
  // Focinho/açaime
  put(group, null, mk(0.42, 0.30, 0.16, tan), 0, headY - 0.08, headZ + headD / 2 + 0.07);
  // Narinas
  const nostrilM = lm(0x5a2010);
  put(group, null, mk(0.10, 0.08, 0.02), nostrilM, -0.11, headY - 0.09, headZ + headD / 2 + 0.14);
  put(group, null, mk(0.10, 0.08, 0.02), nostrilM,  0.11, headY - 0.09, headZ + headD / 2 + 0.14);
  // Olhos
  const eyeM = lm(0x281408);
  put(group, null, mk(0.12, 0.12, 0.02), eyeM, -0.22, headY + 0.10, headZ + headD / 2 + 0.005);
  put(group, null, mk(0.12, 0.12, 0.02), eyeM,  0.22, headY + 0.10, headZ + headD / 2 + 0.005);
  // Chifres
  const hornM = lm(horn);
  const hornL = put(group, null, mk(0.08, 0.22, 0.08), hornM, -0.22, headY + headH / 2 + 0.09, headZ + 0.02);
  hornL.rotation.z = -0.3;
  const hornR = put(group, null, mk(0.08, 0.22, 0.08), hornM,  0.22, headY + headH / 2 + 0.09, headZ + 0.02);
  hornR.rotation.z =  0.3;
  // Orelhas
  put(group, null, mk(0.20, 0.16, 0.08), tan, -0.36, headY + 0.10, headZ - 0.05);
  put(group, null, mk(0.20, 0.16, 0.08), tan,  0.36, headY + 0.10, headZ - 0.05);

  return {};
}

/** Galinha: bípede pequeno, asas, bico, crista vermelha. */
function buildChicken(group, meshes) {
  const white = 0xf0f0e0, yellow = 0xe8c840, red = 0xcc2020, dark = 0x281808;
  const legH = 0.42, legW = 0.09, legD = 0.09;
  const bodyW = 0.54, bodyH = 0.46, bodyD = 0.50;
  const bodyY = legH + bodyH / 2;
  const headS = 0.34;
  const headZ = bodyD / 2 + headS / 2 - 0.06;
  const headY = bodyY + bodyH / 2 - headS / 2 + 0.04;

  // 2 pernas (finas, laranja)
  const legM = lm(yellow);
  for (const sx of [-1, 1]) {
    put(group, meshes, mk(legW, legH, legD, legM), sx * 0.10, legH / 2, 0.05);
    // Pé (flat)
    put(group, null, mk(0.24, 0.05, 0.20, legM), sx * 0.10, 0.025, 0.08);
  }

  // Corpo
  put(group, meshes, mk(bodyW, bodyH, bodyD, white), 0, bodyY, 0);
  // Asas (flat, ligeiramente separadas)
  const wingM = lm(0xd8d8c8);
  put(group, null, mk(0.06, bodyH * 0.75, bodyD * 0.80, wingM), -bodyW / 2 - 0.01, bodyY, 0);
  put(group, null, mk(0.06, bodyH * 0.75, bodyD * 0.80, wingM),  bodyW / 2 + 0.01, bodyY, 0);

  // Cabeça
  put(group, meshes, mk(headS, headS, headS, white), 0, headY, headZ);
  // Bico (amarelo)
  put(group, null, mk(0.10, 0.10, 0.14, yellow), 0, headY - 0.02, headZ + headS / 2 + 0.06);
  // Barbela (vermelha, sob bico)
  put(group, null, mk(0.10, 0.14, 0.06, red), 0, headY - 0.12, headZ + headS / 2 - 0.02);
  // Crista (vermelha, no topo)
  put(group, null, mk(0.08, 0.16, 0.20, red), 0, headY + headS / 2 + 0.06, headZ - 0.04);
  // Olhos
  const eyeM = lm(dark);
  put(group, null, mk(0.09, 0.09, 0.02), eyeM, -0.10, headY + 0.04, headZ + headS / 2 + 0.005);
  put(group, null, mk(0.09, 0.09, 0.02), eyeM,  0.10, headY + 0.04, headZ + headS / 2 + 0.005);

  return {};
}

// ─── MobMesh ──────────────────────────────────────────────────────────────────
class MobMesh {
  constructor(scene, type) {
    this.scene  = scene;
    this.type   = type;
    this.group  = new THREE.Group();
    this._meshes = [];
    this._bobT   = Math.random() * Math.PI * 2;
    this._head   = null;
    this._legL   = null;
    this._legR   = null;
    this._fusing   = false;   // Creeper fuse
    this._fuseT    = 0;
    this._whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    switch (type) {
      case 1: { // Zombie
        const r = buildHumanoid(this.group, this._meshes, 1.0, {
          skin: 0x2d7a22, shirt: 0x3a4030, pants: 0x202820, shoe: 0x181010,
          eye:  0x40ff40, eyeGlow: true,
        }, -1.1);
        this._head = r.head; this._legL = r.legL; this._legR = r.legR;
        break;
      }
      case 2: { // Zombie Líder (maior, mais escuro, olhos vermelhos)
        const r = buildHumanoid(this.group, this._meshes, 1.25, {
          skin: 0x1a4a10, shirt: 0x282c20, pants: 0x141810, shoe: 0x100c08,
          eye:  0xff3030, eyeGlow: true,
        }, -1.2);
        this._head = r.head; this._legL = r.legL; this._legR = r.legR;
        break;
      }
      case 3: { // Esqueleto
        const r = buildSkeleton(this.group, this._meshes);
        this._head = r.head; this._legL = r.legL; this._legR = r.legR;
        break;
      }
      case 4: { // Creeper
        const r = buildCreeper(this.group, this._meshes);
        this._head = r.head;
        break;
      }
      case 5: buildPig(this.group, this._meshes); break;
      case 6: buildCow(this.group, this._meshes); break;
      case 7: buildChicken(this.group, this._meshes); break;
    }

    // Guardar materiais originais para o flash de dano
    this._origMats = [];
    this.group.traverse(obj => {
      if (obj.isMesh) this._origMats.push({ mesh: obj, mat: obj.material });
    });

    scene.add(this.group);
  }

  setPosition(x, y, z, rotY) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = rotY || 0;
  }

  animate(dt) {
    this._bobT += dt * 2.5;
    const t = this._bobT;
    // Balanço da cabeça
    if (this._head) this._head.rotation.y = Math.sin(t * 0.45) * 0.20;
    // Pernas dos humanóides — walking cycle
    if (this._legL && this._legR) {
      const sw = Math.sin(t * 1.8) * 0.38;
      this._legL.rotation.x =  sw;
      this._legR.rotation.x = -sw;
    }
    // Bob vertical suave do grupo inteiro
    this.group.position.y += Math.sin(t * 1.8) * 0.003;

    // Creeper fuse: pisca branco em frequência crescente
    if (this._fusing && !this._flashing) {
      this._fuseT += dt;
      // Frequência acelera ao longo do tempo (4 Hz → 14 Hz)
      const freq = 4 + this._fuseT * 7;
      const on = Math.sin(this._fuseT * freq * Math.PI) > 0;
      this.group.traverse(obj => {
        if (!obj.isMesh) return;
        obj.material = on ? this._whiteMat : (this._origMats.find(o => o.mesh === obj)?.mat || obj.material);
      });
    }
  }

  /** Inicia/para piscar branco (mecha do Creeper). */
  startFuse() {
    this._fusing = true;
    this._fuseT  = 0;
  }

  stopFuse() {
    this._fusing = false;
    this._fuseT  = 0;
    // Restaura materiais originais
    this._origMats.forEach(({ mesh, mat }) => { mesh.material = mat; });
  }

  /** Pisca vermelho por 180ms quando recebe dano. */
  flashDamage() {
    if (this._flashing) return;
    this._flashing = true;
    const red = new THREE.MeshLambertMaterial({ color: 0xff1a1a });
    this.group.traverse(obj => { if (obj.isMesh) obj.material = red; });
    setTimeout(() => {
      this._origMats.forEach(({ mesh, mat }) => { mesh.material = mat; });
      red.dispose();
      this._flashing = false;
    }, 180);
  }

  dispose() {
    this._fusing = false;
    this._whiteMat.dispose();
    this.scene.remove(this.group);
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material && !Array.isArray(obj.material)) obj.material.dispose();
    });
  }

  getMeshes() { return this._meshes; }
}

// ─── MobManager ───────────────────────────────────────────────────────────────
export class MobManager {
  constructor(scene) {
    this.scene = scene;
    this.mobs  = new Map();
  }

  spawn(data) {
    if (this.mobs.has(data.id)) return;
    const m = new MobMesh(this.scene, data.type);
    m.setPosition(data.x, data.y, data.z, data.rotY || 0);
    this.mobs.set(data.id, m);
  }

  spawnBatch(list) { list.forEach(d => this.spawn(d)); }

  update(data) { this.mobs.get(data.id)?.setPosition(data.x, data.y, data.z, data.rotY); }

  updateBatch(list) { list.forEach(d => this.update(d)); }

  die(mobId) {
    const m = this.mobs.get(mobId);
    if (!m) return;
    m.dispose();
    this.mobs.delete(mobId);
  }

  flashMob(mobId) { this.mobs.get(mobId)?.flashDamage(); }

  fuseMob(mobId, active) {
    const m = this.mobs.get(mobId);
    if (!m) return;
    if (active) m.startFuse(); else m.stopFuse();
  }

  animate(dt) { for (const m of this.mobs.values()) m.animate(dt); }

  clear() { for (const m of this.mobs.values()) m.dispose(); this.mobs.clear(); }

  hitTest(camera) {
    if (!this.mobs.size) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera({ x: 0, y: 0 }, camera);
    const meshes = [], map = new Map();
    for (const [id, mob] of this.mobs) {
      mob.getMeshes().forEach(m => { meshes.push(m); map.set(m, id); });
    }
    const hits = rc.intersectObjects(meshes, false);
    if (!hits.length || hits[0].distance > 5.5) return null;
    return { mobId: map.get(hits[0].object), dist: hits[0].distance };
  }
}
