import * as THREE from 'three';
import { BLOCK } from './constants.js';

// ─── World data ───────────────────────────────────────────────────────────────

/**
 * Mantém o estado dos blocos em memória (Uint8Array).
 * Layout: index = x + z*width + y*width*depth
 */
export class World {
  constructor() {
    this.data   = null;
    this.width  = 0;
    this.depth  = 0;
    this.height = 0;
  }

  load({ data, width, depth, height }) {
    this.width  = width;
    this.depth  = depth;
    this.height = height;
    this.data   = new Uint8Array(data);
  }

  _idx(x, y, z) { return x + z * this.width + y * this.width * this.depth; }

  _inBounds(x, y, z) {
    return x >= 0 && x < this.width &&
           y >= 0 && y < this.height &&
           z >= 0 && z < this.depth;
  }

  getBlock(x, y, z) {
    x = x | 0; y = y | 0; z = z | 0;
    if (!this._inBounds(x, y, z)) return BLOCK.AIR;
    return this.data[this._idx(x, y, z)];
  }

  setBlock(x, y, z, type) {
    x = x | 0; y = y | 0; z = z | 0;
    if (!this._inBounds(x, y, z)) return;
    this.data[this._idx(x, y, z)] = type;
  }

  isSolid(x, y, z) { return this.getBlock(x, y, z) !== BLOCK.AIR; }
}

// ─── Procedural texture generation ───────────────────────────────────────────
//
// Todas as texturas são canvases 16×16 gerados no browser.
// flipY=true (padrão do Three.js): linha 0 do canvas = topo da face UV.
// Ou seja: desenhar verde nas linhas 0-3 do canvas → verde no TOPO da face lateral.

/** Pinta um pixel no canvas. */
function px(ctx, x, y, r, g, b) {
  ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
  ctx.fillRect(x, y, 1, 1);
}

/** Adiciona ruído aleatório a um valor de cor. */
function n(v, amt) {
  return Math.max(0, Math.min(255, v + (Math.random() * 2 - 1) * amt));
}

function makeCanvasTexture(drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  drawFn(canvas.getContext('2d'));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Texture drawers ───────────────────────────────────────────────────────────

function grassTop(ctx) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    px(ctx, x, y, n(78, 18), n(138, 22), n(50, 14));
  }
  // Brighter patches
  for (let i = 0; i < 12; i++) {
    const bx = Math.random() * 14 | 0, by = Math.random() * 14 | 0;
    px(ctx, bx, by, n(100, 10), n(165, 10), n(68, 8));
  }
}

function grassSide(ctx) {
  // Top 4 rows = green strip; rest = dirt
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (y < 4) {
      px(ctx, x, y, n(68, 12), n(130, 16), n(45, 10));
    } else {
      px(ctx, x, y, n(134, 16), n(96, 16), n(60, 12));
    }
  }
}

function dirt(ctx) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    px(ctx, x, y, n(134, 18), n(96, 18), n(60, 12));
  }
  // Darker pebble-like spots
  for (let i = 0; i < 6; i++) {
    const bx = Math.random() * 13 | 0, by = Math.random() * 13 | 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
      px(ctx, bx + dx, by + dy, n(96, 8), n(68, 8), n(40, 6));
  }
}

function stone(ctx) {
  // Base grey
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = n(156, 18);
    px(ctx, x, y, v, v, v);
  }
  // Darker crack lines
  const cracks = [
    [3,0, 3,6], [3,6, 10,6], [10,6, 10,15],
    [0,11, 4,11], [4,11, 4,15],
    [13,0, 13,5], [13,5, 7,5],
  ];
  ctx.fillStyle = 'rgba(70,70,70,0.55)';
  for (const [x0, y0, x1, y1] of cracks) {
    ctx.fillRect(Math.min(x0,x1), Math.min(y0,y1),
                 Math.abs(x1-x0) || 1, Math.abs(y1-y0) || 1);
  }
  // Light highlights around cracks
  ctx.fillStyle = 'rgba(200,200,200,0.25)';
  for (const [x0, y0, x1, y1] of cracks) {
    ctx.fillRect(Math.min(x0,x1)+1, Math.min(y0,y1)+1,
                 Math.abs(x1-x0) || 1, Math.abs(y1-y0) || 1);
  }
}

function planks(ctx) {
  // Base wood colour per horizontal plank
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const plank = (y / 4) | 0;
    const base  = plank % 2 === 0 ? 172 : 156;
    px(ctx, x, y, n(base, 10), n(base - 48, 10), n(base - 92, 8));
  }
  // Horizontal plank-separation lines
  for (let y = 0; y < 16; y += 4) {
    for (let x = 0; x < 16; x++) px(ctx, x, y, 100, 60, 24);
  }
  // Vertical centre crack per plank (offset each row)
  for (let y = 0; y < 16; y++) {
    const midX = ((y / 4) | 0) % 2 === 0 ? 8 : 4;
    px(ctx, midX, y, n(110, 8), n(68, 8), n(30, 6));
  }
}

