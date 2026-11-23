'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  Flag,
  HelpCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { QuestionCard } from '@/components/QuestionCard';
import { GameEffectsOverlay } from '@/components/GameEffectsOverlay';
import { ProfessorCompanion } from '@/components/ProfessorCompanion';
import { playSound } from '@/lib/sounds';
import { cn, formatDateBR, formatSeconds } from '@/lib/utils';
import type { ExamSessionDetail } from '@/types/domain';

export default function SimuladoResultadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<ExamSessionDetail | null>(null);
  const [tab, setTab] = useState<'resumo' | 'correcao'>('resumo');
  const [filter, setFilter] = useState<'all' | 'wrong' | 'correct' | 'review'>('all');
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  useEffect(() => {
    fetch(`/api/exams/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        const s: ExamSessionDetail | null = data.session ?? null;
        setSession(s);
        if (s && s.scorePercent >= 70) {
          setConfettiTrigger(1);
          playSound('victory');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleRepeatSimilar = async () => {
    if (!session) return;
    setRestarting(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session.config),
      });
      const data = (await res.json()) as { session?: { id: string } };
      if (res.ok && data.session) {
        router.push(`/simulados/${data.session.id}`);
      }
    } finally {
      setRestarting(false);
    }
  };

  if (loading) {
    return <div className="h-96 bg-white border border-zinc-200 rounded-2xl animate-pulse" />;
  }

  if (!session) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center">
        <p className="text-sm font-medium text-zinc-800">Resultado não encontrado.</p>
      </div>
    );
  }

  const avgSecondsPerQuestion =
    session.totalQuestions > 0 ? Math.round(session.durationSeconds / session.totalQuestions) : 0;
  const reviewCount = session.items.filter((i) => i.markedForReview).length;

  const filteredItems = session.items.filter((item) => {
    if (filter === 'wrong') return item.isCorrect !== true;
    if (filter === 'correct') return item.isCorrect === true;
    if (filter === 'review') return item.markedForReview;
    return true;
  });

  const medal =
    session.scorePercent >= 85
      ? { label: 'Desempenho Ouro', cls: 'bg-amber-50 text-amber-800 border-amber-300' }
      : session.scorePercent >= 70
        ? { label: 'Desempenho Prata', cls: 'bg-sky-50 text-sky-800 border-sky-200' }
        : session.scorePercent >= 50
          ? { label: 'Desempenho Bronze', cls: 'bg-orange-50 text-orange-800 border-orange-200' }
          : null;

  return (
    <div className="space-y-6">
      <GameEffectsOverlay
        confettiTrigger={confettiTrigger}
        confettiIntensity="big"
        feedback={null}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/simulados"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para Simulados
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
              Resultado — {session.title}
            </h1>
            {medal && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border',
                  medal.cls
                )}
              >
                <Award className="w-3.5 h-3.5" />
                {medal.label}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Finalizado em {formatDateBR(session.finishedAt ?? session.startedAt)}
          </p>
        </div>

        <button
          type="button"
          disabled={restarting}
          onClick={handleRepeatSimilar}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          {restarting ? 'Criando...' : 'Novo simulado semelhante'}
        </button>
      </div>

      {/* KPIs */}
      <ProfessorCompanion
        mood={
          session.scorePercent >= 70
            ? 'celebrate_clap'
            : session.scorePercent >= 50
              ? 'talking'
              : 'angry_slam'
        }
        badge={
          session.scorePercent >= 70
            ? 'APROVADO!'
            : session.scorePercent >= 50
              ? 'QUASE LÁ!'
              : 'REVISÃO URGENTE!'
        }
        message={
          session.scorePercent >= 70
            ? `Parabéns! Você atingiu ${session.scorePercent}% (${session.correctCount}/${session.totalQuestions}), acima da nota de corte de 70% do IREB CPRE!`
            : session.scorePercent >= 50
              ? `Você fez ${session.scorePercent}% (${session.correctCount}/${session.totalQuestions}). Está perto dos 70% — revise as ${session.wrongCount} questão(ões) errada(s) na aba de correção!`
              : `Atenção no quadro! ${session.scorePercent}% ainda está abaixo da meta de 70%. Vamos revisar cada erro na aba "Correção detalhada" para virar esse jogo!`
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5">
          <div className="text-xs text-zinc-500 font-medium">Aproveitamento</div>
          <div className="text-3xl font-semibold tracking-tight text-zinc-950 mt-1">
            {session.scorePercent}%
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {session.correctCount} de {session.totalQuestions} questões
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5">
          <div className="text-xs text-zinc-500 font-medium">Acertos / Erros</div>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="inline-flex items-center gap-1 text-xl font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              {session.correctCount}
            </span>
            <span className="inline-flex items-center gap-1 text-xl font-semibold text-rose-700">
              <XCircle className="w-4 h-4" />
              {session.wrongCount}
            </span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {session.unansweredCount} não respondida(s)
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5">
          <div className="text-xs text-zinc-500 font-medium">Tempo utilizado</div>
          <div className="text-2xl font-semibold font-mono text-zinc-950 mt-1 flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            {formatSeconds(session.durationSeconds)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Média: {formatSeconds(avgSecondsPerQuestion)} / questão
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5">
          <div className="text-xs text-zinc-500 font-medium">Marcadas para revisão</div>
          <div className="text-2xl font-semibold text-zinc-950 mt-1 flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-500" />
            {reviewCount}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Disponíveis na correção detalhada</div>
        </div>
      </div>

      {/* Tabs Resumo / Correção Detalhada */}
      <div className="inline-flex p-1 rounded-xl bg-zinc-200/70">
        <button
          type="button"
          onClick={() => setTab('resumo')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'resumo' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
          )}
        >
          Resumo
        </button>
        <button
          type="button"
          onClick={() => setTab('correcao')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'correcao' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
          )}
        >
          Correção detalhada ({session.items.length})
        </button>
      </div>

      {tab === 'resumo' ? (
        <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900">Mapa de respostas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {session.items.map((item) => {
              const unanswered = item.selectedAnswers.length === 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab('correcao')}
                  className="text-left rounded-xl border border-zinc-200/80 p-3.5 hover:bg-zinc-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-zinc-900">
                        Q{String(item.position).padStart(2, '0')}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        ({item.questionCodigo})
                      </span>
                      {item.markedForReview && <Flag className="w-3 h-3 text-amber-500" />}
                    </div>
                    <p className="text-xs text-zinc-600 truncate mt-0.5">
                      {item.question.enunciado}
                    </p>
                  </div>
                  {unanswered ? (
                    <HelpCircle className="w-4 h-4 text-zinc-400 shrink-0" />
                  ) : item.isCorrect ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['all', `Todas (${session.items.length})`],
                ['wrong', `Erradas / Em branco (${session.wrongCount + session.unansweredCount})`],
                ['correct', `Corretas (${session.correctCount})`],
                ['review', `Marcadas para revisão (${reviewCount})`],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFilter(val)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  filter === val
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            {filteredItems.map((item) => (
              <div key={item.id} className="space-y-3">
                <QuestionCard
                  question={item.question}
                  selectedAnswers={item.selectedAnswers}
                  onSelectionChange={() => {}}
                  disabled
                  showFeedback
                  isCorrect={item.isCorrect}
                  headerRight={
                    item.markedForReview ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                        <Flag className="w-3 h-3" />
                        Marcada para revisão
                      </span>
                    ) : null
                  }
                />
                <div className="bg-white rounded-xl border border-zinc-200/80 px-5 py-4">
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                    Explicação original (questoes.json)
                  </div>
                  <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-line">
                    {item.question.explicacao}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
