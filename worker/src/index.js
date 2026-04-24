// ============================================================
// Cosmic Golf — Cloudflare Durable Objects multiplayer relay
// Each room code maps to one Durable Object instance.
// The DO holds all WebSocket connections and relays messages.
// No game logic — physics runs deterministically on each client.
// ============================================================

export { CosmicGolfRoom } from './room.js';
import { upsertGlobalEntry } from './globalLb.js';
import { getGlobalStats, updateGlobalStats } from './globalStats.js';

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('[worker] request failed', err);
      return jsonResponse({ error: 'Worker error' }, 500);
    }
  },
};

async function handleRequest(request, env) {
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
    const stats = await getGlobalStats(env);
    return jsonResponse({ entries, stats });
  }

  // Route: POST /global-leaderboard
  if (url.pathname === '/global-leaderboard' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch {
      return textResponse('Bad request', 400);
    }
    const e = body?.entry;
    if (!e || (e.holesCompleted !== 10 && e.bossDefeated !== true)) {
      return textResponse('Incomplete game', 400);
    }

    const name = (typeof e.name === 'string'
      ? e.name.replace(/[^\w\s\-!?.]/g, '').slice(0, 12).trim()
      : '') || 'PLAYER';
    const sessionId = typeof e.sessionId === 'string' ? e.sessionId.slice(0, 48) : null;
    const playerId = typeof e.playerId === 'string' ? e.playerId.slice(0, 80) : sessionId;
    const totalStrokes = (typeof e.totalStrokes === 'number' && e.totalStrokes >= 0)
      ? Math.round(e.totalStrokes) : null;
    const totalTime = (typeof e.totalTime === 'number' && e.totalTime >= 0) ? e.totalTime : 0;
    const strokes = Array.isArray(e.strokes)
      ? e.strokes.slice(0, 10).map(s => (typeof s === 'number' && s >= 0) ? Math.min(99, Math.round(s)) : null)
      : [];

    if (!sessionId || totalStrokes === null) {
      return textResponse('Invalid entry', 400);
    }

    const entry = { sessionId, playerId, name, totalStrokes, totalTime, holesCompleted: e.holesCompleted, strokes, bossDefeated: e.bossDefeated === true };
    let top10 = (await env.GLOBAL_LB.get('top10', { type: 'json' })) ?? [];
    if (e.holesCompleted === 10) {
      top10 = upsertGlobalEntry(top10, { sessionId, name, totalStrokes, totalTime, holesCompleted: 10 });
      await env.GLOBAL_LB.put('top10', JSON.stringify(top10));
    }
    const stats = await updateGlobalStats(env, entry);

    return jsonResponse({ entries: top10, stats });
  }

  // Route: /party/{ROOM_CODE}  (underscores allowed — used by PUBLIC_2, PUBLIC_3, etc.)
  const match = url.pathname.match(/^\/party\/([A-Za-z0-9_]+)$/);
  if (!match) {
    return textResponse('Not found', 404);
  }

  const roomId = match[1].toUpperCase();
  const id = env.ROOMS.idFromName(roomId);
  const room = env.ROOMS.get(id);
  return room.fetch(request);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Upgrade, Connection, Content-Type',
  };
}
