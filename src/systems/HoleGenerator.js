// ============================================================
// HoleGenerator.js — 15 distinct hole archetypes
//
// Holes 1–9 now follow a deterministic progression curve instead
// of a fully shuffled order. Each slot draws from a curated
// archetype pool, then rerolls until the generated layout fits a
// target band for:
//   • brute-force resistance
//   • shot planning complexity
//   • punishment / recovery
//   • clarity
//
// Determinism guarantee: generateHole(i, roomCode) returns the
// same layout on every client in the same room.
// ============================================================

import { Vector3 } from 'three';
import { PLANET, HOLE, WORLD, COLOR_PALETTES, WORLDEATER } from '../core/Constants.js';

// ── RNG ────────────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash — converts a room code string to a uint32 seed */
function hashRoomCode(code) {
  if (!code || typeof code !== 'string') return 0x12345678;
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Fisher-Yates shuffle in place using seeded rng */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Archetype catalogue ────────────────────────────────────────
const ARCHETYPE_LIST = [
  'GAUNTLET',      // many planets squarely in the path
  'ASTEROID_BELT', // ring of tiny planets around midpoint
  'TWIN_GIANTS',   // two massive flanking planets force a slingshot
  'LABYRINTH',     // dense maze of medium planets
  'SPIRAL',        // planets wound in a helix from tee to cup
  'ORBIT_TRAP',    // cup hugs a large planet's surface
  'PINBALL',       // chaotic tight cluster of small planets
  'SLINGSHOT',     // two huge side masses, must arc around them
  'VOID_CROSSING', // sparse epic-scale layout, massive planets
  'GRAVITY_RING',  // planets evenly spaced in a ring
  'CANYON',        // two parallel planet walls flanking corridor
  'CLUSTER_BOMB',  // tight central cluster, tee/cup on the edges
  'CROSSROADS',    // perpendicular wall of planets crosses the path
  'HELIX',         // planets alternate above/below along corridor
  'SCATTER',       // classic random but 10-13 planets
];

const PRE_BOSS_HOLE_COUNT = HOLE.COUNT - 1;

const ARCHETYPE_PROFILES = {
  GAUNTLET:      { bruteForceResistance: 14, stagingRequirement: 7,  approachDependency: 6,  speedSensitivity: 8,  punishment: 8,  clarity: 80 },
  ASTEROID_BELT: { bruteForceResistance:  8, stagingRequirement: 4,  approachDependency: 4,  speedSensitivity: 5,  punishment: 4,  clarity: 88 },
  TWIN_GIANTS:   { bruteForceResistance: 14, stagingRequirement: 9,  approachDependency: 7,  speedSensitivity: 9,  punishment: 8,  clarity: 82 },
  LABYRINTH:     { bruteForceResistance: 18, stagingRequirement: 10, approachDependency: 8,  speedSensitivity: 10, punishment: 11, clarity: 68 },
  SPIRAL:        { bruteForceResistance: 11, stagingRequirement: 6,  approachDependency: 7,  speedSensitivity: 8,  punishment: 6,  clarity: 82 },
  ORBIT_TRAP:    { bruteForceResistance: 14, stagingRequirement: 5,  approachDependency: 12, speedSensitivity: 10, punishment: 9,  clarity: 84 },
  PINBALL:       { bruteForceResistance: 18, stagingRequirement: 9,  approachDependency: 7,  speedSensitivity: 11, punishment: 12, clarity: 64 },
  SLINGSHOT:     { bruteForceResistance: 15, stagingRequirement: 10, approachDependency: 8,  speedSensitivity: 10, punishment: 8,  clarity: 82 },
  VOID_CROSSING: { bruteForceResistance:  7, stagingRequirement: 4,  approachDependency: 5,  speedSensitivity: 4,  punishment: 6,  clarity: 92 },
  GRAVITY_RING:  { bruteForceResistance: 15, stagingRequirement: 8,  approachDependency: 10, speedSensitivity: 10, punishment: 9,  clarity: 74 },
  CANYON:        { bruteForceResistance: 11, stagingRequirement: 5,  approachDependency: 6,  speedSensitivity: 8,  punishment: 6,  clarity: 88 },
  CLUSTER_BOMB:  { bruteForceResistance: 18, stagingRequirement: 9,  approachDependency: 8,  speedSensitivity: 10, punishment: 12, clarity: 66 },
  CROSSROADS:    { bruteForceResistance: 10, stagingRequirement: 5,  approachDependency: 6,  speedSensitivity: 6,  punishment: 5,  clarity: 90 },
  HELIX:         { bruteForceResistance: 14, stagingRequirement: 7,  approachDependency: 8,  speedSensitivity: 9,  punishment: 7,  clarity: 78 },
  SCATTER:       { bruteForceResistance: 16, stagingRequirement: 8,  approachDependency: 8,  speedSensitivity: 8,  punishment: 9,  clarity: 72 },
};

const PROGRESSION_SLOTS = [
  {
    label: 'Opening Line',
    archetypes: ['VOID_CROSSING', 'CROSSROADS', 'CANYON', 'ASTEROID_BELT'],
    wormholeChance: 0,
    target: { complexityMin: 18, complexityMax: 30, clarityMin: 84, bruteMin: 6,  bruteMax: 12, stagingMax: 6,  approachMax: 8,  speedMax: 8 },
  },
  {
    label: 'Power Read',
    archetypes: ['CANYON', 'ASTEROID_BELT', 'CROSSROADS', 'SPIRAL', 'GAUNTLET'],
    wormholeChance: 0,
    target: { complexityMin: 24, complexityMax: 36, clarityMin: 82, bruteMin: 8,  bruteMax: 14, stagingMax: 8,  approachMax: 9,  speedMax: 9 },
  },
  {
    label: 'First Setup',
    archetypes: ['GAUNTLET', 'SPIRAL', 'TWIN_GIANTS', 'CANYON', 'ASTEROID_BELT'],
    wormholeChance: 0.15,
    target: { complexityMin: 30, complexityMax: 42, clarityMin: 80, bruteMin: 10, bruteMax: 16, stagingMin: 4,  approachMax: 10, speedMin: 5 },
  },
  {
    label: 'Stage and Swing',
    archetypes: ['GAUNTLET', 'TWIN_GIANTS', 'SPIRAL', 'SLINGSHOT', 'HELIX', 'CROSSROADS'],
    wormholeChance: 0.25,
    target: { complexityMin: 36, complexityMax: 48, clarityMin: 78, bruteMin: 12, bruteMax: 18, stagingMin: 5,  approachMin: 5,  speedMin: 6 },
  },
  {
    label: 'Route Choice',
    archetypes: ['TWIN_GIANTS', 'SLINGSHOT', 'GRAVITY_RING', 'ORBIT_TRAP', 'HELIX', 'GAUNTLET'],
    wormholeChance: 0.45,
    target: { complexityMin: 44, complexityMax: 56, clarityMin: 76, bruteMin: 13, bruteMax: 20, stagingMin: 6,  approachMin: 6,  speedMin: 6 },
  },
  {
    label: 'Gravity Exam',
    archetypes: ['SLINGSHOT', 'GRAVITY_RING', 'ORBIT_TRAP', 'HELIX', 'SPIRAL', 'SCATTER'],
    wormholeChance: 0.55,
    target: { complexityMin: 50, complexityMax: 62, clarityMin: 74, bruteMin: 14, bruteMax: 22, stagingMin: 6,  approachMin: 7,  speedMin: 7 },
  },
  {
    label: 'No Brute Force',
    archetypes: ['GRAVITY_RING', 'ORBIT_TRAP', 'HELIX', 'LABYRINTH', 'SCATTER', 'SLINGSHOT'],
    wormholeChance: 0.65,
    target: { complexityMin: 58, complexityMax: 70, clarityMin: 70, bruteMin: 15, bruteMax: 24, stagingMin: 7,  approachMin: 8,  speedMin: 7 },
  },
  {
    label: 'Tight Approach',
    archetypes: ['LABYRINTH', 'PINBALL', 'CLUSTER_BOMB', 'SCATTER', 'GRAVITY_RING', 'HELIX'],
    wormholeChance: 0.75,
    target: { complexityMin: 64, complexityMax: 78, clarityMin: 68, bruteMin: 16, bruteMax: 26, stagingMin: 7,  approachMin: 9,  speedMin: 8 },
  },
  {
    label: 'Pre-Boss Exam',
    archetypes: ['LABYRINTH', 'PINBALL', 'CLUSTER_BOMB', 'SCATTER', 'SLINGSHOT', 'GRAVITY_RING', 'ORBIT_TRAP'],
    wormholeChance: 0.85,
    target: { complexityMin: 70, complexityMax: 86, clarityMin: 66, bruteMin: 17, bruteMax: 28, stagingMin: 8,  approachMin: 10, speedMin: 8, punishmentMin: 9 },
  },
];

// ── Shared geometry helpers ────────────────────────────────────

function placeTeeAndCup(rng, distMult = 1.0) {
  const center   = new Vector3(
    (rng() - 0.5) * WORLD.CLUSTER_OFFSET,
    0,
    (rng() - 0.5) * WORLD.CLUSTER_OFFSET,
  );
  const teeAngle = rng() * Math.PI * 2;
  // tee is ~1050–1350 from center — total tee↔cup distance ≈ 2100–2700
  const teeDist  = WORLD.CLUSTER_SPREAD * 0.95 * distMult + 180 + rng() * 240;
  const tee      = center.clone().add(new Vector3(
    Math.cos(teeAngle) * teeDist,
    (rng() - 0.5) * 120,
    Math.sin(teeAngle) * teeDist,
  ));
  // cup is roughly opposite, ±50° offset so it's never trivially straight
  const cupAngle = teeAngle + Math.PI + (rng() - 0.5) * 1.0;
  const cupDist  = WORLD.CLUSTER_SPREAD * 0.90 * distMult + 200 + rng() * 260;
  const cup      = center.clone().add(new Vector3(
    Math.cos(cupAngle) * cupDist,
    (rng() - 0.5) * 120,
    Math.sin(cupAngle) * cupDist,
  ));
  return { center, tee, cup };
}

function isValidPos(pos, taken, tee, cup, minSpacing) {
  if (taken.some(p => p.distanceTo(pos) < minSpacing)) return false;
  if (pos.distanceTo(tee) < PLANET.RADIUS_MAX * 2)     return false;
  if (pos.distanceTo(cup) < PLANET.RADIUS_MAX * 3)     return false;
  return true;
}

function buildPlanet(pos, rng, colors, idx, rMin = PLANET.RADIUS_MIN, rMax = PLANET.RADIUS_MAX) {
  const r    = rMin + rng() * (rMax - rMin);
  const mass = Math.pow(r, 3) * PLANET.MASS_FACTOR;
  return {
    position: pos.clone(),
    radius:   r,
    mass,
    color:    colors[idx % colors.length],
    seed:     Math.floor(rng() * 99999),
  };
}

/** Push cup away from any planet surface it ended up inside */
function finalizeCup(cup, planets) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const blocking = planets.find(p => cup.distanceTo(p.position) < p.radius + 66);
    if (!blocking) break;
    const away = new Vector3().subVectors(cup, blocking.position).normalize();
    cup.addScaledVector(away, blocking.radius + 66 - cup.distanceTo(blocking.position) + 24);
  }
}

