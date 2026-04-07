// ============================================================
// CosmicGolfRoom — Durable Object
// Manages lobby state: waiting → countdown → in_game.
// Relays messages. Rejects joins once game has started.
// Uses Hibernatable WebSockets + Alarms for countdown.
// ============================================================

const MIN_PLAYERS   = 2;
const COUNTDOWN_SEC = 15;

export class CosmicGolfRoom {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const phase = (await this.state.storage.get('phase')) || 'waiting';

    // Reject new joins once game is running
    if (phase === 'in_game') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept(); // non-hibernatable, just for the rejection message
      server.send(JSON.stringify({ type: 'room_locked' }));
      server.close(1000, 'Game already in progress');
      return new Response(null, { status: 101, webSocket: client });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server); // hibernatable
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Message handler ────────────────────────────────────────

  async webSocketMessage(ws, rawMessage) {
    let data;
    try { data = JSON.parse(rawMessage); } catch { return; }

    if (data.type === 'join' && data.playerId) {
      // Tag this socket with playerId for disconnect handling
      ws.serializeAttachment({ playerId: data.playerId });

      // Persist player
      const players = await this._loadPlayers();
      players[data.playerId] = { id: data.playerId, name: data.name, color: data.color };
      await this._savePlayers(players);

      // Send all existing players to the new joiner so they see the full lobby
      for (const [pid, player] of Object.entries(players)) {
        if (pid !== data.playerId) {
          ws.send(JSON.stringify({ type: 'join', playerId: player.id, name: player.name, color: player.color }));
        }
      }

      // Send current lobby state to new joiner
      const phase    = (await this.state.storage.get('phase'))    || 'waiting';
      const countdown = (await this.state.storage.get('countdown')) ?? COUNTDOWN_SEC;
      ws.send(JSON.stringify({ type: 'lobby_state', phase, countdown, playerCount: Object.keys(players).length }));

      // Relay join to everyone else
      this._broadcastExcept(ws, rawMessage);

      // Start countdown when enough players arrive
      if (phase === 'waiting' && Object.keys(players).length >= MIN_PLAYERS) {
        await this._startCountdown(Object.keys(players).length);
      }

    } else {
      // All other message types: relay only
      this._broadcastExcept(ws, rawMessage);
    }
  }

  // ── Disconnect ─────────────────────────────────────────────

  async webSocketClose(ws) { await this._handleDisconnect(ws); }
  async webSocketError(ws) { await this._handleDisconnect(ws); }

  async _handleDisconnect(ws) {
    const attachment = ws.deserializeAttachment();
    const playerId   = attachment?.playerId;
    if (!playerId) return;

    const players = await this._loadPlayers();
    delete players[playerId];
    await this._savePlayers(players);

    const leaveMsg = JSON.stringify({ type: 'leave', playerId });
    this._broadcastExcept(ws, leaveMsg);

    const phase      = (await this.state.storage.get('phase')) || 'waiting';
    const remaining  = Object.keys(players).length;

    if (phase === 'countdown' && remaining < MIN_PLAYERS) {
      // Not enough players — cancel countdown, go back to waiting
      await this.state.storage.put('phase', 'waiting');
      await this.state.storage.deleteAlarm();
      this._broadcastExcept(ws, JSON.stringify({ type: 'lobby_state', phase: 'waiting', countdown: COUNTDOWN_SEC, playerCount: remaining }));
    }

    if (phase === 'in_game' && remaining === 0) {
      // All players left finished game — reset room so public slot opens up
      await this.state.storage.put('phase', 'waiting');
      await this.state.storage.put('countdown', COUNTDOWN_SEC);
      await this.state.storage.put('players', {});
    }
  }

  // ── Countdown alarm ────────────────────────────────────────

  async alarm() {
    const phase = await this.state.storage.get('phase');
    if (phase !== 'countdown') return;

    const players  = await this._loadPlayers();
    const count    = Object.keys(players).length;
    let   cd       = ((await this.state.storage.get('countdown')) ?? COUNTDOWN_SEC) - 1;

    if (cd <= 0 || count < MIN_PLAYERS) {
      if (count < MIN_PLAYERS) {
        // Players dropped below minimum — reset
        await this.state.storage.put('phase', 'waiting');
        await this.state.storage.put('countdown', COUNTDOWN_SEC);
        this._broadcastAll(JSON.stringify({ type: 'lobby_state', phase: 'waiting', countdown: COUNTDOWN_SEC, playerCount: count }));
      } else {
        // Launch!
        await this.state.storage.put('phase', 'in_game');
        this._broadcastAll(JSON.stringify({ type: 'game_start' }));
      }
    } else {
      await this.state.storage.put('countdown', cd);
      await this.state.storage.setAlarm(Date.now() + 1000);
      this._broadcastAll(JSON.stringify({ type: 'lobby_state', phase: 'countdown', countdown: cd, playerCount: count }));
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  async _startCountdown(playerCount) {
    await this.state.storage.put('phase', 'countdown');
    await this.state.storage.put('countdown', COUNTDOWN_SEC);
    await this.state.storage.setAlarm(Date.now() + 1000);
    this._broadcastAll(JSON.stringify({ type: 'lobby_state', phase: 'countdown', countdown: COUNTDOWN_SEC, playerCount }));
  }

  async _loadPlayers() {
    return (await this.state.storage.get('players')) || {};
  }

  async _savePlayers(p) {
    await this.state.storage.put('players', p);
  }

  _broadcastExcept(excludeWs, message) {
    for (const ws of this.state.getWebSockets()) {
      if (ws !== excludeWs) try { ws.send(message); } catch {}
    }
  }

  _broadcastAll(message) {
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(message); } catch {}
    }
  }
}
