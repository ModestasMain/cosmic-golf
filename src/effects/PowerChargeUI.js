import { Vector2 } from 'three';

export class PowerChargeUI {
  constructor() {
    this.power = 0;
    this.visible = false;
    this._time = 0;
    this._ballX = window.innerWidth / 2;
    this._ballY = window.innerHeight / 2;
    this._particles = [];
    this._streaks = [];
    this._sparkles = [];
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);

    this._stars = [];
    for (let i = 0; i < 90; i++) {
      this._stars.push({
        x: Math.random(), y: Math.random(),
        r: 0.2 + Math.random() * 1.0,
        b: 0.10 + Math.random() * 0.25,
        tw: Math.random() * Math.PI * 2,
      });
    }

    this._buildCanvas();
    this._buildHint();
  }

  _buildCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = [
      'position:fixed', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:55',
      'display:none',
    ].join(';');
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this._resizeCanvas();
    this._onResize = () => this._resizeCanvas();
    window.addEventListener('resize', this._onResize);
  }

  _resizeCanvas() {
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * this._dpr;
    this.canvas.height = window.innerHeight * this._dpr;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }

  _buildHint() {
    this._hintEl = document.createElement('div');
    this._hintEl.style.cssText = [
      'position:fixed',
      'bottom:max(40px, calc(env(safe-area-inset-bottom, 0px) + 20px))',
      'left:50%', 'transform:translateX(-50%)',
      'color:rgba(100,210,255,0.45)',
      'font-family:monospace', 'font-size:11px',
      'letter-spacing:2.5px', 'white-space:nowrap',
      'pointer-events:none', 'z-index:56',
      'text-shadow:0 0 8px rgba(0,180,255,0.3), 0 0 20px rgba(0,120,255,0.12)',
      'display:none',
    ].join(';');
    this._hintEl.textContent = 'DRAG BACK FOR POWER \u2022 RELEASE TO SHOOT';
    document.body.appendChild(this._hintEl);
  }

  setBallScreenPos(x, y) { this._ballX = x; this._ballY = y; }
  setPower(p) { this.power = Math.max(0, Math.min(1, p)); }

  show() {
    this.visible = true;
    this.canvas.style.display = 'block';
    this._hintEl.style.display = 'block';
  }

  hide() {
    this.visible = false;
    this.canvas.style.display = 'none';
    this._hintEl.style.display = 'none';
    this.power = 0;
    this._particles = [];
    this._streaks = [];
    this._sparkles = [];
  }

  update(dt) {
    if (!this.visible) return;
    this._time += dt;
    if (this.power > 0.01) {
      this._spawnParticles();
      this._spawnStreaks();
      this._spawnSparkles();
    }
    this._updateParticles(dt);
    this._updateStreaks(dt);
    this._updateSparkles(dt);
    this._draw();
  }

  _bandLen() {
    return Math.min(260, (window.innerHeight - this._ballY) * 0.78, window.innerHeight * 0.34);
  }

  _spawnParticles() {
    if (this.power < 0.06) return;
    const ox = this._ballX;
    const oy = this._ballY;
    const len = this.power * this._bandLen();
    const n = Math.ceil(this.power * 2);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const bw = this._bandWidthAt(t, this.power);
      const side = Math.random() < 0.5 ? -1 : 1;
      const drift = side * (0.3 + Math.random() * 0.7) * bw;
      this._particles.push({
        x: ox + drift,
        y: oy + t * len,
        vx: (Math.random() - 0.5) * 14,
        vy: -18 - Math.random() * 35,
        life: 0.25 + Math.random() * 0.35,
        maxLife: 0.25 + Math.random() * 0.35,
        size: 0.6 + Math.random() * 1.8,
        t,
      });
    }
  }

  _spawnStreaks() {
    if (this.power < 0.15 || Math.random() > this.power * 0.4) return;
    const ox = this._ballX;
    const oy = this._ballY;
    const len = this.power * this._bandLen();
    const t = 0.1 + Math.random() * 0.8;
    const bw = this._bandWidthAt(t, this.power);
    this._streaks.push({
      t,
      x: ox + (Math.random() - 0.5) * bw * 0.6,
      y: oy + t * len,
      w: bw * (0.5 + Math.random() * 0.5),
      life: 0.12 + Math.random() * 0.18,
      maxLife: 0.12 + Math.random() * 0.18,
    });
  }

  _spawnSparkles() {
    if (this.power < 0.1 || Math.random() > this.power * 0.6) return;
    const ox = this._ballX;
    const oy = this._ballY;
    const len = this.power * this._bandLen();
    const t = Math.random();
    const bw = this._bandWidthAt(t, this.power);
    this._sparkles.push({
      x: ox + (Math.random() - 0.5) * bw,
      y: oy + t * len,
      life: 0.15 + Math.random() * 0.25,
      maxLife: 0.15 + Math.random() * 0.25,
      size: 1.5 + Math.random() * 3,
      t,
    });
  }

  _bandWidthAt(t, p) {
    const pinch = 3 + p * 3;
    const bow = 14 + p * 18;
    let w;
    if (t < 0.12) {
      const s = t / 0.12;
      w = pinch + s * (bow - pinch) * 2.2;
    } else if (t < 0.45) {
      const s = (t - 0.12) / 0.33;
      w = bow * 2.2 * (1 - s * 0.3);
    } else {
      const s = (t - 0.45) / 0.55;
      w = bow * 2.2 * 0.7 * (1 - s * 0.75);
    }
    return w;
  }

  _updateParticles(dt) {
    this._particles = this._particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      return p.life > 0;
    });
    if (this._particles.length > 100) this._particles = this._particles.slice(-100);
  }

  _updateStreaks(dt) {
    this._streaks = this._streaks.filter(s => {
      s.life -= dt;
      return s.life > 0;
    });
  }

  _updateSparkles(dt) {
    this._sparkles = this._sparkles.filter(s => {
      s.life -= dt;
      return s.life > 0;
    });
    if (this._sparkles.length > 40) this._sparkles = this._sparkles.slice(-40);
  }

  _draw() {
    const ctx = this.ctx;
    const W = window.innerWidth;
    const H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);

    this._drawStars(ctx, W, H);

    const ox = this._ballX;
    const oy = this._ballY;
    const p = this.power;
    const len = p * this._bandLen();

    if (len > 4) {
      this._drawBandGlow(ctx, ox, oy, len, p);
      this._drawBand(ctx, ox, oy, len, p);
      this._drawStreaks(ctx, ox, oy, len, p);
      this._drawSparkles(ctx);
    }

    this._drawParticles(ctx);

    if (p > 0.04) {
      this._drawTrajectory(ctx, ox, oy, p);
    }

    this._drawOrb(ctx, ox, oy, p);

    if (p > 0.02) {
      this._drawPowerText(ctx, ox, oy, p);
    }

    this._drawAxonLabel(ctx, ox, oy, p);
  }

  _drawStars(ctx, W, H) {
    for (const s of this._stars) {
      const tw = s.b + Math.sin(this._time * 1.1 + s.tw) * 0.06;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(170,200,255,${tw})`;
      ctx.fill();
    }
  }

  _bandPath(ox, oy, len, pinchW, bowW, bowAmp, scaleX, scaleY) {
    scaleX = scaleX || 1;
    scaleY = scaleY || 1;
    const segs = 32;
    const left = [];
    const right = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = oy + t * len;

      let w;
      if (t < 0.12) {
        const s = t / 0.12;
        const ease = s * s * (3 - 2 * s);
        w = pinchW + ease * (bowW - pinchW) * 2.2;
      } else if (t < 0.42) {
        const s = (t - 0.12) / 0.30;
        const ease = s * s * (3 - 2 * s);
        w = bowW * 2.2 * (1 - ease * 0.22);
      } else {
        const s = (t - 0.42) / 0.58;
        const ease = s * s;
        w = bowW * 2.2 * 0.78 * (1 - ease * 0.82);
      }

      w *= scaleX;
      const elasticY = Math.sin(t * 4.8 + this._time * 2.6) * bowAmp * (0.25 + t * 0.75) * scaleY;
      const breathe = Math.sin(this._time * 1.6 + t * 0.5) * bowAmp * 0.25 * scaleX;
      left.push({ x: ox - w / 2 + elasticY + breathe, y });
      right.push({ x: ox + w / 2 + elasticY + breathe, y });
    }
    return { left, right };
  }

  _fillBandPath(ctx, left, right) {
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) {
      const prev = left[i - 1];
      const curr = left[i];
      const cpx = (prev.x + curr.x) / 2;
      const cpy = (prev.y + curr.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
    }
    ctx.lineTo(left[left.length - 1].x, left[left.length - 1].y);
    for (let i = right.length - 1; i >= 0; i--) {
      if (i === right.length - 1) {
        ctx.lineTo(right[i].x, right[i].y);
      } else {
        const prev = right[i + 1];
        const curr = right[i];
        const cpx = (prev.x + curr.x) / 2;
        const cpy = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
      }
    }
    ctx.closePath();
  }

  _drawBandGlow(ctx, ox, oy, len, p) {
    const { left, right } = this._bandPath(ox, oy, len, 8 + p * 5, 28 + p * 28, 2.5 + p * 4, 2.2, 1.4);
    this._fillBandPath(ctx, left, right);

    const grad = ctx.createLinearGradient(ox, oy, ox, oy + len);
    grad.addColorStop(0, `rgba(0,240,255,${0.04 + p * 0.06})`);
    grad.addColorStop(0.3, `rgba(120,0,255,${0.035 + p * 0.05})`);
    grad.addColorStop(0.65, `rgba(255,0,170,${0.025 + p * 0.04})`);
    grad.addColorStop(1, `rgba(255,70,190,${0.015 + p * 0.025})`);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  _drawBand(ctx, ox, oy, len, p) {
    const { left, right } = this._bandPath(ox, oy, len, 4 + p * 3, 14 + p * 18, 1.8 + p * 3.5, 1, 1);
    this._fillBandPath(ctx, left, right);

    const grad = ctx.createLinearGradient(ox, oy, ox, oy + len);
    grad.addColorStop(0, `rgba(0,255,255,${0.45 + p * 0.45})`);
    grad.addColorStop(0.15, `rgba(40,0,255,${0.40 + p * 0.40})`);
    grad.addColorStop(0.4, `rgba(160,0,230,${0.35 + p * 0.35})`);
    grad.addColorStop(0.7, `rgba(255,0,190,${0.30 + p * 0.30})`);
    grad.addColorStop(1, `rgba(255,90,210,${0.18 + p * 0.28})`);
    ctx.fillStyle = grad;
    ctx.fill();

    this._drawBandHighlight(ctx, ox, oy, len, p);
  }

  _drawBandHighlight(ctx, ox, oy, len, p) {
    const shimmer = 0.78 + Math.sin(this._time * 5.5) * 0.22;
    const cW = 0.8 + p * 1.4;

    const grad = ctx.createLinearGradient(ox, oy, ox, oy + len);
    grad.addColorStop(0, `rgba(200,255,255,${(0.35 + p * 0.35) * shimmer})`);
    grad.addColorStop(0.25, `rgba(170,130,255,${(0.25 + p * 0.25) * shimmer})`);
    grad.addColorStop(0.6, `rgba(255,130,210,${(0.18 + p * 0.15) * shimmer})`);
    grad.addColorStop(1, `rgba(255,170,225,${(0.08 + p * 0.10) * shimmer})`);

    const segs = 20;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = oy + t * len;
      const w = cW * (0.8 + 1.2 * Math.sin(t * Math.PI) * (1 - t * 0.3));
      const wobble = Math.sin(t * 4.8 + this._time * 2.6) * (0.5 + p * 1.5) * t;
      const x = ox + wobble;
      if (i === 0) ctx.moveTo(x - w, y);
      else ctx.lineTo(x - w, y);
    }
    for (let i = segs; i >= 0; i--) {
      const t = i / segs;
      const y = oy + t * len;
      const w = cW * (0.8 + 1.2 * Math.sin(t * Math.PI) * (1 - t * 0.3));
      const wobble = Math.sin(t * 4.8 + this._time * 2.6) * (0.5 + p * 1.5) * t;
      const x = ox + wobble;
      ctx.lineTo(x + w, y);
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  _drawStreaks(ctx, ox, oy, len, p) {
    for (const s of this._streaks) {
      const alpha = s.life / s.maxLife;
      const fade = alpha * alpha * (3 - 2 * alpha);
      const y = oy + s.t * len;
      const bw = this._bandWidthAt(s.t, p);
      const halfW = s.w * fade * 0.5;
      const hue = 180 + s.t * 150;

      ctx.beginPath();
      ctx.moveTo(ox - halfW, y);
      ctx.lineTo(ox + halfW, y);
      ctx.strokeStyle = `hsla(${hue},100%,80%,${fade * 0.22})`;
      ctx.lineWidth = 1.2 + p;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ox - halfW * 0.5, y);
      ctx.lineTo(ox + halfW * 0.5, y);
      ctx.strokeStyle = `hsla(${hue},100%,92%,${fade * 0.12})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  _drawSparkles(ctx) {
    for (const s of this._sparkles) {
      const alpha = Math.max(0, s.life / s.maxLife);
      const fade = Math.sin(alpha * Math.PI);
      const hue = 180 + s.t * 150;
      const sz = s.size * fade;

      ctx.save();
      ctx.translate(s.x, s.y);

      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.lineTo(sz * 0.15, -sz * 0.15);
      ctx.lineTo(sz, 0);
      ctx.lineTo(sz * 0.15, sz * 0.15);
      ctx.lineTo(0, sz);
      ctx.lineTo(-sz * 0.15, sz * 0.15);
      ctx.lineTo(-sz, 0);
      ctx.lineTo(-sz * 0.15, -sz * 0.15);
      ctx.closePath();
      ctx.fillStyle = `hsla(${hue},100%,90%,${fade * 0.6})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, sz * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue},80%,97%,${fade * 0.8})`;
      ctx.fill();

      ctx.restore();
    }
  }

  _drawParticles(ctx) {
    for (const p of this._particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      const hue = 180 + p.t * 150;
      const s = p.size * alpha;
      const fade = alpha * alpha;

      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue},100%,68%,${fade * 0.10})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue},100%,88%,${fade * 0.50})`;
      ctx.fill();
    }
  }

  _drawTrajectory(ctx, ox, oy, p) {
    const arcLen = 55 + p * 110;
    const segs = 30;

    ctx.save();
    ctx.setLineDash([3.5, 6.5]);
    ctx.lineDashOffset = -this._time * 30;

    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = ox + t * t * 22 * (0.4 + p * 0.7);
      const y = oy - t * arcLen;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    const grad = ctx.createLinearGradient(ox, oy, ox + 20, oy - arcLen);
    grad.addColorStop(0, `rgba(0,220,255,${0.12 + p * 0.18})`);
    grad.addColorStop(0.4, `rgba(130,80,255,${0.06 + p * 0.10})`);
    grad.addColorStop(1, `rgba(190,60,255,${0.02 + p * 0.04})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.2 + p * 0.6;
    ctx.stroke();

    ctx.shadowColor = `rgba(0,200,255,${0.12 + p * 0.15})`;
    ctx.shadowBlur = 5 + p * 4;
    ctx.strokeStyle = `rgba(90,210,255,${0.06 + p * 0.08})`;
    ctx.lineWidth = 2.5 + p * 1.5;
    ctx.stroke();

    ctx.restore();
  }

  _drawOrb(ctx, ox, oy, p) {
    const baseR = 9;
    const pulse = Math.sin(this._time * 3.8) * 1.2;
    const r = baseR + pulse + p * 3.5;

    const outerR = r * 5.5;
    const outerGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, outerR);
    outerGrad.addColorStop(0, `rgba(0,220,255,${0.08 + p * 0.14})`);
    outerGrad.addColorStop(0.25, `rgba(0,140,255,${0.03 + p * 0.06})`);
    outerGrad.addColorStop(1, 'rgba(0,60,255,0)');
    ctx.beginPath();
    ctx.arc(ox, oy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = outerGrad;
    ctx.fill();

    const midR = r * 2.4;
    const midGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, midR);
    midGrad.addColorStop(0, `rgba(80,230,255,${0.10 + p * 0.12})`);
    midGrad.addColorStop(1, 'rgba(0,100,255,0)');
    ctx.beginPath();
    ctx.arc(ox, oy, midR, 0, Math.PI * 2);
    ctx.fillStyle = midGrad;
    ctx.fill();

    const coreGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    coreGrad.addColorStop(0, 'rgba(255,255,255,0.96)');
    coreGrad.addColorStop(0.22, 'rgba(200,248,255,0.80)');
    coreGrad.addColorStop(0.55, 'rgba(40,200,255,0.28)');
    coreGrad.addColorStop(1, 'rgba(0,120,255,0.04)');
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    const specX = ox - r * 0.28;
    const specY = oy - r * 0.28;
    const specR = r * 0.38;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(specX, specY, specR, 0, Math.PI * 2);
    ctx.fillStyle = specGrad;
    ctx.fill();
  }

  _drawPowerText(ctx, ox, oy, p) {
    const pct = Math.round(p * 100);
    const size = 22 + p * 8;
    const textX = ox + 22;
    const textY = oy - 3;

    ctx.save();
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = `rgba(0,220,255,${0.40 + p * 0.35})`;
    ctx.shadowBlur = 10 + p * 14;
    ctx.fillStyle = `rgba(80,215,255,${0.50 + p * 0.35})`;
    ctx.fillText(`${pct}%`, textX, textY);

    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(200,248,255,${0.65 + p * 0.30})`;
    ctx.fillText(`${pct}%`, textX, textY);
    ctx.restore();
  }

  _drawAxonLabel(ctx, ox, oy, p) {
    const labelX = ox;
    const labelY = oy - 26;
    const lw = 44;
    const lh = 14;

    ctx.fillStyle = `rgba(6,2,18,${0.60 + p * 0.15})`;
    ctx.beginPath();
    ctx.roundRect(labelX - lw / 2, labelY - lh / 2, lw, lh, 2.5);
    ctx.fill();

    ctx.strokeStyle = `rgba(255,80,180,${0.15 + p * 0.2})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.save();
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,100,200,${0.50 + p * 0.40})`;
    ctx.fillText('AXON', labelX, labelY + 0.5);
    ctx.restore();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    if (this._hintEl.parentNode) this._hintEl.parentNode.removeChild(this._hintEl);
  }
}
