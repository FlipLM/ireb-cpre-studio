import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_APP_SETTINGS } from '@/lib/db';
import { computeMasteryLevel, computeNextSpacedReview, evaluateAnswer } from '@/lib/evaluation';
import { generateWithFreeCascade, isAnyFreeAIConfigured } from '@/lib/ai-provider';
import { DEFAULT_QUESTION_TOPIC_MAP, DEFAULT_TOPICS } from '@/lib/taxonomy';
import { normalizeAnswerSet } from '@/lib/evaluation';
import type {
  AIExplanationRecord,
  AppSettings,
  AttemptRecord,
  DifficultyRating,
  ExamConfig,
  ExamSession,
  ExamSessionDetail,
  ExamSessionItem,
  NoteRecord,
  QuestionType,
  QuestionWithProgress,
  RawQuestion,
  SourceQuestion,
  SpacedRepetitionRecord,
  StudyRecommendation,
  Topic,
  TopicPerformance,
} from '@/types/domain';

let cachedSourceQuestions: SourceQuestion[] | null = null;
let cachedRawQuestions: RawQuestion[] | null = null;

function resolveStaticImageUrl(codigo: string, imagem: string | null): {
  managedImageUrl: string | null;
  imageMissing: boolean;
} {
  if (!imagem) return { managedImageUrl: null, imageMissing: false };
  const mediaDir = path.join(process.cwd(), 'public', 'media', 'questoes');
  const ext = path.extname(imagem) || '.png';
  const byCode = `${codigo}${ext}`;
  if (fs.existsSync(path.join(mediaDir, byCode))) {
    return { managedImageUrl: `/media/questoes/${encodeURIComponent(byCode)}`, imageMissing: false };
  }
  const byBase = path.basename(imagem);
  if (fs.existsSync(path.join(mediaDir, byBase))) {
    return { managedImageUrl: `/media/questoes/${encodeURIComponent(byBase)}`, imageMissing: false };
  }
  return { managedImageUrl: null, imageMissing: true };
}

export function loadStaticRawQuestions(): RawQuestion[] {
  if (cachedRawQuestions) return cachedRawQuestions;
  const filePath = path.join(process.cwd(), 'data', 'source', 'questoes.json');
  const rawText = fs.readFileSync(filePath, 'utf8');
  cachedRawQuestions = JSON.parse(rawText) as RawQuestion[];
  return cachedRawQuestions;
}

export function loadStaticSourceQuestions(): SourceQuestion[] {
  if (cachedSourceQuestions) return cachedSourceQuestions;
  const raw = loadStaticRawQuestions();
  cachedSourceQuestions = raw.map((q) => {
    const img = resolveStaticImageUrl(q.codigo, q.imagem);
    return {
      ...q,
      managedImageUrl: img.managedImageUrl,
      imageMissing: img.imageMissing,
      adminMinSelections: null,
      adminMaxSelections: null,
    };
  });
  return cachedSourceQuestions;
}

export function getStaticTopics(): Topic[] {
  return DEFAULT_TOPICS;
}

export async function cloudGetAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase.from('user_settings').select('settings').maybeSingle();
  if (!data?.settings) return DEFAULT_APP_SETTINGS;
  return {
    ...DEFAULT_APP_SETTINGS,
    ...(data.settings as Partial<AppSettings>),
  };
}

export async function cloudUpdateAppSettings(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  const current = await cloudGetAppSettings(supabase);
  const merged: AppSettings = { ...current, ...patch };
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    settings: merged,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return merged;
}

export interface CloudQuestionFilterParams {
  search?: string;
  tipo?: QuestionType | 'all';
  status?: 'all' | 'answered' | 'unanswered' | 'correct' | 'incorrect' | 'error_review';
  favoritesOnly?: boolean;
  withImageOnly?: boolean;
  topicId?: string;
}

