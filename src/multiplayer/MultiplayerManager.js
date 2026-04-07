// ============================================================
// MultiplayerManager.js — Partykit WebSocket multiplayer
// Stubs to solo mode gracefully if Partykit is unavailable
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { MULTIPLAYER } from '../core/Constants.js';

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
  }

  joinPublic(playerName = 'PLAYER', playerColor) {
    this.playerId = 'pub_' + Date.now();
    const color = playerColor ?? this._colorFromId(this.playerId);
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

      case 'shot':
        if (msg.playerId !== this.playerId && this._shotCallback) {
          this._shotCallback({
            playerId: msg.playerId,
            direction: msg.direction,
            power: msg.power,
            holeIndex: msg.holeIndex,
          });
        }
        break;

      case 'ball_state':
        if (msg.playerId !== this.playerId && this._ballStateCallback) {
          this._ballStateCallback({
            playerId: msg.playerId,
            pos: msg.pos,
            vel: msg.vel,
            holeIndex: msg.holeIndex,
          });
        }
        break;

      case 'hole_complete':
        if (msg.playerId !== this.playerId) {
          eventBus.emit(Events.MP_HOLE_COMPLETE, { playerId: msg.playerId, strokes: msg.strokes, timeMs: msg.timeMs });
        }
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

  broadcastBallState(pos, vel, holeIndex) {
    if (!this._isConnected || this._isSolo) return;
    this._send({
      type: 'ball_state',
      playerId: this.playerId,
      holeIndex,
      pos: { x: pos.x, y: pos.y, z: pos.z },
      vel: { x: vel.x, y: vel.y, z: vel.z },
    });
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
    if (this.ws) this.ws.close();
  }
}
