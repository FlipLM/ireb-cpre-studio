import { NextRequest, NextResponse } from 'next/server';
import { importQuestionsFromJsonText, validateQuestionsPayload } from '@/lib/importer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      rawText?: string;
      filename?: string;
      dryRun?: boolean;
    };

    if (!body.rawText || typeof body.rawText !== 'string') {
      return NextResponse.json(
        { error: 'Envie o conteúdo JSON em rawText.' },
        { status: 400 }
      );
    }

    const filename = body.filename?.trim() || 'questoes.json';

    if (body.dryRun) {
      const { report } = validateQuestionsPayload(body.rawText, filename);
      return NextResponse.json({ dryRun: true, report });
    }

    const report = importQuestionsFromJsonText(body.rawText, filename);
    return NextResponse.json({ dryRun: false, report }, { status: report.valid ? 200 : 422 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao importar JSON.' },
      { status: 400 }
    );
  }
}
