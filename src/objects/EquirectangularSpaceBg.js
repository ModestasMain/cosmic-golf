// ============================================================
// EquirectangularSpaceBg.js — loads an equirectangular image
// onto a large inverted sphere for immersive 360° cosmic
// backdrop, plus sets scene.environment for PBR lighting.
// Compatible with Three.js r150+
// ============================================================

import {
  TextureLoader, EquirectangularReflectionMapping,
  LinearFilter, SphereGeometry, MeshBasicMaterial, Mesh, BackSide,
} from 'three';

const ASSET_PATH = '/textures/void.png';

export class EquirectangularSpaceBg {
  constructor(scene, renderer, opts = {}) {
    this._scene        = scene;
    this._renderer     = renderer;
    this._path         = opts.path ?? ASSET_PATH;
    // Much smaller radius (was 8500) — camera at ~20-50 units, so 500
    // gives plenty of headroom without stretching texture to billboard size
    this._sphereRadius = opts.sphereRadius ?? 500;
    this._texture      = null;
    this._sphere       = null;
  }

  load() {
    const loader = new TextureLoader();

    loader.load(
      this._path,

      (texture) => {
        // Critical: force full-resolution, no mipmaps
        texture.generateMipmaps = false;
        texture.minFilter       = LinearFilter;
        texture.magFilter       = LinearFilter;

        // Anisotropy sharpens oblique viewing
        if (this._renderer) {
          texture.anisotropy = this._renderer.capabilities.getMaxAnisotropy();
        }

        texture.colorSpace = 'srgb';
        texture.needsUpdate = true;
        this._texture = texture;

        // Higher segment count (256x128) eliminates UV seams/artifacts
        const geo = new SphereGeometry(this._sphereRadius, 256, 128);
        const mat = new MeshBasicMaterial({
          map: texture,
          side: BackSide,
          fog: false,
          depthWrite: false,
        });
        // Explicitly disable any material-level mipmap fallback
        mat.map.generateMipmaps = false;
        mat.map.needsUpdate = true;

        const sphere = new Mesh(geo, mat);
        sphere.renderOrder = -1000;
        this._scene.add(sphere);
        this._sphere = sphere;

        // Environment lighting for PBR planets/rings
        texture.mapping = EquirectangularReflectionMapping;
        this._scene.environment = texture;
      },

      undefined,

      (err) => {
        console.error('[EquirectBg] failed to load:', this._path, err);
      },
    );
  }

  get texture() {
    return this._texture;
  }

  dispose() {
    if (this._sphere) {
      this._scene.remove(this._sphere);
      this._sphere.geometry.dispose();
      if (this._sphere.material.map) {
        this._sphere.material.map.dispose();
      }
      this._sphere.material.dispose();
      this._sphere = null;
    }

    if (this._scene.environment === this._texture) {
      this._scene.environment = null;
    }

    if (this._texture) {
      this._texture.dispose();
      this._texture = null;
    }
  }
}
