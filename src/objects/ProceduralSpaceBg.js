// ============================================================
// ProceduralSpaceBg.js — seamless cosmic skybox
//
// Key techniques:
//   pow(fbm, sharpness) → dark void gaps with bright nebula patches
//   Domain warp (2 noise calls) → breaks symmetric blob patterns
//   Uniform-backed params → DevPanel can tweak everything live
// ============================================================

import { SphereGeometry, MeshBasicMaterial, Mesh, BackSide, Color, Vector3 } from 'three';

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
    this.params    = { ...DEFAULT_VOID_PARAMS };
  }

  load() {
    const geo = new SphereGeometry(6000, 64, 32);
    this._material = new MeshBasicMaterial({ side: BackSide, depthWrite: false, fog: false });

    this._material.onBeforeCompile = (shader) => {
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
      this._material.userData.shader = shader;
    };

    this._mesh = new Mesh(geo, this._material);
    this._mesh.renderOrder = -1000;
    this._mesh.name = 'proceduralSpaceBg';
    this._scene.add(this._mesh);
  }

  /** Push this.params into live shader uniforms. Called by DevPanel. */
  applyParams() {
    const u = this._u;
    if (!u) return;
    const p = this.params;
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

  update(dt) {
    this._clock += dt;
    if (this._u) this._u.uTime.value = this._clock;
  }

  dispose() {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._material.dispose();
      this._mesh = null;
    }
  }
}
