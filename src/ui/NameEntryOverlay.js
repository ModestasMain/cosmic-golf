// ============================================================
// NameEntryOverlay.js — name + optional room code entry
// Shows before the game loads. Returns { name, roomCode }.
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
      'background:rgba(4,6,20,0.96)',
      'backdrop-filter:blur(16px)', '-webkit-backdrop-filter:blur(16px)',
      'gap:0', 'font-family:monospace',
      'overflow-y:auto', 'padding:24px 0',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:20px',
      'width:min(380px,90vw)',
    ].join(';');

    // ── Title ─────────────────────────────────────────────────
    const title = document.createElement('div');
    title.style.cssText = [
      'font-size:clamp(26px,6vw,48px)', 'font-weight:bold',
      'letter-spacing:6px', 'color:#fff', 'text-align:center',
      'text-shadow:0 0 30px rgba(100,180,255,0.9),0 0 60px rgba(80,100,255,0.4)',
    ].join(';');
    title.textContent = '⛳ COSMIC GOLF';

    const tagline = document.createElement('div');
    tagline.style.cssText = 'font-size:10px;letter-spacing:3px;color:rgba(140,180,255,0.5);text-align:center;margin-top:-12px;';
    tagline.textContent = 'MULTIPLAYER · GRAVITY · MINI GOLF';

    // ── Inputs ────────────────────────────────────────────────
    const inputsWrap = document.createElement('div');
    inputsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;';

    const nameLabel = this._makeLabel('YOUR NAME');
    const nameInput = this._makeInput('COSMO', 12);
    nameInput.placeholder = this._randomName();
    nameInput.addEventListener('input', () => { nameInput.value = nameInput.value.toUpperCase(); });
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._confirm(); });
    this._nameInput = nameInput;

    const roomLabel = this._makeLabel('ROOM CODE  (leave blank for public lobby)');
    const roomInput = this._makeInput('e.g. AB3X', 8, true);
    roomInput.addEventListener('input', () => { roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._confirm(); });
    this._roomInput = roomInput;

    inputsWrap.appendChild(nameLabel);
    inputsWrap.appendChild(nameInput);
    inputsWrap.appendChild(roomLabel);
    inputsWrap.appendChild(roomInput);

    // ── Join button ───────────────────────────────────────────
    const btn = document.createElement('button');
    btn.textContent = 'JOIN GAME →';
    btn.style.cssText = [
      'width:100%',
      'background:linear-gradient(135deg,rgba(60,100,255,0.85),rgba(120,60,255,0.85))',
      'border:1px solid rgba(120,160,255,0.5)', 'border-radius:10px',
      'padding:15px 18px', 'color:#fff', 'font-family:monospace',
      'font-size:14px', 'letter-spacing:4px', 'cursor:pointer',
      'box-shadow:0 0 24px rgba(80,100,255,0.4)',
      'transition:opacity 0.15s,transform 0.1s',
    ].join(';');
    btn.addEventListener('pointerdown', () => { btn.style.opacity='0.7'; btn.style.transform='scale(0.97)'; });
    btn.addEventListener('pointerup',   () => { btn.style.opacity='1';   btn.style.transform='scale(1)'; this._confirm(); });

    // ── Rules ─────────────────────────────────────────────────
    const rules = document.createElement('div');
    rules.style.cssText = [
      'width:100%', 'border-top:1px solid rgba(100,160,255,0.15)',
      'padding-top:18px', 'display:flex', 'flex-direction:column', 'gap:8px',
    ].join(';');

    const rulesTitle = document.createElement('div');
    rulesTitle.style.cssText = 'font-size:9px;letter-spacing:3px;color:rgba(140,180,255,0.45);margin-bottom:4px;';
    rulesTitle.textContent = 'HOW TO PLAY';

    const ruleItems = [
      ['🎯', 'Drag near your ball to aim direction'],
      ['⚡', 'Drag up to set power, release to shoot — or tap twice'],
      ['🪐', 'Use planet gravity to slingshot toward the hole'],
      ['⛳', '5 holes · fewest strokes wins'],
      ['🌀', 'Watch out for the black hole gravity pull'],
    ];

    rules.appendChild(rulesTitle);
    for (const [icon, text] of ruleItems) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;color:rgba(200,220,255,0.6);font-size:11px;letter-spacing:0.5px;';
      row.innerHTML = `<span style="font-size:14px;min-width:20px;text-align:center">${icon}</span><span>${text}</span>`;
      rules.appendChild(row);
    }

    card.appendChild(title);
    card.appendChild(tagline);
    card.appendChild(inputsWrap);
    card.appendChild(btn);
    card.appendChild(rules);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this._overlay = overlay;
  }

  _makeLabel(text) {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:9px;letter-spacing:2px;color:rgba(140,180,255,0.5);margin-bottom:-4px;';
    el.textContent = text;
    return el;
  }

  _makeInput(placeholder, maxLength, optional = false) {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = maxLength;
    el.placeholder = placeholder;
    el.style.cssText = [
      'width:100%', 'box-sizing:border-box',
      'background:rgba(10,15,40,0.8)',
      'border:1px solid rgba(100,160,255,' + (optional ? '0.2' : '0.4') + ')',
      'border-radius:10px', 'padding:13px 16px',
      'color:#fff', 'font-family:monospace', 'font-size:16px',
      'letter-spacing:4px', 'text-transform:uppercase', 'outline:none',
    ].join(';');
    el.addEventListener('focus', () => { el.style.borderColor='rgba(100,160,255,0.8)'; el.style.boxShadow='0 0 18px rgba(80,120,255,0.25)'; });
    el.addEventListener('blur',  () => { el.style.borderColor='rgba(100,160,255,' + (optional ? '0.2' : '0.4') + ')'; el.style.boxShadow='none'; });
    return el;
  }

  _randomName() {
    return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  }

  _confirm() {
    const rawName = this._nameInput.value.trim().toUpperCase();
    const name    = rawName.length > 0 ? rawName : (this._nameInput.placeholder || this._randomName());
    const rawRoom = this._roomInput.value.trim().toUpperCase();
    const roomCode = rawRoom.length >= 2 ? rawRoom : null; // null = public lobby
    this._overlay.style.display = 'none';
    if (this._resolve) this._resolve({ name, roomCode });
  }

  /** Pre-fill room code from URL param (invite links). */
  prefillRoom(code) {
    if (code) this._roomInput.value = code.toUpperCase();
  }

  /** Returns Promise<{ name: string, roomCode: string|null }> */
  show() {
    this._nameInput.placeholder = this._randomName();
    this._overlay.style.display = 'flex';
    setTimeout(() => this._nameInput.focus(), 50);
    return new Promise(resolve => { this._resolve = resolve; });
  }
}
