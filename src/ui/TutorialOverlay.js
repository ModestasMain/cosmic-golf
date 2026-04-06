// ============================================================
// TutorialOverlay.js — first-time how-to-play overlay
// Shows animated SVG illustrations for each control phase.
// Auto-dismisses on first real drag. Never shown again.
// ============================================================

const STORAGE_KEY = 'cosmic_golf_tutorial_seen';

export class TutorialOverlay {
  constructor() {
    this._seen    = false;
    this._overlay = null;
    this._anim    = null;
  }

  /** Show tutorial if not seen before. Resolves when dismissed. */
  show() {
    if (localStorage.getItem(STORAGE_KEY)) return;

    this._build();
    document.body.appendChild(this._overlay);
    requestAnimationFrame(() => {
      this._overlay.style.opacity = '1';
    });
  }

  dismiss() {
    if (!this._overlay) return;
    localStorage.setItem(STORAGE_KEY, '1');
    this._overlay.style.opacity = '0';
    clearInterval(this._anim);
    setTimeout(() => {
      if (this._overlay && this._overlay.parentNode) {
        this._overlay.parentNode.removeChild(this._overlay);
      }
      this._overlay = null;
    }, 400);
  }

  _build() {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:500',
      'background:rgba(0,0,12,0.88)',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'gap:0',
      'opacity:0', 'transition:opacity 0.4s ease',
      'pointer-events:auto',
      'font-family:monospace',
    ].join(';');

    el.innerHTML = `
      <div style="color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:3px;margin-bottom:28px">HOW TO PLAY</div>

      <div id="tut-steps" style="display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap;justify-content:center;padding:0 24px">

        <!-- Step 1 -->
        <div class="tut-step" style="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:140px">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <!-- Planet -->
            <circle cx="50" cy="72" r="22" fill="rgba(100,180,255,0.25)" stroke="rgba(100,180,255,0.5)" stroke-width="1"/>
            <!-- Ball -->
            <circle id="tut-ball-1" cx="50" cy="40" r="7" fill="white" opacity="0.9"/>
            <!-- Finger -->
            <g id="tut-finger-1">
              <circle cx="50" cy="40" r="14" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-dasharray="4 3"/>
              <circle cx="50" cy="40" r="4" fill="rgba(255,255,255,0.5)"/>
            </g>
            <!-- Arrow direction -->
            <g id="tut-arrow-1" opacity="0">
              <line x1="50" y1="40" x2="50" y2="15" stroke="rgba(100,220,255,0.9)" stroke-width="2" stroke-dasharray="5 3"/>
              <polygon points="50,8 45,17 55,17" fill="rgba(100,220,255,0.9)"/>
            </g>
          </svg>
          <div style="color:rgba(255,255,255,0.85);font-size:12px;text-align:center;line-height:1.5;letter-spacing:1px">
            DRAG NEAR<br>BALL TO AIM
          </div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;text-align:center;line-height:1.5">
            Drag in any direction<br>to set your shot angle
          </div>
        </div>

        <!-- Divider -->
        <div style="color:rgba(255,255,255,0.15);font-size:28px;padding-top:32px">›</div>

        <!-- Step 2 -->
        <div class="tut-step" style="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:140px">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <!-- Power bar outline -->
            <rect x="38" y="15" width="24" height="70" rx="12" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
            <!-- Power fill -->
            <clipPath id="bar-clip">
              <rect x="38" y="15" width="24" height="70" rx="12"/>
            </clipPath>
            <rect id="tut-bar-fill" x="38" y="85" width="24" height="0" fill="url(#bar-grad)" clip-path="url(#bar-clip)"/>
            <defs>
              <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0" stop-color="#ff3300"/>
                <stop offset="0.5" stop-color="#ffaa00"/>
                <stop offset="1" stop-color="#44ff88"/>
              </linearGradient>
            </defs>
            <!-- Finger dragging up -->
            <g id="tut-finger-2">
              <circle cx="74" cy="75" r="4" fill="rgba(255,255,255,0.5)"/>
              <line x1="74" y1="75" x2="74" y2="75" id="tut-drag-line" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-dasharray="3 2"/>
            </g>
          </svg>
          <div style="color:rgba(255,255,255,0.85);font-size:12px;text-align:center;line-height:1.5;letter-spacing:1px">
            DRAG UP<br>FOR POWER
          </div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;text-align:center;line-height:1.5">
            New touch, drag up<br>higher = more power
          </div>
        </div>

        <!-- Divider -->
        <div style="color:rgba(255,255,255,0.15);font-size:28px;padding-top:32px">›</div>

        <!-- Step 3 -->
        <div class="tut-step" style="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:140px">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <!-- Trajectory arc -->
            <path id="tut-traj" d="M 30 80 Q 20 40 60 20" fill="none" stroke="rgba(100,220,255,0.6)" stroke-width="1.5" stroke-dasharray="5 4" opacity="0"/>
            <!-- Planet -->
            <circle cx="70" cy="55" r="18" fill="rgba(200,140,255,0.2)" stroke="rgba(200,140,255,0.4)" stroke-width="1"/>
            <!-- Ball launch -->
            <circle id="tut-ball-fly" cx="30" cy="80" r="6" fill="white"/>
            <!-- Black hole -->
            <circle cx="62" cy="22" r="7" fill="black" stroke="rgba(255,140,0,0.7)" stroke-width="1.5"/>
            <ellipse cx="62" cy="22" rx="13" ry="4" fill="none" stroke="rgba(255,100,0,0.5)" stroke-width="1"/>
            <!-- Release icon -->
            <g id="tut-release" opacity="0">
              <circle cx="30" cy="88" r="8" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
              <line x1="27" y1="88" x2="33" y2="88" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
            </g>
          </svg>
          <div style="color:rgba(255,255,255,0.85);font-size:12px;text-align:center;line-height:1.5;letter-spacing:1px">
            RELEASE<br>TO SHOOT
          </div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;text-align:center;line-height:1.5">
            Use gravity to slingshot<br>into the black hole
          </div>
        </div>

      </div>

      <!-- Tip -->
      <div style="margin-top:36px;color:rgba(255,255,255,0.35);font-size:10px;letter-spacing:2px;text-align:center;padding:0 24px">
        TIP: USE PLANET GRAVITY TO CURVE YOUR SHOT
      </div>

      <!-- Dismiss -->
      <button id="tut-dismiss" style="
        margin-top:28px;
        background:transparent;
        border:1px solid rgba(255,255,255,0.3);
        color:rgba(255,255,255,0.8);
        font-family:monospace;
        font-size:13px;
        letter-spacing:3px;
        padding:12px 36px;
        cursor:pointer;
        border-radius:4px;
      ">GOT IT — LET'S PLAY</button>
    `;

