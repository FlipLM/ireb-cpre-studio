'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { cn, formatDateBR, formatSeconds, formatStudyTime, MASTERY_META } from '@/lib/utils';
import type { ExamSession, TopicPerformance } from '@/types/domain';

interface QuestionStatRow {
  codigo: string;
  numero: number;
  enunciado: string;
  tipo: string;
  topicName: string | null;
  totalAttempts: number;
  correctCount: number;
  wrongCount: number;
  accuracyPercent: number | null;
  avgTimeMs: number | null;
  hasImproved: boolean;
  stillStruggling: boolean;
}

interface ReportsPayload {
  general: {
    totalQuestions: number;
    answeredUnique: number;
    totalAttempts: number;
    totalCorrect: number;
    totalWrong: number;
    accuracyPercent: number | null;
    totalStudyTimeMs: number;
    completedExamsCount: number;
  };
  topics: TopicPerformance[];
  dailyEvolution: Array<{
    date: string;
    total: number;
    correct: number;
    accuracy: number;
    studyMinutes: number;
  }>;
  examEvolution: Array<{
    index: number;
    id: string;
    title: string;
    date: string;
    scorePercent: number;
    totalQuestions: number;
    correctCount: number;
    durationMinutes: number;
  }>;
  questionReports: {
    mostWrong: QuestionStatRow[];
    slowest: QuestionStatRow[];
    mostAttempted: QuestionStatRow[];
    improved: QuestionStatRow[];
    stillStruggling: QuestionStatRow[];
  };
  exams: ExamSession[];
}

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<'7' | '30' | '90' | 'all'>('all');
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [questionTab, setQuestionTab] = useState<
    'mostWrong' | 'slowest' | 'mostAttempted' | 'improved' | 'stillStruggling'
  >('mostWrong');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports?period=${period}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-zinc-200 rounded-lg" />
        <div className="h-72 bg-white border border-zinc-200 rounded-2xl" />
      </div>
    );
  }

  const activeQuestionList = data.questionReports[questionTab];

  return (
    <div className="space-y-8">
      {/* Topo + Filtro de período */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Relatórios e Mapa de Domínio
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Indicadores construídos exclusivamente a partir das suas tentativas reais registradas.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-zinc-200/70">
          {(
            [
              ['7', '7 dias'],
              ['30', '30 dias'],
              ['90', '90 dias'],
              ['all', 'Todo período'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setPeriod(val)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                period === val ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Relatório Geral */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-4">
          <div className="text-xs text-zinc-500">Respondidas (únicas)</div>
          <div className="text-xl font-semibold text-zinc-950 mt-1">
            {data.general.answeredUnique}/{data.general.totalQuestions}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-4">
          <div className="text-xs text-zinc-500">Total de tentativas</div>
          <div className="text-xl font-semibold text-zinc-950 mt-1">
            {data.general.totalAttempts}
          </div>
          <div className="text-[11px] text-zinc-500">
            {data.general.totalCorrect} certas • {data.general.totalWrong} erradas
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-4">
          <div className="text-xs text-zinc-500">Aproveitamento</div>
          <div className="text-xl font-semibold text-zinc-950 mt-1">
            {data.general.accuracyPercent !== null ? `${data.general.accuracyPercent}%` : '—'}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-4">
          <div className="text-xs text-zinc-500">Tempo de estudo</div>
          <div className="text-xl font-semibold text-zinc-950 mt-1">
            {formatStudyTime(data.general.totalStudyTimeMs)}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-4">
          <div className="text-xs text-zinc-500">Simulados concluídos</div>
          <div className="text-xl font-semibold text-zinc-950 mt-1">
            {data.general.completedExamsCount}
          </div>
        </div>
      </section>

      {/* Mapa de Domínio por Assunto */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Mapa de Domínio por Assunto</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Considera cobertura das questões do assunto, taxa de acerto geral e recente, e ausência
            de erros reincidentes. Percentuais só aparecem ao atingir o mínimo configurado de
            respostas.
          </p>
        </div>

        <div className="space-y-3">
          {data.topics.map((topic) => {
            const meta = MASTERY_META[topic.masteryLevel];
            const barWidth =
              topic.accuracyPercent !== null
                ? topic.accuracyPercent
                : topic.totalAttempts > 0
                  ? 15
                  : 0;
            return (
              <div
                key={topic.topicId}
                className="rounded-xl border border-zinc-200/80 p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/estudar?topic=${topic.topicId}`}
                      className="text-sm font-semibold text-zinc-900 hover:text-indigo-700"
                    >
                      {topic.topicName}
                    </Link>
                    <span
                      className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-full border',
                        meta.badgeClass
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-zinc-600">
                    <span>
                      Cobertura: <strong>{topic.uniqueAnsweredQuestions}</strong>/
                      {topic.totalQuestionsInTopic}
                    </span>
                    <span>
                      Acertos: <strong>{topic.correctAttempts}</strong>/{topic.totalAttempts}
                    </span>
                    {topic.avgTimeMs !== null && (
                      <span className="hidden sm:inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        {Math.round(topic.avgTimeMs / 1000)}s/q
                      </span>
                    )}
                    <span className="font-mono font-semibold text-zinc-900 w-14 text-right">
                      {topic.accuracyPercent !== null ? `${topic.accuracyPercent}%` : 'Insuf.'}
                    </span>
                  </div>
                </div>

                <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', meta.barClass)}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <p className="text-xs text-zinc-500">{topic.masteryReason}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Gráficos de Evolução Real */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-950">
              Evolução da taxa de acerto por dia
            </h2>
          </div>
          {data.dailyEvolution.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-zinc-500 bg-zinc-50 rounded-xl border border-zinc-200/60">
              Sem tentativas registradas neste período.
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dailyEvolution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#71717a" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#71717a" unit="%" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="Aproveitamento (%)"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-950">Desempenho por simulado</h2>
          </div>
          {data.examEvolution.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-zinc-500 bg-zinc-50 rounded-xl border border-zinc-200/60">
              Conclua simulados para acompanhar a evolução de pontuação.
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.examEvolution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#71717a" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#71717a" unit="%" />
                  <Tooltip />
                  <Bar
                    dataKey="scorePercent"
                    name="Nota (%)"
                    fill="#18181b"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Relatório por questão */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-950">Relatório por questão</h2>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['mostWrong', 'Mais erradas'],
                ['stillStruggling', 'Ainda com dificuldade'],
                ['slowest', 'Mais demoradas'],
                ['mostAttempted', 'Mais respondidas'],
                ['improved', 'Evolução positiva'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setQuestionTab(key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  questionTab === key
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeQuestionList.length === 0 ? (
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/60 p-6 text-center text-xs text-zinc-500">
            Nenhuma questão se enquadra neste critério no período selecionado.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {activeQuestionList.map((item) => (
              <div
                key={item.codigo}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-zinc-900">
                      #{String(item.numero).padStart(2, '0')} ({item.codigo})
                    </span>
                    {item.topicName && (
                      <span className="text-[11px] text-zinc-500">{item.topicName}</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-700 truncate mt-0.5">{item.enunciado}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-600 shrink-0">
                  <span>
                    {item.correctCount}/{item.totalAttempts} acertos
                  </span>
                  {item.avgTimeMs !== null && (
                    <span className="font-mono">{Math.round(item.avgTimeMs / 1000)}s</span>
                  )}
                  <Link
                    href={`/estudar?codigo=${encodeURIComponent(item.codigo)}`}
                    className="text-indigo-600 font-medium hover:underline"
                  >
                    Abrir
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Relatório de simulados */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-zinc-950">Histórico de simulados</h2>
        {data.exams.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhum simulado concluído neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="pb-2.5 font-medium">Data</th>
                  <th className="pb-2.5 font-medium">Simulado</th>
                  <th className="pb-2.5 font-medium">Questões</th>
                  <th className="pb-2.5 font-medium">Resultado</th>
                  <th className="pb-2.5 font-medium">Tempo</th>
                  <th className="pb-2.5 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.exams.map((exam) => (
                  <tr key={exam.id} className="hover:bg-zinc-50/70">
                    <td className="py-3 text-zinc-600">
                      {formatDateBR(exam.finishedAt ?? exam.startedAt)}
                    </td>
                    <td className="py-3 font-medium text-zinc-900">{exam.title}</td>
                    <td className="py-3 text-zinc-600">{exam.totalQuestions}</td>
                    <td className="py-3 font-mono font-semibold text-zinc-900">
                      {exam.scorePercent}% ({exam.correctCount}/{exam.totalQuestions})
                    </td>
                    <td className="py-3 font-mono text-zinc-600">
                      {formatSeconds(exam.durationSeconds)}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/simulados/${exam.id}/resultado`}
                        className="text-indigo-600 font-medium hover:underline"
                      >
                        Ver correção
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
