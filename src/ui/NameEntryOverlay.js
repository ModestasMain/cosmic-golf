// ============================================================
// NameEntryOverlay.js — animated cosmic frontpage
// Tab navigation: LAUNCH | HOW TO PLAY | ACHIEVEMENTS
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';

const QUICK_NAMES = ['VEGA', 'NOVA', 'ORION', 'PULSAR'];

const RARITY = {
  FIRST_PLAY:        'common',
  FULL_POWER:        'common',
  OVER_15_STROKES:   'common',
  OUT_OF_BOUNDS:     'common',
  HOLE_1:            'common',
  HOLE_2:            'common',
  HOLE_3:            'common',
  HOLE_4:            'common',
  HOLE_5:            'common',
  HOLE_6:            'uncommon',
  HOLE_7:            'uncommon',
  HOLE_8:            'uncommon',
  HIT_PLAYER:        'uncommon',
  WORMHOLE:          'uncommon',
  BOUNCER:           'uncommon',
  COMEBACK_KING:     'uncommon',
  HOLE_9:            'rare',
  HOLE_10:           'rare',
  HOLE_IN_ONE:       'rare',
  UNDER_30_STROKES:  'rare',
  MARATHON:          'rare',
  SPEED_DEMON:       'rare',
  HOLE_IN_ONE_MASTER:'epic',
  UNDER_20_STROKES:  'epic',
  BILLIARD_PRO:      'epic',
  SHARPSHOOTER:      'epic',
};

const RARITY_STYLE = {
  common:   { text: '#9ab0c0', glow: 'rgba(154,176,192,0.3)',  border: 'rgba(154,176,192,0.2)'  },
  uncommon: { text: '#BFFF00', glow: 'rgba(191,255,0,0.3)',    border: 'rgba(191,255,0,0.25)'   },
  rare:     { text: '#00DDFF', glow: 'rgba(0,221,255,0.35)',   border: 'rgba(0,221,255,0.3)'    },
  epic:     { text: '#FF00CC', glow: 'rgba(255,0,204,0.4)',    border: 'rgba(255,0,204,0.3)'    },
};

const WORKER_HOST = 'cosmic-golf-mp.cosmicgolf.workers.dev';

