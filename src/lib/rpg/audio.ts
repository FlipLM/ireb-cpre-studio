'use client';

import { isSoundEnabled } from '@/lib/sounds';
import type { RpgRegionId } from '@/types/rpg';

export type RpgMusicTrack = RpgRegionId | 'battle' | 'boss';

export type RpgSfx =
  | 'click'
  | 'step'
  | 'sword_hit'
  | 'crit_boom'
  | 'parry_clang'
  | 'boss_hit'
  | 'heal_chime'
  | 'chest_open'
  | 'level_up'
  | 'hint_sparkle'
  | 'eliminate_poof'
  | 'dialogue_blip'
  | 'victory_fanfare'
  | 'defeat_chord';

const MUSIC_ENABLED_KEY = 'cpre_rpg_music_enabled';
const MUSIC_VOLUME_KEY = 'cpre_rpg_music_volume';

let ctx: AudioContext | null = null;
let pulse25Wave: PeriodicWave | null = null;
let pulse12Wave: PeriodicWave | null = null;
let reverbSend: GainNode | null = null;
let sharedNoiseBuffer: AudioBuffer | null = null;
let musicTimer: number | null = null;
let currentTrack: RpgMusicTrack | null = null;
let stepIndex = 0;
let cachedMusicEnabled: boolean | null = null;
let cachedMusicVolume: number | null = null;

/**
 * Cria formas de onda Pulse autênticas de consoles 8-bit/16-bit (NES/SNES/GBA)
 * via Série de Fourier — responsáveis pelo timbre cristalino e nostálgico estilo
 * "A Lonely Cherry Tree" (Pix) e trilhas clássicas de JRPG.
 */
function createPulseWave(audioCtx: AudioContext, duty: number): PeriodicWave {
  const harmonics = 24;
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  real[0] = 0;
  imag[0] = 0;
  for (let n = 1; n < harmonics; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    imag[n] = 0;
  }
  return audioCtx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    ctx = new AudioCtx();
    pulse25Wave = createPulseWave(ctx, 0.25);
    pulse12Wave = createPulseWave(ctx, 0.125);

    // Eco chiptune estéreo suave (estilo SNES SPC700)
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.21;
    const fb = ctx.createGain();
    fb.gain.value = 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;

    reverbSend = ctx.createGain();
    reverbSend.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(wet);
    wet.connect(ctx.destination);

    // Buffer de ruído reutilizável (evita alocar AudioBuffer + Math.random a cada batida)
    const noiseLen = Math.floor(ctx.sampleRate * 0.3);
    sharedNoiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const ch = sharedNoiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

export function isRpgMusicEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  if (cachedMusicEnabled !== null) return cachedMusicEnabled;
  const raw = window.localStorage.getItem(MUSIC_ENABLED_KEY);
  cachedMusicEnabled = raw === null ? true : raw === 'true';
  return cachedMusicEnabled;
}

export function setRpgMusicEnabled(enabled: boolean): void {
  cachedMusicEnabled = enabled;
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MUSIC_ENABLED_KEY, enabled ? 'true' : 'false');
  if (!enabled) stopRpgMusic();
}

export function getRpgMusicVolume(): number {
  if (typeof window === 'undefined') return 0.45;
  if (cachedMusicVolume !== null) return cachedMusicVolume;
  const raw = Number(window.localStorage.getItem(MUSIC_VOLUME_KEY));
  cachedMusicVolume = Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.45;
  return cachedMusicVolume;
}

export function setRpgMusicVolume(vol: number): void {
  const clamped = Math.max(0, Math.min(1, vol));
  cachedMusicVolume = clamped;
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MUSIC_VOLUME_KEY, String(clamped));
}

