'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookmarkPlus,
  Clock,
  Play,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react';
import { cn, formatDateBR, formatSeconds } from '@/lib/utils';
import type { AppSettings, ExamConfig, ExamSession, Topic } from '@/types/domain';

export default function SimuladosPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Configuração do simulado
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState(15);
  const [hasTimeLimit, setHasTimeLimit] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [selectionMode, setSelectionMode] = useState<'random' | 'sequential'>('random');
  const [includeUnica, setIncludeUnica] = useState(true);
  const [includeMultipla, setIncludeMultipla] = useState(true);
  const [reuseAnswered, setReuseAnswered] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/exams').then((r) => r.json()),
      fetch('/api/questions').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ])
      .then(([eData, qData, sData]) => {
        setSessions(eData.sessions ?? []);
        setTopics(qData.topics ?? []);
        setSettings(sData.settings ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const applyProfile = (config: ExamConfig) => {
    setTitle(config.title ?? '');
    setQuestionCount(config.questionCount);
    setHasTimeLimit(config.durationMinutes !== null);
    if (config.durationMinutes !== null) setDurationMinutes(config.durationMinutes);
    setSelectionMode(config.selectionMode);
    setIncludeUnica(config.includeUnica);
    setIncludeMultipla(config.includeMultipla);
    setReuseAnswered(config.reuseAnswered);
    setSelectedTopics(config.topicIds ?? []);
  };

  const buildCurrentConfig = (): ExamConfig => ({
    title: title.trim() || undefined,
    questionCount,
    durationMinutes: hasTimeLimit ? durationMinutes : null,
    selectionMode,
    includeUnica,
    includeMultipla,
    reuseAnswered,
    topicIds: selectedTopics.length > 0 ? selectedTopics : undefined,
  });

  const handleSaveProfile = async () => {
    if (!settings) return;
    const profileName =
      title.trim() ||
      `Perfil (${questionCount}q${hasTimeLimit ? ` • ${durationMinutes}min` : ''})`;
    const nextProfiles = [
      ...settings.savedExamProfiles,
      {
        id: `profile-${Date.now()}`,
        name: profileName,
        config: { ...buildCurrentConfig(), title: profileName },
      },
    ];
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedExamProfiles: nextProfiles }),
    });
    if (res.ok) {
      const data = (await res.json()) as { settings: AppSettings };
      setSettings(data.settings);
    }
  };

  const handleStartExam = async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCurrentConfig()),
      });
      const data = (await res.json()) as { session?: ExamSession; error?: string };
      if (!res.ok || !data.session) {
        throw new Error(data.error || 'Não foi possível criar o simulado.');
      }
      router.push(`/simulados/${data.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar simulado.');
    } finally {
      setCreating(false);
    }
  };

  const inProgress = sessions.filter((s) => s.status === 'in_progress');
  const completed = sessions.filter((s) => s.status === 'completed');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Simulados</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Configure avaliações personalizadas com foco total. Durante o simulado, gabaritos e
          explicações permanecem ocultos até a finalização.
        </p>
      </div>

      {/* Simulados em andamento */}
      {inProgress.length > 0 && (
        <section className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Simulado em andamento
          </div>
          {inProgress.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-xl border border-indigo-200/80 p-4 flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm font-semibold text-zinc-900">{exam.title}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {exam.answeredCount} de {exam.totalQuestions} respondidas • Iniciado em{' '}
                  {formatDateBR(exam.startedAt)}
                </div>
              </div>
              <Link
                href={`/simulados/${exam.id}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
              >
                <Play className="w-3.5 h-3.5" />
                Retomar simulado
              </Link>
            </div>
          ))}
        </section>
      )}

      {/* Configurador de novo simulado */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-zinc-500" />
            <h2 className="text-base font-semibold text-zinc-900">
              Configurar novo simulado
            </h2>
          </div>

          {settings && settings.savedExamProfiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {settings.savedExamProfiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyProfile(p.config)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Nome do simulado (opcional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Simulado Geral IREB #1"
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Quantidade de questões ({questionCount} de 45)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={45}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="flex-1 accent-zinc-900"
              />
              <button
                type="button"
                onClick={() => setQuestionCount(45)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 shrink-0"
              >
                Todas (45)
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-700">
                Cronômetro configurável
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasTimeLimit}
                  onChange={(e) => setHasTimeLimit(e.target.checked)}
                  className="rounded accent-zinc-900"
                />
                Definir limite de tempo
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              <input
                type="number"
                min={1}
                max={240}
                disabled={!hasTimeLimit}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
                className="w-28 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 disabled:opacity-40"
              />
              <span className="text-xs text-zinc-500">minutos</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Ordem de seleção
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectionMode('random')}
                className={cn(
                  'px-3 py-2 rounded-xl text-xs font-medium border transition-colors',
                  selectionMode === 'random'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                )}
              >
                Aleatória
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode('sequential')}
                className={cn(
                  'px-3 py-2 rounded-xl text-xs font-medium border transition-colors',
                  selectionMode === 'sequential'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                )}
              >
                Sequencial (#1..45)
              </button>
            </div>
          </div>
        </div>

        {/* Opções de composição */}
        <div className="flex flex-wrap gap-5 pt-2 border-t border-zinc-100 text-sm text-zinc-700">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeUnica}
              onChange={(e) => setIncludeUnica(e.target.checked)}
              className="rounded accent-zinc-900"
            />
            Incluir resposta única (35)
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeMultipla}
              onChange={(e) => setIncludeMultipla(e.target.checked)}
              className="rounded accent-zinc-900"
            />
            Incluir múltipla resposta (10)
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={reuseAnswered}
              onChange={(e) => setReuseAnswered(e.target.checked)}
              className="rounded accent-zinc-900"
            />
            Reutilizar questões já respondidas
          </label>
        </div>

        {/* Filtro opcional por assuntos */}
        {topics.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-600">
              Filtrar por assunto (opcional — deixe vazio para incluir todos):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => {
                const active = selectedTopics.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setSelectedTopics((prev) =>
                        active ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                      )
                    }
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                    )}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleSaveProfile}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <BookmarkPlus className="w-4 h-4" />
            Salvar como perfil
          </button>

          <button
            type="button"
            disabled={creating || (!includeUnica && !includeMultipla)}
            onClick={handleStartExam}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 transition-colors shadow-xs"
          >
            <Play className="w-4 h-4" />
            {creating ? 'Preparando simulado...' : 'Iniciar simulado'}
          </button>
        </div>
      </section>

      {/* Histórico de simulados realizados */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-zinc-500" />
          <h2 className="text-base font-semibold text-zinc-900">
            Histórico de simulados ({completed.length})
          </h2>
        </div>

        {loading ? (
          <div className="h-32 bg-white border border-zinc-200 rounded-2xl animate-pulse" />
        ) : completed.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center">
            <p className="text-sm font-medium text-zinc-800">Nenhum simulado concluído ainda</p>
            <p className="text-xs text-zinc-500 mt-1">
              Inicie seu primeiro simulado acima para acompanhar sua evolução real ao longo do
              tempo.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {completed.map((exam) => (
              <div
                key={exam.id}
                className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{exam.title}</span>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800">
                      {exam.scorePercent}%
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 flex flex-wrap gap-3">
                    <span>{formatDateBR(exam.finishedAt ?? exam.startedAt)}</span>
                    <span>
                      • {exam.correctCount}/{exam.totalQuestions} acertos
                    </span>
                    <span>• Tempo: {formatSeconds(exam.durationSeconds)}</span>
                    <span>
                      • {exam.config.selectionMode === 'random' ? 'Aleatório' : 'Sequencial'}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/simulados/${exam.id}/resultado`}
                  className="px-4 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Ver correção detalhada
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
