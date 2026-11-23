'use client';

export type MusicTrackId = 'quiz' | 'tension' | 'lofi' | 'piano';

export interface MusicTrack {
  id: MusicTrackId;
  label: string;
  shortLabel: string;
  subtitle: string;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'quiz', label: 'Quiz Show', shortLabel: 'Quiz', subtitle: 'Animada estilo jogo de perguntas' },
  { id: 'tension', label: 'Tensão Prova', shortLabel: 'Tensão', subtitle: 'Suspense rítmico para simulados' },
  { id: 'lofi', label: 'Lo-Fi Foco', shortLabel: 'Lo-Fi', subtitle: 'Acordes quentes e ritmo leve' },
  { id: 'piano', label: 'Piano Calmo', shortLabel: 'Piano', subtitle: 'Arpejos suaves para leitura' },
];

const VOL_STORAGE_KEY = 'cpre_studio_music_volume';
const TRACK_STORAGE_KEY = 'cpre_studio_music_track';

const LOFI_CHORDS: number[][] = [
  [130.81, 196.0, 246.94, 293.66, 329.63], // Cmaj9
  [110.0, 164.81, 220.0, 246.94, 261.63], // Am9
  [146.83, 220.0, 261.63, 329.63, 349.23], // Dm9
  [98.0, 174.61, 220.0, 246.94, 329.63], // G13
];

const LOFI_MELODY: number[][] = [
  [523.25, 659.25, 587.33, 493.88],
  [523.25, 440.0, 493.88, 392.0],
  [587.33, 659.25, 523.25, 440.0],
  [493.88, 587.33, 523.25, 392.0],
];

// Progressão energética de Quiz Show (Fmaj7 -> G6 -> Em7 -> Am7)
const QUIZ_BASS = [174.61, 196.0, 164.81, 220.0];
const QUIZ_ARP: number[][] = [
  [349.23, 440.0, 523.25, 659.25, 523.25, 440.0, 659.25, 523.25],
  [392.0, 493.88, 587.33, 659.25, 587.33, 493.88, 783.99, 587.33],
  [329.63, 392.0, 493.88, 587.33, 493.88, 392.0, 659.25, 493.88],
  [440.0, 523.25, 659.25, 783.99, 659.25, 523.25, 880.0, 659.25],
];

// Suspense estilo game show (Am -> F -> Dm -> E7)
const TENSION_PAD: number[][] = [
  [110.0, 164.81, 220.0, 261.63],
  [87.31, 130.81, 174.61, 220.0],
  [146.83, 174.61, 220.0, 293.66],
  [82.41, 123.47, 164.81, 207.65],
];

class AmbientMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private timerId: number | null = null;
  private step = 0;
  private playing = false;
  private track: MusicTrackId = 'quiz';
  private volume = 0.55;
  private listeners = new Set<() => void>();
  private unlocked = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedVol = Number(window.localStorage.getItem(VOL_STORAGE_KEY));
      if (Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) {
        this.volume = savedVol;
      }
      const savedTrack = window.localStorage.getItem(TRACK_STORAGE_KEY) as MusicTrackId | null;
      if (savedTrack && MUSIC_TRACKS.some((t) => t.id === savedTrack)) {
        this.track = savedTrack;
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private unlockMobileAudio(ctx: AudioContext) {
    // Permite tocar áudio no iOS Safari 17+ mesmo com a chave física no silencioso
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) {
        nav.audioSession.type = 'playback';
      }
    } catch {
      // ignora em navegadores sem audioSession
    }

    if (this.unlocked) return;
    try {
      // Dispara buffer silencioso de 1 sample de forma síncrona dentro do gesto de toque
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      this.unlocked = true;
    } catch {
      // ignora falha silenciosa
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;

    if (!this.ctx) {
      this.ctx = new Ctx();
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 2200;
      this.filter.Q.value = 0.7;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume * 1.65;

      this.filter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    this.unlockMobileAudio(this.ctx);

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  getState() {
    return {
      playing: this.playing,
      track: this.track,
      volume: this.volume,
    };
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VOL_STORAGE_KEY, String(this.volume));
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 1.65, this.ctx.currentTime, 0.08);
    }
    this.notify();
  }

  setTrack(track: MusicTrackId) {
    this.track = track;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TRACK_STORAGE_KEY, track);
    }
    if (this.playing) {
      this.stop();
      this.start();
    } else {
      this.notify();
    }
  }

  start() {
    if (this.playing) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.filter) return;

    this.playing = true;
    this.step = 0;

    const beginLoop = () => {
      if (!this.playing || !this.ctx || !this.filter) return;
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      if (this.track === 'quiz') {
        this.filter.frequency.setTargetAtTime(2600, this.ctx.currentTime, 0.15);
        this.playQuizStep();
        this.timerId = window.setInterval(() => this.playQuizStep(), 275); // ~109 BPM colcheias
      } else if (this.track === 'tension') {
        this.filter.frequency.setTargetAtTime(1400, this.ctx.currentTime, 0.2);
        this.playTensionStep();
        this.timerId = window.setInterval(() => this.playTensionStep(), 500); // Pulso 120 BPM
      } else if (this.track === 'lofi') {
        this.filter.frequency.setTargetAtTime(1550, this.ctx.currentTime, 0.2);
        this.playLofiStep();
        this.timerId = window.setInterval(() => this.playLofiStep(), 750);
      } else {
        this.filter.frequency.setTargetAtTime(2200, this.ctx.currentTime, 0.2);
        this.playPianoStep();
        this.timerId = window.setInterval(() => this.playPianoStep(), 850);
      }
    };

    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => beginLoop());
    } else {
      beginLoop();
    }

    this.notify();
  }

  stop() {
    this.playing = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.notify();
  }

  toggle(): boolean {
    if (this.playing) {
      this.stop();
    } else {
      this.start();
    }
    return this.playing;
  }

  private scheduleNote(
    freq: number,
    duration: number,
    gainPeak: number,
    type: OscillatorType = 'sine',
    attack = 0.03,
    delay = 0
  ) {
    if (!this.ctx || !this.filter) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gainPeak, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(g);
    g.connect(this.filter);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  private playKick(punch = 0.24) {
    if (!this.ctx || !this.filter) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.13);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(punch, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g);
    g.connect(this.filter);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  private playHat(vol = 0.04) {
    if (!this.ctx || !this.filter) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.035);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;

    const g = this.ctx.createGain();
    g.gain.value = vol;

    noise.connect(hp);
    hp.connect(g);
    g.connect(this.filter);
    noise.start();
  }

  private playQuizStep() {
    const bar = Math.floor(this.step / 8) % QUIZ_BASS.length;
    const sub = this.step % 8;
    const bassFreq = QUIZ_BASS[bar];
    const arpFreq = QUIZ_ARP[bar][sub];

    // Groove animado de quiz show
    if (sub === 0 || sub === 4) {
      this.playKick(0.22);
      this.scheduleNote(bassFreq / 2, 0.35, 0.11, 'triangle', 0.01);
    }
    if (sub === 2 || sub === 6) {
      this.playHat(0.055);
      this.scheduleNote(bassFreq, 0.2, 0.07, 'sine', 0.01);
    } else if (sub % 2 === 1) {
      this.playHat(0.025);
    }

    // Arpejo synth alegre e leve
    this.scheduleNote(arpFreq, 0.26, 0.065, 'triangle', 0.012);
    if (sub === 0 || sub === 3 || sub === 6) {
      this.scheduleNote(arpFreq * 2, 0.18, 0.025, 'sine', 0.01);
    }

    this.step += 1;
  }

  private playTensionStep() {
    const bar = Math.floor(this.step / 8) % TENSION_PAD.length;
    const sub = this.step % 8;
    const pad = TENSION_PAD[bar];

    if (sub === 0) {
      // Pad de suspense longo
      pad.forEach((f, idx) => {
        this.scheduleNote(f, 3.8, 0.055, 'sine', 0.35, idx * 0.04);
      });
    }

    // Pulso de batimento/relógio de game show
    if (sub % 2 === 0) {
      this.playKick(0.18);
      this.scheduleNote(pad[0], 0.22, 0.08, 'triangle', 0.015);
    } else {
      this.playHat(0.045);
      this.scheduleNote(pad[2] * 2, 0.09, 0.03, 'sine', 0.01);
    }

    this.step += 1;
  }

  private playLofiStep() {
    const bar = Math.floor(this.step / 4) % LOFI_CHORDS.length;
    const beat = this.step % 4;
    const chord = LOFI_CHORDS[bar];
    const melody = LOFI_MELODY[bar];

    if (beat === 0) {
      chord.forEach((freq, i) => {
        this.scheduleNote(freq, 2.9, 0.065, 'triangle', 0.06, i * 0.025);
      });
      this.playKick(0.2);
    } else if (beat === 2) {
      this.playKick(0.18);
      this.playHat(0.035);
    } else {
      this.playHat(0.03);
    }

    if (beat === 1 || beat === 3) {
      this.scheduleNote(melody[beat], 1.1, 0.055, 'sine', 0.03, 0.05);
    }

    this.step += 1;
  }

  private playPianoStep() {
    const bar = Math.floor(this.step / 4) % LOFI_CHORDS.length;
    const beat = this.step % 4;
    const chord = LOFI_CHORDS[bar];
    const melody = LOFI_MELODY[bar];

    if (beat === 0) {
      this.scheduleNote(chord[0], 3.2, 0.09, 'sine', 0.02);
    }
    const arpeggioFreq = chord[(beat + 1) % chord.length];
    this.scheduleNote(arpeggioFreq, 1.8, 0.075, 'triangle', 0.02);

    if (beat === 2) {
      this.scheduleNote(melody[0], 1.7, 0.06, 'sine', 0.025, 0.12);
    }

    this.step += 1;
  }
}

export const musicEngine = new AmbientMusicEngine();
