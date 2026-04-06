// ============================================================
// Cosmic Golf — Cloudflare Durable Objects multiplayer relay
// Each room code maps to one Durable Object instance.
// The DO holds all WebSocket connections and relays messages.
// No game logic — physics runs deterministically on each client.
// ============================================================

export { CosmicGolfRoom } from './room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // Route: /party/{ROOM_CODE}
    const match = url.pathname.match(/^\/party\/([A-Za-z0-9]+)$/);
    if (!match) {
      return new Response('Not found', { status: 404 });
    }

    const roomId = match[1].toUpperCase();
    const id = env.ROOMS.idFromName(roomId);
    const room = env.ROOMS.get(id);
    return room.fetch(request);
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Upgrade, Connection',
  };
}
