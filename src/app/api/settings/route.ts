import { NextRequest, NextResponse } from 'next/server';
import {
  cloudGetAppSettings,
  cloudListQuestionsWithProgress,
  cloudUpdateAppSettings,
} from '@/lib/cloud-store';
import { getPreferredGeminiModel, isGeminiConfigured } from '@/lib/gemini';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';
import type { AppSettings } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const [settings, questions] = await Promise.all([
      cloudGetAppSettings(supabase),
      cloudListQuestionsWithProgress(supabase),
    ]);

    return NextResponse.json({
      settings,
      imports: [],
      bankSummary: {
        totalQuestions: questions.length,
        unicaCount: questions.filter((q) => q.tipo === 'unica').length,
        multiplaCount: questions.filter((q) => q.tipo === 'multipla').length,
        withImageCount: questions.filter((q) => Boolean(q.imagem || q.managedImageUrl)).length,
        missingImageCount: questions.filter((q) => q.imageMissing).length,
        aiProviderConfigured: isGeminiConfigured() || Boolean(process.env.OPENAI_API_KEY),
        geminiConfigured: isGeminiConfigured(),
        geminiModel: getPreferredGeminiModel(),
      },
      questionsWithImages: questions.filter((q) => Boolean(q.imagem || q.managedImageUrl)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar configurações.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const patch = (await request.json()) as Partial<AppSettings>;
    const updated = await cloudUpdateAppSettings(supabase, user.id, patch);
    return NextResponse.json({ settings: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao salvar configurações.' },
      { status: 400 }
    );
  }
}
