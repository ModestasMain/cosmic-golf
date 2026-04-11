// ============================================================
// AnnouncerUI.js — cinematic text announcements
// Queue-based DOM overlay: score, events, billiard hits
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';

const PAR = 4; // mini-golf par per hole

const STYLES = {
  'HOLE IN ONE!':   { color: '#ffd700', size: '7vw' },
  'EAGLE!':         { color: '#ffd700', size: '6vw' },
  'BIRDIE!':        { color: '#00ffcc', size: '5.5vw' },
  'PAR':            { color: '#aaddff', size: '4.5vw' },
  'BOGEY':          { color: '#ff9944', size: '4vw' },
  'DOUBLE BOGEY':   { color: '#ff5522', size: '4vw' },
  'DISASTER!':      { color: '#ff2244', size: '5vw' },
  'GRAVITY WAVE!':  { color: '#44aaff', size: '5.5vw' },
  'ASTEROID STORM!':{ color: '#ff8800', size: '5.5vw' },
  'SOLAR FLARE!':   { color: '#ffee44', size: '5.5vw' },
  'NICE SHOT!':     { color: '#ffffff', size: '4.5vw' },
  'RICOCHET!':      { color: '#ff44ff', size: '4.5vw' },
  'OWN GOAL?!':     { color: '#ff4444', size: '5vw' },
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
    // Score announcements
    eventBus.on(Events.BALL_HOLED, ({ strokes }) => {
      const msg = this._scoreMessage(strokes);
      if (msg) this.show(msg);
    });

    // Billiard hits
    eventBus.on(Events.BILLIARD_HIT, ({ ownGoal }) => {
      this.show(ownGoal ? 'OWN GOAL?!' : (Math.random() < 0.5 ? 'NICE SHOT!' : 'RICOCHET!'));
    });

    // Collectible pickup
    eventBus.on(Events.COLLECTIBLE_COLLECTED, ({ label, color, remote }) => {
      if (!remote && label) this.show(label, color ?? '#ffffff', 1500);
    });
  }

  _scoreMessage(strokes) {
    if (strokes === 1)           return 'HOLE IN ONE!';
    if (strokes <= PAR - 2)      return 'EAGLE!';
    if (strokes === PAR - 1)     return 'BIRDIE!';
    if (strokes === PAR)         return 'PAR';
    if (strokes === PAR + 1)     return 'BOGEY';
    if (strokes === PAR + 2)     return 'DOUBLE BOGEY';
    return 'DISASTER!';
  }
}
