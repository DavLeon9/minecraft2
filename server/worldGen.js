// ─── Block type constants ──────────────────────────────────────────────────────
const BLOCK = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LOG: 5, LEAVES: 6,
  COAL_ORE: 7, IRON_ORE: 8, GOLD_ORE: 9, DIAMOND_ORE: 10,
  CRAFTING_TABLE: 11, FURNACE: 12, COBBLESTONE: 13,
};

/**
 * Height function: overlapping sine waves → natural-looking hills.
 * Deterministic — same seed gives same terrain every run.
 */
function getHeight(x, z) {
  const h =
    10 +
    4.0 * Math.sin(x * 0.15 + 1.2) * Math.cos(z * 0.12) +
    2.5 * Math.sin(x * 0.09 + z * 0.11) +
    1.5 * Math.cos(x * 0.22 + z * 0.18 + 0.7);
  return Math.max(4, Math.min(22, Math.floor(h)));
}

/** Deterministic hash for tree/decoration placement. */
function treeHash(x, z) {
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
      const surf = getHeight(x, z);
      for (let y = 0; y < H; y++) {
        if      (y === 0)        data[idx(x, y, z)] = BLOCK.STONE;
        else if (y < surf - 3)   data[idx(x, y, z)] = BLOCK.STONE;
        else if (y < surf)       data[idx(x, y, z)] = BLOCK.DIRT;
        else if (y === surf)     data[idx(x, y, z)] = BLOCK.GRASS;
        // else: AIR (Uint8Array defaults to 0)
      }
    }
  }

  // ── Ores ──────────────────────────────────────────────────────────────────
  // Replace some STONE blocks with ore veins based on deterministic hashes
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const surf = getHeight(x, z);
      for (let y = 1; y < surf - 3; y++) {
        if (data[idx(x, y, z)] !== BLOCK.STONE) continue;
        const h = treeHash(x * 31 + y, z * 17 + y * 7);
        // Diamond: y < 5, ~1.5% of stone
        if (y < 5 && (h % 67) < 1) { data[idx(x, y, z)] = BLOCK.DIAMOND_ORE; continue; }
        // Gold: y < 9, ~2% of stone
        if (y < 9 && (h % 50) < 1) { data[idx(x, y, z)] = BLOCK.GOLD_ORE; continue; }
        // Iron: y < surf-4, ~4% of stone
        if (y < surf - 4 && (h % 25) < 1) { data[idx(x, y, z)] = BLOCK.IRON_ORE; continue; }
        // Coal: y < surf-2, ~6% of stone
        if (y < surf - 2 && (h % 17) < 1) { data[idx(x, y, z)] = BLOCK.COAL_ORE; }
      }
    }
  }

  // ── Trees ─────────────────────────────────────────────────────────────────
  for (let x = 3; x < W - 3; x++) {
    for (let z = 3; z < D - 3; z++) {
      const h = treeHash(x, z);
      if (h % 18 !== 0) continue;  // ~1 tree per 18 columns

      const surf = getHeight(x, z);
      if (surf < 5 || surf > 21) continue;  // skip water-like depressions or peaks

      const trunkH = 4 + (h % 3);   // trunk: 4–6 blocks
      const topY   = surf + trunkH;

      // Trunk
      for (let y = surf + 1; y <= topY; y++) set(x, y, z, BLOCK.LOG);

      // Leaves — rounded canopy
      for (let ly = topY - 2; ly <= topY + 2; ly++) {
        const radius = (ly >= topY) ? 1 : 2;
        for (let lx = x - radius; lx <= x + radius; lx++) {
          for (let lz = z - radius; lz <= z + radius; lz++) {
            // Let trunk keep priority for column that has the trunk
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

module.exports = { generateWorld, getHeight, BLOCK };
