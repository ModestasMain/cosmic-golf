// ============================================================
// AimUI.js — HUD overlay (HTML/CSS elements)
// Shows: hole number, strokes, power bar, room code, player
// ============================================================

import { Vector3 } from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { AIM } from '../core/Constants.js';
import { ARCHETYPE_LABELS } from '../systems/HoleGenerator.js';


export class AimUI {
  constructor() {
    this._els = {
      holeNum:      document.getElementById('hud-hole'),
      archetype:    document.getElementById('hud-archetype'),
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
    // ── On-screen beacon — floats above the cup when visible ────
    // Outer wrapper: centered transform origin, positioned at cup screen coords
    const beacon = document.createElement('div');
    beacon.id = 'cup-beacon';
    beacon.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:50',
      'display:none',
      'transform:translateX(-50%)',
      'text-align:center',
      'font-family:monospace',
    ].join(';');

    // Golf flag SVG — pole + pennant, glowing gold
    const flagEl = document.createElement('div');
    flagEl.style.cssText = [
      'display:flex', 'justify-content:center',
      'filter:drop-shadow(0 0 6px rgb(0, 0, 0))',
      'animation:cup-bounce 1.1s ease-in-out infinite',
    ].join(';');
    flagEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="28" viewBox="0 0 28 38">
        <!-- Pole -->
        <line x1="10" y1="2" x2="10" y2="36"
              stroke="rgba(255, 255, 255, 0.95)" stroke-width="2.2" stroke-linecap="round"/>
        <!-- Pennant flag pointing right -->
        <polygon points="10,3 26,11 10,19"
                 fill="rgb(255, 255, 255)"/>
      </svg>
    `;

    // Distance text below the flag
    const distEl = document.createElement('div');
    distEl.style.cssText = [
      'color:rgb(255, 255, 255)',
      'font-size:clamp(9px,2vw,11px)',
      'font-weight:bold',
      'letter-spacing:1px',
      'text-shadow:0 0 6px rgba(0, 0, 0, 0.9)',
      'margin-top:2px',
      'white-space:nowrap',
    ].join(';');

    beacon.appendChild(flagEl);
    beacon.appendChild(distEl);
    document.body.appendChild(beacon);
    this._cupBeacon  = beacon;
    this._cupBeaconDist = distEl;

    // Inject bounce keyframes once
    if (!document.getElementById('cup-beacon-style')) {
      const style = document.createElement('style');
      style.id = 'cup-beacon-style';
      style.textContent = `
        @keyframes cup-bounce {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-5px); }
        }
      `;
      document.head.appendChild(style);
    }

    // ── Off-screen edge arrow ─────────────────────────────────
    const arrow = document.createElement('div');
    arrow.id = 'cup-arrow';
    arrow.style.cssText = [
      'position:fixed',
      'width:0', 'height:0',
      'pointer-events:none',
      'z-index:50',
      'display:none',
      'border-top:9px solid transparent',
      'border-bottom:9px solid transparent',
      'border-left:16px solid rgba(255, 255, 255, 0.92)',
      'filter:drop-shadow(0 0 4px rgb(0, 0, 0))',
    ].join(';');
    document.body.appendChild(arrow);
    this._cupArrow = arrow;

    // Distance label next to edge arrow
    const lbl = document.createElement('div');
    lbl.id = 'cup-label';
    lbl.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:50',
      'display:none',
      'color:rgba(255, 255, 255, 0.9)',
      'font-family:monospace',
      'font-size:clamp(9px,2vw,11px)',
      'font-weight:bold',
      'text-shadow:0 0 6px rgb(0, 0, 0)',
    ].join(';');
    document.body.appendChild(lbl);
    this._cupLabel = lbl;
  }

  /**
   * Call each frame from main.js with cup world position + camera + ball position.
   * - Cup on-screen  → shows a bouncing chevron beacon above the cup's screen position.
   * - Cup off-screen → shows a rotated arrow at the screen edge + distance label.
   */
  updateCupIndicator(cupWorldPos, camera, ballWorldPos) {
    if (!cupWorldPos || !camera) {
      this._cupBeacon.style.display = 'none';
      this._cupArrow.style.display  = 'none';
      this._cupLabel.style.display  = 'none';
      return;
    }

    const projected = cupWorldPos.clone().project(camera);
    const W = window.innerWidth, H = window.innerHeight;
    const sx = (projected.x *  0.5 + 0.5) * W;
    const sy = (projected.y * -0.5 + 0.5) * H;

    const margin   = 36;
    const onScreen = projected.z < 1
      && sx > margin && sx < W - margin
      && sy > margin && sy < H - margin;

    const dist = ballWorldPos ? Math.round(ballWorldPos.distanceTo(cupWorldPos)) : null;
    const distText = dist !== null ? `${dist}m` : '';

    if (onScreen) {
      // ── On-screen beacon ────────────────────────────────────
      // Position the beacon so the chevron tip points at the cup.
      // The beacon sits above the projected cup coord.
      const BEACON_OFFSET = 44; // px above cup centre — clears the flag pole bottom
      this._cupBeacon.style.left    = `${sx}px`;
      this._cupBeacon.style.top     = `${sy - BEACON_OFFSET}px`;
      this._cupBeacon.style.display = 'block';
      this._cupBeaconDist.textContent = distText;

      this._cupArrow.style.display = 'none';
      this._cupLabel.style.display = 'none';
      return;
    }

    // ── Off-screen edge arrow ──────────────────────────────────
    this._cupBeacon.style.display = 'none';

    const cx = W / 2, cy = H / 2;
    const dx = sx - cx, dy = sy - cy;
    const angle = Math.atan2(dy, dx);

    const edgeMargin = 28;
    const halfW = W / 2 - edgeMargin, halfH = H / 2 - edgeMargin;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    let ex, ey;
    if (absDx / halfW > absDy / halfH) {
      ex = cx + Math.sign(dx) * halfW;
      ey = cy + dy * (halfW / absDx);
    } else {
      ey = cy + Math.sign(dy) * halfH;
      ex = cx + dx * (halfH / absDy);
    }

    this._cupArrow.style.left      = `${ex - 8}px`;
    this._cupArrow.style.top       = `${ey - 9}px`;
    this._cupArrow.style.transform = `rotate(${angle}rad)`;
    this._cupArrow.style.display   = 'block';

    if (dist !== null) {
      this._cupLabel.style.left        = `${ex + Math.cos(angle) * 20}px`;
      this._cupLabel.style.top         = `${ey + Math.sin(angle) * 20 - 7}px`;
      this._cupLabel.textContent       = distText;
      this._cupLabel.style.display     = 'block';
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
      this._setHint('DRAG TO AIM  •  DRAG PYRAMID FOR POWER', 'rgba(255,255,255,0.55)');
    });

    eventBus.on(Events.AIM_DIR_LOCKED, () => {
      this._setHint('DRAG PYRAMID UP/DOWN FOR POWER  •  TAP PYRAMID TO SHOOT', 'rgba(100,220,255,0.7)');
    });

    eventBus.on(Events.AIM_CANCEL, () => {
      this._setHint('DRAG NEAR BALL TO AIM', 'rgba(255,255,255,0.4)');
    });

    eventBus.on(Events.SHOT_TAKEN, () => {
      this._setHint('', 'rgba(255,255,255,0.4)');
    });

    eventBus.on(Events.HOLE_LOADED, ({ archetype }) => {
      this._setHint('DRAG NEAR BALL TO AIM', 'rgba(255,255,255,0.4)');
      if (this._els.archetype) {
        this._els.archetype.textContent = archetype ? (ARCHETYPE_LABELS[archetype] ?? archetype) : '';
      }
    });

    eventBus.on(Events.BALL_HOLED, () => {
      // Hide all cup indicators once the ball is in
      if (this._cupBeacon) this._cupBeacon.style.display = 'none';
      if (this._cupArrow)  this._cupArrow.style.display  = 'none';
      if (this._cupLabel)  this._cupLabel.style.display  = 'none';
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
