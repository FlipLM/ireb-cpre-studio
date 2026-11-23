import { NextRequest, NextResponse } from 'next/server';
import { cloudRecordStudyAttempt, cloudUpdateSpacedDifficulty } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';
import type { DifficultyRating } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { codigo } = await context.params;
    const body = (await request.json()) as {
      selectedAnswers?: string[];
      mode?: 'study' | 'review';
      timeSpentMs?: number;
      difficulty?: DifficultyRating;
    };

    if (!Array.isArray(body.selectedAnswers) || body.selectedAnswers.length === 0) {
      return NextResponse.json(
        { error: 'Selecione pelo menos uma alternativa antes de confirmar.' },
        { status: 400 }
      );
    }

    const result = await cloudRecordStudyAttempt(supabase, user.id, {
      questionCodigo: decodeURIComponent(codigo),
      selectedAnswers: body.selectedAnswers,
      mode: body.mode === 'review' ? 'review' : 'study',
      timeSpentMs: body.timeSpentMs,
      difficulty: body.difficulty,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao registrar resposta.' },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { codigo } = await context.params;
    const body = (await request.json()) as { difficulty?: number };
    const diff = Number(body.difficulty);
    if (!Number.isInteger(diff) || diff < 1 || diff > 5) {
      return NextResponse.json(
        { error: 'Dificuldade inválida. Informe um número de 1 a 5.' },
        { status: 400 }
      );
    }
    const updated = await cloudUpdateSpacedDifficulty(
      supabase,
      user.id,
      decodeURIComponent(codigo),
      diff as DifficultyRating
    );
    return NextResponse.json({ spacedRepetition: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar revisão espaçada.' },
      { status: 400 }
    );
  }
}
