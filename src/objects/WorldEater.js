import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CatmullRomCurve3,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { BALL, WORLDEATER } from '../core/Constants.js';

const _posA = new Vector3();
const _posB = new Vector3();
const _posC = new Vector3();
const _delta = new Vector3();
const _normal = new Vector3();
const _segmentVelocity = new Vector3();
const _toCup = new Vector3();
const _up = new Vector3(0, 1, 0);
const _side = new Vector3();
const _broodOffset = new Vector3();
const _broodAhead = new Vector3();
const _weakSpotWorld = new Vector3();
const _bridgeMid = new Vector3();
const _bridgeLook = new Vector3();
const _introPrev = new Vector3();
const _introHeadPos = new Vector3();
const _introFallback = new Vector3();
const _sealResumePos = new Vector3();
const _frameAxis = new Vector3();
const _frameNormal = new Vector3();
const _frameBinormal = new Vector3();
const _frameTangent = new Vector3();
const _ringVertex = new Vector3();
const _textureLoader = new TextureLoader();
const WORLDEATER_DEV_PRESET = {
  headScaleX: 64,
  headScaleY: 55,
  headScaleZ: 54,
  headOffsetX: 0,
  headOffsetY: 0,
  headOffsetZ: 0,
  headRotateY: -1.24159265358979,
  neckScaleX: 36,
  neckScaleY: 49,
  neckScaleZ: 91,
  neckPosX: -5,
  neckPosY: -2,
  neckPosZ: -32,
  bodyRadiusMul: 1.16,
  bodyTexRepeatX: 1.8,
  bodyTexRepeatY: 1.1,
  headTexRepeatX: 1.09,
  headTexRepeatY: 0.8,
  headTexOffsetX: 0,
  headTexOffsetY: 0,
  bodyColor: '#ffffff',
  bodyEmissive: '#000000',
  bodyEmissiveIntensity: 0.22,
  bodyRoughness: 0,
  bodyMetalness: 0.24,
  neckColor: '#ffffff',
  neckEmissive: '#000000',
  neckEmissiveIntensity: 0,
  neckRoughness: 0,
  neckMetalness: 0,
  tailRadiusMul: 0.99,
  tailScaleY: 0.99,
  tailScaleZ: 1.71,
  headEmissive: '#000000',
  headEmissiveIntensity: 0.95,
  headRoughness: 0,
  headMetalness: 0,
  weakSpotScaleMul: 1,
  weakSpotHitMul: 1,
  weakSpotColor: '#ffe4a0',
  weakSpotEmissive: '#ffa947',
  weakSpotEmissiveIntensity: 0.68,
  weakSpotOpacity: 0.96,
  broodScaleX: 0.86,
  broodScaleY: 1.02,
  broodScaleZ: 0.57,
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(1e-5, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function isFiniteVec3(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function makeSkinTexture(primary, secondary, glow) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, primary);
  grad.addColorStop(0.32, secondary);
  grad.addColorStop(0.7, '#09030e');
  grad.addColorStop(1, '#030106');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 8; i++) {
    const y = 16 + i * 30;
    const thickness = 22 - i;
    const wave = 8 + i * 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 16) {
      const yy = y + Math.sin(x * 0.017 + i * 0.93) * wave + Math.cos(x * 0.041 + i) * 3.5;
      ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = i % 3 === 1 ? `${glow}44` : '#00000092';
    ctx.lineWidth = thickness;
    ctx.stroke();
  }

  for (let i = 0; i < 14; i++) {
    const x = 8 + i * 36;
    ctx.beginPath();
    const y = (i % 2) * 24 - 18;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 18, 28, x - 10, 92, x + 16, 148);
    ctx.bezierCurveTo(x + 34, 196, x - 6, 226, x + 18, 268);
    ctx.strokeStyle = i % 4 === 0 ? `${glow}2b` : '#15060d88';
    ctx.lineWidth = 6 + (i % 3) * 2;
    ctx.stroke();
  }

  for (let i = 0; i < 24; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const w = 36 + Math.random() * 72;
    const h = 12 + Math.random() * 24;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = i % 5 === 0 ? `${glow}20` : 'rgba(0,0,0,0.14)';
    ctx.fill();
  }

  for (let i = 0; i < 110; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 1 + Math.random() * 3.2;
    const alpha = 0.03 + Math.random() * 0.08;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,228,205,${alpha})`;
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1.8, 1.35);
  return texture;
}

function makeMarkedTexture(base, band, scar) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#fff2cf');
  grad.addColorStop(0.12, band);
  grad.addColorStop(0.45, base);
  grad.addColorStop(1, '#180701');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 5; i++) {
    const y = 22 + i * 44;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 18) {
      const yy = y + Math.sin(x * 0.02 + i * 1.1) * 10 + Math.cos(x * 0.047) * 3;
      ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = `${band}dd`;
    ctx.lineWidth = 18 - i * 2;
    ctx.stroke();
  }

  for (let i = 0; i < 11; i++) {
    const x = 20 + i * 42;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 12, 24, x - 16, 86, x + 6, 136);
    ctx.bezierCurveTo(x + 24, 186, x - 8, 230, x + 10, 256);
    ctx.strokeStyle = `${scar}99`;
    ctx.lineWidth = 6 + (i % 2) * 2;
    ctx.stroke();
  }

  for (let i = 0; i < 18; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const w = 28 + Math.random() * 58;
    const h = 10 + Math.random() * 20;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,245,210,0.18)' : `${band}26`;
    ctx.fill();
  }

  for (let i = 0; i < 70; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 2 + Math.random() * 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,245,220,0.12)';
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1.7, 1.25);
  return texture;
}

function makeFaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const grad = ctx.createRadialGradient(cx, cy, 28, cx, cy, canvas.width * 0.48);
  grad.addColorStop(0, '#020403');
  grad.addColorStop(0.18, '#06100b');
  grad.addColorStop(0.42, '#10261c');
  grad.addColorStop(0.72, '#183428');
  grad.addColorStop(1, '#09110d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 96; i++) {
    const angle = (i / 120) * Math.PI * 2;
    const inner = 56 + Math.random() * 16;
    const outer = 176 + Math.random() * 34;
    const twist = (Math.random() - 0.5) * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    for (let step = 1; step <= 4; step++) {
      const t = step / 4;
      const a = angle + twist * step;
      const r = inner + (outer - inner) * t;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.strokeStyle = i % 7 === 0 ? 'rgba(150,255,210,0.12)' : 'rgba(0,0,0,0.26)';
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.stroke();
  }

  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 158 + Math.random() * 64;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.arc(x, y, 12 + Math.random() * 22, 0, Math.PI * 2);
    ctx.fillStyle = i % 4 === 0 ? 'rgba(120,255,210,0.06)' : 'rgba(0,0,0,0.1)';
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

function loadWorldEaterFaceTexture() {
  const fallback = makeFaceTexture();

  try {
    const texture = _textureLoader.load('/assets/worldeater-face.png');
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  } catch {
    return fallback;
  }
}

function loadWorldEaterBodyTexture() {
  const fallback = makeTubeTexture();

  try {
    const texture = _textureLoader.load('/assets/worldeater-scales.jpg');
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(1.8, 1.1);
    return texture;
  } catch {
    return fallback;
  }
}

function makeTubeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#08120d');
  grad.addColorStop(0.48, '#163127');
  grad.addColorStop(1, '#09110d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scaleW = 52;
  const scaleH = 34;
  for (let row = -1; row < 18; row++) {
    const offset = row % 2 === 0 ? 0 : scaleW * 0.5;
    for (let col = -1; col < 12; col++) {
      const x = col * scaleW + offset;
      const y = row * (scaleH * 0.72);

      ctx.beginPath();
      ctx.moveTo(x, y + scaleH * 0.18);
      ctx.quadraticCurveTo(x + scaleW * 0.5, y - scaleH * 0.16, x + scaleW, y + scaleH * 0.18);
      ctx.quadraticCurveTo(x + scaleW * 0.88, y + scaleH, x + scaleW * 0.5, y + scaleH * 1.06);
      ctx.quadraticCurveTo(x + scaleW * 0.12, y + scaleH, x, y + scaleH * 0.18);
      ctx.closePath();

      const hot = Math.random() < 0.06;
      ctx.fillStyle = hot ? 'rgba(42,84,56,0.9)' : 'rgba(20,38,28,0.94)';
      ctx.fill();
      ctx.strokeStyle = hot ? 'rgba(140,220,180,0.12)' : 'rgba(220,255,235,0.05)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + scaleW * 0.18, y + scaleH * 0.24);
      ctx.quadraticCurveTo(x + scaleW * 0.5, y + scaleH * 0.04, x + scaleW * 0.82, y + scaleH * 0.24);
      ctx.strokeStyle = hot ? 'rgba(170,255,220,0.08)' : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  for (let i = 0; i < 70; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 1 + Math.random() * 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = i % 9 === 0 ? 'rgba(120,255,210,0.03)' : 'rgba(230,255,240,0.02)';
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1.8, 1.1);
  return texture;
}

function makeCreatureMats() {
  const skin = makeSkinTexture('#24111d', '#07030d', '#d04c8a');
  const face = loadWorldEaterFaceTexture();
  const tube = loadWorldEaterBodyTexture();
  const belly = makeSkinTexture('#68223b', '#17060f', '#ffcf7a');
  const plates = makeSkinTexture('#272631', '#06060a', '#9664ff');
  const weakSkin = makeMarkedTexture('#a84a12', '#ffd86b', '#fff4d2');
  const weakBelly = makeMarkedTexture('#c7671f', '#ffe49a', '#fff8e1');
  const weakPlates = makeMarkedTexture('#c28a32', '#fff0a8', '#fff9ea');

  const body = new MeshStandardMaterial({
    color: 0xffffff,
    map: skin,
    emissiveMap: skin,
    emissive: new Color(0x3c1024),
    emissiveIntensity: 0.95,
    roughness: 0.64,
    metalness: 0.08,
  });

  const head = new MeshStandardMaterial({
    color: 0xffffff,
    map: face,
    emissiveMap: face,
    emissive: new Color(0x4d1020),
    emissiveIntensity: 1.05,
    roughness: 0.52,
    metalness: 0.1,
  });

  const jaw = new MeshStandardMaterial({
    color: 0x17080d,
    emissive: new Color(0x8a2d18),
    emissiveIntensity: 0.38,
    roughness: 0.78,
    metalness: 0.03,
  });

  const tooth = new MeshStandardMaterial({
    color: 0xf3dcb3,
    emissive: new Color(0x614631),
    emissiveIntensity: 0.08,
    roughness: 0.9,
    metalness: 0.02,
  });

  const underbelly = new MeshStandardMaterial({
    color: 0xffffff,
    map: belly,
    emissiveMap: belly,
    emissive: new Color(0x7d221b),
    emissiveIntensity: 0.72,
    roughness: 0.56,
    metalness: 0.04,
  });

  const plate = new MeshStandardMaterial({
    color: 0xffffff,
    map: plates,
    emissiveMap: plates,
    emissive: new Color(0x2e2455),
    emissiveIntensity: 0.65,
    roughness: 0.86,
    metalness: 0.1,
  });

  const furnace = new MeshBasicMaterial({
    color: 0xfff2be,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  return {
    body,
    head,
    jaw,
    tooth,
    underbelly,
    plate,
    furnace,
    weakSkin,
    weakBelly,
    weakPlates,
    tube,
    textures: [skin, face, tube, belly, plates, weakSkin, weakBelly, weakPlates],
  };
}

function makeGlowMaterial(color, opacity = 0.25) {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: BackSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

function captureMaterialState(material) {
  return {
    map: material.map ?? null,
    emissiveMap: material.emissiveMap ?? null,
    color: material.color?.clone?.() ?? null,
    emissive: material.emissive?.clone?.() ?? null,
    emissiveIntensity: material.emissiveIntensity ?? 0,
    roughness: material.roughness,
    metalness: material.metalness,
    opacity: material.opacity,
    transparent: material.transparent,
  };
}

function applyMaterialState(material, state) {
  if (!material || !state) return;
  material.map = state.map ?? null;
  material.emissiveMap = state.emissiveMap ?? null;
  if (state.color && material.color) material.color.copy(state.color);
  if (state.emissive && material.emissive) material.emissive.copy(state.emissive);
  if (state.emissiveIntensity !== undefined) material.emissiveIntensity = state.emissiveIntensity;
  if (state.roughness !== undefined) material.roughness = state.roughness;
  if (state.metalness !== undefined) material.metalness = state.metalness;
  if (state.opacity !== undefined) material.opacity = state.opacity;
  if (state.transparent !== undefined) material.transparent = state.transparent;
  material.needsUpdate = true;
}

function colorToHex(color) {
  return `#${color.getHexString()}`;
}

