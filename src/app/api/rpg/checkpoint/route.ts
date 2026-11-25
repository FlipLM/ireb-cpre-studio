import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import { performRpgCheckpointAction } from '@/lib/rpg/store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rest') }),
  z.object({ action: z.literal('equip_heroes'), heroIds: z.array(z.string().min(1)).min(1).max(3) }),
  z.object({
    action: z.literal('spend_stat_point'),
    heroId: z.string().min(1),
    stat: z.enum(['maxHp', 'intelligence', 'baseDamage', 'parryChance', 'critChance']),
  }),
]);

export async function POST(request: NextRequest) {
  if (!isRpgModuleEnabled()) {
    return NextResponse.json({ error: 'Módulo RPG desabilitado.' }, { status: 404 });
  }
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ação de checkpoint inválida.' }, { status: 400 });
    }

    const result = await performRpgCheckpointAction(supabase, user.id, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao executar ação de checkpoint.' },
      { status: 400 }
    );
  }
}
