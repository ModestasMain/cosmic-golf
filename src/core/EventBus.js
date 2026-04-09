// ============================================================
// EventBus.js — singleton pub/sub, domain:action naming
// ============================================================

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    this.on(event, wrapper);
  }

  off(event, callback) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) this.listeners.delete(event);
    }
  }

  emit(event, data) {
    const cbs = this.listeners.get(event);
    if (cbs) cbs.forEach(cb => {
      try { cb(data); } catch (e) { console.error(`EventBus error [${event}]:`, e); }
    });
  }

  clear(event) {
    event ? this.listeners.delete(event) : this.listeners.clear();
  }
}

export const eventBus = new EventBus();

export const Events = {
  // Shot events
  SHOT_TAKEN:         'shot:taken',       // { direction: Vector3, power: number }
  SHOT_RECEIVED:      'shot:received',    // { direction: Vector3, power: number, playerId }
  AIM_START:          'aim:start',
  AIM_UPDATE:         'aim:update',       // { dragScreenVec, dragDist } — direction phase
  AIM_DIR_LOCKED:     'aim:dir_locked',   // direction confirmed, power phase begins
  AIM_POWER_UPDATE:   'aim:power_update', // { power: 0-1 } — oscillating bar
  AIM_CANCEL:         'aim:cancel',

  // Ball events
  BALL_HOLED:         'ball:holed',       // { strokes: number }
  BALL_OUT_OF_BOUNDS: 'ball:oob',
  BALL_BOUNCED:       'ball:bounced',     // { position: Vector3 }
  BALL_RESET_TO_TEE:  'ball:reset_tee',
  BALL_POS_SYNC:      'ball:pos_sync',    // { pos, vel } — local ball state for broadcast
  BALL_STOPPED:       'ball:stopped',     // { pos, holeIndex } — local ball came to rest
  MP_BALL_STATE:      'mp:ball_state',    // { playerId, pos, vel, ts } — received from remote
  MP_BALL_STOPPED:    'mp:ball_stopped',  // { playerId, pos, holeIndex } — remote ball at rest

  // Hole events
  HOLE_COMPLETE:      'hole:complete',    // { holeIndex, strokes, players }
  HOLE_LOADED:        'hole:loaded',      // { holeIndex }
  NEXT_HOLE:          'hole:next',
  GAME_COMPLETE:      'game:complete',    // { players }

  // Multiplayer events
  MP_ROOM_CREATED:    'mp:room_created',   // { code }
  MP_PLAYER_JOINED:   'mp:player_joined',  // { playerId, name, color }
  MP_PLAYER_LEFT:     'mp:player_left',    // { playerId }
  MP_SOLO_MODE:       'mp:solo',
  MP_HOLE_COMPLETE:   'mp:hole_complete',  // { playerId, strokes }
  MP_HOLE_TIMER:      'mp:hole_timer',     // { remaining } — countdown seconds
  MP_LOBBY_STATE:     'mp:lobby_state',    // { phase, countdown, playerCount }
  MP_GAME_START:      'mp:game_start',     // server confirmed game is starting
  MP_ROOM_LOCKED:     'mp:room_locked',    // tried to join but game already running
  MP_HOLE_TIMER_SYNC: 'mp:hole_timer_sync',// { startedAt } — wall-clock ms when timer started
  MP_HOLE_ADVANCE:    'mp:hole_advance',   // all clients must advance to next hole now
  NEXT_HOLE_READY:    'hole:next_ready',   // { playerId } — this player pressed Next Hole
  NEXT_HOLE_ADVANCE:  'hole:next_advance', // force everyone to next hole now

  // Audio
  AUDIO_MUTE_TOGGLE:      'audio:mute_toggle',
  BLACK_HOLE_PROXIMITY:   'audio:black_hole_proximity', // { proximity: 0-1 }
  AIM_POWER_LOCKED:       'aim:power_locked',           // { power: 0-1 }

  // Portal
  PORTAL_ENTER:       'portal:enter',

  // Wormhole
  WORMHOLE_ENTER:     'wormhole:enter', // { position: Vector3 }
};
