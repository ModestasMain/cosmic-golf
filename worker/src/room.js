// ============================================================
// CosmicGolfRoom — Durable Object
// Pure relay + persistent leaderboard per room.
// Leaderboard stores top 10 scores, scoped to this room's holes.
// ============================================================

const MAX_PLAYERS = 24;
const MAX_LEADERBOARD = 10;
const LB_KEY = 'leaderboard';

export class CosmicGolfRoom {
  constructor(state, env) {
    this.state = state;
    this._leaderboard = null;
  }

  async _loadLeaderboard() {
    if (this._leaderboard !== null) return;
    const stored = await this.state.storage.get(LB_KEY);
    this._leaderboard = Array.isArray(stored) ? stored : [];
  }

  async _saveLeaderboard() {
    await this.state.storage.put(LB_KEY, this._leaderboard);
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const sockets = this.state.getWebSockets();
    if (sockets.length >= MAX_PLAYERS) {
      return new Response('Room full', { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMessage) {
    let data;
    try { data = JSON.parse(rawMessage); } catch { return; }

    if (data.type === 'join' && data.playerId) {
      ws.serializeAttachment({ playerId: data.playerId, name: data.name, color: data.color });

      for (const socket of this.state.getWebSockets()) {
        if (socket === ws) continue;
        const info = socket.deserializeAttachment();
        if (!info?.playerId) continue;
        ws.send(JSON.stringify({
          type: 'join',
          playerId: info.playerId,
          name: info.name,
          color: info.color,
        }));
      }

      await this._loadLeaderboard();
      ws.send(JSON.stringify({ type: 'leaderboard', entries: this._leaderboard }));
      return;
    }

    if (data.type === 'leaderboard_submit' && data.entry) {
      await this._loadLeaderboard();
      this._upsertEntry(data.entry);
      this._sortLeaderboard();
      this._leaderboard = this._leaderboard.slice(0, MAX_LEADERBOARD);
      await this._saveLeaderboard();
      this._broadcast(JSON.stringify({ type: 'leaderboard', entries: this._leaderboard }));
      return;
    }

    if (data.type === 'leaderboard_get') {
      await this._loadLeaderboard();
      ws.send(JSON.stringify({ type: 'leaderboard', entries: this._leaderboard }));
      return;
    }

    this._broadcastExcept(ws, rawMessage);
  }

  _upsertEntry(entry) {
    const idx = this._leaderboard.findIndex(e => e.sessionId === entry.sessionId);
    if (idx >= 0) {
      this._leaderboard[idx] = entry;
    } else {
      this._leaderboard.push(entry);
    }
  }

  _sortLeaderboard() {
    this._leaderboard.sort((a, b) => {
      const hcA = a.holesCompleted ?? (a.strokes ? a.strokes.filter(v => v != null).length : 0);
      const hcB = b.holesCompleted ?? (b.strokes ? b.strokes.filter(v => v != null).length : 0);
      const hd = hcB - hcA;
      if (hd !== 0) return hd;
      const sd = a.totalStrokes - b.totalStrokes;
      if (sd !== 0) return sd;
      return a.totalTime - b.totalTime;
    });
  }

  async webSocketClose(ws) { this._handleDisconnect(ws); }
  async webSocketError(ws) { this._handleDisconnect(ws); }

  _handleDisconnect(ws) {
    const info = ws.deserializeAttachment();
    if (!info?.playerId) return;
    this._broadcastExcept(ws, JSON.stringify({ type: 'leave', playerId: info.playerId }));
  }

  _broadcastExcept(excludeWs, message) {
    for (const ws of this.state.getWebSockets()) {
      if (ws !== excludeWs) try { ws.send(message); } catch {}
    }
  }

  _broadcast(message) {
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(message); } catch {}
    }
  }
}
