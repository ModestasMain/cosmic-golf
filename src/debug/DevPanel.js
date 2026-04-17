// ============================================================
// DevPanel.js — live visual tweaker
//
// Toggle:   backtick  `
// All changes apply immediately — no reload needed.
// 📋 Copy JSON in each section copies current params to clipboard.
// ============================================================

import GUI from 'lil-gui';
import { MeshBasicMaterial } from 'three';
import { textureManager } from '../core/TextureManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { Planet } from '../objects/Planet.js';
import { SHAKE_CONFIG } from '../objects/GolfBall.js';
import { TRAJ_CONFIG } from '../systems/TrajectoryPreview.js';

export class DevPanel {
  /**
   * @param {{
   *   spaceBg:   import('../objects/ProceduralSpaceBg.js').ProceduralSpaceBg,
   *   starField: import('../objects/StarField.js').StarField,
   *   holeScene: import('../scenes/HoleScene.js').HoleScene,
   *   bloom:     any,
   *   vignette:  any,
   *   chromAb:   any,
   * }} refs
   */
  constructor(refs) {
    this._refs    = refs;
    this._visible = false;
    this._gui     = null;
    this._build();
    this._setupToggle();
  }

  _build() {
    const gui = new GUI({ title: '⚙ DEV PANEL', width: 320 });
    gui.domElement.style.fontFamily = 'monospace';
    gui.domElement.style.zIndex     = '9999';
    gui.hide();
    this._gui = gui;

    this._buildVoid(gui);
    this._buildStars(gui);
    this._buildLighting(gui);
    this._buildPostFX(gui);
    this._buildPlanets(gui);
    this._buildBallFeel(gui);
    this._buildTrajectory(gui);
  }

  // ── VOID ────────────────────────────────────────────────────
  _buildVoid(gui) {
    const { spaceBg } = this._refs;
    const p = spaceBg.params;
    const apply = () => spaceBg.applyParams();
    const load = () => {
      const text = window.prompt('Paste Void JSON');
      if (!text) return;
      try {
        const obj = JSON.parse(text);
        Object.assign(p, obj);
        apply();
        f.controllersRecursive().forEach(c => c.updateDisplay());
      } catch (e) {
        console.warn('[DevPanel] Invalid Void JSON');
      }
    };

    const f = gui.addFolder('🌌 Void Background');
    f.addColor(p, 'voidColor')              .name('Void base colour')   .onChange(apply);
    f.add(p, 'warpAmount',  0,   1,   0.02) .name('Domain warp')        .onChange(apply);
    f.add(p, 'exposure',    0.5, 6,   0.05) .name('Exposure')           .onChange(apply);
    f.add(p, 'saturation',  0,   3,   0.05) .name('Saturation')         .onChange(apply);
    f.add(p, 'animSpeed',   0,   0.02,0.001).name('Anim speed')         .onChange(apply);

    const n1 = f.addFolder('Nebula 1  (magenta / pink)');
    n1.addColor(p, 'neb1Color')                      .name('Colour')    .onChange(apply);
    n1.add(p, 'neb1Scale',    0.3, 8,   0.1)         .name('Scale')     .onChange(apply);
    n1.add(p, 'neb1Intensity',0,   5,   0.05)        .name('Intensity') .onChange(apply);
    n1.add(p, 'neb1Sharpness',0.5, 8,   0.1)         .name('Sharpness — higher = smaller patches').onChange(apply);

    const n2 = f.addFolder('Nebula 2  (blue)');
    n2.addColor(p, 'neb2Color')                      .name('Colour')    .onChange(apply);
    n2.add(p, 'neb2Scale',    0.3, 8,   0.1)         .name('Scale')     .onChange(apply);
    n2.add(p, 'neb2Intensity',0,   5,   0.05)        .name('Intensity') .onChange(apply);
    n2.add(p, 'neb2Sharpness',0.5, 8,   0.1)         .name('Sharpness').onChange(apply);

    const warm = f.addFolder('Warm accent  (rust / violet)');
    warm.add(p, 'warmIntensity', 0, 3, 0.05)         .name('Intensity') .onChange(apply);

    f.add({ load }, 'load').name('📥 Load JSON');
    f.add({ copy: () => this._copy('Void', p) }, 'copy').name('📋 Copy JSON');
    f.open();
  }

