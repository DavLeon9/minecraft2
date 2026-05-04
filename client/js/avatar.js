import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ─── Proporções do corpo (escala Minecraft) ───────────────────────────────────
const DIMS = {
  head:   [0.50, 0.50, 0.50],
  torso:  [0.50, 0.75, 0.25],
  arm:    [0.22, 0.70, 0.22],
  leg:    [0.22, 0.70, 0.22],
};

// Alturas relativas ao pé (y=0 = base dos pés)
const Y = {
  legBot:  0,
  legTop:  0.70,
  torsoBot:0.70,
  torsoTop:1.45,
  headBot: 1.45,
  headTop: 1.95,
};

// ─── Cor determinística a partir do nick ──────────────────────────────────────
function nickColor(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h) ^ name.charCodeAt(i);
  const hue = Math.abs(h) % 360;
  return new THREE.Color().setHSL(hue / 360, 0.72, 0.52);
}

function makeMat(color, lightness = 0) {
  const c = color.clone();
  c.offsetHSL(0, 0, lightness);
  return new THREE.MeshLambertMaterial({ color: c });
}

// ─── PlayerAvatar ─────────────────────────────────────────────────────────────
/**
 * Corpo tipo "Steve" construído com BoxGeometry.
 * Estrutura:
 *   root (posição dos pés no mundo)
 *   ├── leftLeg
 *   ├── rightLeg
 *   ├── torso
 *   │   ├── leftArm
 *   │   └── rightArm
 *   └── head
 *        └── [CSS2DObject com nick]
 */
export class PlayerAvatar {
  constructor(scene, labelRenderer, nick) {
    this.nick    = nick;
    this._moving = false;
    this._phase  = Math.random() * Math.PI * 2; // fase aleatória para variar animação
    this._color  = nickColor(nick);

    this._buildMesh(scene, nick);
  }

  _buildMesh(scene, nick) {
    const col  = this._color;
    const skinMat  = makeMat(col, 0);
    const darkMat  = makeMat(col, -0.12);
    const pantsCol = new THREE.Color().setHSL(0.6, 0.4, 0.25);
    const pantsMat = new THREE.MeshLambertMaterial({ color: pantsCol });

    const geo = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    // Root — pivot no pé esquerdo (origem = chão)
    this.root = new THREE.Group();

    // Pernas (pivô no topo de cada perna = anca)
    this.leftLeg  = this._limb(geo(...DIMS.leg),  pantsMat, 0,  Y.legTop, 0);
    this.rightLeg = this._limb(geo(...DIMS.leg),  pantsMat, 0,  Y.legTop, 0);
    this.leftLeg.position.set( 0.14, 0, 0);
    this.rightLeg.position.set(-0.14, 0, 0);

    // Tronco
    this.torso = new THREE.Mesh(geo(...DIMS.torso), skinMat);
    this.torso.position.set(0, Y.torsoBot + DIMS.torso[1] / 2, 0);
    this.torso.castShadow = true;

    // Braços (pivô no ombro = topo do braço)
    this.leftArm  = this._limb(geo(...DIMS.arm), darkMat, 0, DIMS.arm[1] / 2, 0);
    this.rightArm = this._limb(geo(...DIMS.arm), darkMat, 0, DIMS.arm[1] / 2, 0);
    // posição relativa ao tronco (ombros)
    this.leftArm.position.set( 0.36, Y.torsoTop - Y.torsoBot - 0.05, 0);
    this.rightArm.position.set(-0.36, Y.torsoTop - Y.torsoBot - 0.05, 0);

    this.torso.add(this.leftArm);
    this.torso.add(this.rightArm);

    // Cabeça
    this.head = new THREE.Mesh(geo(...DIMS.head), makeMat(col, 0.08));
    this.head.position.set(0, Y.headBot + DIMS.head[1] / 2, 0);
    this.head.castShadow = true;

    // Nick flutuante (CSS2D)
    this._buildLabel(nick);

    // Montar hierarquia no root
    this.root.add(this.leftLeg);
    this.root.add(this.rightLeg);
    this.root.add(this.torso);
    this.root.add(this.head);

    scene.add(this.root);
  }

  /** Cria um "limb" com pivot deslocado para que a rotação saia do topo. */
  _limb(geo, mat, px, py, pz) {
    const group = new THREE.Group();  // pivot no topo
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.position.set(px, -geo.parameters.height / 2, pz); // desce meio height
    mesh.castShadow = true;
    group.add(mesh);
    return group;
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
    this._label.position.set(0, 0.35, 0); // acima da cabeça
    this.head.add(this._label);
  }

  // ── API pública ───────────────────────────────────────────────────────────────

  /** Actualiza posição/rotação instantânea (chamado ao receber player:move). */
  update(x, y, z, rotY, moving) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = rotY;
    this._moving = !!moving;
  }

  /** Chamado a cada frame para animar membros. */
  animate(dt) {
    if (this._moving) {
      this._phase += dt * 7; // velocidade da animação
    } else {
      // Volta suavemente à pose neutra
      this._phase *= 0.85;
    }

    const swing = Math.sin(this._phase) * 0.5; // amplitude ±0.5 rad

    // Braços opostos às pernas (como ao caminhar)
    this.leftArm.rotation.x   =  swing;
    this.rightArm.rotation.x  = -swing;
    this.leftLeg.rotation.x   = -swing;
    this.rightLeg.rotation.x  =  swing;

    // Ligeiro balanço lateral da cabeça
    this.head.rotation.z = Math.sin(this._phase * 0.5) * 0.04;
  }

  /** Remove da cena e liberta recursos. */
  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
