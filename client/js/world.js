import * as THREE from 'three';
import { BLOCK, BLOCK_COLORS } from './constants.js';

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

  /** Carrega dados recebidos do servidor. */
  load({ data, width, depth, height }) {
    this.width  = width;
    this.depth  = depth;
    this.height = height;
    this.data   = new Uint8Array(data);
  }

  _idx(x, y, z) {
    return x + z * this.width + y * this.width * this.depth;
  }

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

  isSolid(x, y, z) {
    return this.getBlock(x, y, z) !== BLOCK.AIR;
  }
}

// ─── Material cache ───────────────────────────────────────────────────────────

const _matCache = {};

/**
 * Devolve o material (ou array de materiais) para um tipo de bloco.
 * Cache garante que só criamos cada material uma vez.
 *
 * BoxGeometry face groups: 0=+x  1=-x  2=+y(top)  3=-y(bot)  4=+z  5=-z
 */
function getMaterial(type) {
  if (_matCache[type]) return _matCache[type];

  const colors = BLOCK_COLORS[type];
  if (!colors) {
    _matCache[type] = new THREE.MeshLambertMaterial({ color: 0xff00ff });
    return _matCache[type];
  }

  if (colors.top !== colors.side) {
    const top  = new THREE.MeshLambertMaterial({ color: colors.top  });
    const side = new THREE.MeshLambertMaterial({ color: colors.side });
    // [+x, -x, +y(top), -y, +z, -z]
    _matCache[type] = [side, side, top, side, side, side];
  } else {
    _matCache[type] = new THREE.MeshLambertMaterial({ color: colors.side });
  }

  return _matCache[type];
}

// ─── WorldRenderer ────────────────────────────────────────────────────────────

/**
 * Converte os dados do mundo em InstancedMesh por tipo de bloco.
 *
 * Só renderiza blocos visíveis (com pelo menos um vizinho de ar).
 * Numa mudança de bloco, rebuilda tudo — aceitável para 64×64×32
 * (~131k blocos; rebuild < 5 ms na maioria dos dispositivos).
 */
export class WorldRenderer {
  constructor(scene, world) {
    this.scene   = scene;
    this.world   = world;
    this.meshes  = {};   // blockType → InstancedMesh
    this._geo    = new THREE.BoxGeometry(1, 1, 1);
    this._dummy  = new THREE.Object3D();
  }

  /** Constrói (ou reconstrói) todos os InstancedMesh. */
  build() {
    this._clear();

    const { world } = this;
    const counts  = {};    // type → nº instâncias
    const dummy   = this._dummy;

    // 1.ª passagem — contar instâncias visíveis por tipo
    this._eachVisible((x, y, z, type) => {
      counts[type] = (counts[type] || 0) + 1;
    });

    // Criar InstancedMesh para cada tipo encontrado
    for (const [type, count] of Object.entries(counts)) {
      const mesh = new THREE.InstancedMesh(this._geo, getMaterial(+type), count);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      this.meshes[type]  = mesh;
      this.scene.add(mesh);
    }

    // 2.ª passagem — preencher matrizes de transformação
    const cursors = {};
    this._eachVisible((x, y, z, type) => {
      const i = cursors[type] || 0;
      dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
      dummy.updateMatrix();
      this.meshes[type].setMatrixAt(i, dummy.matrix);
      cursors[type] = i + 1;
    });

    // Sinalizar WebGL para actualizar buffers
    for (const mesh of Object.values(this.meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Alias conveniente — chamado após qualquer mudança de bloco. */
  rebuild() { this.build(); }

  // ── Internos ─────────────────────────────────────────────────────────────────

  _clear() {
    for (const mesh of Object.values(this.meshes)) {
      this.scene.remove(mesh);
      // Não dispose geometry (partilhada) nem materials (cached).
      // O InstancedMesh em si é pequeno; GC trata do resto.
    }
    this.meshes = {};
  }

  /**
   * Itera sobre todos os blocos sólidos que têm pelo menos um vizinho de ar,
   * chamando fn(x, y, z, type) para cada um.
   */
  _eachVisible(fn) {
    const { world } = this;
    const { width: W, depth: D, height: H } = world;
    const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          const type = world.getBlock(x, y, z);
          if (type === BLOCK.AIR) continue;

          let visible = false;
          for (const [dx, dy, dz] of DIRS) {
            if (!world.isSolid(x + dx, y + dy, z + dz)) { visible = true; break; }
          }
          if (visible) fn(x, y, z, type);
        }
      }
    }
  }
}
