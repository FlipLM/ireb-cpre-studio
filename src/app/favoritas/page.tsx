'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play, Search, Star } from 'lucide-react';
import type { QuestionWithProgress } from '@/types/domain';

export default function FavoritasPage() {
  const [questions, setQuestions] = useState<QuestionWithProgress[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/questions?favorites=true')
      .then((r) => r.json())
      .then((data) => setQuestions(data.questions ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleUnfavorite = async (codigo: string) => {
    const res = await fetch(`/api/questions/${encodeURIComponent(codigo)}/favorite`, {
      method: 'POST',
    });
    if (res.ok) {
      setQuestions((prev) => prev.filter((q) => q.codigo !== codigo));
    }
  };

  const filtered = questions.filter((q) => {
    if (!search.trim()) return true;
    const t = search.trim().toLowerCase();
    return (
      q.enunciado.toLowerCase().includes(t) ||
      q.codigo.toLowerCase().includes(t) ||
      String(q.numero) === t
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Questões Favoritas
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Reúna questões estratégicas para revisão rápida antes da prova.
          </p>
        </div>

        {questions.length > 0 && (
          <Link
            href="/estudar?filter=favorites"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            <Play className="w-4 h-4" />
            Estudar apenas favoritas ({questions.length})
          </Link>
        )}
      </div>

      {questions.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar favoritas por enunciado ou código..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )}

      {loading ? (
        <div className="h-40 bg-white border border-zinc-200 rounded-2xl animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center">
          <Star className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-zinc-900">
            {questions.length === 0
              ? 'Nenhuma questão favoritada ainda'
              : 'Nenhuma favorita corresponde à pesquisa'}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Clique no ícone de estrela no Modo Estudo ou no Banco de Questões para marcar itens
            importantes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
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
                  {q.progress.topicName && (
                    <span className="text-xs text-zinc-500">{q.progress.topicName}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-zinc-900 line-clamp-2">{q.enunciado}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleUnfavorite(q.codigo)}
                  className="px-3 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Remover
                </button>
                <Link
                  href={`/estudar?codigo=${encodeURIComponent(q.codigo)}&filter=favorites`}
                  className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
                >
                  Resolver
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
