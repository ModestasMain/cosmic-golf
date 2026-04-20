// ============================================================
// Cosmic Golf — Cloudflare Durable Objects multiplayer relay
// Each room code maps to one Durable Object instance.
// The DO holds all WebSocket connections and relays messages.
// No game logic — physics runs deterministically on each client.
// ============================================================

export { CosmicGolfRoom } from './room.js';
import { upsertGlobalEntry } from './globalLb.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // Route: GET /global-leaderboard
    if (url.pathname === '/global-leaderboard' && request.method === 'GET') {
      const entries = (await env.GLOBAL_LB.get('top10', { type: 'json' })) ?? [];
      return new Response(JSON.stringify({ entries }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Route: POST /global-leaderboard
    if (url.pathname === '/global-leaderboard' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch {
        return new Response('Bad request', { status: 400, headers: corsHeaders() });
      }
      const e = body?.entry;
      if (!e || e.holesCompleted !== 10) {
        return new Response('Incomplete game', { status: 400, headers: corsHeaders() });
      }

      const name = (typeof e.name === 'string'
        ? e.name.replace(/[^\w\s\-!?.]/g, '').slice(0, 12).trim()
        : '') || 'PLAYER';
      const sessionId = typeof e.sessionId === 'string' ? e.sessionId.slice(0, 48) : null;
      const totalStrokes = (typeof e.totalStrokes === 'number' && e.totalStrokes >= 0)
        ? Math.round(e.totalStrokes) : null;
      const totalTime = (typeof e.totalTime === 'number' && e.totalTime >= 0) ? e.totalTime : 0;

      if (!sessionId || totalStrokes === null) {
        return new Response('Invalid entry', { status: 400, headers: corsHeaders() });
      }

      const entry = { sessionId, name, totalStrokes, totalTime, holesCompleted: 10 };
      const stored = (await env.GLOBAL_LB.get('top10', { type: 'json' })) ?? [];
      const top10 = upsertGlobalEntry(stored, entry);
      await env.GLOBAL_LB.put('top10', JSON.stringify(top10));

      return new Response(JSON.stringify({ entries: top10 }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Route: /party/{ROOM_CODE}  (underscores allowed — used by PUBLIC_2, PUBLIC_3, etc.)
    const match = url.pathname.match(/^\/party\/([A-Za-z0-9_]+)$/);
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Upgrade, Connection, Content-Type',
  };
}
