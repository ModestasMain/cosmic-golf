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

  // BALL_BOUNCED — meteor impact: shared sub-bass boom + shockwave, then planet flavor
  bounce(planetType = 'ROCKY', speed = 60) {
    const s  = Math.min(speed / 110, 1.0); // normalize: 110 u/s = full impact
    const v  = 0.35 + s * 0.65;            // volume scales with speed

    // ── Base meteor impact (all planet types) ─────────────────────
    // 1. Sub-bass detonation — the gut punch
    oneShot({ freq: 48, freqEnd: 10, type: 'sine',     volume: v * 0.95, attack: 0.001, decay: 0.55 + s * 0.30,
      filterType: 'lowpass', filterFreq: 130, filterQ: 0.5 });
    // 2. Mid thud — the physical slam of mass on mass
    oneShot({ freq: 105, freqEnd: 22, type: 'triangle', volume: v * 0.75, attack: 0.002, decay: 0.30 + s * 0.20 });
    // 3. Shockwave crack — instantaneous high-energy transient
    noiseBurst({ duration: 0.025, volume: v * 0.85, cutoff: 4000 });
    // 4. Debris scatter — rolling rocks and dust, slightly delayed
    noiseBurst({ duration: 0.25 + s * 0.20, volume: v * 0.40, cutoff: 600, delay: 0.025 });

    // ── Planet-specific flavor on top ─────────────────────────────
    switch (planetType) {

      // ROCKY — extra gravel crunch, low stone rumble
      case 'ROCKY':
      default:
        noiseBurst({ duration: 0.18, volume: v * 0.30, cutoff: 220, delay: 0.04 });
        oneShot({ freq: 62, freqEnd: 28, type: 'square', volume: v * 0.25, attack: 0.003, decay: 0.22,
          filterType: 'lowpass', filterFreq: 160, filterQ: 0.6 });
        break;

      // ICE — crystalline shatter ring above the boom
      case 'ICE':
        oneShot({ freq: 1600, freqEnd: 700, type: 'sine',  volume: v * 0.30, attack: 0.001, decay: 0.55,
          filterType: 'highpass', filterFreq: 1000, filterQ: 3.5 });
        oneShot({ freq: 3200, freqEnd: 2000, type: 'sine', volume: v * 0.14, attack: 0.001, decay: 0.70,
          filterType: 'highpass', filterFreq: 2000, filterQ: 4 });
        noiseBurst({ duration: 0.06, volume: v * 0.35, cutoff: 5000, delay: 0.01 });
        break;

      // SAND — muffled, tons of dust noise
      case 'SAND':
        noiseBurst({ duration: 0.35, volume: v * 0.45, cutoff: 320, delay: 0.03 });
        oneShot({ freq: 75, freqEnd: 38, type: 'sine', volume: v * 0.20, attack: 0.006, decay: 0.18,
          filterType: 'lowpass', filterFreq: 200, filterQ: 0.4 });
        break;

      // TERRAN — earthy resonance, soil rumble
      case 'TERRAN':
        oneShot({ freq: 68, freqEnd: 32, type: 'triangle', volume: v * 0.30, attack: 0.008, decay: 0.40,
          filterType: 'lowpass', filterFreq: 280, filterQ: 0.7 });
        noiseBurst({ duration: 0.12, volume: v * 0.20, cutoff: 450, delay: 0.05 });
        break;

      // LAVA — volcanic explosion, searing hiss
      case 'LAVA':
        oneShot({ freq: 32, freqEnd: 9,  type: 'sine',   volume: v * 0.50, attack: 0.003, decay: 0.65,
          filterType: 'lowpass', filterFreq: 110, filterQ: 0.5 });
        noiseBurst({ duration: 0.18, volume: v * 0.55, cutoff: 2500, delay: 0.015 }); // steam/sizzle
        noiseBurst({ duration: 0.30, volume: v * 0.25, cutoff: 180,  delay: 0.04  }); // low volcanic roll
        break;

      // GAS — deep atmospheric whomp, airy shockwave
      case 'GAS':
        oneShot({ freq: 85, freqEnd: 38, type: 'sine', volume: v * 0.28, attack: 0.015, decay: 0.45,
          filterType: 'lowpass', filterFreq: 220, filterQ: 0.4 });
        noiseBurst({ duration: 0.20, volume: v * 0.22, cutoff: 280, delay: 0.02 });
        break;

      // RINGED — boom + long metallic ring shimmer
      case 'RINGED':
        oneShot({ freq: 480, freqEnd: 380, type: 'triangle', volume: v * 0.28, attack: 0.001, decay: 1.10,
          filterType: 'bandpass', filterFreq: 800, filterQ: 4 });
        oneShot({ freq: 1440, freqEnd: 1100, type: 'sine',   volume: v * 0.16, attack: 0.001, decay: 1.40,
          filterType: 'highpass', filterFreq: 1000, filterQ: 2.5 });
        break;
    }
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

  // LAUNCH_WARP — sustained void-rip, power-scaled (0..1)
  // Layers: (1) bandpass noise sweep for the "tear" texture,
  //         (2) doppler sine that rises then falls for the Doppler illusion,
  //         (3) sub-bass rumble for mass.
  warp(power = 0.5) {
    if (gameState.isMuted) return;
    const c   = ctx();
    const p   = Math.max(0, Math.min(1, power));
    const now = c.currentTime;

    // ── 1. Noise rip — bandpass-filtered white noise sweeping from low→high→low ──
    const duration  = 1.1 + p * 0.7;       // matches visual warp duration
    const bufSize   = Math.ceil(c.sampleRate * duration);
    const buf       = c.createBuffer(1, bufSize, c.sampleRate);
    const data      = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const noiseSrc  = c.createBufferSource();
    noiseSrc.buffer = buf;

    const bandpass        = c.createBiquadFilter();
    bandpass.type         = 'bandpass';
    bandpass.Q.value      = 1.8 + p * 2.5;         // narrower Q = more whistle-y tear
    // Sweep: start low, peak at 20% through, fall back
    const peakFreq        = 900 + p * 2200;         // 900 – 3100 Hz peak
    bandpass.frequency.setValueAtTime(200, now);
    bandpass.frequency.linearRampToValueAtTime(peakFreq, now + duration * 0.18);
    bandpass.frequency.exponentialRampToValueAtTime(120, now + duration);

    const noiseGain       = c.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.28 + p * 0.32, now + 0.04);
    noiseGain.gain.setValueAtTime(0.28 + p * 0.32, now + duration * 0.15);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noiseSrc.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(master());
    noiseSrc.start(now);
    noiseSrc.stop(now + duration + 0.05);

    // ── 2. Doppler sine — rises then falls, panned slightly to sell motion ──
    const dopOsc  = c.createOscillator();
    const dopGain = c.createGain();
    dopOsc.type   = 'sawtooth';
    const dopPeak = 320 + p * 480;           // 320–800 Hz
    dopOsc.frequency.setValueAtTime(90, now);
    dopOsc.frequency.linearRampToValueAtTime(dopPeak, now + duration * 0.12);
    dopOsc.frequency.exponentialRampToValueAtTime(55, now + duration * 0.9);

    const dopFilt        = c.createBiquadFilter();
    dopFilt.type         = 'lowpass';
    dopFilt.frequency.value = 600 + p * 800;
    dopFilt.Q.value      = 0.7;

    dopGain.gain.setValueAtTime(0.0001, now);
    dopGain.gain.linearRampToValueAtTime(0.18 + p * 0.20, now + 0.05);
    dopGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.85);

    dopOsc.connect(dopFilt);
    dopFilt.connect(dopGain);
    dopGain.connect(master());
    dopOsc.start(now);
    dopOsc.stop(now + duration);

    // ── 3. Sub rumble — low sine, gives physical weight ──
    const subOsc  = c.createOscillator();
    const subGain = c.createGain();
    subOsc.type   = 'sine';
    subOsc.frequency.setValueAtTime(55 + p * 30, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + duration * 0.7);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.30 + p * 0.25, now + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.65);
    subOsc.connect(subGain);
    subGain.connect(master());
    subOsc.start(now);
    subOsc.stop(now + duration * 0.7);

    // ── 4. High shimmer — fast freq near end, like tearing vacuum ──
    if (p > 0.3) {
      const shimOsc  = c.createOscillator();
      const shimGain = c.createGain();
      shimOsc.type   = 'sine';
      shimOsc.frequency.setValueAtTime(3200 + p * 2000, now + 0.1);
      shimOsc.frequency.exponentialRampToValueAtTime(800, now + duration * 0.8);
      shimGain.gain.setValueAtTime(0.0001, now + 0.1);
      shimGain.gain.linearRampToValueAtTime((p - 0.3) * 0.08, now + 0.25);
      shimGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.75);
      shimOsc.connect(shimGain);
      shimGain.connect(master());
      shimOsc.start(now + 0.1);
      shimOsc.stop(now + duration * 0.8);
    }
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

