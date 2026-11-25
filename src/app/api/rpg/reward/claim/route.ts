import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import { claimRpgRewardChest } from '@/lib/rpg/store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  nodeId: z.string().min(1),
  chestIndex: z.number().int().min(0).max(2),
});

export async function POST(request: NextRequest) {
  if (!isRpgModuleEnabled()) {
    return NextResponse.json({ error: 'Módulo RPG desabilitado.' }, { status: 404 });
  }
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Seleção de baú inválida.' }, { status: 400 });
    }

    const result = await claimRpgRewardChest(
      supabase,
      user.id,
      parsed.data.nodeId,
      parsed.data.chestIndex
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao abrir baú de prêmio.' },
      { status: 400 }
    );
  }
}
