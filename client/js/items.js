/**
 * Item system — definições, regras de mineração e drops.
 *
 * IDs:
 *   1–13  : blocos colocáveis (igual a BLOCK em constants.js)
 *   100–  : materiais não-colocáveis
 *   200–  : ferramentas
 */
import { BLOCK } from './constants.js';
import { getBlockFaceCanvas } from './world.js';

// ─── IDs de itens (não-blocos) ────────────────────────────────────────────────
export const ITEM_ID = Object.freeze({
  COAL:       100, RAW_IRON: 101, RAW_GOLD: 102, DIAMOND:  103,
  IRON_INGOT: 104, GOLD_INGOT: 105, STICK: 106,

  WOOD_PICK: 200, STONE_PICK: 201, IRON_PICK: 202, DIAMOND_PICK: 203,
  WOOD_AXE:  210, STONE_AXE:  211, IRON_AXE:  212, DIAMOND_AXE:  213,
  WOOD_SHOVEL:  220, STONE_SHOVEL: 221, IRON_SHOVEL: 222, DIAMOND_SHOVEL: 223,
  WOOD_SWORD:   230, STONE_SWORD:  231, IRON_SWORD:  232, DIAMOND_SWORD:  233,
});

// ─── Metadados de cada item ───────────────────────────────────────────────────
// tool: tipo de ferramenta | tier: 0=madeira 1=pedra 2=ferro 3=diamante
const _INFO = {
  // Blocos colocáveis
  [BLOCK.GRASS]:          { name:'Relva',           max:64, block:true },
  [BLOCK.DIRT]:           { name:'Terra',           max:64, block:true },
  [BLOCK.STONE]:          { name:'Pedra',           max:64, block:true },
  [BLOCK.WOOD]:           { name:'Madeira',         max:64, block:true },
  [BLOCK.LOG]:            { name:'Tronco',          max:64, block:true },
  [BLOCK.LEAVES]:         { name:'Folhas',          max:64, block:true },
  [BLOCK.COAL_ORE]:       { name:'Min. Carvão',     max:64, block:true },
  [BLOCK.IRON_ORE]:       { name:'Min. Ferro',      max:64, block:true },
  [BLOCK.GOLD_ORE]:       { name:'Min. Ouro',       max:64, block:true },
  [BLOCK.DIAMOND_ORE]:    { name:'Min. Diamante',   max:64, block:true },
  [BLOCK.CRAFTING_TABLE]: { name:'Bancada',         max:64, block:true },
  [BLOCK.FURNACE]:        { name:'Fornalha',        max:64, block:true },
  [BLOCK.COBBLESTONE]:    { name:'Pedra Partida',   max:64, block:true },
  // Materiais
  [ITEM_ID.COAL]:       { name:'Carvão',        max:64 },
  [ITEM_ID.RAW_IRON]:   { name:'Ferro Bruto',   max:64 },
  [ITEM_ID.RAW_GOLD]:   { name:'Ouro Bruto',    max:64 },
  [ITEM_ID.DIAMOND]:    { name:'Diamante',      max:64 },
  [ITEM_ID.IRON_INGOT]: { name:'Lingote Ferro', max:64 },
  [ITEM_ID.GOLD_INGOT]: { name:'Lingote Ouro',  max:64 },
  [ITEM_ID.STICK]:      { name:'Pau',           max:64 },
  // Ferramentas
  [ITEM_ID.WOOD_PICK]:    { name:'Picareta Madeira',  max:1, tool:'pickaxe', tier:0 },
  [ITEM_ID.STONE_PICK]:   { name:'Picareta Pedra',    max:1, tool:'pickaxe', tier:1 },
  [ITEM_ID.IRON_PICK]:    { name:'Picareta Ferro',    max:1, tool:'pickaxe', tier:2 },
  [ITEM_ID.DIAMOND_PICK]: { name:'Picareta Diamante', max:1, tool:'pickaxe', tier:3 },
  [ITEM_ID.WOOD_AXE]:     { name:'Machado Madeira',   max:1, tool:'axe',     tier:0 },
  [ITEM_ID.STONE_AXE]:    { name:'Machado Pedra',     max:1, tool:'axe',     tier:1 },
  [ITEM_ID.IRON_AXE]:     { name:'Machado Ferro',     max:1, tool:'axe',     tier:2 },
  [ITEM_ID.DIAMOND_AXE]:  { name:'Machado Diamante',  max:1, tool:'axe',     tier:3 },
  [ITEM_ID.WOOD_SHOVEL]:    { name:'Pá Madeira',      max:1, tool:'shovel',  tier:0 },
  [ITEM_ID.STONE_SHOVEL]:   { name:'Pá Pedra',        max:1, tool:'shovel',  tier:1 },
  [ITEM_ID.IRON_SHOVEL]:    { name:'Pá Ferro',        max:1, tool:'shovel',  tier:2 },
  [ITEM_ID.DIAMOND_SHOVEL]: { name:'Pá Diamante',     max:1, tool:'shovel',  tier:3 },
  [ITEM_ID.WOOD_SWORD]:     { name:'Espada Madeira',  max:1, tool:'sword',   tier:0 },
  [ITEM_ID.STONE_SWORD]:    { name:'Espada Pedra',    max:1, tool:'sword',   tier:1 },
  [ITEM_ID.IRON_SWORD]:     { name:'Espada Ferro',    max:1, tool:'sword',   tier:2 },
  [ITEM_ID.DIAMOND_SWORD]:  { name:'Espada Diamante', max:1, tool:'sword',   tier:3 },
};