// ── Power charge drone ────────────────────────────────────
//
// Three-layer heavy charge sound — sub bass felt in the chest,
// distorted sawtooth engine growl, and rising noise pressure.

class PowerDrone {
  constructor() {
    this._gainNode   = null;
    this._sub        = null;
    this._saw        = null;
    this._sawGain    = null;
    this._noiseNode  = null;
    this._noiseFilt  = null;
    this._noiseGain  = null;
    this._running    = false;
  }

  static _distCurve() {
    const n = 512; const amount = 280;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  _ensure() {
    if (this._running) return;
    const c = ctx();

    this._gainNode = c.createGain();
    this._gainNode.gain.value = 0;
    this._gainNode.connect(master());

    this._sub = c.createOscillator();
    this._sub.type = 'sine';
    this._sub.frequency.value = 38;
    const subGain = c.createGain();
    subGain.gain.value = 1.4;
    this._sub.connect(subGain);
    subGain.connect(this._gainNode);

    this._saw = c.createOscillator();
    this._saw.type = 'sawtooth';
    this._saw.frequency.value = 90;
    const shaper = c.createWaveShaper();
    shaper.curve = PowerDrone._distCurve();
    shaper.oversample = '4x';
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.7;
    this._sawGain = c.createGain();
    this._sawGain.gain.value = 0;
    this._saw.connect(shaper); shaper.connect(lp);
    lp.connect(this._sawGain); this._sawGain.connect(this._gainNode);

    const bufLen = c.sampleRate * 2;
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    this._noiseNode = c.createBufferSource();
    this._noiseNode.buffer = buf; this._noiseNode.loop = true;
    this._noiseFilt = c.createBiquadFilter();
    this._noiseFilt.type = 'bandpass';
    this._noiseFilt.frequency.value = 180; this._noiseFilt.Q.value = 0.6;
    this._noiseGain = c.createGain(); this._noiseGain.gain.value = 0;
    this._noiseNode.connect(this._noiseFilt);
    this._noiseFilt.connect(this._noiseGain);
    this._noiseGain.connect(this._gainNode);

    this._sub.start(); this._saw.start(); this._noiseNode.start();
    this._running = true;
  }

  setPower(p) {
    if (gameState.isMuted || p >= 0.99) {
      if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.05);
      return;
    }
    this._ensure();
    const now = ctx().currentTime;
    const p2  = p * p;
    this._sub.frequency.setTargetAtTime(38 + p * 52, now, 0.05);
    this._saw.frequency.setTargetAtTime(90 + p2 * 170, now, 0.03);
    this._sawGain.gain.setTargetAtTime(Math.max(0, (p - 0.25) / 0.75) * 0.5, now, 0.03);
    this._noiseFilt.frequency.setTargetAtTime(180 + p2 * 720, now, 0.04);
    this._noiseGain.gain.setTargetAtTime(p2 * 0.09, now, 0.04);
    const vol = p < 0.02 ? 0 : 0.14 + p2 * 0.20;
    this._gainNode.gain.setTargetAtTime(vol, now, 0.03);
  }

