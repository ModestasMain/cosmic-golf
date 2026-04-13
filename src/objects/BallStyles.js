// ============================================================
// BallStyles.js — Golf ball skins with proper equirectangular textures
// ============================================================

import { CanvasTexture, TextureLoader, SRGBColorSpace, RepeatWrapping, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter } from 'three';

const S = 1024; // Higher resolution for quality

// --- Simple Basketball Generator ---
// Draws a standard flat basketball texture that UV maps to sphere
function makeBasketballTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  
  // Basketball orange base
  const grad = ctx.createRadialGradient(size*0.3, size*0.3, 0, size/2, size/2, size*0.6);
  grad.addColorStop(0, '#FF6B35');
  grad.addColorStop(0.5, '#E65100');
  grad.addColorStop(1, '#BF360C');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  
  // Pebbled texture (subtle dots)
  ctx.fillStyle = 'rgba(0,0,0,0.03)';
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Black channel lines
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  const cx = size / 2;
  const cy = size / 2;
  
  // The 4 main basketball seams:
  // When this flat texture wraps on a sphere, these will curve naturally
  
  // 1. Horizontal equator (center line)
  ctx.beginPath();
  ctx.moveTo(20, cy);
  ctx.lineTo(size - 20, cy);
  ctx.stroke();
  
  // 2. Vertical-ish S-curve (left side)
  ctx.beginPath();
  ctx.moveTo(cx - 30, 30);
  ctx.bezierCurveTo(
    cx - 100, cy - 80,
    cx + 50, cy + 80,
    cx - 30, size - 30
  );
  ctx.stroke();
  
  // 3. Vertical-ish S-curve (right side - mirror)
  ctx.beginPath();
  ctx.moveTo(cx + 30, 30);
  ctx.bezierCurveTo(
    cx + 100, cy - 80,
    cx - 50, cy + 80,
    cx + 30, size - 30
  );
  ctx.stroke();
  
  // 4. Side connecting curves
  // Left side arc
  ctx.beginPath();
  ctx.moveTo(30, cy - 100);
  ctx.bezierCurveTo(
    100, cy,
    100, cy,
    30, cy + 100
  );
  ctx.stroke();
  
  // Right side arc  
  ctx.beginPath();
  ctx.moveTo(size - 30, cy - 100);
  ctx.bezierCurveTo(
    size - 100, cy,
    size - 100, cy,
    size - 30, cy + 100
  );
  ctx.stroke();
  
  // Top and bottom connecting arcs
  ctx.lineWidth = 8;
  
  // Top
  ctx.beginPath();
  ctx.moveTo(cx - 80, 35);
  ctx.quadraticCurveTo(cx, 15, cx + 80, 35);
  ctx.stroke();
  
  // Bottom
  ctx.beginPath();
  ctx.moveTo(cx - 80, size - 35);
  ctx.quadraticCurveTo(cx, size - 15, cx + 80, size - 35);
  ctx.stroke();
  
  return c;
}

// --- Simple Color Fallbacks ---
function makeFallbackCanvas(color, detail = null) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  
  // Base color
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 512);
  
  // Add simple detail if specified
  if (detail === 'basketball') {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 8;
    
    // Simple curved lines that will look okay on sphere
    ctx.beginPath();
    ctx.moveTo(100, 256);
    ctx.quadraticCurveTo(256, 100, 412, 256);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(100, 256);
    ctx.quadraticCurveTo(256, 412, 412, 256);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();
  }
  
  return c;
}

function style(albedo, name) {
  return { albedo, color: 0xffffff, roughness: 0.45, metalness: 0.05, name };
}

// --- Texture Loading ---
const loader = new TextureLoader();

