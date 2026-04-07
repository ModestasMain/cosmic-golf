// ============================================================
// ScoreboardScene.js — manages scoreboard display between holes
// Next-hole coordination:
//   - Each player clicks "Next Hole" → emits NEXT_HOLE_READY (local id)
//   - main.js broadcasts that to peers; peers' MM re-emits NEXT_HOLE_READY
//   - When all players ready → NEXT_HOLE_ADVANCE → _advance()
//   - 5s wall-clock countdown → NEXT_HOLE_ADVANCE → _advance()
//   - _advance() is the only place that emits NEXT_HOLE (actual hole load)
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { ScoreboardUI } from '../ui/ScoreboardUI.js';

const NEXT_HOLE_TIMEOUT_MS = 5000;

export class ScoreboardScene {
  constructor() {
    this.ui = new ScoreboardUI();
    this._isGameOver = false;
    this._readyPlayers = new Set();
    this._countdownStart = null;
    this._countdownRaf = null;
    this._advanced = false;

    eventBus.on(Events.HOLE_COMPLETE, () => {
      this._isGameOver = false;
      this._cancelCountdown();
      this._readyPlayers = new Set();
      this._advanced = false;
      this.ui.show(false);
      this._startCountdown();
    });

    eventBus.on(Events.GAME_COMPLETE, () => {
      this._isGameOver = true;
      this._cancelCountdown();
      this._readyPlayers = new Set();
      this._advanced = false;
      this.ui.show(true);
    });

    // Button click (or "Play Again") — mark this player ready
    // main.js also listens to this to broadcast to peers
    eventBus.on(Events.NEXT_HOLE_READY, ({ playerId }) => {
      if (this._isGameOver) {
        // Game over: treat any click as restart
        this._cancelCountdown();
        this.ui.hide();
        eventBus.emit('game:restart');
        return;
      }
      this._markReady(playerId);
    });

    // All-clients-advance signal (from local all-ready check, local timer, or remote peer)
    eventBus.on(Events.NEXT_HOLE_ADVANCE, () => {
      this._advance();
    });
  }

  _cancelCountdown() {
    if (this._countdownRaf) {
      cancelAnimationFrame(this._countdownRaf);
      this._countdownRaf = null;
    }
    this._countdownStart = null;
  }

  _startCountdown() {
    this._countdownStart = Date.now();
    const tick = () => {
      if (this._advanced) return;
      const elapsed = Date.now() - this._countdownStart;
      const remaining = Math.max(0, NEXT_HOLE_TIMEOUT_MS - elapsed);
      this.ui.updateCountdown(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        // Time's up — advance and let main.js broadcast to peers
        eventBus.emit(Events.NEXT_HOLE_ADVANCE);
        return;
      }
      this._countdownRaf = requestAnimationFrame(tick);
    };
    this._countdownRaf = requestAnimationFrame(tick);
  }

  _markReady(playerId) {
    if (this._advanced) return;
    this._readyPlayers.add(playerId);
    this.ui.markReady(playerId);

    // Check if all current players are ready
    const allIds = gameState.players.map(p => p.id);
    const allReady = allIds.length > 0 && allIds.every(id => this._readyPlayers.has(id));
    if (allReady) {
      eventBus.emit(Events.NEXT_HOLE_ADVANCE);
    }
  }

  _advance() {
    if (this._advanced) return;
    this._advanced = true;
    this._cancelCountdown();
    this.ui.hide();
    eventBus.emit(Events.NEXT_HOLE);
  }
}
