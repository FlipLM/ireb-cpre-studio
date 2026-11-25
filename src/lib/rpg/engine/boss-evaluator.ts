import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generateWithFreeCascade, isAnyFreeAIConfigured } from '@/lib/ai-provider';
import { retrieveOfficialIrebKnowledge } from '@/lib/ireb-knowledge';
import { RPG_BALANCE } from '@/lib/rpg/balance';
import type { RpgBossEvaluation, RpgBossPrompt } from '@/types/rpg';

const aiEvaluationSchema = z.object({
  classification: z.enum(['correct', 'partial', 'incorrect']),
  score: z.number().min(0).max(1),
  identifiedConcepts: z.array(z.string()).default([]),
  missingConcepts: z.array(z.string()).default([]),
  feedback: z.string().min(10),
});

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

/**
 * Fallback conceitual estruturado caso todos os provedores gratuitos de IA estejam indisponíveis.
 * Avalia cobertura semântica por grupos de termos dos conceitos obrigatórios e complementares.
 */
export function evaluateBossAnswerHeuristic(
  prompt: RpgBossPrompt,
  playerAnswer: string,
  knowledgeSources: Array<{ id: string; eu: string; title: string }> = []
): RpgBossEvaluation {
  const normAnswer = normalizeText(playerAnswer);
  const words = new Set(normAnswer.split(/\s+/).filter((w) => w.length >= 3));

  const identifiedConcepts: string[] = [];
  const missingConcepts: string[] = [];

  for (const concept of prompt.requiredConcepts) {
    const tokens = normalizeText(concept)
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !['como', 'para', 'pelo', 'pela', 'entre', 'cada', 'sobre', 'sistema'].includes(t));
    const hits = tokens.filter((t) => words.has(t) || normAnswer.includes(t)).length;
    const threshold = Math.max(1, Math.ceil(tokens.length * 0.4));
    if (hits >= threshold) {
      identifiedConcepts.push(concept);
    } else {
      missingConcepts.push(concept);
    }
  }

  let bonus = 0;
  for (const comp of prompt.complementaryConcepts) {
    const tokens = normalizeText(comp)
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    if (tokens.some((t) => normAnswer.includes(t))) {
      bonus += 0.06;
    }
  }

  const baseRatio =
    prompt.requiredConcepts.length > 0
      ? identifiedConcepts.length / prompt.requiredConcepts.length
      : 0;
  const lengthFactor = normAnswer.trim().length < 25 ? 0.45 : 1;
  const score = Number(Math.min(1, Math.max(0, (baseRatio + bonus) * lengthFactor)).toFixed(2));

  let classification: 'correct' | 'partial' | 'incorrect' = 'incorrect';
  if (score >= RPG_BALANCE.combat.correctScoreMin) {
    classification = 'correct';
  } else if (score >= RPG_BALANCE.combat.partialScoreMin) {
    classification = 'partial';
  }

  const feedback =
    classification === 'correct'
      ? 'Excelente domínio conceitual! Você abordou os pilares esperados pelo Syllabus IREB CPRE-FL com clareza.'
      : classification === 'partial'
        ? `Boa base conceitual, mas ainda faltou aprofundar: ${missingConcepts.slice(0, 2).join('; ')}.`
        : `Sua resposta ainda não cobriu os conceitos essenciais exigidos (${missingConcepts.slice(0, 2).join('; ')}). Revise o conceito oficial do IREB e contra-ataque no próximo turno.`;

  return {
    classification,
    score,
    identifiedConcepts,
    missingConcepts,
    feedback,
    providerLabel: 'Avaliador Conceitual Local (Fallback)',
    knowledgeSources,
  };
}

/**
 * Avalia a resposta discursiva do jogador em combate contra chefe usando
 * RAG oficial IREB + Cascata Multi-IA gratuita em JSON estrito, com fallback seguro.
 */
export async function evaluateBossDiscursiveAnswer(params: {
  supabase?: SupabaseClient;
  prompt: RpgBossPrompt;
  playerAnswer: string;
}): Promise<RpgBossEvaluation> {
  const retrieved = await retrieveOfficialIrebKnowledge({
    supabase: params.supabase,
    topicId: params.prompt.topicId,
    questionText: params.prompt.question,
    userQuestion: params.playerAnswer,
    maxChunks: 3,
  });

  if (!isAnyFreeAIConfigured()) {
    return evaluateBossAnswerHeuristic(params.prompt, params.playerAnswer, retrieved.sources);
  }

  const systemInstruction = [
    'Você é um examinador oficial sênior da certificação IREB CPRE Foundation Level atuando como juiz de um combate tático de RPG educacional.',
    'Avalie a COMPREENSÃO CONCEITUAL real do aluno (não apenas correspondência literal de palavras-chave).',
    'Responda ESTRITAMENTE com um objeto JSON válido contendo exatamente as chaves:',
    '{ "classification": "correct" | "partial" | "incorrect", "score": number (0.0 a 1.0), "identifiedConcepts": string[], "missingConcepts": string[], "feedback": string }',
    'Regras de pontuação:',
    '- correct (0.80 a 1.00): compreendeu todos os conceitos obrigatórios com precisão técnica.',
    '- partial (0.40 a 0.79): demonstrou entendimento parcial ou omitiu parte dos conceitos obrigatórios.',
    '- incorrect (0.00 a 0.39): resposta vaga, incorreta ou fora do escopo do IREB.',
    'Escreva o feedback em português claro, pedagógico e conciso (2 a 4 frases).',
    '',
    retrieved.promptBlock,
  ].join('\n');

  const userPayload = [
    `Enunciado do Chefe:\n${params.prompt.question}`,
    `Resposta Esperada de Referência:\n${params.prompt.expectedAnswer}`,
    `Conceitos Obrigatórios:\n- ${params.prompt.requiredConcepts.join('\n- ')}`,
    `Conceitos Complementares:\n- ${params.prompt.complementaryConcepts.join('\n- ')}`,
    `Critérios de Avaliação:\n${params.prompt.evaluationCriteria}`,
    `Resposta do Jogador:\n${params.playerAnswer}`,
  ].join('\n\n');

  try {
    const aiResult = await generateWithFreeCascade({
      systemInstruction,
      messages: [{ role: 'user', text: userPayload }],
      temperature: 0.2,
      maxOutputTokens: 700,
      responseMimeType: 'application/json',
    });

    const jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
    const parsedJson = JSON.parse(jsonMatch ? jsonMatch[0] : aiResult.text);
    const validated = aiEvaluationSchema.safeParse(parsedJson);

    if (validated.success) {
      return {
        ...validated.data,
        score: Number(validated.data.score.toFixed(2)),
        providerLabel: aiResult.displayLabel,
        knowledgeSources: retrieved.sources,
      };
    }
  } catch {
    // Fallback determinístico seguro se houver erro de rede/JSON
  }

  return evaluateBossAnswerHeuristic(params.prompt, params.playerAnswer, retrieved.sources);
}
