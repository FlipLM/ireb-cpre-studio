import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rota de Keep-Alive (mesmo padrão do Cia do Lacre):
 * Executada automaticamente pelo Cron da Vercel a cada 3 dias (vercel.json)
 * para manter o projeto Supabase gratuito sempre ativo e evitar pausa por inatividade.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      ok: false,
      motivo: 'Supabase não configurado',
      verificadoEm: new Date().toISOString(),
    });
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/app_keepalive?select=id&limit=1`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          verificadoEm: new Date().toISOString(),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: response.status,
      verificadoEm: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        motivo: 'Erro ao consultar o Supabase',
        verificadoEm: new Date().toISOString(),
      },
      { status: 502 }
    );
  }
}
