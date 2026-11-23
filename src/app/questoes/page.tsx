'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Image as ImageIcon,
  Search,
  Star,
  StickyNote,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionWithProgress, Topic } from '@/types/domain';

export default function QuestoesPage() {
  const [questions, setQuestions] = useState<QuestionWithProgress[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [tipo, setTipo] = useState<'all' | 'unica' | 'multipla'>('all');
  const [status, setStatus] = useState<
    'all' | 'answered' | 'unanswered' | 'correct' | 'incorrect'
  >('all');
  const [topicId, setTopicId] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [withImageOnly, setWithImageOnly] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (tipo !== 'all') qs.set('tipo', tipo);
      if (status !== 'all') qs.set('status', status);
      if (topicId !== 'all') qs.set('topicId', topicId);
      if (favoritesOnly) qs.set('favorites', 'true');
      if (withImageOnly) qs.set('withImage', 'true');

      const res = await fetch(`/api/questions?${qs.toString()}`);
      const data = (await res.json()) as {
        questions: QuestionWithProgress[];
        topics: Topic[];
      };
      setQuestions(data.questions ?? []);
      setTopics(data.topics ?? []);
    } finally {
      setLoading(false);
    }
  }, [favoritesOnly, search, status, tipo, topicId, withImageOnly]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchQuestions();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchQuestions]);

  const handleToggleFavorite = async (codigo: string) => {
    const res = await fetch(`/api/questions/${encodeURIComponent(codigo)}/favorite`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = (await res.json()) as { isFavorite: boolean };
      setQuestions((prev) =>
        prev.map((q) =>
          q.codigo === codigo
            ? { ...q, progress: { ...q.progress, isFavorite: data.isFavorite } }
            : q
        )
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Banco de Questões
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Pesquise por enunciado, código, número, alternativas ou explicação nas 45 questões de{' '}
            <code className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">
              questoes.json
            </code>
            .
          </p>
        </div>
        <div className="text-xs font-medium text-zinc-500">
          Exibindo <strong className="text-zinc-900">{questions.length}</strong> questão(ões)
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por enunciado, código (ex.: ID-030), número, alternativa ou explicação..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700"
          >
            <option value="all">Todos os tipos</option>
            <option value="unica">Resposta única</option>
            <option value="multipla">Múltipla resposta</option>
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700"
          >
            <option value="all">Todos os status</option>
            <option value="answered">Respondidas</option>
            <option value="unanswered">Não respondidas</option>
            <option value="correct">Última correta</option>
            <option value="incorrect">Última incorreta</option>
          </select>

          <select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 max-w-xs"
          >
            <option value="all">Todos os assuntos</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setFavoritesOnly((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
              favoritesOnly
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            )}
          >
            <Star className={cn('w-3.5 h-3.5', favoritesOnly && 'fill-amber-400 text-amber-500')} />
            Favoritas
          </button>

          <button
            type="button"
            onClick={() => setWithImageOnly((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
              withImageOnly
                ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            )}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Com imagem
          </button>
        </div>
      </div>

      {/* Lista de questões */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 bg-white border border-zinc-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center">
          <p className="text-sm font-medium text-zinc-800">Nenhuma questão encontrada</p>
          <p className="text-xs text-zinc-500 mt-1">
            Tente ajustar os filtros ou limpar o termo de pesquisa.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {questions.map((q) => (
            <div
              key={q.codigo}
              className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 hover:border-zinc-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-zinc-900 text-white">
                    #{String(q.numero).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-xs font-medium px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                    {q.codigo}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] font-medium px-2 py-0.5 rounded border',
                      q.tipo === 'multipla'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200/80'
                        : 'bg-zinc-50 text-zinc-600 border-zinc-200/80'
                    )}
                  >
                    {q.tipo === 'multipla' ? `Múltipla (${q.quantidade_respostas})` : 'Única'}
                  </span>
                  {q.progress.topicName && (
                    <span className="text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-200/70 px-2 py-0.5 rounded">
                      {q.progress.topicName}
                    </span>
                  )}
                  {(q.imagem || q.managedImageUrl) && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                      <ImageIcon className="w-3 h-3" />
                      Figura
                    </span>
                  )}
                  {q.progress.notesCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                      <StickyNote className="w-3 h-3" />
                      {q.progress.notesCount}
                    </span>
                  )}
                </div>

                <p className="text-sm text-zinc-900 font-medium line-clamp-2 leading-relaxed">
                  {q.enunciado}
                </p>

                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                  <span>{Object.keys(q.alternativas).length} alternativas</span>
                  {q.progress.attemptsCount > 0 ? (
                    <>
                      <span>• {q.progress.attemptsCount} tentativa(s)</span>
                      <span className="inline-flex items-center gap-1">
                        {q.progress.lastIsCorrect ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700 font-medium">Última correta</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span className="text-rose-700 font-medium">Última incorreta</span>
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <span>• Ainda não respondida</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(q.codigo)}
                  className="p-2 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                  aria-label="Favoritar questão"
                >
                  <Star
                    className={cn(
                      'w-4 h-4',
                      q.progress.isFavorite && 'fill-amber-400 text-amber-500'
                    )}
                  />
                </button>
                <Link
                  href={`/estudar?codigo=${encodeURIComponent(q.codigo)}`}
                  className="px-3.5 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors"
                >
                  Estudar
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
