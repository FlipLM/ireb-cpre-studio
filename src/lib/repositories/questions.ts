import { DEFAULT_APP_SETTINGS, getDb } from '@/lib/db';
import { computeNextSpacedReview, evaluateAnswer } from '@/lib/evaluation';
import { ensureInitialBankImported } from '@/lib/importer';
import type {
  AIExplanationRecord,
  AppSettings,
  AttemptRecord,
  DifficultyRating,
  NoteRecord,
  QuestionType,
  QuestionWithProgress,
  RawQuestion,
  SourceQuestion,
  SpacedRepetitionRecord,
  Topic,
} from '@/types/domain';

interface RawQuestionRow {
  codigo: string;
  numero: number;
  enunciado: string;
  tipo: QuestionType;
  quantidade_respostas: string;
  alternativas_json: string;
  resposta_correta_json: string;
  resposta_correta_is_array: number;
  explicacao: string;
  imagem: string | null;
  print: string | null;
  raw_json: string;
  managed_image_url: string | null;
  image_missing: number;
  override_image_url: string | null;
  min_selections: number | null;
  max_selections: number | null;
}

export function getAppSettings(): AppSettings {
  const db = getDb();
  const row = db
    .prepare(`SELECT value_json FROM app_settings WHERE key = 'platform_settings'`)
    .get() as { value_json: string } | undefined;
  if (!row) return DEFAULT_APP_SETTINGS;
  try {
    return {
      ...DEFAULT_APP_SETTINGS,
      ...(JSON.parse(row.value_json) as Partial<AppSettings>),
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const merged: AppSettings = { ...current, ...patch };
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES ('platform_settings', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify(merged), new Date().toISOString());
  return merged;
}

export function mapRowToSourceQuestion(row: RawQuestionRow): SourceQuestion {
  const effectiveImage = row.override_image_url ?? row.managed_image_url ?? null;
  return {
    numero: row.numero,
    codigo: row.codigo,
    enunciado: row.enunciado,
    tipo: row.tipo,
    quantidade_respostas: row.quantidade_respostas,
    alternativas: JSON.parse(row.alternativas_json) as Record<string, string>,
    resposta_correta: JSON.parse(row.resposta_correta_json) as string | string[],
    explicacao: row.explicacao,
    imagem: row.imagem,
    print: row.print,
    managedImageUrl: effectiveImage,
    imageMissing: Boolean(row.imagem) && !effectiveImage,
    adminMinSelections: row.min_selections ?? null,
    adminMaxSelections: row.max_selections ?? null,
  };
}

export function getAllTopics(): Topic[] {
  ensureInitialBankImported();
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, name, slug, description, sort_order FROM topics ORDER BY sort_order ASC`)
    .all() as Array<{
    id: string;
    name: string;
    slug: string;
    description: string;
    sort_order: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    sortOrder: r.sort_order,
  }));
}

export interface QuestionFilterParams {
  search?: string;
  tipo?: QuestionType | 'all';
  status?: 'all' | 'answered' | 'unanswered' | 'correct' | 'incorrect' | 'error_review';
  favoritesOnly?: boolean;
  withImageOnly?: boolean;
  topicId?: string;
}

export function listQuestionsWithProgress(
  filters: QuestionFilterParams = {}
): QuestionWithProgress[] {
  ensureInitialBankImported();
  const db = getDb();
  const settings = getAppSettings();

  const questionRows = db
    .prepare(
      `SELECT
         q.*,
         o.override_image_url,
         o.min_selections,
         o.max_selections
       FROM questions_source q
       LEFT JOIN question_admin_overrides o ON o.question_codigo = q.codigo
       ORDER BY q.numero ASC`
    )
    .all() as unknown as RawQuestionRow[];

  const attemptStatsRows = db
    .prepare(
      `SELECT
         question_codigo,
         COUNT(*) as attempts_count,
         SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
         SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrong_count,
         AVG(CASE WHEN time_spent_ms > 0 THEN time_spent_ms ELSE NULL END) as avg_time_ms,
         MAX(created_at) as last_attempt_at
       FROM attempts
       GROUP BY question_codigo`
    )
    .all() as Array<{
    question_codigo: string;
    attempts_count: number;
    correct_count: number;
    wrong_count: number;
    avg_time_ms: number | null;
    last_attempt_at: string | null;
  }>;

  const latestAttemptRows = db
    .prepare(
      `SELECT a.question_codigo, a.selected_answers_json, a.is_correct
       FROM attempts a
       INNER JOIN (
         SELECT question_codigo, MAX(id) as max_id
         FROM attempts
         GROUP BY question_codigo
       ) latest ON latest.max_id = a.id`
    )
    .all() as Array<{
    question_codigo: string;
    selected_answers_json: string;
    is_correct: number;
  }>;

  const favoriteRows = db.prepare(`SELECT question_codigo FROM favorites`).all() as Array<{
    question_codigo: string;
  }>;

  const noteCountRows = db
    .prepare(`SELECT question_codigo, COUNT(*) as cnt FROM notes GROUP BY question_codigo`)
    .all() as Array<{ question_codigo: string; cnt: number }>;

  const srRows = db.prepare(`SELECT * FROM spaced_repetition`).all() as Array<{
    question_codigo: string;
    difficulty: DifficultyRating;
    ease_factor: number;
    interval_days: number;
    repetitions: number;
    consecutive_correct: number;
    last_reviewed_at: string | null;
    next_review_at: string | null;
  }>;

  const topicAssignRows = db
    .prepare(
      `SELECT qt.question_codigo, t.id as topic_id, t.name as topic_name
       FROM question_topics qt
       JOIN topics t ON t.id = qt.topic_id`
    )
    .all() as Array<{ question_codigo: string; topic_id: string; topic_name: string }>;

  const statsMap = new Map(attemptStatsRows.map((r) => [r.question_codigo, r]));
  const latestMap = new Map(latestAttemptRows.map((r) => [r.question_codigo, r]));
  const favSet = new Set(favoriteRows.map((r) => r.question_codigo));
  const notesMap = new Map(noteCountRows.map((r) => [r.question_codigo, r.cnt]));
  const srMap = new Map(
    srRows.map((r) => [
      r.question_codigo,
      {
        questionCodigo: r.question_codigo,
        difficulty: r.difficulty,
        easeFactor: r.ease_factor,
        intervalDays: r.interval_days,
        repetitions: r.repetitions,
        consecutiveCorrect: r.consecutive_correct,
        lastReviewedAt: r.last_reviewed_at,
        nextReviewAt: r.next_review_at,
      } satisfies SpacedRepetitionRecord,
    ])
  );
  const topicMap = new Map(topicAssignRows.map((r) => [r.question_codigo, r]));

  let results: QuestionWithProgress[] = questionRows.map((row) => {
    const base = mapRowToSourceQuestion(row);
    const stat = statsMap.get(base.codigo);
    const latest = latestMap.get(base.codigo);
    const sr = srMap.get(base.codigo) ?? null;
    const topic = topicMap.get(base.codigo);

    const wrongCount = stat?.wrong_count ?? 0;
    const consecutiveCorrect = sr?.consecutiveCorrect ?? (latest?.is_correct === 1 ? 1 : 0);
    // Uma questão errada permanece na fila de revisão até atingir a sequência configurada de acertos
    const needsErrorReview =
      wrongCount > 0 && consecutiveCorrect < settings.errorReviewRequiredStreak;

    return {
      ...base,
      progress: {
        attemptsCount: stat?.attempts_count ?? 0,
        correctCount: stat?.correct_count ?? 0,
        wrongCount,
        lastAttemptAt: stat?.last_attempt_at ?? null,
        lastSelectedAnswers: latest ? (JSON.parse(latest.selected_answers_json) as string[]) : null,
        lastIsCorrect: latest ? latest.is_correct === 1 : null,
        avgTimeMs: stat?.avg_time_ms ? Math.round(stat.avg_time_ms) : null,
        isFavorite: favSet.has(base.codigo),
        notesCount: notesMap.get(base.codigo) ?? 0,
        needsErrorReview,
        spacedRepetition: sr,
        topicId: topic?.topic_id ?? null,
        topicName: topic?.topic_name ?? null,
      },
    };
  });

  if (filters.tipo && filters.tipo !== 'all') {
    results = results.filter((q) => q.tipo === filters.tipo);
  }
  if (filters.favoritesOnly) {
    results = results.filter((q) => q.progress.isFavorite);
  }
  if (filters.withImageOnly) {
    results = results.filter((q) => Boolean(q.imagem || q.managedImageUrl));
  }
  if (filters.topicId && filters.topicId !== 'all') {
    results = results.filter((q) => q.progress.topicId === filters.topicId);
  }
  if (filters.status && filters.status !== 'all') {
    switch (filters.status) {
      case 'answered':
        results = results.filter((q) => q.progress.attemptsCount > 0);
        break;
      case 'unanswered':
        results = results.filter((q) => q.progress.attemptsCount === 0);
        break;
      case 'correct':
        results = results.filter((q) => q.progress.lastIsCorrect === true);
        break;
      case 'incorrect':
        results = results.filter((q) => q.progress.lastIsCorrect === false);
        break;
      case 'error_review':
        results = results.filter((q) => q.progress.needsErrorReview);
        break;
    }
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim().toLowerCase();
    results = results.filter((q) => {
      const altText = Object.values(q.alternativas).join(' ').toLowerCase();
      return (
        q.enunciado.toLowerCase().includes(term) ||
        q.codigo.toLowerCase().includes(term) ||
        String(q.numero) === term ||
        `#${q.numero}` === term ||
        altText.includes(term) ||
        q.explicacao.toLowerCase().includes(term)
      );
    });
  }

  return results;
}

