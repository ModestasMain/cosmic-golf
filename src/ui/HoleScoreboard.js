// ============================================================
// HoleScoreboard.js — compact live scoreboard shown after holing out
//
// • Appears on HOLE_COMPLETE, hides on HOLE_LOADED
// • Desktop: up to 8 rows visible, scrollable
// • Mobile (≤480px): collapsed to top-3, tap to expand
// • Sorted by total strokes ascending (lower = better)
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

const MAX_VISIBLE_DESKTOP = 8;
const MAX_VISIBLE_MOBILE  = 3;
const MOBILE_BP           = 480;

export class HoleScoreboard {
  constructor() {
    this._expanded = false;
    this._visible  = false;
    this._build();
    this._listen();
  }

  _build() {
    this._el = document.createElement('div');
    this._el.id = 'hole-scoreboard';
    this._el.style.cssText = [
      'position:fixed',
      'top:max(12px, calc(env(safe-area-inset-top, 0px) + 8px))',
      'right:max(12px, calc(env(safe-area-inset-right, 0px) + 8px))',
      'z-index:195',
      'display:none',
      'flex-direction:column',
      'gap:0',
      'min-width:160px',
      'max-width:220px',
      'background:rgba(4,6,20,0.82)',
      'border:1px solid rgba(100,160,255,0.22)',
      'border-radius:10px',
      'overflow:hidden',
      'backdrop-filter:blur(10px)',
      '-webkit-backdrop-filter:blur(10px)',
      'font-family:monospace',
      'pointer-events:auto',
    ].join(';');

    // Header
    this._header = document.createElement('div');
    this._header.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'padding:6px 10px 5px',
      'border-bottom:1px solid rgba(100,160,255,0.15)',
      'cursor:pointer',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';');
    this._header.innerHTML = `
      <span style="font-size:9px;letter-spacing:2px;color:rgba(100,200,255,0.7)">SCORES</span>
      <span id="sb-toggle" style="font-size:9px;color:rgba(100,200,255,0.5);display:none">▼</span>
    `;
    this._toggleArrow = this._header.querySelector('#sb-toggle');
    this._header.addEventListener('pointerdown', () => this._toggleExpand());

    // Rows container
    this._rows = document.createElement('div');
    this._rows.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'overflow-y:auto',
      'max-height:60vh',
    ].join(';');

    this._el.appendChild(this._header);
    this._el.appendChild(this._rows);
    document.body.appendChild(this._el);
  }

  _listen() {
    eventBus.on(Events.HOLE_COMPLETE, () => this._show());
    eventBus.on(Events.HOLE_LOADED,   () => this._hide());

    // Live-update when a remote player finishes
    eventBus.on(Events.MP_HOLE_COMPLETE, () => {
      if (this._visible) this._render();
    });
  }

  _show() {
    this._visible  = true;
    this._expanded = false;
    this._render();
    this._el.style.display = 'flex';
  }

  _hide() {
    this._visible = false;
    this._el.style.display = 'none';
  }

  _isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

  _toggleExpand() {
    if (!this._isMobile()) return;
    this._expanded = !this._expanded;
    this._render();
  }

  _render() {
    const hole    = gameState.currentHole;
    const players = [...gameState.players].sort((a, b) => {
      const ta = a.strokes.reduce((s, v) => s + (v || 0), 0);
      const tb = b.strokes.reduce((s, v) => s + (v || 0), 0);
      return ta - tb;
    });

    const mobile  = this._isMobile();
    const limit   = mobile && !this._expanded ? MAX_VISIBLE_MOBILE : MAX_VISIBLE_DESKTOP;
    const clipped = players.length > limit;

    // Show toggle arrow on mobile when there are more players than visible
    this._toggleArrow.style.display = mobile && players.length > MAX_VISIBLE_MOBILE ? 'block' : 'none';
    this._toggleArrow.textContent   = this._expanded ? '▲' : '▼';

    this._rows.innerHTML = '';

    const shown = players.slice(0, limit);
    shown.forEach((p, rank) => {
      const total   = p.strokes.reduce((s, v) => s + (v || 0), 0);
      const thisHole = p.strokes[hole] ?? '—';
      const isLocal  = p.id === gameState.players[0]?.id;

      const hex = '#' + (p.color ?? 0xffffff).toString(16).padStart(6, '0');

      const row = document.createElement('div');
      row.style.cssText = [
        'display:grid',
        'grid-template-columns:16px 8px 1fr auto auto',
        'align-items:center',
        'gap:5px',
        'padding:5px 10px',
        isLocal
          ? 'background:rgba(100,160,255,0.10)'
          : (rank % 2 === 0 ? 'background:rgba(255,255,255,0.02)' : ''),
        'border-bottom:1px solid rgba(255,255,255,0.04)',
      ].join(';');

      // Rank
      const rankEl = document.createElement('span');
      rankEl.textContent = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank+1}`;
      rankEl.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.4);text-align:center;';

      // Color dot
      const dot = document.createElement('span');
      dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${hex};flex-shrink:0;`;

      // Name
      const name = document.createElement('span');
      name.textContent = (p.name || p.id || '?').slice(0, 10).toUpperCase();
      name.style.cssText = [
        'font-size:9px',
        'letter-spacing:0.5px',
        `color:${isLocal ? 'rgba(160,210,255,1)' : 'rgba(255,255,255,0.65)'}`,
        'overflow:hidden',
        'text-overflow:ellipsis',
        'white-space:nowrap',
      ].join(';');

      // This hole strokes
      const holeEl = document.createElement('span');
      holeEl.textContent = thisHole;
      holeEl.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);text-align:right;min-width:14px;';

      // Total
      const totalEl = document.createElement('span');
      totalEl.textContent = total;
      totalEl.style.cssText = [
        'font-size:11px',
        'font-weight:bold',
        'text-align:right',
        'min-width:20px',
        `color:${rank === 0 ? '#ffd700' : 'rgba(255,255,255,0.85)'}`,
      ].join(';');

      row.appendChild(rankEl);
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(holeEl);
      row.appendChild(totalEl);
      this._rows.appendChild(row);
    });

    // "+N more" pill on mobile when collapsed
    if (mobile && clipped && !this._expanded) {
      const more = document.createElement('div');
      more.textContent = `+ ${players.length - limit} more`;
      more.style.cssText = [
        'font-size:9px',
        'color:rgba(100,200,255,0.5)',
        'text-align:center',
        'padding:4px',
        'cursor:pointer',
        'letter-spacing:1px',
      ].join(';');
      more.addEventListener('pointerdown', () => this._toggleExpand());
      this._rows.appendChild(more);
    }
  }

  dispose() {
    this._el.remove();
  }
}