  silence() {
    if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.08);
  }
}

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

// ── Flight drone ──────────────────────────────────────────
//
// Continuous "ripping the cosmos" sound while the ball is in flight.
// Three layers driven by normalised ball speed (0 = stopped, 1 = MAX_SPEED):
//   1. Bandpass noise — the main rip/tear texture, brightens with speed
//   2. Sub-bass rumble — always present once in flight, gives mass
//   3. High sawtooth shimmer — kicks in above 50% speed for the "rip" feel

class FlightDrone {
  constructor() {
    this._gainNode   = null;
    this._noise      = null;
    this._lp         = null;   // low-pass — shapes the air body
    this._res        = null;   // peaking EQ — resonant swoosh peak
    this._rumble     = null;   // sub sine — physical weight
    this._rumbleGain = null;
    this._running    = false;
  }

  _ensure() {
    if (this._running) return;
    const c = ctx();

    this._gainNode = c.createGain();
    this._gainNode.gain.value = 0;
    this._gainNode.connect(master());

    // ── Noise source — full white noise, sculpted by filters ────────
    const bufLen = c.sampleRate * 4;
    const buf    = c.createBuffer(1, bufLen, c.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    this._noise        = c.createBufferSource();
    this._noise.buffer = buf;
    this._noise.loop   = true;

    // Low-pass: cuts harsh highs, keeps air body. Cutoff rises with speed.
    this._lp             = c.createBiquadFilter();
    this._lp.type        = 'lowpass';
    this._lp.frequency.value = 300;
    this._lp.Q.value     = 0.7;

    // Peaking band: broad resonant hump that sweeps up — the "ooooooo" in swoooosh
    this._res             = c.createBiquadFilter();
    this._res.type        = 'peaking';
    this._res.frequency.value = 120;
    this._res.gain.value  = 14;   // dB boost
    this._res.Q.value     = 0.6;  // broad

    this._noise.connect(this._res);
    this._res.connect(this._lp);
    this._lp.connect(this._gainNode);

    // ── Sub-bass sine — the weight of the ball hurtling through space ─
    this._rumble = c.createOscillator();
    this._rumble.type = 'sine';
    this._rumble.frequency.value = 38;

    this._rumbleGain = c.createGain();
    this._rumbleGain.gain.value = 0;

    this._rumble.connect(this._rumbleGain);
    this._rumbleGain.connect(this._gainNode);

    this._noise.start();
    this._rumble.start();
    this._running = true;
  }

  /** t: 0 (stopped) → 1 (MAX_SPEED). Call every flight frame. */
  setSpeed(t) {
    if (gameState.isMuted || t < 0.01) {
      if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.25);
      return;
    }
    this._ensure();
    const now = ctx().currentTime;
    const t2  = t * t;

    // Low-pass opens up as speed increases — more air ripping through
    this._lp.frequency.setTargetAtTime(280 + t2 * 3200, now, 0.08);

    // Resonant swoosh peak sweeps from low rumble to mid — the "swoooosh" body
    this._res.frequency.setTargetAtTime(90 + t * 420, now, 0.10);
    this._res.gain.setTargetAtTime(10 + t * 12, now, 0.08);   // bigger boost at speed

    // Sub rumble — deepens slightly, more presence at speed
    this._rumble.frequency.setTargetAtTime(32 + t * 18, now, 0.12);
    this._rumbleGain.gain.setTargetAtTime(0.12 + t2 * 0.18, now, 0.08);

    // Master — present but not overwhelming
    this._gainNode.gain.setTargetAtTime(0.22 + t2 * 0.18, now, 0.06);
  }

