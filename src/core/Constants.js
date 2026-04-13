// ============================================================
// Constants.js — ALL magic numbers, balance values, config
// ============================================================

export const PHYSICS = {
  GRAVITY_STRENGTH: 260,   // reduced — ball can navigate around planets without getting trapped
  BALL_MASS: 1,
  BOUNCE_DAMPING: 0.25,    // 25% velocity retained on bounce — settles fast
  VELOCITY_DAMPING: 0.994, // stronger drag — orbital energy decays quickly
  MAX_SPEED: 780,
  BOUNCE_COOLDOWN_MS: 300, // min ms between BALL_BOUNCED events (prevents audio spam)
  REST_VELOCITY: 3.0,      // speed below which ball is considered at rest
  STUCK_FRAMES: 80,        // frames near planet surface before forcing IDLE
  LAUNCH_GRACE_FRAMES: 35, // frames after shot where gravity ramps from 0 → full
};

export const BALL = {
  RADIUS: 3.2,
};

export const AIM = {
  MAX_POWER: 800,          // deeper holes need more range
  MAX_DRAG_DISTANCE: 120,  // px
  TRAJECTORY_STEPS: 160,
  TRAJECTORY_DT: 0.016,
};

export const HOLE = {
  COUNT: 10,
  PLANETS_MIN: 8,
  PLANETS_MAX: 14,
  TEE_RADIUS: 3,
  CUP_RADIUS: 20,
  CUP_SPEED_THRESHOLD: 180,
  OUT_OF_BOUNDS_DISTANCE: 4500, // wider world needs bigger hard limit
  OUT_OF_BOUNDS_PENALTY: 2,
  // Void detection — ball escaping the planet cluster
  VOID_OOB_SURFACE_DIST: 950,  // units from nearest planet *surface* — beyond this = deep space = OOB
  VOID_DRIFT_SPEED: 28,
  // Zero-gravity void: ball floating farther than this from any planet surface for too long → OOB
  VOID_ZERO_G_SURFACE_DIST: 250,
  VOID_ZERO_G_GRACE_FRAMES: 120, // ~2 s at 60 fps
  VOID_ZERO_G_SLOW_DIST: 150,    // if ball is this far from surface AND slow → instant OOB
  VOID_ZERO_G_SLOW_SPEED: 15,    // speed threshold for slow drift in zero-g
  BLACK_HOLE_PULL_RADIUS: 90,
  BLACK_HOLE_GRAVITY: 60,
};

export const PLANET = {
  RADIUS_MIN: 20,
  RADIUS_MAX: 56,
  MASS_FACTOR: 0.055,
};

export const CAMERA = {
  FOV: 60,
  NEAR: 0.1,
  FAR: 9500,
  FOLLOW_LERP: 0.07,
  DIR_LERP: 0.04,
  FOLLOW_DISTANCE: 130,
  FOLLOW_HEIGHT: 24,
  AIM_LERP: 0.12,
};

export const STARFIELD = {
  COUNT: 4500,
  RADIUS: 9000,
};

export const MULTIPLAYER = {
  MP_HOST: 'cosmic-golf-mp.cosmicgolf.workers.dev',
  PUBLIC_ROOM: 'PUBLIC',
  MAX_PLAYERS: 24,
  MAX_PUBLIC_SLOTS: 9999, // PUBLIC → PUBLIC_2 … effectively unlimited (Durable Objects are free/lazy)
  PLAYER_COLORS: [
    0xffffff, 0xff6464, 0x64ff96, 0x64c8ff,
    0xffdc64, 0xff64c8, 0xff9632, 0xc864ff,
    0x64ffdc, 0xff3232, 0x32ff64, 0x3296ff,
    0xff32c8, 0xc8ff32, 0x32c8ff, 0xffc832,
    0xc832ff, 0x32ffc8, 0xff6432, 0x64ff64,
    0x6464ff, 0xff6496, 0x96ff64, 0x64ffff,
  ],
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
  CLUSTER_SPREAD: 900,  // deep holes — tee→cup ≈ 2100–2700 units, 2-4 shots per hole
  CLUSTER_OFFSET: 320,  // push cluster further from origin
};

export const SERVER_EVENTS = {
  INTERVAL_MS: 90_000, // new event every 90 seconds
  TYPES: ['ZERO_GRAVITY', 'MAP_FLIP', 'STATIC', 'ASTEROID_STORM'],
};

export const ORBIT = {
  CAPTURE_HOLD_SECS:   1.5,    // seconds to hold before entering orbit
  EXIT_HOLD_SECS:      1.5,    // seconds to hold before slingshot exit
  MAX_ORBITS:          2,      // max full revolutions before forced exit
  ORBIT_SPEED:         1.8,    // radians per second base orbit speed
  ORBIT_RADIUS_OFFSET: 6,     // units above planet surface for orbit path
  SLINGSHOT_SPEED:     420,    // launch velocity on slingshot exit
  DRAG_SPEED_SENS:     0.4,    // how much left/right drag adjusts orbit speed
  DRAG_RADIUS_SENS:    0.15,  // how much left/right drag adjusts orbit radius
  BOUNCE_THRESHOLD:    3,      // bounces on same planet before glue activates
};

export const COLLECTIBLE = {
  COLLECT_RADIUS:     6,
  GRAVITY_BOOT_DUR:   7,  // seconds
  SPEED_CRYSTAL_DUR:  6,
  SHIELD_DUR:        30,  // lasts until next OOB or 30s
  SPEED_MULTIPLIER:   1.6,
  HOVER_AMPLITUDE:    2.5,
  HOVER_SPEED:        1.2,
};
