import { NextRequest, NextResponse } from 'next/server';
import { cloudAssignQuestionTopic, cloudGetQuestionDetail } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { codigo } = await context.params;
    const detail = await cloudGetQuestionDetail(supabase, decodeURIComponent(codigo));
    if (!detail) {
      return NextResponse.json({ error: 'Questão não encontrada.' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar questão.' },
      { status: 500 }
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
    const decoded = decodeURIComponent(codigo);
    const body = (await request.json()) as { topicId?: string };

    if (body.topicId) {
      await cloudAssignQuestionTopic(supabase, user.id, decoded, body.topicId);
    }

    const updated = await cloudGetQuestionDetail(supabase, decoded);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar metadados da questão.' },
      { status: 400 }
    );
  }
}
