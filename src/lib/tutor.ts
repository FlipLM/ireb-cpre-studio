import { getDb } from '@/lib/db';
import { normalizeAnswerSet } from '@/lib/evaluation';
import { generateWithGemini, isGeminiConfigured } from '@/lib/gemini';
import { getQuestionDetail } from '@/lib/repositories/questions';
import type { AIExplanationRecord, QuestionWithProgress } from '@/types/domain';

/**
 * Tutor Inteligente Modular:
 * - Usa exclusivamente a questão como contexto.
 * - NUNCA modifica o gabarito nem sobrescreve a explicação original.
 * - Todo conteúdo gerado é claramente marcado como complementar.
 * - Funciona de forma autônoma (modo estruturado local) mesmo sem chave de IA configurada,
 *   e suporta opcionalmente provedor OpenAI-compatível via variável de ambiente no servidor.
 */
function buildStructuredFallbackExplanation(question: QuestionWithProgress): Omit<
  AIExplanationRecord,
  'id' | 'createdAt'
> {
  const correctKeys = normalizeAnswerSet(question.resposta_correta);
  const altEntries = Object.entries(question.alternativas);
  const correctTexts = altEntries
    .filter(([k]) => correctKeys.includes(k))
    .map(([k, v]) => `(${k}) ${v}`);
  const wrongEntries = altEntries.filter(([k]) => !correctKeys.includes(k));

  const topicLabel = question.progress.topicName ?? 'Engenharia de Requisitos (IREB CPRE-FL)';

  const conceptSummary = [
    `Tema relacionado: ${topicLabel}.`,
    `Esta questão (${question.codigo}, tipo ${
      question.tipo === 'unica' ? 'resposta única' : 'múltiplas respostas'
    }) avalia sua compreensão direta sobre o conceito central apresentado no enunciado.`,
    `Gabarito fornecido no banco: ${correctTexts.join(' | ')}.`,
  ].join('\n\n');

  const distractorsAnalysis =
    wrongEntries.length > 0
      ? wrongEntries
          .map(
            ([k, v]) =>
              `• Alternativa ${k}: "${v}" — Não faz parte do gabarito fornecido. Compare-a com o critério central da explicação original para identificar o termo restritivo, invertido ou fora de escopo.`
          )
          .join('\n')
      : 'Não há alternativas incorretas adicionais registradas nesta questão.';

  const hasNegation = /\b(EXCETO|ERRADA|ERRADAS|INCORRETO|NÃO)\b/i.test(question.enunciado);
  const memoryTip = hasNegation
    ? 'Atenção ao enunciado negativo (EXCETO / ERRADA / INCORRETO / NÃO): releia cada alternativa marcando V ou F antes de confirmar para evitar inversão de gabarito.'
    : question.tipo === 'multipla'
      ? `Questão de múltipla escolha (indicação original: "${question.quantidade_respostas}"): valide cada alternativa de forma independente, pois a correção exige correspondência exata do conjunto completo.`
      : 'Associe a palavra-chave do enunciado à definição exata usada na explicação original — em provas IREB CPRE-FL, pequenas diferenças terminológicas (ex.: validação vs. verificação, limite vs. contexto) definem a resposta correta.';

  const practicalExample =
    'Cenário de fixação: tente explicar em voz alta, com suas próprias palavras, por que a(s) alternativa(s) correta(s) se aplicam a um projeto real de software e registre uma anotação pessoal nesta questão caso reste alguma dúvida.';

  return {
    questionCodigo: question.codigo,
    provider: 'tutor-estruturado-local',
    conceptSummary,
    distractorsAnalysis,
    memoryTip,
    practicalExample,
  };
}

export async function generateOrGetComplementaryExplanation(
  questionCodigo: string,
  options: { forceRegenerate?: boolean } = {}
): Promise<AIExplanationRecord> {
  const detail = getQuestionDetail(questionCodigo);
  if (!detail) {
    throw new Error(`Questão ${questionCodigo} não encontrada.`);
  }

  if (detail.aiExplanation && !options.forceRegenerate) {
    return detail.aiExplanation;
  }

  let payload = buildStructuredFallbackExplanation(detail.question);

  // Integração opcional server-side via variável de ambiente (nunca exposta no frontend)
  const prompt = [
    'Você é um tutor didático de Engenharia de Requisitos (IREB CPRE-FL).',
    'REGRAS OBRIGATÓRIAS:',
    '1. Use APENAS o conteúdo da questão abaixo como contexto. Não invente referências oficiais.',
    '2. Nunca contradiga nem altere o gabarito fornecido.',
    '3. Responda estritamente em JSON com as chaves: conceptSummary, distractorsAnalysis, memoryTip, practicalExample.',
    '',
    `Código: ${detail.question.codigo}`,
    `Enunciado: ${detail.question.enunciado}`,
    `Alternativas: ${JSON.stringify(detail.question.alternativas)}`,
    `Gabarito fornecido: ${JSON.stringify(detail.question.resposta_correta)}`,
    `Explicação original: ${detail.question.explicacao}`,
  ].join('\n');

  if (isGeminiConfigured()) {
    try {
      const geminiResult = await generateWithGemini({
        systemInstruction:
          'Você é um tutor especialista em IREB CPRE-FL. Responda estritamente em JSON válido em português.',
        messages: [{ role: 'user', text: prompt }],
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      });
      const parsed = JSON.parse(geminiResult.text) as Partial<typeof payload>;
      if (parsed.conceptSummary && parsed.distractorsAnalysis) {
        payload = {
          questionCodigo: detail.question.codigo,
          provider: `gemini:${geminiResult.model}`,
          conceptSummary: String(parsed.conceptSummary),
          distractorsAnalysis: String(parsed.distractorsAnalysis),
          memoryTip: String(parsed.memoryTip ?? payload.memoryTip),
          practicalExample: String(parsed.practicalExample ?? payload.practicalExample),
        };
      }
    } catch {
      // Fallback silencioso para OpenAI ou modo estruturado local
    }
  } else if (process.env.OPENAI_API_KEY) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content) as Partial<typeof payload>;
          if (parsed.conceptSummary && parsed.distractorsAnalysis) {
            payload = {
              questionCodigo: detail.question.codigo,
              provider: `openai:${model}`,
              conceptSummary: String(parsed.conceptSummary),
              distractorsAnalysis: String(parsed.distractorsAnalysis),
              memoryTip: String(parsed.memoryTip ?? payload.memoryTip),
              practicalExample: String(parsed.practicalExample ?? payload.practicalExample),
            };
          }
        }
      }
    } catch {
      // Fallback silencioso para o modo estruturado local (plataforma nunca depende de IA externa)
    }
  }

  const db = getDb();
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO ai_explanations (
         question_codigo, provider, concept_summary, distractors_analysis, memory_tip, practical_example, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.questionCodigo,
      payload.provider,
      payload.conceptSummary,
      payload.distractorsAnalysis,
      payload.memoryTip,
      payload.practicalExample,
      now
    );

  return {
    id: Number(res.lastInsertRowid),
    ...payload,
    createdAt: now,
  };
}
