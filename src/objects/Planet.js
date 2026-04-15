// ============================================================
// Planet.js — procedural planets with moons, rings, clouds, axial tilt
// ============================================================

import {
  Mesh, SphereGeometry, MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial,
  TorusGeometry, CircleGeometry, BackSide, Color, Group, AdditiveBlending,
  CanvasTexture, Vector3, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial,
  RepeatWrapping,
} from 'three';
import { GravityField } from '../effects/GravityField.js';

// ── Seeded RNG (no global state) ─────────────────────────────
function rng(seed) {
  seed = (seed ^ 61) ^ (seed >>> 16);
  seed = (seed + (seed << 3)) >>> 0;
  seed ^= seed >>> 4;
  seed = Math.imul(seed, 0x27d4eb2d) >>> 0;
  seed ^= seed >>> 15;
  return (seed >>> 0) / 0xffffffff;
}
// Sequence helper — call seq() repeatedly to get next value
function makeSeq(seed) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// ── Color helpers ────────────────────────────────────────────
function toHex(color) {
  return (typeof color === 'number') ? '#' + color.toString(16).padStart(6, '0') : color;
}
function parseRGB(hex) {
  const s = hex.replace('#', '');
  return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
}
function lighten(r,g,b,a,amt=50) {
  return `rgba(${Math.min(r+amt,255)},${Math.min(g+amt,255)},${Math.min(b+amt,255)},${a})`;
}
function darken(r,g,b,a,amt=40) {
  return `rgba(${Math.max(r-amt,0)},${Math.max(g-amt,0)},${Math.max(b-amt,0)},${a})`;
}

// ── Texture factories — 512px, high contrast ─────────────────

const R = 512;

function makeTextureTerran(color, seed) {
  const c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  const hex = toHex(color); const [r,g,b] = parseRGB(hex);
  const seq = makeSeq(seed);

  ctx.fillStyle = hex; ctx.fillRect(0,0,R,R);

  // Large ocean/land masses — solid fills, not transparent
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(seq()*R, seq()*R, 60+seq()*120, 40+seq()*100, seq()*Math.PI, 0, Math.PI*2);
    ctx.fillStyle = i%2===0
      ? `rgb(${Math.min(r+70,255)},${Math.min(g+70,255)},${Math.min(b+70,255)})`
      : `rgb(${Math.max(r-60,0)},${Math.max(g-60,0)},${Math.max(b-60,0)})`;
    ctx.fill();
  }
  // Smaller detail blobs
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.ellipse(seq()*R, seq()*R, 15+seq()*45, 10+seq()*35, seq()*Math.PI, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${Math.max(r-80,0)},${Math.max(g-80,0)},${Math.max(b-80,0)},0.85)`;
    ctx.fill();
  }
  // Bold polar caps
  const ice = ctx.createLinearGradient(0,0,0,R);
  ice.addColorStop(0,   'rgba(255,255,255,0.95)');
  ice.addColorStop(0.1, 'rgba(255,255,255,0.4)');
  ice.addColorStop(0.18,'rgba(255,255,255,0)');
  ice.addColorStop(0.82,'rgba(255,255,255,0)');
  ice.addColorStop(0.9, 'rgba(255,255,255,0.4)');
  ice.addColorStop(1,   'rgba(255,255,255,0.95)');
  ctx.fillStyle = ice; ctx.fillRect(0,0,R,R);
  return new CanvasTexture(c);
}

function makeTextureGas(color, seed) {
  const c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  const hex = toHex(color); const [r,g,b] = parseRGB(hex);
  const seq = makeSeq(seed);

  ctx.fillStyle = hex; ctx.fillRect(0,0,R,R);

  // Strong alternating bands — solid fills, dramatically different tones
  const bands = 7 + Math.floor(seq()*5);
  for (let i = 0; i < bands; i++) {
    const y = (i/bands)*R;
    const h = (R/bands) * (0.6 + seq()*0.8);
    const bright = i%2===0;
    const amt = 70 + seq()*50;
    ctx.fillStyle = bright
      ? `rgba(${Math.min(r+amt,255)},${Math.min(g+amt*0.8,255)},${Math.min(b+amt*0.5,255)},0.85)`
      : `rgba(${Math.max(r-amt*0.6,0)},${Math.max(g-amt*0.6,0)},${Math.max(b-amt*0.3,0)},0.75)`;
    ctx.fillRect(0, y, R, h);
  }
  // Wavy band edges
  for (let i = 0; i < bands; i++) {
    const y = (i/bands)*R;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= R; x += 20) {
      ctx.lineTo(x, y + (seq()-0.5)*18);
    }
    ctx.lineWidth = 3+seq()*5;
    ctx.strokeStyle = `rgba(${Math.min(r+90,255)},${Math.min(g+60,255)},${Math.max(b-20,0)},0.4)`;
    ctx.stroke();
  }
  // Bold storm ovals
  for (let i = 0; i < 2; i++) {
    const cx = seq()*R, cy = seq()*R;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 30+seq()*40, 18+seq()*22, seq()*Math.PI, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${Math.min(r+100,255)},${Math.min(g+80,255)},${Math.max(b-30,0)},0.7)`;
    ctx.fill();
    // Dark eye
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10+seq()*12, 6+seq()*8, seq()*Math.PI, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${Math.max(r-80,0)},${Math.max(g-80,0)},${Math.max(b-80,0)},0.8)`;
    ctx.fill();
  }
  return new CanvasTexture(c);
}

function makeTextureLava(color, seed) {
  const c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  const seq = makeSeq(seed);

  // Very dark base — almost black
  ctx.fillStyle = '#0e0200'; ctx.fillRect(0,0,R,R);

  // Cooled crust patches (dark grey-brown)
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.ellipse(seq()*R, seq()*R, 30+seq()*80, 20+seq()*60, seq()*Math.PI, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${40+seq()*30},${15+seq()*15},${5+seq()*10},0.9)`;
    ctx.fill();
  }
  // Bright glowing cracks — thick, vivid
  for (let i = 0; i < 28; i++) {
    const x1=seq()*R, y1=seq()*R, x2=seq()*R, y2=seq()*R;
    const gl = ctx.createLinearGradient(x1,y1,x2,y2);
    gl.addColorStop(0,   '#ff6600');
    gl.addColorStop(0.3, '#ffcc00');
    gl.addColorStop(0.7, '#ff4400');
    gl.addColorStop(1,   '#cc2200');
    ctx.strokeStyle = gl;
    ctx.lineWidth = 1.5 + seq()*4;
    ctx.shadowBlur = 8; ctx.shadowColor = '#ff6600';
    ctx.beginPath(); ctx.moveTo(x1,y1);
    ctx.quadraticCurveTo(seq()*R, seq()*R, x2, y2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // Bright magma pools
  for (let i = 0; i < 14; i++) {
    const x=seq()*R, y=seq()*R, rad=8+seq()*25;
    const gr = ctx.createRadialGradient(x,y,0,x,y,rad);
    gr.addColorStop(0,   'rgba(255,240,100,0.95)');
    gr.addColorStop(0.4, 'rgba(255,120,0,0.8)');
    gr.addColorStop(1,   'rgba(180,30,0,0)');
    ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2);
    ctx.fillStyle = gr; ctx.fill();
  }
  return new CanvasTexture(c);
}

