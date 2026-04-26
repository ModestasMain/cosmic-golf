// ============================================================
// HoleScene.js — main gameplay scene
// State machine: IDLE → AIMING → BALL_IN_FLIGHT → HOLE_COMPLETE
// ============================================================

import {
  Scene, PerspectiveCamera, AmbientLight, DirectionalLight, HemisphereLight,
  Vector3, Quaternion, ArrowHelper, CanvasTexture,
  Sprite, SpriteMaterial, AdditiveBlending, Group,
  BufferGeometry, Line, LineBasicMaterial,
} from 'three';
import { update as tweenUpdate } from '@tweenjs/tween.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { CAMERA, HOLE, AIM, PHYSICS, BALL, ORBIT, PLANET, WORLDEATER } from '../core/Constants.js';
import { generateHole } from '../systems/HoleGenerator.js';
import { stepBall } from '../systems/GravitySystem.js';
import { TrajectoryPreview } from '../systems/TrajectoryPreview.js';
import { Planet } from '../objects/Planet.js';
// import { EarthPlanet } from '../objects/EarthPlanet.js';
import { GolfBall } from '../objects/GolfBall.js';
import { HoleCup } from '../objects/HoleCup.js';
import { TeeMarker } from '../objects/TeeMarker.js';
import { StarField } from '../objects/StarField.js';
import { NebulaField } from '../objects/NebulaField.js';
import { BackgroundPlanets } from '../objects/BackgroundPlanets.js';
import { ProceduralSpaceBg } from '../objects/ProceduralSpaceBg.js';
import { PortalSystem } from '../portal/PortalSystem.js';
import { BallTrail } from '../effects/BallTrail.js';
import { ScreenShake } from '../effects/ScreenShake.js';
import { LaunchBurst } from '../effects/LaunchBurst.js';
import { GhostBall } from '../objects/GhostBall.js';
import { LaunchWarp } from '../effects/LaunchWarp.js';
import { Wormhole, WORMHOLE_CAPTURE_RADIUS } from '../objects/Wormhole.js';
import { WorldEater } from '../objects/WorldEater.js';
import { audioManager } from '../audio/AudioManager.js';
import { CometSystem } from '../effects/CometSystem.js';
import { CinematicController } from './CinematicController.js';
import { ServerEventSystem } from '../systems/ServerEventSystem.js';
import { CollectibleSystem } from '../systems/CollectibleSystem.js';
// import { OrbitalCapture } from '../systems/OrbitalCapture.js';

export class HoleScene {
  constructor(renderer, inputSystem) {
    this.renderer = renderer;
    this.inputSystem = inputSystem;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      CAMERA.NEAR,
      CAMERA.FAR,
    );
    this.camera.position.set(0, CAMERA.FOLLOW_HEIGHT, CAMERA.FOLLOW_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    // Objects
    this.planets = [];
    this.planetObjects = [];
    this.ball = null;
    this.cup = null;
    this.tee = null;
    this.starField = null;
    this.backgroundPlanets = null;
    this.wormholes = [];
    this.worldEater = null;
    this._bossIntroWormhole = null;
    this._bossIntroPathDebug = null;
    this._bossIntroPathVisible = false;
    this._bossIntroPreviewHold = false;
    this._bossIntroPreviewProgress = 0;

    // State
    this._state = 'IDLE'; // IDLE | AIMING | BALL_IN_FLIGHT | HOLE_COMPLETE
    this._holeData = null;
    this._cameraTarget = new Vector3();
    this._cameraPos = new Vector3(0, CAMERA.FOLLOW_HEIGHT, CAMERA.FOLLOW_DISTANCE);
    this._devFreezeAll = false;
    this._freecamActive = false;
    this._freecamPos = new Vector3();
    this._freecamMove = new Vector3();
    this._freecamForward = new Vector3(0, 0, -1);
    this._freecamRight = new Vector3(1, 0, 0);
    this._freecamYaw = Math.PI;
    this._freecamPitch = -0.18;

    // Aiming state
    this._aimDrag = null;
    this._hitFreezeFrames = 0;

    // Bounce cooldown + stuck detection
    this._lastBounceTime = 0;
    this._worldEaterBounceCooldown = 0;
    this._stuckFrames = 0;
    this._launchGraceFrames = 0;  // counts down after shot — gravity ramps up
    this._bounceGraceFrames = 0;  // counts down after bounce — suppresses drift-OOB
    this._voidFrames = 0;         // zero-gravity void timer — frames away from any planet

    // Trajectory freeze: compute once on shot/bounce, advance head each frame
    this._trajNeedsRecompute = false;
    this._accumDt = 0; // physics time accumulator for fixed-step substepping
    this._planetPhysicsTimeMs = Date.now();
    this._planetPhysicsTimeMs = Date.now();

    // Camera facing direction — rotated by aim drag, trails velocity in flight
    this._facingDir  = new Vector3(0, 0, -1);
    this._aimStartDir = new Vector3(0, 0, -1);

    // Multiplayer: ghost balls for remote players
    // playerId -> { ball: GhostBall, inFlight, holed, stuckFrames, launchGrace }
    this._remoteBalls = new Map();
    this._syncFrameCounter = 0;
    this._lastValidPos = new Vector3();
    this._billiardCooldowns = new Map();

    this._holeCompleteEmitted = false; // idempotency guard for _advanceHole
    this._playersHoled       = new Set();

    // Hole time tracking (wall-clock ms from first shot to holing)
    this._holeStartTime = null;
    this._bossIntroPending = false;
    this._bossWarningShown = false;
    this._visualQuality = null;

    // Spectator mode — active after local player holes in MP

    // Occlusion: reusable vectors (no per-frame allocation)
    this._occRayDir = new Vector3();
    this._occOC     = new Vector3();


    // Visual effects
    this.screenShake = new ScreenShake();
    this.launchBurst = new LaunchBurst(this.scene);
    this.launchWarp = new LaunchWarp(this.camera);

    // Idle camera drift
    this._idleDriftT = 0;

    // World time — always accumulates, used for default planet sway
    this._worldT = 0;

    // Planet attachment — ball follows the planet it rests on as it sways
    this._attachedPlanetIdx = -1;
    this._attachedNormal    = new Vector3();

    // Consecutive bounce tracking — pin ball after 3 bounces on the same planet
    this._bouncePlanetIdx  = -1;
    this._bounceStreak     = 0;

    // Orbital Capture system (disabled)
    this._orbitalCapture = { isActive: false, isOrbiting: false, planetIdx: -1, update() {}, reset() {}, dispose() {}, enterOrbit() {}, exitOrbit() {} };

    // Last-valid-position save — stores planet attachment so OOB reset
    // respawns on the planet's *current* position, not old world coords
    this._lastValidPlanetIdx = -1;
    this._lastValidNormal    = new Vector3();

    // Comet system — shared across holes
    this.cometSystem = new CometSystem(this.scene);

    // Hole-intro cinematic
    this.cinematic = new CinematicController(this.camera, () => {
      this._cameraPos.copy(this.camera.position);
      if (this.ball) {
        this._cameraTarget.copy(
          this.ball.position.clone().addScaledVector(this._facingDir, 8),
        );
      }
      this.inputSystem.enabled = true;
      if (this._state === 'CINEMATIC') {
        this._state = 'IDLE';
        gameState.aimState = 'IDLE';
        this.inputSystem.showBar();
        this.trajectoryPreview.show();
      }
      if (this.worldEater?.getCinematicIntroState?.()?.active) {
        this.worldEater.finishCinematicIntro();
      }
      if (this._bossIntroPending) this._emitWorldEaterWarning();
      if (this._bossIntroWormhole) {
        this._bossIntroWormhole.removeFromScene(this.scene);
        this._bossIntroWormhole = null;
      }
      eventBus.emit(Events.CINEMATIC_COMPLETE);
    });

    // Systems
    this.trajectoryPreview = new TrajectoryPreview(this.scene);
    this.portalSystem = new PortalSystem(this.scene);
    this.serverEvents  = new ServerEventSystem(this.scene);
    this.collectibles  = new CollectibleSystem(this.scene);

    // Multiplayer manager reference — set externally by main.js after construction
    this.mp = null;

    this._setupLighting();
    this._setupEventListeners();

    this.starField  = new StarField(this.scene);
    this.nebulaField = new NebulaField(this.scene);
    this.backgroundPlanets = new BackgroundPlanets(this.scene);

    // Shader-based space backdrop — infinite resolution, full 360° coverage, no seams
    this.spaceBg = new ProceduralSpaceBg(this.scene);
    this.spaceBg.load();

    // Direction arrow — always shows facing direction
    this._aimArrow = new ArrowHelper(
      new Vector3(0, 0, -1), // direction (updated each frame)
      new Vector3(),          // origin (updated each frame)
      12,                     // length
      0xffffff,               // color
      3.5,                    // head length
      1.8,                    // head width
    );
    this._aimArrow.visible = false;
    this.scene.add(this._aimArrow);

    // Portal placement deferred to loadHole (placePortals call with tee position)
  }

  _setupLighting() {
    this.ambientLight = new AmbientLight(0xfff5f5, 2.25);
    this.scene.add(this.ambientLight);

    this.dirLight = new DirectionalLight(0xffad14, 10);
    this.dirLight.position.set(-33, 64, 61);
    this.scene.add(this.dirLight);

    this.hemiLight = new HemisphereLight(0xffffff, 0xffffff, 0.4);
    this.scene.add(this.hemiLight);

    this._buildSunStar();
  }

