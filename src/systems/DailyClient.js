// ============================================================
// DailyClient.js — Daily Hole board fetch / score submit.
// One hole per UTC day. Same seed for everyone. Last-best-wins.
// ============================================================

import { MULTIPLAYER } from '../core/Constants.js';

const BASE = `https://${MULTIPLAYER.MP_HOST}`;

export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

export function dailySeed(date = todayUTC()) {
  return `DAILY-${date}`;
}

export function secondsUntilNextUTCDay() {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0
  ));
  return Math.max(0, Math.floor((next - now) / 1000));
}

export async function fetchDailyBoard(date = todayUTC()) {
  try {
    const res = await fetch(`${BASE}/api/daily/${date}`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[daily] fetch failed', err);
    return { date, entries: [], count: 0, error: true };
  }
}

export async function submitDailyScore({ date = todayUTC(), name, strokes, time }) {
  try {
    const res = await fetch(`${BASE}/api/daily/${date}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, strokes, time }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data?.ok !== false, ...data };
  } catch (err) {
    console.warn('[daily] submit failed', err);
    return { ok: false, error: String(err) };
  }
}
