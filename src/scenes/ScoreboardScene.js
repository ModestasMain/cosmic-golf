import { eventBus, Events } from '../core/EventBus.js';
import { ScoreboardUI } from '../ui/ScoreboardUI.js';
import { leaderboardStore, padArray } from '../core/LeaderboardStore.js';
import { gameState } from '../core/GameState.js';

function getAnonymousPlayerId() {
  const key = 'cosmic-golf-player-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `cg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export class ScoreboardScene {
  constructor(mp) {
    this.ui = new ScoreboardUI();
    this._isGameOver = false;
    this._mp = mp;

    eventBus.on(Events.HOLE_COMPLETE, () => {
      this._isGameOver = false;
      this._saveScore();
      if (gameState.isDailyChallenge) return; // DailyOverlay takes over
      this.ui.show(false);
    });

    eventBus.on(Events.GAME_COMPLETE, () => {
      this._isGameOver = true;
      this._saveScore();
      this._submitGlobal();
      if (gameState.isDailyChallenge) return; // DailyOverlay takes over
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

    const holesCompleted = strokes.filter(v => v != null).length;
    const bossDefeated = holesCompleted >= gameState.totalHoles;

    if (this._mp) {
      this._mp.submitLeaderboardEntry({
        playerId: getAnonymousPlayerId(),
        name: player.name,
        strokes: padArray(strokes, 10),
        holeTimes: padArray(holeTimes, 10),
        holesCompleted,
        totalStrokes: strokes.reduce((s, v) => s + (v || 0), 0),
        totalTime: holeTimes.reduce((s, v) => s + (v || 0), 0),
        sessionId: gameState.leaderboardSessionId,
        bossDefeated,
      });

    }
  }

  _submitGlobal() {
    const player = gameState.players[0];
    if (!player) return;
    const strokes = padArray(player.strokes.slice(), 10);
    const holesCompleted = player.strokes.filter(v => v != null).length;
    const bossDefeated = (gameState.isBossRoom || gameState.isBossChallenge) && holesCompleted >= gameState.totalHoles;

    // Solo mode: submit via HTTP (multiplayer room.js handles it via WebSocket)
    if (gameState.isSoloMode && this._mp) {
      this._mp.submitGlobalHTTP({
        sessionId:    gameState.leaderboardSessionId,
        playerId:     getAnonymousPlayerId(),
        name:         player.name,
        strokes,
        totalStrokes: gameState.totalStrokes(player.id),
        totalTime:    gameState.totalTime(player.id),
        holesCompleted,
        bossDefeated,
      });
    }
  }
}
