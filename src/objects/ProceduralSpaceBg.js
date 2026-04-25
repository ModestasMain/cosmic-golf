// ============================================================
// ProceduralSpaceBg.js — seamless cosmic skybox
//
// Key techniques:
//   pow(fbm, sharpness) → dark void gaps with bright nebula patches
//   Domain warp (2 noise calls) → breaks symmetric blob patterns
//   Uniform-backed params → DevPanel can tweak everything live
// ============================================================

import {
  SphereGeometry, MeshBasicMaterial, ShaderMaterial, Mesh, BackSide, Color, Vector3,
  TextureLoader, CubeTextureLoader, SRGBColorSpace, LinearFilter, LinearMipmapLinearFilter, ClampToEdgeWrapping, EquirectangularReflectionMapping,
} from 'three';

const VOID_BG_RADIUS = 6000;
const VOID_BG_WIDTH_SEGMENTS = 256;
const VOID_BG_HEIGHT_SEGMENTS = 128;

export const DEFAULT_VOID_PARAMS = {
  voidColor:     '#050210',
  neb1Color:     '#CC0AAA',
  neb1Scale:     2.7,
  neb1Intensity: 1.6,
  neb1Sharpness: 5.8,
  neb2Color:     '#1228CC',
  neb2Scale:     4.5,
  neb2Intensity: 2.45,
  neb2Sharpness: 8.0,
  warmIntensity: 0.0,
  warpAmount:    0.0,
  exposure:      0.65,
  saturation:    1.3,
  animSpeed:     0.02,
  imageExposure: 1.0,
  imageContrast: 1.0,
  imageSaturation: 1.0,
  imageBlackPoint: 0.0,
  imageHighlightCompression: 0.0,
  imagePoleFadeStart: 0.72,
  imagePoleFadeStrength: 0.0,
  imageSeamBlendWidth: 0.04,
  imageSeamBlendStrength: 0.0,
  imageSeamBlur: 0.0,
  sphereRadius: 6000,
  rotationX:    0.0,
  rotationY:    0.0,
  rotationZ:    0.0,
};

