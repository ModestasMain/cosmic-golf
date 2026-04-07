// ============================================================
// main.js — Cosmic Golf entry point
// Sets up renderer, boots directly into hole 1 (no title screen)
// ============================================================

import { WebGLRenderer } from 'three';
import { EffectComposer, RenderPass, BloomEffect, EffectPass, VignetteEffect } from 'postprocessing';
import { eventBus, Events } from './core/EventBus.js';
import { gameState } from './core/GameState.js';
import { InputSystem } from './systems/InputSystem.js';
import { HoleScene } from './scenes/HoleScene.js';
import { ScoreboardScene } from './scenes/ScoreboardScene.js';
import { AimUI } from './ui/AimUI.js';
import { TutorialOverlay } from './ui/TutorialOverlay.js';
import { MultiplayerManager } from './multiplayer/MultiplayerManager.js';
import { MultiplayerUI } from './ui/MultiplayerUI.js';
import { NameEntryOverlay } from './ui/NameEntryOverlay.js';
import { LobbyOverlay } from './ui/LobbyOverlay.js';
import { PlayerLabels } from './ui/PlayerLabels.js';
import { audioManager } from './audio/AudioManager.js';

class Game {
  constructor() {
    this._lastTime = performance.now();
    this._hiddenInterval = null;
    this._init();
  }

  _init() {
    this._setupRenderer();
    this._setupState();
    this._setupSystems();
    this._setupComposer();
    this._setupUI();
    this._setupMultiplayer();
    this._setupEventListeners();
    this._startGame();
    this._setupAudio();
    this._setupVisibility();

    // rAF loop — renders + updates when tab is visible
    this.renderer.setAnimationLoop(() => this._animate());
  }