export class WorldEater {
  constructor(config = {}) {
    this.config = {
      ...WORLDEATER,
      center: config.center?.clone?.() ?? new Vector3(),
      spitTarget: config.spitTarget?.clone?.() ?? new Vector3(-190, 40, 130),
    };

    this.group = new Group();
    this._time = 0;
    this._headDir = new Vector3(1, 0, 0);
    this._segmentPositions = [];
    this._prevSegmentPositions = [];
    this._segmentNodes = [];
    this._bridgeNodes = [];
    this._brood = [];
    this._mouthOpen = 0;
    this._phase = 'sealed';
    this._phaseTime = 0;
    this._openBlend = 0;
    this._resetTimer = this.config.RESET_WINDOW_SECONDS;
    this._sealResumeBlend = 1;
    this._sealResumeTime = 0;
    this._sealResumeDuration = 1.15;
    this._sealResumeStartTime = 0;
    this._weakSpots = [];
    this._weakSpotsRemaining = this.config.WEAK_SPOT_COUNT;
    this._sealPulse = 0;
    this._intro = {
      active: false,
      time: 0,
      duration: this.config.INTRO_DURATION,
      approachEnd: this.config.INTRO_APPROACH_END,
      sealFadeStart: this.config.INTRO_SEAL_FADE_START,
      wormholePos: new Vector3(),
      controlA: new Vector3(),
      controlB: new Vector3(),
      entry: new Vector3(),
      exitDir: new Vector3(1, 0, 0),
      entryAngle: 0,
      orbitDirection: this.config.INTRO_ORBIT_DIRECTION < 0 ? -1 : 1,
      approachLength: 1,
      orbitTime: 0,
      coilBlend: 0,
    };
    this._debugTuning = {
      bodyRadiusMul: 1,
      weakSpotScaleMul: 1,
      weakSpotHitMul: 1,
      tailRadiusMul: 0.82,
      tailScaleY: 0.82,
      tailScaleZ: 1.0,
      broodScaleX: 1,
      broodScaleY: 1,
      broodScaleZ: 1,
    };

    this._headGeo = new SphereGeometry(1, 28, 22);
    this._bodyGeo = new SphereGeometry(1, 22, 18);
    this._shellGeo = new SphereGeometry(1.08, 20, 16);
    this._finGeo = new TorusGeometry(1.05, 0.08, 5, 18);
    this._mouthGeo = new TorusGeometry(1, 0.12, 8, 28);
    this._weakSleeveGeo = new TorusGeometry(1, 0.36, 12, 44);
    this._crestGeo = new ConeGeometry(0.16, 0.9, 6);
    this._plateGeo = new ConeGeometry(0.36, 1.24, 6);
    this._mandibleGeo = new ConeGeometry(0.44, 1.9, 6);
    this._mawRingGeo = new CylinderGeometry(1, 1, 1, 28, 1, true);
    this._mawCoreGeo = new CylinderGeometry(1, 1, 1, 24, 1, false);
    this._weakSpotGeo = new SphereGeometry(1, 20, 16);
    this._sealGeo = new SphereGeometry(1, 20, 16);
    this._sealRingGeo = new TorusGeometry(1, 0.18, 6, 48);

    const mats = makeCreatureMats();
    this._bodyMat = mats.body;
    this._headMat = mats.head;
    this._jawMat = mats.jaw;
    this._toothMat = mats.tooth;
    this._bellyMat = mats.underbelly;
    this._plateMat = mats.plate;
    this._furnaceMat = mats.furnace;
    this._weakSkinTex = mats.weakSkin;
    this._weakBellyTex = mats.weakBelly;
    this._weakPlateTex = mats.weakPlates;
    this._tubeTex = mats.tube;
    this._textures = mats.textures;
    this._tubeBodyMat = this._bodyMat.clone();
    this._tubeBodyMat.map = this._tubeTex;
    this._tubeBodyMat.emissiveMap = this._tubeTex;
    this._tubeBodyMat.color.set(0xf0fff6);
    this._tubeBodyMat.emissive.set(0x08150f);
    this._tubeBodyMat.emissiveIntensity = 0.18;
    this._tubeBodyMat.roughness = 0.82;
    this._tubeBodyMat.metalness = 0.04;
    this._tubeBodyMat.side = FrontSide;
    this._neckBodyMat = this._tubeBodyMat.clone();
    this._weakSleeveMat = new MeshStandardMaterial({
      color: 0xffe4a0,
      map: this._weakSkinTex,
      emissiveMap: this._weakSkinTex,
      emissive: new Color(0xffa947),
      emissiveIntensity: 0.68,
      roughness: 0.42,
      metalness: 0.04,
      transparent: true,
      opacity: 0.96,
    });

    this._glowMat = new MeshBasicMaterial({
      color: 0xffd36c,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this._shellMat = new MeshBasicMaterial({
      color: 0x120915,
      transparent: true,
      opacity: 0.0,
      depthWrite: true,
    });
    this._finMat = new MeshBasicMaterial({
      color: 0xff6fd0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this._headGroup = new Group();
    this.group.add(this._headGroup);

    this._head = new Mesh(this._headGeo, this._headMat);
    this._head.scale.set(50, 60, 78);
    this._head.rotation.y = -Math.PI / 2;
    this._headGroup.add(this._head);

    this._headShell = new Mesh(this._shellGeo, this._shellMat.clone());
    this._headShell.position.set(-10, 12, -4);
    this._headShell.scale.set(60, 70, 88);
    this._headShell.visible = false;
    this._headGroup.add(this._headShell);

    this._snout = new Mesh(this._headGeo, this._headMat.clone());
    this._snout.position.set(46, 0, 60);
    this._snout.scale.set(16, 12, 30);
    this._snout.visible = false;
    this._headGroup.add(this._snout);

    this._upperJaw = new Mesh(this._headGeo, this._jawMat.clone());
    this._upperJaw.position.set(56, 10, 58);
    this._upperJaw.scale.set(28, 10, 52);
    this._headGroup.add(this._upperJaw);

    this._lowerJaw = new Mesh(this._headGeo, this._jawMat.clone());
    this._lowerJaw.position.set(56, -10, 58);
    this._lowerJaw.scale.set(28, 10, 50);
    this._headGroup.add(this._lowerJaw);

    this._headBelly = new Mesh(this._headGeo, this._bellyMat.clone());
    this._headBelly.position.set(12, -16, 18);
    this._headBelly.scale.set(58, 24, 80);
    this._headBelly.visible = false;
    this._headGroup.add(this._headBelly);

    this._buildHeadFins();
    this._buildMandibles();
    this._buildHeadDetails();
    this._buildMouthDetails();
    this._buildFluidBody();

    this._eyeLeft = new Mesh(this._headGeo, this._glowMat);
    this._eyeLeft.position.set(24, 18, 52);
    this._eyeLeft.scale.set(4.5, 4.5, 2.8);
    this._eyeLeft.visible = false;
    this._headGroup.add(this._eyeLeft);

    this._eyeRight = this._eyeLeft.clone();
    this._eyeRight.position.y = -19;
    this._eyeRight.visible = false;
    this._headGroup.add(this._eyeRight);

    this._mouthRing = new Mesh(this._mouthGeo, new MeshBasicMaterial({
      color: 0xffa347,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: AdditiveBlending,
    }));
    this._headGroup.add(this._mouthRing);

    this._mouthCore = new Mesh(this._headGeo, this._furnaceMat.clone());
    this._mouthCore.position.set(62, 0, 74);
    this._mouthCore.scale.set(12, 12, 18);
    this._headGroup.add(this._mouthCore);

    this._mouthHalo = new Mesh(this._headGeo, makeGlowMaterial(0xffc86a, 0.3));
    this._mouthHalo.position.copy(this._mouthCore.position);
    this._mouthHalo.scale.set(18, 18, 25);
    this._headGroup.add(this._mouthHalo);

    this._buildSeal();

    for (let i = 0; i < this.config.SEGMENTS; i++) {
      this._segmentPositions.push(new Vector3());
      this._prevSegmentPositions.push(new Vector3());
      if (i === 0) continue;

      const node = this._buildSegmentNode(i);
      this._segmentNodes.push(node);
      this.group.add(node.group);
    }

    this._buildBridges();
    this._buildWeakSpots();
    this._buildBrood();
    this.applyDebugState(WORLDEATER_DEV_PRESET);
    this.update(0.016);
    this._debugDefaults = this.getDebugState();
  }

  _configureCinematicIntro({ wormholePos, targetPos } = {}) {
    const center = targetPos?.clone?.() ?? this.config.center.clone();
    const fallback = new Vector3(...(this.config.INTRO_WORMHOLE_POS ?? [900, 220, -900]));
    const wormhole = wormholePos?.clone?.() ?? center.clone().add(fallback);
    const toCenter = center.clone().sub(wormhole);
    if (toCenter.lengthSq() < 0.001) toCenter.set(1, 0, 0);
    toCenter.normalize();
    const radial = wormhole.clone().sub(center);
    if (radial.lengthSq() < 0.001) radial.set(1, 0, 0);
    const entryAngle = Math.atan2(radial.z, radial.x) + (this.config.INTRO_ENTRY_ANGLE_OFFSET ?? 0);
    const introRadius = this.config.INTRO_ORBIT_RADIUS ?? this.config.ORBIT_RADIUS;
    const entry = this._getOrbitPos(entryAngle, new Vector3(), introRadius);
    const approachDist = Math.max(1, wormhole.distanceTo(entry));
    const lift = this.config.INTRO_CURVE_LIFT ?? 120;
    const orbitDirection = this.config.INTRO_ORBIT_DIRECTION < 0 ? -1 : 1;
    this._getOrbitPos(entryAngle + orbitDirection * 0.025, _posA, introRadius);
    _delta.subVectors(_posA, entry);
    if (_delta.lengthSq() < 0.001) _delta.copy(toCenter);
    _delta.normalize();

    this._intro.wormholePos.copy(wormhole);
    this._intro.exitDir.copy(toCenter);
    this._intro.controlA.copy(wormhole)
      .addScaledVector(toCenter, approachDist * 0.34)
      .add(new Vector3(0, lift, 0));
    this._intro.controlB.copy(entry)
      .addScaledVector(_delta, -approachDist * 0.24);
    this._intro.entry.copy(entry);
    this._intro.entryAngle = entryAngle;
    this._intro.orbitDirection = orbitDirection;
    this._intro.approachLength = this._measureIntroApproachLength();
  }

  startCinematicIntro({ wormholePos, targetPos } = {}) {
    this._configureCinematicIntro({ wormholePos, targetPos });

    this._intro.active = true;
    this._intro.time = 0;
    this._intro.coilBlend = 0;
    this._intro.orbitTime = 0;
    this._sealResumeBlend = 1;
    this._sealResumeTime = this._sealResumeDuration;
    for (const spot of this._weakSpots) {
      this._restoreWeakSpotMaterials(spot);
      if (spot.sleeve) spot.sleeve.visible = false;
    }
    for (const brood of this._brood) brood.group.visible = false;
    this._time = 0;
  }

  previewCinematicIntro({ wormholePos, targetPos } = {}) {
    this._configureCinematicIntro({ wormholePos, targetPos });
  }

  finishCinematicIntro() {
    if (!this._intro) return;
    this._intro.active = false;
    this._intro.coilBlend = 1;
    this._sealResumeBlend = 1;
    this._sealResumeTime = this._sealResumeDuration;
    this._time = this._intro.orbitTime || this._time;
    for (const spot of this._weakSpots) {
      if (!spot.broken) this._applyWeakSpotMaterials(spot);
    }
    for (const brood of this._brood) brood.group.visible = true;
    this.update(0);
  }

  getHeadPosition(out = new Vector3()) {
    if (this._segmentPositions[0]) return out.copy(this._segmentPositions[0]);
    return out.copy(this.config.center);
  }

  getCinematicIntroState() {
    return {
      active: this._intro.active,
      progress: clamp01(this._intro.time / Math.max(0.001, this._intro.duration)),
      coilBlend: this._intro.coilBlend,
      wormholePos: this._intro.wormholePos.clone(),
    };
  }

  getCinematicIntroPathPoints(samples = 96) {
    const count = Math.max(8, samples | 0);
    const points = [];
    for (let i = 0; i <= count; i++) {
      points.push(this._sampleIntroHeadAtRaw(i / count, new Vector3()));
    }
    return points;
  }

  setCinematicIntroProgress(progress = 0) {
    const wasActive = this._intro.active;
    this._intro.active = true;
    this._intro.time = clamp01(progress) * Math.max(0.001, this._intro.duration);
    this._intro.orbitTime = this._intro.time;
    this._updateIntroPose(0);
    this._intro.active = wasActive;
  }

  getDebugState() {
    return {
      headScaleX: this._head.scale.x,
      headScaleY: this._head.scale.y,
      headScaleZ: this._head.scale.z,
      headOffsetX: this._head.position.x,
      headOffsetY: this._head.position.y,
      headOffsetZ: this._head.position.z,
      headRotateY: this._head.rotation.y,
      neckScaleX: this._neckMantle.scale.x,
      neckScaleY: this._neckMantle.scale.y,
      neckScaleZ: this._neckMantle.scale.z,
      neckPosX: this._neckMantle.position.x,
      neckPosY: this._neckMantle.position.y,
      neckPosZ: this._neckMantle.position.z,
      bodyRadiusMul: this._debugTuning.bodyRadiusMul,
      bodyTexRepeatX: this._tubeTex.repeat.x,
      bodyTexRepeatY: this._tubeTex.repeat.y,
      headTexRepeatX: this._headMat.map?.repeat.x ?? 1,
      headTexRepeatY: this._headMat.map?.repeat.y ?? 1,
      headTexOffsetX: this._headMat.map?.offset.x ?? 0,
      headTexOffsetY: this._headMat.map?.offset.y ?? 0,
      bodyColor: colorToHex(this._tubeBodyMat.color),
      bodyEmissive: colorToHex(this._tubeBodyMat.emissive),
      bodyEmissiveIntensity: this._tubeBodyMat.emissiveIntensity,
      bodyRoughness: this._tubeBodyMat.roughness,
      bodyMetalness: this._tubeBodyMat.metalness,
      neckColor: colorToHex(this._neckBodyMat.color),
      neckEmissive: colorToHex(this._neckBodyMat.emissive),
      neckEmissiveIntensity: this._neckBodyMat.emissiveIntensity,
      neckRoughness: this._neckBodyMat.roughness,
      neckMetalness: this._neckBodyMat.metalness,
      tailRadiusMul: this._debugTuning.tailRadiusMul,
      tailScaleY: this._debugTuning.tailScaleY,
      tailScaleZ: this._debugTuning.tailScaleZ,
      headEmissive: colorToHex(this._headMat.emissive),
      headEmissiveIntensity: this._headMat.emissiveIntensity,
      headRoughness: this._headMat.roughness,
      headMetalness: this._headMat.metalness,
      weakSpotScaleMul: this._debugTuning.weakSpotScaleMul,
      weakSpotHitMul: this._debugTuning.weakSpotHitMul,
      weakSpotColor: colorToHex(this._weakSleeveMat.color),
      weakSpotEmissive: colorToHex(this._weakSleeveMat.emissive),
      weakSpotEmissiveIntensity: this._weakSleeveMat.emissiveIntensity,
      weakSpotOpacity: this._weakSleeveMat.opacity,
      broodScaleX: this._debugTuning.broodScaleX,
      broodScaleY: this._debugTuning.broodScaleY,
      broodScaleZ: this._debugTuning.broodScaleZ,
    };
  }

  resetDebugState() {
    if (this._debugDefaults) this.applyDebugState(this._debugDefaults);
  }

  applyDebugState(params = {}) {
    if ('headScaleX' in params) this._head.scale.x = params.headScaleX;
    if ('headScaleY' in params) this._head.scale.y = params.headScaleY;
    if ('headScaleZ' in params) this._head.scale.z = params.headScaleZ;
    if ('headOffsetX' in params) this._head.position.x = params.headOffsetX;
    if ('headOffsetY' in params) this._head.position.y = params.headOffsetY;
    if ('headOffsetZ' in params) this._head.position.z = params.headOffsetZ;
    if ('headRotateY' in params) this._head.rotation.y = params.headRotateY;

    if ('neckScaleX' in params) this._neckMantle.scale.x = params.neckScaleX;
    if ('neckScaleY' in params) this._neckMantle.scale.y = params.neckScaleY;
    if ('neckScaleZ' in params) this._neckMantle.scale.z = params.neckScaleZ;
    if ('neckPosX' in params) this._neckMantle.position.x = params.neckPosX;
    if ('neckPosY' in params) this._neckMantle.position.y = params.neckPosY;
    if ('neckPosZ' in params) this._neckMantle.position.z = params.neckPosZ;

    if ('bodyRadiusMul' in params) this._debugTuning.bodyRadiusMul = params.bodyRadiusMul;
    if ('weakSpotScaleMul' in params) this._debugTuning.weakSpotScaleMul = params.weakSpotScaleMul;
    if ('weakSpotHitMul' in params) this._debugTuning.weakSpotHitMul = params.weakSpotHitMul;
    if ('tailRadiusMul' in params) this._debugTuning.tailRadiusMul = params.tailRadiusMul;
    if ('tailScaleY' in params) this._debugTuning.tailScaleY = params.tailScaleY;
    if ('tailScaleZ' in params) this._debugTuning.tailScaleZ = params.tailScaleZ;
    if ('broodScaleX' in params) this._debugTuning.broodScaleX = params.broodScaleX;
    if ('broodScaleY' in params) this._debugTuning.broodScaleY = params.broodScaleY;
    if ('broodScaleZ' in params) this._debugTuning.broodScaleZ = params.broodScaleZ;

    if ('bodyTexRepeatX' in params) this._tubeTex.repeat.x = params.bodyTexRepeatX;
    if ('bodyTexRepeatY' in params) this._tubeTex.repeat.y = params.bodyTexRepeatY;

    if (this._headMat.map) {
      if ('headTexRepeatX' in params) this._headMat.map.repeat.x = params.headTexRepeatX;
      if ('headTexRepeatY' in params) this._headMat.map.repeat.y = params.headTexRepeatY;
      if ('headTexOffsetX' in params) this._headMat.map.offset.x = params.headTexOffsetX;
      if ('headTexOffsetY' in params) this._headMat.map.offset.y = params.headTexOffsetY;
    }

    if ('bodyColor' in params) {
      this._tubeBodyMat.color.set(params.bodyColor);
      this._neckBodyMat.color.set(params.bodyColor);
    }
    if ('bodyEmissive' in params) {
      this._tubeBodyMat.emissive.set(params.bodyEmissive);
      this._neckBodyMat.emissive.set(params.bodyEmissive);
    }
    if ('bodyEmissiveIntensity' in params) {
      this._tubeBodyMat.emissiveIntensity = params.bodyEmissiveIntensity;
      this._neckBodyMat.emissiveIntensity = params.bodyEmissiveIntensity;
    }
    if ('bodyRoughness' in params) {
      this._tubeBodyMat.roughness = params.bodyRoughness;
      this._neckBodyMat.roughness = params.bodyRoughness;
    }
    if ('bodyMetalness' in params) {
      this._tubeBodyMat.metalness = params.bodyMetalness;
      this._neckBodyMat.metalness = params.bodyMetalness;
    }
    this._tubeBodyMat.needsUpdate = true;
    this._neckBodyMat.map = this._tubeTex;
    this._neckBodyMat.emissiveMap = this._tubeTex;
    this._neckBodyMat.needsUpdate = true;

    if ('neckColor' in params) this._neckBodyMat.color.set(params.neckColor);
    if ('neckEmissive' in params) this._neckBodyMat.emissive.set(params.neckEmissive);
    if ('neckEmissiveIntensity' in params) this._neckBodyMat.emissiveIntensity = params.neckEmissiveIntensity;
    if ('neckRoughness' in params) this._neckBodyMat.roughness = params.neckRoughness;
    if ('neckMetalness' in params) this._neckBodyMat.metalness = params.neckMetalness;
    this._neckBodyMat.map = this._tubeTex;
    this._neckBodyMat.emissiveMap = this._tubeTex;
    this._neckBodyMat.needsUpdate = true;

    if ('headEmissive' in params) this._headMat.emissive.set(params.headEmissive);
    if ('headEmissiveIntensity' in params) this._headMat.emissiveIntensity = params.headEmissiveIntensity;
    if ('headRoughness' in params) this._headMat.roughness = params.headRoughness;
    if ('headMetalness' in params) this._headMat.metalness = params.headMetalness;
    this._headMat.needsUpdate = true;

    if ('weakSpotColor' in params) this._weakSleeveMat.color.set(params.weakSpotColor);
    if ('weakSpotEmissive' in params) this._weakSleeveMat.emissive.set(params.weakSpotEmissive);
    if ('weakSpotEmissiveIntensity' in params) this._weakSleeveMat.emissiveIntensity = params.weakSpotEmissiveIntensity;
    if ('weakSpotOpacity' in params) this._weakSleeveMat.opacity = params.weakSpotOpacity;
    this._weakSleeveMat.needsUpdate = true;

    for (const spot of this._weakSpots) {
      if (!spot.sleeve) continue;
      spot.sleeve.material.color.copy(this._weakSleeveMat.color);
      spot.sleeve.material.emissive.copy(this._weakSleeveMat.emissive);
      spot.sleeve.material.emissiveIntensity = this._weakSleeveMat.emissiveIntensity;
      spot.sleeve.material.opacity = this._weakSleeveMat.opacity;
      spot.sleeve.material.roughness = this._weakSleeveMat.roughness;
      spot.sleeve.material.metalness = this._weakSleeveMat.metalness;
      spot.sleeve.material.needsUpdate = true;
    }

    for (const brood of this._brood) {
      brood.group.scale.set(
        this._debugTuning.broodScaleX,
        this._debugTuning.broodScaleY,
        this._debugTuning.broodScaleZ,
      );
    }
  }

  _buildHeadFins() {
    this._crest = [];
  }

  _buildMandibles() {
    this._mandibles = [];
    for (const side of [-1, 1]) {
      const outer = new Mesh(this._mandibleGeo, this._jawMat.clone());
      outer.position.set(58, side * 20, 68);
      outer.rotation.z = side * (Math.PI / 2 - 0.16);
      outer.rotation.x = side * -0.08;
      outer.scale.set(4.8, 12.5, 4.5);
      outer.visible = false;
      this._headGroup.add(outer);
      this._mandibles.push(outer);

      const inner = new Mesh(this._mandibleGeo, this._jawMat.clone());
      inner.position.set(60, side * 11, 71);
      inner.rotation.z = side * (Math.PI / 2 - 0.22);
      inner.rotation.x = side * 0.04;
      inner.scale.set(3.8, 9.5, 3.8);
      inner.visible = false;
      this._headGroup.add(inner);
      this._mandibles.push(inner);
    }
  }

  _buildMouthDetails() {
    this._mouthDetails = [];
    this._fangs = [];

    const addMouthDetail = (material, position, scale, rotation = {}) => {
      const mesh = new Mesh(this._headGeo, material.clone ? material.clone() : material);
      mesh.position.copy(position);
      mesh.scale.copy(scale);
      mesh.rotation.x = rotation.x ?? 0;
      mesh.rotation.y = rotation.y ?? 0;
      mesh.rotation.z = rotation.z ?? 0;
      this._headGroup.add(mesh);
      this._mouthDetails.push(mesh);
      return mesh;
    };

    this._mouthSocket = new Mesh(this._mawRingGeo, this._jawMat.clone());
    this._mouthSocket.position.set(60, 0, 66);
    this._mouthSocket.rotation.x = Math.PI / 2;
    this._mouthSocket.scale.set(15, 15, 18);
    this._headGroup.add(this._mouthSocket);
    this._mouthDetails.push(this._mouthSocket);
    this._mouthSocket.material.color.set(0x12070c);
    this._mouthSocket.material.emissive.set(0x4c190d);
    this._mouthSocket.visible = false;

    this._mouthRimUpper = addMouthDetail(
      this._headMat,
      new Vector3(61, 8.5, 70),
      new Vector3(12, 5.5, 16),
      { x: -0.1 },
    );

    this._mouthRimLower = addMouthDetail(
      this._headMat,
      new Vector3(61, -8.5, 70),
      new Vector3(12, 5.5, 16),
      { x: 0.1 },
    );

    this._throatShell = new Mesh(this._mawCoreGeo, this._jawMat.clone());
    this._throatShell.position.set(64, 0, 76);
    this._throatShell.rotation.x = Math.PI / 2;
    this._throatShell.scale.set(9.5, 9.5, 13);
    this._headGroup.add(this._throatShell);
    this._mouthDetails.push(this._throatShell);
    this._throatShell.material.color.set(0x1a0906);
    this._throatShell.material.emissive.set(0x702110);
    this._throatShell.visible = false;

    this._throatGlow = new Mesh(this._mawCoreGeo, this._furnaceMat.clone());
    this._throatGlow.position.set(66, 0, 80);
    this._throatGlow.rotation.x = Math.PI / 2;
    this._throatGlow.scale.set(7, 7, 10);
    this._headGroup.add(this._throatGlow);
    this._mouthDetails.push(this._throatGlow);
    this._throatGlow.visible = false;

    const fangSpecs = [
      { x: 63, y: 6.5, z: 76, side: 1, size: 3.6 },
      { x: 63, y: -6.5, z: 76, side: -1, size: 3.6 },
      { x: 58, y: 10.5, z: 71, side: 1, size: 2.4 },
      { x: 58, y: -10.5, z: 71, side: -1, size: 2.4 },
    ];

    for (const spec of fangSpecs) {
      const fang = new Mesh(this._mandibleGeo, this._toothMat.clone());
      fang.position.set(spec.x, spec.y, spec.z);
      fang.rotation.z = spec.side > 0 ? 0.72 : -0.72;
      fang.rotation.x = spec.side > 0 ? -0.2 : 0.2;
      fang.scale.set(1.6, spec.size, 1.4);
      this._headGroup.add(fang);
      this._fangs.push(fang);
    }

    this._mouthRimUpper.visible = false;
    this._mouthRimLower.visible = false;
    for (const fang of this._fangs) fang.visible = false;
  }

  _buildFluidBody() {
    this._bodyCurve = new CatmullRomCurve3([
      new Vector3(),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, 2),
      new Vector3(0, 0, 3),
    ], false, 'catmullrom', 0.5);

    this._bodyTubeSegments = 96;
    this._bodyTubeRadialSegments = 18;
    this._tubeFrameNormals = [];
    this._tubeFrameBinormals = [];
    this._tubeFrameTangents = [];
    this._bodyTubeGeo = this._createBodyTubeGeometry(this._bodyTubeSegments, this._bodyTubeRadialSegments);
    this._bodyTube = new Mesh(
      this._bodyTubeGeo,
      this._tubeBodyMat,
    );
    this.group.add(this._bodyTube);

    this._tailCap = new Mesh(this._headGeo, this._tubeBodyMat);
    this.group.add(this._tailCap);
  }

  _createBodyTubeGeometry(tubularSegments, radialSegments) {
    const geometry = new BufferGeometry();
    const ringCount = tubularSegments + 1;
    const vertexCount = ringCount * (radialSegments + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];

    for (let i = 0; i < ringCount; i++) {
      const u = tubularSegments > 0 ? i / tubularSegments : 0;
      for (let j = 0; j <= radialSegments; j++) {
        const v = radialSegments > 0 ? j / radialSegments : 0;
        const idx = i * (radialSegments + 1) + j;
        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = v;
      }
    }

    for (let i = 0; i < tubularSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = (i + 1) * (radialSegments + 1) + j;
        const c = b + 1;
        const d = a + 1;
        indices.push(a, d, b, b, d, c);
      }
    }

    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(new Uint16BufferAttribute(indices, 1));
    return geometry;
  }

  _updateBodyTubeGeometry(points, radius) {
    if (!this._bodyTubeGeo || points.length < 2) return;

    const tubularSegments = this._bodyTubeSegments;
    const radialSegments = this._bodyTubeRadialSegments;
    const safeRadius = Number.isFinite(radius) && radius > 0
      ? radius
      : this.config.BODY_RADIUS;
    const positions = this._bodyTubeGeo.attributes.position.array;
    const normals = this._bodyTubeGeo.attributes.normal.array;
    const ringCount = tubularSegments + 1;
    const lastPoint = points.length - 1;

    this._tubeFrameNormals.length = ringCount;
    this._tubeFrameBinormals.length = ringCount;
    this._tubeFrameTangents.length = ringCount;

    for (let i = 0; i < ringCount; i++) {
      const sample = tubularSegments > 0 ? i / tubularSegments : 0;
      const scaled = sample * lastPoint;
      const base = Math.floor(scaled);
      const next = Math.min(lastPoint, base + 1);
      const alpha = scaled - base;

      const point = _posA.copy(points[base]).lerp(points[next], alpha);
      if (!isFiniteVec3(point)) {
        const fallbackPoint = points[Math.max(0, Math.min(lastPoint, base))];
        point.copy(isFiniteVec3(fallbackPoint) ? fallbackPoint : this.config.center);
      }
      const prevPoint = points[Math.max(0, base - 1)];
      const aheadPoint = points[Math.min(lastPoint, next + 1)];
      const prev = _posB.copy(isFiniteVec3(prevPoint) ? prevPoint : point);
      const ahead = _posC.copy(isFiniteVec3(aheadPoint) ? aheadPoint : point);
      _frameTangent.subVectors(ahead, prev);
      if (_frameTangent.lengthSq() < 1e-6) {
        _frameTangent.subVectors(points[next], points[base]);
      }
      if (_frameTangent.lengthSq() < 1e-6) {
        _frameTangent.set(0, 0, 1);
      }
      _frameTangent.normalize();
      if (!isFiniteVec3(_frameTangent)) _frameTangent.set(0, 0, 1);

      if (i === 0 || !this._tubeFrameNormals[i - 1]) {
        _frameNormal.copy(_up).cross(_frameTangent);
        if (_frameNormal.lengthSq() < 1e-6) _frameNormal.set(1, 0, 0).cross(_frameTangent);
        _frameNormal.normalize();
        if (!isFiniteVec3(_frameNormal) || _frameNormal.lengthSq() < 1e-6) _frameNormal.set(1, 0, 0);
      } else {
        _frameNormal.copy(this._tubeFrameNormals[i - 1]);
        const prevTangent = this._tubeFrameTangents[i - 1];
        _frameAxis.crossVectors(prevTangent, _frameTangent);
        if (_frameAxis.lengthSq() > 1e-8) {
          _frameAxis.normalize();
          const dot = Math.max(-1, Math.min(1, prevTangent.dot(_frameTangent)));
          _frameNormal.applyAxisAngle(_frameAxis, Math.acos(dot));
        }
        _frameNormal.addScaledVector(_frameTangent, -_frameNormal.dot(_frameTangent));
        if (_frameNormal.lengthSq() < 1e-6) {
          _frameNormal.copy(_up).cross(_frameTangent);
          if (_frameNormal.lengthSq() < 1e-6) _frameNormal.set(1, 0, 0).cross(_frameTangent);
        }
        _frameNormal.normalize();
        if (!isFiniteVec3(_frameNormal) || _frameNormal.lengthSq() < 1e-6) _frameNormal.set(1, 0, 0);
      }

      _frameBinormal.crossVectors(_frameTangent, _frameNormal).normalize();
      if (!isFiniteVec3(_frameBinormal) || _frameBinormal.lengthSq() < 1e-6) {
        _frameBinormal.set(0, 1, 0).cross(_frameTangent).normalize();
      }
      if (!isFiniteVec3(_frameBinormal) || _frameBinormal.lengthSq() < 1e-6) _frameBinormal.set(0, 1, 0);

      if (!this._tubeFrameNormals[i]) this._tubeFrameNormals[i] = new Vector3();
      if (!this._tubeFrameBinormals[i]) this._tubeFrameBinormals[i] = new Vector3();
      if (!this._tubeFrameTangents[i]) this._tubeFrameTangents[i] = new Vector3();
      this._tubeFrameNormals[i].copy(_frameNormal);
      this._tubeFrameBinormals[i].copy(_frameBinormal);
      this._tubeFrameTangents[i].copy(_frameTangent);

      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        _ringVertex.copy(point)
          .addScaledVector(this._tubeFrameNormals[i], cos * safeRadius)
          .addScaledVector(this._tubeFrameBinormals[i], sin * safeRadius);
        if (!isFiniteVec3(_ringVertex)) {
          _ringVertex.copy(point);
        }

        const idx = i * (radialSegments + 1) + j;
        const pOffset = idx * 3;
        positions[pOffset] = _ringVertex.x;
        positions[pOffset + 1] = _ringVertex.y;
        positions[pOffset + 2] = _ringVertex.z;
        normals[pOffset] = this._tubeFrameNormals[i].x * cos + this._tubeFrameBinormals[i].x * sin;
        normals[pOffset + 1] = this._tubeFrameNormals[i].y * cos + this._tubeFrameBinormals[i].y * sin;
        normals[pOffset + 2] = this._tubeFrameNormals[i].z * cos + this._tubeFrameBinormals[i].z * sin;
      }
    }

    this._bodyTubeGeo.attributes.position.needsUpdate = true;
    this._bodyTubeGeo.attributes.normal.needsUpdate = true;
    this._bodyTubeGeo.computeBoundingSphere();
  }

  _buildHeadDetails() {
    this._headDetails = [];
    this._browRidges = [];
    this._jawFlanges = [];

    const addDetail = (material, position, scale, rotation = {}) => {
      const mesh = new Mesh(this._headGeo, material.clone());
      mesh.position.copy(position);
      mesh.scale.copy(scale);
      mesh.rotation.x = rotation.x ?? 0;
      mesh.rotation.y = rotation.y ?? 0;
      mesh.rotation.z = rotation.z ?? 0;
      this._headGroup.add(mesh);
      this._headDetails.push(mesh);
      return mesh;
    };

    this._neckMantle = addDetail(
      this._neckBodyMat,
      new Vector3(-12, 0, -18),
      new Vector3(62, 36, 76),
      { x: 0.04 },
    );
    this._neckMantle.material.dispose();
    this._neckMantle.material = this._neckBodyMat;

    this._throatMantle = addDetail(
      this._bellyMat,
      new Vector3(26, 0, 34),
      new Vector3(24, 18, 36),
      { x: -0.06 },
    );
    this._throatMantle.visible = false;

    for (const side of [-1, 1]) {
      const brow = addDetail(
        this._headMat,
        new Vector3(18, side * 16, 44),
        new Vector3(16, 6.5, 26),
        { x: -0.12, z: side * -0.12 },
      );
      brow.visible = false;
      this._browRidges.push(brow);

      const cheek = addDetail(
        this._jawMat,
        new Vector3(28, side * 18, 34),
        new Vector3(18, 9, 24),
        { x: 0.08, z: side * -0.18 },
      );
      cheek.visible = false;
      this._jawFlanges.push(cheek);
    }
  }

  _buildBridges() {
    this._bridgeNodes = [];
    for (let i = 1; i < this.config.SEGMENTS; i++) {
      const bridge = this._buildBridgeNode(i);
      this._bridgeNodes.push(bridge);
      this.group.add(bridge.group);
    }
  }

  _buildBridgeNode(index) {
    const group = new Group();

    const core = new Mesh(
      this._bodyGeo,
      (index === 1 ? this._headMat : this._bodyMat).clone(),
    );
    core.visible = false;
    group.add(core);

    const belly = new Mesh(this._bodyGeo, this._bellyMat.clone());
    belly.position.set(0, -0.24, 0.05);
    belly.scale.set(0.92, 0.6, 0.94);
    belly.visible = false;
    group.add(belly);

    return { group, core, belly, index };
  }

  _getSegmentVisualRadius(index) {
    if (index === 0) return this.config.HEAD_RADIUS * 0.82;
    const taper = 1 - index / (this.config.SEGMENTS + 2);
    return this.config.BODY_RADIUS * (0.65 + taper * 0.55);
  }

  _buildSeal() {
    this._sealGroup = new Group();
    this._sealGroup.position.copy(this.config.center);
    this.group.add(this._sealGroup);

    this._sealShell = new Mesh(this._sealGeo, makeGlowMaterial(0xff6b3d, 0.2));
    this._sealShell.scale.setScalar(this.config.SEAL_RADIUS);
    this._sealGroup.add(this._sealShell);

    this._sealCore = new Mesh(this._sealGeo, new MeshBasicMaterial({
      color: 0xffa54e,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: AdditiveBlending,
    }));
    this._sealCore.scale.setScalar(this.config.SEAL_RADIUS * 0.88);
    this._sealGroup.add(this._sealCore);

    this._sealRings = [];
    for (let i = 0; i < 2; i++) {
      const ring = new Mesh(this._sealRingGeo, new MeshBasicMaterial({
        color: i === 0 ? 0xffc36a : 0xff6e52,
        transparent: true,
        opacity: 0.34 - i * 0.08,
        depthWrite: false,
        blending: AdditiveBlending,
      }));
      ring.scale.setScalar(this.config.SEAL_RADIUS * (1.6 + i * 0.42));
      ring.rotation.x = 0.55 + i * 0.6;
      ring.rotation.y = i * 0.8;
      this._sealGroup.add(ring);
      this._sealRings.push(ring);
    }
  }

  _buildWeakSpots() {
    const targetSegments = [2, 4, 7, 9].slice(0, this.config.WEAK_SPOT_COUNT);

    for (let i = 0; i < targetSegments.length; i++) {
      const segmentIndex = targetSegments[i];
      const node = this._segmentNodes[segmentIndex - 1];
      if (!node) continue;

      const baseState = {
        core: captureMaterialState(node.core.material),
        belly: captureMaterialState(node.belly.material),
        plates: node.plates.map((plate) => captureMaterialState(plate.material)),
        spines: node.spines.map((spine) => captureMaterialState(spine.material)),
      };

      const sleeve = new Mesh(this._weakSleeveGeo, this._weakSleeveMat.clone());
      this.group.add(sleeve);

      const spot = {
        node,
        segmentIndex,
        broken: false,
        breakT: 0,
        angle: (i / Math.max(1, targetSegments.length)) * Math.PI * 2,
        normal: new Vector3(1, 0, 0),
        position: new Vector3(),
        radius: this.config.WEAK_SPOT_RADIUS,
        baseState,
        sleeve,
      };
      this._applyWeakSpotMaterials(spot);
      this._weakSpots.push(spot);
    }
  }

  _applyWeakSpotMaterials(spot) {
    const { node } = spot;
    node.core.material.map = this._weakSkinTex;
    node.core.material.emissiveMap = this._weakSkinTex;
    node.core.material.color.set(0xfff1cc);
    node.core.material.emissive.set(0xffbf52);
    node.core.material.roughness = 0.42;
    node.core.material.metalness = 0.04;

    node.belly.material.map = this._weakBellyTex;
    node.belly.material.emissiveMap = this._weakBellyTex;
    node.belly.material.color.set(0xffe3b0);
    node.belly.material.emissive.set(0xffc96a);
    node.belly.material.roughness = 0.36;

    for (const plate of node.plates) {
      plate.material.map = this._weakPlateTex;
      plate.material.emissiveMap = this._weakPlateTex;
      plate.material.color.set(0xffefbf);
      plate.material.emissive.set(0xffcd73);
      plate.material.roughness = 0.48;
    }

    for (const spine of node.spines) {
      spine.material.color.set(0xfff6d6);
      spine.material.opacity = 0.48;
    }
  }

  _restoreWeakSpotMaterials(spot) {
    applyMaterialState(spot.node.core.material, spot.baseState.core);
    applyMaterialState(spot.node.belly.material, spot.baseState.belly);
    for (let i = 0; i < spot.node.plates.length; i++) {
      applyMaterialState(spot.node.plates[i].material, spot.baseState.plates[i]);
    }
    for (let i = 0; i < spot.node.spines.length; i++) {
      applyMaterialState(spot.node.spines[i].material, spot.baseState.spines[i]);
    }
  }

  _resetWeakSpots() {
    for (let i = 0; i < this._weakSpots.length; i++) {
      const spot = this._weakSpots[i];
      spot.broken = false;
      spot.breakT = 0;
      spot.angle = (i / Math.max(1, this._weakSpots.length)) * Math.PI * 2;
      spot.normal.set(1, 0, 0);
      this._applyWeakSpotMaterials(spot);
      if (spot.sleeve) spot.sleeve.visible = true;
    }
    this._weakSpotsRemaining = this.config.WEAK_SPOT_COUNT;
  }

  _resetToSealed() {
    this._phase = 'sealed';
    this._phaseTime = 0;
    this._openBlend = 0;
    this._mouthOpen = 0;
    this._resetTimer = this.config.RESET_WINDOW_SECONDS;
    this._sealResumeStartTime = this._time;
    this._sealResumeBlend = 0;
    this._sealResumeTime = 0;
    this._resetWeakSpots();
    eventBus.emit(Events.WORLDEATER_RESET, {
      total: this.config.WEAK_SPOT_COUNT,
      remaining: this._weakSpotsRemaining,
    });
  }

  _buildSegmentNode(index) {
    const group = new Group();

    const core = new Mesh(this._bodyGeo, this._bodyMat.clone());
    core.visible = false;
    group.add(core);

    const belly = new Mesh(this._bodyGeo, this._bellyMat.clone());
    belly.position.set(0.02, -0.28, 0.08);
    belly.scale.set(0.92, 0.64, 0.96);
    belly.visible = false;
    group.add(belly);

    const shell = new Mesh(this._shellGeo, this._shellMat.clone());
    shell.scale.setScalar(1.14);
    shell.visible = false;
    group.add(shell);

    const fin = new Mesh(this._finGeo, this._finMat.clone());
    fin.rotation.y = Math.PI / 2;
    fin.visible = false;
    group.add(fin);

    const spines = [];
    const plates = [];

    return { group, core, belly, shell, fin, spines, plates, index };
  }

  _buildBrood() {
    for (let i = 0; i < 5; i++) {
      const group = new Group();

      const head = new Mesh(this._bodyGeo, this._headMat.clone());
      head.scale.set(14, 10, 20);
      group.add(head);

      const shell = new Mesh(this._shellGeo, this._shellMat.clone());
      shell.scale.set(17, 12, 24);
      shell.visible = false;
      group.add(shell);

      const belly = new Mesh(this._bodyGeo, this._bellyMat.clone());
      belly.position.set(0, -2.6, 1.2);
      belly.scale.set(12, 5.5, 18);
      group.add(belly);

      const tail = [];
      for (let j = 0; j < 4; j++) {
        const body = new Mesh(this._bodyGeo, this._bodyMat.clone());
        body.position.set(-12 - j * 9, 0, 0);
        const s = 12 - j * 1.8;
        body.scale.set(s, s * 0.75, s * 0.95);
        body.visible = false;
        group.add(body);
        tail.push(body);
      }

      const fin = new Mesh(this._finGeo, this._finMat.clone());
      fin.scale.setScalar(7);
      fin.rotation.y = Math.PI / 2;
      fin.visible = false;
      group.add(fin);

      const plates = [];

      this.group.add(group);
      const phase = (i / 5) * Math.PI * 2;
      this._brood.push({
        group,
        head,
        shell,
        belly,
        tail,
        fin,
        plates,
        phase,
        radiusX: 150 + i * 32,
        radiusZ: 116 + i * 28,
        speed: 0.12 + i * 0.028,
        height: -38 + i * 14,
        tiltAxis: new Vector3(
          Math.cos(phase * 1.7 + 0.3),
          0,
          Math.sin(phase * 1.3 + 1.1),
        ).normalize(),
        tilt: 0.18 + i * 0.08,
        wobbleAmp: 14 + i * 3.5,
        wobbleRate: 0.32 + i * 0.08,
        bobAmp: 10 + i * 2.5,
        bobRate: 0.44 + i * 0.07,
        loiterAmp: 0.18 + i * 0.03,
        lead: 0.12 + i * 0.02,
        roll: 0.1 + i * 0.03,
      });
    }
  }

  _getSealedPosAt(index, time, out) {
    const center = this.config.center;
    const turn = index / Math.max(1, this.config.SEGMENTS - 1);
    const angle = 1.2 + turn * Math.PI * 1.9 - time * 0.42;
    const radius = this.config.SEALED_RING_RADIUS - turn * 30 + Math.sin(time * 1.8 + index * 0.45) * 8;
    const y = center.y
      + Math.sin(angle * 1.6 + index * 0.35) * (this.config.SEALED_RING_HEIGHT - turn * 10)
      + Math.cos(time * 1.2 + index) * 6;
    return out.set(
      center.x + Math.cos(angle) * radius,
      y,
      center.z + Math.sin(angle) * radius * 0.74,
    );
  }

  _getSealedPos(index, out) {
    return this._getSealedPosAt(index, this._time, out);
  }

  _sampleIntroHead(t, out) {
    const mt = 1 - t;
    out.copy(this._intro.wormholePos).multiplyScalar(mt * mt * mt);
    out.addScaledVector(this._intro.controlA, 3 * mt * mt * t);
    out.addScaledVector(this._intro.controlB, 3 * mt * t * t);
    out.addScaledVector(this._intro.entry, t * t * t);
    return out;
  }

  _measureIntroApproachLength(samples = 28) {
    let length = 0;
    this._sampleIntroHead(0, _introPrev);
    for (let i = 1; i <= samples; i++) {
      this._sampleIntroHead(i / samples, _introHeadPos);
      length += _introHeadPos.distanceTo(_introPrev);
      _introPrev.copy(_introHeadPos);
    }
    return Math.max(1, length);
  }

  _getIntroOrbitBlendRange() {
    const start = Math.max(0.02, this._intro.approachEnd - 0.08);
    const endLimit = Math.max(start + 0.08, (this.config.INTRO_SEAL_BLEND_START ?? 0.9) - 0.04);
    const end = Math.min(endLimit, this._intro.approachEnd + 0.08);
    return { start, end: Math.max(start + 0.08, end) };
  }

  _sampleIntroOrbitHead(progress, out) {
    const { start } = this._getIntroOrbitBlendRange();
    const orbitSeconds = Math.max(0, progress - start) * this._intro.duration;
    const phase = this._intro.entryAngle
      + this._intro.orbitDirection * orbitSeconds * (Math.PI * 2 / this.config.CYCLE_SECONDS);
    const introRadius = this.config.INTRO_ORBIT_RADIUS ?? this.config.ORBIT_RADIUS;
    return this._getOrbitPos(phase, out, introRadius);
  }

  _sampleIntroMotionHeadAtRaw(raw, out) {
    const progress = clamp01(raw);
    const approachEnd = Math.max(0.0001, this._intro.approachEnd);
    const { start, end } = this._getIntroOrbitBlendRange();
    if (progress <= 0) return out.copy(this._intro.wormholePos);

    if (progress < approachEnd) {
      this._sampleIntroHead(progress / approachEnd, out);
    } else {
      this._sampleIntroHead(1, out);
    }

    const orbitBlend = smoothstep(start, end, progress);
    if (orbitBlend > 0) {
      this._sampleIntroOrbitHead(progress, _posA);
      out.lerp(_posA, orbitBlend);
    }
    return out;
  }

  _sampleIntroBodyAtRaw(raw, out) {
    if (raw >= 0) return this._sampleIntroMotionHeadAtRaw(raw, out);

    const approachSpeedPerRaw = this._intro.approachLength / Math.max(0.0001, this._intro.approachEnd);
    const backtrack = Math.abs(raw) * Math.max(approachSpeedPerRaw, 1);
    return out.copy(this._intro.wormholePos).addScaledVector(this._intro.exitDir, -backtrack);
  }

  _sampleIntroHeadAtRaw(raw, out) {
    const progress = clamp01(raw);
    this._sampleIntroMotionHeadAtRaw(progress, out);
    const sealBlendStart = this.config.INTRO_SEAL_BLEND_START ?? 0.68;
    const sealBlend = smoothstep(sealBlendStart, 1, progress);
    if (sealBlend > 0) {
      this._getSealedPosAt(0, this._time, _posB);
      out.lerp(_posB, sealBlend);
    }
    return out;
  }

  _updateSeal(dt) {
    this._sealPulse += dt;
    const openness = this._openBlend;
    const active = 1 - openness;

    this._sealGroup.visible = active > 0.01;
    this._sealCore.material.opacity = 0.1 + active * (0.08 + Math.sin(this._sealPulse * 4) * 0.04);
    this._sealShell.material.opacity = 0.08 + active * 0.18;
    this._sealShell.scale.setScalar(this.config.SEAL_RADIUS * (1 + Math.sin(this._sealPulse * 3.2) * 0.03));

    for (let i = 0; i < this._sealRings.length; i++) {
      const ring = this._sealRings[i];
      ring.rotation.z += dt * (0.55 + i * 0.2) * (i === 0 ? 1 : -1);
      ring.material.opacity = active * (0.18 + Math.sin(this._sealPulse * (2.5 + i) + i) * 0.08);
      const scale = this.config.SEAL_RADIUS * (1.55 + i * 0.45 + Math.sin(this._sealPulse * (1.8 + i)) * 0.04);
      ring.scale.setScalar(scale);
    }
  }

  _updateWeakSpots(dt) {
    const t = this._time;
    for (const spot of this._weakSpots) {
      const node = spot.node;
      const nodeScale = node.group.scale.x || 1;
      const worldPos = this._segmentPositions[spot.segmentIndex];
      if (worldPos) spot.position.copy(worldPos);

      if (spot.broken) {
        if (spot.sleeve) spot.sleeve.visible = false;
        continue;
      }

      const pulse = 0.86 + Math.sin(t * 5.2 + spot.segmentIndex) * 0.18;
      node.group.getWorldPosition(_weakSpotWorld);
      spot.position.copy(_weakSpotWorld);
      spot.radius = Math.max(
        this.config.WEAK_SPOT_RADIUS * 1.28 * this._debugTuning.weakSpotHitMul,
        nodeScale * 1.16 * this._debugTuning.weakSpotHitMul,
      );
      if (spot.sleeve) {
        const prev = this._segmentPositions[Math.max(0, spot.segmentIndex - 1)];
        spot.sleeve.visible = true;
        spot.sleeve.position.copy(_weakSpotWorld);
        if (prev) {
          _bridgeLook.copy(prev);
          spot.sleeve.rotation.set(0, 0, 0);
          spot.sleeve.lookAt(_bridgeLook);
        }
        const sleeveRadius = Math.max(nodeScale, this.config.BODY_RADIUS * 0.9);
        const sleeveScale = sleeveRadius * 1.18 * this._debugTuning.weakSpotScaleMul;
        spot.sleeve.scale.set(sleeveScale, sleeveScale, sleeveScale);
        spot.sleeve.material.emissiveIntensity = 0.52 + pulse * 0.34;
        spot.sleeve.material.opacity = 0.94;
      }
      node.core.material.emissiveIntensity = 0.72 + pulse * 0.24;
      node.belly.material.emissiveIntensity = 0.46 + pulse * 0.16;
      node.core.material.color.setRGB(
        1.0,
        0.82 + pulse * 0.05,
        0.48 + pulse * 0.04,
      );
      node.belly.material.color.setRGB(
        1.0,
        0.9 + pulse * 0.04,
        0.56 + pulse * 0.04,
      );
      for (const plate of node.plates) {
        plate.material.emissiveIntensity = 0.46 + pulse * 0.16;
        plate.material.color.setRGB(
          1.0,
          0.88 + pulse * 0.04,
          0.62 + pulse * 0.04,
        );
      }
      for (const spine of node.spines) {
        spine.material.color.setRGB(
          1.0,
          0.94 + pulse * 0.04,
          0.72 + pulse * 0.03,
        );
        spine.material.opacity = 0.42 + pulse * 0.1;
      }
    }
  }

  _breakWeakSpot(spot) {
    if (spot.broken) return false;
    spot.broken = true;
    spot.breakT = 0;
    if (spot.sleeve) spot.sleeve.visible = false;
    this._restoreWeakSpotMaterials(spot);
    this._weakSpotsRemaining = Math.max(0, this._weakSpotsRemaining - 1);
    eventBus.emit(Events.WORLDEATER_WEAKSPOT_HIT, {
      remaining: this._weakSpotsRemaining,
      total: this.config.WEAK_SPOT_COUNT,
    });

    if (this._weakSpotsRemaining === 0 && this._phase === 'sealed') {
      this._phase = 'opening';
      this._phaseTime = 0;
      this._resetTimer = this.config.RESET_WINDOW_SECONDS;
      eventBus.emit(Events.WORLDEATER_OPENED);
    }
    return true;
  }

  _resolveWeakSpotCollision(position, velocity = null) {
    if (this._phase === 'sealed') {
      for (const spot of this._weakSpots) {
        if (spot.broken) continue;
        _delta.subVectors(position, spot.position);
        const dist = _delta.length();
        const minDist = spot.radius + BALL.RADIUS;
        if (dist >= minDist) continue;

        if (dist > 0.001) {
          _normal.copy(_delta).divideScalar(dist);
        } else if (velocity && velocity.lengthSq() > 0.001) {
          _normal.copy(velocity).normalize();
        } else {
          _normal.set(1, 0, 0);
        }

        return {
          type: 'weakspot',
          spot,
          normal: _normal.clone(),
          minDist,
        };
      }

      _delta.subVectors(position, this.config.center);
      const sealDist = _delta.length();
      const sealMinDist = this.config.SEAL_RADIUS + BALL.RADIUS;
      if (sealDist < sealMinDist) {
        if (sealDist > 0.001) {
          _normal.copy(_delta).divideScalar(sealDist);
        } else {
          _normal.copy(this._headDir).negate();
        }
        return {
          type: 'seal',
          normal: _normal.clone(),
          minDist: sealMinDist,
        };
      }
    }

    const headPos = this._segmentPositions[0];
    _delta.subVectors(position, headPos);
    const headDist = _delta.length();
    if (headDist < this.config.HEAD_RADIUS + BALL.RADIUS) {
      if (headDist > 0.001) {
        _normal.copy(_delta).divideScalar(headDist);
      } else {
        _normal.copy(this._headDir).negate();
      }
      return {
        type: 'body',
        normal: _normal.clone(),
        minDist: this.config.HEAD_RADIUS + BALL.RADIUS,
      };
    }

    for (let i = 1; i < this._segmentPositions.length; i++) {
      const segPos = this._segmentPositions[i];
      const radius = this.config.BODY_RADIUS * (1 - i / (this.config.SEGMENTS * 1.7));
      _delta.subVectors(position, segPos);
      const dist = _delta.length();
      const minDist = radius + BALL.RADIUS;
      if (dist >= minDist) continue;
      if (dist > 0.001) {
        _normal.copy(_delta).divideScalar(dist);
      } else {
        _normal.copy(this._headDir).negate();
      }
      return {
        type: 'body',
        normal: _normal.clone(),
        minDist,
      };
    }

    return null;
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  removeFromScene(scene) {
    scene.remove(this.group);
    this.dispose();
  }

  _getOrbitPos(phase, out, radiusOverride = null) {
    const center = this.config.center;
    const radius = radiusOverride ?? this.config.ORBIT_RADIUS;
    const zRadius = radius * this.config.ELLIPSE_Z;
    const wobble = 1 + Math.sin(phase * 2.0) * 0.08;
    const x = center.x + Math.cos(phase) * radius * wobble;
    const y = center.y + Math.sin(phase * 2.8) * this.config.VERTICAL_AMPLITUDE;
    const z = center.z + Math.sin(phase) * zRadius * (1 + Math.cos(phase * 1.5) * 0.05);
    return out.set(x, y, z);
  }

  _updateBrood(dt) {
    const t = this._time;
    for (const brood of this._brood) {
      const loiter = Math.sin(t * brood.wobbleRate + brood.phase * 2.4) * brood.loiterAmp;
      const phase = brood.phase + t * brood.speed + loiter;
      const radialScale = 1 + Math.sin(t * brood.wobbleRate * 0.85 + brood.phase) * 0.08;
      _broodOffset.set(
        Math.cos(phase) * (brood.radiusX + Math.sin(t * brood.wobbleRate + brood.phase) * brood.wobbleAmp) * radialScale,
        brood.height + Math.sin(t * brood.bobRate + brood.phase * 1.7) * brood.bobAmp,
        Math.sin(phase) * (brood.radiusZ + Math.cos(t * brood.wobbleRate * 1.1 + brood.phase) * brood.wobbleAmp * 0.75),
      );
      _broodOffset.applyAxisAngle(brood.tiltAxis, brood.tilt);
      brood.group.position.copy(this.config.center).add(_broodOffset);

      _broodAhead.set(
        Math.cos(phase + brood.lead) * brood.radiusX,
        brood.height + Math.sin(t * brood.bobRate + brood.lead + brood.phase * 1.7) * brood.bobAmp,
        Math.sin(phase + brood.lead) * brood.radiusZ,
      );
      _broodAhead.applyAxisAngle(brood.tiltAxis, brood.tilt);
      _broodAhead.add(this.config.center);
      brood.group.lookAt(_broodAhead);
      brood.group.rotation.z += Math.sin(t * brood.wobbleRate * 1.3 + brood.phase) * brood.roll;

      const pulse = 0.92 + Math.sin(t * 4 + brood.phase) * 0.12;
      brood.shell.material.opacity = 0;
      brood.fin.material.opacity = 0.12 + pulse * 0.08;
      brood.head.material.emissiveIntensity = 0.95 + pulse * 0.35;
      brood.belly.material.emissiveIntensity = 0.55 + pulse * 0.22;
      for (let i = 0; i < brood.tail.length; i++) {
        brood.tail[i].position.y = Math.sin(t * 5.5 - i * 0.75 + brood.phase) * (1.8 + i * 0.2);
        brood.tail[i].rotation.z = Math.sin(t * 2.6 - i * 0.45 + brood.phase) * 0.14;
      }
      for (let i = 0; i < brood.plates.length; i++) {
        brood.plates[i].position.y = 8.2 - i * 1.1 + Math.sin(t * 2.4 + brood.phase + i) * 0.5;
        brood.plates[i].material.emissiveIntensity = 0.38 + pulse * 0.18;
      }
    }
  }

  update(dt) {
    this._time += dt;
    this._phaseTime += dt;

    if (this._intro.active) {
      this._updateIntroPose(dt);
      return;
    }

    if (this._phase === 'opening') {
      this._openBlend = clamp01(this._phaseTime / this.config.OPEN_DURATION);
      this._resetTimer = Math.max(0, this._resetTimer - dt);
      eventBus.emit(Events.WORLDEATER_RESET_TIMER, {
        remaining: this._resetTimer,
        total: this.config.RESET_WINDOW_SECONDS,
      });
      if (this._openBlend >= 1) {
        this._phase = 'active';
        this._phaseTime = 0;
      }
      if (this._resetTimer <= 0) {
        this._resetToSealed();
      }
    } else if (this._phase === 'active') {
      this._openBlend = 1;
      this._resetTimer = Math.max(0, this._resetTimer - dt);
      eventBus.emit(Events.WORLDEATER_RESET_TIMER, {
        remaining: this._resetTimer,
        total: this.config.RESET_WINDOW_SECONDS,
      });
      if (this._resetTimer <= 0) {
        this._resetToSealed();
      }
    } else {
      this._openBlend = 0;
      this._resetTimer = this.config.RESET_WINDOW_SECONDS;
      this._sealResumeTime = Math.min(this._sealResumeDuration, this._sealResumeTime + dt);
      this._sealResumeBlend = clamp01(this._sealResumeTime / Math.max(0.001, this._sealResumeDuration));
    }

    for (let i = 0; i < this._segmentPositions.length; i++) {
      this._prevSegmentPositions[i].copy(this._segmentPositions[i]);
    }

    const phaseBase = this._time * (Math.PI * 2 / this.config.CYCLE_SECONDS);

    for (let i = 0; i < this.config.SEGMENTS; i++) {
      const phase = phaseBase - i * this.config.SEGMENT_PHASE;
      this._getOrbitPos(phase, _posA);
      this._getSealedPos(i, _posB);
      if (this._phase === 'sealed' && this._sealResumeBlend < 1) {
        this._getSealedPosAt(i, this._sealResumeStartTime, _sealResumePos);
        _posB.lerp(_sealResumePos, 1 - this._sealResumeBlend);
      }
      this._segmentPositions[i].copy(_posB).lerp(_posA, this._openBlend);

      if (i === 0) continue;
    }

    this._headDir.subVectors(this._segmentPositions[0], this._segmentPositions[1]).normalize();
    _side.copy(this._headDir).cross(_up);
    if (_side.lengthSq() < 0.01) _side.set(1, 0, 0);
    _side.normalize();

    for (let i = 1; i < this.config.SEGMENTS; i++) {
      const phase = phaseBase - i * this.config.SEGMENT_PHASE;
      const swayMix = this._openBlend;
      const sideSway = Math.sin(phase * 3.1 + i * 0.7) * 18 * Math.max(0, 1 - i * 0.08) * swayMix;
      const upSway = Math.cos(phase * 2.2 + i * 0.4) * 10 * Math.max(0, 1 - i * 0.06) * swayMix;
      this._segmentPositions[i].addScaledVector(_side, sideSway);
      this._segmentPositions[i].y += upSway;

      const node = this._segmentNodes[i - 1];
      const taper = 1 - i / (this.config.SEGMENTS + 2);
      const radius = this._getSegmentVisualRadius(i);
      node.group.position.copy(this._segmentPositions[i]);
      node.group.lookAt(this._segmentPositions[Math.max(0, i - 1)]);
      node.group.scale.set(radius, radius * 0.78, radius * 1.18);
      node.core.material.emissiveIntensity = 0.5 + taper * 0.55;
      node.belly.material.emissiveIntensity = 0.42 + taper * 0.3 + this._mouthOpen * 0.18;
      node.shell.material.opacity = 0;
      node.fin.material.opacity = 0.04 + taper * 0.1;
      node.fin.scale.set(0.75 + taper * 0.42, 0.75 + taper * 0.42, 0.75 + taper * 0.42);
      node.fin.position.y = 0.08 + taper * 0.08;
      for (let s = 0; s < node.spines.length; s++) {
        node.spines[s].material.opacity = 0.08 + taper * 0.16;
        node.spines[s].position.y = 0.78 + Math.sin(this._time * 3.2 + i * 0.4 + s) * 0.04;
      }
      for (let p = 0; p < node.plates.length; p++) {
        node.plates[p].material.emissiveIntensity = 0.36 + taper * 0.28 + this._mouthOpen * 0.1;
        node.plates[p].position.y = 0.9 + Math.sin(this._time * 2.6 + i * 0.25 + p) * 0.03;
      }
    }

    for (let i = 1; i < this._segmentPositions.length; i++) {
      const bridge = this._bridgeNodes[i - 1];
      const prevPos = this._segmentPositions[i - 1];
      const currPos = this._segmentPositions[i];
      const prevRadius = this._getSegmentVisualRadius(i - 1);
      const currRadius = this._getSegmentVisualRadius(i);
      const dist = prevPos.distanceTo(currPos);
      const thickness = Math.min(prevRadius, currRadius) * (i === 1 ? 0.52 : 0.58);
      const bellyThickness = thickness * 0.92;
      const taper = 1 - i / (this.config.SEGMENTS + 2);

      _bridgeMid.addVectors(prevPos, currPos).multiplyScalar(0.5);
      bridge.group.position.copy(_bridgeMid);
      _bridgeLook.copy(prevPos);
      bridge.group.lookAt(_bridgeLook);

      bridge.core.scale.set(
        thickness,
        thickness * 0.58,
        Math.max(thickness * 0.95, dist * 0.44),
      );
      bridge.belly.scale.set(
        bellyThickness,
        bellyThickness * 0.38,
        Math.max(bellyThickness * 0.9, dist * 0.41),
      );
      bridge.belly.position.y = -thickness * 0.16;
      bridge.belly.position.z = dist * 0.04;
      bridge.core.material.emissiveIntensity = 0.44 + taper * 0.32 + this._mouthOpen * 0.1;
      bridge.belly.material.emissiveIntensity = 0.3 + taper * 0.2 + this._mouthOpen * 0.08;
    }

    const renderPoints = this._segmentPositions.slice(0, Math.max(4, this._segmentPositions.length - 2));
    this._bodyCurve.points = renderPoints.map((pos) => pos.clone());
    this._updateBodyTubeGeometry(
      renderPoints,
      this.config.BODY_RADIUS * 0.84 * this._debugTuning.bodyRadiusMul,
    );

    const tailPos = renderPoints[renderPoints.length - 1];
    const prevTailPos = renderPoints[renderPoints.length - 2] ?? tailPos;
    this._tailCap.position.copy(tailPos);
    _bridgeLook.copy(prevTailPos);
    this._tailCap.lookAt(_bridgeLook);
    const tailRadius = Math.max(
      8,
      this._getSegmentVisualRadius(renderPoints.length - 1)
        * this._debugTuning.bodyRadiusMul
        * this._debugTuning.tailRadiusMul,
    );
    this._tailCap.scale.set(
      tailRadius,
      tailRadius * this._debugTuning.tailScaleY,
      tailRadius * this._debugTuning.tailScaleZ,
    );
    this._tailCap.material.emissiveIntensity = 0.22 + this._mouthOpen * 0.08;

    this._headGroup.position.copy(this._segmentPositions[0]);
    _posC.copy(this._segmentPositions[0]).add(this._headDir);
    this._headGroup.lookAt(_posC);

    const mouthGate = this._phase === 'active' ? 1 : this._openBlend;
    this._mouthOpen = clamp01(Math.pow((Math.sin(this._time * 3.25) + 1) * 0.5, 1.6) * mouthGate);
    const jawAngle = 0.04 + this._mouthOpen * 0.18;
    this._upperJaw.visible = false;
    this._lowerJaw.visible = false;
    this._mouthRing.position.set(66, 0, 78);
    this._mouthRing.scale.set(11 + this._mouthOpen * 3, 9 + this._mouthOpen * 2, 10 + this._mouthOpen * 4);
    this._mouthRing.material.opacity = 0.0;
    this._mouthCore.visible = false;
    this._mouthHalo.visible = false;
    this._headShell.material.opacity = 0;
    this._eyeLeft.scale.set(3 + this._mouthOpen * 2.8, 3 + this._mouthOpen * 2.8, 1.8 + this._mouthOpen * 1.4);
    this._eyeRight.scale.copy(this._eyeLeft.scale);
    this._headMat.emissiveIntensity = 0.95 + this._mouthOpen * 0.4;
    this._snout.material.emissiveIntensity = 0.9 + this._mouthOpen * 0.38;
    this._headBelly.material.emissiveIntensity = 0.55 + this._mouthOpen * 0.25;
    this._neckMantle.material.emissiveIntensity = 0.62 + this._mouthOpen * 0.18;
    this._throatMantle.material.emissiveIntensity = 0.58 + this._mouthOpen * 0.28;

    for (const brow of this._browRidges) {
      brow.material.emissiveIntensity = 0.88 + this._mouthOpen * 0.18;
    }

    for (const cheek of this._jawFlanges) {
      cheek.material.emissiveIntensity = 0.78 + this._mouthOpen * 0.18;
    }

    this._mouthSocket.material.emissiveIntensity = 0.05 + this._mouthOpen * 0.08;
    this._mouthSocket.scale.set(18 + this._mouthOpen * 4, 18 + this._mouthOpen * 4, 10 + this._mouthOpen * 4);
    this._mouthRimUpper.visible = false;
    this._mouthRimLower.visible = false;
    this._throatShell.material.emissiveIntensity = 0.1 + this._mouthOpen * 0.18;
    this._throatShell.scale.set(
      9.5 + this._mouthOpen * 4.5,
      9.5 + this._mouthOpen * 4.5,
      13 + this._mouthOpen * 6,
    );
    this._throatGlow.scale.set(
      4.6 + this._mouthOpen * 2.8,
      4.6 + this._mouthOpen * 2.8,
      8 + this._mouthOpen * 5,
    );
    this._throatGlow.material.opacity = 0.18 + this._mouthOpen * 0.14;

    for (let i = 0; i < this._fangs.length; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const fang = this._fangs[i];
      const baseScale = i < 2 ? 3.6 : 2.4;
      fang.rotation.y = side * (0.24 + this._mouthOpen * 0.18);
      fang.scale.y = baseScale * (1 + this._mouthOpen * 0.18);
      fang.position.z = (i < 2 ? 77 : 72) + this._mouthOpen * 2.6;
    }

    for (let i = 0; i < this._crest.length; i++) {
      this._crest[i].material.emissiveIntensity = 0.3 + this._mouthOpen * 0.18;
      this._crest[i].rotation.y = Math.sin(this._time * 2.4 + i * 0.65) * 0.12;
    }

    for (let i = 0; i < this._mandibles.length; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      this._mandibles[i].rotation.y = Math.sin(this._time * 2.1 + i) * 0.1 * side;
    }

    this._updateSeal(dt);
    this._updateWeakSpots(dt);
    this._updateBrood(dt);
  }

  _updateIntroPose(dt) {
    this._intro.time += dt;
    this._intro.orbitTime += dt;
    this._time = this._intro.orbitTime;
    const raw = clamp01(this._intro.time / Math.max(0.001, this._intro.duration));
    const orbitBlend = clamp01((raw - this._intro.approachEnd) / Math.max(0.0001, 1 - this._intro.approachEnd));
    const sealBlendStart = this.config.INTRO_SEAL_BLEND_START ?? 0.68;
    const sealBlend = smoothstep(sealBlendStart, 1, raw);
    const sealFade = sealBlend;
    const introRadius = this.config.INTRO_ORBIT_RADIUS ?? this.config.ORBIT_RADIUS;
    this._intro.coilBlend = orbitBlend;
    this._openBlend = 0;
    this._mouthOpen = 0;

    for (let i = 0; i < this._segmentPositions.length; i++) {
      this._prevSegmentPositions[i].copy(this._segmentPositions[i]);
    }

    const segmentSpacing = this.config.INTRO_SEGMENT_SPACING
      ?? this.config.ORBIT_RADIUS * this.config.SEGMENT_PHASE * 0.88;
    const { start: orbitBlendStart, end: orbitBlendEnd } = this._getIntroOrbitBlendRange();
    const orbitSettle = smoothstep(orbitBlendStart, orbitBlendEnd, raw);
    const approachSpeedPerRaw = this._intro.approachLength / Math.max(0.0001, this._intro.approachEnd);
    const orbitSpeedPerRaw = introRadius * this._intro.duration * (Math.PI * 2 / this.config.CYCLE_SECONDS);
    const speedPerRaw = Math.max(
      1,
      approachSpeedPerRaw * (1 - orbitSettle) + orbitSpeedPerRaw * orbitSettle,
    );
    const rawSpacing = segmentSpacing / speedPerRaw;
    for (let i = 0; i < this.config.SEGMENTS; i++) {
      this._sampleIntroBodyAtRaw(raw - i * rawSpacing, this._segmentPositions[i]);
    }

    _delta.subVectors(this._segmentPositions[0], this._segmentPositions[1]);
    if (_delta.lengthSq() < 0.001) _delta.copy(this._intro.exitDir);
    _delta.normalize();
    _side.copy(_delta).cross(_up);
    if (_side.lengthSq() < 0.01) _side.set(1, 0, 0);
    _side.normalize();

    for (let i = 1; i < this.config.SEGMENTS; i++) {
      const swayPhase = this._time * 2.4 + i * 0.55;
      const sideSway = Math.sin(swayPhase * 1.35) * 8 * Math.max(0, 1 - i * 0.08);
      const upSway = Math.cos(swayPhase) * 5 * Math.max(0, 1 - i * 0.06);
      this._segmentPositions[i].addScaledVector(_side, sideSway);
      this._segmentPositions[i].y += upSway;
    }

    if (sealBlend > 0) {
      for (let i = 0; i < this.config.SEGMENTS; i++) {
        this._getSealedPosAt(i, this._time, _posB);
        this._segmentPositions[i].lerp(_posB, sealBlend);
      }
    }

    this._headDir.subVectors(this._segmentPositions[0], this._segmentPositions[1]);
    if (this._headDir.lengthSq() < 0.001) this._headDir.copy(this._intro.exitDir);
    if (this._headDir.lengthSq() < 0.001) this._headDir.set(1, 0, 0);
    this._headDir.normalize();
    _side.copy(this._headDir).cross(_up);
    if (_side.lengthSq() < 0.01) _side.set(1, 0, 0);
    _side.normalize();

    for (let i = 1; i < this.config.SEGMENTS; i++) {
      const node = this._segmentNodes[i - 1];
      const taper = 1 - i / (this.config.SEGMENTS + 2);
      const radius = this._getSegmentVisualRadius(i);
      node.group.position.copy(this._segmentPositions[i]);
      node.group.lookAt(this._segmentPositions[Math.max(0, i - 1)]);
      node.group.scale.set(radius, radius * 0.78, radius * 1.18);
      node.core.material.emissiveIntensity = 0.54 + taper * 0.58;
      node.belly.material.emissiveIntensity = 0.38 + taper * 0.26;
      node.shell.material.opacity = 0;
      node.fin.material.opacity = sealFade * (0.04 + taper * 0.1);
      node.fin.scale.set(0.75 + taper * 0.42, 0.75 + taper * 0.42, 0.75 + taper * 0.42);
      node.fin.position.y = 0.08 + taper * 0.08;
      for (let s = 0; s < node.spines.length; s++) {
        node.spines[s].material.opacity = sealFade * (0.08 + taper * 0.16);
        node.spines[s].position.y = 0.78 + Math.sin(this._time * 3.2 + i * 0.4 + s) * 0.04;
      }
      for (let p = 0; p < node.plates.length; p++) {
        node.plates[p].material.emissiveIntensity = 0.34 + taper * 0.24;
        node.plates[p].position.y = 0.9 + Math.sin(this._time * 2.6 + i * 0.25 + p) * 0.03;
      }
    }

    for (let i = 1; i < this._segmentPositions.length; i++) {
      const bridge = this._bridgeNodes[i - 1];
      const prevPos = this._segmentPositions[i - 1];
      const currPos = this._segmentPositions[i];
      const prevRadius = this._getSegmentVisualRadius(i - 1);
      const currRadius = this._getSegmentVisualRadius(i);
      const dist = prevPos.distanceTo(currPos);
      const thickness = Math.min(prevRadius, currRadius) * (i === 1 ? 0.52 : 0.58);
      const bellyThickness = thickness * 0.92;
      const taper = 1 - i / (this.config.SEGMENTS + 2);

      _bridgeMid.addVectors(prevPos, currPos).multiplyScalar(0.5);
      bridge.group.position.copy(_bridgeMid);
      _bridgeLook.copy(prevPos);
      bridge.group.lookAt(_bridgeLook);
      bridge.core.scale.set(thickness, thickness * 0.58, Math.max(thickness * 0.95, dist * 0.44));
      bridge.belly.scale.set(bellyThickness, bellyThickness * 0.38, Math.max(bellyThickness * 0.9, dist * 0.41));
      bridge.belly.position.y = -thickness * 0.16;
      bridge.belly.position.z = dist * 0.04;
      bridge.core.material.emissiveIntensity = 0.42 + taper * 0.28;
      bridge.belly.material.emissiveIntensity = 0.28 + taper * 0.18;
    }

    const renderPoints = this._segmentPositions.slice();
    this._bodyCurve.points = renderPoints.map((pos) => pos.clone());
    this._updateBodyTubeGeometry(
      renderPoints,
      this.config.BODY_RADIUS * 0.84 * this._debugTuning.bodyRadiusMul,
    );

    const tailPos = renderPoints[renderPoints.length - 1];
    const prevTailPos = renderPoints[renderPoints.length - 2] ?? tailPos;
    this._tailCap.position.copy(tailPos);
    _bridgeLook.copy(prevTailPos);
    this._tailCap.lookAt(_bridgeLook);
    const tailRadius = Math.max(
      8,
      this._getSegmentVisualRadius(renderPoints.length - 1)
        * this._debugTuning.bodyRadiusMul
        * this._debugTuning.tailRadiusMul,
    );
    this._tailCap.scale.set(
      tailRadius,
      tailRadius * this._debugTuning.tailScaleY,
      tailRadius * this._debugTuning.tailScaleZ,
    );
    this._tailCap.material.emissiveIntensity = 0.2;

    this._headGroup.position.copy(this._segmentPositions[0]);
    _posC.copy(this._segmentPositions[0]).add(this._headDir);
    this._headGroup.lookAt(_posC);
    this._mouthRing.position.set(66, 0, 78);
    this._mouthRing.scale.set(10.5, 8.6, 10.5);
    this._mouthRing.material.opacity = 0.0;
    this._headMat.emissiveIntensity = 1.08;
    this._snout.material.emissiveIntensity = 1.0;
    this._headBelly.material.emissiveIntensity = 0.5;
    this._neckMantle.material.emissiveIntensity = 0.62;
    this._throatMantle.material.emissiveIntensity = 0.58;

    for (let i = 0; i < this._crest.length; i++) {
      this._crest[i].material.emissiveIntensity = 0.24 + sealFade * 0.1;
      this._crest[i].rotation.y = Math.sin(this._time * 2.2 + i * 0.65) * 0.1;
    }
    for (let i = 0; i < this._mandibles.length; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      this._mandibles[i].rotation.y = Math.sin(this._time * 1.8 + i) * 0.08 * side;
    }

    this._sealPulse += dt;
    this._sealGroup.visible = sealFade > 0.02;
    this._sealCore.material.opacity = sealFade * (0.12 + Math.sin(this._sealPulse * 4) * 0.03);
    this._sealShell.material.opacity = sealFade * 0.18;
    this._sealShell.scale.setScalar(this.config.SEAL_RADIUS * (1 + Math.sin(this._sealPulse * 3.2) * 0.03));
    for (let i = 0; i < this._sealRings.length; i++) {
      const ring = this._sealRings[i];
      ring.rotation.z += dt * (0.55 + i * 0.2) * (i === 0 ? 1 : -1);
      ring.material.opacity = sealFade * (0.18 + Math.sin(this._sealPulse * (2.5 + i) + i) * 0.08);
      const scale = this.config.SEAL_RADIUS * (1.55 + i * 0.45 + Math.sin(this._sealPulse * (1.8 + i)) * 0.04);
      ring.scale.setScalar(scale);
    }

    for (const spot of this._weakSpots) {
      const node = spot.node;
      const worldPos = this._segmentPositions[spot.segmentIndex];
      if (worldPos) spot.position.copy(worldPos);
      if (spot.sleeve) spot.sleeve.visible = false;
      if (spot.broken) continue;
      const spin = this._time * this.config.WEAK_SPOT_ROTATE_SPEED + spot.angle;
      spot.normal.set(Math.cos(spin), 0.18 + Math.sin(spin * 1.7) * 0.04, Math.sin(spin)).normalize();
      spot.radius = this.config.WEAK_SPOT_RADIUS * (node.group.scale.x || 1) * this._debugTuning.weakSpotHitMul;
    }

    for (const brood of this._brood) {
      brood.group.visible = sealFade > 0.72;
    }
    if (sealFade > 0.72) this._updateBrood(dt);

    if (raw >= 1) this.finishCinematicIntro();
  }

  interactWithBall(ball, dt, allowBounce = true) {
    if (this._phase === 'sealed') {
      const sealedHit = this._resolveWeakSpotCollision(ball.position, ball.velocity);
      if (sealedHit?.type === 'weakspot') {
        ball.position.copy(sealedHit.spot.position).addScaledVector(sealedHit.normal, sealedHit.minDist + 1.2);
        const intoSpot = ball.velocity.dot(sealedHit.normal);
        if (intoSpot < 0) {
          ball.velocity.addScaledVector(sealedHit.normal, -(1 + this.config.SEAL_BOUNCE) * intoSpot);
        } else {
          ball.velocity.addScaledVector(sealedHit.normal, 80);
        }

        const opened = this._breakWeakSpot(sealedHit.spot);
        return {
          type: 'weakspot-hit',
          remaining: this._weakSpotsRemaining,
          opened: opened && this._weakSpotsRemaining === 0,
          position: ball.position.clone(),
        };
      }
      if (sealedHit?.type === 'seal') {
        ball.position.copy(this.config.center).addScaledVector(sealedHit.normal, sealedHit.minDist + 1.5);
        const inward = ball.velocity.dot(sealedHit.normal);
        if (inward < 0) {
          ball.velocity.addScaledVector(sealedHit.normal, -(1 + this.config.SEAL_BOUNCE) * inward);
        } else {
          ball.velocity.addScaledVector(sealedHit.normal, 120);
        }
        return {
          type: 'shield-block',
          position: ball.position.clone(),
        };
      }
    }

    const headPos = this._segmentPositions[0];
    _delta.subVectors(ball.position, headPos);
    const headDist = _delta.length();

    if ((this._phase === 'active' || this._openBlend > 0.72) && headDist > 0.001) {
      const frontDot = _delta.normalize().dot(this._headDir);
      if (frontDot > 0.2 && headDist < this.config.MOUTH_RADIUS + BALL.RADIUS) {
        if (this._mouthOpen >= this.config.BOOST_OPEN_MIN) {
          _toCup.subVectors(this.config.center, this.config.spitTarget).normalize();
          const velocity = this._headDir.clone().multiplyScalar(this.config.BOOST_SPEED)
            .lerp(_toCup.multiplyScalar(this.config.BOOST_SPEED * 1.12), 0.52);
          return {
            type: 'boost',
            position: this.config.spitTarget.clone(),
            velocity,
          };
        }
        return { type: 'chomp' };
      }
    }

    if (!allowBounce) return null;

    const safeDt = Math.max(dt, 0.016);
    for (let i = 1; i < this._segmentPositions.length; i++) {
      const segPos = this._segmentPositions[i];
      const radius = this.config.BODY_RADIUS * (1 - i / (this.config.SEGMENTS * 1.7));
      _delta.subVectors(ball.position, segPos);
      const dist = _delta.length();
      const minDist = radius + BALL.RADIUS;

      if (dist >= minDist) continue;

      if (dist > 0.001) {
        _normal.copy(_delta).divideScalar(dist);
      } else {
        _normal.copy(this._headDir).negate();
      }

      ball.position.copy(segPos).addScaledVector(_normal, minDist + 0.5);

      const intoBody = ball.velocity.dot(_normal);
      if (intoBody < 0) {
        ball.velocity.addScaledVector(_normal, -(1 + this.config.BODY_BOUNCE) * intoBody);
      }

      _segmentVelocity.subVectors(segPos, this._prevSegmentPositions[i]).divideScalar(safeDt);
      ball.velocity.addScaledVector(_segmentVelocity, 0.12);

      return {
        type: 'body-bounce',
        position: segPos.clone(),
      };
    }

    return null;
  }

  isBoostWindow() {
    return this._mouthOpen >= this.config.BOOST_OPEN_MIN;
  }

  canHoleBall() {
    return this._phase !== 'sealed';
  }

  getPhase() {
    return this._phase;
  }

  getWeakSpotProgress() {
    return {
      total: this.config.WEAK_SPOT_COUNT,
      remaining: this._weakSpotsRemaining,
      broken: this.config.WEAK_SPOT_COUNT - this._weakSpotsRemaining,
    };
  }

  predictTrajectoryStop(position, velocity = null) {
    const collision = this._resolveWeakSpotCollision(position, velocity);
    if (!collision) return null;
    return {
      stopReason: collision.type === 'weakspot' ? 'boss_weakspot' : 'boss_block',
      position: position.clone(),
    };
  }

  dispose() {
    this._headGeo.dispose();
    this._bodyGeo.dispose();
    this._shellGeo.dispose();
    this._finGeo.dispose();
    this._mouthGeo.dispose();
    this._crestGeo.dispose();
    this._plateGeo.dispose();
    this._mandibleGeo.dispose();
    this._mawRingGeo.dispose();
    this._mawCoreGeo.dispose();
    this._weakSpotGeo.dispose();
    this._sealGeo.dispose();
    this._sealRingGeo.dispose();

    this._headMat.dispose();
    this._jawMat.dispose();
    this._toothMat.dispose();
    this._bodyMat.dispose();
    this._tubeBodyMat.dispose();
    this._weakSleeveMat.dispose();
    this._bellyMat.dispose();
    this._plateMat.dispose();
    this._furnaceMat.dispose();
    this._glowMat.dispose();
    this._shellMat.dispose();
    this._finMat.dispose();
    this._mouthRing.material.dispose();
    this._mouthCore.material.dispose();
    this._mouthHalo.material.dispose();
    this._snout.material.dispose();
    this._headBelly.material.dispose();
    for (const tex of this._textures) tex.dispose();

    for (const fin of this._crest) {
      fin.material.dispose();
    }

    for (const mandible of this._mandibles) {
      mandible.material.dispose();
    }

    for (const detail of this._headDetails) {
      detail.material.dispose();
    }

    for (const detail of this._mouthDetails) {
      detail.material.dispose();
    }

    for (const fang of this._fangs) {
      fang.material.dispose();
    }

    this._sealShell.material.dispose();
    this._sealCore.material.dispose();
    for (const ring of this._sealRings) ring.material.dispose();

    for (const spot of this._weakSpots) {
      if (spot.sleeve) spot.sleeve.material.dispose();
    }

    for (const node of this._segmentNodes) {
      node.core.material.dispose();
      node.belly.material.dispose();
      node.shell.material.dispose();
      node.fin.material.dispose();
      for (const spine of node.spines) spine.material.dispose();
      for (const plate of node.plates) plate.material.dispose();
    }

    for (const bridge of this._bridgeNodes) {
      bridge.core.material.dispose();
      bridge.belly.material.dispose();
    }

    this._bodyTube.geometry.dispose();

    for (const brood of this._brood) {
      brood.head.material.dispose();
      brood.shell.material.dispose();
      brood.belly.material.dispose();
      brood.fin.material.dispose();
      for (const tail of brood.tail) tail.material.dispose();
      for (const plate of brood.plates) plate.material.dispose();
    }
  }
}