export function getQuestionDetail(codigo: string): {
  question: QuestionWithProgress;
  notes: NoteRecord[];
  attempts: AttemptRecord[];
  aiExplanation: AIExplanationRecord | null;
} | null {
  ensureInitialBankImported();
  const all = listQuestionsWithProgress();
  const question = all.find((q) => q.codigo === codigo);
  if (!question) return null;

  const db = getDb();
  const noteRows = db
    .prepare(
      `SELECT id, question_codigo, content, created_at, updated_at
       FROM notes WHERE question_codigo = ? ORDER BY updated_at DESC`
    )
    .all(codigo) as Array<{
    id: number;
    question_codigo: string;
    content: string;
    created_at: string;
    updated_at: string;
  }>;

  const attemptRows = db
    .prepare(
      `SELECT id, question_codigo, mode, exam_session_id, selected_answers_json, is_correct, time_spent_ms, created_at
       FROM attempts WHERE question_codigo = ? ORDER BY id DESC LIMIT 30`
    )
    .all(codigo) as Array<{
    id: number;
    question_codigo: string;
    mode: 'study' | 'exam' | 'review';
    exam_session_id: string | null;
    selected_answers_json: string;
    is_correct: number;
    time_spent_ms: number;
    created_at: string;
  }>;

  const aiRow = db
    .prepare(
      `SELECT id, question_codigo, provider, concept_summary, distractors_analysis, memory_tip, practical_example, created_at
       FROM ai_explanations WHERE question_codigo = ? ORDER BY id DESC LIMIT 1`
    )
    .get(codigo) as
    | {
        id: number;
        question_codigo: string;
        provider: string;
        concept_summary: string;
        distractors_analysis: string;
        memory_tip: string;
        practical_example: string;
        created_at: string;
      }
    | undefined;

  return {
    question,
    notes: noteRows.map((n) => ({
      id: n.id,
      questionCodigo: n.question_codigo,
      content: n.content,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    })),
    attempts: attemptRows.map((a) => ({
      id: a.id,
      questionCodigo: a.question_codigo,
      mode: a.mode,
      examSessionId: a.exam_session_id,
      selectedAnswers: JSON.parse(a.selected_answers_json) as string[],
      isCorrect: a.is_correct === 1,
      timeSpentMs: a.time_spent_ms,
      createdAt: a.created_at,
    })),
    aiExplanation: aiRow
      ? {
          id: aiRow.id,
          questionCodigo: aiRow.question_codigo,
          provider: aiRow.provider,
          conceptSummary: aiRow.concept_summary,
          distractorsAnalysis: aiRow.distractors_analysis,
          memoryTip: aiRow.memory_tip,
          practicalExample: aiRow.practical_example,
          createdAt: aiRow.created_at,
        }
      : null,
  };
}

