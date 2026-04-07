// ============================================================
// ScoreboardUI.js — between-hole and end-game scoreboard
// Columns: PLAYER | H1..HN | STROKES | TIME
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

    this._btnNext.addEventListener('click', () => {
      eventBus.emit(Events.NEXT_HOLE);
    });
  }

  show(isGameOver = false) {
    if (!this._overlay) return;
    this._title.textContent = isGameOver ? 'GAME OVER' : 'HOLE COMPLETE';
    this._btnNext.textContent = isGameOver ? 'PLAY AGAIN' : 'NEXT HOLE →';
    this._renderTable(isGameOver);
    this._overlay.style.display = 'flex';
  }

  hide() {
    if (this._overlay) this._overlay.style.display = 'none';
  }

  _renderTable(isGameOver) {
    const players = gameState.players;
    const holeCount = gameState.currentHole + 1;

    // Header
    let headerHTML = '<th>PLAYER</th>';
    for (let h = 0; h < holeCount; h++) headerHTML += `<th>H${h + 1}</th>`;
    headerHTML += '<th>STROKES</th><th>TIME</th>';
    this._header.innerHTML = headerHTML;

    // Sort by total strokes, then total time
    const sorted = [...players].sort((a, b) => {
      const sd = gameState.totalStrokes(a.id) - gameState.totalStrokes(b.id);
      if (sd !== 0) return sd;
      return gameState.totalTime(a.id) - gameState.totalTime(b.id);
    });

    let bodyHTML = '';
    for (const player of sorted) {
      const colorHex = '#' + (player.color || 0xffffff).toString(16).padStart(6, '0');
      bodyHTML += `<tr>`;
      bodyHTML += `<td style="color:${colorHex}">${player.name}</td>`;
      for (let h = 0; h < holeCount; h++) {
        bodyHTML += `<td>${player.strokes[h] ?? '—'}</td>`;
      }
      bodyHTML += `<td style="font-weight:bold">${gameState.totalStrokes(player.id) || '—'}</td>`;
      bodyHTML += `<td style="color:rgba(160,210,255,0.8)">${this._formatTime(gameState.totalTime(player.id))}</td>`;
      bodyHTML += `</tr>`;
    }
    this._body.innerHTML = bodyHTML;
  }

  _formatTime(ms) {
    if (!ms) return '—';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    return `${m}:${String(rem).padStart(2, '0')}`;
  }
}
