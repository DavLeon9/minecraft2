// ─── Block type constants ──────────────────────────────────────────────────────
const BLOCK = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LOG: 5, LEAVES: 6,
  COAL_ORE: 7, IRON_ORE: 8, GOLD_ORE: 9, DIAMOND_ORE: 10,
  CRAFTING_TABLE: 11, FURNACE: 12, COBBLESTONE: 13, BEDROCK: 14,
};

// ─── Biome system ─────────────────────────────────────────────────────────────

/** Biome noise: smooth value 0-1 using low-frequency sin waves. */
function biomeValue(x, z) {
  return 0.5 +
    0.30 * Math.sin(x * 0.018 + 0.72) * Math.cos(z * 0.015 + 1.31) +
    0.20 * Math.sin(x * 0.009 + z * 0.011 + 3.14);
}

/**
 * Returns biome index for (x,z):
 *   0 = plains   (flat, sparse trees)
 *   1 = forest   (hills, dense trees)
 *   2 = mountains (tall, rare trees)
 */
function getBiome(x, z) {
  const v = biomeValue(x, z);
  if (v < 0.38) return 0;
  if (v < 0.72) return 1;
  return 2;
}

/**
 * Terrain height for (x,z) given world height H.
 * Each biome has different base elevation and roughness.
 */
function getHeight(x, z, H) {
  const biome = getBiome(x, z);

  // Fine detail (small waves shared by all biomes)
  const detail =
    1.5 * Math.sin(x * 0.23 + z * 0.19 + 0.71) +
    0.7 * Math.sin(x * 0.32 + 0.44) * Math.cos(z * 0.29 + 1.13);

  let base;
  if (biome === 0) {          // plains — flat, gentle rolls
    base = 18 +
      2.0 * Math.sin(x * 0.08 + 0.52) * Math.cos(z * 0.07 + 0.93) +
      1.0 * Math.sin(x * 0.05 + z * 0.06 + 1.7) +
      detail * 0.3;
  } else if (biome === 1) {   // forest — moderate hills
    base = 22 +
      5.5 * Math.sin(x * 0.11 + 1.10) * Math.cos(z * 0.10 + 0.31) +
      3.0 * Math.sin(x * 0.07 + z * 0.09 + 2.01) +
      detail * 0.9;
  } else {                    // mountains — tall peaks
    base = 32 +
      13.0 * Math.sin(x * 0.09 + 0.82) * Math.cos(z * 0.08 + 1.52) +
       6.5 * Math.sin(x * 0.06 + z * 0.07 + 1.03) +
      detail * 1.8;
  }

  return Math.max(8, Math.min(H - 6, Math.floor(base)));
}

/** Deterministic hash for decoration placement. */
function hash(x, z) {
  let h = Math.imul(x * 374761393, 1) ^ Math.imul(z * 668265263, 1);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return Math.abs(h ^ (h >>> 16));
}

/**
 * Generates a fresh Uint8Array for a W×D×H world.
 * Layout: index = x + z*W + y*W*D
 */
function generateWorld(W, D, H) {
  const data = new Uint8Array(W * D * H);
  const idx  = (x, y, z) => x + z * W + y * W * D;
  const set  = (x, y, z, t) => {
    if (x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D) data[idx(x, y, z)] = t;
  };
  const get  = (x, y, z) =>
    (x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D) ? data[idx(x, y, z)] : BLOCK.AIR;

  // ── Terrain ───────────────────────────────────────────────────────────────
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const surf = getHeight(x, z, H);
      for (let y = 0; y < H; y++) {
        if      (y <= 1)         data[idx(x, y, z)] = BLOCK.BEDROCK;  // camada indestrutível
        else if (y < surf - 4)  data[idx(x, y, z)] = BLOCK.STONE;
        else if (y < surf)      data[idx(x, y, z)] = BLOCK.DIRT;
        else if (y === surf)    data[idx(x, y, z)] = BLOCK.GRASS;
        // else AIR (Uint8Array defaults to 0)
      }
    }
  }

  // ── Ores (layered by depth) ────────────────────────────────────────────────
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const surf = getHeight(x, z, H);
      for (let y = 2; y < surf - 4; y++) {
        if (data[idx(x, y, z)] !== BLOCK.STONE) continue;
        const h = hash(x * 31 + y, z * 17 + y * 7);

        // Diamond: y < 10 (~1.2% of stone)
        if (y < 10 && (h % 83) < 1) { data[idx(x, y, z)] = BLOCK.DIAMOND_ORE; continue; }
        // Gold: y < 18 (~2% of stone)
        if (y < 18 && (h % 50) < 1) { data[idx(x, y, z)] = BLOCK.GOLD_ORE;    continue; }
        // Iron: full depth (~4% of stone)
        if ((h % 25) < 1)            { data[idx(x, y, z)] = BLOCK.IRON_ORE;    continue; }
        // Coal: full depth (~6% of stone)
        if ((h % 17) < 1)            { data[idx(x, y, z)] = BLOCK.COAL_ORE; }
      }
    }
  }

  // ── Trees (biome-dependent density) ───────────────────────────────────────
  for (let x = 3; x < W - 3; x++) {
    for (let z = 3; z < D - 3; z++) {
      const biome = getBiome(x, z);
      const h = hash(x, z);

      // Density per biome: plains sparse, forest dense, mountains very sparse
      const threshold = biome === 0 ? 40 : biome === 1 ? 10 : 55;
      if (h % threshold !== 0) continue;

      const surf = getHeight(x, z, H);
      if (surf < 8 || surf > H - 10) continue;

      const trunkH = 4 + (h % 3);   // trunk: 4–6 blocks
      const topY   = surf + trunkH;
      if (topY + 3 >= H) continue;  // don't overflow world top

      // Trunk
      for (let y = surf + 1; y <= topY; y++) set(x, y, z, BLOCK.LOG);

      // Leaves — rounded canopy
      const leafRadius = biome === 1 ? 3 : 2; // bigger canopy in forest
      for (let ly = topY - 2; ly <= topY + 2; ly++) {
        const radius = (ly >= topY) ? 1 : leafRadius;
        for (let lx = x - radius; lx <= x + radius; lx++) {
          for (let lz = z - radius; lz <= z + radius; lz++) {
            if (lx === x && lz === z && ly <= topY) continue;
            const dx = lx - x, dz = lz - z, dy = ly - topY;
            const dist = Math.sqrt(dx * dx + dy * dy * 0.5 + dz * dz);
            if (dist <= radius + 0.7 && get(lx, ly, lz) === BLOCK.AIR) {
              set(lx, ly, lz, BLOCK.LEAVES);
            }
          }
        }
      }
    }
  }

  return data;
}

module.exports = { generateWorld, getHeight, getBiome, BLOCK };
