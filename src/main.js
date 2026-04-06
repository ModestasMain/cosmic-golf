// ============================================================
// main.js — Cosmic Golf entry point
// Sets up renderer, boots directly into hole 1 (no title screen)
// ============================================================

import { WebGLRenderer, Clock } from 'three';
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
import { audioManager } from './audio/AudioManager.js';

class Game {
  constructor() {
    this.clock = new Clock();
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

    // Kick off render loop
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
    this.aimUI       = new AimUI();
    this.tutorial    = new TutorialOverlay();
    this.mpUI        = new MultiplayerUI();
    // Show after a short delay so the game has rendered something behind it
    setTimeout(() => this.tutorial.show(), 800);
  }

  _setupMultiplayer() {
    this.mp = new MultiplayerManager();

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam) {
      // Join existing room from shared link
      this.mp.joinRoom(roomParam, gameState.players[0].name, gameState.players[0].color);
    } else {
      // Create new room — then put code in URL so it's shareable
      const code = this.mp.createRoom(gameState.players[0].name, gameState.players[0].color);
      const url = new URL(window.location.href);
      url.searchParams.set('room', code);
      window.history.replaceState({}, '', url.toString());
    }

    // Wire multiplayer shot events
    this.mp.onShotReceived((data) => {
      eventBus.emit(Events.SHOT_RECEIVED, data);
    });

    eventBus.on(Events.SHOT_TAKEN, (data) => {
      if (!gameState.isSoloMode && this.holeScene.ball) {
        const vel = this.holeScene._computeShotVelocity(data.dragScreenVec, data.dragDist);
        if (vel) {
          this.mp.broadcastShot(
            { x: vel.x, y: vel.y, z: vel.z },
            data.power,
          );
        }
      }
    });

    eventBus.on(Events.BALL_HOLED, ({ strokes }) => {
      this.mp.broadcastHoleComplete(strokes);
    });

    eventBus.on(Events.MP_SOLO_MODE, () => {
      gameState.isSoloMode = true;
    });

    eventBus.on(Events.MP_PLAYER_JOINED, ({ playerId, name }) => {
      // Add new player if not already known
      if (!gameState.players.find(p => p.id === playerId)) {
        gameState.addPlayer(playerId, name, 0xff6464);
        gameState.isSoloMode = false;
      }
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
  }

  _startGame() {
    // Boot directly into hole 1 (no title screen — VibeJam rule)
    this.holeScene.loadHole(0);
  }

  _animate() {
    const dt = Math.min(this.clock.getDelta(), 0.1); // cap delta

    // Update input (power oscillation)
    this.inputSystem.update(dt);

    // Update game scene
    this.holeScene.update(dt);

    // Update HUD + cup indicator
    this.aimUI.update();
    if (this.holeScene.cup && this.holeScene.ball) {
      this.aimUI.updateCupIndicator(
        this.holeScene.cup.position,
        this.holeScene.camera,
        this.holeScene.ball.position,
      );
    }

    // Render via postprocessing composer (bloom + vignette)
    this.composer.render(dt);
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
    this.holeScene.onResize();
  }
}

// Start game
new Game();
