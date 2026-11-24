import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface KnowledgeChunk {
  id: string;
  eu: string;
  title: string;
  topicIds: string[];
  keywords: string[];
  content: string;
}

export interface RetrievedKnowledge {
  chunks: KnowledgeChunk[];
  promptBlock: string;
  sources: Array<{ id: string; eu: string; title: string }>;
}

let cachedChunks: KnowledgeChunk[] | null = null;

export function loadLocalKnowledgeBase(): KnowledgeChunk[] {
  if (cachedChunks) return cachedChunks;
  const filePath = path.join(process.cwd(), 'data', 'knowledge', 'ireb-cpre-fl-syllabus.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    cachedChunks = JSON.parse(raw) as KnowledgeChunk[];
    return cachedChunks;
  } catch {
    return [];
  }
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ');
}

function extractQueryTerms(text: string): string[] {
  const stopWords = new Set([
    'para', 'como', 'qual', 'quais', 'sobre', 'mais', 'menos', 'entre', 'cada',
    'esta', 'este', 'essa', 'esse', 'isso', 'aqui', 'voce', 'pode', 'deve',
    'pelo', 'pela', 'pelos', 'pelas', 'numa', 'numas', 'uma', 'umas', 'uns',
    'com', 'sem', 'por', 'que', 'nao', 'sim', 'sao', 'dos', 'das', 'nos', 'nas',
    'questao', 'alternativa', 'alternativas', 'resposta', 'exceto', 'seguintes',
  ]);
  return Array.from(
    new Set(
      normalizeText(text)
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !stopWords.has(w))
    )
  );
}

/**
 * Busca híbrida (RAG) na Base Oficial IREB CPRE-FL:
 * 1. Consulta a tabela `ireb_knowledge_base` no Supabase (PostgreSQL Full-Text Search) quando disponível.
 * 2. Combina e/ou faz fallback instantâneo na base local `data/knowledge/ireb-cpre-fl-syllabus.json`
 *    com ranqueamento por tópico + palavras-chave + termos do enunciado e pergunta do aluno.
 */
export async function retrieveOfficialIrebKnowledge(params: {
  supabase?: SupabaseClient;
  topicId?: string | null;
  questionText: string;
  userQuestion?: string;
  maxChunks?: number;
}): Promise<RetrievedKnowledge> {
  const maxChunks = params.maxChunks ?? 3;
  const combinedQuery = `${params.userQuestion ?? ''} ${params.questionText}`.trim();
  const queryTerms = extractQueryTerms(combinedQuery);
  const userTerms = params.userQuestion ? extractQueryTerms(params.userQuestion) : [];

  let pool: KnowledgeChunk[] = [];

  // 1. Tenta consultar a base oficial no Supabase (PostgreSQL)
  if (params.supabase) {
    try {
      const { data } = await params.supabase
        .from('ireb_knowledge_base')
        .select('id, eu, title, topic_ids, keywords, content');
      if (Array.isArray(data) && data.length > 0) {
        pool = data.map((row) => ({
          id: String(row.id),
          eu: String(row.eu),
          title: String(row.title),
          topicIds: Array.isArray(row.topic_ids) ? (row.topic_ids as string[]) : [],
          keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
          content: String(row.content),
        }));
      }
    } catch {
      // fallback silencioso para base local
    }
  }

  if (pool.length === 0) {
    pool = loadLocalKnowledgeBase();
  }

  // Ranqueamento semântico por termos da pergunta do aluno (peso 3x), keywords oficiais (peso 2.5x),
  // título (peso 2x), conteúdo (peso 1x) e afinidade de tópico (peso 2.5)
  const scored = pool.map((chunk) => {
    let score = 0;
    const normTitle = normalizeText(chunk.title);
    const normContent = normalizeText(chunk.content);
    const normKeywords = chunk.keywords.map(normalizeText);

    if (params.topicId && chunk.topicIds.includes(params.topicId)) {
      score += 2.5;
    }

    for (const term of queryTerms) {
      const isUserTerm = userTerms.includes(term);
      const boost = isUserTerm ? 2.5 : 1.0;

      if (normKeywords.some((kw) => kw.includes(term) || term.includes(kw))) {
        score += 3.0 * boost;
      }
      if (normTitle.includes(term)) {
        score += 2.2 * boost;
      }
      if (normContent.includes(term)) {
        score += 1.0 * boost;
      }
    }

    return { chunk, score };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, maxChunks)
    .map((item) => item.chunk);

  const selected = top.length > 0 ? top : pool.slice(0, 2);

  const promptBlock = [
    '=== BASE OFICIAL IREB CPRE-FL (SYLLABUS v3.x — FONTE PRIMÁRIA DE VERDADE) ===',
    'Consulte PRIMEIRO os trechos oficiais abaixo ao formular sua dica ou resposta. Não contradiga nem omita itens oficiais presentes nesta base (ex.: se perguntarem os princípios, cite TODOS os 9).',
    '',
    ...selected.map(
      (c) => `[${c.eu} — ${c.title}]\n${c.content}`
    ),
    '=== FIM DA BASE OFICIAL IREB CPRE-FL ===',
  ].join('\n\n');

  return {
    chunks: selected,
    promptBlock,
    sources: selected.map((c) => ({ id: c.id, eu: c.eu, title: c.title })),
  };
}