// ── Utility: perp vector in XZ plane ─────────────────────────
function perpXZ(dir) {
  return new Vector3(-dir.z, 0, dir.x);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rangePenalty(value, min, max) {
  if (min != null && value < min) return min - value;
  if (max != null && value > max) return value - max;
  return 0;
}

function projectToSegment(point, start, seg, segLenSq) {
  const toPoint = new Vector3().subVectors(point, start);
  return clamp(segLenSq > 0 ? toPoint.dot(seg) / segLenSq : 0, 0, 1);
}

function analyzeHoleLayout(tee, cup, planets, wormholes, archetype) {
  const profile = ARCHETYPE_PROFILES[archetype] ?? {
    bruteForceResistance: 12,
    stagingRequirement: 6,
    approachDependency: 6,
    speedSensitivity: 6,
    punishment: 6,
    clarity: 80,
  };

  const seg = new Vector3().subVectors(cup, tee);
  const segLen = seg.length();
  const segLenSq = seg.lengthSq();
  const corridorBands = new Set();

  let directBlockers = 0;
  let corridorInfluencers = 0;
  let cupGuards = 0;
  let teeClutter = 0;
  let stagingAnchors = 0;
  let giantPlanets = 0;
  let densePairs = 0;

  for (const planet of planets) {
    const t = projectToSegment(planet.position, tee, seg, segLenSq);
    const closest = tee.clone().addScaledVector(seg, t);
    const centerDist = planet.position.distanceTo(closest);
    const surfaceDist = centerDist - planet.radius;

    if (planet.radius >= 46) giantPlanets += 1;

    if (surfaceDist < 220 && t > 0.06 && t < 0.94) {
      corridorInfluencers += 1;
      corridorBands.add(Math.min(2, Math.floor(t * 3)));
    }

    if (surfaceDist < 120 && t > 0.08 && t < 0.92) {
      directBlockers += planet.radius >= 40 ? 2 : 1;
    }

    if (surfaceDist >= 150 && surfaceDist <= 390 && t > 0.18 && t < 0.74) {
      stagingAnchors += 1;
    }

    if (planet.position.distanceTo(cup) - planet.radius < 320) {
      cupGuards += 1;
    }

    if (planet.position.distanceTo(tee) - planet.radius < 250) {
      teeClutter += 1;
    }
  }

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      const gap = a.position.distanceTo(b.position) - (a.radius + b.radius);
      if (gap < 135) densePairs += 1;
    }
  }

  const wormholeBonus = wormholes.length > 0 ? 1 : 0;
  const corridorCoverage = corridorBands.size;

  const bruteForceResistance = clamp(Math.round(
    profile.bruteForceResistance
    + directBlockers * 2.0
    + Math.min(3, cupGuards) * 1.5
    + Math.max(0, corridorCoverage - 1) * 2
    + (segLen > 2350 ? 1 : 0)
  ), 0, 30);

  const stagingRequirement = clamp(Math.round(
    profile.stagingRequirement
    + Math.min(4, stagingAnchors) * 1.25
    + Math.max(0, corridorCoverage - 1) * 1.5
    + (directBlockers >= 4 ? 2 : 0)
    + wormholeBonus
  ), 0, 15);

  const approachDependency = clamp(Math.round(
    profile.approachDependency
    + Math.min(4, cupGuards) * 2
    + (directBlockers >= 5 ? 1 : 0)
  ), 0, 15);

  const speedSensitivity = clamp(Math.round(
    profile.speedSensitivity
    + corridorInfluencers * 0.55
    + corridorCoverage * 1.8
    + (segLen > 2350 ? 1 : 0)
    + wormholeBonus
  ), 0, 15);

  const punishment = clamp(Math.round(
    profile.punishment
    + Math.max(0, directBlockers - 3) * 1.6
    + Math.max(0, giantPlanets - 2) * 0.8
    + wormholeBonus
    + Math.max(0, planets.length - 13) * 0.4
  ), 0, 25);

  const clarity = clamp(Math.round(
    profile.clarity
    - teeClutter * 3.5
    - densePairs * 2.2
    - Math.max(0, planets.length - 12) * 1.1
    - (wormholes.length > 0 && profile.clarity < 80 ? 2 : 0)
    + Math.max(0, 3 - Math.min(3, directBlockers)) * 1.5
  ), 0, 100);

  const complexity = clamp(
    bruteForceResistance + stagingRequirement + approachDependency + speedSensitivity + punishment,
    0,
    100,
  );

  return {
    complexity,
    clarity,
    bruteForceResistance,
    shotPlanning: stagingRequirement + approachDependency + speedSensitivity,
    stagingRequirement,
    approachDependency,
    speedSensitivity,
    punishment,
    diagnostics: {
      directBlockers,
      corridorInfluencers,
      corridorCoverage,
      cupGuards,
      teeClutter,
      stagingAnchors,
      giantPlanets,
      densePairs,
      wormholes: wormholes.length,
    },
  };
}

