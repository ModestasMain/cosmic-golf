// ============================================================
// TrajectoryPreview.js — trajectory line preview with depth
// and distance-based coloring, planet highlights
// ============================================================

import {
  BufferGeometry, BufferAttribute, Points, PointsMaterial,
  AdditiveBlending, Vector3, Mesh, SphereGeometry, MeshBasicMaterial, Color,
} from 'three';
import { simulateTrajectory } from './GravitySystem.js';
import { AIM, BALL } from '../core/Constants.js';

export const TRAJ_CONFIG = {
  steps:       AIM.TRAJECTORY_STEPS,
  dt:          AIM.TRAJECTORY_DT,
  pointStep:   AIM.TRAJECTORY_POINT_STEP,
  dotSize:     AIM.TRAJECTORY_DOT_SIZE,
  voidAlpha:   0.6,   // alpha multiplier for dots in the void
  nearAlpha:   2.8,   // alpha multiplier close to planet surface
};

const _camToPt = new Vector3();
const _camToPlanet = new Vector3();
const _ptToPlanet = new Vector3();

function lerpColor(t) {
  if (t < 0.25) {
    const s = t / 0.25;
    return { r: 0.1 + s * 0.0, g: 0.9 + s * 0.1, b: 1.0 - s * 0.2 };
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return { r: 0.1 + s * 0.6, g: 1.0 - s * 0.1, b: 0.8 - s * 0.6 };
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return { r: 0.7 + s * 0.3, g: 0.9 - s * 0.4, b: 0.2 - s * 0.1 };
  } else {
    const s = (t - 0.75) / 0.25;
    return { r: 1.0, g: 0.5 - s * 0.35, b: 0.1 - s * 0.05 };
  }
}

// Endpoint marker colors per outcome
const ENDPOINT_COLORS = {
  cup:          new Color(0x00ffff),
  wormhole:     new Color(0xaa44ff),
  settled:      new Color(0x44ff88),
  pinned:       new Color(0x44ff88),
  zero_g_stuck: new Color(0x44ff88),
  oob:          new Color(0xff2200),
  limit:        new Color(0x2266ff),
};

