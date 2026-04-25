const STATS_KV_KEY = 'stats:v1';
const MAX_TRACKED_IDS = 5000;

function cleanId(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const id = value.replace(/[^\w:.-]/g, '').slice(0, 80);
  return id || fallback;
}

function normalizeStats(raw) {
  const stats = raw && typeof raw === 'object' ? raw : {};
  const players = stats.players && typeof stats.players === 'object' ? stats.players : {};
  const runs = stats.runs && typeof stats.runs === 'object' ? stats.runs : {};
  const holes = stats.holes && typeof stats.holes === 'object' ? stats.holes : {};
  return {
    timesPlayed: Math.max(0, Math.round(stats.timesPlayed ?? 0)),
    holeInOnes: Math.max(0, Math.round(stats.holeInOnes ?? 0)),
    bossDefeats: Math.max(0, Math.round(stats.bossDefeats ?? 0)),
    uniquePlayers: Math.max(0, Math.round(stats.uniquePlayers ?? Object.keys(players).length)),
    players,
    runs,
    holes,
  };
}

function pruneMap(map) {
  const keys = Object.keys(map);
  if (keys.length <= MAX_TRACKED_IDS) return map;
  const next = {};
  for (const key of keys.slice(keys.length - MAX_TRACKED_IDS)) next[key] = map[key];
  return next;
}

export async function getGlobalStats(env) {
  const stored = await env.GLOBAL_LB.get(STATS_KV_KEY, { type: 'json' });
  const stats = normalizeStats(stored);
  return {
    timesPlayed: stats.timesPlayed,
    holeInOnes: stats.holeInOnes,
    bossDefeats: stats.bossDefeats,
    uniquePlayers: stats.uniquePlayers,
  };
}

export async function updateGlobalStats(env, entry) {
  const stored = await env.GLOBAL_LB.get(STATS_KV_KEY, { type: 'json' });
  const stats = normalizeStats(stored);
  const sessionId = cleanId(entry?.sessionId, null);
  const playerId = cleanId(entry?.playerId, sessionId);
  if (!sessionId) return getGlobalStats(env);

  if (!stats.players[playerId]) {
    stats.players[playerId] = 1;
    stats.uniquePlayers += 1;
  }

  if (!stats.runs[sessionId]) {
    stats.runs[sessionId] = 1;
    stats.timesPlayed += 1;
    if (Array.isArray(entry?.strokes)) {
      stats.holeInOnes += entry.strokes.filter(v => v === 1).length;
    }
    if (entry?.bossDefeated === true) {
      stats.bossDefeats += 1;
    }
  }

  stats.players = pruneMap(stats.players);
  stats.runs = pruneMap(stats.runs);
  await env.GLOBAL_LB.put(STATS_KV_KEY, JSON.stringify(stats));
  return getGlobalStats(env);
}

export async function recordHoleCompletion(env, entry) {
  const stored = await env.GLOBAL_LB.get(STATS_KV_KEY, { type: 'json' });
  const stats = normalizeStats(stored);
  const sessionId = cleanId(entry?.sessionId, null);
  const playerId = cleanId(entry?.playerId, sessionId);
  const holeIndex = Math.round(entry?.holeIndex ?? -1);
  const strokes = Math.round(entry?.strokes ?? 0);
  if (!sessionId || holeIndex < 0 || holeIndex > 99 || strokes <= 0) return getGlobalStats(env);

  const holeKey = `${sessionId}:${holeIndex}`;
  if (stats.holes[holeKey]) return getGlobalStats(env);
  stats.holes[holeKey] = 1;

  if (playerId && !stats.players[playerId]) {
    stats.players[playerId] = 1;
    stats.uniquePlayers += 1;
  }

  if (!stats.runs[sessionId]) {
    stats.runs[sessionId] = 1;
    stats.timesPlayed += 1;
  }

  if (strokes === 1) {
    stats.holeInOnes += 1;
  }

  stats.players = pruneMap(stats.players);
  stats.runs = pruneMap(stats.runs);
  stats.holes = pruneMap(stats.holes);
  await env.GLOBAL_LB.put(STATS_KV_KEY, JSON.stringify(stats));
  return getGlobalStats(env);
}
