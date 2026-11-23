import { NextRequest, NextResponse } from 'next/server';
import { cloudCreateExamSession, cloudListExamSessions } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';
import type { ExamConfig } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const sessions = await cloudListExamSessions(supabase);
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao listar simulados.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const body = (await request.json()) as Partial<ExamConfig>;
    const config: ExamConfig = {
      title: body.title,
      questionCount: Number(body.questionCount ?? 15),
      durationMinutes:
        body.durationMinutes === null || body.durationMinutes === undefined
          ? null
          : Number(body.durationMinutes),
      selectionMode: body.selectionMode === 'sequential' ? 'sequential' : 'random',
      includeUnica: body.includeUnica !== false,
      includeMultipla: body.includeMultipla !== false,
      reuseAnswered: body.reuseAnswered !== false,
      onlyFavorites: Boolean(body.onlyFavorites),
      topicIds: Array.isArray(body.topicIds) ? body.topicIds : undefined,
    };

    const session = await cloudCreateExamSession(supabase, user.id, config);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao criar simulado.' },
      { status: 400 }
    );
  }
}