  silence() {
    if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.30);
  }
}

// ── BGM Step Sequencer ────────────────────────────────────
//
// Upbeat cosmic jam: 128 BPM with kick/snare/hi-hat, funky bass,
// catchy square-wave lead and chord stabs. 32-step loop (2 bars).
// Lookahead scheduler for sample-accurate timing despite JS jitter.

class BGMSequencer {
  constructor() {
    this._running    = false;
    this._nextBeat   = 0;
    this._beatIdx    = 0;
    this._timeoutId  = null;
    this._gainNode   = null;

    // 128 BPM → 16th note = 0.117 s
    this._bpm        = 128;
    this._beatSec    = 60 / this._bpm;
    this._stepSec    = this._beatSec / 4;
    this._lookahead  = 0.1;
    this._scheduleHz = 50;

    // 32-step pattern (2 bars of 16th notes)
    this._pattern = this._buildPattern();
  }

  _midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  _buildPattern() {
    // 32 steps = 2 bars at 128 BPM (16th notes)
    // Each step: { kick, snare, hat, bass, lead, stab }
    const pattern = Array.from({ length: 32 }, () => ({
      kick: false, snare: false, hat: false,
      bass: null, lead: null, stab: null,
    }));

    // ── Drums ───────────────────────────────────────────────
    // Kick — 4-on-the-floor (every 8 steps = every quarter note)
    [0, 8, 16, 24].forEach(s => { pattern[s].kick = true; });
    // Snare — beat 2 and 4 of each bar (steps 4, 12, 20, 28)
    [4, 12, 20, 28].forEach(s => { pattern[s].snare = true; });
    // Hi-hat — off-beat 8ths (between every beat)
    [2, 6, 10, 14, 18, 22, 26, 30].forEach(s => { pattern[s].hat = true; });

    // ── Bass line (C major, funky root movement) ────────────
    // MIDI: C2=36 G2=43 F2=41 A2=45 Bb2=46
    const bassLine = [
    //  0    1    2    3    4    5    6    7
       36, null,  36, null,  43, null,  43, null,
    //  8    9   10   11   12   13   14   15
       41, null,  41, null,  43, null,  43, null,
    // 16   17   18   19   20   21   22   23
       36, null,  36, null,  46, null,  43, null,
    // 24   25   26   27   28   29   30   31
       41, null,  41, null,  43, null,  36, null,
    ];
    bassLine.forEach((note, i) => { if (note !== null) pattern[i].bass = note; });

    // ── Lead melody (catchy 2-bar hook, C major pentatonic) ─
    // C5=72 D5=74 E5=76 G5=79 A5=81 C6=84
    const leadLine = [
    //  0    1    2    3    4    5    6    7
       72, null,  76, null,  79, null,  81, null,
    //  8    9   10   11   12   13   14   15
       79, null,  76, null,  72, null,  74, null,
    // 16   17   18   19   20   21   22   23
       76, null,  79, null,  81, null,  84, null,
    // 24   25   26   27   28   29   30   31
       81, null,  79, null,  76, null,  74, null,
    ];
    leadLine.forEach((note, i) => { if (note !== null) pattern[i].lead = note; });

    // ── Chord stabs (short, punchy) ─────────────────────────
    // C4=60 E4=64 G4=67 F4=65 A4=69 B4=71 D5=74
    const Cmaj = [60, 64, 67];
    const Fmaj = [65, 69, 72];
    const Gmaj = [67, 71, 74];
    [
      [0, Cmaj], [8, Fmaj], [12, Gmaj],
      [16, Cmaj], [24, Fmaj], [28, Gmaj],
    ].forEach(([step, chord]) => { pattern[step].stab = chord; });

    return pattern;
  }