function playChipNote(
  audioCtx: AudioContext,
  freq: number,
  offset: number,
  duration: number,
  gainPeak: number,
  voice: 'pulse25' | 'pulse12' | 'square' | 'triangle' | 'sine',
  opts?: { vibrato?: boolean; reverb?: boolean; cutoff?: number; slideTo?: number; attack?: number }
) {
  const now = audioCtx.currentTime + offset;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  if (voice === 'pulse25' && pulse25Wave) {
    osc.setPeriodicWave(pulse25Wave);
  } else if (voice === 'pulse12' && pulse12Wave) {
    osc.setPeriodicWave(pulse12Wave);
  } else {
    osc.type = voice === 'pulse25' || voice === 'pulse12' ? 'square' : voice;
  }

  osc.frequency.setValueAtTime(freq, now);
  if (opts?.slideTo) {
    osc.frequency.exponentialRampToValueAtTime(opts.slideTo, now + duration);
  }

  // Vibrato expressivo estilo JRPG chiptune (entra suavemente em notas mais longas)
  if (opts?.vibrato && duration >= 0.22) {
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 5.6;
    lfoGain.gain.setValueAtTime(0, now);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.008, now + 0.14);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(now);
    lfo.stop(now + duration + 0.04);
  }

  const attack = opts?.attack ?? 0.01;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainPeak), now + attack);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainPeak * 0.62), now + duration * 0.65);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  let tail: AudioNode = osc;
  if (opts?.cutoff) {
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(opts.cutoff, now);
    osc.connect(lp);
    tail = lp;
  }

  tail.connect(gain);
  gain.connect(audioCtx.destination);
  if (opts?.reverb && reverbSend) {
    gain.connect(reverbSend);
  }

  osc.onended = () => {
    osc.disconnect();
    if (tail !== osc) tail.disconnect();
    gain.disconnect();
  };

  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playChipNoise(
  audioCtx: AudioContext,
  offset: number,
  duration: number,
  gainPeak: number,
  bandFreq: number
) {
  if (!sharedNoiseBuffer) return;
  const now = audioCtx.currentTime + offset;
  const src = audioCtx.createBufferSource();
  src.buffer = sharedNoiseBuffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = bandFreq;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(Math.max(0.0002, gainPeak), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  src.start(now, 0, Math.min(duration, sharedNoiseBuffer.duration));
}

/**
 * Percussão chiptune autêntica:
 * 1 = hi-hat leve | 2 = kick NES | 3 = snare chip | 4 = kick + hi-hat
 */
function playChipDrum(audioCtx: AudioContext, hit: number, vol: number) {
  if (hit === 1) {
    playChipNoise(audioCtx, 0, 0.025, vol * 0.04, 6800);
  } else if (hit === 2) {
    playChipNote(audioCtx, 165, 0, 0.095, vol * 0.16, 'triangle', { slideTo: 42, attack: 0.004 });
    playChipNoise(audioCtx, 0, 0.03, vol * 0.04, 320);
  } else if (hit === 3) {
    playChipNoise(audioCtx, 0, 0.085, vol * 0.095, 1950);
    playChipNote(audioCtx, 230, 0, 0.05, vol * 0.07, 'triangle', { slideTo: 110, attack: 0.004 });
  } else if (hit === 4) {
    playChipNote(audioCtx, 175, 0, 0.11, vol * 0.18, 'triangle', { slideTo: 40, attack: 0.004 });
    playChipNoise(audioCtx, 0, 0.025, vol * 0.045, 6800);
  }
}

export function playRpgSfx(sfx: RpgSfx): void {
  if (!isSoundEnabled()) return;
  const audioCtx = getCtx();
  if (!audioCtx) return;

  switch (sfx) {
    case 'click':
      playChipNote(audioCtx, 587.33, 0, 0.045, 0.06, 'pulse25', { slideTo: 783.99 });
      break;
    case 'step':
      playChipNote(audioCtx, 329.63, 0, 0.055, 0.07, 'triangle', { slideTo: 440 });
      playChipNote(audioCtx, 493.88, 0.05, 0.06, 0.05, 'triangle', { slideTo: 587.33 });
      break;
    case 'dialogue_blip':
      playChipNote(audioCtx, 660 + Math.random() * 120, 0, 0.025, 0.035, 'pulse25');
      break;
    case 'sword_hit':
      playChipNoise(audioCtx, 0, 0.09, 0.13, 2100);
      playChipNote(audioCtx, 440, 0, 0.11, 0.1, 'pulse12', { slideTo: 146.83 });
      playChipNote(audioCtx, 659.25, 0.04, 0.1, 0.08, 'pulse25', { slideTo: 329.63 });
      break;
    case 'crit_boom':
      playChipNoise(audioCtx, 0, 0.18, 0.18, 900);
      playChipNote(audioCtx, 220, 0, 0.22, 0.15, 'square', { slideTo: 65, reverb: true });
      playChipNote(audioCtx, 587.33, 0.04, 0.15, 0.11, 'pulse25', { reverb: true });
      playChipNote(audioCtx, 880, 0.09, 0.26, 0.12, 'pulse25', { slideTo: 1174.66, reverb: true });
      break;
    case 'parry_clang':
      playChipNote(audioCtx, 1046.5, 0, 0.18, 0.11, 'pulse12', { slideTo: 1318.5, reverb: true });
      playChipNote(audioCtx, 1567.98, 0.02, 0.28, 0.09, 'triangle', { reverb: true });
      playChipNoise(audioCtx, 0, 0.06, 0.08, 3600);
      break;
    case 'boss_hit':
      playChipNoise(audioCtx, 0, 0.16, 0.15, 650);
      playChipNote(audioCtx, 174.61, 0, 0.24, 0.15, 'square', { slideTo: 55 });
      break;
    case 'heal_chime':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        playChipNote(audioCtx, f, i * 0.065, 0.25, 0.08, 'pulse25', { reverb: true })
      );
      break;
    case 'chest_open':
      [440, 554.37, 659.25, 880, 1108.73].forEach((f, i) =>
        playChipNote(audioCtx, f, i * 0.07, 0.28, 0.09, 'pulse25', { reverb: true })
      );
      break;
    case 'level_up':
      [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5, 1318.51].forEach((f, i) =>
        playChipNote(audioCtx, f, i * 0.08, 0.28, 0.1, 'pulse25', { reverb: true })
      );
      break;
    case 'hint_sparkle':
      playChipNote(audioCtx, 783.99, 0, 0.14, 0.07, 'pulse25', { slideTo: 1046.5, reverb: true });
      playChipNote(audioCtx, 1174.66, 0.07, 0.2, 0.07, 'triangle', { slideTo: 1567.98, reverb: true });
      break;
    case 'eliminate_poof':
      playChipNoise(audioCtx, 0, 0.1, 0.08, 1600);
      playChipNote(audioCtx, 480, 0, 0.14, 0.07, 'triangle', { slideTo: 190 });
      break;
    case 'victory_fanfare':
      [523.25, 523.25, 523.25, 659.25, 783.99, 659.25, 1046.5].forEach((f, i) =>
        playChipNote(audioCtx, f, i * 0.11, i === 6 ? 0.65 : 0.18, 0.1, 'pulse25', { vibrato: i === 6, reverb: true })
      );
      break;
    case 'defeat_chord':
      [293.66, 261.63, 233.08, 196.0].forEach((f, i) =>
        playChipNote(audioCtx, f, i * 0.16, 0.38, 0.09, 'pulse25', { slideTo: f * 0.94, reverb: true })
      );
      break;
  }
}

