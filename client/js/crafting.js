/**
 * Sistema de crafting — receitas 2×2 (inventário) e 3×3 (bancada).
 *
 * As receitas são definidas como grelhas de IDs.
 * O matcher compacta a grelha (remove linhas/colunas vazias) e compara.
 *
 * Ingredientes: 0 = vazio.
 */
import { BLOCK } from './constants.js';
import { ITEM_ID } from './items.js';

const B = BLOCK, I = ITEM_ID;

// ─── Receitas ─────────────────────────────────────────────────────────────────
export const RECIPES = [
  { name:'Pranchas',          grid:[[B.LOG]],                                                                      result:{ id:B.WOOD,           count:4 } },
  { name:'Paus (madeira)',    grid:[[B.WOOD],[B.WOOD]],                                                            result:{ id:I.STICK,           count:4 } },
  { name:'Paus (tronco)',     grid:[[B.LOG],[B.LOG]],                                                              result:{ id:I.STICK,           count:4 } },
  { name:'Bancada',           grid:[[B.WOOD,B.WOOD],[B.WOOD,B.WOOD]],                                             result:{ id:B.CRAFTING_TABLE,  count:1 } },
  { name:'Lingote Ferro',     grid:[[I.RAW_IRON,I.COAL]],                                                         result:{ id:I.IRON_INGOT,      count:1 } },
  { name:'Lingote Ouro',      grid:[[I.RAW_GOLD,I.COAL]],                                                         result:{ id:I.GOLD_INGOT,      count:1 } },

  { name:'Fornalha',          grid:[[B.COBBLESTONE,B.COBBLESTONE,B.COBBLESTONE],[B.COBBLESTONE,0,B.COBBLESTONE],[B.COBBLESTONE,B.COBBLESTONE,B.COBBLESTONE]], result:{ id:B.FURNACE, count:1 } },

  { name:'Picareta Madeira',  grid:[[B.WOOD,B.WOOD,B.WOOD],[0,I.STICK,0],[0,I.STICK,0]],                         result:{ id:I.WOOD_PICK,       count:1 } },
  { name:'Picareta Pedra',    grid:[[B.COBBLESTONE,B.COBBLESTONE,B.COBBLESTONE],[0,I.STICK,0],[0,I.STICK,0]],    result:{ id:I.STONE_PICK,      count:1 } },
  { name:'Picareta Ferro',    grid:[[I.IRON_INGOT,I.IRON_INGOT,I.IRON_INGOT],[0,I.STICK,0],[0,I.STICK,0]],      result:{ id:I.IRON_PICK,       count:1 } },
  { name:'Picareta Diamante', grid:[[I.DIAMOND,I.DIAMOND,I.DIAMOND],[0,I.STICK,0],[0,I.STICK,0]],                result:{ id:I.DIAMOND_PICK,    count:1 } },

  { name:'Machado Madeira',   grid:[[B.WOOD,B.WOOD,0],[B.WOOD,I.STICK,0],[0,I.STICK,0]],                        result:{ id:I.WOOD_AXE,        count:1 } },
  { name:'Machado Pedra',     grid:[[B.COBBLESTONE,B.COBBLESTONE,0],[B.COBBLESTONE,I.STICK,0],[0,I.STICK,0]],   result:{ id:I.STONE_AXE,       count:1 } },
  { name:'Machado Ferro',     grid:[[I.IRON_INGOT,I.IRON_INGOT,0],[I.IRON_INGOT,I.STICK,0],[0,I.STICK,0]],     result:{ id:I.IRON_AXE,        count:1 } },
  { name:'Machado Diamante',  grid:[[I.DIAMOND,I.DIAMOND,0],[I.DIAMOND,I.STICK,0],[0,I.STICK,0]],               result:{ id:I.DIAMOND_AXE,     count:1 } },

  { name:'Pá Madeira',        grid:[[0,B.WOOD,0],[0,I.STICK,0],[0,I.STICK,0]],                                  result:{ id:I.WOOD_SHOVEL,     count:1 } },
  { name:'Pá Pedra',          grid:[[0,B.COBBLESTONE,0],[0,I.STICK,0],[0,I.STICK,0]],                           result:{ id:I.STONE_SHOVEL,    count:1 } },
  { name:'Pá Ferro',          grid:[[0,I.IRON_INGOT,0],[0,I.STICK,0],[0,I.STICK,0]],                            result:{ id:I.IRON_SHOVEL,     count:1 } },
  { name:'Pá Diamante',       grid:[[0,I.DIAMOND,0],[0,I.STICK,0],[0,I.STICK,0]],                               result:{ id:I.DIAMOND_SHOVEL,  count:1 } },

  { name:'Espada Madeira',    grid:[[B.WOOD],[B.WOOD],[I.STICK]],                                                result:{ id:I.WOOD_SWORD,      count:1 } },
  { name:'Espada Pedra',      grid:[[B.COBBLESTONE],[B.COBBLESTONE],[I.STICK]],                                  result:{ id:I.STONE_SWORD,     count:1 } },
  { name:'Espada Ferro',      grid:[[I.IRON_INGOT],[I.IRON_INGOT],[I.STICK]],                                   result:{ id:I.IRON_SWORD,      count:1 } },
  { name:'Espada Diamante',   grid:[[I.DIAMOND],[I.DIAMOND],[I.STICK]],                                          result:{ id:I.DIAMOND_SWORD,   count:1 } },
];

// ─── Receitas da fornalha ─────────────────────────────────────────────────────
export const SMELT_RECIPES = [
  { input: I.RAW_IRON, fuel: I.COAL, result: { id: I.IRON_INGOT, count:1 } },
  { input: I.RAW_GOLD, fuel: I.COAL, result: { id: I.GOLD_INGOT, count:1 } },
];

// ─── Matcher ─────────────────────────────────────────────────────────────────

/** Remove linhas/colunas completamente vazias (zeros). Retorna null se grelha vazia. */
function compact(grid) {
  const R = grid.length, C = grid[0].length;
  let r0=R, r1=-1, c0=C, c1=-1;
  for (let r=0;r<R;r++) for (let c=0;c<C;c++) {
    if (grid[r][c]) { r0=Math.min(r0,r); r1=Math.max(r1,r); c0=Math.min(c0,c); c1=Math.max(c1,c); }
  }
  if (r1<0) return null;
  return grid.slice(r0,r1+1).map(row => row.slice(c0,c1+1));
}

function gridsEq(a, b) {
  if (!a || !b || a.length!==b.length) return false;
  for (let r=0;r<a.length;r++) {
    if (a[r].length!==b[r].length) return false;
    for (let c=0;c<a[r].length;c++) if (a[r][c]!==b[r][c]) return false;
  }
  return true;
}

/**
 * Dada uma grelha de crafting (array de arrays de IDs, 0=vazio),
 * retorna { id, count } ou null.
 */
export function matchRecipe(grid) {
  const cg = compact(grid);
  if (!cg) return null;
  for (const rec of RECIPES) {
    const cr = compact(rec.grid);
    if (gridsEq(cg, cr)) return { ...rec.result };
  }
  return null;
}

/**
 * Consome os ingredientes da grelha.
 * Cada slot da grelha é { id, count } | null.
 * Decrementa 1 de cada slot não vazio.
 */
export function consumeIngredients(slots) {
  for (let i=0; i<slots.length; i++) {
    if (!slots[i]) continue;
    slots[i].count--;
    if (slots[i].count<=0) slots[i]=null;
  }
}
