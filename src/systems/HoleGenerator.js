// ============================================================
// HoleGenerator.js — procedural holes
// Guarantees: no straight line to cup, planets block/curve the path.
// ============================================================

import { Vector3 } from 'three';
import { createNoise3D } from 'simplex-noise';
import { PLANET, HOLE, WORLD, COLOR_PALETTES } from '../core/Constants.js';

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Point-to-segment distance (ignores Y) */
function distToSegmentXZ(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return point.distanceTo(a);
  const t = Math.max(0, Math.min(1, ((point.x-a.x)*dx + (point.z-a.z)*dz) / lenSq));
  return Math.sqrt(
    Math.pow(point.x - (a.x + t*dx), 2) +
    Math.pow(point.z - (a.z + t*dz), 2)
  );
}

export function generateHole(holeIndex, seed = holeIndex * 12345 + 9876) {
  const rng     = mulberry32(seed);
  const noise   = createNoise3D(() => rng());
  const palette = COLOR_PALETTES[holeIndex % COLOR_PALETTES.length];
  const colors  = palette.planets;

  // ── Step 1: Place tee and cup first ───────────────────────
  // Cup is offset ~180° from tee around a center point, ensuring distance.

  const center = new Vector3(
    (rng() - 0.5) * WORLD.CLUSTER_OFFSET,
    0,
    (rng() - 0.5) * WORLD.CLUSTER_OFFSET,
  );

  const teeAngle  = rng() * Math.PI * 2;
  const teeDist   = WORLD.CLUSTER_SPREAD * 0.75 + 40 + rng() * 40;
  const tee       = center.clone().add(new Vector3(
    Math.cos(teeAngle) * teeDist,
    (rng() - 0.5) * 30,
    Math.sin(teeAngle) * teeDist,
  ));

  // Cup ~opposite, but with a ±60° angle variation to avoid dead symmetry
  const cupAngle  = teeAngle + Math.PI + (rng() - 0.5) * 1.2;
  const cupDist   = WORLD.CLUSTER_SPREAD * 0.7 + 50 + rng() * 60;
  const cup       = center.clone().add(new Vector3(
    Math.cos(cupAngle) * cupDist,
    (rng() - 0.5) * 30,
    Math.sin(cupAngle) * cupDist,
  ));

  const corridorLen = tee.distanceTo(cup);

  // ── Step 2: Place planets ──────────────────────────────────
  const planetCount = HOLE.PLANETS_MIN + Math.floor(rng() * (HOLE.PLANETS_MAX - HOLE.PLANETS_MIN + 1));
  const planets     = [];
  const positions   = [];

  // Guarantee at least 2 "blocker" planets placed squarely in the tee→cup path
  const blockerCount = Math.min(2, planetCount);

  for (let i = 0; i < planetCount; i++) {
    const isBlocker = i < blockerCount;
    let pos, tries = 0;

    do {
      if (isBlocker) {
        // Place along the corridor at 30–70% of the way, offset perpendicular
        const t        = 0.25 + (i * 0.22) + rng() * 0.15;
        const along    = new Vector3().lerpVectors(tee, cup, t);
        // Perpendicular to corridor in XZ
        const corridorDir = new Vector3().subVectors(cup, tee).normalize();
        const perp        = new Vector3(-corridorDir.z, 0, corridorDir.x);
        const side        = (rng() - 0.5) * WORLD.CLUSTER_SPREAD * 0.35;
        pos = along.clone()
          .addScaledVector(perp, side)
          .add(new Vector3(0, (rng()-0.5)*40, 0));
      } else {
        // Scatter remaining planets around the corridor midpoint
        const angle  = rng() * Math.PI * 2;
        const radius = WORLD.CLUSTER_OFFSET * 0.5 + rng() * WORLD.CLUSTER_SPREAD * 0.8;
        pos = center.clone().add(new Vector3(
          Math.cos(angle) * radius,
          (rng() - 0.5) * 60,
          Math.sin(angle) * radius,
        ));
      }

      tries++;
      const minSpacing = PLANET.RADIUS_MAX * 2.8;
      const tooClose   = positions.some(p => p.distanceTo(pos) < minSpacing);
      const tooNearTee = pos.distanceTo(tee) < PLANET.RADIUS_MAX * 2;
      const tooNearCup = pos.distanceTo(cup) < PLANET.RADIUS_MAX * 3;
      if (!tooClose && !tooNearTee && !tooNearCup) break;
    } while (tries < 120);

    const planetRadius = PLANET.RADIUS_MIN + rng() * (PLANET.RADIUS_MAX - PLANET.RADIUS_MIN);
    const mass         = Math.pow(planetRadius, 3) * PLANET.MASS_FACTOR;
    const noiseVal     = noise(pos.x * 0.008, pos.y * 0.008, pos.z * 0.008);
    pos.y             += noiseVal * 12;

    // Pass per-planet seed so Planet can pick type deterministically
    const planetSeed = Math.floor(rng() * 99999);

    planets.push({
      position: pos,
      radius:   planetRadius,
      mass,
      color:    colors[i % colors.length],
      seed:     planetSeed,
    });
    positions.push(pos);
  }

  // ── Step 3: Ensure cup isn't buried in a planet ───────────
  for (let attempt = 0; attempt < 12; attempt++) {
    const blocking = planets.find(p => cup.distanceTo(p.position) < p.radius + 22);
    if (!blocking) break;
    const away = new Vector3().subVectors(cup, blocking.position).normalize();
    cup.addScaledVector(away, blocking.radius + 22 - cup.distanceTo(blocking.position) + 8);
  }

  return { planets, tee, cup, palette, holeIndex };
}
