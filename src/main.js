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
import { DailyOverlay } from './ui/DailyOverlay.js';
import { audioManager } from './audio/AudioManager.js';
import { MULTIPLAYER, STAR_TUNING } from './core/Constants.js';

function _getCgPlayerId() {
  const key = 'cosmic-golf-player-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `cg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}
function _getCgSessionId() {
  if (!gameState.leaderboardSessionId) {
    gameState.leaderboardSessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
  return gameState.leaderboardSessionId;
}

let _holeStatsEndpointAvailable = true;

function _recordHoleStats(payload) {
  if (!_holeStatsEndpointAvailable) return;
  fetch(`https://${MULTIPLAYER.MP_HOST}/hole-completed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: payload }),
    keepalive: true,
  }).then((res) => {
    if (res.status === 404 || res.status === 405) {
      _holeStatsEndpointAvailable = false;
    }
  }).catch(() => {});
}

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const QUALITY_MODE_ORDER = ['auto', 'high', 'medium', 'performance'];
const MANUAL_QUALITY_KEYS = {
  high: 'high',
  medium: 'medium',
  performance: 'low',
};

function isLocalDevHost() {
  return import.meta.env.DEV && LOCAL_DEV_HOSTS.has(window.location.hostname);
}

const QUALITY_PROFILES = {
  high: {
    label: 'Cinematic',
    pixelRatioCap: 1.1,
    composerMode: 'full',
    bloomIntensity: 0.62,
    bloomThreshold: 0.88,
    bloomSmoothing: 0.04,
    vignetteDarkness: 0.66,
    scene: {
      stars:  { visible: true, brightness: STAR_TUNING.BRIGHTNESS, heroScale: STAR_TUNING.HERO_SCALE, shimmerAmp: STAR_TUNING.SHIMMER_AMP },
      nebula: { visible: true, opacityScale: 1.0, sizeScale: 1.0 },
      comets: { enabled: true, maxActive: 4, intervalScale: 1.0 },
      trails: { density: 1.0, sizeScale: 1.0, opacityScale: 1.0 },
    },
  },
  medium: {
    label: 'Balanced',
    pixelRatioCap: 1.1,
    composerMode: 'reduced',
    bloomIntensity: 0.58,
    bloomThreshold: 0.88,
    bloomSmoothing: 0.04,
    vignetteDarkness: 0.58,
    scene: {
      stars:  { visible: true, brightness: STAR_TUNING.BRIGHTNESS, heroScale: STAR_TUNING.HERO_SCALE, shimmerAmp: STAR_TUNING.SHIMMER_AMP },
      nebula: { visible: true, opacityScale: 0.72, sizeScale: 0.88 },
      comets: { enabled: true, maxActive: 2, intervalScale: 1.45 },
      trails: { density: 0.72, sizeScale: 0.88, opacityScale: 0.9 },
    },
  },
  low: {
    label: 'Performance',
    pixelRatioCap: 0.85,
    composerMode: 'minimal',
    bloomIntensity: 0.0,
    bloomThreshold: 0.95,
    bloomSmoothing: 0.08,
    vignetteDarkness: 0.42,
    scene: {
      stars:  { visible: true, brightness: STAR_TUNING.BRIGHTNESS, heroScale: STAR_TUNING.HERO_SCALE, shimmerAmp: STAR_TUNING.SHIMMER_AMP },
      nebula: { visible: false, opacityScale: 0.0, sizeScale: 0.72 },
      comets: { enabled: false, maxActive: 0, intervalScale: 2.2 },
      trails: { density: 0.42, sizeScale: 0.78, opacityScale: 0.78 },
    },
  },
};

class Game {
  constructor() {
    this._lastTime = performance.now();
    this._hiddenInterval = null;
    this._launchTutorialTimer = null;
    this._firstShotTakenThisRun = false;
    this._qualityMode = this._normalizeQualityMode(localStorage.getItem('cosmic_quality_mode') || 'high');
    this._qualityKey = null;
    this._quality = null;
    this._gpuTier = null;
    this._autoQualityOverrideKey = null;
    this._qualityFrameStats = { frames: 0, elapsed: 0 };
    this.devPanel = null;
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
    this._refreshQualityProfile();
    this.renderer = new WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this._gpuTier = this._detectGpuTier();
    this._refreshQualityProfile();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._quality.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    document.body.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this._onResize());
  }

  _setupComposer() {
    const { scene, camera } = this.holeScene;

    this.bloom = new BloomEffect({
      intensity:           this._quality.bloomIntensity,
      luminanceThreshold:  this._quality.bloomThreshold,
      luminanceSmoothing:  this._quality.bloomSmoothing,
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
    this.blurPass = new EffectPass(camera, this.dof, this.tiltShift);
    this._blurPassAdded = false; // added to composer on first use
    this._rebuildComposer();
    this._setupDevPanelIfLocal();
  }

  _setupDevPanelIfLocal() {
    if (this.devPanel || !isLocalDevHost()) return;

    import(/* @vite-ignore */ './debug/DevPanel.js')
      .then(({ DevPanel }) => {
        if (this.devPanel || !isLocalDevHost()) return;
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
      })
      .catch((err) => {
        console.warn('[DevPanel] Local dev panel failed to load:', err);
      });
  }

  _setupState() {
    // Default solo player — overridden if multiplayer joins
    gameState.addPlayer('solo', 'PLAYER', 0xffffff);

    // Read portal params
    const params = new URLSearchParams(window.location.search);
    if (params.has('challenge')) {
      gameState.setChallengeSeed(params.get('challenge'));
    }
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
    this.dailyOverlay = new DailyOverlay();

    this.inputSystem.camera = this.holeScene.camera;
    this._applySceneQuality();
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
      if (!gameState.isDailyChallenge) {
        const payload = {
          sessionId: _getCgSessionId(),
          playerId: _getCgPlayerId(),
          holeIndex: gameState.currentHole,
          strokes,
        };
        _recordHoleStats(payload);
      }
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
    eventBus.on('game:freeplay', () => {
      const savedName = gameState.players[0]?.name ?? localStorage.getItem('cg_callsign') ?? 'PLAYER';
      this.mp.joinPublic(savedName);
      this._syncRoomUrl('');
      eventBus.emit('game:restart');
    });

    eventBus.on('game:restart', () => {
      this.mp.broadcastGameRestart();
      const savedColor = this.mp.localColor ?? gameState.players[0]?.color ?? 0xff6600;
      const savedName  = gameState.players[0]?.name ?? 'PLAYER';
      this._firstShotTakenThisRun = false;
      this._clearLaunchAssistTutorial();
      this.tutorial.dismiss();
      gameState.reset();
      gameState.addPlayer('solo', savedName, savedColor);
      this.holeScene.loadHole(0);
      this._scheduleLaunchAssistTutorial();
    });

    eventBus.on(Events.BALL_RESET_TO_TEE, () => {
      this.mp.broadcastBallReset(gameState.currentHole);
      this.holeScene.resetBallToTee();
    });

    eventBus.on(Events.SHOT_TAKEN, () => {
      this._firstShotTakenThisRun = true;
      this._clearLaunchAssistTutorial();
      this.tutorial.dismiss();
    });

    eventBus.on(Events.HOLE_LOADED, ({ holeIndex }) => {
      if (holeIndex === 0 && !this._firstShotTakenThisRun) {
        this._scheduleLaunchAssistTutorial();
      } else {
        this._clearLaunchAssistTutorial();
      }
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

    const backdrop = document.createElement('div');
    backdrop.id = 'settings-backdrop';
    backdrop.style.cssText = [
      'position:fixed','inset:0','z-index:202','display:none',
      'align-items:stretch','justify-content:center',
      'background:radial-gradient(ellipse at center, rgba(14,8,32,0.92), rgba(3,2,10,0.97))',
      'backdrop-filter:blur(18px)','-webkit-backdrop-filter:blur(18px)',
      'overflow:auto',
    ].join(';');

    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.style.cssText = [
      'position:relative',
      'z-index:203',
      'display:flex',
      'flex-direction:column',
      'gap:14px',
      'width:100%',
      'max-width:560px',
      'margin:auto',
      'padding:36px 32px',
      'box-sizing:border-box',
      'min-height:100%',
      'justify-content:center',
      'background:transparent',
      'border:none',
    ].join(';');

    const header = document.createElement('div');
    header.textContent = 'SETTINGS';
    header.style.cssText = [
      'font-family:Orbitron, sans-serif',
      'font-size:28px',
      'letter-spacing:0.42em',
      'color:#e9ddff',
      'text-transform:uppercase',
      'text-align:center',
      'padding:8px 2px 22px',
      'border-bottom:1px solid rgba(124,92,255,0.24)',
      'margin-bottom:10px',
      'text-shadow:0 0 24px rgba(132,92,255,0.45)',
    ].join(';');
    panel.appendChild(header);

    const perfBtn = document.createElement('button');
    perfBtn.id = 'quality-toggle-btn';
    perfBtn.style.cssText = [
      'width:100%',
      'min-height:46px',
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'flex-wrap:wrap',
      'gap:4px 10px',
      'box-sizing:border-box',
      'background:linear-gradient(180deg, rgba(11, 8, 22, 0.86), rgba(8, 5, 18, 0.84))',
      'color:rgba(231, 226, 255, 0.92)',
      'font-family:Orbitron, sans-serif',
      'font-size:11px',
      'letter-spacing:0.14em',
      'border:1px solid rgba(132, 92, 255, 0.44)',
      'border-radius:16px',
      'padding:12px 16px',
      'cursor:pointer',
      'box-shadow:0 16px 42px rgba(3,2,10,0.2)',
      'text-transform:uppercase',
    ].join(';');
    perfBtn.addEventListener('click', () => {
      this._cycleQualityMode();
    });
    panel.appendChild(perfBtn);
    this._qualityToggleBtn = perfBtn;
    this._updateQualityToggle();

    const volumeControl = document.getElementById('volume-control');
    if (volumeControl) {
      volumeControl.style.position = 'static';
      volumeControl.style.left = 'auto';
      volumeControl.style.bottom = 'auto';
      volumeControl.style.zIndex = '1';
      volumeControl.style.width = '100%';
      volumeControl.style.boxSizing = 'border-box';
      volumeControl.style.padding = '12px 16px';
      volumeControl.style.borderRadius = '16px';
      volumeControl.style.border = '1px solid rgba(132,92,255,0.44)';
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
      'min-height:46px',
      'background:linear-gradient(180deg, rgba(11, 8, 22, 0.86), rgba(8, 5, 18, 0.84))',
      'color:rgba(231, 226, 255, 0.92)',
      'font-family:Orbitron, sans-serif',
      'font-size:11px',
      'letter-spacing:0.16em',
      'border:1px solid rgba(132, 92, 255, 0.44)',
      'border-radius:16px',
      'padding:12px 16px',
      'cursor:pointer',
      'box-sizing:border-box',
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

    const menuBtn = document.createElement('button');
    menuBtn.id = 'main-menu-btn';
    menuBtn.textContent = '⌂ BACK TO MAIN MENU';
    menuBtn.style.cssText = [
      'width:100%',
      'min-height:46px',
      'background:linear-gradient(180deg, rgba(40, 22, 74, 0.92), rgba(22, 12, 46, 0.92))',
      'color:#ffd24a',
      'font-family:Orbitron, sans-serif',
      'font-size:11px',
      'letter-spacing:0.16em',
      'border:1px solid rgba(255,210,74,0.44)',
      'border-radius:16px',
      'padding:12px 16px',
      'cursor:pointer',
      'box-sizing:border-box',
      'text-transform:uppercase',
    ].join(';');
    menuBtn.addEventListener('click', () => {
      window.location.href = window.location.origin + window.location.pathname;
    });
    panel.appendChild(menuBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'CLOSE';
    closeBtn.style.cssText = [
      'width:100%',
      'min-height:46px',
      'background:transparent',
      'color:rgba(200,190,230,0.7)',
      'font-family:Orbitron, sans-serif',
      'font-size:11px',
      'letter-spacing:0.2em',
      'border:1px solid rgba(132, 92, 255, 0.24)',
      'border-radius:16px',
      'padding:12px 16px',
      'cursor:pointer',
      'box-sizing:border-box',
      'text-transform:uppercase',
    ].join(';');
    panel.appendChild(closeBtn);

    const closeX = document.createElement('button');
    closeX.setAttribute('aria-label', 'Close settings');
    closeX.innerHTML = '✕';
    closeX.style.cssText = [
      'position:absolute',
      'top:max(18px, env(safe-area-inset-top, 0px))',
      'right:max(18px, env(safe-area-inset-right, 0px))',
      'z-index:204',
      'width:44px','height:44px',
      'display:flex','align-items:center','justify-content:center',
      'background:rgba(11,8,22,0.7)',
      'color:rgba(231,226,255,0.92)',
      'font-family:Orbitron, sans-serif',
      'font-size:18px',
      'border:1px solid rgba(132,92,255,0.44)',
      'border-radius:50%',
      'cursor:pointer',
    ].join(';');
    backdrop.appendChild(closeX);
    backdrop.appendChild(panel);

    const closePanel = () => {
      backdrop.style.display = 'none';
      button.dataset.open = '0';
      const eh = document.getElementById('event-hud');
      if (eh) eh.style.visibility = '';
    };
    const openPanel = () => {
      backdrop.style.display = 'flex';
      button.dataset.open = '1';
      const eh = document.getElementById('event-hud');
      if (eh) eh.style.visibility = 'hidden';
    };

    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (backdrop.style.display === 'flex') closePanel();
      else openPanel();
    });

    closeBtn.addEventListener('click', closePanel);
    closeX.addEventListener('click', closePanel);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (backdrop.style.display === 'flex') closePanel();
        else openPanel();
      }
    });

    document.body.appendChild(backdrop);
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
      this._scheduleLaunchAssistTutorial();
      setTimeout(() => this.mp.updateIdentity(name, color), 2000);
      // Portal skips the name overlay — start BGM on first interaction instead
      document.addEventListener('pointerdown', () => eventBus.emit(Events.GAME_LAUNCHED), { once: true });
      return;
    }

    document.getElementById('game-ui').style.visibility = 'visible';
    this.nameEntry.show().then(({ name, mode, roomCode }) => {
      gameState.players[0].name = name;
      if (mode === 'daily') {
        const date = new Date().toISOString().slice(0, 10);
        gameState.setChallengeSeed(`DAILY-${date}`);
        this.mp.startSolo(name);
        this._syncRoomUrl(null);
      } else if (mode === 'create') {
        gameState.clearChallenge();
        const createdCode = this.mp.createPrivateRoom(name, undefined, roomCode);
        this._syncRoomUrl(createdCode);
      } else if (mode === 'join' && roomCode) {
        gameState.clearChallenge();
        this.mp.joinRoom(roomCode, name);
        this._syncRoomUrl(roomCode);
      } else if (gameState.challengeSeed) {
        this.mp.startSolo(name);
        this._syncRoomUrl(null);
      } else {
        this.mp.joinPublic(name); // no color — _colorFromId assigns unique color
        this._syncRoomUrl(null);
      }
      const color = this.mp.localColor;
      gameState.players[0].color = color;

      this.playerLabels.addPlayer(gameState.players[0].id, name, color);
      this.holeScene.loadHole(0);
      this.ballStylePicker.show();
      this._scheduleLaunchAssistTutorial();
      setTimeout(() => this.mp.updateIdentity(name, color), 2000);
    });
  }

  _syncRoomUrl(roomCode) {
    const url = new URL(window.location.href);
    if (roomCode && roomCode !== 'PUBLIC') {
      url.searchParams.set('room', roomCode);
      url.searchParams.delete('challenge');
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
    this._trackAutoQuality(dt);
  }

  _updatePlayerLabels() {
    const cam = this.holeScene.camera;
    if (!cam) return;

    // Only remote players need floating name tags; the local player already has HUD context.
    const localId = gameState.players[0]?.id;
    this.playerLabels.setWorldPos(localId, null);

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
    const previousKey = this._qualityKey;
    if (this._qualityMode === 'auto') this._autoQualityOverrideKey = null;
    if (this._qualityMode === 'auto') this._refreshQualityProfile();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._quality.pixelRatioCap));
    if (this._qualityMode === 'auto' && previousKey !== this._qualityKey) {
      this._rebuildComposer();
      this._applySceneQuality();
      this._updateQualityToggle();
    }
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
    this.holeScene.onResize();
  }

  _normalizeQualityMode(mode) {
    return QUALITY_MODE_ORDER.includes(mode) ? mode : 'auto';
  }

  _detectGpuTier() {
    if (!this.renderer) return null;
    try {
      const gl = this.renderer.getContext();
      const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      const maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 0;
      const highp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ?? 0;

      if (maxTexture >= 16384 && maxRenderbuffer >= 8192 && highp >= 20) return 'high';
      if (maxTexture >= 8192 && maxRenderbuffer >= 4096 && highp >= 16) return 'medium';
      return 'low';
    } catch {
      return null;
    }
  }

  _detectAutoQualityKey() {
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const longSide = Math.max(window.innerWidth, window.innerHeight);
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const dpr = window.devicePixelRatio || 1;
    const coresKnown = Number.isFinite(navigator.hardwareConcurrency);
    const memoryKnown = Number.isFinite(navigator.deviceMemory);
    const cores = coresKnown ? navigator.hardwareConcurrency : (coarse ? 6 : 8);
    const memory = memoryKnown ? navigator.deviceMemory : (coarse ? 6 : 8);
    const effectiveDpr = Math.min(dpr, 2.5);
    const renderPixels = shortSide * longSide * effectiveDpr * effectiveDpr;

    let score = 0;

    if (cores >= 8) score += 3;
    else if (cores >= 6) score += 2;
    else if (cores >= 4) score += 1;
    else score -= 1;

    if (memory >= 8) score += 3;
    else if (memory >= 6) score += 2;
    else if (memory >= 4) score += 1;
    else if (memory <= 2) score -= 2;

    if (this._gpuTier === 'high') score += 3;
    else if (this._gpuTier === 'medium') score += 1;
    else if (this._gpuTier === 'low') score -= 2;

    if (renderPixels > 5_500_000) score -= 2;
    else if (renderPixels > 3_500_000) score -= 1;
    else if (renderPixels < 1_500_000) score += 1;

    if (!coarse && shortSide > 900) score += 1;
    if (coarse && cores >= 8 && (!memoryKnown || memory >= 6)) score += 1;
    if (coarse && shortSide <= 360 && cores <= 4) score -= 1;

    if (coarse && cores <= 4 && memoryKnown && memory <= 3) return 'low';
    if (score >= 5) return 'high';
    if (score >= 1) return 'medium';
    return 'low';
  }

  _refreshQualityProfile() {
    this._qualityMode = this._normalizeQualityMode(this._qualityMode);
    const manualKey = MANUAL_QUALITY_KEYS[this._qualityMode];
    const key = manualKey ?? this._autoQualityOverrideKey ?? this._detectAutoQualityKey();
    this._qualityKey = key;
    this._quality = QUALITY_PROFILES[key];
  }

  _rebuildComposer() {
    const { scene, camera } = this.holeScene;
    this.bloom.intensity = this._quality.bloomIntensity;
    this.bloom.luminanceMaterial.threshold = this._quality.bloomThreshold;
    this.bloom.luminanceMaterial.smoothing = this._quality.bloomSmoothing;
    this.vignette.darkness = this._quality.vignetteDarkness;
    this.chromAb.offset.set(0, 0);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    if (this._quality.composerMode === 'full') {
      this.composer.addPass(new EffectPass(camera, this.bloom, this.chromAb, this.vignette));
      this.composer.addPass(new EffectPass(camera, this.smaa));
    } else if (this._quality.composerMode === 'reduced') {
      this.composer.addPass(new EffectPass(camera, this.bloom, this.vignette));
    }

    this._blurPassAdded = false;
    this.composer.setSize(window.innerWidth, window.innerHeight);

    if (this.devPanel?._refs) {
      this.devPanel._refs.composer = this.composer;
      this.devPanel._refs.blurPass = this.blurPass;
      this.devPanel._refs.bloom = this.bloom;
      this.devPanel._refs.vignette = this.vignette;
      this.devPanel._refs.chromAb = this.chromAb;
    }
  }

  _applySceneQuality() {
    if (!this.holeScene || !this._quality) return;
    this.holeScene.setVisualQuality(this._quality.scene);
  }

  _setQualityMode(mode) {
    this._qualityMode = this._normalizeQualityMode(mode);
    this._autoQualityOverrideKey = null;
    this._resetQualityMonitor();
    localStorage.setItem('cosmic_quality_mode', this._qualityMode);
    this._refreshQualityProfile();
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._quality.pixelRatioCap));
    }
    if (this.bloom && this.holeScene) {
      this._rebuildComposer();
      this._applySceneQuality();
    }
    this._updateQualityToggle();
  }

  _cycleQualityMode() {
    const current = QUALITY_MODE_ORDER.indexOf(this._qualityMode);
    const next = QUALITY_MODE_ORDER[(current + 1) % QUALITY_MODE_ORDER.length] ?? 'auto';
    this._setQualityMode(next);
  }

  _resetQualityMonitor() {
    this._qualityFrameStats = { frames: 0, elapsed: 0 };
  }

  _trackAutoQuality(dt) {
    if (this._qualityMode !== 'auto' || document.hidden || !this._qualityKey) return;
    if (dt <= 0 || dt >= 0.12) return;

    const stats = this._qualityFrameStats;
    stats.frames += 1;
    stats.elapsed += dt;
    if (stats.elapsed < 5 || stats.frames < 120) return;

    const fps = stats.frames / stats.elapsed;
    this._resetQualityMonitor();

    if (this._qualityKey === 'high' && fps < 42) {
      this._setAutoQualityOverride('medium');
    } else if (this._qualityKey === 'medium' && fps < 34) {
      this._setAutoQualityOverride('low');
    }
  }

  _setAutoQualityOverride(key) {
    if (this._qualityMode !== 'auto' || this._autoQualityOverrideKey === key) return;
    const rank = { low: 0, medium: 1, high: 2 };
    if (rank[key] >= rank[this._qualityKey]) return;

    this._autoQualityOverrideKey = key;
    this._refreshQualityProfile();
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._quality.pixelRatioCap));
    }
    if (this.bloom && this.holeScene) {
      this._rebuildComposer();
      this._applySceneQuality();
    }
    this._updateQualityToggle();
  }

  _updateQualityToggle() {
    if (!this._qualityToggleBtn) return;
    const modeLabel = this._qualityMode === 'auto'
      ? `Auto · ${this._quality.label}`
      : {
          high: 'Full FX',
          medium: 'Balanced FX',
          performance: 'Low FX',
        }[this._qualityMode] ?? `Auto · ${this._quality.label}`;
    this._qualityToggleBtn.innerHTML = `<span style="min-width:0;">Quality</span><strong style="font-weight:700;color:rgba(159,247,255,0.92);letter-spacing:0.08em;min-width:0;text-align:right;overflow-wrap:anywhere;">${modeLabel}</strong>`;
  }

  _clearLaunchAssistTutorial() {
    if (this._launchTutorialTimer) {
      clearTimeout(this._launchTutorialTimer);
      this._launchTutorialTimer = null;
    }
  }

  _scheduleLaunchAssistTutorial() {
    this._clearLaunchAssistTutorial();
    this._launchTutorialTimer = setTimeout(() => {
      if (!this._firstShotTakenThisRun && gameState.currentHole === 0 && gameState.currentStrokes === 0) {
        this.tutorial.show();
      }
    }, 8500);
  }
}

window.__game__ = new Game();
