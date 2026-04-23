import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { leaderboardStore } from '../core/LeaderboardStore.js';
import { getScoreResult } from './ScoreCallouts.js';

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
    this._subtitle  = document.getElementById('scoreboard-subtitle');
    this._header    = document.getElementById('scoreboard-header');
    this._body      = document.getElementById('scoreboard-body');
    this._btnNext   = document.getElementById('btn-next-hole');
    this.sessionId  = null;
    this._serverEntries = null;
    this._globalEntries = null;
    this._isGameOver = false;
    this._globalSection = null;
    this._shareSection = null;
    this._hiddenUiStates = null;

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
    if (isGameOver) {
      this._title.textContent = 'VOID RUN COMPLETE';
      this._title.style.color = '#f7f4ff';
      this._title.style.textShadow = '0 0 18px rgba(154, 126, 255, 0.2)';
      if (this._subtitle) {
        this._subtitle.textContent = 'FINAL STANDINGS';
        this._subtitle.style.display = 'flex';
        this._subtitle.style.color = 'rgba(191, 152, 255, 0.9)';
        this._subtitle.style.textShadow = 'none';
      }
    } else {
      this._title.textContent = 'HOLE COMPLETE';
      this._title.style.color = '#f7f4ff';
      this._title.style.textShadow = '0 0 18px rgba(154, 126, 255, 0.2)';
      if (this._subtitle) {
        const strokes = gameState.players[0]?.strokes?.[gameState.currentHole] ?? gameState.currentStrokes;
        const bossFinale = this._isWorldEaterHole();
        const result = bossFinale
          ? { headline: 'WORLDEATER DEFEATED!', color: '#9df6ff', glow: '#54dfff' }
          : getScoreResult(strokes);
        this._subtitle.textContent = result.headline;
        this._subtitle.style.display = 'flex';
        this._subtitle.style.color = result.color;
        this._subtitle.style.textShadow = `0 0 12px ${result.glow}aa`;
      }
    }
    this._btnNext.textContent = isGameOver ? 'PLAY AGAIN' : 'NEXT HOLE →';
    this._renderTable(isGameOver);
    if (isGameOver) {
      this._renderGlobalSection(this._globalEntries);
    } else {
      this._clearGlobalSection();
    }
    this._renderShareSection(isGameOver);
    this._hideExternalUI();
    this._overlay.style.display = 'flex';
  }

  hide() {
    if (!this._overlay) return;
    this._isGameOver = false;
    this._clearGlobalSection();
    this._clearShareSection();
    this._overlay.style.display = 'none';
    this._restoreExternalUI();
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

    this._overlay.insertBefore(section, this._shareSection || this._btnNext);
    this._globalSection = section;
  }

  _clearGlobalSection() {
    if (this._globalSection) {
      this._globalSection.remove();
      this._globalSection = null;
    }
  }

  _renderShareSection(isGameOver) {
    this._clearShareSection();

    const data = this._getShareData(isGameOver);
    if (!data) return;

    const section = document.createElement('section');
    section.id = 'score-share-card';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'score-share-eyebrow';
    eyebrow.textContent = data.eyebrow;

    const headline = document.createElement('div');
    headline.className = 'score-share-headline';
    headline.textContent = data.headline;

    const meta = document.createElement('div');
    meta.className = 'score-share-meta';
    meta.textContent = data.meta;

    const seed = document.createElement('div');
    seed.className = 'score-share-seed';
    seed.textContent = data.seedLabel;

    const actions = document.createElement('div');
    actions.className = 'score-share-actions';

    const copyLink = document.createElement('button');
    copyLink.type = 'button';
    copyLink.className = 'score-share-btn';
    copyLink.textContent = 'COPY CHALLENGE LINK';
    copyLink.addEventListener('click', () => this._copyShareText(data.url, copyLink, data.url));

    const copyResult = document.createElement('button');
    copyResult.type = 'button';
    copyResult.className = 'score-share-btn score-share-btn-accent';
    copyResult.textContent = 'COPY RESULT';
    copyResult.addEventListener('click', () => this._copyShareText(data.text, copyResult, data.text));

    actions.appendChild(copyLink);
    actions.appendChild(copyResult);

    const fallback = document.createElement('textarea');
    fallback.className = 'score-share-fallback';
    fallback.readOnly = true;
    fallback.setAttribute('aria-label', 'Share text');

    section.appendChild(eyebrow);
    section.appendChild(headline);
    section.appendChild(meta);
    section.appendChild(seed);
    section.appendChild(actions);
    section.appendChild(fallback);

    this._overlay.insertBefore(section, this._btnNext);
    this._shareSection = section;
  }

  _clearShareSection() {
    if (this._shareSection) {
      this._shareSection.remove();
      this._shareSection = null;
    }
  }

  _getShareData(isGameOver) {
    const player = gameState.players[0];
    if (!player) return null;

    const totalStrokes = gameState.totalStrokes(player.id);
    const totalTime = gameState.totalTime(player.id);
    const timeText = leaderboardStore.formatTime(totalTime);
    const url = this._buildChallengeUrl();
    const seed = this._challengeSeed();
    const name = player.name || 'PLAYER';
    const bossChallenge = gameState.isBossRoom || gameState.isBossChallenge;

    if (bossChallenge) {
      const text = `Cosmic Golf: WORLDEATER DEFEATED! Beat the boss: ${url}`;
      return {
        eyebrow: 'BOSS CHALLENGE',
        headline: 'WORLDEATER DEFEATED!',
        meta: `${name} · ${totalStrokes || gameState.currentStrokes} strokes · ${timeText}`,
        seedLabel: 'SOLO BOSS LINK',
        url,
        text,
      };
    }

    if (isGameOver) {
      const text = `Cosmic Golf: ${totalStrokes} strokes in ${timeText}. Beat my run: ${url}`;
      return {
        eyebrow: 'SHARE RUN',
        headline: `${totalStrokes} STROKES`,
        meta: `${name} · ${timeText} · ${gameState.totalHoles} holes`,
        seedLabel: `CHALLENGE SEED ${seed}`,
        url,
        text,
      };
    }

    const holeIndex = gameState.currentHole;
    const strokes = player.strokes?.[holeIndex] ?? gameState.currentStrokes;
    const result = this._isWorldEaterHole()
      ? { headline: 'WORLDEATER DEFEATED!' }
      : getScoreResult(strokes);
    const text = `Cosmic Golf: ${result.headline} on Hole ${holeIndex + 1}. ${totalStrokes} strokes so far. Beat this seed: ${url}`;
    return {
      eyebrow: 'SHARE HOLE',
      headline: result.headline,
      meta: `${name} · Hole ${holeIndex + 1} · ${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}`,
      seedLabel: `CHALLENGE SEED ${seed}`,
      url,
      text,
    };
  }

  _challengeSeed() {
    if (gameState.isBossRoom || gameState.isBossChallenge) return 'BOSS';
    if (gameState.challengeSeed) return gameState.challengeSeed;
    if (gameState.roomCode) return gameState.roomCode;
    return String(gameState.sessionSeed >>> 0);
  }

  _buildChallengeUrl() {
    const url = new URL(window.location.pathname || '/', window.location.origin);
    url.searchParams.set('challenge', this._challengeSeed());
    return url.toString();
  }

  async _copyShareText(text, button, fallbackText) {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'COPIED';
    } catch {
      button.textContent = 'SELECT TEXT';
      const fallback = this._shareSection?.querySelector('.score-share-fallback');
      if (fallback) {
        fallback.value = fallbackText;
        fallback.style.display = 'block';
        fallback.focus();
        fallback.select();
      }
    }
    setTimeout(() => {
      button.textContent = original;
    }, 1600);
  }

  _hideExternalUI() {
    const ids = ['event-hud', 'settings-btn', 'settings-panel'];
    this._hiddenUiStates = new Map();
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      this._hiddenUiStates.set(id, {
        display: el.style.display,
        visibility: el.style.visibility,
      });
      el.style.display = 'none';
      el.style.visibility = 'hidden';
    }
  }

  _restoreExternalUI() {
    if (!this._hiddenUiStates) return;
    for (const [id, state] of this._hiddenUiStates.entries()) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.style.display = state.display;
      el.style.visibility = state.visibility;
    }
    this._hiddenUiStates = null;
  }

  _isWorldEaterHole() {
    return gameState.isBossRoom
      || gameState.isBossChallenge
      || (gameState.totalHoles === 10 && gameState.currentHole === 9);
  }

  _renderTable(isGameOver) {
    const holeCount = gameState.totalHoles;
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

      const rowStyle = [
        isCurrentPlayer
          ? 'background:linear-gradient(90deg, rgba(23,36,88,0.92), rgba(9,17,54,0.92)); box-shadow:inset 0 0 0 1px rgba(59,194,255,0.72), 0 0 0 1px rgba(59,194,255,0.22);'
          : 'background:rgba(13,8,28,0.72);',
      ].join(' ');

      const rankBadge = this._rankBadge(i + 1);

      bodyHTML += `<tr style="${rowStyle}">`;
      bodyHTML += `<td style="color:rgba(160,210,255,0.7)">${rankBadge}</td>`;
      bodyHTML += `<td style="text-align:left;font-weight:700;letter-spacing:0.02em;">${this._playerCell(entry, isCurrentPlayer)}</td>`;
      for (let h = 0; h < holeCount; h++) {
        bodyHTML += `<td style="${this._holeCellStyle(h, isCurrentPlayer)}">${entry.strokes?.[h] ?? '—'}</td>`;
      }
      bodyHTML += `<td style="font-weight:800;color:${isCurrentPlayer ? '#3bc2ff' : '#f7f4ff'}">${entry.totalStrokes || '—'}</td>`;
      bodyHTML += `<td style="color:${isCurrentPlayer ? '#3bc2ff' : 'rgba(160,210,255,0.8)'}">${leaderboardStore.formatTime(entry.totalTime)}</td>`;
      bodyHTML += '</tr>';
    }

    if (player && !playerShown) {
      const holesCompleted = player.strokes.filter(v => v != null).length;
      const sorted = [...top10, { holesCompleted, totalStrokes: playerTotalStrokes, totalTime: playerTotalTime }].sort(sortEntries);
      const rank = sorted.findIndex(e => e.holesCompleted === holesCompleted && e.totalStrokes === playerTotalStrokes && e.totalTime === playerTotalTime) + 1;

      bodyHTML += `<tr style="background:linear-gradient(90deg, rgba(23,36,88,0.92), rgba(9,17,54,0.92)); box-shadow:inset 0 0 0 1px rgba(59,194,255,0.72), 0 0 0 1px rgba(59,194,255,0.22);">`;
      bodyHTML += `<td style="color:rgba(160,210,255,0.7)">${this._rankBadge(rank)}</td>`;
      bodyHTML += `<td style="text-align:left;font-weight:700;letter-spacing:0.02em;color:#3bc2ff;">${this._playerCell(player, true)}</td>`;
      for (let h = 0; h < holeCount; h++) {
        bodyHTML += `<td style="${this._holeCellStyle(h, true)}">${player.strokes[h] ?? '—'}</td>`;
      }
      bodyHTML += `<td style="font-weight:800;color:#3bc2ff">${playerTotalStrokes || '—'}</td>`;
      bodyHTML += `<td style="color:#3bc2ff">${leaderboardStore.formatTime(playerTotalTime)}</td>`;
      bodyHTML += '</tr>';
    }

    this._body.innerHTML = bodyHTML;
  }

  _holeCellStyle(holeIndex, isCurrentPlayer) {
    const isCurrentHole = holeIndex === gameState.currentHole;
    if (!isCurrentHole) return '';
    return isCurrentPlayer
      ? 'background:rgba(144, 74, 255, 0.26); box-shadow:inset 0 0 0 1px rgba(188, 126, 255, 0.55);'
      : 'background:rgba(128, 74, 255, 0.16); box-shadow:inset 0 0 0 1px rgba(164, 102, 255, 0.35);';
  }

  _playerCell(entry, isCurrentPlayer) {
    const color = isCurrentPlayer ? '#3bc2ff' : '#f7f4ff';
    const marker = isCurrentPlayer ? '<span style="font-size:10px;opacity:0.72">(YOU)</span>' : '';
    return `<span style="display:inline-flex;align-items:center;gap:10px;color:${color};">
      <span style="width:18px;height:18px;border-radius:50%;display:inline-grid;place-items:center;background:radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), ${isCurrentPlayer ? 'rgba(136,71,255,0.95)' : 'rgba(70,38,150,0.92)'} 42%, rgba(18,10,48,0.98) 100%);box-shadow:0 0 10px ${isCurrentPlayer ? 'rgba(132,92,255,0.52)' : 'rgba(132,92,255,0.2)'};font-size:11px;">✦</span>
      <span>${entry.name}${marker ? ' ' + marker : ''}</span>
    </span>`;
  }

  _rankBadge(rank) {
    const themes = {
      1: { bg: 'linear-gradient(180deg, #ffdd71, #cc8a00)', glow: 'rgba(255,198,64,0.35)', fg: '#251200' },
      2: { bg: 'linear-gradient(180deg, #dbe4ff, #6e7b9f)', glow: 'rgba(196,208,255,0.28)', fg: '#162033' },
      3: { bg: 'linear-gradient(180deg, #ffb46a, #8b4d21)', glow: 'rgba(255,165,98,0.26)', fg: '#241108' },
    };
    const theme = themes[rank] ?? { bg: 'linear-gradient(180deg, #432c7a, #1f153d)', glow: 'rgba(122,76,255,0.18)', fg: '#b39cff' };
    return `<span style="display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:${theme.bg};color:${theme.fg};font-family:Orbitron,sans-serif;font-weight:800;font-size:13px;box-shadow:0 0 0 1px rgba(255,255,255,0.06), 0 0 12px ${theme.glow};">${rank}</span>`;
  }
}
