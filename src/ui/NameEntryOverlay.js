// ============================================================
// NameEntryOverlay.js — animated cosmic frontpage
// ============================================================

const RANDOM_NAMES = [
  'COSMO', 'NOVA', 'VEGA', 'ORBIT', 'PULSAR',
  'QUARK', 'NEXUS', 'ZEPHYR', 'LYRA', 'DRACO',
  'RIGEL', 'SIRIUS', 'ALTAIR', 'PHOTON', 'COMET',
  'GLITCH', 'PIXEL', 'AXON', 'FLARE', 'ZENITH',
];

// ─── Cosmic Background Canvas ────────────────────────────────────────────────

class CosmosCanvas {
  constructor(container) {
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    container.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');
    this._t = 0;
    this._raf = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._initStars();
    this._initNebulae();
    this._initPlanets();
    this._initBalls();
    this._initComets();
  }

  _resize() {
    this._w = this._canvas.width  = this._canvas.offsetWidth  || window.innerWidth;
    this._h = this._canvas.height = this._canvas.offsetHeight || window.innerHeight;
    this._initNebulae();
  }

  // ── Stars ──────────────────────────────────────────────────
  _initStars() {
    this._stars = [];
    const count = Math.min(320, Math.floor((this._w * this._h) / 4000));
    for (let i = 0; i < count; i++) {
      this._stars.push({
        x:     Math.random() * this._w,
        y:     Math.random() * this._h,
        r:     Math.random() * 1.4 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
        // subtle drift
        vx:   (Math.random() - 0.5) * 0.015,
        vy:   (Math.random() - 0.5) * 0.015,
        // color tint
        hue:  Math.random() < 0.15 ? 200 + Math.random() * 60 : 0, // mostly white, some blue
        sat:  Math.random() < 0.15 ? 60 + Math.random() * 40 : 0,
      });
    }
  }

  // ── Nebulae ────────────────────────────────────────────────
  _initNebulae() {
    const w = this._w, h = this._h;
    this._nebulae = [
      { x: w * 0.15, y: h * 0.25, rx: w * 0.28, ry: h * 0.22, r: 210, g: 80,  b: 255, a: 0.055, vx: 0.008, vy: 0.005  },
      { x: w * 0.82, y: h * 0.65, rx: w * 0.32, ry: h * 0.28, r: 60,  g: 180, b: 255, a: 0.05,  vx:-0.006, vy:-0.004  },
      { x: w * 0.50, y: h * 0.85, rx: w * 0.40, ry: h * 0.18, r: 255, g: 60,  b: 160, a: 0.04,  vx: 0.004, vy:-0.006  },
      { x: w * 0.70, y: h * 0.20, rx: w * 0.22, ry: h * 0.20, r: 60,  g: 255, b: 200, a: 0.035, vx:-0.005, vy: 0.007  },
    ];
  }

  // ── Planets ────────────────────────────────────────────────
  _initPlanets() {
    const w = this._w, h = this._h;
    this._planets = [
      {
        // large ringed planet, top-right
        x: w * 0.82, y: h * 0.18, r: 52,
        colors: ['#c07040', '#e09060', '#b86030'],
        ringColor: 'rgba(200,150,80,0.45)',
        ringTilt: 0.28, ringScale: 2.1,
        speed: 0.00006, angle: 0.4,
        orbitX: w * 0.82, orbitY: h * 0.18, orbitR: 18,
        stripes: [[0.2,'#d08050'],[0.5,'#c07040'],[0.8,'#b86030']],
      },
      {
        // blue ice planet, bottom-left
        x: w * 0.12, y: h * 0.78, r: 36,
        colors: ['#3060c0', '#4080e0', '#206090'],
        ringColor: null,
        speed: 0.00009, angle: 2.1,
        orbitX: w * 0.12, orbitY: h * 0.78, orbitR: 12,
        stripes: [[0.3,'#4080e0'],[0.65,'#3060c0'],[0.9,'#206090']],
      },
      {
        // small purple planet, top-left
        x: w * 0.18, y: h * 0.55, r: 22,
        colors: ['#8030c0', '#a050e0', '#601090'],
        ringColor: 'rgba(160,80,220,0.35)',
        ringTilt: 0.18, ringScale: 1.8,
        speed: 0.00013, angle: 3.8,
        orbitX: w * 0.18, orbitY: h * 0.55, orbitR: 8,
        stripes: [[0.4,'#a050e0'],[0.75,'#8030c0']],
      },
      {
        // teal planet, mid-right
        x: w * 0.88, y: h * 0.54, r: 18,
        colors: ['#20a090', '#30c0b0', '#108070'],
        ringColor: null,
        speed: 0.00018, angle: 1.0,
        orbitX: w * 0.88, orbitY: h * 0.54, orbitR: 6,
        stripes: [],
      },
    ];
  }

