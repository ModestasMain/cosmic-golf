// ============================================================
// ScoreboardUI.js — between-hole and end-game scoreboard
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
      this.hide();
      eventBus.emit(Events.NEXT_HOLE);
    });
  }

  show(isGameOver = false) {
    if (!this._overlay) return;

    this._title.textContent = isGameOver ? 'GAME OVER' : 'HOLE COMPLETE';
    this._btnNext.textContent = isGameOver ? 'PLAY AGAIN' : 'NEXT HOLE';

    this._renderTable(isGameOver);
    this._overlay.style.display = 'flex';
  }

  hide() {
    if (this._overlay) this._overlay.style.display = 'none';
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
