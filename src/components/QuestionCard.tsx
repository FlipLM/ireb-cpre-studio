'use client';

import { Check, CheckCircle2, Circle, Square, CheckSquare, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeAnswerSet } from '@/lib/evaluation';
import { playSound } from '@/lib/sounds';
import { QuestionImageViewer } from '@/components/QuestionImageViewer';
import type { SourceQuestion } from '@/types/domain';

interface QuestionCardProps {
  question: SourceQuestion;
  topicName?: string | null;
  selectedAnswers: string[];
  onSelectionChange: (nextSelected: string[]) => void;
  disabled?: boolean;
  showFeedback?: boolean;
  isCorrect?: boolean | null;
  animState?: 'idle' | 'correct' | 'wrong';
  headerRight?: React.ReactNode;
}

export function QuestionCard({
  question,
  topicName,
  selectedAnswers,
  onSelectionChange,
  disabled = false,
  showFeedback = false,
  isCorrect = null,
  animState = 'idle',
  headerRight,
}: QuestionCardProps) {
  const isMultiple = question.tipo === 'multipla';
  const normalizedCorrect = showFeedback ? normalizeAnswerSet(question.resposta_correta) : [];
  const entries = Object.entries(question.alternativas);

  const handleToggle = (letter: string) => {
    if (disabled) return;
    playSound('select');
    if (!isMultiple) {
      onSelectionChange([letter]);
      return;
    }
    const exists = selectedAnswers.includes(letter);
    if (exists) {
      onSelectionChange(selectedAnswers.filter((a) => a !== letter));
    } else {
      if (
        question.adminMaxSelections &&
        selectedAnswers.length >= question.adminMaxSelections
      ) {
        return;
      }
      onSelectionChange([...selectedAnswers, letter].sort());
    }
  };

  return (
    <article
      key={question.codigo}
      className={cn(
        'bg-white rounded-2xl border shadow-2xs overflow-hidden transition-colors animate-card-enter',
        animState === 'correct'
          ? 'animate-quiz-pop border-emerald-400 ring-2 ring-emerald-500/15'
          : animState === 'wrong'
            ? 'animate-quiz-shake border-rose-300 ring-2 ring-rose-500/15'
            : 'border-zinc-200/90'
      )}
    >
      {/* Cabeçalho discreto e informativo */}
      <div className="px-4 sm:px-7 py-3.5 sm:py-4 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-2.5 bg-zinc-50/40">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold bg-zinc-900 text-white">
            #{String(question.numero).padStart(2, '0')}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-zinc-100 text-zinc-700 border border-zinc-200/80">
            {question.codigo}
          </span>
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border',
              isMultiple
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200/80'
                : 'bg-zinc-100/80 text-zinc-600 border-zinc-200/80'
            )}
          >
            {isMultiple
              ? `Múltipla resposta (${question.quantidade_respostas})`
              : 'Resposta única'}
          </span>
          {topicName && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-white text-zinc-600 border border-zinc-200">
              {topicName}
            </span>
          )}
        </div>
        {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
      </div>

      {/* Corpo de leitura prioritário */}
      <div className="px-4 sm:px-7 py-5 sm:py-6">
        <div className="text-[15.5px] sm:text-[17px] leading-[1.6] sm:leading-[1.65] font-medium text-zinc-900 whitespace-pre-line">
          {question.enunciado}
        </div>

        <QuestionImageViewer
          codigo={question.codigo}
          managedImageUrl={question.managedImageUrl}
          originalImagePath={question.imagem}
          imageMissing={question.imageMissing}
        />

        {isMultiple && !showFeedback && (
          <p className="mt-4 text-xs text-zinc-500">
            Selecione todas as alternativas corretas. Indicação original:{' '}
            <span className="font-medium text-zinc-700">{question.quantidade_respostas}</span>.
            {question.adminMinSelections || question.adminMaxSelections ? (
              <span className="ml-1">
                (Configuração ativa:{' '}
                {question.adminMinSelections ? `mín. ${question.adminMinSelections}` : ''}
                {question.adminMinSelections && question.adminMaxSelections ? ', ' : ''}
                {question.adminMaxSelections ? `máx. ${question.adminMaxSelections}` : ''})
              </span>
            ) : null}
          </p>
        )}

        {/* Alternativas dinâmicas */}
        <div
          className="mt-5 space-y-2.5"
          role={isMultiple ? 'group' : 'radiogroup'}
          aria-label={`Alternativas da questão ${question.codigo}`}
        >
          {entries.map(([letter, text]) => {
            const isSelected = selectedAnswers.includes(letter);
            const isCorrectOption = showFeedback && normalizedCorrect.includes(letter);
            const isWrongSelected = showFeedback && isSelected && !isCorrectOption;
            const isMissedCorrect = showFeedback && !isSelected && isCorrectOption;

            return (
              <button
                key={letter}
                type="button"
                disabled={disabled}
                onClick={() => handleToggle(letter)}
                role={isMultiple ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                className={cn(
                  'w-full text-left rounded-xl border px-4 py-3.5 transition-all duration-150 flex items-start gap-3.5 group active:scale-[0.995]',
                  !showFeedback &&
                    !isSelected &&
                    'border-zinc-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/20 hover:translate-x-0.5',
                  !showFeedback &&
                    isSelected &&
                    'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600/20',
                  isCorrectOption &&
                    isSelected &&
                    'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/20',
                  isMissedCorrect &&
                    'border-emerald-400 border-dashed bg-emerald-50/40',
                  isWrongSelected &&
                    'border-rose-400 bg-rose-50/60 ring-1 ring-rose-400/20',
                  showFeedback &&
                    !isSelected &&
                    !isCorrectOption &&
                    'border-zinc-200/70 bg-white opacity-70',
                  disabled && !showFeedback && 'cursor-default'
                )}
              >
                <div className="pt-0.5 shrink-0">
                  {showFeedback ? (
                    isCorrectOption ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : isWrongSelected ? (
                      <XCircle className="w-5 h-5 text-rose-600" />
                    ) : isMultiple ? (
                      <Square className="w-5 h-5 text-zinc-300" />
                    ) : (
                      <Circle className="w-5 h-5 text-zinc-300" />
                    )
                  ) : isMultiple ? (
                    isSelected ? (
                      <CheckSquare className="w-5 h-5 text-indigo-600" />
                    ) : (
                      <Square className="w-5 h-5 text-zinc-300 group-hover:text-zinc-400" />
                    )
                  ) : isSelected ? (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  ) : (
                    <Circle className="w-5 h-5 text-zinc-300 group-hover:text-zinc-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'font-mono text-xs font-semibold px-1.5 py-0.5 rounded mt-0.5 shrink-0',
                        !showFeedback && isSelected
                          ? 'bg-indigo-600 text-white'
                          : isCorrectOption
                            ? 'bg-emerald-600 text-white'
                            : isWrongSelected
                              ? 'bg-rose-600 text-white'
                              : 'bg-zinc-100 text-zinc-600'
                      )}
                    >
                      {letter}
                    </span>
                    <span className="text-[15px] leading-relaxed text-zinc-800 whitespace-pre-line">
                      {text}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Banner de resultado após confirmação */}
        {showFeedback && isCorrect !== null && (
          <div
            className={cn(
              'mt-5 rounded-xl px-4 py-3 border flex flex-wrap items-center justify-between gap-2 text-sm',
              isCorrect
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : 'bg-rose-50/80 border-rose-200 text-rose-900'
            )}
          >
            <div className="flex items-center gap-2 font-medium">
              {isCorrect ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Resposta correta!</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Resposta incorreta.</span>
                </>
              )}
            </div>
            <div className="text-xs font-mono">
              Sua seleção:{' '}
              <strong>{selectedAnswers.length > 0 ? selectedAnswers.join(', ') : '—'}</strong>
              {' • '}
              Gabarito fornecido: <strong>{normalizedCorrect.join(', ')}</strong>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
