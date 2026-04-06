// ============================================================
// MultiplayerManager.js — Partykit WebSocket multiplayer
// Stubs to solo mode gracefully if Partykit is unavailable
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { MULTIPLAYER } from '../core/Constants.js';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export class MultiplayerManager {
  constructor() {
    this.ws = null;
    this.roomCode = null;
    this.playerId = null;
    this.players = new Map(); // id -> { name, color }
    this._shotCallback = null;
    this._soloTimer = null;
    this._isConnected = false;
    this._isSolo = false;
  }

  /**
   * Create a new room and wait for players.
   * Falls back to solo mode after ROOM_JOIN_TIMEOUT_MS.
   */
  createRoom(playerName = 'PLAYER1', playerColor = 0x44aaff) {
    this.roomCode = generateRoomCode();
    this.playerId = 'host_' + Date.now();
    gameState.roomCode = this.roomCode;

    eventBus.emit(Events.MP_ROOM_CREATED, { code: this.roomCode });

    // Try to connect to Partykit
    this._connect(playerName, playerColor);

    // Solo fallback timer
    this._soloTimer = setTimeout(() => {
      if (!this._isConnected || this.players.size <= 1) {
        console.log('[MP] No other players joined — entering solo mode');
        this._enterSoloMode();
      }
    }, MULTIPLAYER.ROOM_JOIN_TIMEOUT_MS);

    return this.roomCode;
  }

  /**
   * Join an existing room by code.
   */
  joinRoom(code, playerName = 'PLAYER2', playerColor = 0xff6464) {
    this.roomCode = code.toUpperCase();
    this.playerId = 'guest_' + Date.now();
    gameState.roomCode = this.roomCode;

    this._connect(playerName, playerColor);
  }

  _connect(playerName, playerColor) {
    try {
      const url = `wss://${MULTIPLAYER.MP_HOST}/party/${this.roomCode}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._isConnected = true;
        console.log('[MP] Connected to room', this.roomCode);

        // Announce self
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
        console.log('[MP] Disconnected');
        if (!this._isSolo) this._enterSoloMode();
      };

      this.ws.onerror = (err) => {
        console.warn('[MP] WebSocket error — falling back to solo', err);
        this._enterSoloMode();
      };
    } catch (err) {
      console.warn('[MP] Could not connect — solo mode', err);
      this._enterSoloMode();
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'join':
        this.players.set(msg.playerId, { name: msg.name, color: msg.color });
        eventBus.emit(Events.MP_PLAYER_JOINED, { playerId: msg.playerId, name: msg.name, color: msg.color });
        if (this._soloTimer) {
          clearTimeout(this._soloTimer);
          this._soloTimer = null;
        }
        break;

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
          });
        }
        break;

      case 'hole_complete':
        if (msg.playerId !== this.playerId) {
          eventBus.emit(Events.MP_HOLE_COMPLETE, { playerId: msg.playerId, strokes: msg.strokes });
        }
        break;
    }
  }

  /**
   * Broadcast a shot to all other players.
   * @param {{ x, y, z }} direction normalized direction vector
   * @param {number} power
   */
  broadcastShot(direction, power) {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'shot', playerId: this.playerId, direction, power });
  }

  broadcastHoleComplete(strokes) {
    if (!this._isConnected || this._isSolo) return;
    this._send({ type: 'hole_complete', playerId: this.playerId, strokes });
  }

  onShotReceived(callback) {
    this._shotCallback = callback;
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
    if (this._soloTimer) {
      clearTimeout(this._soloTimer);
      this._soloTimer = null;
    }
    eventBus.emit(Events.MP_SOLO_MODE);
  }

  disconnect() {
    if (this._soloTimer) clearTimeout(this._soloTimer);
    if (this.ws) this.ws.close();
  }
}