function makeEquirectFromImage(img) {
  // Tile the flat image 4 times across a 2:1 equirectangular canvas.
  // Each tile covers 90° longitude so the image appears on all 4 "sides"
  // of the sphere: front (u=0), right (u=0.25), back (u=0.5), left (u=0.75).
  const tiles = 4;
  const w = img.width * tiles;    // 2048
  const h = img.width * (tiles/2); // 1024 → 2:1 equirectangular ratio
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const tileW = w / tiles;
  for (let i = 0; i < tiles; i++) {
    ctx.drawImage(img, i * tileW, 0, tileW, h);
  }

  return c;
}

function loadTexture(path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = makeEquirectFromImage(img);
      const albedo = new CanvasTexture(canvas);
      albedo.colorSpace = SRGBColorSpace;
      albedo.flipY = false;
      albedo.wrapS = RepeatWrapping;
      albedo.wrapT = ClampToEdgeWrapping;
      albedo.repeat.set(1, 1);
      albedo.minFilter = LinearMipmapLinearFilter;
      albedo.magFilter = LinearFilter;
      albedo.anisotropy = 16;
      albedo.generateMipmaps = true;
      albedo.needsUpdate = true;
      resolve(albedo);
    };
    img.onerror = () => {
      console.warn(`Texture failed to load: ${path}`);
      const c = document.createElement('canvas');
      c.width = 4; c.height = 2;
      const albedo = new CanvasTexture(c);
      albedo.colorSpace = SRGBColorSpace;
      albedo.needsUpdate = true;
      resolve(albedo);
    };
    img.src = path;
  });
}

// --- Style Definitions ---
const STYLE_DEFS = {
  basketball: { type: 'file', file: 'basketball.png', name: 'Basketball', fallbackColor: '#E65100' },
  bomb:       { type: 'file', file: 'bomb.png',       name: 'Bomb',       fallbackColor: '#311B92' },
  ghost:      { type: 'file', file: 'ghost.png',      name: 'Ghost',      fallbackColor: '#E8E8E8' },
  tennis:     { type: 'file', file: 'tennis.png',     name: 'Tennis',     fallbackColor: '#C6D300' },
  deathstar:  { type: 'file', file: 'deathstar.png',  name: 'Death Star', fallbackColor: '#757575' },
  pumpkin:    { type: 'file', file: 'pumpkin.png',    name: 'Pumpkin',    fallbackColor: '#F57C00' },
  soccer:     { type: 'file', file: 'soccer.png',     name: 'Soccer',     fallbackColor: '#FFFFFF' },
  pixel:      { type: 'file', file: 'pixel.png',      name: 'Pixel',      fallbackColor: '#FFB74D' },
  football:   { type: 'file', file: 'football.png',   name: 'Football',   fallbackColor: '#8D6E63' },
  donut:      { type: 'file', file: 'donut.png',      name: 'Donut',      fallbackColor: '#F50057' },
  eightball:  { type: 'file', file: 'eightball.png',  name: '8-Ball',     fallbackColor: '#212121' },
  volleyball: { type: 'file', file: 'volleyball.png', name: 'Volleyball', fallbackColor: '#FAFAFA' },
};

export const BALL_STYLE_IDS = Object.keys(STYLE_DEFS);

// --- Legacy Migration ---
const LEGACY_MAP = {
  'lava': 'basketball',
  'smiley': 'basketball',
  'water': 'volleyball',
  'bunny': 'pixel',
  'dog': 'football',
  'car': 'bomb',
  'earth': 'soccer',
  'disco': 'volleyball',
  'alien': 'ghost',
  'donut': 'donut',
  'skull': 'ghost',
};

export function migrateBallStyle(styleId) {
  return LEGACY_MAP[styleId] || styleId;
}