export function getItemInfo(id)  { return _INFO[id] || { name:`#${id}`, max:64 }; }
export function isBlockItem(id)  { return !!_INFO[id]?.block; }
export function getToolInfo(id)  { const i = _INFO[id]; return i?.tool ? { tool: i.tool, tier: i.tier ?? 0 } : null; }

// ─── Cor de cada item (para o inventário) ─────────────────────────────────────
export const ITEM_COLOR = {
  [BLOCK.GRASS]: 'linear-gradient(180deg,#6db340 35%,#7a5230 35%)',
  [BLOCK.DIRT]:  '#7a5230',
  [BLOCK.STONE]: '#9a9a9a',
  [BLOCK.WOOD]:  'repeating-linear-gradient(0deg,#ac7828 0,#ac7828 3px,#6e4818 3px,#6e4818 4px)',
  [BLOCK.LOG]:   '#6b4226',
  [BLOCK.LEAVES]:'#3c8020',
  [BLOCK.COAL_ORE]:    '#6a6a5a',
  [BLOCK.IRON_ORE]:    '#a8673a',
  [BLOCK.GOLD_ORE]:    '#b8a000',
  [BLOCK.DIAMOND_ORE]: '#28a8b0',
  [BLOCK.CRAFTING_TABLE]:'#8b5a2b',
  [BLOCK.FURNACE]:     '#555',
  [BLOCK.COBBLESTONE]: '#888',
  [ITEM_ID.COAL]:      '#111',
  [ITEM_ID.RAW_IRON]:  '#c07840',
  [ITEM_ID.RAW_GOLD]:  '#c8a800',
  [ITEM_ID.DIAMOND]:   '#30b8c8',
  [ITEM_ID.IRON_INGOT]:'#b8b8b8',
  [ITEM_ID.GOLD_INGOT]:'#ffd800',
  [ITEM_ID.STICK]:     '#8b4513',
  [ITEM_ID.WOOD_PICK]:    '#a07828',
  [ITEM_ID.STONE_PICK]:   '#9a9a9a',
  [ITEM_ID.IRON_PICK]:    '#c0c0c0',
  [ITEM_ID.DIAMOND_PICK]: '#30b8c8',
  [ITEM_ID.WOOD_AXE]:     '#a07828',
  [ITEM_ID.STONE_AXE]:    '#9a9a9a',
  [ITEM_ID.IRON_AXE]:     '#c0c0c0',
  [ITEM_ID.DIAMOND_AXE]:  '#30b8c8',
  [ITEM_ID.WOOD_SHOVEL]:    '#a07828',
  [ITEM_ID.STONE_SHOVEL]:   '#9a9a9a',
  [ITEM_ID.IRON_SHOVEL]:    '#c0c0c0',
  [ITEM_ID.DIAMOND_SHOVEL]: '#30b8c8',
  [ITEM_ID.WOOD_SWORD]:    '#a07828',
  [ITEM_ID.STONE_SWORD]:   '#9a9a9a',
  [ITEM_ID.IRON_SWORD]:    '#c0c0c0',
  [ITEM_ID.DIAMOND_SWORD]: '#30b8c8',
};