export function recordStudyAttempt(params: {
  questionCodigo: string;
  selectedAnswers: string[];
  mode?: 'study' | 'review';
  timeSpentMs?: number;
  difficulty?: DifficultyRating;
}): {
  attempt: AttemptRecord;
  isCorrect: boolean;
  correctAnswers: string[];
  originalExplanation: string;
  spacedRepetition: SpacedRepetitionRecord;
} {
  ensureInitialBankImported();
  const db = getDb();
  const qRow = db
    .prepare(`SELECT resposta_correta_json, explicacao FROM questions_source WHERE codigo = ?`)
    .get(params.questionCodigo) as
    | { resposta_correta_json: string; explicacao: string }
    | undefined;

  if (!qRow) {
    throw new Error(`Questão ${params.questionCodigo} não encontrada.`);
  }

  const correctRaw = JSON.parse(qRow.resposta_correta_json) as string | string[];
  const evalResult = evaluateAnswer(params.selectedAnswers, correctRaw);
  const now = new Date().toISOString();
  const mode = params.mode ?? 'study';
  const timeSpentMs = Math.max(0, Math.round(params.timeSpentMs ?? 0));

  const res = db
    .prepare(
      `INSERT INTO attempts (question_codigo, mode, exam_session_id, selected_answers_json, is_correct, time_spent_ms, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`
    )
    .run(
      params.questionCodigo,
      mode,
      JSON.stringify(evalResult.normalizedSelected),
      evalResult.isCorrect ? 1 : 0,
      timeSpentMs,
      now
    );

  // Atualiza revisão espaçada e streak de revisão de erros
  const prevSr = db
    .prepare(`SELECT * FROM spaced_repetition WHERE question_codigo = ?`)
    .get(params.questionCodigo) as
    | {
        difficulty: DifficultyRating;
        ease_factor: number;
        interval_days: number;
        repetitions: number;
        consecutive_correct: number;
      }
    | undefined;

  const effectiveDifficulty: DifficultyRating =
    params.difficulty ?? (evalResult.isCorrect ? prevSr?.difficulty ?? 3 : 4);

  const nextSr = computeNextSpacedReview({
    isCorrect: evalResult.isCorrect,
    difficulty: effectiveDifficulty,
    previousEaseFactor: prevSr?.ease_factor,
    previousIntervalDays: prevSr?.interval_days,
    previousRepetitions: prevSr?.repetitions,
    previousConsecutiveCorrect: prevSr?.consecutive_correct,
  });

  db.prepare(
    `INSERT INTO spaced_repetition (
       question_codigo, difficulty, ease_factor, interval_days, repetitions,
       consecutive_correct, last_reviewed_at, next_review_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(question_codigo) DO UPDATE SET
       difficulty = excluded.difficulty,
       ease_factor = excluded.ease_factor,
       interval_days = excluded.interval_days,
       repetitions = excluded.repetitions,
       consecutive_correct = excluded.consecutive_correct,
       last_reviewed_at = excluded.last_reviewed_at,
       next_review_at = excluded.next_review_at`
  ).run(
    params.questionCodigo,
    effectiveDifficulty,
    nextSr.easeFactor,
    nextSr.intervalDays,
    nextSr.repetitions,
    nextSr.consecutiveCorrect,
    now,
    nextSr.nextReviewAt
  );

  return {
    attempt: {
      id: Number(res.lastInsertRowid),
      questionCodigo: params.questionCodigo,
      mode,
      examSessionId: null,
      selectedAnswers: evalResult.normalizedSelected,
      isCorrect: evalResult.isCorrect,
      timeSpentMs,
      createdAt: now,
    },
    isCorrect: evalResult.isCorrect,
    correctAnswers: evalResult.normalizedCorrect,
    originalExplanation: qRow.explicacao,
    spacedRepetition: {
      questionCodigo: params.questionCodigo,
      difficulty: effectiveDifficulty,
      easeFactor: nextSr.easeFactor,
      intervalDays: nextSr.intervalDays,
      repetitions: nextSr.repetitions,
      consecutiveCorrect: nextSr.consecutiveCorrect,
      lastReviewedAt: now,
      nextReviewAt: nextSr.nextReviewAt,
    },
  };
}

