// ============================================================
// BallStyles.js — Golf ball skins with proper equirectangular textures
// ============================================================

import { CanvasTexture, TextureLoader, SRGBColorSpace, RepeatWrapping, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter } from 'three';

const S = 1024; // Higher resolution for quality

// --- Basketball Generator ---
// 2:1 equirectangular texture with correct sinusoidal seams, pebbled leather,
// panel shading, and grooved channel look.
function makeBasketballTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // ── Base orange ───────────────────────────────────────────
  ctx.fillStyle = '#C84B00';
  ctx.fillRect(0, 0, W, H);

  // ── Panel shading — 8 panels divided by the 3 seam curves ──
  // Tint each panel slightly lighter/darker to break up flat look
  const A = H * 0.27;
  function seamY1(x) { return H / 2 - A * Math.sin(2 * Math.PI * x / W); }
  function seamY2(x) { return H / 2 - A * Math.cos(2 * Math.PI * x / W); }

  // Paint each column: above/below equator & above/below each sine
  for (let x = 0; x < W; x++) {
    const y1 = seamY1(x);
    const y2 = seamY2(x);
    const top    = Math.min(y1, y2, H / 2);
    const bot    = Math.max(y1, y2, H / 2);
    // Alternate panel tint by quadrant
    const tint = ((x < W / 2) ? 0 : 1) ^ (y1 < H / 2 ? 0 : 1) ? 18 : -12;
    ctx.fillStyle = `rgba(${tint > 0 ? 255 : 0},${Math.abs(tint * 0.4)|0},0,${Math.abs(tint) / 255})`;
    ctx.fillRect(x, 0, 1, H);
  }

  // ── Pebbled rubber surface ────────────────────────────────
  // Dense raised-dot pattern — real basketball has ~35,000 pebbles
  const seed = 42;
  let sx = seed;
  function srng() { sx = (sx * 1664525 + 1013904223) >>> 0; return sx / 0xffffffff; }

  for (let i = 0; i < 7000; i++) {
    const px = srng() * W;
    const py = srng() * H;
    const r  = 1.4 + srng() * 1.2;
    // Dark shadow below, bright highlight above — gives raised bump feel
    const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r * 1.4);
    g.addColorStop(0,   'rgba(255,140,40,0.22)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.0)');
    g.addColorStop(1,   'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Seam channel drawing helper ───────────────────────────
  function drawSeam(getY) {
    // Wide dark fill — the recessed rubber channel
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#1a0800';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 1) {
      const y = getY(x);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Inner black core
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 1) {
      const y = getY(x);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Thin bright highlight edge above seam — raised rim illusion
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,160,60,0.55)';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 1) {
      const y = getY(x) - 10;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawSeam(x => H / 2);           // equator
  drawSeam(seamY1);                // sine seam
  drawSeam(seamY2);                // cosine seam

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
  // 2:1 equirectangular canvas — image tiles twice (front and back of sphere).
  // Each tile covers 180° longitude so the design appears once on front, once on back.
  const w = img.width * 2;
  const h = img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  ctx.drawImage(img, 0,        0, img.width, h);
  ctx.drawImage(img, img.width, 0, img.width, h);

  return c;
}

function loadTexture(path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // If image is already roughly 2:1 (equirectangular), use it directly.
      // Otherwise tile 2× to produce a 2:1 canvas.
      const isEquirect = img.width / img.height >= 1.5;
      const canvas = isEquirect ? img : makeEquirectFromImage(img);
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

export { STYLE_DEFS };
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
    const canvas = makeFallbackCanvas(def.fallbackColor);
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
// These describe what the FLAT UNWRAPPED texture image should look like,
// designed to wrap correctly onto a 3D sphere.
export const AI_GENERATION_PROMPTS = {
  basketball: "A flat rectangular texture map for a 3D sphere. Solid orange pebbled leather background. Three thin black seam lines: one perfectly straight horizontal line across the exact vertical center, and two S-shaped wavy lines that travel horizontally from left edge to right edge — one in the upper half, one in the lower half — gently curving up then down. No sphere shape, no shading, no 3D, purely flat 2D artwork.",
  bomb: "A flat rectangular texture map for a 3D sphere. Solid matte black background. Bright orange glowing fuse cord snaking in a loose horizontal S-curve from left to right across the middle. Small orange ember sparks scattered around it. Cartoon style, flat 2D, no shading, no sphere shape.",
  ghost: "A flat rectangular texture map for a 3D sphere. Solid white background. In the center: two large black oval eyes side by side and a wide black curved smile below them. Subtle pale blue wash around the edges fading to white in the middle. Flat 2D illustration, no shading, no sphere shape.",
  tennis: "A flat rectangular texture map for a 3D sphere. Solid bright yellow-green felt texture background. Two bold white curved lines — one sweeping from bottom-left corner up to top-right, one sweeping from top-left corner down to bottom-right — crossing in an X in the center. Fuzzy felt look, flat 2D, no sphere shape, no 3D shading.",
  deathstar: "A flat rectangular texture map for a 3D sphere. Solid medium-gray metal background. Even grid of dark rectangular panel lines covering the whole image. A bold dark horizontal band runs straight across the vertical center. One large circular dish shape in the upper-right quadrant. Flat 2D, no shading, no sphere shape.",
  pumpkin: "A flat rectangular texture map for a 3D sphere. Solid bright orange background. Six evenly-spaced dark orange vertical stripe lines running top to bottom across the full image, giving a ribbed pumpkin look. In the center: two glowing triangle eyes and a jagged carved grin in a darker orange. Flat 2D, no 3D shading, no sphere shape.",
  soccer: "A flat rectangular texture map for a 3D sphere. White background. Black filled pentagon shapes distributed in a regular repeating pattern across the entire image, with white hexagons filling the gaps, like an unrolled soccer ball. Bold clean outlines, flat 2D, no sphere shape, no shading.",
  pixel: "A flat rectangular texture map for a 3D sphere. Large chunky pixel art, hard pixel edges. Solid orange skin tone fills the background. In the center: two white rectangular eyes with black pupils, a wide toothed pixel smile below. At the top: a solid blue pixel rectangle as a beanie hat. Bold flat colors, no gradients, no sphere shape.",
  football: "A flat rectangular texture map for a 3D sphere. Solid dark brown leather background with subtle grain. A thick white horizontal stripe band near the top edge and another near the bottom edge. In the center vertically: a column of small white oval lace stitches. Flat 2D, no 3D shading, no sphere shape.",
  donut: "A flat rectangular texture map for a 3D sphere. Thick pink frosting color fills the entire background. Dense colorful candy sprinkles — short red, yellow, blue, green rectangles — scattered randomly across the whole image. Flat 2D illustration, cartoon style, no sphere shape, no shading.",
  eightball: "A flat rectangular texture map for a 3D sphere. Pure glossy black background. Centered in the image: one large white filled circle. Inside the circle: a bold black number 8. Flat 2D graphic, high contrast, no shading, no sphere shape.",
  volleyball: "A flat rectangular texture map for a 3D sphere. White background. Three pairs of parallel curved stripe lines — one pair in blue sweeping from top-left to bottom-right, one in yellow sweeping the opposite direction, one in blue running across the horizontal center — forming the classic volleyball panel layout. Flat 2D, clean bold lines, no shading, no sphere shape.",
};
