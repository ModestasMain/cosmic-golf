// ============================================================
// GravitySystem.js — deterministic custom gravity simulation
// NO Rapier. Pure math: F = G*M/r^2
// ============================================================

import { Vector3 } from 'three';
import { PHYSICS, BALL, AIM, ORBIT, HOLE } from '../core/Constants.js';
import { WORMHOLE_CAPTURE_RADIUS, WORMHOLE_ENTER_RADIUS } from '../objects/Wormhole.js';

// Reusable vectors to avoid per-frame allocation
const _diff = new Vector3();
const _normal = new Vector3();
const _radial = new Vector3();
const _tangent = new Vector3();
const _toCup = new Vector3();
const _stickNormal = new Vector3();
const _bounceNormal = new Vector3();
const _toWormhole = new Vector3();

/**
 * Compute total gravitational force on a position from all planets.
 * @param {Vector3} position
 * @param {Array<{position: Vector3, radius: number, mass: number}>} planets
 * @returns {Vector3} force vector (new allocation)
 */
export function computeGravityForce(position, planets) {
  const force = new Vector3();
  for (const planet of planets) {
    _diff.subVectors(planet.position, position);
    const distSq = Math.max(_diff.lengthSq(), planet.radius * planet.radius * 4);
    const strength = PHYSICS.GRAVITY_STRENGTH * planet.mass / distSq;
    force.addScaledVector(_diff.normalize(), strength);
  }
  return force;
}

/**
 * Integrate ball state one timestep using Euler integration.
 * Mutates ball.position and ball.velocity in place.
 * Deterministic: same inputs → same outputs.
 *
 * @param {{ position: Vector3, velocity: Vector3 }} ball
 * @param {Array<{position: Vector3, radius: number, mass: number}>} planets
 * @param {number} dt timestep in seconds
 * @param {number} gravityScale
 * @param {{ position: Vector3, radius: number }|null} orbitPlanet  if set, apply orbit boundary
 * @returns {{ bounced: boolean, bouncePlanet: object|null }}
 */
export function stepBall(ball, planets, dt, gravityScale = 1.0, orbitPlanet = null) {
  const force = computeGravityForce(ball.position, planets);
  force.multiplyScalar(gravityScale);

  // Euler integrate velocity
  ball.velocity.addScaledVector(force, dt);

  // Air resistance / damping
  ball.velocity.multiplyScalar(PHYSICS.VELOCITY_DAMPING);

  // Cap max speed
  const speed = ball.velocity.length();
  if (speed > PHYSICS.MAX_SPEED) {
    ball.velocity.multiplyScalar(PHYSICS.MAX_SPEED / speed);
  }

  // Euler integrate position
  ball.position.addScaledVector(ball.velocity, dt);

  // Planet collision response
  let bounced = false;
  let bouncePlanet = null;

  for (const planet of planets) {
    const dist = ball.position.distanceTo(planet.position);
    const minDist = planet.radius + BALL.RADIUS;

    if (dist < minDist) {
      _normal.subVectors(ball.position, planet.position).normalize();
      ball.position.copy(planet.position).addScaledVector(_normal, minDist);

      const dot = ball.velocity.dot(_normal);
      if (dot < 0) {
        const impactSpeed = -dot;
        const restitution = PHYSICS.BOUNCE_DAMPING * Math.min(impactSpeed / 25.0, 1.0);
        ball.velocity.addScaledVector(_normal, -(1 + restitution) * dot);
        const vTangential = ball.velocity.clone().addScaledVector(_normal, -ball.velocity.dot(_normal));
        ball.velocity.addScaledVector(vTangential, -0.2);
        if (impactSpeed > 2.0) {
          bounced = true;
          bouncePlanet = planet;
        }
      }
    }
  }

  // Orbit boundary: keep ball within boundary sphere around orbit planet
  if (orbitPlanet) {
    const boundaryR = orbitPlanet.radius * ORBIT.BOUNDARY_FACTOR;
    _radial.subVectors(ball.position, orbitPlanet.position);
    const distFromCenter = _radial.length();
    if (distFromCenter > boundaryR) {
      // Clamp position to boundary surface
      _radial.normalize();
      ball.position.copy(orbitPlanet.position).addScaledVector(_radial, boundaryR);

      // Reflect radial velocity component, keep tangential
      const radialSpeed = ball.velocity.dot(_radial);
      if (radialSpeed > 0) {
        // Remove outward radial component and add it back inward (elastic reflection)
        ball.velocity.addScaledVector(_radial, -radialSpeed * 1.5);
        // Tangential friction at boundary
        _tangent.copy(ball.velocity).addScaledVector(_radial, -ball.velocity.dot(_radial));
        ball.velocity.addScaledVector(_tangent, -0.15);
      }
    }
  }

  return { bounced, bouncePlanet };
}

