// ============================================================
// AudioManager.js — Web Audio API procedural audio
// BGM: space ambient step sequencer (no files, no ZzFX)
// SFX: one-shot oscillator chains, zero memory leaks
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

// ── AudioContext singleton ─────────────────────────────────

let _ctx = null;

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

// ── Master gain (mute/volume control) ─────────────────────

let _master = null;

function master() {
  if (!_master) {
    _master = ctx().createGain();
    _master.gain.value = 0.7;
    _master.connect(ctx().destination);
  }
  return _master;
}

// ── Utility: one-shot oscillator ──────────────────────────
//
// Creates osc → filter (optional) → gain → master
// Schedules start/stop. Returns nothing — fully fire-and-forget.

function oneShot({
  freq      = 440,
  freqEnd   = null,
  type      = 'sine',
  volume    = 0.3,
  attack    = 0.005,
  decay     = 0.3,
  delay     = 0,
  filterType = null,  // 'lowpass' | 'highpass' | 'bandpass' | null
  filterFreq = 800,
  filterQ    = 1,
}) {
  if (gameState.isMuted) return;
  const c   = ctx();
  const now = c.currentTime + delay;

  const osc  = c.createOscillator();
  const gain = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), now + attack + decay);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

  let node = osc;

  if (filterType) {
    const filt = c.createBiquadFilter();
    filt.type            = filterType;
    filt.frequency.value = filterFreq;
    filt.Q.value         = filterQ;
    osc.connect(filt);
    filt.connect(gain);
  } else {
    osc.connect(gain);
  }

  gain.connect(master());

  osc.start(now);
  osc.stop(now + attack + decay + 0.05);
}

// ── Noise burst helper (lowpass-filtered white noise) ─────

function noiseBurst({ duration = 0.08, volume = 0.15, cutoff = 400, delay = 0 }) {
  if (gameState.isMuted) return;
  const c   = ctx();
  const now = c.currentTime + delay;

  const bufSize  = Math.ceil(c.sampleRate * duration);
  const buffer   = c.createBuffer(1, bufSize, c.sampleRate);
  const data     = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src  = c.createBufferSource();
  src.buffer = buffer;

  const filt = c.createBiquadFilter();
  filt.type            = 'lowpass';
  filt.frequency.value = cutoff;
  filt.Q.value         = 0.5;

  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(filt);
  filt.connect(gain);
  gain.connect(master());

  src.start(now);
  src.stop(now + duration + 0.01);
}

// ── SFX definitions ───────────────────────────────────────

