const MAX_ENTRIES = 10;

function storageKey(roomCode) {
  return `cosmic-golf-lb-${roomCode || 'solo'}`;
}

export function padArray(arr, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(arr[i] ?? null);
  return out;
}

function getHolesCompleted(entry) {
  if (entry.holesCompleted != null) return entry.holesCompleted;
  if (!entry.strokes) return 0;
  return entry.strokes.filter(v => v != null).length;
}

function sortEntries(a, b) {
  const hd = getHolesCompleted(b) - getHolesCompleted(a);
  if (hd !== 0) return hd;
  const sd = a.totalStrokes - b.totalStrokes;
  if (sd !== 0) return sd;
  return a.totalTime - b.totalTime;
}

export const leaderboardStore = {
  load(roomCode) {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey(roomCode)));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  save(roomCode, entries) {
    localStorage.setItem(storageKey(roomCode), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  },

  upsertEntry(roomCode, name, strokes, holeTimes, sessionId) {
    const holesCompleted = strokes.filter(v => v != null).length;
    const totalStrokes = strokes.reduce((s, v) => s + (v || 0), 0);
    const totalTime = holeTimes.reduce((s, v) => s + (v || 0), 0);
    const sid = sessionId || String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
    const entry = { name, strokes: padArray(strokes, 10), holeTimes: padArray(holeTimes, 10), holesCompleted, totalStrokes, totalTime, sessionId: sid };

    const entries = this.load(roomCode);
    const existing = entries.findIndex(e => e.sessionId === sid);
    if (existing >= 0) {
      entries[existing] = entry;
    } else {
      entries.push(entry);
    }

    entries.sort(sortEntries);
    this.save(roomCode, entries);
    return sid;
  },

  findPlayerRank(roomCode, holesCompleted, totalStrokes, totalTime) {
    const entries = this.load(roomCode);
    const sorted = [...entries].sort(sortEntries);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].holesCompleted === holesCompleted && sorted[i].totalStrokes === totalStrokes && sorted[i].totalTime === totalTime) {
        return i + 1;
      }
    }
    return sorted.length + 1;
  },

  formatTime(ms) {
    if (!ms) return '—';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    return `${m}:${String(rem).padStart(2, '0')}`;
  },
};
