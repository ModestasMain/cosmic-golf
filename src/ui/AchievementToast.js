// ============================================================
// AchievementToast.js — Steam-style achievement popup (top of screen)
// ============================================================

export class AchievementToast {
  constructor() {
    this._queue = [];
    this._showing = false;
    this._hideTimer = null;
    this._nextTimer = null;
    this._build();
  }

  _build() {
    this._el = document.createElement('div');
    this._el.id = 'achievement-toast';
    this._el.style.cssText = [
      'position:fixed',
      'top:-80px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:10000',
      'pointer-events:none',
      'transition:top 0.5s cubic-bezier(0.22,1,0.36,1)',
    ].join(';');
    document.body.appendChild(this._el);
  }

  show(achievement) {
    this._queue.push(achievement);
    if (!this._showing) this._showNext();
  }

  _clearTimers() {
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
    if (this._nextTimer) { clearTimeout(this._nextTimer); this._nextTimer = null; }
  }

  _showNext() {
    this._clearTimers();
    if (this._queue.length === 0) {
      this._showing = false;
      return;
    }
    this._showing = true;
    const a = this._queue.shift();

    this._playSound();

    const card = document.createElement('div');
    card.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:14px',
      'padding:10px 24px 10px 16px',
      'background:linear-gradient(135deg,rgba(10,20,50,0.95),rgba(20,40,80,0.95))',
      'border:1px solid rgba(100,180,255,0.5)',
      'border-radius:4px',
      'box-shadow:0 4px 30px rgba(0,0,0,0.6),0 0 15px rgba(100,180,255,0.2)',
      'font-family:"Space Grotesk",monospace',
      'color:#fff',
      'min-width:280px',
      'max-width:380px',
    ].join(';');

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = [
      'width:40px',
      'height:40px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:rgba(100,180,255,0.15)',
      'border-radius:4px',
      'flex-shrink:0',
      'font-size:22px',
    ].join(';');
    iconWrap.textContent = a.icon;

    const text = document.createElement('div');
    text.style.cssText = 'overflow:hidden;';
    text.innerHTML = [
      `<div style="font-size:10px;color:rgba(100,200,255,0.9);letter-spacing:2px;text-transform:uppercase;white-space:nowrap">Achievement Unlocked</div>`,
      `<div style="font-size:15px;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.name}</div>`,
      `<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.desc}</div>`,
    ].join('');

    card.appendChild(iconWrap);
    card.appendChild(text);
    this._el.innerHTML = '';
    this._el.appendChild(card);

    requestAnimationFrame(() => {
      this._el.style.top = '16px';
    });

    this._hideTimer = setTimeout(() => {
      this._hideTimer = null;
      this._el.style.top = '-80px';
      this._nextTimer = setTimeout(() => {
        this._nextTimer = null;
        this._showNext();
      }, 500);
    }, 3500);
  }

  _playSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now + 0.08);
      osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.16);
      gain2.gain.setValueAtTime(0.12, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.4);
    } catch {}
  }

  dispose() {
    this._clearTimers();
    this._el.remove();
  }
}