const sfx = {

  // SHOT_TAKEN — deep whoosh + impact thud
  // A sawtooth swoops up (the launch whoosh) while a sine sub-bass thud
  // punches through simultaneously, giving a sense of real mass being launched.
  launch() {
    // Sub-bass thud (the "weight" of the shot)
    oneShot({ freq: 80, freqEnd: 35, type: 'sine',     volume: 0.55, attack: 0.004, decay: 0.22 });
    // Mid whoosh
    oneShot({ freq: 180, freqEnd: 520, type: 'sawtooth', volume: 0.18, attack: 0.008, decay: 0.18,
      filterType: 'lowpass', filterFreq: 900, filterQ: 1.2 });
    // High airy tail
    oneShot({ freq: 800, freqEnd: 2200, type: 'sine',   volume: 0.07, attack: 0.01,  decay: 0.14, delay: 0.02 });
    // Noise transient
    noiseBurst({ duration: 0.07, volume: 0.12, cutoff: 600 });
  },

  // BALL_BOUNCED — deep low thonk + metallic ring
  // Square-wave low hit sounds like a dense planet surface impact;
  // a high sine ring decays slowly like a struck metal sphere.
  bounce() {
    // Deep thonk
    oneShot({ freq: 65, freqEnd: 28, type: 'square',   volume: 0.45, attack: 0.003, decay: 0.18,
      filterType: 'lowpass', filterFreq: 220, filterQ: 0.7 });
    // Mid body
    oneShot({ freq: 140, freqEnd: 80, type: 'triangle', volume: 0.20, attack: 0.003, decay: 0.14 });
    // Metallic ring — high sine, slow decay
    oneShot({ freq: 2800, freqEnd: 2200, type: 'sine',  volume: 0.12, attack: 0.002, decay: 0.55,
      filterType: 'highpass', filterFreq: 1800, filterQ: 2 });
    // Noise click transient
    noiseBurst({ duration: 0.025, volume: 0.08, cutoff: 1200 });
  },

  // BALL_HOLED — triumphant 3-note ascending chime + sparkle
  // Three clean sine chimes ascend a perfect triad (C5→E5→G5),
  // overlapping softly, with a shimmer of high sparkle notes after.
  holed() {
    // C5 - E5 - G5 chime ascent
    const chimeNotes = [523.25, 659.25, 783.99];
    chimeNotes.forEach((freq, i) => {
      oneShot({ freq, type: 'sine', volume: 0.45, attack: 0.008, decay: 0.70, delay: i * 0.14 });
      // Octave harmonic, quieter
      oneShot({ freq: freq * 2, type: 'sine', volume: 0.10, attack: 0.01, decay: 0.40, delay: i * 0.14 + 0.01 });
    });
    // Sparkle: rapid high pings at increasing pitch
    [1800, 2200, 2800, 3500].forEach((freq, i) => {
      oneShot({ freq, type: 'sine', volume: 0.06, attack: 0.003, decay: 0.20, delay: 0.38 + i * 0.06 });
    });
  },

  // BALL_OUT_OF_BOUNDS — descending "whoops" tone
  // A sawtooth glides down two octaves (comedic "falling" sound),
  // paired with a low rumble noise suggesting tumbling into the void.
  oob() {
    // Descending pitch slide
    oneShot({ freq: 440, freqEnd: 100, type: 'sawtooth', volume: 0.28, attack: 0.005, decay: 0.55,
      filterType: 'lowpass', filterFreq: 600, filterQ: 1 });
    oneShot({ freq: 260, freqEnd: 60,  type: 'sine',     volume: 0.18, attack: 0.01,  decay: 0.45, delay: 0.08 });
    // Low rumble noise
    noiseBurst({ duration: 0.35, volume: 0.08, cutoff: 180 });
  },

  // AIM_START — soft click/tick
  // A brief high sine tick, like a mechanical switch engaging.
  aimStart() {
    oneShot({ freq: 1200, type: 'sine', volume: 0.09, attack: 0.002, decay: 0.045,
      filterType: 'highpass', filterFreq: 800, filterQ: 1 });
    noiseBurst({ duration: 0.015, volume: 0.05, cutoff: 3000 });
  },

  // AIM_POWER_LOCKED — rising "charge" tone
  // A triangle wave rises from mid to high, suggesting energy coiling
  // before release. Clean and satisfying without being shrill.
  powerLocked() {
    oneShot({ freq: 320, freqEnd: 880, type: 'triangle', volume: 0.22, attack: 0.01, decay: 0.28 });
    oneShot({ freq: 640, freqEnd: 1760, type: 'sine',    volume: 0.08, attack: 0.02, decay: 0.22 });
  },

  // GAME_COMPLETE — triumphant fanfare
  // A 5-note ascending fanfare on a major chord, with rich harmonics
  // and a long sustain on the final note. Feels earned.
  gameComplete() {
    const fanfare = [
      { freq: 392.00, delay: 0.00 },   // G4
      { freq: 523.25, delay: 0.13 },   // C5
      { freq: 659.25, delay: 0.26 },   // E5
      { freq: 783.99, delay: 0.40 },   // G5
      { freq: 1046.5, delay: 0.56 },   // C6 — big finish
    ];
    fanfare.forEach(({ freq, delay }) => {
      oneShot({ freq, type: 'sine',     volume: 0.42, attack: 0.01, decay: 1.20, delay });
      oneShot({ freq: freq * 1.5, type: 'triangle', volume: 0.08, attack: 0.02, decay: 0.80, delay: delay + 0.01 });
    });
    // Sub rumble for drama
    oneShot({ freq: 65, freqEnd: 55, type: 'sine', volume: 0.30, attack: 0.05, decay: 1.50, delay: 0.55 });
  },
};

