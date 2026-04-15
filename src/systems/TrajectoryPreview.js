// ============================================================
// TrajectoryPreview.js — trajectory line preview with depth
// and distance-based coloring, planet highlights
// ============================================================

import {
  BufferGeometry, BufferAttribute, Points, PointsMaterial,
  AdditiveBlending, Vector3,
} from 'three';
import { simulateTrajectory } from './GravitySystem.js';
import { AIM, BALL } from '../core/Constants.js';

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

export class TrajectoryPreview {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this._targetPlanetIdx = -1;
    this._behindPlanetIdxs = [];
    this._buildMesh();
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
      size: AIM.TRAJECTORY_DOT_SIZE,
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
      AIM.TRAJECTORY_STEPS,
      AIM.TRAJECTORY_DT,
      gravityScale,
      orbitPlanet,
      options,
    );

    const positions = this.geometry.attributes.position.array;
    const colors    = this.geometry.attributes.color.array;
    const total     = result.points.length;

    this._targetPlanetIdx = -1;
    this._behindPlanetIdxs = [];

    const camPos = camera ? camera.position : null;

    let targetPlanetFound = false;

    const STEP = AIM.TRAJECTORY_POINT_STEP;
    let count = 0;
    for (let i = 0; i < total; i += STEP) {
      if (count >= AIM.TRAJECTORY_STEPS) break;
      const p = result.points[i];
      const d = result.danger[i] ?? 0;

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

      if (!targetPlanetFound && allPlanets && d === 0) {
        for (let pi = 0; pi < allPlanets.length; pi++) {
          const planet = allPlanets[pi];
          const dist = p.distanceTo(planet.position);
          if (dist < planet.radius + BALL.RADIUS * 4) {
            this._targetPlanetIdx = pi;
            targetPlanetFound = true;
            break;
          }
        }
      }

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
        alpha *= 2.8;
      } else if (nearestSurfaceDist < 120) {
        // Near planet - partially solid
        const falloff = 1.0 - (nearestSurfaceDist - 50) / 70;
        alpha *= 1.0 + falloff * 1.5;
      } else {
        // In the void - keep it transparent
        alpha *= 0.6;
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

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate    = true;
    this.geometry.setDrawRange(0, count);

    this.points.visible = this.visible;

    if (planetObjects) {
      this._applyPlanetHighlights(planetObjects);
    }
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

  show() {
    this.visible = true;
    this.points.visible = true;
  }

  hide() {
    this.visible = false;
    this.points.visible = false;
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
  }
}
