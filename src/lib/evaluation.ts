import type { DifficultyRating, MasteryLevel } from '@/types/domain';

/**
 * Normaliza o gabarito (string ou string[]) em um array ordenado e sem duplicatas,
 * exclusivamente para comparação interna (nunca altera o formato original exportado).
 */
export function normalizeAnswerSet(answer: string | string[] | null | undefined): string[] {
  if (!answer) return [];
  const raw = Array.isArray(answer) ? answer : [answer];
  return Array.from(
    new Set(
      raw
        .map((item) => String(item).trim().toUpperCase())
        .filter((item) => item.length > 0)
    )
  ).sort();
}

/**
 * Regra padrão de correção:
 * - Questão única: correspondência exata da alternativa única.
 * - Questão múltipla: correspondência exata do conjunto completo de alternativas.
 *   Respostas parcialmente corretas NÃO contam como acerto integral.
 */
export function evaluateAnswer(
  selected: string | string[],
  correctAnswer: string | string[]
): {
  isCorrect: boolean;
  normalizedSelected: string[];
  normalizedCorrect: string[];
} {
  const normalizedSelected = normalizeAnswerSet(selected);
  const normalizedCorrect = normalizeAnswerSet(correctAnswer);

  const isCorrect =
    normalizedSelected.length > 0 &&
    normalizedSelected.length === normalizedCorrect.length &&
    normalizedSelected.every((val, idx) => val === normalizedCorrect[idx]);

  return {
    isCorrect,
    normalizedSelected,
    normalizedCorrect,
  };
}

/**
 * Algoritmo transparente de Revisão Espaçada (adaptado do SM-2).
 * Dificuldade percebida: 1 (Muito fácil) a 5 (Muito difícil).
 */
export function computeNextSpacedReview(params: {
  isCorrect: boolean;
  difficulty: DifficultyRating;
  previousEaseFactor?: number;
  previousIntervalDays?: number;
  previousRepetitions?: number;
  previousConsecutiveCorrect?: number;
  now?: Date;
}): {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  consecutiveCorrect: number;
  nextReviewAt: string;
} {
  const now = params.now ?? new Date();
  // Converte dificuldade 1..5 em qualidade 5..1 (inverso)
  const quality = params.isCorrect ? 6 - params.difficulty : Math.max(0, 2 - Math.floor(params.difficulty / 2));

  let easeFactor = params.previousEaseFactor ?? 2.5;
  let intervalDays = params.previousIntervalDays ?? 0;
  let repetitions = params.previousRepetitions ?? 0;
  let consecutiveCorrect = params.previousConsecutiveCorrect ?? 0;

  if (!params.isCorrect) {
    repetitions = 0;
    consecutiveCorrect = 0;
    intervalDays = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else {
    consecutiveCorrect += 1;
    repetitions += 1;
    if (repetitions === 1) {
      intervalDays = params.difficulty <= 2 ? 3 : params.difficulty === 3 ? 2 : 1;
    } else if (repetitions === 2) {
      intervalDays = params.difficulty <= 2 ? 7 : params.difficulty === 3 ? 5 : 3;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }

    easeFactor = Math.max(
      1.3,
      Number((easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))).toFixed(2))
    );
  }

  const nextDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    consecutiveCorrect,
    nextReviewAt: nextDate.toISOString(),
  };
}

/**
 * Regras transparentes do Mapa de Domínio por assunto.
 * Nunca classifica um assunto como dominado após apenas 1 resposta correta.
 */
export function computeMasteryLevel(params: {
  totalQuestionsInTopic: number;
  uniqueAnsweredQuestions: number;
  totalAttempts: number;
  accuracyPercent: number | null;
  recentAccuracyPercent: number | null;
  recurringErrorQuestions: number;
}): { level: MasteryLevel; reason: string } {
  const {
    totalQuestionsInTopic,
    uniqueAnsweredQuestions,
    totalAttempts,
    accuracyPercent,
    recentAccuracyPercent,
    recurringErrorQuestions,
  } = params;

  if (totalAttempts === 0 || uniqueAnsweredQuestions === 0) {
    return {
      level: 'nao_estudado',
      reason: 'Nenhuma questão respondida neste assunto ainda.',
    };
  }

  const coverageRatio =
    totalQuestionsInTopic > 0 ? uniqueAnsweredQuestions / totalQuestionsInTopic : 0;

  // Exige no mínimo 3 tentativas (ou todas as questões do assunto se o assunto tiver 2 questões e pelo menos 2 tentativas em cada)
  const minForMastery = Math.max(3, Math.min(totalQuestionsInTopic, 4));

  if (totalAttempts < 2 || accuracyPercent === null) {
    return {
      level: 'conhecimento_inicial',
      reason: `Apenas ${totalAttempts} tentativa(s) registrada(s); responda mais questões para consolidar a avaliação.`,
    };
  }

  const effectiveRecent = recentAccuracyPercent ?? accuracyPercent;

  if (
    totalAttempts >= minForMastery &&
    coverageRatio >= 0.75 &&
    accuracyPercent >= 85 &&
    effectiveRecent >= 85 &&
    recurringErrorQuestions === 0
  ) {
    return {
      level: 'dominio_consistente',
      reason: `${Math.round(accuracyPercent)}% de acerto geral (${Math.round(effectiveRecent)}% recente) cobrindo ${uniqueAnsweredQuestions}/${totalQuestionsInTopic} questões, sem erros reincidentes.`,
    };
  }

  if (
    totalAttempts >= Math.min(3, totalQuestionsInTopic) &&
    coverageRatio >= 0.5 &&
    accuracyPercent >= 70 &&
    effectiveRecent >= 70
  ) {
    return {
      level: 'bom_dominio',
      reason: `${Math.round(accuracyPercent)}% de aproveitamento com boa cobertura (${uniqueAnsweredQuestions}/${totalQuestionsInTopic}).`,
    };
  }

  if (accuracyPercent >= 50 || totalAttempts >= 3) {
    return {
      level: 'em_desenvolvimento',
      reason:
        recurringErrorQuestions > 0
          ? `${Math.round(accuracyPercent)}% de acerto, com ${recurringErrorQuestions} questão(ões) ainda apresentando dificuldade.`
          : `${Math.round(accuracyPercent)}% de acerto; continue praticando para consolidar o domínio.`,
    };
  }

  return {
    level: 'conhecimento_inicial',
    reason: `Aproveitamento inicial de ${Math.round(accuracyPercent)}% (${totalAttempts} tentativas). Recomenda-se revisar os conceitos base.`,
  };
}