// ── Black hole proximity drone ─────────────────────────────
//
// A continuous eerie oscillator that ramps gain up as proximity → 1.
// We keep one persistent oscillator + gain node; its gain is modulated
// each time setBlackHoleProximity() is called (from the BLACK_HOLE_PROXIMITY event).

class BlackHoleDrone {
  constructor() {
    this._osc1     = null;
    this._osc2     = null;
    this._gainNode = null;
    this._running  = false;
  }

  _ensure() {
    if (this._running) return;
    const c = ctx();

    this._gainNode = c.createGain();
    this._gainNode.gain.value = 0;

    // Low eerie rumble
    this._osc1 = c.createOscillator();
    this._osc1.type = 'sine';
    this._osc1.frequency.value = 55; // A1

    // Slightly detuned second oscillator for beating/unease
    this._osc2 = c.createOscillator();
    this._osc2.type = 'triangle';
    this._osc2.frequency.value = 58.5; // slightly sharp — creates slow beating

    // LFO to wobble the pitch slightly for that "pulling" sensation
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value   = 0.4;  // 0.4 Hz — very slow wobble
    lfoGain.gain.value    = 6;    // ±6 Hz pitch modulation
    lfo.connect(lfoGain);
    lfoGain.connect(this._osc1.frequency);
    lfoGain.connect(this._osc2.frequency);

    // Filter — lowpass to keep it sub-bass
    const filt = c.createBiquadFilter();
    filt.type            = 'lowpass';
    filt.frequency.value = 180;
    filt.Q.value         = 2.5;

    this._osc1.connect(filt);
    this._osc2.connect(filt);
    filt.connect(this._gainNode);
    this._gainNode.connect(master());

    this._osc1.start();
    this._osc2.start();
    lfo.start();

    this._running = true;
  }

  setProximity(t) {
    // t: 0 (far) → 1 (right at cup edge)
    if (gameState.isMuted) {
      if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.1);
      return;
    }
    this._ensure();
    // Cubic curve so it's silent until fairly close
    const vol = Math.pow(Math.max(0, t), 2.5) * 0.28;
    this._gainNode.gain.setTargetAtTime(vol, ctx().currentTime, 0.12);

    // Also modulate pitch upward as proximity increases — gets more urgent
    const pitchShift = t * 30; // up to +30 Hz rise
    this._osc1.frequency.setTargetAtTime(55 + pitchShift, ctx().currentTime, 0.15);
    this._osc2.frequency.setTargetAtTime(58.5 + pitchShift, ctx().currentTime, 0.15);
  }

  silence() {
    if (this._gainNode) {
      this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.08);
    }
  }
}

// ── BGM Step Sequencer ────────────────────────────────────
//
// A slow space-ambient loop: bass pulse + filtered pads + sparse melody.
// Runs as a lookahead scheduler using setTimeout + AudioContext.currentTime
// for sample-accurate timing that survives JS jitter.

class BGMSequencer {
  constructor() {
    this._running    = false;
    this._nextBeat   = 0;    // AudioContext time of next scheduled beat
    this._beatIdx    = 0;    // step counter (0–63, 64 steps = 4 bars)
    this._timeoutId  = null;
    this._gainNode   = null;

    // BPM 72 → beat duration in seconds
    this._bpm        = 72;
    this._beatSec    = 60 / this._bpm;   // ~0.833 s per quarter note
    this._stepSec    = this._beatSec / 4; // 16th note = 0.208 s
    this._lookahead  = 0.1;  // seconds ahead to schedule
    this._scheduleHz = 50;   // ms between scheduling runs

    // 64-step pattern (4 bars of 16 steps each)
    // Each entry: { bass, pad, melody } where values are semitone offsets
    // from a root (C2=65.4Hz for bass, C4=261.6Hz for pad, C5=523.25Hz for mel)
    // null = rest
    this._pattern = this._buildPattern();
  }

