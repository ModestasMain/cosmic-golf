// ============================================================
// ServerEventSystem.js — deterministic wall-clock server events
// All clients independently derive the same event from the same
// room code + time slice. Zero server changes needed.
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { SERVER_EVENTS } from '../core/Constants.js';
import {
  SphereGeometry, Mesh, MeshBasicMaterial, AdditiveBlending, BackSide,
  Vector3,
} from 'three';

// Simple string → uint32 hash (djb2)
function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

export class ServerEventSystem {
  /**
   * @param {THREE.Scene} scene — needed for asteroid geometry
   */
  constructor(scene) {
    this._scene        = scene;
    this._lastEventIdx = -1;
    this._activeType   = null;
    this._activeT      = 0;

    // ── State read by HoleScene ───────────────────────────────
    // ZERO_GRAVITY
    this.gravityScale     = 1.0;

    // MAP_FLIP — animated 0→1 on start, 1→0 on end (HoleScene lerps planet Y)
    this.mapFlipProgress  = 0;
    this._mapFlipTarget   = 0;

    // STATIC (freezes the default planet sway)
    this.staticActive     = false;

    // Asteroid Storm
    this._asteroids       = [];

    // Warning
    this._warningShown    = false;
    this._nextEventType   = null;
  }

  get isStatic() { return this.staticActive; }

  // ── Update ────────────────────────────────────────────────

  update(dt) {
    const now       = Date.now();
    const interval  = SERVER_EVENTS.INTERVAL_MS;
    const eventIdx  = Math.floor(now / interval);
    const remaining = interval - (now % interval);

    // Warn 15 s before next event
    const WARN_MS = 15_000;
    if (remaining < WARN_MS && !this._warningShown) {
      this._warningShown  = true;
      this._nextEventType = this._pickType(eventIdx + 1);
      eventBus.emit(Events.SERVER_EVENT, { type: this._nextEventType, phase: 'warning' });
    }
    if (remaining >= WARN_MS) this._warningShown = false;

    // Fire when slice advances (or on first update — sync to current event immediately)
    if (eventIdx !== this._lastEventIdx) {
      const isFirstRun = this._lastEventIdx === -1;
      this._lastEventIdx = eventIdx;
      if (!isFirstRun && this._activeType) this._endEvent();
      this._startEvent(this._pickType(eventIdx));
    }

    // Tick active event
    if (this._activeType) {
      this._activeT += dt;
    }

    // Always animate mapFlipProgress toward target (smooth transition)
    if (Math.abs(this.mapFlipProgress - this._mapFlipTarget) > 0.001) {
      const dir = this._mapFlipTarget > this.mapFlipProgress ? 1 : -1;
      this.mapFlipProgress = Math.max(0, Math.min(1,
        this.mapFlipProgress + dir * dt * 0.45, // ~2.2 s for full 0→1 flip
      ));
    } else {
      this.mapFlipProgress = this._mapFlipTarget;
    }

    this._tickAsteroids(dt);
  }

  // ── Event lifecycle ───────────────────────────────────────

  _pickType(idx) {
    const seed = hashStr((gameState.roomCode ?? 'SOLO') + String(idx));
    return SERVER_EVENTS.TYPES[seed % SERVER_EVENTS.TYPES.length];
  }

  _startEvent(type) {
    this._activeType = type;
    this._activeT    = 0;

    eventBus.emit(Events.SERVER_EVENT, { type, phase: 'start' });

    if (type === 'ZERO_GRAVITY') {
      this.gravityScale = 0.0;
    } else if (type === 'MAP_FLIP') {
      this._mapFlipTarget = 1;
    } else if (type === 'STATIC') {
      this.staticActive = true;
    } else if (type === 'ASTEROID_STORM') {
      this._spawnAsteroids();
    }
  }

  _endEvent() {
    const type = this._activeType;
    if (!type) return;
    this._activeType = null;

    eventBus.emit(Events.SERVER_EVENT, { type, phase: 'end' });

    this.gravityScale   = 1.0;
    this._mapFlipTarget = 0;
    this.staticActive   = false;
  }

  // ── Asteroid Storm ────────────────────────────────────────

  _spawnAsteroids() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this._spawnOneAsteroid(i), i * 600);
    }
  }

  _spawnOneAsteroid(idx) {
    const r    = 5 + Math.random() * 8;
    const geo  = new SphereGeometry(r, 6, 4);
    const mat  = new MeshBasicMaterial({ color: 0x886644 });
    const mesh = new Mesh(geo, mat);

    const side   = Math.random() < 0.5 ? -1 : 1;
    const startX = side * (800 + Math.random() * 200);
    const startY = (Math.random() - 0.5) * 600;
    const startZ = (Math.random() - 0.5) * 600;

    mesh.position.set(startX, startY, startZ);
    this._scene.add(mesh);

    const speed = 180 + Math.random() * 220;
    const vel   = new Vector3(-side * speed, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);

    const haloGeo = new SphereGeometry(r * 2.2, 8, 6);
    const haloMat = new MeshBasicMaterial({
      color: 0xff6600, transparent: true, opacity: 0.15,
      depthWrite: false, blending: AdditiveBlending, side: BackSide,
    });
    const halo = new Mesh(haloGeo, haloMat);
    mesh.add(halo);

    this._asteroids.push({ mesh, vel });
  }

  _tickAsteroids(dt) {
    for (let i = this._asteroids.length - 1; i >= 0; i--) {
      const a = this._asteroids[i];
      a.mesh.position.addScaledVector(a.vel, dt);
      a.mesh.rotation.x += dt * 0.8;
      a.mesh.rotation.z += dt * 0.5;
      if (a.mesh.position.length() > 2000) {
        this._scene.remove(a.mesh);
        a.mesh.geometry.dispose();
        a.mesh.material.dispose();
        this._asteroids.splice(i, 1);
      }
    }
  }

  // ── Collision check — called from HoleScene ───────────────

  checkAsteroidCollision(ballPos, ballVel) {
    for (const a of this._asteroids) {
      const diff = new Vector3().subVectors(ballPos, a.mesh.position);
      if (diff.length() < 14.8) {
        const normal = diff.normalize();
        const dot    = ballVel.dot(normal);
        if (dot < 0) {
          ballVel.addScaledVector(normal, -2 * dot * 0.7);
          ballVel.addScaledVector(a.vel, 0.3);
          return true;
        }
      }
    }
    return false;
  }

  dispose() {
    for (const a of this._asteroids) {
      this._scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      a.mesh.material.dispose();
    }
    this._asteroids = [];
  }
}
