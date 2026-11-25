import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import { selectRpgMapNode } from '@/lib/rpg/store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ nodeId: z.string().min(1) });

export async function POST(request: NextRequest) {
  if (!isRpgModuleEnabled()) {
    return NextResponse.json({ error: 'Módulo RPG desabilitado.' }, { status: 404 });
  }
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'nodeId inválido.' }, { status: 400 });
    }

    const result = await selectRpgMapNode(supabase, user.id, parsed.data.nodeId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao selecionar nó.' },
      { status: 400 }
    );
  }
}
