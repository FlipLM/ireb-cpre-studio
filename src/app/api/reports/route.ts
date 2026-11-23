import { NextRequest, NextResponse } from 'next/server';
import { cloudGetDetailedReports } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period');
    const periodDays =
      periodParam && periodParam !== 'all' ? Number.parseInt(periodParam, 10) : null;

    const data = await cloudGetDetailedReports(
      supabase,
      Number.isFinite(periodDays) ? periodDays : null
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar relatórios.' },
      { status: 500 }
    );
  }
}
