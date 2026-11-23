'use client';

export type SoundEffect =
  | 'select'
  | 'correct'
  | 'combo'
  | 'wrong'
  | 'favorite'
  | 'flag'
  | 'complete'
  | 'victory'
  | 'timerWarning'
  | 'tick';

const STORAGE_KEY = 'cpre_studio_sounds_enabled';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return true;
  return raw === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  slideToFreq?: number
) {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideToFreq) {
    osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.03);
}

/**
 * Reproduz efeitos sonoros de jogo de perguntas e respostas via Web Audio API.
 * `comboCount` eleva progressivamente a afinação do som de combo (estilo Duolingo/Quiz).
 */
export function playSound(
  effect: SoundEffect,
  options?: boolean | { force?: boolean; comboCount?: number }
): void {
  const force = typeof options === 'boolean' ? options : Boolean(options?.force);
  const comboCount = typeof options === 'object' ? options.comboCount ?? 2 : 2;

  if (!force && !isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  switch (effect) {
    case 'select':
      // Clique crocante de botão de quiz
      playTone(ctx, 560, 0, 0.045, 0.055, 'triangle', 680);
      break;

    case 'correct':
      // Ding vibrante de acerto (C5 -> E5 -> G5 -> C6)
      playTone(ctx, 523.25, 0, 0.13, 0.09, 'triangle');
      playTone(ctx, 659.25, 0.06, 0.14, 0.09, 'triangle');
      playTone(ctx, 783.99, 0.12, 0.2, 0.1, 'sine');
      playTone(ctx, 1046.5, 0.17, 0.28, 0.075, 'sine');
      break;

    case 'combo': {
      // Escala ascendente que sobe conforme o combo cresce (até +7 semitons)
      const semitoneShift = Math.min(7, Math.max(0, comboCount - 2));
      const ratio = Math.pow(2, semitoneShift / 12);
      playTone(ctx, 523.25 * ratio, 0, 0.11, 0.09, 'triangle');
      playTone(ctx, 659.25 * ratio, 0.055, 0.12, 0.095, 'triangle');
      playTone(ctx, 783.99 * ratio, 0.11, 0.14, 0.1, 'sine');
      playTone(ctx, 1046.5 * ratio, 0.165, 0.28, 0.11, 'sine');
      playTone(ctx, 1318.5 * ratio, 0.22, 0.32, 0.07, 'sine');
      break;
    }

    case 'wrong':
      // Som clássico amigável de erro de quiz show
      playTone(ctx, 311.13, 0, 0.15, 0.085, 'sawtooth', 260);
      playTone(ctx, 233.08, 0.13, 0.26, 0.085, 'triangle', 185);
      break;

    case 'favorite':
      // Brilho de estrela
      playTone(ctx, 880, 0, 0.09, 0.065, 'sine');
      playTone(ctx, 1318.5, 0.06, 0.16, 0.07, 'sine');
      break;

    case 'flag':
      // Marcação de revisão
      playTone(ctx, 622.25, 0, 0.08, 0.06, 'triangle');
      playTone(ctx, 740, 0.05, 0.1, 0.05, 'sine');
      break;

    case 'tick':
      // Tick sutil de contagem regressiva
      playTone(ctx, 920, 0, 0.03, 0.04, 'square');
      break;

    case 'timerWarning':
      // Pulso duplo de atenção (2 min restantes)
      playTone(ctx, 740, 0, 0.12, 0.08, 'triangle');
      playTone(ctx, 740, 0.18, 0.12, 0.08, 'triangle');
      break;

    case 'complete':
      // Fanfarra de encerramento
      playTone(ctx, 523.25, 0, 0.14, 0.085, 'triangle');
      playTone(ctx, 659.25, 0.09, 0.14, 0.085, 'triangle');
      playTone(ctx, 783.99, 0.18, 0.16, 0.09, 'sine');
      playTone(ctx, 1046.5, 0.27, 0.36, 0.1, 'sine');
      break;

    case 'victory':
      // Fanfarra triunfante de vitória (simulado >= 70%)
      playTone(ctx, 523.25, 0, 0.12, 0.09, 'triangle');
      playTone(ctx, 659.25, 0.08, 0.12, 0.09, 'triangle');
      playTone(ctx, 783.99, 0.16, 0.14, 0.095, 'triangle');
      playTone(ctx, 1046.5, 0.25, 0.2, 0.105, 'sine');
      playTone(ctx, 783.99, 0.36, 0.12, 0.08, 'triangle');
      playTone(ctx, 1046.5, 0.46, 0.48, 0.11, 'sine');
      playTone(ctx, 1318.5, 0.46, 0.48, 0.075, 'sine');
      break;
  }
}