  // ── STARS ───────────────────────────────────────────────────
  _buildStars(gui) {
    const { starField } = this._refs;
    const p = {
      brightness: 7.75,
      heroScale:  3.7,
      shimmerAmp: 0.0,
    };
    const apply = () => starField.setStarParams(p);

    // Apply defaults immediately
    apply();

    const f = gui.addFolder('⭐ Stars');
    // brightness > 1 is valid — additive blending, no cap
    f.add(p, 'brightness',  0.1, 8,    0.05).name('Overall brightness').onChange(apply);
    f.add(p, 'heroScale',   0.2, 15,   0.1) .name('Hero / super star size').onChange(apply);
    f.add(p, 'shimmerAmp',  0,   0.8,  0.01).name('Shimmer amplitude') .onChange(apply);

    f.add({ copy: () => this._copy('Stars', p) }, 'copy').name('📋 Copy JSON');
  }

  // ── LIGHTING ────────────────────────────────────────────────
  _buildLighting(gui) {
    const { holeScene } = this._refs;
    const amb  = holeScene.ambientLight;
    const dir  = holeScene.dirLight;
    const hemi = holeScene.hemiLight;

    const p = {
      ambColor:      '#' + amb.color.getHexString(),
      ambIntensity:  amb.intensity,
      dirColor:      '#' + dir.color.getHexString(),
      dirIntensity:  dir.intensity,
      hemiSky:       '#' + hemi.color.getHexString(),
      hemiGround:    '#' + hemi.groundColor.getHexString(),
      hemiIntensity: hemi.intensity,
      lockLighting:  false,
    };
    holeScene._devLightLock = false;

    const f = gui.addFolder('💡 Lighting');
    f.add(p, 'lockLighting')
      .name('🔒 Lock (ignore palette on hole change)')
      .onChange(v => { holeScene._devLightLock = v; });

    const aF = f.addFolder('Ambient');
    aF.addColor(p, 'ambColor')              .name('Colour')    .onChange(v => amb.color.set(v));
    aF.add(p, 'ambIntensity',  0, 3,  0.05) .name('Intensity') .onChange(v => { amb.intensity = v; });

    const dF = f.addFolder('Directional');
    dF.addColor(p, 'dirColor')              .name('Colour')    .onChange(v => dir.color.set(v));
    dF.add(p, 'dirIntensity',  0, 5,  0.05) .name('Intensity') .onChange(v => { dir.intensity = v; });

    const hF = f.addFolder('Hemisphere');
    hF.addColor(p, 'hemiSky')               .name('Sky')       .onChange(v => hemi.color.set(v));
    hF.addColor(p, 'hemiGround')            .name('Ground')    .onChange(v => hemi.groundColor.set(v));
    hF.add(p, 'hemiIntensity', 0, 3,  0.05) .name('Intensity') .onChange(v => { hemi.intensity = v; });

    f.add({ copy: () => this._copy('Lighting', p) }, 'copy').name('📋 Copy JSON');
  }

