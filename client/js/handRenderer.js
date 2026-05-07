import * as THREE from 'three';
import { ITEM_COLOR } from './items.js';

export class HandRenderer {
  constructor() {
    this.handCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 5);

    this.handScene = new THREE.Scene();
    this.handScene.add(new THREE.AmbientLight(0xffffff, 0.70));
    const sun = new THREE.DirectionalLight(0xfffde7, 0.90);
    sun.position.set(0.4, 1.0, 0.6);
    this.handScene.add(sun);

    // Ombro abaixo do ecrã — braço sobe para dentro do campo de visão
    this.handGroup = new THREE.Group();
    this.handGroup.position.set(0.60, -0.62, -0.55);
    this.handGroup.rotation.set(0.12, -0.20, 0.08);
    this.handScene.add(this.handGroup);

    this._swingT   = 0;
    this._swinging = false;
    this._idleT    = 0;

    this._skinColor  = new THREE.Color().setHSL(0.07, 0.55, 0.66);
    this._shirtColor = new THREE.Color(0x3355aa);

    this._buildArm();
    this._buildItemInHand();
  }

  _buildArm() {
    const skinMat  = new THREE.MeshLambertMaterial({ color: this._skinColor });
    const shirtMat = new THREE.MeshLambertMaterial({ color: this._shirtColor });
    this._shirtMat = shirtMat;

    // Braço sobe a partir do ombro (y=0 = ombro, fora do ecrã abaixo)
    this._upper = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), shirtMat);
    this._upper.position.y = 0.17;   // ombro → cotovelo

    this._fore = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.24), skinMat);
    this._fore.position.y = 0.48;    // cotovelo → pulso

    this._hand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.24), skinMat);
    this._hand.position.y = 0.69;    // pulso → knuckles

    this.handGroup.add(this._upper, this._fore, this._hand);
  }

  _buildItemInHand() {
    this.heldMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.26),
      new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
    );
    this.heldMesh.position.set(-0.02, 0.84, 0.06);
    this.heldMesh.rotation.set(0.30, 0.60, 0.12);
    this.heldMesh.visible = false;
    this.handGroup.add(this.heldMesh);
  }

  setNickHue(hue) {
    this._shirtColor.setHSL(hue, 0.72, 0.45);
    this._shirtMat.color.copy(this._shirtColor);
  }

  setHeldItem(itemId) {
    if (itemId == null) { this.heldMesh.visible = false; return; }
    this.heldMesh.visible = true;
    const col = ITEM_COLOR[itemId];
    this.heldMesh.material.color.set(
      col && !col.includes('gradient') ? col : '#888888'
    );
  }

  swing() { this._swingT = 0; this._swinging = true; }

  animate(dt) {
    this._idleT += dt;

    if (this._swinging) {
      this._swingT += dt * 9;
      if (this._swingT >= 1) { this._swingT = 1; this._swinging = false; }
    } else {
      this._swingT *= 0.75;
    }

    const swing = Math.sin(this._swingT * Math.PI);

    // Braço aponta +Y (para cima). Rotação X negativa = ponta do braço (mão)
    // roda para +Z (em direção à câmara) = swing de mineração correto
    this.handGroup.rotation.x = 0.12 - swing * 0.85;
    this.handGroup.rotation.z = 0.08 + swing * 0.04;

    // Respiração idle
    this.handGroup.position.y = -0.62 + Math.sin(this._idleT * 1.2) * 0.007;
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.handScene, this.handCamera);
  }

  onResize() {
    this.handCamera.aspect = window.innerWidth / window.innerHeight;
    this.handCamera.updateProjectionMatrix();
  }
}
