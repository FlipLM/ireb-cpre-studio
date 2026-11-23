'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Flame,
  Play,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { cn, formatStudyTime, MASTERY_META } from '@/lib/utils';
import type { StudyRecommendation, TopicPerformance } from '@/types/domain';

interface DashboardData {
  summary: {
    totalQuestions: number;
    answeredUnique: number;
    unansweredUnique: number;
    totalAttempts: number;
    totalCorrect: number;
    totalWrong: number;
    overallAccuracy: number | null;
    completedExamsCount: number;
    bestExamScore: number | null;
    latestExamScore: number | null;
    latestExamDate: string | null;
    totalStudyTimeMs: number;
    studyStreakDays: number;
    favoritesCount: number;
    errorReviewCount: number;
    dueSpacedReviewCount: number;
  };
  continueActivity: {
    type: 'exam' | 'study';
    title: string;
    subtitle: string;
    href: string;
    cta: string;
  } | null;
  bestTopics: TopicPerformance[];
  attentionTopics: TopicPerformance[];
  topics: TopicPerformance[];
  recommendations: StudyRecommendation[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-9 w-72 bg-zinc-200 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-zinc-200 rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-white border border-zinc-200 rounded-2xl" />
      </div>
    );
  }

  const { summary, continueActivity, bestTopics, attentionTopics, recommendations } = data;
  const hasHistory = summary.totalAttempts > 0 || summary.completedExamsCount > 0;
  const coveragePercent =
    summary.totalQuestions > 0
      ? Math.round((summary.answeredUnique / summary.totalQuestions) * 100)
      : 0;

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950">
            Visão Geral
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Acompanhamento real da sua preparação para o IREB CPRE Foundation Level.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/estudar"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shadow-xs"
          >
            <BookOpen className="w-4 h-4" />
            Estudar agora
          </Link>
          <Link
            href="/simulados"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-800 text-sm font-medium hover:bg-zinc-50 transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            Novo simulado
          </Link>
        </div>
      </div>

      {/* Continue de onde parou OU Estado inicial acolhedor */}
      {continueActivity ? (
        <section className="bg-zinc-900 text-white rounded-2xl p-6 flex flex-wrap items-center justify-between gap-5 shadow-sm">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Continue de onde parou
            </div>
            <h2 className="text-lg font-semibold tracking-tight">{continueActivity.title}</h2>
            <p className="text-sm text-zinc-300">{continueActivity.subtitle}</p>
          </div>
          <Link
            href={continueActivity.href}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-100 transition-colors shrink-0"
          >
            <Play className="w-4 h-4" />
            {continueActivity.cta}
          </Link>
        </section>
      ) : (
        <section className="bg-white rounded-2xl border border-zinc-200/90 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              Banco pronto: {summary.totalQuestions} questões importadas
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
              Pronto para iniciar sua preparação IREB CPRE-FL?
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Seu histórico ainda está vazio. Comece resolvendo questões no Modo Estudo para receber
              correções detalhadas, explicações originais e gerar seu mapa real de domínio por
              assunto.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <Link
              href="/estudar"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
            >
              Iniciar Modo Estudo
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/simulados"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Fazer simulado diagnóstico
            </Link>
          </div>
        </section>
      )}

      {/* KPIs principais — apenas dados reais */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Cobertura do banco</span>
            <Target className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-zinc-950">
              {summary.answeredUnique}
              <span className="text-zinc-400 font-normal text-base">
                /{summary.totalQuestions}
              </span>
            </span>
            <span className="text-xs font-medium text-zinc-500">({coveragePercent}%)</span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 rounded-full"
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {summary.unansweredUnique} questão(ões) ainda não respondida(s)
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Taxa geral de acertos</span>
            <TrendingUp className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">
            {summary.overallAccuracy !== null ? `${summary.overallAccuracy}%` : '—'}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {summary.totalAttempts > 0
              ? `${summary.totalCorrect} acertos em ${summary.totalAttempts} tentativa(s)`
              : 'Responda questões para calcular'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Simulados realizados</span>
            <ClipboardCheck className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">
            {summary.completedExamsCount}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {summary.completedExamsCount > 0
              ? `Melhor: ${summary.bestExamScore}% • Recente: ${summary.latestExamScore}%`
              : 'Nenhum simulado concluído'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Tempo de estudo &amp; sequência</span>
            <Clock className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-2xl font-semibold text-zinc-950">
              {summary.totalStudyTimeMs > 0 ? formatStudyTime(summary.totalStudyTimeMs) : '0min'}
            </span>
            {summary.studyStreakDays > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <Flame className="w-3 h-3" />
                {summary.studyStreakDays} dia(s)
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {summary.errorReviewCount} na fila de erros • {summary.favoritesCount} favorita(s)
          </p>
        </div>
      </section>

      {/* O que estudar agora? + Assuntos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recomendações reais */}
        <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-950">O que estudar agora?</h2>
            <span className="text-[11px] font-medium text-zinc-400">Baseado no histórico real</span>
          </div>

          {recommendations.length === 0 ? (
            <div className="rounded-xl bg-zinc-50 border border-zinc-200/70 p-5 text-sm text-zinc-600">
              Assim que você registrar suas primeiras respostas, esta área destacará os assuntos e
              questões com maior prioridade de revisão.
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-xl border border-zinc-200/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-300 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          rec.priority === 'high'
                            ? 'bg-rose-500'
                            : rec.priority === 'medium'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        )}
                      />
                      <h3 className="text-sm font-semibold text-zinc-900">{rec.title}</h3>
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">{rec.description}</p>
                  </div>
                  <Link
                    href={rec.actionHref}
                    className="px-3.5 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 shrink-0 text-center"
                  >
                    {rec.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pontos fortes e assuntos que precisam de atenção */}
        <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-950">Desempenho por assunto</h2>
            <Link
              href="/relatorios"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Ver mapa completo →
            </Link>
          </div>

          {!hasHistory || (bestTopics.length === 0 && attentionTopics.length === 0) ? (
            <div className="rounded-xl bg-zinc-50 border border-zinc-200/70 p-5 text-sm text-zinc-600">
              Responda ao menos 2 questões de um assunto para que os percentuais e o mapa de
              domínio sejam calculados com consistência estatística.
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-rose-700 mb-2.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Precisam de atenção
                </div>
                {attentionTopics.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Nenhum assunto avaliado está abaixo de 75% no momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attentionTopics.map((t) => (
                      <Link
                        key={t.topicId}
                        href={`/estudar?topic=${t.topicId}`}
                        className="flex items-center justify-between rounded-xl border border-zinc-200/80 px-3.5 py-2.5 hover:bg-zinc-50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-900 truncate">
                            {t.topicName}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {t.totalAttempts} tentativas • {t.wrongAttempts} erro(s)
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                          {t.accuracyPercent}%
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Melhor desempenho
                </div>
                <div className="space-y-2">
                  {bestTopics.map((t) => {
                    const meta = MASTERY_META[t.masteryLevel];
                    return (
                      <div
                        key={t.topicId}
                        className="flex items-center justify-between rounded-xl border border-zinc-200/80 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-900 truncate">
                            {t.topicName}
                          </div>
                          <div className="text-[11px] text-zinc-500">{meta.label}</div>
                        </div>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {t.accuracyPercent}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
