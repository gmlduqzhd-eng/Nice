import { expect, test, type Page } from '@playwright/test';
import { mockSupabase } from './helpers/supabase';

const keywords = '친구 의견 경청, 모둠 협력, 맡은 역할 책임감';
const sentence = '친구의 의견을 경청하며 모둠 활동에 협력함. 맡은 역할을 책임감 있게 수행하는 태도를 보임.';
const editor = (page: Page) => page.getByRole('textbox', { name: '나이스에 입력할 문장', exact: true });
async function prepare(page: Page, baseURL: string) {
  const auth = await mockSupabase(page, baseURL);
  await auth.completeMagicLink();
  await page.getByRole('button', { name: '계정 알림 닫기', exact: true }).click();
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '나이스 입력 준비', exact: true }).click();
  await expect(editor(page)).toBeVisible();
  return auth;
}

test('keywords produce a preview; only applying replaces the draft and resets review', async ({ page, baseURL }, testInfo) => {
  await prepare(page, baseURL!);
  let calls = 0;
  await page.route('**/api/ai/draft', async route => {
    calls += 1;
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual(['evidence', 'keywords', 'length']);
    expect(body.keywords).toBe(keywords);
    expect(body.evidence).toHaveLength(1);
    expect(body.length).toBe('standard');
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({ json: { text: sentence } });
  });
  await editor(page).fill(keywords);
  await page.getByRole('button', { name: '검토 완료', exact: true }).click();
  await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
  await page.getByRole('button', { name: 'AI 생성', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI 생성 초안' })).toBeVisible();
  await expect(editor(page)).toHaveValue(keywords);
  await expect(page.getByRole('button', { name: '검토 완료', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('ai-draft-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ai-draft-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '이 문장 적용', exact: true }).click();
  await expect(editor(page)).toHaveValue(sentence);
  await expect(page.getByRole('button', { name: '검토 완료', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '문장 복사', exact: true })).toBeDisabled();
  expect(calls).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '나이스 입력 준비', exact: true }).click();
  await expect(editor(page)).toHaveValue(sentence);
});

test('only selected facts are sent, roster names are hidden, and preview cancellation preserves keywords', async ({ page, baseURL }) => {
  await prepare(page, baseURL!);
  await editor(page).fill(`강가람 ${keywords}`);
  await page.getByLabel('선택한 관찰 근거 1건도 함께 반영').uncheck();
  await page.getByLabel('AI 문장 분량').selectOption('short');
  await page.route('**/api/ai/draft', async route => {
    expect(route.request().postDataJSON()).toEqual({ keywords: `[학생] ${keywords}`, evidence: [], length: 'short' });
    await route.fulfill({ json: { text: sentence } });
  });
  await page.getByRole('button', { name: 'AI 생성', exact: true }).click();
  await page.getByRole('button', { name: '취소 · 기존 내용 유지', exact: true }).click();
  await expect(editor(page)).toHaveValue(`강가람 ${keywords}`);
  await expect(page.getByRole('heading', { name: 'AI 생성 초안' })).toHaveCount(0);
});

test('missing AI setup is explained without replacing keywords or inventing a result', async ({ page, baseURL }) => {
  await prepare(page, baseURL!);
  await editor(page).fill(keywords);
  await page.route('**/api/ai/draft', route => route.fulfill({ status: 503, json: { code: 'AI_NOT_READY', message: 'must not render raw upstream content' } }));
  await page.getByRole('button', { name: 'AI 생성', exact: true }).click();
  await expect(page.getByRole('region', { name: 'AI 문장 생성' }).getByRole('alert')).toContainText('AI 연결 설정을 확인해야 합니다');
  await expect(editor(page)).toHaveValue(keywords);
  await expect(page.getByRole('button', { name: '이 문장 적용', exact: true })).toHaveCount(0);
  await expect(page.getByText('must not render raw upstream content')).toHaveCount(0);
});

test('an edit while generating discards the delayed response', async ({ page, baseURL }) => {
  await prepare(page, baseURL!);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let called = false;
  await page.route('**/api/ai/draft', async route => { called = true; await gate; await route.fulfill({ json: { text: sentence } }).catch(() => {}); });
  await editor(page).fill(keywords);
  await page.getByRole('button', { name: 'AI 생성', exact: true }).click();
  await expect.poll(() => called).toBe(true);
  await editor(page).fill('생성 기다리는 동안 추가로 적은 관찰');
  release();
  await expect(page.getByRole('button', { name: 'AI 생성', exact: true })).toBeEnabled();
  await expect(editor(page)).toHaveValue('생성 기다리는 동안 추가로 적은 관찰');
  await expect(page.getByRole('heading', { name: 'AI 생성 초안' })).toHaveCount(0);
});

test('changing students discards the old generation and keeps the new draft', async ({ page, baseURL }) => {
  await prepare(page, baseURL!);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let called = false;
  await page.route('**/api/ai/draft', async route => { called = true; await gate; await route.fulfill({ json: { text: sentence } }).catch(() => {}); });
  await editor(page).fill(keywords);
  await page.getByRole('button', { name: 'AI 생성', exact: true }).click();
  await expect.poll(() => called).toBe(true);
  await page.locator('.student-list').getByRole('button', { name: /윤보라/ }).click();
  const before = await editor(page).inputValue();
  release();
  await expect(editor(page)).toHaveValue(before);
  await expect(page.getByRole('heading', { name: 'AI 생성 초안' })).toHaveCount(0);
});

test('guest AI action opens login without sending any generation request', async ({ page, baseURL }) => {
  await mockSupabase(page, baseURL!);
  let calls = 0;
  await page.route('**/api/ai/draft', route => { calls += 1; return route.abort(); });
  await page.goto('/');
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '나이스 입력 준비', exact: true }).click();
  await editor(page).fill(keywords);
  await page.getByRole('button', { name: 'AI 생성', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(calls).toBe(0);
});

test('cancelled generation keeps keywords and allows a fresh request', async ({ page, baseURL }) => {
  await prepare(page, baseURL!);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route('**/api/ai/draft', async route => {
    calls += 1;
    if (calls === 1) await gate;
    await route.fulfill({ json: { text: sentence } }).catch(() => {});
  });
  await editor(page).fill(keywords);
  await page.getByRole('button', { name: 'AI 생성', exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole('button', { name: '생성 취소', exact: true }).click();
  release();
  await expect(editor(page)).toHaveValue(keywords);
  await expect(page.getByRole('heading', { name: 'AI 생성 초안' })).toHaveCount(0);
  await page.getByRole('button', { name: 'AI 생성', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI 생성 초안' })).toBeVisible();
  expect(calls).toBe(2);
});
