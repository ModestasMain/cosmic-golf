// ============================================================
// ScoreboardScene.js — shows scoreboard after each hole
// Player clicks "Next Hole" to advance at their own pace.
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { ScoreboardUI } from '../ui/ScoreboardUI.js';

export class ScoreboardScene {
  constructor() {
    this.ui = new ScoreboardUI();
    this._isGameOver = false;

    eventBus.on(Events.HOLE_COMPLETE, () => {
      this._isGameOver = false;
      this.ui.show(false);
    });

    eventBus.on(Events.GAME_COMPLETE, () => {
      this._isGameOver = true;
      this.ui.show(true);
    });

    // Button click — advance immediately
    eventBus.on(Events.NEXT_HOLE, () => {
      this.ui.hide();
      if (this._isGameOver) {
        eventBus.emit('game:restart');
      }
    });
  }
}
