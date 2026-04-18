// ============================================================
// BallStylePicker.js — horizontal scrollable ball skin selector
// ============================================================

import { BALL_STYLE_IDS, STYLE_DEFS } from '../objects/BallStyles.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';

export class BallStylePicker {
  constructor() {
    this._visible = false;
    this._selected = gameState.ballStyle;
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.id = 'ball-style-picker';
    this.el.style.cssText = [
      'position:fixed',
      'bottom:max(60px, calc(env(safe-area-inset-bottom, 0px) + 52px))',
      'right:max(20px, calc(env(safe-area-inset-right, 0px) + 12px))',
      'z-index:190',
      'display:none',
      'flex-direction:column',
      'gap:6px',
      'align-items:flex-end',
      'font-family:monospace',
    ].join(';');

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.style.cssText = [
      'background:rgba(10,12,30,0.75)',
      'color:rgba(160,210,255,0.9)',
      'font-family:monospace',
      'font-size:11px',
      'letter-spacing:2px',
      'border:1px solid rgba(100,160,255,0.35)',
      'border-radius:8px',
      'padding:8px 14px',
      'cursor:pointer',
      'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';');
    this._toggleBtn.textContent = 'BALL STYLE';
    this._toggleBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._visible = !this._visible;
      this._panel.style.display = this._visible ? 'flex' : 'none';
    });
    this.el.appendChild(this._toggleBtn);

    this._panel = document.createElement('div');
    this._panel.style.cssText = [
      'display:none',
      'flex-direction:row',
      'flex-wrap:wrap',
      'gap:6px',
      'max-width:min(380px, 80vw)',
      'padding:8px',
      'background:rgba(4,6,20,0.88)',
      'border:1px solid rgba(100,160,255,0.25)',
      'border-radius:10px',
      'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
    ].join(';');

    for (const id of BALL_STYLE_IDS) {
      const def = STYLE_DEFS[id];

      // Wrapper: circle preview + label underneath
      const wrap = document.createElement('div');
      wrap.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'gap:3px',
        'cursor:pointer',
        'touch-action:manipulation',
      ].join(';');

      const btn = document.createElement('button');
      btn.dataset.styleId = id;
      btn.style.cssText = [
        'width:48px',
        'height:48px',
        'border-radius:50%',
        'border:2px solid rgba(100,160,255,0.3)',
        'cursor:pointer',
        'padding:0',
        'overflow:hidden',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:#111',
        'transition:border-color 0.15s, box-shadow 0.15s',
        'touch-action:manipulation',
        'flex-shrink:0',
      ].join(';');

      const img = document.createElement('img');
      img.src = `/textures/balls/${def.file}`;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
      btn.appendChild(img);

      const label = document.createElement('span');
      label.textContent = def.name.toUpperCase();
      label.style.cssText = [
        'font-size:8px',
        'letter-spacing:0.5px',
        'color:rgba(160,210,255,0.7)',
        'text-align:center',
        'max-width:52px',
        'line-height:1.1',
        'pointer-events:none',
        'user-select:none',
      ].join(';');

      if (id === this._selected) {
        btn.style.borderColor = '#ffd700';
        btn.style.boxShadow = '0 0 6px rgba(255,215,0,0.5)';
        label.style.color = 'rgba(255,215,0,0.9)';
      }

      wrap.appendChild(btn);
      wrap.appendChild(label);

      wrap.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._select(id);
      });

      this._panel.appendChild(wrap);
    }

    this.el.appendChild(this._panel);
    document.body.appendChild(this.el);
  }

  _select(id) {
    this._selected = id;
    gameState.setBallStyle(id);
    eventBus.emit(Events.BALL_STYLE_CHANGED, { styleId: id });

    for (const wrap of this._panel.children) {
      const btn   = wrap.querySelector('button');
      const label = wrap.querySelector('span');
      const active = btn?.dataset.styleId === id;
      if (btn)   { btn.style.borderColor = active ? '#ffd700' : 'rgba(100,160,255,0.3)'; btn.style.boxShadow = active ? '0 0 6px rgba(255,215,0,0.5)' : 'none'; }
      if (label) { label.style.color = active ? 'rgba(255,215,0,0.9)' : 'rgba(160,210,255,0.7)'; }
    }
  }

  show() {
    this.el.style.display = 'flex';
  }

  hide() {
    this.el.style.display = 'none';
    this._visible = false;
    this._panel.style.display = 'none';
  }
}