function logSide(ctx) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const edge   = (x < 2 || x > 13) ? -30 : 0;
    const stripe = (x % 3 === 0)      ?  -8 : 6;
    px(ctx, x, y, n(108 + edge + stripe, 7), n(74 + edge + stripe, 7), n(38 + edge + stripe, 5));
  }
}

function logTop(ctx) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const cx = 7.5, cy = 7.5;
    const d  = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    let r, g, b;
    if      (d < 2.5) { r = 72;  g = 44;  b = 16; }   // heartwood
    else if (d < 4.0) { r = 122; g = 84;  b = 42; }   // ring 1
    else if (d < 5.5) { r = 92;  g = 60;  b = 26; }   // ring 2
    else              { r = 108; g = 74;  b = 36; }   // outer
    px(ctx, x, y, n(r, 6), n(g, 6), n(b, 5));
  }
}

function leaves(ctx) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (Math.random() < 0.08) {
      // Small gap/hole  — very dark
      px(ctx, x, y, n(22, 5), n(42, 8), n(16, 5));
    } else {
      const bright = Math.random() < 0.15;
      px(ctx, x, y, n(bright ? 70 : 44, 14), n(bright ? 148 : 106, 18), n(bright ? 38 : 26, 10));
    }
  }
}

// ── Material factory ──────────────────────────────────────────────────────────

const _matCache = {};

function mat(tex) {
  return new THREE.MeshLambertMaterial({ map: tex, side: THREE.FrontSide });
}

/**
 * Devolve o material (ou array de materiais) para um tipo de bloco.
 * Cache garante que só criamos cada material uma vez.
 *
 * BoxGeometry face groups: 0=+x  1=-x  2=+y(top)  3=-y(bot)  4=+z  5=-z
 */
function getMaterial(type) {
  if (_matCache[type]) return _matCache[type];

  switch (type) {
    case BLOCK.GRASS: {
      const top  = mat(makeCanvasTexture(grassTop));
      const side = mat(makeCanvasTexture(grassSide));
      const bot  = mat(makeCanvasTexture(dirt));
      _matCache[type] = [side, side, top, bot, side, side];
      break;
    }
    case BLOCK.DIRT:
      _matCache[type] = mat(makeCanvasTexture(dirt));
      break;
    case BLOCK.STONE:
      _matCache[type] = mat(makeCanvasTexture(stone));
      break;
    case BLOCK.WOOD:
      _matCache[type] = mat(makeCanvasTexture(planks));
      break;
    case BLOCK.LOG: {
      const side = mat(makeCanvasTexture(logSide));
      const top  = mat(makeCanvasTexture(logTop));
      _matCache[type] = [side, side, top, top, side, side];
      break;
    }
    case BLOCK.LEAVES:
      _matCache[type] = mat(makeCanvasTexture(leaves));
      break;
    default:
      _matCache[type] = new THREE.MeshLambertMaterial({ color: 0xff00ff });
  }
  return _matCache[type];
}

// ─── WorldRenderer ────────────────────────────────────────────────────────────

export class WorldRenderer {
  constructor(scene, world) {
    this.scene  = scene;
    this.world  = world;
    this.meshes = {};
    this._geo   = new THREE.BoxGeometry(1, 1, 1);
    this._dummy = new THREE.Object3D();
  }

  build() {
    this._clear();

    const counts = {};
    this._eachVisible((x, y, z, type) => { counts[type] = (counts[type] || 0) + 1; });

    for (const [type, count] of Object.entries(counts)) {
      const mesh = new THREE.InstancedMesh(this._geo, getMaterial(+type), count);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      this.meshes[type]  = mesh;
      this.scene.add(mesh);
    }

    const cursors = {};
    this._eachVisible((x, y, z, type) => {
      const i = cursors[type] || 0;
      this._dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
      this._dummy.updateMatrix();
      this.meshes[type].setMatrixAt(i, this._dummy.matrix);
      cursors[type] = i + 1;
    });

    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  rebuild() { this.build(); }

  _clear() {
    for (const mesh of Object.values(this.meshes)) this.scene.remove(mesh);
    this.meshes = {};
  }

  _eachVisible(fn) {
    const { world } = this;
    const { width: W, depth: D, height: H } = world;
    const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const type = world.getBlock(x, y, z);
      if (type === BLOCK.AIR) continue;
      for (const [dx, dy, dz] of DIRS) {
        if (!world.isSolid(x + dx, y + dy, z + dz)) { fn(x, y, z, type); break; }
      }
    }
  }
}
