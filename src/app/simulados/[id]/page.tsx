'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
} from 'lucide-react';
import { QuestionCard } from '@/components/QuestionCard';
import { playSound } from '@/lib/sounds';
import { cn, formatSeconds } from '@/lib/utils';
import type { ExamSessionDetail } from '@/types/domain';

export default function SimuladoRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<ExamSessionDetail | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const itemStartRef = useRef<number>(Date.now());
  const elapsedRef = useRef<number>(0);
  const warnedTimerRef = useRef<boolean>(false);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/exams/${encodeURIComponent(id)}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { session: ExamSessionDetail };
    if (data.session.status === 'completed') {
      router.replace(`/simulados/${id}/resultado`);
      return;
    }
    setSession(data.session);
    setCurrentIndex(data.session.currentIndex || 0);
    setElapsedSeconds(data.session.durationSeconds || 0);
    elapsedRef.current = data.session.durationSeconds || 0;
    itemStartRef.current = Date.now();
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Cronômetro em tempo real
  useEffect(() => {
    if (!session || session.status !== 'in_progress') return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.status]);

  const persistProgress = useCallback(
    async (patch: {
      questionCodigo?: string;
      selectedAnswers?: string[];
      markedForReview?: boolean;
      currentIndex?: number;
      timeSpentMsDelta?: number;
    }) => {
      await fetch(`/api/exams/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...patch,
          durationSeconds: elapsedRef.current,
        }),
      });
    },
    [id]
  );

  const handleFinish = useCallback(async () => {
    setFinishing(true);
    try {
      const res = await fetch(`/api/exams/${encodeURIComponent(id)}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: elapsedRef.current }),
      });
      if (res.ok) {
        playSound('complete');
        router.replace(`/simulados/${id}/resultado`);
      }
    } finally {
      setFinishing(false);
    }
  }, [id, router]);

  // Finalização automática quando o tempo configurado esgota
  const limitSeconds =
    session?.config.durationMinutes != null ? session.config.durationMinutes * 60 : null;
  const remainingSeconds = limitSeconds !== null ? Math.max(0, limitSeconds - elapsedSeconds) : null;

  useEffect(() => {
    if (
      remainingSeconds !== null &&
      remainingSeconds > 0 &&
      remainingSeconds <= 120 &&
      !warnedTimerRef.current
    ) {
      warnedTimerRef.current = true;
      playSound('timerWarning');
    }
    if (remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 10) {
      playSound('tick');
    }
    if (remainingSeconds === 0 && session?.status === 'in_progress' && !finishing) {
      void handleFinish();
    }
  }, [finishing, handleFinish, remainingSeconds, session?.status]);

  if (loading) {
    return <div className="h-96 bg-white border border-zinc-200 rounded-2xl animate-pulse" />;
  }

  if (!session) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center">
        <p className="text-sm font-medium text-zinc-800">Simulado não encontrado.</p>
      </div>
    );
  }

  const currentItem = session.items[currentIndex];
  const answeredCount = session.items.filter((i) => i.selectedAnswers.length > 0).length;
  const pendingCount = session.items.length - answeredCount;
  const reviewCount = session.items.filter((i) => i.markedForReview).length;

  const navigateTo = (nextIdx: number) => {
    const delta = Date.now() - itemStartRef.current;
    itemStartRef.current = Date.now();
    const prevCodigo = currentItem?.questionCodigo;
    setCurrentIndex(nextIdx);
    void persistProgress({
      questionCodigo: prevCodigo,
      timeSpentMsDelta: delta,
      currentIndex: nextIdx,
    });
  };

  const handleSelectionChange = (nextSelected: string[]) => {
    if (!currentItem) return;
    setSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item, idx) =>
              idx === currentIndex ? { ...item, selectedAnswers: nextSelected } : item
            ),
          }
        : prev
    );
    void persistProgress({
      questionCodigo: currentItem.questionCodigo,
      selectedAnswers: nextSelected,
      currentIndex,
    });
  };

  const handleToggleReview = () => {
    if (!currentItem) return;
    const nextFlag = !currentItem.markedForReview;
    playSound('flag');
    setSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item, idx) =>
              idx === currentIndex ? { ...item, markedForReview: nextFlag } : item
            ),
          }
        : prev
    );
    void persistProgress({
      questionCodigo: currentItem.questionCodigo,
      markedForReview: nextFlag,
    });
  };

  return (
    <div className="space-y-6">
      {/* Barra superior de prova */}
      <header className="bg-white rounded-2xl border border-zinc-200/90 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Modo Simulado — Gabarito bloqueado
          </div>
          <h1 className="text-base font-semibold text-zinc-950">{session.title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border font-mono text-sm font-semibold',
              remainingSeconds !== null && remainingSeconds <= 120
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-zinc-50 border-zinc-200 text-zinc-800'
            )}
          >
            <Clock className="w-4 h-4" />
            {remainingSeconds !== null
              ? formatSeconds(remainingSeconds)
              : formatSeconds(elapsedSeconds)}
          </div>

          <button
            type="button"
            onClick={() => setShowFinishModal(true)}
            className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors"
          >
            Finalizar simulado
          </button>
        </div>
      </header>

      {/* Barra de progresso */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Questão {currentIndex + 1} de {session.items.length}
          </span>
          <span>
            {answeredCount} respondida(s) • {pendingCount} pendente(s) • {reviewCount} para
            revisão
          </span>
        </div>
        <div className="w-full h-1.5 bg-zinc-200/80 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
            style={{ width: `${(answeredCount / session.items.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Grid principal: Questão + Painel de navegação */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 items-start">
        <div className="space-y-4">
          {currentItem && (
            <QuestionCard
              question={currentItem.question}
              selectedAnswers={currentItem.selectedAnswers}
              onSelectionChange={handleSelectionChange}
              showFeedback={false}
              headerRight={
                <button
                  type="button"
                  onClick={handleToggleReview}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    currentItem.markedForReview
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  )}
                >
                  <Flag
                    className={cn(
                      'w-3.5 h-3.5',
                      currentItem.markedForReview && 'fill-amber-400 text-amber-600'
                    )}
                  />
                  {currentItem.markedForReview ? 'Marcada para revisão' : 'Marcar para revisão'}
                </button>
              }
            />
          )}

          <div className="flex items-center justify-between bg-white rounded-2xl border border-zinc-200/90 px-5 py-4">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => navigateTo(currentIndex - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              <ArrowLeft className="w-4 h-4" />
              Anterior
            </button>

            {currentIndex < session.items.length - 1 ? (
              <button
                type="button"
                onClick={() => navigateTo(currentIndex + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800"
              >
                Próxima
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowFinishModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <CheckCircle2 className="w-4 h-4" />
                Revisar e finalizar
              </button>
            )}
          </div>
        </div>

        {/* Painel lateral de navegação */}
        <aside className="bg-white rounded-2xl border border-zinc-200/90 p-5 space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Painel de questões
          </div>

          <div className="grid grid-cols-5 gap-2">
            {session.items.map((item, idx) => {
              const isCurrent = idx === currentIndex;
              const isAnswered = item.selectedAnswers.length > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(idx)}
                  className={cn(
                    'relative h-9 rounded-lg text-xs font-mono font-medium border transition-all',
                    isCurrent
                      ? 'bg-zinc-900 text-white border-zinc-900 ring-2 ring-zinc-900/20'
                      : item.markedForReview
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : isAnswered
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                  )}
                  title={`Questão ${String(item.position).padStart(2, '0')} — ${
                    item.markedForReview
                      ? 'Marcada para revisão'
                      : isAnswered
                        ? 'Respondida'
                        : 'Não respondida'
                  }`}
                >
                  {String(item.position).padStart(2, '0')}
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5 pt-3 border-t border-zinc-100 text-[11px] text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-300" />
              <span>Respondida ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
              <span>Marcada para revisão ({reviewCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-zinc-100 border border-zinc-300" />
              <span>Não respondida ({pendingCount})</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Modal de confirmação de finalização */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-zinc-950">
                  Finalizar simulado agora?
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Após confirmar, suas respostas serão corrigidas e registradas no seu histórico.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
                <div className="text-lg font-semibold text-zinc-900">{answeredCount}</div>
                <div className="text-[11px] text-zinc-500">Respondidas</div>
              </div>
              <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
                <div className="text-lg font-semibold text-rose-700">{pendingCount}</div>
                <div className="text-[11px] text-zinc-500">Pendentes</div>
              </div>
              <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
                <div className="text-lg font-semibold text-amber-700">{reviewCount}</div>
                <div className="text-[11px] text-zinc-500">Para revisão</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowFinishModal(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Continuar revisando
              </button>
              <button
                type="button"
                disabled={finishing}
                onClick={handleFinish}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {finishing ? 'Corrigindo...' : 'Confirmar e finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
