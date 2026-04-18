// ============================================================
// TextureManager.js — global planet texture override
//
// Usage:
//   textureManager.setPlanetOverride(tex) — all new + current planets use it
//   textureManager.getPlanetOverride()    — read by Planet constructor
//   textureManager.clear()               — revert to procedural on next hole load
// ============================================================

import { TextureLoader, SRGBColorSpace } from 'three';

const PLANET_TEXTURE_PATHS = [
  '/textures/ashvolcanic.png',
  '/textures/carbon.png',
  '/textures/crackedice.png',
  '/textures/earth.png',
  '/textures/ice.png',
  '/textures/indigo.png',
  '/textures/jupiter.png',
  '/textures/lava.png',
  '/textures/mercury.png',
  '/textures/methane.png',
  '/textures/mineral.png',
  '/textures/ocean.png',
  '/textures/pastel.png',
  '/textures/pink.png',
  '/textures/purple.png',
  '/textures/sand.png',
  '/textures/stormyblue.png',
  '/textures/superstorm.png',
  '/textures/toxic.png',
];

class TextureManager {
  constructor() {
    this._loader        = new TextureLoader();
    this._override      = null;
    this._name          = '';
    this._planetPool    = null;
    this._planetPoolSeq = 0;
  }

  /** Load a texture from an uploaded File object. Returns Promise<Texture>. */
  fromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      this._loader.load(
        url,
        tex => { tex.colorSpace = SRGBColorSpace; tex.name = file.name; resolve(tex); },
        undefined,
        reject,
      );
    });
  }

  /** Load a texture from a URL served from /public. Returns Promise<Texture>. */
  fromPath(path) {
    return new Promise((resolve, reject) => {
      this._loader.load(
        path,
        tex => { tex.colorSpace = SRGBColorSpace; tex.name = path; resolve(tex); },
        undefined,
        reject,
      );
    });
  }

  /** Activate a loaded texture as the planet override. */
  setPlanetOverride(tex) {
    this._override = tex;
    this._name     = tex?.name ?? '';
  }

  /** Called by Planet._buildMesh() — returns null when procedural is wanted. */
  getPlanetOverride() { return this._override; }

  getOverrideName() { return this._name || 'procedural'; }

  /** Clear the override — next hole load reverts to procedural generation. */
  clear() { this._override = null; this._name = ''; }

  _ensurePlanetPool() {
    if (this._planetPool) return this._planetPool;
    this._planetPool = PLANET_TEXTURE_PATHS.map((path) => {
      const tex = this._loader.load(path);
      tex.colorSpace = SRGBColorSpace;
      tex.name = path;
      return tex;
    });
    return this._planetPool;
  }

  getRandomPlanetTexture(seed) {
    const pool = this._ensurePlanetPool();
    if (!pool || pool.length === 0) return null;
    const base = typeof seed === 'number' ? seed : Math.random() * 100000;
    const idx = Math.abs(Math.floor(base)) % pool.length;
    return pool[idx];
  }

  getMercuryTexture() {
    const pool = this._ensurePlanetPool();
    return pool.find(t => t.name && t.name.includes('mercury')) ?? null;
  }
}

export const textureManager = new TextureManager();
