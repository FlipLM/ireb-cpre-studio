export type QuestionType = 'unica' | 'multipla';

/**
 * Camada 1 — Estrutura fiel ao arquivo questoes.json original.
 * Nenhum campo é renomeado ou descartado.
 */
export interface RawQuestion {
  numero: number;
  codigo: string;
  enunciado: string;
  tipo: QuestionType;
  quantidade_respostas: string;
  alternativas: Record<string, string>;
  resposta_correta: string | string[];
  explicacao: string;
  imagem: string | null;
  print: string | null;
}

export interface SourceQuestion extends RawQuestion {
  /** Caminho web gerenciado pela plataforma (ex.: /media/questoes/ID-045.png) ou null se ausente */
  managedImageUrl: string | null;
  /** Indica se a questão referencia uma imagem no campo `imagem` mas o arquivo ainda não foi associado/encontrado */
  imageMissing: boolean;
  /** Sobrescrita administrativa opcional de seleção mínima/máxima */
  adminMinSelections: number | null;
  adminMaxSelections: number | null;
}

export interface ImportIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  questionNumero?: number;
  questionCodigo?: string;
  message: string;
}

export interface ImportValidationReport {
  valid: boolean;
  importedAt: string;
  sourceFilename: string;
  contentHash: string;
  totalInFile: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  unicaCount: number;
  multiplaCount: number;
  withImageCount: number;
  missingImageCount: number;
  duplicateCodes: string[];
  duplicateNumbers: number[];
  issues: ImportIssue[];
}

export interface SourceImportLog {
  id: number;
  importedAt: string;
  sourceFilename: string;
  contentHash: string;
  totalQuestions: number;
  report: ImportValidationReport;
}

/**
 * Camada 2 — Dados de aprendizagem e enriquecimento.
 */
export interface Topic {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
}

export interface AttemptRecord {
  id: number;
  questionCodigo: string;
  mode: 'study' | 'exam' | 'review';
  examSessionId: string | null;
  selectedAnswers: string[];
  isCorrect: boolean;
  timeSpentMs: number;
  createdAt: string;
}

export interface NoteRecord {
  id: number;
  questionCodigo: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type DifficultyRating = 1 | 2 | 3 | 4 | 5; // 1=Muito fácil .. 5=Muito difícil

export interface SpacedRepetitionRecord {
  questionCodigo: string;
  difficulty: DifficultyRating;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  consecutiveCorrect: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
}

export interface AIExplanationRecord {
  id: number;
  questionCodigo: string;
  provider: string;
  conceptSummary: string;
  distractorsAnalysis: string;
  memoryTip: string;
  practicalExample: string;
  createdAt: string;
}

export interface QuestionProgressSummary {
  attemptsCount: number;
  correctCount: number;
  wrongCount: number;
  lastAttemptAt: string | null;
  lastSelectedAnswers: string[] | null;
  lastIsCorrect: boolean | null;
  avgTimeMs: number | null;
  isFavorite: boolean;
  notesCount: number;
  needsErrorReview: boolean;
  spacedRepetition: SpacedRepetitionRecord | null;
  topicId: string | null;
  topicName: string | null;
}

export interface QuestionWithProgress extends SourceQuestion {
  progress: QuestionProgressSummary;
}

export interface ExamConfig {
  title?: string;
  questionCount: number;
  durationMinutes: number | null; // null = sem limite
  selectionMode: 'random' | 'sequential';
  includeUnica: boolean;
  includeMultipla: boolean;
  reuseAnswered: boolean;
  onlyFavorites?: boolean;
  topicIds?: string[];
}

export interface ExamSessionItem {
  id: number;
  examSessionId: string;
  position: number;
  questionCodigo: string;
  selectedAnswers: string[];
  markedForReview: boolean;
  isCorrect: boolean | null;
  timeSpentMs: number;
}

export interface ExamSession {
  id: string;
  title: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  config: ExamConfig;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  scorePercent: number;
  durationSeconds: number;
  startedAt: string;
  finishedAt: string | null;
  currentIndex: number;
}

export interface ExamSessionDetail extends ExamSession {
  items: (ExamSessionItem & { question: SourceQuestion })[];
}

export type MasteryLevel =
  | 'nao_estudado'
  | 'conhecimento_inicial'
  | 'em_desenvolvimento'
  | 'bom_dominio'
  | 'dominio_consistente';

export interface TopicPerformance {
  topicId: string;
  topicName: string;
  totalQuestionsInTopic: number;
  uniqueAnsweredQuestions: number;
  totalAttempts: number;
  correctAttempts: number;
  wrongAttempts: number;
  accuracyPercent: number | null; // null quando abaixo do mínimo de respostas
  avgTimeMs: number | null;
  masteryLevel: MasteryLevel;
  masteryReason: string;
  recentAccuracyPercent: number | null;
}

export interface StudyRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'errors' | 'topic' | 'unanswered' | 'spaced_review' | 'improvement';
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}

export interface AppSettings {
  /** Quantos acertos consecutivos na revisão de erros são necessários para remover uma questão da fila */
  errorReviewRequiredStreak: number;
  /** Quantidade mínima de respostas para exibir percentual confiável por assunto */
  minAnswersForTopicPercent: number;
  /** Ocultar gabarito até confirmação no modo estudo por padrão */
  defaultHideAnswerUntilConfirm: boolean;
  /** Perfis salvos de simulado */
  savedExamProfiles: Array<{
    id: string;
    name: string;
    config: ExamConfig;
  }>;
}
