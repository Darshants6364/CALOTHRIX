export const GROQ_TEXT_MODELS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant',
] as const;

export const GROQ_VISION_MODELS = [
  'qwen/qwen3.8-27b',
] as const;

export const GROQ_AUDIO_MODELS = [
  'whisper-large-v3-turbo',
  'whisper-large-v3',
] as const;

export function getGroqApiKey(): string {
  return (process.env.GROQ_API_KEY || '').trim();
}

export function isGroqConfigured(): boolean {
  return Boolean(getGroqApiKey());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function parseLooseJsonObject(raw: string): Record<string, unknown> {
  let cleaned = (raw || '').trim();
  // Strip reasoning blocks if a reasoning-capable model emits them
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown code fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as Record<string, unknown>;
    }
  } catch {
    // Try extracting the outermost JSON object
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(slice);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  throw new Error('Could not parse structured JSON from Groq response.');
}

export interface GroqErrorDetails {
  statusCode: number;
  message: string;
  retryable: boolean;
  tryNextModel: boolean;
}

export function extractGroqErrorDetails(status: number, bodyText: string): GroqErrorDetails {
  let rawMessage = bodyText || `Groq API error (${status})`;
  let errorCode = '';

  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string; type?: string; code?: string };
    };
    if (parsed.error?.message) rawMessage = parsed.error.message;
    if (parsed.error?.code) errorCode = parsed.error.code;
  } catch {
    // Keep bodyText
  }

  if (status === 401 || status === 403 || /invalid_api_key|unauthorized/i.test(rawMessage)) {
    return {
      statusCode: 401,
      message: 'Groq API key is invalid or unauthorized. Please verify GROQ_API_KEY in Render Environment Variables.',
      retryable: false,
      tryNextModel: false,
    };
  }

  if (status === 429 || /rate_limit|tokens per minute|requests per minute/i.test(rawMessage)) {
    return {
      statusCode: 429,
      message: 'Groq free-tier rate limit reached temporarily (429). Please wait a few seconds and try again.',
      retryable: true,
      tryNextModel: true,
    };
  }

  if (
    status === 404 ||
    /model_not_found|model_decommissioned|does not exist|decommissioned/i.test(`${errorCode} ${rawMessage}`)
  ) {
    return {
      statusCode: 502,
      message: 'Selected Groq model is temporarily unavailable.',
      retryable: true,
      tryNextModel: true,
    };
  }

  if (status === 413 || /request entity too large|payload too large|too large/i.test(rawMessage)) {
    return {
      statusCode: 413,
      message: 'Uploaded photo or voice clip is too large for Groq. Please try a smaller/clearer clip or photo.',
      retryable: false,
      tryNextModel: false,
    };
  }

  if (status >= 500 && status <= 504) {
    return {
      statusCode: status === 504 ? 504 : 503,
      message: 'Groq AI service is temporarily busy. Please wait a few seconds and try again.',
      retryable: true,
      tryNextModel: true,
    };
  }

  return {
    statusCode: status >= 400 && status < 600 ? status : 500,
    message: rawMessage.slice(0, 220),
    retryable: false,
    tryNextModel: false,
  };
}

