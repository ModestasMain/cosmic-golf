// ============================================================
// AudioManager.js — Web Audio API procedural audio
// BGM: looped MP3 + Web Audio routing
// SFX: one-shot oscillator chains, zero memory leaks
// ============================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

const FX_VOLUME_MULT = 1;

// ── AudioContext singleton ─────────────────────────────────

let _ctx = null;

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

// ── Master gain (mute/volume control) ─────────────────────

let _master = null;
let _musicBus = null;
let _fxBus = null;

function master() {
  if (!_master) {
    _master = ctx().createGain();
    _master.gain.value = 0.7;
    _master.connect(ctx().destination);
  }
  return _master;
}

function musicBus() {
  if (!_musicBus) {
    _musicBus = ctx().createGain();
    _musicBus.gain.value = 1;
    _musicBus.connect(master());
  }
  return _musicBus;
}

function fxBus() {
  if (!_fxBus) {
    _fxBus = ctx().createGain();
    _fxBus.gain.value = 1;
    _fxBus.connect(master());
  }
  return _fxBus;
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

  gain.connect(fxBus());

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
  gain.connect(fxBus());

  src.start(now);
  src.stop(now + duration + 0.01);
}

// ── SFX definitions ───────────────────────────────────────

const sfx = {

  // SHOT_TAKEN — crisp golf strike
  // Short club click + ball snap, with only a tiny airy tail. Avoids the old
  // sub-bass "womp" so the release feels more like a golf hit.
  launch() {
    // Club-face tick
    oneShot({ freq: 1450, freqEnd: 920, type: 'triangle', volume: 0.72, attack: 0.001, decay: 0.055,
      filterType: 'bandpass', filterFreq: 1600, filterQ: 5 });
    // Ball compression pop
    oneShot({ freq: 360, freqEnd: 210, type: 'triangle', volume: 0.78, attack: 0.001, decay: 0.09,
      filterType: 'bandpass', filterFreq: 520, filterQ: 2.4 });
    // Very short wooden/metal body, no subby tail
    oneShot({ freq: 180, freqEnd: 120, type: 'sine', volume: 0.34, attack: 0.002, decay: 0.075,
      filterType: 'highpass', filterFreq: 120, filterQ: 0.7 });
    // Tiny contact scratch
    noiseBurst({ duration: 0.026, volume: 0.24, cutoff: 3200 });
    // Light cosmic air after the strike
    oneShot({ freq: 980, freqEnd: 1450, type: 'sine', volume: 0.08, attack: 0.012, decay: 0.13, delay: 0.018 });
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
    noiseGain.connect(fxBus());
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
    dopGain.connect(fxBus());
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
    subGain.connect(fxBus());
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
      shimGain.connect(fxBus());
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

  // CINEMATIC_SWISH — 5-second deep whoosh: blackhole → golfball
  // Three layers: (1) lowpass noise sweep for the whoosh body,
  //               (2) deep sine swell that rises from sub-bass,
  //               (3) low sawtooth engine growl for weight.
  // Returns a stop(fadeMs) function so callers can cut it early.
  cinematicSwish() {
    if (gameState.isMuted) return () => {};
    const c   = ctx();
    const now = c.currentTime;
    // Must match CinematicController DURATION exactly
    const DUR = 5.0;

    // Master gain for this swish — fade here to stop everything at once
    const swishMaster = c.createGain();
    swishMaster.gain.setValueAtTime(1, now);
    swishMaster.connect(fxBus());

    // 1. Whoosh body — white noise through lowpass sweeping open then settling
    //    Sustain holds until t=4.0s, then LINEAR fade to 0 at exactly t=5.0s
    //    (exponential ramp sounds gone at halfway — linear fade keeps it present)
    const bufSize = Math.ceil(c.sampleRate * DUR);
    const nBuf    = c.createBuffer(1, bufSize, c.sampleRate);
    const nData   = nBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) nData[i] = Math.random() * 2 - 1;
    const nSrc  = c.createBufferSource();
    nSrc.buffer = nBuf;
    const lp    = c.createBiquadFilter();
    lp.type     = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(100, now);
    lp.frequency.linearRampToValueAtTime(2400, now + DUR * 0.45);
    lp.frequency.linearRampToValueAtTime(350, now + DUR);
    const nGain = c.createGain();
    nGain.gain.setValueAtTime(0.0001, now);
    nGain.gain.linearRampToValueAtTime(0.55, now + 0.20);
    nGain.gain.setValueAtTime(0.55, now + DUR * 0.80);
    nGain.gain.linearRampToValueAtTime(0.0001, now + DUR);
    nSrc.connect(lp); lp.connect(nGain); nGain.connect(swishMaster);
    nSrc.start(now); nSrc.stop(now + DUR + 0.05);

    // 2. Deep sine swell — sustains until t=4.0s, linear fade to 0 at t=5.0s
    const subOsc  = c.createOscillator();
    const subFilt = c.createBiquadFilter();
    const subGain = c.createGain();
    subOsc.type   = 'sine';
    subFilt.type  = 'lowpass'; subFilt.frequency.value = 200; subFilt.Q.value = 0.5;
    subOsc.frequency.setValueAtTime(28, now);
    subOsc.frequency.linearRampToValueAtTime(90, now + DUR * 0.45);
    subOsc.frequency.linearRampToValueAtTime(35, now + DUR);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.80, now + 0.12);
    subGain.gain.setValueAtTime(0.80, now + DUR * 0.80);
    subGain.gain.linearRampToValueAtTime(0.0001, now + DUR);
    subOsc.connect(subFilt); subFilt.connect(subGain); subGain.connect(swishMaster);
    subOsc.start(now); subOsc.stop(now + DUR + 0.05);

    // 3. Low sawtooth growl — fades slightly earlier so clean noise tail at arrival
    const sawOsc  = c.createOscillator();
    const sawFilt = c.createBiquadFilter();
    const sawGain = c.createGain();
    sawOsc.type   = 'sawtooth';
    sawFilt.type  = 'lowpass'; sawFilt.frequency.value = 160; sawFilt.Q.value = 1.2;
    sawOsc.frequency.setValueAtTime(38, now);
    sawOsc.frequency.linearRampToValueAtTime(75, now + DUR * 0.50);
    sawOsc.frequency.linearRampToValueAtTime(42, now + DUR * 0.85);
    sawGain.gain.setValueAtTime(0.0001, now);
    sawGain.gain.linearRampToValueAtTime(0.22, now + 0.25);
    sawGain.gain.setValueAtTime(0.22, now + DUR * 0.70);
    sawGain.gain.linearRampToValueAtTime(0.0001, now + DUR * 0.90);
    sawOsc.connect(sawFilt); sawFilt.connect(sawGain); sawGain.connect(swishMaster);
    sawOsc.start(now); sawOsc.stop(now + DUR * 0.93);

    // Returns a fade-out function for early stop (skip button)
    return (fadeMs = 250) => {
      const t    = c.currentTime;
      const fade = fadeMs / 1000;
      swishMaster.gain.cancelScheduledValues(t);
      swishMaster.gain.setValueAtTime(swishMaster.gain.value, t);
      swishMaster.gain.linearRampToValueAtTime(0, t + fade);
      const stopAt = t + fade + 0.05;
      try { nSrc.stop(stopAt);   } catch {}
      try { subOsc.stop(stopAt); } catch {}
      try { sawOsc.stop(stopAt); } catch {}
    };
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

  worldEaterRoar() {
    oneShot({ freq: 54, freqEnd: 22, type: 'sawtooth', volume: 0.42, attack: 0.03, decay: 0.9,
      filterType: 'lowpass', filterFreq: 180, filterQ: 0.8 });
    oneShot({ freq: 110, freqEnd: 44, type: 'triangle', volume: 0.22, attack: 0.02, decay: 0.55, delay: 0.04 });
    noiseBurst({ duration: 0.22, volume: 0.14, cutoff: 900, delay: 0.03 });
  },

  worldEaterWeakspot() {
    oneShot({ freq: 320, freqEnd: 120, type: 'square', volume: 0.2, attack: 0.003, decay: 0.16,
      filterType: 'bandpass', filterFreq: 620, filterQ: 2 });
    oneShot({ freq: 960, freqEnd: 420, type: 'triangle', volume: 0.1, attack: 0.002, decay: 0.22, delay: 0.01 });
    noiseBurst({ duration: 0.04, volume: 0.08, cutoff: 3200 });
  },

  worldEaterOpened() {
    oneShot({ freq: 82, freqEnd: 28, type: 'sawtooth', volume: 0.34, attack: 0.01, decay: 0.65,
      filterType: 'lowpass', filterFreq: 240, filterQ: 0.9 });
    oneShot({ freq: 260, freqEnd: 880, type: 'triangle', volume: 0.18, attack: 0.02, decay: 0.45, delay: 0.04 });
    noiseBurst({ duration: 0.12, volume: 0.1, cutoff: 1800, delay: 0.03 });
  },

  worldEaterChomp() {
    oneShot({ freq: 180, freqEnd: 58, type: 'square', volume: 0.22, attack: 0.002, decay: 0.18 });
    noiseBurst({ duration: 0.08, volume: 0.16, cutoff: 1400 });
    oneShot({ freq: 70, freqEnd: 38, type: 'sine', volume: 0.22, attack: 0.003, decay: 0.24, delay: 0.02 });
  },

  worldEaterBoost() {
    oneShot({ freq: 260, freqEnd: 1200, type: 'triangle', volume: 0.22, attack: 0.01, decay: 0.28 });
    oneShot({ freq: 820, freqEnd: 2100, type: 'sine', volume: 0.08, attack: 0.006, decay: 0.24, delay: 0.03 });
    noiseBurst({ duration: 0.05, volume: 0.07, cutoff: 2800 });
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
    this._gainNode.connect(fxBus());

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
    if (gameState.isMuted) {
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
    this._gainNode.connect(fxBus());

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
    this._gainNode.connect(fxBus());

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

// ── Space ambience ─────────────────────────────────────────
//
// Quiet, persistent atmosphere bed. It reacts to nearby planets, wormholes,
// black-hole proximity, and zero-gravity events without adding per-frame nodes.

class SpaceAmbience {
  constructor() {
    this._running = false;
    this._gainNode = null;
    this._bedGain = null;
    this._noiseGain = null;
    this._noiseFilter = null;
    this._planetGain = null;
    this._eventGain = null;
    this._bedOscA = null;
    this._bedOscB = null;
    this._planetOscA = null;
    this._planetOscB = null;
    this._planetFilter = null;
    this._eventOsc = null;
    this._eventFilter = null;
  }

  static planetTone(type = 'ROCKY') {
    switch (type) {
      case 'ICE': return { freq: 520, type: 'sine', filter: 1600 };
      case 'LAVA': return { freq: 58, type: 'sawtooth', filter: 260 };
      case 'GAS': return { freq: 105, type: 'triangle', filter: 420 };
      case 'RINGED': return { freq: 330, type: 'triangle', filter: 1100 };
      case 'SAND': return { freq: 135, type: 'sine', filter: 360 };
      case 'TERRAN': return { freq: 178, type: 'triangle', filter: 520 };
      case 'ROCKY':
      default: return { freq: 92, type: 'sine', filter: 340 };
    }
  }

  _ensure() {
    if (this._running) return;
    const c = ctx();

    this._gainNode = c.createGain();
    this._gainNode.gain.value = 0;
    this._gainNode.connect(fxBus());

    this._bedGain = c.createGain();
    this._bedGain.gain.value = 0.16;
    this._bedGain.connect(this._gainNode);

    this._bedOscA = c.createOscillator();
    this._bedOscA.type = 'sine';
    this._bedOscA.frequency.value = 36;
    this._bedOscB = c.createOscillator();
    this._bedOscB.type = 'triangle';
    this._bedOscB.frequency.value = 54.4;

    const bedFilter = c.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.frequency.value = 180;
    bedFilter.Q.value = 0.7;

    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.045;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(this._bedOscA.frequency);
    lfoGain.connect(this._bedOscB.frequency);

    this._bedOscA.connect(bedFilter);
    this._bedOscB.connect(bedFilter);
    bedFilter.connect(this._bedGain);

    const bufLen = c.sampleRate * 4;
    const noiseBuf = c.createBuffer(1, bufLen, c.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    this._noiseFilter = c.createBiquadFilter();
    this._noiseFilter.type = 'bandpass';
    this._noiseFilter.frequency.value = 520;
    this._noiseFilter.Q.value = 0.35;

    this._noiseGain = c.createGain();
    this._noiseGain.gain.value = 0.036;

    noise.connect(this._noiseFilter);
    this._noiseFilter.connect(this._noiseGain);
    this._noiseGain.connect(this._gainNode);

    this._planetGain = c.createGain();
    this._planetGain.gain.value = 0;
    this._planetFilter = c.createBiquadFilter();
    this._planetFilter.type = 'bandpass';
    this._planetFilter.frequency.value = 340;
    this._planetFilter.Q.value = 2.2;
    this._planetFilter.connect(this._planetGain);
    this._planetGain.connect(this._gainNode);

    this._planetOscA = c.createOscillator();
    this._planetOscA.type = 'sine';
    this._planetOscA.frequency.value = 92;
    this._planetOscB = c.createOscillator();
    this._planetOscB.type = 'sine';
    this._planetOscB.frequency.value = 138;
    this._planetOscA.connect(this._planetFilter);
    this._planetOscB.connect(this._planetFilter);

    this._eventGain = c.createGain();
    this._eventGain.gain.value = 0;
    this._eventFilter = c.createBiquadFilter();
    this._eventFilter.type = 'lowpass';
    this._eventFilter.frequency.value = 240;
    this._eventFilter.Q.value = 1.4;
    this._eventFilter.connect(this._eventGain);
    this._eventGain.connect(this._gainNode);

    this._eventOsc = c.createOscillator();
    this._eventOsc.type = 'sawtooth';
    this._eventOsc.frequency.value = 44;
    this._eventOsc.connect(this._eventFilter);

    this._bedOscA.start();
    this._bedOscB.start();
    this._planetOscA.start();
    this._planetOscB.start();
    this._eventOsc.start();
    noise.start();
    lfo.start();

    this._running = true;
  }

  start() {
    this._ensure();
    if (gameState.isMuted) return;
    this._gainNode.gain.setTargetAtTime(0.22, ctx().currentTime, 1.8);
  }

  setContext({
    planetType = 'ROCKY',
    planetProximity = 0,
    blackHoleProximity = 0,
    wormholeProximity = 0,
    zeroGravity = false,
    inFlight = false,
  } = {}) {
    if (gameState.isMuted) {
      if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.25);
      return;
    }
    this._ensure();
    const c = ctx();
    const now = c.currentTime;
    this._gainNode.gain.setTargetAtTime(0.20 + (inFlight ? 0.03 : 0), now, 0.8);
    const noiseLift = Math.max(0, Math.min(1, blackHoleProximity)) * 0.006
      + Math.max(0, Math.min(1, wormholeProximity)) * 0.006
      + (zeroGravity ? 0.008 : 0);
    this._noiseFilter.frequency.setTargetAtTime(zeroGravity ? 900 : 520 + blackHoleProximity * 320, now, 0.8);
    this._noiseGain.gain.setTargetAtTime(0.032 + noiseLift * 2, now, 0.8);

    const tone = SpaceAmbience.planetTone(planetType);
    const p = Math.max(0, Math.min(1, planetProximity));
    this._planetOscA.type = tone.type;
    this._planetOscB.type = tone.type === 'sawtooth' ? 'triangle' : 'sine';
    this._planetOscA.frequency.setTargetAtTime(tone.freq, now, 0.45);
    this._planetOscB.frequency.setTargetAtTime(tone.freq * 1.505, now, 0.55);
    this._planetFilter.frequency.setTargetAtTime(tone.filter, now, 0.4);
    this._planetGain.gain.setTargetAtTime(p * p * 0.105, now, 0.35);

    const eventT = Math.max(
      zeroGravity ? 0.45 : 0,
      Math.max(0, Math.min(1, blackHoleProximity)) * 0.65,
      Math.max(0, Math.min(1, wormholeProximity)) * 0.55,
    );
    const eventFreq = zeroGravity ? 72 : 42 + blackHoleProximity * 62 + wormholeProximity * 90;
    this._eventOsc.frequency.setTargetAtTime(eventFreq, now, 0.25);
    this._eventFilter.frequency.setTargetAtTime(zeroGravity ? 520 : 220 + eventT * 900, now, 0.35);
    this._eventGain.gain.setTargetAtTime(eventT * 0.11, now, 0.35);
  }

  silence() {
    if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.5);
  }
}

class FileBGM {
  constructor() {
    this._running = false;
    this._el = null;
    this._srcNode = null;
    this._gainNode = null;
    this._unlock = null;
  }

  prepare() {
    this._ensure();
    const c = ctx();
    if (this._gainNode) {
      this._gainNode.gain.cancelScheduledValues(c.currentTime);
      this._gainNode.gain.setValueAtTime(0.0001, c.currentTime);
    }
  }

  _ensure() {
    if (this._el) return;
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.loop = true;
    el.crossOrigin = 'anonymous';
    el.src = '/audio/cosmic-golf-bgm.mp3';
    el.style.display = 'none';
    document.body.appendChild(el);
    this._el = el;

    const c = ctx();
    this._gainNode = c.createGain();
    this._gainNode.gain.value = 0.0001;
    this._srcNode = c.createMediaElementSource(el);
    this._srcNode.connect(this._gainNode);
    this._gainNode.connect(musicBus());

    this._unlock = () => {
      if (this._el && this._el.paused && !gameState.isMuted) {
        this._el.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', this._unlock, { passive: true });
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._ensure();
    const c = ctx();
    this._gainNode.gain.cancelScheduledValues(c.currentTime);
    this._gainNode.gain.setValueAtTime(0.0001, c.currentTime);
    if (!gameState.isMuted) {
      this._gainNode.gain.linearRampToValueAtTime(0.52, c.currentTime + 3);
      this._el.play().catch(() => {});
    } else {
      this._gainNode.gain.setValueAtTime(0, c.currentTime);
      this._el.pause();
    }
  }

  stop() {
    this._running = false;
    if (this._el) this._el.pause();
    if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, ctx().currentTime, 0.5);
  }

  setMuted(muted) {
    this._ensure();
    if (!this._gainNode || !this._el) return;
    const c = ctx();
    if (muted) {
      this._gainNode.gain.setTargetAtTime(0, c.currentTime, 0.2);
      this._el.pause();
    } else {
      this._gainNode.gain.setTargetAtTime(0.52, c.currentTime, 0.3);
      if (this._running) this._el.play().catch(() => {});
    }
  }
}

// ── AudioManager class ─────────────────────────────────────

export class AudioManager {
  constructor() {
    this._wired             = false;
    this._lastAimTick       = 0;
    this._bhDrone           = new BlackHoleDrone();
    this._pwrDrone          = new PowerDrone();
    this._flightDrone       = new FlightDrone();
    this._ambience          = new SpaceAmbience();
    this._bgm               = new FileBGM();
    this._stopCinematicSwish = null;
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

    // Apply saved volume preferences. masterVolume is kept as a legacy fallback.
    master().gain.value = 0.7;
    const legacyVol = localStorage.getItem('masterVolume');
    const savedMusic = parseFloat(localStorage.getItem('musicVolume') ?? legacyVol ?? '1');
    const savedFx = parseFloat(localStorage.getItem('fxVolume') ?? legacyVol ?? '1');
    const musicVol = isNaN(savedMusic) ? 1 : Math.min(1, Math.max(0, savedMusic));
    const fxVol = isNaN(savedFx) ? 1 : Math.min(1, Math.max(0, savedFx));
    musicBus().gain.value = musicVol;
    fxBus().gain.value = fxVol * FX_VOLUME_MULT;
    gameState.isMuted = musicVol === 0 && fxVol === 0;

    this._bgm.prepare();

    // BGM starts only when player presses "Launch into Space"
    eventBus.once(Events.GAME_LAUNCHED, () => {
      this._bgm.start();
      this._bgm.setMuted(!!gameState.isMuted);
      this._ambience.start();
    });

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
    eventBus.on(Events.WORLDEATER_WARNING, () => sfx.worldEaterRoar());
    eventBus.on(Events.WORLDEATER_WEAKSPOT_HIT, () => sfx.worldEaterWeakspot());
    eventBus.on(Events.WORLDEATER_OPENED, () => sfx.worldEaterOpened());
    eventBus.on(Events.WORLDEATER_CHOMP, () => sfx.worldEaterChomp());
    eventBus.on(Events.WORLDEATER_BOOST, () => sfx.worldEaterBoost());

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
    eventBus.on(Events.BALL_STOPPED,       silenceFlight);

    // Stop cinematic swish when cinematic ends (natural finish or skip)
    eventBus.on(Events.CINEMATIC_COMPLETE, () => this.stopCinematicSwish());

    // Mute toggle — flip gameState flag, update BGM gain
    eventBus.on(Events.AUDIO_MUTE_TOGGLE, () => {
      gameState.isMuted = !gameState.isMuted;
      this._bgm.setMuted(gameState.isMuted);
      if (gameState.isMuted) {
        this._bhDrone.silence();
        this._ambience.silence();
      } else {
        this._ambience.start();
      }
    });

    // Volume sliders
    eventBus.on(Events.AUDIO_VOLUME_CHANGE, ({ volume }) => this.setVolume(volume));
    eventBus.on(Events.AUDIO_MUSIC_VOLUME_CHANGE, ({ volume }) => this.setMusicVolume(volume));
    eventBus.on(Events.AUDIO_FX_VOLUME_CHANGE, ({ volume }) => this.setFxVolume(volume));
  }

  /** Legacy setter: keeps old callers working by setting both music and FX. */
  setVolume(v) {
    this.setMusicVolume(v);
    this.setFxVolume(v);
  }

  setMusicVolume(v) {
    const clamped = Math.min(1, Math.max(0, v));
    localStorage.setItem('musicVolume', String(clamped));
    if (!this._wired) return;
    musicBus().gain.value = clamped;
    this._bgm.setMuted(clamped === 0);
    gameState.isMuted = musicBus().gain.value === 0 && fxBus().gain.value === 0;
  }

  setFxVolume(v) {
    const clamped = Math.min(1, Math.max(0, v));
    localStorage.setItem('fxVolume', String(clamped));
    if (!this._wired) return;
    fxBus().gain.value = clamped * FX_VOLUME_MULT;
    gameState.isMuted = musicBus().gain.value === 0 && fxBus().gain.value === 0;
    if (clamped === 0) {
      this._bhDrone.silence();
      this._ambience.silence();
    } else {
      this._ambience.start();
    }
  }

  /** Play the 5-second cosmic travel sound for the hole-intro cinematic. */
  playCinematicSwish() {
    this._stopCinematicSwish?.();
    this._stopCinematicSwish = sfx.cinematicSwish();
  }

  /** Fade out and stop the cinematic swish (called on skip or completion). */
  stopCinematicSwish() {
    if (this._stopCinematicSwish) {
      this._stopCinematicSwish();
      this._stopCinematicSwish = null;
    }
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

  setAmbienceContext(context) {
    this._ambience.setContext(context);
  }
}

export const audioManager = new AudioManager();
