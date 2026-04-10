// ============================================================
// PortalSystem.js — VibeJam 2026 portal webring system
// Exit portal (right of tee): sends player to next game
// Return portal (left of tee): sends player back to previous game
// Both portals appear on every hole, flanking the spawn point.
// ============================================================

import {
  Mesh, TorusGeometry, MeshBasicMaterial, Color,
  Group, AdditiveBlending, Vector3, Sprite, SpriteMaterial,
  CanvasTexture,
} from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

const EXIT_URL_BASE = 'https://jam.pieter.com/portal/2026';
const DOMAIN = window.location.hostname || 'cosmic-golf.pages.dev';

// Distance from tee to each portal, perpendicular to facing direction
const SIDE_DIST = 150;
const FWD_DIST  = 5;   // slight push forward so they're in view

export class PortalSystem {
  constructor(scene) {
    this.scene = scene;
    this._exitPortal   = null;
    this._returnPortal = null;
    this._phase = 0;

    this._readURLParams();
  }

  _readURLParams() {
    const params = new URLSearchParams(window.location.search);
    gameState.portalMode     = params.has('portal');
    gameState.portalRef      = params.get('ref');
    gameState.portalUsername = params.get('username') || 'PLAYER';
    gameState.portalColor    = params.get('color') || 'ffffff';
  }

  // Called every hole load — positions portals left/right of tee.
  // facingDir: normalized Vector3 pointing from tee toward cup.
  placePortals(teePos, facingDir) {
    // Right vector: perpendicular to facing direction in the horizontal plane
    const up    = new Vector3(0, 1, 0);
    const right = new Vector3().crossVectors(facingDir, up).normalize();
    if (right.lengthSq() < 0.01) right.set(1, 0, 0); // fallback if facing straight up

    const rightPos = teePos.clone()
      .addScaledVector(right, SIDE_DIST)
      .addScaledVector(facingDir, FWD_DIST);

    const leftPos = teePos.clone()
      .addScaledVector(right, -SIDE_DIST)
      .addScaledVector(facingDir, FWD_DIST);

    // Exit portal — right side, always present
    if (!this._exitPortal) {
      this._exitPortal = this._buildPortalMesh(0x8844ff, 'VIBE JAM PORTAL');
      this._exitPortal.userData.isExitPortal = true;
      this.scene.add(this._exitPortal);
    }
    this._exitPortal.position.copy(rightPos);

    // Return portal — left side, only when there's a game to go back to
    if (gameState.portalRef) {
      if (!this._returnPortal) {
        this._returnPortal = this._buildPortalMesh(0xff4444, 'RETURN PORTAL');
        this._returnPortal.userData.isReturnPortal = true;
        this.scene.add(this._returnPortal);
      }
      this._returnPortal.position.copy(leftPos);
    }
  }

  _buildPortalMesh(color = 0x8844ff, label = 'VIBE JAM PORTAL') {
    const group = new Group();

    // Torus ring
    const torusGeo = new TorusGeometry(15, 2.5, 12, 48);
    const torusMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
    });
    const torus = new Mesh(torusGeo, torusMat);
    group.add(torus);

    // Inner glow ring
    const glowGeo = new TorusGeometry(15, 6.25, 8, 48);
    const col = new Color(color);
    const glowMat = new MeshBasicMaterial({
      color: col.clone().multiplyScalar(0.6),
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const glow = new Mesh(glowGeo, glowMat);
    group.add(glow);

    // Label sprite
    const labelSprite = this._makeTextSprite(label, color);
    labelSprite.position.set(0, 22.5, 0);
    group.add(labelSprite);

    group._torus    = torus;
    group._glow     = glow;
    group._torusMat = torusMat;
    group._glowMat  = glowMat;

    return group;
  }

  _makeTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.font = 'bold 40px Courier New';
    ctx.fillStyle = '#' + new Color(color).getHexString();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const texture = new CanvasTexture(canvas);
    const mat = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new Sprite(mat);
    sprite.scale.set(50, 12.5, 1);
    return sprite;
  }

  /**
   * Check if ball has entered a portal.
   * @param {Vector3} ballPos
   */
  checkPortalEntry(ballPos) {
    if (this._exitPortal) {
      const dist = ballPos.distanceTo(this._exitPortal.position);
      if (dist < 17.5) {
        this._enterExitPortal();
      }
    }
    if (this._returnPortal) {
      const dist = ballPos.distanceTo(this._returnPortal.position);
      if (dist < 17.5) {
        this._enterReturnPortal();
      }
    }
  }

  _enterExitPortal() {
    const player   = gameState.currentPlayer;
    const username = encodeURIComponent(player?.name || gameState.portalUsername || 'PLAYER');
    const color    = (player?.color ?? 0xffffff).toString(16).padStart(6, '0');
    const ref      = encodeURIComponent(DOMAIN);
    const url      = `${EXIT_URL_BASE}?username=${username}&color=${color}&ref=${ref}`;
    window.location.href = url;
    eventBus.emit(Events.PORTAL_ENTER, { type: 'exit', url });
  }

  _enterReturnPortal() {
    if (!gameState.portalRef) return;
    const player   = gameState.currentPlayer;
    const name     = encodeURIComponent(player?.name || gameState.portalUsername || 'PLAYER');
    const color    = (player?.color ?? 0xffffff).toString(16).padStart(6, '0');
    const ref      = encodeURIComponent(DOMAIN);
    const url      = `https://${gameState.portalRef}?portal=true&username=${name}&color=${color}&ref=${ref}`;
    eventBus.emit(Events.PORTAL_ENTER, { type: 'return' });
    window.location.href = url;
  }

  /**
   * Animate portal rotation each frame.
   * @param {number} dt
   */
  update(dt) {
    this._phase += dt;

    if (this._exitPortal) {
      this._exitPortal.rotation.y += dt * 0.8;
      const pulse = 0.7 + Math.sin(this._phase * 2) * 0.3;
      this._exitPortal._torusMat.opacity = pulse * 0.9;
      this._exitPortal._glowMat.opacity  = pulse * 0.25;
    }
    if (this._returnPortal) {
      this._returnPortal.rotation.y += dt * 0.6;
      const pulse = 0.65 + Math.sin(this._phase * 1.7 + 1.2) * 0.3;
      this._returnPortal._torusMat.opacity = pulse * 0.9;
      this._returnPortal._glowMat.opacity  = pulse * 0.25;
    }
  }

  removePortals() {
    if (this._exitPortal) {
      this.scene.remove(this._exitPortal);
      this._exitPortal = null;
    }
    if (this._returnPortal) {
      this.scene.remove(this._returnPortal);
      this._returnPortal = null;
    }
  }
}
