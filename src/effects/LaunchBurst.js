// ============================================================
// LaunchBurst.js — Points-based particle burst (launch + bounce)
// Single geometry per burst — no per-particle mesh allocation.
// ============================================================

import {
  BufferGeometry, Float32BufferAttribute, PointsMaterial,
  Points, AdditiveBlending, Vector3,
} from 'three';

const POOL_SIZE = 32; // max particles per burst

class Burst {
  constructor(scene, position, color, count, speed, size, life) {
    this.scene   = scene;
    this.life    = 0;
    this.maxLife = life;

    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8)  & 0xff) / 255;
    const b = (color & 0xff) / 255;

    this._vels = [];
    for (let i = 0; i < count; i++) {
      const dir = new Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.8));

      this._vels.push(dir);
      pos[i * 3]     = position.x;
      pos[i * 3 + 1] = position.y;
      pos[i * 3 + 2] = position.z;
      col[i * 3]     = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;
    }

    this._pos   = pos;
    this._count = count;

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color',    new Float32BufferAttribute(col, 3));

    const mat = new PointsMaterial({
      size:         size,
      vertexColors: true,
      transparent:  true,
      opacity:      1.0,
      depthWrite:   false,
      blending:     AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new Points(geo, mat);
    this.points.renderOrder = 95;
    scene.add(this.points);
    this._geo = geo;
    this._mat = mat;
  }

  update(dt) {
    this.life += dt;
    const t = this.life / this.maxLife;
    this._mat.opacity = Math.pow(1 - t, 1.5);

    const pa = this._geo.attributes.position.array;
    for (let i = 0; i < this._count; i++) {
      const v = this._vels[i];
      pa[i * 3]     += v.x * dt;
      pa[i * 3 + 1] += v.y * dt;
      pa[i * 3 + 2] += v.z * dt;
      // Slight drag
      v.multiplyScalar(0.92);
    }
    this._geo.attributes.position.needsUpdate = true;
    return t < 1;
  }

  dispose() {
    this.scene.remove(this.points);
    this._geo.dispose();
    this._mat.dispose();
  }
}

export class LaunchBurst {
  constructor(scene) {
    this.scene   = scene;
    this._active = [];
  }

  /** Launch burst — bright, many particles */
  trigger(position, palette) {
    const color = (palette && palette.ball) ? palette.ball : 0xffffff;
    this._active.push(new Burst(this.scene, position, color,  20, 18, 2.5, 0.55));
    this._active.push(new Burst(this.scene, position, 0xaaddff, 10, 10, 1.8, 0.4));
  }

  /** Bounce burst — smaller, at impact point */
  triggerBounce(position, palette) {
    const color = (palette && palette.cup) ? palette.cup : 0xffcc44;
    this._active.push(new Burst(this.scene, position, color,  8, 12, 2.0, 0.3));
  }

  update(dt) {
    this._active = this._active.filter(b => {
      const alive = b.update(dt);
      if (!alive) b.dispose();
      return alive;
    });
  }

  dispose() {
    for (const b of this._active) b.dispose();
    this._active = [];
  }
}
