// Shared utility: upsert an entry into a top-10 global leaderboard array.
// Returns the new sorted top-10 (already built — do NOT re-fetch from KV after calling this,
// KV reads can be stale for up to ~60s).

function getHolesCompleted(e) {
  if (typeof e.holesCompleted === 'number') return e.holesCompleted;
  if (Array.isArray(e.strokes)) return e.strokes.filter(s => s != null).length;
  return 0;
}

function sortEntries(a, b) {
  const hd = getHolesCompleted(b) - getHolesCompleted(a);
  if (hd !== 0) return hd;
  const sd = a.totalStrokes - b.totalStrokes;
  return sd !== 0 ? sd : a.totalTime - b.totalTime;
}

export function upsertGlobalEntry(stored, entry) {
  const idx = stored.findIndex(e => e.sessionId === entry.sessionId);
  if (idx >= 0) {
    const old = stored[idx];
    const oldHoles = getHolesCompleted(old);
    const newHoles = getHolesCompleted(entry);
    const oldHasStrokes = Array.isArray(old.strokes) && old.strokes.some(s => s != null);
    const newHasStrokes = Array.isArray(entry.strokes) && entry.strokes.some(s => s != null);
    // Update if: more holes completed, or same holes with better score, or gains stroke detail
    const moreHoles = newHoles > oldHoles;
    const betterScore = newHoles === oldHoles && (
      entry.totalStrokes < old.totalStrokes ||
      (entry.totalStrokes === old.totalStrokes && entry.totalTime < old.totalTime)
    );
    if (moreHoles || betterScore || (!oldHasStrokes && newHasStrokes)) {
      stored[idx] = entry;
    }
  } else {
    stored.push(entry);
  }
  stored.sort(sortEntries);
  return stored.slice(0, 10);
}