export function updateSpacedDifficulty(
  questionCodigo: string,
  difficulty: DifficultyRating
): SpacedRepetitionRecord {
  const db = getDb();
  const prevSr = db
    .prepare(`SELECT * FROM spaced_repetition WHERE question_codigo = ?`)
    .get(questionCodigo) as
    | {
        ease_factor: number;
        interval_days: number;
        repetitions: number;
        consecutive_correct: number;
      }
    | undefined;

  const lastAttempt = db
    .prepare(`SELECT is_correct FROM attempts WHERE question_codigo = ? ORDER BY id DESC LIMIT 1`)
    .get(questionCodigo) as { is_correct: number } | undefined;

  const isCorrect = lastAttempt ? lastAttempt.is_correct === 1 : true;
  const nextSr = computeNextSpacedReview({
    isCorrect,
    difficulty,
    previousEaseFactor: prevSr?.ease_factor,
    previousIntervalDays: prevSr?.interval_days,
    previousRepetitions: prevSr?.repetitions,
    previousConsecutiveCorrect: prevSr?.consecutive_correct,
  });
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO spaced_repetition (
       question_codigo, difficulty, ease_factor, interval_days, repetitions,
       consecutive_correct, last_reviewed_at, next_review_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(question_codigo) DO UPDATE SET
       difficulty = excluded.difficulty,
       ease_factor = excluded.ease_factor,
       interval_days = excluded.interval_days,
       repetitions = excluded.repetitions,
       last_reviewed_at = excluded.last_reviewed_at,
       next_review_at = excluded.next_review_at`
  ).run(
    questionCodigo,
    difficulty,
    nextSr.easeFactor,
    nextSr.intervalDays,
    nextSr.repetitions,
    prevSr?.consecutive_correct ?? nextSr.consecutiveCorrect,
    now,
    nextSr.nextReviewAt
  );

  return {
    questionCodigo,
    difficulty,
    easeFactor: nextSr.easeFactor,
    intervalDays: nextSr.intervalDays,
    repetitions: nextSr.repetitions,
    consecutiveCorrect: prevSr?.consecutive_correct ?? nextSr.consecutiveCorrect,
    lastReviewedAt: now,
    nextReviewAt: nextSr.nextReviewAt,
  };
}

export function toggleFavorite(questionCodigo: string): boolean {
  const db = getDb();
  const existing = db
    .prepare(`SELECT question_codigo FROM favorites WHERE question_codigo = ?`)
    .get(questionCodigo);

  if (existing) {
    db.prepare(`DELETE FROM favorites WHERE question_codigo = ?`).run(questionCodigo);
    return false;
  }
  db.prepare(`INSERT INTO favorites (question_codigo, created_at) VALUES (?, ?)`).run(
    questionCodigo,
    new Date().toISOString()
  );
  return true;
}

export function createNote(questionCodigo: string, content: string): NoteRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO notes (question_codigo, content, created_at, updated_at) VALUES (?, ?, ?, ?)`
    )
    .run(questionCodigo, content.trim(), now, now);

  return {
    id: Number(res.lastInsertRowid),
    questionCodigo,
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateNote(noteId: number, content: string): NoteRecord | null {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`UPDATE notes SET content = ?, updated_at = ? WHERE id = ?`).run(
    content.trim(),
    now,
    noteId
  );
  const row = db
    .prepare(`SELECT id, question_codigo, content, created_at, updated_at FROM notes WHERE id = ?`)
    .get(noteId) as
    | { id: number; question_codigo: string; content: string; created_at: string; updated_at: string }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    questionCodigo: row.question_codigo,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deleteNote(noteId: number): boolean {
  const db = getDb();
  const res = db.prepare(`DELETE FROM notes WHERE id = ?`).run(noteId);
  return Number(res.changes) > 0;
}

export function assignQuestionTopic(questionCodigo: string, topicId: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO question_topics (question_codigo, topic_id, is_manual, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(question_codigo) DO UPDATE SET
       topic_id = excluded.topic_id,
       is_manual = 1,
       updated_at = excluded.updated_at`
  ).run(questionCodigo, topicId, new Date().toISOString());
}

export function upsertQuestionAdminOverride(params: {
  questionCodigo: string;
  minSelections?: number | null;
  maxSelections?: number | null;
  overrideImageUrl?: string | null;
}): void {
  const db = getDb();
  const existing = db
    .prepare(`SELECT * FROM question_admin_overrides WHERE question_codigo = ?`)
    .get(params.questionCodigo) as
    | {
        min_selections: number | null;
        max_selections: number | null;
        override_image_url: string | null;
      }
    | undefined;

  const minSel =
    params.minSelections !== undefined ? params.minSelections : existing?.min_selections ?? null;
  const maxSel =
    params.maxSelections !== undefined ? params.maxSelections : existing?.max_selections ?? null;
  const imgUrl =
    params.overrideImageUrl !== undefined
      ? params.overrideImageUrl
      : existing?.override_image_url ?? null;

  db.prepare(
    `INSERT INTO question_admin_overrides (question_codigo, min_selections, max_selections, override_image_url, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(question_codigo) DO UPDATE SET
       min_selections = excluded.min_selections,
       max_selections = excluded.max_selections,
       override_image_url = excluded.override_image_url,
       updated_at = excluded.updated_at`
  ).run(params.questionCodigo, minSel, maxSel, imgUrl, new Date().toISOString());
}

/**
 * Exporta o JSON original preservando integralmente os 10 campos e o formato original
 * de resposta_correta (string ou array).
 */
export function exportOriginalQuestionsJson(): RawQuestion[] {
  ensureInitialBankImported();
  const db = getDb();
  const rows = db
    .prepare(`SELECT raw_json FROM questions_source ORDER BY numero ASC`)
    .all() as Array<{ raw_json: string }>;

  return rows.map((r) => JSON.parse(r.raw_json) as RawQuestion);
}

/**
 * Exporta exclusivamente os dados da Camada 2 (histórico de estudos).
 */
export function exportLearningHistory() {
  const db = getDb();
  return {
    exportedAt: new Date().toISOString(),
    attempts: db.prepare(`SELECT * FROM attempts ORDER BY id ASC`).all(),
    favorites: db.prepare(`SELECT * FROM favorites ORDER BY created_at ASC`).all(),
    notes: db.prepare(`SELECT * FROM notes ORDER BY id ASC`).all(),
    spacedRepetition: db.prepare(`SELECT * FROM spaced_repetition`).all(),
    questionTopics: db.prepare(`SELECT * FROM question_topics`).all(),
    examSessions: db.prepare(`SELECT * FROM exam_sessions ORDER BY started_at ASC`).all(),
    examSessionItems: db.prepare(`SELECT * FROM exam_session_items ORDER BY id ASC`).all(),
    settings: getAppSettings(),
  };
}
