import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_QUESTION_TOPIC_MAP, DEFAULT_TOPICS } from '@/lib/taxonomy';
import type { AppSettings } from '@/types/domain';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  errorReviewRequiredStreak: 2,
  minAnswersForTopicPercent: 2,
  defaultHideAnswerUntilConfirm: true,
  savedExamProfiles: [
    {
      id: 'simulado-rapido-15',
      name: 'Treino Rápido (15 questões)',
      config: {
        title: 'Treino Rápido (15 questões)',
        questionCount: 15,
        durationMinutes: 25,
        selectionMode: 'random',
        includeUnica: true,
        includeMultipla: true,
        reuseAnswered: true,
      },
    },
    {
      id: 'simulado-completo-45',
      name: 'Banco Completo (45 questões)',
      config: {
        title: 'Simulado Completo (45 questões)',
        questionCount: 45,
        durationMinutes: 75,
        selectionMode: 'random',
        includeUnica: true,
        includeMultipla: true,
        reuseAnswered: true,
      },
    },
  ],
};

let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;

export function getDefaultDbPath(): string {
  if (process.env.CPRE_DB_PATH) {
    return process.env.CPRE_DB_PATH;
  }
  return path.join(process.cwd(), 'data', 'cpre-studio.db');
}

export function resetDbForTests(customPath?: string): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
    currentDbPath = null;
  }
  if (customPath) {
    process.env.CPRE_DB_PATH = customPath;
  }
}

export function getDb(): DatabaseSync {
  const targetPath = getDefaultDbPath();
  if (dbInstance && currentDbPath === targetPath) {
    return dbInstance;
  }

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (targetPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  initializeSchema(db);
  seedDefaultTopicsAndSettings(db);

  dbInstance = db;
  currentDbPath = targetPath;
  return db;
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    -- =====================================================================
    -- CAMADA 1: BANCO ORIGINAL DE QUESTÕES (Fonte de verdade imutável)
    -- =====================================================================
    CREATE TABLE IF NOT EXISTS source_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imported_at TEXT NOT NULL,
      source_filename TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      validation_report_json TEXT NOT NULL,
      raw_snapshot_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions_source (
      codigo TEXT PRIMARY KEY,
      numero INTEGER NOT NULL,
      enunciado TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('unica', 'multipla')),
      quantidade_respostas TEXT NOT NULL,
      alternativas_json TEXT NOT NULL,
      resposta_correta_json TEXT NOT NULL,
      resposta_correta_is_array INTEGER NOT NULL CHECK (resposta_correta_is_array IN (0, 1)),
      explicacao TEXT NOT NULL,
      imagem TEXT,
      print TEXT,
      raw_json TEXT NOT NULL,
      managed_image_url TEXT,
      image_missing INTEGER NOT NULL DEFAULT 0,
      last_import_id INTEGER,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (last_import_id) REFERENCES source_imports(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_questions_source_numero ON questions_source(numero);

    -- =====================================================================
    -- CAMADA 2: DADOS DE APRENDIZAGEM E ENRIQUECIMENTO
    -- =====================================================================
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS question_topics (
      question_codigo TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      is_manual INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (question_codigo) REFERENCES questions_source(codigo) ON DELETE CASCADE,
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS question_admin_overrides (
      question_codigo TEXT PRIMARY KEY,
      min_selections INTEGER,
      max_selections INTEGER,
      override_image_url TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (question_codigo) REFERENCES questions_source(codigo) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
      config_json TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      answered_count INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      unanswered_count INTEGER NOT NULL DEFAULT 0,
      score_percent REAL NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      current_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS exam_session_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      question_codigo TEXT NOT NULL,
      selected_answers_json TEXT NOT NULL DEFAULT '[]',
      marked_for_review INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER,
      time_spent_ms INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (question_codigo) REFERENCES questions_source(codigo) ON DELETE CASCADE,
      UNIQUE (exam_session_id, position)
    );

    CREATE INDEX IF NOT EXISTS idx_exam_items_session ON exam_session_items(exam_session_id);

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_codigo TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('study', 'exam', 'review')),
      exam_session_id TEXT,
      selected_answers_json TEXT NOT NULL,
      is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
      time_spent_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (question_codigo) REFERENCES questions_source(codigo) ON DELETE CASCADE,
      FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_codigo);
    CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts(created_at);

    CREATE TABLE IF NOT EXISTS favorites (
      question_codigo TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      FOREIGN KEY (question_codigo) REFERENCES questions_source(codigo) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_codigo TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (question_codigo) REFERENCES questions_source(codigo) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notes_question ON notes(question_codigo);

    CREATE TABLE IF NOT EXISTS spaced_repetition (
      question_codigo TEXT PRIMARY KEY,
      difficulty INTEGER NOT NULL DEFAULT 3,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 1,
      repetitions INTEGER NOT NULL DEFAULT 0,
      consecutive_correct INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      next_review_at TEXT,
      FOREIGN KEY (question_codigo) REFERENCES questions_source(codigo) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_explanations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_codigo TEXT NOT NULL,
      provider TEXT NOT NULL,
      concept_summary TEXT NOT NULL,
      distractors_analysis TEXT NOT NULL,
      memory_tip TEXT NOT NULL,
      practical_example TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (question_codigo) REFERENCES questions_source(codigo) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_explanations_question ON ai_explanations(question_codigo);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function seedDefaultTopicsAndSettings(db: DatabaseSync): void {
  const insertTopic = db.prepare(`
    INSERT OR IGNORE INTO topics (id, name, slug, description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const topic of DEFAULT_TOPICS) {
    insertTopic.run(topic.id, topic.name, topic.slug, topic.description, topic.sortOrder);
  }

  const existingSettings = db
    .prepare(`SELECT value_json FROM app_settings WHERE key = 'platform_settings'`)
    .get() as { value_json: string } | undefined;

  if (!existingSettings) {
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('platform_settings', ?, ?)`
    ).run(JSON.stringify(DEFAULT_APP_SETTINGS), new Date().toISOString());
  }
}

export function ensureDefaultTopicAssignments(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const insertMapping = db.prepare(`
    INSERT OR IGNORE INTO question_topics (question_codigo, topic_id, is_manual, updated_at)
    SELECT q.codigo, ?, 0, ?
    FROM questions_source q
    WHERE q.codigo = ?
  `);

  for (const [codigo, topicId] of Object.entries(DEFAULT_QUESTION_TOPIC_MAP)) {
    insertMapping.run(topicId, now, codigo);
  }
}
