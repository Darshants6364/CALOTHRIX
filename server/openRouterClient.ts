export const DEFAULT_OPENROUTER_TEXT_MODELS = [
  'google/gemini-2.5-flash-lite',
  'meta-llama/llama-3.3-70b-instruct:free',
  'openai/gpt-4o-mini',
  'qwen/qwen-2.5-72b-instruct',
] as const;

export const DEFAULT_OPENROUTER_VISION_MODELS = [
  'google/gemini-2.5-flash-lite',
  'qwen/qwen2.5-vl-72b-instruct',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'google/gemini-2.0-flash-001',
] as const;

export const DEFAULT_OPENROUTER_AUDIO_MODELS = [
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.0-flash-001',
] as const;

function parseEnvModelList(envValue: string | undefined, fallback: readonly string[]): string[] {
  const custom = (envValue || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return custom.length > 0 ? Array.from(new Set([...custom, ...fallback])) : [...fallback];
}

export function getOpenRouterTextModels(): string[] {
  return parseEnvModelList(process.env.OPENROUTER_TEXT_MODEL, DEFAULT_OPENROUTER_TEXT_MODELS);
}

export function getOpenRouterVisionModels(): string[] {
  return parseEnvModelList(process.env.OPENROUTER_VISION_MODEL, DEFAULT_OPENROUTER_VISION_MODELS);
}

export function getOpenRouterAudioModels(): string[] {
  return parseEnvModelList(process.env.OPENROUTER_AUDIO_MODEL, DEFAULT_OPENROUTER_AUDIO_MODELS);
}

export function getOpenRouterApiKey(): string {
  return (process.env.OPENROUTER_API_KEY || '').trim();
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(getOpenRouterApiKey());
}

export function getOpenRouterAudioFormat(rawMime?: string): string {
  const clean = (rawMime || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (clean.includes('wav')) return 'wav';
  if (clean.includes('mpeg') || clean.includes('mp3')) return 'mp3';
  if (clean.includes('mp4') || clean.includes('m4a')) return 'm4a';
  if (clean.includes('ogg')) return 'ogg';
  if (clean.includes('flac')) return 'flac';
  if (clean.includes('aac')) return 'aac';
  return 'webm';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } };

interface OpenRouterErrorDetails {
  statusCode: number;
  message: string;
  retryable: boolean;
  tryNextModel: boolean;
}

function extractOpenRouterErrorDetails(status: number, bodyText: string): OpenRouterErrorDetails {
  let rawMessage = bodyText || `OpenRouter API error (${status})`;
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string; code?: number | string };
    };
    if (parsed.error?.message) rawMessage = parsed.error.message;
  } catch {
    // Keep bodyText
  }

  if (status === 401 || status === 403 || /invalid.*key|unauthorized|auth/i.test(rawMessage)) {
    return {
      statusCode: 401,
      message: 'OpenRouter backup API key is invalid or unauthorized. Please verify OPENROUTER_API_KEY.',
      retryable: false,
      tryNextModel: false,
    };
  }

  if (status === 402 || /insufficient credits|payment required|quota/i.test(rawMessage)) {
    return {
      statusCode: 402,
      message: 'OpenRouter backup credits are exhausted. Please check your OpenRouter account balance.',
      retryable: false,
      tryNextModel: false,
    };
  }

  if (status === 429 || /rate limit|too many requests|temporarily rate-limited/i.test(rawMessage)) {
    return {
      statusCode: 429,
      message: 'OpenRouter backup rate limit reached temporarily (429). Please wait a few seconds and try again.',
      retryable: true,
      tryNextModel: true,
    };
  }

  if (
    status === 404 ||
    /no endpoints found|not a valid model|model not found|provider returned error/i.test(rawMessage)
  ) {
    return {
      statusCode: 502,
      message: 'Selected OpenRouter backup model is temporarily unavailable.',
      retryable: true,
      tryNextModel: true,
    };
  }

  if (status === 413 || /payload too large|entity too large|too large/i.test(rawMessage)) {
    return {
      statusCode: 413,
      message: 'Uploaded photo or voice clip is too large. Please try a smaller/clearer clip or photo.',
      retryable: false,
      tryNextModel: false,
    };
  }

  if (status >= 500 && status <= 504) {
    return {
      statusCode: status === 504 ? 504 : 503,
      message: 'OpenRouter backup AI service is temporarily busy. Please try again shortly.',
      retryable: true,
      tryNextModel: true,
    };
  }

  return {
    statusCode: status >= 400 && status < 600 ? status : 500,
    message: rawMessage.slice(0, 220),
    retryable: status === 400,
    tryNextModel: status === 400,
  };
}

