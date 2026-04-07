// ============================================================
// LobbyOverlay.js — waiting room shown between name entry and game start
// Shows player list, countdown, and "waiting for players" state.
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';

export class LobbyOverlay {
  constructor() {
    this._players = new Map(); // id -> { name, color }
    this._build();
    this._setupListeners();
  }

  _build() {
    const overlay = document.createElement('div');
    overlay.id = 'lobby-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:500',
      'display:none', 'flex-direction:column', 'align-items:center', 'justify-content:center',
      'background:rgba(4,6,20,0.88)',
      'backdrop-filter:blur(10px)', '-webkit-backdrop-filter:blur(10px)',
      'font-family:monospace', 'gap:28px',
    ].join(';');

    // Status header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;';

    this._statusEl = document.createElement('div');
    this._statusEl.style.cssText = [
      'font-size:clamp(13px,3vw,16px)', 'letter-spacing:4px',
      'color:rgba(160,210,255,0.7)', 'text-align:center',
    ].join(';');
    this._statusEl.textContent = 'WAITING FOR PLAYERS...';

    // Big countdown number
    this._countdownEl = document.createElement('div');
    this._countdownEl.style.cssText = [
      'font-size:clamp(56px,14vw,96px)', 'font-weight:bold', 'letter-spacing:2px',
      'color:#fff', 'line-height:1',
      'text-shadow:0 0 30px rgba(100,200,255,0.9),0 0 60px rgba(80,120,255,0.4)',
      'display:none',
    ].join(';');

    // Progress bar
    this._barWrap = document.createElement('div');
    this._barWrap.style.cssText = [
      'width:min(280px,70vw)', 'height:3px',
      'background:rgba(255,255,255,0.1)', 'border-radius:2px', 'overflow:hidden', 'display:none',
    ].join(';');
    this._barFill = document.createElement('div');
    this._barFill.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#4488ff,#cc44ff);border-radius:2px;transition:width 0.9s linear;';
    this._barWrap.appendChild(this._barFill);

    header.appendChild(this._statusEl);
    header.appendChild(this._countdownEl);
    header.appendChild(this._barWrap);

    // Player list
    const listWrap = document.createElement('div');
    listWrap.style.cssText = [
      'display:flex', 'flex-direction:column', 'gap:8px',
      'width:min(320px,80vw)',
    ].join(';');

    const listTitle = document.createElement('div');
    listTitle.style.cssText = 'font-size:9px;letter-spacing:3px;color:rgba(140,180,255,0.4);margin-bottom:4px;';
    listTitle.textContent = 'PLAYERS IN LOBBY';

    this._playerListEl = document.createElement('div');
    this._playerListEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    listWrap.appendChild(listTitle);
    listWrap.appendChild(this._playerListEl);

    // Room code
    this._roomCodeEl = document.createElement('div');
    this._roomCodeEl.style.cssText = [
      'font-size:10px', 'letter-spacing:3px',
      'color:rgba(140,180,255,0.35)', 'text-align:center',
      'cursor:pointer',
    ].join(';');
    this._roomCodeEl.addEventListener('click', () => {
      const url = new URL(window.location.href);
      navigator.clipboard?.writeText(url.href).catch(() => {});
      this._roomCodeEl.textContent = 'LINK COPIED!';
      setTimeout(() => this._refreshRoomLabel(), 1500);
    });

    overlay.appendChild(header);
    overlay.appendChild(listWrap);
    overlay.appendChild(this._roomCodeEl);
    document.body.appendChild(overlay);
    this._overlay = overlay;
  }

  _setupListeners() {
    eventBus.on(Events.MP_LOBBY_STATE, ({ phase, countdown, playerCount }) => {
      if (phase === 'waiting') {
        this._statusEl.textContent = `WAITING FOR PLAYERS... (${playerCount}/8)`;
        this._countdownEl.style.display = 'none';
        this._barWrap.style.display = 'none';
      } else if (phase === 'countdown') {
        this._statusEl.textContent = 'GAME STARTING';
        this._countdownEl.style.display = 'block';
        this._countdownEl.textContent = countdown;
        // Flash red when low
        const col = countdown <= 5 ? `rgb(255,${countdown * 30},50)` : '#fff';
        this._countdownEl.style.color = col;
        this._countdownEl.style.textShadow = countdown <= 5
          ? `0 0 30px rgba(255,80,50,0.9)` : `0 0 30px rgba(100,200,255,0.9)`;
        this._barWrap.style.display = 'block';
        this._barFill.style.width = `${(1 - countdown / 15) * 100}%`;
      }
    });

    eventBus.on(Events.MP_PLAYER_JOINED, ({ playerId, name, color }) => {
      this._players.set(playerId, { name, color });
      this._renderPlayerList();
    });

    eventBus.on(Events.MP_PLAYER_LEFT, ({ playerId }) => {
      this._players.delete(playerId);
      this._renderPlayerList();
    });

    eventBus.on(Events.MP_GAME_START, () => {
      this.hide();
    });
  }

  _renderPlayerList() {
    this._playerListEl.innerHTML = '';
    for (const [id, player] of this._players) {
      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'background:rgba(255,255,255,0.04)', 'border-radius:8px',
        'padding:9px 14px',
        'border:1px solid rgba(255,255,255,0.07)',
      ].join(';');

      const dot = document.createElement('div');
      const hex = '#' + (player.color >>> 0).toString(16).padStart(6, '0');
      dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${hex};box-shadow:0 0 8px ${hex};flex-shrink:0;`;

      const nameEl = document.createElement('div');
      nameEl.style.cssText = `color:${hex};font-size:12px;letter-spacing:2px;`;
      nameEl.textContent = player.name || id;

      row.appendChild(dot);
      row.appendChild(nameEl);
      this._playerListEl.appendChild(row);
    }
  }

  _refreshRoomLabel() {
    const code = new URLSearchParams(window.location.search).get('room');
    this._roomCodeEl.textContent = code ? `ROOM: ${code}  ·  CLICK TO COPY INVITE` : 'PUBLIC LOBBY';
  }

  /** Call after name entry resolves. localPlayer = { id, name, color } */
  show(isPublic, roomCode, localPlayer) {
    if (localPlayer) {
      this._players.set(localPlayer.id, { name: localPlayer.name, color: localPlayer.color });
      this._renderPlayerList();
    }
    this._refreshRoomLabel();
    this._overlay.style.display = 'flex';
  }

  hide() {
    this._overlay.style.display = 'none';
  }
}
