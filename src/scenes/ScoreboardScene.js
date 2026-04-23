import { eventBus, Events } from '../core/EventBus.js';
import { ScoreboardUI } from '../ui/ScoreboardUI.js';
import { leaderboardStore, padArray } from '../core/LeaderboardStore.js';
import { gameState } from '../core/GameState.js';

export class ScoreboardScene {
  constructor(mp) {
    this.ui = new ScoreboardUI();
    this._isGameOver = false;
    this._mp = mp;

    eventBus.on(Events.HOLE_COMPLETE, () => {
      this._isGameOver = false;
      this._saveScore();
      this.ui.show(false);
    });

    eventBus.on(Events.GAME_COMPLETE, () => {
      this._isGameOver = true;
      this._saveScore();
      this._submitGlobal();
      this.ui.show(true);
    });

    eventBus.on(Events.NEXT_HOLE, () => {
      this.ui.hide();
      if (this._isGameOver) {
        gameState.leaderboardSessionId = null;
        eventBus.emit('game:restart');
      }
    });

    eventBus.on('game:restart', () => {
      gameState.leaderboardSessionId = null;
    });

    eventBus.on(Events.LEADERBOARD_UPDATE, ({ entries }) => {
      this.ui.setServerLeaderboard(entries);
    });

    eventBus.on(Events.GLOBAL_LEADERBOARD_UPDATE, ({ entries }) => {
      this.ui.setGlobalLeaderboard(entries);
    });
  }

  _saveScore() {
    const player = gameState.players[0];
    if (!player) return;

    const strokes = player.strokes.slice();
    const holeTimes = player.holeTimes.slice();

    gameState.leaderboardSessionId = leaderboardStore.upsertEntry(
      gameState.roomCode,
      player.name,
      strokes,
      holeTimes,
      gameState.leaderboardSessionId,
    );
    this.ui.sessionId = gameState.leaderboardSessionId;

    if (this._mp) {
      this._mp.submitLeaderboardEntry({
        name: player.name,
        strokes: padArray(strokes, 10),
        holeTimes: padArray(holeTimes, 10),
        holesCompleted: strokes.filter(v => v != null).length,
        totalStrokes: strokes.reduce((s, v) => s + (v || 0), 0),
        totalTime: holeTimes.reduce((s, v) => s + (v || 0), 0),
        sessionId: gameState.leaderboardSessionId,
      });
    }
  }

  _submitGlobal() {
    const player = gameState.players[0];
    if (!player) return;
    if (gameState.isBossRoom) return;
    const holesCompleted = player.strokes.filter(v => v != null).length;
    if (holesCompleted < gameState.totalHoles) return;

    // Solo mode: submit via HTTP (no WebSocket available)
    // Multiplayer: room.js handles global KV update when it receives leaderboard_submit
    if (gameState.isSoloMode && this._mp) {
      this._mp.submitGlobalHTTP({
        sessionId:    gameState.leaderboardSessionId,
        name:         player.name,
        totalStrokes: gameState.totalStrokes(player.id),
        totalTime:    gameState.totalTime(player.id),
        holesCompleted,
      });
    }
  }
}
