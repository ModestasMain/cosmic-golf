// ============================================================
// PlayerLabels.js — floating name tags above each player's ball
// Positioned in screen space from 3D world positions each frame.
// ============================================================

export class PlayerLabels {
  constructor() {
    this._labels = new Map(); // playerId -> { el, worldPos }

    if (!document.getElementById('player-label-style')) {
      const s = document.createElement('style');
      s.id = 'player-label-style';
      s.textContent = `
        .player-label {
          position: fixed;
          top: 0; left: 0;
          pointer-events: none;
          font-family: monospace;
          font-size: 10px;
          letter-spacing: 2px;
          white-space: nowrap;
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(4,6,20,0.65);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          transform: translate(-50%, -100%);
          z-index: 90;
          transition: opacity 0.2s;
          text-shadow: 0 0 8px currentColor;
        }
      `;
      document.head.appendChild(s);
    }
  }

  addPlayer(id, name, color) {
    if (this._labels.has(id)) {
      this.updateName(id, name);
      return;
    }
    const el = document.createElement('div');
    el.className = 'player-label';
    el.textContent = name || id;
    const hex = '#' + (color >>> 0).toString(16).padStart(6, '0');
    el.style.color = hex;
    el.style.borderColor = `${hex}44`;
    el.style.display = 'none';
    document.body.appendChild(el);
    this._labels.set(id, { el, worldPos: null });
  }

  removePlayer(id) {
    const label = this._labels.get(id);
    if (label) { label.el.remove(); this._labels.delete(id); }
  }

  updateName(id, name) {
    const label = this._labels.get(id);
    if (label) label.el.textContent = name;
  }

  setWorldPos(id, pos) {
    const label = this._labels.get(id);
    if (label) label.worldPos = pos ? pos.clone() : null;
  }

  /** Call every frame — projects world positions → screen space. */
  render(camera) {
    for (const [, label] of this._labels) {
      if (!label.worldPos) { label.el.style.display = 'none'; continue; }

      const p = label.worldPos.clone().project(camera);
      if (p.z > 1) { label.el.style.display = 'none'; continue; } // behind camera

      const x = ( p.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-p.y * 0.5 + 0.5) * window.innerHeight - 24; // 24px above ball centre

      label.el.style.display = 'block';
      label.el.style.left = `${x}px`;
      label.el.style.top  = `${y}px`;
    }
  }

  clear() {
    for (const [id] of this._labels) this.removePlayer(id);
  }
}