  _scheduleStep(step, time) {
    if (gameState.isMuted) return;
    const c = ctx();
    const p = this._pattern[step % 32];

    // ── Kick drum (sine pitch-drop: 85 → 28 Hz) ────────────
    if (p.kick) {
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(85, time);
      osc.frequency.exponentialRampToValueAtTime(28, time + 0.22);
      gain.gain.setValueAtTime(0.9, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
      osc.connect(gain);
      gain.connect(this._gainNode);
      osc.start(time);
      osc.stop(time + 0.30);
    }

    // ── Snare (triangle body + bandpass noise) ──────────────
    if (p.snare) {
      const osc = c.createOscillator();
      const og  = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, time);
      osc.frequency.exponentialRampToValueAtTime(100, time + 0.08);
      og.gain.setValueAtTime(0.30, time);
      og.gain.exponentialRampToValueAtTime(0.0001, time + 0.10);
      osc.connect(og);
      og.connect(this._gainNode);
      osc.start(time);
      osc.stop(time + 0.12);

      const bufLen = Math.ceil(c.sampleRate * 0.14);
      const buf    = c.createBuffer(1, bufLen, c.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp  = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
      const ng  = c.createGain();
      ng.gain.setValueAtTime(0.40, time);
      ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
      src.connect(bp); bp.connect(ng); ng.connect(this._gainNode);
      src.start(time);
      src.stop(time + 0.15);
    }

    // ── Hi-hat (highpass noise, very short) ─────────────────
    if (p.hat) {
      const bufLen = Math.ceil(c.sampleRate * 0.038);
      const buf    = c.createBuffer(1, bufLen, c.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const hp  = c.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7000; hp.Q.value = 0.5;
      const hg  = c.createGain();
      hg.gain.setValueAtTime(0.16, time);
      hg.gain.exponentialRampToValueAtTime(0.0001, time + 0.032);
      src.connect(hp); hp.connect(hg); hg.connect(this._gainNode);
      src.start(time);
      src.stop(time + 0.04);
    }

    // ── Bass synth (sawtooth + filter envelope) ─────────────
    if (p.bass !== null) {
      const hz   = this._midiToHz(p.bass);
      const osc  = c.createOscillator();
      const filt = c.createBiquadFilter();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz, time);
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(80, time);
      filt.frequency.linearRampToValueAtTime(700, time + 0.02);
      filt.frequency.exponentialRampToValueAtTime(220, time + 0.15);
      filt.Q.value = 2.8;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.52, time + 0.005);
      gain.gain.setValueAtTime(0.52, time + this._stepSec * 1.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + this._stepSec * 2.4);
      osc.connect(filt); filt.connect(gain); gain.connect(this._gainNode);
      osc.start(time);
      osc.stop(time + this._stepSec * 2.6);
    }

    // ── Lead synth (square wave, punchy envelope) ────────────
    if (p.lead !== null) {
      const hz   = this._midiToHz(p.lead);
      const osc  = c.createOscillator();
      const filt = c.createBiquadFilter();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(hz, time);
      filt.type = 'lowpass'; filt.frequency.value = 1800; filt.Q.value = 1.4;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.13, time + 0.006);
      gain.gain.setValueAtTime(0.13, time + this._stepSec * 1.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + this._stepSec * 2.1);
      osc.connect(filt); filt.connect(gain); gain.connect(this._gainNode);
      osc.start(time);
      osc.stop(time + this._stepSec * 2.3);
    }

