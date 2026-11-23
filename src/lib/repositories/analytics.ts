import { getDb } from '@/lib/db';
import { computeMasteryLevel } from '@/lib/evaluation';
import { ensureInitialBankImported } from '@/lib/importer';
import { listExamSessions } from '@/lib/repositories/exams';
import {
  getAllTopics,
  getAppSettings,
  listQuestionsWithProgress,
} from '@/lib/repositories/questions';
import type { StudyRecommendation, TopicPerformance } from '@/types/domain';

function computeStudyStreak(datesIso: string[]): number {
  if (datesIso.length === 0) return 0;
  const uniqueDays = Array.from(
    new Set(
      datesIso.map((iso) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`;
      })
    )
  )
    .sort()
    .reverse();

  if (uniqueDays.length === 0) return 0;

  const today = new Date();
  const formatDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
      2,
      '0'
    )}`;

  const todayStr = formatDay(today);
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = formatDay(yesterday);

  if (uniqueDays[0] !== todayStr && uniqueDays[0] !== yesterdayStr) {
    return 0;
  }

  let streak = 1;
  let current = new Date(`${uniqueDays[0]}T12:00:00`);
  for (let i = 1; i < uniqueDays.length; i++) {
    const prevExpected = new Date(current.getTime() - 86400000);
    if (uniqueDays[i] === formatDay(prevExpected)) {
      streak += 1;
      current = prevExpected;
    } else {
      break;
    }
  }
  return streak;
}

export function getTopicPerformances(periodDays?: number | null): TopicPerformance[] {
  ensureInitialBankImported();
  const db = getDb();
  const settings = getAppSettings();
  const topics = getAllTopics();
  const questions = listQuestionsWithProgress();

  const cutoffIso =
    periodDays && periodDays > 0
      ? new Date(Date.now() - periodDays * 86400000).toISOString()
      : null;

  const attempts = (
    cutoffIso
      ? db
          .prepare(
            `SELECT question_codigo, is_correct, time_spent_ms, created_at
             FROM attempts WHERE created_at >= ? ORDER BY id ASC`
          )
          .all(cutoffIso)
      : db
          .prepare(
            `SELECT question_codigo, is_correct, time_spent_ms, created_at
             FROM attempts ORDER BY id ASC`
          )
          .all()
  ) as Array<{
    question_codigo: string;
    is_correct: number;
    time_spent_ms: number;
    created_at: string;
  }>;

  const questionTopicMap = new Map<string, string>();
  const topicQuestionCounts = new Map<string, number>();
  const topicErrorReviewCounts = new Map<string, number>();

  for (const q of questions) {
    if (q.progress.topicId) {
      questionTopicMap.set(q.codigo, q.progress.topicId);
      topicQuestionCounts.set(
        q.progress.topicId,
        (topicQuestionCounts.get(q.progress.topicId) ?? 0) + 1
      );
      if (q.progress.needsErrorReview) {
        topicErrorReviewCounts.set(
          q.progress.topicId,
          (topicErrorReviewCounts.get(q.progress.topicId) ?? 0) + 1
        );
      }
    }
  }

  return topics.map((topic) => {
    const topicAttempts = attempts.filter(
      (a) => questionTopicMap.get(a.question_codigo) === topic.id
    );
    const totalAttempts = topicAttempts.length;
    const correctAttempts = topicAttempts.filter((a) => a.is_correct === 1).length;
    const wrongAttempts = totalAttempts - correctAttempts;
    const uniqueAnsweredQuestions = new Set(topicAttempts.map((a) => a.question_codigo)).size;
    const totalQuestionsInTopic = topicQuestionCounts.get(topic.id) ?? 0;

    const accuracyPercent =
      totalAttempts >= settings.minAnswersForTopicPercent
        ? Number(((correctAttempts / totalAttempts) * 100).toFixed(1))
        : null;

    const recentSlice = topicAttempts.slice(-5);
    const recentAccuracyPercent =
      recentSlice.length >= settings.minAnswersForTopicPercent
        ? Number(
            (
              (recentSlice.filter((a) => a.is_correct === 1).length / recentSlice.length) *
              100
            ).toFixed(1)
          )
        : null;

    const timed = topicAttempts.filter((a) => a.time_spent_ms > 0);
    const avgTimeMs =
      timed.length > 0
        ? Math.round(timed.reduce((acc, a) => acc + a.time_spent_ms, 0) / timed.length)
        : null;

    const mastery = computeMasteryLevel({
      totalQuestionsInTopic,
      uniqueAnsweredQuestions,
      totalAttempts,
      accuracyPercent,
      recentAccuracyPercent,
      recurringErrorQuestions: topicErrorReviewCounts.get(topic.id) ?? 0,
    });

    return {
      topicId: topic.id,
      topicName: topic.name,
      totalQuestionsInTopic,
      uniqueAnsweredQuestions,
      totalAttempts,
      correctAttempts,
      wrongAttempts,
      accuracyPercent,
      avgTimeMs,
      masteryLevel: mastery.level,
      masteryReason: mastery.reason,
      recentAccuracyPercent,
    };
  });
}

export function getDashboardAnalytics() {
  ensureInitialBankImported();
  const db = getDb();
  const questions = listQuestionsWithProgress();
  const exams = listExamSessions();
  const topics = getTopicPerformances();

  const attempts = db
    .prepare(`SELECT id, question_codigo, is_correct, time_spent_ms, created_at FROM attempts ORDER BY id ASC`)
    .all() as Array<{
    id: number;
    question_codigo: string;
    is_correct: number;
    time_spent_ms: number;
    created_at: string;
  }>;

  const totalQuestions = questions.length;
  const answeredUnique = questions.filter((q) => q.progress.attemptsCount > 0).length;
  const unansweredUnique = totalQuestions - answeredUnique;
  const totalAttempts = attempts.length;
  const totalCorrect = attempts.filter((a) => a.is_correct === 1).length;
  const totalWrong = totalAttempts - totalCorrect;
  const overallAccuracy =
    totalAttempts > 0 ? Number(((totalCorrect / totalAttempts) * 100).toFixed(1)) : null;

  const completedExams = exams.filter((e) => e.status === 'completed');
  const inProgressExam = exams.find((e) => e.status === 'in_progress') ?? null;

  const bestExamScore =
    completedExams.length > 0
      ? Math.max(...completedExams.map((e) => e.scorePercent))
      : null;
  const latestExam = completedExams[0] ?? null;

  const attemptTimeMs = attempts.reduce((acc, a) => acc + (a.time_spent_ms || 0), 0);
  const examTimeMs = completedExams.reduce((acc, e) => acc + e.durationSeconds * 1000, 0);
  const totalStudyTimeMs = Math.max(attemptTimeMs, examTimeMs);

  const studyStreakDays = computeStudyStreak(attempts.map((a) => a.created_at));

  const rankedTopics = topics.filter((t) => t.accuracyPercent !== null);
  const bestTopics = [...rankedTopics]
    .sort((a, b) => (b.accuracyPercent ?? 0) - (a.accuracyPercent ?? 0))
    .slice(0, 3);
  const attentionTopics = [...rankedTopics]
    .filter((t) => (t.accuracyPercent ?? 100) < 75)
    .sort((a, b) => (a.accuracyPercent ?? 0) - (b.accuracyPercent ?? 0))
    .slice(0, 3);

  const errorReviewQuestions = questions.filter((q) => q.progress.needsErrorReview);
  const nowIso = new Date().toISOString();
  const dueSpacedReview = questions.filter(
    (q) =>
      q.progress.spacedRepetition?.nextReviewAt &&
      q.progress.spacedRepetition.nextReviewAt <= nowIso
  );

  // Última atividade real para "Continue de onde parou"
  const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
  const continueActivity = inProgressExam
    ? {
        type: 'exam' as const,
        title: inProgressExam.title,
        subtitle: `${inProgressExam.answeredCount} de ${inProgressExam.totalQuestions} questões respondidas`,
        href: `/simulados/${inProgressExam.id}`,
        cta: 'Retomar simulado',
      }
    : lastAttempt
      ? (() => {
          const q = questions.find((item) => item.codigo === lastAttempt.question_codigo);
          const nextUnanswered = questions.find((item) => item.progress.attemptsCount === 0);
          return {
            type: 'study' as const,
            title: nextUnanswered
              ? `Continuar na questão #${nextUnanswered.numero} (${nextUnanswered.codigo})`
              : `Última questão estudada: #${q?.numero ?? ''} (${lastAttempt.question_codigo})`,
            subtitle: nextUnanswered
              ? `${unansweredUnique} questão(ões) ainda não respondida(s) no banco`
              : 'Você já respondeu todas as 45 questões ao menos uma vez',
            href: nextUnanswered
              ? `/estudar?codigo=${nextUnanswered.codigo}`
              : `/estudar?codigo=${lastAttempt.question_codigo}`,
            cta: 'Continuar estudando',
          };
        })()
      : null;

  // Recomendações 100% derivadas dos dados reais
  const recommendations: StudyRecommendation[] = [];

  if (errorReviewQuestions.length > 0) {
    recommendations.push({
      id: 'rec-errors',
      priority: 'high',
      category: 'errors',
      title: `${errorReviewQuestions.length} questão(ões) pendente(s) na revisão de erros`,
      description:
        'Refaça as questões em que houve erro recente até atingir a sequência de acertos configurada.',
      actionLabel: 'Revisar erros agora',
      actionHref: '/revisao',
    });
  }

  if (attentionTopics.length > 0) {
    const worst = attentionTopics[0];
    recommendations.push({
      id: `rec-topic-${worst.topicId}`,
      priority: 'high',
      category: 'topic',
      title: `Reforçar: ${worst.topicName}`,
      description: `Aproveitamento atual de ${worst.accuracyPercent}% em ${worst.totalAttempts} tentativas (${worst.wrongAttempts} erro(s)).`,
      actionLabel: 'Estudar assunto',
      actionHref: `/estudar?topic=${worst.topicId}`,
    });
  }

  if (dueSpacedReview.length > 0) {
    recommendations.push({
      id: 'rec-spaced',
      priority: 'medium',
      category: 'spaced_review',
      title: `${dueSpacedReview.length} questão(ões) pronta(s) para revisão espaçada`,
      description:
        'O intervalo ideal de memorização venceu para essas questões com base na dificuldade informada.',
      actionLabel: 'Abrir revisão espaçada',
      actionHref: '/revisao?tab=espacada',
    });
  }

  if (unansweredUnique > 0 && totalAttempts > 0) {
    recommendations.push({
      id: 'rec-unanswered',
      priority: 'medium',
      category: 'unanswered',
      title: `Explorar ${unansweredUnique} questão(ões) ainda não respondida(s)`,
      description: `Você já cobriu ${answeredUnique} de ${totalQuestions} questões do banco oficial.`,
      actionLabel: 'Estudar não respondidas',
      actionHref: '/estudar?filter=unanswered',
    });
  }

  if (bestTopics.length > 0 && (bestTopics[0].accuracyPercent ?? 0) >= 80) {
    recommendations.push({
      id: `rec-good-${bestTopics[0].topicId}`,
      priority: 'low',
      category: 'improvement',
      title: `Bom ritmo em ${bestTopics[0].topicName}`,
      description: `Você mantém ${bestTopics[0].accuracyPercent}% de acerto neste tópico. Que tal validar em um simulado cronometrado?`,
      actionLabel: 'Criar simulado',
      actionHref: '/simulados',
    });
  }

  return {
    summary: {
      totalQuestions,
      answeredUnique,
      unansweredUnique,
      totalAttempts,
      totalCorrect,
      totalWrong,
      overallAccuracy,
      completedExamsCount: completedExams.length,
      bestExamScore,
      latestExamScore: latestExam ? latestExam.scorePercent : null,
      latestExamDate: latestExam ? latestExam.finishedAt : null,
      totalStudyTimeMs,
      studyStreakDays,
      favoritesCount: questions.filter((q) => q.progress.isFavorite).length,
      errorReviewCount: errorReviewQuestions.length,
      dueSpacedReviewCount: dueSpacedReview.length,
    },
    continueActivity,
    bestTopics,
    attentionTopics,
    topics,
    recommendations,
    recentExams: completedExams.slice(0, 5),
  };
}

export function getDetailedReports(periodDays?: number | null) {
  ensureInitialBankImported();
  const db = getDb();
  const questions = listQuestionsWithProgress();
  const exams = listExamSessions().filter((e) => e.status === 'completed');
  const topics = getTopicPerformances(periodDays);

  const cutoffIso =
    periodDays && periodDays > 0
      ? new Date(Date.now() - periodDays * 86400000).toISOString()
      : null;

  const attempts = (
    cutoffIso
      ? db
          .prepare(
            `SELECT id, question_codigo, mode, is_correct, time_spent_ms, created_at
             FROM attempts WHERE created_at >= ? ORDER BY created_at ASC`
          )
          .all(cutoffIso)
      : db
          .prepare(
            `SELECT id, question_codigo, mode, is_correct, time_spent_ms, created_at
             FROM attempts ORDER BY created_at ASC`
          )
          .all()
  ) as Array<{
    id: number;
    question_codigo: string;
    mode: string;
    is_correct: number;
    time_spent_ms: number;
    created_at: string;
  }>;

  // Evolução diária real
  const dailyMap = new Map<
    string,
    { date: string; total: number; correct: number; timeMs: number }
  >();
  for (const a of attempts) {
    const day = a.created_at.slice(0, 10);
    const cur = dailyMap.get(day) ?? { date: day, total: 0, correct: 0, timeMs: 0 };
    cur.total += 1;
    cur.correct += a.is_correct === 1 ? 1 : 0;
    cur.timeMs += a.time_spent_ms || 0;
    dailyMap.set(day, cur);
  }

  const dailyEvolution = Array.from(dailyMap.values()).map((d) => ({
    date: d.date,
    total: d.total,
    correct: d.correct,
    accuracy: d.total > 0 ? Number(((d.correct / d.total) * 100).toFixed(1)) : 0,
    studyMinutes: Number((d.timeMs / 60000).toFixed(1)),
  }));

  // Relatório por questão
  const attemptsByQuestion = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const arr = attemptsByQuestion.get(a.question_codigo) ?? [];
    arr.push(a);
    attemptsByQuestion.set(a.question_codigo, arr);
  }

  const questionReports = questions
    .map((q) => {
      const qAttempts = attemptsByQuestion.get(q.codigo) ?? [];
      const total = qAttempts.length;
      const correct = qAttempts.filter((a) => a.is_correct === 1).length;
      const wrong = total - correct;
      const timed = qAttempts.filter((a) => a.time_spent_ms > 0);
      const avgTimeMs =
        timed.length > 0
          ? Math.round(timed.reduce((acc, a) => acc + a.time_spent_ms, 0) / timed.length)
          : null;

      // Evolução positiva: errou antes e acertou na tentativa mais recente
      const hasImproved =
        total >= 2 &&
        qAttempts[0].is_correct === 0 &&
        qAttempts[qAttempts.length - 1].is_correct === 1;

      const stillStruggling = q.progress.needsErrorReview;

      return {
        codigo: q.codigo,
        numero: q.numero,
        enunciado: q.enunciado,
        tipo: q.tipo,
        topicName: q.progress.topicName,
        totalAttempts: total,
        correctCount: correct,
        wrongCount: wrong,
        accuracyPercent: total > 0 ? Number(((correct / total) * 100).toFixed(1)) : null,
        avgTimeMs,
        hasImproved,
        stillStruggling,
      };
    })
    .filter((item) => item.totalAttempts > 0);

  const filteredExams = cutoffIso
    ? exams.filter((e) => (e.finishedAt ?? e.startedAt) >= cutoffIso)
    : exams;

  const examEvolution = [...filteredExams]
    .reverse()
    .map((e, idx) => ({
      index: idx + 1,
      id: e.id,
      title: e.title,
      date: (e.finishedAt ?? e.startedAt).slice(0, 10),
      scorePercent: e.scorePercent,
      totalQuestions: e.totalQuestions,
      correctCount: e.correctCount,
      durationMinutes: Number((e.durationSeconds / 60).toFixed(1)),
    }));

  const totalAttempts = attempts.length;
  const totalCorrect = attempts.filter((a) => a.is_correct === 1).length;

  return {
    general: {
      totalQuestions: questions.length,
      answeredUnique: questions.filter((q) => q.progress.attemptsCount > 0).length,
      totalAttempts,
      totalCorrect,
      totalWrong: totalAttempts - totalCorrect,
      accuracyPercent:
        totalAttempts > 0 ? Number(((totalCorrect / totalAttempts) * 100).toFixed(1)) : null,
      totalStudyTimeMs: attempts.reduce((acc, a) => acc + (a.time_spent_ms || 0), 0),
      completedExamsCount: filteredExams.length,
    },
    topics,
    dailyEvolution,
    examEvolution,
    questionReports: {
      mostWrong: [...questionReports]
        .filter((q) => q.wrongCount > 0)
        .sort((a, b) => b.wrongCount - a.wrongCount)
        .slice(0, 10),
      slowest: [...questionReports]
        .filter((q) => q.avgTimeMs !== null)
        .sort((a, b) => (b.avgTimeMs ?? 0) - (a.avgTimeMs ?? 0))
        .slice(0, 10),
      mostAttempted: [...questionReports]
        .sort((a, b) => b.totalAttempts - a.totalAttempts)
        .slice(0, 10),
      improved: questionReports.filter((q) => q.hasImproved),
      stillStruggling: questionReports.filter((q) => q.stillStruggling),
    },
    exams: filteredExams,
  };
}
