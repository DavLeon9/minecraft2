// ─── Dimensões do mundo ───────────────────────────────────────────────────────
export const WORLD_WIDTH  = 64;
export const WORLD_DEPTH  = 64;
export const WORLD_HEIGHT = 32;

// ─── Tipos de bloco ───────────────────────────────────────────────────────────
export const BLOCK = Object.freeze({
  AIR:     0,
  GRASS:   1,
  DIRT:    2,
  STONE:   3,
  WOOD:    4,   // pranchas de madeira
  LOG:     5,   // tronco
  LEAVES:  6,   // folhas
  COAL_ORE:    7,   // minério de carvão
  IRON_ORE:    8,   // minério de ferro
  GOLD_ORE:    9,   // minério de ouro
  DIAMOND_ORE: 10,  // minério de diamante
  CRAFTING_TABLE: 11,
  FURNACE:        12,
  COBBLESTONE:    13,  // drop da pedra
});

// ─── Física do jogador ────────────────────────────────────────────────────────
export const PLAYER_HEIGHT  = 1.8;
export const PLAYER_EYE_Y   = 1.6;
export const PLAYER_WIDTH   = 0.6;
export const GRAVITY        = 22;
export const JUMP_FORCE     = 8.5;
export const MOVE_SPEED     = 5.0;
export const REACH_DISTANCE = 5.0;

// ─── Rede ─────────────────────────────────────────────────────────────────────
export const MOVE_SEND_RATE = 0.05;