/**
 * Simulate a trajectory for preview without mutating anything.
 * Mirrors HoleScene BALL_IN_FLIGHT physics in the EXACT same order:
 *   1. stepBall (gravity + velocity integration + planet collision)
 *   2. Zero-gravity sticky (server zero-g only, checks ALL planets)
 *   3. Bounce handling + 3-bounce pin (with cooldown)
 *   4. Black hole gravitational pull
 *   5. Cup check (distance only, no speed threshold — matches checkBallHoled)
 *   6. Settle detection (at-rest on surface)
 *   7. Void detection (deep void, slow drift, zero-g void, hard outer limit)
 *
 * @param {Vector3} startPos
 * @param {Vector3} startVel
 * @param {Array} planets         planets used for gravity (orbit-filtered if in orbit mode)
 * @param {Array} allPlanets      all planets (for zero-g sticky and settle checks in orbit mode)
 * @param {number} steps
 * @param {number} dt
 * @param {number} gravityScale
 * @param {{ position: Vector3, radius: number }|null} orbitPlanet
 * @param {{ blackHole?: { position: Vector3, pullRadius: number, gravity: number, cupRadius: number }, zeroGravity?: boolean, graceFrames?: number, hitFreezeFrames?: number, tee?: Vector3, cup?: Vector3, wormholes?: Vector3[] }|null} options
 * @returns {{ points: Vector3[], danger: number[] }} danger: 0=safe, 1=near void, 2=in void/OOB
 */
