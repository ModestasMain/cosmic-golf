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
      roomStatus:   document.getElementById('room-status'),
      roomPlayers:  document.getElementById('room-player-count'),
      howToCard:    document.getElementById('how-to-card'),
      penaltyMsg:   document.getElementById('penalty-msg'),
    };

    this._aimHintVisible = true;
    this._penaltyTimer = null;
    this._tutorialDismissed = sessionStorage.getItem('cosmic-golf-howto-dismissed') === '1';
    this._shotTakenThisHole = false;
    this._cupIndicatorSuppressed = false;

    this._setupVolumeSlider();
    this._setupCupIndicator();
    this._setupListeners();
    this._syncRoomPanel();
    this._syncTutorialCard();

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
      'z-index:80',
      'display:none',
      'transform:translateX(-50%)',
      'text-align:center',
      'font-family:"JetBrains Mono", monospace',
    ].join(';');

    const targetEl = document.createElement('div');
    targetEl.style.cssText = [
      'display:inline-block',
      'padding:3px 8px',
      'border-radius:999px',
      'background:rgba(5, 8, 22, 0.78)',
      'border:1px solid rgba(255, 210, 74, 0.56)',
      'color:#ffd24a',
      'font-family:"Orbitron", sans-serif',
      'font-size:clamp(8px,1.4vw,11px)',
      'font-weight:800',
      'letter-spacing:0.16em',
      'text-shadow:0 0 10px rgba(255, 210, 74, 0.36)',
      'box-shadow:0 0 18px rgba(255, 210, 74, 0.18)',
      'white-space:nowrap',
    ].join(';');
    targetEl.textContent = 'TARGET';

    // Golf flag SVG — pole + pennant, glowing gold
    const flagEl = document.createElement('div');
    flagEl.style.cssText = [
      'display:flex', 'justify-content:center',
      'filter:drop-shadow(0 0 8px rgba(255, 210, 74, 0.75)) drop-shadow(0 0 7px rgb(0, 0, 0))',
      'animation:cup-bounce 1.1s ease-in-out infinite',
      'margin-top:4px',
    ].join(';');
    flagEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
        <!-- Pole -->
        <line x1="10" y1="2" x2="10" y2="36"
              stroke="rgba(255, 255, 255, 0.98)" stroke-width="2.8" stroke-linecap="round"/>
        <!-- Pennant flag pointing right -->
        <polygon points="10,3 26,11 10,19"
                 fill="#ffd24a"/>
      </svg>
    `;

    // Distance text below the flag
    const distEl = document.createElement('div');
    distEl.style.cssText = [
      'display:inline-block',
      'color:#f7f4ff',
      'font-size:clamp(11px,2.4vw,14px)',
      'font-weight:900',
      'letter-spacing:0.08em',
      'text-shadow:0 0 8px rgba(0, 0, 0, 0.95)',
      'margin-top:2px',
      'padding:2px 8px',
      'border-radius:999px',
      'background:rgba(5, 8, 22, 0.72)',
      'border:1px solid rgba(96, 220, 255, 0.38)',
      'white-space:nowrap',
    ].join(';');

    beacon.appendChild(targetEl);
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
      'border-top:12px solid transparent',
      'border-bottom:12px solid transparent',
      'border-left:22px solid #ffd24a',
      'filter:drop-shadow(0 0 9px rgba(255, 210, 74, 0.78)) drop-shadow(0 0 5px rgb(0, 0, 0))',
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
      'color:#f7f4ff',
      'font-family:"JetBrains Mono", monospace',
      'font-size:clamp(10px,2.2vw,13px)',
      'font-weight:900',
      'letter-spacing:0.08em',
      'padding:4px 9px',
      'border-radius:999px',
      'background:rgba(5, 8, 22, 0.78)',
      'border:1px solid rgba(255, 210, 74, 0.42)',
      'box-shadow:0 0 14px rgba(255, 210, 74, 0.18)',
      'text-shadow:0 0 6px rgb(0, 0, 0)',
      'white-space:nowrap',
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
    if (this._cupIndicatorSuppressed || !cupWorldPos || !camera) {
      this._hideCupIndicator();
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
      const BEACON_OFFSET = 72; // px above cup centre — clears the larger target marker
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

    this._cupArrow.style.left      = `${ex - 11}px`;
    this._cupArrow.style.top       = `${ey - 12}px`;
    this._cupArrow.style.transform = `rotate(${angle}rad)`;
    this._cupArrow.style.display   = 'block';

    if (dist !== null) {
      this._cupLabel.style.left        = `${ex + Math.cos(angle) * 20}px`;
      this._cupLabel.style.top         = `${ey + Math.sin(angle) * 20 - 7}px`;
      this._cupLabel.textContent       = `TARGET ${distText}`;
      this._cupLabel.style.display     = 'block';
    }
  }

  _hideCupIndicator() {
    if (this._cupBeacon) this._cupBeacon.style.display = 'none';
    if (this._cupArrow) this._cupArrow.style.display = 'none';
    if (this._cupLabel) this._cupLabel.style.display = 'none';
  }

  _setupVolumeSlider() {
    const saved = parseFloat(localStorage.getItem('masterVolume') ?? '1');
    const initVol = isNaN(saved) ? 1 : Math.min(1, Math.max(0, saved));

    if (!document.getElementById('volume-slider-style')) {
      const s = document.createElement('style');
      s.id = 'volume-slider-style';
      s.textContent = `
        #volume-slider{-webkit-appearance:none;appearance:none;width:104px;height:4px;
          background:rgba(100,160,255,0.3);border-radius:999px;outline:none;cursor:pointer;}
        #volume-slider::-webkit-slider-runnable-track{height:4px;background:rgba(100,160,255,0.3);border-radius:999px;}
        #volume-slider::-moz-range-track{height:4px;background:rgba(100,160,255,0.3);border-radius:999px;}
        #volume-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;
          border-radius:50%;background:rgba(160,200,255,0.9);border:1px solid rgba(100,160,255,0.5);
          cursor:pointer;margin-top:-5px;}
        #volume-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
          background:rgba(160,200,255,0.9);border:1px solid rgba(100,160,255,0.5);
          cursor:pointer;box-sizing:border-box;}
      `;
      document.head.appendChild(s);
    }

    const wrap = document.createElement('div');
    wrap.id = 'volume-control';
    wrap.style.cssText = [
      'position:fixed',
      'bottom:max(74px, calc(env(safe-area-inset-bottom, 0px) + 56px))',
      'left:max(18px, calc(env(safe-area-inset-left, 0px) + 12px))',
      'z-index:200',
      'display:flex',
      'flex-direction:row',
      'align-items:center',
      'gap:10px',
      'touch-action:none',
      'padding:10px 12px',
      'border-radius:18px',
      'background:linear-gradient(180deg, rgba(11,8,22,0.86), rgba(8,5,18,0.84))',
      'border:1px solid rgba(132,92,255,0.4)',
      'box-shadow:0 18px 50px rgba(3,2,10,0.34)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
    ].join(';');

    const icon = document.createElement('div');
    icon.style.cssText = [
      'font-family:Orbitron,sans-serif',
      'font-size:10px',
      'letter-spacing:0.18em',
      'text-transform:uppercase',
      'line-height:1',
      'color:rgba(224,216,255,0.88)',
      'user-select:none',
    ].join(';');
    icon.dataset.iconState = initVol === 0 ? 'mute' : 'sound';
    icon.textContent = initVol === 0 ? 'MUTE' : 'SOUND';

    const sliderBox = document.createElement('div');
    sliderBox.style.cssText = 'width:104px;height:20px;display:flex;align-items:center;justify-content:center;overflow:visible;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'volume-slider';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.02';
    slider.value = String(initVol);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      icon.dataset.iconState = v === 0 ? 'mute' : 'sound';
      icon.textContent = v === 0 ? 'MUTE' : 'SOUND';
      eventBus.emit(Events.AUDIO_VOLUME_CHANGE, { volume: v });
    });

    sliderBox.appendChild(slider);
    wrap.appendChild(icon);
    wrap.appendChild(sliderBox);
    document.body.appendChild(wrap);
    this._volumeWrap = wrap;
  }

  _setupListeners() {
    eventBus.on(Events.AIM_START, () => {
      const text = this._shotTakenThisHole
        ? 'DRAG TO AIM  •  DRAG PYRAMID FOR POWER'
        : 'AIM AT THE BLACK HOLE  •  DRAG PYRAMID FOR POWER';
      this._setHint(text, 'rgba(255,255,255,0.55)');
    });

    eventBus.on(Events.AIM_DIR_LOCKED, () => {
      this._setHint('SET POWER  •  RELEASE TO SHOOT', 'rgba(100,220,255,0.74)');
    });

    eventBus.on(Events.AIM_CANCEL, () => {
      this._showAimHint();
    });

    eventBus.on(Events.SHOT_TAKEN, () => {
      this._shotTakenThisHole = true;
      this._setHint('', 'rgba(255,255,255,0.4)');
      if (!this._tutorialDismissed) {
        this._tutorialDismissed = true;
        sessionStorage.setItem('cosmic-golf-howto-dismissed', '1');
        this._syncTutorialCard();
      }
    });

    eventBus.on(Events.HOLE_LOADED, ({ archetype }) => {
      this._shotTakenThisHole = false;
      this._cupIndicatorSuppressed = false;
      this._showAimHint();
      if (this._els.archetype) {
        this._els.archetype.textContent = archetype ? (ARCHETYPE_LABELS[archetype] ?? archetype) : '';
      }
    });

    eventBus.on(Events.BALL_HOLED, () => {
      this._cupIndicatorSuppressed = true;
      this._hideCupIndicator();
    });

    eventBus.on(Events.HOLE_COMPLETE, () => {
      this._cupIndicatorSuppressed = true;
      this._hideCupIndicator();
    });

    eventBus.on(Events.GAME_COMPLETE, () => {
      this._cupIndicatorSuppressed = true;
      this._hideCupIndicator();
    });

    eventBus.on(Events.BALL_OUT_OF_BOUNDS, () => {
      this._showPenalty();
    });

    eventBus.on(Events.MP_SOLO_MODE, () => {
      if (this._els.modeBadge) this._els.modeBadge.textContent = 'Solo';
      this._syncRoomPanel();
    });

    eventBus.on(Events.MP_PLAYER_JOINED, () => {
      if (this._els.modeBadge) this._els.modeBadge.textContent = 'Multiplayer';
      this._syncRoomPanel();
    });

    eventBus.on(Events.MP_PLAYER_LEFT, () => {
      this._syncRoomPanel();
    });

    eventBus.on(Events.MP_ROOM_CREATED, ({ code }) => {
      this._els.roomCode.textContent = code;
      this._syncRoomPanel();
    });

    eventBus.on(Events.HOLE_LOADED, () => {
      this._syncRoomPanel();
    });
  }

  _setHint(text, color = 'rgba(255,255,255,0.4)') {
    if (!this._els.aimHint) return;
    this._els.aimHint.textContent = text;
    this._els.aimHint.style.color = color;
    this._els.aimHint.style.display = text ? 'block' : 'none';
  }

  _showAimHint() {
    const text = this._shotTakenThisHole
      ? 'DRAG NEAR BALL TO AIM'
      : 'DRAG NEAR BALL TO AIM  •  THEN DRAG PYRAMID FOR POWER';
    this._setHint(text, 'rgba(100,220,255,0.58)');
  }

  _showPenalty() {
    this._els.penaltyMsg.style.display = 'block';
    if (this._penaltyTimer) clearTimeout(this._penaltyTimer);
    this._penaltyTimer = setTimeout(() => {
      this._els.penaltyMsg.style.display = 'none';
    }, 2500);
  }

  _syncTutorialCard() {
    if (!this._els.howToCard) return;
    this._els.howToCard.style.display = this._tutorialDismissed ? 'none' : '';
  }

  _syncRoomPanel() {
    if (this._els.roomCode && gameState.roomCode) {
      this._els.roomCode.textContent = gameState.roomCode;
    }
    if (this._els.roomStatus) {
      this._els.roomStatus.textContent = gameState.isSoloMode ? 'Solo Lobby' : 'Room Lobby';
    }
    if (this._els.roomPlayers) {
      const count = Math.max(1, gameState.players.length || 0);
      this._els.roomPlayers.textContent = `${count} ${count === 1 ? 'Player' : 'Players'}`;
    }
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
    this._syncRoomPanel();
  }

  dispose() {
    if (this._penaltyTimer) clearTimeout(this._penaltyTimer);
  }
}