// ─── Cosmos Canvas (rich animated background) ─────────────────────────────────

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
        vx:    (Math.random() - 0.5) * 0.015,
        vy:    (Math.random() - 0.5) * 0.015,
        hue:   Math.random() < 0.15 ? 200 + Math.random() * 60 : 0,
        sat:   Math.random() < 0.15 ? 60 + Math.random() * 40 : 0,
      });
    }
  }

  _initNebulae() {
    const w = this._w, h = this._h;
    this._nebulae = [
      { x: w * 0.15, y: h * 0.25, rx: w * 0.28, ry: h * 0.22, r: 170, g: 0,   b: 255, a: 0.065, vx: 0.008, vy: 0.005  },
      { x: w * 0.82, y: h * 0.65, rx: w * 0.32, ry: h * 0.28, r: 255, g: 0,   b: 204, a: 0.055, vx:-0.006, vy:-0.004  },
      { x: w * 0.50, y: h * 0.85, rx: w * 0.40, ry: h * 0.18, r: 0,   g: 221, b: 255, a: 0.040, vx: 0.004, vy:-0.006  },
      { x: w * 0.70, y: h * 0.20, rx: w * 0.22, ry: h * 0.20, r: 120, g: 0,   b: 255, a: 0.038, vx:-0.005, vy: 0.007  },
    ];
  }

  _initPlanets() {
    const w = this._w, h = this._h;
    this._planets = [
      {
        x: w * 0.82, y: h * 0.18, r: 52,
        colors: ['#c47aff', '#7b35d0', '#2a0a50'],
        ringColor: 'rgba(180,130,255,0.35)',
        ringTilt: 0.28, ringScale: 2.1,
        speed: 0.00006, angle: 0.4,
        orbitX: w * 0.82, orbitY: h * 0.18, orbitR: 18,
        stripes: [[0.2,'#c090ff'],[0.5,'#a060e0'],[0.8,'#7040b0']],
      },
      {
        x: w * 0.12, y: h * 0.78, r: 36,
        colors: ['#7ae8ff', '#1a6aaa', '#041528'],
        ringColor: 'rgba(100,220,255,0.25)',
        ringTilt: 0.20, ringScale: 1.9,
        speed: 0.00009, angle: 2.1,
        orbitX: w * 0.12, orbitY: h * 0.78, orbitR: 12,
        stripes: [[0.3,'#4080e0'],[0.65,'#3060c0'],[0.9,'#206090']],
      },
      {
        x: w * 0.18, y: h * 0.55, r: 22,
        colors: ['#FF00CC', '#880066', '#300020'],
        ringColor: 'rgba(255,0,204,0.3)',
        ringTilt: 0.18, ringScale: 1.8,
        speed: 0.00013, angle: 3.8,
        orbitX: w * 0.18, orbitY: h * 0.55, orbitR: 8,
        stripes: [[0.4,'#ff44cc'],[0.75,'#cc0088']],
      },
      {
        x: w * 0.88, y: h * 0.54, r: 18,
        colors: ['#ffe0b0', '#c87830', '#3a1800'],
        ringColor: null,
        speed: 0.00018, angle: 1.0,
        orbitX: w * 0.88, orbitY: h * 0.54, orbitR: 6,
        stripes: [],
      },
    ];
  }

  _initBalls() {
    this._balls = [];
    for (let i = 0; i < 5; i++) this._spawnBall(true);
  }

  _spawnBall(randomProgress = false) {
    const w = this._w, h = this._h;
    const edge = Math.floor(Math.random() * 4);
    let sx, sy;
    const pad = 80;
    switch (edge) {
      case 0: sx = Math.random()*w; sy = -pad; break;
      case 1: sx = w+pad; sy = Math.random()*h; break;
      case 2: sx = Math.random()*w; sy = h+pad; break;
      default: sx = -pad; sy = Math.random()*h; break;
    }
    const ex = w - sx + (Math.random()-0.5)*w*0.5;
    const ey = h - sy + (Math.random()-0.5)*h*0.5;
    const cx = (sx+ex)/2 + (Math.random()-0.5)*w*0.6;
    const cy = (sy+ey)/2 + (Math.random()-0.5)*h*0.6;
    const dur = 5000 + Math.random() * 8000;
    const hue = [280, 300, 200, 320, 260][Math.floor(Math.random()*5)];
    this._balls.push({ sx, sy, ex, ey, cx, cy, dur, t: randomProgress ? Math.random() : 0, hue, trail: [], trailLen: 22 });
  }

  _initComets() {
    this._comets = [];
    this._nextComet = 2000 + Math.random() * 4000;
  }

  _spawnComet() {
    const w = this._w, h = this._h;
    const startY = Math.random() * h * 0.5;
    const len = 120 + Math.random() * 160;
    const angle = 0.3 + Math.random() * 0.5;
    const speed = 900 + Math.random() * 600;
    this._comets.push({ x: -len, y: startY, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, len, dead: false });
  }

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

    const halo = ctx.createRadialGradient(0, 0, p.r * 0.6, 0, 0, p.r * 2.2);
    halo.addColorStop(0, `rgba(${hexToRgb(p.colors[0])}, 0.18)`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 2.2, 0, Math.PI*2);
    ctx.fill();

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

    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI*2);
    ctx.clip();

    const bodyGrad = ctx.createRadialGradient(-p.r*0.3, -p.r*0.3, 0, 0, 0, p.r*1.1);
    bodyGrad.addColorStop(0, p.colors[1]);
    bodyGrad.addColorStop(0.6, p.colors[0]);
    bodyGrad.addColorStop(1, p.colors[2]);
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);

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

    const spec = ctx.createRadialGradient(-p.r*0.28, -p.r*0.28, 0, -p.r*0.1, -p.r*0.1, p.r*0.65);
    spec.addColorStop(0, 'rgba(255,255,255,0.28)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);
    ctx.restore();

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
    for (let i = 1; i < b.trail.length; i++) {
      const alpha = (i / b.trail.length) * 0.55;
      ctx.strokeStyle = `hsla(${b.hue}, 90%, 70%, ${alpha})`;
      ctx.lineWidth = (i / b.trail.length) * 3.5;
      ctx.beginPath();
      ctx.moveTo(b.trail[i-1].x, b.trail[i-1].y);
      ctx.lineTo(b.trail[i].x, b.trail[i].y);
      ctx.stroke();
    }
    const head = b.trail[b.trail.length - 1];
    const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 12);
    glow.addColorStop(0, `hsla(${b.hue}, 100%, 90%, 0.8)`);
    glow.addColorStop(0.4, `hsla(${b.hue}, 90%, 70%, 0.4)`);
    glow.addColorStop(1, `hsla(${b.hue}, 80%, 60%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 12, 0, Math.PI*2);
    ctx.fill();
    const core = ctx.createRadialGradient(head.x - 1, head.y - 1, 0, head.x, head.y, 5);
    core.addColorStop(0, '#fff');
    core.addColorStop(1, `hsl(${b.hue}, 80%, 65%)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5, 0, Math.PI*2);
    ctx.fill();
  }

  _drawComet(ctx, c) {
    const len = Math.hypot(c.dx, c.dy);
    const nx = c.dx / len, ny = c.dy / len;
    const grad = ctx.createLinearGradient(c.x - nx * c.len, c.y - ny * c.len, c.x, c.y);
    grad.addColorStop(0, 'rgba(200,180,255,0)');
    grad.addColorStop(0.7, 'rgba(200,180,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x - nx * c.len, c.y - ny * c.len);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    const hg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 6);
    hg.addColorStop(0, 'rgba(255,255,255,0.9)');
    hg.addColorStop(1, 'rgba(200,180,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6, 0, Math.PI*2);
    ctx.fill();
  }

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
    for (const s of this._stars) {
      s.x = (s.x + s.vx + w) % w;
      s.y = (s.y + s.vy + h) % h;
    }
    for (let i = this._balls.length - 1; i >= 0; i--) {
      const b = this._balls[i];
      b.t = Math.min(b.t + dt / (b.dur / 1000), 1);
      const u = b.t;
      const x = (1-u)*(1-u)*b.sx + 2*(1-u)*u*b.cx + u*u*b.ex;
      const y = (1-u)*(1-u)*b.sy + 2*(1-u)*u*b.cy + u*u*b.ey;
      b.trail.push({ x, y });
      if (b.trail.length > b.trailLen) b.trail.shift();
      if (b.t >= 1) { this._balls.splice(i, 1); this._spawnBall(false); }
    }
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
    const bg = ctx.createRadialGradient(w*0.5, h*0.45, 0, w*0.5, h*0.5, Math.max(w, h) * 0.85);
    bg.addColorStop(0,   '#0a0820');
    bg.addColorStop(0.5, '#080516');
    bg.addColorStop(1,   '#040210');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    for (const n of this._nebulae) this._drawNebula(ctx, n, t);
    for (const s of this._stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
      const alpha = 0.4 + 0.6 * twinkle;
      ctx.fillStyle = s.sat > 0 ? `hsla(${s.hue},${s.sat}%,90%,${alpha})` : `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.85 + 0.15 * twinkle), 0, Math.PI*2);
      ctx.fill();
    }
    for (const c of this._comets) this._drawComet(ctx, c);
    for (const p of this._planets) this._drawPlanet(ctx, p, t);
    for (const b of this._balls) this._drawBall(ctx, b);
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  return `${(n>>16)&255},${(n>>8)&255},${n&255}`;
}

// ─── HowToPlayPanel (video cards grid) ───────────────────────────────────────

class HowToPlayPanel {
  constructor() {
    this._t = 0;
    this._raf = null;
    this._scenes = [];
    this._panel = this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'how-to-play-panel';
    panel.style.cssText = 'width:100%;max-width:860px;';

    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:28px;';
    header.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:5px;color:rgba(255,255,255,0.4);margin-bottom:10px;">PILOT BRIEFING</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:24px;font-weight:700;letter-spacing:3px;color:#fff;">HOW TO PLAY</div>
    `;
    panel.appendChild(header);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;';

    const defs = [
      { label: 'Aim & Drag to Shoot', desc: 'Master the pull-back mechanic. Line up your trajectory, factor in planetary gravity.', accent: '#AA00FF', icon: '🎯', num: '01', videoSrc: '/videos/aim.mp4',       fn: this._drawAimScene.bind(this)       },
      { label: 'Sink Into the Black Hole', desc: "Black holes aren't just obstacles — they're shortcuts. Calculate escape trajectories.", accent: '#00DDFF', icon: '🕳️', num: '02', videoSrc: '/videos/blackhole.mp4', fn: this._drawBlackholeScene.bind(this) },
      { label: 'Wormholes Are Portals', desc: 'Every wormhole has a twin. Map the portal network before you play and shave strokes.', accent: '#FF00CC', icon: '🌀', num: '03', videoSrc: '/videos/wormholes.mp4',  fn: this._drawWormholeScene.bind(this)  },
    ];

    for (const def of defs) {
      const card = document.createElement('div');
      card.style.cssText = [
        'border-radius:12px', 'overflow:hidden',
        'background:#0a0620',
        `border:1px solid rgba(255,255,255,0.08)`,
        'transition:transform 200ms, box-shadow 200ms',
        'cursor:default',
      ].join(';');
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-4px) scale(1.01)';
        card.style.boxShadow = `0 0 30px ${def.accent}44, 0 8px 40px rgba(0,0,0,0.5)`;
        card.style.borderColor = def.accent;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = '';
        card.style.borderColor = 'rgba(255,255,255,0.08)';
      });

      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 220;
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;';

      const mediaWrap = document.createElement('div');
      mediaWrap.style.cssText = `position:relative;width:100%;aspect-ratio:16/7;overflow:hidden;background:#0a0620;`;

      // Top accent line
      const topLine = document.createElement('div');
      topLine.style.cssText = `position:absolute;top:0;left:0;right:0;height:2px;background:${def.accent};opacity:0.85;z-index:2;`;
      mediaWrap.appendChild(topLine);

      // Number badge
      const numBadge = document.createElement('div');
      numBadge.style.cssText = `position:absolute;top:10px;left:10px;z-index:3;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.9);background:rgba(0,0,0,0.5);padding:3px 9px;border-radius:4px;backdrop-filter:blur(8px);`;
      numBadge.textContent = def.num;
      mediaWrap.appendChild(numBadge);

      mediaWrap.appendChild(canvas);

      const video = document.createElement('video');
      video.muted = true; video.loop = true; video.autoplay = true;
      video.playsInline = true; video.controls = false; video.preload = 'auto';
      video.src = def.videoSrc;
      video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;background:#000;';
      video.addEventListener('error', () => { video.style.display = 'none'; canvas.style.display = 'block'; });
      mediaWrap.appendChild(video);

      const info = document.createElement('div');
      info.style.cssText = 'padding:14px 16px 18px;';
      info.innerHTML = `
        <div style="font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;color:#fff;margin-bottom:7px;line-height:1.3;">${def.label}</div>
        <div style="font-family:'Inter Tight',sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.5);">${def.desc}</div>
        <div style="margin-top:12px;display:flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;color:${def.accent};">
          <div style="width:14px;height:1px;background:${def.accent};"></div>WATCH TUTORIAL
        </div>
      `;

      card.appendChild(mediaWrap);
      card.appendChild(info);
      grid.appendChild(card);
      this._scenes.push({ canvas, fn: def.fn, video });
    }

    panel.appendChild(grid);

    const tip = document.createElement('div');
    tip.style.cssText = 'margin-top:24px;padding:16px 20px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:14px;';
    tip.innerHTML = `
      <div style="font-size:26px;flex-shrink:0;">💡</div>
      <div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;color:#FFAA44;text-shadow:0 0 12px rgba(255,170,68,0.6);margin-bottom:4px;">PRO TIP</div>
        <div style="font-family:'Inter Tight',sans-serif;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.5;">Gravity is your friend. Every planet has a pull radius — fly close to slingshot your ball further than any human could swing.</div>
      </div>
    `;
    panel.appendChild(tip);

    return panel;
  }

  _drawAimScene(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#060410'); bg.addColorStop(1, '#080620');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc((i * 47.3 + 10) % w, (i * 31.7 + 15) % h, 0.6, 0, Math.PI*2); ctx.fill(); }
    const bx = w * 0.28, by = h * 0.5;
    const aimAngle = -0.3 + Math.sin(t * 0.9) * 0.45;
    const steps = 22;
    for (let i = 1; i < steps; i++) {
      const frac = i / steps;
      ctx.fillStyle = `rgba(170,0,255,${(1 - frac) * 0.55})`;
      ctx.beginPath();
      ctx.arc(bx + Math.cos(aimAngle) * frac * w * 0.6, by + Math.sin(aimAngle) * frac * w * 0.6, Math.max(0.5, 2 - frac * 1.5), 0, Math.PI*2);
      ctx.fill();
    }
    const pullLen = 38 + Math.sin(t * 0.9) * 14;
    const ax = bx + Math.cos(aimAngle + Math.PI) * pullLen;
    const ay = by + Math.sin(aimAngle + Math.PI) * pullLen;
    ctx.strokeStyle = 'rgba(255,0,204,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
    const ha = Math.atan2(ay - by, ax - bx);
    ctx.fillStyle = 'rgba(255,0,204,0.85)'; ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(ax - Math.cos(ha - 0.45) * 9, ay - Math.sin(ha - 0.45) * 9);
    ctx.lineTo(ax - Math.cos(ha + 0.45) * 9, ay - Math.sin(ha + 0.45) * 9); ctx.closePath(); ctx.fill();
    const bW = 52, bH = 4, bX = bx - bW/2, bY = by + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 2); ctx.fill();
    const power = 0.5 + 0.5 * Math.sin(t * 0.9 + 1.5);
    const pg = ctx.createLinearGradient(bX, 0, bX + bW, 0);
    pg.addColorStop(0, '#AA00FF'); pg.addColorStop(1, '#FF00CC');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(bX, bY, bW * power, bH, 2); ctx.fill();
    const glow = ctx.createRadialGradient(bx, by, 0, bx, by, 13);
    glow.addColorStop(0, 'rgba(200,100,255,0.3)'); glow.addColorStop(1, 'rgba(170,0,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI*2); ctx.fill();
    const core = ctx.createRadialGradient(bx - 1.5, by - 1.5, 0, bx, by, 5.5);
    core.addColorStop(0, '#fff'); core.addColorStop(1, '#cc88ff');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,68,0.7)'; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(255,170,68,0.1)';
    ctx.beginPath(); ctx.arc(ax, ay, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }

  _drawBlackholeScene(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w*0.5, h*0.5, 0, w*0.5, h*0.5, w*0.6);
    bg.addColorStop(0, '#08040f'); bg.addColorStop(1, '#030208');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 22; i++) { ctx.beginPath(); ctx.arc((i * 41.7 + 5) % w, (i * 37.3 + 8) % h, 0.5, 0, Math.PI*2); ctx.fill(); }
    const hx = w * 0.55, hy = h * 0.5;
    const diskGrad = ctx.createRadialGradient(hx, hy, 8, hx, hy, 44);
    diskGrad.addColorStop(0,   'rgba(80,0,120,0.0)'); diskGrad.addColorStop(0.4, 'rgba(120,40,180,0.38)');
    diskGrad.addColorStop(0.7, 'rgba(0,200,255,0.22)'); diskGrad.addColorStop(1, 'rgba(0,200,255,0)');
    ctx.fillStyle = diskGrad; ctx.beginPath(); ctx.ellipse(hx, hy, 44, 23, 0.2, 0, Math.PI*2); ctx.fill();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + t * 1.3;
      const r = 18 + Math.sin(i * 2.1) * 5;
      ctx.fillStyle = `hsla(${260 + i * 10},80%,60%,${0.3 + 0.3 * Math.sin(a * 2)})`;
      ctx.beginPath(); ctx.arc(hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.35, 1.5, 0, Math.PI*2); ctx.fill();
    }
    const coreGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, 14);
    coreGrad.addColorStop(0, '#000'); coreGrad.addColorStop(0.72, '#000');
    coreGrad.addColorStop(0.88, 'rgba(80,0,120,0.55)'); coreGrad.addColorStop(1, 'rgba(80,0,120,0)');
    ctx.fillStyle = coreGrad; ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI*2); ctx.fill();
    const fX = hx + 17, fY = hy - 27;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(fX, hy - 12); ctx.lineTo(fX, fY); ctx.stroke();
    ctx.fillStyle = 'rgba(255,0,204,0.85)';
    ctx.beginPath(); ctx.moveTo(fX, fY); ctx.lineTo(fX + 13, fY + 4); ctx.lineTo(fX, fY + 8); ctx.closePath(); ctx.fill();
    const orbitR = 38 - ((t * 0.12) % 1) * 22;
    const bAngle = t * 2.3;
    const ballX = hx + Math.cos(bAngle) * orbitR, ballY = hy + Math.sin(bAngle) * orbitR * 0.6;
    for (let i = 1; i <= 10; i++) {
      const ta = bAngle - i * 0.16, tr = orbitR + i * 0.5;
      ctx.fillStyle = `rgba(0,220,255,${(1 - i/10) * 0.38})`;
      ctx.beginPath(); ctx.arc(hx + Math.cos(ta) * tr, hy + Math.sin(ta) * tr * 0.6, Math.max(0.3, 2.5 - i * 0.18), 0, Math.PI*2); ctx.fill();
    }
    if (orbitR > 14) {
      const bG = ctx.createRadialGradient(ballX - 1, ballY - 1, 0, ballX, ballY, 5);
      bG.addColorStop(0, '#fff'); bG.addColorStop(1, '#00ccff');
      ctx.fillStyle = bG; ctx.beginPath(); ctx.arc(ballX, ballY, 4.5, 0, Math.PI*2); ctx.fill();
    }
  }

  _drawWormholeScene(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#050310'); bg.addColorStop(1, '#080618');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 20; i++) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.arc((i * 53.1 + 7) % w, (i * 29.7 + 11) % h, 0.5, 0, Math.PI*2); ctx.fill(); }
    const w1x = w * 0.22, w1y = h * 0.5, w2x = w * 0.78, w2y = h * 0.5, pR = 19;
    const drawPortal = (px, py, h1, h2) => {
      const glowG = ctx.createRadialGradient(px, py, 0, px, py, pR * 2.2);
      glowG.addColorStop(0, `hsla(${h1},100%,60%,0.22)`); glowG.addColorStop(0.5, `hsla(${h2},80%,50%,0.1)`); glowG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowG; ctx.beginPath(); ctx.arc(px, py, pR * 2.2, 0, Math.PI*2); ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a1 = (i / 8) * Math.PI * 2 + t * 1.6, a2 = a1 + Math.PI * 0.22;
        ctx.strokeStyle = `hsla(${h1 + i * 15},90%,65%,${0.5 + 0.4 * Math.sin(t * 2 + i)})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(px, py, pR, a1, a2); ctx.stroke();
      }
      const innerG = ctx.createRadialGradient(px, py, 0, px, py, pR * 0.75);
      innerG.addColorStop(0, 'rgba(0,0,0,0.95)'); innerG.addColorStop(0.6, `hsla(${h1},80%,10%,0.8)`); innerG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = innerG; ctx.beginPath(); ctx.arc(px, py, pR, 0, Math.PI*2); ctx.fill();
    };
    drawPortal(w1x, w1y, 280, 300); drawPortal(w2x, w2y, 310, 330);
    ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,0,204,0.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w1x + pR + 4, w1y); ctx.lineTo(w2x - pR - 4, w2y); ctx.stroke(); ctx.setLineDash([]);
    const cycle = (t * 0.55) % 1;
    let ballX = 0, ballY = w1y, ballVisible = true, ballScale = 1;
    if (cycle < 0.10) { ballX = w1x - 55 + (cycle / 0.10) * 55; ballY = w1y; }
    else if (cycle < 0.18) { const p = (cycle - 0.10) / 0.08; ballX = w1x; ballY = w1y; ballScale = 1 - p; if (ballScale <= 0) ballVisible = false; }
    else if (cycle < 0.48) { ballVisible = false; ballX = w1x; ballY = w1y; }
    else if (cycle < 0.56) { const p = (cycle - 0.48) / 0.08; ballX = w2x; ballY = w2y; ballScale = p; if (ballScale <= 0) ballVisible = false; }
    else if (cycle < 0.82) { const p = (cycle - 0.56) / 0.26; ballX = w2x + p * 60; ballY = w2y; }
    else { ballVisible = false; }
    if (ballVisible && ballScale > 0) {
      const trailDir = (cycle >= 0.56 && cycle < 0.82) ? -1 : 1;
      for (let i = 1; i <= 8; i++) {
        ctx.fillStyle = `rgba(255,100,255,${(1 - i/8) * 0.35 * Math.min(ballScale, 1)})`;
        ctx.beginPath(); ctx.arc(ballX + trailDir * i * -4, ballY, Math.max(0.2, (3 - i * 0.25) * ballScale), 0, Math.PI*2); ctx.fill();
      }
      const r = 5 * Math.min(ballScale, 1);
      if (r > 0.3) {
        const bG = ctx.createRadialGradient(ballX - 1, ballY - 1, 0, ballX, ballY, r);
        bG.addColorStop(0, '#fff'); bG.addColorStop(1, '#ff00cc');
        ctx.fillStyle = bG; ctx.beginPath(); ctx.arc(ballX, ballY, r, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.font = '8px monospace'; ctx.fillStyle = 'rgba(255,0,204,0.5)'; ctx.textAlign = 'center';
    ctx.fillText('IN', w1x, w1y + pR + 16); ctx.fillText('OUT', w2x, w2y + pR + 16);
  }

  start() {
    if (this._raf) return;
    for (const s of this._scenes) { if (s.video?.src) s.video.play().catch(() => {}); }
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now; this._t += dt;
      for (const s of this._scenes) {
        if (s.video && !s.video.error) continue;
        s.fn(s.canvas.getContext('2d'), s.canvas.width, s.canvas.height, this._t);
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    for (const s of this._scenes) { if (s.video) s.video.pause(); }
  }

  get element() { return this._panel; }
}

// ─── NameEntryOverlay ─────────────────────────────────────────────────────────

export class NameEntryOverlay {
  constructor() {
    this._resolve = null;
    this._cosmos = null;
    this._achievementMgr = null;
    this._activeTab = 'LAUNCH';
    this._howToPlay = new HowToPlayPanel();
    this._statsData = null;
    this._build();
    this._fetchStats();
  }

  _build() {
    // Inject styles
    if (!document.getElementById('cosmos-styles')) {
      const style = document.createElement('style');
      style.id = 'cosmos-styles';
      style.textContent = `
        @keyframes titleShimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes glowPulse {
          0%,100% { box-shadow: 0 0 20px #FF00CC, 0 0 60px rgba(255,0,204,0.3); }
          50%      { box-shadow: 0 0 35px #FF00CC, 0 0 90px rgba(170,0,255,0.4); }
        }
        @keyframes taglinePulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 0.85; }
        }
        @keyframes btnShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes revealBar {
          from { width: 0; }
          to   { width: var(--w, 0%); }
        }
        .cg-tab-content { animation: fadeUp 0.3s cubic-bezier(0.2,0.8,0.2,1) both; }
        #name-entry-overlay input::placeholder { color: rgba(255,255,255,0.25); }
        #name-entry-overlay input:focus { outline: none; }
        .cg-quick-btn:hover { border-color: #BFFF00 !important; color: #BFFF00 !important; box-shadow: 0 0 10px rgba(191,255,0,0.3) !important; }
        .cg-achievement-card.unlocked:hover { transform: translateY(-3px); }
        @media (max-width: 680px) {
          #cg-tabs { gap: 16px !important; }
          #cg-callsign-pill { display: none !important; }
        }
        @media (max-width: 480px) {
          #cg-tabs { gap: 10px !important; }
          #cg-nav-logo span { display: none; }
        }
      `;
      document.head.appendChild(style);
    }

    // Outer overlay
    const overlay = document.createElement('div');
    overlay.id = 'name-entry-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;font-family:monospace;overflow:hidden;';
    this._overlay = overlay;

    // Background canvas
    this._cosmos = new CosmosCanvas(overlay);

    // Main layout (above canvas)
    const layout = document.createElement('div');
    layout.style.cssText = 'position:relative;z-index:2;width:100%;height:100%;display:flex;flex-direction:column;';

    // ── Top nav ──────────────────────────────────────────────
    const nav = document.createElement('div');
    nav.style.cssText = 'flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:18px 32px 0;';

    // Logo
    const logo = document.createElement('div');
    logo.id = 'cg-nav-logo';
    logo.style.cssText = 'display:flex;align-items:center;gap:10px;';
    logo.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="11" fill="none" stroke="#AA00FF" stroke-width="1.5"/>
        <circle cx="14" cy="14" r="5" fill="#AA00FF" opacity="0.6"/>
        <circle cx="14" cy="5" r="2.5" fill="#00DDFF"/>
        <ellipse cx="14" cy="15" rx="18" ry="5" fill="none" stroke="#AA00FF" stroke-width="1" opacity="0.4" transform="rotate(-20,14,15)"/>
      </svg>
      <span style="font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;letter-spacing:3px;color:#fff;">COSMIC<span style="color:#AA00FF;">·</span>GOLF</span>
    `;

    // Tabs
    const tabsWrap = document.createElement('div');
    tabsWrap.id = 'cg-tabs';
    tabsWrap.style.cssText = 'display:flex;gap:28px;';

    const TABS = [
      { id: 'LAUNCH',       label: '⊕ LAUNCH'       },
      { id: 'HOW_TO_PLAY',  label: '▶ HOW TO PLAY'  },
      { id: 'ACHIEVEMENTS', label: '⟡ ACHIEVEMENTS'  },
    ];

    this._tabBtns = {};
    for (const tab of TABS) {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'background:none', 'border:none', 'cursor:pointer',
        `font-family:'JetBrains Mono',monospace`, 'font-size:11px', 'letter-spacing:3px',
        'padding:10px 0', 'position:relative', 'transition:color 200ms',
        'white-space:nowrap',
      ].join(';');

      const underline = document.createElement('div');
      underline.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:2px;border-radius:1px;background:#FF00CC;box-shadow:0 0 8px #FF00CC;transform:scaleX(0);transition:transform 220ms cubic-bezier(0.2,0.8,0.2,1);';
      btn.appendChild(underline);

      const label = document.createElement('span');
      label.textContent = tab.label;
      btn.appendChild(label);

      btn.addEventListener('click', () => this._switchTab(tab.id));
      btn.addEventListener('mouseenter', () => {
        underline.style.transform = 'scaleX(1)';
        btn.style.color = '#fff';
      });
      btn.addEventListener('mouseleave', () => {
        if (this._activeTab !== tab.id) underline.style.transform = 'scaleX(0)';
        btn.style.color = this._activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.45)';
      });

      this._tabBtns[tab.id] = { btn, underline };
      tabsWrap.appendChild(btn);
    }

    // Callsign pill
    const pill = document.createElement('div');
    pill.id = 'cg-callsign-pill';
    pill.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);';
    pill.innerHTML = `<div style="width:7px;height:7px;border-radius:50%;background:#5cff9a;box-shadow:0 0 8px #5cff9a;"></div><span id="cg-pill-name" style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.7);">ANONYMOUS</span>`;
    this._pillName = pill.querySelector('#cg-pill-name');

    nav.appendChild(logo);
    nav.appendChild(tabsWrap);
    nav.appendChild(pill);

    // Tab underline strip
    const strip = document.createElement('div');
    strip.style.cssText = 'height:1px;background:rgba(255,255,255,0.07);margin:12px 0 0;';

    // Scrollable content area
    const content = document.createElement('div');
    content.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;padding:32px 32px 40px;display:flex;justify-content:center;';
    this._contentArea = content;

    layout.appendChild(nav);
    layout.appendChild(strip);
    layout.appendChild(content);
    overlay.appendChild(layout);
    document.body.appendChild(overlay);

    this._renderTab('LAUNCH');
    this._updateTabStyles();
  }

  _switchTab(tabId) {
    if (this._activeTab === tabId) return;
    this._activeTab = tabId;
    this._updateTabStyles();
    this._renderTab(tabId);

    if (tabId === 'HOW_TO_PLAY') {
      this._howToPlay.start();
    } else {
      this._howToPlay.stop();
    }
  }

  _updateTabStyles() {
    for (const [id, { btn, underline }] of Object.entries(this._tabBtns)) {
      const active = id === this._activeTab;
      btn.style.color = active ? '#fff' : 'rgba(255,255,255,0.45)';
      underline.style.transform = active ? 'scaleX(1)' : 'scaleX(0)';
    }
  }

  _renderTab(tabId) {
    this._contentArea.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'cg-tab-content';

    if (tabId === 'LAUNCH') {
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding-top:16px;width:100%;max-width:460px;';
      wrap.appendChild(this._buildLaunchTab());
    } else if (tabId === 'HOW_TO_PLAY') {
      wrap.style.cssText = 'width:100%;max-width:900px;';
      wrap.appendChild(this._howToPlay.element);
    } else if (tabId === 'ACHIEVEMENTS') {
      wrap.style.cssText = 'width:100%;max-width:900px;';
      wrap.appendChild(this._buildAchievementsTab());
    }

    this._contentArea.appendChild(wrap);
  }

  _buildLaunchTab() {
    const frag = document.createDocumentFragment();

    // Title
    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'text-align:center;margin-bottom:8px;display:flex;flex-direction:column;align-items:center;gap:6px;';
    titleWrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
        <svg width="20" height="20" viewBox="0 0 22 22" style="flex-shrink:0;">
          <circle cx="11" cy="11" r="8" fill="none" stroke="#AA00FF" stroke-width="1.5"/>
          <circle cx="11" cy="11" r="4" fill="#AA00FF" opacity="0.5"/>
          <circle cx="11" cy="4" r="2" fill="#00DDFF"/>
        </svg>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:5px;color:rgba(255,255,255,0.45);">Multiplayer · Gravity · Mini Golf</span>
      </div>
      <div style="font-family:'Orbitron',sans-serif;font-size:clamp(38px,6vw,64px);font-weight:900;letter-spacing:6px;text-align:center;line-height:1;background:linear-gradient(135deg,#fff 0%,#FF00CC 40%,#AA00FF 70%,#00DDFF 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px;">COSMIC<br/>GOLF</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:5px;color:rgba(255,255,255,0.3);margin-bottom:36px;">── SPACE EDITION ──</div>
    `;
    frag.appendChild(titleWrap);

    // Card
    const card = document.createElement('div');
    card.style.cssText = [
      'width:100%', 'background:rgba(10,6,26,0.78)',
      'border:1px solid rgba(255,0,204,0.3)',
      'border-radius:16px', 'padding:28px 24px 24px',
      'backdrop-filter:blur(20px)', '-webkit-backdrop-filter:blur(20px)',
      'box-shadow:0 0 0 1px rgba(170,0,255,0.15),0 0 60px rgba(170,0,255,0.08),0 24px 80px rgba(0,0,0,0.6)',
    ].join(';');

    // Callsign label
    const label = document.createElement('div');
    label.style.cssText = "display:block;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:4px;color:rgba(255,255,255,0.45);margin-bottom:8px;";
    label.textContent = 'YOUR CALLSIGN';
    card.appendChild(label);

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.placeholder = 'ENTER CALLSIGN';
    input.spellcheck = false;
    input.autocomplete = 'off';
    const savedName = localStorage.getItem('cg_callsign') || '';
    input.value = savedName;
    input.style.cssText = [
      'width:100%', 'box-sizing:border-box',
      'background:rgba(255,255,255,0.05)',
      'border:1px solid rgba(255,0,204,0.4)', 'border-radius:8px',
      'padding:15px 16px',
      'color:#fff', "font-family:'Orbitron',sans-serif",
      'font-size:16px', 'font-weight:600', 'letter-spacing:2px',
      'transition:border-color 200ms, box-shadow 200ms',
    ].join(';');
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
      this._pillName.textContent = input.value || 'ANONYMOUS';
      charCount.textContent = `${input.value.length}/16`;
      charCount.style.color = input.value.length > 12 ? '#FFAA44' : 'rgba(255,255,255,0.25)';
    });
    input.addEventListener('focus', () => {
      input.style.borderColor = '#FF00CC';
      input.style.boxShadow = '0 0 0 3px rgba(255,0,204,0.2),0 0 20px rgba(255,0,204,0.15)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'rgba(255,0,204,0.4)';
      input.style.boxShadow = 'none';
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') this._confirm(input); });
    this._nameInput = input;
    card.appendChild(input);

    // Char count row
    const charRow = document.createElement('div');
    charRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:5px;margin-bottom:20px;';
    const charCount = document.createElement('span');
    charCount.style.cssText = "font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(255,255,255,0.25);letter-spacing:1px;";
    charCount.textContent = `${savedName.length}/16`;
    charRow.appendChild(charCount);
    card.appendChild(charRow);

    // Launch button
    const btn = document.createElement('button');
    btn.style.cssText = [
      'width:100%', 'position:relative', 'overflow:hidden',
      'background:linear-gradient(135deg,#AA00FF,#FF00CC)',
      'border:none', 'border-radius:8px',
      'padding:17px 24px', 'color:#fff',
      "font-family:'Orbitron',sans-serif",
      'font-size:13px', 'font-weight:700', 'letter-spacing:3px', 'cursor:pointer',
      'transition:transform 120ms',
      'animation:glowPulse 3s ease-in-out infinite',
      'text-shadow:0 0 10px rgba(255,255,255,0.5)',
    ].join(';');
    btn.innerHTML = `<span style="position:relative;z-index:1;">LAUNCH INTO SPACE →</span><div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent);transform:translateX(-100%);transition:transform 0.5s;" class="cg-btn-shimmer"></div>`;
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.03)';
      btn.querySelector('.cg-btn-shimmer').style.transform = 'translateX(100%)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.querySelector('.cg-btn-shimmer').style.transform = 'translateX(-100%)';
    });
    btn.addEventListener('pointerdown', () => btn.style.transform = 'scale(0.97)');
    btn.addEventListener('pointerup', () => { btn.style.transform = 'scale(1)'; this._confirm(input); });
    card.appendChild(btn);

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'display:flex;align-items:center;gap:12px;margin:18px 0;';
    divider.innerHTML = `<div style="flex:1;height:1px;background:rgba(255,255,255,0.07);"></div><span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(255,255,255,0.25);letter-spacing:2px;">OR</span><div style="flex:1;height:1px;background:rgba(255,255,255,0.07);"></div>`;
    card.appendChild(divider);

    // Quick-play names
    const quickRow = document.createElement('div');
    quickRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    for (const name of QUICK_NAMES) {
      const qBtn = document.createElement('button');
      qBtn.className = 'cg-quick-btn';
      qBtn.style.cssText = [
        'padding:8px 14px', 'border-radius:6px',
        'border:1px solid rgba(255,255,255,0.1)',
        'background:rgba(255,255,255,0.04)',
        'color:rgba(255,255,255,0.55)',
        "font-family:'JetBrains Mono',monospace",
        'font-size:10px', 'letter-spacing:2px', 'cursor:pointer',
        'transition:all 150ms',
      ].join(';');
      qBtn.textContent = name;
      qBtn.addEventListener('click', () => {
        input.value = name;
        input.dispatchEvent(new Event('input'));
      });
      quickRow.appendChild(qBtn);
    }
    card.appendChild(quickRow);

    frag.appendChild(card);

    // Stats strip
    const stats = document.createElement('div');
    stats.style.cssText = 'margin-top:24px;display:flex;gap:0;border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;background:rgba(255,255,255,0.03);backdrop-filter:blur(10px);width:100%;';
    this._statsEl = stats;
    this._renderStats(stats);
    frag.appendChild(stats);

    return frag;
  }

  _renderStats(el) {
    const d = this._statsData;
    const items = [
      { label: 'PILOTS RANKED',  val: d ? String(d.count)    : '—',  color: '#00DDFF' },
      { label: 'BEST SCORE',     val: d ? String(d.bestScore) : '—',  color: '#FFAA44' },
      { label: 'HOLES IN ONE',   val: d ? String(d.hio)       : '—',  color: '#FF00CC' },
    ];
    el.innerHTML = items.map((s, i) => `
      <div style="padding:13px 0;flex:1;text-align:center;${i < 2 ? 'border-right:1px solid rgba(255,255,255,0.07);' : ''}">
        <div style="font-family:'Orbitron',sans-serif;font-weight:700;font-size:18px;color:${s.color};letter-spacing:1px;">${s.val}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:rgba(255,255,255,0.35);letter-spacing:2px;margin-top:4px;">${s.label}</div>
      </div>
    `).join('');
  }

  async _fetchStats() {
    try {
      const res = await fetch(`https://${WORKER_HOST}/global-leaderboard`);
      if (!res.ok) return;
      const { entries } = await res.json();
      if (!Array.isArray(entries)) return;
      const count = entries.length;
      const bestScore = count > 0 ? Math.min(...entries.map(e => e.totalStrokes)) : 0;
      // HIO estimation: entries with strokes <= 10 have at least one HIO
      const hio = entries.filter(e => e.totalStrokes <= 10).length;
      this._statsData = { count, bestScore, hio };
      if (this._statsEl) this._renderStats(this._statsEl);
    } catch {}
  }

  _buildAchievementsTab() {
    const container = document.createElement('div');

    const all = this._achievementMgr ? this._achievementMgr.getAll() : [];
    const unlocked = all.filter(a => a.unlocked).length;
    const pct = all.length > 0 ? Math.round((unlocked / all.length) * 100) : 0;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;';
    header.innerHTML = `
      <div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:5px;color:rgba(255,255,255,0.4);margin-bottom:8px;">PILOT RECORD</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:24px;font-weight:700;letter-spacing:2px;color:#fff;">ACHIEVEMENTS</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:'Orbitron',sans-serif;font-size:30px;font-weight:900;color:#FFAA44;letter-spacing:1px;text-shadow:0 0 18px rgba(255,170,68,0.5);">${unlocked}<span style="font-size:15px;color:rgba(255,255,255,0.4);">/${all.length}</span></div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,0.4);margin-top:3px;">UNLOCKED</div>
        <div style="margin-top:8px;height:4px;width:120px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;margin-left:auto;">
          <div style="height:100%;border-radius:2px;background:linear-gradient(90deg,#AA00FF,#FFAA44);width:${pct}%;animation:revealBar 1.2s cubic-bezier(0.2,0.8,0.2,1) 0.3s both;--w:${pct}%;"></div>
        </div>
      </div>
    `;
    container.appendChild(header);

    if (all.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = "text-align:center;padding:60px 20px;color:rgba(255,255,255,0.3);font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:3px;";
      empty.textContent = 'PLAY A GAME TO UNLOCK ACHIEVEMENTS';
      container.appendChild(empty);
      return container;
    }

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;';

    for (const a of all) {
      const rarity = RARITY[a.id] ?? 'common';
      const rc = RARITY_STYLE[rarity];
      const progress = a.progress ?? (a.unlocked ? 1 : 0);
      const max = a.max ?? 1;
      const progressPct = Math.round((progress / max) * 100);

      const card = document.createElement('div');
      card.className = `cg-achievement-card ${a.unlocked ? 'unlocked' : ''}`;
      card.style.cssText = [
        'border-radius:12px', 'padding:16px 16px 14px',
        a.unlocked
          ? `background:linear-gradient(135deg,rgba(20,12,40,0.9) 0%,rgba(30,15,55,0.9) 100%);border:1px solid ${rc.border};box-shadow:0 0 24px ${rc.glow};`
          : 'background:rgba(12,8,24,0.6);border:1px solid rgba(255,255,255,0.06);filter:grayscale(0.5) opacity(0.6);',
        'transition:transform 200ms',
      ].join(';');

      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
          <div style="font-size:28px;line-height:1;flex-shrink:0;${a.unlocked ? '' : 'filter:grayscale(1) opacity(0.4);'}">${a.icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;">
              <div style="font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;color:${a.unlocked ? '#fff' : 'rgba(255,255,255,0.45)'};letter-spacing:0.5px;line-height:1.3;">${a.name}</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:2px;color:${rc.text};padding:2px 6px;border-radius:3px;background:rgba(0,0,0,0.3);border:1px solid ${rc.border};white-space:nowrap;flex-shrink:0;">${rarity.toUpperCase()}</div>
            </div>
            <div style="font-family:'Inter Tight',sans-serif;font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px;line-height:1.4;">${a.desc}</div>
          </div>
        </div>
        <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">
          <div style="height:100%;border-radius:2px;${a.unlocked ? `background:linear-gradient(90deg,${rc.text}88,${rc.text});box-shadow:0 0 8px ${rc.text}88;` : 'background:rgba(255,255,255,0.12);'}width:${progressPct}%;animation:revealBar 1.2s cubic-bezier(0.2,0.8,0.2,1) 0.3s both;--w:${progressPct}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:5px;font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(255,255,255,0.3);">
          <span>${a.unlocked ? '✓ COMPLETE' : `${progress} / ${max}`}</span>
          <span style="color:${a.unlocked ? rc.text : 'rgba(255,255,255,0.3)'};">${progressPct}%</span>
        </div>
      `;

      grid.appendChild(card);
    }

    container.appendChild(grid);

    // Reset button
    if (this._achievementMgr) {
      const resetBtn = document.createElement('button');
      resetBtn.style.cssText = [
        'margin-top:20px',
        'background:rgba(60,20,20,0.5)',
        'border:1px solid rgba(255,80,80,0.3)', 'border-radius:8px',
        'padding:10px 20px', 'color:rgba(255,120,120,0.8)', "font-family:'JetBrains Mono',monospace",
        'font-size:11px', 'letter-spacing:2px', 'cursor:pointer', 'transition:all 0.2s',
      ].join(';');
      resetBtn.textContent = 'RESET ACHIEVEMENTS';
      resetBtn.addEventListener('mouseenter', () => { resetBtn.style.borderColor = 'rgba(255,80,80,0.7)'; resetBtn.style.background = 'rgba(80,20,20,0.6)'; });
      resetBtn.addEventListener('mouseleave', () => { resetBtn.style.borderColor = 'rgba(255,80,80,0.3)'; resetBtn.style.background = 'rgba(60,20,20,0.5)'; });
      resetBtn.addEventListener('click', () => {
        this._achievementMgr.reset();
        this._renderTab('ACHIEVEMENTS');
      });
      container.appendChild(resetBtn);
    }

    return container;
  }

  setAchievementManager(mgr) {
    this._achievementMgr = mgr;
  }

  _confirm(input) {
    const raw = (input ?? this._nameInput).value.trim().toUpperCase();
    const name = raw.length > 0 ? raw : (QUICK_NAMES[Math.floor(Math.random() * QUICK_NAMES.length)]);
    localStorage.setItem('cg_callsign', name);
    eventBus.emit(Events.GAME_LAUNCHED);
    this._cosmos.stop();
    this._howToPlay.stop();
    this._overlay.style.opacity = '0';
    this._overlay.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
      this._overlay.style.display = 'none';
      if (this._resolve) this._resolve({ name });
    }, 400);
  }

  /** Returns Promise<{ name: string }> */
  show() {
    this._overlay.style.display = 'flex';
    this._overlay.style.opacity = '1';
    this._cosmos.start();

    // Restore tab to LAUNCH
    if (this._activeTab !== 'LAUNCH') {
      this._activeTab = 'LAUNCH';
      this._updateTabStyles();
      this._renderTab('LAUNCH');
    }

    // Update pill from saved name
    const saved = localStorage.getItem('cg_callsign') || '';
    if (this._pillName) this._pillName.textContent = saved || 'ANONYMOUS';

    setTimeout(() => { if (this._nameInput) this._nameInput.focus(); }, 60);
    return new Promise(resolve => { this._resolve = resolve; });
  }
}