export async function callOpenRouterChatJson(opts: {
  models: readonly string[];
  systemInstruction?: string;
  userContent: string | OpenRouterContentPart[];
  timeoutMs?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    const err = new Error('OPENROUTER_API_KEY is not configured.') as Error & {
      statusCode?: number;
      expose?: boolean;
    };
    err.statusCode = 503;
    err.expose = true;
    throw err;
  }

  const timeoutMs = opts.timeoutMs ?? 25000;
  const referer =
    (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://calothrix.app').trim();
  let lastError: Error = new Error('OpenRouter backup request failed.');

  for (let idx = 0; idx < opts.models.length; idx++) {
    const model = opts.models[idx];
    if (idx > 0) {
      await delay(300 * idx);
    }

    let useJsonFormat = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const messages: Array<{
          role: 'system' | 'user';
          content: string | OpenRouterContentPart[];
        }> = [];
        if (opts.systemInstruction) {
          messages.push({ role: 'system', content: opts.systemInstruction });
        }
        messages.push({ role: 'user', content: opts.userContent });

        const payload: Record<string, unknown> = {
          model,
          messages,
          temperature: opts.temperature ?? 0.2,
        };
        if (useJsonFormat) {
          payload.response_format = { type: 'json_object' };
        }

        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': referer,
            'X-Title': 'CALOTHRIX',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) {
          const bodyText = await resp.text();
          if (
            resp.status === 400 &&
            useJsonFormat &&
            /response_format|json_object|json mode|structured/i.test(bodyText)
          ) {
            useJsonFormat = false;
            continue;
          }

          const details = extractOpenRouterErrorDetails(resp.status, bodyText);
          console.warn(
            `[openRouterAi] attempt failed (${model}, status=${resp.status}, retryable=${details.retryable}): ${bodyText.slice(0, 300)}`
          );
          const err = new Error(details.message) as Error & {
            statusCode?: number;
            expose?: boolean;
          };
          err.statusCode = details.statusCode;
          err.expose = true;
          lastError = err;

          if (!details.tryNextModel) {
            throw err;
          }
          break;
        }

        const data = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string }> | null } }>;
        };
        const rawChoice = data.choices?.[0]?.message?.content;
        const content =
          typeof rawChoice === 'string'
            ? rawChoice.trim()
            : Array.isArray(rawChoice)
            ? rawChoice
                .map((c) => (typeof c?.text === 'string' ? c.text : ''))
                .join('\n')
                .trim()
            : '';
        if (content) {
          return content;
        }

        lastError = new Error('OpenRouter returned an empty response. Please try again.') as Error & {
          statusCode?: number;
          expose?: boolean;
        };
        (lastError as Error & { statusCode?: number; expose?: boolean }).statusCode = 502;
        (lastError as Error & { statusCode?: number; expose?: boolean }).expose = true;
        break;
      } catch (err) {
        clearTimeout(timer);
        if ((err as { name?: string })?.name === 'AbortError') {
          const timeoutErr = new Error(
            'OpenRouter backup AI analysis timed out. Please try again with a smaller/clearer clip or photo.'
          ) as Error & { statusCode?: number; expose?: boolean };
          timeoutErr.statusCode = 504;
          timeoutErr.expose = true;
          lastError = timeoutErr;
          console.warn(`[openRouterAi] timeout (${model}) after ${timeoutMs}ms`);
          break;
        }

        const anyErr = err as Error & { statusCode?: number; expose?: boolean };
        if (anyErr?.expose && anyErr.statusCode && anyErr.statusCode < 500 && anyErr.statusCode !== 429) {
          throw anyErr;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[openRouterAi] error (${model}): ${lastError.message}`);
        break;
      }
    }
  }

  const finalErr = lastError as Error & { statusCode?: number; expose?: boolean };
  if (!finalErr.statusCode) finalErr.statusCode = 503;
  finalErr.expose = true;
  throw finalErr;
}
