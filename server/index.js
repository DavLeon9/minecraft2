const express       = require('express');
const http          = require('http');
const { Server }    = require('socket.io');
const path          = require('path');
const WorldDatabase = require('./database');
const { generateWorld, BLOCK } = require('./worldGen');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT   = process.env.PORT || 3000;
const W = 64, D = 64, H = 32;
const NICK_RE = /^[a-zA-Z0-9_]{2,16}$/;

// ─── HTTP + Socket.io ─────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '../client')));

// ─── Mundo ────────────────────────────────────────────────────────────────────
const db        = new WorldDatabase();
let   worldData = generateWorld(W, D, H);

const savedChanges = db.loadChanges();
for (const { x, y, z, type } of savedChanges) {
  worldData[idx(x, y, z)] = type;
}
console.log(`🌍 Mundo pronto (${W}×${D}×${H}) — ${savedChanges.length} bloco(s) restaurado(s)`);

// ─── Jogadores ────────────────────────────────────────────────────────────────
// Map<socketId, { x, y, z, rotY, moving, name }>
const players = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function idx(x, y, z) { return x + z * W + y * W * D; }
function inBounds(x, y, z) { return x>=0&&x<W && y>=0&&y<H && z>=0&&z<D; }

function findSurfaceY(x, z) {
  const bx = Math.max(0, Math.min(W - 1, Math.floor(x)));
  const bz = Math.max(0, Math.min(D - 1, Math.floor(z)));
  for (let y = H - 1; y >= 0; y--) {
    if (worldData[idx(bx, y, bz)] !== BLOCK.AIR) return y + 1;
  }
  return Math.floor(H / 2);
}

function nickTaken(nick) {
  const lower = nick.toLowerCase();
  for (const p of players.values()) {
    if (p.name.toLowerCase() === lower) return true;
  }
  return false;
}

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const nick = (socket.handshake.auth.nick ?? '').trim();

  // ── Validação do nick ──────────────────────────────────────────────────────
  if (!NICK_RE.test(nick)) {
    socket.emit('login:error', { message: 'Nick inválido. Usa 2–16 caracteres (letras, números, _).' });
    socket.disconnect(true);
    return;
  }

  if (nickTaken(nick)) {
    socket.emit('login:error', { message: `O nick "${nick}" já está a ser usado. Escolhe outro.` });
    socket.disconnect(true);
    return;
  }

  // ── Login OK ───────────────────────────────────────────────────────────────
  socket.emit('login:ok');
  console.log(`✅ ${nick} (${socket.id}) entrou`);

  // Calcula spawn
  const spawnX = W / 2 + 0.5;
  const spawnZ = D / 2 + 0.5;
  const spawnY = findSurfaceY(spawnX, spawnZ);

  // Regista jogador
  const playerData = { x: spawnX, y: spawnY + 1.7, z: spawnZ, rotY: 0, moving: false, name: nick };
  players.set(socket.id, playerData);

  // Envia mundo
  socket.emit('world:init', {
    width: W, depth: D, height: H,
    data: Array.from(worldData),
    spawnX, spawnY, spawnZ,
  });

  // Envia lista dos jogadores já presentes
  const existing = [];
  players.forEach((p, id) => {
    if (id !== socket.id) existing.push({ id, ...p });
  });
  socket.emit('players:list', existing);

  // Anuncia chegada aos outros
  socket.broadcast.emit('player:join', { id: socket.id, ...playerData });

  // ── Movimento ──────────────────────────────────────────────────────────────
  socket.on('player:move', ({ x, y, z, rotY, moving }) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = x; p.y = y; p.z = z; p.rotY = rotY; p.moving = !!moving;
    socket.broadcast.emit('player:move', { id: socket.id, x, y, z, rotY, moving: p.moving });
  });

  // ── Quebrar bloco ──────────────────────────────────────────────────────────
  socket.on('block:break', ({ x, y, z }) => {
    x=x|0; y=y|0; z=z|0;
    if (!inBounds(x, y, z)) return;
    worldData[idx(x, y, z)] = BLOCK.AIR;
    db.saveBlock(x, y, z, BLOCK.AIR);
    io.emit('block:update', { x, y, z, type: BLOCK.AIR });
  });

  // ── Colocar bloco ──────────────────────────────────────────────────────────
  socket.on('block:place', ({ x, y, z, type }) => {
    x=x|0; y=y|0; z=z|0;
    if (!inBounds(x, y, z)) return;
    if (worldData[idx(x, y, z)] !== BLOCK.AIR) return;
    type = Math.max(1, Math.min(4, type|0));
    worldData[idx(x, y, z)] = type;
    db.saveBlock(x, y, z, type);
    io.emit('block:update', { x, y, z, type });
  });

  // ── Desconexão ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`❌ ${nick} (${socket.id}) saiu`);
    players.delete(socket.id);
    io.emit('player:leave', { id: socket.id });
  });
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`✅ Servidor a correr → http://localhost:${PORT}`);
});
