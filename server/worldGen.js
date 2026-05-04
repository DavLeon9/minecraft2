// ─── Block type constants ──────────────────────────────────────────────────────
const BLOCK = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4 };

/**
 * Height function: uses overlapping sine waves to produce natural-looking hills.
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

/**
 * Generates a fresh Uint8Array for a W×D×H world.
 * Layout: index = x + z*W + y*W*D
 */
function generateWorld(W, D, H) {
  const data = new Uint8Array(W * D * H);

  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const surf = getHeight(x, z);

      for (let y = 0; y < H; y++) {
        const i = x + z * W + y * W * D;
        if      (y === 0)          data[i] = BLOCK.STONE;  // bedrock-like base
        else if (y < surf - 3)     data[i] = BLOCK.STONE;
        else if (y < surf)         data[i] = BLOCK.DIRT;
        else if (y === surf)       data[i] = BLOCK.GRASS;
        else                       data[i] = BLOCK.AIR;
      }
    }
  }

  return data;
}

module.exports = { generateWorld, getHeight, BLOCK };
