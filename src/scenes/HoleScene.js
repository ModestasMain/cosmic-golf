// ============================================================
// HoleScene.js — main gameplay scene
// State machine: IDLE → AIMING → BALL_IN_FLIGHT → HOLE_COMPLETE
// ============================================================

import {
  Scene, PerspectiveCamera, AmbientLight, DirectionalLight, HemisphereLight,
  Vector3, Color, Quaternion, ArrowHelper,
} from 'three';
import { Tween, Easing, update as tweenUpdate } from '@tweenjs/tween.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { CAMERA, HOLE, AIM, PHYSICS, BALL, COLOR_PALETTES } from '../core/Constants.js';
import { generateHole } from '../systems/HoleGenerator.js';
import { stepBall } from '../systems/GravitySystem.js';
import { TrajectoryPreview } from '../systems/TrajectoryPreview.js';
import { Planet } from '../objects/Planet.js';
import { GolfBall } from '../objects/GolfBall.js';
import { HoleCup } from '../objects/HoleCup.js';
import { TeeMarker } from '../objects/TeeMarker.js';
import { StarField } from '../objects/StarField.js';
import { NebulaField } from '../objects/NebulaField.js';
import { PortalSystem } from '../portal/PortalSystem.js';
// import { BallTrail } from '../effects/BalxTrail.js';
import { ScreenShake } from '../effects/ScreenShake.js';
import { LaunchBurst } from '../effects/LaunchBurst.js';
import { GhostBall } from '../objects/GhostBall.js';
import { LaunchWarp } from '../effects/LaunchWarp.js';
import { Wormhole, WORMHOLE_CAPTURE_RADIUS } from '../objects/Wormhole.js';
import { audioManager } from '../audio/AudioManager.js';

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
    this.wormholes = [];

    // State
    this._state = 'IDLE'; // IDLE | AIMING | BALL_IN_FLIGHT | HOLE_COMPLETE
    this._holeData = null;
    this._cameraTarget = new Vector3();
    this._cameraPos = new Vector3(0, CAMERA.FOLLOW_HEIGHT, CAMERA.FOLLOW_DISTANCE);

    // Aiming state
    this._aimDrag = null;
    this._hitFreezeFrames = 0;

    // Bounce cooldown + stuck detection
    this._lastBounceTime = 0;
    this._stuckFrames = 0;
    this._launchGraceFrames = 0; // counts down after shot — gravity ramps up

    // Camera facing direction — rotated by aim drag, trails velocity in flight
    this._facingDir  = new Vector3(0, 0, -1);
    this._aimStartDir = new Vector3(0, 0, -1);

    // Multiplayer: ghost balls for remote players
    // playerId -> { ball: GhostBall, inFlight, holed, stuckFrames, launchGrace }
    this._remoteBalls = new Map();
    this._syncFrameCounter = 0; // broadcast local ball state every N frames
    this._lastValidPos = new Vector3(); // last in-bounds position for OOB reset

    this._holeCompleteEmitted = false; // idempotency guard for _advanceHole
    this._playersHoled       = new Set();

    // Hole time tracking (wall-clock ms from first shot to holing)
    this._holeStartTime = null;

    // Spectator mode — active after local player holes in MP

    // Occlusion: reusable vectors (no per-frame allocation)
    this._occRayDir = new Vector3();
    this._occOC     = new Vector3();


    // Visual effects
    this.screenShake = new ScreenShake();
    this.launchBurst = new LaunchBurst(this.scene);
    this.launchWarp = new LaunchWarp(this.camera);

    // Current palette background color for tweening
    this._bgColor = { r: 0, g: 0, b: 0 };

    // Systems
    this.trajectoryPreview = new TrajectoryPreview(this.scene);
    this.portalSystem = new PortalSystem(this.scene);

    this._setupLighting();
    this._setupEventListeners();

    this.starField  = new StarField(this.scene);
    this.nebulaField = new NebulaField(this.scene);

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

    this.portalSystem.initScene();
  }

  _setupLighting() {
    // Dark blue ambient for space feel
    this.ambientLight = new AmbientLight(0x111122, 0.4);
    this.scene.add(this.ambientLight);

    // Main directional light
    this.dirLight = new DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(50, 80, 60);
    this.scene.add(this.dirLight);

    // Subtle hemisphere light for sky/ground differentiation
    this.hemiLight = new HemisphereLight(0x334466, 0x111111, 0.3);
    this.scene.add(this.hemiLight);
  }

  _setupEventListeners() {
    eventBus.on(Events.AIM_START, () => {
      if (this._state !== 'IDLE') return;
      this._state = 'AIMING';
      this._aimDrag = null;
      this._aimStartDir.copy(this._facingDir);
      this.trajectoryPreview.show(); // show immediately — direction re-aimable anytime
    });

    // Fired at the start of each new direction drag — reset base so re-drags feel natural
    eventBus.on(Events.AIM_DIR_LOCKED, () => {
      if (this._state !== 'AIMING') return;
      this._aimStartDir.copy(this._facingDir);
    });

    eventBus.on(Events.AIM_UPDATE, (data) => {
      if (this._state !== 'AIMING') return;
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

    eventBus.on(Events.AIM_CANCEL, () => {
      if (this._state === 'AIMING') {
        this._state = 'IDLE';
        this.trajectoryPreview.hide();
        this._aimDrag = null;
      }
    });

    eventBus.on(Events.SHOT_TAKEN, (data) => {
      if (this._state !== 'AIMING' && this._state !== 'IDLE') return;
      this._fireShot(data);
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
      // Record remote player's strokes + time
      gameState.recordStroke(playerId, gameState.currentHole, strokes);
      if (timeMs) gameState.recordHoleTime(playerId, gameState.currentHole, timeMs);
      this._playersHoled.add(playerId);
      // Remove their ghost — they've moved on to the next hole
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

    // Remote ball position correction — dead-reckoning with smooth blend
    eventBus.on(Events.MP_BALL_STATE, ({ playerId, pos, vel, holeIndex, ts }) => {
      if (holeIndex !== undefined && holeIndex !== gameState.currentHole) return;
      let remote = this._remoteBalls.get(playerId);
      if (!remote && this._holeData) {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) return;
        this._spawnRemoteBall(playerId, player.color, player.name);
        remote = this._remoteBalls.get(playerId);
      }
      if (!remote || remote.holed) return;

      // Latency-compensated authoritative position: extrapolate forward by one-way RTT
      const authPos = new Vector3(pos.x, pos.y, pos.z);
      const authVel = new Vector3(vel.x, vel.y, vel.z);
      if (ts) {
        const latencyS = Math.min((Date.now() - ts) / 1000, 0.15); // cap at 150 ms
        authPos.addScaledVector(authVel, latencyS);
      }

      // Only enable physics simulation if ball is actually in motion.
      // At-rest heartbeat syncs (vel ≈ 0) must NOT trigger gravity simulation
      // — that's what causes the "pulled then snapping back" ghost artifact.
      if (!remote.inFlight && authVel.length() > PHYSICS.REST_VELOCITY) {
        remote.inFlight = true;
        if (remote.ball.trail) remote.ball.trail.setActive(true);
      }

      const error = authPos.distanceTo(remote.ball.position);
      if (error > 8) {
        // Too far off — hard snap, reset correction
        remote.ball.setPosition(authPos);
        remote.ball.setVelocity(authVel);
        remote._posCorrection.set(0, 0, 0);
        remote._corrFrames = 0;
      } else {
        // Smooth correction: blend remaining error over next 6 frames
        remote._posCorrection.subVectors(authPos, remote.ball.position);
        remote._corrFrames = 6;
        // Partial velocity snap — velocity diverges faster than position
        remote.ball.velocity.lerp(authVel, 0.5);
      }
    });

    // Remote ball stopped — immediately settle ghost, no waiting for physics
    eventBus.on(Events.MP_BALL_STOPPED, ({ playerId, pos, holeIndex }) => {
      if (holeIndex !== undefined && holeIndex !== gameState.currentHole) return;
      const remote = this._remoteBalls.get(playerId);
      if (!remote || remote.holed) return;
      remote.inFlight = false;
      remote.stuckFrames = 0;
      remote._corrFrames = 0;
      remote._posCorrection.set(0, 0, 0);
      if (pos) remote.ball.setPosition(new Vector3(pos.x, pos.y, pos.z));
      remote.ball.setVelocity(new Vector3());
      if (remote.ball.trail) remote.ball.trail.setActive(false);
    });

    // Screen shake triggers
    eventBus.on(Events.BALL_BOUNCED, () => {
      this.screenShake.trigger(0.3, 0.4);
    });

    eventBus.on(Events.BALL_HOLED, () => {
      this.screenShake.trigger(0.8, 0.6);
    });
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

    // Use room code for multiplayer (all clients share it → identical holes).
    // Fall back to sessionSeed for solo so each run is a fresh set of holes.
    const holeSeed = gameState.roomCode ?? gameState.sessionSeed;
    this._holeData = generateHole(holeIndex, holeSeed);
    const { planets, tee, cup, palette } = this._holeData;

    // Update scene background and lighting for palette — tween to new background color
    const newBg = new Color(palette.bg);
    const target = { r: newBg.r, g: newBg.g, b: newBg.b };
    new Tween(this._bgColor)
      .to(target, 1200)
      .easing(Easing.Quadratic.Out)
      .onUpdate(({ r, g, b }) => {
        this.scene.background = new Color(r, g, b);
      })
      .onComplete(({ r, g, b }) => {
        this.scene.background = new Color(r, g, b);
      })
      .start();
    // Immediately set as well (handles first load)
    this.scene.background = new Color(palette.bg);
    this._bgColor.r = newBg.r;
    this._bgColor.g = newBg.g;
    this._bgColor.b = newBg.b;

    this.ambientLight.color.set(palette.ambient);
    this.dirLight.color.set(palette.dirLight);
    if (this.starField)   this.starField.setColor(palette.stars);
    if (this.nebulaField) this.nebulaField.setColors(palette);

    // Place planets
    this.planets = planets;
    for (const p of planets) {
      const pObj = new Planet(p);
      pObj.addToScene(this.scene);
      this.planetObjects.push(pObj);
    }

    // Place ball at tee
    this.ball = new GolfBall(palette.ball);
    this.ball.setPosition(tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0)));
    this.ball.addToScene(this.scene);

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

    // Reset ball trail for this hole
    if (this.ball?.trail) this.ball.trail.setActive(false);

    // Wire input
    this.inputSystem.setBallPosition(this.ball.position);
    this.inputSystem.setPlanets(this.planets);

    // Portal return setup — also spawns exit portal from hole 2 onwards
    if (holeIndex === 0) {
      this.portalSystem.initScene();
    }
    if (holeIndex >= 1 && this.ball) {
      const pos = new Vector3(0, 30, -60); // fixed visible position above the scene
      this.portalSystem.spawnExitPortal(pos);
    }

    // Ghost balls are spawned on-demand when ball_state or shot arrives with matching holeIndex
    // (prevents showing ghosts for players who are on a different hole)

    eventBus.emit(Events.HOLE_LOADED, { holeIndex, archetype: this._holeData.archetype });
  }

  _loadNextHole() {
    const next = gameState.currentHole + 1;
    if (next >= HOLE.COUNT) {
      gameState.gameComplete = true;
      eventBus.emit(Events.GAME_COMPLETE, { players: gameState.players });

      // Spawn exit portal at a nice visible position
      if (this.ball) {
        const pos = this.ball.position.clone().add(new Vector3(0, 25, 0));
        this.portalSystem.spawnExitPortal(pos);
      }
      return;
    }
    this.loadHole(next);
  }

  _clearCurrentHole() {
    // Remove planets
    for (const p of this.planetObjects) {
      p.removeFromScene(this.scene);
    }
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

    this.trajectoryPreview.hide();

    // Clear remote ghost balls (trail disposed inside removeFromScene)
    for (const remote of this._remoteBalls.values()) {
      remote.ball.removeFromScene(this.scene);
    }
    this._remoteBalls.clear();

    // Reset per-hole state
    this._holeCompleteEmitted = false;
    this._holeStartTime       = null;
    this._playersHoled.clear();
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

    this._lastValidPos.copy(this.ball.position); // snapshot pre-shot position for OOB reset
    this.ball.setVelocity(velocity);
    this._state = 'BALL_IN_FLIGHT';
    gameState.ballInFlight = true;
    gameState.aimState = 'BALL_IN_FLIGHT';
    gameState.currentStrokes++;

    // Start hole timer on first shot
    if (!this._holeStartTime) this._holeStartTime = Date.now();

    this.trajectoryPreview.hide();
    this.inputSystem.setAiming(false);

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
  }

  /**
   * Main update loop — called every frame.
   * @param {number} dt delta time (already capped)
   */
  update(dt) {
    if (!this._holeData || !this.ball) return;

    // Remote balls — always simulate regardless of local state
    if (this._state !== 'HOLE_COMPLETE') this._updateRemoteBalls(dt);

    // Trajectory: update every frame while player is choosing power
    if (this._state === 'AIMING' && this.inputSystem.isInPowerPhase() && this.ball && this._holeData) {
      const power = Math.max(0.15, this.inputSystem._power);
      const vel   = this._facingDir.clone().multiplyScalar(power * AIM.MAX_POWER);
      this.trajectoryPreview.update(this.ball.position.clone(), vel, this._holeData.planets);
    }

    // Planet occlusion: fade planets between camera and ball
    this._updatePlanetOcclusion();

    // Direction arrow — show in IDLE/AIMING, hide in flight
    if (this._aimArrow && this.ball) {
      const showArrow = this._state === 'IDLE' || this._state === 'AIMING';
      this._aimArrow.visible = showArrow;
      if (showArrow) {
        this._aimArrow.position.copy(this.ball.position);
        this._aimArrow.setDirection(this._facingDir.clone().normalize());
      }
    }

    // Update planet gravity fields
    for (const p of this.planetObjects) p.update(dt);

    // Update cup pulsing
    if (this.cup) this.cup.update(dt);

    // Update wormholes
    for (const w of this.wormholes) w.update(dt);

    // Update portal
    this.portalSystem.update(dt);

    // Update effects (always, even during freeze)
    this.launchBurst.update(dt);
    this.screenShake.update(dt);
    this.launchWarp.update(dt, this.ball?.position);
    if (this.ball) this.ball.update(dt);

    // Update tween animations (palette background fade etc.)
    tweenUpdate();

    // Hit-freeze: skip physics briefly on shot
    if (this._hitFreezeFrames > 0) {
      this._hitFreezeFrames--;
      this._updateCamera(dt);
      return;
    }

    // Broadcast position even at rest so late-joining peers can place the ghost correctly
    if (this.ball && this._state !== 'BALL_IN_FLIGHT') {
      this._syncFrameCounter++;
      if (this._syncFrameCounter >= 20) { // ~0.33s at 60fps
        this._syncFrameCounter = 0;
        eventBus.emit(Events.BALL_POS_SYNC, {
          pos: this.ball.position,
          vel: this.ball.velocity,
          holeIndex: gameState.currentHole,
        });
      }
    }

    if (this._state === 'BALL_IN_FLIGHT') {
      // Grace period: ramp gravity 0→1 over LAUNCH_GRACE_FRAMES after shot
      let gravityScale = 1.0;
      if (this._launchGraceFrames > 0) {
        this._launchGraceFrames--;
        gravityScale = 1.0 - (this._launchGraceFrames / PHYSICS.LAUNCH_GRACE_FRAMES);
      }

      // Integrate physics
      const result = stepBall(this.ball, this._holeData.planets, dt, gravityScale);
      this.ball.syncMesh();

      // Track facing direction from velocity
      const speed = this.ball.velocity.length();
      if (speed > 2) this._facingDir.lerp(this.ball.velocity.clone().normalize(), 0.15);

      // Spin ball mesh based on velocity
      this.ball.updateSpin(dt);


      // Update input system with current ball position
      this.inputSystem.setBallPosition(this.ball.position);

      // Broadcast ball state to remote players every 3 frames (~20 Hz) for sync correction
      this._syncFrameCounter++;
      if (this._syncFrameCounter >= 3) {
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
          // Hit-freeze: pause physics for a few frames (biggest feel upgrade)
          this._hitFreezeFrames = Math.max(this._hitFreezeFrames, 4);
          // Bounce particles at impact point
          if (this._holeData) this.launchBurst.triggerBounce(this.ball.position.clone(), this._holeData.palette);
          // Crater decal on the Planet instance (bouncePlanet is raw data; look up the live object)
          if (result.bouncePlanet) {
            const idx = this._holeData.planets.indexOf(result.bouncePlanet);
            if (idx >= 0) this.planetObjects[idx]?.addCrater(this.ball.position.clone(), this.ball.velocity.length());
          }
          eventBus.emit(Events.BALL_BOUNCED, {
            position:   this.ball.position.clone(),
            planetType: result.bouncePlanet?.type ?? 'ROCKY',
            speed:      this.ball.velocity.length(),
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
        if (cupDist < HOLE.BLACK_HOLE_PULL_RADIUS) {
          const proximity = 1 - Math.min(cupDist / HOLE.BLACK_HOLE_PULL_RADIUS, 1);
          eventBus.emit(Events.BLACK_HOLE_PROXIMITY, { proximity });
        } else {
          eventBus.emit(Events.BLACK_HOLE_PROXIMITY, { proximity: 0 });
        }

        // Gravity pull — hard cutoff at BLACK_HOLE_PULL_RADIUS, smooth falloff inside
        if (cupDist < HOLE.BLACK_HOLE_PULL_RADIUS && cupDist > HOLE.CUP_RADIUS) {
          const t = 1 - cupDist / HOLE.BLACK_HOLE_PULL_RADIUS; // 0 at edge, 1 at cup
          const distSq = Math.max(cupDist * cupDist, HOLE.CUP_RADIUS * HOLE.CUP_RADIUS);
          const strength = HOLE.BLACK_HOLE_GRAVITY * t * t / distSq;
          const toCup = new Vector3().subVectors(this.cup.position, this.ball.position).normalize();
          this.ball.velocity.addScaledVector(toCup, strength * dt * 60);
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
        const distToWorm = this.ball.position.distanceTo(worm.position);
        if (distToWorm < WORMHOLE_CAPTURE_RADIUS) {
          worm.applySuction(this.ball, dt);
          if (worm.checkBallEntered(this.ball.position)) {
            this._onWormholeEnter(worm);
            return;
          }
        }
      }

      // Check cup
      if (this.cup && this.cup.checkBallHoled(this.ball)) {
        this._onBallHoled();
        return;
      }

      // Track last valid in-bounds position (updated before OOB check)
      if (nearSurface) this._lastValidPos.copy(this.ball.position);

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
      if (nearestSafeDist > 80 && ballSpeed < HOLE.VOID_DRIFT_SPEED) {
        this._onOutOfBounds();
        return;
      }

      // Settle: ball at rest ON a planet, OR stuck near a planet surface too long
      const atRest = ballSpeed < PHYSICS.REST_VELOCITY && nearSurface;
      const stuck = this._stuckFrames > PHYSICS.STUCK_FRAMES;

      if (atRest || stuck) {
        this._stuckFrames = 0;
        if (this.ball?.trail) this.ball.trail.setActive(false);
        gameState.ballInFlight = false;
        gameState.aimState = 'IDLE';
        // Broadcast stop immediately so ghosts settle on peers without waiting for next sync tick
        eventBus.emit(Events.BALL_STOPPED, { pos: this.ball.position.clone(), holeIndex: gameState.currentHole });

        // Reset facing direction toward cup so trajectory always has a valid
        // default — avoids the "pointing into planet" problem after landing
        if (this.cup) {
          const toCup = new Vector3().subVectors(this.cup.position, this.ball.position);
          if (toCup.lengthSq() > 0.01) this._facingDir.copy(toCup.normalize());
        }

        // If player already entered power phase while ball was settling, jump to AIMING
        if (this.inputSystem.isInPowerPhase()) {
          this._state = 'AIMING';
          this.trajectoryPreview.show(); // frame loop drives updates from here
        } else {
          this._state = 'IDLE';
          this.inputSystem.setAiming(false);
        }
      }
    }

    this._updateCamera(dt);
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
        pObj.setOpacity(0.25 + t * 0.45); // range 0.25 → 0.70
      } else {
        pObj.setOpacity(1.0);
      }
    }
  }

  _updateCamera(dt) {
    if (!this.ball) return;

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

    this._cameraPos.lerp(targetPos, CAMERA.FOLLOW_LERP);
    this.camera.position.copy(this._cameraPos).add(this.screenShake.shakeOffset);

    // Look slightly ahead of ball in facing direction
    const lookAt = ballPos.clone().addScaledVector(facing, 8);
    this._cameraTarget.lerp(lookAt, CAMERA.AIM_LERP);
    this.camera.lookAt(this._cameraTarget);
  }

  _onBallHoled() {
    if (this.ball?.trail) this.ball.trail.setActive(false);
    this._state = 'HOLE_COMPLETE';
    gameState.ballInFlight = false;
    gameState.holeComplete = true;
    gameState.aimState = 'HOLE_COMPLETE';

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

  _onWormholeEnter(wormhole) {
    if (!this.ball || !this.cup) return;

    const cupPos = this.cup.position;

    if (Math.random() < 0.25) {
      // ── 25%: Success — fly straight into the black hole ──────────
      // Teleport to 38 units along the wormhole→cup line — inside the
      // black hole's 45-unit gravity pull radius so it gets assisted in.
      const towardCup = new Vector3().subVectors(cupPos, wormhole.position).normalize();
      this.ball.setPosition(cupPos.clone().addScaledVector(towardCup, -38));
      this.ball.setVelocity(towardCup.multiplyScalar(55));
    } else {
      // ── 80%: Miss — wormhole deflects the ball ───────────────────
      // Ball is spat back out sideways from the wormhole — no
      // teleport near the cup. Wormhole "rejected" the entry.
      const wormPos = wormhole.position;
      const towardCup = new Vector3().subVectors(cupPos, wormPos).normalize();
      // Perpendicular kick in XZ plane so ball stays in the playfield
      const perpKick = new Vector3(-towardCup.z, 0, towardCup.x);
      perpKick.multiplyScalar(Math.random() < 0.5 ? 1 : -1);
      // Mix perpendicular + slight backwards so it's not going toward cup
      const deflect = perpKick.clone()
        .addScaledVector(towardCup, -0.4)
        .normalize();
      this.ball.setPosition(wormPos.clone().addScaledVector(deflect, 6));
      this.ball.setVelocity(deflect.multiplyScalar(160));
    }

    this._launchGraceFrames = 0;
    eventBus.emit(Events.WORMHOLE_ENTER, { position: wormhole.position.clone() });
  }

  _onOutOfBounds() {
    if (this.ball?.trail) this.ball.trail.setActive(false);
    gameState.currentStrokes += HOLE.OUT_OF_BOUNDS_PENALTY;
    eventBus.emit(Events.BALL_OUT_OF_BOUNDS);

    // Reset to last known in-bounds position (golf rules — not back to tee)
    const resetPos = this._lastValidPos.lengthSq() > 0.01
      ? this._lastValidPos.clone().add(new Vector3(0, BALL.RADIUS + 0.5, 0))
      : this._holeData?.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0));
    if (resetPos) {
      this.ball.setPosition(resetPos);
      this.ball.setVelocity(new Vector3());
    }

    this._state = 'IDLE';
    gameState.ballInFlight = false;
    gameState.aimState = 'IDLE';
    this.inputSystem.setAiming(false);
  }

  resetBallToTee() {
    if (!this._holeData || !this.ball) return;
    // Always kill trail on reset regardless of state
    if (this.ball.trail) this.ball.trail.setActive(false);
    this.ball.setPosition(this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0)));
    this.ball.setVelocity(new Vector3());
    this._state = 'IDLE';
    gameState.ballInFlight = false;
    gameState.aimState = 'IDLE';
    this.inputSystem.enabled = true;
    this.inputSystem._reset();
  }

  // ── Multiplayer: remote ball management ──────────────────────

  _spawnRemoteBall(playerId, color, name) {
    if (this._remoteBalls.has(playerId) || !this._holeData) return;
    const ball = new GhostBall(color, name);
    const teePos = this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0));
    ball.setPosition(teePos);
    ball.addToScene(this.scene);
    this._remoteBalls.set(playerId, {
      ball, inFlight: false, holed: false, stuckFrames: 0, launchGrace: 0,
      _posCorrection: new Vector3(), _corrFrames: 0,
      _lastValidPos: teePos.clone(),
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
    remote.inFlight    = true;
    remote.stuckFrames = 0;
    remote.launchGrace = PHYSICS.LAUNCH_GRACE_FRAMES;
    if (remote.ball.trail) remote.ball.trail.setActive(true);
  }

  _updateRemoteBalls(dt) {
    if (this._remoteBalls.size === 0 || !this._holeData) return;

    for (const [playerId, remote] of this._remoteBalls) {
      if (!remote.inFlight || remote.holed) continue;

      let gravScale = 1.0;
      if (remote.launchGrace > 0) {
        remote.launchGrace--;
        gravScale = 1.0 - (remote.launchGrace / PHYSICS.LAUNCH_GRACE_FRAMES);
      }

      stepBall(remote.ball, this._holeData.planets, dt, gravScale);

      // Apply smooth position correction from last authoritative update
      if (remote._corrFrames > 0) {
        const step = remote._posCorrection.clone().divideScalar(remote._corrFrames);
        remote.ball.position.add(step);
        remote._posCorrection.sub(step);
        remote._corrFrames--;
      }

      // Black hole pull for remote balls (same logic as local ball)
      if (this.cup) {
        const cupDist = remote.ball.position.distanceTo(this.cup.position);
        if (cupDist < HOLE.BLACK_HOLE_PULL_RADIUS && cupDist > HOLE.CUP_RADIUS) {
          const t = 1 - cupDist / HOLE.BLACK_HOLE_PULL_RADIUS;
          const distSq = Math.max(cupDist * cupDist, HOLE.CUP_RADIUS * HOLE.CUP_RADIUS);
          const strength = HOLE.BLACK_HOLE_GRAVITY * t * t / distSq;
          const toCup = new Vector3().subVectors(this.cup.position, remote.ball.position).normalize();
          remote.ball.velocity.addScaledVector(toCup, strength * dt * 60);
        }
      }

      remote.ball.syncMesh();
      remote.ball.update(dt); // handles spin + trail internally

      const speed = remote.ball.velocity.length();
      const nearSurface = this._holeData.planets.some(p =>
        remote.ball.position.distanceTo(p.position) < p.radius + BALL.RADIUS * 3,
      );
      if (nearSurface && speed < 12) remote.stuckFrames++;
      else remote.stuckFrames = 0;

      // Track last valid in-bounds position for OOB reset
      if (nearSurface) remote._lastValidPos.copy(remote.ball.position);

      if (speed < PHYSICS.REST_VELOCITY || remote.stuckFrames > PHYSICS.STUCK_FRAMES) {
        remote.inFlight = false;
        remote.stuckFrames = 0;
        if (remote.ball.trail) remote.ball.trail.setActive(false);
      }

      // OOB — reset to last valid position (not tee)
      if (remote.ball.position.length() > HOLE.OUT_OF_BOUNDS_DISTANCE) {
        remote.inFlight = false;
        if (remote.ball.trail) remote.ball.trail.setActive(false);
        const resetPos = remote._lastValidPos.clone().add(new Vector3(0, BALL.RADIUS + 0.5, 0));
        remote.ball.setPosition(resetPos);
        remote.ball.setVelocity(new Vector3());
      }

      // Check hole — trail disposed inside removeFromScene
      if (this.cup && remote.ball.position.distanceTo(this.cup.position) < HOLE.CUP_RADIUS) {
        this._playersHoled.add(playerId);
        remote.ball.removeFromScene(this.scene);
        this._remoteBalls.delete(playerId);
        break; // map was mutated, exit loop
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this._clearCurrentHole();
    this.trajectoryPreview.dispose();
    if (this._aimArrow) { this.scene.remove(this._aimArrow); this._aimArrow = null; }
    if (this.starField)   this.starField.dispose();
    if (this.nebulaField) this.nebulaField.dispose();
    // ball trail disposed inside ball.removeFromScene()
    this.launchBurst.dispose();
    this.launchWarp.dispose();
    this.scene.clear();
  }
}