function makeTextureIce(color, seed) {
  const c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  const [r,g,b] = parseRGB(toHex(color));
  const seq = makeSeq(seed);

  // Bright near-white base with a tint
  ctx.fillStyle = `rgb(${Math.min(r+130,255)},${Math.min(g+130,255)},${Math.min(b+140,255)})`;
  ctx.fillRect(0,0,R,R);

  // Deep blue-tinted ice blocks / sections
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.ellipse(seq()*R, seq()*R, 40+seq()*100, 30+seq()*80, seq()*Math.PI, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${Math.max(r-40,100)},${Math.max(g-30,130)},${Math.min(b+40,255)},0.35)`;
    ctx.fill();
  }
  // Bold fracture lines — clear blue-grey
  for (let i = 0; i < 22; i++) {
    const x1=seq()*R, y1=seq()*R;
    const x2=x1+(seq()-0.5)*200, y2=y1+(seq()-0.5)*200;
    ctx.strokeStyle = `rgba(${Math.max(r-60,60)},${Math.max(g-40,100)},${Math.min(b+60,255)},${0.5+seq()*0.4})`;
    ctx.lineWidth = 1+seq()*3;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }
  // Highlight glare
  const shine = ctx.createRadialGradient(R*0.3,R*0.25,0,R*0.45,R*0.45,R*0.5);
  shine.addColorStop(0, 'rgba(255,255,255,0.7)');
  shine.addColorStop(0.3,'rgba(255,255,255,0.2)');
  shine.addColorStop(1,  'rgba(255,255,255,0)');
  ctx.fillStyle = shine; ctx.fillRect(0,0,R,R);
  return new CanvasTexture(c);
}

function makeTextureRocky(color, seed) {
  const c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  const hex = toHex(color); const [r,g,b] = parseRGB(hex);
  const seq = makeSeq(seed);

  // ── Dark, varied base ──────────────────────────────────────
  ctx.fillStyle = `rgb(${Math.max(r-30,0)},${Math.max(g-30,0)},${Math.max(b-30,0)})`;
  ctx.fillRect(0,0,R,R);

  // ── Macro rock patches — large irregular blobs ────────────
  for (let i = 0; i < 18; i++) {
    const px = seq()*R, py = seq()*R;
    const prad = 20 + seq()*70;
    const bright = seq() > 0.5;
    const amt = 30 + seq()*50;
    const rr = bright ? Math.min(r+amt,255) : Math.max(r-amt,0);
    const gg = bright ? Math.min(g+amt*0.9,255) : Math.max(g-amt*0.9,0);
    const bb = bright ? Math.min(b+amt*0.8,255) : Math.max(b-amt*0.8,0);
    const pts = 5 + Math.floor(seq()*4);
    ctx.beginPath();
    for (let v = 0; v < pts; v++) {
      const a = (v/pts)*Math.PI*2 + seq()*0.6;
      const dist = prad * (0.55 + seq()*0.45);
      v === 0
        ? ctx.moveTo(px + Math.cos(a)*dist, py + Math.sin(a)*dist)
        : ctx.lineTo(px + Math.cos(a)*dist, py + Math.sin(a)*dist);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${0.35 + seq()*0.3})`;
    ctx.fill();
  }

  // ── Rock facets — medium irregular polygons with facet shading ──
  for (let i = 0; i < 40; i++) {
    const px = seq()*R, py = seq()*R;
    const sz = 8 + seq()*30;
    const sides = 4 + Math.floor(seq()*3); // 4–6 sides
    const lightAmt = (seq()-0.5) * 80; // positive = lit face, negative = shadow
    const rr = Math.max(0,Math.min(255, r + lightAmt));
    const gg = Math.max(0,Math.min(255, g + lightAmt*0.95));
    const bb = Math.max(0,Math.min(255, b + lightAmt*0.90));
    ctx.beginPath();
    for (let v = 0; v < sides; v++) {
      const a = (v/sides)*Math.PI*2 + seq()*0.5;
      const dist = sz * (0.5 + seq()*0.5);
      v === 0
        ? ctx.moveTo(px + Math.cos(a)*dist, py + Math.sin(a)*dist)
        : ctx.lineTo(px + Math.cos(a)*dist, py + Math.sin(a)*dist);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${0.5 + seq()*0.35})`;
    ctx.fill();
    // Thin dark edge line — crevice between facets
    ctx.strokeStyle = `rgba(${Math.max(r-60,0)},${Math.max(g-60,0)},${Math.max(b-60,0)},0.6)`;
    ctx.lineWidth = 0.8 + seq()*1.2;
    ctx.stroke();
  }

  // ── Surface scratches and fracture lines ──────────────────
  for (let i = 0; i < 35; i++) {
    const x1=seq()*R, y1=seq()*R;
    const len = 10 + seq()*60;
    const ang = seq()*Math.PI;
    const x2 = x1 + Math.cos(ang)*len;
    const y2 = y1 + Math.sin(ang)*len;
    const dark = seq() > 0.3; // mostly dark crevices, some bright veins
    ctx.strokeStyle = dark
      ? `rgba(${Math.max(r-70,0)},${Math.max(g-70,0)},${Math.max(b-70,0)},${0.4+seq()*0.4})`
      : `rgba(${Math.min(r+60,255)},${Math.min(g+55,255)},${Math.min(b+50,255)},${0.15+seq()*0.2})`;
    ctx.lineWidth = 0.5 + seq()*2.0;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }

  // ── Craters with depth gradient ───────────────────────────
  for (let i = 0; i < 8; i++) {
    const cx=seq()*R, cy=seq()*R, cr=12+seq()*45;
    // Shadow interior — radial gradient for depth illusion
    const shadow = ctx.createRadialGradient(cx-cr*0.2, cy-cr*0.2, 0, cx, cy, cr);
    shadow.addColorStop(0,   `rgba(${Math.min(r+20,255)},${Math.min(g+20,255)},${Math.min(b+20,255)},0.3)`);
    shadow.addColorStop(0.4, `rgba(${Math.max(r-50,0)},${Math.max(g-50,0)},${Math.max(b-50,0)},0.7)`);
    shadow.addColorStop(0.8, `rgba(${Math.max(r-90,0)},${Math.max(g-90,0)},${Math.max(b-90,0)},0.9)`);
    shadow.addColorStop(1.0, `rgba(0,0,0,0)`);
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI*2);
    ctx.fillStyle = shadow; ctx.fill();
    // Bright ejecta rim
    const rim = ctx.createRadialGradient(cx,cy,cr*0.82,cx,cy,cr*1.15);
    rim.addColorStop(0, `rgba(${Math.min(r+70,255)},${Math.min(g+65,255)},${Math.min(b+60,255)},0.8)`);
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx,cy,cr*1.15,0,Math.PI*2);
    ctx.fillStyle = rim; ctx.fill();
  }

  // ── Small pebble craters ──────────────────────────────────
  for (let i = 0; i < 28; i++) {
    const cx=seq()*R, cy=seq()*R, cr=2+seq()*9;
    const g2 = ctx.createRadialGradient(cx-cr*0.3,cy-cr*0.3,0,cx,cy,cr);
    g2.addColorStop(0,   `rgba(${Math.min(r+30,255)},${Math.min(g+30,255)},${Math.min(b+25,255)},0.5)`);
    g2.addColorStop(0.6, `rgba(${Math.max(r-60,0)},${Math.max(g-60,0)},${Math.max(b-55,0)},0.8)`);
    g2.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2);
    ctx.fillStyle = g2; ctx.fill();
  }

  // ── Specular glints — bright mineral flecks ───────────────
  for (let i = 0; i < 22; i++) {
    const gx=seq()*R, gy=seq()*R, gs=1+seq()*4;
    ctx.beginPath(); ctx.arc(gx,gy,gs,0,Math.PI*2);
    ctx.fillStyle = `rgba(${Math.min(r+120,255)},${Math.min(g+110,255)},${Math.min(b+100,255)},${0.25+seq()*0.35})`;
    ctx.fill();
  }

  return new CanvasTexture(c);
}

function makeTextureSand(color, seed) {
  const c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  const hex = toHex(color); const [r,g,b] = parseRGB(hex);
  const seq = makeSeq(seed);

  ctx.fillStyle = hex; ctx.fillRect(0,0,R,R);

  // Bold dune ridges — alternating light/shadow
  for (let i = 0; i < 18; i++) {
    const y = (i/18)*R + (seq()-0.5)*30;
    // Shadow trough
    ctx.beginPath(); ctx.moveTo(0,y);
    for (let x = 0; x <= R; x += 16) ctx.lineTo(x, y+(seq()-0.5)*24);
    ctx.lineTo(R,y+R/18); ctx.lineTo(0,y+R/18); ctx.closePath();
    ctx.fillStyle = `rgba(${Math.max(r-70,0)},${Math.max(g-70,0)},${Math.max(b-50,0)},0.65)`;
    ctx.fill();
    // Bright crest
    ctx.strokeStyle = `rgba(${Math.min(r+90,255)},${Math.min(g+80,255)},${Math.min(b+50,255)},0.7)`;
    ctx.lineWidth = 2+seq()*3;
    ctx.beginPath(); ctx.moveTo(0,y);
    for (let x = 0; x <= R; x += 16) ctx.lineTo(x, y+(seq()-0.5)*14);
    ctx.stroke();
  }
  // Wind streak marks
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = `rgba(${Math.min(r+60,255)},${Math.min(g+50,255)},${Math.max(b-20,0)},0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(seq()*R*0.3, seq()*R);
    ctx.lineTo(seq()*R*0.3+R*0.6, seq()*R);
    ctx.stroke();
  }
  return new CanvasTexture(c);
}

