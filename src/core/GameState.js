// ============================================================
// GameState.js — centralized game state singleton
// ============================================================

import { HOLE } from './Constants.js';

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    const challengeSeed = this.challengeSeed ?? null;
    const challengeMode = this.challengeMode ?? null;

    this.currentHole = 0;           // 0-indexed
    this.players = [];              // [{ id, name, color, strokes: [] }]
    this.currentPlayerIndex = 0;
    this.ballInFlight = false;
    this.holeComplete = false;
    this.gameComplete = false;
    this.isSoloMode = true;
    this.isMuted = false;
    this.roomCode = null;
    this.challengeSeed = challengeSeed;
    this.challengeMode = challengeMode;
    // Random seed for solo sessions — each run gets unique holes.
    // Multiplayer uses the room code string instead (see generateHole).
    this.sessionSeed = Math.floor(Math.random() * 0xffffffff);

    // Portal state (read from URL)
    this.portalMode = false;
    this.portalRef = null;
    this.portalUsername = null;
    this.portalColor = null;

    // Per-hole state
    this.currentStrokes = 0;       // strokes for current player this hole
    this.aimState = 'IDLE';        // IDLE | AIMING | BALL_IN_FLIGHT | HOLE_COMPLETE

    this.leaderboardSessionId = null;

    this.ballStyle = localStorage.getItem('cosmic-golf-ball-style') || 'basketball';
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex] || null;
  }

  get isBossRoom() {
    return (this.roomCode || '').toUpperCase() === 'BOSS';
  }

  get isBossChallenge() {
    return this.challengeMode === 'BOSS';
  }

  get totalHoles() {
    return (this.isBossRoom || this.isBossChallenge) ? 1 : HOLE.COUNT;
  }

  setChallengeSeed(value) {
    const seed = String(value || '').trim().slice(0, 64);
    this.challengeSeed = seed || null;
    this.challengeMode = seed.toUpperCase() === 'BOSS'
      ? 'BOSS'
      : (seed ? 'RUN' : null);
  }

  clearChallenge() {
    this.challengeSeed = null;
    this.challengeMode = null;
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
    if (this.currentHole >= this.totalHoles) {
      this.gameComplete = true;
    }
  }

  setBallStyle(styleId) {
    this.ballStyle = styleId;
    localStorage.setItem('cosmic-golf-ball-style', styleId);
  }

  advancePlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.currentStrokes = 0;
    this.aimState = 'IDLE';
  }
}

export const gameState = new GameState();
