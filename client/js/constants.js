// ─── Dimensões do mundo ───────────────────────────────────────────────────────
export const WORLD_WIDTH  = 64;
export const WORLD_DEPTH  = 64;
export const WORLD_HEIGHT = 32;

// ─── Tipos de bloco ───────────────────────────────────────────────────────────
export const BLOCK = Object.freeze({
  AIR:   0,
  GRASS: 1,
  DIRT:  2,
  STONE: 3,
  WOOD:  4,
});

// Cor para cima (top) e para os lados (side) de cada bloco
export const BLOCK_COLORS = Object.freeze({
  [BLOCK.GRASS]: { top: 0x5a9e3c, side: 0x7a5c3a },
  [BLOCK.DIRT]:  { top: 0x7a5c3a, side: 0x7a5c3a },
  [BLOCK.STONE]: { top: 0x828282, side: 0x767676 },
  [BLOCK.WOOD]:  { top: 0xc47c3c, side: 0xb87333 },
});

// ─── Física do jogador ────────────────────────────────────────────────────────
export const PLAYER_HEIGHT  = 1.8;   // altura total (metros)
export const PLAYER_EYE_Y   = 1.6;   // câmara acima dos pés
export const PLAYER_WIDTH   = 0.6;   // largura/profundidade da hitbox
export const GRAVITY        = 22;    // aceleração gravítica (m/s²)
export const JUMP_FORCE     = 8.5;   // impulso vertical no salto
export const MOVE_SPEED     = 5.0;   // velocidade horizontal (m/s)
export const REACH_DISTANCE = 5.0;   // alcance para quebrar/colocar blocos

// ─── Rede ─────────────────────────────────────────────────────────────────────
export const MOVE_SEND_RATE = 0.05;  // segundos entre envios de posição (20/s)
