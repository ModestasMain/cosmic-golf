// ============================================================
// Daily Hole leaderboard — one seed per UTC day, global board.
// Keys in GLOBAL_LB:
//   daily:{YYYY-MM-DD}:top    JSON array, top 100, sorted by strokes asc then time asc
//   daily:{YYYY-MM-DD}:n:{normalizedName}   per-name best { strokes, time, ts }
// TTL: 8 days (keep a week of history).
// ============================================================

const MAX_TOP = 100;
const TTL_SECONDS = 60 * 60 * 24 * 8;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeName(raw) {
  const s = typeof raw === 'string'
    ? raw.replace(/[^\w\s\-!?.]/g, '').slice(0, 12).trim()
    : '';
  return s || 'PLAYER';
}

function normalizeNameKey(name) {
  return name.toLowerCase().replace(/\s+/g, '_').slice(0, 24);
}

function compareEntries(a, b) {
  if (a.strokes !== b.strokes) return a.strokes - b.strokes;
  return (a.time || 0) - (b.time || 0);
}

export function isValidDate(date) {
  return typeof date === 'string' && DATE_RE.test(date);
}

export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyBoard(env, date) {
  const key = `daily:${date}:top`;
  const entries = (await env.GLOBAL_LB.get(key, { type: 'json' })) ?? [];
  return { date, entries, count: entries.length };
}

export async function submitDailyScore(env, date, payload) {
  const name = sanitizeName(payload?.name);
  const strokes = Math.round(Number(payload?.strokes));
  const time = Math.max(0, Math.round(Number(payload?.time) || 0));

  if (!Number.isFinite(strokes) || strokes < 1 || strokes > 50) {
    return { ok: false, error: 'Invalid strokes' };
  }
  if (time > 1000 * 60 * 30) {
    return { ok: false, error: 'Invalid time' };
  }

  const nameKey = normalizeNameKey(name);
  const perNameKey = `daily:${date}:n:${nameKey}`;
  const prev = await env.GLOBAL_LB.get(perNameKey, { type: 'json' });

  // last-best-wins per name+date
  const isBetter = !prev
    || strokes < prev.strokes
    || (strokes === prev.strokes && time < (prev.time || 0));

  if (!isBetter) {
    const board = await getDailyBoard(env, date);
    return { ok: true, improved: false, previous: prev, ...board };
  }

  const entry = { name, strokes, time, ts: Date.now() };
  await env.GLOBAL_LB.put(perNameKey, JSON.stringify(entry), { expirationTtl: TTL_SECONDS });

  // rebuild top list: merge/replace by nameKey
  const topKey = `daily:${date}:top`;
  let top = (await env.GLOBAL_LB.get(topKey, { type: 'json' })) ?? [];
  const idx = top.findIndex(e => normalizeNameKey(e.name) === nameKey);
  if (idx >= 0) top[idx] = entry; else top.push(entry);
  top.sort(compareEntries);
  top = top.slice(0, MAX_TOP);
  await env.GLOBAL_LB.put(topKey, JSON.stringify(top), { expirationTtl: TTL_SECONDS });

  return { ok: true, improved: true, date, entries: top, count: top.length };
}
