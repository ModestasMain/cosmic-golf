// ============================================================
// MultiplayerManager.js — Partykit WebSocket multiplayer
// Stubs to solo mode gracefully if Partykit is unavailable
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { MULTIPLAYER } from '../core/Constants.js';

// ── Client-side validation ────────────────────────────────────

function isVec3(v) {
  return v != null && typeof v === 'object' &&
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isGamePos(v) {
  return isVec3(v) && Math.abs(v.x) < 6000 && Math.abs(v.y) < 6000 && Math.abs(v.z) < 6000;
}

function isGameVel(v) {
  return isVec3(v) && Math.abs(v.x) < 1500 && Math.abs(v.y) < 1500 && Math.abs(v.z) < 1500;
}

// ── Manager ───────────────────────────────────────────────────

export class MultiplayerManager {
  constructor() {
    this.ws = null;
    this.roomCode = null;
    this.playerId = null;
    this.players = new Map();
    this._shotCallback = null;
    this._ballStateCallback = null;
    this._isConnected = false;
    this._isSolo = false;
    this._heartbeatTimer = null;
  }

  joinPublic(playerName = 'PLAYER', playerColor) {
    this.playerId = 'pub_' + Date.now();
    // Always derive a unique color from ID; only override with explicit portal color
    this.localColor = this._colorFromId(this.playerId);
    const color = (playerColor != null && playerColor !== 0xffffff)
      ? playerColor
      : this.localColor;
    this.localColor = color;
    this._connectPublicSlot(playerName, color, 1);
  }

  /** Try PUBLIC, PUBLIC_2, PUBLIC_3 … up to MAX_PUBLIC_SLOTS before going solo. */
  _connectPublicSlot(playerName, playerColor, slot) {
    const code = slot === 1 ? MULTIPLAYER.PUBLIC_ROOM : `${MULTIPLAYER.PUBLIC_ROOM}_${slot}`;
    this.roomCode = code;
    gameState.roomCode = code;
    this._connectWithFallback(playerName, playerColor, () => {
      if (slot < MULTIPLAYER.MAX_PUBLIC_SLOTS) {
        this._connectPublicSlot(playerName, playerColor, slot + 1);
      } else {
        this._enterSoloMode();
      }
    });
  }

  /** Deterministic color from player ID — avoids needing server-side slot assignment. */
  _colorFromId(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
    // Skip slot 0 (white = host), pick from slots 1-7
    const idx = (Math.abs(h) % (MULTIPLAYER.PLAYER_COLORS.length - 1)) + 1;
    return MULTIPLAYER.PLAYER_COLORS[idx];
  }

  /**
   * Attempt a WebSocket connection.
   * @param {function} onRejected  Called when the connection is refused before
   *   opening (e.g. 503 room-full). NOT called if the connection drops mid-game.
   */
  _connectWithFallback(playerName, playerColor, onRejected) {
    try {
      const url = `wss://${MULTIPLAYER.MP_HOST}/party/${this.roomCode}`;
      this.ws = new WebSocket(url);
      let opened = false;

      this.ws.onopen = () => {
        opened = true;
        this._isConnected = true;
        console.log('[MP] Connected to room', this.roomCode);
        this._send({
          type: 'join',
          playerId: this.playerId,
          name: playerName,
          color: playerColor,
        });
        // Keepalive ping every 30s to prevent idle disconnects
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send('{"type":"ping"}');
          }
        }, 30000);
      };

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this._handleMessage(msg);
        } catch (err) {
          console.warn('[MP] Bad message', e.data);
        }
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
        if (!opened) {
          // Never opened — room was full or unreachable; try next slot
          console.log('[MP] Room full or rejected:', this.roomCode);
          onRejected();
        } else if (!this._isSolo) {
          console.log('[MP] Disconnected mid-game — solo mode');
          this._enterSoloMode();
        }
      };

      this.ws.onerror = () => {
        // onerror always fires before onclose; let onclose handle the logic
      };
    } catch (err) {
      console.warn('[MP] Could not connect — solo mode', err);
      onRejected();
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'join': {
        // Enforce 8-player cap (don't count ourselves)
        if (!this.players.has(msg.playerId) && this.players.size >= MULTIPLAYER.MAX_PLAYERS - 1) {
          console.warn('[MP] Room full — ignoring join from', msg.playerId);
          break;
        }
        const existing = this.players.get(msg.playerId);
        // Preserve color across re-announcements (name updates shouldn't change color)
        const color = existing?.color ?? msg.color;
        this.players.set(msg.playerId, { name: msg.name, color });
        eventBus.emit(Events.MP_PLAYER_JOINED, { playerId: msg.playerId, name: msg.name, color });
        break;
      }

      case 'leave':
        this.players.delete(msg.playerId);
        eventBus.emit(Events.MP_PLAYER_LEFT, { playerId: msg.playerId });
        break;

      case 'shot': {
        if (msg.playerId === this.playerId || !this._shotCallback) break;
        if (!isVec3(msg.direction)) break;
        if (typeof msg.power !== 'number' || msg.power < 0 || msg.power > 1200) break;
        this._shotCallback({
          playerId:  msg.playerId,
          direction: msg.direction,
          power:     msg.power,
          holeIndex: msg.holeIndex,
        });
        break;
      }

      case 'ball_state': {
        if (msg.playerId === this.playerId || !this._ballStateCallback) break;
        if (!isGamePos(msg.pos) || !isGameVel(msg.vel)) break;
        this._ballStateCallback({
          playerId:  msg.playerId,
          pos:       msg.pos,
          vel:       msg.vel,
          holeIndex: msg.holeIndex,
          ts:        msg.ts,
          bounce:    msg.bounce ?? false,
          planetIdx: msg.planetIdx ?? null,
          normal:    msg.normal ?? null,
        });
        break;
      }

      case 'ball_stopped': {
        if (msg.playerId === this.playerId) break;
        if (!isGamePos(msg.pos)) break;
        eventBus.emit(Events.MP_BALL_STOPPED, {
          playerId:  msg.playerId,
          pos:       msg.pos,
          holeIndex: msg.holeIndex,
          planetIdx: msg.planetIdx ?? null,
          normal:    msg.normal ?? null,
        });
        break;
      }

      case 'hole_complete':
        if (msg.playerId !== this.playerId) {
          eventBus.emit(Events.MP_HOLE_COMPLETE, { playerId: msg.playerId, strokes: msg.strokes, timeMs: msg.timeMs });
        }
        break;

      case 'collected':
        if (msg.playerId !== this.playerId) {
          eventBus.emit(Events.COLLECTIBLE_COLLECTED, {
            type:     msg.collectibleType, id: msg.collectibleId,
            playerId: msg.playerId,        holeIndex: msg.holeIndex,
            remote:   true,
          });
        }
        break;

      case 'ball_hit': {
        if (msg.targetId !== this.playerId) break;
        if (!isGameVel(msg.velocity)) break;
        eventBus.emit(Events.BILLIARD_HIT, {
          targetId:  msg.targetId,
          velocity:  msg.velocity,
          holeIndex: msg.holeIndex,
          remote:    true,
        });
        break;
      }

      case 'ball_reset':
        if (msg.playerId !== this.playerId) {
          eventBus.emit(Events.MP_BALL_RESET, { playerId: msg.playerId, holeIndex: msg.holeIndex });
        }
        break;

      case 'game_restart':
        if (msg.playerId !== this.playerId) {
          eventBus.emit(Events.MP_GAME_RESTART, { playerId: msg.playerId });
        }
        break;

      case 'leaderboard':
        eventBus.emit(Events.LEADERBOARD_UPDATE, { entries: msg.entries });
        break;
    }
  }

  /**
   * Broadcast a shot to all other players.
   * @param {{ x, y, z }} direction normalized direction vector
   * @param {number} power
   */
  broadcastShot(direction, power, holeIndex) {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'shot', playerId: this.playerId, direction, power, holeIndex });
  }

  broadcastHoleComplete(strokes, timeMs) {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'hole_complete', playerId: this.playerId, strokes, timeMs });
  }

  onShotReceived(callback) {
    this._shotCallback = callback;
  }

  onBallStateReceived(callback) {
    this._ballStateCallback = callback;
  }

  /** Re-announce identity after name is confirmed (name entry happens after connect). */
  updateIdentity(name, color) {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'join', playerId: this.playerId, name, color });
  }

  broadcastBallState(pos, vel, holeIndex, bounce = false, planetIdx = null, normal = null, reset = false) {
    if (!this._isConnected || this._isSolo) return;
    const msg = {
      type:      'ball_state',
      playerId:  this.playerId,
      holeIndex,
      ts:        Date.now(),
      bounce,
      reset,
      pos: { x: pos.x, y: pos.y, z: pos.z },
      vel: { x: vel.x, y: vel.y, z: vel.z },
    };
    if (planetIdx != null && planetIdx >= 0) {
      msg.planetIdx = planetIdx;
      if (normal) msg.normal = { x: normal.x, y: normal.y, z: normal.z };
    }
    this._send(msg);
  }

  broadcastBallStopped(pos, holeIndex, planetIdx = null, normal = null) {
    if (!this._isConnected || this._isSolo) return;
    const msg = {
      type:      'ball_stopped',
      playerId:  this.playerId,
      holeIndex,
      pos: { x: pos.x, y: pos.y, z: pos.z },
    };
    if (planetIdx != null && planetIdx >= 0) {
      msg.planetIdx = planetIdx;
      if (normal) msg.normal = { x: normal.x, y: normal.y, z: normal.z };
    }
    this._send(msg);
  }

  broadcastCollected(collectibleId, collectibleType, holeIndex) {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'collected', playerId: this.playerId, collectibleId, collectibleType, holeIndex });
  }

  broadcastBallHit(targetId, velocity, holeIndex) {
    if (!this._isConnected || this._isSolo) return;
    this._send({
      type:      'ball_hit',
      playerId:  this.playerId,
      targetId,
      velocity:  { x: velocity.x, y: velocity.y, z: velocity.z },
      holeIndex,
    });
  }

  broadcastBallReset(holeIndex) {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'ball_reset', playerId: this.playerId, holeIndex });
  }

  broadcastGameRestart() {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'game_restart', playerId: this.playerId });
  }

  submitLeaderboardEntry(entry) {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'leaderboard_submit', entry });
  }

  requestLeaderboard() {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'leaderboard_get' });
  }

  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  _enterSoloMode() {
    if (this._isSolo) return;
    this._isSolo = true;
    gameState.isSoloMode = true;
    eventBus.emit(Events.MP_SOLO_MODE);
  }

  disconnect() {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
    if (this.ws) this.ws.close();
  }
}
