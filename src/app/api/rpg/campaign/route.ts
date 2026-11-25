import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import {
  getCampaignRunUsedQuestionCodes,
  getOrCreateCampaignSnapshot,
  getRegionQuestionBundle,
  markRpgDialogueSeen,
  resetRpgCampaign,
  switchRpgRegion,
} from '@/lib/rpg/store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('seen_dialogue'), dialogueId: z.string().min(1) }),
  z.object({ action: z.literal('switch_region'), regionIndex: z.number().int().min(0).max(10) }),
]);

export async function GET() {
  if (!isRpgModuleEnabled()) {
    return NextResponse.json({ error: 'Módulo RPG desabilitado pela feature flag.' }, { status: 404 });
  }
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const snapshot = await getOrCreateCampaignSnapshot(supabase, user.id);
    const runUsedQuestionCodes = await getCampaignRunUsedQuestionCodes(supabase, snapshot.campaign.id);
    return NextResponse.json({
      ...snapshot,
      regionQuestionPool: getRegionQuestionBundle(),
      runUsedQuestionCodes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar campanha RPG.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isRpgModuleEnabled()) {
    return NextResponse.json({ error: 'Módulo RPG desabilitado pela feature flag.' }, { status: 404 });
  }
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
    }

    const snapshot =
      parsed.data.action === 'seen_dialogue'
        ? await markRpgDialogueSeen(supabase, user.id, parsed.data.dialogueId)
        : await switchRpgRegion(supabase, user.id, parsed.data.regionIndex);
    const runUsedQuestionCodes = await getCampaignRunUsedQuestionCodes(supabase, snapshot.campaign.id);

    return NextResponse.json({
      ...snapshot,
      regionQuestionPool: getRegionQuestionBundle(),
      runUsedQuestionCodes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar campanha.' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isRpgModuleEnabled()) {
    return NextResponse.json({ error: 'Módulo RPG desabilitado.' }, { status: 404 });
  }
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== 'reset') {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    const snapshot = await resetRpgCampaign(supabase, user.id);
    return NextResponse.json({
      ...snapshot,
      regionQuestionPool: getRegionQuestionBundle(),
      runUsedQuestionCodes: [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao reiniciar jornada.' },
      { status: 500 }
    );
  }
}
