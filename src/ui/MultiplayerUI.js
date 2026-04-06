// ============================================================
// MultiplayerUI.js — timer countdown + spectator overlay
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';

export class MultiplayerUI {
  constructor() {
    this._timerEl    = null;
    this._spectateEl = null;
    this._lastSecond = -1;
    this._build();
    this._setupListeners();
  }

  _build() {
    // ── Hole timer countdown ─────────────────────────────────
    const timer = document.createElement('div');
    timer.id = 'mp-timer';
    timer.style.cssText = [
      'position:fixed',
      'top:max(60px, calc(env(safe-area-inset-top, 0px) + 44px))',
      'left:50%', 'transform:translateX(-50%)',
      'display:none', 'flex-direction:column', 'align-items:center', 'gap:4px',
      'z-index:200', 'pointer-events:none',
      'font-family:monospace', 'text-align:center',
    ].join(';');

    timer.innerHTML = `
      <div style="color:rgba(255,255,255,0.5);font-size:10px;letter-spacing:3px">WAITING FOR OTHERS</div>
      <div id="mp-timer-seconds" style="
        font-size:48px; font-weight:bold; letter-spacing:2px;
        color:#fff; text-shadow:0 0 20px rgba(100,200,255,0.9);
        line-height:1;
      ">30</div>
    `;
    document.body.appendChild(timer);
    this._timerEl   = timer;
    this._timerSecs = timer.querySelector('#mp-timer-seconds');

    // ── Spectator badge ──────────────────────────────────────
    const spec = document.createElement('div');
    spec.id = 'mp-spectate';
    spec.style.cssText = [
      'position:fixed',
      'bottom:max(56px, calc(env(safe-area-inset-bottom, 0px) + 40px))',
      'left:50%', 'transform:translateX(-50%)',
      'display:none',
      'color:rgba(255,255,255,0.5)', 'font-family:monospace',
      'font-size:11px', 'letter-spacing:3px',
      'z-index:200', 'pointer-events:none',
      'text-shadow:0 0 10px rgba(100,200,255,0.5)',
    ].join(';');
    spec.textContent = '👁 SPECTATING';
    document.body.appendChild(spec);
    this._spectateEl = spec;
  }

  _setupListeners() {
    eventBus.on(Events.MP_HOLE_TIMER, ({ remaining }) => {
      if (remaining > 0) {
        this._timerEl.style.display = 'flex';
        if (remaining !== this._lastSecond) {
          this._lastSecond = remaining;
          this._timerSecs.textContent = remaining;
          // Flash red when low
          const color = remaining <= 10
            ? `rgba(255,${Math.round(remaining * 15)},50,1)`
            : 'rgba(100,200,255,0.9)';
          this._timerSecs.style.textShadow = `0 0 20px ${color}`;
          this._timerSecs.style.color      = remaining <= 10 ? `rgb(255,${Math.round(remaining * 20)},50)` : '#fff';
        }
      } else {
        this._timerEl.style.display = 'none';
      }
    });

    eventBus.on(Events.BALL_HOLED, () => {
      // Show spectator badge if in multiplayer
      this._spectateEl.style.display = 'block';
    });

    eventBus.on(Events.HOLE_COMPLETE, () => {
      this._timerEl.style.display    = 'none';
      this._spectateEl.style.display = 'none';
      this._lastSecond = -1;
    });

    eventBus.on(Events.HOLE_LOADED, () => {
      this._timerEl.style.display    = 'none';
      this._spectateEl.style.display = 'none';
      this._lastSecond = -1;
    });

    eventBus.on(Events.MP_SOLO_MODE, () => {
      // In solo mode, never show spectator or timer
      this._timerEl.style.display    = 'none';
      this._spectateEl.style.display = 'none';
    });
  }

  dispose() {
    if (this._timerEl?.parentNode)   this._timerEl.parentNode.removeChild(this._timerEl);
    if (this._spectateEl?.parentNode) this._spectateEl.parentNode.removeChild(this._spectateEl);
  }
}
