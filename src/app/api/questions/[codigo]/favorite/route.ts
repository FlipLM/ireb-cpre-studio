import { NextRequest, NextResponse } from 'next/server';
import { cloudToggleFavorite } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { codigo } = await context.params;
    const isFavorite = await cloudToggleFavorite(supabase, user.id, decodeURIComponent(codigo));
    return NextResponse.json({ isFavorite });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar favorita.' },
      { status: 400 }
    );
  }
}
