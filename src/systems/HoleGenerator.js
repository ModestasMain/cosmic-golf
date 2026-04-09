// ============================================================
// HoleGenerator.js — 15 distinct hole archetypes
//
// Each room/session picks 10 unique archetypes in a shuffled
// order determined by the room code. No progressive difficulty —
// archetypes vary wildly in layout regardless of hole number.
//
// Determinism guarantee: generateHole(i, roomCode) returns the
// same layout on every client in the same room.
// ============================================================

import { Vector3 } from 'three';
import { PLANET, HOLE, WORLD, COLOR_PALETTES } from '../core/Constants.js';

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

/** Return 10 unique archetypes for a room, in shuffled order */
function getRoomArchetypes(roomHashSeed) {
  const rng  = mulberry32(roomHashSeed ^ 0xdeadbeef);
  const list = [...ARCHETYPE_LIST];
  shuffle(list, rng);
  return list.slice(0, HOLE.COUNT); // exactly 10, all unique
}

// ── Shared geometry helpers ────────────────────────────────────

function placeTeeAndCup(rng, distMult = 1.0) {
  const center   = new Vector3(
    (rng() - 0.5) * WORLD.CLUSTER_OFFSET,
    0,
    (rng() - 0.5) * WORLD.CLUSTER_OFFSET,
  );
  const teeAngle = rng() * Math.PI * 2;
  // tee is ~450–550 from center — total tee↔cup distance ≈ 950–1100
  const teeDist  = WORLD.CLUSTER_SPREAD * 0.95 * distMult + 60 + rng() * 80;
  const tee      = center.clone().add(new Vector3(
    Math.cos(teeAngle) * teeDist,
    (rng() - 0.5) * 40,
    Math.sin(teeAngle) * teeDist,
  ));
  // cup is roughly opposite, ±50° offset so it's never trivially straight
  const cupAngle = teeAngle + Math.PI + (rng() - 0.5) * 1.0;
  const cupDist  = WORLD.CLUSTER_SPREAD * 0.90 * distMult + 70 + rng() * 90;
  const cup      = center.clone().add(new Vector3(
    Math.cos(cupAngle) * cupDist,
    (rng() - 0.5) * 40,
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
    const blocking = planets.find(p => cup.distanceTo(p.position) < p.radius + 22);
    if (!blocking) break;
    const away = new Vector3().subVectors(cup, blocking.position).normalize();
    cup.addScaledVector(away, blocking.radius + 22 - cup.distanceTo(blocking.position) + 8);
  }
}

// ── Utility: perp vector in XZ plane ─────────────────────────
function perpXZ(dir) {
  return new Vector3(-dir.z, 0, dir.x);
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
        const minDist = pa.radius + pb.radius + 55; // 55-unit gap — prevents merged gravity wells
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
function addGuardPlanets(planets, taken, tee, cup, rng, colors, count = 2) {
  const dir  = new Vector3().subVectors(cup, tee).normalize();
  const perp = perpXZ(dir);
  for (let i = 0; i < count; i++) {
    // Stagger guards along the path: first at 30%, second at 60%
    const t    = 0.28 + (i / count) * 0.44 + (rng() - 0.5) * 0.10;
    const side = (rng() - 0.5) * 55; // slight offset so they're not dead-center
    for (let a = 0; a < 100; a++) {
      const pos = new Vector3().lerpVectors(tee, cup, t)
        .addScaledVector(perp, side + (rng() - 0.5) * 22)
        .add(new Vector3(0, (rng() - 0.5) * 38, 0));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) {
        taken.push(pos);
        planets.push(buildPlanet(pos, rng, colors, planets.length, 18, 28));
        break;
      }
    }
  }
}

// ================================================================
// ARCHETYPE GENERATORS
// Each returns { planets: Array<PlanetData>, tee: Vector3, cup: Vector3 }
// ================================================================

/** GAUNTLET — 6-8 planets squarely blocking the direct path, must thread the gaps */
function genGAUNTLET(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const dir  = new Vector3().subVectors(cup, tee).normalize();
  const perp = perpXZ(dir);
  const count = 6 + Math.floor(rng() * 3);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    const t    = 0.12 + (i / count) * 0.76 + (rng() - 0.5) * 0.04;
    const side = (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 0.12; // very narrow offset
    let pos;
    for (let a = 0; a < 100; a++) {
      pos = new Vector3().lerpVectors(tee, cup, t)
        .addScaledVector(perp, side + (rng() - 0.5) * 5)
        .add(new Vector3(0, (rng() - 0.5) * 28, 0));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 14, 26));
  }

  // 2-3 flanking planets to fill the space
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 100 + rng() * WORLD.CLUSTER_SPREAD * 0.7;
    const pos   = new Vector3(
      Math.cos(angle) * r,
      (rng() - 0.5) * 60,
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
  const ringRadius = 100 + rng() * 60;
  const count      = 11 + Math.floor(rng() * 5);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    let pos;
    for (let a = 0; a < 60; a++) {
      const r = ringRadius + (rng() - 0.5) * 18;
      pos = mid.clone().add(new Vector3(
        Math.cos(angle) * r,
        (rng() - 0.5) * 40,
        Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 5, 13)); // tiny asteroids
  }

  // 2 large anchor planets outside the ring
  for (let i = 0; i < 2; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = ringRadius * 1.9 + rng() * 55;
    const pos   = mid.clone().add(new Vector3(
      Math.cos(angle) * r,
      (rng() - 0.5) * 40,
      Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 20, 28));
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
    const dist = 60 + rng() * 30;
    const pos  = mid.clone()
      .addScaledVector(perp, side * dist)
      .add(new Vector3(0, (rng() - 0.5) * 20, 0));
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, planets.length, 23, 28));
  }

  // 5-7 smaller scattered planets
  const extra = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < extra; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 90 + rng() * WORLD.CLUSTER_SPREAD * 0.8;
    let pos = center.clone().add(new Vector3(
      Math.cos(angle) * r,
      (rng() - 0.5) * 60,
      Math.sin(angle) * r,
    ));
    for (let a = 0; a < 60; a++) {
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) break;
      pos = center.clone().add(new Vector3(
        (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 1.8,
        (rng() - 0.5) * 60,
        (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 1.8,
      ));
    }
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 10, 20));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** LABYRINTH — 12-15 medium planets in a dense maze arrangement */
function genLABYRINTH(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng, 0.9);
  const count = 12 + Math.floor(rng() * 4);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    let pos;
    for (let a = 0; a < 200; a++) {
      const angle = rng() * Math.PI * 2;
      const r     = 25 + rng() * WORLD.CLUSTER_SPREAD * 0.8;
      pos = center.clone().add(new Vector3(
        Math.cos(angle) * r,
        (rng() - 0.5) * 50,
        Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 11, 21));
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
  const count       = 7 + Math.floor(rng() * 3);
  const baseRadius  = 65 + rng() * 35;
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

  // 3 outer ambient planets
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = WORLD.CLUSTER_SPREAD * 0.9 + rng() * 80;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 60, Math.sin(angle) * r,
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
  const trapR = 22 + rng() * 6;
  const awayAngle = rng() * Math.PI * 2;
  const trapPos = cup.clone().add(new Vector3(
    Math.cos(awayAngle) * (trapR + 20),
    0,
    Math.sin(awayAngle) * (trapR + 20),
  ));
  // Re-seat cup just off the trap planet surface
  const awayDir = new Vector3().subVectors(cup, trapPos).normalize();
  cup.copy(trapPos).addScaledVector(awayDir, trapR + 13);

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
      .addScaledVector(perp, (rng() - 0.5) * 60)
      .add(new Vector3(0, (rng() - 0.5) * 30, 0));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 15, 24));
    }
  }

  // 7 ambient planets (increased from 5)
  for (let i = 0; i < 7; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 80 + rng() * WORLD.CLUSTER_SPREAD * 0.8;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 60, Math.sin(angle) * r,
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

/** PINBALL — 10-14 small planets in a tight chaotic cluster */
function genPINBALL(rng, colors) {
  const { tee, cup } = placeTeeAndCup(rng, 0.8);
  const mid   = new Vector3().lerpVectors(tee, cup, 0.5);
  const count = 10 + Math.floor(rng() * 5);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    let pos;
    for (let a = 0; a < 180; a++) {
      const angle = rng() * Math.PI * 2;
      const r     = 15 + rng() * 85;
      pos = mid.clone().add(new Vector3(
        Math.cos(angle) * r, (rng() - 0.5) * 45, Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 6, 14)); // small for high density
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
    const dist = 70 + rng() * 40;
    const pos  = new Vector3().lerpVectors(tee, cup, t)
      .addScaledVector(perp, side * dist)
      .add(new Vector3(0, (rng() - 0.5) * 22, 0));
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, planets.length, 24, 28));
  }

  // 1 direct blocker
  const blocker = new Vector3().lerpVectors(tee, cup, 0.48 + (rng() - 0.5) * 0.08)
    .add(new Vector3(0, (rng() - 0.5) * 15, 0));
  if (isValidPos(blocker, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
    taken.push(blocker);
    planets.push(buildPlanet(blocker, rng, colors, planets.length, 16, 22));
  }

  // 4-5 scattered small planets
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 100 + rng() * 110;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 60, Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 8, 18));
    }
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors);
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** VOID_CROSSING — epic sparse layout, 4-6 massive planets, feels vast */
function genVOID_CROSSING(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng, 1.05);
  // 3 giant solar systems along the corridor, plus ambient scattered mass
  const count = 6 + Math.floor(rng() * 3);
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
          .add(new Vector3(0, (rng() - 0.5) * 90, 0));
      } else {
        const angle = rng() * Math.PI * 2;
        const r     = 90 + rng() * WORLD.CLUSTER_SPREAD * 1.0;
        pos = center.clone().add(new Vector3(
          Math.cos(angle) * r, (rng() - 0.5) * 90, Math.sin(angle) * r,
        ));
      }
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 3.0)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 20, 28)); // all massive
  }

  addGuardPlanets(planets, taken, tee, cup, rng, colors, 3); // 3 guards for void
  deoverlapPlanets(planets);
  finalizeCup(cup, planets);
  return { planets, tee, cup };
}

