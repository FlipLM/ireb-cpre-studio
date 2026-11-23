import { NextRequest, NextResponse } from 'next/server';
import { cloudFinishExamSession } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { id } = await context.params;
    let durationSeconds: number | undefined;
    try {
      const body = (await request.json()) as { durationSeconds?: number };
      if (typeof body.durationSeconds === 'number') {
        durationSeconds = Math.max(0, Math.round(body.durationSeconds));
      }
    } catch {
      // corpo vazio permitido
    }

    const session = await cloudFinishExamSession(supabase, user.id, id, durationSeconds);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao finalizar simulado.' },
      { status: 400 }
    );
  }
}
