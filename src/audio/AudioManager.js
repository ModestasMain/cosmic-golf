// ============================================================
// AudioManager.js — ZzFX-style procedural SFX (zero audio files)
// Uses Web Audio API directly for reliability across browsers
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Play a tone using a basic oscillator + gain envelope.
 * @param {number} freq        - Frequency in Hz
 * @param {number} duration    - Duration in seconds
 * @param {OscillatorType} type - 'sine' | 'square' | 'sawtooth' | 'triangle'
 * @param {number} volume      - Peak gain (0–1)
 * @param {number} [freqEnd]   - Optional end frequency for glide (pitch slide)
 * @param {number} [delay=0]   - Start delay in seconds
 */
function playTone(freq, duration, type = 'sine', volume = 0.3, freqEnd = null, delay = 0) {
  if (gameState.isMuted) return;
  const ctx = getAudioCtx();
  const now = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), now + duration);
  }

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01); // quick attack
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.start(now);
  osc.stop(now + duration + 0.02);
}

// ── Sound definitions ──────────────────────────────────────

const sounds = {
  // Shot launch: quick upward swoosh
  launch() {
    playTone(200, 0.12, 'sawtooth', 0.18, 420);
    playTone(380, 0.10, 'sine',     0.12, null, 0.05);
  },

  // Ball bounce off planet: short thud + click
  bounce() {
    playTone(90,  0.10, 'square',   0.25, 40);
    playTone(200, 0.06, 'sine',     0.10, null, 0.01);
  },

  // Ball holed: triumphant ascending chime
  holed() {
    playTone(523, 0.30, 'sine', 0.40);          // C5
    playTone(659, 0.30, 'sine', 0.35, null, 0.15); // E5
    playTone(784, 0.45, 'sine', 0.40, null, 0.30); // G5
  },

  // Out of bounds / penalty: sad descending tone
  oob() {
    playTone(330, 0.35, 'sawtooth', 0.20, 140);
    playTone(220, 0.25, 'sine',     0.12, null, 0.15);
  },

  // Aim tick: subtle click while dragging (called throttled)
  aimTick() {
    playTone(660, 0.04, 'square', 0.10);
  },

  // Hole complete: mini fanfare
  holeComplete() {
    playTone(523, 0.20, 'sine', 0.35);              // C5
    playTone(659, 0.20, 'sine', 0.35, null, 0.18);  // E5
    playTone(784, 0.20, 'sine', 0.35, null, 0.36);  // G5
    playTone(1046,0.40, 'sine', 0.40, null, 0.54);  // C6
  },
};

// ── AudioManager class ─────────────────────────────────────

export class AudioManager {
  constructor() {
    this._wired = false;
    this._lastAimTick = 0;
  }

  /**
   * Call once after the first user interaction to satisfy browser autoplay policy.
   */
  init() {
    if (this._wired) return;
    this._wired = true;

    // Resume context if it was suspended (Chrome autoplay policy)
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    eventBus.on(Events.SHOT_TAKEN,         () => sounds.launch());
    eventBus.on(Events.BALL_BOUNCED,       () => sounds.bounce());
    eventBus.on(Events.BALL_HOLED,         () => sounds.holed());
    eventBus.on(Events.BALL_OUT_OF_BOUNDS, () => sounds.oob());
    eventBus.on(Events.HOLE_COMPLETE,      () => sounds.holeComplete());

    // Throttled aim tick — at most once every 120 ms while dragging
    eventBus.on(Events.AIM_UPDATE, ({ power }) => {
      if (power < 0.05) return; // skip near-zero
      const now = Date.now();
      if (now - this._lastAimTick > 120) {
        this._lastAimTick = now;
        sounds.aimTick();
      }
    });

    // Respect mute toggle event
    eventBus.on(Events.AUDIO_MUTE_TOGGLE, () => {
      gameState.isMuted = !gameState.isMuted;
    });
  }
}

export const audioManager = new AudioManager();
