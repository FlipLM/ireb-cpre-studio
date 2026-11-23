'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CalendarClock, CheckCircle2, Play, RotateCcw } from 'lucide-react';
import { cn, formatShortDateBR } from '@/lib/utils';
import type { QuestionWithProgress } from '@/types/domain';

function RevisaoContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'espacada' ? 'espacada' : 'erros';

  const [tab, setTab] = useState<'erros' | 'espacada'>(initialTab);
  const [questions, setQuestions] = useState<QuestionWithProgress[]>([]);
  const [requiredStreak, setRequiredStreak] = useState(2);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/questions').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ])
      .then(([qData, sData]) => {
        setQuestions(qData.questions ?? []);
        if (sData?.settings?.errorReviewRequiredStreak) {
          setRequiredStreak(sData.settings.errorReviewRequiredStreak);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const errorQuestions = questions
    .filter((q) => q.progress.needsErrorReview)
    .sort((a, b) => b.progress.wrongCount - a.progress.wrongCount);

  const nowIso = new Date().toISOString();
  const spacedQuestions = questions
    .filter((q) => Boolean(q.progress.spacedRepetition?.nextReviewAt))
    .sort((a, b) =>
      (a.progress.spacedRepetition?.nextReviewAt ?? '').localeCompare(
        b.progress.spacedRepetition?.nextReviewAt ?? ''
      )
    );
  const dueSpacedCount = spacedQuestions.filter(
    (q) => (q.progress.spacedRepetition?.nextReviewAt ?? '') <= nowIso
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Revisão de Erros &amp; Revisão Espaçada
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Transforme erros em domínio consistente. Uma questão só sai da fila de erros após{' '}
            <strong className="text-zinc-800">{requiredStreak} acerto(s) consecutivo(s)</strong>,
            preservando todo o histórico anterior.
          </p>
        </div>

        {tab === 'erros' && errorQuestions.length > 0 && (
          <Link
            href="/estudar?filter=error_review"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            <Play className="w-4 h-4" />
            Praticar fila de erros ({errorQuestions.length})
          </Link>
        )}
        {tab === 'espacada' && dueSpacedCount > 0 && (
          <Link
            href="/estudar?filter=spaced"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <CalendarClock className="w-4 h-4" />
            Iniciar revisões vencidas ({dueSpacedCount})
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="inline-flex p-1 rounded-xl bg-zinc-200/70">
        <button
          type="button"
          onClick={() => setTab('erros')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
            tab === 'erros' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
          )}
        >
          <RotateCcw className="w-4 h-4" />
          Questões erradas ({errorQuestions.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('espacada')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
            tab === 'espacada'
              ? 'bg-white text-zinc-950 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          )}
        >
          <CalendarClock className="w-4 h-4" />
          Revisão espaçada ({dueSpacedCount} vencida(s))
        </button>
      </div>

      {loading ? (
        <div className="h-48 bg-white border border-zinc-200 rounded-2xl animate-pulse" />
      ) : tab === 'erros' ? (
        errorQuestions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-zinc-900">Fila de erros zerada</h2>
            <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">
              Ainda não há questões com erros pendentes de revisão. Sempre que você errar uma
              questão no modo estudo ou em simulados, ela aparecerá aqui automaticamente.
            </p>
            <Link
              href="/estudar"
              className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
            >
              Ir para o Modo Estudo
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {errorQuestions.map((q) => {
              const streak = q.progress.spacedRepetition?.consecutiveCorrect ?? 0;
              return (
                <div
                  key={q.codigo}
                  className="bg-white rounded-2xl border border-zinc-200/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-zinc-900 text-white">
                        #{String(q.numero).padStart(2, '0')}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                        {q.codigo}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertCircle className="w-3 h-3" />
                        {q.progress.wrongCount} erro(s)
                      </span>
                      <span className="text-xs text-zinc-500">
                        Sequência atual: <strong>{streak}/{requiredStreak}</strong> acertos
                      </span>
                    </div>

                    <p className="text-sm font-medium text-zinc-900 line-clamp-2">{q.enunciado}</p>

                    <div className="text-xs text-zinc-500 flex flex-wrap gap-3">
                      <span>
                        Última seleção:{' '}
                        <strong className="font-mono text-zinc-800">
                          {q.progress.lastSelectedAnswers?.join(', ') || '—'}
                        </strong>
                      </span>
                      {q.progress.topicName && <span>• {q.progress.topicName}</span>}
                    </div>
                  </div>

                  <Link
                    href={`/estudar?codigo=${encodeURIComponent(q.codigo)}&filter=error_review`}
                    className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 shrink-0 text-center"
                  >
                    Resolver novamente
                  </Link>
                </div>
              );
            })}
          </div>
        )
      ) : spacedQuestions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center">
          <CalendarClock className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-zinc-900">
            Nenhuma revisão espaçada agendada ainda
          </h2>
          <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">
            Responda questões no Modo Estudo e avalie a dificuldade percebida (Muito fácil a Muito
            difícil) para gerar sua agenda inteligente de revisão.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {spacedQuestions.map((q) => {
            const sr = q.progress.spacedRepetition!;
            const isDue = (sr.nextReviewAt ?? '') <= nowIso;
            return (
              <div
                key={q.codigo}
                className="bg-white rounded-2xl border border-zinc-200/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-zinc-900 text-white">
                      #{String(q.numero).padStart(2, '0')}
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                      {q.codigo}
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded border',
                        isDue
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                      )}
                    >
                      {isDue
                        ? 'Pronta para revisar agora'
                        : `Agendada para ${formatShortDateBR(sr.nextReviewAt)}`}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Intervalo: {sr.intervalDays} dia(s) • Dificuldade: {sr.difficulty}/5
                    </span>
                  </div>
                  <p className="text-sm font-medium text-zinc-900 line-clamp-2">{q.enunciado}</p>
                </div>

                <Link
                  href={`/estudar?codigo=${encodeURIComponent(q.codigo)}`}
                  className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-800 text-xs font-medium hover:bg-zinc-50 shrink-0 text-center"
                >
                  Revisar
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RevisaoPage() {
  return (
    <Suspense fallback={<div className="h-64 bg-white border border-zinc-200 rounded-2xl animate-pulse" />}>
      <RevisaoContent />
    </Suspense>
  );
}
