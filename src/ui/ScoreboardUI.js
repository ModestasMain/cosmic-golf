// ============================================================
// ScoreboardUI.js — between-hole and end-game scoreboard
// Shows per-player ready checkmarks and 5s next-hole countdown
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class ScoreboardUI {
  constructor() {
    this._overlay   = document.getElementById('scoreboard-overlay');
    this._title     = document.getElementById('scoreboard-title');
    this._header    = document.getElementById('scoreboard-header');
    this._body      = document.getElementById('scoreboard-body');
    this._btnNext   = document.getElementById('btn-next-hole');

    // Countdown label (injected below button)
    this._countdownEl = document.createElement('div');
    this._countdownEl.style.cssText = [
      'font-size:11px', 'letter-spacing:3px',
      'color:rgba(160,210,255,0.45)', 'text-align:center',
      'margin-top:6px', 'min-height:16px',
    ].join(';');
    this._btnNext.insertAdjacentElement('afterend', this._countdownEl);

    // Ready player list (injected below countdown)
    this._readyEl = document.createElement('div');
    this._readyEl.style.cssText = [
      'display:flex', 'flex-wrap:wrap', 'gap:8px',
      'justify-content:center', 'margin-top:8px',
    ].join(';');
    this._countdownEl.insertAdjacentElement('afterend', this._readyEl);

    this._btnNext.addEventListener('click', () => {
      eventBus.emit(Events.NEXT_HOLE_READY, { playerId: gameState.players[0]?.id });
    });
  }

  show(isGameOver = false) {
    if (!this._overlay) return;

    this._title.textContent = isGameOver ? 'GAME OVER' : 'HOLE COMPLETE';
    this._btnNext.textContent = isGameOver ? 'PLAY AGAIN' : 'NEXT HOLE';
    this._countdownEl.textContent = isGameOver ? '' : 'AUTO-ADVANCE IN 5...';
    this._readyEl.innerHTML = '';

    this._renderTable(isGameOver);
    this._overlay.style.display = 'flex';
  }

  hide() {
    if (this._overlay) this._overlay.style.display = 'none';
  }

  /** Called each frame with seconds remaining (1-5) */
  updateCountdown(seconds) {
    if (this._countdownEl) {
      this._countdownEl.textContent = seconds > 0 ? `AUTO-ADVANCE IN ${seconds}...` : '';
    }
  }

  /** Mark a player as ready with a colored tick badge */
  markReady(playerId) {
    const player = gameState.players.find(p => p.id === playerId);
    const name = player?.name || playerId;
    const color = player?.color ?? 0xffffff;
    const hex = '#' + (color >>> 0).toString(16).padStart(6, '0');

    // Avoid duplicate badges
    if (this._readyEl.querySelector(`[data-pid="${playerId}"]`)) return;

    const badge = document.createElement('div');
    badge.dataset.pid = playerId;
    badge.style.cssText = [
      'display:flex', 'align-items:center', 'gap:5px',
      'background:rgba(255,255,255,0.06)', 'border-radius:6px',
      'padding:4px 10px',
      `border:1px solid ${hex}44`,
      'font-size:10px', 'letter-spacing:2px',
      `color:${hex}`,
    ].join(';');
    badge.innerHTML = `<span style="color:#44ff88;font-size:12px">✓</span> ${name}`;
    this._readyEl.appendChild(badge);
  }

  _renderTable(isGameOver) {
    const players = gameState.players;
    const holeCount = gameState.currentHole + 1; // holes completed so far

    // Build header: PLAYER | H1 | H2 ... | TOTAL
    let headerHTML = '<th>PLAYER</th>';
    for (let h = 0; h < holeCount; h++) {
      headerHTML += `<th>H${h + 1}</th>`;
    }
    headerHTML += '<th>TOTAL</th>';
    this._header.innerHTML = headerHTML;

    // Build rows
    let bodyHTML = '';
    for (const player of players) {
      const colorHex = '#' + (player.color || 0xffffff).toString(16).padStart(6, '0');
      bodyHTML += `<tr>`;
      bodyHTML += `<td style="color:${colorHex}">${player.name}</td>`;
      for (let h = 0; h < holeCount; h++) {
        const s = player.strokes[h] || '—';
        bodyHTML += `<td>${s}</td>`;
      }
      bodyHTML += `<td style="font-weight:bold">${gameState.totalStrokes(player.id) || '—'}</td>`;
      bodyHTML += `</tr>`;
    }
    this._body.innerHTML = bodyHTML;
  }
}