export type GroqContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export async function callGroqChatJson(opts: {
  models: readonly string[];
  systemInstruction?: string;
  userContent: string | GroqContentPart[];
  timeoutMs?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    const err = new Error('GROQ_API_KEY is not configured.') as Error & { statusCode?: number; expose?: boolean };
    err.statusCode = 503;
    err.expose = true;
    throw err;
  }

  const timeoutMs = opts.timeoutMs ?? 20000;
  let lastError: Error = new Error('Groq request failed.');

  for (let idx = 0; idx < opts.models.length; idx++) {
    const model = opts.models[idx];
    if (idx > 0) {
      await delay(350 * idx);
    }

    let useJsonFormat = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const messages: Array<{ role: 'system' | 'user'; content: string | GroqContentPart[] }> = [];
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

        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) {
          const bodyText = await resp.text();
          // Retry once without response_format if a multimodal model dislikes json_object mode
          if (
            resp.status === 400 &&
            useJsonFormat &&
            /response_format|json_object|json mode/i.test(bodyText)
          ) {
            useJsonFormat = false;
            continue;
          }

          const details = extractGroqErrorDetails(resp.status, bodyText);
          console.warn(
            `[groqAi] chat attempt failed (${model}, status=${resp.status}, retryable=${details.retryable}): ${bodyText.slice(0, 300)}`
          );
          const err = new Error(details.message) as Error & { statusCode?: number; expose?: boolean };
          err.statusCode = details.statusCode;
          err.expose = true;
          lastError = err;

          if (!details.tryNextModel) {
            throw err;
          }
          break; // Try next model
        }

        const data = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const content = (data.choices?.[0]?.message?.content || '').trim();
        if (content) {
          return content;
        }
        lastError = new Error('Groq returned an empty response. Please try again.') as Error & {
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
            'AI analysis took too long and timed out. Please try again with a smaller/clearer clip or photo.'
          ) as Error & { statusCode?: number; expose?: boolean };
          timeoutErr.statusCode = 504;
          timeoutErr.expose = true;
          lastError = timeoutErr;
          console.warn(`[groqAi] chat timeout (${model}) after ${timeoutMs}ms`);
          break; // Try next model
        }

        const anyErr = err as Error & { statusCode?: number; expose?: boolean };
        if (anyErr?.expose && anyErr.statusCode && anyErr.statusCode < 500 && anyErr.statusCode !== 429) {
          throw anyErr;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[groqAi] chat error (${model}): ${lastError.message}`);
        break;
      }
    }
  }

  const finalErr = lastError as Error & { statusCode?: number; expose?: boolean };
  if (!finalErr.statusCode) finalErr.statusCode = 503;
  finalErr.expose = true;
  throw finalErr;
}

function getAudioExtensionAndMime(rawMime?: string): { ext: string; mime: string } {
  const clean = (rawMime || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (clean.includes('mp4') || clean.includes('m4a')) return { ext: 'm4a', mime: 'audio/mp4' };
  if (clean.includes('mpeg') || clean.includes('mp3')) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (clean.includes('wav')) return { ext: 'wav', mime: 'audio/wav' };
  if (clean.includes('ogg')) return { ext: 'ogg', mime: 'audio/ogg' };
  if (clean.includes('flac')) return { ext: 'flac', mime: 'audio/flac' };
  return { ext: 'webm', mime: 'audio/webm' };
}

export async function transcribeAudioWithGroq(opts: {
  base64Audio: string;
  mimeType?: string;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    const err = new Error('GROQ_API_KEY is not configured.') as Error & { statusCode?: number; expose?: boolean };
    err.statusCode = 503;
    err.expose = true;
    throw err;
  }

  const cleanBase64 = opts.base64Audio.replace(/^data:[^;]+;base64,/, '').trim();
  const bytes = base64ToUint8Array(cleanBase64);
  const { ext, mime } = getAudioExtensionAndMime(opts.mimeType);
  const timeoutMs = opts.timeoutMs ?? 20000;

  let lastError: Error = new Error('Voice transcription failed.');

  for (let idx = 0; idx < GROQ_AUDIO_MODELS.length; idx++) {
    const model = GROQ_AUDIO_MODELS[idx];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const form = new FormData();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
      form.append('file', blob, `meal-recording.${ext}`);
      form.append('model', model);
      form.append('response_format', 'json');

      const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const bodyText = await resp.text();
        const details = extractGroqErrorDetails(resp.status, bodyText);
        console.warn(`[groqAi] whisper failed (${model}, status=${resp.status}): ${bodyText.slice(0, 300)}`);
        const err = new Error(details.message) as Error & { statusCode?: number; expose?: boolean };
        err.statusCode = details.statusCode;
        err.expose = true;
        lastError = err;
        if (!details.tryNextModel) throw err;
        continue;
      }

      const data = (await resp.json()) as { text?: string };
      const text = (data.text || '').trim();
      if (text) return text;
      lastError = new Error('Could not detect speech in the recording. Please speak clearly or type your meal.');
      (lastError as Error & { statusCode?: number; expose?: boolean }).statusCode = 400;
      (lastError as Error & { statusCode?: number; expose?: boolean }).expose = true;
    } catch (err) {
      clearTimeout(timer);
      if ((err as { name?: string })?.name === 'AbortError') {
        const timeoutErr = new Error('Voice transcription timed out. Please try a shorter recording.') as Error & {
          statusCode?: number;
          expose?: boolean;
        };
        timeoutErr.statusCode = 504;
        timeoutErr.expose = true;
        lastError = timeoutErr;
        continue;
      }
      const anyErr = err as Error & { statusCode?: number; expose?: boolean };
      if (anyErr?.expose && anyErr.statusCode && anyErr.statusCode < 500 && anyErr.statusCode !== 429) {
        throw anyErr;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError;
}
