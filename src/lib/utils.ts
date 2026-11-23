import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { MasteryLevel } from '@/types/domain';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatStudyTime(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}min`;
  const hours = Math.floor(totalMinutes / 60);
  const remMins = totalMinutes % 60;
  return remMins > 0 ? `${hours}h ${remMins}min` : `${hours}h`;
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatShortDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(d);
}

export const MASTERY_META: Record<
  MasteryLevel,
  { label: string; badgeClass: string; barClass: string; order: number }
> = {
  nao_estudado: {
    label: 'Não estudado',
    badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    barClass: 'bg-zinc-300',
    order: 0,
  },
  conhecimento_inicial: {
    label: 'Conhecimento inicial',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    barClass: 'bg-rose-500',
    order: 1,
  },
  em_desenvolvimento: {
    label: 'Em desenvolvimento',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    barClass: 'bg-amber-500',
    order: 2,
  },
  bom_dominio: {
    label: 'Bom domínio',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    barClass: 'bg-sky-500',
    order: 3,
  },
  dominio_consistente: {
    label: 'Domínio consistente',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    barClass: 'bg-emerald-600',
    order: 4,
  },
};
