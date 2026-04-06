// ============================================================
// CosmicGolfRoom — Durable Object
// One instance per room code. Relays messages between players.
// Uses Hibernatable WebSockets so idle rooms cost nothing.
// ============================================================

export class CosmicGolfRoom {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernatable WebSockets — DO sleeps between messages, no idle cost
    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // Called when a connected client sends a message
  webSocketMessage(ws, message) {
    // Store playerId the first time we see a 'join' message
    // so we can send a clean 'leave' when they disconnect
    try {
      const data = JSON.parse(message);
      if (data.type === 'join' && data.playerId) {
        ws.serializeAttachment({ playerId: data.playerId });
      }
    } catch {}

    // Relay to everyone else in the room
    for (const socket of this.state.getWebSockets()) {
      if (socket !== ws) {
        try { socket.send(message); } catch {}
      }
    }
  }

  // Called when a client disconnects (clean close)
  webSocketClose(ws) {
    this._broadcastLeave(ws);
  }

  // Called when a client disconnects (error / abrupt)
  webSocketError(ws) {
    this._broadcastLeave(ws);
  }

  _broadcastLeave(ws) {
    const attachment = ws.deserializeAttachment();
    const playerId = attachment?.playerId;
    if (!playerId) return;

    const msg = JSON.stringify({ type: 'leave', playerId });
    for (const socket of this.state.getWebSockets()) {
      if (socket !== ws) {
        try { socket.send(msg); } catch {}
      }
    }
  }
}
