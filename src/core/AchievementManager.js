// ============================================================
// AchievementManager.js — persistent achievement tracking per device
// Uses device fingerprint + localStorage to prevent re-unlocking
// ============================================================

import { eventBus, Events } from './EventBus.js';
import { gameState } from './GameState.js';
import { HOLE, AIM } from './Constants.js';

const STORAGE_KEY = 'cosmic-golf-achievements-v2';

function getDeviceId() {
  try {
    let id = localStorage.getItem('cosmic-golf-device-id');
    if (id) return id;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillText('fingerprint', 2, 2);
    const dataStr = canvas.toDataURL();
    let hash = 0;
    for (let i = 0; i < dataStr.length; i++) hash = ((hash << 5) - hash + dataStr.charCodeAt(i)) | 0;
    const fp = [
      Math.abs(hash).toString(36),
      screen.width, screen.height,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.language,
    ].join('-');
    id = 'dev_' + fp;
    localStorage.setItem('cosmic-golf-device-id', id);
    return id;
  } catch {
    return 'dev_unknown';
  }
}

const ACHIEVEMENTS = {
  HOLE_IN_ONE:       { id: 'HOLE_IN_ONE',       name: 'Hole In One!',        desc: 'Sink it in a single stroke',           icon: '🏌️' },
  FULL_POWER:        { id: 'FULL_POWER',         name: 'Full Power Shot',     desc: 'Shoot with maximum power',             icon: '💪' },
  WORMHOLE:          { id: 'WORMHOLE',           name: 'Wormhole Rider',      desc: 'Travel through a wormhole',            icon: '🌀' },
  UNDER_5_STROKES:   { id: 'UNDER_5_STROKES',    name: 'Precision Golfer',    desc: 'Finish a game under 5 total strokes',  icon: '🎯' },
  UNDER_10_STROKES:  { id: 'UNDER_10_STROKES',   name: 'Cosmic Pro',          desc: 'Finish a game under 10 total strokes', icon: '⭐' },
  OVER_15_STROKES:   { id: 'OVER_15_STROKES',    name: 'Cosmic Struggler',    desc: 'Finish a game with 15+ total strokes', icon: '😅' },
  HOLE_1:            { id: 'HOLE_1',             name: 'First Orbit',         desc: 'Complete Hole 1',                      icon: '🪐' },
  HOLE_2:            { id: 'HOLE_2',             name: 'Binary Star',         desc: 'Complete Hole 2',                      icon: '✨' },
  HOLE_3:            { id: 'HOLE_3',             name: 'Asteroid Belt',       desc: 'Complete Hole 3',                      icon: '☄️' },
  HOLE_4:            { id: 'HOLE_4',             name: 'Nebula Drift',        desc: 'Complete Hole 4',                      icon: '🌫️' },
  HOLE_5:            { id: 'HOLE_5',             name: 'Deep Space',          desc: 'Complete Hole 5',                      icon: '🌌' },
  HOLE_6:            { id: 'HOLE_6',             name: 'Supernova',           desc: 'Complete Hole 6',                      icon: '💥' },
  HOLE_7:            { id: 'HOLE_7',             name: 'Pulsar',              desc: 'Complete Hole 7',                      icon: '📡' },
  HOLE_8:            { id: 'HOLE_8',             name: 'Quasar',              desc: 'Complete Hole 8',                      icon: '🔭' },
  HOLE_9:            { id: 'HOLE_9',             name: 'Dark Matter',         desc: 'Complete Hole 9',                      icon: '🕳️' },
  HOLE_10:           { id: 'HOLE_10',            name: 'Singularity',         desc: 'Complete Hole 10',                     icon: '⚛️' },
  HIT_PLAYER:        { id: 'HIT_PLAYER',         name: 'Billiard!',           desc: 'Hit another player with your ball',    icon: '🎱' },
  OUT_OF_BOUNDS:     { id: 'OUT_OF_BOUNDS',      name: 'Lost In Space',      desc: 'Go out of bounds',                     icon: '🚀' },
  FIRST_PLAY:        { id: 'FIRST_PLAY',         name: 'Welcome to Cosmic Golf', desc: 'Play for the first time',              icon: '👋' },
  MARATHON:          { id: 'MARATHON',            name: 'Marathon Runner',     desc: 'Complete all 10 holes',                icon: '🏅' },
  BOUNCER:           { id: 'BOUNCER',             name: 'Pinball Wizard',      desc: '3+ planet bounces in one shot',        icon: '🎰' },
  SPEED_DEMON:       { id: 'SPEED_DEMON',         name: 'Speed Demon',         desc: 'Finish a hole in under 3 seconds',      icon: '⚡' },
  BILLIARD_PRO:      { id: 'BILLIARD_PRO',        name: 'Billiard Pro',         desc: 'Hit 3 different players',              icon: '🏆' },
  COMEBACK_KING:     { id: 'COMEBACK_KING',       name: 'Comeback King',        desc: 'Complete a hole after 3+ OOBs',       icon: '👑' },
  SHARPSHOOTER:      { id: 'SHARPSHOOTER',        name: 'Sharpshooter',         desc: '3 hole-in-ones in one game',          icon: '🎖️' },
};

