// ============================================================
// GameState.js — centralized game state singleton
// ============================================================

import { HOLE } from './Constants.js';

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentHole = 0;           // 0-indexed
    this.players = [];              // [{ id, name, color, strokes: [] }]
    this.currentPlayerIndex = 0;
    this.ballInFlight = false;
    this.holeComplete = false;
    this.gameComplete = false;
    this.isSoloMode = true;
    this.isMuted = false;
    this.roomCode = null;

    // Portal state (read from URL)
    this.portalMode = false;
    this.portalRef = null;
    this.portalUsername = null;
    this.portalColor = null;

    // Per-hole state
    this.currentStrokes = 0;       // strokes for current player this hole
    this.aimState = 'IDLE';        // IDLE | AIMING | BALL_IN_FLIGHT | HOLE_COMPLETE
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex] || null;
  }

  get totalHoles() {
    return HOLE.COUNT;
  }

  addPlayer(id, name, color) {
    this.players.push({ id, name, color, strokes: [], holeTimes: [] });
  }

  recordStroke(playerId, holeIndex, strokes) {
    const player = this.players.find(p => p.id === playerId);
    if (player) player.strokes[holeIndex] = strokes;
  }

  recordHoleTime(playerId, holeIndex, ms) {
    const player = this.players.find(p => p.id === playerId);
    if (player) player.holeTimes[holeIndex] = ms;
  }

  totalStrokes(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return 0;
    return player.strokes.reduce((sum, s) => sum + (s || 0), 0);
  }

  totalTime(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return 0;
    return player.holeTimes.reduce((sum, t) => sum + (t || 0), 0);
  }

  advanceHole() {
    this.currentHole++;
    this.currentStrokes = 0;
    this.holeComplete = false;
    this.ballInFlight = false;
    this.aimState = 'IDLE';
    if (this.currentHole >= HOLE.COUNT) {
      this.gameComplete = true;
    }
  }

  advancePlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.currentStrokes = 0;
    this.aimState = 'IDLE';
  }
}

export const gameState = new GameState();
