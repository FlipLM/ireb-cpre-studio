import { NextRequest, NextResponse } from 'next/server';
import { cloudGetExamSessionDetail, cloudUpdateExamProgress } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { id } = await context.params;
    const session = await cloudGetExamSessionDetail(supabase, id, {
      hideAnswersIfInProgress: true,
    });
    if (!session) {
      return NextResponse.json({ error: 'Simulado não encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar simulado.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { id } = await context.params;
    const body = (await request.json()) as {
      questionCodigo?: string;
      selectedAnswers?: string[];
      markedForReview?: boolean;
      timeSpentMsDelta?: number;
      currentIndex?: number;
      durationSeconds?: number;
    };

    await cloudUpdateExamProgress(supabase, id, body);
    const updated = await cloudGetExamSessionDetail(supabase, id, {
      hideAnswersIfInProgress: true,
    });
    return NextResponse.json({ session: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao salvar progresso do simulado.' },
      { status: 400 }
    );
  }
}