    // ── Chord stab (triangle, short, slightly filtered) ──────
    if (p.stab !== null) {
      for (const midi of p.stab) {
        const hz   = this._midiToHz(midi);
        const osc  = c.createOscillator();
        const filt = c.createBiquadFilter();
        const gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.value = hz;
        filt.type = 'lowpass'; filt.frequency.value = 950; filt.Q.value = 0.9;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(0.065, time + 0.010);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
        osc.connect(filt); filt.connect(gain); gain.connect(this._gainNode);
        osc.start(time);
        osc.stop(time + 0.30);
      }
    }
  }

  _tick() {
    if (!this._running) return;
    const c   = ctx();
    const end = c.currentTime + this._lookahead;

    while (this._nextBeat < end) {
      this._scheduleStep(this._beatIdx, this._nextBeat);
      this._beatIdx  = (this._beatIdx + 1) % 32;
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

    // Fade BGM in over 3 seconds
    this._gainNode.gain.linearRampToValueAtTime(0.52, c.currentTime + 3);

    this._running  = true;
    this._nextBeat = c.currentTime + 0.1;
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
    const target = muted ? 0 : 0.52;
    this._gainNode.gain.setTargetAtTime(target, ctx().currentTime, 0.3);
  }
}

// ── AudioManager class ─────────────────────────────────────

export class AudioManager {
  constructor() {
    this._wired        = false;
    this._lastAimTick  = 0;
    this._bhDrone      = new BlackHoleDrone();
    this._pwrDrone     = new PowerDrone();
    this._flightDrone  = new FlightDrone();
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

    eventBus.on(Events.BALL_BOUNCED, ({ planetType, speed } = {}) => sfx.bounce(planetType, speed));

    eventBus.on(Events.BALL_HOLED, () => sfx.holed());

    eventBus.on(Events.BALL_OUT_OF_BOUNDS, () => sfx.oob());

    eventBus.on(Events.AIM_START, () => sfx.aimStart());

    eventBus.on(Events.AIM_POWER_UPDATE, ({ power }) => this._pwrDrone.setPower(power));

    eventBus.on(Events.AIM_POWER_LOCKED, () => {
      this._pwrDrone.silence();
      sfx.powerLocked();
    });

    const silencePwrDrone = () => this._pwrDrone.silence();
    eventBus.on(Events.AIM_CANCEL,  silencePwrDrone);
    eventBus.on(Events.SHOT_TAKEN,  silencePwrDrone);
    eventBus.on(Events.BALL_HOLED,  silencePwrDrone);

    eventBus.on(Events.GAME_COMPLETE, () => sfx.gameComplete());

    // Black hole proximity drone — updated each flight frame
    eventBus.on(Events.BLACK_HOLE_PROXIMITY, ({ proximity }) => {
      this._bhDrone.setProximity(proximity);
    });

    // Silence black hole drone when ball lands / OOB
    const silenceDrone = () => this._bhDrone.silence();
    eventBus.on(Events.BALL_HOLED,         silenceDrone);
    eventBus.on(Events.BALL_OUT_OF_BOUNDS, silenceDrone);
    eventBus.on(Events.AIM_START,          silenceDrone);

    // Silence flight drone when ball stops moving
    const silenceFlight = () => this._flightDrone.silence();
    eventBus.on(Events.BALL_HOLED,         silenceFlight);
    eventBus.on(Events.BALL_OUT_OF_BOUNDS, silenceFlight);
    eventBus.on(Events.AIM_START,          silenceFlight);
    eventBus.on(Events.BALL_RESET_TO_TEE,  silenceFlight);

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

  /**
   * Call every flight frame with normalised ball speed (0–1).
   * 0 = stopped, 1 = PHYSICS.MAX_SPEED. Drives the flight drone.
   */
  setFlightSpeed(t) {
    this._flightDrone.setSpeed(t);
  }
}

export const audioManager = new AudioManager();
