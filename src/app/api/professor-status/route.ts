import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OverlayMood = 'idle' | 'thinking' | 'angry_slam' | 'celebrate_clap';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const rawWindow = Number(searchParams.get('windowMinutes') ?? '120');
    const rawTarget = Number(searchParams.get('target') ?? '10');

    const windowMinutes = Number.isFinite(rawWindow)
      ? Math.max(5, Math.min(720, Math.round(rawWindow)))
      : 120;
    const targetQuestions = Number.isFinite(rawTarget)
      ? Math.max(1, Math.min(100, Math.round(rawTarget)))
      : 10;

    const cutoffIso = new Date(Date.now() - windowMinutes * 60_000).toISOString();

    const [windowRes, latestRes] = await Promise.all([
      supabase
        .from('user_attempts')
        .select('question_codigo, created_at')
        .gte('created_at', cutoffIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_attempts')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (windowRes.error) throw new Error(windowRes.error.message);
    if (latestRes.error) throw new Error(latestRes.error.message);

    const uniqueQuestions = new Set(
      (windowRes.data ?? [])
        .map((row: { question_codigo?: string | null }) => row.question_codigo)
        .filter((code): code is string => Boolean(code))
    );
    const answeredInWindow = uniqueQuestions.size;
    const remaining = Math.max(0, targetQuestions - answeredInWindow);
    const goalMet = answeredInWindow >= targetQuestions;

    const lastAttemptAt: string | null = latestRes.data?.created_at ?? null;
    const minutesSinceLastAttempt = lastAttemptAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastAttemptAt).getTime()) / 60_000))
      : null;

    const warningThreshold = Math.round(windowMinutes * 0.75);
    let mood: OverlayMood = 'idle';
    let stressed = false;
    let message = `Meta em dia! ${answeredInWindow}/${targetQuestions} questões nas últimas ${Math.round(windowMinutes / 60)}h.`;

    if (goalMet) {
      mood = 'idle';
      stressed = false;
      message = `Mandou bem! ${answeredInWindow}/${targetQuestions} questões feitas.`;
    } else if (minutesSinceLastAttempt === null || minutesSinceLastAttempt >= windowMinutes) {
      mood = 'angry_slam';
      stressed = true;
      message =
        answeredInWindow === 0
          ? `OBJEÇÃO! Já faz mais de ${Math.round(windowMinutes / 60)}h sem responder ${targetQuestions} questões!`
          : `Faltam ${remaining} questões! Toca aqui e bora estudar!`;
    } else if (minutesSinceLastAttempt >= warningThreshold) {
      mood = 'thinking';
      stressed = false;
      message = `Faltam ${remaining} questões para bater a meta de ${targetQuestions}.`;
    } else {
      mood = 'idle';
      stressed = false;
      message = `${answeredInWindow}/${targetQuestions} questões feitas. Continue assim!`;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const realtime =
      session?.access_token &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? {
            url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
            anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim(),
            accessToken: session.access_token,
          }
        : null;

    return NextResponse.json({
      windowMinutes,
      targetQuestions,
      answeredInWindow,
      remaining,
      goalMet,
      lastAttemptAt,
      minutesSinceLastAttempt,
      mood,
      stressed,
      message,
      checkedAt: new Date().toISOString(),
      realtime,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao consultar status do professor.' },
      { status: 500 }
    );
  }
}