  _makeSpriteTex(size, drawFn) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    drawFn(c.getContext('2d'), size);
    const tex = new CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  _buildSunStar() {
    // Sun is placed very far along the directional light's direction
    const SUN_DIST = 8000;
    const sunDir = this.dirLight.position.clone().normalize();
    const sunPos = sunDir.clone().multiplyScalar(SUN_DIST);

    // ── 1. Hard disc — the actual star surface ──────────────────
    const texDisc = this._makeSpriteTex(256, (ctx, s) => {
      const cx = s / 2;
      const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
      g.addColorStop(0,    'rgba(255,255,230,1)');
      g.addColorStop(0.18, 'rgba(255,240,180,1)');
      g.addColorStop(0.38, 'rgba(255,200,80,0.95)');
      g.addColorStop(0.52, 'rgba(248,176,42,0.5)');
      g.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });

    // ── 2. Wide soft corona ─────────────────────────────────────
    const texCorona = this._makeSpriteTex(512, (ctx, s) => {
      const cx = s / 2;
      const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
      g.addColorStop(0,    'rgba(255,230,120,0.55)');
      g.addColorStop(0.12, 'rgba(255,190,60,0.35)');
      g.addColorStop(0.3,  'rgba(255,140,20,0.15)');
      g.addColorStop(0.6,  'rgba(255,100,0,0.04)');
      g.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });

    // ── 3. Starburst — 6 diffraction spikes ────────────────────
    const texSpikes = this._makeSpriteTex(512, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2;
      ctx.save();
      ctx.translate(cx, cx);
      const spikes = 6;
      for (let i = 0; i < spikes; i++) {
        ctx.rotate(Math.PI / spikes);
        const g = ctx.createLinearGradient(-cx, 0, cx, 0);
        g.addColorStop(0,    'rgba(255,230,150,0)');
        g.addColorStop(0.42, 'rgba(255,240,180,0.6)');
        g.addColorStop(0.5,  'rgba(255,255,255,1)');
        g.addColorStop(0.58, 'rgba(255,240,180,0.6)');
        g.addColorStop(1,    'rgba(255,230,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-cx, -1.2, s, 2.4);
      }
      ctx.restore();
    });

    const makeSprite = (tex, worldSize, color = 0xffffff) => {
      const mat = new SpriteMaterial({
        map: tex,
        color,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const sp = new Sprite(mat);
      sp.scale.setScalar(worldSize);
      sp.position.copy(sunPos);
      this.scene.add(sp);
      return sp;
    };

    this._sunDisc   = makeSprite(texDisc,   180, 0xfff8e0);
    this._sunCorona = makeSprite(texCorona, 900, 0xf8b02a);
    this._sunSpikes = makeSprite(texSpikes, 700, 0xffe090);

  }

  // Move sun sprites when DevPanel changes sun position
  _moveSunTo(x, y, z) {
    const SUN_DIST = 8000;
    const dir = new Vector3(x, y, z).normalize();
    const pos = dir.multiplyScalar(SUN_DIST);
    for (const s of [this._sunDisc, this._sunCorona, this._sunSpikes]) {
      if (s) s.position.copy(pos);
    }
  }

  _setupEventListeners() {
    eventBus.on(Events.AIM_START, () => {
      if (this._state !== 'IDLE' && this._state !== 'AIMING') return;
      this._state = 'AIMING';
      this._aimDrag = null;
      this._aimStartDir.copy(this._facingDir);
      this.trajectoryPreview.show();
      this.inputSystem.showBar();
    });

    // Fired at the start of each new direction drag — reset base so re-drags feel natural
    eventBus.on(Events.AIM_DIR_LOCKED, () => {
      if (this._state !== 'IDLE' && this._state !== 'AIMING') return;
      if (this._state === 'IDLE') this._state = 'AIMING';
      this._aimStartDir.copy(this._facingDir);
    });

    eventBus.on(Events.AIM_UPDATE, (data) => {
      if (this._state !== 'IDLE' && this._state !== 'AIMING') return;
      if (this._state === 'IDLE') this._state = 'AIMING';
      this._aimDrag = data;
      if (!this.ball || !this._holeData) return;

      // Rotate _aimStartDir by drag offset → full 3D direction
      const YAW_SENS   = Math.PI / 300;
      const PITCH_SENS = Math.PI / 300;

      const yaw   = -data.dragScreenVec.x * YAW_SENS;
      const pitch = -data.dragScreenVec.y * PITCH_SENS;

      const base = this._aimStartDir.clone();
      base.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));

      const right = new Vector3().crossVectors(base, new Vector3(0, 1, 0)).normalize();
      if (right.lengthSq() > 0.001) {
        base.applyQuaternion(new Quaternion().setFromAxisAngle(right, pitch));
      }

      const elevAngle = Math.asin(Math.max(-1, Math.min(1, base.y)));
      if (Math.abs(elevAngle) > Math.PI * 0.44) {
        base.y = Math.sign(base.y) * Math.sin(Math.PI * 0.44);
        base.setLength(1);
      }

      this._facingDir.copy(base);
    });

    eventBus.on(Events.AIM_POWER_UPDATE, ({ power }) => {
      if (this.ball) this.ball.setPower(power);
    });

    eventBus.on(Events.AIM_CANCEL, () => {
      if (this.ball) this.ball.setPower(0);
      if (this._state === 'AIMING') {
        this._state = 'IDLE';
        this._aimDrag = null;
      }
    });

    eventBus.on(Events.SHOT_TAKEN, (data) => {
      if (this._freecamActive) return;
      if (this.ball) this.ball.setPower(0);
      if (this._state === 'BALL_IN_FLIGHT' || this._state === 'HOLE_COMPLETE') return;
      this._fireShot(data);
    });

    eventBus.on(Events.FREECAM_TOGGLE, () => {
      if (this._state === 'CINEMATIC') return;
      this._setFreecamActive(!this._freecamActive);
    });

    eventBus.on(Events.FREECAM_MOVE, ({ x = 0, y = 0, z = 0, boost = false }) => {
      if (!this._freecamActive) return;
      this._freecamMove.set(x, y, z);
      this._freecamBoost = !!boost;
    });

    eventBus.on(Events.FREECAM_DRAG, ({ dx = 0, dy = 0, mode = 'look', pointerType = 'mouse' }) => {
      if (!this._freecamActive) return;
      if (mode === 'move' && pointerType === 'touch') {
        const moveSpeed = 1.25;
        this._freecamPos.addScaledVector(this._freecamRight, dx * moveSpeed);
        this._freecamPos.addScaledVector(this._freecamForward, -dy * moveSpeed);
        return;
      }

      const yawSens = pointerType === 'touch' ? 0.008 : 0.005;
      const pitchSens = pointerType === 'touch' ? 0.008 : 0.005;
      this._freecamYaw -= dx * yawSens;
      this._freecamPitch = Math.max(-1.2, Math.min(1.2, this._freecamPitch - dy * pitchSens));
    });

    eventBus.on(Events.DEV_FREEZE_ALL, ({ frozen } = {}) => {
      this._devFreezeAll = !!frozen;
    });

    eventBus.on(Events.SHOT_RECEIVED, (data) => {
      // Ignore shots from players on a different hole
      if (data.holeIndex !== undefined && data.holeIndex !== gameState.currentHole) return;
      this._handleRemoteShot(data);
    });

    // Ghost balls are spawned on-demand when ball_state or shot arrives (holeIndex must match).
    // MP_PLAYER_JOINED only adds the player to gameState so the defensive spawn in
    // MP_BALL_STATE can find their color/name.

    eventBus.on(Events.MP_PLAYER_LEFT, ({ playerId }) => {
      const remote = this._remoteBalls.get(playerId);
      if (remote) {
        remote.ball.removeFromScene(this.scene);
        this._remoteBalls.delete(playerId);
      }
    });

    eventBus.on(Events.MP_HOLE_COMPLETE, ({ playerId, strokes, timeMs }) => {
      gameState.recordStroke(playerId, gameState.currentHole, strokes);
      if (timeMs) gameState.recordHoleTime(playerId, gameState.currentHole, timeMs);
      this._playersHoled.add(playerId);
      const remote = this._remoteBalls.get(playerId);
      if (remote) {
        remote.ball.removeFromScene(this.scene);
        this._remoteBalls.delete(playerId);
      }
    });

    eventBus.on(Events.MP_BALL_RESET, ({ playerId, holeIndex }) => {
      if (holeIndex !== gameState.currentHole) return;
      const remote = this._remoteBalls.get(playerId);
      if (remote && this._holeData) {
        remote._stateBuffer = [];
        remote.holed = false;
        remote.inFlight = false;
        if (remote.ball.trail) remote.ball.trail.setActive(false);
        remote.ball.setPosition(this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0)));
        remote.ball.setVelocity(new Vector3());
      }
    });

    eventBus.on(Events.MP_GAME_RESTART, ({ playerId }) => {
      const remote = this._remoteBalls.get(playerId);
      if (remote) {
        remote.ball.removeFromScene(this.scene);
        this._remoteBalls.delete(playerId);
      }
    });

    eventBus.on(Events.NEXT_HOLE, () => {
      if (this._state !== 'HOLE_COMPLETE') return;
      this._loadNextHole();
    });

    // Remote ball state — dead reckoning correction
    eventBus.on(Events.MP_BALL_STATE, ({ playerId, pos, vel, holeIndex, bounce, planetIdx, normal, reset }) => {
      if (holeIndex !== undefined && holeIndex !== gameState.currentHole) return;
      let remote = this._remoteBalls.get(playerId);
      if (!remote && this._holeData) {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) return;
        this._spawnRemoteBall(playerId, player.color, player.name);
        remote = this._remoteBalls.get(playerId);
      }
      if (!remote || remote.holed) return;

      const authPos = new Vector3(pos.x, pos.y, pos.z);
      const authVel = new Vector3(vel.x, vel.y, vel.z);

      if (reset) {
        // Teleport: clear buffer, snap immediately
        remote._stateBuffer = [];
        remote._accumDt = 0;
        remote.inFlight = false;
        if (remote.ball.trail) remote.ball.trail.setActive(false);
        remote.ball.setPosition(authPos);
        remote.ball.setVelocity(authVel);
      } else {
        // Keep last 5 states for rest detection
        remote._stateBuffer.push({ ts: Date.now(), pos: authPos.clone(), vel: authVel.clone() });
        if (remote._stateBuffer.length > 5) remote._stateBuffer.shift();

        // Correct dead-reckoned position toward authority
        const posErr = remote.ball.position.distanceTo(authPos);
        if (bounce || posErr > 150) {
          // Discontinuous change (bounce) or large drift — snap
          remote.ball.setPosition(authPos);
          remote.ball.setVelocity(authVel);
          remote._accumDt = 0;
        } else if (posErr > 5) {
          // Gentle blend toward authoritative state
          remote.ball.position.lerp(authPos, 0.35);
          remote.ball.velocity.lerp(authVel, 0.5);
        }
        // posErr < 5 — dead reckoning is accurate, trust it
      }

      // Activate trail when ball starts moving
      if (!remote.inFlight && authVel.length() > PHYSICS.REST_VELOCITY) {
        remote.inFlight = true;
        remote._attachedPlanetIdx = -1;
        if (remote.ball.trail) remote.ball.trail.setActive(true);
      }

      // Update planet attachment from at-rest heartbeats
      if (planetIdx != null && !remote.inFlight) {
        remote._attachedPlanetIdx = planetIdx;
        if (normal && planetIdx >= 0) remote._attachedNormal.set(normal.x, normal.y, normal.z);
      }
    });

    // Remote ball stopped — settle ghost and store planet attachment
    eventBus.on(Events.MP_BALL_STOPPED, ({ playerId, pos, holeIndex, planetIdx, normal }) => {
      if (holeIndex !== undefined && holeIndex !== gameState.currentHole) return;
      const remote = this._remoteBalls.get(playerId);
      if (!remote || remote.holed) return;
      remote.inFlight = false;
      remote._stateBuffer = [];
      remote._accumDt = 0;
      if (pos) remote.ball.setPosition(new Vector3(pos.x, pos.y, pos.z));
      remote.ball.setVelocity(new Vector3());
      if (remote.ball.trail) remote.ball.trail.setActive(false);
      // Store planet attachment so ghost follows sway
      remote._attachedPlanetIdx = (planetIdx != null) ? planetIdx : -1;
      if (normal && remote._attachedPlanetIdx >= 0) {
        remote._attachedNormal.set(normal.x, normal.y, normal.z);
      }
    });

    // Screen shake triggers
    eventBus.on(Events.BALL_BOUNCED, () => {
      this.screenShake.trigger(0.3, 0.4);
    });

    eventBus.on(Events.BALL_HOLED, () => {
      this.screenShake.trigger(0.8, 0.6);
    });

    // Remote player collected — remove from our scene
    eventBus.on(Events.COLLECTIBLE_COLLECTED, (data) => {
      if (data.remote && data.holeIndex === gameState.currentHole) {
        this.collectibles?.removeById(data.id);
      }
      // Broadcast local collections to others
      if (!data.remote && this.mp) {
        this.mp.broadcastCollected(data.id, data.type, data.holeIndex);
      }
    });

    // Remote ball hit our ball
    eventBus.on(Events.BILLIARD_HIT, ({ remote, velocity, holeIndex }) => {
      if (remote && this.ball) {
        if (holeIndex !== undefined && holeIndex !== gameState.currentHole) return;
        const v = new Vector3(velocity.x, velocity.y, velocity.z);
        this.ball.setVelocity(v);
        this.ball.syncMesh();
        if (!this.ball.trail?.active) this.ball.trail?.setActive(true);
        this._state = 'BALL_IN_FLIGHT';
        gameState.ballInFlight = true;
        this.screenShake.trigger(0.5, 0.4);
      }
    });

    // Orbital Capture: toggle orbit on/off (disabled)
    // eventBus.on(Events.ORBIT_TOGGLE, () => { ... });
  }

  /**
   * Load a specific hole by index.
   * @param {number} holeIndex
   */
  loadHole(holeIndex) {
    this._clearCurrentHole();

    gameState.currentHole = holeIndex;
    gameState.currentStrokes = 0;
    gameState.aimState = 'IDLE';
    this._state = 'IDLE';

    // Challenge links recreate the shared seed without joining the same lobby.
    // Multiplayer still uses room code, and solo falls back to a fresh session seed.
    const holeSeed = gameState.challengeSeed ?? gameState.roomCode ?? gameState.sessionSeed;
    this._holeData = generateHole(holeIndex, holeSeed);
    const { planets, tee, cup, palette } = this._holeData;
    this._bossIntroPending = this._holeData.boss?.kind === 'WORLDEATER';
    this._bossWarningShown = false;
    this._worldEaterBounceCooldown = 0;
    const isBossHole =
      gameState.isBossRoom ||
      gameState.isBossChallenge ||
      this._holeData.boss?.kind === 'WORLDEATER' ||
      (gameState.totalHoles === 10 && holeIndex === 9);
    this.serverEvents.setEnabled(!gameState.isDailyChallenge && !isBossHole);

    // Let the active void background mode restore itself (procedural sphere or uploaded pano).
    if (this.spaceBg) this.spaceBg.applyParams();
    else this.scene.background = null;

    if (!this._devLightLock) {
      this.ambientLight.color.set(palette.ambient);
      // dirLight color is fixed to the sun colour — palette no longer overrides it
    }
    if (this.starField)   this.starField.setColor(palette.stars);
    if (this.nebulaField) this.nebulaField.setColors(palette);
    this._applyVisualQuality();

    // Place planets
    this.planets = planets;
    this._planetBasePos = [];  // base positions for server event effects
    for (const p of planets) {
      const pObj = new Planet(p);
      pObj.addToScene(this.scene);
      this.planetObjects.push(pObj);
      this._planetBasePos.push(p.position.clone());
    }
    this._applyPlanetRuntimeDefaults();

    // TEST: Earth planet on hole 1 — commented out while EarthPlanet is WIP
    // if (holeIndex === 0) {
    //   const earthPos  = tee.clone().add(new Vector3(0, 0, 90));
    //   const earthData = { position: earthPos, radius: 16, mass: 2000 };
    //   const earthObj  = new EarthPlanet({ ...earthData, seed: 42 });
    //   earthObj.addToScene(this.scene);
    //   this.planets.push(earthData);
    //   this.planetObjects.push(earthObj);
    // }

    // Place ball at tee
    this.ball = new GolfBall(palette.ball, null, gameState.ballStyle);
    this.ball.setPosition(tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0)));
    this.ball.addToScene(this.scene);
    this._applyTrailQuality(this.ball);

    // Place cup
    this.cup = new HoleCup(cup, palette.cup);
    this.cup.addToScene(this.scene);

    // Place tee marker
    this.tee = new TeeMarker(tee, palette.cup);
    this.tee.addToScene(this.scene);

    // Place wormholes — pass tee so the portal faces the player
    for (const wPos of (this._holeData.wormholes || [])) {
      const wormhole = new Wormhole(wPos, tee);
      wormhole.addToScene(this.scene);
      this.wormholes.push(wormhole);
    }

    if (this._holeData.boss?.kind === 'WORLDEATER') {
      this.worldEater = new WorldEater(this._holeData.boss);
      this.worldEater.addToScene(this.scene);
      this._beginWorldEaterIntroPose();
    }

    // Camera: start pointing at tee
    this._cameraTarget.copy(tee);
    this._cameraPos.set(
      tee.x,
      tee.y + CAMERA.FOLLOW_HEIGHT,
      tee.z + CAMERA.FOLLOW_DISTANCE,
    );
    this.camera.position.copy(this._cameraPos);
    this.camera.lookAt(this._cameraTarget);

    // Face toward cup at hole start
    this._facingDir.subVectors(cup, tee).normalize();
    if (this._facingDir.lengthSq() < 0.01) this._facingDir.set(0, 0, -1);

    // Kick off hole-intro cinematic — block all input until done/skipped
    this.inputSystem.enabled = false;
    this._state = 'CINEMATIC';
    gameState.aimState = 'CINEMATIC';
    if (this._holeData.boss?.kind === 'WORLDEATER' && this.worldEater) {
      this._startBossIntroCinematic(tee.clone(), cup.clone());
    } else {
      this.cinematic.start(
        cup.clone(), tee.clone(), this._facingDir.clone(),
        CAMERA.FOLLOW_DISTANCE, CAMERA.FOLLOW_HEIGHT,
      );
    }
    audioManager.playCinematicSwish();

    // Reset ball trail for this hole
    if (this.ball?.trail) this.ball.trail.setActive(false);

    // Wire input
    this.inputSystem.setBallPosition(this.ball.position);
    this.inputSystem.setPlanets(this.planets);

    // Place portals left/right of tee on every hole
    this.portalSystem.placePortals(tee, this._facingDir);

    // Ghost balls are spawned on-demand when ball_state or shot arrives with matching holeIndex
    // (prevents showing ghosts for players who are on a different hole)

    if (this.cometSystem) this.cometSystem.onHoleLoaded();

    // Spawn collectibles for this hole
    const holeSeedNum = typeof holeSeed === 'string'
      ? holeSeed.split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)
      : holeSeed;
    this.collectibles.spawnForHole(this._holeData, Math.abs(holeSeedNum) + holeIndex * 997);

    this._planetPhysicsTimeMs = Date.now();

    eventBus.emit(Events.HOLE_LOADED, {
      holeIndex,
      archetype: this._holeData.archetype,
      bossKind: this._holeData.boss?.kind ?? null,
    });
  }

  _loadNextHole() {
    const next = gameState.currentHole + 1;
    if (next >= gameState.totalHoles) {
      gameState.gameComplete = true;
      eventBus.emit(Events.GAME_COMPLETE, { players: gameState.players });

      // Portals remain at their last hole positions — player can exit from there
      return;
    }
    this.loadHole(next);
  }

  _clearCurrentHole() {
    this._attachedPlanetIdx  = -1;
    this._lastValidPlanetIdx = -1;
    this._bouncePlanetIdx    = -1;
    this._bounceStreak       = 0;
    this._orbitalCapture.reset();
    this.inputSystem.setOrbitToggleAllowed(false);

    // Remove planets
    for (const p of this.planetObjects) {
      p.removeFromScene(this.scene);
    }
    this.trajectoryPreview.clearHighlights(this.planetObjects);
    this.planetObjects = [];
    this.planets = [];

    // Remove ball
    if (this.ball) {
      this.ball.removeFromScene(this.scene);
      this.ball = null;
    }
    // Remove cup
    if (this.cup) {
      this.cup.removeFromScene(this.scene);
      this.cup = null;
    }
    // Remove tee
    if (this.tee) {
      this.tee.removeFromScene(this.scene);
      this.tee = null;
    }

    // Remove wormholes
    for (const w of this.wormholes) w.removeFromScene(this.scene);
    this.wormholes = [];

    if (this._bossIntroWormhole) {
      this._bossIntroWormhole.removeFromScene(this.scene);
      this._bossIntroWormhole = null;
    }
    this._disposeWorldEaterIntroPathDebug();
    this._bossIntroPreviewHold = false;

    if (this.worldEater) {
      this.worldEater.removeFromScene(this.scene);
      this.worldEater = null;
    }

    this.trajectoryPreview.hide();

    // Clear remote ghost balls (trail disposed inside removeFromScene)
    for (const remote of this._remoteBalls.values()) {
      remote.ball.removeFromScene(this.scene);
    }
    this._remoteBalls.clear();

    // Clear collectibles
    if (this.collectibles) this.collectibles.clear();

    // Reset per-hole state
    this._holeCompleteEmitted = false;
    this._holeStartTime       = null;
    this._playersHoled.clear();
    this._bossIntroPending = false;
    this._bossWarningShown = false;
  }

  _emitWorldEaterWarning() {
    if (this._bossWarningShown) return;
    this._bossWarningShown = true;
    this._bossIntroPending = false;
    eventBus.emit(Events.WORLDEATER_WARNING);
  }

  _syncWorldEaterIntroConfig() {
    if (!this.worldEater?.config) return;
    Object.assign(this.worldEater.config, {
      INTRO_DURATION: WORLDEATER.INTRO_DURATION,
      INTRO_APPROACH_END: WORLDEATER.INTRO_APPROACH_END,
      INTRO_SEAL_FADE_START: WORLDEATER.INTRO_SEAL_FADE_START,
      INTRO_SEAL_BLEND_START: WORLDEATER.INTRO_SEAL_BLEND_START,
      INTRO_CAMERA_CLOSE_END: WORLDEATER.INTRO_CAMERA_CLOSE_END,
      INTRO_CAMERA_RETURN_START: WORLDEATER.INTRO_CAMERA_RETURN_START,
      INTRO_WORMHOLE_POS: WORLDEATER.INTRO_WORMHOLE_POS,
      INTRO_WORMHOLE_SCALE: WORLDEATER.INTRO_WORMHOLE_SCALE,
      INTRO_ORBIT_RADIUS: WORLDEATER.INTRO_ORBIT_RADIUS,
      INTRO_ORBIT_DIRECTION: WORLDEATER.INTRO_ORBIT_DIRECTION,
      INTRO_ENTRY_ANGLE_OFFSET: WORLDEATER.INTRO_ENTRY_ANGLE_OFFSET,
      INTRO_CURVE_LIFT: WORLDEATER.INTRO_CURVE_LIFT,
      INTRO_SEGMENT_SPACING: WORLDEATER.INTRO_SEGMENT_SPACING,
    });
  }

  _getWorldEaterIntroPos() {
    return this._holeData?.boss?.introWormholePos?.clone?.()
      ?? new Vector3(...WORLDEATER.INTRO_WORMHOLE_POS);
  }

  _disposeWorldEaterIntroPathDebug() {
    if (!this._bossIntroPathDebug) return;
    this.scene.remove(this._bossIntroPathDebug);
    this._bossIntroPathDebug.traverse?.((obj) => {
      obj.geometry?.dispose?.();
      obj.material?.dispose?.();
      obj.line?.geometry?.dispose?.();
      obj.line?.material?.dispose?.();
      obj.cone?.geometry?.dispose?.();
      obj.cone?.material?.dispose?.();
    });
    this._bossIntroPathDebug = null;
  }

  setWorldEaterIntroPathVisible(visible) {
    this._bossIntroPathVisible = Boolean(visible);
    this.refreshWorldEaterIntroPath();
  }

  refreshWorldEaterIntroPath() {
    this._disposeWorldEaterIntroPathDebug();
    if (!this._bossIntroPathVisible || !this.worldEater || this._holeData?.boss?.kind !== 'WORLDEATER') {
      return;
    }

    this._syncWorldEaterIntroConfig();
    const introPos = this._getWorldEaterIntroPos();
    this.worldEater.previewCinematicIntro({
      wormholePos: introPos,
      targetPos: this._holeData.boss.center,
    });
    const points = this.worldEater.getCinematicIntroPathPoints(120);
    if (points.length < 2) return;

    const group = new Group();
    const pathGeo = new BufferGeometry().setFromPoints(points);
    const pathMat = new LineBasicMaterial({
      color: 0xff4fd8,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    const line = new Line(pathGeo, pathMat);
    line.renderOrder = 2000;
    group.add(line);

    const arrowStep = Math.max(10, Math.floor(points.length / 7));
    for (let i = arrowStep; i < points.length - 2; i += arrowStep) {
      const dir = points[i + 1].clone().sub(points[i - 1]);
      if (dir.lengthSq() < 0.001) continue;
      dir.normalize();
      const arrow = new ArrowHelper(dir, points[i], 70, 0x8ff7ff, 24, 11);
      arrow.renderOrder = 2001;
      group.add(arrow);
    }

    this._bossIntroPathDebug = group;
    this.scene.add(group);
  }

  previewWorldEaterIntro(progress = this._bossIntroPreviewProgress, refreshPath = true) {
    if (!this.worldEater || this._holeData?.boss?.kind !== 'WORLDEATER') return false;
    this._bossIntroPreviewHold = true;
    this._bossIntroPreviewProgress = Math.max(0, Math.min(1, progress));
    this._syncWorldEaterIntroConfig();
    const introPos = this._getWorldEaterIntroPos();
    this.worldEater.previewCinematicIntro({
      wormholePos: introPos,
      targetPos: this._holeData.boss.center,
    });
    this.worldEater.setCinematicIntroProgress(this._bossIntroPreviewProgress);
    if (refreshPath) this.refreshWorldEaterIntroPath();
    return true;
  }

  clearWorldEaterIntroPreview() {
    if (!this._bossIntroPreviewHold) return;
    this._bossIntroPreviewHold = false;
    if (this.worldEater && this._state !== 'CINEMATIC') this.worldEater.update(0);
  }

  _beginWorldEaterIntroPose() {
    if (!this.worldEater || this._holeData?.boss?.kind !== 'WORLDEATER') return null;
    this._bossIntroPreviewHold = false;
    this._syncWorldEaterIntroConfig();
    if (this._bossIntroWormhole) {
      this._bossIntroWormhole.removeFromScene(this.scene);
      this._bossIntroWormhole = null;
    }
    const introPos = this._getWorldEaterIntroPos();
    this._bossIntroWormhole = new Wormhole(introPos, this._holeData.boss.center.clone());
    this._bossIntroWormhole.setVisualScale(WORLDEATER.INTRO_WORMHOLE_SCALE);
    this._bossIntroWormhole.addToScene(this.scene);
    this.worldEater.startCinematicIntro({
      wormholePos: introPos,
      targetPos: this._holeData.boss.center,
    });
    this.refreshWorldEaterIntroPath();
    return introPos;
  }

  replayWorldEaterIntro() {
    if (!this.worldEater || this._holeData?.boss?.kind !== 'WORLDEATER') return false;
    this._bossIntroPreviewHold = false;
    this._bossIntroPending = true;
    this._bossWarningShown = false;
    this._beginWorldEaterIntroPose();
    this.inputSystem.enabled = false;
    this._state = 'CINEMATIC';
    gameState.aimState = 'CINEMATIC';
    this.inputSystem.hideBar();
    this.trajectoryPreview.hide();
    this._startBossIntroCinematic(this._holeData.tee.clone(), this._holeData.cup.clone());
    audioManager.playCinematicSwish();
    return true;
  }

  _startBossIntroCinematic(teePos, cupPos) {
    const introPos = this._getWorldEaterIntroPos();
    const center = this._holeData.boss.center.clone();
    const facing = this._facingDir.clone().normalize();
    const behind = facing.clone().negate();
    const worldUp = Math.abs(facing.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(0, 0, -1);
    const camRight = new Vector3().crossVectors(facing, worldUp).normalize();
    const camUp = new Vector3().crossVectors(camRight, facing).normalize();
    const finalPos = teePos.clone()
      .addScaledVector(behind, CAMERA.FOLLOW_DISTANCE)
      .addScaledVector(camUp, CAMERA.FOLLOW_HEIGHT);
    const finalLook = teePos.clone().addScaledVector(facing, 8);

    this.cinematic.startScript({
      duration: WORLDEATER.INTRO_DURATION,
      onUpdate: ({ raw, eased, camera }) => {
        if (this._bossIntroPending && raw > 0.1) this._emitWorldEaterWarning();

        const headPos = this.worldEater?.getHeadPosition(new Vector3()) ?? introPos.clone();
        const coilState = this.worldEater?.getCinematicIntroState?.()
          ?? { coilBlend: 0, wormholePos: introPos.clone() };
        const wormholePos = coilState.wormholePos ?? introPos;
        const stage1 = WORLDEATER.INTRO_CAMERA_CLOSE_END;
        const stage2 = WORLDEATER.INTRO_CAMERA_RETURN_START;

        if (raw < stage1) {
          const t = raw / stage1;
          const posA = wormholePos.clone().add(new Vector3(-120, 40, 150));
          const posB = wormholePos.clone().add(new Vector3(-42, 20, 92));
          camera.position.copy(posA.lerp(posB, t));
          camera.lookAt(headPos.clone().lerp(wormholePos, 0.3));
          return;
        }

        if (raw < stage2) {
          const t = (raw - stage1) / (stage2 - stage1);
          const posA = center.clone().add(new Vector3(520, 210, 430));
          const posB = center.clone().add(new Vector3(-240, 168, 340));
          const lookA = headPos.clone().lerp(center, 0.22);
          const lookB = center.clone().add(new Vector3(0, 12, 0));
          camera.position.copy(posA.lerp(posB, eased * t));
          camera.lookAt(lookA.lerp(lookB, coilState.coilBlend));
          return;
        }

        const t = (raw - stage2) / (1 - stage2);
        const posA = center.clone().add(new Vector3(-240, 168, 340));
        const lookA = center.clone().add(new Vector3(0, 12, 0));
        camera.position.copy(posA.lerp(finalPos, t));
        camera.lookAt(lookA.lerp(finalLook, t));
      },
      onSkip: () => {
        this.worldEater?.finishCinematicIntro?.();
        if (this._bossIntroWormhole) {
          this._bossIntroWormhole.removeFromScene(this.scene);
          this._bossIntroWormhole = null;
        }
        if (this._bossIntroPending) this._emitWorldEaterWarning();
        this.camera.position.copy(finalPos);
        this.camera.lookAt(finalLook);
      },
    });
  }

  /**
   * Convert screen drag vector to 3D shot velocity.
   * The camera is overhead-ish; we need to project 2D drag into 3D space.
   */
  _computeShotVelocity(dragScreenVec, dragDist, precomputedPower = null) {
    if (!dragScreenVec || dragDist < 0.1) return null;

    // Phase 2 fires with pre-computed power (oscillating bar value * MAX_POWER)
    const power = precomputedPower !== null
      ? precomputedPower
      : (Math.min(dragDist, AIM.MAX_DRAG_DISTANCE) / AIM.MAX_DRAG_DISTANCE) * AIM.MAX_POWER;

    // Project camera axes onto horizontal XZ plane so:
    //   drag left/right = strafe (X)
    //   drag up/down    = forward/backward (Z, into scene)
    const camRight = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    camRight.y = 0;
    if (camRight.lengthSq() < 0.0001) camRight.set(1, 0, 0);
    else camRight.normalize();

    // Camera forward = -Z column of matrix, projected onto XZ
    const camFwd = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2).negate();
    camFwd.y = 0;
    if (camFwd.lengthSq() < 0.0001) camFwd.set(0, 0, -1);
    else camFwd.normalize();

    const nx =  dragScreenVec.x / window.innerWidth;
    const ny = -dragScreenVec.y / window.innerHeight; // screen Y up = world forward

    const shotDir = new Vector3()
      .addScaledVector(camRight, nx)
      .addScaledVector(camFwd,   ny)
      .normalize();

    return shotDir.multiplyScalar(power);
  }

  _fireShot(data) {
    if (!this.ball || this._state === 'BALL_IN_FLIGHT') return;

    let velocity;

    if (data.dragScreenVec) {
      // Direction already baked into _facingDir during AIM_UPDATE rotation
      velocity = this._facingDir.clone().multiplyScalar(data.power ?? AIM.MAX_POWER * 0.5);
    } else if (data.direction && data.power != null) {
      // Multiplayer: direction is already a 3D vector
      const dir = new Vector3(data.direction.x, data.direction.y, data.direction.z);
      velocity = dir.normalize().multiplyScalar(data.power);
    }

    if (!velocity) return;

    // Snapshot pre-shot position + planet attachment for OOB recovery
    this._lastValidPos.copy(this.ball.position);
    this._lastValidPlanetIdx = this._attachedPlanetIdx;
    this._lastValidNormal.copy(this._attachedNormal);

    // In orbit mode: keep orbit active, just detach from surface
    // Normal mode: reset orbit state entirely
    if (this._orbitalCapture.isOrbiting) {
      this._attachedPlanetIdx = -1;
    } else {
      this._attachedPlanetIdx = -1;
      this._bouncePlanetIdx   = -1;
      this._bounceStreak      = 0;
      this._orbitalCapture.reset();
      this.inputSystem.setOrbitToggleAllowed(false);
    }
    this.ball.setVelocity(velocity);
    this._state = 'BALL_IN_FLIGHT';
    gameState.ballInFlight = true;
    gameState.aimState = 'BALL_IN_FLIGHT';
    gameState.currentStrokes++;

    // Start hole timer on first shot
    if (!this._holeStartTime) this._holeStartTime = Date.now();

    this.inputSystem.setAiming(false);
    this.inputSystem.hideBar();

    // Activate ball trail
    if (this.ball?.trail) {
      if (gameState.currentPlayer?.color != null) {
        this.ball.trail.setColor(gameState.currentPlayer.color);
      }
      this.ball.trail.setActive(true);
    }

    // Launch burst particles
    if (this._holeData) {
      this.launchBurst.trigger(this.ball.position.clone(), this._holeData.palette);
    }

    // Launch warp — FOV kick + speed lines scaled by power
    const shotPowerNorm = Math.min(1, (data.power ?? AIM.MAX_POWER * 0.5) / AIM.MAX_POWER);
    this.launchWarp.trigger(shotPowerNorm);

    // Hit-freeze: pause physics for a few frames for feel
    this._hitFreezeFrames = 4;
    this._stuckFrames = 0;
    this._lastBounceTime = 0;
    this._launchGraceFrames = PHYSICS.LAUNCH_GRACE_FRAMES;
    this._voidFrames = 0;
    this._trajNeedsRecompute = true; // compute trajectory once after hit-freeze clears
    this._accumDt = 0;
  }

  /**
   * Main update loop — called every frame.
   * @param {number} dt delta time (already capped)
   */
  update(dt) {
    if (!this._holeData || !this.ball) return;
    const simDt = this._devFreezeAll ? 0 : dt;

    // Always accumulate world time for default planet sway
    this._worldT += simDt;

    // Cinematic intro — world animates but gameplay is fully locked
    if (this._state === 'CINEMATIC') {
      for (const p of this.planetObjects) p.update(simDt, this.serverEvents.isStatic);
      if (this.cup) this.cup.update(simDt);
      if (this._bossIntroWormhole) this._bossIntroWormhole.update(simDt);
      if (this.worldEater) this.worldEater.update(simDt);
      if (this.starField)   this.starField.update(simDt);
      if (this.backgroundPlanets) this.backgroundPlanets.update(simDt, this.camera);
      if (this.cometSystem) this.cometSystem.update(simDt);
      this.cinematic.update(simDt);
      tweenUpdate();
      return;
    }

    // Remote balls — always simulate regardless of local state
    if (this._state !== 'HOLE_COMPLETE') this._updateRemoteBalls(simDt);

    // Direction arrow — show in IDLE/AIMING, hide in flight
    if (this._aimArrow && this.ball) {
      const showArrow = this._state === 'IDLE' || this._state === 'AIMING';
      this._aimArrow.visible = showArrow;
      if (showArrow) {
        this._aimArrow.position.copy(this.ball.position);
        this._aimArrow.setDirection(this._facingDir.clone().normalize());
      }
    }

    // Server events (deterministic wall-clock events)
    this.serverEvents.update(simDt);

    // Apply server event effects to planet positions (MAP_FLIP + default sway)
    const frameNowMs = Date.now();
    this._applyPlanetEventEffects(frameNowMs);
    if (this._state !== 'BALL_IN_FLIGHT') {
      this._planetPhysicsTimeMs = frameNowMs;
    }

    // Planet occlusion: fade planets between camera and ball
    this._updatePlanetOcclusion();

    if (this._bossIntroPreviewHold && this.worldEater) {
      this.previewWorldEaterIntro(this._bossIntroPreviewProgress, false);
    } else if (this.worldEater) {
      this.worldEater.update(simDt);
      this._worldEaterBounceCooldown = Math.max(0, this._worldEaterBounceCooldown - simDt);
    }

    // Ball follows its attached planet while resting (IDLE / AIMING)
    if (this._attachedPlanetIdx >= 0 && this._state !== 'BALL_IN_FLIGHT') {
      const planet = this.planets[this._attachedPlanetIdx];
      if (planet) {
        this.ball.position
          .copy(planet.position)
          .addScaledVector(this._attachedNormal, planet.radius + BALL.RADIUS);
        this.ball.syncMesh();
      }
    }

    // ── Orbital Capture update (visuals only, ball follows normal physics) ──
    if (this._orbitalCapture.isActive) {
      this._orbitalCapture.update(simDt);
    }

    // Collectibles
    if (this._state === 'BALL_IN_FLIGHT') {
      this.collectibles.update(simDt, this.ball);
    } else {
      this.collectibles.update(simDt, null); // still animate gems, skip collect check
    }

    // Trajectory: computed after planet positions + collectibles are updated
    // so the simulation uses the same state as the actual flight physics
    if (this.ball && this._holeData && this._state !== 'HOLE_COMPLETE') {
      const serverZeroG = this.serverEvents.gravityScale === 0.0;
      const collectibleGravity = this.collectibles.gravityScale ?? 1;
      const orbitBoost = this._orbitalCapture.isOrbiting ? ORBIT.GRAVITY_BOOST : 1;
      const combinedGravity = this.serverEvents.gravityScale * collectibleGravity * orbitBoost;

      const trajPlanets = this._orbitalCapture.isOrbiting
        ? [this.planets[this._orbitalCapture.planetIdx]]
        : this.planets;
      const trajOrbitPlanet = this._orbitalCapture.isOrbiting ? trajPlanets[0] : null;

      const previewCupUnlocked = !this.worldEater || this.worldEater.canHoleBall();
      const blackHole = this.cup && previewCupUnlocked ? {
        position: this.cup.position,
        pullRadius: HOLE.BLACK_HOLE_PULL_RADIUS,
        gravity: HOLE.BLACK_HOLE_GRAVITY,
        cupRadius: HOLE.CUP_RADIUS,
      } : null;

      const wormholePositions = this.wormholes.length > 0
        ? this.wormholes.map(w => w.position)
        : null;

      const trajOptions = {
        blackHole,
        zeroGravity: serverZeroG,
        tee: this._holeData.tee,
        cup: this._holeData.cup,
        wormholes: wormholePositions,
        bossPreview: this.worldEater ?? null,
        startTimeMs: this._state === 'BALL_IN_FLIGHT' ? this._planetPhysicsTimeMs : frameNowMs,
      };
      if (this._hasDynamicPlanetMotion()) {
        trajOptions.planetMotion = {
          samplePositions: (timeMs, planetsForTime) => this._applyPlanetEventEffects(timeMs, false, planetsForTime),
        };
      }

      if (this._state === 'BALL_IN_FLIGHT') {
        const flightVel = this.ball.velocity.clone();
        if (flightVel.length() > 1.0) {
          if (this._trajNeedsRecompute) {
            // Recompute trajectory from current ball state (shot fired or bounce).
            // Pass remaining grace/freeze so simulation matches actual physics exactly.
            this._trajNeedsRecompute = false;
            trajOptions.graceFrames    = this._launchGraceFrames;
            trajOptions.hitFreezeFrames = this._hitFreezeFrames;
            this.trajectoryPreview.update(
              this.ball.position.clone(), flightVel, trajPlanets, this.planets,
              combinedGravity, trajOrbitPlanet, trajOptions,
              this.camera, this.planetObjects,
            );
          } else {
            // Just trim dots behind the ball — no re-simulation
            this.trajectoryPreview.advanceFrom(this.ball.position);
          }
          this.trajectoryPreview.show();
        }
      } else {
        const power = this.inputSystem._power ?? 0;
        if (power > 0.01) {
          const vel = this._facingDir.clone().multiplyScalar(power * AIM.MAX_POWER);
          trajOptions.graceFrames = PHYSICS.LAUNCH_GRACE_FRAMES;
          trajOptions.hitFreezeFrames = 4; // Match actual shot's hit-freeze
          const outcome = this.trajectoryPreview.update(
            this.ball.position.clone(), vel, trajPlanets, this.planets,
            combinedGravity, trajOrbitPlanet, trajOptions,
            this.camera, this.planetObjects,
          );
          this.trajectoryPreview.show();
          this.inputSystem.setTrajectoryStatus(outcome);
        } else {
          this.trajectoryPreview.hide();
          this.trajectoryPreview.clearHighlights(this.planetObjects);
          this.inputSystem.setTrajectoryStatus(null);
        }
      }
    }

    // Update background ambiance
    if (this.spaceBg)    this.spaceBg.update(simDt, this.camera);
    if (this.starField)  this.starField.update(simDt);
    if (this.backgroundPlanets) this.backgroundPlanets.update(simDt, this.camera);
    if (this.cometSystem) this.cometSystem.update(simDt);

    // Update planet gravity fields
    for (const p of this.planetObjects) p.update(simDt, this.serverEvents.isStatic);

    // Update cup pulsing
    if (this.cup) this.cup.update(simDt);

    // Update wormholes
    for (const w of this.wormholes) w.update(simDt);

    // Update portal
    this.portalSystem.update(simDt, this.camera);

    // Update effects (always, even during freeze)
    this.launchBurst.update(simDt);
    this.screenShake.update(simDt);
    this.launchWarp.update(simDt, this.ball?.position);
    if (this.ball) this.ball.update(simDt);

    // Update tween animations (palette background fade etc.)
    tweenUpdate();

    // Broadcast position even at rest so late-joining peers can place the ghost correctly
    if (this.ball && this._state !== 'BALL_IN_FLIGHT') {
      this._syncFrameCounter++;
      if (this._syncFrameCounter >= 20) { // ~0.33s at 60fps
        this._syncFrameCounter = 0;
        eventBus.emit(Events.BALL_POS_SYNC, {
          pos: this.ball.position,
          vel: this.ball.velocity,
          holeIndex: gameState.currentHole,
          planetIdx: this._attachedPlanetIdx,
          normal: this._attachedNormal,
        });
      }
    }

    if (this._state === 'BALL_IN_FLIGHT') {
      const orbitBoost = this._orbitalCapture.isOrbiting ? ORBIT.GRAVITY_BOOST : 1;
      const cupUnlocked = !this.worldEater || this.worldEater.canHoleBall();

      // In orbit mode, only the orbit planet's gravity applies, with boundary
      const physicsPlanets = this._orbitalCapture.isOrbiting
        ? [this.planets[this._orbitalCapture.planetIdx]]
        : this._holeData.planets;
      const orbitPlanet = this._orbitalCapture.isOrbiting ? physicsPlanets[0] : null;
      const flightTimeScale = Math.max(0.1, PHYSICS.FLIGHT_TIME_SCALE ?? 1);

      // Fixed-timestep accumulator: physics always advances in exact TRAJECTORY_DT
      // chunks so Euler integration matches the trajectory simulation step-for-step.
      this._accumDt += Math.min(simDt, 0.1) * flightTimeScale;
      let result = { bounced: false, bouncePlanet: null };
      let advancedPlanetTime = false;
      let enteredWormhole = null;
      while (this._accumDt >= AIM.TRAJECTORY_DT) {
        if (this._hasDynamicPlanetMotion()) {
          this._planetPhysicsTimeMs += AIM.TRAJECTORY_DT * 1000;
          this._applyPlanetEventEffects(this._planetPhysicsTimeMs, false, this.planets);
          advancedPlanetTime = true;
        }

        if (this._hitFreezeFrames > 0) {
          this._hitFreezeFrames--;
          this._accumDt -= AIM.TRAJECTORY_DT;
          continue;
        }

        // Grace period: ramp gravity 0→1 over LAUNCH_GRACE_FRAMES after shot.
        // This must tick per fixed physics step, not per rendered frame, or
        // low-FPS devices get a different launch curve than the trajectory preview.
        let gravityScale = 1.0;
        if (this._launchGraceFrames > 0) {
          this._launchGraceFrames--;
          gravityScale = 1.0 - (this._launchGraceFrames / PHYSICS.LAUNCH_GRACE_FRAMES);
        }

        const combinedGravityScale = gravityScale
          * this.serverEvents.gravityScale
          * this.collectibles.gravityScale
          * orbitBoost;

        result = stepBall(this.ball, physicsPlanets, AIM.TRAJECTORY_DT, combinedGravityScale, orbitPlanet);

        // Black-hole cup pull is part of the deterministic flight path, so it
        // also has to run at the same fixed timestep as simulateTrajectory().
        if (this.cup && cupUnlocked) {
          const cupDist = this.ball.position.distanceTo(this.cup.position);
          if (cupDist < HOLE.BLACK_HOLE_PULL_RADIUS && cupDist > HOLE.CUP_RADIUS) {
            const t = 1 - cupDist / HOLE.BLACK_HOLE_PULL_RADIUS;
            const distSq = Math.max(cupDist * cupDist, HOLE.CUP_RADIUS * HOLE.CUP_RADIUS);
            const strength = HOLE.BLACK_HOLE_GRAVITY * t * t / distSq;
            const toCup = new Vector3().subVectors(this.cup.position, this.ball.position).normalize();
            this.ball.velocity.addScaledVector(toCup, strength * AIM.TRAJECTORY_DT * 60);
          }
        }

        // Wormhole suction changes velocity, so keep it fixed-step too. Visual
        // debris deflection remains frame-based below because the preview does
        // not include debris collisions.
        for (const worm of this.wormholes) {
          const distToWorm = this.ball.position.distanceTo(worm.position);
          if (distToWorm < WORMHOLE_CAPTURE_RADIUS) {
            worm.applySuction(this.ball, AIM.TRAJECTORY_DT);
            if (worm.checkBallEntered(this.ball.position)) {
              enteredWormhole = worm;
              break;
            }
          }
        }

        this._accumDt -= AIM.TRAJECTORY_DT;
        if (enteredWormhole) {
          this._accumDt = 0;
          break;
        }
        if (result.bounced) {
          this._accumDt = 0;
          this._trajNeedsRecompute = true; // recompute trajectory post-bounce
          break;
        }
      }
      if (this._hasDynamicPlanetMotion()) {
        if (!advancedPlanetTime) this._planetPhysicsTimeMs = frameNowMs;
        this._applyPlanetEventEffects(this._planetPhysicsTimeMs);
      } else {
        this._planetPhysicsTimeMs = frameNowMs;
      }

      if (enteredWormhole) {
        this.ball.syncMesh();
        this._onWormholeEnter(enteredWormhole);
        return;
      }

      // ZERO_GRAVITY sticky: ball touches a planet → kill velocity, stay on surface
      if (this.serverEvents.gravityScale === 0.0) {
        for (const planet of this.planets) {
          const dist = this.ball.position.distanceTo(planet.position);
          if (dist < planet.radius + BALL.RADIUS + 0.5) {
            const normal = this.ball.position.clone().sub(planet.position).normalize();
            this.ball.position.copy(planet.position).addScaledVector(normal, planet.radius + BALL.RADIUS);
            this.ball.velocity.set(0, 0, 0);
            break;
          }
        }
      }

      this.ball.syncMesh();

      // Billiard: check ball-ball collisions with remote ghosts
      this._checkBallCollisions();

      // Track facing direction from velocity
      const speed = this.ball.velocity.length();
      if (speed > 2) this._facingDir.lerp(this.ball.velocity.clone().normalize(), 0.15);

      // Spin ball mesh based on velocity
      this.ball.updateSpin(simDt * flightTimeScale);


      // Update input system with current ball position
      this.inputSystem.setBallPosition(this.ball.position);

      // Broadcast ball state to remote players every 2 frames (~30 Hz)
      this._syncFrameCounter++;
      if (this._syncFrameCounter >= 2) {
        this._syncFrameCounter = 0;
        eventBus.emit(Events.BALL_POS_SYNC, {
          pos: this.ball.position,
          vel: this.ball.velocity,
          holeIndex: gameState.currentHole,
        });
      }

      if (result.bounced) {
        const now = Date.now();
        if (now - this._lastBounceTime > PHYSICS.BOUNCE_COOLDOWN_MS) {
          this._lastBounceTime = now;
          this._bounceGraceFrames = 90;
          this._hitFreezeFrames = Math.max(this._hitFreezeFrames, 4);
          if (this._holeData) this.launchBurst.triggerBounce(this.ball.position.clone(), this._holeData.palette);

          const planetIdx = result.bouncePlanet
            ? this._holeData.planets.indexOf(result.bouncePlanet)
            : -1;

          if (planetIdx >= 0) {
            this.planetObjects[planetIdx]?.addCrater(this.ball.position.clone(), this.ball.velocity.length());

            if (!this._orbitalCapture.isOrbiting) {
              // Track consecutive bounces on the same planet
              if (planetIdx === this._bouncePlanetIdx) {
                this._bounceStreak++;
              } else {
                this._bouncePlanetIdx = planetIdx;
                this._bounceStreak    = 1;
              }

              // 3rd bounce on the same planet → pin the ball + enable Orbital Capture
              if (this._bounceStreak >= 3) {
                this._bouncePlanetIdx = planetIdx;
                this._bounceStreak    = 3;
                this.ball.velocity.set(0, 0, 0);
                // Snap cleanly to surface
                const planet = this.planets[planetIdx];
                const normal = this.ball.position.clone().sub(planet.position).normalize();
                this.ball.position.copy(planet.position).addScaledVector(normal, planet.radius + BALL.RADIUS);
                this.ball.syncMesh();
                // Attach so ball travels with the planet
                this._attachedPlanetIdx = planetIdx;
                this._attachedNormal.copy(normal);
                this._lastValidPlanetIdx = planetIdx;
                this._lastValidNormal.copy(normal);
                // Transition to IDLE — orbital capture is now available
                if (this.ball?.trail) this.ball.trail.setActive(false);
                gameState.ballInFlight = false;
                gameState.aimState = 'IDLE';
                this._state = 'IDLE';
                this.inputSystem.setOrbitToggleAllowed(true);
                if (this.cup) {
                  const toCup = new Vector3().subVectors(this.cup.position, this.ball.position);
                  if (toCup.lengthSq() > 0.01) this._facingDir.copy(toCup.normalize());
                }
                // Always show power bar and trajectory when ball is at rest
                this.inputSystem.showBar();
                this.trajectoryPreview.show();
                eventBus.emit(Events.BALL_STOPPED, {
                  pos: this.ball.position.clone(),
                  holeIndex: gameState.currentHole,
                  planetIdx: this._attachedPlanetIdx,
                  normal: this._attachedNormal.clone(),
                });
                return; // skip remaining flight logic this frame
              }
            }
          } else if (!this._orbitalCapture.isOrbiting) {
            // Bounced off something that isn't a tracked planet — reset streak
            this._bouncePlanetIdx = -1;
            this._bounceStreak    = 0;
          }

          eventBus.emit(Events.BALL_BOUNCED, {
            position:   this.ball.position.clone(),
            planetType: result.bouncePlanet?.type ?? 'ROCKY',
            speed:      this.ball.velocity.length(),
          });
          this._syncFrameCounter = 0;
          eventBus.emit(Events.BALL_POS_SYNC, {
            pos:       this.ball.position,
            vel:       this.ball.velocity,
            holeIndex: gameState.currentHole,
            bounce:    true,
          });
        }
      }

      // Black hole: proximity shake + gravitational pull within radius
      if (this.cup) {
        const cupDist = this.ball.position.distanceTo(this.cup.position);

        // Shake zone (close approach)
        const shakeZone = HOLE.CUP_RADIUS * 4;
        if (cupDist < shakeZone) {
          const intensity = Math.pow(1 - cupDist / shakeZone, 2) * 0.25;
          this.screenShake.trigger(intensity, 0.08);
        }

        // Emit proximity for audio drone effect (0 = far, 1 = at edge)
        if (cupUnlocked && cupDist < HOLE.BLACK_HOLE_PULL_RADIUS) {
          const proximity = 1 - Math.min(cupDist / HOLE.BLACK_HOLE_PULL_RADIUS, 1);
          eventBus.emit(Events.BLACK_HOLE_PROXIMITY, { proximity });
        } else {
          eventBus.emit(Events.BLACK_HOLE_PROXIMITY, { proximity: 0 });
        }

      }

      if (this.worldEater) {
        const interaction = this.worldEater.interactWithBall(
          this.ball,
          dt,
          this._worldEaterBounceCooldown <= 0,
        );
        if (interaction?.type === 'body-bounce') {
          this._worldEaterBounceCooldown = 0.18;
          this.ball.syncMesh();
          this._trajNeedsRecompute = true;
          this.screenShake.trigger(0.5, 0.18);
        } else if (interaction?.type === 'shield-block') {
          this._worldEaterBounceCooldown = 0.18;
          this.ball.syncMesh();
          this._trajNeedsRecompute = true;
          this.screenShake.trigger(0.75, 0.26);
        } else if (interaction?.type === 'weakspot-hit') {
          this._worldEaterBounceCooldown = 0.18;
          this.ball.syncMesh();
          this._trajNeedsRecompute = true;
          this.screenShake.trigger(interaction.opened ? 1.4 : 0.9, interaction.opened ? 0.45 : 0.28);
        } else if (interaction?.type === 'chomp') {
          this._onWorldEaterChomp();
          return;
        } else if (interaction?.type === 'boost') {
          this._onWorldEaterBoost(interaction.position, interaction.velocity);
          return;
        }
      }

      // Stuck detection: if ball lingers near any planet surface, force settle
      const ballSpeed = this.ball.velocity.length();

      // Drive flight drone — normalised speed 0→1
      audioManager.setFlightSpeed(Math.min(ballSpeed / PHYSICS.MAX_SPEED, 1));
      const nearSurface = this._holeData.planets.some(p =>
        this.ball.position.distanceTo(p.position) < p.radius + BALL.RADIUS * 3
      );
      if (nearSurface && ballSpeed < 12) {
        this._stuckFrames++;
      } else {
        this._stuckFrames = 0;
      }

      // Check portal entry
      this.portalSystem.checkPortalEntry(this.ball.position);

      // Wormhole: debris deflection (always), suction + entry (when close)
      for (const worm of this.wormholes) {
        worm.applyDebrisDeflection(this.ball);
        if (worm.checkBallEntered(this.ball.position)) {
          this._onWormholeEnter(worm);
          return;
        }
      }

      // Check cup
      if (this.cup && cupUnlocked && this.cup.checkBallHoled(this.ball)) {
        this._onBallHoled();
        return;
      }

      // Track last valid in-bounds position + planet attachment (updated before OOB check)
      if (nearSurface) {
        this._lastValidPos.copy(this.ball.position);
        let bestDist = Infinity;
        this._lastValidPlanetIdx = -1;
        for (let i = 0; i < this.planets.length; i++) {
          const d = this.ball.position.distanceTo(this.planets[i].position);
          if (d < bestDist) { bestDist = d; this._lastValidPlanetIdx = i; }
        }
        if (this._lastValidPlanetIdx >= 0) {
          this._lastValidNormal
            .subVectors(this.ball.position, this.planets[this._lastValidPlanetIdx].position)
            .normalize();
        }
      }

      // Hard outer limit (shouldn't normally trigger with the void checks below)
      if (this.ball.position.length() > HOLE.OUT_OF_BOUNDS_DISTANCE) {
        this._onOutOfBounds();
        return;
      }

      // Void detection — nearest "safe anchor" distance.
      // Anchors are: every planet surface, the tee, and the cup.
      // This bridges the tee→cluster and cup→cluster corridors so the ball can
      // legally travel between them without immediately triggering void OOB.
      const bpos = this.ball.position;
      let nearestSafeDist = this._holeData.planets.reduce((min, p) =>
        Math.min(min, bpos.distanceTo(p.position) - p.radius), Infinity);
      // Tee, cup, and wormholes act as anchor points (no radius, just position)
      nearestSafeDist = Math.min(
        nearestSafeDist,
        bpos.distanceTo(this._holeData.tee),
        bpos.distanceTo(this._holeData.cup),
      );
      for (const w of this.wormholes) {
        nearestSafeDist = Math.min(nearestSafeDist, bpos.distanceTo(w.position));
      }

      // Deep void: ball escaped every safe anchor → OOB
      if (nearestSafeDist > HOLE.VOID_OOB_SURFACE_DIST) {
        this._onOutOfBounds();
        return;
      }

      // Slow drift: away from all anchors and barely moving → OOB
      // Suppress for a few seconds after a bounce — bounce damping can drop speed
      // below the threshold even when the ball is still on a valid path.
      if (this._bounceGraceFrames > 0) {
        this._bounceGraceFrames--;
      } else if (nearestSafeDist > 160 && ballSpeed < HOLE.VOID_DRIFT_SPEED) {
        this._onOutOfBounds();
        return;
      }

      // Zero-gravity void: gravity is off so the ball never decelerates or curves back.
      if (this.serverEvents.gravityScale === 0.0) {
        // Slow drift far from any planet → OOB immediately
        if (nearestSafeDist > HOLE.VOID_ZERO_G_SLOW_DIST && ballSpeed < HOLE.VOID_ZERO_G_SLOW_SPEED) {
          this._onOutOfBounds();
          return;
        }
        // Far from any planet for too long → OOB
        if (nearestSafeDist > HOLE.VOID_ZERO_G_SURFACE_DIST) {
          this._voidFrames++;
          if (this._voidFrames > HOLE.VOID_ZERO_G_GRACE_FRAMES) {
            this._onOutOfBounds();
            return;
          }
        } else {
          this._voidFrames = 0;
        }
      } else {
        this._voidFrames = 0;
      }

      // Settle: ball at rest ON a planet, OR stuck near a planet surface too long
      const atRest = ballSpeed < PHYSICS.REST_VELOCITY && nearSurface;
      const stuck = this._stuckFrames > PHYSICS.STUCK_FRAMES;

      if (atRest || stuck) {
        this._stuckFrames = 0;
        if (this.ball?.trail) this.ball.trail.setActive(false);
        gameState.ballInFlight = false;
        gameState.aimState = 'IDLE';

        // Attach ball to the planet it's resting on so it travels with sway
        this._attachedPlanetIdx = -1;
        let closestDist = Infinity;
        for (let i = 0; i < this.planets.length; i++) {
          const d = this.ball.position.distanceTo(this.planets[i].position);
          if (d < this.planets[i].radius + BALL.RADIUS * 4 && d < closestDist) {
            closestDist = d;
            this._attachedPlanetIdx = i;
          }
        }
        if (this._attachedPlanetIdx >= 0) {
          this._attachedNormal
            .subVectors(this.ball.position, this.planets[this._attachedPlanetIdx].position)
            .normalize();
        }

        // In orbit mode the ball is always bounded to the orbit planet — don't
        // let a nearby planet steal the attachment and break the orbit button.
        if (this._orbitalCapture.isOrbiting && this._orbitalCapture.planetIdx >= 0) {
          this._attachedPlanetIdx = this._orbitalCapture.planetIdx;
          this._attachedNormal
            .subVectors(this.ball.position, this.planets[this._attachedPlanetIdx].position)
            .normalize();
        }

        // Orbit toggle available whenever ball is on a planet surface
        const orbitAllowed = this._orbitalCapture.isOrbiting
          ? this._attachedPlanetIdx === this._orbitalCapture.planetIdx
          : this._attachedPlanetIdx >= 0;
        this.inputSystem.setOrbitToggleAllowed(orbitAllowed);
        if (this._orbitalCapture.isOrbiting && orbitAllowed) {
          this.inputSystem.setOrbitActive(true);
        } else if (!orbitAllowed && !this._orbitalCapture.isOrbiting) {
          this._bouncePlanetIdx = -1;
          this._bounceStreak = 0;
        }

        // Broadcast stop with planet attachment so peers can follow sway
        eventBus.emit(Events.BALL_STOPPED, {
          pos: this.ball.position.clone(),
          holeIndex: gameState.currentHole,
          planetIdx: this._attachedPlanetIdx,
          normal: this._attachedNormal.clone(),
        });

        // Reset facing direction toward cup so trajectory always has a valid
        // default — avoids the "pointing into planet" problem after landing
        if (this.cup) {
          const toCup = new Vector3().subVectors(this.cup.position, this.ball.position);
          if (toCup.lengthSq() > 0.01) this._facingDir.copy(toCup.normalize());
        }

        // If player already entered power phase while ball was settling, jump to AIMING
        if (this.inputSystem.isInPowerPhase()) {
          this._state = 'AIMING';
        } else {
          this._state = 'IDLE';
          this.inputSystem.setAiming(false);
        }
        // Always show power bar and trajectory when ball is at rest
        this.inputSystem.showBar();
        this.trajectoryPreview.show();
      }
    }

    this._updateCamera(dt);
  }

  _applyPlanetRuntimeDefaults() {
    const scale = PLANET.VISUAL_SCALE ?? 1;
    for (let i = 0; i < this.planetObjects.length; i++) {
      const planetObj = this.planetObjects[i];
      planetObj.group.scale.setScalar(scale);
      planetObj.setRingStyle?.(PLANET.RING_SCALE, PLANET.RING_OPACITY_MULT);
      const raw = this.planets[i];
      if (raw) {
        if (raw._baseRadius === undefined) raw._baseRadius = raw.radius;
        raw.radius = raw._baseRadius * scale;
      }
    }
  }

  _updatePlanetOcclusion() {
    if (!this.ball || this.planetObjects.length === 0) return;

    const camPos  = this.camera.position;
    const ballPos = this.ball.position;

    // Ray from camera toward ball
    this._occRayDir.subVectors(ballPos, camPos);
    const rayLen = this._occRayDir.length();
    if (rayLen < 0.001) return;
    this._occRayDir.divideScalar(rayLen); // normalize in-place, no alloc

    for (let i = 0; i < this.planetObjects.length; i++) {
      const pObj    = this.planetObjects[i];
      const planet  = this.planets[i];

      // Vector from ray origin to sphere centre
      this._occOC.subVectors(planet.position, camPos);
      const tca = this._occOC.dot(this._occRayDir);

      // Only occlude planets that are between camera and ball
      if (tca < 0 || tca > rayLen) {
        pObj.setOpacity(1.0);
        continue;
      }

      // Perpendicular distance from planet centre to ray
      const d2 = this._occOC.lengthSq() - tca * tca;
      const threshold = planet.radius * planet.radius;

      if (d2 < threshold) {
        // Planet is in the way — fade it based on how centred the occlusion is
        const t = Math.max(0, Math.sqrt(d2) / planet.radius); // 0=dead-centre, 1=edge
        pObj.setOpacity(0.10 + t * 0.35); // range 0.10 → 0.45 — very see-through
      } else {
        pObj.setOpacity(1.0);
      }
    }
  }

  _updateCamera(dt) {
    if (!this.ball) return;
    if (this._state === 'CINEMATIC') return; // cinematic owns the camera
    if (this._freecamActive) {
      this._updateFreecam(dt);
      return;
    }

    const ballPos = this.ball.position;

    // Smoothly lerp the stored facing direction
    // (already updated each frame from velocity or aim input)
    const facing = this._facingDir.clone().normalize();

    // Camera sits BEHIND ball along facing direction + height offset
    // "behind" = opposite of facing = -facing
    const behind = facing.clone().negate();

    // Build proper up vector: prefer world Y, but if facing is nearly vertical
    // use world Z to avoid gimbal lock
    const worldUp = Math.abs(facing.y) < 0.95
      ? new Vector3(0, 1, 0)
      : new Vector3(0, 0, -1);

    // Camera right and true up relative to facing direction
    const camRight = new Vector3().crossVectors(facing, worldUp).normalize();
    const camUp    = new Vector3().crossVectors(camRight, facing).normalize();

    const targetPos = ballPos.clone()
      .addScaledVector(behind, CAMERA.FOLLOW_DISTANCE)
      .addScaledVector(camUp,  CAMERA.FOLLOW_HEIGHT);

    // Idle/aiming: gentle cinematic drift — universe never feels frozen
    if (this._state === 'IDLE' || this._state === 'AIMING') {
      this._idleDriftT += dt * 0.13;
      const d = 3.5;
      targetPos.x += Math.sin(this._idleDriftT)        * d;
      targetPos.y += Math.cos(this._idleDriftT * 0.63) * d * 0.35;
    }

    this._cameraPos.lerp(targetPos, CAMERA.FOLLOW_LERP);
    this.camera.position.copy(this._cameraPos).add(this.screenShake.shakeOffset);

    // Look slightly ahead of ball in facing direction
    const lookAt = ballPos.clone().addScaledVector(facing, 8);
    this._cameraTarget.lerp(lookAt, CAMERA.AIM_LERP);
    this.camera.lookAt(this._cameraTarget);
  }

  _setFreecamActive(active) {
    this._freecamActive = active;
    this._freecamMove.set(0, 0, 0);
    this._freecamBoost = false;
    this.inputSystem.setFreecamActive(active);

    if (active) {
      this._freecamPos.copy(this.camera.position);
      this.camera.getWorldDirection(this._freecamForward);
      this._freecamYaw = Math.atan2(this._freecamForward.x, this._freecamForward.z);
      this._freecamPitch = Math.asin(Math.max(-0.98, Math.min(0.98, this._freecamForward.y)));
      this.inputSystem.hideBar();
      this.trajectoryPreview.hide();
      return;
    }

    this._cameraPos.copy(this.camera.position);
    this._cameraTarget.copy(this.camera.position).add(this._freecamForward);
    if (this._state !== 'HOLE_COMPLETE' && this._state !== 'BALL_IN_FLIGHT') {
      this.inputSystem.showBar();
      this.trajectoryPreview.show();
    }
  }

  _updateFreecam(dt) {
    const cosPitch = Math.cos(this._freecamPitch);
    this._freecamForward.set(
      Math.sin(this._freecamYaw) * cosPitch,
      Math.sin(this._freecamPitch),
      Math.cos(this._freecamYaw) * cosPitch,
    ).normalize();

    this._freecamRight.crossVectors(this._freecamForward, new Vector3(0, 1, 0)).normalize();
    if (this._freecamRight.lengthSq() < 0.001) {
      this._freecamRight.set(1, 0, 0);
    }
    const up = new Vector3().crossVectors(this._freecamRight, this._freecamForward).normalize();

    const move = this._freecamMove.clone();
    if (move.lengthSq() > 0) {
      move.normalize();
      const speed = (this._freecamBoost ? 420 : 220) * dt;
      this._freecamPos.addScaledVector(this._freecamRight, move.x * speed);
      this._freecamPos.addScaledVector(up, move.y * speed);
      this._freecamPos.addScaledVector(this._freecamForward, move.z * speed);
    }

    this.camera.position.copy(this._freecamPos);
    this.camera.lookAt(this._freecamPos.clone().add(this._freecamForward));
  }

  _onBallHoled() {
    if (this.ball?.trail) this.ball.trail.setActive(false);
    this._state = 'HOLE_COMPLETE';
    gameState.ballInFlight = false;
    gameState.holeComplete = true;
    gameState.aimState = 'HOLE_COMPLETE';
    this.inputSystem.hideBar();
    this.trajectoryPreview.hide();

    // Nearest planet celebrates
    if (this.cup && this.planetObjects.length > 0) {
      let nearest = null, nearestDist = Infinity;
      for (const p of this.planetObjects) {
        const d = p.group.position.distanceTo(this.cup.position);
        if (d < nearestDist) { nearestDist = d; nearest = p; }
      }
      if (nearest) nearest.triggerCelebration();
    }

    // Suck ball into black hole — spiral inward animation
    if (this.ball && this.cup) {
      this.ball.setVelocity(new Vector3());
      if (this.cup.activateSuck) this.cup.activateSuck();

      // Screen shake on entry
      this.screenShake.trigger(1.2, 0.5);

      // DOM flash overlay
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle,#ff8800 0%,transparent 70%);pointer-events:none;z-index:9999;opacity:0.8;transition:opacity 0.4s ease-out';
      document.body.appendChild(flash);
      setTimeout(() => { flash.style.opacity = '0'; }, 50);
      setTimeout(() => { flash.remove(); }, 500);

      // Snapshot ball ref — the setInterval fires async so this.ball may
      // point to the next hole's ball by the time it completes.
      const suckBall = this.ball;
      const cupPos   = this.cup.position.clone();
      const startPos = suckBall.position.clone();
      const startOffset = startPos.clone().sub(cupPos);
      let startRadius = startOffset.length();
      if (startRadius < 0.1) startRadius = 8;

      // Spiral: 2.5 revolutions, radius collapses, scale shrinks
      const DURATION = 1.1; // seconds
      let elapsed = 0;
      const startAngle = Math.atan2(startOffset.z, startOffset.x);

      const spiral = setInterval(() => {
        elapsed += 0.016;
        if (elapsed >= DURATION) {
          clearInterval(spiral);
          suckBall.setPosition(cupPos);
          suckBall.group.scale.setScalar(0);
          return;
        }
        const frac   = elapsed / DURATION;
        const eased  = frac * frac;
        const radius = startRadius * (1 - eased);
        const angle  = startAngle + frac * Math.PI * 5;
        const y      = startOffset.y * (1 - eased);

        const newPos = cupPos.clone().add(new Vector3(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius,
        ));
        suckBall.setPosition(newPos);
        suckBall.group.scale.setScalar(1 - eased * 0.95);
      }, 16);
    }

    const holeIndex = gameState.currentHole;
    const strokes = gameState.currentStrokes;
    const timeMs = this._holeStartTime ? Date.now() - this._holeStartTime : 0;

    // Hole-in-one: trigger supernova on the black hole
    if (strokes === 1 && this.cup) {
      this.cup.triggerSupernova();
      this.screenShake.trigger(2.0, 1.0);
    }

    if (this._holeData?.boss?.kind === 'WORLDEATER') {
      this.screenShake.trigger(2.4, 1.15);
      eventBus.emit(Events.WORLDEATER_DEFEATED);
    }

    // Record strokes + time for current player
    const player = gameState.currentPlayer;
    if (player) {
      gameState.recordStroke(player.id, holeIndex, strokes);
      gameState.recordHoleTime(player.id, holeIndex, timeMs);
    }

    this._playersHoled.add('local');
    eventBus.emit(Events.BALL_HOLED, { strokes, timeMs });

    // Free-for-all: always show scoreboard immediately, no waiting for others
    eventBus.emit(Events.HOLE_COMPLETE, {
      holeIndex,
      strokes,
      players: gameState.players,
    });
  }

  _onWorldEaterBoost(position, velocity) {
    if (!this.ball) return;

    this.ball.setPosition(position);
    this.ball.setVelocity(velocity);
    this._launchGraceFrames = 0;
    this._hitFreezeFrames = 0;
    this._worldEaterBounceCooldown = 0.24;
    this._trajNeedsRecompute = true;
    this.screenShake.trigger(0.9, 0.28);
    eventBus.emit(Events.WORLDEATER_BOOST);
  }

  _onWorldEaterChomp() {
    if (!this.ball) return;

    if (this.ball?.trail) this.ball.trail.setActive(false);
    const resetPos = this._resolveLastValidPos();
    gameState.currentStrokes += WORLDEATER.CHOMP_PENALTY;
    this.ball.setPosition(resetPos);
    this.ball.setVelocity(new Vector3());
    this._restoreLastValidAttachment();
    this._state = 'IDLE';
    gameState.ballInFlight = false;
    gameState.aimState = 'IDLE';
    this.inputSystem.setAiming(false);
    this.inputSystem.showBar();
    this.trajectoryPreview.show();
    this._trajNeedsRecompute = true;
    this.screenShake.trigger(1.1, 0.34);
    eventBus.emit(Events.WORLDEATER_CHOMP);
    this._broadcastBallReset(resetPos);
  }

  _onWormholeEnter(wormhole) {
    if (!this.ball || !this.cup) return;

    // 100% hole-in-one — teleport to just inside the black hole's pull radius
    const cupPos    = this.cup.position;
    const towardCup = new Vector3().subVectors(cupPos, wormhole.position).normalize();
    const dropDist  = HOLE.BLACK_HOLE_PULL_RADIUS * 0.75; // well inside pull zone
    this.ball.setPosition(cupPos.clone().addScaledVector(towardCup, -dropDist));
    this.ball.setVelocity(towardCup.multiplyScalar(110));

    this._launchGraceFrames = 0;
    eventBus.emit(Events.WORMHOLE_ENTER, { position: wormhole.position.clone() });
  }

  _onOutOfBounds() {
    if (this.ball?.trail) this.ball.trail.setActive(false);

    // Compute reset position using *current* planet position so the ball
    // lands on the planet surface even if it has swayed since the snapshot
    const resetPos = this._resolveLastValidPos();

    // Shield collectible blocks penalty
    if (this.collectibles?.consumeShield()) {
      this.ball.setPosition(resetPos);
      this.ball.setVelocity(new Vector3());
      this._restoreLastValidAttachment();
      this._state = 'IDLE';
      gameState.ballInFlight = false;
      gameState.aimState = 'IDLE';
      this.inputSystem.showBar();
      this.trajectoryPreview.show();
      eventBus.emit(Events.BALL_RESET_TO_TEE);
      return;
    }

    gameState.currentStrokes += HOLE.OUT_OF_BOUNDS_PENALTY;
    eventBus.emit(Events.BALL_OUT_OF_BOUNDS);

    this.ball.setPosition(resetPos);
    this.ball.setVelocity(new Vector3());
    this._restoreLastValidAttachment();
    this._voidFrames = 0;

      this._state = 'IDLE';
      gameState.ballInFlight = false;
      gameState.aimState = 'IDLE';
      this.inputSystem.setAiming(false);
      this.inputSystem.showBar();
      this.trajectoryPreview.show();
      this._broadcastBallReset(resetPos);
  }

  // Compute the OOB spawn position — on the planet's current location if possible
  _resolveLastValidPos() {
    if (this._lastValidPlanetIdx >= 0) {
      const planet = this.planets[this._lastValidPlanetIdx];
      if (planet) {
        return planet.position.clone()
          .addScaledVector(this._lastValidNormal, planet.radius + BALL.RADIUS + 0.5);
      }
    }
    if (this._lastValidPos.lengthSq() > 0.01) {
      return this._lastValidPos.clone().add(new Vector3(0, BALL.RADIUS + 0.5, 0));
    }
    return this._holeData?.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0)) ?? new Vector3();
  }

  // Restore attachment so ball continues travelling with the planet after OOB reset
  _restoreLastValidAttachment() {
    this._attachedPlanetIdx = this._lastValidPlanetIdx;
    this._attachedNormal.copy(this._lastValidNormal);
  }

  // ── Server event planet effects ───────────────────────────────

  _applyPlanetEventEffects(timeMs = Date.now(), applyVisuals = true, targetPlanets = this.planets) {
    if (!this._planetBasePos || this._planetBasePos.length === 0 || !targetPlanets || targetPlanets.length === 0) return;

    const flip   = this.serverEvents.mapFlipProgress;
    const frozen = this.serverEvents.isStatic;
    const t = timeMs / 1000;

    for (let i = 0; i < targetPlanets.length; i++) {
      const base = this._planetBasePos[i];
      if (!base || !targetPlanets[i]) continue;

      let x = base.x;
      let y = base.y * (1 - 2 * flip);
      let z = base.z;

      if (!frozen) {
        const phase = i * 1.618;
        x += Math.sin(t * 0.38 + phase)       * 38;
        y += Math.cos(t * 0.31 + phase * 1.4) * 28;
        z += Math.sin(t * 0.42 + phase * 0.8) * 34;
      }

      targetPlanets[i].position.set(x, y, z);
      if (applyVisuals && targetPlanets === this.planets && this.planetObjects[i]) {
        this.planetObjects[i].group.position.set(x, y, z);
      }
    }
  }

  _hasDynamicPlanetMotion() {
    return this.serverEvents.planetsMoving
      || (this.serverEvents.mapFlipProgress > 0.001 && this.serverEvents.mapFlipProgress < 0.999);
  }

  // ── Billiard ball-ball collision ──────────────────────────────

  _checkBallCollisions() {
    if (!this.ball || this._remoteBalls.size === 0) return;
    const now = Date.now();

    for (const [playerId, remote] of this._remoteBalls) {
      if (remote.holed) continue;

      const cooldown = this._billiardCooldowns.get(playerId) ?? 0;
      if (now < cooldown) continue;

      // Use latest authoritative position for collision, not interpolated visual position
      const remotePos = this._getLatestRemotePos(remote);
      const diff = new Vector3().subVectors(this.ball.position, remotePos);
      const dist = diff.length();
      const minDist = BALL.RADIUS * 2;

      if (dist < minDist && dist > 0.001) {
        const normal = diff.normalize();
        const v1n = this.ball.velocity.dot(normal);
        const v2n = remote.ball.velocity.dot(normal);

        if (v1n - v2n < 0) {
          this.ball.velocity.addScaledVector(normal, v2n - v1n);
          remote.ball.velocity.addScaledVector(normal, v1n - v2n);
          remote.ball.syncMesh();

          const overlap = minDist - dist;
          this.ball.position.addScaledVector(normal, overlap * 0.5);
          remote.ball.position.addScaledVector(normal, -overlap * 0.5);
          this.ball.syncMesh();
          remote.ball.syncMesh();

          if (this.mp) {
            this.mp.broadcastBallHit(playerId, remote.ball.velocity, gameState.currentHole);
          }
          // Update local ghost buffer so interpolation reflects the post-collision velocity
          this._applyCollisionToGhostBuffer(remote);

          this._billiardCooldowns.set(playerId, now + 500);
          this.screenShake.trigger(0.45, 0.35);
          eventBus.emit(Events.BILLIARD_HIT, { targetId: playerId, ownGoal: false });
          continue;
        }
      }

      // Swept collision: check if local ball path this frame passes through remote ball
      const localSpeed = this.ball.velocity.length();
      if (localSpeed > 60) {
        const sweptHit = this._sweptBallCheck(this.ball.position, this.ball.velocity, remotePos, minDist);
        if (sweptHit) {
          const normal = sweptHit.normal;
          const v1n = this.ball.velocity.dot(normal);
          const v2n = remote.ball.velocity.dot(normal);

          if (v1n - v2n < 0) {
            this.ball.velocity.addScaledVector(normal, v2n - v1n);
            remote.ball.velocity.addScaledVector(normal, v1n - v2n);
            remote.ball.syncMesh();

            // Push balls apart along collision normal
            this.ball.position.copy(sweptHit.point).addScaledVector(normal, minDist * 0.5);
            remote.ball.position.copy(sweptHit.point).addScaledVector(normal, -minDist * 0.5);
            this.ball.syncMesh();
            remote.ball.syncMesh();

            if (this.mp) {
              this.mp.broadcastBallHit(playerId, remote.ball.velocity, gameState.currentHole);
            }
            // Update local ghost buffer so interpolation reflects the post-collision velocity
            this._applyCollisionToGhostBuffer(remote);

            this._billiardCooldowns.set(playerId, now + 500);
            this.screenShake.trigger(0.45, 0.35);
            eventBus.emit(Events.BILLIARD_HIT, { targetId: playerId, ownGoal: false });
          }
        }
      }
    }
  }

  _applyCollisionToGhostBuffer(remote) {
    // Stamp the new post-collision velocity into the ghost's state buffer so
    // interpolation doesn't snap back to the pre-collision trajectory.
    if (remote._stateBuffer.length > 0) {
      remote._stateBuffer[remote._stateBuffer.length - 1].vel = remote.ball.velocity.clone();
    } else {
      remote._stateBuffer.push({ ts: Date.now(), pos: remote.ball.position.clone(), vel: remote.ball.velocity.clone() });
    }
    remote.inFlight = true;
  }

  _getLatestRemotePos(remote) {
    const buf = remote._stateBuffer;
    if (buf.length > 0) return buf[buf.length - 1].pos;
    return remote.ball.position;
  }

  _sweptBallCheck(localPos, localVel, remotePos, combinedRadius) {
    const relX = localPos.x - remotePos.x;
    const relY = localPos.y - remotePos.y;
    const relZ = localPos.z - remotePos.z;
    const r2 = combinedRadius * combinedRadius;

    const a = localVel.lengthSq();
    if (a < 0.0001) return null;

    const b = 2 * (relX * localVel.x + relY * localVel.y + relZ * localVel.z);
    const c = relX * relX + relY * relY + relZ * relZ - r2;

    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    let t = (-b - sqrtDisc) / (2 * a);
    if (t < 0) t = (-b + sqrtDisc) / (2 * a);
    if (t < 0 || t > 1) return null;

    const hitPoint = localPos.clone().addScaledVector(localVel, t);
    const normal = new Vector3().subVectors(localPos, remotePos);
    const len = normal.length();
    if (len < 0.001) return null;
    normal.divideScalar(len);

    return { point: hitPoint, normal, t };
  }

  resetBallToTee() {
    if (!this._holeData || !this.ball) return;
    if (this.ball.trail) this.ball.trail.setActive(false);
    this._attachedPlanetIdx  = -1;
    this._lastValidPlanetIdx = -1;
    this._orbitalCapture.reset();
    this.inputSystem.setOrbitToggleAllowed(false);
    const teePos = this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0));
    this.ball.setPosition(teePos);
    this.ball.setVelocity(new Vector3());
    this._state = 'IDLE';
    gameState.ballInFlight = false;
    gameState.aimState = 'IDLE';
    this.inputSystem.enabled = true;
    this.inputSystem._reset();
    this.inputSystem.showBar();
    this.trajectoryPreview.show();
    this._broadcastBallReset(teePos);
  }

  _broadcastBallReset(pos) {
    if (!this.mp) return;
    this.mp.broadcastBallState(pos, new Vector3(), gameState.currentHole, true, this._attachedPlanetIdx, this._lastValidNormal, true);
    this.mp.broadcastBallStopped(pos, gameState.currentHole, this._attachedPlanetIdx, this._lastValidNormal);
  }

  // ── Multiplayer: remote ball management ──────────────────────

  _spawnRemoteBall(playerId, color, name) {
    if (this._remoteBalls.has(playerId) || !this._holeData) return;
    const ball = new GhostBall(color, name);
    const teePos = this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0));
    ball.setPosition(teePos);
    ball.addToScene(this.scene);
    this._applyTrailQuality(ball);
    this._remoteBalls.set(playerId, {
      ball, inFlight: false, holed: false,
      _stateBuffer: [],
      _lastValidPos: teePos.clone(),
      _attachedPlanetIdx: -1,
      _attachedNormal: new Vector3(),
      _accumDt: 0,
    });
  }

  _handleRemoteShot({ playerId, direction, power }) {
    if (!this._holeData || !playerId) return;
    // Create ghost ball on first shot if not yet spawned
    if (!this._remoteBalls.has(playerId)) {
      const player = gameState.players.find(p => p.id === playerId);
      this._spawnRemoteBall(playerId, player?.color ?? 0xff6464, player?.name ?? '');
    }
    const remote = this._remoteBalls.get(playerId);
    if (!remote || remote.holed) return;
    const vel = new Vector3(direction.x, direction.y, direction.z).normalize().multiplyScalar(power);
    remote.ball.setVelocity(vel);
    remote.inFlight = true;
    remote._stateBuffer = [];
    remote._accumDt = 0;
    if (remote.ball.trail) remote.ball.trail.setActive(true);
  }

  _updateRemoteBalls(dt) {
    if (this._remoteBalls.size === 0 || !this._holeData) return;

    const planets = this._holeData.planets;
    const gs = this.serverEvents?.gravityScale ?? 1.0;

    for (const [playerId, remote] of this._remoteBalls) {
      if (remote.holed) continue;

      if (remote.inFlight) {
        // Dead reckoning: advance ghost physics at fixed timestep
        remote._accumDt += Math.min(dt, 0.1);
        while (remote._accumDt >= AIM.TRAJECTORY_DT) {
          stepBall(remote.ball, planets, AIM.TRAJECTORY_DT, gs, null);
          remote._accumDt -= AIM.TRAJECTORY_DT;
        }

        if (remote.ball.position.length() < HOLE.OUT_OF_BOUNDS_DISTANCE) {
          remote._lastValidPos.copy(remote.ball.position);
        }

        // Detect rest from the latest authoritative state
        const newest = remote._stateBuffer[remote._stateBuffer.length - 1];
        if (newest && newest.vel.length() < PHYSICS.REST_VELOCITY) {
          remote.inFlight = false;
          remote._accumDt = 0;
          if (remote.ball.trail) remote.ball.trail.setActive(false);
        }
      }

      // At-rest: follow the planet the remote ball is attached to
      if (!remote.inFlight && remote._attachedPlanetIdx >= 0) {
        const planet = this.planets[remote._attachedPlanetIdx];
        if (planet) {
          remote.ball.position
            .copy(planet.position)
            .addScaledVector(remote._attachedNormal, planet.radius + BALL.RADIUS);
        }
      }

      remote.ball.syncMesh();
      remote.ball.update(dt);

      // Check hole-cup
      if (this.cup && remote.ball.position.distanceTo(this.cup.position) < HOLE.CUP_RADIUS) {
        this._playersHoled.add(playerId);
        remote.ball.removeFromScene(this.scene);
        this._remoteBalls.delete(playerId);
        break;
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  setVisualQuality(profile = {}) {
    this._visualQuality = profile;
    this._applyVisualQuality();
  }

  _applyVisualQuality() {
    if (!this._visualQuality) return;
    const { stars, nebula, comets, trails } = this._visualQuality;
    if (stars && this.starField) this.starField.setQuality(stars);
    if (stars && this.backgroundPlanets) this.backgroundPlanets.setQuality(stars);
    if (nebula && this.nebulaField) this.nebulaField.setQuality(nebula);
    if (comets && this.cometSystem) this.cometSystem.setQuality(comets);
    if (trails) {
      BallTrail.setGlobalQuality(trails);
      this._applyTrailQuality(this.ball);
      for (const remote of this._remoteBalls.values()) {
        this._applyTrailQuality(remote.ball);
      }
    }
  }

  _applyTrailQuality(ball) {
    const trails = this._visualQuality?.trails;
    if (!ball?.trail || !trails) return;
    ball.trail.setQuality(trails);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this._clearCurrentHole();
    this._orbitalCapture.dispose();
    this.trajectoryPreview.dispose();
    if (this._aimArrow) { this.scene.remove(this._aimArrow); this._aimArrow = null; }
    if (this.starField)   this.starField.dispose();
    if (this.backgroundPlanets) this.backgroundPlanets.dispose();
    if (this.nebulaField) this.nebulaField.dispose();
    // ball trail disposed inside ball.removeFromScene()
    this.launchBurst.dispose();
    this.launchWarp.dispose();
    if (this.cinematic) this.cinematic.dispose();
    if (this.cometSystem) this.cometSystem.dispose();
    this.scene.clear();
  }
}
