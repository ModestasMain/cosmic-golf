// ============================================================
// Planet.js — procedural planets with moons, rings, clouds, axial tilt
// ============================================================

import {
  Mesh, SphereGeometry, MeshStandardMaterial, MeshBasicMaterial,
  TorusGeometry, BackSide, Color, Group, AdditiveBlending,
  CanvasTexture, Vector3,
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

  ctx.fillStyle = hex; ctx.fillRect(0,0,R,R);

  // Large craters with clear dark floor + bright rim
  for (let i = 0; i < 10; i++) {
    const cx=seq()*R, cy=seq()*R, cr=15+seq()*50;
    // Dark floor
    ctx.beginPath(); ctx.arc(cx,cy,cr*0.75,0,Math.PI*2);
    ctx.fillStyle = `rgb(${Math.max(r-80,0)},${Math.max(g-80,0)},${Math.max(b-80,0)})`;
    ctx.fill();
    // Bright ejecta rim
    const rim = ctx.createRadialGradient(cx,cy,cr*0.7,cx,cy,cr*1.1);
    rim.addColorStop(0, `rgba(${Math.min(r+80,255)},${Math.min(g+80,255)},${Math.min(b+80,255)},0.9)`);
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx,cy,cr*1.1,0,Math.PI*2);
    ctx.fillStyle = rim; ctx.fill();
  }
  // Small craters
  for (let i = 0; i < 20; i++) {
    const cx=seq()*R, cy=seq()*R, cr=4+seq()*12;
    ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2);
    ctx.fillStyle = `rgba(${Math.max(r-70,0)},${Math.max(g-70,0)},${Math.max(b-70,0)},0.85)`;
    ctx.fill();
  }
  // Rocky surface noise — coarse blocks
  for (let i = 0; i < 60; i++) {
    const lum = seq() > 0.5 ? 50 : -50;
    ctx.fillStyle = `rgba(${lum>0?255:0},${lum>0?255:0},${lum>0?255:0},0.12)`;
    ctx.fillRect(seq()*R, seq()*R, 6+seq()*14, 6+seq()*14);
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

    this.group = new Group();
    this.group.position.copy(position);

    // Tilt the planet body
    this.bodyGroup = new Group();
    this.bodyGroup.rotation.z = this._axialTilt;
    this.group.add(this.bodyGroup);

    this._buildMesh(seq);
    this._buildAtmosphere();
    this._buildExtras(seq, seed);

    this.gravityField = new GravityField(position, radius, mass, color);
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
    this._textures.push(texture);

    const isLava = this.type === 'LAVA';
    const col    = new Color(this.color);

    const sharedProps = {
      map:               texture,
      roughness:         this.type === 'ICE' ? 0.1 : this.type === 'GAS' ? 0.55 : 0.82,
      metalness:         this.type === 'ICE' ? 0.1 : 0.0,
      emissive:          isLava ? new Color(0xff2200) : col,
      emissiveIntensity: isLava ? 0.2 : 0.05,
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

    this._mat = this._matOpaque; // start opaque
    this.mesh = new Mesh(geo, this._mat);
    this.bodyGroup.add(this.mesh);
  }

  _buildAtmosphere() {
    const scale   = this.type === 'LAVA' ? 1.2 : 1.13;
    const opacity = this.type === 'LAVA' ? 0.1 : this.type === 'ICE' ? 0.07 : 0.04;
    const col     = this.type === 'LAVA' ? new Color(0xff4400) : new Color(this.color);
    const geo     = new SphereGeometry(this.radius * scale, 24, 18);
    const mat     = new MeshBasicMaterial({
      color: col, side: BackSide, transparent: true, opacity,
      depthWrite: false, blending: AdditiveBlending,
    });
    this.glowMesh = new Mesh(geo, mat);
    this.bodyGroup.add(this.glowMesh);
  }

  _buildExtras(seq, seed) {
    const hasRings = this.type === 'RINGED'
      || (this.type === 'GAS' && seq() < 0.6)
      || seq() < 0.2; // any planet can randomly have rings

    if (hasRings) {
      this._ringGroup = buildRings(this.group, this.radius, this.color, seed);
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

    // 0–2 moons — larger planets more likely to have them
    const moonChance = this.radius > 18 ? 0.8 : this.radius > 13 ? 0.45 : 0.2;
    const moonCount  = seq() < moonChance ? (seq() < 0.35 ? 2 : 1) : 0;
    for (let i = 0; i < moonCount; i++) {
      this._moons.push(buildMoon(this.group, this.radius, this.color, seed + i * 1000 + 77));
    }
  }

  setOpacity(v) {
    if (v >= 0.99) {
      // Fully visible — use solid opaque material
      this.mesh.material = this._matOpaque;
    } else {
      // Ball behind planet — swap to transparent material
      this._matTransparent.opacity = v;
      this.mesh.material = this._matTransparent;
    }
  }

  update(dt) {
    // Self-rotation
    this.mesh.rotation.y += this._spinSpeed * dt;
    if (this._cloudMesh) this._cloudMesh.rotation.y += this._cloudSpinRate * dt;

    // Moon orbits
    for (const m of this._moons) {
      m.orbit.rotation.y += m.speed * dt;
    }

    this.gravityField.update(dt);
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
    if (this._ringGroup) {
      this._ringGroup.traverse(c => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
    }
    if (this._cloudMesh) { this._cloudMesh.geometry.dispose(); this._cloudMesh.material.dispose(); }
    for (const m of this._moons) {
      m.mesh.geometry.dispose(); m.mesh.material.dispose();
    }
  }
}
