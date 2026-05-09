/**
 * Cliente — MobManager: cria, actualiza e remove mobs 3D.
 * Cada mob é um grupo Three.js com geometrias simples (caixas coloridas).
 */
import * as THREE from 'three';

// ─── Dados visuais dos mobs ───────────────────────────────────────────────────
const MOB_CONFIG = {
  // type: { name, hostile, bodyColor, headColor, legColor, w, h, d, headScale, legH }
  1: { name:'Zombie',       hostile:true,  body:0x2d6620, head:0x3a8a2a, leg:0x1a3a10, w:0.60, h:1.80, d:0.30, hs:0.52, lh:0.42 },
  2: { name:'Zombie Líder', hostile:true,  body:0x1a4a10, head:0x2a6a18, leg:0x0a2a08, w:0.72, h:2.10, d:0.36, hs:0.62, lh:0.50 },
  3: { name:'Esqueleto',    hostile:true,  body:0xd8d8c8, head:0xc8c8b8, leg:0xa8a8a0, w:0.46, h:1.80, d:0.22, hs:0.46, lh:0.42 },
  4: { name:'Creeper',      hostile:true,  body:0x3a9a2a, head:0x2a8820, leg:0x1a5a10, w:0.62, h:1.70, d:0.62, hs:0.68, lh:0.38 },
  5: { name:'Porco',        hostile:false, body:0xf5c0c0, head:0xf0a0a0, leg:0xe08888, w:0.90, h:0.90, d:0.50, hs:0.50, lh:0.28 },
  6: { name:'Vaca',         hostile:false, body:0x8b6040, head:0x704030, leg:0x5a3020, w:0.90, h:1.40, d:0.52, hs:0.58, lh:0.38 },
  7: { name:'Galinha',      hostile:false, body:0xf0f0e0, head:0xf0e8d0, leg:0xe8c060, w:0.48, h:0.70, d:0.30, hs:0.38, lh:0.22 },
};

// ─── MobMesh ──────────────────────────────────────────────────────────────────
class MobMesh {
  constructor(scene, type) {
    this.scene   = scene;
    this.type    = type;
    this.group   = new THREE.Group();
    this._bobT   = Math.random() * Math.PI * 2;
    this._meshes = [];

    const cfg = MOB_CONFIG[type] || MOB_CONFIG[1];
    const { w, h, d, hs, lh, body, head, leg } = cfg;

    const bm = (col) => new THREE.MeshLambertMaterial({ color: col });
    const box = (gw, gh, gd, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), mat);
      m.castShadow = true;
      return m;
    };

    // Body
    const bodyH = h * 0.55;
    const bodyY = lh + bodyH / 2;
    const bodyMesh = box(w, bodyH, d, bm(body));
    bodyMesh.position.y = bodyY;
    this.group.add(bodyMesh);
    this._meshes.push(bodyMesh);

    // Head
    const headMesh = box(hs, hs, hs, bm(head));
    headMesh.position.y = lh + bodyH + hs / 2;
    this.group.add(headMesh);
    this._meshes.push(headMesh);
    this._headMesh = headMesh;

    // Creeper face spots
    if (type === 4) {
      const spotMat = new THREE.MeshLambertMaterial({ color: 0x1a4010 });
      const spotGeo = new THREE.BoxGeometry(0.14, 0.14, 0.02);
      [[-0.14, 0.12], [0.14, 0.12], [-0.08, -0.06], [0.08, -0.06]].forEach(([sx, sy]) => {
        const s = new THREE.Mesh(spotGeo, spotMat);
        s.position.set(sx, lh + bodyH + hs / 2 + sy, hs / 2 + 0.01);
        this.group.add(s);
      });
    }
    // Skeleton eye glow
    if (type === 3) {
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
      const eyeGeo = new THREE.BoxGeometry(0.09, 0.07, 0.02);
      [-0.09, 0.09].forEach(ex => {
        const e = new THREE.Mesh(eyeGeo, eyeMat);
        e.position.set(ex, lh + bodyH + hs / 2 + 0.05, hs / 2 + 0.01);
        this.group.add(e);
      });
    }

    // Legs
    const legW = w * 0.38, legD = d * 0.85;
    const legMat = bm(leg);
    [-1, 1].forEach(side => {
      const legMesh = box(legW, lh, legD, legMat);
      legMesh.position.set(side * (w * 0.22), lh / 2, 0);
      this.group.add(legMesh);
      this._meshes.push(legMesh);
    });

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
    this._bobT += dt * 3;
    if (this._headMesh) this._headMesh.rotation.y = Math.sin(this._bobT * 0.4) * 0.25;
  }

  /** Pisca vermelho por 180ms quando recebe dano */
  flashDamage() {
    if (this._flashing) return;
    this._flashing = true;
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222 });
    this.group.traverse(obj => { if (obj.isMesh) obj.material = redMat; });
    setTimeout(() => {
      this._origMats.forEach(({ mesh, mat }) => { mesh.material = mat; });
      redMat.dispose();
      this._flashing = false;
    }, 180);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }

  /** Retorna meshes para raycasting */
  getMeshes() { return this._meshes; }
}

// ─── MobManager ───────────────────────────────────────────────────────────────
export class MobManager {
  constructor(scene) {
    this.scene  = scene;
    this.mobs   = new Map(); // mobId → MobMesh
  }

  spawn(data) {
    if (this.mobs.has(data.id)) return;
    const m = new MobMesh(this.scene, data.type);
    m.setPosition(data.x, data.y, data.z, data.rotY || 0);
    this.mobs.set(data.id, m);
  }

  spawnBatch(list) { list.forEach(d => this.spawn(d)); }

  update(data) {
    this.mobs.get(data.id)?.setPosition(data.x, data.y, data.z, data.rotY);
  }

  updateBatch(list) { list.forEach(d => this.update(d)); }

  die(mobId) {
    const m = this.mobs.get(mobId);
    if (!m) return;
    m.dispose();
    this.mobs.delete(mobId);
  }

  flashMob(mobId) { this.mobs.get(mobId)?.flashDamage(); }

  animate(dt) { for (const m of this.mobs.values()) m.animate(dt); }

  clear() { for (const m of this.mobs.values()) m.dispose(); this.mobs.clear(); }

  /**
   * Raycasting contra os meshes de todos os mobs.
   * Retorna { mobId, dist } ou null.
   */
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
