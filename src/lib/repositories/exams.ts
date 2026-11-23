import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { computeNextSpacedReview, evaluateAnswer } from '@/lib/evaluation';
import { ensureInitialBankImported } from '@/lib/importer';
import { listQuestionsWithProgress, mapRowToSourceQuestion } from '@/lib/repositories/questions';
import type {
  ExamConfig,
  ExamSession,
  ExamSessionDetail,
  ExamSessionItem,
  SourceQuestion,
} from '@/types/domain';

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createExamSession(config: ExamConfig): ExamSessionDetail {
  ensureInitialBankImported();
  const allQuestions = listQuestionsWithProgress();

  let pool = allQuestions.filter((q) => {
    if (q.tipo === 'unica' && !config.includeUnica) return false;
    if (q.tipo === 'multipla' && !config.includeMultipla) return false;
    if (!config.reuseAnswered && q.progress.attemptsCount > 0) return false;
    if (config.onlyFavorites && !q.progress.isFavorite) return false;
    if (config.topicIds && config.topicIds.length > 0) {
      if (!q.progress.topicId || !config.topicIds.includes(q.progress.topicId)) {
        return false;
      }
    }
    return true;
  });

  if (pool.length === 0) {
    throw new Error(
      'Nenhuma questão atende aos critérios selecionados para este simulado. Ajuste os filtros (ex.: permitir questões já respondidas).'
    );
  }

  if (config.selectionMode === 'random') {
    pool = shuffleArray(pool);
  } else {
    pool = [...pool].sort((a, b) => a.numero - b.numero);
  }

  const targetCount = Math.min(Math.max(1, config.questionCount), pool.length);
  const selectedQuestions = pool.slice(0, targetCount);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title =
    config.title?.trim() ||
    `Simulado IREB (${targetCount} ${targetCount === 1 ? 'questão' : 'questões'})`;

  const db = getDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO exam_sessions (
        id, title, status, config_json, total_questions,
        answered_count, correct_count, wrong_count, unanswered_count,
        score_percent, duration_seconds, started_at, finished_at, current_index
      ) VALUES (?, ?, 'in_progress', ?, ?, 0, 0, 0, ?, 0, 0, ?, NULL, 0)`
    ).run(id, title, JSON.stringify(config), targetCount, targetCount, now);

    const insertItem = db.prepare(
      `INSERT INTO exam_session_items (
        exam_session_id, position, question_codigo, selected_answers_json, marked_for_review, is_correct, time_spent_ms
      ) VALUES (?, ?, ?, '[]', 0, NULL, 0)`
    );

    selectedQuestions.forEach((q, idx) => {
      insertItem.run(id, idx + 1, q.codigo);
    });

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const detail = getExamSessionDetail(id);
  if (!detail) throw new Error('Falha ao recuperar simulado criado.');
  return detail;
}

export function listExamSessions(): ExamSession[] {
  ensureInitialBankImported();
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM exam_sessions ORDER BY started_at DESC`)
    .all() as Array<{
    id: string;
    title: string;
    status: 'in_progress' | 'completed' | 'abandoned';
    config_json: string;
    total_questions: number;
    answered_count: number;
    correct_count: number;
    wrong_count: number;
    unanswered_count: number;
    score_percent: number;
    duration_seconds: number;
    started_at: string;
    finished_at: string | null;
    current_index: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    config: JSON.parse(r.config_json) as ExamConfig,
    totalQuestions: r.total_questions,
    answeredCount: r.answered_count,
    correctCount: r.correct_count,
    wrongCount: r.wrong_count,
    unansweredCount: r.unanswered_count,
    scorePercent: r.score_percent,
    durationSeconds: r.duration_seconds,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    currentIndex: r.current_index,
  }));
}