const N = {
  _: 0,
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, Fs2: 92.5, G2: 98.0, Gs2: 103.83, A2: 110.0, Bb2: 116.54, B2: 123.47,
  C3: 130.81, Cs3: 138.59, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, Fs3: 185.0, G3: 196.0, Gs3: 207.65, A3: 220.0, Bb3: 233.08, B3: 246.94,
  C4: 261.63, Cs4: 277.18, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.0, Gs4: 415.3, A4: 440.0, Bb4: 466.16, B4: 493.88,
  C5: 523.25, Cs5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, Gs5: 830.61, A5: 880.0, Bb5: 932.33, B5: 987.77, C6: 1046.5,
};

interface ChiptuneTrack {
  stepMs: number;
  leadVoice: 'pulse25' | 'pulse12' | 'square';
  // 128 steps = 4 seções musicais completas (~25s a 34s por ciclo!)
  lead: number[];
  harmony: number[]; // dueto lírico em terças/sextas (marca registrada Pix / A Lonely Cherry Tree)
  chords: number[][]; // 16 acordes (1 a cada 8 steps) -> gera arpejo rápido 16-bit automático!
  bass: number[]; // 64 steps (repetido em 2 ciclos com variação) ou 128 steps
  drums: number[]; // padrão rítmico de 16 steps
}

/**
 * Helper que expande acordes de 8 em 8 steps em arpejos chiptune rápidos (estilo NES/SNES)
 */
function getArpNote(chords: number[][], stepIdx: number): number {
  const chord = chords[Math.floor(stepIdx / 8) % chords.length];
  if (!chord || chord.length === 0) return 0;
  const pattern = [0, 1, 2, 1, 2, 3, 2, 1];
  const noteIdx = pattern[stepIdx % 8] % chord.length;
  return chord[noteIdx];
}

// =============================================================================
// COMPOSIÇÕES ORIGINAIS 128-STEP INSPIRADAS NA ESTÉTICA PIX / A LONELY CHERRY TREE
// =============================================================================