  // ── POST FX ─────────────────────────────────────────────────
  _buildPostFX(gui) {
    const { bloom, vignette, chromAb } = this._refs;

    const p = {
      bloomIntensity:   bloom.intensity,
      bloomThreshold:   bloom.luminanceMaterial.threshold,
      bloomSmoothing:   bloom.luminanceMaterial.smoothing,
      vignetteOffset:   vignette.offset,
      vignetteDarkness: vignette.darkness,
      chromOffset:      chromAb.offset.x,
    };

    const f = gui.addFolder('✨ Post FX');

    const bF = f.addFolder('Bloom');
    bF.add(p, 'bloomIntensity',  0, 12,   0.1) .name('Intensity')  .onChange(v => { bloom.intensity = v; });
    bF.add(p, 'bloomThreshold',  0,  1,   0.01).name('Threshold')  .onChange(v => { bloom.luminanceMaterial.threshold = v; });
    bF.add(p, 'bloomSmoothing',  0,  1,   0.01).name('Smoothing')  .onChange(v => { bloom.luminanceMaterial.smoothing = v; });

    const vF = f.addFolder('Vignette');
    vF.add(p, 'vignetteOffset',   0, 1,   0.01).name('Offset')     .onChange(v => { vignette.offset   = v; });
    vF.add(p, 'vignetteDarkness', 0, 1,   0.01).name('Darkness')   .onChange(v => { vignette.darkness = v; });

    const cF = f.addFolder('Chromatic Aberration');
    cF.add(p, 'chromOffset', 0, 0.01, 0.0001)   .name('Offset')    .onChange(v => { chromAb.offset.set(v, v); });

    f.add({ copy: () => this._copy('PostFX', p) }, 'copy').name('📋 Copy JSON');
  }

