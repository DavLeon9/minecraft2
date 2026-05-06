/**
 * Inventário do jogador — 36 slots: 0-8 = hotbar, 9-35 = armazenamento.
 * Cada slot: { id: number, count: number } | null
 */
import { getItemInfo } from './items.js';

export const HOTBAR_SIZE   = 9;
export const STORAGE_SIZE  = 27;
export const TOTAL_SLOTS   = HOTBAR_SIZE + STORAGE_SIZE;

export class Inventory {
  constructor() {
    this.slots = new Array(TOTAL_SLOTS).fill(null);
    this.onChanged = null; // callback para re-render
  }

  // ── Acesso ───────────────────────────────────────────────────────────────

  getSlot(i)    { return this.slots[i]; }
  getHotbar(i)  { return this.slots[i]; }

  // ── Adicionar itens ───────────────────────────────────────────────────────

  /**
   * Tenta adicionar `count` unidades do item `id`.
   * Empilha em stacks existentes primeiro; depois procura slot vazio.
   * Retorna o que não coube (normalmente 0).
   */
  addItem(id, count) {
    const info = getItemInfo(id);
    const max  = info.max ?? 64;
    let remaining = count;

    // 1. Empilhar em stacks existentes do mesmo tipo
    for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max) {
        const room = max - s.count;
        const take = Math.min(room, remaining);
        s.count   += take;
        remaining -= take;
      }
    }

    // 2. Slots vazios
    for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, remaining);
        this.slots[i] = { id, count: take };
        remaining    -= take;
      }
    }

    if (count !== remaining) this._changed();
    return remaining; // não coube
  }

  /**
   * Remove `count` unidades do slot `i`.
   * Retorna true se teve sucesso.
   */
  removeFromSlot(i, count = 1) {
    const s = this.slots[i];
    if (!s || s.count < count) return false;
    s.count -= count;
    if (s.count <= 0) this.slots[i] = null;
    this._changed();
    return true;
  }

  /** Substitui o conteúdo de um slot. */
  setSlot(i, item) {
    this.slots[i] = item ? { ...item } : null;
    this._changed();
  }

  /** Troca dois slots. */
  swapSlots(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    this._changed();
  }

  _changed() { if (this.onChanged) this.onChanged(); }
}
