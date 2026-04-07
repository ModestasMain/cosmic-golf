// ============================================================
// CosmicGolfRoom — Durable Object
// Pure relay: no KV storage, player list derived from live sockets.
// This prevents stale player ghosts from persisting across sessions.
// ============================================================

const MAX_PLAYERS = 24;

export class CosmicGolfRoom {
  constructor(state, env) {
    this.state = state;
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
      // Store player info on the socket so it survives DO hibernation
      ws.serializeAttachment({ playerId: data.playerId, name: data.name, color: data.color });

      // Send all currently connected players to the new joiner
      // (derived from live sockets only — no stale storage entries)
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
    }

    // Relay to everyone else
    this._broadcastExcept(ws, rawMessage);
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
}