export const ITEM_ICON = {
  [ITEM_ID.COAL]:'⬤', [ITEM_ID.RAW_IRON]:'◆', [ITEM_ID.RAW_GOLD]:'◆',
  [ITEM_ID.DIAMOND]:'◆', [ITEM_ID.IRON_INGOT]:'▬', [ITEM_ID.GOLD_INGOT]:'▬',
  [ITEM_ID.STICK]:'|',
  [ITEM_ID.WOOD_PICK]:'⛏', [ITEM_ID.STONE_PICK]:'⛏', [ITEM_ID.IRON_PICK]:'⛏', [ITEM_ID.DIAMOND_PICK]:'⛏',
  [ITEM_ID.WOOD_AXE]:'🪓', [ITEM_ID.STONE_AXE]:'🪓', [ITEM_ID.IRON_AXE]:'🪓', [ITEM_ID.DIAMOND_AXE]:'🪓',
  [ITEM_ID.WOOD_SHOVEL]:'🔧',[ITEM_ID.STONE_SHOVEL]:'🔧',[ITEM_ID.IRON_SHOVEL]:'🔧',[ITEM_ID.DIAMOND_SHOVEL]:'🔧',
  [ITEM_ID.WOOD_SWORD]:'⚔', [ITEM_ID.STONE_SWORD]:'⚔', [ITEM_ID.IRON_SWORD]:'⚔', [ITEM_ID.DIAMOND_SWORD]:'⚔',
};

// ─── Requisito de mineração por bloco ─────────────────────────────────────────
// null = sem requisito (qualquer coisa/mão)
const _MINE_REQ = {
  [BLOCK.STONE]:          { tool:'pickaxe', minTier:0 },
  [BLOCK.COBBLESTONE]:    { tool:'pickaxe', minTier:0 },
  [BLOCK.COAL_ORE]:       { tool:'pickaxe', minTier:0 },
  [BLOCK.FURNACE]:        { tool:'pickaxe', minTier:0 },
  [BLOCK.IRON_ORE]:       { tool:'pickaxe', minTier:1 },  // pedra+
  [BLOCK.GOLD_ORE]:       { tool:'pickaxe', minTier:2 },  // ferro+
  [BLOCK.DIAMOND_ORE]:    { tool:'pickaxe', minTier:2 },  // ferro+
};

/** Pode o item segurado minerar este bloco? */
export function canMine(blockType, heldId) {
  const req = _MINE_REQ[blockType];
  if (!req) return true;
  if (heldId == null) return false;
  const ti = _INFO[heldId];
  return ti?.tool === req.tool && (ti.tier ?? -1) >= req.minTier;
}

/** Tempo (s) para minerar o bloco com o item dado. Infinity se não pode. */
export function getBreakTime(blockType, heldId) {
  const BASE = {
    [BLOCK.GRASS]:0.7, [BLOCK.DIRT]:0.7, [BLOCK.LOG]:1.2, [BLOCK.WOOD]:0.9, [BLOCK.LEAVES]:0.3,
    [BLOCK.STONE]:7.5, [BLOCK.COBBLESTONE]:7.5, [BLOCK.CRAFTING_TABLE]:1.5,
    [BLOCK.FURNACE]:7.5, [BLOCK.COAL_ORE]:7.5, [BLOCK.IRON_ORE]:7.5,
    [BLOCK.GOLD_ORE]:9.0, [BLOCK.DIAMOND_ORE]:12.0,
  };
  const SPEED = { // multiplicador (com ferramenta correcta)
    pickaxe:{ 0:0.40, 1:0.24, 2:0.14, 3:0.08 },
    axe:    { 0:0.50, 1:0.32, 2:0.18, 3:0.10 },
    shovel: { 0:0.50, 1:0.35, 2:0.20, 3:0.12 },
  };
  const base = BASE[blockType] ?? 1.0;
  if (!canMine(blockType, heldId)) return Infinity;
  const ti = heldId != null ? _INFO[heldId] : null;
  if (ti?.tool && SPEED[ti.tool]) return base * SPEED[ti.tool][ti.tier ?? 0];
  return base;
}

