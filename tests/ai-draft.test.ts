import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiDraft, parseAiDraftInput, redactRosterNames, type AiDraftInput } from '../src/lib/ai-draft';
import { createAiDraftHandler, createAiLimiter, generateAiDraft } from '../src/lib/ai-draft-server';

const input: AiDraftInput = { keywords: '친구 의견 경청, 모둠 협력', evidence: ['친구들의 의견을 모아 발표 순서를 정함.'], length: 'standard' };
const sentence = '친구의 의견을 경청하며 모둠 활동에 협력함. 발표 순서를 함께 정하며 의견을 나눔.';
function request(body: unknown = input, headers: Record<string, string> = {}) {
  return new Request('https://example.invalid/api/ai/draft', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-test-token', ...headers }, body: JSON.stringify(body) });
}
function setup(overrides: Partial<Parameters<typeof createAiDraftHandler>[0]> = {}) {
  const generated: unknown[] = [];
  const authenticated: string[] = [];
  let released = 0;
  const handler = createAiDraftHandler({
    authenticate: async token => { authenticated.push(token); return 'synthetic-user'; },
    generate: async value => { generated.push(value); return sentence; },
    reserve: () => () => { released += 1; },
    ...overrides,
  });
  return { handler, generated, authenticated, releases: () => released };
}

test('AI request contains only explicit writing inputs and enforces field limits', () => {
  assert.deepEqual(parseAiDraftInput(input), input);
  for (const bad of [{ ...input, userId: 'other' }, { ...input, model: 'arbitrary' }, { ...input, length: 'unlimited' }, { ...input, keywords: ' ' }, { ...input, keywords: '가'.repeat(2001) }, { ...input, evidence: Array(11).fill('관찰') }, { ...input, evidence: ['가'.repeat(2001)] }]) assert.equal(parseAiDraftInput(bad), null);
});
test('known roster names are removed, including overlapping names', () => {
  assert.equal(redactRosterNames('강가람과 가람, 윤보라의 의견을 들음.', ['가람', '강가람', '윤보라']), '[학생]과 [학생], [학생]의 의견을 들음.');
});
test('a cancelled request never starts model generation after authentication', async () => {
  const controller = new AbortController();
  const state = setup({ authenticate: async () => { controller.abort(); return 'synthetic-user'; } });
  const response = await state.handler(new Request(request(), { signal: controller.signal }));
  assert.equal(response.status, 504);
  assert.equal(state.generated.length, 0);
});
test('rejects incomplete, markup, placeholder and overlong model outputs', () => {
  assert.equal(normalizeAiDraft(sentence), sentence);
  for (const bad of ['', '설명입니다', '# 제목\n협력함.', '<script>함.</script>', '[학생]은 협력함.', '가'.repeat(501) + '함.']) assert.equal(normalizeAiDraft(bad), null);
});
test('authorized valid request returns completed text and no cache', async () => {
  const state = setup();
  const response = await state.handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { text: sentence });
  assert.deepEqual(state.generated, [input]);
  assert.equal(state.releases(), 1);
});
test('unauthenticated and invalid sessions never call the model', async () => {
  const state = setup({ authenticate: async () => null });
  for (const headers of [{ Authorization: '' }, { Authorization: 'Bearer synthetic-test-token' }]) {
    assert.equal((await state.handler(request(input, headers))).status, 401);
  }
  assert.equal(state.generated.length, 0);
});
test('rejects foreign origin, invalid JSON and payload size before generation', async () => {
  const state = setup();
  assert.equal((await state.handler(request(input, { Origin: 'https://foreign.invalid' }))).status, 403);
  assert.equal((await state.handler(request({ ...input, keywords: '' }))).status, 400);
  const malformed = new Request('https://example.invalid/api/ai/draft', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-test-token' }, body: '{invalid' });
  assert.equal((await state.handler(malformed)).status, 400);
  assert.equal((await state.handler(request({ ...input, keywords: '가'.repeat(30_000) }))).status, 413);
  assert.equal(state.generated.length, 0);
  assert.equal(state.authenticated.length, 0);
});
test('model setup and upstream failures are sanitized and release reservation', async () => {
  for (const [statusCode, expectedCode, expectedStatus] of [[403, 'AI_NOT_READY', 503], [429, 'AI_LIMIT_REACHED', 429], [500, 'AI_UNAVAILABLE', 502]] as const) {
    const state = setup({ generate: async () => { throw Object.assign(new Error('private-key-and-prompt-must-not-leak'), { statusCode }); } });
    const response = await state.handler(request());
    assert.equal(response.status, expectedStatus);
    const body = await response.json();
    assert.equal(body.code, expectedCode);
    assert.doesNotMatch(JSON.stringify(body), /private-key/);
    assert.equal(state.releases(), 1);
  }
});
test('invalid model result never becomes a successful draft', async () => {
  const state = setup({ generate: async () => '미완성 문장' });
  const response = await state.handler(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'AI_INVALID_OUTPUT');
});
test('rejected quota never calls the model', async () => {
  const state = setup({ reserve: () => null });
  assert.equal((await state.handler(request())).status, 429);
  assert.equal(state.generated.length, 0);
});
test('limiter blocks concurrent calls and resets its per-account window', () => {
  let time = 1;
  const reserve = createAiLimiter(() => time);
  const release = reserve('a'); assert.ok(release);
  assert.equal(reserve('a'), null);
  assert.ok(reserve('b')); release();
  for (let i = 1; i < 20; i += 1) { const done = reserve('a'); assert.ok(done); done(); }
  assert.equal(reserve('a'), null);
  time += 60_001;
  assert.ok(reserve('a'));
});

test('installed Google SDK sends the pinned model request and reads the provider response', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'synthetic-test-only';
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    const body = JSON.parse(String(init?.body));
    assert.ok(body.systemInstruction);
    assert.ok(body.contents);
    assert.equal(body.tools, undefined);
    assert.match(JSON.stringify(body.contents), /친구 의견 경청/);
    return Response.json({ candidates: [{ content: { parts: [{ text: sentence }], role: 'model' }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 30, totalTokenCount: 50 } });
  };
  try {
    assert.equal(await generateAiDraft(input, new AbortController().signal), sentence);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousKey;
  }
});
