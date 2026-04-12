import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { leaderboardStore } from '../core/LeaderboardStore.js';
import { HOLE } from '../core/Constants.js';

function getHolesCompleted(entry) {
  if (entry.holesCompleted != null) return entry.holesCompleted;
  if (!entry.strokes) return 0;
  return entry.strokes.filter(v => v != null).length;
}

function sortEntries(a, b) {
  const hd = getHolesCompleted(b) - getHolesCompleted(a);
  if (hd !== 0) return hd;
  const sd = a.totalStrokes - b.totalStrokes;
  if (sd !== 0) return sd;
  return a.totalTime - b.totalTime;
}

export class ScoreboardUI {
  constructor() {
    this._overlay   = document.getElementById('scoreboard-overlay');
    this._title     = document.getElementById('scoreboard-title');
    this._header    = document.getElementById('scoreboard-header');
    this._body      = document.getElementById('scoreboard-body');
    this._btnNext   = document.getElementById('btn-next-hole');
    this.sessionId  = null;
    this._serverEntries = null;

    this._btnNext.addEventListener('click', () => {
      eventBus.emit(Events.NEXT_HOLE);
    });
  }

  setServerLeaderboard(entries) {
    this._serverEntries = Array.isArray(entries) ? entries : null;
  }

  show(isGameOver = false) {
    if (!this._overlay) return;
    this._title.textContent = isGameOver ? 'GAME OVER' : 'HOLE COMPLETE';
    this._btnNext.textContent = isGameOver ? 'PLAY AGAIN' : 'NEXT HOLE →';
    this._renderTable(isGameOver);
    this._overlay.style.display = 'flex';
  }

  hide() {
    if (!this._overlay) return;
    this._overlay.style.display = 'none';
  }

  _renderTable(isGameOver) {
    const holeCount = HOLE.COUNT;
    const player = gameState.players[0];
    const playerTotalStrokes = gameState.totalStrokes(player?.id);
    const playerTotalTime = gameState.totalTime(player?.id);

    let headerHTML = '<th>RANK</th><th>PLAYER</th>';
    for (let h = 0; h < holeCount; h++) headerHTML += `<th>H${h + 1}</th>`;
    headerHTML += '<th>STROKES</th><th>TIME</th>';
    this._header.innerHTML = headerHTML;

    const top10 = this._serverEntries
      ? [...this._serverEntries].sort(sortEntries).slice(0, 10)
      : leaderboardStore.load(gameState.roomCode).sort(sortEntries).slice(0, 10);

    let bodyHTML = '';
    let playerShown = false;

    for (let i = 0; i < top10.length; i++) {
      const entry = top10[i];
      const isCurrentPlayer = this.sessionId && entry.sessionId === this.sessionId;
      if (isCurrentPlayer) playerShown = true;

      const rowStyle = isCurrentPlayer
        ? 'background:rgba(100,180,255,0.12);border:1px solid rgba(100,180,255,0.3);'
        : (i % 2 === 1 ? 'background:rgba(255,255,255,0.03);' : '');

      bodyHTML += `<tr style="${rowStyle}">`;
      bodyHTML += `<td style="color:rgba(160,210,255,0.7)">${i + 1}</td>`;
      bodyHTML += `<td>${isCurrentPlayer ? entry.name + ' <span style="font-size:10px;opacity:0.7">(YOU)</span>' : entry.name}</td>`;
      for (let h = 0; h < holeCount; h++) {
        bodyHTML += `<td>${entry.strokes?.[h] ?? '—'}</td>`;
      }
      bodyHTML += `<td style="font-weight:bold">${entry.totalStrokes || '—'}</td>`;
      bodyHTML += `<td style="color:rgba(160,210,255,0.8)">${leaderboardStore.formatTime(entry.totalTime)}</td>`;
      bodyHTML += '</tr>';
    }

    if (player && !playerShown) {
      const holesCompleted = player.strokes.filter(v => v != null).length;
      const sorted = [...top10, { holesCompleted, totalStrokes: playerTotalStrokes, totalTime: playerTotalTime }].sort(sortEntries);
      const rank = sorted.findIndex(e => e.holesCompleted === holesCompleted && e.totalStrokes === playerTotalStrokes && e.totalTime === playerTotalTime) + 1;

      bodyHTML += `<tr style="border-top:2px solid rgba(100,180,255,0.3);background:rgba(100,180,255,0.12);">`;
      bodyHTML += `<td style="color:rgba(160,210,255,0.7)">${rank}</td>`;
      bodyHTML += `<td style="color:rgba(100,200,255,0.95)">${player.name} <span style="font-size:10px;opacity:0.7">(YOU)</span></td>`;
      for (let h = 0; h < holeCount; h++) {
        bodyHTML += `<td>${player.strokes[h] ?? '—'}</td>`;
      }
      bodyHTML += `<td style="font-weight:bold">${playerTotalStrokes || '—'}</td>`;
      bodyHTML += `<td style="color:rgba(160,210,255,0.8)">${leaderboardStore.formatTime(playerTotalTime)}</td>`;
      bodyHTML += '</tr>';
    }

    this._body.innerHTML = bodyHTML;
  }
}
