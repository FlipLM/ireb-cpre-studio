import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import { answerRpgChallengeNode } from '@/lib/rpg/store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  nodeId: z.string().min(1),
  selectedAnswers: z.array(z.string().min(1)).default([]),
  targetEnemyId: z.string().optional(),
  timedOut: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  if (!isRpgModuleEnabled()) {
    return NextResponse.json({ error: 'Módulo RPG desabilitado.' }, { status: 404 });
  }
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success || (!parsed.data.timedOut && parsed.data.selectedAnswers.length === 0)) {
      return NextResponse.json({ error: 'Selecione ao menos uma alternativa.' }, { status: 400 });
    }

    const result = await answerRpgChallengeNode(
      supabase,
      user.id,
      parsed.data.nodeId,
      parsed.data.selectedAnswers,
      parsed.data.targetEnemyId,
      parsed.data.timedOut
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao validar resposta.' },
      { status: 400 }
    );
  }
}