  // ── PLANETS ─────────────────────────────────────────────────
  _buildPlanets(gui) {
    const { holeScene } = this._refs;

    const p = {
      atmosphereVisible:  true,
      atmosphereStrength: 1.0,
      ringOpacity:        0.45,
      ringScale:          0.65,
      ringBandsMin:       2,
      ringBandsMax:       4,
      planetScale:        1.25,
      textureBrightness:  1.0,
      activeTexture:      'procedural',
      texturePath:        '/textures/planets/',
    };

    const planets = () => holeScene.planetObjects ?? [];

    const applyAtmosphere = () => {
      for (const planet of planets()) {
        if (planet.glowMesh) planet.glowMesh.visible = p.atmosphereVisible;
        if (planet._glowMult) {
          planet._glowMult.value = p.atmosphereVisible
            ? (planet._baseGlowOpacity ?? 1) * p.atmosphereStrength
            : 0;
        }
      }
    };

    const applyRings = () => {
      for (const planet of planets()) {
        if (!planet._ringGroup) continue;
        planet._ringGroup.scale.setScalar(p.ringScale);
        planet._ringGroup.traverse(c => {
          if (!c.isMesh) return;
          if (c.material._origOpacity === undefined) c.material._origOpacity = c.material.opacity;
          c.material.opacity = c.material._origOpacity * p.ringOpacity;
        });
      }
    };

    const applyScale = () => {
      // Scale visual groups; update raw physics objects (holeScene.planets) so collision
      // radius matches the scaled visual surface. Planet instance .radius must stay at the
      // original geometry radius so addCrater local-space math remains correct.
      const rawPlanets = holeScene.planets ?? [];
      for (let i = 0; i < planets().length; i++) {
        const planet = planets()[i];
        planet.group.scale.setScalar(p.planetScale);
        const raw = rawPlanets[i];
        if (raw) {
          if (raw._baseRadius === undefined) raw._baseRadius = raw.radius;
          raw.radius = raw._baseRadius * p.planetScale;
        }
      }
    };

    const applyRingStyle = () => {
      const minBands = Math.max(1, Math.floor(p.ringBandsMin));
      const maxBands = Math.max(minBands, Math.floor(p.ringBandsMax));
      Planet.ringParams = Planet.ringParams || {};
      Planet.ringParams.scale = p.ringScale;
      Planet.ringParams.minBands = minBands;
      Planet.ringParams.maxBands = maxBands;
      for (const planet of planets()) {
        if (planet._ringGroup) {
          planet._ringGroup.scale.setScalar(p.ringScale);
        }
      }
    };

    const load = () => {
      const text = window.prompt('Paste Planets JSON');
      if (!text) return;
      try {
        const obj = JSON.parse(text);
        Object.assign(p, obj);
        applyAtmosphere();
        applyRings();
        applyRingStyle();
        applyScale();
        applyBrightness();
        f.controllersRecursive().forEach(c => c.updateDisplay());
      } catch (e) {
        console.warn('[DevPanel] Invalid Planets JSON');
      }
    };

    // Helper: all MeshBasicMaterial instances on a planet (body + moons)
    const allBasicMats = (planet) => {
      const mats = [];
      if (planet._matOpaque?.isMeshBasicMaterial)      mats.push(planet._matOpaque);
      if (planet._matTransparent?.isMeshBasicMaterial) mats.push(planet._matTransparent);
      for (const moon of (planet._moons ?? [])) {
        if (moon.mesh?.material) mats.push(moon.mesh.material);
      }
      return mats;
    };

    const applyBrightness = () => {
      for (const planet of planets()) {
        for (const mat of allBasicMats(planet)) {
          mat.color.setScalar(p.textureBrightness);
          mat.needsUpdate = true;
        }
      }
    };

    // Push a loaded texture to all current planets AND register it as the override
    // so future holes (new Planet instances) also pick it up.
    //
    // IMPORTANT: we must replace _matOpaque / _matTransparent — NOT a separate slot —
    // because setOpacity() is called every frame and always reassigns mesh.material
    // from those two slots, which would silently undo any other material we set.
    const applyTex = (tex) => {
      textureManager.setPlanetOverride(tex ?? null);
      p.activeTexture = textureManager.getOverrideName();
      for (const planet of planets()) {
        if (tex) {
          if (planet._matOpaque?.isMeshBasicMaterial) {
            // Already unlit — just swap the map
            planet._matOpaque.map      = tex;
            planet._matTransparent.map = tex;
            planet._matOpaque.needsUpdate      = true;
            planet._matTransparent.needsUpdate = true;
          } else {
            // MeshStandardMaterial — replace with unlit variants so lighting can't wash it out
            planet._matOpaque      = new MeshBasicMaterial({ map: tex });
            planet._matTransparent = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.3 });
          }
          planet.mesh.material     = planet._matOpaque;
        }
        planet._hasCustomTexture = !!tex;
      }
      applyBrightness();
    };

    const upload = () => {
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = 'image/png,image/jpeg,image/jpg,image/webp';
      // Must be in the DOM for onchange to fire reliably in all browsers
      input.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none';
      document.body.appendChild(input);
      input.onchange = async (e) => {
        document.body.removeChild(input);
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const tex = await textureManager.fromFile(file);
          applyTex(tex);
        } catch (err) {
          console.error('[DevPanel] Texture load failed:', err);
        }
      };
      input.click();
    };

    const loadPath = async () => {
      try {
        applyTex(await textureManager.fromPath(p.texturePath));
      } catch {
        console.warn('[DevPanel] Could not load texture from path:', p.texturePath);
      }
    };

    const clearTex = () => {
      textureManager.clear();
      p.activeTexture = 'procedural';
      for (const planet of planets()) {
        planet._hasCustomTexture = false;
        // Null out map on current materials; procedural textures fully restore on next hole load
        if (planet._matOpaque)      { planet._matOpaque.map = null;      planet._matOpaque.needsUpdate = true; }
        if (planet._matTransparent) { planet._matTransparent.map = null; planet._matTransparent.needsUpdate = true; }
        planet.mesh.material = planet._matOpaque;
      }
    };

    // Re-apply all active settings whenever a new hole loads fresh planets
    eventBus.on(Events.HOLE_LOADED, () => {
      // Tiny delay so planetObjects is fully populated before we touch materials
      setTimeout(() => {
        applyAtmosphere();
        applyRings();
        applyScale();
        const override = textureManager.getPlanetOverride();
        if (override) applyTex(override); // applyBrightness is called inside applyTex
      }, 0);
    });

    const f = gui.addFolder('🪐 Planets');
    f.add(p, 'atmosphereVisible')               .name('Atmosphere')          .onChange(applyAtmosphere);
    f.add(p, 'atmosphereStrength', 0, 3, 0.05)  .name('Atmo strength')       .onChange(applyAtmosphere);
    f.add(p, 'ringOpacity',   0, 2,    0.05)    .name('Ring opacity mult')   .onChange(applyRings);
    f.add(p, 'planetScale',   0.3, 3,  0.05)    .name('Visual scale')        .onChange(applyScale);

    const texF = f.addFolder('🖼 Texture');
    texF.add(p, 'activeTexture').name('Active').disable().listen();
    texF.add(p, 'textureBrightness', 0.1, 2.0, 0.05).name('Brightness (1 = original)').onChange(applyBrightness);
    texF.add({ upload }, 'upload').name('📁 Upload PNG / JPG / WebP');
    texF.add(p, 'texturePath').name('Path (from public/)');
    texF.add({ load: loadPath }, 'load').name('⬇ Load from path  (file must exist in public/)');
    texF.add({ clear: clearTex }, 'clear').name('✕ Clear  (procedural on next hole)');

    f.add({ copy: () => this._copy('Planets', p) }, 'copy').name('📋 Copy JSON');
  }

  // ── BALL FEEL ────────────────────────────────────────────────
  _buildBallFeel(gui) {
    const f = gui.addFolder('⚽ Ball Feel');
    f.close();
    f.add(SHAKE_CONFIG, 'amplitude', 0, 0.5, 0.005).name('Shake amplitude');
    f.add(SHAKE_CONFIG, 'freqX',     5, 80,  0.5  ).name('Shake freq X');
    f.add(SHAKE_CONFIG, 'freqY',     5, 80,  0.5  ).name('Shake freq Y');
    f.add(SHAKE_CONFIG, 'freqZ',     5, 80,  0.5  ).name('Shake freq Z');
    f.add({ copy: () => this._copy('BallFeel', SHAKE_CONFIG) }, 'copy').name('📋 Copy JSON');
  }

  // ── TRAJECTORY ───────────────────────────────────────────────
  _buildTrajectory(gui) {
    const { holeScene } = this._refs;
    const f = gui.addFolder('🎯 Trajectory');
    f.close();

    f.add(TRAJ_CONFIG, 'steps',     500, 15000, 500).name('Sim steps').onChange(() => {
      // Rebuild geometry to match new max size
      if (holeScene?.trajectoryPreview) holeScene.trajectoryPreview._rebuildGeometry();
    });
    f.add(TRAJ_CONFIG, 'dt',        0.008, 0.05, 0.001).name('Sim dt');
    f.add(TRAJ_CONFIG, 'pointStep', 1, 10, 1).name('Point step (spacing)');
    f.add(TRAJ_CONFIG, 'dotSize',   1, 10, 0.5).name('Dot size (px)').onChange(() => {
      if (holeScene?.trajectoryPreview) holeScene.trajectoryPreview.material.size = TRAJ_CONFIG.dotSize;
    });
    f.add(TRAJ_CONFIG, 'nearAlpha', 0.5, 5, 0.1).name('Near-planet alpha');
    f.add(TRAJ_CONFIG, 'voidAlpha', 0.1, 2, 0.05).name('Void alpha');
    f.add({ copy: () => this._copy('Trajectory', TRAJ_CONFIG) }, 'copy').name('📋 Copy JSON');
  }

  // ── Helpers ─────────────────────────────────────────────────
  _copy(label, obj) {
    const text = JSON.stringify(obj, null, 2);
    navigator.clipboard?.writeText(text)
      .then(() => console.log(`[DevPanel] ${label} copied:\n`, text));
  }

  _setupToggle() {
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') {
        this._visible = !this._visible;
        this._visible ? this._gui.show() : this._gui.hide();
      }
    });
  }

  destroy() { this._gui?.destroy(); }
}
