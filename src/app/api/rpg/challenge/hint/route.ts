import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import { consumeRpgHint } from '@/lib/rpg/store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  questionCodigo: z.string().optional(),
  bossQuestionText: z.string().optional(),
  topicId: z.string().optional(),
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
      return NextResponse.json({ error: 'Parâmetros inválidos para dica.' }, { status: 400 });
    }

    const result = await consumeRpgHint(supabase, user.id, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível usar dica.' },
      { status: 400 }
    );
  }
}
