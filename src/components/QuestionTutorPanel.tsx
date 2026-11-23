'use client';

import { useState } from 'react';
import { BookOpenCheck, Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import type { AIExplanationRecord } from '@/types/domain';

interface QuestionTutorPanelProps {
  questionCodigo: string;
  originalExplanation: string;
  aiExplanation: AIExplanationRecord | null;
  onAiExplanationLoaded: (record: AIExplanationRecord) => void;
}

export function QuestionTutorPanel({
  questionCodigo,
  originalExplanation,
  aiExplanation,
  onAiExplanationLoaded,
}: QuestionTutorPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (forceRegenerate = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${encodeURIComponent(questionCodigo)}/tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRegenerate }),
      });
      const data = (await res.json()) as {
        explanation?: AIExplanationRecord;
        error?: string;
      };
      if (!res.ok || !data.explanation) {
        throw new Error(data.error || 'Não foi possível gerar explicação complementar.');
      }
      onAiExplanationLoaded(data.explanation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar tutor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Explicação Original — sempre preservada intacta */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-zinc-900">Explicação original</h3>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
            Fonte: questoes.json
          </span>
        </div>
        <p className="text-[15px] leading-relaxed text-zinc-800 whitespace-pre-line">
          {originalExplanation}
        </p>
      </section>

      {/* 2. Conteúdo Complementar — Tutor Inteligente (sempre separado) */}
      <section className="bg-white rounded-2xl border border-indigo-200/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-zinc-900">
              Tutor de estudos{' '}
              <span className="font-normal text-zinc-500">(conteúdo complementar)</span>
            </h3>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleGenerate(Boolean(aiExplanation))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100/80 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {aiExplanation ? 'Atualizar análise' : 'Gerar explicação complementar'}
          </button>
        </div>

        <p className="text-xs text-zinc-500 mt-1.5">
          Conteúdo complementar gerado a partir do contexto da questão. Não substitui nem altera o
          gabarito ou a explicação original.
        </p>

        {error && (
          <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {aiExplanation && (
          <div className="mt-4 space-y-4 pt-4 border-t border-zinc-100 text-sm text-zinc-800">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-700 mb-1.5">
                Entenda o conceito
              </h4>
              <p className="leading-relaxed whitespace-pre-line">{aiExplanation.conceptSummary}</p>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
                Por que as outras alternativas estão incorretas?
              </h4>
              <p className="leading-relaxed whitespace-pre-line text-zinc-700">
                {aiExplanation.distractorsAnalysis}
              </p>
            </div>

            <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-3.5 flex items-start gap-2.5">
              <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-amber-900 mb-0.5">
                  Dica para memorizar
                </div>
                <p className="text-xs leading-relaxed text-amber-900/90">
                  {aiExplanation.memoryTip}
                </p>
              </div>
            </div>

            <div className="text-xs text-zinc-600 bg-zinc-50 rounded-xl border border-zinc-200/70 p-3.5">
              <strong className="text-zinc-800">Aplicação prática:</strong>{' '}
              {aiExplanation.practicalExample}
            </div>

            <div className="text-[11px] text-zinc-400">
              Origem complementar: <span className="font-mono">{aiExplanation.provider}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
