'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  RotateCcw,
  Star,
  Zap,
} from 'lucide-react';
import { QuestionCard } from '@/components/QuestionCard';
import { QuestionNotesPanel } from '@/components/QuestionNotesPanel';
import { QuestionTutorPanel } from '@/components/QuestionTutorPanel';
import { GameEffectsOverlay, type FloatingFeedback } from '@/components/GameEffectsOverlay';
import { ProfessorCompanion, type ProfessorMood } from '@/components/ProfessorCompanion';
import { playSound } from '@/lib/sounds';
import { cn, formatShortDateBR } from '@/lib/utils';
import type {
  AIExplanationRecord,
  DifficultyRating,
  NoteRecord,
  QuestionWithProgress,
  SpacedRepetitionRecord,
  Topic,
} from '@/types/domain';

const DIFFICULTY_LABELS: Array<{ value: DifficultyRating; label: string }> = [
  { value: 1, label: 'Muito fácil' },
  { value: 2, label: 'Fácil' },
  { value: 3, label: 'Médio' },
  { value: 4, label: 'Difícil' },
  { value: 5, label: 'Muito difícil' },
];

function StudyWorkspace() {
  const searchParams = useSearchParams();
  const initialCodigo = searchParams.get('codigo');
  const filterParam = searchParams.get('filter'); // unanswered | favorites | error_review | spaced
  const topicParam = searchParams.get('topic');

  const [questions, setQuestions] = useState<QuestionWithProgress[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean;
    spacedRepetition: SpacedRepetitionRecord;
  } | null>(null);
  const [hideAnswerUntilConfirm, setHideAnswerUntilConfirm] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [aiExplanation, setAiExplanation] = useState<AIExplanationRecord | null>(null);
  const [savingDifficulty, setSavingDifficulty] = useState(false);

  // Estado de Quiz Game da sessão atual (derivado 100% das respostas reais desta sessão)
  const [combo, setCombo] = useState(0);
  const [bestSessionCombo, setBestSessionCombo] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [cardAnim, setCardAnim] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [confettiIntensity, setConfettiIntensity] = useState<'normal' | 'big'>('normal');
  const [floatingFeedback, setFloatingFeedback] = useState<FloatingFeedback | null>(null);

  const questionStartRef = useRef<number>(Date.now());

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterParam === 'unanswered') qs.set('status', 'unanswered');
      if (filterParam === 'error_review') qs.set('status', 'error_review');
      if (filterParam === 'favorites') qs.set('favorites', 'true');
      if (topicParam) qs.set('topicId', topicParam);

      const res = await fetch(`/api/questions?${qs.toString()}`);
      const data = (await res.json()) as {
        questions: QuestionWithProgress[];
        topics: Topic[];
      };

      let list = data.questions ?? [];
      if (filterParam === 'spaced') {
        const nowIso = new Date().toISOString();
        list = list.filter(
          (q) =>
            q.progress.spacedRepetition?.nextReviewAt &&
            q.progress.spacedRepetition.nextReviewAt <= nowIso
        );
      }

      setQuestions(list);
      setTopics(data.topics ?? []);

      if (initialCodigo) {
        const foundIdx = list.findIndex((q) => q.codigo === initialCodigo);
        if (foundIdx >= 0) setCurrentIndex(foundIdx);
      } else {
        setCurrentIndex(0);
      }
    } finally {
      setLoading(false);
    }
  }, [filterParam, initialCodigo, topicParam]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const currentQuestion = questions[currentIndex] ?? null;

  const loadQuestionExtras = useCallback(async (codigo: string) => {
    const res = await fetch(`/api/questions/${encodeURIComponent(codigo)}`);
    if (res.ok) {
      const detail = (await res.json()) as {
        notes: NoteRecord[];
        aiExplanation: AIExplanationRecord | null;
      };
      setNotes(detail.notes ?? []);
      setAiExplanation(detail.aiExplanation ?? null);
    }
  }, []);

  useEffect(() => {
    if (!currentQuestion) return;
    setSelectedAnswers([]);
    setSubmitted(false);
    setLastResult(null);
    setCardAnim('idle');
    questionStartRef.current = Date.now();
    void loadQuestionExtras(currentQuestion.codigo);
  }, [currentQuestion?.codigo, loadQuestionExtras]);

  const handleConfirm = async () => {
    if (!currentQuestion || selectedAnswers.length === 0) return;
    setSubmitting(true);
    try {
      const elapsed = Date.now() - questionStartRef.current;
      const res = await fetch(
        `/api/questions/${encodeURIComponent(currentQuestion.codigo)}/attempt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedAnswers,
            mode: filterParam === 'error_review' ? 'review' : 'study',
            timeSpentMs: elapsed,
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          isCorrect: boolean;
          spacedRepetition: SpacedRepetitionRecord;
        };
        setSubmitted(true);
        setLastResult(data);
        if (data.isCorrect) {
          const nextCombo = combo + 1;
          const xpEarned = 100 + Math.min(nextCombo - 1, 5) * 25;
          setCombo(nextCombo);
          setBestSessionCombo((prev) => Math.max(prev, nextCombo));
          setSessionXp((prev) => prev + xpEarned);
          setCardAnim('correct');
          setConfettiIntensity(nextCombo >= 3 ? 'big' : 'normal');
          setConfettiTrigger((n) => n + 1);

          if (nextCombo >= 2) {
            playSound('combo', { comboCount: nextCombo });
            setFloatingFeedback({
              id: Date.now(),
              type: 'combo',
              title: `COMBO ${nextCombo}x! +${xpEarned} XP`,
              subtitle: nextCombo >= 3 ? 'Sequência incrível! Continue assim!' : 'Mandou muito bem!',
            });
          } else {
            playSound('correct');
            setFloatingFeedback({
              id: Date.now(),
              type: 'correct',
              title: `CORRETO! +${xpEarned} XP`,
              subtitle: 'Resposta exata confirmada',
            });
          }
        } else {
          setCombo(0);
          setCardAnim('wrong');
          playSound('wrong');
          setFloatingFeedback({
            id: Date.now(),
            type: 'wrong',
            title: 'Quase lá!',
            subtitle: 'Veja a explicação original abaixo',
          });
        }
        setQuestions((prev) =>
          prev.map((q) =>
            q.codigo === currentQuestion.codigo
              ? {
                ...q,
                progress: {
                  ...q.progress,
                  attemptsCount: q.progress.attemptsCount + 1,
                  correctCount: q.progress.correctCount + (data.isCorrect ? 1 : 0),
                  wrongCount: q.progress.wrongCount + (data.isCorrect ? 0 : 1),
                  lastIsCorrect: data.isCorrect,
                  lastSelectedAnswers: selectedAnswers,
                  spacedRepetition: data.spacedRepetition,
                },
              }
              : q
          )
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!currentQuestion) return;
    const res = await fetch(
      `/api/questions/${encodeURIComponent(currentQuestion.codigo)}/favorite`,
      { method: 'POST' }
    );
    if (res.ok) {
      const data = (await res.json()) as { isFavorite: boolean };
      if (data.isFavorite) playSound('favorite');
      setQuestions((prev) =>
        prev.map((q) =>
          q.codigo === currentQuestion.codigo
            ? { ...q, progress: { ...q.progress, isFavorite: data.isFavorite } }
            : q
        )
      );
    }
  };

  const handleDifficultyRating = async (difficulty: DifficultyRating) => {
    if (!currentQuestion) return;
    setSavingDifficulty(true);
    try {
      const res = await fetch(
        `/api/questions/${encodeURIComponent(currentQuestion.codigo)}/attempt`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ difficulty }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { spacedRepetition: SpacedRepetitionRecord };
        setLastResult((prev) =>
          prev ? { ...prev, spacedRepetition: data.spacedRepetition } : prev
        );
        setQuestions((prev) =>
          prev.map((q) =>
            q.codigo === currentQuestion.codigo
              ? {
                ...q,
                progress: { ...q.progress, spacedRepetition: data.spacedRepetition },
              }
              : q
          )
        );
      }
    } finally {
      setSavingDifficulty(false);
    }
  };

  const handleTopicChange = async (newTopicId: string) => {
    if (!currentQuestion) return;
    const res = await fetch(`/api/questions/${encodeURIComponent(currentQuestion.codigo)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: newTopicId }),
    });
    if (res.ok) {
      const foundTopic = topics.find((t) => t.id === newTopicId);
      setQuestions((prev) =>
        prev.map((q) =>
          q.codigo === currentQuestion.codigo
            ? {
              ...q,
              progress: {
                ...q.progress,
                topicId: newTopicId,
                topicName: foundTopic?.name ?? null,
              },
            }
            : q
        )
      );
    }
  };

  const activeFilterLabel = useMemo(() => {
    if (filterParam === 'unanswered') return 'Apenas não respondidas';
    if (filterParam === 'favorites') return 'Sessão de favoritas';
    if (filterParam === 'error_review') return 'Revisão de erros';
    if (filterParam === 'spaced') return 'Revisão espaçada vencida';
    if (topicParam) {
      const t = topics.find((item) => item.id === topicParam);
      return t ? `Assunto: ${t.name}` : 'Filtrado por assunto';
    }
    return 'Todas as questões do banco';
  }, [filterParam, topicParam, topics]);

  const professorState = useMemo((): {
    mood: ProfessorMood;
    badge?: string;
    message: string;
  } => {
    if (!currentQuestion) {
      return {
        mood: 'idle',
        message: 'Nenhuma questão pendente neste filtro.',
      };
    }
    if (submitted && lastResult) {
      if (lastResult.isCorrect) {
        if (combo >= 3) {
          return {
            mood: 'celebrate_clap',
            badge: `COMBO ${combo}x!`,
            message: `EXCELENTE! ${combo} acertos seguidos! Você está dominando os conceitos do IREB CPRE!`,
          };
        }
        return {
          mood: 'celebrate_clap',
          badge: 'ACERTOU!',
          message:
            'Muito bem! Resposta exata confirmada. Vale conferir a explicação abaixo para fixar ainda mais.',
        };
      }
      return {
        mood: 'angry_slam',
        badge: 'OBJEÇÃO!',
        message:
          'Atenção no quadro! Essa alternativa tem uma pegadinha clássica do IREB. Leia a explicação original abaixo antes de avançar!',
      };
    }

    const topicText = currentQuestion.progress.topicName
      ? ` sobre "${currentQuestion.progress.topicName}"`
      : '';
    if (currentQuestion.tipo === 'multipla') {
      return {
        mood: 'talking',
        badge: `Múltipla (${currentQuestion.quantidade_respostas})`,
        message: `Foco na questão #${currentQuestion.numero}${topicText}! Atenção: ela exige múltiplas respostas (${currentQuestion.quantidade_respostas}).`,
      };
    }
    return {
      mood: 'talking',
      badge: `Questão #${currentQuestion.numero}`,
      message: `Leia com calma o enunciado da questão #${currentQuestion.numero}${topicText} e escolha a melhor alternativa.`,
    };
  }, [submitted, lastResult, combo, currentQuestion]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 bg-zinc-200 rounded-lg" />
        <div className="h-96 bg-white border border-zinc-200 rounded-2xl" />
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center max-w-xl mx-auto mt-8">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-zinc-900">
          Nenhuma questão pendente neste filtro
        </h1>
        <p className="text-sm text-zinc-500 mt-1.5">
          Não há questões correspondentes a &ldquo;{activeFilterLabel}&rdquo; no momento.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/estudar"
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            Estudar todas as 45 questões
          </Link>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Voltar à visão geral
          </Link>
        </div>
      </div>
    );
  }

  const showAnswerNow = submitted || !hideAnswerUntilConfirm;

  return (
    <div className="space-y-6">
      <GameEffectsOverlay
        confettiTrigger={confettiTrigger}
        confettiIntensity={confettiIntensity}
        feedback={floatingFeedback}
      />

      {/* Professor Visual Novel reagindo às respostas + Dicas/Perguntas com Gemini 3.1 */}
      <ProfessorCompanion
        mood={professorState.mood}
        badge={professorState.badge}
        message={professorState.message}
        questionCodigo={currentQuestion.codigo}
        alreadySubmitted={submitted}
      />

      {/* HUD de Quiz da Sessão */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-zinc-200/90 px-4 sm:px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all',
              combo >= 2
                ? 'bg-amber-50 border-amber-300 text-amber-800 scale-105'
                : 'bg-zinc-50 border-zinc-200 text-zinc-600'
            )}
          >
            <Flame
              className={cn(
                'w-3.5 h-3.5',
                combo >= 2 ? 'text-amber-500 fill-amber-400' : 'text-zinc-400'
              )}
            />
            <span>Combo: {combo}x</span>
            {bestSessionCombo >= 2 && (
              <span className="text-[10px] text-zinc-400 font-normal ml-0.5">
                (máx {bestSessionCombo}x)
              </span>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-indigo-50/70 border border-indigo-200/80 text-indigo-700">
            <Zap className="w-3.5 h-3.5 text-indigo-600 fill-indigo-500/20" />
            <span>{sessionXp} XP na sessão</span>
          </div>
        </div>

        <div className="text-xs text-zinc-500 font-medium">
          Questão <strong className="text-zinc-900">{currentIndex + 1}</strong> / {questions.length}
        </div>
      </div>

      {/* Topo do Modo Estudo */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Modo Estudo</h1>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200/80">
              {activeFilterLabel}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Questão {currentIndex + 1} de {questions.length} • Resolva sem pressão de tempo e
            acompanhe a explicação original.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHideAnswerUntilConfirm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition-colors"
            title="Alternar visibilidade do gabarito antes da confirmação"
          >
            {hideAnswerUntilConfirm ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                Gabarito oculto até confirmar
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                Gabarito visível
              </>
            )}
          </button>

          <select
            aria-label="Classificação temática da questão"
            value={currentQuestion.progress.topicId ?? ''}
            onChange={(e) => handleTopicChange(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="" disabled>
              Classificar assunto...
            </option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Barra de progresso da sessão */}
      <div className="w-full h-1.5 bg-zinc-200/80 rounded-full overflow-hidden">
        <div
          className="h-full bg-zinc-900 rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Card principal da questão */}
      <QuestionCard
        question={currentQuestion}
        topicName={currentQuestion.progress.topicName}
        selectedAnswers={selectedAnswers}
        onSelectionChange={setSelectedAnswers}
        disabled={submitted}
        showFeedback={showAnswerNow}
        isCorrect={lastResult ? lastResult.isCorrect : null}
        animState={cardAnim}
        headerRight={
          <button
            type="button"
            onClick={handleToggleFavorite}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              currentQuestion.progress.isFavorite
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            )}
          >
            <Star
              className={cn(
                'w-3.5 h-3.5',
                currentQuestion.progress.isFavorite && 'fill-amber-400 text-amber-500'
              )}
            />
            {currentQuestion.progress.isFavorite ? 'Favorita' : 'Favoritar'}
          </button>
        }
      />

      {/* Ações de confirmação e navegação */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-2xl border border-zinc-200/90 p-3.5 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl sm:rounded-lg text-sm font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Anterior
          </button>

          {submitted && (
            <button
              type="button"
              onClick={() => {
                setSelectedAnswers([]);
                setSubmitted(false);
                setLastResult(null);
                questionStartRef.current = Date.now();
              }}
              className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl sm:rounded-lg text-sm font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Refazer
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {!submitted && (
            <button
              type="button"
              disabled={selectedAnswers.length === 0 || submitting}
              onClick={handleConfirm}
              className="w-full sm:w-auto justify-center inline-flex items-center gap-2 min-h-[48px] sm:min-h-0 px-5 py-3 sm:py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
            >
              {submitting ? 'Corrigindo...' : 'Confirmar resposta'}
            </button>
          )}

          <button
            type="button"
            disabled={currentIndex >= questions.length - 1}
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            className={cn(
              'w-full sm:w-auto justify-center inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
              submitted
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40'
            )}
          >
            Próxima
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Avaliação de dificuldade (Revisão Espaçada) após responder */}
      {submitted && (
        <section className="bg-white rounded-2xl border border-zinc-200/90 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Como você avalia a dificuldade desta questão?
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Usado para agendar a revisão espaçada.
              {lastResult?.spacedRepetition?.nextReviewAt && (
                <span className="ml-1 text-zinc-700 font-medium">
                  Próxima revisão: {formatShortDateBR(lastResult.spacedRepetition.nextReviewAt)} (
                  {lastResult.spacedRepetition.intervalDays} dia(s)).
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {DIFFICULTY_LABELS.map((item) => {
              const active = lastResult?.spacedRepetition.difficulty === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  disabled={savingDifficulty}
                  onClick={() => handleDifficultyRating(item.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    active
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Explicação Original + Tutor Complementar */}
      {showAnswerNow && (
        <QuestionTutorPanel
          questionCodigo={currentQuestion.codigo}
          originalExplanation={currentQuestion.explicacao}
          aiExplanation={aiExplanation}
          onAiExplanationLoaded={setAiExplanation}
        />
      )}

      {/* Anotações pessoais */}
      <QuestionNotesPanel
        questionCodigo={currentQuestion.codigo}
        notes={notes}
        onNotesChange={setNotes}
      />

      {/* Navegação rápida entre questões */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Navegação rápida ({questions.length} questões)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const statusClass =
              q.progress.lastIsCorrect === true
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : q.progress.lastIsCorrect === false
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-zinc-50 text-zinc-600 border-zinc-200';
            return (
              <button
                key={q.codigo}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  'w-9 h-9 rounded-lg text-xs font-mono font-medium border transition-all',
                  isCurrent
                    ? 'bg-zinc-900 text-white border-zinc-900 ring-2 ring-zinc-900/20'
                    : statusClass
                )}
                title={`#${q.numero} (${q.codigo})`}
              >
                {q.numero}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function EstudarPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 bg-white border border-zinc-200 rounded-2xl animate-pulse" />
      }
    >
      <StudyWorkspace />
    </Suspense>
  );
}