// --- Build Style ---
// Returns a Promise<{ albedo, color, roughness, metalness, name }>
export async function buildBallStyle(styleId) {
  const migratedId = migrateBallStyle(styleId);
  const def = STYLE_DEFS[migratedId] || STYLE_DEFS.basketball;

  const texturePath = `/textures/balls/${def.file}`;
  try {
    const albedo = await loadTexture(texturePath);
    return { albedo, color: 0xffffff, roughness: 0.45, metalness: 0.05, name: def.name };
  } catch (e) {
    console.warn(`Failed to load texture: ${texturePath}`);
    const canvas = makeFallbackCanvas(def.fallbackColor, migratedId === 'basketball' ? 'basketball' : null);
    const albedo = new CanvasTexture(canvas);
    albedo.colorSpace = SRGBColorSpace;
    albedo.needsUpdate = true;
    return { albedo, color: 0xffffff, roughness: 0.45, metalness: 0.05, name: def.name };
  }
}

// Synchronous fallback for UI previews (uses raw image, no mirror)
export function buildBallStyleSync(styleId) {
  const migratedId = migrateBallStyle(styleId);
  const def = STYLE_DEFS[migratedId] || STYLE_DEFS.basketball;

  const texturePath = `/textures/balls/${def.file}`;
  const texture = loader.load(texturePath, (tex) => {
    tex.flipY = false;
    tex.needsUpdate = true;
  }, undefined, () => {
    console.warn(`Texture failed to load: ${texturePath}`);
  });
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  return { albedo: texture, color: 0xffffff, roughness: 0.45, metalness: 0.05, name: def.name };
}

// --- AI Generation Prompts ---
export const AI_GENERATION_PROMPTS = {
  basketball: "Seamless equirectangular 360° spherical texture. Classic basketball, orange pebbled leather surface, black seam lines forming characteristic curved channels wrapping fully around sphere. Front and back both detailed. 2:1 aspect ratio equirectangular panorama.",
  bomb: "Seamless equirectangular 360° spherical texture. Dark purple matte bomb surface, glowing red cracks, short fuse at top with sparks. Full coverage, no seams. 2:1 aspect ratio equirectangular panorama.",
  ghost: "Seamless equirectangular 360° spherical texture. Translucent white ghost, wavy bottom edge, blue eyes, smile. Front detailed, back plain white. 2:1 aspect ratio equirectangular panorama.",
  tennis: "Seamless equirectangular 360° spherical texture. Yellow-green tennis ball felt, continuous white curved seam wrapping all around. Macro detail. 2:1 aspect ratio equirectangular panorama.",
  deathstar: "Seamless equirectangular 360° spherical texture. Gray Death Star surface with panel grid, equatorial trench, superlaser dish upper right. Star Wars. 2:1 aspect ratio equirectangular panorama.",
  pumpkin: "Seamless equirectangular 360° spherical texture. Orange pumpkin with carved glowing jack-o-lantern face front, plain ridges back. Green stem top. 2:1 aspect ratio equirectangular panorama.",
  soccer: "Seamless equirectangular 360° spherical texture. Classic soccer ball, black pentagons white hexagons wrapping fully. Clean leather. 2:1 aspect ratio equirectangular panorama.",
  pixel: "Seamless equirectangular 360° spherical texture. 8-bit pixel character face front, orange skin, blue beanie, glasses, surprised mouth. Back plain. 2:1 aspect ratio equirectangular panorama.",
  football: "Seamless equirectangular 360° spherical texture. Brown leather football, white stripes at poles, center laces. NFL style. 2:1 aspect ratio equirectangular panorama.",
  donut: "Seamless equirectangular 360° spherical texture. Pink frosted donut, colorful sprinkles, bite mark bottom. Full 360 coverage. 2:1 aspect ratio equirectangular panorama.",
  eightball: "Seamless equirectangular 360° spherical texture. Black 8-ball, white circle with 8 on front, plain black back. Glossy pool ball. 2:1 aspect ratio equirectangular panorama.",
  volleyball: "Seamless equirectangular 360° spherical texture. White volleyball, blue-gray curved panel lines. Full coverage, no seams. 2:1 aspect ratio equirectangular panorama.",
};
