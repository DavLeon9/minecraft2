import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ─── Deterministic colour from nick ──────────────────────────────────────────
function hashNick(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = Math.imul((h << 5) + h, 1) ^ name.charCodeAt(i);
  return Math.abs(h);
}

// ─── PlayerAvatar ─────────────────────────────────────────────────────────────
/**
 * Corpo tipo Steve — proporciones Minecraft correctas.
 *
 * Hierarquia (root = pés no mundo):
 *   root
 *   ├── leftLeg  (Group pivot na anca, y=0.76)
 *   ├── rightLeg (Group pivot na anca, y=0.76)
 *   ├── torsoGroup (Group, y=0.76)
 *   │   ├── torso mesh
 *   │   ├── leftArm  (Group pivot no ombro, y=0.62 relativo ao torsoGroup)
 *   │   └── rightArm (Group pivot no ombro, y=0.62 relativo ao torsoGroup)
 *   └── headGroup (Group pivot no pescoço, y=1.38)
 *       ├── head mesh
 *       ├── cap/hair mesh
 *       └── eyes
 */
export class PlayerAvatar {
  constructor(scene, labelRenderer, nick) {
    this.nick    = nick;
    this._moving = false;
    this._phase  = Math.random() * Math.PI * 2;  // animação desfasada entre jogadores

    this._buildMesh(scene, nick);
  }

  _buildMesh(scene, nick) {
    const hash = hashNick(nick);
    const hue  = (hash % 360) / 360;

    // ── Materiais ────────────────────────────────────────────────────────────
    const skinColor  = new THREE.Color().setHSL(0.07, 0.55, 0.66);   // tom de pele quente
    const shirtColor = new THREE.Color().setHSL(hue,  0.72, 0.45);   // cor do nick
    const pantsColor = new THREE.Color().setHSL(0.62, 0.55, 0.22);   // ganga azul-escura
    const shoeColor  = new THREE.Color(0x1a1008);                      // sapatos escuros
    const capColor   = new THREE.Color().setHSL(hue,  0.60, 0.28);   // boné mais escuro
    const eyeColor   = new THREE.Color(0x181818);

    const skinMat  = lMat(skinColor);
    const shirtMat = lMat(shirtColor);
    const pantsMat = lMat(pantsColor);
    const shoeMat  = lMat(shoeColor);
    const capMat   = lMat(capColor);
    const eyeMat   = lMat(eyeColor);

    // ── Root (origem = pés) ──────────────────────────────────────────────────
    this.root = new THREE.Group();

    // ── Pernas (pivot na anca = y:0.76) ─────────────────────────────────────
    this.leftLeg  = new THREE.Group();
    this.rightLeg = new THREE.Group();

    for (const [legGroup, side] of [[this.leftLeg, 1], [this.rightLeg, -1]]) {
      // Coxa (upper leg) — calças
      const thigh = mesh(0.26, 0.42, 0.26, pantsMat);
      thigh.position.y = -0.21;               // centro da coxa (desce da anca)

      // Canela (lower leg) — calças
      const shin = mesh(0.24, 0.34, 0.24, pantsMat);
      shin.position.y  = -0.42 - 0.17;       // abaixo da coxa

      // Sapato — ligeiramente maior e avança para a frente
      const shoe = mesh(0.28, 0.12, 0.32, shoeMat);
      shoe.position.set(0, -0.42 - 0.34 - 0.06, 0.03);

      legGroup.add(thigh, shin, shoe);
      legGroup.position.set(side * 0.135, 0.76, 0);
    }

    // ── Tronco (Group pivot na cintura = y:0.76) ─────────────────────────────
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.76, 0);

    const torsoMesh = mesh(0.50, 0.62, 0.28, shirtMat);
    torsoMesh.position.y = 0.31;  // centro do tronco (0.62/2)

    // Cinto fino
    const belt = mesh(0.52, 0.07, 0.30, pantsMat);
    belt.position.y = 0.035;

    this.torsoGroup.add(torsoMesh, belt);

    // ── Braços (Group pivot no ombro, relativo ao torsoGroup) ───────────────
    this.leftArm  = new THREE.Group();
    this.rightArm = new THREE.Group();