// ── Crater texture — dark scorched disc with bright ejecta rim ─

// ── City-lights texture — scattered warm/cool dots for TERRAN night side ─

function makeTextureCityLights(seed) {
  const c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, R, R);
  const seq = makeSeq(seed + 9999);

  const clusters = 6 + Math.floor(seq() * 7);
  for (let i = 0; i < clusters; i++) {
    const cx = seq() * R;
    const cy = seq() * R;
    const dots = 6 + Math.floor(seq() * 18);
    for (let j = 0; j < dots; j++) {
      const x = cx + (seq() - 0.5) * 80;
      const y = cy + (seq() - 0.5) * 55;
      const r = 0.6 + seq() * 2.4;
      const warm = seq() > 0.55; // orange-warm or blue-cool
      const a = 0.5 + seq() * 0.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = warm
        ? `rgba(255,${180 + Math.floor(seq() * 75)},${80 + Math.floor(seq() * 80)},${a})`
        : `rgba(${160 + Math.floor(seq() * 80)},${200 + Math.floor(seq() * 55)},255,${a})`;
      ctx.fill();
    }
  }
  return new CanvasTexture(c);
}

function makeCraterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');

  // Scorched void center
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,    'rgba(0,   0,   0,   0.98)');
  g.addColorStop(0.30, 'rgba(8,   4,   2,   0.90)');
  g.addColorStop(0.55, 'rgba(30,  18,  8,   0.70)');
  g.addColorStop(0.70, 'rgba(190, 130, 60,  0.45)'); // ejecta glow rim
  g.addColorStop(0.82, 'rgba(220, 160, 70,  0.20)');
  g.addColorStop(1.00, 'rgba(0,   0,   0,   0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  // Tiny bright center — the impact flash scar
  const flash = ctx.createRadialGradient(64, 64, 0, 64, 64, 12);
  flash.addColorStop(0,   'rgba(255, 220, 160, 0.5)');
  flash.addColorStop(1,   'rgba(255, 220, 160, 0.0)');
  ctx.fillStyle = flash;
  ctx.fillRect(0, 0, 128, 128);

  return new CanvasTexture(c);
}

