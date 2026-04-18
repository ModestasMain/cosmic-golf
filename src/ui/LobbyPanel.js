// ============================================================
// LobbyPanel.js — top-right panel: player roster during play,
//                 live scoreboard after holing out.
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

const MOBILE_BP = 480;

export class LobbyPanel {
  constructor() {
    this._players     = new Map(); // playerId → { name, color, hole }
    this._localId     = null;
    this._currentHole = 1;
    this._minimized   = false;
    this._mode        = 'roster'; // 'roster' | 'scores'
    this._build();
    this._listen();
  }

  setLocalId(id) {
    this._localId = id;
    this._render();
  }

  // ── DOM ──────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.id = 'lobby-panel';
    el.style.cssText = [
      'position:fixed',
      'top:max(72px, calc(env(safe-area-inset-top, 0px) + 62px))',
      'right:max(12px, env(safe-area-inset-right, 0px))',
      'font-family:monospace',
      'z-index:120',
      'pointer-events:auto',
      'display:none',
      'flex-direction:column',
      'min-width:160px',
      'max-width:220px',
      'background:rgba(4,6,20,0.82)',
      'border:1px solid rgba(100,160,255,0.18)',
      'border-radius:10px',
      'overflow:hidden',
      'backdrop-filter:blur(10px)',
      '-webkit-backdrop-filter:blur(10px)',
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'padding:6px 10px 5px', 'cursor:pointer', 'user-select:none',
      '-webkit-user-select:none',
      'border-bottom:1px solid rgba(100,160,255,0.12)',
    ].join(';');

    this._labelEl = document.createElement('span');
    this._labelEl.style.cssText = 'font-size:9px;letter-spacing:2px;color:rgba(160,200,255,0.55);';

    this._chevron = document.createElement('span');
    this._chevron.style.cssText = 'font-size:8px;color:rgba(255,255,255,0.3);line-height:1;';
    this._chevron.textContent = '▲';

    header.appendChild(this._labelEl);
    header.appendChild(this._chevron);
    header.addEventListener('pointerdown', () => this._toggle());

    // List
    this._listEl = document.createElement('div');
    this._listEl.style.cssText = 'display:flex;flex-direction:column;overflow-y:auto;max-height:55vh;';

