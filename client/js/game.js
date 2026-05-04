import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { World, WorldRenderer }   from './world.js';
import { PlayerController }        from './player.js';
import { Network }                 from './network.js';
import { PlayerAvatar }            from './avatar.js';
import { PLAYER_EYE_Y }            from './constants.js';

export class Game {
  constructor() {
    this.renderer      = null;
    this.labelRenderer = null;   // CSS2DRenderer para nicks flutuantes
    this.scene         = null;
    this.camera        = null;
    this.clock         = new THREE.Clock(false);

    this.world         = new World();
    this.network       = new Network();
    this.worldRenderer = null;
    this.player        = null;
    this.localNick     = '';

    // Outros jogadores: Map<socketId, PlayerAvatar>
    this.avatars       = new Map();

    this.ready         = false;
    this._frameCount   = 0;
    this._fpsTimer     = 0;
  }

  // ── Inicialização (sem ligar ao servidor ainda) ────────────────────────────

  init() {
    this._initRenderer();
    this._initScene();
    this._registerNetworkHandlers(); // regista handlers ANTES de connect()
    window.addEventListener('resize', () => this._onResize());
  }

  _initRenderer() {
    // WebGL
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    document.body.prepend(this.renderer.domElement);

    // CSS2D (nicks flutuantes)
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.cssText =
      'position:fixed;top:0;left:0;pointer-events:none;z-index:5;';
    document.body.appendChild(this.labelRenderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog         = new THREE.Fog(0x87ceeb, 45, 95);

    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.05, 200
    );

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const sun = new THREE.DirectionalLight(0xfffde7, 0.85);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top   =  70;
    sc.near = 0.5; sc.far = 180;
    sun.shadow.mapSize.setScalar(2048);
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xadd8e6, 0.25);
    fill.position.set(-20, 10, -20);
    this.scene.add(fill);
  }

  // ── Handlers de rede (registados antes de connect) ────────────────────────

  _registerNetworkHandlers() {
    const { network } = this;

    network.on('world:init', (data) => {
      this.world.load(data);

      this.worldRenderer = new WorldRenderer(this.scene, this.world);
      this.worldRenderer.build();

      this.player = new PlayerController(
        this.camera, this.scene, this.world, network,
        () => this.worldRenderer.rebuild()
      );
      this.player.setSpawn(data.spawnX, data.spawnY, data.spawnZ);

      // Pointer lock — pausa/retoma
      const btnPlay = document.getElementById('btn-play');
      btnPlay.style.display = 'block';

      btnPlay.addEventListener('click', () => this.player.controls.lock());

      this.player.controls.addEventListener('lock', () => {
        document.getElementById('overlay').style.display = 'none';
      });
      this.player.controls.addEventListener('unlock', () => {
        document.getElementById('overlay').style.display = 'flex';
        document.getElementById('overlay-msg').textContent = 'Clica para continuar';
      });

      this.ready = true;
    });

    network.on('players:list', (list) => {
      list.forEach(p => this._addAvatar(p.id, p));
      this._updatePlayerCount();
    });

    network.on('player:join', (p) => {
      this._addAvatar(p.id, p);
      this._updatePlayerCount();
    });

    network.on('player:leave', ({ id }) => {
      this._removeAvatar(id);
      this._updatePlayerCount();
    });

    network.on('player:move', ({ id, x, y, z, rotY, moving }) => {
      const avatar = this.avatars.get(id);
      if (!avatar) return;
      avatar.update(x, y - PLAYER_EYE_Y, z, rotY, moving);
    });

    network.on('block:update', ({ x, y, z, type }) => {
      this.world.setBlock(x, y, z, type);
      if (this.worldRenderer) this.worldRenderer.rebuild();
    });

    network.on('disconnect', () => {
      document.getElementById('overlay').style.display = 'flex';
      document.getElementById('overlay-msg').textContent =
        'Desconectado. Recarrega a página.';
      document.getElementById('btn-play').style.display = 'none';
    });
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  /**
   * Chamado pelo main.js quando o utilizador submete o nick.
   * Liga ao servidor e aguarda confirmação.
   */
  async login(nick) {
    this.localNick = nick;
    localStorage.setItem('mc2_nick', nick);
    document.getElementById('info-nick').textContent = `👤 ${nick}`;

    await this.network.connect(nick); // pode lançar Error se nick duplicado
  }

  /** Arranca o loop de renderização (chamado após login bem-sucedido). */
  start() {
    this.clock.start();
    this._loop();
  }

  // ── Avatares dos outros jogadores ─────────────────────────────────────────

  _addAvatar(id, data) {
    if (this.avatars.has(id)) return;
    const avatar = new PlayerAvatar(this.scene, this.labelRenderer, data.name);
    avatar.update(data.x, data.y - PLAYER_EYE_Y, data.z, data.rotY ?? 0, false);
    this.avatars.set(id, avatar);
  }

  _removeAvatar(id) {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    avatar.dispose(this.scene);
    this.avatars.delete(id);
  }

  _updatePlayerCount() {
    document.getElementById('info-players').textContent =
      `Jogadores: ${this.avatars.size + 1}`;
  }

  // ── Game loop ─────────────────────────────────────────────────────────────

  start() {
    this.clock.start();
    this._loop();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.ready && this.player) {
      this.player.update(dt);

      // Animação dos avatares remotos
      for (const avatar of this.avatars.values()) {
        avatar.animate(dt);
      }
    }

    // FPS
    this._frameCount++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 1.0) {
      document.getElementById('info-fps').textContent = `FPS: ${this._frameCount}`;
      this._frameCount = 0;
      this._fpsTimer   = 0;
    }

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
  }
}
