import { createClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { AI_DRAFT_INSTRUCTIONS, AI_DRAFT_MODEL, AI_MESSAGES, aiDraftPrompt, normalizeAiDraft, parseAiDraftInput, type AiDraftInput, type AiErrorCode } from './ai-draft';

class AiRequestError extends Error {
  constructor(readonly code: AiErrorCode, readonly status: number) { super(code); }
}

type Dependencies = {
  authenticate: (token: string, signal: AbortSignal) => Promise<string | null>;
  generate: (input: AiDraftInput, signal: AbortSignal) => Promise<string>;
  reserve: (userId: string) => (() => void) | null;
};

// Per-instance burst/concurrency protection; this is not a durable billing quota.
export function createAiLimiter(now = Date.now) {
  const entries = new Map<string, { expires: number; count: number; active: boolean }>();
  return (id: string): (() => void) | null => {
    const time = now();
    for (const [key, entry] of entries) if (entry.expires <= time && !entry.active) entries.delete(key);
    const entry = entries.get(id) ?? { expires: time + 60_000, count: 0, active: false };
    if (entry.active || entry.count >= 20 || (!entries.has(id) && entries.size >= 1000)) return null;
    entry.active = true; entry.count += 1; entries.set(id, entry);
    return () => { entry.active = false; };
  };
}

async function authenticate(token: string, signal: AbortSignal) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key?.startsWith('sb_publishable_')) throw new AiRequestError('AI_NOT_READY', 503);
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal, cache: 'no-store' }) },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) return null;
  return data.user.id;
}

export async function generateAiDraft(input: AiDraftInput, signal: AbortSignal) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) throw new AiRequestError('AI_NOT_READY', 503);
  const result = await generateText({
    model: google(AI_DRAFT_MODEL),
    instructions: AI_DRAFT_INSTRUCTIONS,
    prompt: aiDraftPrompt(input),
    maxOutputTokens: 1600,
    reasoning: 'minimal',
    maxRetries: 0,
    abortSignal: signal,
  });
  if (result.finishReason !== 'stop') throw new AiRequestError('AI_INVALID_OUTPUT', 502);
  return result.text;
}

const reserve = createAiLimiter();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function readBody(request: Request, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const limit = 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new AiRequestError('AI_INPUT_TOO_LARGE', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AiRequestError('AI_INVALID_INPUT', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  // Cancelling closes pending reads immediately. Do not await the underlying
  // stream's cancellation, which can itself stall after a client disconnect.
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new AiRequestError('AI_INPUT_TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AiRequestError('AI_INVALID_INPUT', 400); }
}

export function createAiDraftHandler(dependencies: Dependencies = { authenticate, generate: generateAiDraft, reserve }) {
  return async (request: Request): Promise<Response> => {
    let release: (() => void) | undefined;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
    try {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return json({ code: 'AI_INVALID_INPUT', message: AI_MESSAGES.AI_INVALID_INPUT }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AiRequestError('AI_INVALID_INPUT', 400);
      const authorization = request.headers.get('authorization') ?? '';
      if (!/^Bearer \S{10,8192}$/.test(authorization)) throw new AiRequestError('AI_LOGIN_REQUIRED', 401);
      const input = parseAiDraftInput(await readBody(request, signal));
      if (!input) throw new AiRequestError('AI_INVALID_INPUT', 400);
      const userId = await dependencies.authenticate(authorization.slice(7), signal);
      signal.throwIfAborted();
      if (!userId) throw new AiRequestError('AI_LOGIN_REQUIRED', 401);
      release = dependencies.reserve(userId) ?? undefined;
      if (!release) throw new AiRequestError('AI_LIMIT_REACHED', 429);
      const text = normalizeAiDraft(await dependencies.generate(input, signal));
      signal.throwIfAborted();
      if (!text) throw new AiRequestError('AI_INVALID_OUTPUT', 502);
      return json({ text });
    } catch (error) {
      let code: AiErrorCode = 'AI_UNAVAILABLE';
      let status = 502;
      if (error instanceof AiRequestError) { code = error.code; status = error.status; }
      else if (signal.aborted) { code = 'AI_TIMEOUT'; status = 504; }
      else if (error && typeof error === 'object' && 'statusCode' in error) {
        if ([401, 402, 403].includes(Number(error.statusCode))) { code = 'AI_NOT_READY'; status = 503; }
        else if (error.statusCode === 429) { code = 'AI_LIMIT_REACHED'; status = 429; }
      }
      // Never expose provider errors, tokens or teacher-authored text in responses/logs.
      return json({ code, message: AI_MESSAGES[code] }, status);
    } finally { release?.(); }
  };
}
