import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { ensureDefaultTopicAssignments, getDb } from '@/lib/db';
import { normalizeAnswerSet } from '@/lib/evaluation';
import type {
  ImportIssue,
  ImportValidationReport,
  RawQuestion,
  SourceImportLog,
} from '@/types/domain';

const RawQuestionSchema = z.object({
  numero: z.number().int().positive(),
  codigo: z.string().min(1),
  enunciado: z.string().min(1),
  tipo: z.enum(['unica', 'multipla']),
  quantidade_respostas: z.string().min(1),
  alternativas: z.record(z.string(), z.string()),
  resposta_correta: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  explicacao: z.string(),
  imagem: z.string().nullable(),
  print: z.string().nullable(),
});

function resolveManagedImage(
  codigo: string,
  imagemField: string | null,
  mediaDir: string
): { managedUrl: string | null; missing: boolean } {
  if (!imagemField) {
    return { managedUrl: null, missing: false };
  }

  // 1. Verifica se já existe arquivo gerenciado por código (ex.: public/media/questoes/ID-045.png)
  const extFromField = path.extname(imagemField) || '.png';
  const targetFilename = `${codigo}${extFromField}`;
  const targetPath = path.join(mediaDir, targetFilename);

  if (fs.existsSync(targetPath)) {
    return {
      managedUrl: `/media/questoes/${encodeURIComponent(targetFilename)}`,
      missing: false,
    };
  }

  // 2. Verifica se existe pelo nome original do arquivo na pasta de mídia
  const originalBase = path.basename(imagemField);
  const byOriginalPath = path.join(mediaDir, originalBase);
  if (fs.existsSync(byOriginalPath)) {
    return {
      managedUrl: `/media/questoes/${encodeURIComponent(originalBase)}`,
      missing: false,
    };
  }

  // 3. Caso o caminho local original exista nesta máquina, copia sem alterar o campo original
  if (fs.existsSync(imagemField)) {
    try {
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      fs.copyFileSync(imagemField, targetPath);
      return {
        managedUrl: `/media/questoes/${encodeURIComponent(targetFilename)}`,
        missing: false,
      };
    } catch {
      return { managedUrl: null, missing: true };
    }
  }

  return { managedUrl: null, missing: true };
}

