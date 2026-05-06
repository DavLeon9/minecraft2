/**
 * HandRenderer — renderiza o braço direito do jogador em 1ª pessoa.
 *
 * Técnica:
 *   1. Cena separada (handScene) com câmara fixa na origem.
 *   2. Antes de renderizar, limpa só o depth buffer com renderer.clearDepth().
 *   3. O braço fica sempre visível à frente de qualquer bloco.
 */
import * as THREE from 'three';
import { ITEM_COLOR } from './items.js';

export class HandRenderer {
  constructor() {
    // Câmara fixa na origem, olha para -Z (padrão)
    this.handCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 5);

    this.handScene = new THREE.Scene();
    this.handScene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xfffde7, 0.90);
    sun.position.set(0.5, 1.0, 0.5);
    this.handScene.add(sun);

    // Grupo do braço — posição "vista de baixo/direita" em espaço de câmara
    this.handGroup = new THREE.Group();
    this.handGroup.position.set(0.38, -0.30, -0.52);
    this.handGroup.rotation.set(0.18, 0.28, 0.04);
    this.handScene.add(this.handGroup);

    this._swingT    = 0;
    this._swinging  = false;
    this._idleT     = 0;

    // Cor do nick do jogador (actualizada depois do login)
    this._skinColor  = new THREE.Color().setHSL(0.07, 0.55, 0.66);
    this._shirtColor = new THREE.Color(0x3355aa);

    this._buildArm();
    this._buildItemInHand();
  }

  // ── Construção ───────────────────────────────────────────────────────────

  _buildArm() {
    const skinMat  = new THREE.MeshLambertMaterial({ color: this._skinColor });
    const shirtMat = new THREE.MeshLambertMaterial({ color: this._shirtColor });

    // Braço superior (camisa)
    this._upper = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.32, 0.20), shirtMat);
    this._upper.position.y = 0.16;

    // Antebraço (pele)
    this._fore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), skinMat);
    this._fore.position.y = 0.45;

    // Mão
    this._hand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), skinMat);
    this._hand.position.y = 0.64;

    this._shirtMat = shirtMat;
    this.handGroup.add(this._upper, this._fore, this._hand);
  }

  _buildItemInHand() {
    // Cubo que representa o item/bloco segurado
    this.heldMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
    );
    this.heldMesh.position.set(0.02, 0.80, 0.02);
    this.heldMesh.rotation.set(0.25, 0.7, 0.1);
    this.heldMesh.visible = false;
    this.handGroup.add(this.heldMesh);
  }

  // ── API pública ──────────────────────────────────────────────────────────

  /** Define a cor da camisa com base no hue do nick. */
  setNickHue(hue) {
    this._shirtColor.setHSL(hue, 0.72, 0.45);
    this._shirtMat.color.copy(this._shirtColor);
  }

  /** Actualiza o cubo do item em mão. */
  setHeldItem(itemId) {
    if (itemId == null) {
      this.heldMesh.visible = false;
      return;
    }
    this.heldMesh.visible = true;
    const col = ITEM_COLOR[itemId];
    if (col && !col.includes('gradient')) {
      this.heldMesh.material.color.set(col);
    } else {
      this.heldMesh.material.color.set(0x888888);
    }
  }

  /** Dispara animação de swing (partir bloco). */
  swing() {
    this._swingT   = 0;
    this._swinging = true;
  }

  animate(dt) {
    this._idleT += dt;

    if (this._swinging) {
      this._swingT += dt * 9;
      if (this._swingT >= 1) { this._swingT = 1; this._swinging = false; }
    } else {
      this._swingT *= 0.75; // regresso suave
    }

    const swing = Math.sin(this._swingT * Math.PI);
    // Baixa o braço (sinal positivo = rotação para baixo em X)
    this.handGroup.rotation.x = 0.18 + swing * 0.70;
    this.handGroup.position.y = -0.30 - swing * 0.06;

    // Idle: balanço respiratório subtil
    this.handGroup.position.y += Math.sin(this._idleT * 1.2) * 0.005;
  }

  /** Chama renderer.clearDepth() e renderiza só o braço (sobre tudo). */
  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.handScene, this.handCamera);
  }

  onResize() {
    this.handCamera.aspect = window.innerWidth / window.innerHeight;
    this.handCamera.updateProjectionMatrix();
  }
}
