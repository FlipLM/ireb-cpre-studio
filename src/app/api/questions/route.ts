import { NextRequest, NextResponse } from 'next/server';
import { cloudListQuestionsWithProgress, getStaticTopics } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';
import type { QuestionType } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const tipoParam = searchParams.get('tipo') ?? 'all';
    const statusParam = searchParams.get('status') ?? 'all';
    const favoritesOnly = searchParams.get('favorites') === 'true';
    const withImageOnly = searchParams.get('withImage') === 'true';
    const topicId = searchParams.get('topicId') ?? 'all';

    const questions = await cloudListQuestionsWithProgress(supabase, {
      search,
      tipo: (tipoParam === 'unica' || tipoParam === 'multipla' ? tipoParam : 'all') as
        | QuestionType
        | 'all',
      status: statusParam as
        | 'all'
        | 'answered'
        | 'unanswered'
        | 'correct'
        | 'incorrect'
        | 'error_review',
      favoritesOnly,
      withImageOnly,
      topicId,
    });

    const topics = getStaticTopics();

    return NextResponse.json({ questions, topics, total: questions.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao listar questões.' },
      { status: 500 }
    );
  }
}