export function validateQuestionsPayload(
  rawText: string,
  sourceFilename: string,
  mediaDir: string = path.join(process.cwd(), 'public', 'media', 'questoes')
): {
  parsedQuestions: Array<{
    question: RawQuestion;
    managedImageUrl: string | null;
    imageMissing: boolean;
  }>;
  report: ImportValidationReport;
} {
  const importedAt = new Date().toISOString();
  const contentHash = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');
  const issues: ImportIssue[] = [];
  const duplicateCodes: string[] = [];
  const duplicateNumbers: number[] = [];

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (err) {
    issues.push({
      severity: 'error',
      code: 'INVALID_JSON',
      message: `JSON inválido: ${err instanceof Error ? err.message : 'erro de sintaxe'}`,
    });
    return {
      parsedQuestions: [],
      report: {
        valid: false,
        importedAt,
        sourceFilename,
        contentHash,
        totalInFile: 0,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        unicaCount: 0,
        multiplaCount: 0,
        withImageCount: 0,
        missingImageCount: 0,
        duplicateCodes,
        duplicateNumbers,
        issues,
      },
    };
  }

  if (!Array.isArray(parsedJson)) {
    issues.push({
      severity: 'error',
      code: 'ROOT_NOT_ARRAY',
      message: 'A estrutura principal do arquivo deve ser uma lista (array) de questões.',
    });
    return {
      parsedQuestions: [],
      report: {
        valid: false,
        importedAt,
        sourceFilename,
        contentHash,
        totalInFile: 0,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        unicaCount: 0,
        multiplaCount: 0,
        withImageCount: 0,
        missingImageCount: 0,
        duplicateCodes,
        duplicateNumbers,
        issues,
      },
    };
  }

  const seenCodes = new Set<string>();
  const seenNumbers = new Set<number>();
  const parsedQuestions: Array<{
    question: RawQuestion;
    managedImageUrl: string | null;
    imageMissing: boolean;
  }> = [];

  let unicaCount = 0;
  let multiplaCount = 0;
  let withImageCount = 0;
  let missingImageCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < parsedJson.length; i++) {
    const item = parsedJson[i];
    const result = RawQuestionSchema.safeParse(item);

    if (!result.success) {
      skippedCount += 1;
      const itemObj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      issues.push({
        severity: 'error',
        code: 'SCHEMA_VALIDATION_ERROR',
        questionNumero: typeof itemObj.numero === 'number' ? itemObj.numero : undefined,
        questionCodigo: typeof itemObj.codigo === 'string' ? itemObj.codigo : undefined,
        message: `Item #${i + 1} possui campos obrigatórios ausentes ou tipos inválidos: ${result.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ')}`,
      });
      continue;
    }

    const q = result.data;

    if (seenCodes.has(q.codigo)) {
      duplicateCodes.push(q.codigo);
      skippedCount += 1;
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_CODE',
        questionNumero: q.numero,
        questionCodigo: q.codigo,
        message: `Código duplicado encontrado (${q.codigo}). Registro duplicado sinalizado e ignorado na importação.`,
      });
      continue;
    }
    seenCodes.add(q.codigo);

    if (seenNumbers.has(q.numero)) {
      duplicateNumbers.push(q.numero);
      issues.push({
        severity: 'warning',
        code: 'DUPLICATE_NUMBER',
        questionNumero: q.numero,
        questionCodigo: q.codigo,
        message: `Número de questão duplicado (${q.numero}) no código ${q.codigo}.`,
      });
    }
    seenNumbers.add(q.numero);

    const altKeys = Object.keys(q.alternativas);
    if (altKeys.length < 2) {
      issues.push({
        severity: 'warning',
        code: 'FEW_ALTERNATIVES',
        questionNumero: q.numero,
        questionCodigo: q.codigo,
        message: `Questão ${q.codigo} possui apenas ${altKeys.length} alternativa(s).`,
      });
    }

    // Verifica correspondência do gabarito com alternativas existentes (sem corrigir automaticamente)
    const normalizedCorrect = normalizeAnswerSet(q.resposta_correta);
    for (const ans of normalizedCorrect) {
      if (!Object.prototype.hasOwnProperty.call(q.alternativas, ans)) {
        issues.push({
          severity: 'warning',
          code: 'ANSWER_NOT_IN_ALTERNATIVES',
          questionNumero: q.numero,
          questionCodigo: q.codigo,
          message: `Resposta correta "${ans}" não encontrada nas alternativas da questão ${q.codigo}.`,
        });
      }
    }

    if (q.tipo === 'unica' && Array.isArray(q.resposta_correta) && q.resposta_correta.length > 1) {
      issues.push({
        severity: 'warning',
        code: 'TYPE_ANSWER_MISMATCH',
        questionNumero: q.numero,
        questionCodigo: q.codigo,
        message: `Questão ${q.codigo} tem tipo "unica" mas apresenta múltiplas respostas corretas.`,
      });
    }

    if (q.tipo === 'unica') unicaCount += 1;
    else multiplaCount += 1;

    const imageInfo = resolveManagedImage(q.codigo, q.imagem, mediaDir);
    if (q.imagem) {
      withImageCount += 1;
      if (imageInfo.missing) {
        missingImageCount += 1;
        issues.push({
          severity: 'warning',
          code: 'MISSING_IMAGE',
          questionNumero: q.numero,
          questionCodigo: q.codigo,
          message: `Imagem referenciada em "${q.imagem}" não foi localizada na pasta de mídia. A questão permanece funcional e permite associação manual posterior.`,
        });
      }
    }

    parsedQuestions.push({
      question: q,
      managedImageUrl: imageInfo.managedUrl,
      imageMissing: imageInfo.missing,
    });
  }

  const hasFatalErrors = issues.some((i) => i.severity === 'error') && parsedQuestions.length === 0;

  return {
    parsedQuestions,
    report: {
      valid: !hasFatalErrors,
      importedAt,
      sourceFilename,
      contentHash,
      totalInFile: parsedJson.length,
      importedCount: 0,
      updatedCount: 0,
      skippedCount,
      unicaCount,
      multiplaCount,
      withImageCount,
      missingImageCount,
      duplicateCodes,
      duplicateNumbers,
      issues,
    },
  };
}

/**
 * Importa um JSON validado para a Camada 1 (questions_source), preservando
 * integralmente todos os registros de Camada 2 (tentativas, favoritos, notas, simulados).
 */
