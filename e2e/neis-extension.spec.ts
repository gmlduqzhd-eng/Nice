import { chromium, expect, test as base, type Worker } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDemoWorkspace } from '../src/lib/demo';
import { createNeisJob } from '../src/lib/neis-job';

// Types for the real extension worker; no Chrome API is mocked in this suite.
declare const chrome: {
  tabs: { query(query: { url: string }): Promise<{ id: number }[]> };
  action: {
    getBadgeText(details: { tabId: number }): Promise<string>;
    getTitle(details: { tabId: number }): Promise<string>;
  };
  runtime: { getManifest(): { action: { default_title: string } } };
};

const test = base.extend<{
  extension: { worker: Worker; click(): Promise<void>; state(): Promise<{ badge: string; title: string; defaultTitle: string }> };
}>({
  context: async ({ baseURL, viewport, headless, locale, timezoneId }, use) => {
    // Browser-level Extensions CDP commands load and invoke the actual extension.
    // This flag is confined to a fresh, temporary test profile, never a user profile.
    const context = await chromium.launchPersistentContext('', {
      channel: 'chrome', baseURL, viewport, headless, locale, timezoneId,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--enable-unsafe-extension-debugging'],
    });
    try { await use(context); } finally { await context.close(); }
  },
  extension: async ({ context, page }, use) => {
    const session = await context.browser()!.newBrowserCDPSession();
    const { id } = await session.send('Extensions.loadUnpacked', { path: path.resolve('extension/neis-helper') });
    const worker = context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${id}/`))
      ?? await context.waitForEvent('serviceworker', { predicate: worker => worker.url().startsWith(`chrome-extension://${id}/`) });
    const { extensions } = await session.send('Extensions.getExtensions');
    expect(extensions.find(extension => extension.id === id)?.enabled).toBe(true);
    await use({
      worker,
      async click() {
        // Like a toolbar click, Chrome invokes the action on the window's active tab.
        await page.bringToFront();
        const { targetInfos } = await session.send('Target.getTargets', { filter: [{ type: 'tab' }] });
        const tabs = targetInfos.filter(target => target.url === page.url());
        expect(tabs).toHaveLength(1);
        await session.send('Extensions.triggerAction', { id, targetId: tabs[0].targetId });
      },
      async state() {
        return worker.evaluate(async url => {
          const [tab] = await chrome.tabs.query({ url });
          return {
            badge: await chrome.action.getBadgeText({ tabId: tab.id }),
            title: await chrome.action.getTitle({ tabId: tab.id }),
            defaultTitle: chrome.runtime.getManifest().action.default_title,
          };
        }, page.url());
      },
    });
    await session.detach();
  },
});

const job = () => createNeisJob(createDemoWorkspace(), ['student-7']);

test('loaded extension action imports an exported job and fills without saving', async ({ page, extension }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '나이스 작업 도우미', exact: true }).click();
  await page.getByRole('button', { name: '준비된 학생 모두 선택' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '선택한 1명 작업 파일' }).click();
  const raw = await readFile((await (await downloaded).path())!, 'utf8');
  expect(JSON.parse(raw).rows).toEqual(job().rows);

  await page.goto('/neis-practice');
  const panel = page.locator('#damim-neis-helper');
  await expect(panel).toHaveCount(0);
  await extension.click();
  await expect(panel.getByText(/· 확장프로그램/)).toBeVisible();
  // The worker injects into Chrome's isolated world, not the page's JS globals.
  expect(await page.evaluate(() => 'DamimNeis' in globalThis)).toBe(false);
  await panel.getByLabel('작업 JSON 파일').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await panel.getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await panel.getByRole('button', { name: '화면 대조', exact: true }).click();
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await panel.getByRole('button', { name: '대조한 빈칸에 입력' }).click();
  await expect(page.getByLabel('행동특성 및 종합의견', { exact: true })).toHaveValue(job().rows[0].content);
  await expect(panel.getByRole('status')).toContainText('저장 여부는 미확인');
  await expect(page.getByText('아직 가상 저장하지 않았습니다.', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('installed-extension-filled.png'), fullPage: true });

  await extension.click();
  await expect(panel).toHaveCount(0);
  await extension.click();
  await expect(panel.getByRole('button', { name: '대조한 빈칸에 입력' })).toBeDisabled();
  await expect(panel.getByLabel('작업 JSON 파일')).toHaveValue('');
  await expect(page.locator('#practice-content')).toHaveValue(job().rows[0].content);
});

test('loaded extension rechecks the student and preserves existing text', async ({ page, extension }) => {
  await page.goto('/neis-practice');
  await extension.click();
  const panel = page.locator('#damim-neis-helper');
  await panel.getByLabel('작업 JSON 파일').setInputFiles({ name: 'job.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(job())) });
  await panel.getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await panel.getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel.getByRole('button', { name: '대조한 빈칸에 입력' })).toBeEnabled();
  await page.getByLabel('연습 학생 선택').selectOption('2');
  await panel.getByRole('button', { name: '대조한 빈칸에 입력' }).click();
  await expect(panel.getByRole('status')).toContainText('학생 번호');
  await expect(page.locator('#practice-content')).toHaveValue('');
  await page.getByLabel('연습 학생 선택').selectOption('7');
  await page.locator('#practice-content').fill('교사가 이미 작성한 가상 문장');
  await panel.getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('덮어쓰지 않습니다');
  await expect(panel.getByRole('button', { name: '대조한 빈칸에 입력' })).toBeDisabled();
  await expect(page.locator('#practice-content')).toHaveValue('교사가 이미 작성한 가상 문장');
});

test('unsupported page error clears after a successful action on the same tab', async ({ page, extension }) => {
  await page.goto('/');
  await extension.click();
  await expect.poll(async () => (await extension.state()).badge).toBe('!');
  expect((await extension.state()).title).toContain('지원하지 않습니다');
  await expect(page.locator('#damim-neis-helper')).toHaveCount(0);
  await page.goto('/neis-practice');
  await extension.click();
  await expect(page.locator('#damim-neis-helper')).toBeVisible();
  await expect.poll(async () => (await extension.state()).badge).toBe('');
  await expect.poll(async () => (await extension.state()).title).toBe((await extension.state()).defaultTitle);
});

test('action affects only its selected tab and does not auto-run after reload', async ({ page, context, extension }) => {
  await page.goto('/neis-practice?tab=selected');
  const other = await context.newPage();
  await other.goto('/neis-practice?tab=untouched');
  await extension.click();
  await expect(page.locator('#damim-neis-helper')).toBeVisible();
  await expect(other.locator('#damim-neis-helper')).toHaveCount(0);
  await expect(other.locator('#practice-content')).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('heading', { name: '입력 도우미 연습' })).toBeVisible();
  await expect(page.locator('#damim-neis-helper')).toHaveCount(0);
  await extension.click();
  await expect(page.locator('#damim-neis-helper')).toBeVisible();
  await expect(other.locator('#damim-neis-helper')).toHaveCount(0);
});