export async function cloudListQuestionsWithProgress(
  supabase: SupabaseClient,
  filters: CloudQuestionFilterParams = {}
): Promise<QuestionWithProgress[]> {
  const sourceQuestions = loadStaticSourceQuestions();
  const topicNameById = new Map(DEFAULT_TOPICS.map((t) => [t.id, t.name]));

  const [settings, attemptsRes, favsRes, notesRes, srRes, topicsRes] = await Promise.all([
    cloudGetAppSettings(supabase),
    supabase
      .from('user_attempts')
      .select('id, question_codigo, selected_answers, is_correct, time_spent_ms, created_at')
      .order('id', { ascending: true }),
    supabase.from('user_favorites').select('question_codigo'),
    supabase.from('user_notes').select('question_codigo'),
    supabase.from('user_spaced_repetition').select('*'),
    supabase.from('user_question_topics').select('question_codigo, topic_id'),
  ]);

  const attempts = (attemptsRes.data ?? []) as Array<{
    id: number;
    question_codigo: string;
    selected_answers: string[];
    is_correct: boolean;
    time_spent_ms: number;
    created_at: string;
  }>;

  const statsMap = new Map<
    string,
    {
      attemptsCount: number;
      correctCount: number;
      wrongCount: number;
      timeSum: number;
      timedCount: number;
      lastAttemptAt: string | null;
      lastSelectedAnswers: string[] | null;
      lastIsCorrect: boolean | null;
    }
  >();

  for (const a of attempts) {
    const cur = statsMap.get(a.question_codigo) ?? {
      attemptsCount: 0,
      correctCount: 0,
      wrongCount: 0,
      timeSum: 0,
      timedCount: 0,
      lastAttemptAt: null,
      lastSelectedAnswers: null,
      lastIsCorrect: null,
    };
    cur.attemptsCount += 1;
    if (a.is_correct) cur.correctCount += 1;
    else cur.wrongCount += 1;
    if (a.time_spent_ms > 0) {
      cur.timeSum += a.time_spent_ms;
      cur.timedCount += 1;
    }
    cur.lastAttemptAt = a.created_at;
    cur.lastSelectedAnswers = Array.isArray(a.selected_answers) ? a.selected_answers : [];
    cur.lastIsCorrect = Boolean(a.is_correct);
    statsMap.set(a.question_codigo, cur);
  }

  const favSet = new Set(
    (favsRes.data ?? []).map((r: { question_codigo: string }) => r.question_codigo)
  );

  const notesCountMap = new Map<string, number>();
  for (const n of (notesRes.data ?? []) as Array<{ question_codigo: string }>) {
    notesCountMap.set(n.question_codigo, (notesCountMap.get(n.question_codigo) ?? 0) + 1);
  }

  const srMap = new Map<string, SpacedRepetitionRecord>();
  for (const r of (srRes.data ?? []) as Array<{
    question_codigo: string;
    difficulty: DifficultyRating;
    ease_factor: number;
    interval_days: number;
    repetitions: number;
    consecutive_correct: number;
    last_reviewed_at: string | null;
    next_review_at: string | null;
  }>) {
    srMap.set(r.question_codigo, {
      questionCodigo: r.question_codigo,
      difficulty: r.difficulty,
      easeFactor: r.ease_factor,
      intervalDays: r.interval_days,
      repetitions: r.repetitions,
      consecutiveCorrect: r.consecutive_correct,
      lastReviewedAt: r.last_reviewed_at,
      nextReviewAt: r.next_review_at,
    });
  }

  const customTopicMap = new Map<string, string>();
  for (const t of (topicsRes.data ?? []) as Array<{ question_codigo: string; topic_id: string }>) {
    customTopicMap.set(t.question_codigo, t.topic_id);
  }

  let results: QuestionWithProgress[] = sourceQuestions.map((base) => {
    const stat = statsMap.get(base.codigo);
    const sr = srMap.get(base.codigo) ?? null;
    const topicId =
      customTopicMap.get(base.codigo) ?? DEFAULT_QUESTION_TOPIC_MAP[base.codigo] ?? null;
    const topicName = topicId ? topicNameById.get(topicId) ?? null : null;

    const wrongCount = stat?.wrongCount ?? 0;
    const consecutiveCorrect = sr?.consecutiveCorrect ?? (stat?.lastIsCorrect ? 1 : 0);
    const needsErrorReview =
      wrongCount > 0 && consecutiveCorrect < settings.errorReviewRequiredStreak;

    return {
      ...base,
      progress: {
        attemptsCount: stat?.attemptsCount ?? 0,
        correctCount: stat?.correctCount ?? 0,
        wrongCount,
        lastAttemptAt: stat?.lastAttemptAt ?? null,
        lastSelectedAnswers: stat?.lastSelectedAnswers ?? null,
        lastIsCorrect: stat?.lastIsCorrect ?? null,
        avgTimeMs: stat && stat.timedCount > 0 ? Math.round(stat.timeSum / stat.timedCount) : null,
        isFavorite: favSet.has(base.codigo),
        notesCount: notesCountMap.get(base.codigo) ?? 0,
        needsErrorReview,
        spacedRepetition: sr,
        topicId,
        topicName,
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

export async function cloudGetQuestionDetail(supabase: SupabaseClient, codigo: string): Promise<{
  question: QuestionWithProgress;
  notes: NoteRecord[];
  attempts: AttemptRecord[];
  aiExplanation: AIExplanationRecord | null;
} | null> {
  const all = await cloudListQuestionsWithProgress(supabase);
  const question = all.find((q) => q.codigo === codigo);
  if (!question) return null;

  const [notesRes, attemptsRes, aiRes] = await Promise.all([
    supabase
      .from('user_notes')
      .select('id, question_codigo, content, created_at, updated_at')
      .eq('question_codigo', codigo)
      .order('updated_at', { ascending: false }),
    supabase
      .from('user_attempts')
      .select('id, question_codigo, mode, exam_session_id, selected_answers, is_correct, time_spent_ms, created_at')
      .eq('question_codigo', codigo)
      .order('id', { ascending: false })
      .limit(30),
    supabase
      .from('user_ai_explanations')
      .select('*')
      .eq('question_codigo', codigo)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const notes: NoteRecord[] = (notesRes.data ?? []).map((n) => ({
    id: Number(n.id),
    questionCodigo: String(n.question_codigo),
    content: String(n.content),
    createdAt: String(n.created_at),
    updatedAt: String(n.updated_at),
  }));

  const attempts: AttemptRecord[] = (attemptsRes.data ?? []).map((a) => ({
    id: Number(a.id),
    questionCodigo: String(a.question_codigo),
    mode: a.mode as 'study' | 'exam' | 'review',
    examSessionId: a.exam_session_id ? String(a.exam_session_id) : null,
    selectedAnswers: Array.isArray(a.selected_answers) ? (a.selected_answers as string[]) : [],
    isCorrect: Boolean(a.is_correct),
    timeSpentMs: Number(a.time_spent_ms ?? 0),
    createdAt: String(a.created_at),
  }));

  const aiRow = aiRes.data;
  const aiExplanation: AIExplanationRecord | null = aiRow
    ? {
        id: Number(aiRow.id),
        questionCodigo: String(aiRow.question_codigo),
        provider: String(aiRow.provider),
        conceptSummary: String(aiRow.concept_summary),
        distractorsAnalysis: String(aiRow.distractors_analysis),
        memoryTip: String(aiRow.memory_tip),
        practicalExample: String(aiRow.practical_example),
        createdAt: String(aiRow.created_at),
      }
    : null;

  return { question, notes, attempts, aiExplanation };
}

export async function cloudRecordStudyAttempt(
  supabase: SupabaseClient,
  userId: string,
  params: {
    questionCodigo: string;
    selectedAnswers: string[];
    mode?: 'study' | 'review';
    timeSpentMs?: number;
    difficulty?: DifficultyRating;
  }
) {
  const source = loadStaticSourceQuestions().find((q) => q.codigo === params.questionCodigo);
  if (!source) throw new Error(`Questão ${params.questionCodigo} não encontrada.`);

  const evalResult = evaluateAnswer(params.selectedAnswers, source.resposta_correta);
  const now = new Date().toISOString();
  const mode = params.mode ?? 'study';
  const timeSpentMs = Math.max(0, Math.round(params.timeSpentMs ?? 0));

  const { data: insertedAttempt, error: attemptErr } = await supabase
    .from('user_attempts')
    .insert({
      user_id: userId,
      question_codigo: params.questionCodigo,
      mode,
      exam_session_id: null,
      selected_answers: evalResult.normalizedSelected,
      is_correct: evalResult.isCorrect,
      time_spent_ms: timeSpentMs,
      created_at: now,
    })
    .select('id')
    .single();

  if (attemptErr) throw new Error(attemptErr.message);

  const { data: prevSr } = await supabase
    .from('user_spaced_repetition')
    .select('*')
    .eq('question_codigo', params.questionCodigo)
    .maybeSingle();

  const effectiveDifficulty: DifficultyRating =
    params.difficulty ?? (evalResult.isCorrect ? (prevSr?.difficulty as DifficultyRating) ?? 3 : 4);

  const nextSr = computeNextSpacedReview({
    isCorrect: evalResult.isCorrect,
    difficulty: effectiveDifficulty,
    previousEaseFactor: prevSr?.ease_factor,
    previousIntervalDays: prevSr?.interval_days,
    previousRepetitions: prevSr?.repetitions,
    previousConsecutiveCorrect: prevSr?.consecutive_correct,
  });

  await supabase.from('user_spaced_repetition').upsert({
    user_id: userId,
    question_codigo: params.questionCodigo,
    difficulty: effectiveDifficulty,
    ease_factor: nextSr.easeFactor,
    interval_days: nextSr.intervalDays,
    repetitions: nextSr.repetitions,
    consecutive_correct: nextSr.consecutiveCorrect,
    last_reviewed_at: now,
    next_review_at: nextSr.nextReviewAt,
  });

  return {
    attempt: {
      id: Number(insertedAttempt.id),
      questionCodigo: params.questionCodigo,
      mode,
      examSessionId: null,
      selectedAnswers: evalResult.normalizedSelected,
      isCorrect: evalResult.isCorrect,
      timeSpentMs,
      createdAt: now,
    } satisfies AttemptRecord,
    isCorrect: evalResult.isCorrect,
    correctAnswers: evalResult.normalizedCorrect,
    originalExplanation: source.explicacao,
    spacedRepetition: {
      questionCodigo: params.questionCodigo,
      difficulty: effectiveDifficulty,
      easeFactor: nextSr.easeFactor,
      intervalDays: nextSr.intervalDays,
      repetitions: nextSr.repetitions,
      consecutiveCorrect: nextSr.consecutiveCorrect,
      lastReviewedAt: now,
      nextReviewAt: nextSr.nextReviewAt,
    } satisfies SpacedRepetitionRecord,
  };
}

export async function cloudUpdateSpacedDifficulty(
  supabase: SupabaseClient,
  userId: string,
  questionCodigo: string,
  difficulty: DifficultyRating
): Promise<SpacedRepetitionRecord> {
  const [{ data: prevSr }, { data: lastAttempt }] = await Promise.all([
    supabase
      .from('user_spaced_repetition')
      .select('*')
      .eq('question_codigo', questionCodigo)
      .maybeSingle(),
    supabase
      .from('user_attempts')
      .select('is_correct')
      .eq('question_codigo', questionCodigo)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const isCorrect = lastAttempt ? Boolean(lastAttempt.is_correct) : true;
  const nextSr = computeNextSpacedReview({
    isCorrect,
    difficulty,
    previousEaseFactor: prevSr?.ease_factor,
    previousIntervalDays: prevSr?.interval_days,
    previousRepetitions: prevSr?.repetitions,
    previousConsecutiveCorrect: prevSr?.consecutive_correct,
  });
  const now = new Date().toISOString();
  const consecutiveCorrect = prevSr?.consecutive_correct ?? nextSr.consecutiveCorrect;

  await supabase.from('user_spaced_repetition').upsert({
    user_id: userId,
    question_codigo: questionCodigo,
    difficulty,
    ease_factor: nextSr.easeFactor,
    interval_days: nextSr.intervalDays,
    repetitions: nextSr.repetitions,
    consecutive_correct: consecutiveCorrect,
    last_reviewed_at: now,
    next_review_at: nextSr.nextReviewAt,
  });

  return {
    questionCodigo,
    difficulty,
    easeFactor: nextSr.easeFactor,
    intervalDays: nextSr.intervalDays,
    repetitions: nextSr.repetitions,
    consecutiveCorrect,
    lastReviewedAt: now,
    nextReviewAt: nextSr.nextReviewAt,
  };
}

export async function cloudToggleFavorite(
  supabase: SupabaseClient,
  userId: string,
  questionCodigo: string
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('user_favorites')
    .select('question_codigo')
    .eq('question_codigo', questionCodigo)
    .maybeSingle();

  if (existing) {
    await supabase.from('user_favorites').delete().eq('question_codigo', questionCodigo);
    return false;
  }

  await supabase.from('user_favorites').insert({
    user_id: userId,
    question_codigo: questionCodigo,
    created_at: new Date().toISOString(),
  });
  return true;
}

export async function cloudCreateNote(
  supabase: SupabaseClient,
  userId: string,
  questionCodigo: string,
  content: string
): Promise<NoteRecord> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_notes')
    .insert({
      user_id: userId,
      question_codigo: questionCodigo,
      content: content.trim(),
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return {
    id: Number(data.id),
    questionCodigo: String(data.question_codigo),
    content: String(data.content),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

export async function cloudUpdateNote(
  supabase: SupabaseClient,
  noteId: number,
  content: string
): Promise<NoteRecord | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('user_notes')
    .update({ content: content.trim(), updated_at: now })
    .eq('id', noteId)
    .select('*')
    .maybeSingle();
  if (!data) return null;
  return {
    id: Number(data.id),
    questionCodigo: String(data.question_codigo),
    content: String(data.content),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

export async function cloudDeleteNote(supabase: SupabaseClient, noteId: number): Promise<boolean> {
  const { error } = await supabase.from('user_notes').delete().eq('id', noteId);
  return !error;
}

export async function cloudAssignQuestionTopic(
  supabase: SupabaseClient,
  userId: string,
  questionCodigo: string,
  topicId: string
): Promise<void> {
  await supabase.from('user_question_topics').upsert({
    user_id: userId,
    question_codigo: questionCodigo,
    topic_id: topicId,
    updated_at: new Date().toISOString(),
  });
}

// =====================================================================
// EXAMS (SIMULADOS)
// =====================================================================
function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function cloudListExamSessions(supabase: SupabaseClient): Promise<ExamSession[]> {
  const { data } = await supabase
    .from('user_exam_sessions')
    .select('*')
    .order('started_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    status: r.status as 'in_progress' | 'completed' | 'abandoned',
    config: r.config as ExamConfig,
    totalQuestions: Number(r.total_questions),
    answeredCount: Number(r.answered_count),
    correctCount: Number(r.correct_count),
    wrongCount: Number(r.wrong_count),
    unansweredCount: Number(r.unanswered_count),
    scorePercent: Number(r.score_percent),
    durationSeconds: Number(r.duration_seconds),
    startedAt: String(r.started_at),
    finishedAt: r.finished_at ? String(r.finished_at) : null,
    currentIndex: Number(r.current_index),
  }));
}

export async function cloudGetExamSessionDetail(
  supabase: SupabaseClient,
  examId: string,
  options: { hideAnswersIfInProgress?: boolean } = {}
): Promise<ExamSessionDetail | null> {
  const { data: row } = await supabase
    .from('user_exam_sessions')
    .select('*')
    .eq('id', examId)
    .maybeSingle();
  if (!row) return null;

  const { data: itemRows } = await supabase
    .from('user_exam_session_items')
    .select('*')
    .eq('exam_session_id', examId)
    .order('position', { ascending: true });

  const questionMap = new Map(loadStaticSourceQuestions().map((q) => [q.codigo, q]));
  const shouldHide = Boolean(options.hideAnswersIfInProgress && row.status === 'in_progress');

  const items: (ExamSessionItem & { question: SourceQuestion })[] = (itemRows ?? [])
    .map((r) => {
      const q = questionMap.get(String(r.question_codigo));
      if (!q) return null;
      const safeQuestion: SourceQuestion = shouldHide
        ? { ...q, resposta_correta: q.tipo === 'multipla' ? [] : '', explicacao: '' }
        : q;
      return {
        id: Number(r.id),
        examSessionId: String(r.exam_session_id),
        position: Number(r.position),
        questionCodigo: String(r.question_codigo),
        selectedAnswers: Array.isArray(r.selected_answers) ? (r.selected_answers as string[]) : [],
        markedForReview: Boolean(r.marked_for_review),
        isCorrect: shouldHide ? null : r.is_correct === null ? null : Boolean(r.is_correct),
        timeSpentMs: Number(r.time_spent_ms ?? 0),
        question: safeQuestion,
      };
    })
    .filter((x): x is ExamSessionItem & { question: SourceQuestion } => x !== null);

  return {
    id: String(row.id),
    title: String(row.title),
    status: row.status as 'in_progress' | 'completed' | 'abandoned',
    config: row.config as ExamConfig,
    totalQuestions: Number(row.total_questions),
    answeredCount: Number(row.answered_count),
    correctCount: Number(row.correct_count),
    wrongCount: Number(row.wrong_count),
    unansweredCount: Number(row.unanswered_count),
    scorePercent: Number(row.score_percent),
    durationSeconds: Number(row.duration_seconds),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    currentIndex: Number(row.current_index),
    items,
  };
}

export async function cloudCreateExamSession(
  supabase: SupabaseClient,
  userId: string,
  config: ExamConfig
): Promise<ExamSessionDetail> {
  const allQuestions = await cloudListQuestionsWithProgress(supabase);

  let pool = allQuestions.filter((q) => {
    if (q.tipo === 'unica' && !config.includeUnica) return false;
    if (q.tipo === 'multipla' && !config.includeMultipla) return false;
    if (!config.reuseAnswered && q.progress.attemptsCount > 0) return false;
    if (config.onlyFavorites && !q.progress.isFavorite) return false;
    if (config.topicIds && config.topicIds.length > 0) {
      if (!q.progress.topicId || !config.topicIds.includes(q.progress.topicId)) return false;
    }
    return true;
  });

  if (pool.length === 0) {
    throw new Error(
      'Nenhuma questão atende aos critérios selecionados para este simulado. Ajuste os filtros.'
    );
  }

  pool =
    config.selectionMode === 'random'
      ? shuffleArray(pool)
      : [...pool].sort((a, b) => a.numero - b.numero);

  const targetCount = Math.min(Math.max(1, config.questionCount), pool.length);
  const selectedQuestions = pool.slice(0, targetCount);
  const now = new Date().toISOString();
  const title =
    config.title?.trim() ||
    `Simulado IREB (${targetCount} ${targetCount === 1 ? 'questão' : 'questões'})`;

  const { data: sessionRow, error: sessionErr } = await supabase
    .from('user_exam_sessions')
    .insert({
      user_id: userId,
      title,
      status: 'in_progress',
      config,
      total_questions: targetCount,
      answered_count: 0,
      correct_count: 0,
      wrong_count: 0,
      unanswered_count: targetCount,
      score_percent: 0,
      duration_seconds: 0,
      started_at: now,
      finished_at: null,
      current_index: 0,
    })
    .select('id')
    .single();

  if (sessionErr || !sessionRow) throw new Error(sessionErr?.message || 'Erro ao criar simulado.');

  const itemsToInsert = selectedQuestions.map((q, idx) => ({
    user_id: userId,
    exam_session_id: sessionRow.id,
    position: idx + 1,
    question_codigo: q.codigo,
    selected_answers: [],
    marked_for_review: false,
    is_correct: null,
    time_spent_ms: 0,
  }));

  const { error: itemsErr } = await supabase.from('user_exam_session_items').insert(itemsToInsert);
  if (itemsErr) throw new Error(itemsErr.message);

  const detail = await cloudGetExamSessionDetail(supabase, String(sessionRow.id));
  if (!detail) throw new Error('Falha ao recuperar simulado criado.');
  return detail;
}

export async function cloudUpdateExamProgress(
  supabase: SupabaseClient,
  examId: string,
  payload: {
    questionCodigo?: string;
    selectedAnswers?: string[];
    markedForReview?: boolean;
    timeSpentMsDelta?: number;
    currentIndex?: number;
    durationSeconds?: number;
  }
): Promise<void> {
  const { data: session } = await supabase
    .from('user_exam_sessions')
    .select('status')
    .eq('id', examId)
    .maybeSingle();

  if (!session || session.status !== 'in_progress') {
    throw new Error('Simulado não está em andamento.');
  }

  if (payload.questionCodigo) {
    const patch: Record<string, unknown> = {};
    if (payload.selectedAnswers !== undefined) patch.selected_answers = payload.selectedAnswers;
    if (payload.markedForReview !== undefined) patch.marked_for_review = payload.markedForReview;
    if (payload.timeSpentMsDelta && payload.timeSpentMsDelta > 0) {
      const { data: curItem } = await supabase
        .from('user_exam_session_items')
        .select('time_spent_ms')
        .eq('exam_session_id', examId)
        .eq('question_codigo', payload.questionCodigo)
        .maybeSingle();
      patch.time_spent_ms = Number(curItem?.time_spent_ms ?? 0) + Math.round(payload.timeSpentMsDelta);
    }
    if (Object.keys(patch).length > 0) {
      await supabase
        .from('user_exam_session_items')
        .update(patch)
        .eq('exam_session_id', examId)
        .eq('question_codigo', payload.questionCodigo);
    }
  }

  const { data: allItems } = await supabase
    .from('user_exam_session_items')
    .select('selected_answers')
    .eq('exam_session_id', examId);

  const total = (allItems ?? []).length;
  const answered = (allItems ?? []).filter(
    (i) => Array.isArray(i.selected_answers) && i.selected_answers.length > 0
  ).length;

  const sessionPatch: Record<string, unknown> = {
    answered_count: answered,
    unanswered_count: total - answered,
  };
  if (payload.currentIndex !== undefined) sessionPatch.current_index = payload.currentIndex;
  if (payload.durationSeconds !== undefined) sessionPatch.duration_seconds = payload.durationSeconds;

  await supabase.from('user_exam_sessions').update(sessionPatch).eq('id', examId);
}

export async function cloudFinishExamSession(
  supabase: SupabaseClient,
  userId: string,
  examId: string,
  durationSeconds?: number
): Promise<ExamSessionDetail> {
  const { data: session } = await supabase
    .from('user_exam_sessions')
    .select('*')
    .eq('id', examId)
    .maybeSingle();
  if (!session) throw new Error('Simulado não encontrado.');

  if (session.status === 'completed') {
    const existing = await cloudGetExamSessionDetail(supabase, examId);
    if (!existing) throw new Error('Simulado não encontrado.');
    return existing;
  }

  const { data: items } = await supabase
    .from('user_exam_session_items')
    .select('*')
    .eq('exam_session_id', examId);

  const questionMap = new Map(loadStaticSourceQuestions().map((q) => [q.codigo, q]));
  const now = new Date().toISOString();

  let answeredCount = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  for (const item of items ?? []) {
    const q = questionMap.get(String(item.question_codigo));
    if (!q) continue;
    const selected = Array.isArray(item.selected_answers) ? (item.selected_answers as string[]) : [];

    if (selected.length === 0) {
      unansweredCount += 1;
      await supabase.from('user_exam_session_items').update({ is_correct: false }).eq('id', item.id);
      continue;
    }

    answeredCount += 1;
    const evalRes = evaluateAnswer(selected, q.resposta_correta);
    if (evalRes.isCorrect) correctCount += 1;
    else wrongCount += 1;

    await supabase
      .from('user_exam_session_items')
      .update({ is_correct: evalRes.isCorrect })
      .eq('id', item.id);

    await supabase.from('user_attempts').insert({
      user_id: userId,
      question_codigo: q.codigo,
      mode: 'exam',
      exam_session_id: examId,
      selected_answers: evalRes.normalizedSelected,
      is_correct: evalRes.isCorrect,
      time_spent_ms: Number(item.time_spent_ms ?? 0),
      created_at: now,
    });

    const { data: prevSr } = await supabase
      .from('user_spaced_repetition')
      .select('*')
      .eq('question_codigo', q.codigo)
      .maybeSingle();

    const nextSr = computeNextSpacedReview({
      isCorrect: evalRes.isCorrect,
      difficulty: (prevSr?.difficulty as DifficultyRating) ?? (evalRes.isCorrect ? 3 : 4),
      previousEaseFactor: prevSr?.ease_factor,
      previousIntervalDays: prevSr?.interval_days,
      previousRepetitions: prevSr?.repetitions,
      previousConsecutiveCorrect: prevSr?.consecutive_correct,
    });

    await supabase.from('user_spaced_repetition').upsert({
      user_id: userId,
      question_codigo: q.codigo,
      difficulty: (prevSr?.difficulty as DifficultyRating) ?? (evalRes.isCorrect ? 3 : 4),
      ease_factor: nextSr.easeFactor,
      interval_days: nextSr.intervalDays,
      repetitions: nextSr.repetitions,
      consecutive_correct: nextSr.consecutiveCorrect,
      last_reviewed_at: now,
      next_review_at: nextSr.nextReviewAt,
    });
  }

  const total = (items ?? []).length;
  const scorePercent = total > 0 ? Number(((correctCount / total) * 100).toFixed(1)) : 0;

  await supabase
    .from('user_exam_sessions')
    .update({
      status: 'completed',
      answered_count: answeredCount,
      correct_count: correctCount,
      wrong_count: wrongCount,
      unanswered_count: unansweredCount,
      score_percent: scorePercent,
      duration_seconds: durationSeconds ?? Number(session.duration_seconds ?? 0),
      finished_at: now,
    })
    .eq('id', examId);

  const finished = await cloudGetExamSessionDetail(supabase, examId);
  if (!finished) throw new Error('Falha ao carregar resultado do simulado.');
  return finished;
}

// =====================================================================
// ANALYTICS & DASHBOARD
// =====================================================================
function computeStudyStreak(datesIso: string[]): number {
  if (datesIso.length === 0) return 0;
  const formatDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const uniqueDays = Array.from(new Set(datesIso.map((iso) => formatDay(new Date(iso)))))
    .sort()
    .reverse();

  if (uniqueDays.length === 0) return 0;
  const today = new Date();
  const todayStr = formatDay(today);
  const yesterdayStr = formatDay(new Date(today.getTime() - 86400000));
  if (uniqueDays[0] !== todayStr && uniqueDays[0] !== yesterdayStr) return 0;

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

export async function cloudGetTopicPerformances(
  supabase: SupabaseClient,
  periodDays?: number | null
): Promise<TopicPerformance[]> {
  const [settings, questions] = await Promise.all([
    cloudGetAppSettings(supabase),
    cloudListQuestionsWithProgress(supabase),
  ]);
  const topics = getStaticTopics();

  const cutoffIso =
    periodDays && periodDays > 0
      ? new Date(Date.now() - periodDays * 86400000).toISOString()
      : null;

  let q = supabase
    .from('user_attempts')
    .select('question_codigo, is_correct, time_spent_ms, created_at')
    .order('id', { ascending: true });
  if (cutoffIso) q = q.gte('created_at', cutoffIso);
  const { data: attemptsData } = await q;

  const attempts = (attemptsData ?? []) as Array<{
    question_codigo: string;
    is_correct: boolean;
    time_spent_ms: number;
    created_at: string;
  }>;

  const questionTopicMap = new Map<string, string>();
  const topicQuestionCounts = new Map<string, number>();
  const topicErrorReviewCounts = new Map<string, number>();

  for (const item of questions) {
    if (item.progress.topicId) {
      questionTopicMap.set(item.codigo, item.progress.topicId);
      topicQuestionCounts.set(
        item.progress.topicId,
        (topicQuestionCounts.get(item.progress.topicId) ?? 0) + 1
      );
      if (item.progress.needsErrorReview) {
        topicErrorReviewCounts.set(
          item.progress.topicId,
          (topicErrorReviewCounts.get(item.progress.topicId) ?? 0) + 1
        );
      }
    }
  }

  return topics.map((topic) => {
    const topicAttempts = attempts.filter(
      (a) => questionTopicMap.get(a.question_codigo) === topic.id
    );
    const totalAttempts = topicAttempts.length;
    const correctAttempts = topicAttempts.filter((a) => a.is_correct).length;
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
              (recentSlice.filter((a) => a.is_correct).length / recentSlice.length) *
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

export async function cloudGetDashboardAnalytics(supabase: SupabaseClient) {
  const [questions, exams, topics, attemptsRes] = await Promise.all([
    cloudListQuestionsWithProgress(supabase),
    cloudListExamSessions(supabase),
    cloudGetTopicPerformances(supabase),
    supabase
      .from('user_attempts')
      .select('id, question_codigo, is_correct, time_spent_ms, created_at')
      .order('id', { ascending: true }),
  ]);

  const attempts = (attemptsRes.data ?? []) as Array<{
    id: number;
    question_codigo: string;
    is_correct: boolean;
    time_spent_ms: number;
    created_at: string;
  }>;

  const totalQuestions = questions.length;
  const answeredUnique = questions.filter((q) => q.progress.attemptsCount > 0).length;
  const unansweredUnique = totalQuestions - answeredUnique;
  const totalAttempts = attempts.length;
  const totalCorrect = attempts.filter((a) => a.is_correct).length;
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
              : `Você já respondeu todas as ${totalQuestions} questões ao menos uma vez`,
            href: nextUnanswered
              ? `/estudar?codigo=${nextUnanswered.codigo}`
              : `/estudar?codigo=${lastAttempt.question_codigo}`,
            cta: 'Continuar estudando',
          };
        })()
      : null;

  const recommendations: StudyRecommendation[] = [];
  if (errorReviewQuestions.length > 0) {
    recommendations.push({
      id: 'rec-errors',
      priority: 'high',
      category: 'errors',
      title: `${errorReviewQuestions.length} questão(ões) pendente(s) na revisão de erros`,
      description: 'Refaça as questões em que houve erro recente até atingir a sequência de acertos.',
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
      description: `Aproveitamento atual de ${worst.accuracyPercent}% em ${worst.totalAttempts} tentativas.`,
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
      description: 'O intervalo ideal de memorização venceu para essas questões.',
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

export async function cloudGetDetailedReports(
  supabase: SupabaseClient,
  periodDays?: number | null
) {
  const [questions, allExams, topics] = await Promise.all([
    cloudListQuestionsWithProgress(supabase),
    cloudListExamSessions(supabase),
    cloudGetTopicPerformances(supabase, periodDays),
  ]);
  const exams = allExams.filter((e) => e.status === 'completed');

  const cutoffIso =
    periodDays && periodDays > 0
      ? new Date(Date.now() - periodDays * 86400000).toISOString()
      : null;

  let q = supabase
    .from('user_attempts')
    .select('id, question_codigo, mode, is_correct, time_spent_ms, created_at')
    .order('created_at', { ascending: true });
  if (cutoffIso) q = q.gte('created_at', cutoffIso);
  const { data: attemptsData } = await q;

  const attempts = (attemptsData ?? []) as Array<{
    id: number;
    question_codigo: string;
    mode: string;
    is_correct: boolean;
    time_spent_ms: number;
    created_at: string;
  }>;

  const dailyMap = new Map<
    string,
    { date: string; total: number; correct: number; timeMs: number }
  >();
  for (const a of attempts) {
    const day = a.created_at.slice(0, 10);
    const cur = dailyMap.get(day) ?? { date: day, total: 0, correct: 0, timeMs: 0 };
    cur.total += 1;
    cur.correct += a.is_correct ? 1 : 0;
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

  const attemptsByQuestion = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const arr = attemptsByQuestion.get(a.question_codigo) ?? [];
    arr.push(a);
    attemptsByQuestion.set(a.question_codigo, arr);
  }

  const questionReports = questions
    .map((item) => {
      const qAttempts = attemptsByQuestion.get(item.codigo) ?? [];
      const total = qAttempts.length;
      const correct = qAttempts.filter((a) => a.is_correct).length;
      const wrong = total - correct;
      const timed = qAttempts.filter((a) => a.time_spent_ms > 0);
      const avgTimeMs =
        timed.length > 0
          ? Math.round(timed.reduce((acc, a) => acc + a.time_spent_ms, 0) / timed.length)
          : null;
      const hasImproved =
        total >= 2 && !qAttempts[0].is_correct && qAttempts[qAttempts.length - 1].is_correct;

      return {
        codigo: item.codigo,
        numero: item.numero,
        enunciado: item.enunciado,
        tipo: item.tipo,
        topicName: item.progress.topicName,
        totalAttempts: total,
        correctCount: correct,
        wrongCount: wrong,
        accuracyPercent: total > 0 ? Number(((correct / total) * 100).toFixed(1)) : null,
        avgTimeMs,
        hasImproved,
        stillStruggling: item.progress.needsErrorReview,
      };
    })
    .filter((item) => item.totalAttempts > 0);

  const filteredExams = cutoffIso
    ? exams.filter((e) => (e.finishedAt ?? e.startedAt) >= cutoffIso)
    : exams;

  const examEvolution = [...filteredExams].reverse().map((e, idx) => ({
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
  const totalCorrect = attempts.filter((a) => a.is_correct).length;

  return {
    general: {
      totalQuestions: questions.length,
      answeredUnique: questions.filter((item) => item.progress.attemptsCount > 0).length,
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
        .filter((item) => item.wrongCount > 0)
        .sort((a, b) => b.wrongCount - a.wrongCount)
        .slice(0, 10),
      slowest: [...questionReports]
        .filter((item) => item.avgTimeMs !== null)
        .sort((a, b) => (b.avgTimeMs ?? 0) - (a.avgTimeMs ?? 0))
        .slice(0, 10),
      mostAttempted: [...questionReports]
        .sort((a, b) => b.totalAttempts - a.totalAttempts)
        .slice(0, 10),
      improved: questionReports.filter((item) => item.hasImproved),
      stillStruggling: questionReports.filter((item) => item.stillStruggling),
    },
    exams: filteredExams,
  };
}

export async function cloudGenerateComplementaryExplanation(
  supabase: SupabaseClient,
  userId: string,
  questionCodigo: string,
  options: { forceRegenerate?: boolean } = {}
): Promise<AIExplanationRecord> {
  const detail = await cloudGetQuestionDetail(supabase, questionCodigo);
  if (!detail) throw new Error(`Questão ${questionCodigo} não encontrada.`);
  if (detail.aiExplanation && !options.forceRegenerate) return detail.aiExplanation;

  const q = detail.question;
  const correctKeys = normalizeAnswerSet(q.resposta_correta);
  const altEntries = Object.entries(q.alternativas);
  const correctTexts = altEntries
    .filter(([k]) => correctKeys.includes(k))
    .map(([k, v]) => `(${k}) ${v}`);
  const wrongEntries = altEntries.filter(([k]) => !correctKeys.includes(k));

  let payload = {
    questionCodigo: q.codigo,
    provider: 'tutor-estruturado-local',
    conceptSummary: `Tema: ${q.progress.topicName ?? 'IREB CPRE-FL'}.\n\nGabarito fornecido: ${correctTexts.join(' | ')}.`,
    distractorsAnalysis: wrongEntries
      .map(([k, v]) => `• Alternativa ${k}: "${v}" — Não compõe o gabarito oficial.`)
      .join('\n'),
    memoryTip: 'Compare os termos exatos do enunciado com os conceitos fundamentais do IREB CPRE-FL.',
    practicalExample: 'Tente explicar em voz alta por que a alternativa correta se aplica a um projeto real.',
  };

  if (isAnyFreeAIConfigured()) {
    try {
      const prompt = [
        'Você é um tutor didático de Engenharia de Requisitos (IREB CPRE-FL).',
        'Responda estritamente em JSON com as chaves: conceptSummary, distractorsAnalysis, memoryTip, practicalExample.',
        `Código: ${q.codigo}`,
        `Enunciado: ${q.enunciado}`,
        `Alternativas: ${JSON.stringify(q.alternativas)}`,
        `Gabarito fornecido: ${JSON.stringify(q.resposta_correta)}`,
        `Explicação original: ${q.explicacao}`,
      ].join('\n');

      const res = await generateWithFreeCascade({
        systemInstruction: 'Responda estritamente em JSON válido em português.',
        messages: [{ role: 'user', text: prompt }],
        temperature: 0.3,
        maxOutputTokens: 1600,
        responseMimeType: 'application/json',
      });
      const parsed = JSON.parse(res.text) as Partial<typeof payload>;
      if (parsed.conceptSummary && parsed.distractorsAnalysis) {
        payload = {
          questionCodigo: q.codigo,
          provider: `${res.provider}:${res.model}`,
          conceptSummary: String(parsed.conceptSummary),
          distractorsAnalysis: String(parsed.distractorsAnalysis),
          memoryTip: String(parsed.memoryTip ?? payload.memoryTip),
          practicalExample: String(parsed.practicalExample ?? payload.practicalExample),
        };
      }
    } catch {
      // mantém fallback estruturado
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_ai_explanations')
    .insert({
      user_id: userId,
      question_codigo: payload.questionCodigo,
      provider: payload.provider,
      concept_summary: payload.conceptSummary,
      distractors_analysis: payload.distractorsAnalysis,
      memory_tip: payload.memoryTip,
      practical_example: payload.practicalExample,
      created_at: now,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  return {
    id: Number(data.id),
    ...payload,
    createdAt: now,
  };
}

export async function cloudExportLearningHistory(supabase: SupabaseClient) {
  const [attempts, favorites, notes, spacedRepetition, questionTopics, examSessions, examSessionItems, settings] =
    await Promise.all([
      supabase.from('user_attempts').select('*').order('id', { ascending: true }),
      supabase.from('user_favorites').select('*').order('created_at', { ascending: true }),
      supabase.from('user_notes').select('*').order('id', { ascending: true }),
      supabase.from('user_spaced_repetition').select('*'),
      supabase.from('user_question_topics').select('*'),
      supabase.from('user_exam_sessions').select('*').order('started_at', { ascending: true }),
      supabase.from('user_exam_session_items').select('*').order('id', { ascending: true }),
      cloudGetAppSettings(supabase),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    attempts: attempts.data ?? [],
    favorites: favorites.data ?? [],
    notes: notes.data ?? [],
    spacedRepetition: spacedRepetition.data ?? [],
    questionTopics: questionTopics.data ?? [],
    examSessions: examSessions.data ?? [],
    examSessionItems: examSessionItems.data ?? [],
    settings,
  };
}