    for (const [armGroup, side] of [[this.leftArm, 1], [this.rightArm, -1]]) {
      // Braço superior — camisa
      const upper = mesh(0.24, 0.35, 0.24, shirtMat);
      upper.position.y = -0.175;

      // Antebraço — pele
      const lower = mesh(0.22, 0.28, 0.22, skinMat);
      lower.position.y = -0.35 - 0.14;

      // Mão — pele
      const hand = mesh(0.22, 0.14, 0.22, skinMat);
      hand.position.y = -0.35 - 0.28 - 0.07;

      armGroup.add(upper, lower, hand);
      // Posição relativa ao torsoGroup: ombro fica no topo do tronco (y=0.62)
      armGroup.position.set(side * 0.37, 0.62, 0);
    }
    this.torsoGroup.add(this.leftArm, this.rightArm);

    // ── Cabeça (Group pivot no pescoço = y:1.38 no root) ────────────────────
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.38, 0);

    // Rosto (pele)
    const headMesh = mesh(0.50, 0.50, 0.50, skinMat);
    headMesh.position.y = 0.25;  // centro da cabeça

    // Boné / cabelo (sobreposto à cabeça, um pouco maior no topo)
    const cap = mesh(0.52, 0.24, 0.52, capMat);
    cap.position.y = 0.38;  // topo da cabeça

    // Olhos (dois pequenos cubos na frente)
    const eyeGeo = new THREE.BoxGeometry(0.11, 0.08, 0.02);
    const leftEye  = new THREE.Mesh(eyeGeo, eyeMat);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set( 0.12, 0.28, 0.261);
    rightEye.position.set(-0.12, 0.28, 0.261);

    // Sobrancelhas (fio muito fino acima dos olhos)
    const browGeo = new THREE.BoxGeometry(0.13, 0.04, 0.02);
    const browMat = lMat(capColor);
    const lBrow = new THREE.Mesh(browGeo, browMat);
    const rBrow = new THREE.Mesh(browGeo, browMat);
    lBrow.position.set( 0.12, 0.35, 0.261);
    rBrow.position.set(-0.12, 0.35, 0.261);

    // Nariz (mini cubo central)
    const noseGeo = new THREE.BoxGeometry(0.06, 0.06, 0.03);
    const noseMesh = new THREE.Mesh(noseGeo, lMat(skinColor.clone().multiplyScalar(0.85)));
    noseMesh.position.set(0, 0.20, 0.266);

    this.headGroup.add(headMesh, cap, leftEye, rightEye, lBrow, rBrow, noseMesh);

    // Nick flutuante
    this._buildLabel(nick);

    // ── Sombras ──────────────────────────────────────────────────────────────
    this.root.traverse(obj => {
      if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = false; }
    });

    // ── Montar hierarquia ────────────────────────────────────────────────────
    this.root.add(this.leftLeg, this.rightLeg, this.torsoGroup, this.headGroup);
    scene.add(this.root);
  }

  _buildLabel(nick) {
    const div = document.createElement('div');
    div.textContent = nick;
    div.style.cssText = `
      background: rgba(0,0,0,0.55);
      color: #fff;
      font: bold 12px 'Courier New', monospace;
      padding: 2px 6px;
      border-radius: 3px;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
      text-shadow: 1px 1px 0 #000;
    `;
    this._label = new CSS2DObject(div);
    this._label.position.set(0, 0.40, 0);  // acima do boné
    this.headGroup.add(this._label);
  }

  // ── API pública ───────────────────────────────────────────────────────────

  /** Actualiza posição (y = feet Y em world space). */
  update(x, y, z, rotY, moving) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = rotY;
    this._moving = !!moving;
  }

  /** Chamado a cada frame — anima membros. */
  animate(dt) {
    if (this._moving) {
      this._phase += dt * 7.5;
    } else {
      this._phase *= 0.80;  // regresso suave à pose neutra
    }

    const swing = Math.sin(this._phase) * 0.48;

    // Braços opostos às pernas (marcha natural)
    this.leftArm.rotation.x  =  swing;
    this.rightArm.rotation.x = -swing;
    this.leftLeg.rotation.x  = -swing;
    this.rightLeg.rotation.x =  swing;

    // Ligeiro balanço lateral da cabeça ao caminhar
    this.headGroup.rotation.z = Math.sin(this._phase * 0.5) * 0.035;

    // Bob vertical do tronco ao caminhar
    this.torsoGroup.position.y = 0.76 + Math.abs(Math.sin(this._phase)) * 0.018;
  }

  /** Remove da cena e liberta memória. */
  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function lMat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function mesh(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}