const VERT = /* glsl */`
  varying vec3 vDir;
  void main(){
    vDir = normalize((modelMatrix * vec4(position,1.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3  uVoidColor;
  uniform vec3  uNeb1Color;
  uniform float uNeb1Scale;
  uniform float uNeb1Intensity;
  uniform float uNeb1Sharpness;
  uniform vec3  uNeb2Color;
  uniform float uNeb2Scale;
  uniform float uNeb2Intensity;
  uniform float uNeb2Sharpness;
  uniform float uWarmIntensity;
  uniform float uWarpAmount;
  uniform float uExposure;
  uniform float uSaturation;
  uniform float uAnimSpeed;
  varying vec3 vDir;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise2(vec2 p){
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),        hash(i+vec2(1,0)),f.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  // Seamless 3-D FBM via two orthogonal 2-D slices
  float fbm(vec3 p){
    float v=0.0, a=0.5;
    for(int i=0;i<3;i++){
      float fi=float(i);
      float s1=noise2(p.xy+p.z*(0.71+fi*0.23)+fi*vec2(5.2,1.3));
      float s2=noise2(p.yz+p.x*(0.63+fi*0.19)+fi*vec2(3.7,8.1));
      v+=a*(s1*0.55+s2*0.45); p*=2.03; a*=0.5;
    }
    return v; // range ≈ [0, 0.875]
  }

  void main(){
    vec3  d = vDir;
    float t = uTime * uAnimSpeed;

    // ── Cheap domain warp (2 noise calls) ────────────────────
    // Displaces the FBM sampling direction to create organic,
    // non-symmetric nebula shapes and prevent single-axis blobs.
    float wx = noise2(d.xy*2.1 + d.z*1.1 + t*0.08) - 0.5;
    float wy = noise2(d.yz*2.0 + d.x*0.9 + 5.2   ) - 0.5;
    vec3 dw  = normalize(d + vec3(wx, wy, wx*0.5) * uWarpAmount);

    // ── FBM on warped direction ──────────────────────────────
    float f1 = fbm(dw * uNeb1Scale + vec3(0.0,  0.0, t      ));
    float f2 = fbm(dw * uNeb2Scale + vec3(1.5, -0.8, t*0.7  ));
    float f3 = fbm(d  * 1.4        + vec3(-0.9, 1.2, t*0.4  ));

    // ── pow() shapes: dark gaps + bright cloud peaks ─────────
    // Low FBM → nearly zero (dark void).  High FBM → stays bright.
    float neb1 = pow(max(0.0, f1), uNeb1Sharpness);
    float neb2 = pow(max(0.0, f2), uNeb2Sharpness);
    float warm = pow(max(0.0, f3), 2.8);

    // ── Colour assembly ──────────────────────────────────────
    vec3 col = uVoidColor;   // near-black base — dark areas stay dark

    col += uNeb1Color * neb1 * uNeb1Intensity;
    col += uNeb2Color * neb2 * uNeb2Intensity;
    col += vec3(0.28, 0.05, 0.18) * warm * uWarmIntensity;

    // ── Colour grade ─────────────────────────────────────────
    float lum = dot(col, vec3(0.299,0.587,0.114));
    col = mix(vec3(lum), col, uSaturation);
    col = 1.0 - exp(-col * uExposure);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToV3(hex) {
  const c = new Color(hex);
  return new Vector3(c.r, c.g, c.b);
}

export class ProceduralSpaceBg {
  constructor(scene) {
    this._scene    = scene;
    this._mesh     = null;
    this._material = null;
    this._clock    = 0;
    this._u        = null;
    this._loader   = new TextureLoader();
    this._cubeLoader = new CubeTextureLoader();
    this._texture  = null;
    this._cubeTexture = null;
    this._backgroundMode = 'procedural';
    this.textureName = 'procedural';
    this.params    = { ...DEFAULT_VOID_PARAMS };
  }

  load() {
    const geo = new SphereGeometry(VOID_BG_RADIUS, VOID_BG_WIDTH_SEGMENTS, VOID_BG_HEIGHT_SEGMENTS);
    this._material = this._createProceduralMaterial();
    this._mesh = new Mesh(geo, this._material);
    this._mesh.renderOrder = -1000;
    this._mesh.name = 'proceduralSpaceBg';
    this._scene.add(this._mesh);
    this.applyParams();
  }

  _createProceduralMaterial() {
    const material = new MeshBasicMaterial({ side: BackSide, depthWrite: false, fog: false });
    material.onBeforeCompile = (shader) => {
      const p = this.params;
      this._u = {
        uTime:          { value: 0                    },
        uVoidColor:     { value: hexToV3(p.voidColor) },
        uNeb1Color:     { value: hexToV3(p.neb1Color) },
        uNeb1Scale:     { value: p.neb1Scale          },
        uNeb1Intensity: { value: p.neb1Intensity      },
        uNeb1Sharpness: { value: p.neb1Sharpness      },
        uNeb2Color:     { value: hexToV3(p.neb2Color) },
        uNeb2Scale:     { value: p.neb2Scale          },
        uNeb2Intensity: { value: p.neb2Intensity      },
        uNeb2Sharpness: { value: p.neb2Sharpness      },
        uWarmIntensity: { value: p.warmIntensity      },
        uWarpAmount:    { value: p.warpAmount         },
        uExposure:      { value: p.exposure           },
        uSaturation:    { value: p.saturation         },
        uAnimSpeed:     { value: p.animSpeed          },
      };
      Object.assign(shader.uniforms, this._u);
      shader.vertexShader   = VERT;
      shader.fragmentShader = FRAG;
      material.userData.shader = shader;
    };
    return material;
  }

  _createTextureMaterial(tex) {
    const material = new MeshBasicMaterial({
      map: tex,
      side: BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });

    material.onBeforeCompile = (shader) => {
      const p = this.params;
      this._u = {
        uImageExposure: { value: p.imageExposure },
        uImageContrast: { value: p.imageContrast },
        uImageSaturation: { value: p.imageSaturation },
        uImageBlackPoint: { value: p.imageBlackPoint },
        uImageHighlightCompression: { value: p.imageHighlightCompression },
        uImagePoleFadeStart: { value: p.imagePoleFadeStart },
        uImagePoleFadeStrength: { value: p.imagePoleFadeStrength },
        uImagePoleFadeColor: { value: hexToV3(p.voidColor) },
        uImageSeamBlendWidth: { value: p.imageSeamBlendWidth },
        uImageSeamBlendStrength: { value: p.imageSeamBlendStrength },
        uImageSeamBlur: { value: p.imageSeamBlur },
      };
      Object.assign(shader.uniforms, this._u);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uImageExposure;
uniform float uImageContrast;
uniform float uImageSaturation;
uniform float uImageBlackPoint;
uniform float uImageHighlightCompression;
uniform float uImagePoleFadeStart;
uniform float uImagePoleFadeStrength;
uniform vec3 uImagePoleFadeColor;

vec3 applyVoidImageGrade(vec3 col, vec2 uv) {
  col *= uImageExposure;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uImageSaturation);
  col = (col - 0.5) * uImageContrast + 0.5;
  col = max(col - uImageBlackPoint, 0.0) / max(1.0 - uImageBlackPoint, 0.0001);
  col = col / (1.0 + col * uImageHighlightCompression * 2.0);
  float pole = smoothstep(uImagePoleFadeStart, 1.0, abs(uv.y - 0.5) * 2.0);
  col = mix(col, uImagePoleFadeColor, pole * uImagePoleFadeStrength);
  return clamp(col, 0.0, 1.0);
}
`,
        )
        .replace(
          '#include <map_pars_fragment>',
          `#include <map_pars_fragment>
uniform float uImageSeamBlendWidth;
uniform float uImageSeamBlendStrength;
uniform float uImageSeamBlur;

vec2 wrapVoidUv(vec2 uv) {
  return vec2(fract(uv.x + 1.0), clamp(uv.y, 0.0001, 0.9999));
}

vec4 blurVoidMap(vec2 uv, float blur) {
  vec4 col = texture2D(map, wrapVoidUv(uv)) * 0.40;
  col += texture2D(map, wrapVoidUv(uv + vec2(-blur * 2.0, 0.0))) * 0.10;
  col += texture2D(map, wrapVoidUv(uv + vec2(-blur, 0.0))) * 0.20;
  col += texture2D(map, wrapVoidUv(uv + vec2(blur, 0.0))) * 0.20;
  col += texture2D(map, wrapVoidUv(uv + vec2(blur * 2.0, 0.0))) * 0.10;
  return col;
}

vec4 sampleVoidMap(vec2 uv) {
  float width = max(uImageSeamBlendWidth, 0.0001);
  float distToSeam = min(uv.x, 1.0 - uv.x);
  float seamZone = 1.0 - smoothstep(0.0, width, distToSeam);
  float seamMask = seamZone * uImageSeamBlendStrength;
  float blur = uImageSeamBlur * seamZone;
  vec4 base = blur > 0.0001
    ? blurVoidMap(uv, blur)
    : texture2D(map, wrapVoidUv(uv));

  if (seamMask > 0.0001) {
    float seamOffset = uv.x < 0.5 ? 1.0 : -1.0;
    vec4 seam = blurVoidMap(vec2(uv.x + seamOffset, uv.y), max(blur, 0.0005));
    base = mix(base, seam, clamp(seamMask, 0.0, 1.0));
  }

  return base;
}
`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
  vec4 sampledDiffuseColor = sampleVoidMap(vMapUv);
  diffuseColor *= sampledDiffuseColor;
#endif
diffuseColor.rgb = applyVoidImageGrade(diffuseColor.rgb, vMapUv);
`,
        );
      material.userData.shader = shader;
    };

    return material;
  }

  _createCubemapMaterial(cubeTex) {
    const p = this.params;
    const u = {
      uCube:                       { value: cubeTex },
      uImageExposure:              { value: p.imageExposure },
      uImageContrast:              { value: p.imageContrast },
      uImageSaturation:            { value: p.imageSaturation },
      uImageBlackPoint:            { value: p.imageBlackPoint },
      uImageHighlightCompression:  { value: p.imageHighlightCompression },
      uImagePoleFadeStart:         { value: p.imagePoleFadeStart },
      uImagePoleFadeStrength:      { value: p.imagePoleFadeStrength },
      uImagePoleFadeColor:         { value: hexToV3(p.voidColor) },
      uImageSeamBlur:              { value: p.imageSeamBlur },
    };
    this._u = u;
    return new ShaderMaterial({
      uniforms: u,
      side: BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform samplerCube uCube;
        uniform float uImageExposure;
        uniform float uImageContrast;
        uniform float uImageSaturation;
        uniform float uImageBlackPoint;
        uniform float uImageHighlightCompression;
        uniform float uImagePoleFadeStart;
        uniform float uImagePoleFadeStrength;
        uniform vec3  uImagePoleFadeColor;
        uniform float uImageSeamBlur;
        varying vec3 vDir;

        vec3 sampleBlurred(vec3 d, float blur) {
          if (blur < 0.0001) return textureCube(uCube, d).rgb;
          // 6 perpendicular taps around the direction; magnitude controls blur radius
          vec3 up = abs(d.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 t = normalize(cross(up, d));
          vec3 b = cross(d, t);
          float r = blur * 1.4;
          vec3 c = textureCube(uCube, d).rgb * 0.40;
          c += textureCube(uCube, normalize(d +  t * r)).rgb * 0.10;
          c += textureCube(uCube, normalize(d -  t * r)).rgb * 0.10;
          c += textureCube(uCube, normalize(d +  b * r)).rgb * 0.10;
          c += textureCube(uCube, normalize(d -  b * r)).rgb * 0.10;
          c += textureCube(uCube, normalize(d + (t+b) * r * 0.7)).rgb * 0.10;
          c += textureCube(uCube, normalize(d - (t+b) * r * 0.7)).rgb * 0.10;
          return c;
        }

        void main() {
          vec3 d = normalize(vDir);
          vec3 col = sampleBlurred(d, uImageSeamBlur * 30.0);
          col *= uImageExposure;
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(lum), col, uImageSaturation);
          col = (col - 0.5) * uImageContrast + 0.5;
          col = max(col - uImageBlackPoint, 0.0) / max(1.0 - uImageBlackPoint, 0.0001);
          col = col / (1.0 + col * uImageHighlightCompression * 2.0);
          float pole = smoothstep(uImagePoleFadeStart, 1.0, abs(d.y));
          col = mix(col, uImagePoleFadeColor, pole * uImagePoleFadeStrength);
          col = clamp(col, 0.0, 1.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }

  _prepareTexture(tex, name) {
    tex.name = name || 'uploaded void';
    tex.colorSpace = SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.anisotropy = 8;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.mapping = EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    return tex;
  }

  _disposeTexture() {
    if (!this._texture) return;
    if (this._scene.background === this._texture) this._scene.background = null;
    this._texture.dispose();
    this._texture = null;
  }

  _disposeCubeTexture() {
    if (!this._cubeTexture) return;
    if (this._scene.background === this._cubeTexture) this._scene.background = null;
    this._cubeTexture.dispose();
    this._cubeTexture = null;
  }

  _swapMaterial(nextMaterial) {
    if (!this._mesh) return;
    const oldMaterial = this._mesh.material;
    this._mesh.material = nextMaterial;
    if (oldMaterial) oldMaterial.dispose();
    this._material = nextMaterial;
  }

  _loadTexture(url, name, revokeUrl = false) {
    return new Promise((resolve, reject) => {
      this._loader.load(
        url,
        (tex) => {
          if (revokeUrl) URL.revokeObjectURL(url);
          this.useTexture(this._prepareTexture(tex, name));
          resolve(tex);
        },
        undefined,
        (err) => {
          if (revokeUrl) URL.revokeObjectURL(url);
          reject(err);
        },
      );
    });
  }

  loadTextureFromFile(file) {
    if (!file || !file.type?.startsWith('image/')) {
      return Promise.reject(new Error('Void background upload must be an image file.'));
    }
    return this._loadTexture(URL.createObjectURL(file), file.name, true);
  }

  loadTextureFromPath(path) {
    if (String(path).toLowerCase().endsWith('.json')) {
      return this.loadCubeMapFromManifest(path);
    }
    return this._loadTexture(path, path, false);
  }

  async loadCubeMapFromManifest(manifestPath) {
    const res = await fetch(manifestPath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load cubemap manifest: ${manifestPath}`);
    const manifest = await res.json();
    const faces = manifest?.faces || {};
    const urls = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((key) => {
      if (!faces[key]) throw new Error(`Cubemap manifest missing face: ${key}`);
      return new URL(faces[key], res.url).toString();
    });
    return this.loadCubeMapFromFaces(urls, manifestPath);
  }

  loadCubeMapFromFaces(faceUrls, name = 'cubemap') {
    return new Promise((resolve, reject) => {
      this._cubeLoader.load(
        faceUrls,
        (cubeTexture) => {
          cubeTexture.colorSpace = SRGBColorSpace;
          cubeTexture.name = name;
          cubeTexture.generateMipmaps = true;
          cubeTexture.minFilter = LinearMipmapLinearFilter;
          cubeTexture.magFilter = LinearFilter;
          cubeTexture.anisotropy = 8;
          cubeTexture.needsUpdate = true;
          this.useCubeTexture(cubeTexture);
          resolve(cubeTexture);
        },
        undefined,
        reject,
      );
    });
  }

  useTexture(tex) {
    this._disposeCubeTexture();
    this._disposeTexture();
    this._texture = tex;
    this._backgroundMode = 'equirect';
    this.textureName = tex?.name || 'uploaded void';
    this._u = null;
    if (this._mesh) this._mesh.visible = false;
    this._scene.backgroundBlurriness = 0;
    this._scene.background = tex;
    this.applyParams();
  }

  useCubeTexture(cubeTexture) {
    this._disposeTexture();
    this._disposeCubeTexture();
    this._cubeTexture = cubeTexture;
    this._backgroundMode = 'cubemap';
    this.textureName = cubeTexture?.name || 'cubemap';
    this._scene.background = null;
    this._scene.backgroundBlurriness = 0;
    this._swapMaterial(this._createCubemapMaterial(cubeTexture));
    if (this._mesh) this._mesh.visible = true;
    this.applyParams();
  }

  useProcedural() {
    this._disposeTexture();
    this._disposeCubeTexture();
    this._backgroundMode = 'procedural';
    this.textureName = 'procedural';
    this._scene.background = null;
    this._scene.backgroundIntensity = 1;
    this._scene.backgroundRotation.set(0, 0, 0);
    this._u = null;
    this._swapMaterial(this._createProceduralMaterial());
    if (this._mesh) this._mesh.visible = true;
    this.applyParams();
  }

  /** Push this.params into live shader uniforms. Called by DevPanel. */
  applyParams() {
    const p = this.params;
    if (this._mesh) {
      const radiusScale = Math.max(0.1, p.sphereRadius / VOID_BG_RADIUS);
      this._mesh.scale.setScalar(radiusScale);
      this._mesh.rotation.set(
        p.rotationX * Math.PI / 180,
        p.rotationY * Math.PI / 180,
        p.rotationZ * Math.PI / 180,
      );
      this._mesh.visible =
        this._backgroundMode === 'procedural' ||
        this._backgroundMode === 'cubemap';
    }

    if (this._backgroundMode === 'equirect' && this._texture) {
      this._scene.background = this._texture;
      this._scene.backgroundBlurriness = 0;
      this._scene.backgroundIntensity = p.imageExposure;
      this._scene.backgroundRotation.set(
        p.rotationX * Math.PI / 180,
        p.rotationY * Math.PI / 180,
        p.rotationZ * Math.PI / 180,
      );
    }

    const u = this._u;
    if (!u) return;
    if (u.uVoidColor) {
      const v1 = hexToV3(p.voidColor);
      const v2 = hexToV3(p.neb1Color);
      const v3 = hexToV3(p.neb2Color);
      u.uVoidColor.value.set(v1.x, v1.y, v1.z);
      u.uNeb1Color.value.set(v2.x, v2.y, v2.z);
      u.uNeb2Color.value.set(v3.x, v3.y, v3.z);
      u.uNeb1Scale.value     = p.neb1Scale;
      u.uNeb1Intensity.value = p.neb1Intensity;
      u.uNeb1Sharpness.value = p.neb1Sharpness;
      u.uNeb2Scale.value     = p.neb2Scale;
      u.uNeb2Intensity.value = p.neb2Intensity;
      u.uNeb2Sharpness.value = p.neb2Sharpness;
      u.uWarmIntensity.value = p.warmIntensity;
      u.uWarpAmount.value    = p.warpAmount;
      u.uExposure.value      = p.exposure;
      u.uSaturation.value    = p.saturation;
      u.uAnimSpeed.value     = p.animSpeed;
    }
    if (u.uImageExposure) {
      const fadeColor = hexToV3(p.voidColor);
      u.uImageExposure.value = p.imageExposure;
      u.uImageContrast.value = p.imageContrast;
      u.uImageSaturation.value = p.imageSaturation;
      u.uImageBlackPoint.value = p.imageBlackPoint;
      u.uImageHighlightCompression.value = p.imageHighlightCompression;
      u.uImagePoleFadeStart.value = p.imagePoleFadeStart;
      u.uImagePoleFadeStrength.value = p.imagePoleFadeStrength;
      u.uImagePoleFadeColor.value.set(fadeColor.x, fadeColor.y, fadeColor.z);
      if (u.uImageSeamBlendWidth) u.uImageSeamBlendWidth.value = p.imageSeamBlendWidth;
      if (u.uImageSeamBlendStrength) u.uImageSeamBlendStrength.value = p.imageSeamBlendStrength;
      if (u.uImageSeamBlur) u.uImageSeamBlur.value = p.imageSeamBlur;
    }
  }

  update(dt, camera = null) {
    this._clock += dt;
    if (this._backgroundMode === 'equirect' && this._texture && this._scene.background !== this._texture) {
      this._scene.background = this._texture;
    }
    if (camera && this._mesh) {
      this._mesh.position.copy(camera.position);
    }
    if (this._u?.uTime) this._u.uTime.value = this._clock;
  }

  dispose() {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._material.dispose();
      this._mesh = null;
    }
    this._disposeTexture();
    this._disposeCubeTexture();
  }
}
