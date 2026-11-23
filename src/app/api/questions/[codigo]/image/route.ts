import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { upsertQuestionAdminOverride } from '@/lib/repositories/questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo } = await context.params;
    const decoded = decodeURIComponent(codigo).replace(/[^a-zA-Z0-9_-]/g, '');
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nenhum arquivo de imagem enviado.' }, { status: 400 });
    }

    const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
    const ext = (path.extname(file.name) || '.png').toLowerCase();
    if (!allowedExt.includes(ext)) {
      return NextResponse.json(
        { error: 'Formato não suportado. Envie PNG, JPG, WEBP ou SVG.' },
        { status: 400 }
      );
    }

    const mediaDir = path.join(process.cwd(), 'public', 'media', 'questoes');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    const filename = `${decoded}-custom-${Date.now()}${ext}`;
    const targetPath = path.join(mediaDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(targetPath, buffer);

    const publicUrl = `/media/questoes/${encodeURIComponent(filename)}`;
    upsertQuestionAdminOverride({
      questionCodigo: decodeURIComponent(codigo),
      overrideImageUrl: publicUrl,
    });

    return NextResponse.json({ managedImageUrl: publicUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao enviar imagem.' },
      { status: 500 }
    );
  }
}
