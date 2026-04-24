// ============================================================
// CosmicGolfRoom — Durable Object
// Pure relay + persistent leaderboard per room.
// ============================================================

import { upsertGlobalEntry } from './globalLb.js';
import { getGlobalStats, updateGlobalStats } from './globalStats.js';

const MAX_PLAYERS = 24;
const MAX_LEADERBOARD = 10;
const MAX_MSG_BYTES = 2048;
const LB_KEY = 'leaderboard';
const GLOBAL_KV_KEY = 'top10';

// ── Validation helpers ────────────────────────────────────────

function isVec3(v) {
  return v != null && typeof v === 'object' &&
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isGamePos(v) {
  return isVec3(v) &&
    Math.abs(v.x) < 6000 && Math.abs(v.y) < 6000 && Math.abs(v.z) < 6000;
}

function isGameVel(v) {
  return isVec3(v) &&
    Math.abs(v.x) < 1500 && Math.abs(v.y) < 1500 && Math.abs(v.z) < 1500;
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'PLAYER';
  return name.replace(/[^\w\s\-!?.]/g, '').slice(0, 12).trim() || 'PLAYER';
}

function sanitizeColor(color) {
  if (typeof color !== 'number' || !Number.isInteger(color) || color < 0 || color > 0xffffff) return 0xffffff;
  return color;
}

// ── Room ──────────────────────────────────────────────────────

export class CosmicGolfRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this._leaderboard = [];
    // Rate limiting: ws → last message timestamp (in-memory, resets on hibernation — acceptable)
    this._msgLastTs = new Map();
    // Pre-load leaderboard before any messages are handled
    this.state.blockConcurrencyWhile(() => this._loadLeaderboard());
  }

  async _loadLeaderboard() {
    const stored = await this.state.storage.get(LB_KEY);
    this._leaderboard = Array.isArray(stored) ? stored : [];
  }

  async _saveLeaderboard() {
    await this.state.storage.put(LB_KEY, this._leaderboard);
  }

  async _updateGlobalKV(entry) {
    const stored = (await this.env.GLOBAL_LB.get(GLOBAL_KV_KEY, { type: 'json' })) ?? [];
    const top10 = upsertGlobalEntry(stored, entry);
    await this.env.GLOBAL_LB.put(GLOBAL_KV_KEY, JSON.stringify(top10));
    return top10; // return already-built array — don't re-fetch (KV reads can be stale ~60s)
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
    // Reject oversized messages
    if (rawMessage.length > MAX_MSG_BYTES) return;

    // Per-socket rate limit: max 60 messages/sec (1 per 16ms)
    const now = Date.now();
    const last = this._msgLastTs.get(ws) ?? 0;
    if (now - last < 16) return;
    this._msgLastTs.set(ws, now);

    let data;
    try { data = JSON.parse(rawMessage); } catch { return; }
    if (!data?.type) return;

    // ── Join ─────────────────────────────────────────────────
    if (data.type === 'join' && data.playerId) {
      const name  = sanitizeName(data.name);
      const color = sanitizeColor(data.color);
      ws.serializeAttachment({ playerId: data.playerId, name, color });

      // Tell the new joiner about everyone already in the room
      for (const socket of this.state.getWebSockets()) {
        if (socket === ws) continue;
        const info = socket.deserializeAttachment();
        if (!info?.playerId) continue;
        ws.send(JSON.stringify({ type: 'join', playerId: info.playerId, name: info.name, color: info.color }));
      }

      // Relay sanitized join to all others
      this._broadcastExcept(ws, JSON.stringify({ type: 'join', playerId: data.playerId, name, color }));

      ws.send(JSON.stringify({ type: 'leaderboard', entries: this._leaderboard }));
      const globalEntries = (await this.env.GLOBAL_LB.get(GLOBAL_KV_KEY, { type: 'json' })) ?? [];
      const globalStats = await getGlobalStats(this.env);
      ws.send(JSON.stringify({ type: 'global_leaderboard', entries: globalEntries, stats: globalStats }));
      return;
    }

    // ── Leaderboard submit ────────────────────────────────────
    if (data.type === 'leaderboard_submit' && data.entry) {
      const e = data.entry;
      if (typeof e.sessionId !== 'string' || !e.sessionId) return;
      if (typeof e.totalStrokes !== 'number' || e.totalStrokes < 0 || e.totalStrokes > 9999) return;

      const safeEntry = {
        sessionId:      e.sessionId.slice(0, 32),
        playerId:       typeof e.playerId === 'string' ? e.playerId.slice(0, 80) : e.sessionId.slice(0, 32),
        name:           sanitizeName(e.name),
        totalStrokes:   Math.round(e.totalStrokes),
        holesCompleted: Math.min(10, Math.max(0, Math.round(e.holesCompleted ?? 0))),
        totalTime:      typeof e.totalTime === 'number' && e.totalTime >= 0 ? e.totalTime : 0,
        bossDefeated:   e.bossDefeated === true,
        strokes:        Array.isArray(e.strokes)
          ? e.strokes.slice(0, 10).map(s => (typeof s === 'number' && s >= 0) ? Math.min(99, Math.round(s)) : null)
          : [],
      };
      this._upsertEntry(safeEntry);
      this._sortLeaderboard();
      this._leaderboard = this._leaderboard.slice(0, MAX_LEADERBOARD);
      await this._saveLeaderboard();
      this._broadcast(JSON.stringify({ type: 'leaderboard', entries: this._leaderboard }));

      if (safeEntry.holesCompleted === 10) {
        const globalEntry = {
          sessionId:    safeEntry.sessionId,
          playerId:     safeEntry.playerId,
          name:         safeEntry.name,
          totalStrokes: safeEntry.totalStrokes,
          totalTime:    safeEntry.totalTime,
          holesCompleted: 10,
          strokes:      safeEntry.strokes,
        };
        const top10 = await this._updateGlobalKV(globalEntry);
        const stats = await updateGlobalStats(this.env, globalEntry);
        this._broadcast(JSON.stringify({ type: 'global_leaderboard', entries: top10, stats }));
      } else if (safeEntry.bossDefeated) {
        const stats = await updateGlobalStats(this.env, safeEntry);
        const globalEntries = (await this.env.GLOBAL_LB.get(GLOBAL_KV_KEY, { type: 'json' })) ?? [];
        this._broadcast(JSON.stringify({ type: 'global_leaderboard', entries: globalEntries, stats }));
      }
      return;
    }

    // ── Leaderboard get ───────────────────────────────────────
    if (data.type === 'leaderboard_get') {
      ws.send(JSON.stringify({ type: 'leaderboard', entries: this._leaderboard }));
      return;
    }

    // ── Validate positional messages before relay ─────────────
    if (data.type === 'ball_state') {
      if (!isGamePos(data.pos) || !isGameVel(data.vel)) return;
    }
    if (data.type === 'ball_stopped') {
      if (!isGamePos(data.pos)) return;
    }
    if (data.type === 'shot') {
      if (!isVec3(data.direction)) return;
      if (typeof data.power !== 'number' || data.power < 0 || data.power > 1200) return;
    }
    if (data.type === 'ball_hit') {
      if (!isGameVel(data.velocity)) return;
    }

    // Ignore pings — they're just keepalive
    if (data.type === 'ping') return;

    this._broadcastExcept(ws, rawMessage);
  }

  _upsertEntry(entry) {
    const idx = this._leaderboard.findIndex(e => e.sessionId === entry.sessionId);
    if (idx < 0) {
      this._leaderboard.push(entry);
      return;
    }
    const existing = this._leaderboard[idx];
    const newHoles = entry.holesCompleted ?? 0;
    const oldHoles = existing.holesCompleted ?? 0;
    // Only advance the record — never regress to fewer holes or more strokes
    if (newHoles > oldHoles || (newHoles === oldHoles && entry.totalStrokes < existing.totalStrokes)) {
      this._leaderboard[idx] = { ...existing, ...entry };
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
    this._msgLastTs.delete(ws);
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
