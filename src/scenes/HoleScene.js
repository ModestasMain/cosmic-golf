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
// import { EarthPlanet } from '../objects/EarthPlanet.js';
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
import { CometSystem } from '../effects/CometSystem.js';
import { CinematicController } from './CinematicController.js';
import { ServerEventSystem } from '../systems/ServerEventSystem.js';
import { CollectibleSystem } from '../systems/CollectibleSystem.js';

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
    this._launchGraceFrames = 0;  // counts down after shot — gravity ramps up
    this._bounceGraceFrames = 0;  // counts down after bounce — suppresses drift-OOB
    this._voidFrames = 0;         // zero-gravity void timer — frames away from any planet

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

    eventBus.on(Events.AIM_POWER_UPDATE, ({ power }) => {
      if (this.ball) this.ball.setPower(power);
    });

    eventBus.on(Events.AIM_CANCEL, () => {
      if (this.ball) this.ball.setPower(0);
      if (this._state === 'AIMING') {
        this._state = 'IDLE';
        this.trajectoryPreview.hide();
        this._aimDrag = null;
      }
    });

    eventBus.on(Events.SHOT_TAKEN, (data) => {
      if (this.ball) this.ball.setPower(0);
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

    // Remote ball state — buffer for interpolation (100 ms render delay)
    eventBus.on(Events.MP_BALL_STATE, ({ playerId, pos, vel, holeIndex, ts, bounce, planetIdx, normal, reset }) => {
      if (holeIndex !== undefined && holeIndex !== gameState.currentHole) return;
      let remote = this._remoteBalls.get(playerId);
      if (!remote && this._holeData) {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) return;
        this._spawnRemoteBall(playerId, player.color, player.name);
        remote = this._remoteBalls.get(playerId);
      }
      if (!remote || remote.holed) return;

      const recvTs = ts ?? Date.now();
      const authPos = new Vector3(pos.x, pos.y, pos.z);
      const authVel = new Vector3(vel.x, vel.y, vel.z);

      // Reset flag: teleport — clear stale buffer, snap immediately
      if (reset) {
        remote._stateBuffer = [];
        remote.inFlight = false;
        if (remote.ball.trail) remote.ball.trail.setActive(false);
        remote.ball.setPosition(authPos);
        remote.ball.setVelocity(authVel);
        remote._stateBuffer.push({ ts: recvTs, pos: authPos.clone(), vel: authVel.clone() });
      } else {
        remote._stateBuffer.push({ ts: recvTs, pos: authPos, vel: authVel });
        if (remote._stateBuffer.length > 30) remote._stateBuffer.shift();
      }

      // Activate trail when ball starts moving
      if (!remote.inFlight && authVel.length() > PHYSICS.REST_VELOCITY) {
        remote.inFlight = true;
        remote._attachedPlanetIdx = -1; // detach on launch
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
      remote._stateBuffer = []; // clear interpolation buffer
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
    eventBus.on(Events.BILLIARD_HIT, ({ remote, velocity }) => {
      if (remote && this.ball) {
        const v = new Vector3(velocity.x, velocity.y, velocity.z);
        this.ball.setVelocity(v);
        this.ball.syncMesh();
        if (!this.ball.trail?.active) this.ball.trail?.setActive(true);
        this._state = 'BALL_IN_FLIGHT';
        gameState.ballInFlight = true;
        this.screenShake.trigger(0.5, 0.4);
      }
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
    this._planetBasePos = [];  // base positions for server event effects
    for (const p of planets) {
      const pObj = new Planet(p);
      pObj.addToScene(this.scene);
      this.planetObjects.push(pObj);
      this._planetBasePos.push(p.position.clone());
    }

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

    // Kick off hole-intro cinematic — block all input until done/skipped
    this.inputSystem.enabled = false;
    this._state = 'CINEMATIC';
    gameState.aimState = 'CINEMATIC';
    this.cinematic.start(
      cup.clone(), tee.clone(), this._facingDir.clone(),
      CAMERA.FOLLOW_DISTANCE, CAMERA.FOLLOW_HEIGHT,
    );

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

    eventBus.emit(Events.HOLE_LOADED, { holeIndex, archetype: this._holeData.archetype });
  }

  _loadNextHole() {
    const next = gameState.currentHole + 1;
    if (next >= HOLE.COUNT) {
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

    // Clear collectibles
    if (this.collectibles) this.collectibles.clear();

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

    // Snapshot pre-shot position + planet attachment for OOB recovery
    this._lastValidPos.copy(this.ball.position);
    this._lastValidPlanetIdx = this._attachedPlanetIdx;
    this._lastValidNormal.copy(this._attachedNormal);
    this._attachedPlanetIdx = -1; // detach from planet on shot
    this._bouncePlanetIdx   = -1; // reset bounce streak on new shot
    this._bounceStreak      = 0;
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
    this._voidFrames = 0;
  }

  /**
   * Main update loop — called every frame.
   * @param {number} dt delta time (already capped)
   */
  update(dt) {
    if (!this._holeData || !this.ball) return;

    // Always accumulate world time for default planet sway
    this._worldT += dt;

    // Cinematic intro — world animates but gameplay is fully locked
    if (this._state === 'CINEMATIC') {
      for (const p of this.planetObjects) p.update(dt, this.serverEvents.isStatic);
      if (this.cup) this.cup.update(dt);
      if (this.starField)   this.starField.update(dt);
      if (this.cometSystem) this.cometSystem.update(dt);
      this.cinematic.update(dt);
      tweenUpdate();
      return;
    }

    // Remote balls — always simulate regardless of local state
    if (this._state !== 'HOLE_COMPLETE') this._updateRemoteBalls(dt);

    // Trajectory: update every frame while aiming (direction or power phase)
    if (this._state === 'AIMING' && this.ball && this._holeData) {
      const power = Math.max(0.15, this.inputSystem._power ?? 0.15);
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

    // Server events (deterministic wall-clock events)
    this.serverEvents.update(dt);

    // Apply server event effects to planet positions (MAP_FLIP + default sway)
    this._applyPlanetEventEffects();

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

    // Collectibles
    if (this._state === 'BALL_IN_FLIGHT') {
      this.collectibles.update(dt, this.ball);
    } else {
      this.collectibles.update(dt, null); // still animate gems, skip collect check
    }

    // Update background ambiance
    if (this.starField)   this.starField.update(dt);
    if (this.cometSystem) this.cometSystem.update(dt);

    // Update planet gravity fields
    for (const p of this.planetObjects) p.update(dt, this.serverEvents.isStatic);

    // Update cup pulsing
    if (this.cup) this.cup.update(dt);

    // Update wormholes
    for (const w of this.wormholes) w.update(dt);

    // Update portal
    this.portalSystem.update(dt, this.camera);

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
          planetIdx: this._attachedPlanetIdx,
          normal: this._attachedNormal,
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

      // Combine gravity scale from server events + collectibles
      const combinedGravityScale = gravityScale
        * this.serverEvents.gravityScale
        * this.collectibles.gravityScale;

      // Integrate physics
      const result = stepBall(this.ball, this._holeData.planets, dt, combinedGravityScale);

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
      this.ball.updateSpin(dt);


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

            // Track consecutive bounces on the same planet
            if (planetIdx === this._bouncePlanetIdx) {
              this._bounceStreak++;
            } else {
              this._bouncePlanetIdx = planetIdx;
              this._bounceStreak    = 1;
            }

            // 3rd bounce on the same planet → pin the ball
            if (this._bounceStreak >= 3) {
              this._bounceStreak    = 0;
              this._bouncePlanetIdx = -1;
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
              // Transition to IDLE
              if (this.ball?.trail) this.ball.trail.setActive(false);
              gameState.ballInFlight = false;
              gameState.aimState = 'IDLE';
              this._state = 'IDLE';
              if (this.cup) {
                const toCup = new Vector3().subVectors(this.cup.position, this.ball.position);
                if (toCup.lengthSq() > 0.01) this._facingDir.copy(toCup.normalize());
              }
              eventBus.emit(Events.BALL_STOPPED, {
                pos: this.ball.position.clone(),
                holeIndex: gameState.currentHole,
                planetIdx: this._attachedPlanetIdx,
                normal: this._attachedNormal.clone(),
              });
              return; // skip remaining flight logic this frame
            }
          } else {
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
        pObj.setOpacity(0.10 + t * 0.35); // range 0.10 → 0.45 — very see-through
      } else {
        pObj.setOpacity(1.0);
      }
    }
  }

  _updateCamera(dt) {
    if (!this.ball) return;
    if (this._state === 'CINEMATIC') return; // cinematic owns the camera

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

  _onBallHoled() {
    if (this.ball?.trail) this.ball.trail.setActive(false);
    this._state = 'HOLE_COMPLETE';
    gameState.ballInFlight = false;
    gameState.holeComplete = true;
    gameState.aimState = 'HOLE_COMPLETE';

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
      eventBus.emit(Events.BALL_RESET_TO_TEE); // reuse event for UI flash
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

  _applyPlanetEventEffects() {
    if (!this._planetBasePos || this._planetBasePos.length === 0) return;

    const flip   = this.serverEvents.mapFlipProgress;
    const frozen = this.serverEvents.staticActive;
    // Use wall-clock seconds so all clients have identical planet positions
    // regardless of frame rate or when they joined.
    const t = Date.now() / 1000;

    for (let i = 0; i < this.planetObjects.length; i++) {
      const base = this._planetBasePos[i];

      // MAP_FLIP: lerp Y from baseY → -baseY as flip goes 0→1
      let x = base.x;
      let y = base.y * (1 - 2 * flip);
      let z = base.z;

      // Default sway — always on unless STATIC event is active
      if (!frozen) {
        const phase = i * 1.618; // golden ratio offset per planet
        x += Math.sin(t * 0.38 + phase)       * 38;
        y += Math.cos(t * 0.31 + phase * 1.4) * 28;
        z += Math.sin(t * 0.42 + phase * 0.8) * 34;
      }

      // Update physics data, visual mesh, and gravity field rings
      this.planets[i].position.set(x, y, z);
      this.planetObjects[i].group.position.set(x, y, z);
      this.planetObjects[i].gravityField.group.position.set(x, y, z);
    }
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
            this.mp.broadcastBallHit(playerId, remote.ball.velocity);
          }

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
              this.mp.broadcastBallHit(playerId, remote.ball.velocity);
            }

            this._billiardCooldowns.set(playerId, now + 500);
            this.screenShake.trigger(0.45, 0.35);
            eventBus.emit(Events.BILLIARD_HIT, { targetId: playerId, ownGoal: false });
          }
        }
      }
    }
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
    const teePos = this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0));
    this.ball.setPosition(teePos);
    this.ball.setVelocity(new Vector3());
    this._state = 'IDLE';
    gameState.ballInFlight = false;
    gameState.aimState = 'IDLE';
    this.inputSystem.enabled = true;
    this.inputSystem._reset();
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
    this._remoteBalls.set(playerId, {
      ball, inFlight: false, holed: false,
      _stateBuffer: [],          // { ts, pos, vel }[] — sorted oldest→newest
      _lastValidPos: teePos.clone(),
      _attachedPlanetIdx: -1,    // planet the remote ball is resting on
      _attachedNormal: new Vector3(),
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
    remote._stateBuffer = []; // clear stale states on new shot
    if (remote.ball.trail) remote.ball.trail.setActive(true);
  }

  // Interpolation render delay — remote balls are shown this many ms in the past.
  // Must be larger than send interval (33 ms at 30 Hz) + typical network jitter.
  static INTERP_DELAY_MS = 100;

  _updateRemoteBalls(dt) {
    if (this._remoteBalls.size === 0 || !this._holeData) return;

    const renderTs = Date.now() - HoleScene.INTERP_DELAY_MS;

    for (const [playerId, remote] of this._remoteBalls) {
      if (remote.holed) continue;

      const buf = remote._stateBuffer;

      if (remote.inFlight && buf.length >= 1) {
        // ── Interpolation between buffered authoritative states ───────────
        // Find the two states that bracket the render timestamp.
        let before = null;
        let after  = null;
        for (let i = buf.length - 1; i >= 0; i--) {
          if (buf[i].ts <= renderTs) { before = buf[i]; break; }
        }
        for (let i = 0; i < buf.length; i++) {
          if (buf[i].ts >= renderTs) { after = buf[i]; break; }
        }

        if (before && after && before !== after) {
          // Normal case: smooth lerp between two known states
          const t = Math.max(0, Math.min(1, (renderTs - before.ts) / (after.ts - before.ts)));
          remote.ball.position.lerpVectors(before.pos, after.pos, t);
          remote.ball.velocity.lerpVectors(before.vel, after.vel, t);
        } else if (before) {
          // Render timestamp is ahead of all buffered states — extrapolate briefly
          const ageS = (renderTs - before.ts) / 1000;
          if (ageS < 0.25) {
            remote.ball.position.copy(before.pos).addScaledVector(before.vel, ageS);
          }
          remote.ball.velocity.copy(before.vel);
        } else if (after) {
          // Not enough history yet — snap to earliest available state
          remote.ball.position.copy(after.pos);
          remote.ball.velocity.copy(after.vel);
        }

        // Track last valid in-bounds position
        if (remote.ball.position.length() < HOLE.OUT_OF_BOUNDS_DISTANCE) {
          remote._lastValidPos.copy(remote.ball.position);
        }

        // Detect ball stopped: newest state has near-zero velocity
        const newest = buf[buf.length - 1];
        if (newest && newest.vel.length() < PHYSICS.REST_VELOCITY) {
          remote.inFlight = false;
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
      remote.ball.update(dt); // spin + trail

      // Check hole-cup
      if (this.cup && remote.ball.position.distanceTo(this.cup.position) < HOLE.CUP_RADIUS) {
        this._playersHoled.add(playerId);
        remote.ball.removeFromScene(this.scene);
        this._remoteBalls.delete(playerId);
        break; // map mutated — exit loop
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
    if (this.cinematic) this.cinematic.dispose();
    if (this.cometSystem) this.cometSystem.dispose();
    this.scene.clear();
  }
}