const CHIPTUNE_TRACKS: Record<RpgMusicTrack, ChiptuneTrack> = {
  // 1. GRUTA ESQUECIDA — Nostálgica, Lírica e Aventureira (Am / Fmaj7 / G6 / Em7 — estilo "A Lonely Cherry Tree")
  'gruta-esquecida': {
    stepMs: 215,
    leadVoice: 'pulse25',
    lead: [
      // Seção A: Tema lírico principal (32 steps)
      N.E5, N._, N.G5, N.A5, N.G5, N._, N.E5, N.D5,
      N.C5, N._, N.D5, N.E5, N.G5, N._, N._, N._,
      N.A5, N._, N.G5, N.E5, N.D5, N._, N.C5, N.D5,
      N.E5, N._, N.D5, N.C5, N.B4, N._, N._, N._,
      // Seção A': Resposta emocional subindo ao C6 (32 steps)
      N.E5, N._, N.G5, N.A5, N.C6, N._, N.B5, N.A5,
      N.G5, N._, N.E5, N.G5, N.A5, N._, N._, N._,
      N.F5, N._, N.E5, N.D5, N.C5, N._, N.D5, N.E5,
      N.D5, N._, N.C5, N.B4, N.A4, N._, N._, N._,
      // Seção B: Ponte sonhadora com harpa (32 steps)
      N.C5, N._, N.E5, N.G5, N.F5, N._, N.E5, N.D5,
      N.E5, N._, N.G5, N.B5, N.A5, N._, N._, N._,
      N.D5, N._, N.F5, N.A5, N.G5, N._, N.F5, N.E5,
      N.D5, N._, N.E5, N.F5, N.E5, N._, N._, N._,
      // Seção C: Clímax heróico chiptune (32 steps)
      N.A5, N._, N.B5, N.C6, N.B5, N._, N.A5, N.G5,
      N.A5, N._, N.G5, N.E5, N.D5, N._, N.E5, N.G5,
      N.F5, N._, N.A5, N.G5, N.F5, N.E5, N.D5, N.C5,
      N.B4, N._, N.E5, N.D5, N.C5, N.B4, N.A4, N._,
    ],
    harmony: [
      // Dueto em terças entra a partir da Seção A' e brilha no Clímax C
      ...Array(32).fill(N._),
      N.C5, N._, N.E5, N.F5, N.A5, N._, N.G5, N.F5,
      N.E5, N._, N.C5, N.E5, N.F5, N._, N._, N._,
      N.D5, N._, N.C5, N.B4, N.A4, N._, N.B4, N.C5,
      N.B4, N._, N.A4, N.Gs4, N.E4, N._, N._, N._,
      N.A4, N._, N.C5, N.E5, N.D5, N._, N.C5, N.B4,
      N.C5, N._, N.E5, N.G5, N.F5, N._, N._, N._,
      N.B4, N._, N.D5, N.F5, N.E5, N._, N.D5, N.C5,
      N.B4, N._, N.C5, N.D5, N.B4, N._, N._, N._,
      N.F5, N._, N.G5, N.A5, N.G5, N._, N.F5, N.E5,
      N.F5, N._, N.E5, N.C5, N.B4, N._, N.C5, N.E5,
      N.D5, N._, N.F5, N.E5, N.D5, N.C5, N.B4, N.A4,
      N.Gs4, N._, N.B4, N.A4, N.A4, N.Gs4, N.E4, N._,
    ],
    chords: [
      [N.F3, N.A3, N.C4, N.E4], [N.G3, N.B3, N.D4, N.E4], [N.E3, N.G3, N.B3, N.D4], [N.A3, N.C4, N.E4, N.G4],
      [N.F3, N.A3, N.C4, N.E4], [N.G3, N.B3, N.D4, N.G4], [N.D3, N.F3, N.A3, N.C4], [N.E3, N.Gs3, N.B3, N.E4],
      [N.C3, N.E3, N.G3, N.B3], [N.G3, N.B3, N.D4, N.G4], [N.D3, N.F3, N.A3, N.C4], [N.E3, N.Gs3, N.B3, N.D4],
      [N.F3, N.A3, N.C4, N.E4], [N.G3, N.B3, N.D4, N.G4], [N.D3, N.F3, N.A3, N.C4], [N.E3, N.Gs3, N.B3, N.E4],
    ],
    bass: [
      N.F2, N._, N.F3, N._, N.F2, N._, N.C3, N._,
      N.G2, N._, N.G3, N._, N.G2, N._, N.D3, N._,
      N.E2, N._, N.E3, N._, N.E2, N._, N.B2, N._,
      N.A2, N._, N.A3, N._, N.A2, N._, N.E3, N._,
      N.F2, N._, N.F3, N._, N.F2, N._, N.C3, N._,
      N.G2, N._, N.G3, N._, N.G2, N._, N.D3, N._,
      N.D2, N._, N.D3, N._, N.D2, N._, N.A2, N._,
      N.E2, N._, N.E3, N._, N.E2, N._, N.B2, N._,
    ],
    drums: [2, 1, 1, 1, 3, 1, 2, 1, 2, 1, 1, 2, 3, 1, 1, 1],
  },

  // 2. CAVERNA ASSOMBRADA — Misteriosa e Melancólica em F#m (estilo Castlevania / Pix Dark Chiptune)
  'caverna-assombrada': {
    stepMs: 225,
    leadVoice: 'pulse12',
    lead: [
      N.Fs5, N._, N.A5, N.Gs5, N.Fs5, N._, N.E5, N.Cs5,
      N.D5, N._, N.E5, N.Fs5, N.Gs5, N._, N._, N._,
      N.B5, N._, N.A5, N.Gs5, N.Fs5, N._, N.E5, N.Fs5,
      N.Gs5, N._, N.E5, N.Cs5, N.Fs5, N._, N._, N._,
      N.Cs5, N._, N.Fs5, N.Gs5, N.A5, N._, N.Gs5, N.Fs5,
      N.E5, N._, N.Gs5, N.B5, N.A5, N._, N._, N._,
      N.D5, N._, N.Fs5, N.A5, N.Gs5, N._, N.Fs5, N.E5,
      N.Cs5, N._, N.E5, N.Gs5, N.Fs5, N._, N._, N._,
      // Parte B + Clímax
      N.A5, N._, N.B5, N.Cs5, N.D5, N._, N.Fs5, N.A5,
      N.Gs5, N._, N.Fs5, N.E5, N.Cs5, N._, N._, N._,
      N.Fs5, N.Gs5, N.A5, N.B5, N.A5, N._, N.Gs5, N.Fs5,
      N.E5, N.Fs5, N.Gs5, N.E5, N.Fs5, N._, N._, N._,
      N.B5, N._, N.A5, N.Gs5, N.A5, N._, N.Fs5, N.D5,
      N.Cs5, N._, N.E5, N.Gs5, N.B5, N._, N.A5, N.Gs5,
      N.Fs5, N._, N.E5, N.D5, N.Cs5, N.D5, N.E5, N.Gs5,
      N.Fs5, N._, N.Cs5, N.A4, N.Fs4, N._, N._, N._,
    ],
    harmony: [
      ...Array(64).fill(N._),
      N.Fs5, N._, N.Gs5, N.A4, N.B4, N._, N.D5, N.Fs5,
      N.E5, N._, N.D5, N.Cs5, N.A4, N._, N._, N._,
      N.D5, N.E5, N.Fs5, N.Gs5, N.Fs5, N._, N.E5, N.D5,
      N.Cs5, N.D5, N.E5, N.Cs5, N.Cs5, N._, N._, N._,
      N.Gs5, N._, N.Fs5, N.E5, N.Fs5, N._, N.D5, N.B4,
      N.A4, N._, N.Cs5, N.E5, N.Gs5, N._, N.Fs5, N.E5,
      N.D5, N._, N.Cs5, N.B4, N.A4, N.B4, N.Cs5, N.E5,
      N.Cs5, N._, N.A4, N.Fs4, N.Cs4, N._, N._, N._,
    ],
    chords: [
      [N.Fs3, N.A3, N.Cs4, N.E4], [N.D3, N.Fs3, N.A3, N.Cs4], [N.B2, N.D3, N.Fs3, N.A3], [N.Cs3, N.F3, N.Gs3, N.B3],
      [N.Fs3, N.A3, N.Cs4, N.Fs4], [N.E3, N.Gs3, N.B3, N.E4], [N.D3, N.Fs3, N.A3, N.D4], [N.Cs3, N.F3, N.Gs3, N.Cs4],
      [N.D3, N.Fs3, N.A3, N.D4], [N.E3, N.Gs3, N.B3, N.E4], [N.Fs3, N.A3, N.Cs4, N.Fs4], [N.Cs3, N.F3, N.Gs3, N.B3],
      [N.B2, N.D3, N.Fs3, N.B3], [N.Cs3, N.F3, N.Gs3, N.Cs4], [N.D3, N.Fs3, N.A3, N.D4], [N.Fs3, N.A3, N.Cs4, N.Fs4],
    ],
    bass: [
      N.Fs2, N._, N.Fs3, N._, N.Fs2, N._, N.Cs3, N._,
      N.D2, N._, N.D3, N._, N.D2, N._, N.A2, N._,
      N.B2, N._, N.B3, N._, N.B2, N._, N.Fs2, N._,
      N.Cs3, N._, N.Gs2, N._, N.Cs3, N._, N.Fs2, N._,
      N.Fs2, N._, N.Cs3, N._, N.Fs2, N._, N.A2, N._,
      N.E2, N._, N.B2, N._, N.E2, N._, N.Gs2, N._,
      N.D2, N._, N.A2, N._, N.D2, N._, N.Fs2, N._,
      N.Cs3, N._, N.Gs2, N._, N.Cs3, N._, N.Fs2, N._,
    ],
    drums: [2, 0, 1, 0, 3, 0, 1, 2, 2, 0, 1, 0, 3, 1, 1, 0],
  },

  // 3. CAVERNA DE FOGO — Marcha Vulcânica Enérgica em Mi Menor / Frígio
  'caverna-de-fogo': {
    stepMs: 185,
    leadVoice: 'square',
    lead: [
      N.E5, N._, N.F5, N.E5, N.G5, N._, N.F5, N.E5,
      N.B5, N._, N.A5, N.G5, N.F5, N._, N.E5, N._,
      N.E5, N.F5, N.G5, N.A5, N.B5, N._, N.C6, N.B5,
      N.A5, N.G5, N.F5, N.E5, N.D5, N._, N.E5, N._,
      N.G5, N._, N.A5, N.B5, N.C6, N._, N.B5, N.A5,
      N.B5, N._, N.G5, N.E5, N.F5, N._, N.D5, N._,
      N.E5, N._, N.G5, N.B5, N.A5, N._, N.G5, N.Fs5,
      N.E5, N._, N.B4, N.D5, N.E5, N._, N._, N._,
      // Parte B + Clímax Vulcânico
      N.B5, N._, N.B5, N.C6, N.B5, N._, N.A5, N.G5,
      N.A5, N._, N.A5, N.B5, N.A5, N._, N.G5, N.F5,
      N.G5, N._, N.G5, N.A5, N.G5, N._, N.F5, N.E5,
      N.F5, N.G5, N.A5, N.F5, N.B5, N._, N._, N._,
      N.E5, N.G5, N.B5, N.E5, N.F5, N.A5, N.C6, N.F5,
      N.G5, N.B5, N.D5, N.G5, N.A5, N.C6, N.B5, N.A5,
      N.B5, N._, N.A5, N.G5, N.F5, N.E5, N.D5, N.C5,
      N.B4, N._, N.Eb5, N.Fs5, N.E5, N._, N._, N._,
    ],
    harmony: [
      ...Array(64).fill(N._),
      N.G5, N._, N.G5, N.A5, N.G5, N._, N.F5, N.E5,
      N.F5, N._, N.F5, N.G5, N.F5, N._, N.E5, N.D5,
      N.E5, N._, N.E5, N.F5, N.E5, N._, N.D5, N.C5,
      N.D5, N.E5, N.F5, N.D5, N.Gs5, N._, N._, N._,
      N.B4, N.E5, N.G5, N.B4, N.C5, N.F5, N.A5, N.C5,
      N.D5, N.G5, N.B4, N.D5, N.E5, N.A5, N.G5, N.F5,
      N.G5, N._, N.F5, N.E5, N.D5, N.C5, N.B4, N.A4,
      N.Gs4, N._, N.B4, N.Eb5, N.B4, N._, N._, N._,
    ],
    chords: [
      [N.E3, N.G3, N.B3, N.E4], [N.F3, N.A3, N.C4, N.F4], [N.G3, N.B3, N.D4, N.G4], [N.F3, N.A3, N.C4, N.E4],
      [N.E3, N.G3, N.B3, N.E4], [N.C3, N.E3, N.G3, N.C4], [N.D3, N.F3, N.A3, N.D4], [N.B2, N.Eb3, N.Fs3, N.B3],
      [N.E3, N.G3, N.B3, N.E4], [N.A3, N.C4, N.E4, N.A4], [N.G3, N.B3, N.D4, N.G4], [N.B2, N.Eb3, N.Fs3, N.B3],
      [N.E3, N.G3, N.B3, N.E4], [N.F3, N.A3, N.C4, N.F4], [N.G3, N.B3, N.D4, N.G4], [N.B2, N.Eb3, N.Fs3, N.E4],
    ],
    bass: [
      N.E2, N.E2, N.B2, N.E2, N.E2, N.E2, N.B2, N.E2,
      N.F2, N.F2, N.C3, N.F2, N.F2, N.F2, N.C3, N.F2,
      N.G2, N.G2, N.D3, N.G2, N.F2, N.F2, N.C3, N.F2,
      N.E2, N.E2, N.B2, N.E2, N.B2, N.B2, N.Fs2, N.B2,
      N.E2, N.E2, N.B2, N.E2, N.C3, N.C3, N.G2, N.C3,
      N.D2, N.D2, N.A2, N.D2, N.B2, N.B2, N.Fs2, N.B2,
      N.E2, N.E2, N.B2, N.E2, N.F2, N.F2, N.C3, N.F2,
      N.G2, N.G2, N.D3, N.G2, N.B2, N.B2, N.E2, N._,
    ],
    drums: [4, 1, 2, 1, 3, 1, 4, 1, 4, 2, 1, 1, 3, 1, 2, 3],
  },

  // 4. DUNGEON DE GELO — Cristalina e Majestosa em Lá Menor / Dó Maior
  'dungeon-de-gelo': {
    stepMs: 210,
    leadVoice: 'pulse25',
    lead: [
      N.A5, N._, N.E5, N.A5, N.B5, N._, N.C6, N.B5,
      N.A5, N._, N.G5, N.E5, N.F5, N._, N._, N._,
      N.G5, N._, N.D5, N.G5, N.A5, N._, N.B5, N.A5,
      N.G5, N._, N.F5, N.E5, N.E5, N._, N._, N._,
      N.C6, N._, N.B5, N.A5, N.G5, N._, N.E5, N.C5,
      N.D5, N._, N.F5, N.A5, N.G5, N._, N._, N._,
      N.E5, N._, N.A5, N.C6, N.B5, N._, N.A5, N.Gs5,
      N.A5, N._, N.E5, N.C5, N.A4, N._, N._, N._,
      // Parte B + Clímax Glacial
      N.F5, N._, N.A5, N.C6, N.B5, N._, N.G5, N.D5,
      N.E5, N._, N.G5, N.C6, N.A5, N._, N._, N._,
      N.D5, N._, N.F5, N.A5, N.G5, N._, N.F5, N.E5,
      N.D5, N.E5, N.F5, N.G5, N.E5, N._, N._, N._,
      N.A5, N._, N.C6, N.B5, N.A5, N._, N.G5, N.F5,
      N.E5, N._, N.G5, N.C6, N.B5, N._, N.A5, N.G5,
      N.F5, N._, N.E5, N.D5, N.C5, N.D5, N.E5, N.Gs5,
      N.A5, N._, N.E5, N.A5, N.A5, N._, N._, N._,
    ],
    harmony: [
      ...Array(64).fill(N._),
      N.D5, N._, N.F5, N.A5, N.G5, N._, N.D5, N.B4,
      N.C5, N._, N.E5, N.G5, N.E5, N._, N._, N._,
      N.B4, N._, N.D5, N.F5, N.E5, N._, N.D5, N.C5,
      N.B4, N.C5, N.D5, N.E5, N.B4, N._, N._, N._,
      N.E5, N._, N.A5, N.G5, N.F5, N._, N.E5, N.D5,
      N.C5, N._, N.E5, N.G5, N.G5, N._, N.F5, N.E5,
      N.D5, N._, N.C5, N.B4, N.A4, N.B4, N.C5, N.E5,
      N.E5, N._, N.C5, N.E5, N.E5, N._, N._, N._,
    ],
    chords: [
      [N.A3, N.C4, N.E4, N.A4], [N.F3, N.A3, N.C4, N.F4], [N.G3, N.B3, N.D4, N.G4], [N.E3, N.Gs3, N.B3, N.E4],
      [N.C3, N.E3, N.G3, N.C4], [N.D3, N.F3, N.A3, N.D4], [N.E3, N.Gs3, N.B3, N.E4], [N.A3, N.C4, N.E4, N.A4],
      [N.F3, N.A3, N.C4, N.E4], [N.C3, N.E3, N.G3, N.C4], [N.D3, N.F3, N.A3, N.C4], [N.E3, N.Gs3, N.B3, N.D4],
      [N.A3, N.C4, N.E4, N.G4], [N.C3, N.E3, N.G3, N.B3], [N.D3, N.F3, N.A3, N.E4], [N.A3, N.C4, N.E4, N.A4],
    ],
    bass: [
      N.A2, N._, N.E3, N._, N.A2, N._, N.C3, N._,
      N.F2, N._, N.C3, N._, N.F2, N._, N.A2, N._,
      N.G2, N._, N.D3, N._, N.G2, N._, N.B2, N._,
      N.E2, N._, N.B2, N._, N.E2, N._, N.Gs2, N._,
      N.C3, N._, N.G2, N._, N.C3, N._, N.E3, N._,
      N.D2, N._, N.A2, N._, N.D2, N._, N.F2, N._,
      N.E2, N._, N.B2, N._, N.E2, N._, N.Gs2, N._,
      N.A2, N._, N.E3, N._, N.A2, N._, N.A2, N._,
    ],
    drums: [2, 1, 0, 1, 3, 1, 0, 1, 2, 1, 2, 1, 3, 1, 1, 0],
  },

  // 5. COMBATE DE FASE — Ritmo Ágil e Heróico 16-bit (Dm / C / Bb / A7)
  battle: {
    stepMs: 165,
    leadVoice: 'pulse25',
    lead: [
      N.D5, N._, N.F5, N.E5, N.D5, N.C5, N.D5, N.A4,
      N.Bb4, N._, N.C5, N.D5, N.E5, N._, N.C5, N._,
      N.D5, N._, N.F5, N.G5, N.A5, N._, N.G5, N.F5,
      N.E5, N.D5, N.Cs5, N.E5, N.A4, N._, N._, N._,
      N.F5, N._, N.G5, N.A5, N.G5, N._, N.F5, N.E5,
      N.D5, N._, N.E5, N.F5, N.E5, N._, N.C5, N._,
      N.Bb4, N.C5, N.D5, N.E5, N.F5, N._, N.E5, N.D5,
      N.Cs5, N._, N.E5, N.A5, N.D5, N._, N._, N._,
      // Segunda metade ainda mais épica!
      N.A5, N._, N.A5, N.Bb5, N.A5, N._, N.G5, N.F5,
      N.G5, N._, N.G5, N.A5, N.G5, N._, N.F5, N.E5,
      N.F5, N._, N.D5, N.F5, N.E5, N._, N.C5, N.E5,
      N.D5, N.E5, N.F5, N.G5, N.A5, N._, N._, N._,
      N.D5, N.F5, N.A5, N.G5, N.F5, N.E5, N.D5, N.C5,
      N.Bb4, N.D5, N.F5, N.E5, N.D5, N.C5, N.Bb4, N.A4,
      N.G4, N.Bb4, N.D5, N.F5, N.E5, N.D5, N.Cs5, N.E5,
      N.D5, N._, N.A4, N.D5, N.D5, N._, N._, N._,
    ],
    harmony: [
      ...Array(64).fill(N._),
      N.F5, N._, N.F5, N.G5, N.F5, N._, N.E5, N.D5,
      N.E5, N._, N.E5, N.F5, N.E5, N._, N.D5, N.C5,
      N.D5, N._, N.Bb4, N.D5, N.C5, N._, N.A4, N.C5,
      N.Bb4, N.C5, N.D5, N.E5, N.E5, N._, N._, N._,
      N.A4, N.D5, N.F5, N.E5, N.D5, N.C5, N.Bb4, N.A4,
      N.F4, N.Bb4, N.D5, N.C5, N.Bb4, N.A4, N.G4, N.F4,
      N.E4, N.G4, N.Bb4, N.D5, N.Cs5, N.Bb4, N.A4, N.Cs5,
      N.A4, N._, N.F4, N.A4, N.A4, N._, N._, N._,
    ],
    chords: [
      [N.D3, N.F3, N.A3, N.D4], [N.Bb2, N.D3, N.F3, N.Bb3], [N.C3, N.E3, N.G3, N.C4], [N.A2, N.Cs3, N.E3, N.A3],
      [N.D3, N.F3, N.A3, N.D4], [N.C3, N.E3, N.G3, N.C4], [N.Bb2, N.D3, N.F3, N.Bb3], [N.A2, N.Cs3, N.E3, N.A3],
      [N.D3, N.F3, N.A3, N.D4], [N.C3, N.E3, N.G3, N.C4], [N.Bb2, N.D3, N.F3, N.Bb3], [N.A2, N.Cs3, N.E3, N.A3],
      [N.D3, N.F3, N.A3, N.D4], [N.Bb2, N.D3, N.F3, N.Bb3], [N.G2, N.Bb2, N.D3, N.A3], [N.D3, N.F3, N.A3, N.D4],
    ],
    bass: [
      N.D2, N.D3, N.D2, N.A2, N.D2, N.D3, N.F2, N.E2,
      N.Bb2, N.Bb3, N.Bb2, N.F2, N.Bb2, N.Bb3, N.D3, N.C3,
      N.C3, N.C4, N.C3, N.G2, N.C3, N.C4, N.E3, N.D3,
      N.A2, N.A3, N.A2, N.E2, N.A2, N.A3, N.Cs3, N.A2,
      N.D2, N.D3, N.A2, N.D3, N.C3, N.C4, N.G2, N.C3,
      N.Bb2, N.Bb3, N.F2, N.Bb2, N.A2, N.A3, N.E2, N.A2,
      N.G2, N.G3, N.D3, N.G2, N.A2, N.A3, N.E2, N.A2,
      N.D2, N.D3, N.A2, N.F2, N.D2, N._, N.D2, N._,
    ],
    drums: [4, 1, 2, 1, 3, 1, 2, 1, 4, 1, 2, 2, 3, 1, 2, 1],
  },

  // 6. TEMA ÉPICO DE CHEFE — Clímax Final JRPG 128 Steps em Ré Menor
  boss: {
    stepMs: 150,
    leadVoice: 'square',
    lead: [
      N.D5, N._, N.D5, N.F5, N.E5, N.D5, N.C5, N.D5,
      N.A4, N._, N.Bb4, N.C5, N.Bb4, N.A4, N.G4, N.A4,
      N.D5, N._, N.F5, N.G5, N.A5, N._, N.G5, N.F5,
      N.E5, N.F5, N.E5, N.D5, N.Cs5, N._, N.A4, N._,
      N.Bb4, N._, N.D5, N.F5, N.E5, N._, N.C5, N.G4,
      N.A4, N._, N.C5, N.F5, N.E5, N.D5, N.C5, N.Bb4,
      N.G5, N._, N.F5, N.E5, N.F5, N._, N.D5, N.A4,
      N.Bb4, N.C5, N.D5, N.E5, N.F5, N.E5, N.Cs5, N._,
      // Clímax oitava acima + duelo final!
      N.A5, N._, N.G5, N.F5, N.G5, N._, N.F5, N.E5,
      N.F5, N._, N.E5, N.D5, N.E5, N._, N.Cs5, N.A4,
      N.D5, N.E5, N.F5, N.G5, N.A5, N._, N.C6, N.A5,
      N.G5, N.F5, N.E5, N.D5, N.E5, N._, N._, N._,
      N.F5, N._, N.A5, N.C6, N.B5, N._, N.G5, N.E5,
      N.A5, N._, N.G5, N.F5, N.E5, N._, N.D5, N.C5,
      N.D5, N.F5, N.A5, N.F5, N.E5, N.G5, N.A5, N.G5,
      N.F5, N.E5, N.D5, N.Cs5, N.D5, N._, N._, N._,
    ],
    harmony: [
      ...Array(64).fill(N._),
      N.F5, N._, N.E5, N.D5, N.E5, N._, N.D5, N.Cs5,
      N.D5, N._, N.C5, N.Bb4, N.Cs5, N._, N.A4, N.E4,
      N.Bb4, N.C5, N.D5, N.E5, N.F5, N._, N.A5, N.F5,
      N.E5, N.D5, N.Cs5, N.Bb4, N.Cs5, N._, N._, N._,
      N.D5, N._, N.F5, N.A5, N.G5, N._, N.E5, N.C5,
      N.F5, N._, N.E5, N.D5, N.Cs5, N._, N.Bb4, N.A4,
      N.Bb4, N.D5, N.F5, N.D5, N.Cs5, N.E5, N.F5, N.E5,
      N.D5, N.Cs5, N.Bb4, N.A4, N.A4, N._, N._, N._,
    ],
    chords: [
      [N.D3, N.F3, N.A3, N.D4], [N.C3, N.E3, N.G3, N.C4], [N.Bb2, N.D3, N.F3, N.Bb3], [N.A2, N.Cs3, N.E3, N.A3],
      [N.Bb2, N.D3, N.F3, N.Bb3], [N.F3, N.A3, N.C4, N.F4], [N.G3, N.Bb3, N.D4, N.G4], [N.A2, N.Cs3, N.E3, N.A3],
      [N.D3, N.F3, N.A3, N.D4], [N.A2, N.Cs3, N.E3, N.A3], [N.Bb2, N.D3, N.F3, N.Bb3], [N.C3, N.E3, N.G3, N.C4],
      [N.F3, N.A3, N.C4, N.F4], [N.G3, N.Bb3, N.D4, N.G4], [N.Bb2, N.D3, N.F3, N.A3], [N.D3, N.F3, N.A3, N.D4],
    ],
    bass: [
      N.D2, N.D3, N.D2, N.D3, N.D2, N.D3, N.F2, N.E2,
      N.C2, N.C3, N.C3, N.G2, N.C3, N.C3, N.E3, N.D3,
      N.Bb2, N.Bb2, N.F2, N.Bb2, N.Bb2, N.Bb2, N.D3, N.C3,
      N.A2, N.A2, N.E2, N.A2, N.A2, N.A2, N.Cs3, N.A2,
      N.Bb2, N.Bb2, N.F2, N.Bb2, N.C3, N.C3, N.G2, N.C3,
      N.F2, N.F2, N.C3, N.F2, N.D2, N.D3, N.A2, N.D2,
      N.G2, N.G2, N.D3, N.G2, N.A2, N.A2, N.E2, N.A2,
      N.Bb2, N.C3, N.D3, N.E3, N.A2, N.A2, N.D2, N._,
    ],
    drums: [4, 2, 1, 2, 3, 1, 4, 2, 4, 2, 1, 2, 3, 2, 3, 1],
  },
};