  // ── Golf Balls ─────────────────────────────────────────────
  _initBalls() {
    this._balls = [];
    const count = 5;
    for (let i = 0; i < count; i++) this._spawnBall(true);
  }

  _spawnBall(randomProgress = false) {
    const w = this._w, h = this._h;

    // Pick a random start+end pair that traverses the screen
    const edge = Math.floor(Math.random() * 4);
    let sx, sy, ex, ey;
    const pad = 80;
    switch (edge) {
      case 0: sx = Math.random()*w; sy = -pad; break; // top
      case 1: sx = w+pad; sy = Math.random()*h; break; // right
      case 2: sx = Math.random()*w; sy = h+pad; break; // bottom
      default: sx = -pad; sy = Math.random()*h; break; // left
    }
    // Exit on opposite-ish side with some randomness
    ex = w - sx + (Math.random()-0.5)*w*0.5;
    ey = h - sy + (Math.random()-0.5)*h*0.5;

    // Bezier control point — add a gravity-like curve
    const cx = (sx+ex)/2 + (Math.random()-0.5)*w*0.6;
    const cy = (sy+ey)/2 + (Math.random()-0.5)*h*0.6;

    const dur = 5000 + Math.random() * 8000; // ms
    const hue = [200,280,160,340,40][Math.floor(Math.random()*5)];

    this._balls.push({
      sx, sy, ex, ey, cx, cy,
      dur,
      t: randomProgress ? Math.random() : 0,
      hue,
      trail: [],
      trailLen: 22,
    });
  }

  // ── Comets ─────────────────────────────────────────────────
  _initComets() {
    this._comets = [];
    this._nextComet = 2000 + Math.random() * 4000;
  }

  _spawnComet() {
    const w = this._w, h = this._h;
    const startY = Math.random() * h * 0.5;
    const len = 120 + Math.random() * 160;
    const angle = 0.3 + Math.random() * 0.5; // mostly diagonal
    const speed = 900 + Math.random() * 600; // px/s
    this._comets.push({
      x: -len, y: startY,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      len, dead: false,
    });
  }