// ─── Ícones de inventário (canvas pixel-art 32×32) ───────────────────────────
const _iconCache = {};

export function getItemIconDataUrl(id) {
  if (_iconCache[id]) return _iconCache[id];
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const c  = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  _drawItemIcon(c, id);
  return (_iconCache[id] = cv.toDataURL());
}

// helpers
function _r(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

// 3-face block pseudo-isometric
function _block3d(c, top, left, right) {
  _r(c, 4, 2, 24, 12, top);    // top face
  _r(c, 2, 13, 15, 16, left);  // left face
  _r(c, 17, 13, 13, 16, right);// right face
  _r(c, 2, 12, 28, 1, 'rgba(0,0,0,0.6)');  // top/side divider
  _r(c, 16, 13, 1, 16, 'rgba(0,0,0,0.5)'); // left/right divider
  // top-face highlight edge
  _r(c, 4, 2, 24, 1, 'rgba(255,255,255,0.2)');
}

// gem diamond shape
function _gem(c, mid, hi, lo) {
  _r(c, 11, 5,  10, 4, mid);
  _r(c,  9, 9,  14, 6, mid);
  _r(c, 11, 15, 10, 5, mid);
  _r(c, 11, 5,   5, 3, hi);   // highlight
  _r(c, 16, 16,  5, 4, lo);   // shadow
}

// ingot bar
function _ingot(c, mid, hi, lo) {
  _r(c, 5, 10, 22, 12, mid);
  _r(c, 5, 10, 22,  3, hi);
  _r(c, 5, 19, 22,  3, lo);
  _r(c, 5, 10,  1, 12, 'rgba(0,0,0,0.4)');
  _r(c,26, 10,  1, 12, 'rgba(0,0,0,0.4)');
}

// diagonal stick
function _stick(c) {
  for (let i = 0; i < 11; i++) {
    _r(c, 18 - i * 2, 4 + i * 2, 3, 3, i % 2 === 0 ? '#b07830' : '#8a5820');
  }
}

// tier material colors [main, hi, shadow]
const _TC = [
  ['#c8922a','#f0c860','#7a5810'], // wood
  ['#909090','#cccccc','#565656'], // stone
  ['#c0ccd8','#e8f0f8','#788898'], // iron
  ['#30c8e0','#80f0ff','#1098a8'], // diamond
];

// draw a diagonal handle for tools
function _handle(c) {
  for (let i = 0; i < 9; i++) _r(c, 20-i*2, 10+i*2, 3, 3, i%2===0?'#b07830':'#8a5820');
}

function _pick(c, tier) {
  const [m,h,s] = _TC[tier];
  _handle(c);
  _r(c,  1, 3, 18,  6, m); // head horizontal bar
  _r(c,  1, 3,  5,  4, h); // left tip hi
  _r(c,  1, 7,  5,  4, s); // left tip shadow
  _r(c, 14, 2,  6,  3, h); // right tip
  _r(c,  1, 3,  1, 10, s); // left edge dark
}

function _axe(c, tier) {
  const [m,h,s] = _TC[tier];
  _handle(c);
  _r(c, 4,  2, 14,  5, m); // top blade
  _r(c, 4,  7, 14,  5, m); // bottom blade
  _r(c, 4,  2,  3, 10, h); // left hi
  _r(c,16,  2,  3,  4, s); // top-right tip
  _r(c, 4,  2, 14,  1, h); // top edge
}

function _shovel(c, tier) {
  const [m,h,s] = _TC[tier];
  _handle(c);
  _r(c, 12, 2,  8, 10, m); // blade
  _r(c, 12, 2,  2, 10, h); // left hi
  _r(c, 18, 2,  2, 10, s); // right shadow
  _r(c, 12, 11, 8,  2, s); // bottom tip
}

function _sword(c, tier) {
  const [m,h,s] = _TC[tier];
  // Blade diagonal
  for (let i = 0; i < 10; i++) _r(c, 18-i*2, 2+i*2, 4, 4, i%2===0?m:h);
  // Guard
  _r(c, 4, 14, 16, 3, s);
  _r(c, 4, 14, 16, 1, h);
  // Handle
  _r(c, 10, 17, 5, 8, '#8b5a2b');
}

// Blocos: desenha a textura real do bloco (mesmo pixel-art do mundo 3D)
// Itens não-bloco: shapes geométricas pixeladas
function _drawItemIcon(c, id) {
  // Tentar textura real do bloco
  const face = getBlockFaceCanvas(id);
  if (face) {
    c.imageSmoothingEnabled = false;
    c.drawImage(face, 0, 0, 32, 32); // escala 16×16 → 32×32 pixelado
    return;
  }
  const I = ITEM_ID;
  if      (id===I.COAL)       _gem(c,'#282820','#484838','#101008');
  else if (id===I.RAW_IRON)   _gem(c,'#c07840','#e09860','#904820');
  else if (id===I.RAW_GOLD)   _gem(c,'#d4a800','#f8d040','#a07000');
  else if (id===I.DIAMOND)    _gem(c,'#18c8e0','#68e8f8','#1098a8');
  else if (id===I.IRON_INGOT) _ingot(c,'#aaaaaa','#d4d4d4','#787878');
  else if (id===I.GOLD_INGOT) _ingot(c,'#e8b800','#ffd840','#a07800');
  else if (id===I.STICK)      _stick(c);
  else if (id>=200&&id<210)   _pick(c, (id-200)%4);
  else if (id>=210&&id<220)   _axe(c, (id-210)%4);
  else if (id>=220&&id<230)   _shovel(c, (id-220)%4);
  else if (id>=230&&id<240)   _sword(c, (id-230)%4);
  else { _r(c,4,4,24,24, ITEM_COLOR[id]||'#888'); }
}

// ─── Drops ao partir um bloco ─────────────────────────────────────────────────
const _DROPS = {
  [BLOCK.GRASS]:          () => [{ id: BLOCK.DIRT,          count:1 }],
  [BLOCK.DIRT]:           () => [{ id: BLOCK.DIRT,          count:1 }],
  [BLOCK.STONE]:          () => [{ id: BLOCK.COBBLESTONE,   count:1 }],
  [BLOCK.COBBLESTONE]:    () => [{ id: BLOCK.COBBLESTONE,   count:1 }],
  [BLOCK.WOOD]:           () => [{ id: BLOCK.WOOD,          count:1 }],
  [BLOCK.LOG]:            () => [{ id: BLOCK.LOG,           count:1 }],
  [BLOCK.LEAVES]:         () => [],
  [BLOCK.CRAFTING_TABLE]: () => [{ id: BLOCK.CRAFTING_TABLE,count:1 }],
  [BLOCK.FURNACE]:        () => [{ id: BLOCK.FURNACE,       count:1 }],
  [BLOCK.COAL_ORE]:       () => [{ id: ITEM_ID.COAL,   count: 1 + (Math.random()<0.35?1:0) }],
  [BLOCK.IRON_ORE]:       () => [{ id: ITEM_ID.RAW_IRON,   count:1 }],
  [BLOCK.GOLD_ORE]:       () => [{ id: ITEM_ID.RAW_GOLD,   count:1 }],
  [BLOCK.DIAMOND_ORE]:    () => [{ id: ITEM_ID.DIAMOND,    count:1 }],
};

/** Drops para o bloco com a ferramenta dada. Retorna [] se não pode minerar. */
export function getDrops(blockType, heldId) {
  if (!canMine(blockType, heldId)) return [];
  const fn = _DROPS[blockType];
  return fn ? fn() : [{ id: blockType, count:1 }];
}