export class TrajectoryPreview {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this._targetPlanetIdx = -1;
    this._behindPlanetIdxs = [];
    this._lastOutcome = 'limit';
    this._buildMesh();
    this._buildEndpointMarker();
  }

  _buildMesh() {
    const maxPoints = AIM.TRAJECTORY_STEPS;

    const positions = new Float32Array(maxPoints * 3);
    const colors = new Float32Array(maxPoints * 3);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new PointsMaterial({
      size: TRAJ_CONFIG.dotSize,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      sizeAttenuation: false,
      vertexColors: true,
    });

    this.points = new Points(this.geometry, this.material);
    this.points.visible = false;
    this.points.renderOrder = 999;
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  _buildEndpointMarker() {
    const geo = new SphereGeometry(4.5, 10, 8);
    this._endpointMat = new MeshBasicMaterial({
      color: new Color(0x44ff88),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this._endpointMarker = new Mesh(geo, this._endpointMat);
    this._endpointMarker.visible = false;
    this._endpointMarker.renderOrder = 998;
    this._endpointMarker.frustumCulled = false;
    this.scene.add(this._endpointMarker);
  }

  /**
   * @param {Vector3} ballPos
   * @param {Vector3} shotVelocity
   * @param {Array}   planets
   * @param {Array}   allPlanets
   * @param {number}  gravityScale
   * @param {{ position: Vector3, radius: number }|null} orbitPlanet
   * @param {{ blackHole?: object, zeroGravity?: boolean, graceFrames?: number, tee?: Vector3, cup?: Vector3, wormholes?: Vector3[] }|null} options
   * @param {Camera}  camera
   * @param {Array}   planetObjects   Planet instances for highlight control
   */
  update(ballPos, shotVelocity, planets, allPlanets, gravityScale = 1.0, orbitPlanet = null, options = null, camera = null, planetObjects = null) {
    const result = simulateTrajectory(
      ballPos,
      shotVelocity,
      planets,
      allPlanets,
      TRAJ_CONFIG.steps,
      TRAJ_CONFIG.dt,
      gravityScale,
      orbitPlanet,
      options,
    );

    this._lastOutcome = result.stopReason ?? 'limit';

    const positions = this.geometry.attributes.position.array;
    const colors    = this.geometry.attributes.color.array;
    const total     = result.points.length;

    this._targetPlanetIdx = -1;
    this._behindPlanetIdxs = [];

    const camPos = camera ? camera.position : null;

    const STEP = TRAJ_CONFIG.pointStep;
    let count = 0;
    for (let i = 0; i < total; i += STEP) {
      if (count >= TRAJ_CONFIG.steps) break;
      const p = result.points[i];

      const t = count / Math.max(1, Math.floor(total / STEP) - 1);

      // Check if this point is behind any planet (occluded from camera view)
      let isBehind = false;
      if (camPos && allPlanets) {
        _camToPt.subVectors(p, camPos);
        const ptDist = _camToPt.length();
        if (ptDist > 0.001) {
          const ptDir = _camToPt.divideScalar(ptDist);
          for (let pi = 0; pi < allPlanets.length; pi++) {
            const planet = allPlanets[pi];
            _camToPlanet.subVectors(planet.position, camPos);
            const projLen = _camToPlanet.dot(ptDir);
            // Planet is between camera and point if projLen > 0 and less than point distance
            if (projLen > 0 && projLen < ptDist) {
              _ptToPlanet.subVectors(p, planet.position);
              const perpDist = _ptToPlanet.length();
              // Point is inside planet radius → occluded
              if (perpDist < planet.radius + BALL.RADIUS * 0.5) {
                isBehind = true;
                if (!this._behindPlanetIdxs.includes(pi)) {
                  this._behindPlanetIdxs.push(pi);
                }
                break;
              }
            }
          }
        }
      }

      positions[count * 3]     = p.x;
      positions[count * 3 + 1] = p.y;
      positions[count * 3 + 2] = p.z;

      const d = result.danger[i] ?? 0;
      let col = d === 2
        ? { r: 1.0, g: 0.15, b: 0.1 }
        : d === 1
        ? { r: 1.0, g: 0.55, b: 0.1 }
        : lerpColor(t);

      // Base trajectory is more transparent overall
      let alpha = Math.pow(1.0 - t, 0.3) * 0.35;

      // Calculate nearest distance to any planet surface
      let nearestSurfaceDist = Infinity;
      for (const planet of allPlanets) {
        const distToSurface = p.distanceTo(planet.position) - planet.radius;
        if (distToSurface < nearestSurfaceDist) nearestSurfaceDist = distToSurface;
      }

      // In front/near planets = more opaque, in void = more transparent
      if (nearestSurfaceDist < 50) {
        // Very close to planet surface - solid
        alpha *= TRAJ_CONFIG.nearAlpha;
      } else if (nearestSurfaceDist < 120) {
        // Near planet - partially solid
        const falloff = 1.0 - (nearestSurfaceDist - 50) / 70;
        alpha *= 1.0 + falloff * 1.5;
      } else {
        // In the void - keep it transparent
        alpha *= TRAJ_CONFIG.voidAlpha;
      }

      // When behind a planet: make it very faint and desaturated/grey
      if (isBehind) {
        // Desaturate toward grey
        const grey = (col.r + col.g + col.b) * 0.33;
        col.r = col.r * 0.2 + grey * 0.8;
        col.g = col.g * 0.2 + grey * 0.8;
        col.b = col.b * 0.2 + grey * 0.8;
        // Even lower alpha for behind-planet ghost effect
        alpha *= 0.15;
      }

      colors[count * 3]     = col.r * alpha;
      colors[count * 3 + 1] = col.g * alpha;
      colors[count * 3 + 2] = col.b * alpha;
      count++;
    }

    // Find target planet from the LAST trajectory point (after all bounces resolve)
    const isLanding = this._lastOutcome === 'settled' || this._lastOutcome === 'pinned' || this._lastOutcome === 'zero_g_stuck';
    if (isLanding && allPlanets && total > 0) {
      const lastPt = result.points[total - 1];
      let closestIdx = -1, closestDist = Infinity;
      for (let pi = 0; pi < allPlanets.length; pi++) {
        const d = lastPt.distanceTo(allPlanets[pi].position) - allPlanets[pi].radius;
        if (d < closestDist) { closestDist = d; closestIdx = pi; }
      }
      if (closestDist < BALL.RADIUS * 6) this._targetPlanetIdx = closestIdx;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate    = true;
    this.geometry.setDrawRange(0, count);

    // Endpoint marker — place at last trajectory point, pulse, color by outcome
    if (total > 0 && this.visible) {
      const last = result.points[total - 1];
      this._endpointMarker.position.copy(last);
      const col = ENDPOINT_COLORS[this._lastOutcome] ?? ENDPOINT_COLORS.limit;
      this._endpointMat.color.copy(col);
      // Pulse: OOB pulses fast, safe pulses slowly
      const pulseSpeed = this._lastOutcome === 'oob' ? 8 : 2.5;
      const pulse = 0.55 + Math.sin(Date.now() * 0.001 * pulseSpeed) * 0.3;
      this._endpointMat.opacity = pulse;
      this._endpointMarker.visible = true;
    } else {
      this._endpointMarker.visible = false;
    }

    this.points.visible = this.visible;

    if (planetObjects) {
      this._applyPlanetHighlights(planetObjects);
    }

    return this._lastOutcome;
  }

  _applyPlanetHighlights(planetObjects) {
    const now = Date.now() / 1000;
    for (let i = 0; i < planetObjects.length; i++) {
      const pObj = planetObjects[i];
      if (i === this._targetPlanetIdx) {
        const pulse = 0.3 + Math.sin(now * 4) * 0.15;
        pObj.setTrajectoryHighlight('target', pulse);
      } else if (this._behindPlanetIdxs.includes(i)) {
        pObj.setTrajectoryHighlight('behind', 0.15);
      } else {
        pObj.setTrajectoryHighlight(null, 0);
      }
    }
  }

  _rebuildGeometry() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this._buildMesh();
  }

  show() {
    this.visible = true;
    this.points.visible = true;
  }

  hide() {
    this.visible = false;
    this.points.visible = false;
    this._endpointMarker.visible = false;
  }

  clearHighlights(planetObjects) {
    if (!planetObjects) return;
    for (const pObj of planetObjects) {
      pObj.setTrajectoryHighlight(null, 0);
    }
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this._endpointMarker);
    this._endpointMat.dispose();
  }
}
