import { generateWithGemini, isGeminiConfigured } from '@/lib/gemini';

export interface AIMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AIGenerateResult {
  text: string;
  provider: 'groq' | 'cerebras' | 'openrouter' | 'gemini';
  model: string;
  displayLabel: string;
}

const GROQ_FREE_MODELS = [
  { id: 'qwen/qwen3.8-27b', label: 'Groq • Qwen 3.8 27B' },
  { id: 'openai/gpt-oss-120b', label: 'Groq • GPT-OSS 120B' },
  { id: 'openai/gpt-oss-20b', label: 'Groq • GPT-OSS 20B' },
];

const CEREBRAS_MODELS = [
  { id: 'qwen-3.8-27b', label: 'Cerebras • Qwen 3.8 27B' },
  { id: 'gpt-oss-120b', label: 'Cerebras • GPT-OSS 120B' },
];

// Somente modelos explicitamente ":free" / "openrouter/free" (custo $0.00 garantido)
const OPENROUTER_FREE_MODELS = [
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'OpenRouter • Llama 3.3 (Free)' },
  { id: 'google/gemma-3-27b-it:free', label: 'OpenRouter • Gemma 3 (Free)' },
  { id: 'openrouter/free', label: 'OpenRouter • Auto Free' },
];

export function isGroqConfigured(): boolean {
  return Boolean((process.env.GROQ_API_KEY || '').trim());
}

export function isCerebrasConfigured(): boolean {
  return Boolean((process.env.CEREBRAS_API_KEY || '').trim());
}

export function isOpenRouterConfigured(): boolean {
  return Boolean((process.env.OPENROUTER_API_KEY || '').trim());
}

export function isAnyFreeAIConfigured(): boolean {
  return (
    isGroqConfigured() ||
    isCerebrasConfigured() ||
    isOpenRouterConfigured() ||
    isGeminiConfigured()
  );
}

export function getConfiguredAIProviders(): string[] {
  const list: string[] = [];
  if (isGroqConfigured()) list.push('Groq');
  if (isCerebrasConfigured()) list.push('Cerebras');
  if (isOpenRouterConfigured()) list.push('OpenRouter (Free)');
  if (isGeminiConfigured()) list.push('Gemini');
  return list;
}

async function callOpenAICompatible(params: {
  endpoint: string;
  apiKey: string;
  model: string;
  systemInstruction: string;
  messages: AIMessage[];
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
  extraHeaders?: Record<string, string>;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const openAiMessages = [
    { role: 'system', content: params.systemInstruction },
    ...params.messages.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
    })),
  ];

  const body: Record<string, unknown> = {
    model: params.model,
    messages: openAiMessages,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
  };

  if (params.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(params.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
      ...(params.extraHeaders ?? {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      if (errJson.error?.message) detail = errJson.error.message;
    } catch {
      // ignora
    }
    return { ok: false, status: res.status, detail };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = (data.choices?.[0]?.message?.content ?? '').trim();
  if (!text) {
    return { ok: false, status: 500, detail: 'Resposta vazia' };
  }
  return { ok: true, text };
}

/**
 * Cascata 100% gratuita (sem risco de cobrança):
 * 1. Groq (Llama 3.3 70B -> Llama 3.1 8B)
 * 2. OpenRouter (somente modelos :free / openrouter/free)
 * 3. Gemini (modelos gratuitos com fallback interno)
 */
export async function generateWithFreeCascade(params: {
  systemInstruction: string;
  messages: AIMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'text/plain' | 'application/json';
}): Promise<AIGenerateResult> {
  const temperature = params.temperature ?? 0.5;
  const maxTokens = params.maxOutputTokens ?? 1200;
  const jsonMode = params.responseMimeType === 'application/json';
  const errors: string[] = [];

  // 1. Groq (Free Tier)
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (groqKey) {
    for (const m of GROQ_FREE_MODELS) {
      try {
        const res = await callOpenAICompatible({
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: groqKey,
          model: m.id,
          systemInstruction: params.systemInstruction,
          messages: params.messages,
          temperature,
          maxTokens,
          jsonMode,
        });
        if (res.ok) {
          return {
            text: res.text,
            provider: 'groq',
            model: m.id,
            displayLabel: m.label,
          };
        }
        errors.push(`Groq(${m.id}): ${res.status}`);
      } catch (e) {
        errors.push(`Groq(${m.id}): ${e instanceof Error ? e.message : 'erro'}`);
      }
    }
  }

  // 2. Cerebras
  const cerebrasKey = (process.env.CEREBRAS_API_KEY || '').trim();
  if (cerebrasKey) {
    for (const m of CEREBRAS_MODELS) {
      try {
        const res = await callOpenAICompatible({
          endpoint: 'https://api.cerebras.ai/v1/chat/completions',
          apiKey: cerebrasKey,
          model: m.id,
          systemInstruction: params.systemInstruction,
          messages: params.messages,
          temperature,
          maxTokens,
          jsonMode,
        });
        if (res.ok) {
          return {
            text: res.text,
            provider: 'cerebras',
            model: m.id,
            displayLabel: m.label,
          };
        }
        errors.push(`Cerebras(${m.id}): ${res.status}`);
      } catch (e) {
        errors.push(`Cerebras(${m.id}): ${e instanceof Error ? e.message : 'erro'}`);
      }
    }
  }

  // 3. OpenRouter (STRICTLY :free models only)
  const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (openRouterKey) {
    for (const m of OPENROUTER_FREE_MODELS) {
      // Guarda de segurança: jamais chama modelo pago no OpenRouter
      if (!m.id.endsWith(':free') && m.id !== 'openrouter/free') continue;
      try {
        const res = await callOpenAICompatible({
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          apiKey: openRouterKey,
          model: m.id,
          systemInstruction: params.systemInstruction,
          messages: params.messages,
          temperature,
          maxTokens,
          jsonMode,
          extraHeaders: {
            'HTTP-Referer': 'https://ireb-cpre-studio.vercel.app',
            'X-Title': 'CPRE Studio IREB',
          },
        });
        if (res.ok) {
          return {
            text: res.text,
            provider: 'openrouter',
            model: m.id,
            displayLabel: m.label,
          };
        }
        errors.push(`OpenRouter(${m.id}): ${res.status}`);
      } catch (e) {
        errors.push(`OpenRouter(${m.id}): ${e instanceof Error ? e.message : 'erro'}`);
      }
    }
  }

  // 3. Gemini (Fallback final)
  if (isGeminiConfigured()) {
    try {
      const geminiRes = await generateWithGemini({
        systemInstruction: params.systemInstruction,
        messages: params.messages,
        temperature,
        maxOutputTokens: Math.max(maxTokens, 1500),
        responseMimeType: params.responseMimeType,
      });
      return {
        text: geminiRes.text,
        provider: 'gemini',
        model: geminiRes.model,
        displayLabel: `Gemini • ${geminiRes.model}`,
      };
    } catch (e) {
      errors.push(`Gemini: ${e instanceof Error ? e.message : 'erro'}`);
    }
  }

  throw new Error(
    errors.length > 0
      ? `Todos os provedores gratuitos estão temporariamente ocupados. Tente novamente em alguns segundos.`
      : 'Nenhuma chave de IA gratuita configurada no servidor.'
  );
}
