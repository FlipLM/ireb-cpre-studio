/**
 * Cliente server-side para a API oficial do Google Gemini (Gemini 3.1).
 * Utiliza exclusivamente variáveis de ambiente no servidor (nunca expostas ao cliente).
 */

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GeminiGenerateResult {
  text: string;
  model: string;
}

const DEFAULT_MODEL_CANDIDATES = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
];

export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getPreferredGeminiModel(): string {
  return (process.env.GEMINI_MODEL || '').trim() || DEFAULT_MODEL_CANDIDATES[0];
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

function buildModelFallbackList(): string[] {
  const preferred = getPreferredGeminiModel();
  const list = [preferred, ...DEFAULT_MODEL_CANDIDATES];
  return Array.from(new Set(list));
}

export async function generateWithGemini(params: {
  systemInstruction: string;
  messages: GeminiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'text/plain' | 'application/json';
}): Promise<GeminiGenerateResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no servidor.');
  }

  const modelsToTry = buildModelFallbackList();
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: params.systemInstruction }],
      },
      contents: params.messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
      generationConfig: {
        temperature: params.temperature ?? 0.5,
        maxOutputTokens: params.maxOutputTokens ?? 512,
        ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 404 || response.status === 503 || response.status === 429) {
      // Modelo indisponível, sobrecarregado ou com cota temporária — tenta o próximo candidato
      lastError = new Error(`Modelo ${model} indisponível (HTTP ${response.status}).`);
      continue;
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string } };
        if (errJson.error?.message) {
          detail = errJson.error.message;
        }
      } catch {
        // ignora erro de parse
      }
      throw new Error(`Falha na API Gemini (${model}): ${detail}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!text) {
      lastError = new Error(`Resposta vazia do modelo ${model}.`);
      continue;
    }

    return { text, model };
  }

  throw (
    lastError ??
    new Error(
      'Os modelos do Gemini estão temporariamente ocupados ou no limite por minuto. Aguarde alguns segundos e tente novamente.'
    )
  );
}
