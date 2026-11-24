import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cloudGetQuestionDetail } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';
import {
  generateWithFreeCascade,
  isAnyFreeAIConfigured,
  type AIMessage,
} from '@/lib/ai-provider';
import { retrieveOfficialIrebKnowledge } from '@/lib/ireb-knowledge';
import { loadProfessorSkill } from '@/lib/professor-skill';
import type { QuestionWithProgress } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  action: z.enum(['hint', 'ask']),
  hintLevel: z.number().int().min(1).max(3).optional().default(1),
  userQuestion: z.string().trim().min(1).max(800).optional(),
  alreadySubmitted: z.boolean().optional().default(false),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        text: z.string().max(8000),
      })
    )
    .max(10)
    .optional()
    .default([]),
});

function buildQuestionContext(question: QuestionWithProgress, includeAnswer: boolean): string {
  const alternativesText = Object.entries(question.alternativas)
    .map(([letter, text]) => `${letter}) ${text}`)
    .join('\n');

  const lines = [
    `Código da questão: ${question.codigo} (Questão #${question.numero})`,
    `Assunto: ${question.progress.topicName ?? 'Engenharia de Requisitos (IREB CPRE-FL)'}`,
    `Tipo: ${
      question.tipo === 'multipla'
        ? `Múltipla resposta (${question.quantidade_respostas})`
        : 'Resposta única'
    }`,
    `Enunciado:\n${question.enunciado}`,
    `Alternativas:\n${alternativesText}`,
  ];

  // Sempre passamos o gabarito e explicação apenas como conhecimento interno do professor
  // para que ele dê dicas precisas e não induza o aluno ao erro, mas com regra estrita de não vazar.
  lines.push(
    `[USO INTERNO DO PROFESSOR — ${
      includeAnswer
        ? 'O aluno JÁ respondeu, pode discutir abertamente'
        : 'PROIBIDO REVELAR AO ALUNO ANTES DE ELE RESPONDER'
    }]`,
    `Gabarito oficial: ${JSON.stringify(question.resposta_correta)}`,
    `Explicação oficial: ${question.explicacao}`
  );

  return lines.join('\n\n');
}

