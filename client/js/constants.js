// ─── Dimensões do mundo ───────────────────────────────────────────────────────
export const WORLD_WIDTH  = 64;
export const WORLD_DEPTH  = 64;
export const WORLD_HEIGHT = 32;

// ─── Tipos de bloco ───────────────────────────────────────────────────────────
export const BLOCK = Object.freeze({
  AIR:    0,
  GRASS:  1,
  DIRT:   2,
  STONE:  3,
  WOOD:   4,   // wood planks
  LOG:    5,   // oak log
  LEAVES: 6,
});

/**
 * Tempo (em segundos) para partir cada tipo de bloco.
 * Pedra é a mais dura; folhas e terra são as mais fáceis.
 */
export const BREAK_TIME = Object.freeze({
  [BLOCK.GRASS]:  0.7,
  [BLOCK.DIRT]:   0.7,
  [BLOCK.STONE]:  2.5,
  [BLOCK.WOOD]:   0.9,
  [BLOCK.LOG]:    1.2,
  [BLOCK.LEAVES]: 0.3,
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