  _midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  _buildPattern() {
    // MIDI note numbers
    const C2  = 36, G2 = 43, F2 = 41, Bb2 = 46;
    const C4  = 60, E4 = 64, G4 = 67, Bb4 = 70, F4 = 65;
    const C5  = 72, E5 = 76, G5 = 79, A5  = 81, D5 = 74;

    // 64 steps. Each step: { bass, pad, melody } or null fields = rest
    // Bass hits on steps 0,8,16,24,32,40,48,56 (every half-bar)
    // Pad swells on steps 0,16,32,48
    // Melody sparse — handful of hits across 4 bars
    const pattern = Array.from({ length: 64 }, () => ({ bass: null, pad: null, melody: null }));

    // Bass line — slow root movement
    const bassHits = [
      [0, C2], [8, G2], [16, F2], [24, C2],
      [32, Bb2], [40, G2], [48, F2], [56, C2],
    ];
    bassHits.forEach(([step, note]) => { pattern[step].bass = note; });

    // Pad — slow chord swells every 16 steps (one per bar)
    const padHits = [
      [0,  [C4, G4]],
      [16, [F4, C4]],
      [32, [Bb4, F4]],
      [48, [G4, E4]],
    ];
    padHits.forEach(([step, notes]) => { pattern[step].pad = notes; });

    // Melody — sparse high notes scattered for eerie feel
    const melHits = [
      [4, C5], [20, G5], [28, E5], [36, A5], [44, D5], [58, G5],
    ];
    melHits.forEach(([step, note]) => { pattern[step].melody = note; });

    return pattern;
  }

  _scheduleStep(step, time) {
    if (gameState.isMuted) return;
    const c   = ctx();
    const p   = this._pattern[step % 64];
    const vol = this._gainNode.gain.value;

    // Bass — sine wave, long attack + slow decay (cosmic pulse)
    if (p.bass !== null) {
      const hz = this._midiToHz(p.bass);
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.32, time + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + this._stepSec * 7);
      osc.connect(gain);
      gain.connect(this._gainNode);
      osc.start(time);
      osc.stop(time + this._stepSec * 8);
    }

    // Pad — triangle waves, heavily filtered, very slow fade
    if (p.pad !== null) {
      p.pad.forEach(midi => {
        const hz   = this._midiToHz(midi);
        const osc  = c.createOscillator();
        const filt = c.createBiquadFilter();
        const gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.value = hz;
        filt.type            = 'lowpass';
        filt.frequency.value = 600;
        filt.Q.value         = 0.8;
        // Slow swell in
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(0.10, time + 1.2);
        gain.gain.setValueAtTime(0.10, time + this._stepSec * 13);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + this._stepSec * 16);
        osc.connect(filt);
        filt.connect(gain);
        gain.connect(this._gainNode);
        osc.start(time);
        osc.stop(time + this._stepSec * 16 + 0.1);
      });
    }

    // Melody — pure sine, single hits with long ring
    if (p.melody !== null) {
      const hz  = this._midiToHz(p.melody);
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.09, time + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + this._stepSec * 5);
      osc.connect(gain);
      gain.connect(this._gainNode);
      osc.start(time);
      osc.stop(time + this._stepSec * 5 + 0.1);
    }
  }

  _tick() {
    if (!this._running) return;
    const c   = ctx();
    const end = c.currentTime + this._lookahead;

    while (this._nextBeat < end) {
      this._scheduleStep(this._beatIdx, this._nextBeat);
      this._beatIdx  = (this._beatIdx + 1) % 64;
      this._nextBeat += this._stepSec;
    }

    this._timeoutId = setTimeout(() => this._tick(), this._scheduleHz);
  }

  start() {
    if (this._running) return;

    const c = ctx();
    this._gainNode = c.createGain();
    this._gainNode.gain.value = 0.0001;
    this._gainNode.connect(master());

    // Fade BGM in slowly over 4 seconds
    this._gainNode.gain.linearRampToValueAtTime(0.55, c.currentTime + 4);

    this._running  = true;
    this._nextBeat = c.currentTime + 0.1; // slight offset to let context settle
    this._beatIdx  = 0;
    this._tick();
  }

  stop() {
    this._running = false;
    if (this._timeoutId) clearTimeout(this._timeoutId);
    if (this._gainNode) {
      this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.5);
    }
  }

  setMuted(muted) {
    if (!this._gainNode) return;
    const target = muted ? 0 : 0.55;
    this._gainNode.gain.setTargetAtTime(target, ctx().currentTime, 0.3);
  }
}

