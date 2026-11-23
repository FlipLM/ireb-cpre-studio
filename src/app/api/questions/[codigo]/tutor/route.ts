import { NextRequest, NextResponse } from 'next/server';
import { cloudGenerateComplementaryExplanation } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

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
    let forceRegenerate = false;
    try {
      const body = (await request.json()) as { forceRegenerate?: boolean };
      forceRegenerate = Boolean(body.forceRegenerate);
    } catch {
      // corpo vazio permitido
    }

    const explanation = await cloudGenerateComplementaryExplanation(
      supabase,
      user.id,
      decodeURIComponent(codigo),
      { forceRegenerate }
    );
    return NextResponse.json({ explanation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar explicação complementar.' },
      { status: 400 }
    );
  }
}