// ── Ring builder (can be tilted any direction) ────────────────

function buildRings(group, radius, color, seed) {
  const seq   = makeSeq(seed + 500);
  const col   = new Color(color);
  const tiltX = (seq() - 0.5) * Math.PI;      // wild random tilt
  const tiltZ = (seq() - 0.5) * Math.PI * 0.6;

  const ringGroup = new Group();
  ringGroup.rotation.x = tiltX;
  ringGroup.rotation.z = tiltZ;

  const ringDefs = [
    { rMult: 1.5 + seq()*0.3, tube: 0.4+seq()*0.4, opacity: 0.4+seq()*0.2 },
    { rMult: 1.9 + seq()*0.4, tube: 0.7+seq()*0.6, opacity: 0.3+seq()*0.2 },
    { rMult: 2.4 + seq()*0.4, tube: 0.4+seq()*0.3, opacity: 0.15+seq()*0.15 },
  ];

  for (const d of ringDefs) {
    const geo = new TorusGeometry(radius * d.rMult, d.tube, 4, 90);
    const mat = new MeshBasicMaterial({
      color: col, transparent: true, opacity: d.opacity,
      depthWrite: false, blending: AdditiveBlending,
    });
    ringGroup.add(new Mesh(geo, mat));
  }
  group.add(ringGroup);
  return ringGroup;
}

// ── Moon builder ─────────────────────────────────────────────

function buildMoon(group, parentRadius, color, seed) {
  const seq    = makeSeq(seed + 200);
  const moonR  = parentRadius * (0.08 + seq() * 0.14);
  const orbitR = parentRadius * (1.6 + seq() * 1.2);

  // Orbit group — rotated to random plane
  const orbit = new Group();
  orbit.rotation.x = (seq() - 0.5) * Math.PI;
  orbit.rotation.y = seq() * Math.PI * 2;
  orbit.rotation.z = (seq() - 0.5) * Math.PI * 0.5;
  group.add(orbit);

  const geo = new SphereGeometry(moonR, 12, 8);
  const col = new Color(color);
  // Moons are desaturated — grey-ish tint of parent color
  col.lerp(new Color(0x888888), 0.5);
  const mat = new MeshStandardMaterial({
    color: col, roughness: 0.9, metalness: 0,
  });
  const mesh = new Mesh(geo, mat);
  mesh.position.x = orbitR;
  orbit.add(mesh);

  return { orbit, speed: 0.15 + seq() * 0.4, mesh };
}

// ── Planet type selector ──────────────────────────────────────

function pickType(radius, s) {
  const v = rng(s * 7 + 13);
  if (radius > 22) return v < 0.55 ? 'GAS' : 'RINGED';
  if (radius < 13) return ['ROCKY','ICE','SAND'][Math.floor(v*3)];
  return ['TERRAN','LAVA','ICE','ROCKY','GAS','SAND'][Math.floor(v*6)];
}

// ── Planet class ─────────────────────────────────────────────

