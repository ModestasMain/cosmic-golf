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
    this._globalEntries = null;
    this._isGameOver = false;
    this._globalSection = null;

    this._btnNext.addEventListener('click', () => {
      eventBus.emit(Events.NEXT_HOLE);
    });
  }

  setServerLeaderboard(entries) {
    this._serverEntries = Array.isArray(entries) ? entries : null;
  }

  setGlobalLeaderboard(entries) {
    this._globalEntries = Array.isArray(entries) ? entries : null;
    if (this._isGameOver && this._overlay?.style.display !== 'none') {
      this._renderGlobalSection(this._globalEntries);
    }
  }

  show(isGameOver = false) {
    if (!this._overlay) return;
    this._isGameOver = isGameOver;
    this._title.textContent = isGameOver ? 'GAME OVER' : 'HOLE COMPLETE';
    this._btnNext.textContent = isGameOver ? 'PLAY AGAIN' : 'NEXT HOLE →';
    this._renderTable(isGameOver);
    if (isGameOver) {
      this._renderGlobalSection(this._globalEntries);
    } else {
      this._clearGlobalSection();
    }
    this._overlay.style.display = 'flex';
  }

  hide() {
    if (!this._overlay) return;
    this._isGameOver = false;
    this._clearGlobalSection();
    this._overlay.style.display = 'none';
  }

  _renderGlobalSection(entries) {
    this._clearGlobalSection();

    const section = document.createElement('div');
    section.id = 'global-lb-section';
    section.style.cssText = [
      'margin-top:16px',
      'padding-top:14px',
      'border-top:1px solid rgba(100,180,255,0.2)',
      'width:100%',
      'max-height:260px',
      'overflow-y:auto',
    ].join(';');

    const heading = document.createElement('div');
    heading.style.cssText = 'text-align:center;letter-spacing:3px;font-size:11px;color:rgba(255,220,100,0.85);margin-bottom:10px;';
    heading.textContent = '✦ GLOBAL TOP 10 ✦';
    section.appendChild(heading);

    if (!entries || entries.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'text-align:center;color:rgba(255,255,255,0.4);font-size:11px;padding:8px 0;';
      msg.textContent = entries === null ? 'Loading...' : "No entries yet — you're first!";
      section.appendChild(msg);
    } else {
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';

      const thead = document.createElement('thead');
      thead.innerHTML = `<tr>
        <th style="text-align:left;color:rgba(160,210,255,0.55);padding:2px 6px;font-weight:normal;font-size:10px;">RANK</th>
        <th style="text-align:left;color:rgba(160,210,255,0.55);padding:2px 6px;font-weight:normal;font-size:10px;">PLAYER</th>
        <th style="text-align:right;color:rgba(160,210,255,0.55);padding:2px 6px;font-weight:normal;font-size:10px;">STROKES</th>
        <th style="text-align:right;color:rgba(160,210,255,0.55);padding:2px 6px;font-weight:normal;font-size:10px;">TIME</th>
      </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const medals = ['🥇', '🥈', '🥉'];
      entries.forEach((e, i) => {
        const isMe = this.sessionId && e.sessionId === this.sessionId;
        const tr = document.createElement('tr');
        tr.style.cssText = isMe
          ? 'background:rgba(100,180,255,0.12);border:1px solid rgba(100,180,255,0.25);'
          : (i % 2 === 1 ? 'background:rgba(255,255,255,0.03);' : '');

        const rankColors = ['rgba(255,210,0,0.9)', 'rgba(200,200,200,0.8)', 'rgba(200,140,80,0.8)'];
        const rankColor = rankColors[i] ?? 'rgba(160,210,255,0.6)';
        const rankText  = medals[i] ?? `${i + 1}`;

        tr.innerHTML = `
          <td style="padding:4px 6px;color:${rankColor};">${rankText}</td>
          <td style="padding:4px 6px;">${isMe ? e.name + ' <span style="font-size:9px;opacity:0.7">(YOU)</span>' : e.name}</td>
          <td style="padding:4px 6px;text-align:right;font-weight:bold;">${e.totalStrokes ?? '—'}</td>
          <td style="padding:4px 6px;text-align:right;color:rgba(160,210,255,0.8);">${leaderboardStore.formatTime(e.totalTime)}</td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      section.appendChild(table);
    }

    this._overlay.insertBefore(section, this._btnNext);
    this._globalSection = section;
  }

  _clearGlobalSection() {
    if (this._globalSection) {
      this._globalSection.remove();
      this._globalSection = null;
    }
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