    el.querySelector('#tut-dismiss').addEventListener('click', () => this.dismiss());
    el.addEventListener('click', e => { if (e.target === el) this.dismiss(); });

    this._overlay = el;
    this._startAnimations();
  }

  _startAnimations() {
    let t = 0;
    this._anim = setInterval(() => {
      t += 0.04;
      if (!this._overlay) { clearInterval(this._anim); return; }

      // Step 1: finger pulses, then arrow appears
      const phase1 = t % 3;
      const finger1 = this._overlay.querySelector('#tut-finger-1');
      const arrow1  = this._overlay.querySelector('#tut-arrow-1');
      if (finger1 && arrow1) {
        finger1.style.opacity = phase1 < 1.5 ? (0.5 + Math.sin(t * 3) * 0.3).toString() : '0';
        arrow1.style.opacity  = phase1 >= 1.5 ? '1' : '0';
      }

      // Step 2: power bar fills up and down
      const phase2  = (t * 0.5) % 1;
      const barFill = this._overlay.querySelector('#tut-bar-fill');
      const dragLine = this._overlay.querySelector('#tut-drag-line');
      if (barFill) {
        const h = phase2 * 70;
        barFill.setAttribute('y', (85 - h).toString());
        barFill.setAttribute('height', h.toString());
      }
      if (dragLine) {
        const yEnd = 75 - phase2 * 55;
        dragLine.setAttribute('y2', yEnd.toString());
      }

      // Step 3: ball flies along arc
      const phase3  = (t * 0.4) % 1;
      const ballFly = this._overlay.querySelector('#tut-ball-fly');
      const traj    = this._overlay.querySelector('#tut-traj');
      const release = this._overlay.querySelector('#tut-release');
      if (ballFly) {
        // Parametric along the quadratic bezier: P0=(30,80), P1=(20,40), P2=(60,20)
        const bt = phase3;
        const bx = (1-bt)*(1-bt)*30 + 2*(1-bt)*bt*20 + bt*bt*60;
        const by = (1-bt)*(1-bt)*80 + 2*(1-bt)*bt*40 + bt*bt*20;
        ballFly.setAttribute('cx', bx.toFixed(1));
        ballFly.setAttribute('cy', by.toFixed(1));
        if (traj) traj.style.opacity = phase3 > 0 ? '0.7' : '0';
        if (release) release.style.opacity = phase3 < 0.1 ? '1' : '0';
      }
    }, 16);
  }

  dispose() {
    clearInterval(this._anim);
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
  }
}
