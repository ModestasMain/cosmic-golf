// ============================================================
// ScoreboardScene.js — manages scoreboard display between holes
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { ScoreboardUI } from '../ui/ScoreboardUI.js';

export class ScoreboardScene {
  constructor() {
    this.ui = new ScoreboardUI();
    this._isGameOver = false;
    this._autoAdvanceTimer = null;

    eventBus.on(Events.HOLE_COMPLETE, (data) => {
      this._isGameOver = false;
      this.ui.show(false);
      // Clear any leftover timer from a previous hole
      if (this._autoAdvanceTimer) {
        clearTimeout(this._autoAdvanceTimer);
        this._autoAdvanceTimer = null;
      }
      this._autoAdvanceTimer = setTimeout(() => {
        this._autoAdvanceTimer = null;
        if (!this._isGameOver) {
          this.ui.hide();
          eventBus.emit(Events.NEXT_HOLE);
        }
      }, 2500);
    });

    eventBus.on(Events.GAME_COMPLETE, () => {
      this._isGameOver = true;
      if (this._autoAdvanceTimer) {
        clearTimeout(this._autoAdvanceTimer);
        this._autoAdvanceTimer = null;
      }
      this.ui.show(true);
    });

    eventBus.on(Events.NEXT_HOLE, () => {
      // Cancel auto-advance if player clicked the button manually
      if (this._autoAdvanceTimer) {
        clearTimeout(this._autoAdvanceTimer);
        this._autoAdvanceTimer = null;
      }
      this.ui.hide();
      if (this._isGameOver) {
        this._restartGame();
      }
    });
  }

  _restartGame() {
    eventBus.emit('game:restart');
  }
}