export class AchievementManager {
  constructor() {
    this._deviceId = getDeviceId();
    this._unlocked = this._load();
    this._toastCallback = null;
    this._billiardHitsThisShot = new Set();
    this._oobsThisHole = 0;
    this._holeInOnesThisGame = 0;
    this._bounceCountThisShot = 0;

    this._setupListeners();
  }

  onToast(callback) {
    this._toastCallback = callback;
  }

  init() {
    if (this._pendingFirstPlay) {
      this._pendingFirstPlay = false;
    }
  }

  reset() {
    this._unlocked = new Set();
    this._save();
  }

  onToast(callback) {
    this._toastCallback = callback;
  }

  tryUnlock(id) {
    if (this._unlocked.has(id)) return false;
    const def = ACHIEVEMENTS[id];
    if (!def) return false;
    this._unlocked.add(id);
    this._save();
    if (this._toastCallback) this._toastCallback(def);
    return true;
  }

  getUnlocked() {
    return [...this._unlocked].map(id => ACHIEVEMENTS[id]).filter(Boolean);
  }

  getAll() {
    return Object.values(ACHIEVEMENTS).map(a => ({
      ...a,
      unlocked: this._unlocked.has(a.id),
    }));
  }

  _setupListeners() {
    eventBus.on(Events.CINEMATIC_COMPLETE, () => {
      this.tryUnlock('FIRST_PLAY');
    });

    eventBus.on(Events.BALL_HOLED, ({ strokes }) => {
      if (strokes === 1) {
        this.tryUnlock('HOLE_IN_ONE');
        this._holeInOnesThisGame++;
        if (this._holeInOnesThisGame >= 3) this.tryUnlock('SHARPSHOOTER');
      }
    });

    eventBus.on(Events.AIM_POWER_UPDATE, ({ power }) => {
      if (power >= 0.97) this.tryUnlock('FULL_POWER');
    });

    eventBus.on(Events.WORMHOLE_ENTER, () => {
      this.tryUnlock('WORMHOLE');
    });

    eventBus.on(Events.HOLE_COMPLETE, ({ holeIndex }) => {
      const holeId = `HOLE_${holeIndex + 1}`;
      this.tryUnlock(holeId);

      const player = gameState.players[0];
      if (player && player.holeTimes[holeIndex] != null && player.holeTimes[holeIndex] < 3000) {
        this.tryUnlock('SPEED_DEMON');
      }

      if (this._oobsThisHole >= 3) this.tryUnlock('COMEBACK_KING');
      this._oobsThisHole = 0;
      this._bounceCountThisShot = 0;
    });

    eventBus.on(Events.GAME_COMPLETE, () => {
      const player = gameState.players[0];
      if (!player) return;
      const total = player.strokes.reduce((s, v) => s + (v || 0), 0);
      if (total < 5) this.tryUnlock('UNDER_5_STROKES');
      if (total < 10) this.tryUnlock('UNDER_10_STROKES');
      if (total >= 15) this.tryUnlock('OVER_15_STROKES');

      const completed = player.strokes.filter(v => v != null).length;
      if (completed >= HOLE.COUNT) this.tryUnlock('MARATHON');
    });

    eventBus.on(Events.BILLIARD_HIT, ({ targetId, ownGoal }) => {
      if (!ownGoal) {
        this.tryUnlock('HIT_PLAYER');
        if (targetId) {
          this._billiardHitsThisShot.add(targetId);
          if (this._billiardHitsThisShot.size >= 3) this.tryUnlock('BILLIARD_PRO');
        }
      }
    });

    eventBus.on(Events.BALL_OUT_OF_BOUNDS, () => {
      this.tryUnlock('OUT_OF_BOUNDS');
      this._oobsThisHole++;
    });

    eventBus.on(Events.BALL_BOUNCED, () => {
      this._bounceCountThisShot++;
      if (this._bounceCountThisShot >= 3) this.tryUnlock('BOUNCER');
    });

    eventBus.on(Events.SHOT_TAKEN, () => {
      this._bounceCountThisShot = 0;
      this._billiardHitsThisShot.clear();
    });

    eventBus.on('game:restart', () => {
      this._holeInOnesThisGame = 0;
      this._oobsThisHole = 0;
      this._bounceCountThisShot = 0;
      this._billiardHitsThisShot.clear();
    });
  }

  _load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!data || !data[this._deviceId]) return new Set();
      return new Set(data[this._deviceId]);
    } catch {
      return new Set();
    }
  }

  _save() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      data[this._deviceId] = [...this._unlocked];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }
}