export class Planet {
  constructor({ position, radius, mass, color, seed = 0 }) {
    this.position = position;
    this.radius   = radius;
    this.mass     = mass;
    this.color    = color;
    this.type     = pickType(radius, seed);

    const seq        = makeSeq(seed);
    this._spinSpeed  = (seq() - 0.5) * 0.15;   // can spin either direction, varied speed
    this._axialTilt  = (seq() - 0.5) * 0.7;    // tilt the whole planet
    this._textures   = [];
    this._moons      = [];
    this._craters    = [];

    this._t = 0; // time accumulator for animations

    this.group = new Group();
    this.group.position.copy(position);

    // Tilt the planet body
    this.bodyGroup = new Group();
    this.bodyGroup.rotation.z = this._axialTilt;
    this.group.add(this.bodyGroup);

    this._buildMesh(seq);
    this._buildAtmosphere();
    this._buildTrajectoryHighlight();
    this._buildExtras(seq, seed);

    this.gravityField = new GravityField(position, radius, mass, color);

    this._celebrationRings = [];   // { mesh, life, rate, startR, maxR }
    this._celebrationAuroraT = 0; // > 0 while aurora is active

    this._trajHighlight = null;   // 'target' | 'behind' | null
    this._trajHighlightMesh = null;
  }

  _buildMesh(seq) {
    const geo = new SphereGeometry(this.radius, 40, 30);
    const s   = Math.floor(seq() * 99999);

    let texture;
    switch (this.type) {
      case 'GAS':    texture = makeTextureGas(this.color, s);    break;
      case 'LAVA':   texture = makeTextureLava(this.color, s);   break;
      case 'ICE':    texture = makeTextureIce(this.color, s);    break;
      case 'ROCKY':  texture = makeTextureRocky(this.color, s);  break;
      case 'SAND':   texture = makeTextureSand(this.color, s);   break;
      case 'RINGED': texture = makeTextureGas(this.color, s);    break;
      default:       texture = makeTextureTerran(this.color, s); break;
    }
    // Enable tiling on types that animate UV offset so scrolling wraps cleanly
    if (this.type === 'GAS' || this.type === 'RINGED' || this.type === 'SAND' || this.type === 'LAVA') {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.needsUpdate = true;
    }
    this._textures.push(texture);

    const isLava = this.type === 'LAVA';
    const isGas  = this.type === 'GAS' || this.type === 'RINGED';
    const isIce  = this.type === 'ICE';
    const col    = new Color(this.color);

    const emissiveInt = isLava ? 0.35
                      : isGas  ? 0.18
                      : isIce  ? 0.10
                      : 0.12;

    const sharedProps = {
      map:               texture,
      roughness:         isIce ? 0.1 : isGas ? 0.55 : 0.78,
      metalness:         isIce ? 0.15 : 0.0,
      emissive:          isLava ? new Color(0xff2200) : col,
      emissiveIntensity: emissiveInt,
    };

    // Opaque material — default, writes depth, fully solid
    this._matOpaque = new MeshStandardMaterial({ ...sharedProps });

    // Transparent material — only active when ball is behind this planet
    this._matTransparent = new MeshStandardMaterial({
      ...sharedProps,
      transparent: true,
      depthWrite:  false,
      opacity:     0.3,
    });

    // Store base values so setOpacity can desaturate without drifting
    this._baseEmissiveIntensity = emissiveInt;

    this._mat = this._matOpaque; // start opaque
    this.mesh = new Mesh(geo, this._mat);
    this.bodyGroup.add(this.mesh);
  }

  _buildAtmosphere() {
    const isLava = this.type === 'LAVA';
    const isGas  = this.type === 'GAS' || this.type === 'RINGED';
    const isIce  = this.type === 'ICE';

    const scale    = isLava ? 1.30 : isGas ? 1.24 : 1.20;
    const baseCol  = isLava ? new Color(0xff4400) : new Color(this.color);
    // Fresnel power: lower = wider glow, higher = tighter limb-only glow
    const power    = isIce ? 2.0 : isGas ? 2.6 : 3.2;
    const strength = isLava ? 0.85 : isGas ? 0.55 : isIce ? 0.38 : 0.30;

    this._baseGlowOpacity = strength;

    // ShaderMaterial fresnel — works with WebGLRenderer, same visual as TSL version.
    // Using abs(nDotV) handles BackSide normals correctly (edge-on = 0 → bright rim).
    const mat = new ShaderMaterial({
      uniforms: {
        glowColor: { value: baseCol.clone() },
        power:     { value: power },
        glowMult:  { value: strength },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vWorldNormal    = normalize(mat3(modelMatrix) * normal);
          vWorldPosition  = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position     = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  glowColor;
        uniform float power;
        uniform float glowMult;
        varying vec3  vWorldNormal;
        varying vec3  vWorldPosition;
        void main() {
          vec3  viewDir = normalize(cameraPosition - vWorldPosition);
          float nDotV   = abs(dot(normalize(vWorldNormal), viewDir));
          float fresnel = pow(1.0 - nDotV, power);
          gl_FragColor  = vec4(glowColor * fresnel * glowMult, 1.0);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    AdditiveBlending,
      side:        BackSide,
    });

    // Expose the uniform object — setOpacity() and update() write to .value directly
    this._glowMult = mat.uniforms.glowMult;

    const geo = new SphereGeometry(this.radius * scale, 24, 18);
    this.glowMesh = new Mesh(geo, mat);
    this.bodyGroup.add(this.glowMesh);
  }

  _buildTrajectoryHighlight() {
    const geo = new SphereGeometry(this.radius * 1.08, 20, 14);
    const mat = new MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      side: BackSide,
    });
    this._trajHighlightMesh = new Mesh(geo, mat);
    this.bodyGroup.add(this._trajHighlightMesh);
  }

  /**
   * Set trajectory-related highlight on this planet.
   * @param {'target'|'behind'|null} type - target = gold pulse, behind = red tint, null = clear
   * @param {number} intensity - 0 to 1
   */
  setTrajectoryHighlight(type, intensity = 0) {
    this._trajHighlight = type;
    this._trajHighlightIntensity = intensity;
  }