export function startRpgMusic(track: RpgMusicTrack): void {
  if (typeof window === 'undefined' || !isRpgMusicEnabled()) return;
  if (currentTrack === track && musicTimer !== null) return;

  stopRpgMusic();
  currentTrack = track;
  stepIndex = 0;

  const pattern = CHIPTUNE_TRACKS[track];
  const stepSec = pattern.stepMs / 1000;

  const tick = () => {
    if (!isRpgMusicEnabled()) {
      stopRpgMusic();
      return;
    }
    const audioCtx = getCtx();
    if (!audioCtx || audioCtx.state === 'suspended') return;

    const vol = getRpgMusicVolume();
    if (vol <= 0.01) return;

    const idx = stepIndex % pattern.lead.length;

    // 1. Lead Chiptune (Pulse 25%/12.5% com vibrato expressivo)
    const leadFreq = pattern.lead[idx];
    if (leadFreq > 0) {
      // Estende duração se o próximo step for pausa (frases ligadas estilo "A Lonely Cherry Tree")
      const nextIsRest = pattern.lead[(idx + 1) % pattern.lead.length] === 0;
      const dur = stepSec * (nextIsRest ? 1.85 : 0.92);
      playChipNote(audioCtx, leadFreq, 0, dur, vol * 0.095, pattern.leadVoice, {
        vibrato: nextIsRest,
        reverb: true,
        cutoff: 3600,
      });
    }

    // 2. Dueto / Contramelodia em terças (entra na segunda metade para evolução épica!)
    const harmFreq = pattern.harmony[idx];
    if (harmFreq > 0) {
      const nextIsRest = pattern.harmony[(idx + 1) % pattern.harmony.length] === 0;
      const dur = stepSec * (nextIsRest ? 1.75 : 0.88);
      playChipNote(audioCtx, harmFreq, 0, dur, vol * 0.052, 'pulse25', {
        reverb: true,
        cutoff: 2800,
      });
    }

    // 3. Arpejo Rápido 16-bit de Acordes (100% chiptune clássico)
    const arpFreq = getArpNote(pattern.chords, idx);
    if (arpFreq > 0) {
      playChipNote(audioCtx, arpFreq, 0, stepSec * 0.72, vol * 0.036, 'pulse12', {
        reverb: true,
        cutoff: 2400,
      });
    }

    // 4. NES Triangle Bass (limpo e pulsante)
    const bassFreq = pattern.bass[idx % pattern.bass.length];
    if (bassFreq > 0) {
      playChipNote(audioCtx, bassFreq, 0, stepSec * 1.15, vol * 0.13, 'triangle', {
        cutoff: 680,
      });
    }

    // 5. Percussão Chip-Noise (Kick / Snare / Hi-Hat)
    const drumHit = pattern.drums[idx % pattern.drums.length];
    if (drumHit > 0) {
      playChipDrum(audioCtx, drumHit, vol);
    }

    stepIndex += 1;
  };

  tick();
  musicTimer = window.setInterval(tick, pattern.stepMs);
}

export function stopRpgMusic(): void {
  if (musicTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(musicTimer);
  }
  musicTimer = null;
  currentTrack = null;
}

export const RPG_TRACK_LABELS: Record<RpgMusicTrack, string> = {
  'gruta-esquecida': 'Tema: Gruta Esquecida (Chiptune)',
  'caverna-assombrada': 'Tema: Caverna Assombrada',
  'caverna-de-fogo': 'Tema: Caverna de Fogo',
  'dungeon-de-gelo': 'Tema: Dungeon de Gelo',
  battle: 'Tema: Batalha de Conhecimento',
  boss: 'Tema Épico: Combate contra Chefe',
};
