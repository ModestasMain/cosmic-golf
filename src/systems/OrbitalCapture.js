// ============================================================
// OrbitalCapture.js — orbital capture mechanic system
//
// States: NONE → ORBITING
//
// Player presses orbit toggle → enters orbit mode (single-planet gravity).
// Player presses again → slingshot exit into cosmos (multi-planet gravity).
//
// While orbiting, ball follows normal physics with only the attached
// planet's gravity. Player can aim and shoot normally on the planet.
// ============================================================

import {
  TorusGeometry, MeshBasicMaterial, Mesh,
  AdditiveBlending, Group,
} from 'three';
import { ORBIT } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

export class OrbitalCapture {
  constructor() {
    this.state = 'NONE';

    this._planetIdx = -1;
    this._planet    = null;
    this._planetObj = null;

    this._group    = new Group();
    this._ringMesh = null;
    this._scene    = null;
  }

  _ensureVisuals(scene, planetRadius) {
    if (this._scene === scene) return;
    this._scene = scene;
    scene.add(this._group);

    const orbitR = planetRadius + ORBIT.ORBIT_RADIUS_OFFSET;
    const ringGeo = new TorusGeometry(orbitR, 0.15, 8, 128);
    const ringMat = new MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.25,
      depthWrite: false, blending: AdditiveBlending,
    });
    this._ringMesh = new Mesh(ringGeo, ringMat);
    this._ringMesh.rotation.x = Math.PI / 2;
    this._group.add(this._ringMesh);
  }

  _removeVisuals() {
    if (this._scene && this._group.parent) {
      this._scene.remove(this._group);
    }
    this._scene = null;
  }

  // ── Public API ─────────────────────────────────────────────

  get isActive() { return this.state !== 'NONE'; }
  get isOrbiting() { return this.state === 'ORBITING'; }
  get planetIdx() { return this._planetIdx; }

  enterOrbit(planetIdx, planets, planetObjects, scene) {
    if (this.state !== 'NONE') return;

    this._planetIdx = planetIdx;
    this._planet    = planets[planetIdx];
    this._planetObj = planetObjects[planetIdx];
    this.state      = 'ORBITING';

    this._ensureVisuals(scene, this._planet.radius);
    this._group.position.copy(this._planet.position);

    eventBus.emit(Events.ORBIT_ENTER);
  }

  exitOrbit() {
    if (this.state !== 'ORBITING') return;

    this.state = 'NONE';
    this._removeVisuals();
  }

  reset() {
    this.state       = 'NONE';
    this._planetIdx  = -1;
    this._planet     = null;
    this._planetObj  = null;
    this._removeVisuals();
  }

  update(dt) {
    if (this.state !== 'ORBITING') return;

    if (!this._planet) {
      this.reset();
      return;
    }

    this._group.position.copy(this._planet.position);

    if (this._ringMesh) {
      this._ringMesh.rotateZ(0.3 * dt);
    }
  }

  dispose() {
    this.reset();
    if (this._ringMesh) {
      this._ringMesh.geometry.dispose();
      this._ringMesh.material.dispose();
    }
  }
}
