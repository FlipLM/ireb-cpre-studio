import { NextRequest, NextResponse } from 'next/server';
import { cloudCreateNote, cloudDeleteNote, cloudUpdateNote } from '@/lib/cloud-store';
import { getAuthenticatedSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { codigo } = await context.params;
    const body = (await request.json()) as { content?: string };
    if (!body.content || !body.content.trim()) {
      return NextResponse.json(
        { error: 'O conteúdo da anotação não pode estar vazio.' },
        { status: 400 }
      );
    }
    const note = await cloudCreateNote(supabase, user.id, decodeURIComponent(codigo), body.content);
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao salvar anotação.' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const body = (await request.json()) as { id?: number; content?: string };
    if (!body.id || !body.content || !body.content.trim()) {
      return NextResponse.json({ error: 'ID e conteúdo são obrigatórios.' }, { status: 400 });
    }
    const note = await cloudUpdateNote(supabase, Number(body.id), body.content);
    if (!note) {
      return NextResponse.json({ error: 'Anotação não encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao editar anotação.' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ error: 'ID da anotação é obrigatório.' }, { status: 400 });
    }
    const deleted = await cloudDeleteNote(supabase, id);
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao excluir anotação.' },
      { status: 400 }
    );
  }
}
