// ============================================================
// StarField.js — 2000 star points at radius 500
// Static — created once, persists across holes
// Tints stars to palette accent colors on HOLE_STARTED events
// ============================================================

import {
  BufferGeometry, BufferAttribute, Points, PointsMaterial,
  AdditiveBlending, Color,
} from 'three';
import { STARFIELD } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

export class StarField {
  constructor(scene, starColor = 0xffffff) {
    this.scene = scene;
    this.starColor = starColor;
    this._build();
    this._setupEventListeners();
  }

  _build() {
    const count = STARFIELD.COUNT;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Spherical distribution
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = 2 * Math.PI * Math.random();
      const r = STARFIELD.RADIUS * (0.8 + Math.random() * 0.2);

      positions[i * 3]     = r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = r * Math.cos(theta);

      sizes[i] = 0.5 + Math.random() * 2.5;

      // Default white
      colors[i * 3]     = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometry.setAttribute('size', new BufferAttribute(sizes, 1));
    this.geometry.setAttribute('color', new BufferAttribute(colors, 3));

    this.material = new PointsMaterial({
      size: 1.5,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      vertexColors: true,
    });

    this.points = new Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  _setupEventListeners() {
    eventBus.on(Events.HOLE_LOADED, ({ holeIndex }) => {
      // holeIndex is passed from HoleScene.loadHole — we don't have the palette directly here,
      // so we rely on the setColor() call already made in HoleScene for the base tint.
      // Vertex colors will be updated by setColor().
    });
  }

  setColor(color) {
    // Tint all stars toward the palette color, keeping some white variation
    const col = new Color(color);
    const colors = this.geometry.attributes.color.array;
    const count = STARFIELD.COUNT;

    for (let i = 0; i < count; i++) {
      // Mix between white and palette color; brighter stars stay more white
      const brightness = 0.5 + Math.random() * 0.5;
      const tint = 0.15 + Math.random() * 0.25; // how much palette influence

      colors[i * 3]     = brightness * (1 - tint) + col.r * tint;
      colors[i * 3 + 1] = brightness * (1 - tint) + col.g * tint;
      colors[i * 3 + 2] = brightness * (1 - tint) + col.b * tint;
    }

    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
