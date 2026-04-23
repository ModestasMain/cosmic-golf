// ============================================================
// AnnouncerUI.js — cinematic text announcements
// Queue-based DOM overlay: score, events, billiard hits
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';

const STYLES = {
  'GRAVITY WAVE!':  { color: '#44aaff', size: '5.5vw' },
  'ASTEROID STORM!':{ color: '#ff8800', size: '5.5vw' },
  'SOLAR FLARE!':   { color: '#ffee44', size: '5.5vw' },
  'NICE SHOT!':     { color: '#ffffff', size: '4.5vw' },
  'RICOCHET!':      { color: '#ff44ff', size: '4.5vw' },
  'OWN GOAL?!':     { color: '#ff4444', size: '5vw' },
  'WORLD EATER AWAKENS': {
    color: '#ff5bd2',
    size: '5.8vw',
    fontFamily: 'Georgia, serif',
    letterSpacing: '0.08em',
    shadow: '0 4px 0 rgba(48, 6, 39, 0.95), 0 10px 28px rgba(25, 4, 20, 0.9), 0 0 22px rgba(255, 91, 210, 0.45)',
    stroke: '1px rgba(63, 10, 52, 0.95)',
  },
  'WEAK POINT HIT!': { color: '#ffd67d', size: '5vw' },
  'CORE EXPOSED!':  { color: '#9df6ff', size: '5.4vw' },
  'CHOMP!':         { color: '#ff7a3c', size: '5.5vw' },
  'PERFECT FEED!':  { color: '#ffe26a', size: '5.4vw' },
};

export class AnnouncerUI {
  constructor() {
    this._queue  = [];
    this._busy   = false;
    this._el     = this._build();
    document.body.appendChild(this._el);
    this._setupListeners();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'announcer';
    Object.assign(el.style, {
      position:      'fixed',
      top:           '32%',
      left:          '50%',
      transform:     'translate(-50%,-50%) scale(0)',
      zIndex:        '500',
      fontFamily:    '"Courier New", monospace',
      fontSize:      '5vw',
      fontWeight:    '900',
      letterSpacing: '0.1em',
      textAlign:     'center',
      pointerEvents: 'none',
      textShadow:    '0 0 20px currentColor, 0 0 50px currentColor',
      opacity:       '0',
      whiteSpace:    'nowrap',
      transition:    'none',
    });
    return el;
  }

  // ── Public API ───────────────────────────────────────────

  show(text, color = '#ffffff', duration = 1800) {
    this._queue.push({ text, color, duration });
    if (!this._busy) this._next();
  }

  // ── Private ──────────────────────────────────────────────

  _next() {
    if (!this._queue.length) { this._busy = false; return; }
    this._busy = true;

    const { text, color, duration } = this._queue.shift();
    const style = STYLES[text] ?? {};

    this._el.textContent  = text;
    this._el.style.color  = style.color ?? color;
    this._el.style.fontSize = style.size ?? '5vw';
    this._el.style.fontFamily = style.fontFamily ?? '"Courier New", monospace';
    this._el.style.letterSpacing = style.letterSpacing ?? '0.1em';
    this._el.style.textShadow = style.shadow ?? '0 0 20px currentColor, 0 0 50px currentColor';
    this._el.style.webkitTextStroke = style.stroke ?? '0px transparent';

    // Reset before animating
    this._el.style.transition = 'none';
    this._el.style.transform  = 'translate(-50%,-50%) scale(0.4)';
    this._el.style.opacity    = '0';

    // Animate in (next frame so reset applies first)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._el.style.transition = 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), opacity 0.12s ease';
        this._el.style.transform  = 'translate(-50%,-50%) scale(1)';
        this._el.style.opacity    = '1';
      });
    });

    // Hold then fade out
    setTimeout(() => {
      this._el.style.transition = 'transform 0.22s ease-in, opacity 0.22s ease-in';
      this._el.style.transform  = 'translate(-50%,-50%) scale(0.75)';
      this._el.style.opacity    = '0';
      setTimeout(() => this._next(), 260);
    }, duration);
  }

  _setupListeners() {
    eventBus.on(Events.COLLECTIBLE_COLLECTED, ({ label, color, remote }) => {
      if (!remote && label) this.show(label, color ?? '#ffffff', 1500);
    });

    eventBus.on(Events.WORLDEATER_WARNING, () => {
      this.show('WORLD EATER AWAKENS', '#ff5bd2', 2400);
    });

    eventBus.on(Events.WORLDEATER_WEAKSPOT_HIT, ({ remaining }) => {
      if (remaining > 0) this.show('WEAK POINT HIT!', '#ffd67d', 1400);
    });

    eventBus.on(Events.WORLDEATER_OPENED, () => {
      this.show('CORE EXPOSED!', '#9df6ff', 2200);
    });

    eventBus.on(Events.WORLDEATER_RESET, () => {
      this.show('WORLD EATER RESEALED', '#ffd67d', 2200);
    });

    eventBus.on(Events.WORLDEATER_CHOMP, () => {
      this.show('CHOMP!', '#ff7a3c', 1400);
    });

    eventBus.on(Events.WORLDEATER_BOOST, () => {
      this.show('PERFECT FEED!', '#ffe26a', 1600);
    });
  }
}
