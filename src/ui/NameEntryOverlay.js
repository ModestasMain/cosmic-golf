// ============================================================
// NameEntryOverlay.js — pre-game name entry screen
// Shows before hole 1 loads. Randomises name if left empty.
// ============================================================

const RANDOM_NAMES = [
  'COSMO', 'NOVA', 'VEGA', 'ORBIT', 'PULSAR',
  'QUARK', 'NEXUS', 'ZEPHYR', 'LYRA', 'DRACO',
  'RIGEL', 'SIRIUS', 'ALTAIR', 'PHOTON', 'COMET',
  'GLITCH', 'PIXEL', 'AXON', 'FLARE', 'ZENITH',
];

export class NameEntryOverlay {
  constructor() {
    this._resolve = null;
    this._build();
  }

  _build() {
    const overlay = document.createElement('div');
    overlay.id = 'name-entry-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:1000',
      'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
      'background:rgba(4,6,20,0.92)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'gap:24px',
      'font-family:monospace',
    ].join(';');

    // Title
    const title = document.createElement('div');
    title.style.cssText = [
      'font-size:clamp(28px,6vw,52px)',
      'font-weight:bold',
      'letter-spacing:6px',
      'color:#fff',
      'text-shadow:0 0 30px rgba(100,180,255,0.8), 0 0 60px rgba(80,100,255,0.4)',
      'text-align:center',
    ].join(';');
    title.textContent = 'COSMIC GOLF';

    // Subtitle
    const sub = document.createElement('div');
    sub.style.cssText = [
      'font-size:11px', 'letter-spacing:4px',
      'color:rgba(140,180,255,0.6)', 'text-align:center',
    ].join(';');
    sub.textContent = 'ENTER YOUR NAME';

    // Input wrapper
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = [
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:12px',
      'width:min(320px,80vw)',
    ].join(';');

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 12;
    input.placeholder = this._randomName();
    input.style.cssText = [
      'width:100%',
      'background:rgba(10,15,40,0.8)',
      'border:1px solid rgba(100,160,255,0.4)',
      'border-radius:10px',
      'padding:14px 18px',
      'color:#fff',
      'font-family:monospace',
      'font-size:18px',
      'letter-spacing:4px',
      'text-align:center',
      'text-transform:uppercase',
      'outline:none',
      'box-sizing:border-box',
      'box-shadow:0 0 0 0 rgba(100,160,255,0)',
      'transition:border-color 0.2s, box-shadow 0.2s',
    ].join(';');
    input.addEventListener('focus', () => {
      input.style.borderColor = 'rgba(100,160,255,0.8)';
      input.style.boxShadow = '0 0 20px rgba(80,120,255,0.3)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'rgba(100,160,255,0.4)';
      input.style.boxShadow = 'none';
    });
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._confirm();
    });
    this._input = input;

    // Play button
    const btn = document.createElement('button');
    btn.textContent = 'LAUNCH →';
    btn.style.cssText = [
      'width:100%',
      'background:linear-gradient(135deg,rgba(60,100,255,0.8),rgba(120,60,255,0.8))',
      'border:1px solid rgba(120,160,255,0.5)',
      'border-radius:10px',
      'padding:14px 18px',
      'color:#fff',
      'font-family:monospace',
      'font-size:14px',
      'letter-spacing:4px',
      'cursor:pointer',
      'transition:opacity 0.15s, transform 0.1s',
      'box-shadow:0 0 20px rgba(80,100,255,0.35)',
    ].join(';');
    btn.addEventListener('pointerdown', () => { btn.style.opacity = '0.7'; btn.style.transform = 'scale(0.97)'; });
    btn.addEventListener('pointerup',   () => { btn.style.opacity = '1';   btn.style.transform = 'scale(1)'; this._confirm(); });

    inputWrap.appendChild(input);
    inputWrap.appendChild(btn);

    overlay.appendChild(title);
    overlay.appendChild(sub);
    overlay.appendChild(inputWrap);
    document.body.appendChild(overlay);
    this._overlay = overlay;
  }

  _randomName() {
    return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  }

  _confirm() {
    const raw = this._input.value.trim().toUpperCase();
    const name = raw.length > 0 ? raw : (this._input.placeholder || this._randomName());
    this._overlay.style.display = 'none';
    if (this._resolve) this._resolve(name);
  }

  /** Returns a Promise that resolves with the chosen name. */
  show() {
    this._input.placeholder = this._randomName();
    this._overlay.style.display = 'flex';
    setTimeout(() => this._input.focus(), 50);
    return new Promise(resolve => { this._resolve = resolve; });
  }
}