function fitsProgressionTarget(analysis, target) {
  return (
    analysis.complexity >= target.complexityMin &&
    analysis.complexity <= target.complexityMax &&
    analysis.clarity >= target.clarityMin &&
    (target.bruteMin == null || analysis.bruteForceResistance >= target.bruteMin) &&
    (target.bruteMax == null || analysis.bruteForceResistance <= target.bruteMax) &&
    (target.stagingMin == null || analysis.stagingRequirement >= target.stagingMin) &&
    (target.stagingMax == null || analysis.stagingRequirement <= target.stagingMax) &&
    (target.approachMin == null || analysis.approachDependency >= target.approachMin) &&
    (target.approachMax == null || analysis.approachDependency <= target.approachMax) &&
    (target.speedMin == null || analysis.speedSensitivity >= target.speedMin) &&
    (target.speedMax == null || analysis.speedSensitivity <= target.speedMax) &&
    (target.punishmentMin == null || analysis.punishment >= target.punishmentMin) &&
    (target.punishmentMax == null || analysis.punishment <= target.punishmentMax)
  );
}

function progressionPenalty(analysis, target) {
  return (
    rangePenalty(analysis.complexity, target.complexityMin, target.complexityMax) * 3 +
    rangePenalty(analysis.clarity, target.clarityMin, null) * 4 +
    rangePenalty(analysis.bruteForceResistance, target.bruteMin, target.bruteMax) * 3 +
    rangePenalty(analysis.stagingRequirement, target.stagingMin, target.stagingMax) * 2 +
    rangePenalty(analysis.approachDependency, target.approachMin, target.approachMax) * 2 +
    rangePenalty(analysis.speedSensitivity, target.speedMin, target.speedMax) * 2 +
    rangePenalty(analysis.punishment, target.punishmentMin, target.punishmentMax) * 2
  );
}