  _buildExtras(seq, seed) {
    const hasRings = this.type === 'RINGED'
      || (this.type === 'GAS' && seq() < 0.6)
      || seq() < 0.2; // any planet can randomly have rings

    if (hasRings) {
      this._ringGroup = buildRings(this.bodyGroup, this.radius, this.color, seed);
      this._ringSpinRate = (seq() - 0.5) * 0.06;
    }

    // Cloud layer for TERRAN and GAS
    if (this.type === 'TERRAN' || this.type === 'GAS') {
      const cloudGeo = new SphereGeometry(this.radius * 1.04, 28, 20);
      const cloudTex = makeTextureTerran(0xffffff, seed + 333);
      this._textures.push(cloudTex);
      const cloudMat = new MeshBasicMaterial({
        map: cloudTex, transparent: true,
        opacity: 0.12, depthWrite: false, blending: AdditiveBlending,
      });
      this._cloudMesh     = new Mesh(cloudGeo, cloudMat);
      this._cloudSpinRate = (seq() - 0.5) * 0.08;
      this.bodyGroup.add(this._cloudMesh);
    }

    // City lights for TERRAN — visible on the night side only (additive overlay)
    if (this.type === 'TERRAN') {
      const lightsTex = makeTextureCityLights(seed + 7777);
      this._textures.push(lightsTex);
      const lightsMat = new MeshBasicMaterial({
        map: lightsTex, transparent: true,
        opacity: 0.55, depthWrite: false, blending: AdditiveBlending,
      });
      this._cityLightsMesh = new Mesh(
        new SphereGeometry(this.radius * 1.002, 28, 20),
        lightsMat,
      );
      // City lights rotate very slowly opposite to clouds — subtle parallax
      this._cityLightsRate = -(this._cloudSpinRate ?? 0.04) * 0.3;
      this.bodyGroup.add(this._cityLightsMesh);
    }

    // 0–2 moons — larger planets more likely to have them
    const moonChance = this.radius > 18 ? 0.8 : this.radius > 13 ? 0.45 : 0.2;
    const moonCount  = seq() < moonChance ? (seq() < 0.35 ? 2 : 1) : 0;
    for (let i = 0; i < moonCount; i++) {
      this._moons.push(buildMoon(this.group, this.radius, this.color, seed + i * 1000 + 77));
    }

    // Gravitational lensing glow — large planets only (approx photon sphere)
    if (this.radius >= 18) {
      this._buildLensingGlow();
    }

    // Lava: animated overlay makes glowing cracks appear to flow
    if (this.type === 'LAVA') {
      this._buildLavaAnimation();
    }

    // Ice: specular shimmer overlay — starlight glinting off the frozen surface
    if (this.type === 'ICE') {
      this._buildIceShimmer();
    }
  }

  _buildIceShimmer() {
    // ShaderMaterial that produces animated specular glints on the ice surface.
    // A virtual light source rotates slowly, creating the impression of starlight
    // catching facets and ice crystals as the planet turns.
    const col = new Color(this.color);
    col.lerp(new Color(0xffffff), 0.75);

    const mat = new ShaderMaterial({
      uniforms: {
        shimmerColor: { value: col },
        shimmerTime:  { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vWorldNormal   = normalize(mat3(modelMatrix) * normal);
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position    = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  shimmerColor;
        uniform float shimmerTime;
        varying vec3  vWorldNormal;
        varying vec3  vWorldPosition;
        void main() {
          vec3 viewDir  = normalize(cameraPosition - vWorldPosition);
          // Slowly rotating virtual light — three overlapping sources for richness
          vec3 l1 = normalize(vec3(sin(shimmerTime * 0.27),  cos(shimmerTime * 0.19),  sin(shimmerTime * 0.13)));
          vec3 l2 = normalize(vec3(cos(shimmerTime * 0.21), -sin(shimmerTime * 0.31),  cos(shimmerTime * 0.17)));
          vec3 l3 = normalize(vec3(sin(shimmerTime * 0.15),  sin(shimmerTime * 0.23), -cos(shimmerTime * 0.29)));
          vec3 n  = normalize(vWorldNormal);
          float s1 = pow(max(0.0, dot(n, normalize(viewDir + l1))), 12.0);
          float s2 = pow(max(0.0, dot(n, normalize(viewDir + l2))), 18.0);
          float s3 = pow(max(0.0, dot(n, normalize(viewDir + l3))), 24.0);
          float shimmer = s1 * 0.22 + s2 * 0.16 + s3 * 0.10;
          gl_FragColor  = vec4(shimmerColor * shimmer, 1.0);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    AdditiveBlending,
    });

    this._iceShimmerMat = mat;
    const geo = new SphereGeometry(this.radius * 1.001, 36, 26);
    this._iceShimmerMesh = new Mesh(geo, mat);
    this.bodyGroup.add(this._iceShimmerMesh);
  }

  _buildLensingGlow() {
    // A thin blue-white halo just outside the atmosphere — mimics photon-sphere lensing
    const scale   = 1.22;
    const geo     = new SphereGeometry(this.radius * scale, 24, 18);
    const col     = new Color(this.color);
    // Shift toward blue-white to suggest light bending
    col.lerp(new Color(0x88ccff), 0.55);
    const mat = new MeshBasicMaterial({
      color: col, side: BackSide, transparent: true, opacity: 0.055,
      depthWrite: false, blending: AdditiveBlending,
    });
    this._lensingMesh = new Mesh(geo, mat);
    this.bodyGroup.add(this._lensingMesh);

    // Second, tighter ring — brighter limb edge
    const geo2 = new SphereGeometry(this.radius * 1.16, 20, 14);
    const mat2 = new MeshBasicMaterial({
      color: new Color(0xbbddff), side: BackSide, transparent: true, opacity: 0.04,
      depthWrite: false, blending: AdditiveBlending,
    });
    this._lensingMesh2 = new Mesh(geo2, mat2);
    this.bodyGroup.add(this._lensingMesh2);
  }

  _buildLavaAnimation() {
    // Overlay mesh with a cloned, tiling copy of the lava texture.
    // UV offset is incremented each frame in update() to make cracks appear to flow.
    // Additive blending: bright cracks/pools accumulate, dark crust stays invisible.
    const lavaTex = this._textures[0].clone();
    lavaTex.wrapS = lavaTex.wrapT = RepeatWrapping;
    lavaTex.needsUpdate = true;
    this._textures.push(lavaTex);

    const mat = new MeshBasicMaterial({
      map:         lavaTex,
      transparent: true,
      depthWrite:  false,
      blending:    AdditiveBlending,
      opacity:     0.22,
    });

    const geo = new SphereGeometry(this.radius * 1.002, 36, 26);
    this._lavaAnimMesh = new Mesh(geo, mat);
    this.bodyGroup.add(this._lavaAnimMesh);
  }

  /**
   * Stamp a fading crater decal at the world-space impact position.
   * The decal is parented to the spinning mesh so it stays on the surface.
   */
  addCrater(impactWorldPos, speed = 60) {
    if (this._craters.length >= 6) {
      // Remove oldest crater first so the planet doesn't accumulate forever
      const old = this._craters.shift();
      this.mesh.remove(old.mesh);
      old.geo.dispose(); old.mat.dispose(); old.tex.dispose();
    }

    // Convert world impact point into spinning-mesh local space
    const localPos    = this.mesh.worldToLocal(impactWorldPos.clone());
    const localNormal = localPos.clone().normalize();

    const s    = Math.min(speed / 120, 1.0);
    const size = this.radius * (0.04 + s * 0.30) + Math.random() * this.radius * 0.04;
    const geo  = new CircleGeometry(size, 20);
    const tex  = makeCraterTexture();
    const mat  = new MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.92,
      depthWrite: false,
    });

    const mesh = new Mesh(geo, mat);
    mesh.renderOrder = 2;
    // Place the disc just above the surface, oriented outward (+Z → normal)
    mesh.position.copy(localNormal).multiplyScalar(this.radius + 0.5);
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), localNormal);