// ── AudioManager class ─────────────────────────────────────

export class AudioManager {
  constructor() {
    this._wired        = false;
    this._lastAimTick  = 0;
    this._bhDrone      = new BlackHoleDrone();
    this._bgm          = new BGMSequencer();
  }

  /**
   * Call after first user interaction. Resumes AudioContext, starts BGM, wires events.
   */
  init() {
    if (this._wired) return;
    this._wired = true;

    // Resume context (Chrome autoplay policy)
    const c = ctx();
    if (c.state === 'suspended') c.resume();

    // Start background music
    this._bgm.start();

    // ── Event wiring ──────────────────────────────────────

    eventBus.on(Events.SHOT_TAKEN, () => sfx.launch());

    eventBus.on(Events.BALL_BOUNCED, () => sfx.bounce());

    eventBus.on(Events.BALL_HOLED, () => sfx.holed());

    eventBus.on(Events.BALL_OUT_OF_BOUNDS, () => sfx.oob());

    eventBus.on(Events.AIM_START, () => sfx.aimStart());

    eventBus.on(Events.AIM_POWER_LOCKED, () => sfx.powerLocked());

    eventBus.on(Events.GAME_COMPLETE, () => sfx.gameComplete());

    // Black hole proximity drone — updated each flight frame
    eventBus.on(Events.BLACK_HOLE_PROXIMITY, ({ proximity }) => {
      this._bhDrone.setProximity(proximity);
    });

    // Silence drone when ball lands / OOB
    const silenceDrone = () => this._bhDrone.silence();
    eventBus.on(Events.BALL_HOLED,         silenceDrone);
    eventBus.on(Events.BALL_OUT_OF_BOUNDS, silenceDrone);
    eventBus.on(Events.AIM_START,          silenceDrone);

    // Throttled aim tick while dragging direction — every 150 ms
    eventBus.on(Events.AIM_UPDATE, () => {
      const now = Date.now();
      if (now - this._lastAimTick > 150) {
        this._lastAimTick = now;
        // Very subtle tick — lower priority than aimStart, so we don't flood
        if (!gameState.isMuted) {
          oneShot({ freq: 900, type: 'sine', volume: 0.04, attack: 0.002, decay: 0.028 });
        }
      }
    });

    // Mute toggle — flip gameState flag, update BGM gain
    eventBus.on(Events.AUDIO_MUTE_TOGGLE, () => {
      gameState.isMuted = !gameState.isMuted;
      this._bgm.setMuted(gameState.isMuted);
      if (gameState.isMuted) this._bhDrone.silence();
    });
  }

  /**
   * Direct method for HoleScene to call if needed (alternative to event).
   * Exposed so external systems can drive drone without event overhead.
   */
  setBlackHoleProximity(t) {
    this._bhDrone.setProximity(t);
  }
}

export const audioManager = new AudioManager();
