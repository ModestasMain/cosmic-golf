// ============================================================
// ServerEventSystem.js — deterministic wall-clock server events
// All clients independently derive the same event from the same
// room code + time slice. Zero server changes needed.
//
// NEW: 120 second cycles with 30s event + 90s default (static)
// Default: planets are static (frozen)
// Event phase: active event for 30 seconds
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
    this._enabled      = true;
    this._lastCycleIdx = -1;
    this._activeType   = null;
    this._activeT      = 0;
    this._eventPhase   = false; // true during the 30s event, false during 90s default

    // ── State read by HoleScene ───────────────────────────────
    // ZERO_GRAVITY (only active during event phase)
    this.gravityScale     = 1.0;

    // MAP_FLIP — animated 0→1 on start, 1→0 on end (HoleScene lerps planet Y)
    this.mapFlipProgress  = 0;
    this._mapFlipTarget   = 0;

    // planetsMoving — NEW: false by default (planets frozen), true during MOVING_PLANETS event
    this.planetsMoving    = false;

    // Asteroid Storm
    this._asteroids       = [];

    // Warning
    this._warningShown    = false;
    this._nextEventType   = null;
    this._initialized     = false; // true after the first update tick
  }

  get isStatic() { return !this.planetsMoving; }

  setEnabled(enabled) {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    if (!enabled) {
      this._warningShown = false;
      this._activeType = null;
      this._eventPhase = false;
      this._lastCycleIdx = -1;
      this.gravityScale = 1.0;
      this._mapFlipTarget = 0;
      this.mapFlipProgress = 0;
      this.planetsMoving = false;
      this._clearAsteroids();
      eventBus.emit(Events.SERVER_EVENT, { type: null, phase: 'end' });
    }
  }

  // ── Update ────────────────────────────────

  update(dt) {
    if (!this._enabled) return;
    const now       = Date.now();
    const cycleMs   = SERVER_EVENTS.CYCLE_MS;
    const eventMs   = SERVER_EVENTS.EVENT_DURATION_MS;
    const cycleIdx  = Math.floor(now / cycleMs);
    const posInCycle = now % cycleMs;
    const remaining = cycleMs - posInCycle;

    // In event phase for first 30 seconds of each cycle
    const inEventPhase = posInCycle < eventMs;

    // Warn 15 s before next event phase starts (end of 90s default)
    const WARN_MS = 15_000;
    const timeToNextEvent = inEventPhase ? 0 : remaining;
    if (!inEventPhase && timeToNextEvent < WARN_MS && !this._warningShown) {
      this._warningShown  = true;
      this._nextEventType = this._pickType(cycleIdx + 1);
      eventBus.emit(Events.SERVER_EVENT, { type: this._nextEventType, phase: 'warning' });
    }
    if (inEventPhase || timeToNextEvent >= WARN_MS) this._warningShown = false;

    // Cycle changed or phase transition
    const cycleChanged = cycleIdx !== this._lastCycleIdx;
    const phaseChanged = inEventPhase !== this._eventPhase;

    if (cycleChanged) {
      // New cycle started
      this._lastCycleIdx = cycleIdx;
      this._warningShown = false;
    }

    if (phaseChanged || (cycleChanged && inEventPhase)) {
      this._eventPhase = inEventPhase;

      if (inEventPhase) {
        // Make sure any prior event's effects are cleared before starting the
        // new one — protects against tab-backgrounded skips where _endEvent
        // never ran for the previous cycle's event.
        if (this._activeType) this._endEvent();
        // On the very first tick, we may be joining mid-event — sync state
        // silently so the HUD shows the event name without spinning or popping up.
        this._startEvent(this._pickType(cycleIdx), !this._initialized);
      } else {
        this._endEvent();
      }
    }

    this._initialized = true;

    // Defensive: if we're not in the event window, no event effects may persist.
    // Catches any state desync (visibility, hot reload, missed phase change).
    if (!inEventPhase) {
      if (this._activeType) this._endEvent();
      if (this.gravityScale !== 1.0) this.gravityScale = 1.0;
      if (this._mapFlipTarget !== 0) this._mapFlipTarget = 0;
      if (this.planetsMoving) this.planetsMoving = false;
      if (this._asteroids.length) this._clearAsteroids();
    }

    // Tick active event during event phase
    if (inEventPhase && this._activeType) {
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

  // ── Event lifecycle ───────────────────────

  _pickType(idx) {
    const seed = hashStr((gameState.roomCode ?? 'SOLO') + String(idx));
    return SERVER_EVENTS.TYPES[seed % SERVER_EVENTS.TYPES.length];
  }

  _startEvent(type, silent = false) {
    this._activeType = type;
    this._activeT    = 0;

    // 'sync' = joining mid-event; HUD shows the name without spin or popup.
    eventBus.emit(Events.SERVER_EVENT, { type, phase: silent ? 'sync' : 'start' });

    if (type === 'ZERO_GRAVITY') {
      this.gravityScale = 0.0;
    } else if (type === 'MAP_FLIP') {
      this._mapFlipTarget = 1;
    } else if (type === 'MOVING_PLANETS') {
      this.planetsMoving = true; // NEW: planets start swaying
    } else if (type === 'ASTEROID_STORM') {
      this._spawnAsteroids();
    }
  }

  _endEvent() {
    const type = this._activeType;
    if (!type) return;
    this._activeType = null;

    eventBus.emit(Events.SERVER_EVENT, { type, phase: 'end' });

    // Reset all event effects back to default
    this.gravityScale   = 1.0;
    this._mapFlipTarget = 0;
    this.planetsMoving  = false;
    this._clearAsteroids();
  }

  _clearAsteroids() {
    for (const a of this._asteroids) {
      this._scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      a.mesh.material.dispose();
    }
    this._asteroids = [];
  }

  // ── Asteroid Storm ────────────────────────

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

  // ── Collision check — called from HoleScene ─

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