    this.mesh.add(mesh);
    // Life 1→0 over ~8 seconds
    this._craters.push({ mesh, geo, mat, tex, life: 1.0, rate: 0.06 + Math.random() * 0.04 });
  }

  /**
   * Fire a celebratory burst: three expanding ring pulses + aurora flash.
   * Call when the player holes out near this planet.
   */
  triggerCelebration() {
    const col = new Color(this.color);
    col.lerp(new Color(0xffffff), 0.4);

    // Three rings, staggered delays
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.18; // seconds before ring starts expanding
      const geo = new TorusGeometry(this.radius * 1.4, 0.4, 4, 64);
      const mat = new MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.0,
        depthWrite: false, blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      this.group.add(mesh);
      this._celebrationRings.push({
        mesh, life: 1.0, rate: 0.55,
        startR: this.radius * 1.4,
        maxR:   this.radius * 4.5,
        delay,
        elapsed: -delay,
      });
    }

    // Aurora: briefly ramp up atmosphere glow opacity then fade
    this._celebrationAuroraT = 1.8;
  }

  setTrajectoryHighlight(type, intensity = 0) {
    this._trajHighlight = type;
    this._trajHighlightIntensity = intensity;
  }

  setOpacity(v) {
    if (v >= 0.99) {
      // Fully visible — restore opaque material and full glow
      this.mesh.material = this._matOpaque;
      if (this._glowMult) this._glowMult.value = this._baseGlowOpacity;
    } else {
      // Ball behind planet — desaturate + kill emissive so trajectory shows through clearly
      const mat = this._matTransparent;
      mat.opacity = v;
      // Grey out the texture tint: lerp mat.color from white toward mid-grey as it fades
      const grey = 0.30 + v * 0.70; // 0.30 at fully faded, 1.0 at opaque
      mat.color.setScalar(grey);
      // Crush emissive — bloom from a bright emissive drowns the cyan trajectory dots
      mat.emissiveIntensity = this._baseEmissiveIntensity * v * 0.25;
      this.mesh.material = mat;
      // Fade fresnel atmosphere so it doesn't bleed through and obscure the trajectory
      if (this._glowMult) this._glowMult.value = this._baseGlowOpacity * v * 0.4;
    }
  }

  update(dt, frozen = false) {
    this._t += dt;
    const t = this._t;

    // Self-rotation (frozen during STATIC event)
    if (!frozen) {
      this.mesh.rotation.y += this._spinSpeed * dt;
      if (this._cloudMesh)     this._cloudMesh.rotation.y     += this._cloudSpinRate  * dt;
      if (this._cityLightsMesh) this._cityLightsMesh.rotation.y += this._cityLightsRate * dt;
      if (this._ringGroup)     this._ringGroup.rotation.y     += this._ringSpinRate   * dt;
      for (const m of this._moons) {
        m.orbit.rotation.y += m.speed * dt;
      }
    }

    // Lava planet: emissive flicker + animated crack overlay
    if (this.type === 'LAVA') {
      const flicker = 0.28 + Math.sin(t * 3.9) * 0.09 + Math.sin(t * 7.3) * 0.05
                           + Math.sin(t * 13.1) * 0.02;
      this._matOpaque.emissiveIntensity      = flicker;
      this._matTransparent.emissiveIntensity = flicker * 0.25;
      // Scroll the lava overlay UV to make cracks appear to flow
      if (this._lavaAnimMesh) {
        const map = this._lavaAnimMesh.material.map;
        map.offset.set(t * 0.007, t * 0.003);
      }
    }

    // Gas/Ringed: scroll the main band texture directly — two atmospheric layers
    // (planet spin handles one axis; UV offset adds a perpendicular drift)
    if (this.type === 'GAS' || this.type === 'RINGED') {
      const map = this._matOpaque.map;
      if (map) map.offset.y = t * 0.006;
    }

    // Sand: diagonal UV drift so dunes appear to shift across the surface
    if (this.type === 'SAND') {
      const map = this._matOpaque.map;
      if (map) map.offset.set(t * 0.004, t * 0.002);
    }

    // Ice specular shimmer — update time uniform
    if (this._iceShimmerMat) {
      this._iceShimmerMat.uniforms.shimmerTime.value = t;
    }

    // Atmosphere breathe — gentle sine pulse on glow (skip while celebration is active)
    if (this._glowMult && this._celebrationAuroraT <= 0) {
      const pulse = 0.88 + Math.sin(t * 0.7 + this._axialTilt * 3) * 0.12;
      this._glowMult.value = this._baseGlowOpacity * pulse;
    }

    // Celebration ring pulses
    for (let i = this._celebrationRings.length - 1; i >= 0; i--) {
      const cr = this._celebrationRings[i];
      cr.elapsed += dt;
      if (cr.elapsed < 0) continue; // still in delay
      cr.life -= cr.rate * dt;
      if (cr.life <= 0) {
        this.group.remove(cr.mesh);
        cr.mesh.geometry.dispose();
        cr.mesh.material.dispose();
        this._celebrationRings.splice(i, 1);
        continue;
      }
      const progress = 1 - cr.life;
      const scale = cr.startR + (cr.maxR - cr.startR) * progress;
      cr.mesh.scale.setScalar(scale / cr.startR);
      // Peak opacity at 20% then fade
      const opacityEnv = progress < 0.2 ? (progress / 0.2) : cr.life;
      cr.mesh.material.opacity = opacityEnv * 0.55;
    }

    // Celebration aurora: temporarily boost atmosphere glow
    if (this._celebrationAuroraT > 0) {
      this._celebrationAuroraT -= dt;
      const auroraFrac = Math.min(1, this._celebrationAuroraT / 1.0);
      if (this._glowMult) {
        const baseStr = this.type === 'LAVA' ? 0.35 : this.type === 'ICE' ? 0.25 : 0.20;
        this._glowMult.value = baseStr + auroraFrac * 0.65;
      }
    }

    // Fade out craters
    for (let i = this._craters.length - 1; i >= 0; i--) {
      const cr = this._craters[i];
      cr.life -= cr.rate * dt;
      if (cr.life <= 0) {
        this.mesh.remove(cr.mesh);
        cr.geo.dispose(); cr.mat.dispose(); cr.tex.dispose();
        this._craters.splice(i, 1);
      } else {
        cr.mat.opacity = cr.life * 0.92;
      }
    }

    this.gravityField.update(dt);

    // Trajectory highlight animation
    if (this._trajHighlightMesh) {
      if (this._trajHighlight === 'target') {
        const pulse = this._trajHighlightIntensity * (0.7 + Math.sin(t * 5.0) * 0.3);
        this._trajHighlightMesh.material.color.setHex(0xffd700);
        this._trajHighlightMesh.material.opacity = pulse;
      } else if (this._trajHighlight === 'behind') {
        this._trajHighlightMesh.material.color.setHex(0xff2222);
        this._trajHighlightMesh.material.opacity = this._trajHighlightIntensity;
      } else {
        this._trajHighlightMesh.material.opacity = 0;
      }
    }
  }

  addToScene(scene) {
    scene.add(this.group);
    this.gravityField.addToScene(scene);
  }

  removeFromScene(scene) {
    scene.remove(this.group);
    this.gravityField.removeFromScene(scene);
    this.dispose();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this._matOpaque.dispose();
    this._matTransparent.dispose();
    for (const t of this._textures) t.dispose();
    this.glowMesh.geometry.dispose();
    this.glowMesh.material.dispose();
    if (this._lavaAnimMesh)   { this._lavaAnimMesh.geometry.dispose();   this._lavaAnimMesh.material.dispose(); }
    if (this._iceShimmerMesh) { this._iceShimmerMesh.geometry.dispose(); this._iceShimmerMesh.material.dispose(); }
    if (this._ringGroup) {
      this._ringGroup.traverse(c => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
    }
    if (this._cloudMesh)      { this._cloudMesh.geometry.dispose();      this._cloudMesh.material.dispose(); }
    if (this._cityLightsMesh) { this._cityLightsMesh.geometry.dispose(); this._cityLightsMesh.material.dispose(); }
    for (const m of this._moons) {
      m.mesh.geometry.dispose(); m.mesh.material.dispose();
    }
    for (const cr of this._craters) {
      cr.geo.dispose(); cr.mat.dispose(); cr.tex.dispose();
    }
    this._craters = [];

    for (const cr of this._celebrationRings) {
      cr.mesh.geometry.dispose(); cr.mesh.material.dispose();
    }
    this._celebrationRings = [];

    if (this._lensingMesh)  { this._lensingMesh.geometry.dispose();  this._lensingMesh.material.dispose(); }
    if (this._lensingMesh2) { this._lensingMesh2.geometry.dispose(); this._lensingMesh2.material.dispose(); }
    if (this._trajHighlightMesh) { this._trajHighlightMesh.geometry.dispose(); this._trajHighlightMesh.material.dispose(); }
  }
}
