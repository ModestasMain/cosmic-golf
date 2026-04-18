// ============================================================
// main.js — Cosmic Golf entry point
// ============================================================

import { WebGLRenderer, Vector2 } from 'three';
import { EffectComposer, RenderPass, BloomEffect, EffectPass, VignetteEffect, ChromaticAberrationEffect, DepthOfFieldEffect, TiltShiftEffect } from 'postprocessing';
import { eventBus, Events } from './core/EventBus.js';
import { gameState } from './core/GameState.js';
import { InputSystem } from './systems/InputSystem.js';
import { HoleScene } from './scenes/HoleScene.js';
import { ScoreboardScene } from './scenes/ScoreboardScene.js';
import { AimUI } from './ui/AimUI.js';
import { TutorialOverlay } from './ui/TutorialOverlay.js';
import { MultiplayerManager } from './multiplayer/MultiplayerManager.js';
import { AchievementManager } from './core/AchievementManager.js';
import { AchievementToast } from './ui/AchievementToast.js';
import { MultiplayerUI } from './ui/MultiplayerUI.js';
import { NameEntryOverlay } from './ui/NameEntryOverlay.js';
import { PlayerLabels } from './ui/PlayerLabels.js';
import { AnnouncerUI } from './ui/AnnouncerUI.js';
import { EventHUD } from './ui/EventHUD.js';
import { LobbyPanel } from './ui/LobbyPanel.js';
import { BallStylePicker } from './ui/BallStylePicker.js';
import { audioManager } from './audio/AudioManager.js';
import { DevPanel } from './debug/DevPanel.js';

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

    this.bloom = new BloomEffect({
      intensity:           0,
      luminanceThreshold:  0.28,
      luminanceSmoothing:  0.45,
      mipmapBlur:          true,
    });

    this.chromAb = new ChromaticAberrationEffect({
      offset: new Vector2(0, 0),
    });

    this.vignette = new VignetteEffect({
      offset:   0.3,
      darkness: 0.8,
    });

    this.dof = new DepthOfFieldEffect(camera, {
      focusDistance: 10,
      focusRange:    6,
      bokehScale:    0,
    });

    this.tiltShift = new TiltShiftEffect({
      offset:    0.0,
      rotation:  0.0,
      focusArea: 0.85,
      feather:   0.3,
    });

    this.composer.addPass(new EffectPass(camera, this.bloom, this.chromAb, this.vignette));
    this.blurPass = new EffectPass(camera, this.dof, this.tiltShift);
    this._blurPassAdded = false; // added to composer on first use

    // Dev panel — toggle with backtick key
    this.devPanel = new DevPanel({
      spaceBg:    this.holeScene.spaceBg,
      starField:  this.holeScene.starField,
      blurPass:   this.blurPass,
      composer:   this.composer,
      holeScene:  this.holeScene,
      bloom:      this.bloom,
      vignette:   this.vignette,
      chromAb:    this.chromAb,
      dof:        this.dof,
      tiltShift:  this.tiltShift,
    });
  }

  _setupState() {
    // Default solo player — overridden if multiplayer joins
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
    this.inputSystem = new InputSystem(this.renderer, null, null);
    this.holeScene = new HoleScene(this.renderer, this.inputSystem);
    this.scoreboardScene = new ScoreboardScene();

    this.inputSystem.camera = this.holeScene.camera;
  }

  _setupUI() {
    this.aimUI     = new AimUI();
    this.tutorial  = new TutorialOverlay();
    this.achievements = new AchievementManager();
    this.achievementToast = new AchievementToast();
    this.achievements.onToast((a) => this.achievementToast.show(a));
    this.mpUI      = new MultiplayerUI();
    this.nameEntry = new NameEntryOverlay();
    this.nameEntry.setAchievementManager(this.achievements);
    this.playerLabels = new PlayerLabels();
    this.announcer   = new AnnouncerUI();
    this.eventHUD    = new EventHUD();
    this.lobbyPanel  = new LobbyPanel();
    this.ballStylePicker = new BallStylePicker();
  }

  _setupMultiplayer() {
    this.mp = new MultiplayerManager();

    // Give HoleScene a reference to MP so it can broadcast billiard hits
    this.holeScene.mp = this.mp;
    this.scoreboardScene._mp = this.mp;

    this.mp.onShotReceived((data) => {
      eventBus.emit(Events.SHOT_RECEIVED, data);
    });
    this.mp.onBallStateReceived((data) => {
      eventBus.emit(Events.MP_BALL_STATE, data);
    });

    eventBus.on(Events.BALL_POS_SYNC, ({ pos, vel, holeIndex, bounce, planetIdx, normal }) => {
      if (!gameState.isSoloMode) this.mp.broadcastBallState(pos, vel, holeIndex, bounce, planetIdx, normal);
    });

    eventBus.on(Events.BALL_STOPPED, ({ pos, holeIndex, planetIdx, normal }) => {
      if (!gameState.isSoloMode) this.mp.broadcastBallStopped(pos, holeIndex, planetIdx, normal);
    });

    eventBus.on(Events.SHOT_TAKEN, (data) => {
      if (!gameState.isSoloMode && this.holeScene.ball) {
        const vel = this.holeScene._computeShotVelocity(data.dragScreenVec, data.dragDist);
        if (vel) this.mp.broadcastShot({ x: vel.x, y: vel.y, z: vel.z }, data.power, gameState.currentHole);
      }
    });

    eventBus.on(Events.BALL_HOLED, ({ strokes, timeMs }) => {
      this.mp.broadcastHoleComplete(strokes, timeMs);
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
      // Tell lobby panel which entry is the local player (first time we see our own ID)
      if (playerId === this.mp.playerId && !this.lobbyPanel._localId) {
        this.lobbyPanel.setLocalId(playerId);
      }
    });

    eventBus.on(Events.MP_PLAYER_LEFT, ({ playerId }) => {
      this.playerLabels.removePlayer(playerId);
    });
  }

  _setupAudio() {
    document.addEventListener('pointerdown', () => audioManager.init(), { once: true });
  }

  _setupEventListeners() {
    eventBus.on('game:restart', () => {
      this.mp.broadcastGameRestart();
      const savedColor = this.mp.localColor ?? gameState.players[0]?.color ?? 0xff6600;
      const savedName  = gameState.players[0]?.name ?? 'PLAYER';
      gameState.reset();
      gameState.addPlayer('solo', savedName, savedColor);
      this.holeScene.loadHole(0);
    });

    eventBus.on(Events.BALL_RESET_TO_TEE, () => {
      this.mp.broadcastBallReset(gameState.currentHole);
      this.holeScene.resetBallToTee();
    });

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
    btn.addEventListener('pointerdown', () => { btn.style.background = 'rgba(40,60,120,0.85)'; });
    btn.addEventListener('pointerup',   () => { btn.style.background = 'rgba(10,12,30,0.75)'; });

    document.body.appendChild(btn);
  }

  _startGame() {
    // Portal arrival: skip name entry, use URL params directly
    if (gameState.portalMode && gameState.portalUsername) {
      const name  = gameState.portalUsername;
      const color = gameState.portalColor
        ? parseInt(gameState.portalColor.replace('#', ''), 16) || gameState.players[0].color
        : gameState.players[0].color;

      gameState.players[0].name  = name;
      gameState.players[0].color = color;
      this.playerLabels.addPlayer(gameState.players[0].id, name, color);
      this.mp.joinPublic(name, color);
      this.holeScene.loadHole(0);
      this.ballStylePicker.show();
      setTimeout(() => this.mp.updateIdentity(name, color), 2000);
      return;
    }

    this.nameEntry.show().then(({ name }) => {
      gameState.players[0].name = name;
      this.mp.joinPublic(name); // no color — _colorFromId assigns unique color
      const color = this.mp.localColor;
      gameState.players[0].color = color;

      this.playerLabels.addPlayer(gameState.players[0].id, name, color);
      this.holeScene.loadHole(0);
      this.ballStylePicker.show();
      setTimeout(() => this.tutorial.show(), 600);
      setTimeout(() => this.mp.updateIdentity(name, color), 2000);
    });
  }

  _setupVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._lastTime = performance.now();
        this._hiddenInterval = setInterval(() => this._stepHidden(), 1000 / 30);
      } else {
        clearInterval(this._hiddenInterval);
        this._hiddenInterval = null;
        this._lastTime = performance.now();
      }
    });
  }

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

    // Update local player label — hide during hole transition states
    const localId = gameState.players[0]?.id;
    const hideLabel = this.holeScene._state === 'HOLE_COMPLETE'
                   || this.holeScene._state === 'CINEMATIC';
    if (this.holeScene.ball && !hideLabel) {
      this.playerLabels.setWorldPos(localId, this.holeScene.ball.position);
    } else {
      this.playerLabels.setWorldPos(localId, null);
    }

    // Update remote labels — clear first so players who left the hole disappear
    for (const [id] of this.playerLabels._labels) {
      if (id !== localId) this.playerLabels.setWorldPos(id, null);
    }
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

window.__game__ = new Game();
