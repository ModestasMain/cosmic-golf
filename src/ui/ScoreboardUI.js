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

    const shareResult = document.createElement('button');
    shareResult.type = 'button';
    shareResult.className = 'score-share-btn score-share-btn-accent';
    shareResult.textContent = 'SHARE RESULTS';
    shareResult.addEventListener('click', () => this._shareResult(data, shareResult));

    actions.appendChild(shareResult);

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
    const isRoomChallenge = !!(gameState.roomCode && gameState.roomCode !== 'PUBLIC');
    const name = player.name || 'PLAYER';
    const bossChallenge = gameState.isBossRoom || gameState.isBossChallenge;

    if (bossChallenge) {
      const text = `Can you beat my score? ${url}`;
      return {
        eyebrow: 'SHARE RESULTS',
        headline: 'WORLDEATER DEFEATED!',
        meta: `${name} · ${totalStrokes || gameState.currentStrokes} strokes · ${timeText}`,
        seedLabel: 'SOLO BOSS LINK',
        url,
        text,
      };
    }

    if (isGameOver) {
      const text = `Can you beat my score? ${url}`;
      return {
        eyebrow: 'SHARE RESULTS',
        headline: `${totalStrokes} STROKES`,
        meta: `${name} · ${timeText} · ${gameState.totalHoles} holes`,
        seedLabel: isRoomChallenge ? `ROOM CODE ${seed}` : `CHALLENGE SEED ${seed}`,
        url,
        text,
      };
    }

    const holeIndex = gameState.currentHole;
    const strokes = player.strokes?.[holeIndex] ?? gameState.currentStrokes;
    const result = this._isWorldEaterHole()
      ? { headline: 'WORLDEATER DEFEATED!' }
      : getScoreResult(strokes);
    const text = `Can you beat my score? ${url}`;
    return {
      eyebrow: 'SHARE RESULTS',
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
    const roomCode = gameState.roomCode;
    if (roomCode && roomCode !== 'PUBLIC') {
      url.searchParams.set('room', roomCode);
    } else {
      url.searchParams.set('challenge', this._challengeSeed());
    }
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

  async _shareResult(data, button) {
    const original = button.textContent;
    const fallback = this._shareSection?.querySelector('.score-share-fallback');
    button.textContent = 'CREATING IMAGE';

    try {
      const imageBlob = await this._createShareImage(data);
      const textBlob = new Blob([data.text], { type: 'text/plain' });

      if (!navigator.clipboard?.write || !window.ClipboardItem) {
        throw new Error('Rich clipboard unavailable');
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': imageBlob,
          'text/plain': textBlob,
        }),
      ]);
      button.textContent = 'COPIED IMAGE + TEXT';
      if (fallback) fallback.style.display = 'none';
    } catch {
      button.textContent = 'COPIED TEXT';
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(data.text);
        } catch {
          button.textContent = 'SELECT TEXT';
        }
      } else {
        button.textContent = 'SELECT TEXT';
      }
      if (fallback) {
        fallback.value = data.text;
        fallback.style.display = 'block';
        fallback.focus();
        fallback.select();
      }
    }

    setTimeout(() => {
      button.textContent = original;
    }, 1900);
  }

  async _createShareImage(data) {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = document.createElement('canvas');
    const width = 1200;
    const height = 630;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    this._drawShareBackground(ctx, width, height);

    ctx.save();
    ctx.shadowColor = 'rgba(88, 44, 255, 0.42)';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = 'rgba(154, 112, 255, 0.72)';
    ctx.lineWidth = 3;
    this._roundRect(ctx, 64, 64, width - 128, height - 128, 34);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(191, 152, 255, 0.9)';
    ctx.font = '700 30px "JetBrains Mono", monospace';
    ctx.fillText('SHARE RESULTS', width / 2, 128);

    ctx.fillStyle = '#ffd24a';
    ctx.shadowColor = 'rgba(255, 210, 74, 0.38)';
    ctx.shadowBlur = 24;
    ctx.font = '800 76px Orbitron, sans-serif';
    ctx.fillText(data.headline, width / 2, 214);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(218, 232, 255, 0.76)';
    ctx.font = '700 28px "JetBrains Mono", monospace';
    ctx.fillText(data.meta.toUpperCase(), width / 2, 286);

    const player = gameState.players[0];
    const name = (player?.name || 'PLAYER').toUpperCase();
    const totalStrokes = gameState.totalStrokes(player?.id) || gameState.currentStrokes || 0;
    const totalTime = leaderboardStore.formatTime(gameState.totalTime(player?.id));

    const rowX = 118;
    const rowY = 334;
    const rowW = width - 236;
    const rowH = 140;

    ctx.save();
    const rowGradient = ctx.createLinearGradient(rowX, rowY, rowX + rowW, rowY);
    rowGradient.addColorStop(0, 'rgba(20, 34, 90, 0.94)');
    rowGradient.addColorStop(0.55, 'rgba(13, 11, 44, 0.96)');
    rowGradient.addColorStop(1, 'rgba(45, 21, 90, 0.94)');
    ctx.fillStyle = rowGradient;
    ctx.shadowColor = 'rgba(59, 194, 255, 0.28)';
    ctx.shadowBlur = 22;
    this._roundRect(ctx, rowX, rowY, rowW, rowH, 24);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(59, 194, 255, 0.62)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(96, 220, 255, 0.95)';
    ctx.font = '800 20px Orbitron, sans-serif';
    ctx.fillText('PLAYER', rowX + 34, rowY + 34);
    ctx.fillStyle = '#f7f4ff';
    ctx.font = '800 30px Orbitron, sans-serif';
    ctx.fillText(name, rowX + 34, rowY + 72);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd24a';
    ctx.font = '800 34px Orbitron, sans-serif';
    ctx.fillText(`${totalStrokes} STROKES`, rowX + rowW - 34, rowY + 45);
    ctx.fillStyle = 'rgba(218, 232, 255, 0.68)';
    ctx.font = '700 19px "JetBrains Mono", monospace';
    ctx.fillText(totalTime.toUpperCase(), rowX + rowW - 34, rowY + 78);

    const holeCount = Math.min(10, gameState.totalHoles || 10);
    const gap = 8;
    const stripX = rowX + 34;
    const stripY = rowY + 94;
    const stripW = rowW - 68;
    const cellW = (stripW - gap * (holeCount - 1)) / holeCount;
    const cellH = 34;

    for (let i = 0; i < holeCount; i++) {
      const x = stripX + i * (cellW + gap);
      const stroke = player?.strokes?.[i] ?? (i === gameState.currentHole ? gameState.currentStrokes : null);
      const isCurrent = i === gameState.currentHole;

      ctx.save();
      ctx.fillStyle = isCurrent ? 'rgba(144, 74, 255, 0.34)' : 'rgba(7, 12, 34, 0.66)';
      ctx.strokeStyle = isCurrent ? 'rgba(255, 210, 74, 0.62)' : 'rgba(96, 220, 255, 0.26)';
      ctx.lineWidth = 1.5;
      this._roundRect(ctx, x, stripY, cellW, cellH, 10);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(191, 152, 255, 0.9)';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText(`H${i + 1}`, x + cellW / 2, stripY + 10);
      ctx.fillStyle = stroke == null ? 'rgba(218, 232, 255, 0.36)' : '#f7f4ff';
      ctx.font = '800 18px Orbitron, sans-serif';
      ctx.fillText(stroke == null ? '-' : String(stroke), x + cellW / 2, stripY + 25);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(96, 220, 255, 0.82)';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText('CAN YOU BEAT MY SCORE?', width / 2, 516);

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Share image failed'));
      }, 'image/png');
    });
  }

  _drawShareBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#050210');
    gradient.addColorStop(0.42, '#12124a');
    gradient.addColorStop(1, '#27081f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const nebulaA = ctx.createRadialGradient(240, 160, 20, 240, 160, 420);
    nebulaA.addColorStop(0, 'rgba(101, 220, 255, 0.34)');
    nebulaA.addColorStop(0.45, 'rgba(84, 56, 255, 0.15)');
    nebulaA.addColorStop(1, 'rgba(84, 56, 255, 0)');
    ctx.fillStyle = nebulaA;
    ctx.fillRect(0, 0, width, height);

    const nebulaB = ctx.createRadialGradient(930, 430, 20, 930, 430, 460);
    nebulaB.addColorStop(0, 'rgba(255, 83, 215, 0.28)');
    nebulaB.addColorStop(0.5, 'rgba(122, 76, 255, 0.15)');
    nebulaB.addColorStop(1, 'rgba(122, 76, 255, 0)');
    ctx.fillStyle = nebulaB;
    ctx.fillRect(0, 0, width, height);

    let seed = 123456789;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < 240; i++) {
      const x = random() * width;
      const y = random() * height;
      const r = random() * 1.8 + 0.45;
      const alpha = random() * 0.68 + 0.24;
      ctx.fillStyle = `rgba(235, 245, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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

      const spacerCols = 4 + holeCount;
      bodyHTML += `<tr aria-hidden="true"><td colspan="${spacerCols}" style="padding:0;border:none;background:transparent;"><div style="height:18px;"></div></td></tr>`;
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
    return `<span style="display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:${theme.bg};color:${theme.fg};font-family:Orbitron,sans-serif;font-weight:800;font-size:10px;box-shadow:0 0 0 1px rgba(255,255,255,0.06), 0 0 10px ${theme.glow};">${rank}</span>`;
  }
}
