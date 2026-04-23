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
      'bottom:max(126px, calc(env(safe-area-inset-bottom, 0px) + 108px))',
      'left:max(18px, calc(env(safe-area-inset-left, 0px) + 12px))',
      'z-index:190',
      'display:none',
      'flex-direction:column',
      'gap:8px',
      'align-items:flex-start',
      'font-family:Inter Tight,sans-serif',
    ].join(';');

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.style.cssText = [
      'background:linear-gradient(180deg, rgba(11,8,22,0.86), rgba(8,5,18,0.84))',
      'color:rgba(238,232,255,0.94)',
      'font-family:Orbitron,sans-serif',
      'font-size:10px',
      'letter-spacing:0.18em',
      'text-transform:uppercase',
      'border:1px solid rgba(132,92,255,0.42)',
      'border-radius:18px',
      'padding:12px 16px',
      'cursor:pointer',
      'box-shadow:0 18px 50px rgba(3,2,10,0.34)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
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
      'gap:8px',
      'max-width:min(260px, 62vw)',
      'padding:12px',
      'background:linear-gradient(180deg, rgba(11,8,22,0.9), rgba(8,5,18,0.88))',
      'border:1px solid rgba(132,92,255,0.28)',
      'border-radius:20px',
      'box-shadow:0 18px 52px rgba(3,2,10,0.34)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
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
        'width:42px',
        'height:42px',
        'border-radius:50%',
        'border:2px solid rgba(132,92,255,0.26)',
        'cursor:pointer',
        'padding:0',
        'overflow:hidden',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:#0b0718',
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
        'font-size:7px',
        'letter-spacing:0.08em',
        'color:rgba(206,196,242,0.74)',
        'text-align:center',
        'max-width:48px',
        'line-height:1.1',
        'pointer-events:none',
        'user-select:none',
      ].join(';');

      if (id === this._selected) {
        btn.style.borderColor = '#ffd073';
        btn.style.boxShadow = '0 0 12px rgba(255,188,92,0.35)';
        label.style.color = 'rgba(255,220,164,0.95)';
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
      if (btn)   { btn.style.borderColor = active ? '#ffd073' : 'rgba(132,92,255,0.26)'; btn.style.boxShadow = active ? '0 0 12px rgba(255,188,92,0.35)' : 'none'; }
      if (label) { label.style.color = active ? 'rgba(255,220,164,0.95)' : 'rgba(206,196,242,0.74)'; }
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
