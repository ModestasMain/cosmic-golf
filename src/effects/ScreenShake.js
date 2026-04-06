// ============================================================
// ScreenShake.js — applies a decaying positional shake offset
// Usage: call trigger(), then call update(dt) each frame.
// Read shakeOffset and add it on top of the camera follow position.
// ============================================================

import { Vector3 } from 'three';

export class ScreenShake {
  constructor() {
    this.shakeOffset = new Vector3();
    this._amplitude = 0;
    this._duration = 0;
    this._elapsed = 0;
    this._active = false;
  }

  /**
   * Start a new shake, overriding any in-progress one.
   * @param {number} amplitude  max positional offset in world units
   * @param {number} duration   seconds
   */
  trigger(amplitude, duration) {
    this._amplitude = amplitude;
    this._duration = duration;
    this._elapsed = 0;
    this._active = true;
  }

  /**
   * Call once per frame. Updates this.shakeOffset.
   * @param {number} dt  delta time in seconds
   */
  update(dt) {
    if (!this._active) {
      this.shakeOffset.set(0, 0, 0);
      return;
    }

    this._elapsed += dt;

    if (this._elapsed >= this._duration) {
      this._active = false;
      this.shakeOffset.set(0, 0, 0);
      return;
    }

    const progress = this._elapsed / this._duration;
    const decay = 1 - progress;
    const shake = this._amplitude * decay;

    this.shakeOffset.set(
      (Math.random() - 0.5) * shake * 2,
      (Math.random() - 0.5) * shake * 2,
      0,
    );
  }
}
