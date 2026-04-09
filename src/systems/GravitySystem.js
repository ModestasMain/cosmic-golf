// ============================================================
// GravitySystem.js — deterministic custom gravity simulation
// NO Rapier. Pure math: F = G*M/r^2
// ============================================================

import { Vector3 } from 'three';
import { PHYSICS, BALL, AIM } from '../core/Constants.js';

// Reusable vectors to avoid per-frame allocation
const _diff = new Vector3();
const _normal = new Vector3();

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
    // Minimum distance squared to prevent infinite force at collision boundary
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
 * @returns {{ bounced: boolean, bouncePlanet: object|null }}
 */
export function stepBall(ball, planets, dt, gravityScale = 1.0) {
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
      // Push ball to surface
      _normal.subVectors(ball.position, planet.position).normalize();
      ball.position.copy(planet.position).addScaledVector(_normal, minDist);

      // Reflect velocity off surface normal with speed-dependent restitution.
      // Slow impacts barely bounce (restitution → 0), fast impacts get full damping.
      // This avoids both micro-bouncing at rest AND the floating problem.
      const dot = ball.velocity.dot(_normal);
      if (dot < 0) {
        const impactSpeed = -dot;
        const restitution = PHYSICS.BOUNCE_DAMPING * Math.min(impactSpeed / 25.0, 1.0);
        ball.velocity.addScaledVector(_normal, -(1 + restitution) * dot);
        // Tangential friction always applies
        const vTangential = ball.velocity.clone().addScaledVector(_normal, -ball.velocity.dot(_normal));
        ball.velocity.addScaledVector(vTangential, -0.2);
        if (impactSpeed > 2.0) {
          bounced = true;
          bouncePlanet = planet;
        }
      }
    }
  }

  return { bounced, bouncePlanet };
}

/**
 * Simulate a trajectory for preview without mutating anything.
 * @param {Vector3} startPos
 * @param {Vector3} startVel
 * @param {Array} planets
 * @param {number} steps
 * @param {number} dt
 * @returns {Vector3[]} array of positions
 */
export function simulateTrajectory(startPos, startVel, planets, steps, dt) {
  const points = [];
  const pos = startPos.clone();
  const vel = startVel.clone();
  const ball = { position: pos, velocity: vel };

  // Mirror the launch grace period so preview matches real flight
  let graceFrames = PHYSICS.LAUNCH_GRACE_FRAMES;

  for (let i = 0; i < steps; i++) {
    points.push(ball.position.clone());

    let gravityScale = 1.0;
    if (graceFrames > 0) {
      graceFrames--;
      gravityScale = 1.0 - (graceFrames / PHYSICS.LAUNCH_GRACE_FRAMES);
    }

    stepBall(ball, planets, dt, gravityScale);

    if (ball.position.length() > 1300) break;
  }

  return points;
}
