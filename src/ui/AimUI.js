// ============================================================
// AimUI.js — HUD overlay (HTML/CSS elements)
// Shows: hole number, strokes, power bar, room code, player
// ============================================================

import { Vector3 } from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { AIM } from '../core/Constants.js';


export class AimUI {
  constructor() {
    this._els = {
      holeNum:      document.getElementById('hud-hole'),
      strokes:      document.getElementById('hud-strokes'),
      player:       document.getElementById('hud-player'),
      powerWrap:    document.getElementById('power-bar-wrap'),
      powerFill:    document.getElementById('power-bar-fill'),
      aimHint:      document.getElementById('aim-hint'),
      roomCode:     document.getElementById('room-code-display'),
      modeBadge:    document.getElementById('mode-badge'),
      penaltyMsg:   document.getElementById('penalty-msg'),
    };

    this._aimHintVisible = true;
    this._penaltyTimer = null;

    this._setupMuteButton();
    this._setupCupIndicator();
    this._setupListeners();

    // Room code copy
    const roomUi = document.getElementById('room-code-ui');
    if (roomUi) {
      roomUi.style.pointerEvents = 'auto';
      roomUi.addEventListener('click', () => {
        const code = gameState.roomCode;
        if (!code) return;
        const url = new URL(window.location.href);
        url.searchParams.set('room', code);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url.toString()).catch(() => {});
        }
      });
    }
  }

  _setupCupIndicator() {
    // Arrow pointing toward cup — stays on screen edge when cup is off-screen
    const el = document.createElement('div');
    el.id = 'cup-arrow';
    el.style.cssText = [
      'position:fixed',
      'width:0', 'height:0',
      'pointer-events:none',
      'z-index:50',
      'display:none',
      // Triangle pointing right (rotated via transform)
      'border-top:10px solid transparent',
      'border-bottom:10px solid transparent',
      'border-left:18px solid rgba(255,220,50,0.92)',
      'filter:drop-shadow(0 0 4px rgba(255,200,0,0.8))',
    ].join(';');
    document.body.appendChild(el);
    this._cupArrow = el;

    // Label showing distance
    const lbl = document.createElement('div');
    lbl.id = 'cup-label';
    lbl.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:50',
      'display:none',
      'color:rgba(255,220,50,0.9)',
      'font-family:monospace',
      'font-size:11px',
      'font-weight:bold',
      'text-shadow:0 0 6px rgba(255,180,0,0.9)',
    ].join(';');
    document.body.appendChild(lbl);
    this._cupLabel = lbl;
  }

  /**
   * Call each frame from HoleScene with cup world position + camera.
   * Projects cup to screen; shows edge arrow when off-screen or near edge.
   */
  updateCupIndicator(cupWorldPos, camera, ballWorldPos) {
    if (!cupWorldPos || !camera) { this._cupArrow.style.display = 'none'; this._cupLabel.style.display = 'none'; return; }

    const projected = cupWorldPos.clone().project(camera);
    const W = window.innerWidth, H = window.innerHeight;
    const sx = (projected.x * 0.5 + 0.5) * W;
    const sy = (-(projected.y * 0.5) + 0.5) * H;
    const onScreen = projected.z < 1 && sx > 40 && sx < W - 40 && sy > 40 && sy < H - 40;

    const dist = ballWorldPos ? Math.round(ballWorldPos.distanceTo(cupWorldPos)) : null;

    if (onScreen) {
      // Cup visible — hide arrow
      this._cupArrow.style.display = 'none';
      this._cupLabel.style.display = 'none';
      return;
    }

    // Off-screen — compute edge intersection and angle
    const cx = W / 2, cy = H / 2;
    const dx = sx - cx, dy = sy - cy;
    const angle = Math.atan2(dy, dx); // radians, 0=right

    const margin = 28;
    const halfW = W / 2 - margin, halfH = H / 2 - margin;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    let ex, ey;
    if (absDx / halfW > absDy / halfH) {
      ex = cx + Math.sign(dx) * halfW;
      ey = cy + dy * (halfW / absDx);
    } else {
      ey = cy + Math.sign(dy) * halfH;
      ex = cx + dx * (halfH / absDy);
    }

    // Position arrow triangle at edge, rotated to point toward cup
    // Triangle base points right (border-left trick), so rotate by angle
    this._cupArrow.style.left = `${ex - 9}px`;  // offset by ~half width
    this._cupArrow.style.top  = `${ey - 10}px`; // offset by half height
    this._cupArrow.style.transform = `rotate(${angle}rad)`;
    this._cupArrow.style.display = 'block';

    if (dist !== null) {
      this._cupLabel.style.left = `${ex + Math.cos(angle) * 14}px`;
      this._cupLabel.style.top  = `${ey + Math.sin(angle) * 14 - 6}px`;
      this._cupLabel.textContent = `${dist}u`;
      this._cupLabel.style.display = 'block';
    }
  }

  _setupMuteButton() {
    const btn = document.createElement('button');
    btn.id = 'mute-btn';
    btn.textContent = '🔊';
    btn.style.cssText = [
      'position:fixed',
      'bottom:max(20px, env(safe-area-inset-bottom, 0px))',
      'right:max(20px, env(safe-area-inset-right, 0px))',
      'z-index:200',
      'background:rgba(0,0,0,0.55)',
      'color:#fff',
      'border:1px solid rgba(255,255,255,0.25)',
      'border-radius:50%',
      'width:40px',
      'height:40px',
      'cursor:pointer',
      'font-size:18px',
      'line-height:1',
      'padding:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
    ].join(';');

    btn.addEventListener('click', () => {
      eventBus.emit(Events.AUDIO_MUTE_TOGGLE);
      btn.textContent = gameState.isMuted ? '🔇' : '🔊';
    });

    document.body.appendChild(btn);
    this._muteBtn = btn;
  }

  _setupListeners() {
    eventBus.on(Events.AIM_START, () => {
      this._setHint('RELEASE TO LOCK DIRECTION', 'rgba(255,255,255,0.55)');
    });

    eventBus.on(Events.AIM_DIR_LOCKED, () => {
      this._setHint('DRAG UP FOR POWER  •  RELEASE TO SHOOT', 'rgba(100,220,255,0.7)');
    });

    eventBus.on(Events.AIM_CANCEL, () => {
      this._setHint('DRAG NEAR BALL TO AIM', 'rgba(255,255,255,0.4)');
    });

    eventBus.on(Events.SHOT_TAKEN, () => {
      this._setHint('', 'rgba(255,255,255,0.4)');
    });

    eventBus.on(Events.HOLE_LOADED, () => {
      this._setHint('DRAG NEAR BALL TO AIM', 'rgba(255,255,255,0.4)');
    });

    eventBus.on(Events.BALL_OUT_OF_BOUNDS, () => {
      this._showPenalty();
    });

    eventBus.on(Events.MP_SOLO_MODE, () => {
      if (this._els.modeBadge) this._els.modeBadge.textContent = 'SOLO MODE';
    });

    eventBus.on(Events.MP_PLAYER_JOINED, () => {
      if (this._els.modeBadge) this._els.modeBadge.textContent = 'MULTIPLAYER';
    });

    eventBus.on(Events.MP_ROOM_CREATED, ({ code }) => {
      this._els.roomCode.textContent = code;
    });
  }

  _setHint(text, color = 'rgba(255,255,255,0.4)') {
    if (!this._els.aimHint) return;
    this._els.aimHint.textContent = text;
    this._els.aimHint.style.color = color;
    this._els.aimHint.style.display = text ? 'block' : 'none';
  }

  _showAimHint() {
    this._setHint('DRAG NEAR BALL TO AIM', 'rgba(255,255,255,0.4)');
  }

  _showPenalty() {
    this._els.penaltyMsg.style.display = 'block';
    if (this._penaltyTimer) clearTimeout(this._penaltyTimer);
    this._penaltyTimer = setTimeout(() => {
      this._els.penaltyMsg.style.display = 'none';
    }, 2500);
  }

  /**
   * Update the HUD for the current state.
   */
  update() {
    const hole = gameState.currentHole;
    const strokes = gameState.currentStrokes;
    const player = gameState.currentPlayer;

    if (this._els.holeNum) {
      this._els.holeNum.textContent = `HOLE ${hole + 1} / ${gameState.totalHoles}`;
    }
    if (this._els.strokes) {
      this._els.strokes.textContent = `STROKES: ${strokes}`;
    }
    if (this._els.player && player) {
      if (!gameState.isSoloMode) {
        this._els.player.textContent = `PLAYER: ${player.name}`;
        this._els.player.style.color = `#${player.color.toString(16).padStart(6, '0')}`;
      } else {
        this._els.player.textContent = '';
      }
    }
    if (this._els.roomCode && gameState.roomCode) {
      this._els.roomCode.textContent = gameState.roomCode;
    }
  }

  dispose() {
    if (this._penaltyTimer) clearTimeout(this._penaltyTimer);
  }
}