function getRunArchetypePlan(roomHashSeed) {
  const used = new Set();
  const plan = [];

  for (let holeIndex = 0; holeIndex < PRE_BOSS_HOLE_COUNT; holeIndex++) {
    const slot = PROGRESSION_SLOTS[holeIndex];
    const rng = mulberry32((roomHashSeed ^ Math.imul(holeIndex + 1, 0x7feb352d) ^ 0x68bc21eb) >>> 0);
    const order = shuffle([...slot.archetypes], rng);
    const primary = order.find(name => !used.has(name)) ?? order[0];
    used.add(primary);
    plan.push([primary, ...order.filter(name => name !== primary)]);
  }

  return plan;
}

/**
 * Push overlapping planets apart until none intersect (radius-aware).
 * Must be called before returning from every archetype generator.
 */
function deoverlapPlanets(planets, iterations = 30) {
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const pa = planets[i], pb = planets[j];
        const minDist = pa.radius + pb.radius + 165; // 165-unit gap — prevents merged gravity wells
        const d = pa.position.distanceTo(pb.position);
        if (d < minDist && d > 0.001) {
          const away = new Vector3().subVectors(pb.position, pa.position).normalize();
          const push = (minDist - d) * 0.55;
          pa.position.addScaledVector(away, -push);
          pb.position.addScaledVector(away,  push);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Place large guardian planets that block the direct tee→cup corridor.
 * Every archetype calls this to guarantee the straight path is never free.
 */
function addGuardPlanets(planets, taken, tee, cup, rng, colors, count = 3) {
  const dir  = new Vector3().subVectors(cup, tee).normalize();
  const perp = perpXZ(dir);
  for (let i = 0; i < count; i++) {
    // Stagger guards along the path: first at 30%, second at 60%
    const t    = 0.28 + (i / count) * 0.44 + (rng() - 0.5) * 0.10;
    const side = (rng() - 0.5) * 165; // slight offset so they're not dead-center
    for (let a = 0; a < 100; a++) {
      const pos = new Vector3().lerpVectors(tee, cup, t)
        .addScaledVector(perp, side + (rng() - 0.5) * 66)
        .add(new Vector3(0, (rng() - 0.5) * 114, 0));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) {
        taken.push(pos);
        planets.push(buildPlanet(pos, rng, colors, planets.length, 36, 56));
        break;
      }
    }
  }
}

// ================================================================
// ARCHETYPE GENERATORS
// Each returns { planets: Array<PlanetData>, tee: Vector3, cup: Vector3 }
// ================================================================

/** GAUNTLET — 8-11 planets squarely blocking the direct path, must thread the gaps */
function genGAUNTLET(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const dir  = new Vector3().subVectors(cup, tee).normalize();
  const perp = perpXZ(dir);
  const count = 8 + Math.floor(rng() * 4);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    const t    = 0.12 + (i / count) * 0.76 + (rng() - 0.5) * 0.04;
    const side = (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 0.12; // very narrow offset
    let pos;
    for (let a = 0; a < 100; a++) {
      pos = new Vector3().lerpVectors(tee, cup, t)
        .addScaledVector(perp, side + (rng() - 0.5) * 10)
        .add(new Vector3(0, (rng() - 0.5) * 56, 0));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 28, 52));
  }

  // 4-5 flanking planets to fill the space
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 300 + rng() * WORLD.CLUSTER_SPREAD * 0.7;
    const pos   = new Vector3(
      Math.cos(angle) * r,
      (rng() - 0.5) * 180,
      Math.sin(angle) * r,
    ).add(center);
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** ASTEROID_BELT — ring of 9-12 small planets around the midpoint */
function genASTEROID_BELT(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const mid        = new Vector3().lerpVectors(tee, cup, 0.5);
  const ringRadius = 300 + rng() * 180;
  const count      = 14 + Math.floor(rng() * 6);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    let pos;
    for (let a = 0; a < 60; a++) {
      const r = ringRadius + (rng() - 0.5) * 54;
      pos = mid.clone().add(new Vector3(
        Math.cos(angle) * r,
        (rng() - 0.5) * 120,
        Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 10, 26)); // tiny asteroids
  }

  // 3 large anchor planets outside the ring
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = ringRadius * 1.9 + rng() * 165;
    const pos   = mid.clone().add(new Vector3(
      Math.cos(angle) * r,
      (rng() - 0.5) * 120,
      Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 40, 56));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** TWIN_GIANTS — two massive planets flank the corridor; gravity slingshot required */
function genTWIN_GIANTS(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng, 1.0);
  const dir   = new Vector3().subVectors(cup, tee).normalize();
  const perp  = perpXZ(dir);
  const mid   = new Vector3().lerpVectors(tee, cup, 0.45 + rng() * 0.1);
  const taken = [], planets = [];

  // The two giants
  for (const side of [-1, 1]) {
    const dist = 180 + rng() * 90;
    const pos  = mid.clone()
      .addScaledVector(perp, side * dist)
      .add(new Vector3(0, (rng() - 0.5) * 60, 0));
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, planets.length, 46, 56));
  }

  // 7-10 smaller scattered planets
  const extra = 7 + Math.floor(rng() * 4);
  for (let i = 0; i < extra; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 270 + rng() * WORLD.CLUSTER_SPREAD * 0.8;
    let pos = center.clone().add(new Vector3(
      Math.cos(angle) * r,
      (rng() - 0.5) * 180,
      Math.sin(angle) * r,
    ));
    for (let a = 0; a < 60; a++) {
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) break;
      pos = center.clone().add(new Vector3(
        (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 1.8,
        (rng() - 0.5) * 180,
        (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 1.8,
      ));
    }
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 20, 40));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** LABYRINTH — 16-20 medium planets in a dense maze arrangement */
function genLABYRINTH(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng, 0.9);
  const count = 16 + Math.floor(rng() * 5);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    let pos;
    for (let a = 0; a < 200; a++) {
      const angle = rng() * Math.PI * 2;
      const r     = 75 + rng() * WORLD.CLUSTER_SPREAD * 0.8;
      pos = center.clone().add(new Vector3(
        Math.cos(angle) * r,
        (rng() - 0.5) * 150,
        Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 22, 42));
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** SPIRAL — 7-9 planets wound in a helix from tee to cup */
function genSPIRAL(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const dir         = new Vector3().subVectors(cup, tee).normalize();
  const perp        = perpXZ(dir);
  const up          = new Vector3(0, 1, 0);
  const count       = 10 + Math.floor(rng() * 4);
  const baseRadius  = 195 + rng() * 105;
  const turns       = 1.2 + rng() * 0.8;
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    const t     = (i + 1) / (count + 1);
    const angle = t * turns * Math.PI * 2;
    let sr  = baseRadius;
    let pos = new Vector3();

    for (let a = 0; a < 90; a++) {
      const along = new Vector3().lerpVectors(tee, cup, t);
      pos = along.clone()
        .addScaledVector(perp, Math.cos(angle) * sr)
        .addScaledVector(up,   Math.sin(angle) * sr * 0.5);
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
      sr *= 0.93;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i));
  }

  // 4 outer ambient planets
  for (let i = 0; i < 4; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = WORLD.CLUSTER_SPREAD * 0.9 + rng() * 240;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 180, Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** ORBIT_TRAP — cup sits barely off the surface of a large planet */
function genORBIT_TRAP(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const taken = [], planets = [];

  // The trap planet — place it and then orbit the cup around it
  const trapR = 66 + rng() * 18;
  const awayAngle = rng() * Math.PI * 2;
  const trapPos = cup.clone().add(new Vector3(
    Math.cos(awayAngle) * (trapR + 60),
    0,
    Math.sin(awayAngle) * (trapR + 60),
  ));
  // Re-seat cup just off the trap planet surface
  const awayDir = new Vector3().subVectors(cup, trapPos).normalize();
  cup.copy(trapPos).addScaledVector(awayDir, trapR + 39);

  taken.push(trapPos);
  // Exact radius — we already decided it
  planets.push({
    position: trapPos.clone(),
    radius:   trapR,
    mass:     Math.pow(trapR, 3) * PLANET.MASS_FACTOR,
    color:    colors[0],
    seed:     Math.floor(rng() * 99999),
  });

  // 2-3 blockers in the path
  const dir  = new Vector3().subVectors(cup, tee).normalize();
  const perp = perpXZ(dir);
  for (let i = 0; i < 3; i++) {
    const t   = 0.25 + i * 0.2 + rng() * 0.1;
    const pos = new Vector3().lerpVectors(tee, cup, t)
      .addScaledVector(perp, (rng() - 0.5) * 180)
      .add(new Vector3(0, (rng() - 0.5) * 90, 0));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 30, 48));
    }
  }

  // 10 ambient planets
  for (let i = 0; i < 10; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 240 + rng() * WORLD.CLUSTER_SPREAD * 0.8;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 180, Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** PINBALL — 15-20 small planets in a tight chaotic cluster */
function genPINBALL(rng, colors) {
  const { tee, cup } = placeTeeAndCup(rng, 0.8);
  const mid   = new Vector3().lerpVectors(tee, cup, 0.5);
  const count = 15 + Math.floor(rng() * 6);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    let pos;
    for (let a = 0; a < 180; a++) {
      const angle = rng() * Math.PI * 2;
      const r     = 45 + rng() * 255;
      pos = mid.clone().add(new Vector3(
        Math.cos(angle) * r, (rng() - 0.5) * 135, Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 12, 28)); // small for high density
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** SLINGSHOT — two massive side planets; direct path is impossible */
function genSLINGSHOT(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng, 1.0);
  const dir   = new Vector3().subVectors(cup, tee).normalize();
  const perp  = perpXZ(dir);
  const taken = [], planets = [];

  // Two slingshot anchors — offset perpendicular to corridor
  for (const side of [-1, 1]) {
    const t    = 0.35 + rng() * 0.3;
    const dist = 210 + rng() * 120;
    const pos  = new Vector3().lerpVectors(tee, cup, t)
      .addScaledVector(perp, side * dist)
      .add(new Vector3(0, (rng() - 0.5) * 66, 0));
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, planets.length, 48, 56));
  }

  // 1 direct blocker
  const blocker = new Vector3().lerpVectors(tee, cup, 0.48 + (rng() - 0.5) * 0.08)
    .add(new Vector3(0, (rng() - 0.5) * 45, 0));
  if (isValidPos(blocker, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
    taken.push(blocker);
    planets.push(buildPlanet(blocker, rng, colors, planets.length, 32, 44));
  }

  // 6-7 scattered small planets
  for (let i = 0; i < 7; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 300 + rng() * 330;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 120, Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 16, 36));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** VOID_CROSSING — epic sparse layout, massive planets, feels vast */
function genVOID_CROSSING(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng, 1.05);
  // Giant solar systems along the corridor, plus ambient scattered mass
  const count = 9 + Math.floor(rng() * 4);
  const taken = [], planets = [];
  const dir   = new Vector3().subVectors(cup, tee).normalize();
  const perp  = perpXZ(dir);

  // Corridor giants — spread along the path axis, not just random scatter
  for (let i = 0; i < count; i++) {
    let pos;
    for (let a = 0; a < 130; a++) {
      // Some placed along corridor, some scattered
      const usePath = rng() < 0.5;
      if (usePath) {
        const t = 0.15 + (i / count) * 0.7 + (rng() - 0.5) * 0.08;
        pos = new Vector3().lerpVectors(tee, cup, t)
          .addScaledVector(perp, (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 0.45)
          .add(new Vector3(0, (rng() - 0.5) * 270, 0));
      } else {
        const angle = rng() * Math.PI * 2;
        const r     = 270 + rng() * WORLD.CLUSTER_SPREAD * 1.0;
        pos = center.clone().add(new Vector3(
          Math.cos(angle) * r, (rng() - 0.5) * 270, Math.sin(angle) * r,
        ));
      }
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 3.0)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 40, 56)); // all massive
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors, 4); // 4 guards for void
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** GRAVITY_RING — planets evenly spaced in a ring; ball must cross through */
function genGRAVITY_RING(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const mid        = new Vector3().lerpVectors(tee, cup, 0.48 + rng() * 0.08);
  const ringCount  = 7 + Math.floor(rng() * 4);
  const ringRadius = 270 + rng() * 150;
  const taken = [], planets = [];

  // Primary ring — at 40% along corridor
  for (let i = 0; i < ringCount; i++) {
    const angle = (i / ringCount) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    let pos;
    for (let a = 0; a < 60; a++) {
      const r = ringRadius + (rng() - 0.5) * 54;
      pos = mid.clone().add(new Vector3(
        Math.cos(angle) * r, (rng() - 0.5) * 126, Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 28, 46));
  }

  // Second smaller ring — at 65% along corridor (forces two crossings)
  const mid2      = new Vector3().lerpVectors(tee, cup, 0.62 + rng() * 0.08);
  const ringCount2 = 5 + Math.floor(rng() * 3);
  const ringR2    = ringRadius * 0.65;
  for (let i = 0; i < ringCount2; i++) {
    const angle = (i / ringCount2) * Math.PI * 2 + rng() * 0.5;
    let pos;
    for (let a = 0; a < 60; a++) {
      const r = ringR2 + (rng() - 0.5) * 36;
      pos = mid2.clone().add(new Vector3(
        Math.cos(angle) * r, (rng() - 0.5) * 96, Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, planets.length, 22, 40));
  }

  // 4-5 outer anchor planets
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = ringRadius * 2.2 + rng() * 240;
    const pos   = mid.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 180, Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 32, 52));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** CANYON — two parallel planet walls create a narrow corridor */
function genCANYON(rng, colors) {
  const { tee, cup } = placeTeeAndCup(rng);
  const dir      = new Vector3().subVectors(cup, tee).normalize();
  const perp     = perpXZ(dir);
  const wallN    = 7 + Math.floor(rng() * 4); // 7-10 per wall
  const wallDist = 195 + rng() * 120;          // wider to match larger scale
  const taken = [], planets = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < wallN; i++) {
      const t   = 0.1 + (i / (wallN - 1)) * 0.8;
      let pos;
      for (let a = 0; a < 60; a++) {
        const jitter = (rng() - 0.5) * 54;
        pos = new Vector3().lerpVectors(tee, cup, t)
          .addScaledVector(perp, side * (wallDist + jitter))
          .add(new Vector3(0, (rng() - 0.5) * 96, 0));
        if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
      }
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 28, 48));
    }
  }

  // 5 hazard rocks inside the canyon
  for (let i = 0; i < 5; i++) {
    const t   = 0.15 + rng() * 0.7;
    const pos = new Vector3().lerpVectors(tee, cup, t)
      .addScaledVector(perp, (rng() - 0.5) * wallDist * 0.55)
      .add(new Vector3(0, (rng() - 0.5) * 60, 0));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 18, 34));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** CLUSTER_BOMB — massive central cluster, tee and cup on opposite edges */
