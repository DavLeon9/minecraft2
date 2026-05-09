const express       = require('express');
const http          = require('http');
const { Server }    = require('socket.io');
const path          = require('path');
const WorldDatabase = require('./database');
const { generateWorld, BLOCK } = require('./worldGen');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT   = process.env.PORT || 3000;
const W = 128, D = 128, H = 64;
const NICK_RE = /^[a-zA-Z0-9_]{2,16}$/;

// ─── HTTP + Socket.io ─────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '../client')));

// ─── Mundo ────────────────────────────────────────────────────────────────────
const db        = new WorldDatabase();
let   worldData = generateWorld(W, D, H);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function idx(x, y, z) { return x + z * W + y * W * D; }
function inBounds(x, y, z) { return x>=0&&x<W && y>=0&&y<H && z>=0&&z<D; }

const savedChanges = db.loadChanges();
for (const { x, y, z, type } of savedChanges) {
  worldData[idx(x, y, z)] = type;
}
console.log(`🌍 Mundo pronto (${W}×${D}×${H}) — ${savedChanges.length} bloco(s) restaurado(s)`);

// ─── Jogadores ────────────────────────────────────────────────────────────────
const players = new Map(); // socketId → { x, y, z, rotY, moving, name }

function findSurfaceY(x, z) {
  const bx = Math.max(0, Math.min(W - 1, Math.floor(x)));
  const bz = Math.max(0, Math.min(D - 1, Math.floor(z)));
  for (let y = H - 1; y >= 0; y--) {
    const b = worldData[idx(bx, y, bz)];
    if (b !== BLOCK.AIR && b !== BLOCK.LEAVES) return y + 1;
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

// ─── Mobs ─────────────────────────────────────────────────────────────────────
// Drops: item IDs matching client/js/items.js (food IDs 300-305)
const MOB_DATA = {
  1: { name:'Zombie',       maxHp:10, damage:3,  speed:2.5, hostile:true,  aggroR:16, atkR:2.0, atkI:1.5, drops:[] },
  2: { name:'Zombie Líder', maxHp:20, damage:5,  speed:3.0, hostile:true,  aggroR:20, atkR:2.2, atkI:1.2, drops:[] },
  3: { name:'Esqueleto',    maxHp:8,  damage:2,  speed:3.2, hostile:true,  aggroR:18, atkR:6.0, atkI:2.0, drops:[] },
  4: { name:'Creeper',      maxHp:10, damage:10, speed:2.8, hostile:true,  aggroR:16, atkR:2.5, atkI:3.0, drops:[] },
  5: { name:'Porco',        maxHp:10, damage:0,  speed:1.8, hostile:false, drops:[{id:300,count:2}] },
  6: { name:'Vaca',         maxHp:10, damage:0,  speed:1.8, hostile:false, drops:[{id:302,count:2}] },
  7: { name:'Galinha',      maxHp:4,  damage:0,  speed:2.0, hostile:false, drops:[{id:304,count:1}] },
};

const mobs = new Map();
let nextMobId = 1;

// Server-side day/night (same formula as client)
let serverDayTime = 0.25;
const DAY_DURATION = 480; // seconds
let lastMobTick = Date.now();

function isServerDay() {
  const angle = serverDayTime * Math.PI * 2 - Math.PI / 2;
  return Math.sin(angle + Math.PI / 2) > 0;
}

function spawnMob(type, x, y, z) {
  const d = MOB_DATA[type];
  if (!d) return;
  const id = nextMobId++;
  const mob = {
    id, type, x, y, z,
    hp: d.maxHp, maxHp: d.maxHp,
    rotY: Math.random() * Math.PI * 2,
    velX: 0, velZ: 0,
    kbX: 0, kbZ: 0,          // knockback impulse
    moveTimer: Math.random() * 3,
    attackTimer: 0,
    targetSid: null,
  };
  mobs.set(id, mob);
  io.emit('mob:spawn', { id, type, x, y, z, rotY: mob.rotY });
  return mob;
}

function tickMobs(dt) {
  const day = isServerDay();
  const updates = [];

  for (const [id, mob] of mobs) {
    const d = MOB_DATA[mob.type];

    // Hostile mobs burn in daylight (2 HP/s)
    if (d.hostile && day) {
      mob.hp -= dt * 2;
      if (mob.hp <= 0) { io.emit('mob:die', { id, drops:[], x:mob.x, y:mob.y, z:mob.z }); mobs.delete(id); continue; }
    }

    // Find nearest player
    let nearSid = null, nearDist = Infinity, nearX = 0, nearZ = 0;
    for (const [sid, p] of players) {
      const dx = p.x - mob.x, dz = p.z - mob.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < nearDist) { nearDist = dist; nearSid = sid; nearX = p.x; nearZ = p.z; }
    }

    let moved = false;

    // Aplicar knockback (decai rapidamente)
    if (mob.kbX !== 0 || mob.kbZ !== 0) {
      mob.x += mob.kbX * dt;
      mob.z += mob.kbZ * dt;
      mob.kbX *= Math.pow(0.05, dt); // decai em ~0.2s
      mob.kbZ *= Math.pow(0.05, dt);
      if (Math.abs(mob.kbX) < 0.05) mob.kbX = 0;
      if (Math.abs(mob.kbZ) < 0.05) mob.kbZ = 0;
      mob.x = Math.max(0.5, Math.min(W - 0.5, mob.x));
      mob.z = Math.max(0.5, Math.min(D - 0.5, mob.z));
      moved = true;
    }

    if (d.hostile && !day && nearSid && nearDist < (d.aggroR || 16)) {
      // Chase player
      const dx = nearX - mob.x, dz = nearZ - mob.z;
      mob.rotY = Math.atan2(dx, dz);
      if (nearDist > (d.atkR || 2.0)) {
        mob.x += (dx / nearDist) * d.speed * dt;
        mob.z += (dz / nearDist) * d.speed * dt;
        mob.x  = Math.max(0.5, Math.min(W - 0.5, mob.x));
        mob.z  = Math.max(0.5, Math.min(D - 0.5, mob.z));
        moved  = true;
      }
      // Attack
      mob.attackTimer += dt;
      if (nearDist < (d.atkR || 2.0) && mob.attackTimer >= (d.atkI || 1.5)) {
        mob.attackTimer = 0;
        const sock = io.sockets.sockets.get(nearSid);
        if (sock) sock.emit('player:damage', { amount: d.damage, sourceName: d.name, sourceType: mob.type });
      }
    } else {
      // Wander
      mob.moveTimer -= dt;
      if (mob.moveTimer <= 0) {
        mob.moveTimer = 2 + Math.random() * 3;
        if (Math.random() < 0.6) {
          mob.rotY = Math.random() * Math.PI * 2;
          mob.velX = Math.sin(mob.rotY) * d.speed * 0.4;
          mob.velZ = Math.cos(mob.rotY) * d.speed * 0.4;
        } else { mob.velX = 0; mob.velZ = 0; }
      }
      if (mob.velX !== 0 || mob.velZ !== 0) {
        mob.x += mob.velX * dt;
        mob.z += mob.velZ * dt;
        mob.x  = Math.max(0.5, Math.min(W - 0.5, mob.x));
        mob.z  = Math.max(0.5, Math.min(D - 0.5, mob.z));
        moved  = true;
      }
    }

    if (moved) mob.y = findSurfaceY(Math.floor(mob.x), Math.floor(mob.z));
    updates.push({ id: mob.id, x: mob.x, y: mob.y, z: mob.z, rotY: mob.rotY });
  }

  if (updates.length) io.emit('mob:batch', updates);
}

function trySpawnMobs() {
  if (!players.size || mobs.size >= 60) return;
  const night = !isServerDay();

  for (const [, player] of players) {
    let nearHostile = 0, nearPassive = 0;
    for (const mob of mobs.values()) {
      const dx = mob.x - player.x, dz = mob.z - player.z;
      if (Math.sqrt(dx*dx + dz*dz) < 40) {
        if (MOB_DATA[mob.type].hostile) nearHostile++; else nearPassive++;
      }
    }

    const angle = Math.random() * Math.PI * 2;
    const r     = 15 + Math.random() * 10;
    const sx    = Math.max(2, Math.min(W - 2, Math.floor(player.x + Math.cos(angle) * r)));
    const sz    = Math.max(2, Math.min(D - 2, Math.floor(player.z + Math.sin(angle) * r)));
    const sy    = findSurfaceY(sx, sz);
    if (sy < 2) continue;

    if (night && nearHostile < 8) {
      const rnd  = Math.random();
      const type = rnd < 0.35 ? 1 : rnd < 0.52 ? 2 : rnd < 0.78 ? 3 : 4;
      spawnMob(type, sx + 0.5, sy, sz + 0.5);
    }
    if (nearPassive < 6) {
      const type = Math.random() < 0.38 ? 5 : Math.random() < 0.55 ? 6 : 7;
      spawnMob(type, sx + 0.5, sy, sz + 0.5);
    }
  }
}

// Mob tick 100ms
setInterval(() => {
  const now = Date.now();
  const dt  = Math.min((now - lastMobTick) / 1000, 0.15);
  lastMobTick = now;
  serverDayTime = (serverDayTime + dt / DAY_DURATION) % 1;
  if (players.size > 0) tickMobs(dt);
}, 100);

// Spawn attempt every 5s
setInterval(trySpawnMobs, 5000);

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const nick = (socket.handshake.auth.nick ?? '').trim();

  if (!NICK_RE.test(nick)) {
    socket.emit('login:error', { message: 'Nick inválido. Usa 2–16 caracteres (letras, números, _).' });
    socket.disconnect(true); return;
  }
  if (nickTaken(nick)) {
    socket.emit('login:error', { message: `O nick "${nick}" já está a ser usado. Escolhe outro.` });
    socket.disconnect(true); return;
  }

  socket.emit('login:ok');
  console.log(`✅ ${nick} (${socket.id}) entrou`);

  const spawnX = W / 2 + 0.5, spawnZ = D / 2 + 0.5;
  const spawnY = findSurfaceY(spawnX, spawnZ);
  const playerData = { x: spawnX, y: spawnY + 1.7, z: spawnZ, rotY: 0, moving: false, name: nick };
  players.set(socket.id, playerData);

  socket.emit('world:init', { width: W, depth: D, height: H, data: Array.from(worldData), spawnX, spawnY, spawnZ });

  // Jogadores existentes
  const existing = [];
  players.forEach((p, id) => { if (id !== socket.id) existing.push({ id, ...p }); });
  socket.emit('players:list', existing);

  // Mobs existentes
  if (mobs.size > 0) {
    socket.emit('mob:init', [...mobs.values()].map(m => ({ id:m.id, type:m.type, x:m.x, y:m.y, z:m.z, rotY:m.rotY })));
  }

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
    type = Math.max(1, Math.min(13, type|0));
    worldData[idx(x, y, z)] = type;
    db.saveBlock(x, y, z, type);
    io.emit('block:update', { x, y, z, type });
  });

  // ── Atacar mob ─────────────────────────────────────────────────────────────
  socket.on('mob:attack', ({ mobId, damage }) => {
    const mob = mobs.get(mobId);
    const p   = players.get(socket.id);
    if (!mob || !p) return;
    const dx = mob.x - p.x, dz = mob.z - p.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > 7) return; // cheat guard
    const dmg = Math.max(1, Math.min(9, damage | 0));
    mob.hp -= dmg;

    // Knockback: empurra o mob para longe do jogador
    const len = dist || 1;
    mob.kbX = (dx / len) * 7;
    mob.kbZ = (dz / len) * 7;

    if (mob.hp <= 0) {
      const d = MOB_DATA[mob.type];
      io.emit('mob:die', { id: mobId, drops: d.drops || [], x: mob.x, y: mob.y, z: mob.z });
      io.emit('chat:kill', { player: nick, killedBy: d.name, type: 'mob_kill' });
      mobs.delete(mobId);
    } else {
      io.emit('mob:hit', { id: mobId }); // clientes piscam o mob a vermelho
    }
  });

  // ── PvP ────────────────────────────────────────────────────────────────────
  socket.on('pvp:attack', ({ targetId, damage }) => {
    const atk = players.get(socket.id);
    const tgt = players.get(targetId);
    if (!atk || !tgt) return;
    const dx = tgt.x - atk.x, dz = tgt.z - atk.z;
    if (Math.sqrt(dx*dx + dz*dz) > 7) return;
    const dmg = Math.max(1, Math.min(9, damage | 0));
    const targetSock = io.sockets.sockets.get(targetId);
    if (targetSock) targetSock.emit('player:damage', { amount: dmg, sourceName: nick, sourceType: 'player' });
  });

  // ── Morte do jogador ───────────────────────────────────────────────────────
  socket.on('player:died', ({ killedByName }) => {
    io.emit('chat:kill', { player: nick, killedBy: killedByName, type: 'player_death' });
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