/** GRAVITY_RING — planets evenly spaced in a ring; ball must cross through */
function genGRAVITY_RING(rng, colors) {
  const { center, tee, cup } = placeTeeAndCup(rng);
  const mid        = new Vector3().lerpVectors(tee, cup, 0.48 + rng() * 0.08);
  const ringCount  = 5 + Math.floor(rng() * 3);
  const ringRadius = 90 + rng() * 50;
  const taken = [], planets = [];

  // Primary ring — at 40% along corridor
  for (let i = 0; i < ringCount; i++) {
    const angle = (i / ringCount) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    let pos;
    for (let a = 0; a < 60; a++) {
      const r = ringRadius + (rng() - 0.5) * 18;
      pos = mid.clone().add(new Vector3(
        Math.cos(angle) * r, (rng() - 0.5) * 42, Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 14, 23));
  }

  // Second smaller ring — at 65% along corridor (forces two crossings)
  const mid2      = new Vector3().lerpVectors(tee, cup, 0.62 + rng() * 0.08);
  const ringCount2 = 4 + Math.floor(rng() * 2);
  const ringR2    = ringRadius * 0.65;
  for (let i = 0; i < ringCount2; i++) {
    const angle = (i / ringCount2) * Math.PI * 2 + rng() * 0.5;
    let pos;
    for (let a = 0; a < 60; a++) {
      const r = ringR2 + (rng() - 0.5) * 12;
      pos = mid2.clone().add(new Vector3(
        Math.cos(angle) * r, (rng() - 0.5) * 32, Math.sin(angle) * r,
      ));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, planets.length, 11, 20));
  }

  // 3-4 outer anchor planets
  for (let i = 0; i < 4; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = ringRadius * 2.2 + rng() * 80;
    const pos   = mid.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 60, Math.sin(angle) * r,
    ));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.5)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 16, 26));
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
  const wallN    = 5 + Math.floor(rng() * 3); // 5-7 per wall (denser)
  const wallDist = 65 + rng() * 40;           // wider to match larger scale
  const taken = [], planets = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < wallN; i++) {
      const t   = 0.1 + (i / (wallN - 1)) * 0.8;
      let pos;
      for (let a = 0; a < 60; a++) {
        const jitter = (rng() - 0.5) * 18;
        pos = new Vector3().lerpVectors(tee, cup, t)
          .addScaledVector(perp, side * (wallDist + jitter))
          .add(new Vector3(0, (rng() - 0.5) * 32, 0));
        if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
      }
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 14, 24));
    }
  }

  // 3 hazard rocks inside the canyon
  for (let i = 0; i < 3; i++) {
    const t   = 0.2 + rng() * 0.6;
    const pos = new Vector3().lerpVectors(tee, cup, t)
      .addScaledVector(perp, (rng() - 0.5) * wallDist * 0.55)
      .add(new Vector3(0, (rng() - 0.5) * 20, 0));
    if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) {
      taken.push(pos);
      planets.push(buildPlanet(pos, rng, colors, planets.length, 9, 17));
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
  const count = 9 + Math.floor(rng() * 4);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    let pos;
    for (let a = 0; a < 160; a++) {
      const angle = rng() * Math.PI * 2;
      const r     = 18 + rng() * 65;
      pos = mid.clone().add(new Vector3(
        Math.cos(angle) * r, (rng() - 0.5) * 45, Math.sin(angle) * r,
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
  const wallN    = 3 + Math.floor(rng() * 3);
  const taken = [], planets = [];

  for (let i = 0; i < wallN; i++) {
    const offset = (i - (wallN - 1) / 2) * 52 + (rng() - 0.5) * 18;
    let pos;
    for (let a = 0; a < 60; a++) {
      pos = crossMid.clone()
        .addScaledVector(perp, offset)
        .add(new Vector3(0, (rng() - 0.5) * 32, 0));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i, 16, 26));
  }

  // 5 scattered ambient planets
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 85 + rng() * WORLD.CLUSTER_SPREAD * 0.75;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 60, Math.sin(angle) * r,
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
  const count = 8 + Math.floor(rng() * 3);
  const taken = [], planets = [];

  for (let i = 0; i < count; i++) {
    const t       = 0.08 + (i / count) * 0.84;
    const side    = i % 2 === 0 ? 1 : -1;
    const yOffset = side * (28 + rng() * 22);
    let pos;
    for (let a = 0; a < 80; a++) {
      pos = new Vector3().lerpVectors(tee, cup, t)
        .addScaledVector(perp, (rng() - 0.5) * 38)
        .add(new Vector3(0, yOffset, 0));
      if (isValidPos(pos, taken, tee, cup, PLANET.RADIUS_MAX * 2.8)) break;
    }
    taken.push(pos);
    planets.push(buildPlanet(pos, rng, colors, i));
  }

  // 3 outer roamers
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = 100 + rng() * 90;
    const pos   = center.clone().add(new Vector3(
      Math.cos(angle) * r, (rng() - 0.5) * 60, Math.sin(angle) * r,
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
  const count      = 14 + Math.floor(rng() * 5);
  const blockerN   = 5; // more forced path blockers
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
          .add(new Vector3(0, (rng() - 0.5) * 50, 0));
      } else {
        const angle = rng() * Math.PI * 2;
        const r     = WORLD.CLUSTER_OFFSET * 0.3 + rng() * WORLD.CLUSTER_SPREAD * 0.95;
        pos = center.clone().add(new Vector3(
          Math.cos(angle) * r, (rng() - 0.5) * 70, Math.sin(angle) * r,
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
    const side = (rng() < 0.5 ? 1 : -1) * (55 + rng() * 55); // 55-110 u perpendicular
    const vert = (rng() - 0.5) * 40;

    const candidate = new Vector3()
      .lerpVectors(tee, cup, t)
      .addScaledVector(perp, side)
      .add(new Vector3(0, vert, 0));

    const tooClose = planets.some(p => candidate.distanceTo(p.position) < p.radius + 35);
    if (!tooClose) return [candidate];
  }

  // Fallback: dead perpendicular at 35% with a fixed offset
  const fallback = new Vector3()
    .lerpVectors(tee, cup, 0.35)
    .addScaledVector(perp, 80);
  return [fallback];
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
  const roomHashSeed =
    typeof roomCode === 'string' ? hashRoomCode(roomCode) : (roomCode >>> 0);

  // Select this room's 10 archetypes (unique, shuffled)
  const archetypes = getRoomArchetypes(roomHashSeed);
  const archetype  = archetypes[holeIndex % archetypes.length];

  // Per-hole seed: XOR room seed with a hole-specific constant
  const holeSeed =
    (roomHashSeed ^ (Math.imul(holeIndex + 1, 0x9e3779b9) + 0x6d2b79f5)) >>> 0;

  const rng     = mulberry32(holeSeed);
  const palette = COLOR_PALETTES[holeIndex % COLOR_PALETTES.length];
  const colors  = palette.planets;

  const { planets, tee, cup } = ARCHETYPE_FNS[archetype](rng, colors);

  // Place wormholes after planet layout is finalized (rng advances past planets)
  const wormholes = placeWormholes(rng, tee, cup, planets);

  return { planets, tee, cup, wormholes, palette, holeIndex, archetype };
}
