// ============================================================
// LobbyPanel.js — in-game player roster panel (top-right)
// Shows each player's name + current hole, minimizable.
// Sits just below the room code display.
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class LobbyPanel {
  constructor() {
    this._players    = new Map(); // playerId → { name, color, hole }
    this._localId    = null;
    this._currentHole = 1;
    this._minimized  = false;
    this._build();
    this._listen();
  }

  // Called by main.js once the local player ID is known
  setLocalId(id) {
    this._localId = id;
    this._render();
  }

  // ── DOM ────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.id = 'lobby-panel';
    el.style.cssText = [
      'position:fixed',
      // Sits below the room-code block (which is ~52 px tall at top:16px)
      'top:max(72px, calc(env(safe-area-inset-top, 0px) + 62px))',
      'right:max(12px, env(safe-area-inset-right, 0px))',
      'font-family:monospace',
      'text-align:right',
      'z-index:120',
      'pointer-events:auto',
      'display:none',
    ].join(';');

    // ── Header row ──────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:flex-end',
      'gap:6px', 'margin-bottom:5px', 'cursor:pointer', 'user-select:none',
    ].join(';');

    this._countEl = document.createElement('span');
    this._countEl.style.cssText = 'font-size:clamp(7px,1.8vw,9px);letter-spacing:2px;color:rgba(160,200,255,0.45);';
    this._countEl.textContent = '0 PLAYERS';

    this._chevron = document.createElement('span');
    this._chevron.style.cssText = [
      'font-size:8px', 'color:rgba(255,255,255,0.3)', 'line-height:1',
    ].join(';');
    this._chevron.textContent = '▲';

    header.appendChild(this._countEl);
    header.appendChild(this._chevron);
    header.addEventListener('click', () => this._toggle());

    // ── Player list ─────────────────────────────────────────
    this._listEl = document.createElement('div');
    this._listEl.style.cssText = [
      'display:flex', 'flex-direction:column', 'gap:3px',
    ].join(';');

    el.appendChild(header);
    el.appendChild(this._listEl);
    document.body.appendChild(el);
    this._el = el;
  }

  _toggle() {
    this._minimized = !this._minimized;
    this._listEl.style.display   = this._minimized ? 'none' : 'flex';
    this._chevron.textContent    = this._minimized ? '▼' : '▲';
  }

  // ── Event listeners ────────────────────────────────────────

  _listen() {
    eventBus.on(Events.MP_PLAYER_JOINED, ({ playerId, name, color }) => {
      const existing = this._players.get(playerId);
      if (existing) {
        // Re-announcement (name update after name-entry screen)
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

    // When the game advances a hole, update everyone's displayed hole
    eventBus.on(Events.HOLE_LOADED, ({ holeIndex }) => {
      this._currentHole = (holeIndex ?? 0) + 1;
      for (const p of this._players.values()) p.hole = this._currentHole;
      this._render();
    });

    // Remote ball stop carries holeIndex → fine-grained per-player tracking
    eventBus.on(Events.MP_BALL_STOPPED, ({ playerId, holeIndex }) => {
      const p = this._players.get(playerId);
      if (p && holeIndex != null) {
        p.hole = holeIndex + 1;
        this._render();
      }
    });

    eventBus.on(Events.MP_SOLO_MODE, () => {
      this._el.style.display = 'none';
    });

    eventBus.on(Events.GAME_COMPLETE, () => {
      this._el.style.display = 'none';
    });
  }

  _show() {
    if (!gameState.isSoloMode && this._players.size > 0) {
      this._el.style.display = 'block';
    }
  }

  // ── Render ─────────────────────────────────────────────────

  _render() {
    const count = this._players.size;
    this._countEl.textContent = `${count} PLAYER${count !== 1 ? 'S' : ''}`;

    this._listEl.innerHTML = '';

    for (const [id, player] of this._players) {
      const isLocal = id === this._localId;
      const hex = '#' + ((player.color >>> 0) & 0xffffff).toString(16).padStart(6, '0');

      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex', 'align-items:center', 'justify-content:flex-end', 'gap:7px',
        `opacity:${isLocal ? '1' : '0.72'}`,
      ].join(';');

      // Hole badge
      const holeEl = document.createElement('span');
      holeEl.style.cssText = [
        'font-size:clamp(7px,1.8vw,9px)', 'letter-spacing:1px',
        'color:rgba(255,255,255,0.28)', 'min-width:20px', 'text-align:right',
      ].join(';');
      holeEl.textContent = `H${player.hole}`;

      // Name
      const nameEl = document.createElement('span');
      nameEl.style.cssText = [
        'font-size:clamp(9px,2.2vw,11px)', 'letter-spacing:1px',
        `color:${hex}`,
        'max-width:100px', 'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
      ].join(';');
      nameEl.textContent = (player.name || id).toUpperCase();

      // Color dot
      const dot = document.createElement('span');
      dot.style.cssText = [
        'width:6px', 'height:6px', 'border-radius:50%',
        `background:${hex}`, `box-shadow:0 0 5px ${hex}`,
        'display:inline-block', 'flex-shrink:0',
      ].join(';');

      row.appendChild(holeEl);
      row.appendChild(nameEl);
      row.appendChild(dot);
      this._listEl.appendChild(row);
    }
  }

  dispose() {
    this._el?.parentNode?.removeChild(this._el);
  }
}
