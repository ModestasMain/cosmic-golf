// Shared utility: upsert an entry into a top-10 global leaderboard array.
// Returns the new sorted top-10 (already built — do NOT re-fetch from KV after calling this,
// KV reads can be stale for up to ~60s).
export function upsertGlobalEntry(stored, entry) {
  const idx = stored.findIndex(e => e.sessionId === entry.sessionId);
  if (idx >= 0) {
    const old = stored[idx];
    if (entry.totalStrokes < old.totalStrokes ||
        (entry.totalStrokes === old.totalStrokes && entry.totalTime < old.totalTime)) {
      stored[idx] = entry;
    }
  } else {
    stored.push(entry);
  }
  stored.sort((a, b) => {
    const sd = a.totalStrokes - b.totalStrokes;
    return sd !== 0 ? sd : a.totalTime - b.totalTime;
  });
  return stored.slice(0, 10);
}
