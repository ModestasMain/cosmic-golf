// ============================================================
// main.js — Cosmic Golf entry point
// ============================================================

import { WebGLRenderer, Vector2 } from 'three';
import { EffectComposer, RenderPass, BloomEffect, EffectPass, VignetteEffect, ChromaticAberrationEffect, DepthOfFieldEffect, TiltShiftEffect, SMAAEffect, SMAAPreset } from 'postprocessing';
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
      intensity:           0.9,
      luminanceThreshold:  0.85,
      luminanceSmoothing:  0,
      mipmapBlur:          true,
      levels:              4,   // fewer mip levels = fewer blur passes (default is 8)
    });

    this.chromAb = new ChromaticAberrationEffect({
      offset: new Vector2(0, 0),
    });

    this.vignette = new VignetteEffect({
      offset:   0.2,
      darkness: 0.73,
    });

    this.dof = new DepthOfFieldEffect(camera, {
      focusDistance: 0,
      focusRange:    0,
      bokehScale:    0,
    });

    this.tiltShift = new TiltShiftEffect({
      offset:    0.0,
      rotation:  0.0,
      focusArea: 0.8,
      feather:   0.3,
    });

    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });

    this.composer.addPass(new EffectPass(camera, this.bloom, this.chromAb, this.vignette));
    this.composer.addPass(new EffectPass(camera, this.smaa));
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
      gameState.players = gameState.players.filter((p) => p.id !== playerId);
      if (gameState.players.length <= 1) {
        gameState.isSoloMode = true;
      }
      this.playerLabels.removePlayer(playerId);
    });
  }

  _setupAudio() {
    // Init audio context on first interaction (browser autoplay policy)
    // BGM itself only starts after GAME_LAUNCHED event (pressed "Launch into Space")
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

    this._buildSettingsDrawer();
  }

  _buildSettingsDrawer() {
    const button = document.createElement('button');
    button.id = 'settings-btn';
    button.setAttribute('aria-label', 'Open settings');
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3.2"></circle>
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z"></path>
      </svg>
      <span>Settings</span>
    `;
    button.style.cssText = [
      'position:fixed',
      'bottom:max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))',
      'left:max(20px, calc(env(safe-area-inset-left, 0px) + 12px))',
      'z-index:204',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'background:linear-gradient(180deg, rgba(11, 8, 22, 0.9), rgba(8, 5, 18, 0.88))',
      'color:rgba(231, 226, 255, 0.94)',
      'font-family:Orbitron, sans-serif',
      'font-size:11px',
      'letter-spacing:0.15em',
      'text-transform:uppercase',
      'border:1px solid rgba(132, 92, 255, 0.44)',
      'border-radius:18px',
      'padding:11px 16px',
      'cursor:pointer',
      'box-shadow:0 18px 50px rgba(3,2,10,0.34)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';');

    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.style.cssText = [
      'position:fixed',
      'left:max(20px, calc(env(safe-area-inset-left, 0px) + 12px))',
      'bottom:max(74px, calc(env(safe-area-inset-bottom, 0px) + 68px))',
      'z-index:203',
      'display:none',
      'flex-direction:column',
      'gap:10px',
      'width:min(280px, calc(100vw - 36px))',
      'padding:12px',
      'border-radius:22px',
      'background:linear-gradient(180deg, rgba(10, 8, 24, 0.92), rgba(7, 5, 18, 0.9))',
      'border:1px solid rgba(124, 92, 255, 0.32)',
      'box-shadow:0 24px 64px rgba(3, 2, 10, 0.5)',
      'backdrop-filter:blur(14px)',
      '-webkit-backdrop-filter:blur(14px)',
    ].join(';');

    const header = document.createElement('div');
    header.textContent = 'SETTINGS';
    header.style.cssText = [
      'font-family:Orbitron, sans-serif',
      'font-size:10px',
      'letter-spacing:0.22em',
      'color:rgba(173, 118, 255, 0.95)',
      'text-transform:uppercase',
      'padding:0 2px 2px',
    ].join(';');
    panel.appendChild(header);

    const volumeControl = document.getElementById('volume-control');
    if (volumeControl) {
      volumeControl.style.position = 'static';
      volumeControl.style.left = 'auto';
      volumeControl.style.bottom = 'auto';
      volumeControl.style.zIndex = '1';
      volumeControl.style.width = '100%';
      volumeControl.style.padding = '8px 10px';
      volumeControl.style.borderRadius = '16px';
      panel.appendChild(volumeControl);
    }

    const ballStylePicker = document.getElementById('ball-style-picker');
    if (ballStylePicker) {
      ballStylePicker.style.position = 'static';
      ballStylePicker.style.left = 'auto';
      ballStylePicker.style.bottom = 'auto';
      ballStylePicker.style.zIndex = '1';
      ballStylePicker.style.width = '100%';
      ballStylePicker.style.gap = '6px';
      panel.appendChild(ballStylePicker);
    }

    const resetBtn = document.createElement('button');
    resetBtn.id = 'reset-btn';
    resetBtn.textContent = '↩ RESTART';
    resetBtn.style.cssText = [
      'width:100%',
      'background:linear-gradient(180deg, rgba(11, 8, 22, 0.86), rgba(8, 5, 18, 0.84))',
      'color:rgba(231, 226, 255, 0.92)',
      'font-family:Orbitron, sans-serif',
      'font-size:12px',
      'letter-spacing:0.16em',
      'border:1px solid rgba(132, 92, 255, 0.44)',
      'border-radius:16px',
      'padding:12px 14px',
      'cursor:pointer',
      'box-shadow:0 16px 42px rgba(3,2,10,0.24)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';');
    resetBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      eventBus.emit(Events.BALL_RESET_TO_TEE);
    });
    resetBtn.addEventListener('pointerdown', () => { resetBtn.style.background = 'linear-gradient(180deg, rgba(26, 17, 49, 0.92), rgba(12, 8, 25, 0.92))'; });
    resetBtn.addEventListener('pointerup',   () => { resetBtn.style.background = 'linear-gradient(180deg, rgba(11, 8, 22, 0.86), rgba(8, 5, 18, 0.84))'; });
    panel.appendChild(resetBtn);

    const closePanel = () => {
      panel.style.display = 'none';
      button.dataset.open = '0';
    };
    const openPanel = () => {
      panel.style.display = 'flex';
      button.dataset.open = '1';
    };

    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (panel.style.display === 'flex') closePanel();
      else openPanel();
    });

    document.addEventListener('pointerdown', (e) => {
      if (!panel.contains(e.target) && !button.contains(e.target)) {
        closePanel();
      }
    });

    document.body.appendChild(panel);
    document.body.appendChild(button);
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
      // Portal skips the name overlay — start BGM on first interaction instead
      document.addEventListener('pointerdown', () => eventBus.emit(Events.GAME_LAUNCHED), { once: true });
      return;
    }

    this.nameEntry.show().then(({ name, mode, roomCode }) => {
      gameState.players[0].name = name;
      if (mode === 'create') {
        const createdCode = this.mp.createPrivateRoom(name, undefined, roomCode);
        this._syncRoomUrl(createdCode);
      } else if (mode === 'join' && roomCode) {
        this.mp.joinRoom(roomCode, name);
        this._syncRoomUrl(roomCode);
      } else {
        this.mp.joinPublic(name); // no color — _colorFromId assigns unique color
        this._syncRoomUrl(null);
      }
      const color = this.mp.localColor;
      gameState.players[0].color = color;

      this.playerLabels.addPlayer(gameState.players[0].id, name, color);
      this.holeScene.loadHole(0);
      this.ballStylePicker.show();
      setTimeout(() => this.tutorial.show(), 600);
      setTimeout(() => this.mp.updateIdentity(name, color), 2000);
    });
  }

  _syncRoomUrl(roomCode) {
    const url = new URL(window.location.href);
    if (roomCode && roomCode !== 'PUBLIC') {
      url.searchParams.set('room', roomCode);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url);
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
