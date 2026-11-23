import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/lib/db';
import { computeMasteryLevel, evaluateAnswer } from '@/lib/evaluation';
import { importQuestionsFromJsonText, validateQuestionsPayload } from '@/lib/importer';
import { getDashboardAnalytics } from '@/lib/repositories/analytics';
import {
  createExamSession,
  finishExamSession,
  getExamSessionDetail,
  updateExamProgress,
} from '@/lib/repositories/exams';
import {
  createNote,
  exportOriginalQuestionsJson,
  getQuestionDetail,
  listQuestionsWithProgress,
  recordStudyAttempt,
  toggleFavorite,
} from '@/lib/repositories/questions';

const SOURCE_JSON_PATH = path.join(process.cwd(), 'data', 'source', 'questoes.json');
const MEDIA_DIR = path.join(process.cwd(), 'public', 'media', 'questoes');

describe('Plataforma IREB CPRE-FL — Integridade do Banco, Correção e Persistência', () => {
  let tempDbPath: string;

  beforeEach(() => {
    tempDbPath = path.join(
      os.tmpdir(),
      `cpre-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    resetDbForTests(tempDbPath);
  });

  afterEach(() => {
    resetDbForTests();
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(tempDbPath + suffix)) {
        try {
          fs.unlinkSync(tempDbPath + suffix);
        } catch {
          // ignore cleanup locks on windows
        }
      }
    }
  });

  it('importa integralmente as 225 questões de questoes.json preservando todos os campos originais', () => {
    const rawText = fs.readFileSync(SOURCE_JSON_PATH, 'utf8');
    const report = importQuestionsFromJsonText(rawText, 'questoes.json', MEDIA_DIR);

    expect(report.valid).toBe(true);
    expect(report.totalInFile).toBe(225);
    expect(report.importedCount).toBe(225);
    expect(report.unicaCount).toBe(169);
    expect(report.multiplaCount).toBe(56);
    expect(report.withImageCount).toBe(11);
    expect(report.missingImageCount).toBe(0);
    expect(report.duplicateCodes).toHaveLength(0);

    const exported = exportOriginalQuestionsJson();
    const originalParsed = JSON.parse(rawText);
    expect(exported).toHaveLength(225);
    expect(exported).toEqual(originalParsed);
  });

  it('reconhece gabaritos em string e array e exige correspondência exata em questões múltiplas', () => {
    // Questão única (string)
    expect(evaluateAnswer(['D'], 'D').isCorrect).toBe(true);
    expect(evaluateAnswer(['A'], 'D').isCorrect).toBe(false);

    // Questão múltipla (array) — parcial NÃO é acerto
    expect(evaluateAnswer(['B'], ['B', 'C']).isCorrect).toBe(false);
    expect(evaluateAnswer(['B', 'C', 'D'], ['B', 'C']).isCorrect).toBe(false);
    expect(evaluateAnswer(['C', 'B'], ['B', 'C']).isCorrect).toBe(true);
  });

  it('sinaliza inconsistências e imagens ausentes sem quebrar nem corrigir automaticamente', () => {
    const brokenJson = JSON.stringify([
      {
        numero: 1,
        codigo: 'ID-999',
        enunciado: 'Questão com imagem ausente e gabarito fora das alternativas',
        tipo: 'unica',
        quantidade_respostas: '1',
        alternativas: { A: 'Op A', B: 'Op B' },
        resposta_correta: 'Z',
        explicacao: 'Explicação',
        imagem: 'C:/caminho/inexistente/img.png',
        print: null,
      },
      {
        numero: 2,
        codigo: 'ID-999',
        enunciado: 'Duplicada',
        tipo: 'unica',
        quantidade_respostas: '1',
        alternativas: { A: 'Op A', B: 'Op B' },
        resposta_correta: 'A',
        explicacao: 'Explicação',
        imagem: null,
        print: null,
      },
    ]);

    const { report } = validateQuestionsPayload(brokenJson, 'broken.json', MEDIA_DIR);
    expect(report.duplicateCodes).toContain('ID-999');
    expect(report.missingImageCount).toBe(1);
    expect(report.issues.some((i) => i.code === 'ANSWER_NOT_IN_ALTERNATIVES')).toBe(true);
    expect(report.issues.some((i) => i.code === 'MISSING_IMAGE')).toBe(true);
  });

  it('preserva tentativas, favoritos e anotações ao reimportar o JSON sem duplicar questões', () => {
    const rawText = fs.readFileSync(SOURCE_JSON_PATH, 'utf8');
    importQuestionsFromJsonText(rawText, 'questoes.json', MEDIA_DIR);

    // Registra atividades na Camada 2
    const attempt = recordStudyAttempt({
      questionCodigo: 'ID-030',
      selectedAnswers: ['A'], // Errada (correta é D)
      timeSpentMs: 12000,
    });
    expect(attempt.isCorrect).toBe(false);
    expect(toggleFavorite('ID-030')).toBe(true);
    createNote('ID-030', 'Revisar técnica de Acordo (ganha-ganha).');

    // Reimporta o JSON
    const reimport = importQuestionsFromJsonText(rawText, 'questoes-v2.json', MEDIA_DIR);
    expect(reimport.importedCount).toBe(0);
    expect(reimport.updatedCount).toBe(225);

    const all = listQuestionsWithProgress();
    expect(all).toHaveLength(225);

    const detail = getQuestionDetail('ID-030');
    expect(detail?.attempts).toHaveLength(1);
    expect(detail?.question.progress.isFavorite).toBe(true);
    expect(detail?.question.progress.needsErrorReview).toBe(true);
    expect(detail?.notes).toHaveLength(1);
    expect(detail?.question.resposta_correta).toBe('D');
  });

  it('oculta gabarito e explicação durante simulado em andamento e corrige ao finalizar', () => {
    const rawText = fs.readFileSync(SOURCE_JSON_PATH, 'utf8');
    importQuestionsFromJsonText(rawText, 'questoes.json', MEDIA_DIR);

    const exam = createExamSession({
      title: 'Simulado Teste',
      questionCount: 3,
      durationMinutes: 10,
      selectionMode: 'sequential',
      includeUnica: true,
      includeMultipla: true,
      reuseAnswered: true,
    });

    const masked = getExamSessionDetail(exam.id, { hideAnswersIfInProgress: true });
    expect(masked?.items[0].question.resposta_correta).toBe('');
    expect(masked?.items[0].question.explicacao).toBe('');

    // Responde Q1 (ID-030, correta D) corretamente e Q2 (ID-007, correta A) incorretamente
    updateExamProgress(exam.id, {
      questionCodigo: 'ID-030',
      selectedAnswers: ['D'],
      markedForReview: true,
      durationSeconds: 45,
    });
    updateExamProgress(exam.id, {
      questionCodigo: 'ID-007',
      selectedAnswers: ['C'],
      durationSeconds: 90,
    });

    const finished = finishExamSession(exam.id, 120);
    expect(finished.status).toBe('completed');
    expect(finished.correctCount).toBe(1);
    expect(finished.wrongCount).toBe(1);
    expect(finished.unansweredCount).toBe(1);
    expect(finished.items[0].question.explicacao.length).toBeGreaterThan(10);

    const dashboard = getDashboardAnalytics();
    expect(dashboard.summary.completedExamsCount).toBe(1);
    expect(dashboard.summary.totalAttempts).toBe(2);
  });

  it('nunca classifica assunto como dominado após apenas 1 resposta correta', () => {
    const mastery = computeMasteryLevel({
      totalQuestionsInTopic: 6,
      uniqueAnsweredQuestions: 1,
      totalAttempts: 1,
      accuracyPercent: 100,
      recentAccuracyPercent: 100,
      recurringErrorQuestions: 0,
    });
    expect(mastery.level).toBe('conhecimento_inicial');
  });
});
