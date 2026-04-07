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
import { BallTrail } from '../effects/BallTrail.js';
import { ScreenShake } from '../effects/ScreenShake.js';
import { LaunchBurst } from '../effects/LaunchBurst.js';
import { GhostBall } from '../objects/GhostBall.js';

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

    // Hole completion timer (starts when first player holes in MP)
    this._holeTimerActive    = false;
    this._holeTimerRemaining = 0;
    this._playersHoled       = new Set();

    // Spectator mode — active after local player holes in MP
    this._spectating = false;

    // Occlusion: reusable vectors (no per-frame allocation)
    this._occRayDir = new Vector3();
    this._occOC     = new Vector3();


    // Visual effects
    this.ballTrail = new BallTrail(this.scene);
    this.screenShake = new ScreenShake();
    this.launchBurst = new LaunchBurst(this.scene);

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
      this.trajectoryPreview.hide();
    });

    // Direction locked — show trajectory now (power phase begins)
    eventBus.on(Events.AIM_DIR_LOCKED, () => {
      if (this._state !== 'AIMING') return;
      this.trajectoryPreview.show();
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
      // Multiplayer: fire the remote player's ghost ball, not the local ball
      this._handleRemoteShot(data);
    });

    eventBus.on(Events.MP_PLAYER_JOINED, ({ playerId, name, color }) => {
      if (!this._holeData) return;
      if (this._remoteBalls.has(playerId)) return; // already spawned, name update handled by PlayerLabels
      this._spawnRemoteBall(playerId, color ?? 0xff6464, name ?? '');
    });

    eventBus.on(Events.MP_PLAYER_LEFT, ({ playerId }) => {
      const remote = this._remoteBalls.get(playerId);
      if (remote) {
        remote.ball.removeFromScene(this.scene);
        this._remoteBalls.delete(playerId);
      }
    });

    eventBus.on(Events.MP_HOLE_COMPLETE, ({ playerId, strokes }) => {
      // Record remote player's strokes
      gameState.recordStroke(playerId, gameState.currentHole, strokes);
      this._playersHoled.add(playerId);
      // Mark their ghost ball as holed
      const remote = this._remoteBalls.get(playerId);
      if (remote) remote.holed = true;
      // Start or continue timer
      this._onAnyPlayerHoled();
    });

    eventBus.on(Events.NEXT_HOLE, () => {
      if (this._state !== 'HOLE_COMPLETE') return; // ignore duplicate events
      this._loadNextHole();
    });

    // Remote ball position correction — smooth-correct locally simulated ghost balls
    eventBus.on(Events.MP_BALL_STATE, ({ playerId, pos, vel }) => {
      const remote = this._remoteBalls.get(playerId);
      if (!remote || !remote.inFlight || remote.holed) return;

      const receivedPos = new Vector3(pos.x, pos.y, pos.z);
      const receivedVel = new Vector3(vel.x, vel.y, vel.z);
      const error = remote.ball.position.distanceTo(receivedPos);

      if (error > 20) {
        // Large drift — snap immediately
        remote.ball.setPosition(receivedPos);
        remote.ball.setVelocity(receivedVel);
      } else if (error > 1.5) {
        // Small drift — lerp 50% toward authoritative position, blend velocity
        remote.ball.position.lerp(receivedPos, 0.5);
        remote.ball.velocity.lerp(receivedVel, 0.5);
      }
      // < 1.5 units: within tolerance, local sim is fine
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

    this._holeData = generateHole(holeIndex);
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
    this.ballTrail.setActive(false);

    // Wire input
    this.inputSystem.setBallPosition(this.ball.position);
    this.inputSystem.setPlanets(this.planets);

    // Portal return (after game complete, don't spawn again)
    if (holeIndex === 0) {
      this.portalSystem.initScene();
    }

    // Spawn ghost balls for all known remote players
    for (const player of gameState.players) {
      const localId = gameState.currentPlayer?.id;
      if (player.id !== localId) {
        this._spawnRemoteBall(player.id, player.color, player.name);
      }
    }

    eventBus.emit(Events.HOLE_LOADED, { holeIndex });
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

    this.trajectoryPreview.hide();

    // Clear remote ghost balls
    for (const remote of this._remoteBalls.values()) {
      remote.ball.removeFromScene(this.scene);
    }
    this._remoteBalls.clear();

    // Reset multiplayer state
    this._holeTimerActive    = false;
    this._holeTimerRemaining = 0;
    this._playersHoled.clear();
    this._spectating = false;
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

    this.ball.setVelocity(velocity);
    this._state = 'BALL_IN_FLIGHT';
    gameState.ballInFlight = true;
    gameState.aimState = 'BALL_IN_FLIGHT';
    gameState.currentStrokes++;

    this.trajectoryPreview.hide();
    this.inputSystem.setAiming(false);

    // Activate ball trail
    this.ballTrail.setActive(true);

    // Launch burst particles
    if (this._holeData) {
      this.launchBurst.trigger(this.ball.position.clone(), this._holeData.palette);
    }

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

    // Hole timer countdown
    if (this._holeTimerActive) this._tickHoleTimer(dt);

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

    // Update portal
    this.portalSystem.update(dt);

    // Update effects (always, even during freeze)
    this.launchBurst.update(dt);
    this.screenShake.update(dt);

    // Update tween animations (palette background fade etc.)
    tweenUpdate();

    // Hit-freeze: skip physics briefly on shot
    if (this._hitFreezeFrames > 0) {
      this._hitFreezeFrames--;
      this._updateCamera(dt);
      return;
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

      // Update ball trail
      this.ballTrail.update(this.ball.position);

      // Update input system with current ball position
      this.inputSystem.setBallPosition(this.ball.position);

      // Broadcast ball state to remote players every 6 frames for sync correction
      this._syncFrameCounter++;
      if (this._syncFrameCounter >= 6) {
        this._syncFrameCounter = 0;
        eventBus.emit(Events.BALL_POS_SYNC, {
          pos: this.ball.position,
          vel: this.ball.velocity,
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
          eventBus.emit(Events.BALL_BOUNCED, { position: this.ball.position.clone() });
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

      // Check cup
      if (this.cup && this.cup.checkBallHoled(this.ball)) {
        this._onBallHoled();
        return;
      }

      // Check out of bounds
      if (this.ball.position.length() > HOLE.OUT_OF_BOUNDS_DISTANCE) {
        this._onOutOfBounds();
        return;
      }

      // Settle: ball at rest ON a planet, OR stuck near a planet surface too long
      const atRest = ballSpeed < PHYSICS.REST_VELOCITY && nearSurface;
      const stuck = this._stuckFrames > PHYSICS.STUCK_FRAMES;

      // Ball too slow to reach anything but not near a planet → void trap → OOB
      if (ballSpeed < PHYSICS.REST_VELOCITY && !nearSurface) {
        this._onOutOfBounds();
        return;
      }

      if (atRest || stuck) {
        this._stuckFrames = 0;
        this.ballTrail.setActive(false);
        gameState.ballInFlight = false;
        gameState.aimState = 'IDLE';

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

    // Spectator mode: follow the first remote ball still in flight (or just not holed)
    if (this._spectating) {
      let spectateTarget = null;
      for (const remote of this._remoteBalls.values()) {
        if (!remote.holed) { spectateTarget = remote.ball; break; }
      }
      if (spectateTarget) {
        const speed = spectateTarget.velocity.length();
        const facing = speed > 2
          ? spectateTarget.velocity.clone().normalize()
          : this._facingDir.clone();
        const behind = facing.clone().negate();
        const worldUp = Math.abs(facing.y) < 0.95 ? new Vector3(0,1,0) : new Vector3(0,0,-1);
        const camRight = new Vector3().crossVectors(facing, worldUp).normalize();
        const camUp    = new Vector3().crossVectors(camRight, facing).normalize();
        const targetPos = spectateTarget.position.clone()
          .addScaledVector(behind, CAMERA.FOLLOW_DISTANCE)
          .addScaledVector(camUp,  CAMERA.FOLLOW_HEIGHT);
        this._cameraPos.lerp(targetPos, CAMERA.FOLLOW_LERP);
        this.camera.position.copy(this._cameraPos).add(this.screenShake.shakeOffset);
        const lookAt = spectateTarget.position.clone().addScaledVector(facing, 8);
        this._cameraTarget.lerp(lookAt, CAMERA.AIM_LERP);
        this.camera.lookAt(this._cameraTarget);
        return;
      }
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

    this._cameraPos.lerp(targetPos, CAMERA.FOLLOW_LERP);
    this.camera.position.copy(this._cameraPos).add(this.screenShake.shakeOffset);

    // Look slightly ahead of ball in facing direction
    const lookAt = ballPos.clone().addScaledVector(facing, 8);
    this._cameraTarget.lerp(lookAt, CAMERA.AIM_LERP);
    this.camera.lookAt(this._cameraTarget);
  }

  _onBallHoled() {
    this.ballTrail.setActive(false);
    this._state = 'HOLE_COMPLETE';
    gameState.ballInFlight = false;
    gameState.holeComplete = true;
    gameState.aimState = 'HOLE_COMPLETE';

    // Suck ball into black hole — kill velocity, lerp toward cup center
    if (this.ball && this.cup) {
      this.ball.setVelocity(new Vector3());
      const suckTarget = this.cup.position.clone();
      const startPos   = this.ball.position.clone();
      let t = 0;
      const suck = setInterval(() => {
        t += 0.04;
        if (t >= 1 || !this.ball) { clearInterval(suck); return; }
        const eased = t * t;
        this.ball.setPosition(startPos.clone().lerp(suckTarget, eased));
      }, 16);
    }

    const holeIndex = gameState.currentHole;
    const strokes = gameState.currentStrokes;

    // Record strokes for current player
    const player = gameState.currentPlayer;
    if (player) {
      gameState.recordStroke(player.id, holeIndex, strokes);
    }

    this._playersHoled.add('local');
    eventBus.emit(Events.BALL_HOLED, { strokes });

    // Multiplayer: check if anyone else is still playing
    const anyRemoteStillPlaying = [...this._remoteBalls.values()].some(r => !r.holed);
    if (!gameState.isSoloMode && anyRemoteStillPlaying) {
      // Enter spectator mode — wait for others or timer
      this._spectating = true;
      this._onAnyPlayerHoled();
      // Don't emit HOLE_COMPLETE yet — timer or _checkAllHoled will do it
    } else {
      // Solo or everyone done — advance immediately
      eventBus.emit(Events.HOLE_COMPLETE, {
        holeIndex,
        strokes,
        players: gameState.players,
      });
    }
  }

  _onOutOfBounds() {
    this.ballTrail.setActive(false);
    // Apply penalty strokes and reset ball to tee
    gameState.currentStrokes += HOLE.OUT_OF_BOUNDS_PENALTY;
    eventBus.emit(Events.BALL_OUT_OF_BOUNDS);

    if (this._holeData) {
      const teePos = this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0));
      this.ball.setPosition(teePos);
      this.ball.setVelocity(new Vector3());
    }

    this._state = 'IDLE';
    gameState.ballInFlight = false;
    gameState.aimState = 'IDLE';
    this.inputSystem.setAiming(false);
  }

  resetBallToTee() {
    if (!this._holeData || !this.ball || this._spectating) return;
    if (this._state === 'BALL_MOVING') {
      // Stop the ball first
      this.ball.setVelocity(new Vector3());
      this.ballTrail.setActive(false);
    }
    const teePos = this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0));
    this.ball.setPosition(teePos);
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
    remote.inFlight   = true;
    remote.stuckFrames = 0;
    remote.launchGrace = PHYSICS.LAUNCH_GRACE_FRAMES;
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
      remote.ball.updateSpin(dt);

      const speed = remote.ball.velocity.length();
      const nearSurface = this._holeData.planets.some(p =>
        remote.ball.position.distanceTo(p.position) < p.radius + BALL.RADIUS * 3,
      );
      if (nearSurface && speed < 12) remote.stuckFrames++;
      else remote.stuckFrames = 0;

      if (speed < PHYSICS.REST_VELOCITY || remote.stuckFrames > PHYSICS.STUCK_FRAMES) {
        remote.inFlight = false;
        remote.stuckFrames = 0;
      }

      // OOB — reset to tee
      if (remote.ball.position.length() > HOLE.OUT_OF_BOUNDS_DISTANCE) {
        remote.inFlight = false;
        const teePos = this._holeData.tee.clone().add(new Vector3(0, BALL.RADIUS + 0.2, 0));
        remote.ball.setPosition(teePos);
        remote.ball.setVelocity(new Vector3());
      }

      // Check hole
      if (this.cup && remote.ball.position.distanceTo(this.cup.position) < HOLE.CUP_RADIUS) {
        remote.inFlight = false;
        remote.holed    = true;
        this._playersHoled.add(playerId);
        this._onAnyPlayerHoled();
      }
    }
  }

  // ── Hole completion timer ─────────────────────────────────────

  _onAnyPlayerHoled() {
    if (!this._holeTimerActive) {
      this._holeTimerActive    = true;
      this._holeTimerRemaining = 30;
      eventBus.emit(Events.MP_HOLE_TIMER, { remaining: 30 });
    }
    this._checkAllHoled();
  }

  _checkAllHoled() {
    // Count total remote players
    const totalRemote = this._remoteBalls.size;
    const remoteHoled = [...this._remoteBalls.values()].filter(r => r.holed).length;
    const localHoled  = this._playersHoled.has('local');

    if (localHoled && remoteHoled >= totalRemote && this._state === 'HOLE_COMPLETE') {
      // Everyone done — advance immediately
      eventBus.emit(Events.HOLE_COMPLETE, {
        holeIndex: gameState.currentHole,
        strokes:   gameState.currentStrokes,
        players:   gameState.players,
      });
    }
  }

  _tickHoleTimer(dt) {
    if (!this._holeTimerActive) return;
    this._holeTimerRemaining -= dt;
    const seconds = Math.ceil(this._holeTimerRemaining);
    eventBus.emit(Events.MP_HOLE_TIMER, { remaining: Math.max(0, seconds) });

    if (this._holeTimerRemaining <= 0) {
      this._holeTimerActive = false;
      // Force-complete local player if not yet holed
      if (!this._playersHoled.has('local')) {
        gameState.currentStrokes = 10;
        this._playersHoled.add('local');
        const player = gameState.currentPlayer;
        if (player) gameState.recordStroke(player.id, gameState.currentHole, 10);
      }
      // Force-complete any remote players that didn't hole
      for (const [playerId, remote] of this._remoteBalls) {
        if (!remote.holed) {
          gameState.recordStroke(playerId, gameState.currentHole, 10);
          remote.holed = true;
        }
      }
      eventBus.emit(Events.HOLE_COMPLETE, {
        holeIndex: gameState.currentHole,
        strokes:   gameState.currentStrokes,
        players:   gameState.players,
      });
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
    this.ballTrail.dispose();
    this.launchBurst.dispose();
    this.scene.clear();
  }
}