export function simulateTrajectory(startPos, startVel, planets, allPlanets, steps, dt, gravityScale = 1.0, orbitPlanet = null, options = null) {
  const points = [];
  const danger = [];
  const pos = startPos.clone();
  const vel = startVel.clone();
  const ball = { position: pos, velocity: vel };

  const blackHole   = options?.blackHole ?? null;
  const zeroGravity = options?.zeroGravity ?? false;
  const tee         = options?.tee ?? null;
  const cup         = options?.cup ?? null;
  const wormholes   = options?.wormholes ?? null;

  let graceFrames = options?.graceFrames ?? PHYSICS.LAUNCH_GRACE_FRAMES;
  let hitFreezeFrames = options?.hitFreezeFrames ?? 0; // 4 frames for actual shots
  let bounceStreak = 0;
  let bouncePlanetIdx = -1;
  let bounceCooldownSteps = 0;
  let bounceGraceSteps = 0;
  let voidSteps = 0;
  let stuckSteps = 0;
  const bounceCooldownTotal = Math.round(PHYSICS.BOUNCE_COOLDOWN_MS / (dt * 1000));
  const bounceGraceTotal = Math.round(90 * dt * 1000 / 1000); // 90 frames ≈ 1.5s

  for (let i = 0; i < steps; i++) {
    points.push(ball.position.clone());

    // Hit-freeze: ball stays at starting position, physics doesn't run
    if (hitFreezeFrames > 0) {
      hitFreezeFrames--;
      continue;
    }

    let gs = gravityScale;
    if (graceFrames > 0) {
      graceFrames--;
      gs *= 1.0 - (graceFrames / PHYSICS.LAUNCH_GRACE_FRAMES);
    }

    // 1. stepBall — gravity, velocity integration, planet collision response
    const result = stepBall(ball, planets, dt, gs, orbitPlanet);

    // 2. Zero-gravity sticky (server zero-g only — checks ALL planets, not orbit-filtered)
    if (zeroGravity) {
      let stuck = false;
      for (const planet of allPlanets) {
        const dist = ball.position.distanceTo(planet.position);
        if (dist < planet.radius + BALL.RADIUS + 0.5) {
          _stickNormal.subVectors(ball.position, planet.position).normalize();
          ball.position.copy(planet.position).addScaledVector(_stickNormal, planet.radius + BALL.RADIUS);
          ball.velocity.set(0, 0, 0);
          stuck = true;
          break;
        }
      }
      if (stuck) {
        points.push(ball.position.clone());
        danger.push(0);
        return { points, danger };
      }
    }

    // 3. Bounce handling + 3-bounce pin (with cooldown — mirrors HoleScene)
    if (result.bounced) {
      if (bounceCooldownSteps <= 0) {
        bounceCooldownSteps = bounceCooldownTotal;
        bounceGraceSteps = bounceGraceTotal;
        const pIdx = allPlanets.indexOf(result.bouncePlanet);
        if (pIdx < 0) {
          const altIdx = planets.indexOf(result.bouncePlanet);
          if (altIdx >= 0) {
            // In orbit mode the bounce planet is in `planets` not `allPlanets`
            // Find it in allPlanets by reference
          }
        }
        // Find the planet index in allPlanets
        let foundIdx = -1;
        for (let j = 0; j < allPlanets.length; j++) {
          if (allPlanets[j] === result.bouncePlanet) { foundIdx = j; break; }
        }
        if (foundIdx >= 0) {
          if (foundIdx === bouncePlanetIdx) {
            bounceStreak++;
          } else {
            bouncePlanetIdx = foundIdx;
            bounceStreak = 1;
          }
          if (bounceStreak >= 3) {
            _bounceNormal.subVectors(ball.position, result.bouncePlanet.position).normalize();
            ball.position.copy(result.bouncePlanet.position).addScaledVector(_bounceNormal, result.bouncePlanet.radius + BALL.RADIUS);
            ball.velocity.set(0, 0, 0);
            points.push(ball.position.clone());
            danger.push(0);
            return { points, danger };
          }
        } else {
          bouncePlanetIdx = -1;
          bounceStreak = 0;
        }
      }
    }
    if (bounceCooldownSteps > 0) bounceCooldownSteps--;
    if (bounceGraceSteps > 0) bounceGraceSteps--;

    // 4. Black hole gravitational pull
    if (blackHole) {
      const cupDist = ball.position.distanceTo(blackHole.position);
      if (cupDist < blackHole.pullRadius && cupDist > blackHole.cupRadius) {
        const t = 1 - cupDist / blackHole.pullRadius;
        const distSq = Math.max(cupDist * cupDist, blackHole.cupRadius * blackHole.cupRadius);
        const strength = blackHole.gravity * t * t / distSq;
        _toCup.subVectors(blackHole.position, ball.position).normalize();
        ball.velocity.addScaledVector(_toCup, strength * dt * 60);
      }
    }

    // 4b. Wormhole suction — gravity pull toward wormholes within capture radius
    if (wormholes && wormholes.length > 0) {
      for (const wPos of wormholes) {
        const toWorm = _toWormhole.subVectors(wPos, ball.position);
        const dist = toWorm.length();
        if (dist < WORMHOLE_CAPTURE_RADIUS && dist > 0.1) {
          const t = 1 - dist / WORMHOLE_CAPTURE_RADIUS;
          const strength = 600 * t * t; // Matches Wormhole.applySuction
          ball.velocity.addScaledVector(toWorm.normalize(), strength * dt);
        }
        // Check if ball entered wormhole (enters portal)
        if (dist < WORMHOLE_ENTER_RADIUS) {
          points.push(ball.position.clone());
          danger.push(0);
          return { points, danger };
        }
      }
    }

    // 5. Cup check (distance only — matches checkBallHoled, no speed threshold)
    if (blackHole) {
      const cupDist = ball.position.distanceTo(blackHole.position);
      if (cupDist < blackHole.cupRadius) {
        points.push(ball.position.clone());
        danger.push(0);
        return { points, danger };
      }
    }

    // 6. Settle detection — at-rest on a planet surface (mirrors HoleScene nearSurface + atRest)
    const ballSpeed = ball.velocity.length();
    const nearSurface = allPlanets.some(p =>
      ball.position.distanceTo(p.position) < p.radius + BALL.RADIUS * 3
    );
    if (nearSurface && ballSpeed < 12) {
      stuckSteps++;
    } else {
      stuckSteps = 0;
    }
    if (ballSpeed < PHYSICS.REST_VELOCITY && nearSurface) {
      danger.push(0);
      break;
    }
    if (stuckSteps > PHYSICS.STUCK_FRAMES) {
      danger.push(0);
      break;
    }

    // 7. Void detection — mirrors HoleScene exactly
    let nearestSafe = Infinity;
    for (const p of allPlanets) {
      const d = ball.position.distanceTo(p.position) - p.radius;
      if (d < nearestSafe) nearestSafe = d;
    }
    if (blackHole) {
      nearestSafe = Math.min(nearestSafe, ball.position.distanceTo(blackHole.position));
    }
    if (tee) {
      nearestSafe = Math.min(nearestSafe, ball.position.distanceTo(tee));
    }
    if (cup) {
      nearestSafe = Math.min(nearestSafe, ball.position.distanceTo(cup));
    }
    if (wormholes) {
      for (const w of wormholes) {
        nearestSafe = Math.min(nearestSafe, ball.position.distanceTo(w));
      }
    }

    // Hard outer limit
    if (ball.position.length() > HOLE.OUT_OF_BOUNDS_DISTANCE) {
      danger.push(2);
      break;
    }

    // Deep void
    if (nearestSafe > HOLE.VOID_OOB_SURFACE_DIST) {
      danger.push(2);
      break;
    }

    // Slow drift (suppressed for bounceGraceSteps after a bounce)
    if (bounceGraceSteps <= 0 && nearestSafe > 160 && ballSpeed < HOLE.VOID_DRIFT_SPEED) {
      danger.push(2);
      break;
    }

    // Zero-gravity void checks
    if (zeroGravity) {
      if (nearestSafe > HOLE.VOID_ZERO_G_SLOW_DIST && ballSpeed < HOLE.VOID_ZERO_G_SLOW_SPEED) {
        danger.push(2);
        break;
      }
      if (nearestSafe > HOLE.VOID_ZERO_G_SURFACE_DIST) {
        voidSteps++;
        if (voidSteps > HOLE.VOID_ZERO_G_GRACE_FRAMES) {
          danger.push(2);
          break;
        }
      } else {
        voidSteps = 0;
      }
    } else {
      voidSteps = 0;
    }

    // Danger coloring
    if (nearestSafe > 500) {
      danger.push(1);
    } else {
      danger.push(0);
    }

    // Orbit boundary
    if (orbitPlanet) {
      const boundaryR = orbitPlanet.radius * ORBIT.BOUNDARY_FACTOR;
      const d = ball.position.distanceTo(orbitPlanet.position);
      if (d > boundaryR) {
        danger.push(2);
        break;
      }
    }
  }

  return { points, danger };
}