function genCLUSTER_BOMB(rng, colors) {
  const { tee, cup } = placeTeeAndCup(rng, 0.9);
  const mid   = new Vector3().lerpVectors(tee, cup, 0.5);
  const count = 15 + Math.floor(rng() * 5);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    let pos;
    for (let a = 0; a < 160; a++) {
      const angle = rng() * Math.PI * 2;
      const r     = 54 + rng() * 195;
      pos = mid.clone().add(new Vector3(
        Math.cos(angle) * r, (rng() - 0.5) * 135, Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i));
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** CROSSROADS — a wall of planets perpendicular to the tee-cup path */
function genCROSSROADS(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const dir      = new Vector3().subVectors(cup, tee).normalize();
  const perp     = perpXZ(dir);
  const crossT   = 0.38 + rng() * 0.24;
  const crossMid = new Vector3().lerpVectors(tee, cup, crossT);
  const wallN    = 4 + Math.floor(rng() * 4);
  const taken = [], planets = [];

  for (let i = 0; i < wallN; i++) {
    const offset = (i - (wallN - 1) / 2) * 156 + (rng() - 0.5) * 54;
    let pos;
    for (let a = 0; a < 60; a++) {
      pos = crossMid.clone()
        .addScaledVector(perp, offset)
        .add(new Vector3(0, (rng() - 0.5) * 96, 0));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 32, 52));
  }

  // 7 scattered ambient planets
  for (let i = 0; i < 7; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 255 + rng() * WORLD.CLUSTER_SPREAD * 0.75;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 180, Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** HELIX — planets alternate high/low along the corridor like a DNA strand */
function genHELIX(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const dir   = new Vector3().subVectors(cup, tee).normalize();
  const perp  = perpXZ(dir);
  const count = 12 + Math.floor(rng() * 5);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    const t       = 0.08 + (i / count) * 0.84;
    const side    = i % 2 === 0 ? 1 : -1;
    const yOffset = side * (84 + rng() * 66);
    let pos;
    for (let a = 0; a < 80; a++) {
      pos = new Vector3().lerpVectors(tee, cup, t)
        .addScaledVector(perp, (rng() - 0.5) * 114)
        .add(new Vector3(0, yOffset, 0));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i));
  }

  // 5 outer roamers
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 300 + rng() * 270;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 180, Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** SCATTER — 14-18 planets across the galaxy, multiple clusters */
function genSCATTER(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const dir        = new Vector3().subVectors(cup, tee).normalize();
  const perp       = perpXZ(dir);
  const count      = 20 + Math.floor(rng() * 7);
  const blockerN   = 7; // more forced path blockers
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    const isBlocker = i < blockerN;
    let pos;
    for (let a = 0; a < 130; a++) {
      if (isBlocker) {
        // Spread blockers more evenly across the full corridor
        const t    = 0.12 + (i / blockerN) * 0.76 + rng() * 0.06;
        const side = (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 0.22;
        pos = new Vector3().lerpVectors(tee, cup, t)
          .addScaledVector(perp, side)
          .add(new Vector3(0, (rng() - 0.5) * 150, 0));
      } else {
        const angle = rng() * Math.PI * 2;
        const r     = WORLD.CLUSTER_OFFSET * 0.3 + rng() * WORLD.CLUSTER_SPREAD * 0.95;
        pos = center.clone().add(new Vector3(
          Math.cos(angle) * r, (rng() - 0.5) * 210, Math.sin(angle) * r,
        ));
      }
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i));
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

// ── Dispatch table ─────────────────────────────────────────────
const ARCHETYPE_FNS = {
  GAUNTLET:      genGAUNTLET,
  ASTEROID_BELT: genASTEROID_BELT,
  TWIN_GIANTS:   genTWIN_GIANTS,
  LABYRINTH:     genLABYRINTH,
  SPIRAL:        genSPIRAL,
  ORBIT_TRAP:    genORBIT_TRAP,
  PINBALL:       genPINBALL,
  SLINGSHOT:     genSLINGSHOT,
  VOID_CROSSING: genVOID_CROSSING,
  GRAVITY_RING:  genGRAVITY_RING,
  CANYON:        genCANYON,
  CLUSTER_BOMB:  genCLUSTER_BOMB,
  CROSSROADS:    genCROSSROADS,
  HELIX:         genHELIX,
  SCATTER:       genSCATTER,
};

/** Human-readable archetype labels shown in the hole title */
export const ARCHETYPE_LABELS = {
  GAUNTLET:      'THE GAUNTLET',
  ASTEROID_BELT: 'ASTEROID BELT',
  TWIN_GIANTS:   'TWIN GIANTS',
  LABYRINTH:     'THE LABYRINTH',
  SPIRAL:        'DEATH SPIRAL',
  ORBIT_TRAP:    'ORBIT TRAP',
  PINBALL:       'PINBALL HELL',
  SLINGSHOT:     'SLINGSHOT ALLEY',
  VOID_CROSSING: 'VOID CROSSING',
  GRAVITY_RING:  'GRAVITY RING',
  CANYON:        'THE CANYON',
  CLUSTER_BOMB:  'CLUSTER BOMB',
  CROSSROADS:    'CROSSROADS',
  HELIX:         'DNA HELIX',
  SCATTER:       'COSMIC SCATTER',
  'WORLD EATER': 'WORLD EATER',
};

// ── Wormhole placement ─────────────────────────────────────────
/**
 * Place exactly one wormhole within realistic shot reach of the tee.
 *
 * Design goals:
 *   • Reachable: placed at 25-45% along the tee→cup axis (~250-450 u from tee)
 *   • Skill shot: offset 55-110 u perpendicular — requires deliberate aim
 *   • Not trivial: offset enough that a blind shot won't accidentally enter it
 *   • Orbiting debris in Wormhole.js adds further challenge at close range
 */
function placeWormholes(rng, tee, cup, planets) {
  const dir  = new Vector3().subVectors(cup, tee);
  dir.normalize();
  const perp = perpXZ(dir);

  // Try a few candidate positions; take first that clears all planets
  for (let attempt = 0; attempt < 12; attempt++) {
    const t    = 0.25 + rng() * 0.20;                // 25-45% along path
    const side = (rng() < 0.5 ? 1 : -1) * (165 + rng() * 165); // 165-330 u perpendicular
    const vert = (rng() - 0.5) * 120;

    const candidate = new Vector3()
      .lerpVectors(tee, cup, t)
      .addScaledVector(perp, side)
      .add(new Vector3(0, vert, 0));

    const tooClose = planets.some(p => candidate.distanceTo(p.position) < p.radius + 105);
    if (!tooClose) return [candidate];
  }

  // Fallback: dead perpendicular at 35% with a fixed offset
  const fallback = new Vector3()
    .lerpVectors(tee, cup, 0.35)
    .addScaledVector(perp, 240);
  return [fallback];
}

function placeProgressionWormholes(rng, holeIndex, tee, cup, planets) {
  const slot = PROGRESSION_SLOTS[holeIndex];
  if (!slot || slot.wormholeChance <= 0) return [];
  return rng() < slot.wormholeChance ? placeWormholes(rng, tee, cup, planets) : [];
}

function makeBossPlanet(position, radius, color, seed) {
  return {
    position: position.clone(),
    radius,
    mass: Math.pow(radius, 3) * PLANET.MASS_FACTOR,
    color,
    seed,
  };
}

function genBOSS_WORLDEATER() {
  const palette = COLOR_PALETTES[COLOR_PALETTES.length - 1];
  const center = new Vector3(0, 0, 0);
  const tee = new Vector3(-1450, 140, -180);
  const cup = center.clone();
  const planets = [];

  const ringPlanets = [
    { angle: -0.15, radius: 78, dist: 760, y: 36, color: palette.planets[0] },
    { angle: 0.68,  radius: 58, dist: 560, y: 102, color: palette.planets[1] },
    { angle: 1.32,  radius: 82, dist: 790, y: -54, color: palette.planets[2] },
    { angle: 2.08,  radius: 64, dist: 540, y: 82, color: palette.planets[3] },
    { angle: 2.82,  radius: 92, dist: 760, y: -36, color: palette.planets[4] },
    { angle: 3.52,  radius: 60, dist: 515, y: 118, color: palette.planets[1] },
    { angle: 4.18,  radius: 74, dist: 700, y: -100, color: palette.planets[2] },
    { angle: 5.18,  radius: 66, dist: 585, y: 78, color: palette.planets[3] },
  ];

  ringPlanets.forEach((def, idx) => {
    const pos = new Vector3(
      Math.cos(def.angle) * def.dist,
      def.y,
      Math.sin(def.angle) * def.dist,
    );
    planets.push(makeBossPlanet(pos, def.radius, def.color, 9000 + idx));
  });

  planets.push(makeBossPlanet(new Vector3(-980, 72, -260), 108, palette.planets[0], 9100));
  planets.push(makeBossPlanet(new Vector3(-320, -120, 500), 88, palette.planets[4], 9101));
  planets.push(makeBossPlanet(new Vector3(260, 148, -620), 72, palette.planets[2], 9102));

  // Keep the handcrafted boss tableau readable without merged gravity wells.
  deoverlapPlanets(planets, 40);
  finalizeCup(cup, planets);

  return {
    planets,
    tee,
    cup,
    wormholes: [],
    palette,
    holeIndex: HOLE.COUNT - 1,
    archetype: 'WORLD EATER',
    boss: {
      kind: 'WORLDEATER',
      center,
      spitTarget: new Vector3(-190, 40, 130),
      introWormholePos: new Vector3(...WORLDEATER.INTRO_WORMHOLE_POS),
    },
  };
}

// ── Main export ────────────────────────────────────────────────
/**
 * Generate a hole deterministically.
 *
 * @param {number}        holeIndex  0-based (0–9)
 * @param {string|number} roomCode   Room code string or numeric seed.
 *   Every client in the same room must pass the same value so physics stays
 *   in sync.  Solo mode passes a random sessionSeed so each run is unique.
 */
export function generateHole(holeIndex, roomCode = 0) {
  if (typeof roomCode === 'string' && roomCode.toUpperCase() === 'BOSS') {
    return {
      ...genBOSS_WORLDEATER(),
      holeIndex,
    };
  }

  if (holeIndex === HOLE.COUNT - 1) {
    return genBOSS_WORLDEATER();
  }

  const roomHashSeed =
    typeof roomCode === 'string' ? hashRoomCode(roomCode) : (roomCode >>> 0);
  const palette = COLOR_PALETTES[holeIndex % COLOR_PALETTES.length];
  const colors = palette.planets;
  const slot = PROGRESSION_SLOTS[holeIndex];
  const archetypePlan = getRunArchetypePlan(roomHashSeed);
  const archetypeOrder = archetypePlan[holeIndex] ?? ARCHETYPE_LIST;
  const baseSeed =
    (roomHashSeed ^ (Math.imul(holeIndex + 1, 0x9e3779b9) + 0x6d2b79f5)) >>> 0;

  let bestCandidate = null;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const archetype of archetypeOrder) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const holeSeed = (
        baseSeed ^
        hashRoomCode(`${archetype}:${attempt}`) ^
        Math.imul(attempt + 1, 0x85ebca6b)
      ) >>> 0;

      const rng = mulberry32(holeSeed);
      const { planets, tee, cup } = ARCHETYPE_FNS[archetype](rng, colors);
      const wormholes = placeProgressionWormholes(rng, holeIndex, tee, cup, planets);
      const analysis = analyzeHoleLayout(tee, cup, planets, wormholes, archetype);
      const penalty = progressionPenalty(analysis, slot.target);

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestCandidate = {
          planets,
          tee,
          cup,
          wormholes,
          palette,
          holeIndex,
          archetype,
          difficulty: analysis,
          progression: {
            slot: slot.label,
            target: slot.target,
          },
        };
      }

      if (fitsProgressionTarget(analysis, slot.target)) {
        return {
          planets,
          tee,
          cup,
          wormholes,
          palette,
          holeIndex,
          archetype,
          difficulty: analysis,
          progression: {
            slot: slot.label,
            target: slot.target,
          },
        };
      }
    }
  }

  if (bestCandidate) return bestCandidate;

  const fallbackArchetype = archetypeOrder[0] ?? 'VOID_CROSSING';
  const fallbackSeed = (baseSeed ^ hashRoomCode(`${fallbackArchetype}:fallback`)) >>> 0;
  const fallbackRng = mulberry32(fallbackSeed);
  const { planets, tee, cup } = ARCHETYPE_FNS[fallbackArchetype](fallbackRng, colors);
  const wormholes = placeProgressionWormholes(fallbackRng, holeIndex, tee, cup, planets);
  const analysis = analyzeHoleLayout(tee, cup, planets, wormholes, fallbackArchetype);

  return {
    planets,
    tee,
    cup,
    wormholes,
    palette,
    holeIndex,
    archetype: fallbackArchetype,
    difficulty: analysis,
    progression: {
      slot: slot.label,
      target: slot.target,
    },
  };
}
