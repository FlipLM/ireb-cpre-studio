import { NextRequest, NextResponse } from 'next/server';
import { cloudExportLearningHistory, loadStaticRawQuestions } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? 'original';

    if (type === 'history') {
      const history = await cloudExportLearningHistory(supabase);
      return new NextResponse(JSON.stringify(history, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ireb-cpre-historico-estudos.json"',
        },
      });
    }

    const original = loadStaticRawQuestions();
    return new NextResponse(JSON.stringify(original, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="questoes-original-export.json"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao exportar dados.' },
      { status: 500 }
    );
  }
}