  _setupRenderer() {
    this.renderer = new WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    document.body.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this._onResize());
  }

  _setupComposer() {
    const { scene, camera } = this.holeScene;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    const bloom = new BloomEffect({
      intensity: 1.4,
      luminanceThreshold: 0.38,
      luminanceSmoothing: 0.1,
      mipmapBlur: true,
    });

    const vignette = new VignetteEffect({
      offset: 0.4,
      darkness: 0.7,
    });

    this.composer.addPass(new EffectPass(camera, bloom, vignette));
  }

  _setupState() {
    // Default solo player — will be overridden if multiplayer joins
    gameState.addPlayer('solo', 'PLAYER', 0xffffff);

    // Read portal params
    const params = new URLSearchParams(window.location.search);
    if (params.has('username')) {
      gameState.players[0].name = params.get('username').toUpperCase();
    }
    if (params.has('color')) {
      const c = parseInt(params.get('color'), 16);
      if (!isNaN(c)) gameState.players[0].color = c;
    }
  }

  _setupSystems() {
    this.inputSystem = new InputSystem(this.renderer, null, null); // camera set later
    this.holeScene = new HoleScene(this.renderer, this.inputSystem);
    this.scoreboardScene = new ScoreboardScene();

    // Give input system the camera reference
    this.inputSystem.camera = this.holeScene.camera;
  }

  _setupUI() {
    this.aimUI        = new AimUI();
    this.tutorial     = new TutorialOverlay();
    this.mpUI         = new MultiplayerUI();
    this.nameEntry    = new NameEntryOverlay();
    this.lobbyOverlay = new LobbyOverlay();
    this.playerLabels = new PlayerLabels();
  }

  _setupMultiplayer() {
    this.mp = new MultiplayerManager();

    // Wire shot + sync callbacks (before any connection is made)
    this.mp.onShotReceived((data) => {
      eventBus.emit(Events.SHOT_RECEIVED, data);
    });
    this.mp.onBallStateReceived((data) => {
      eventBus.emit(Events.MP_BALL_STATE, data);
    });

    eventBus.on(Events.BALL_POS_SYNC, ({ pos, vel }) => {
      if (!gameState.isSoloMode) this.mp.broadcastBallState(pos, vel);
    });

    eventBus.on(Events.SHOT_TAKEN, (data) => {
      if (!gameState.isSoloMode && this.holeScene.ball) {
        const vel = this.holeScene._computeShotVelocity(data.dragScreenVec, data.dragDist);
        if (vel) this.mp.broadcastShot({ x: vel.x, y: vel.y, z: vel.z }, data.power);
      }
    });

    eventBus.on(Events.BALL_HOLED, ({ strokes }) => {
      this.mp.broadcastHoleComplete(strokes);
    });

    eventBus.on(Events.MP_SOLO_MODE, () => {
      gameState.isSoloMode = true;
    });

    eventBus.on(Events.MP_PLAYER_JOINED, ({ playerId, name, color }) => {
      const col = color ?? 0xff6464;
      const existing = gameState.players.find(p => p.id === playerId);
      if (!existing) {
        gameState.addPlayer(playerId, name, col);
        gameState.isSoloMode = false;
        this.playerLabels.addPlayer(playerId, name || playerId, col);
      } else if (name && name !== existing.name) {
        existing.name = name;
        this.playerLabels.updateName(playerId, name);
      }
    });

    eventBus.on(Events.MP_PLAYER_LEFT, ({ playerId }) => {
      this.playerLabels.removePlayer(playerId);
    });

    eventBus.on(Events.MP_GAME_START, () => {
      // Server says go — start the game
      this.holeScene.loadHole(0);
      setTimeout(() => this.tutorial.show(), 600);
    });

    eventBus.on(Events.MP_ROOM_LOCKED, () => {
      // Game already in progress — fall back to solo
      this.mp._enterSoloMode();
    });
  }

  _setupAudio() {
    // Audio can only start after a user gesture (browser autoplay policy).
    // Init on the first pointerdown, then the AudioContext is alive for the session.
    document.addEventListener('pointerdown', () => audioManager.init(), { once: true });
  }

  _setupEventListeners() {
    // Game restart
    eventBus.on('game:restart', () => {
      gameState.reset();
      gameState.addPlayer('solo', 'PLAYER', 0xffffff);
      this.holeScene.loadHole(0);
    });

    // Reset ball to tee (R key or mobile button)
    eventBus.on(Events.BALL_RESET_TO_TEE, () => {
      this.holeScene.resetBallToTee();
    });

    // Mobile reset button
    this._buildResetButton();
  }

  _buildResetButton() {
    const btn = document.createElement('button');
    btn.id = 'reset-btn';
    btn.textContent = '↩ RESTART';
    btn.style.cssText = [
      'position:fixed',
      'bottom:max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))',
      'left:max(20px, calc(env(safe-area-inset-left, 0px) + 12px))',
      'z-index:200',
      'background:rgba(10,12,30,0.75)',
      'color:rgba(160,210,255,0.9)',
      'font-family:monospace',
      'font-size:11px',
      'letter-spacing:2px',
      'border:1px solid rgba(100,160,255,0.35)',
      'border-radius:8px',
      'padding:8px 14px',
      'cursor:pointer',
      'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';');

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      eventBus.emit(Events.BALL_RESET_TO_TEE);
    });

    // Visual feedback on press
    btn.addEventListener('pointerdown', () => { btn.style.background = 'rgba(40,60,120,0.85)'; });
    btn.addEventListener('pointerup',   () => { btn.style.background = 'rgba(10,12,30,0.75)'; });

    document.body.appendChild(btn);
  }

  _startGame() {
    // Pre-fill room code from URL if arriving via invite link
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) this.nameEntry.prefillRoom(urlRoom);

    this.nameEntry.show().then(({ name, roomCode }) => {
      // Update local player name
      gameState.players[0].name = name;
      const color = gameState.players[0].color;

      this.playerLabels.addPlayer(gameState.players[0].id, name, color);

      if (roomCode) {
        // Private room — join by code, put in URL for sharing
        this.mp.joinRoom(roomCode, name, color);
        const url = new URL(window.location.href);
        url.searchParams.set('room', roomCode);
        window.history.replaceState({}, '', url.toString());
        this.lobbyOverlay.show(false, roomCode, gameState.players[0]);
      } else {
        // Public lobby
        this.mp.joinPublic(name, color);
        // Clear room param so URL stays clean for public players
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
        this.lobbyOverlay.show(true, null, gameState.players[0]);
      }

      // Re-announce once connected so peers get the real name
      // (connection may not be open yet — MultiplayerManager guards this)
      setTimeout(() => this.mp.updateIdentity(name, color), 2000);
    });
  }

  _setupVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Tab hidden — rAF stops, run physics-only loop via setInterval (~30 fps)
        this._lastTime = performance.now();
        this._hiddenInterval = setInterval(() => this._stepHidden(), 1000 / 30);
      } else {
        // Tab visible — kill interval, rAF resumes; reset time to avoid dt spike
        clearInterval(this._hiddenInterval);
        this._hiddenInterval = null;
        this._lastTime = performance.now();
      }
    });
  }

  /** Physics-only tick used when tab is hidden. No render. */
  _stepHidden() {
    const now = performance.now();
    const dt  = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;
    this.inputSystem.update(dt);
    this.holeScene.update(dt);
  }

  _animate() {
    const now = performance.now();
    const dt  = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    this.inputSystem.update(dt);
    this.holeScene.update(dt);

    this.aimUI.update();
    if (this.holeScene.cup && this.holeScene.ball) {
      this.aimUI.updateCupIndicator(
        this.holeScene.cup.position,
        this.holeScene.camera,
        this.holeScene.ball.position,
      );
    }

    this._updatePlayerLabels();
    this.composer.render(dt);
  }

  _updatePlayerLabels() {
    const cam = this.holeScene.camera;
    if (!cam) return;

    // Local player label follows their ball
    if (this.holeScene.ball) {
      this.playerLabels.setWorldPos(
        gameState.players[0]?.id,
        this.holeScene.ball.position,
      );
    }

    // Remote player labels follow ghost balls
    for (const [playerId, remote] of this.holeScene._remoteBalls) {
      this.playerLabels.setWorldPos(playerId, remote.ball.position);
    }

    this.playerLabels.render(cam);
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
    this.holeScene.onResize();
  }
}

// Start game
new Game();
