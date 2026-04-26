// ============================================================
// EventHUD.js — top-center event display with slot-machine reveal
// Shows current event name + countdown to next event.
// When a new event fires the name reels through all options
// before landing on the chosen one.
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { SERVER_EVENTS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';

const EVENT_DISPLAY = {
  ZERO_GRAVITY:   'ZERO GRAVITY',
  MAP_FLIP:       'MAP FLIP',
  MOVING_PLANETS: 'MOVING PLANETS',
  ASTEROID_STORM: 'ASTEROID STORM',
};

const EVENT_COLOR = {
  ZERO_GRAVITY:   '#44ccff',
  MAP_FLIP:       '#cc44ff',
  MOVING_PLANETS: '#88ff88',
  ASTEROID_STORM: '#ff8844',
};



const ALL_NAMES  = Object.values(EVENT_DISPLAY);
const ALL_COLORS = Object.values(EVENT_COLOR);

function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

export class EventHUD {
  constructor() {
    this._spinning     = false;
    this._currentType  = null;
    this._rafId        = null;
    this._firstEvent   = true;   // show initial event without spinning
    this._bossMode     = false;
    this._bossTotal    = 4;
    this._bossBroken   = 0;
    this._bossAwakened = false;
    this._bossResetRemaining = 0;
    this._lastDisplayMode = null;
    this._popupTimeout = null;

    this._el = this._build();
    this._popup = this._buildPopup();
    document.body.appendChild(this._el);
    document.body.appendChild(this._popup);
    this._setupListeners();
    this._startTick();
  }

  // ── DOM ───────────────────────────────────────────────────

  _build() {
    const root = document.createElement('div');
    root.id = 'event-hud';
    Object.assign(root.style, {
      position:      'fixed',
      top:           'max(24px, calc(env(safe-area-inset-top, 0px) + 10px))',
      left:          '50%',
      transform:     'translateX(-50%)',
      zIndex:        '450',
      pointerEvents: 'none',
      userSelect:    'none',
      width:         'auto',
      maxWidth:      'min(420px, calc(100vw - 64px))',
      padding:       '10px 14px 10px',
      borderRadius:  '18px',
      border:        '1px solid rgba(124, 92, 255, 0.32)',
      background:    'linear-gradient(180deg, rgba(10, 8, 24, 0.78), rgba(7, 5, 18, 0.74))',
      boxShadow:     '0 14px 40px rgba(3, 2, 10, 0.32)',
      backdropFilter:'blur(10px)',
      WebkitBackdropFilter:'blur(10px)',
      fontFamily:    '"Inter Tight", sans-serif',
      display:       'flex',
      alignItems:    'center',
      justifyContent:'center',
    });

    this._dialEl = document.createElement('div');
    this._dialEl.style.display = 'none';

    const content = document.createElement('div');
    Object.assign(content.style, {
      minWidth: '0',
      width: '100%',
      flex: '0 1 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    });

    this._labelEl = document.createElement('div');
    Object.assign(this._labelEl.style, {
      fontFamily:    '"Orbitron", sans-serif',
      fontSize:      '9px',
      letterSpacing: '0.24em',
      color:         'rgba(173, 118, 255, 0.94)',
      marginBottom:  '4px',
      textTransform: 'uppercase',
    });
    this._labelEl.textContent = 'CURRENT EVENT';

    const clip = document.createElement('div');
    Object.assign(clip.style, {
      overflow: 'hidden',
      width: '100%',
      minHeight:'18px',
      textAlign: 'center',
    });

    this._reelEl = document.createElement('div');
    Object.assign(this._reelEl.style, {
      lineHeight:    '1.4',
      fontFamily:    '"Orbitron", sans-serif',
      fontSize:      'clamp(11px, 1.4vw, 14px)',
      fontWeight:    '800',
      letterSpacing: '0.14em',
      color:         'rgba(244, 241, 255, 0.95)',
      willChange:    'transform',
      transition:    'none',
      textTransform: 'uppercase',
      whiteSpace:    'nowrap',
    });
    this._reelEl.textContent = '—';

    clip.appendChild(this._reelEl);

    this._timerEl = document.createElement('div');
    Object.assign(this._timerEl.style, {
      fontFamily:    '"JetBrains Mono", monospace',
      fontSize:      '10px',
      letterSpacing: '0.14em',
      color:         'rgba(191, 181, 233, 0.82)',
      marginTop:     '4px',
      textTransform: 'uppercase',
    });
    this._timerEl.textContent = 'NEXT IN  —';

    this._slotsEl = document.createElement('div');
    this._slotsEl.style.display = 'none';
    this._slotEls = [];
    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div');
      Object.assign(slot.style, {
        width: '54px',
        height: '22px',
        borderRadius: '7px',
        border: '1px solid rgba(128, 92, 255, 0.48)',
        background: 'rgba(16, 11, 31, 0.96)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.02)',
      });
      this._slotsEl.appendChild(slot);
      this._slotEls.push(slot);
    }

    content.appendChild(this._labelEl);
    content.appendChild(clip);
    content.appendChild(this._timerEl);
    content.appendChild(this._slotsEl);

    root.appendChild(content);
    return root;
  }

  // ── Event popup ───────────────────────────────────────────

  _buildPopup() {
    const el = document.createElement('div');
    el.id = 'event-popup';
    Object.assign(el.style, {
      position:      'fixed',
      top:           '38%',
      left:          '50%',
      transform:     'translate(-50%, -50%) scale(0.85)',
      zIndex:        '460',
      pointerEvents: 'none',
      userSelect:    'none',
      opacity:       '0',
      textAlign:     'center',
      whiteSpace:    'nowrap',
      willChange:    'opacity, transform',
    });

    this._popupName = document.createElement('div');
    Object.assign(this._popupName.style, {
      fontFamily:    '"Orbitron", sans-serif',
      fontSize:      'clamp(18px, 5vw, 32px)',
      fontWeight:    '900',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      lineHeight:    '1',
    });

    this._popupSub = document.createElement('div');
    Object.assign(this._popupSub.style, {
      fontFamily:    '"JetBrains Mono", monospace',
      fontSize:      'clamp(9px, 1.6vw, 11px)',
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color:         'rgba(255,255,255,0.5)',
      marginTop:     '7px',
    });

    el.appendChild(this._popupName);
    el.appendChild(this._popupSub);
    return el;
  }

  _showPopup(type, phase) {
    if (this._bossMode) return;
    if (this._popupTimeout) { clearTimeout(this._popupTimeout); this._popupTimeout = null; }

    const isWarning = phase === 'warning';
    const name  = EVENT_DISPLAY[type] ?? type;
    const color = EVENT_COLOR[type]   ?? '#aaddff';

    this._popupName.textContent      = name;
    this._popupName.style.color      = color;
    this._popupName.style.textShadow = `0 0 24px ${color}99, 0 0 55px ${color}44`;
    this._popupSub.textContent       = isWarning ? 'INCOMING' : '';

    // Pop in
    this._popup.style.transition = 'none';
    this._popup.style.transform  = 'translate(-50%, -50%) scale(0.75)';
    this._popup.style.opacity    = '0';

    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._popup.style.transition = 'opacity 0.15s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1)';
      this._popup.style.transform  = 'translate(-50%, -50%) scale(1)';
      this._popup.style.opacity    = '1';
    }));

    const holdMs = isWarning ? 2200 : 2000;
    this._popupTimeout = setTimeout(() => {
      this._popup.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
      this._popup.style.transform  = 'translate(-50%, -50%) scale(1.08)';
      this._popup.style.opacity    = '0';
      this._popupTimeout = null;
    }, holdMs);
  }

  // ── Listeners ─────────────────────────────────────────────

  _setupListeners() {
    eventBus.on(Events.HOLE_LOADED, ({ bossKind }) => {
      this._bossMode = bossKind === 'WORLDEATER';
      this._bossTotal = 4;
      this._bossBroken = 0;
      this._bossAwakened = false;
      this._bossResetRemaining = 0;
      this._syncBossDisplay();
    });

    eventBus.on(Events.SERVER_EVENT, ({ type, phase }) => {
      if (this._bossMode) return;
      if (phase === 'start') {
        this._triggerSlotMachine(type);
        this._showPopup(type, 'start');
      } else if (phase === 'warning') {
        this._showPopup(type, 'warning');
      } else if (phase === 'end') {
        this._syncServerEventDisplay();
      }
    });

    eventBus.on(Events.WORLDEATER_WEAKSPOT_HIT, ({ total, remaining }) => {
      this._bossTotal = total;
      this._bossBroken = total - remaining;
      this._syncBossDisplay();
    });

    eventBus.on(Events.WORLDEATER_OPENED, () => {
      this._bossAwakened = true;
      this._bossBroken = this._bossTotal;
      this._syncBossDisplay();
    });

    eventBus.on(Events.WORLDEATER_RESET_TIMER, ({ remaining }) => {
      this._bossResetRemaining = remaining;
      if (this._bossMode && this._bossAwakened) this._syncBossDisplay();
    });

    eventBus.on(Events.WORLDEATER_RESET, ({ total, remaining }) => {
      this._bossTotal = total;
      this._bossBroken = total - remaining;
      this._bossAwakened = false;
      this._bossResetRemaining = 0;
      this._syncBossDisplay();
    });
  }

  // ── Countdown tick ────────────────────────────────────────

  _startTick() {
    const tick = () => {
      const hide = gameState.isDailyChallenge;
      this._el.style.display = hide ? 'none' : '';
      if (hide) { this._rafId = requestAnimationFrame(tick); return; }
      if (this._bossMode) {
        this._timerEl.textContent = this._bossAwakened
          ? `RESEALS IN ${Math.ceil(this._bossResetRemaining)}s`
          : `${this._bossBroken}/${this._bossTotal} WEAK SPOTS`;
        this._rafId = requestAnimationFrame(tick);
        return;
      }

      if (!this._spinning) {
        this._syncServerEventDisplay();
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  // ── Slot-machine animation ────────────────────────────────

  _triggerSlotMachine(targetType) {
    if (this._bossMode) return;
    if (this._spinning) return;

    // First event on page load: display immediately, no spin
    if (this._firstEvent) {
      this._firstEvent = false;
      this._lastDisplayMode = 'active';
      this._currentType = targetType;
      this._labelEl.textContent = 'CURRENT EVENT';
      const name  = EVENT_DISPLAY[targetType] ?? targetType;
      const color = EVENT_COLOR[targetType]   ?? '#aaddff';
      this._reelEl.textContent      = name;
      this._reelEl.style.color      = color;
      this._reelEl.style.textShadow = 'none';
      return;
    }

    this._spinning = true;
    this._lastDisplayMode = 'active';
    this._currentType = targetType;
    this._labelEl.textContent = 'CURRENT EVENT';
    this._timerEl.textContent = 'NEXT IN  —';

    const targetName  = EVENT_DISPLAY[targetType] ?? targetType;
    const targetColor = EVENT_COLOR[targetType]   ?? '#aaddff';

    // Build the schedule: [{ name, delay, color? }]
    // Fast → medium → crawl → land
    const schedule = [];
    const push = (delay, color) => {
      const idx  = schedule.length % ALL_NAMES.length;
      schedule.push({ name: ALL_NAMES[idx], color: color ?? ALL_COLORS[idx], delay });
    };

    for (let t = 0; t < 800;  t += 60)  push(60);   // fast
    for (let t = 0; t < 500;  t += 110) push(110);  // medium
    for (let t = 0; t < 400;  t += 200) push(200);  // slow
    // final landing frame
    schedule.push({ name: targetName, color: targetColor, delay: 260, final: true });

    this._runSchedule(schedule, 0);
  }

  _runSchedule(schedule, idx) {
    if (idx >= schedule.length) {
      this._spinning = false;
      this._syncServerEventDisplay();
      return;
    }

    const { name, color, delay, final } = schedule[idx];

    // Slide reel up (out), swap text, slide in from below
    this._slideIn(name, color, final, () => {
      setTimeout(() => this._runSchedule(schedule, idx + 1), delay);
    });
  }

  _slideIn(name, color, isFinal, onDone) {
    const reel = this._reelEl;

    // Kick current text upward
    reel.style.transition = 'transform 55ms ease-in';
    reel.style.transform  = 'translateY(-100%)';

    setTimeout(() => {
      // Snap new text below, invisible
      reel.style.transition = 'none';
      reel.style.transform  = 'translateY(100%)';
      reel.textContent      = name;
      reel.style.color      = isFinal ? color : 'rgba(140,180,255,0.75)';
      reel.style.textShadow = 'none';

      // Slide into view
      requestAnimationFrame(() => requestAnimationFrame(() => {
        reel.style.transition = `transform ${isFinal ? 90 : 55}ms ease-out`;
        reel.style.transform  = 'translateY(0)';
        setTimeout(onDone, isFinal ? 90 : 55);
      }));
    }, 55);
  }

  _syncBossDisplay() {
    if (!this._bossMode) {
      this._labelEl.textContent = 'CURRENT EVENT';
      this._reelEl.style.fontSize = 'clamp(11px, 1.4vw, 14px)';
      this._reelEl.style.letterSpacing = '0.14em';
      return;
    }

    const mobile = window.matchMedia('(max-width: 640px)').matches;
    this._spinning = false;
    this._labelEl.textContent = this._bossAwakened ? 'BOSS PHASE' : 'BOSS OBJECTIVE';
    if (this._bossAwakened) {
      this._reelEl.textContent = 'WORLD EATER AWAKENED';
      this._reelEl.style.color = '#9df6ff';
      this._reelEl.style.fontSize = mobile ? '9px' : 'clamp(10px, 1.18vw, 13px)';
      this._reelEl.style.letterSpacing = mobile ? '0.06em' : '0.11em';
      this._reelEl.style.textShadow = 'none';
      this._timerEl.textContent = `RESEALS IN ${Math.ceil(this._bossResetRemaining)}s`;
    } else {
      this._reelEl.textContent = 'BREAK GLOWING SEGMENTS';
      this._reelEl.style.color = '#ffd67d';
      this._reelEl.style.fontSize = mobile ? '8px' : 'clamp(10px, 1.12vw, 13px)';
      this._reelEl.style.letterSpacing = mobile ? '0.03em' : '0.08em';
      this._reelEl.style.textShadow = 'none';
      this._timerEl.textContent = `${this._bossBroken}/${this._bossTotal} WEAK SPOTS`;
    }
  }

  _syncServerEventDisplay() {
    const cycleMs = SERVER_EVENTS.CYCLE_MS;
    const eventMs = SERVER_EVENTS.EVENT_DURATION_MS;
    const now = Date.now();
    const cycleIdx = Math.floor(now / cycleMs);
    const posInCycle = now % cycleMs;
    const inEvent = posInCycle < eventMs;

    if (inEvent) {
      const currentType = this._pickType(cycleIdx);
      if (this._lastDisplayMode !== 'active' || this._currentType !== currentType) {
        this._setEventName(currentType, 'CURRENT EVENT');
        this._firstEvent = false;
      }
      const secLeft = Math.max(0, Math.ceil((eventMs - posInCycle) / 1000));
      this._timerEl.textContent = `ENDS IN  ${secLeft}s`;
      this._lastDisplayMode = 'active';
      this._currentType = currentType;
      return;
    }

    if (this._lastDisplayMode !== 'cooldown') {
      this._setIdleEventName();
    }
    const secLeft = Math.max(0, Math.ceil((cycleMs - posInCycle) / 1000));
    this._timerEl.textContent = `NEXT EVENT IN  ${secLeft}s`;
    this._lastDisplayMode = 'cooldown';
    this._currentType = null;
  }

  _pickType(idx) {
    const seed = hashStr((gameState.roomCode ?? 'SOLO') + String(idx));
    return SERVER_EVENTS.TYPES[seed % SERVER_EVENTS.TYPES.length];
  }

  _setEventName(type, label) {
    const name = EVENT_DISPLAY[type] ?? type ?? 'UNKNOWN EVENT';
    const color = EVENT_COLOR[type] ?? '#aaddff';
    this._labelEl.textContent = label;
    this._reelEl.textContent = name;
    this._reelEl.style.color = color;
    this._reelEl.style.textShadow = 'none';
  }

  _setIdleEventName() {
    this._labelEl.textContent = 'CURRENT EVENT';
    this._reelEl.textContent = 'NONE';
    this._reelEl.style.color = 'rgba(244, 241, 255, 0.58)';
    this._reelEl.style.textShadow = 'none';
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._popupTimeout) clearTimeout(this._popupTimeout);
    document.body.removeChild(this._el);
    document.body.removeChild(this._popup);
  }
}
