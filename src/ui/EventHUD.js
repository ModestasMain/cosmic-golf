// ============================================================
// EventHUD.js — top-center event display with slot-machine reveal
// Shows current event name + countdown to next event.
// When a new event fires the name reels through all options
// before landing on the chosen one.
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { SERVER_EVENTS } from '../core/Constants.js';

const EVENT_DISPLAY = {
  ZERO_GRAVITY:   'ZERO GRAVITY',
  MAP_FLIP:       'MAP FLIP',
  STATIC:         'STATIC',
  ASTEROID_STORM: 'ASTEROID STORM',
};

const EVENT_COLOR = {
  ZERO_GRAVITY:   '#44ccff',
  MAP_FLIP:       '#cc44ff',
  STATIC:         '#aabbcc',
  ASTEROID_STORM: '#ff8844',
};

const ALL_NAMES  = Object.values(EVENT_DISPLAY);
const ALL_COLORS = Object.values(EVENT_COLOR);

export class EventHUD {
  constructor() {
    this._spinning     = false;
    this._currentType  = null;
    this._rafId        = null;
    this._firstEvent   = true;   // show initial event without spinning

    this._el = this._build();
    document.body.appendChild(this._el);
    this._setupListeners();
    this._startTick();
  }

  // ── DOM ───────────────────────────────────────────────────

  _build() {
    const root = document.createElement('div');
    root.id = 'event-hud';
    Object.assign(root.style, {
      position:      'fixed',
      top:           'max(10px, env(safe-area-inset-top, 0px))',
      left:          '50%',
      transform:     'translateX(-50%)',
      zIndex:        '450',
      pointerEvents: 'none',
      userSelect:    'none',
      textAlign:     'center',
      fontFamily:    '"Courier New", monospace',
    });

    // "CURRENT EVENT" micro-label
    this._labelEl = document.createElement('div');
    Object.assign(this._labelEl.style, {
      fontSize:      'clamp(7px, 1.8vw, 9px)',
      letterSpacing: '2px',
      color:         'rgba(140,170,255,0.55)',
      marginBottom:  '2px',
    });
    this._labelEl.textContent = 'CURRENT EVENT';

    // Clip window — slot reel lives inside here
    const clip = document.createElement('div');
    Object.assign(clip.style, {
      overflow: 'hidden',
      height:   '2em',
    });

    // The reel — we translateY it to create the scroll illusion
    this._reelEl = document.createElement('div');
    Object.assign(this._reelEl.style, {
      lineHeight:    '2em',
      fontSize:      'clamp(10px, 2.8vw, 22px)',
      fontWeight:    '900',
      letterSpacing: '0.1em',
      color:         'rgba(140,180,255,0.4)',
      textShadow:    'none',
      willChange:    'transform',
      transition:    'none',
    });
    this._reelEl.textContent = '—';

    clip.appendChild(this._reelEl);

    // "NEXT IN  Xs" timer line
    this._timerEl = document.createElement('div');
    Object.assign(this._timerEl.style, {
      fontSize:      'clamp(7px, 1.8vw, 9px)',
      letterSpacing: '1.5px',
      color:         'rgba(140,170,255,0.45)',
      marginTop:     '2px',
    });
    this._timerEl.textContent = 'NEXT IN  —';

    root.appendChild(this._labelEl);
    root.appendChild(clip);
    root.appendChild(this._timerEl);
    return root;
  }

  // ── Listeners ─────────────────────────────────────────────

  _setupListeners() {
    eventBus.on(Events.SERVER_EVENT, ({ type, phase }) => {
      if (phase === 'start') {
        this._triggerSlotMachine(type);
      }
    });
  }

  // ── Countdown tick ────────────────────────────────────────

  _startTick() {
    const tick = () => {
      if (!this._spinning) {
        const interval  = SERVER_EVENTS.INTERVAL_MS;
        const msInSlice = Date.now() % interval;
        const secLeft   = Math.ceil((interval - msInSlice) / 1000);
        this._timerEl.textContent = `NEXT IN  ${secLeft}s`;
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  // ── Slot-machine animation ────────────────────────────────

  _triggerSlotMachine(targetType) {
    if (this._spinning) return;

    // First event on page load: display immediately, no spin
    if (this._firstEvent) {
      this._firstEvent = false;
      const name  = EVENT_DISPLAY[targetType] ?? targetType;
      const color = EVENT_COLOR[targetType]   ?? '#aaddff';
      this._reelEl.textContent      = name;
      this._reelEl.style.color      = color;
      this._reelEl.style.textShadow = 'none';
      return;
    }

    this._spinning = true;
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

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    document.body.removeChild(this._el);
  }
}