export function getExamSessionDetail(
  examId: string,
  options: { hideAnswersIfInProgress?: boolean } = {}
): ExamSessionDetail | null {
  ensureInitialBankImported();
  const db = getDb();
  const row = db.prepare(`SELECT * FROM exam_sessions WHERE id = ?`).get(examId) as
    | {
        id: string;
        title: string;
        status: 'in_progress' | 'completed' | 'abandoned';
        config_json: string;
        total_questions: number;
        answered_count: number;
        correct_count: number;
        wrong_count: number;
        unanswered_count: number;
        score_percent: number;
        duration_seconds: number;
        started_at: string;
        finished_at: string | null;
        current_index: number;
      }
    | undefined;

  if (!row) return null;

  const itemRows = db
    .prepare(
      `SELECT
         i.id as item_id,
         i.exam_session_id,
         i.position,
         i.question_codigo,
         i.selected_answers_json,
         i.marked_for_review,
         i.is_correct,
         i.time_spent_ms,
         q.*,
         o.override_image_url,
         o.min_selections,
         o.max_selections
       FROM exam_session_items i
       JOIN questions_source q ON q.codigo = i.question_codigo
       LEFT JOIN question_admin_overrides o ON o.question_codigo = q.codigo
       WHERE i.exam_session_id = ?
       ORDER BY i.position ASC`
    )
    .all(examId) as Array<Record<string, unknown>>;

  const shouldHide = Boolean(options.hideAnswersIfInProgress && row.status === 'in_progress');

  const items: (ExamSessionItem & { question: SourceQuestion })[] = itemRows.map((r) => {
    const question = mapRowToSourceQuestion(r as never);
    // Regra crítica: durante simulado em andamento, nunca vazar gabarito nem explicação
    const safeQuestion: SourceQuestion = shouldHide
      ? {
          ...question,
          resposta_correta: question.tipo === 'multipla' ? [] : '',
          explicacao: '',
        }
      : question;

    return {
      id: Number(r.item_id),
      examSessionId: String(r.exam_session_id),
      position: Number(r.position),
      questionCodigo: String(r.question_codigo),
      selectedAnswers: JSON.parse(String(r.selected_answers_json)) as string[],
      markedForReview: Number(r.marked_for_review) === 1,
      isCorrect: shouldHide ? null : r.is_correct === null ? null : Number(r.is_correct) === 1,
      timeSpentMs: Number(r.time_spent_ms),
      question: safeQuestion,
    };
  });

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    config: JSON.parse(row.config_json) as ExamConfig,
    totalQuestions: row.total_questions,
    answeredCount: row.answered_count,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    unansweredCount: row.unanswered_count,
    scorePercent: row.score_percent,
    durationSeconds: row.duration_seconds,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    currentIndex: row.current_index,
    items,
  };
}