export function importQuestionsFromJsonText(
  rawText: string,
  sourceFilename = 'questoes.json',
  mediaDir?: string
): ImportValidationReport {
  const { parsedQuestions, report } = validateQuestionsPayload(rawText, sourceFilename, mediaDir);

  if (!report.valid || parsedQuestions.length === 0) {
    return report;
  }

  const db = getDb();
  const now = report.importedAt;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const insertImport = db.prepare(`
      INSERT INTO source_imports (
        imported_at, source_filename, content_hash, total_questions, validation_report_json, raw_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Insere log preliminar (atualizamos o report com importedCount/updatedCount ao fim)
    const importRes = insertImport.run(
      now,
      sourceFilename,
      report.contentHash,
      parsedQuestions.length,
      JSON.stringify(report),
      rawText
    );
    const importId = Number(importRes.lastInsertRowid);

    const checkExisting = db.prepare(`SELECT codigo FROM questions_source WHERE codigo = ?`);
    const upsertQuestion = db.prepare(`
      INSERT INTO questions_source (
        codigo, numero, enunciado, tipo, quantidade_respostas,
        alternativas_json, resposta_correta_json, resposta_correta_is_array,
        explicacao, imagem, print, raw_json, managed_image_url, image_missing,
        last_import_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(codigo) DO UPDATE SET
        numero = excluded.numero,
        enunciado = excluded.enunciado,
        tipo = excluded.tipo,
        quantidade_respostas = excluded.quantidade_respostas,
        alternativas_json = excluded.alternativas_json,
        resposta_correta_json = excluded.resposta_correta_json,
        resposta_correta_is_array = excluded.resposta_correta_is_array,
        explicacao = excluded.explicacao,
        imagem = excluded.imagem,
        print = excluded.print,
        raw_json = excluded.raw_json,
        managed_image_url = COALESCE(excluded.managed_image_url, questions_source.managed_image_url),
        image_missing = CASE WHEN COALESCE(excluded.managed_image_url, questions_source.managed_image_url) IS NOT NULL THEN 0 ELSE excluded.image_missing END,
        last_import_id = excluded.last_import_id,
        updated_at = excluded.updated_at
    `);

    let importedCount = 0;
    let updatedCount = 0;

    for (const item of parsedQuestions) {
      const q = item.question;
      const exists = checkExisting.get(q.codigo);
      if (exists) updatedCount += 1;
      else importedCount += 1;

      upsertQuestion.run(
        q.codigo,
        q.numero,
        q.enunciado,
        q.tipo,
        q.quantidade_respostas,
        JSON.stringify(q.alternativas),
        JSON.stringify(q.resposta_correta),
        Array.isArray(q.resposta_correta) ? 1 : 0,
        q.explicacao,
        q.imagem,
        q.print,
        JSON.stringify(q),
        item.managedImageUrl,
        item.imageMissing ? 1 : 0,
        importId,
        now
      );
    }

    report.importedCount = importedCount;
    report.updatedCount = updatedCount;

    db.prepare(`UPDATE source_imports SET validation_report_json = ? WHERE id = ?`).run(
      JSON.stringify(report),
      importId
    );

    ensureDefaultTopicAssignments(db);

    db.exec('COMMIT;');
    return report;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Garante que o banco inicial contenha as 45 questões do data/source/questoes.json
 * na primeira inicialização da aplicação (idempotente).
 */
export function ensureInitialBankImported(): void {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as total FROM questions_source`).get() as {
    total: number;
  };
  if (row.total > 0) {
    return;
  }

  const defaultJsonPath = path.join(process.cwd(), 'data', 'source', 'questoes.json');
  if (fs.existsSync(defaultJsonPath)) {
    const rawText = fs.readFileSync(defaultJsonPath, 'utf8');
    importQuestionsFromJsonText(rawText, 'questoes.json');
  }
}

export function getImportHistory(): SourceImportLog[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, imported_at, source_filename, content_hash, total_questions, validation_report_json
       FROM source_imports
       ORDER BY id DESC
       LIMIT 20`
    )
    .all() as Array<{
    id: number;
    imported_at: string;
    source_filename: string;
    content_hash: string;
    total_questions: number;
    validation_report_json: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    importedAt: r.imported_at,
    sourceFilename: r.source_filename,
    contentHash: r.content_hash,
    totalQuestions: r.total_questions,
    report: JSON.parse(r.validation_report_json) as ImportValidationReport,
  }));
}
