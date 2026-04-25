// ============================================================
// DevPanel.js — live visual tweaker
//
// Toggle:   backtick  `
// All changes apply immediately — no reload needed.
// 📋 Copy JSON in each section copies current params to clipboard.
// ============================================================

import GUI from 'lil-gui';
import { MeshBasicMaterial, Vector3 } from 'three';
import { WORLDEATER } from '../core/Constants.js';
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
    this._dev     = { freezeAll: false };
    this._build();
    this._setupToggle();
  }

  _build() {
    const gui = new GUI({ title: '⚙ DEV PANEL', width: 320 });
    gui.domElement.style.fontFamily = 'monospace';
    gui.domElement.style.zIndex     = '9999';
    gui.hide();
    this._gui = gui;

    gui.add(this._dev, 'freezeAll')
      .name('⏸ Freeze All')
      .onChange((v) => eventBus.emit(Events.DEV_FREEZE_ALL, { frozen: v }));

    this._buildVoid(gui);
    this._buildStars(gui);
    this._buildLighting(gui);
    this._buildPostFX(gui);
    this._buildPlanets(gui);
    this._buildBallFeel(gui);
    this._buildTrajectory(gui);
    this._buildWorldEater(gui);
    this._collapseFolders(gui);
  }

  // ── VOID ────────────────────────────────────────────────────
  _buildVoid(gui) {
    const { spaceBg } = this._refs;
    const p = spaceBg.params;
    const apply = () => spaceBg.applyParams();
    const imageState = {
      activeImage: spaceBg.textureName ?? 'procedural',
      uploadPng: () => {},
      loadCubemapJson: () => {},
      useProcedural: () => {},
      resetImageGrade: () => {},
      resetOrientation: () => {},
    };
    let activeImageCtrl = null;
    const syncActiveImage = () => {
      imageState.activeImage = spaceBg.textureName ?? 'procedural';
      activeImageCtrl?.updateDisplay();
    };
    imageState.uploadPng = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/jpg,image/webp';
      input.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none';
      document.body.appendChild(input);
      input.onchange = async (e) => {
        document.body.removeChild(input);
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          await spaceBg.loadTextureFromFile(file);
          syncActiveImage();
        } catch (err) {
          console.error('[DevPanel] Void PNG load failed:', err);
        }
      };
      input.click();
    };
    imageState.loadCubemapJson = async () => {
      const manifestPath = window.prompt('Paste cubemap manifest path', '/cubemaps/void/cubemap.json');
      if (!manifestPath) return;
      try {
        await spaceBg.loadCubeMapFromManifest(manifestPath);
        syncActiveImage();
      } catch (err) {
        console.error('[DevPanel] Cubemap load failed:', err);
      }
    };
    imageState.useProcedural = () => {
      spaceBg.useProcedural();
      syncActiveImage();
    };
    imageState.resetImageGrade = () => {
      p.imageExposure = 1.0;
      p.imageContrast = 1.0;
      p.imageSaturation = 1.0;
      p.imageBlackPoint = 0.0;
      p.imageHighlightCompression = 0.0;
      p.imagePoleFadeStart = 0.72;
      p.imagePoleFadeStrength = 0.0;
      p.imageSeamBlendWidth = 0.04;
      p.imageSeamBlendStrength = 0.0;
      p.imageSeamBlur = 0.0;
      apply();
      f.controllersRecursive().forEach(c => c.updateDisplay());
    };
    imageState.resetOrientation = () => {
      p.rotationX = 0.0;
      p.rotationY = 0.0;
      p.rotationZ = 0.0;
      apply();
      f.controllersRecursive().forEach(c => c.updateDisplay());
    };
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
    activeImageCtrl = f.add(imageState, 'activeImage').name('Active image');
    activeImageCtrl.disable?.();
    f.add(imageState, 'uploadPng').name('🖼 Upload PNG');
    f.add(imageState, 'loadCubemapJson').name('🧊 Load cubemap JSON');
    f.add(imageState, 'useProcedural').name('↩ Procedural void');
    f.add(p, 'sphereRadius', 1200, 12000, 50).name('Sphere radius').onChange(apply);

    const orient = f.addFolder('Orientation');
    orient.add(p, 'rotationX', -180, 180, 1).name('Pitch').onChange(apply);
    orient.add(p, 'rotationY', -180, 180, 1).name('Yaw').onChange(apply);
    orient.add(p, 'rotationZ', -180, 180, 1).name('Roll').onChange(apply);
    orient.add(imageState, 'resetOrientation').name('↺ Reset orientation');

    const img = f.addFolder('Uploaded Image  (image only)');
    img.add(p, 'imageExposure', 0.35, 2.5, 0.01).name('Brightness').onChange(apply);
    img.add(p, 'imageContrast', 0.4, 1.8, 0.01).name('Contrast').onChange(apply);
    img.add(p, 'imageSaturation', 0, 2, 0.01).name('Saturation').onChange(apply);
    img.add(p, 'imageBlackPoint', 0, 0.35, 0.005).name('Deepen blacks').onChange(apply);
    img.add(p, 'imageHighlightCompression', 0, 1.5, 0.01).name('Compress highlights').onChange(apply);
    img.add(p, 'imageSeamBlendStrength', 0, 1, 0.01).name('Hide seam').onChange(apply);
    img.add(p, 'imageSeamBlendWidth', 0.005, 0.18, 0.005).name('Seam blend width').onChange(apply);
    img.add(p, 'imageSeamBlur', 0, 0.03, 0.0005).name('Seam blur').onChange(apply);
    img.add(p, 'imagePoleFadeStrength', 0, 1, 0.01).name('Hide pole pinch').onChange(apply);
    img.add(p, 'imagePoleFadeStart', 0.45, 0.98, 0.01).name('Pole fade start').onChange(apply);
    img.add(imageState, 'resetImageGrade').name('↺ Reset image grade');

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

    // Helper: push new sun direction to all planet atmosphere shaders
    const syncSunDir = (x, y, z) => {
      const len = Math.sqrt(x*x + y*y + z*z) || 1;
      const nx = x/len, ny = y/len, nz = z/len;
      if (!holeScene.planetObjects) return;
      for (const planet of holeScene.planetObjects) {
        if (!planet.glowMesh) continue;
        const u = planet.glowMesh.material.uniforms?.sunDir;
        if (u) { u.value.set(nx, ny, nz); }
      }
    };

    // Helper: push roughness/metalness to all planet surface materials
    const syncPlanetMat = (roughness, metalness) => {
      if (!holeScene.planetObjects) return;
      for (const planet of holeScene.planetObjects) {
        for (const mat of [planet._matOpaque, planet._matTransparent]) {
          if (mat && mat.roughness !== undefined) {
            mat.roughness  = roughness;
            mat.metalness  = metalness;
            mat.needsUpdate = true;
          }
        }
      }
    };

    // Helper: push glow power / mult to all planet atmosphere shaders
    const syncAtmo = (power, mult) => {
      if (!holeScene.planetObjects) return;
      for (const planet of holeScene.planetObjects) {
        if (!planet.glowMesh) continue;
        const u = planet.glowMesh.material.uniforms;
        if (u?.power)    u.power.value    = power;
        if (u?.glowMult) u.glowMult.value = mult;
      }
    };

    const p = {
      ambColor:       '#' + amb.color.getHexString(),
      ambIntensity:   amb.intensity,
      dirColor:       '#' + dir.color.getHexString(),
      dirIntensity:   dir.intensity,
      dirX:           dir.position.x,
      dirY:           dir.position.y,
      dirZ:           dir.position.z,
      hemiSky:        '#' + hemi.color.getHexString(),
      hemiGround:     '#' + hemi.groundColor.getHexString(),
      hemiIntensity:  hemi.intensity,
      atmoGlowPower:  1.0,
      atmoGlowMult:   0.0,
      planetRoughness: 0.7,
      planetMetalness: 0.34,
      lockLighting:   false,
    };
    holeScene._devLightLock = false;

    const f = gui.addFolder('💡 Lighting');
    f.add(p, 'lockLighting')
      .name('🔒 Lock (ignore palette on hole change)')
      .onChange(v => { holeScene._devLightLock = v; });

    const aF = f.addFolder('Ambient');
    aF.addColor(p, 'ambColor')               .name('Colour')     .onChange(v => amb.color.set(v));
    aF.add(p, 'ambIntensity',   0, 5,  0.05) .name('Intensity')  .onChange(v => { amb.intensity = v; });

    const dF = f.addFolder('Sun (Directional)');
    dF.addColor(p, 'dirColor')               .name('Colour')     .onChange(v => dir.color.set(v));
    dF.add(p, 'dirIntensity',   0, 10, 0.1)  .name('Intensity')  .onChange(v => { dir.intensity = v; });
    const moveSun = () => {
      syncSunDir(p.dirX, p.dirY, p.dirZ);
      if (holeScene._moveSunTo) holeScene._moveSunTo(p.dirX, p.dirY, p.dirZ);
    };
    dF.add(p, 'dirX',          -200, 200, 1) .name('Position X') .onChange(v => { dir.position.x = v; moveSun(); });
    dF.add(p, 'dirY',          -200, 200, 1) .name('Position Y') .onChange(v => { dir.position.y = v; moveSun(); });
    dF.add(p, 'dirZ',          -200, 200, 1) .name('Position Z') .onChange(v => { dir.position.z = v; moveSun(); });

    const hF = f.addFolder('Hemisphere (Galaxy fill)');
    hF.addColor(p, 'hemiSky')                .name('Sky')        .onChange(v => hemi.color.set(v));
    hF.addColor(p, 'hemiGround')             .name('Ground')     .onChange(v => hemi.groundColor.set(v));
    hF.add(p, 'hemiIntensity',  0, 5,  0.05) .name('Intensity')  .onChange(v => { hemi.intensity = v; });

    const atF = f.addFolder('Atmosphere Glow');
    atF.add(p, 'atmoGlowPower',  1, 12, 0.1) .name('Fresnel power (tightness)') .onChange(v => syncAtmo(v, p.atmoGlowMult));
    atF.add(p, 'atmoGlowMult',   0, 3,  0.05).name('Glow strength')              .onChange(v => syncAtmo(p.atmoGlowPower, v));

    const pmF = f.addFolder('Planet Surface');
    pmF.add(p, 'planetRoughness', 0, 1, 0.01).name('Roughness') .onChange(v => syncPlanetMat(v, p.planetMetalness));
    pmF.add(p, 'planetMetalness', 0, 1, 0.01).name('Metalness') .onChange(v => syncPlanetMat(p.planetRoughness, v));

    f.add({ copy: () => this._copy('Lighting', p) }, 'copy').name('📋 Copy JSON');
  }

  // ── POST FX ─────────────────────────────────────────────────
  _buildPostFX(gui) {
    const { bloom, vignette, chromAb, dof, tiltShift, blurPass, composer } = this._refs;
    let blurAdded = false;
    const enableBlur = () => {
      if (!blurAdded && blurPass && composer) {
        composer.addPass(blurPass);
        blurAdded = true;
      }
    };

    const p = {
      bloomIntensity:   bloom.intensity,
      bloomThreshold:   bloom.luminanceMaterial.threshold,
      bloomSmoothing:   bloom.luminanceMaterial.smoothing,
      vignetteOffset:   vignette.offset,
      vignetteDarkness: vignette.darkness,
      chromOffset:      chromAb.offset.x,
      dofBokeh:         dof.bokehScale,
      dofFocusDist:     dof.cocMaterial.focusDistance,
      dofFocusRange:    dof.cocMaterial.focusRange,
      tiltFocusArea:    tiltShift.focusArea,
      tiltFeather:      tiltShift.feather,
      tiltOffset:       tiltShift.offset,
      tiltRotation:     tiltShift.rotation,
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
    cF.add(p, 'chromOffset', 0, 0.01, 0.0001)  .name('Offset')     .onChange(v => { chromAb.offset.set(v, v); });

    const dofF = f.addFolder('🔭 Depth of Field');
    dofF.add(p, 'dofBokeh',      0, 10,   0.1).name('Bokeh scale (0=off)')
      .onChange(v => { enableBlur(); dof.bokehScale = v; });
    dofF.add(p, 'dofFocusDist',  0, 500,  1)  .name('Focus distance (world units)')
      .onChange(v => { enableBlur(); dof.cocMaterial.focusDistance = v; });
    dofF.add(p, 'dofFocusRange', 0, 200,  1)  .name('Focus range (depth of band)')
      .onChange(v => { enableBlur(); dof.cocMaterial.focusRange = v; });

    const tsF = f.addFolder('🎞 Tilt Shift Blur');
    tsF.add(p, 'tiltFocusArea', 0,  1,  0.01) .name('Focus area (1=off, 0=full blur)')
      .onChange(v => { enableBlur(); tiltShift.focusArea = v; });
    tsF.add(p, 'tiltFeather',   0,  1,  0.01) .name('Feather')
      .onChange(v => { enableBlur(); tiltShift.feather = v; });
    tsF.add(p, 'tiltOffset',   -1,  1,  0.01) .name('Offset (up/down)')
      .onChange(v => { enableBlur(); tiltShift.offset = v; });
    tsF.add(p, 'tiltRotation', -Math.PI, Math.PI, 0.01).name('Rotation')
      .onChange(v => { enableBlur(); tiltShift.rotation = v; });

    f.add({ copy: () => this._copy('PostFX', p) }, 'copy').name('📋 Copy JSON');
  }

  // ── PLANETS ─────────────────────────────────────────────────
  _buildPlanets(gui) {
    const { holeScene } = this._refs;

    const p = {
      atmosphereVisible:  true,
      atmosphereStrength: 1.0,
      ringOpacity:        0.1,
      ringScale:          0.65,
      ringBandsMin:       2,
      ringBandsMax:       4,
      planetScale:        1.6,
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

  // ── WORLDEATER ──────────────────────────────────────────────
  _buildWorldEater(gui) {
    const { holeScene } = this._refs;
    const p = {
      headScaleX: 50,
      headScaleY: 60,
      headScaleZ: 78,
      headOffsetX: 0,
      headOffsetY: 0,
      headOffsetZ: 0,
      headRotateY: -Math.PI / 2,
      neckScaleX: 62,
      neckScaleY: 36,
      neckScaleZ: 76,
      neckPosX: -12,
      neckPosY: 0,
      neckPosZ: -18,
      bodyRadiusMul: 1,
      bodyTexRepeatX: 1.8,
      bodyTexRepeatY: 1.1,
      headTexRepeatX: 1,
      headTexRepeatY: 1,
      headTexOffsetX: 0,
      headTexOffsetY: 0,
      bodyColor: '#f0fff6',
      bodyEmissive: '#08150f',
      bodyEmissiveIntensity: 0.18,
      bodyRoughness: 0.82,
      bodyMetalness: 0.04,
      neckColor: '#f0fff6',
      neckEmissive: '#08150f',
      neckEmissiveIntensity: 0.18,
      neckRoughness: 0.82,
      neckMetalness: 0.04,
      tailRadiusMul: 0.82,
      tailScaleY: 0.82,
      tailScaleZ: 1.0,
      headEmissive: '#4d1020',
      headEmissiveIntensity: 1.05,
      headRoughness: 0.52,
      headMetalness: 0.1,
      weakSpotScaleMul: 1,
      weakSpotHitMul: 1,
      weakSpotColor: '#ffe4a0',
      weakSpotEmissive: '#ffa947',
      weakSpotEmissiveIntensity: 0.68,
      weakSpotOpacity: 0.96,
      broodScaleX: 1,
      broodScaleY: 1,
      broodScaleZ: 1,
    };
    const introP = {
      duration: WORLDEATER.INTRO_DURATION,
      approachEnd: WORLDEATER.INTRO_APPROACH_END,
      sealBlendStart: WORLDEATER.INTRO_SEAL_BLEND_START,
      closeCameraEnd: WORLDEATER.INTRO_CAMERA_CLOSE_END,
      returnCameraStart: WORLDEATER.INTRO_CAMERA_RETURN_START,
      orbitRadius: WORLDEATER.INTRO_ORBIT_RADIUS,
      reverseOrbit: WORLDEATER.INTRO_ORBIT_DIRECTION < 0,
      entryAngleOffset: WORLDEATER.INTRO_ENTRY_ANGLE_OFFSET,
      curveLift: WORLDEATER.INTRO_CURVE_LIFT,
      segmentSpacing: WORLDEATER.INTRO_SEGMENT_SPACING,
      wormholeX: WORLDEATER.INTRO_WORMHOLE_POS[0],
      wormholeY: WORLDEATER.INTRO_WORMHOLE_POS[1],
      wormholeZ: WORLDEATER.INTRO_WORMHOLE_POS[2],
      wormholeScale: WORLDEATER.INTRO_WORMHOLE_SCALE,
      showPath: false,
      previewHold: false,
      previewProgress: 0.34,
    };

    const getBoss = () => holeScene.worldEater ?? null;
    const syncFromBoss = () => {
      const boss = getBoss();
      if (!boss?.getDebugState) return;
      Object.assign(p, boss.getDebugState());
      f.controllersRecursive().forEach((c) => c.updateDisplay());
    };
    const apply = () => {
      const boss = getBoss();
      if (!boss?.applyDebugState) return;
      boss.applyDebugState(p);
    };
    const load = () => {
      const text = window.prompt('Paste WorldEater JSON');
      if (!text) return;
      try {
        const obj = JSON.parse(text);
        Object.assign(p, obj);
        apply();
        f.controllersRecursive().forEach((c) => c.updateDisplay());
      } catch {
        console.warn('[DevPanel] Invalid WorldEater JSON');
      }
    };
    const reset = () => {
      const boss = getBoss();
      if (!boss?.resetDebugState) return;
      boss.resetDebugState();
      syncFromBoss();
    };
    const applyIntro = () => {
      WORLDEATER.INTRO_DURATION = introP.duration;
      WORLDEATER.INTRO_APPROACH_END = introP.approachEnd;
      WORLDEATER.INTRO_SEAL_BLEND_START = introP.sealBlendStart;
      WORLDEATER.INTRO_CAMERA_CLOSE_END = introP.closeCameraEnd;
      WORLDEATER.INTRO_CAMERA_RETURN_START = introP.returnCameraStart;
      WORLDEATER.INTRO_ORBIT_RADIUS = introP.orbitRadius;
      WORLDEATER.INTRO_ORBIT_DIRECTION = introP.reverseOrbit ? -1 : 1;
      WORLDEATER.INTRO_ENTRY_ANGLE_OFFSET = introP.entryAngleOffset;
      WORLDEATER.INTRO_CURVE_LIFT = introP.curveLift;
      WORLDEATER.INTRO_SEGMENT_SPACING = introP.segmentSpacing;
      WORLDEATER.INTRO_WORMHOLE_POS = [introP.wormholeX, introP.wormholeY, introP.wormholeZ];
      WORLDEATER.INTRO_WORMHOLE_SCALE = introP.wormholeScale;

      const boss = getBoss();
      if (boss?.config) {
        Object.assign(boss.config, {
          INTRO_DURATION: introP.duration,
          INTRO_APPROACH_END: introP.approachEnd,
          INTRO_SEAL_BLEND_START: introP.sealBlendStart,
          INTRO_CAMERA_CLOSE_END: introP.closeCameraEnd,
          INTRO_CAMERA_RETURN_START: introP.returnCameraStart,
          INTRO_ORBIT_RADIUS: introP.orbitRadius,
          INTRO_ORBIT_DIRECTION: introP.reverseOrbit ? -1 : 1,
          INTRO_ENTRY_ANGLE_OFFSET: introP.entryAngleOffset,
          INTRO_CURVE_LIFT: introP.curveLift,
          INTRO_SEGMENT_SPACING: introP.segmentSpacing,
          INTRO_WORMHOLE_POS: WORLDEATER.INTRO_WORMHOLE_POS,
          INTRO_WORMHOLE_SCALE: introP.wormholeScale,
        });
      }
      if (holeScene._holeData?.boss?.kind === 'WORLDEATER') {
        holeScene._holeData.boss.introWormholePos = new Vector3(
          introP.wormholeX,
          introP.wormholeY,
          introP.wormholeZ,
        );
      }
      holeScene.setWorldEaterIntroPathVisible?.(introP.showPath);
      if (introP.previewHold) {
        holeScene.previewWorldEaterIntro?.(introP.previewProgress);
      } else {
        holeScene.clearWorldEaterIntroPreview?.();
      }
    };
    const replayIntro = () => {
      introP.previewHold = false;
      applyIntro();
      f.controllersRecursive().forEach((c) => c.updateDisplay());
      holeScene.replayWorldEaterIntro?.();
    };
    const copyIntro = () => this._copy('WorldEaterIntro', {
      INTRO_DURATION: introP.duration,
      INTRO_APPROACH_END: introP.approachEnd,
      INTRO_SEAL_BLEND_START: introP.sealBlendStart,
      INTRO_CAMERA_CLOSE_END: introP.closeCameraEnd,
      INTRO_CAMERA_RETURN_START: introP.returnCameraStart,
      INTRO_ORBIT_RADIUS: introP.orbitRadius,
      INTRO_ORBIT_DIRECTION: introP.reverseOrbit ? -1 : 1,
      INTRO_ENTRY_ANGLE_OFFSET: introP.entryAngleOffset,
      INTRO_CURVE_LIFT: introP.curveLift,
      INTRO_SEGMENT_SPACING: introP.segmentSpacing,
      INTRO_WORMHOLE_POS: [introP.wormholeX, introP.wormholeY, introP.wormholeZ],
      INTRO_WORMHOLE_SCALE: introP.wormholeScale,
    });

    eventBus.on(Events.HOLE_LOADED, () => {
      setTimeout(() => {
        syncFromBoss();
        apply();
      }, 0);
    });

    const f = gui.addFolder('🐉 WorldEater');
    f.close();

    const introF = f.addFolder('Intro Cinematic');
    introF.add(introP, 'duration', 4, 14, 0.1).name('Duration').onChange(applyIntro);
    introF.add(introP, 'approachEnd', 0.1, 0.65, 0.01).name('Fly-in ends').onChange(applyIntro);
    introF.add(introP, 'sealBlendStart', 0.35, 0.98, 0.01).name('Blend to gameplay').onChange(applyIntro);
    introF.add(introP, 'orbitRadius', 120, 700, 5).name('Intro orbit radius').onChange(applyIntro);
    introF.add(introP, 'reverseOrbit').name('Reverse orbit').onChange(applyIntro);
    introF.add(introP, 'entryAngleOffset', -Math.PI, Math.PI, 0.01).name('Orbit entry angle').onChange(applyIntro);
    introF.add(introP, 'curveLift', -300, 400, 5).name('Fly-in arc lift').onChange(applyIntro);
    introF.add(introP, 'segmentSpacing', 50, 160, 2).name('Body spacing').onChange(applyIntro);
    introF.add(introP, 'wormholeX', -1800, 1800, 10).name('Wormhole X').onChange(applyIntro);
    introF.add(introP, 'wormholeY', -700, 900, 10).name('Wormhole Y').onChange(applyIntro);
    introF.add(introP, 'wormholeZ', -1800, 1800, 10).name('Wormhole Z').onChange(applyIntro);
    introF.add(introP, 'wormholeScale', 2, 28, 0.5).name('Wormhole size').onChange(applyIntro);
    introF.add(introP, 'closeCameraEnd', 0.05, 0.35, 0.01).name('Close cam ends').onChange(applyIntro);
    introF.add(introP, 'returnCameraStart', 0.55, 0.96, 0.01).name('Return cam starts').onChange(applyIntro);
    introF.add(introP, 'showPath').name('Show path arrows').onChange(applyIntro);
    introF.add(introP, 'previewHold').name('Hold preview pose').onChange(applyIntro);
    introF.add(introP, 'previewProgress', 0, 1, 0.01).name('Preview progress').onChange(applyIntro);
    introF.add({ replayIntro }, 'replayIntro').name('▶ Replay Intro');
    introF.add({ copyIntro }, 'copyIntro').name('📋 Copy Intro JSON');

    const headF = f.addFolder('Head Shape');
    headF.add(p, 'headScaleX', 20, 120, 1).name('Width').onChange(apply);
    headF.add(p, 'headScaleY', 20, 120, 1).name('Height').onChange(apply);
    headF.add(p, 'headScaleZ', 20, 140, 1).name('Length').onChange(apply);
    headF.add(p, 'headOffsetX', -30, 30, 1).name('Offset X').onChange(apply);
    headF.add(p, 'headOffsetY', -30, 30, 1).name('Offset Y').onChange(apply);
    headF.add(p, 'headOffsetZ', -30, 30, 1).name('Offset Z').onChange(apply);
    headF.add(p, 'headRotateY', -Math.PI, Math.PI, 0.01).name('Face Y rot').onChange(apply);

    const neckF = f.addFolder('Neck Blend');
    neckF.add(p, 'neckScaleX', 20, 120, 1).name('Scale X').onChange(apply);
    neckF.add(p, 'neckScaleY', 10, 100, 1).name('Scale Y').onChange(apply);
    neckF.add(p, 'neckScaleZ', 20, 140, 1).name('Scale Z').onChange(apply);
    neckF.add(p, 'neckPosX', -50, 50, 1).name('Pos X').onChange(apply);
    neckF.add(p, 'neckPosY', -50, 50, 1).name('Pos Y').onChange(apply);
    neckF.add(p, 'neckPosZ', -80, 40, 1).name('Pos Z').onChange(apply);

    const bodyF = f.addFolder('Body');
    bodyF.add(p, 'bodyRadiusMul', 0.6, 1.8, 0.01).name('Thickness').onChange(apply);
    bodyF.addColor(p, 'bodyColor').name('Body color').onChange(apply);
    bodyF.addColor(p, 'bodyEmissive').name('Body emissive').onChange(apply);
    bodyF.add(p, 'bodyEmissiveIntensity', 0, 2, 0.01).name('Body glow').onChange(apply);
    bodyF.add(p, 'bodyRoughness', 0, 1, 0.01).name('Roughness').onChange(apply);
    bodyF.add(p, 'bodyMetalness', 0, 1, 0.01).name('Metalness').onChange(apply);
    bodyF.add(p, 'bodyTexRepeatX', 0.2, 6, 0.05).name('Tex repeat X').onChange(apply);
    bodyF.add(p, 'bodyTexRepeatY', 0.2, 6, 0.05).name('Tex repeat Y').onChange(apply);

    const neckMatF = f.addFolder('Neck Material');
    neckMatF.addColor(p, 'neckColor').name('Neck color').onChange(apply);
    neckMatF.addColor(p, 'neckEmissive').name('Neck emissive').onChange(apply);
    neckMatF.add(p, 'neckEmissiveIntensity', 0, 2, 0.01).name('Neck glow').onChange(apply);
    neckMatF.add(p, 'neckRoughness', 0, 1, 0.01).name('Neck roughness').onChange(apply);
    neckMatF.add(p, 'neckMetalness', 0, 1, 0.01).name('Neck metalness').onChange(apply);

    const tailF = f.addFolder('Tail');
    tailF.add(p, 'tailRadiusMul', 0.2, 2, 0.01).name('Tail size').onChange(apply);
    tailF.add(p, 'tailScaleY', 0.2, 2, 0.01).name('Tail squash Y').onChange(apply);
    tailF.add(p, 'tailScaleZ', 0.2, 2, 0.01).name('Tail length Z').onChange(apply);

    const broodF = f.addFolder('Brood');
    broodF.add(p, 'broodScaleX', 0.2, 3, 0.01).name('Scale X').onChange(apply);
    broodF.add(p, 'broodScaleY', 0.2, 3, 0.01).name('Scale Y').onChange(apply);
    broodF.add(p, 'broodScaleZ', 0.2, 3, 0.01).name('Scale Z').onChange(apply);

    const faceF = f.addFolder('Face Texture');
    faceF.addColor(p, 'headEmissive').name('Face emissive').onChange(apply);
    faceF.add(p, 'headEmissiveIntensity', 0, 2, 0.01).name('Face glow').onChange(apply);
    faceF.add(p, 'headRoughness', 0, 1, 0.01).name('Face roughness').onChange(apply);
    faceF.add(p, 'headMetalness', 0, 1, 0.01).name('Face metalness').onChange(apply);
    faceF.add(p, 'headTexRepeatX', 0.25, 3, 0.01).name('Tex repeat X').onChange(apply);
    faceF.add(p, 'headTexRepeatY', 0.25, 3, 0.01).name('Tex repeat Y').onChange(apply);
    faceF.add(p, 'headTexOffsetX', -1, 1, 0.01).name('Tex offset X').onChange(apply);
    faceF.add(p, 'headTexOffsetY', -1, 1, 0.01).name('Tex offset Y').onChange(apply);

    const weakF = f.addFolder('Weak Spots');
    weakF.add(p, 'weakSpotScaleMul', 0.6, 2.5, 0.01).name('Visual size').onChange(apply);
    weakF.add(p, 'weakSpotHitMul', 0.6, 2.5, 0.01).name('Hit radius').onChange(apply);
    weakF.addColor(p, 'weakSpotColor').name('Color').onChange(apply);
    weakF.addColor(p, 'weakSpotEmissive').name('Emissive').onChange(apply);
    weakF.add(p, 'weakSpotEmissiveIntensity', 0, 2, 0.01).name('Glow').onChange(apply);
    weakF.add(p, 'weakSpotOpacity', 0.1, 1, 0.01).name('Opacity').onChange(apply);

    f.add({ syncFromBoss }, 'syncFromBoss').name('↻ Read Current');
    f.add({ load }, 'load').name('📥 Load JSON');
    f.add({ copy: () => this._copy('WorldEater', p) }, 'copy').name('📋 Copy JSON');
    f.add({ reset }, 'reset').name('↺ Reset Boss');
  }

  // ── Helpers ─────────────────────────────────────────────────
  _copy(label, obj) {
    const text = JSON.stringify(obj, null, 2);
    navigator.clipboard?.writeText(text)
      .then(() => console.log(`[DevPanel] ${label} copied:\n`, text));
  }

  _collapseFolders(folder) {
    if (folder !== this._gui) folder.close();
    const children = Array.isArray(folder.folders)
      ? folder.folders
      : Object.values(folder.folders ?? {});
    for (const child of children) {
      this._collapseFolders(child);
    }
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
