// ============================================================
// CollectibleSystem.js — spinning pickups scattered around holes
// Types: GRAVITY_BOOT, SPEED_CRYSTAL, SHIELD
// Deterministic spawn from hole seed so all clients agree.
// ============================================================

import {
  OctahedronGeometry, Mesh, MeshBasicMaterial, AdditiveBlending,
  Group, PointLight, Vector3, SphereGeometry, BackSide,
} from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { COLLECTIBLE } from '../core/Constants.js';

const TYPES  = ['GRAVITY_BOOT', 'SPEED_CRYSTAL', 'SHIELD'];
const COLORS = { GRAVITY_BOOT: 0x00ffcc, SPEED_CRYSTAL: 0xffaa00, SHIELD: 0x9944ff };
const LABELS = { GRAVITY_BOOT: 'ZERO-G!', SPEED_CRYSTAL: 'SPEED BOOST!', SHIELD: 'SHIELD UP!' };
const LABEL_COLORS = { GRAVITY_BOOT: '#00ffcc', SPEED_CRYSTAL: '#ffaa00', SHIELD: '#9944ff' };

// Seeded RNG
function makeSeq(seed) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

export class CollectibleSystem {
  constructor(scene) {
    this._scene  = scene;
    this._items  = [];   // { id, type, group, position, collected, t }
    this._effects = [];  // { type, remaining }

    // Shields consumed by OOB
    this._pendingShield = false;
  }

  // ── Public state (read by HoleScene) ─────────────────────

  get gravityScale()     { return this._hasEffect('GRAVITY_BOOT')   ? 0.0  : 1.0; }
  get speedMultiplier()  { return this._hasEffect('SPEED_CRYSTAL')   ? COLLECTIBLE.SPEED_MULTIPLIER : 1.0; }
  get hasShield()        { return this._hasEffect('SHIELD'); }

  // ── Per-hole spawn ────────────────────────────────────────

  spawnForHole(holeData, holeSeed) {
    this.clear();
    const seq = makeSeq(holeSeed + 4444);
    const count = seq() < 0.55 ? 2 : 1;

    for (let i = 0; i < count; i++) {
      if (!holeData.planets?.length) continue;

      // Pick a random planet to orbit near
      const pIdx   = Math.floor(seq() * holeData.planets.length);
      const planet = holeData.planets[pIdx];
      const angle  = seq() * Math.PI * 2;
      const dist   = planet.radius * (2.2 + seq() * 1.6);
      const pos    = planet.position.clone().add(new Vector3(
        Math.cos(angle) * dist,
        (seq() - 0.5) * planet.radius * 0.8,
        Math.sin(angle) * dist,
      ));

      const typeIdx = Math.floor(seq() * TYPES.length);
      this._spawnItem(i, TYPES[typeIdx], pos);
    }
  }

  // Externally remove a collectible (e.g. another player picked it up)
  removeById(id) {
    const idx = this._items.findIndex(it => it.id === id);
    if (idx < 0) return;
    const item = this._items[idx];
    if (item.group) this._scene.remove(item.group);
    item.collected = true;
    this._items.splice(idx, 1);
  }

  // ── Update ────────────────────────────────────────────────

  update(dt, ball) {
    for (const item of this._items) {
      if (item.collected) continue;
      item.t += dt;

      // Hover
      item.group.position.y = item.position.y
        + Math.sin(item.t * COLLECTIBLE.HOVER_SPEED) * COLLECTIBLE.HOVER_AMPLITUDE;

      // Spin
      item.gem.rotation.y += dt * 1.8;
      item.gem.rotation.x += dt * 0.6;

      // Pulse glow
      item.light.intensity = 1.2 + Math.sin(item.t * 3.5) * 0.5;

      // Collect check
      if (ball && ball.position.distanceTo(item.group.position) < COLLECTIBLE.COLLECT_RADIUS) {
        this._collect(item, ball);
      }
    }

    // Tick active effects
    for (let i = this._effects.length - 1; i >= 0; i--) {
      this._effects[i].remaining -= dt;
      if (this._effects[i].remaining <= 0) this._effects.splice(i, 1);
    }
  }

  // Called by HoleScene when ball goes OOB — shield consumes the penalty
  consumeShield() {
    const idx = this._effects.findIndex(e => e.type === 'SHIELD');
    if (idx < 0) return false;
    this._effects.splice(idx, 1);
    return true;
  }

  clear() {
    for (const item of this._items) {
      if (item.group) this._scene.remove(item.group);
    }
    this._items  = [];
    this._effects = [];
  }

  // ── Private ───────────────────────────────────────────────

  _spawnItem(id, type, position) {
    const color = COLORS[type];

    // Gem — octahedron
    const gem    = new Mesh(
      new OctahedronGeometry(2.8, 0),
      new MeshBasicMaterial({ color, wireframe: false }),
    );
    gem.renderOrder = 50;

    // Outer glow halo
    const halo = new Mesh(
      new SphereGeometry(5.5, 12, 8),
      new MeshBasicMaterial({
        color, transparent: true, opacity: 0.12,
        depthWrite: false, blending: AdditiveBlending, side: BackSide,
      }),
    );

    const light = new PointLight(color, 1.5, 40);

    const group = new Group();
    group.add(gem);
    group.add(halo);
    group.add(light);
    group.position.copy(position);
    this._scene.add(group);

    this._items.push({ id, type, group, gem, halo, light, position: position.clone(), collected: false, t: Math.random() * Math.PI * 2 });
  }

  _collect(item, ball) {
    item.collected = true;
    this._scene.remove(item.group);

    // SPEED_CRYSTAL: one-time instant velocity boost at pickup
    if (item.type === 'SPEED_CRYSTAL' && ball) {
      const s = ball.velocity.length();
      if (s > 1) ball.velocity.multiplyScalar(COLLECTIBLE.SPEED_MULTIPLIER);
    }

    // Apply effect
    const dur = {
      GRAVITY_BOOT:  COLLECTIBLE.GRAVITY_BOOT_DUR,
      SPEED_CRYSTAL: COLLECTIBLE.SPEED_CRYSTAL_DUR,
      SHIELD:        COLLECTIBLE.SHIELD_DUR,
    }[item.type] ?? 5;

    this._effects.push({ type: item.type, remaining: dur });

    eventBus.emit(Events.COLLECTIBLE_COLLECTED, {
      type:      item.type,
      id:        item.id,
      label:     LABELS[item.type],
      color:     LABEL_COLORS[item.type],
      playerId:  gameState.players[0]?.id,
      holeIndex: gameState.currentHole,
    });
  }

  _hasEffect(type) {
    return this._effects.some(e => e.type === type);
  }
}