  // ── Draw helpers ───────────────────────────────────────────
  _drawNebula(ctx, n, t) {
    const ox = Math.sin(t * n.vx * 20) * 30;
    const oy = Math.cos(t * n.vy * 20) * 20;
    const grad = ctx.createRadialGradient(n.x+ox, n.y+oy, 0, n.x+ox, n.y+oy, Math.max(n.rx, n.ry));
    grad.addColorStop(0, `rgba(${n.r},${n.g},${n.b},${n.a * 1.4})`);
    grad.addColorStop(0.4, `rgba(${n.r},${n.g},${n.b},${n.a})`);
    grad.addColorStop(1, `rgba(${n.r},${n.g},${n.b},0)`);
    ctx.save();
    ctx.translate(n.x+ox, n.y+oy);
    ctx.scale(n.rx / Math.max(n.rx, n.ry), n.ry / Math.max(n.rx, n.ry));
    ctx.translate(-(n.x+ox), -(n.y+oy));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(n.x+ox, n.y+oy, Math.max(n.rx, n.ry), 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  _drawPlanet(ctx, p, t) {
    const angle = p.angle + t * p.speed * 1000;
    const px = p.orbitX + Math.cos(angle) * p.orbitR;
    const py = p.orbitY + Math.sin(angle) * p.orbitR;

    ctx.save();
    ctx.translate(px, py);

    // Glow halo
    const halo = ctx.createRadialGradient(0, 0, p.r * 0.6, 0, 0, p.r * 2.2);
    halo.addColorStop(0, `rgba(${hexToRgb(p.colors[0])}, 0.18)`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 2.2, 0, Math.PI*2);
    ctx.fill();

    // Ring (back half) - draw before planet
    if (p.ringColor) {
      ctx.save();
      ctx.scale(1, p.ringTilt);
      ctx.strokeStyle = p.ringColor;
      ctx.lineWidth = p.r * 0.22;
      ctx.beginPath();
      ctx.arc(0, 0, p.r * p.ringScale, 0, Math.PI, false);
      ctx.stroke();
      ctx.restore();
    }

    // Clip to circle
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI*2);
    ctx.clip();

    // Base gradient
    const bodyGrad = ctx.createRadialGradient(-p.r*0.3, -p.r*0.3, 0, 0, 0, p.r*1.1);
    bodyGrad.addColorStop(0, p.colors[1]);
    bodyGrad.addColorStop(0.6, p.colors[0]);
    bodyGrad.addColorStop(1, p.colors[2]);
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);

    // Stripes (gas giant style)
    const spinAngle = t * p.speed * 800 * 0.5;
    for (const [pos, col] of p.stripes) {
      const sy = (Math.sin(spinAngle + pos * 6) * 0.2 + pos) * 2 - 1;
      const stripY = sy * p.r;
      const stripH = p.r * 0.18;
      if (stripY - stripH < p.r && stripY + stripH > -p.r) {
        const sg = ctx.createLinearGradient(0, stripY - stripH, 0, stripY + stripH);
        sg.addColorStop(0, col + '00');
        sg.addColorStop(0.5, col + '55');
        sg.addColorStop(1, col + '00');
        ctx.fillStyle = sg;
        ctx.fillRect(-p.r, stripY - stripH, p.r*2, stripH*2);
      }
    }

    // Specular highlight
    const spec = ctx.createRadialGradient(-p.r*0.28, -p.r*0.28, 0, -p.r*0.1, -p.r*0.1, p.r*0.65);
    spec.addColorStop(0, 'rgba(255,255,255,0.28)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);

    ctx.restore();

    // Ring (front half)
    if (p.ringColor) {
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, p.ringTilt);
      ctx.strokeStyle = p.ringColor;
      ctx.lineWidth = p.r * 0.22;
      ctx.beginPath();
      ctx.arc(0, 0, p.r * p.ringScale, Math.PI, Math.PI*2, false);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawBall(ctx, b) {
    if (b.trail.length < 2) return;
    // Trail
    for (let i = 1; i < b.trail.length; i++) {
      const alpha = (i / b.trail.length) * 0.55;
      const width = (i / b.trail.length) * 3.5;
      ctx.strokeStyle = `hsla(${b.hue}, 90%, 70%, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(b.trail[i-1].x, b.trail[i-1].y);
      ctx.lineTo(b.trail[i].x, b.trail[i].y);
      ctx.stroke();
    }

    // Ball
    const head = b.trail[b.trail.length - 1];
    const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 12);
    glow.addColorStop(0, `hsla(${b.hue}, 100%, 90%, 0.8)`);
    glow.addColorStop(0.4, `hsla(${b.hue}, 90%, 70%, 0.4)`);
    glow.addColorStop(1, `hsla(${b.hue}, 80%, 60%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 12, 0, Math.PI*2);
    ctx.fill();

    // Core
    const core = ctx.createRadialGradient(head.x - 1, head.y - 1, 0, head.x, head.y, 5);
    core.addColorStop(0, '#fff');
    core.addColorStop(1, `hsl(${b.hue}, 80%, 65%)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5, 0, Math.PI*2);
    ctx.fill();
  }

  _drawComet(ctx, c) {
    const grad = ctx.createLinearGradient(c.x - c.dx/Math.hypot(c.dx,c.dy) * c.len,
                                           c.y - c.dy/Math.hypot(c.dx,c.dy) * c.len,
                                           c.x, c.y);
    grad.addColorStop(0, 'rgba(200,230,255,0)');
    grad.addColorStop(0.7, 'rgba(200,230,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const len = Math.hypot(c.dx, c.dy);
    const nx = c.dx / len, ny = c.dy / len;
    ctx.moveTo(c.x - nx * c.len, c.y - ny * c.len);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();

    // Head flash
    const hg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 6);
    hg.addColorStop(0, 'rgba(255,255,255,0.9)');
    hg.addColorStop(1, 'rgba(200,230,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6, 0, Math.PI*2);
    ctx.fill();
  }

  // ── Animation loop ─────────────────────────────────────────
  start() {
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this._t += dt;
      this._update(dt);
      this._draw();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _update(dt) {
    const w = this._w, h = this._h;

    // Stars drift
    for (const s of this._stars) {
      s.x = (s.x + s.vx + w) % w;
      s.y = (s.y + s.vy + h) % h;
    }

    // Golf balls
    for (let i = this._balls.length - 1; i >= 0; i--) {
      const b = this._balls[i];
      b.t = Math.min(b.t + dt / (b.dur / 1000), 1);
      const u = b.t;
      const x = (1-u)*(1-u)*b.sx + 2*(1-u)*u*b.cx + u*u*b.ex;
      const y = (1-u)*(1-u)*b.sy + 2*(1-u)*u*b.cy + u*u*b.ey;
      b.trail.push({ x, y });
      if (b.trail.length > b.trailLen) b.trail.shift();
      if (b.t >= 1) {
        this._balls.splice(i, 1);
        this._spawnBall(false);
      }
    }

    // Comets
    this._nextComet -= dt * 1000;
    if (this._nextComet <= 0) {
      this._spawnComet();
      this._nextComet = 3000 + Math.random() * 5000;
    }
    for (let i = this._comets.length - 1; i >= 0; i--) {
      const c = this._comets[i];
      c.x += c.dx * dt;
      c.y += c.dy * dt;
      if (c.x > w + 200 || c.y > h + 200) this._comets.splice(i, 1);
    }
  }

  _draw() {
    const ctx = this._ctx;
    const w = this._w, h = this._h;
    const t = this._t;

    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bg = ctx.createRadialGradient(w*0.5, h*0.45, 0, w*0.5, h*0.5, Math.max(w, h) * 0.85);
    bg.addColorStop(0,   '#0a0820');
    bg.addColorStop(0.5, '#060514');
    bg.addColorStop(1,   '#020208');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Nebulae
    for (const n of this._nebulae) this._drawNebula(ctx, n, t);

    // Stars
    for (const s of this._stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
      const alpha = 0.4 + 0.6 * twinkle;
      if (s.sat > 0) {
        ctx.fillStyle = `hsla(${s.hue},${s.sat}%,90%,${alpha})`;
      } else {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.85 + 0.15 * twinkle), 0, Math.PI*2);
      ctx.fill();
    }

    // Comets
    for (const c of this._comets) this._drawComet(ctx, c);

    // Planets
    for (const p of this._planets) this._drawPlanet(ctx, p, t);

    // Golf balls
    for (const b of this._balls) this._drawBall(ctx, b);
  }
}

function hexToRgb(hex) {
  // hex like '#c07040' -> '192,112,64'
  const n = parseInt(hex.replace('#',''), 16);
  return `${(n>>16)&255},${(n>>8)&255},${n&255}`;
}

// ─── NameEntryOverlay ─────────────────────────────────────────────────────────

export class NameEntryOverlay {
  constructor() {
    this._resolve = null;
    this._cosmos = null;
    this._build();
  }

  _build() {
    // Outer container — full screen
    const overlay = document.createElement('div');
    overlay.id = 'name-entry-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:1000',
      'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
      'font-family:monospace', 'overflow:hidden',
    ].join(';');

    // Cosmos canvas lives inside the overlay (behind the card)
    this._cosmos = new CosmosCanvas(overlay);

    // Frosted glass card
    const card = document.createElement('div');
    card.style.cssText = [
      'position:relative', 'z-index:2',
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:22px',
      'width:min(420px,90vw)',
      'background:rgba(8,10,30,0.62)',
      'border:1px solid rgba(120,160,255,0.18)',
      'border-radius:20px',
      'padding:36px 32px 28px',
      'backdrop-filter:blur(20px)', '-webkit-backdrop-filter:blur(20px)',
      'box-shadow:0 0 60px rgba(80,100,255,0.18), 0 0 120px rgba(80,60,200,0.1), inset 0 1px 0 rgba(255,255,255,0.07)',
      'max-height:90vh', 'overflow-y:auto',
    ].join(';');

    // ── Title area ──────────────────────────────────────────
    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;';

    // Animated title
    const title = document.createElement('div');
    title.style.cssText = [
      'font-size:clamp(28px,7vw,52px)', 'font-weight:bold',
      'letter-spacing:8px', 'text-align:center',
      'background:linear-gradient(135deg,#a0d0ff 0%,#ffffff 35%,#c080ff 65%,#60d0ff 100%)',
      'background-size:200% 200%',
      '-webkit-background-clip:text', 'background-clip:text',
      '-webkit-text-fill-color:transparent',
      'filter:drop-shadow(0 0 24px rgba(120,160,255,0.7))',
      'animation:titleShimmer 4s ease-in-out infinite',
    ].join(';');
    title.textContent = 'COSMIC GOLF';

    const tagline = document.createElement('div');
    tagline.style.cssText = [
      'font-size:10px', 'letter-spacing:4px', 'text-align:center',
      'color:rgba(160,200,255,0.5)',
      'animation:taglinePulse 3s ease-in-out infinite',
    ].join(';');
    tagline.textContent = 'MULTIPLAYER · GRAVITY · MINI GOLF';

    // Decorative divider
    const divider = document.createElement('div');
    divider.style.cssText = [
      'width:100%', 'height:1px',
      'background:linear-gradient(90deg,transparent,rgba(120,160,255,0.4) 30%,rgba(180,120,255,0.4) 70%,transparent)',
      'margin:2px 0',
    ].join(';');

    titleWrap.appendChild(title);
    titleWrap.appendChild(tagline);
    titleWrap.appendChild(divider);

    // ── Name input ────────────────────────────────────────────
    const inputsWrap = document.createElement('div');
    inputsWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

    const nameLabel = this._makeLabel('YOUR CALLSIGN');
    const nameInput = this._makeInput(this._randomName(), 12);
    nameInput.addEventListener('input', () => { nameInput.value = nameInput.value.toUpperCase(); });
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._confirm(); });
    this._nameInput = nameInput;

    inputsWrap.appendChild(nameLabel);
    inputsWrap.appendChild(nameInput);

    // ── Play button ───────────────────────────────────────────
    const btn = document.createElement('button');
    btn.style.cssText = [
      'width:100%', 'position:relative', 'overflow:hidden',
      'background:linear-gradient(135deg,rgba(80,120,255,0.9) 0%,rgba(150,80,255,0.9) 100%)',
      'border:1px solid rgba(160,180,255,0.4)', 'border-radius:12px',
      'padding:16px 18px', 'color:#fff', 'font-family:monospace',
      'font-size:15px', 'letter-spacing:5px', 'cursor:pointer',
      'box-shadow:0 0 30px rgba(100,120,255,0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
      'transition:opacity 0.15s, transform 0.1s, box-shadow 0.2s',
      'text-shadow:0 0 10px rgba(200,220,255,0.8)',
    ].join(';');
    btn.innerHTML = '<span style="position:relative;z-index:1">LAUNCH INTO SPACE →</span>';

    // Shimmer overlay on button
    const shimmer = document.createElement('div');
    shimmer.style.cssText = [
      'position:absolute', 'inset:0',
      'background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.12) 50%,transparent 60%)',
      'background-size:200% 100%',
      'animation:btnShimmer 2.5s ease-in-out infinite',
    ].join(';');
    btn.appendChild(shimmer);

    btn.addEventListener('pointerenter', () => {
      btn.style.boxShadow = '0 0 50px rgba(120,140,255,0.7), inset 0 1px 0 rgba(255,255,255,0.15)';
      btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.boxShadow = '0 0 30px rgba(100,120,255,0.45), inset 0 1px 0 rgba(255,255,255,0.15)';
      btn.style.transform = 'translateY(0)';
    });
    btn.addEventListener('pointerdown', () => {
      btn.style.opacity = '0.75';
      btn.style.transform = 'scale(0.97)';
    });
    btn.addEventListener('pointerup', () => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1)';
      this._confirm();
    });

    // ── Achievements button ─────────────────────────────────────
    const achBtn = document.createElement('button');
    achBtn.style.cssText = [
      'width:100%',
      'background:rgba(30,40,80,0.5)',
      'border:1px solid rgba(100,160,255,0.2)', 'border-radius:10px',
      'padding:12px 16px', 'color:rgba(180,210,255,0.7)', 'font-family:monospace',
      'font-size:11px', 'letter-spacing:3px', 'cursor:pointer',
      'transition:all 0.2s', 'text-align:center',
    ].join(';');
    achBtn.textContent = '🏆  ACHIEVEMENTS';
    achBtn.addEventListener('pointerenter', () => {
      achBtn.style.borderColor = 'rgba(120,180,255,0.5)';
      achBtn.style.background = 'rgba(40,50,100,0.6)';
    });
    achBtn.addEventListener('pointerleave', () => {
      achBtn.style.borderColor = 'rgba(100,160,255,0.2)';
      achBtn.style.background = 'rgba(30,40,80,0.5)';
    });
    achBtn.addEventListener('click', () => this._showAchievements());
    this._achBtn = achBtn;

    // ── Rules ─────────────────────────────────────────────────
    const rules = document.createElement('div');
    rules.style.cssText = [
      'width:100%',
      'border-top:1px solid rgba(100,160,255,0.12)',
      'padding-top:16px', 'display:flex', 'flex-direction:column', 'gap:7px',
    ].join(';');

    const rulesTitle = document.createElement('div');
    rulesTitle.style.cssText = 'font-size:9px;letter-spacing:4px;color:rgba(140,180,255,0.4);margin-bottom:6px;';
    rulesTitle.textContent = 'HOW TO PLAY';

    const ruleItems = [
      ['🎯', 'Set your direction and pull on the power to charge your ball'],
      ['🪐', 'Use planet gravity to slingshot to the hole'],
      ['⛳', '10 holes — fewest strokes wins'],
      ['🌀', 'Sink into the black hole to finish the hole'],
      ['👥', 'Auto-joins multiplayer — compete live'],
      ['', 'Wormholes are portals straight to hole in ones - but can you hit it?'],
    ];

    rules.appendChild(rulesTitle);
    for (const [icon, text] of ruleItems) {
      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex', 'align-items:center', 'gap:12px',
        'color:rgba(190,215,255,0.55)', 'font-size:11px', 'letter-spacing:0.5px',
        'padding:4px 8px', 'border-radius:6px',
        'transition:background 0.2s',
      ].join(';');
      row.innerHTML = `<span style="font-size:15px;min-width:22px;text-align:center;filter:drop-shadow(0 0 4px rgba(200,200,255,0.4))">${icon}</span><span>${text}</span>`;
      row.addEventListener('pointerenter', () => { row.style.background = 'rgba(100,160,255,0.07)'; });
      row.addEventListener('pointerleave', () => { row.style.background = ''; });
      rules.appendChild(row);
    }

    // ── Assemble ──────────────────────────────────────────────
    card.appendChild(titleWrap);
    card.appendChild(inputsWrap);
    card.appendChild(btn);
    card.appendChild(this._achBtn);
    card.appendChild(rules);
    overlay.appendChild(card);

    // CSS animations injected once
    if (!document.getElementById('cosmos-styles')) {
      const style = document.createElement('style');
      style.id = 'cosmos-styles';
      style.textContent = `
        @keyframes titleShimmer {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes taglinePulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 0.85; }
        }
        @keyframes btnShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        #name-entry-overlay input::placeholder { color: rgba(140,180,255,0.35); }
        #name-entry-overlay input:focus { outline: none; }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    this._overlay = overlay;
  }

  setAchievementManager(mgr) {
    this._achievementMgr = mgr;
  }

  _showAchievements() {
    if (!this._achievementMgr) return;
    const all = this._achievementMgr.getAll();
    const unlocked = all.filter(a => a.unlocked).length;

    if (this._achPanel) this._achPanel.remove();

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2000',
      'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:flex-start',
      'background:rgba(4,6,20,0.92)',
      'backdrop-filter:blur(12px)', '-webkit-backdrop-filter:blur(12px)',
      'font-family:monospace', 'overflow-y:auto',
      'padding:40px 16px',
      'animation:fadeIn 0.2s ease',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:min(480px,90vw);margin-bottom:20px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:18px;font-weight:bold;letter-spacing:4px;color:#fff;';
    title.textContent = 'ACHIEVEMENTS';

    const count = document.createElement('div');
    count.style.cssText = 'font-size:12px;letter-spacing:2px;color:rgba(100,200,255,0.7);';
    count.textContent = `${unlocked}/${all.length} UNLOCKED`;

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = [
      'background:none', 'border:1px solid rgba(255,255,255,0.3)', 'border-radius:6px',
      'padding:6px 14px', 'color:rgba(255,255,255,0.7)', 'font-family:monospace',
      'font-size:11px', 'letter-spacing:2px', 'cursor:pointer', 'transition:all 0.15s',
    ].join(';');
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', () => panel.remove());
    closeBtn.addEventListener('pointerenter', () => { closeBtn.style.borderColor = '#fff'; closeBtn.style.color = '#fff'; });
    closeBtn.addEventListener('pointerleave', () => { closeBtn.style.borderColor = 'rgba(255,255,255,0.3)'; closeBtn.style.color = 'rgba(255,255,255,0.7)'; });

    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(closeBtn);

    const grid = document.createElement('div');
    grid.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(auto-fill,minmax(200px,1fr))',
      'gap:10px',
      'width:min(480px,90vw)',
    ].join(';');

    for (const a of all) {
      const card = document.createElement('div');
      card.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'padding:10px 12px', 'border-radius:8px',
        a.unlocked
          ? 'background:rgba(20,50,80,0.6);border:1px solid rgba(100,200,255,0.3);'
          : 'background:rgba(15,15,25,0.4);border:1px solid rgba(255,255,255,0.06);',
        'transition:transform 0.15s',
      ].join(';');
      card.addEventListener('pointerenter', () => { card.style.transform = 'scale(1.03)'; });
      card.addEventListener('pointerleave', () => { card.style.transform = 'scale(1)'; });

      const icon = document.createElement('span');
      icon.style.cssText = [
        'font-size:22px', 'flex-shrink:0', 'width:32px', 'text-align:center',
        a.unlocked ? 'filter:drop-shadow(0 0 6px rgba(100,200,255,0.5))' : 'opacity:0.25;filter:grayscale(1)',
      ].join(';');
      icon.textContent = a.icon;

      const text = document.createElement('div');
      text.innerHTML = [
        `<div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:${a.unlocked ? '#fff' : 'rgba(255,255,255,0.2)'}">${a.name}</div>`,
        `<div style="font-size:10px;margin-top:2px;color:${a.unlocked ? 'rgba(180,210,255,0.55)' : 'rgba(255,255,255,0.1)'};letter-spacing:0.5px">${a.desc}</div>`,
      ].join('');

      card.appendChild(icon);
      card.appendChild(text);
      grid.appendChild(card);
    }

    panel.appendChild(header);
    panel.appendChild(grid);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.style.cssText = [
      'margin-top:20px',
      'background:rgba(60,20,20,0.5)',
      'border:1px solid rgba(255,80,80,0.3)', 'border-radius:8px',
      'padding:10px 20px', 'color:rgba(255,120,120,0.8)', 'font-family:monospace',
      'font-size:11px', 'letter-spacing:2px', 'cursor:pointer', 'transition:all 0.2s',
    ].join(';');
    resetBtn.textContent = 'RESET ACHIEVEMENTS';
    resetBtn.addEventListener('pointerenter', () => {
      resetBtn.style.borderColor = 'rgba(255,80,80,0.7)';
      resetBtn.style.background = 'rgba(80,20,20,0.6)';
    });
    resetBtn.addEventListener('pointerleave', () => {
      resetBtn.style.borderColor = 'rgba(255,80,80,0.3)';
      resetBtn.style.background = 'rgba(60,20,20,0.5)';
    });
    resetBtn.addEventListener('click', () => {
      if (this._achievementMgr) {
        this._achievementMgr.reset();
        panel.remove();
        this._showAchievements();
      }
    });

    panel.appendChild(resetBtn);
    document.body.appendChild(panel);
    this._achPanel = panel;
  }

  _makeLabel(text) {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:9px;letter-spacing:3px;color:rgba(140,180,255,0.45);margin-bottom:-2px;padding-left:2px;';
    el.textContent = text;
    return el;
  }

  _makeInput(placeholder, maxLength) {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = maxLength;
    el.placeholder = placeholder;
    el.style.cssText = [
      'width:100%', 'box-sizing:border-box',
      'background:rgba(8,12,35,0.7)',
      'border:1px solid rgba(100,160,255,0.3)',
      'border-radius:10px', 'padding:13px 16px',
      'color:#fff', 'font-family:monospace', 'font-size:17px',
      'letter-spacing:5px', 'text-transform:uppercase',
      'transition:border-color 0.2s, box-shadow 0.2s',
    ].join(';');
    el.addEventListener('focus', () => {
      el.style.borderColor = 'rgba(120,170,255,0.7)';
      el.style.boxShadow = '0 0 20px rgba(80,120,255,0.25), inset 0 0 8px rgba(80,120,255,0.08)';
    });
    el.addEventListener('blur', () => {
      el.style.borderColor = 'rgba(100,160,255,0.3)';
      el.style.boxShadow = 'none';
    });
    return el;
  }

  _randomName() {
    return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  }

  _confirm() {
    const rawName = this._nameInput.value.trim().toUpperCase();
    const name = rawName.length > 0 ? rawName : (this._nameInput.placeholder || this._randomName());
    this._cosmos.stop();
    this._overlay.style.opacity = '0';
    this._overlay.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
      this._overlay.style.display = 'none';
      if (this._resolve) this._resolve({ name });
    }, 400);
  }

  /** Returns Promise<{ name: string }> */
  show() {
    this._nameInput.placeholder = this._randomName();
    this._overlay.style.display = 'flex';
    this._overlay.style.opacity = '1';
    this._cosmos.start();
    setTimeout(() => this._nameInput.focus(), 50);
    return new Promise(resolve => { this._resolve = resolve; });
  }
}