export function updateExamProgress(
  examId: string,
  payload: {
    questionCodigo?: string;
    selectedAnswers?: string[];
    markedForReview?: boolean;
    timeSpentMsDelta?: number;
    currentIndex?: number;
    durationSeconds?: number;
  }
): void {
  const db = getDb();
  const session = db
    .prepare(`SELECT status FROM exam_sessions WHERE id = ?`)
    .get(examId) as { status: string } | undefined;

  if (!session || session.status !== 'in_progress') {
    throw new Error('Simulado não está em andamento.');
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    if (payload.questionCodigo) {
      if (payload.selectedAnswers !== undefined) {
        db.prepare(
          `UPDATE exam_session_items
           SET selected_answers_json = ?
           WHERE exam_session_id = ? AND question_codigo = ?`
        ).run(JSON.stringify(payload.selectedAnswers), examId, payload.questionCodigo);
      }
      if (payload.markedForReview !== undefined) {
        db.prepare(
          `UPDATE exam_session_items
           SET marked_for_review = ?
           WHERE exam_session_id = ? AND question_codigo = ?`
        ).run(payload.markedForReview ? 1 : 0, examId, payload.questionCodigo);
      }
      if (payload.timeSpentMsDelta && payload.timeSpentMsDelta > 0) {
        db.prepare(
          `UPDATE exam_session_items
           SET time_spent_ms = time_spent_ms + ?
           WHERE exam_session_id = ? AND question_codigo = ?`
        ).run(Math.round(payload.timeSpentMsDelta), examId, payload.questionCodigo);
      }
    }

    const counts = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN selected_answers_json != '[]' THEN 1 ELSE 0 END) as answered
         FROM exam_session_items
         WHERE exam_session_id = ?`
      )
      .get(examId) as { total: number; answered: number };

    db.prepare(
      `UPDATE exam_sessions
       SET answered_count = ?,
           unanswered_count = ?,
           current_index = COALESCE(?, current_index),
           duration_seconds = COALESCE(?, duration_seconds)
       WHERE id = ?`
    ).run(
      counts.answered ?? 0,
      (counts.total ?? 0) - (counts.answered ?? 0),
      payload.currentIndex ?? null,
      payload.durationSeconds ?? null,
      examId
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function finishExamSession(
  examId: string,
  durationSeconds?: number
): ExamSessionDetail {
  const db = getDb();
  const session = db
    .prepare(`SELECT status, duration_seconds FROM exam_sessions WHERE id = ?`)
    .get(examId) as { status: string; duration_seconds: number } | undefined;

  if (!session) {
    throw new Error('Simulado não encontrado.');
  }
  if (session.status === 'completed') {
    const existing = getExamSessionDetail(examId);
    if (!existing) throw new Error('Simulado não encontrado.');
    return existing;
  }

  const items = db
    .prepare(
      `SELECT i.id, i.question_codigo, i.selected_answers_json, i.time_spent_ms, q.resposta_correta_json
       FROM exam_session_items i
       JOIN questions_source q ON q.codigo = i.question_codigo
       WHERE i.exam_session_id = ?`
    )
    .all(examId) as Array<{
    id: number;
    question_codigo: string;
    selected_answers_json: string;
    time_spent_ms: number;
    resposta_correta_json: string;
  }>;

  const now = new Date().toISOString();
  let answeredCount = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const updateItem = db.prepare(`UPDATE exam_session_items SET is_correct = ? WHERE id = ?`);
    const insertAttempt = db.prepare(
      `INSERT INTO attempts (
        question_codigo, mode, exam_session_id, selected_answers_json, is_correct, time_spent_ms, created_at
      ) VALUES (?, 'exam', ?, ?, ?, ?, ?)`
    );
    const getPrevSr = db.prepare(`SELECT * FROM spaced_repetition WHERE question_codigo = ?`);
    const upsertSr = db.prepare(
      `INSERT INTO spaced_repetition (
         question_codigo, difficulty, ease_factor, interval_days, repetitions,
         consecutive_correct, last_reviewed_at, next_review_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(question_codigo) DO UPDATE SET
         ease_factor = excluded.ease_factor,
         interval_days = excluded.interval_days,
         repetitions = excluded.repetitions,
         consecutive_correct = excluded.consecutive_correct,
         last_reviewed_at = excluded.last_reviewed_at,
         next_review_at = excluded.next_review_at`
    );

    for (const item of items) {
      const selected = JSON.parse(item.selected_answers_json) as string[];
      const correctRaw = JSON.parse(item.resposta_correta_json) as string | string[];

      if (selected.length === 0) {
        unansweredCount += 1;
        updateItem.run(0, item.id);
        continue;
      }

      answeredCount += 1;
      const evalRes = evaluateAnswer(selected, correctRaw);
      if (evalRes.isCorrect) correctCount += 1;
      else wrongCount += 1;

      updateItem.run(evalRes.isCorrect ? 1 : 0, item.id);
      insertAttempt.run(
        item.question_codigo,
        examId,
        JSON.stringify(evalRes.normalizedSelected),
        evalRes.isCorrect ? 1 : 0,
        item.time_spent_ms,
        now
      );

      const prevSr = getPrevSr.get(item.question_codigo) as
        | {
            difficulty: 1 | 2 | 3 | 4 | 5;
            ease_factor: number;
            interval_days: number;
            repetitions: number;
            consecutive_correct: number;
          }
        | undefined;

      const nextSr = computeNextSpacedReview({
        isCorrect: evalRes.isCorrect,
        difficulty: prevSr?.difficulty ?? (evalRes.isCorrect ? 3 : 4),
        previousEaseFactor: prevSr?.ease_factor,
        previousIntervalDays: prevSr?.interval_days,
        previousRepetitions: prevSr?.repetitions,
        previousConsecutiveCorrect: prevSr?.consecutive_correct,
      });

      upsertSr.run(
        item.question_codigo,
        prevSr?.difficulty ?? (evalRes.isCorrect ? 3 : 4),
        nextSr.easeFactor,
        nextSr.intervalDays,
        nextSr.repetitions,
        nextSr.consecutiveCorrect,
        now,
        nextSr.nextReviewAt
      );
    }

    const total = items.length;
    const scorePercent = total > 0 ? Number(((correctCount / total) * 100).toFixed(1)) : 0;

    db.prepare(
      `UPDATE exam_sessions
       SET status = 'completed',
           answered_count = ?,
           correct_count = ?,
           wrong_count = ?,
           unanswered_count = ?,
           score_percent = ?,
           duration_seconds = ?,
           finished_at = ?
       WHERE id = ?`
    ).run(
      answeredCount,
      correctCount,
      wrongCount,
      unansweredCount,
      scorePercent,
      durationSeconds ?? session.duration_seconds,
      now,
      examId
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const finished = getExamSessionDetail(examId);
  if (!finished) throw new Error('Falha ao carregar resultado do simulado.');
  return finished;
}
