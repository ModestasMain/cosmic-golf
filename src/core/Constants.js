// ============================================================
// Constants.js — ALL magic numbers, balance values, config
// ============================================================

export const PHYSICS = {
  GRAVITY_STRENGTH: 420,   // stronger pull — ball drawn in, fewer long orbits
  BALL_MASS: 1,
  BOUNCE_DAMPING: 0.25,    // 25% velocity retained on bounce — settles fast
  VELOCITY_DAMPING: 0.994, // stronger drag — orbital energy decays quickly
  MAX_SPEED: 400,
  BOUNCE_COOLDOWN_MS: 300, // min ms between BALL_BOUNCED events (prevents audio spam)
  REST_VELOCITY: 3.0,      // speed below which ball is considered at rest
  STUCK_FRAMES: 80,        // frames near planet surface before forcing IDLE
  LAUNCH_GRACE_FRAMES: 35, // frames after shot where gravity ramps from 0 → full
};

export const BALL = {
  RADIUS: 0.8,
};

export const AIM = {
  MAX_POWER: 320,          // bigger world needs more range
  MAX_DRAG_DISTANCE: 120,  // px
  TRAJECTORY_STEPS: 160,
  TRAJECTORY_DT: 0.016,
};

export const HOLE = {
  COUNT: 5,
  PLANETS_MIN: 5,
  PLANETS_MAX: 8,
  TEE_RADIUS: 1.5,
  CUP_RADIUS: 8,
  CUP_SPEED_THRESHOLD: 80,
  OUT_OF_BOUNDS_DISTANCE: 450,
  OUT_OF_BOUNDS_PENALTY: 2,
  BLACK_HOLE_PULL_RADIUS: 45,  // units — beyond this, no pull at all
  BLACK_HOLE_GRAVITY: 60,      // much weaker than planet gravity (420)
};

export const PLANET = {
  RADIUS_MIN: 10,
  RADIUS_MAX: 28,
  MASS_FACTOR: 0.08,
};

export const CAMERA = {
  FOV: 70,
  NEAR: 0.1,
  FAR: 3000,
  FOLLOW_LERP: 0.07,
  DIR_LERP: 0.04,
  FOLLOW_DISTANCE: 65,  // pulled back — world feels bigger
  FOLLOW_HEIGHT: 12,
  AIM_LERP: 0.12,
};

export const STARFIELD = {
  COUNT: 3500,
  RADIUS: 1200,
};

export const MULTIPLAYER = {
  ROOM_JOIN_TIMEOUT_MS: 10000,
  MP_HOST: 'cosmic-golf-mp.modestasmain.workers.dev',
};

export const COLOR_PALETTES = [
  // 0: Pastel
  {
    name: 'PASTEL FIELDS',
    bg: 0x0a0614,
    planets: [0xffb3c6, 0xc8b6ff, 0xb5ead7, 0xffdac1, 0xbde0fe],
    ball: 0xffffff,
    cup: 0xffb3c6,
    stars: 0xffd6e7,
    ambient: 0x2a1a35,
    dirLight: 0xffe8f4,
  },
  // 1: Neon
  {
    name: 'NEON GRID',
    bg: 0x000814,
    planets: [0x00f5ff, 0xff006e, 0xc8ff00, 0x7b2fff, 0xff9500],
    ball: 0xffffff,
    cup: 0x00f5ff,
    stars: 0x80ffff,
    ambient: 0x001030,
    dirLight: 0x80f0ff,
  },
  // 2: Warm
  {
    name: 'SOLAR WINDS',
    bg: 0x0d0500,
    planets: [0xff6b35, 0xffd700, 0xff4500, 0xffa500, 0xffec8b],
    ball: 0xfff8dc,
    cup: 0xffd700,
    stars: 0xffe4b5,
    ambient: 0x200a00,
    dirLight: 0xffd580,
  },
  // 3: Deep
  {
    name: 'DEEP SPACE',
    bg: 0x00010f,
    planets: [0x1a237e, 0x4a148c, 0x1b5e20, 0x006064, 0x37474f],
    ball: 0xb0c4de,
    cup: 0x4fc3f7,
    stars: 0x4fc3f7,
    ambient: 0x050520,
    dirLight: 0x6090c0,
  },
  // 4: Cosmic Finale
  {
    name: 'COSMIC FINALE',
    bg: 0x040015,
    planets: [0x9c27b0, 0x00bcd4, 0xe91e63, 0x7c4dff, 0xffffff],
    ball: 0xffffff,
    cup: 0xffd700,
    stars: 0xffffff,
    ambient: 0x100025,
    dirLight: 0xd0a0ff,
  },
];

export const WORLD = {
  CLUSTER_SPREAD: 200,  // much bigger — planets scattered over a wide area
  CLUSTER_OFFSET: 80,   // push cluster further from origin
};