function buildLocalFallbackReply(
  question: QuestionWithProgress,
  action: 'hint' | 'ask',
  hintLevel: number
): string {
  const hasNegation = /\b(EXCETO|ERRADA|ERRADAS|INCORRETO|INCORRETAS|NÃO)\b/i.test(
    question.enunciado
  );
  const topic = question.progress.topicName ?? 'Engenharia de Requisitos (IREB CPRE-FL)';

  if (action === 'ask') {
    return `Para que eu possa responder perguntas abertas com a IA Gemini 3.1, configure a variável GEMINI_API_KEY no arquivo .env.local na raiz do projeto e reinicie o servidor. Enquanto isso, foque nos conceitos de "${topic}" presentes no enunciado!`;
  }

  if (hintLevel === 1) {
    if (hasNegation) {
      return `Olho vivo no enunciado! Há uma palavra de negação (como EXCETO ou NÃO). Avalie cada alternativa como Verdadeira ou Falsa segundo os princípios de "${topic}" para isolar a exceção.`;
    }
    if (question.tipo === 'multipla') {
      return `Atenção: esta questão exige múltiplas respostas (${question.quantidade_respostas}). Analise cada alternativa de forma independente com base nos conceitos de "${topic}" e descarte afirmações extremas ou fora do escopo do IREB.`;
    }
    return `Pense no objetivo central de "${topic}" no IREB CPRE-FL. Identifique a palavra-chave principal do enunciado e elimine as alternativas que invertem papéis, fases ou definições clássicas.`;
  }

  return `Dica extra: releia as alternativas comparando os termos técnicos exatos do IREB (como requisitos vs. soluções, validação vs. verificação, contexto vs. sistema). (Configure GEMINI_API_KEY no .env.local para dicas personalizadas pelo Gemini 3.1!)`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo } = await context.params;
    const rawBody = await request.json();
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parâmetros inválidos para consultar o Professor.' },
        { status: 400 }
      );
    }

    const { action, hintLevel, userQuestion, alreadySubmitted, history } = parsed.data;

    if (action === 'ask' && !userQuestion) {
      return NextResponse.json(
        { error: 'Digite uma pergunta para o Professor IREB.' },
        { status: 400 }
      );
    }

    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const detail = await cloudGetQuestionDetail(supabase, decodeURIComponent(codigo));
    if (!detail) {
      return NextResponse.json({ error: 'Questão não encontrada.' }, { status: 404 });
    }

    const { question } = detail;

    if (!isAnyFreeAIConfigured()) {
      return NextResponse.json({
        reply: buildLocalFallbackReply(question, action, hintLevel),
        provider: 'local-fallback',
        model: 'local',
        usedFallback: true,
        needsApiKey: true,
      });
    }

    const questionContext = buildQuestionContext(question, alreadySubmitted);
    const skill = loadProfessorSkill();
    const knowledge = await retrieveOfficialIrebKnowledge({
      supabase,
      topicId: question.progress.topicId,
      questionText: `${question.enunciado} ${Object.values(question.alternativas).join(' ')}`,
      userQuestion,
      maxChunks: action === 'ask' ? 4 : 3,
    });

    const runtimeDirective =
      action === 'hint'
        ? [
            '---',
            'PARÂMETROS DESTA INTERAÇÃO:',
            '- action: hint (Pedir dica)',
            `- hintLevel: ${hintLevel} de 3`,
            `- alreadySubmitted: ${alreadySubmitted}`,
            'Siga rigorosamente a skill acima e a BASE OFICIAL IREB CPRE-FL abaixo, dando pontos-chave que o aluno deve lembrar para responder sozinho, SEM entregar a resposta.',
          ].join('\n')
        : [
            '---',
            'PARÂMETROS DESTA INTERAÇÃO:',
            '- action: ask (Pergunta aberta — Modo Aula Liberal)',
            `- alreadySubmitted: ${alreadySubmitted}`,
            alreadySubmitted
              ? 'O aluno JÁ confirmou a resposta: pode ensinar a teoria com base na BASE OFICIAL IREB CPRE-FL abaixo e discutir o gabarito abertamente.'
              : 'O aluno AINDA NÃO respondeu, mas quer aprender o conteúdo teórico completo para interpretar e responder sozinho. Use a BASE OFICIAL IREB CPRE-FL abaixo como fonte primária e ensine a teoria de forma completa e didática (sem dizer explicitamente qual letra marcar).',
          ].join('\n');

    const systemInstruction = `${skill.content}\n\n${knowledge.promptBlock}\n\n${runtimeDirective}`;

    const messages: AIMessage[] = [];

    if (action === 'hint') {
      messages.push({
        role: 'user',
        text: `Aqui está a questão que estou estudando:\n\n${questionContext}\n\nProfessor, pode me dar uma dica de nível ${hintLevel} sem entregar a resposta?`,
      });
    } else {
      messages.push({
        role: 'user',
        text: `Contexto da questão atual:\n\n${questionContext}`,
      });
      messages.push({
        role: 'model',
        text: 'Entendido! Estou acompanhando esta questão com você. Qual é a sua dúvida?',
      });
      for (const turn of history.slice(-6)) {
        messages.push({ role: turn.role, text: turn.text });
      }
      messages.push({
        role: 'user',
        text: userQuestion!,
      });
    }

    const result = await generateWithFreeCascade({
      systemInstruction,
      messages,
      temperature: action === 'hint' ? 0.55 : 0.45,
      maxOutputTokens: action === 'hint' ? 900 : 1800,
    });

    return NextResponse.json({
      reply: result.text,
      provider: result.provider,
      model: result.displayLabel,
      sources: knowledge.sources,
      usedFallback: false,
      needsApiKey: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar o Professor IREB agora.',
      },
      { status: 500 }
    );
  }
}