    el.appendChild(header);
    el.appendChild(this._listEl);
    document.body.appendChild(el);
    this._el = el;
  }

  _toggle() {
    this._minimized = !this._minimized;
    this._listEl.style.display = this._minimized ? 'none' : 'flex';
    this._chevron.textContent  = this._minimized ? '▼' : '▲';
  }

  // ── Events ───────────────────────────────────────────────────

  _listen() {
    eventBus.on(Events.MP_PLAYER_JOINED, ({ playerId, name, color }) => {
      const existing = this._players.get(playerId);
      if (existing) {
        if (name) existing.name = name;
      } else {
        this._players.set(playerId, { name: name || playerId, color, hole: this._currentHole });
      }
      this._show();
      this._render();
    });

    eventBus.on(Events.MP_PLAYER_LEFT, ({ playerId }) => {
      this._players.delete(playerId);
      if (this._players.size === 0) this._el.style.display = 'none';
      else this._render();
    });

    eventBus.on(Events.HOLE_LOADED, ({ holeIndex }) => {
      this._currentHole = (holeIndex ?? 0) + 1;
      this._mode = 'roster';
      for (const p of this._players.values()) p.hole = this._currentHole;
      this._render();
    });

    eventBus.on(Events.MP_BALL_STOPPED, ({ playerId, holeIndex }) => {
      const p = this._players.get(playerId);
      if (p && holeIndex != null) { p.hole = holeIndex + 1; this._render(); }
    });

    // Switch to scores view when local player holes out
    eventBus.on(Events.HOLE_COMPLETE, () => {
      this._mode = 'scores';
      this._minimized = false;
      this._listEl.style.display = 'flex';
      this._chevron.textContent = '▲';
      this._render();
    });

    // Live-update scores as remotes finish
    eventBus.on(Events.MP_HOLE_COMPLETE, () => {
      if (this._mode === 'scores') this._render();
    });

    eventBus.on(Events.MP_SOLO_MODE,   () => { this._el.style.display = 'none'; });
    eventBus.on(Events.GAME_COMPLETE,  () => { this._el.style.display = 'none'; });
  }

  _show() {
    if (!gameState.isSoloMode && this._players.size > 0) {
      this._el.style.display = 'flex';
    }
  }

  // ── Render ───────────────────────────────────────────────────

  _render() {
    this._listEl.innerHTML = '';

    if (this._mode === 'scores') {
      this._renderScores();
    } else {
      this._renderRoster();
    }
  }

  _renderRoster() {
    const count = this._players.size;
    this._labelEl.textContent = `${count} PLAYER${count !== 1 ? 'S' : ''}`;

    for (const [id, player] of this._players) {
      const isLocal = id === this._localId;
      const hex = '#' + ((player.color >>> 0) & 0xffffff).toString(16).padStart(6, '0');

      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex', 'align-items:center', 'justify-content:flex-end',
        'gap:7px', 'padding:4px 10px',
        `opacity:${isLocal ? '1' : '0.72'}`,
      ].join(';');

      const holeEl = document.createElement('span');
      holeEl.style.cssText = 'font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.28);min-width:20px;text-align:right;';
      holeEl.textContent = `H${player.hole}`;

      const nameEl = document.createElement('span');
      nameEl.style.cssText = [
        'font-size:11px', 'letter-spacing:1px', `color:${hex}`,
        'max-width:100px', 'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
      ].join(';');
      nameEl.textContent = (player.name || id).toUpperCase();

      const dot = document.createElement('span');
      dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${hex};box-shadow:0 0 5px ${hex};display:inline-block;flex-shrink:0;`;

      row.appendChild(holeEl);
      row.appendChild(nameEl);
      row.appendChild(dot);
      this._listEl.appendChild(row);
    }
  }

  _renderScores() {
    const hole = gameState.currentHole;
    this._labelEl.textContent = `HOLE ${hole} SCORES`;

    const sorted = [...gameState.players].sort((a, b) =>
      a.strokes.reduce((s, v) => s + (v || 0), 0) -
      b.strokes.reduce((s, v) => s + (v || 0), 0)
    );

    const isMobile = window.innerWidth <= MOBILE_BP;
    const limit    = isMobile ? 3 : 8;
    const shown    = sorted.slice(0, limit);

    shown.forEach((p, rank) => {
      const total    = p.strokes.reduce((s, v) => s + (v || 0), 0);
      const thisHole = p.strokes[hole - 1] ?? '—';
      const isLocal  = p.id === gameState.players[0]?.id;
      const hex      = '#' + (p.color ?? 0xffffff).toString(16).padStart(6, '0');

      const row = document.createElement('div');
      row.style.cssText = [
        'display:grid',
        'grid-template-columns:18px 8px 1fr auto auto',
        'align-items:center',
        'gap:5px',
        'padding:5px 10px',
        isLocal ? 'background:rgba(100,160,255,0.10)' : rank % 2 === 0 ? 'background:rgba(255,255,255,0.02)' : '',
        'border-bottom:1px solid rgba(255,255,255,0.04)',
      ].join(';');

      const rankEl = document.createElement('span');
      rankEl.textContent = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}`;
      rankEl.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.4);text-align:center;';

      const dot = document.createElement('span');
      dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${hex};flex-shrink:0;`;

      const nameEl = document.createElement('span');
      nameEl.textContent = (p.name || p.id || '?').slice(0, 10).toUpperCase();
      nameEl.style.cssText = [
        'font-size:9px', 'letter-spacing:0.5px',
        `color:${isLocal ? 'rgba(160,210,255,1)' : 'rgba(255,255,255,0.65)'}`,
        'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
      ].join(';');

      const holeEl = document.createElement('span');
      holeEl.textContent = thisHole;
      holeEl.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);text-align:right;min-width:14px;';

      const totalEl = document.createElement('span');
      totalEl.textContent = total;
      totalEl.style.cssText = [
        'font-size:11px', 'font-weight:bold', 'text-align:right', 'min-width:20px',
        `color:${rank === 0 ? '#ffd700' : 'rgba(255,255,255,0.85)'}`,
      ].join(';');

      row.appendChild(rankEl);
      row.appendChild(dot);
      row.appendChild(nameEl);
      row.appendChild(holeEl);
      row.appendChild(totalEl);
      this._listEl.appendChild(row);
    });

    if (isMobile && sorted.length > limit) {
      const more = document.createElement('div');
      more.textContent = `+ ${sorted.length - limit} more`;
      more.style.cssText = 'font-size:9px;color:rgba(100,200,255,0.5);text-align:center;padding:4px;letter-spacing:1px;';
      this._listEl.appendChild(more);
    }
  }

  dispose() {
    this._el?.parentNode?.removeChild(this._el);
  }
}
