// ============================================================
// DailyOverlay.js — shown after sinking the Daily Hole.
// Submits the player's score and renders the global top-100 board
// with the player's row highlighted. Sits above ScoreboardUI.
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { submitDailyScore, fetchDailyBoard, todayUTC } from '../systems/DailyClient.js';
import { getDailyTheme } from '../systems/HoleGenerator.js';

function fmtTime(ms) {
  if (!ms || ms < 0) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export class DailyOverlay {
  constructor() {
    this._el = this._build();
    document.body.appendChild(this._el);

    // Daily is a single hole — show on sink (HOLE_COMPLETE), don't wait for GAME_COMPLETE
    // (which only fires after clicking "continue" on the normal scoreboard, which we suppress).
    eventBus.on(Events.HOLE_COMPLETE, () => {
      if (!gameState.isDailyChallenge) return;
      // Let scoreboard-side bookkeeping (_saveScore) run first
      setTimeout(() => this._handleCompletion(), 50);
    });

    eventBus.on(Events.NEXT_HOLE, () => this.hide());
    eventBus.on('game:restart', () => this.hide());
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'cg-daily-overlay';
    root.style.cssText = [
      'position:fixed','inset:0','z-index:60','display:none',
      'flex-direction:column','align-items:center','justify-content:flex-start',
      'padding:clamp(24px,4vw,48px) clamp(16px,3vw,32px)',
      'background:radial-gradient(circle at 50% 30%, rgba(255,210,74,0.12), transparent 42%),linear-gradient(180deg,rgba(7,4,18,0.96),rgba(3,2,10,0.98))',
      'backdrop-filter:blur(8px)','-webkit-backdrop-filter:blur(8px)',
      'pointer-events:auto','overflow-y:auto',
      "font-family:'Inter Tight',sans-serif",
    ].join(';');

    root.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:clamp(9px,1.2vw,11px);letter-spacing:3px;color:rgba(255,210,74,0.7);text-transform:uppercase;margin-bottom:6px;">Daily Hole · <span id="cg-daily-date">—</span></div>
      <h2 style="font-family:'Orbitron',sans-serif;font-size:clamp(22px,4.4vw,46px);color:#fff;letter-spacing:0.16em;margin-bottom:6px;text-transform:uppercase;text-shadow:0 0 24px rgba(255,210,74,0.26);">COSMIC DAILY</h2>
      <div id="cg-daily-result" style="font-family:Georgia,serif;font-size:clamp(20px,4vw,42px);color:#ffd24a;letter-spacing:0.06em;margin-bottom:20px;text-transform:uppercase;text-shadow:0 0 18px rgba(255,210,74,0.32);">—</div>
      <div id="cg-daily-rank" style="font-family:'Orbitron',sans-serif;font-size:clamp(11px,1.6vw,14px);color:rgba(255,255,255,0.9);letter-spacing:0.14em;margin-bottom:16px;text-transform:uppercase;"></div>
      <div id="cg-daily-board" style="width:min(640px,calc(100vw - 32px));max-height:50vh;overflow-y:auto;border:1px solid rgba(122,76,255,0.4);border-radius:clamp(14px,2vw,20px);background:linear-gradient(180deg,rgba(15,9,35,0.85),rgba(8,5,20,0.8));padding:clamp(8px,1.4vw,14px);box-shadow:0 20px 70px rgba(3,2,10,0.5);"></div>
      <div id="cg-daily-actions" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:18px;"></div>
    `;

    const actions = root.querySelector('#cg-daily-actions');

    const shareBtn = document.createElement('button');
    shareBtn.style.cssText = this._btnStyle('#ffd24a', 'rgba(255,210,74,0.6)');
    shareBtn.textContent = 'COPY SHARE LINK';
    shareBtn.addEventListener('click', () => this._share());
    actions.appendChild(shareBtn);

    const tryAgainBtn = document.createElement('button');
    tryAgainBtn.style.cssText = this._btnStyle('#e4d9ff', 'rgba(153,110,255,0.6)');
    tryAgainBtn.textContent = 'TRY AGAIN';
    tryAgainBtn.addEventListener('click', () => {
      this.hide();
      gameState.leaderboardSessionId = null;
      eventBus.emit('game:restart');
    });
    actions.appendChild(tryAgainBtn);

    const exitBtn = document.createElement('button');
    exitBtn.style.cssText = this._btnStyle('rgba(240,236,255,0.9)', 'rgba(132,92,255,0.52)');
    exitBtn.textContent = 'FREE PLAY';
    exitBtn.addEventListener('click', () => {
      gameState.clearChallenge();
      gameState.leaderboardSessionId = null;
      this.hide();
      eventBus.emit('game:freeplay');
    });
    actions.appendChild(exitBtn);

    this._shareBtn = shareBtn;
    return root;
  }

  _btnStyle(color, border) {
    return [
      'border:1px solid ' + border,
      'border-radius:clamp(11px,1.6vw,14px)',
      'padding:clamp(10px,1.4vw,12px) clamp(14px,2.4vw,22px)',
      'background:linear-gradient(180deg,rgba(18,11,44,0.92),rgba(9,5,24,0.9))',
      'color:' + color,
      "font-family:'Orbitron',sans-serif",
      'font-size:clamp(9px,1.2vw,11px)',
      'letter-spacing:0.14em','text-transform:uppercase','cursor:pointer',
      'box-shadow:0 14px 36px rgba(3,2,10,0.34)',
    ].join(';');
  }

  async _handleCompletion() {
    const player = gameState.players[0];
    if (!player) return;
    const strokes = (player.strokes[0] || 0);
    const time = (player.holeTimes[0] || 0);
    const date = (gameState.challengeSeed || '').replace(/^DAILY-/, '') || todayUTC();

    const theme = getDailyTheme(date);
    document.getElementById('cg-daily-date').textContent = `${date} · ${theme.label}`;
    document.getElementById('cg-daily-result').textContent = `${strokes} ${strokes === 1 ? 'STROKE' : 'STROKES'} · ${fmtTime(time)}`;
    document.getElementById('cg-daily-rank').textContent = 'SUBMITTING…';
    this._renderBoard([], null);
    this.show();

    const result = await submitDailyScore({ date, name: player.name, strokes, time });
    let board = result?.entries;
    if (!board) {
      const fetched = await fetchDailyBoard(date);
      board = fetched.entries || [];
    }
    const normalized = (player.name || '').toLowerCase().trim();
    const rank = board.findIndex(e => (e.name || '').toLowerCase().trim() === normalized) + 1;

    const rankEl = document.getElementById('cg-daily-rank');
    if (result?.improved === false) {
      rankEl.textContent = rank > 0 ? `YOUR BEST: #${rank} · NOT IMPROVED` : 'NOT IMPROVED';
    } else if (rank > 0) {
      rankEl.textContent = `YOU RANKED #${rank} OF ${board.length}`;
    } else {
      rankEl.textContent = `SUBMITTED · ${board.length} PLAYERS TODAY`;
    }
    this._renderBoard(board, normalized);
    this._currentShare = { date, strokes, time, rank, total: board.length };
  }

  _renderBoard(entries, myNameKey) {
    const el = document.getElementById('cg-daily-board');
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(255,255,255,0.5);text-align:center;padding:18px;">Be the first to post a score.</div>`;
      return;
    }
    const rows = entries.map((e, i) => {
      const mine = myNameKey && (e.name || '').toLowerCase().trim() === myNameKey;
      const bg = mine ? 'background:rgba(255,210,74,0.14);border-left:3px solid #ffd24a;' : 'background:transparent;border-left:3px solid transparent;';
      const col = mine ? '#ffe8a8' : 'rgba(240,236,255,0.9)';
      return `<div style="display:grid;grid-template-columns:44px 1fr 60px 70px;gap:10px;padding:8px 10px;border-bottom:1px solid rgba(164,132,255,0.1);align-items:center;${bg}font-family:'JetBrains Mono',monospace;font-size:clamp(10px,1.2vw,12px);color:${col};">
        <span style="font-family:'Orbitron',sans-serif;color:${mine ? '#ffd24a' : 'rgba(191,152,255,0.8)'};">#${i + 1}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase;letter-spacing:0.08em;">${this._esc(e.name || 'PLAYER')}</span>
        <span style="text-align:right;">${e.strokes}</span>
        <span style="text-align:right;opacity:0.7;">${fmtTime(e.time)}</span>
      </div>`;
    }).join('');
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:44px 1fr 60px 70px;gap:10px;padding:0 10px 8px;font-family:'Orbitron',sans-serif;font-size:clamp(8px,1vw,10px);letter-spacing:0.14em;color:rgba(191,152,255,0.8);text-transform:uppercase;border-bottom:1px solid rgba(122,76,255,0.3);margin-bottom:4px;">
        <span>RANK</span><span>PLAYER</span><span style="text-align:right;">STR</span><span style="text-align:right;">TIME</span>
      </div>
      ${rows}
    `;
  }

  _esc(s) {
    return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  }

  async _share() {
    const s = this._currentShare;
    if (!s) return;
    const url = `${window.location.origin}/`;
    const txt = s.rank
      ? `I scored ${s.strokes} on Cosmic Daily (${s.date}) — rank #${s.rank}/${s.total}. Beat me: ${url}`
      : `I played Cosmic Daily (${s.date}) in ${s.strokes} strokes. Try it: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ text: txt, url });
      } else {
        await navigator.clipboard.writeText(txt);
        this._shareBtn.textContent = 'COPIED ✓';
        setTimeout(() => { this._shareBtn.textContent = 'COPY SHARE LINK'; }, 1800);
      }
    } catch {}
  }

  show() { this._el.style.display = 'flex'; }
  hide() { this._el.style.display = 'none'; }
}
