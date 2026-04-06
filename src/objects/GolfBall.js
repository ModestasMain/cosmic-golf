// ============================================================
// GolfBall.js — realistic golf ball with dimple texture
// ============================================================

import {
  Mesh, SphereGeometry, MeshStandardMaterial,
  Vector3, PointLight, Group, CanvasTexture,
  RepeatWrapping,
} from 'three';
import { BALL } from '../core/Constants.js';

const DIMPLE_R  = 18;   // dimple radius in px (texture space)
const DIMPLE_GAP = 4;   // gap between dimples
const TEX_SIZE  = 512;

/**
 * Build a normal map that looks like real golf-ball dimples.
 * Hexagonal grid tiling for even coverage.
 */
function makeDimpleNormalMap() {
  const canvas = document.createElement('canvas');
  canvas.width  = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');

  // Flat normal base: RGB(128,128,255)
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const step = DIMPLE_R * 2 + DIMPLE_GAP;
  const rows = Math.ceil(TEX_SIZE / step) + 2;
  const cols = Math.ceil(TEX_SIZE / step) + 2;

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      // Hex offset: odd rows shift right by half a step
      const x = col * step + (row % 2 === 0 ? 0 : step * 0.5);
      const y = row * step * 0.866; // sin(60°) for hex packing

      _drawDimple(ctx, x, y, DIMPLE_R);
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(3, 2); // tile 3×2 over the sphere UV
  return tex;
}

function _drawDimple(ctx, cx, cy, r) {
  // Dimple = circular indentation.
  // Normal map: centre tilts slightly outward, rim tilts inward → rounded bowl look.
  // We use two radial gradients layered:
  //   1. Outer rim: RG shift toward edges (tilt outward)
  //   2. Inner depression: slight blue reduction (surface pointing inward)

  // Outer shadow ring (rim highlight — surface tilts away)
  const rim = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
  rim.addColorStop(0,   'rgba(128,128,255,0)');      // transparent centre
  rim.addColorStop(0.7, 'rgba(80,80,210,0.6)');      // dim at rim
  rim.addColorStop(1,   'rgba(128,128,255,0)');      // fade out
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();

  // Inner bowl (normal tilts away from viewer = less blue)
  const bowl = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.75);
  bowl.addColorStop(0,   'rgba(100,100,230,0.55)');  // depressed centre
  bowl.addColorStop(0.6, 'rgba(110,110,240,0.3)');
  bowl.addColorStop(1,   'rgba(128,128,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.fillStyle = bowl;
  ctx.fill();
}

/**
 * Subtle albedo map: white base with faint grey dimple shadows.
 * Gives depth even without dramatic lighting.
 */
function makeDimpleAlbedoMap() {
  const canvas = document.createElement('canvas');
  canvas.width  = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const step = DIMPLE_R * 2 + DIMPLE_GAP;
  const rows = Math.ceil(TEX_SIZE / step) + 2;
  const cols = Math.ceil(TEX_SIZE / step) + 2;

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const x = col * step + (row % 2 === 0 ? 0 : step * 0.5);
      const y = row * step * 0.866;

      // Faint grey shadow inside each dimple
      const g = ctx.createRadialGradient(x, y, 0, x, y, DIMPLE_R);
      g.addColorStop(0,   'rgba(180,180,180,0.25)'); // subtle shadow
      g.addColorStop(0.7, 'rgba(200,200,200,0.12)');
      g.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(x, y, DIMPLE_R, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

export class GolfBall {
  constructor(color = 0xffffff) {
    this.color = color;

    this.position = new Vector3();
    this.velocity = new Vector3();

    this.group = new Group();
    this._buildMesh();
    this._buildLight();
  }

  _buildMesh() {
    // Higher segment count for a smooth sphere
    const geo = new SphereGeometry(BALL.RADIUS, 36, 28);

    const normalMap = makeDimpleNormalMap();
    const map       = makeDimpleAlbedoMap();

    const mat = new MeshStandardMaterial({
      map,
      color:            0xffffff,
      roughness:        0.55,   // slightly matte — golf balls aren't shiny plastic
      metalness:        0.0,
      normalMap,
      normalScale:      { x: 1.2, y: 1.2 }, // dimple depth
      emissive:         0xffffff,
      emissiveIntensity: 0.18,  // enough to bloom visibly against dark space
      transparent:      true,   // keep in transparent queue so renderOrder beats planets
      opacity:          1.0,
      depthWrite:       false,
    });

    this.mesh = new Mesh(geo, mat);
    this.mesh.castShadow  = false;
    this.mesh.renderOrder = 100;
    this.mesh.material.depthTest = false;
    this.group.add(this.mesh);

    this._normalMap = normalMap;
    this._albedoMap = map;
  }

  _buildLight() {
    // Neutral white light — real golf balls don't glow blue
    this.light = new PointLight(0xffffff, 0.5, 15);
    this.group.add(this.light);
  }

  setPosition(pos) {
    this.position.copy(pos);
    this.group.position.copy(pos);
  }

  setVelocity(vel) { this.velocity.copy(vel); }

  launch(direction, power) {
    this.velocity.copy(direction).multiplyScalar(power);
  }

  syncMesh() {
    this.group.position.copy(this.position);
  }

  // Spin the ball based on velocity so dimples animate during flight
  updateSpin(dt) {
    const speed = this.velocity.length();
    if (speed > 0.5) {
      const axis = this.velocity.clone().normalize();
      this.mesh.rotateOnWorldAxis(axis, speed * dt * 0.4);
    }
  }

  addToScene(scene)    { scene.add(this.group); }
  removeFromScene(scene) { scene.remove(this.group); this.dispose(); }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this._normalMap) this._normalMap.dispose();
    if (this._albedoMap) this._albedoMap.dispose();
  }
}
