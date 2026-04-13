// ============================================================
// BallStylePicker.js — horizontal scrollable ball skin selector
// ============================================================

import { BALL_STYLE_IDS, buildBallStyleSync } from '../objects/BallStyles.js';
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
      'max-width:min(320px, 70vw)',
      'padding:8px',
      'background:rgba(4,6,20,0.88)',
      'border:1px solid rgba(100,160,255,0.25)',
      'border-radius:10px',
      'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
    ].join(';');

    for (const id of BALL_STYLE_IDS) {
      const style = buildBallStyleSync(id);
      const btn = document.createElement('button');
      btn.dataset.styleId = id;
      btn.title = style.name;
      btn.style.cssText = [
        'width:44px',
        'height:44px',
        'border-radius:50%',
        'border:2px solid rgba(100,160,255,0.3)',
        'cursor:pointer',
        'padding:0',
        'overflow:hidden',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:#111',
        'transition:border-color 0.15s',
        'touch-action:manipulation',
      ].join(';');

      const preview = this._makePreview(style);
      btn.appendChild(preview);

      if (id === this._selected) {
        btn.style.borderColor = '#ffd700';
      }

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._select(id);
      });

      this._panel.appendChild(btn);
    }

    this.el.appendChild(this._panel);
    document.body.appendChild(this.el);
  }

  _makePreview(style) {
    const size = 36;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.style.cssText = 'width:100%;height:100%;border-radius:50%;';
    const ctx = c.getContext('2d');

    const srcCanvas = style.albedo.image;
    if (srcCanvas) {
      ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#' + style.color.toString(16).padStart(6, '0');
      ctx.fillRect(0, 0, size, size);
    }
    return c;
  }

  _select(id) {
    this._selected = id;
    gameState.setBallStyle(id);
    eventBus.emit(Events.BALL_STYLE_CHANGED, { styleId: id });

    const buttons = this._panel.querySelectorAll('button');
    for (const btn of buttons) {
      btn.style.borderColor = btn.dataset.styleId === id ? '#ffd700' : 'rgba(100,160,255,0.3)';
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
