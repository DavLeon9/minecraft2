/**
 * Persistência via ficheiro JSON — sem dependências nativas.
 * Guarda apenas os blocos modificados (diferenças face ao terreno gerado).
 * Leitura: em memória (Map). Escrita: sincronizada em cada alteração.
 */
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'world-changes.json');

class WorldDatabase {
  constructor() {
    // Map com chave "x,y,z" → { x, y, z, type }
    this._changes = new Map();
    this._load();
    console.log(`💾 DB: ${this._changes.size} alterações carregadas de ${DATA_FILE}`);
  }

  _load() {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const arr = JSON.parse(raw);
      for (const entry of arr) {
        this._changes.set(`${entry.x},${entry.y},${entry.z}`, entry);
      }
    } catch {
      // Ficheiro não existe ainda → mundo fresco
    }
  }

  _persist() {
    const arr = Array.from(this._changes.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr));
  }

  /** Guarda uma alteração de bloco (type=0 = ar = bloco destruído). */
  saveBlock(x, y, z, type) {
    this._changes.set(`${x},${y},${z}`, { x, y, z, type });
    this._persist();
  }

  /** Devolve todos os blocos modificados face ao terreno original. */
  loadChanges() {
    return Array.from(this._changes.values());
  }
}

module.exports = WorldDatabase;
