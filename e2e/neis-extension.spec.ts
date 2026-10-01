import { chromium, expect, test as base, type Locator, type Page, type Worker } from '@playwright/test';
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
  scripting: {
    executeScript<T>(details: { target: { tabId: number }; func: () => T }): Promise<{ result: T }[]>;
  };
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

const semesterJob = () => ({
  format: 'damim-neis-job', version: 2, task: 'semester-subject-opinion', subject: '체육',
  createdAt: new Date().toISOString(), classroom: { year: 2026, grade: 5, room: '1', semester: 2 },
  rows: [{ number: 7, name: '백아람', content: '가상 체육 관찰: 공을 주고받는 활동에서 규칙을 지키며 참여함.' }],
});

async function semesterPractice(page: Page) {
  await page.goto('/neis-practice?task=semester');
  await page.getByLabel('연습 학년', { exact: true }).selectOption('5');
  await page.getByLabel('연습 반', { exact: true }).fill('1');
  await expect(page.getByRole('heading', { name: '학기말 종합의견 입력 연습' })).toBeVisible();
}

test('loaded semester extension matches the subject and selected grid row without saving', async ({ page, extension }, testInfo) => {
  await semesterPractice(page); await extension.click();
  const panel = page.locator('#damim-neis-helper');
  const file = semesterJob();
  await panel.getByLabel('작업 JSON 파일').setInputFiles({ name: 'semester.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await panel.getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await panel.getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel.locator('#fill')).toBeEnabled();
  const requests: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()); });
  await panel.locator('#fill').click();
  await expect(page.getByLabel('학기말 종합의견', { exact: true })).toHaveValue(file.rows[0].content);
  await expect(panel.getByRole('status')).toContainText('저장 여부는 미확인');
  await expect(page.getByText('아직 가상 학기말 저장하지 않았습니다.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('semester-opinion-cell-2')).toContainText('행을 선택하면');
  expect(requests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('semester-extension-filled.png'), fullPage: true });
});

test('semester extension refuses another subject, term, student row, closed notice and existing opinion', async ({ page, extension }) => {
  await semesterPractice(page); await extension.click();
  const panel = page.locator('#damim-neis-helper');
  await panel.getByLabel('작업 JSON 파일').setInputFiles({ name: 'semester.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(semesterJob())) });
  const map = () => panel.getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  const inspect = () => panel.getByRole('button', { name: '화면 대조', exact: true }).click();
  await map();
  await page.getByLabel('연습 교과', { exact: true }).fill('국어');
  await inspect(); await expect(panel.getByRole('status')).toContainText('교과'); await expect(panel.locator('#fill')).toBeDisabled();
  await page.getByLabel('연습 교과', { exact: true }).fill('체육');
  await page.getByLabel('연습 학기', { exact: true }).selectOption('1');
  await inspect(); await expect(panel.getByRole('status')).toContainText('학기'); await expect(panel.locator('#fill')).toBeDisabled();
  await page.getByLabel('연습 학기', { exact: true }).selectOption('2');
  await map();
  await panel.getByRole('button', { name: /학생 이름 다시 지정/ }).click();
  await page.getByTestId('semester-name-2').click();
  await inspect(); await expect(panel.locator('#fill')).toBeDisabled();
  await expect(page.getByLabel('학기말 종합의견', { exact: true })).toHaveValue('');
  await map();
  await page.getByLabel('가상 마감 안내 표시').check();
  await inspect(); await expect(panel.getByRole('status')).toContainText('마감'); await expect(panel.locator('#fill')).toBeDisabled();
  await page.getByLabel('가상 마감 안내 표시').uncheck();
  await page.getByLabel('학기말 종합의견', { exact: true }).fill('가상 기존 의견');
  await inspect(); await expect(panel.getByRole('status')).toContainText('덮어쓰지'); await expect(panel.locator('#fill')).toBeDisabled();
  await expect(page.getByLabel('학기말 종합의견', { exact: true })).toHaveValue('가상 기존 의견');
  await page.getByLabel('학기말 종합의견', { exact: true }).fill('');
  await page.getByRole('columnheader', { name: '학기말 종합의견', exact: true }).evaluate(element => { element.textContent = '다른 기록'; });
  await inspect(); await expect(panel.locator('#fill')).toBeDisabled();
  await expect(page.getByLabel('학기말 종합의견', { exact: true })).toHaveValue('');
});

for (const semester of [1, 2] as const) {
  test(`closed semester comparison validates exact context without preparing or writing in term ${semester}`, async ({ page, extension }) => {
    await semesterPractice(page);
    await page.getByLabel('연습 학기', { exact: true }).selectOption(String(semester));
    await extension.click();
    const panel = page.locator('#damim-neis-helper');
    const field = page.getByLabel('학기말 종합의견', { exact: true });
    const file = semesterJob(); file.classroom.semester = semester;
    await panel.getByLabel('작업 JSON 파일').setInputFiles({ name: 'closed-semester.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await panel.getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
    await page.getByLabel('가상 마감 안내 표시').check();
    await page.evaluate(() => {
      const counts = { input: 0, change: 0, submit: 0 };
      (window as Window & { comparisonEffects?: typeof counts }).comparisonEffects = counts;
      for (const type of ['input', 'change', 'submit'] as const) document.addEventListener(type, () => { counts[type]++; }, true);
    });
    let nonGetRequests = 0;
    page.on('request', request => { if (request.method() !== 'GET') nonGetRequests++; });
    const inspect = () => panel.getByRole('button', { name: '화면 대조', exact: true }).click();
    async function beginProtectedInterval() {
      // Finish deliberate fixture edits, including their blur/change events,
      // before measuring the compare or fill action itself.
      await page.locator('a[href="/"]').focus();
      await page.evaluate(() => {
        const effects = (window as Window & { comparisonEffects?: { input: number; change: number; submit: number } }).comparisonEffects;
        if (!effects) throw new Error('Comparison event instrumentation is not initialized.');
        effects.input = 0; effects.change = 0; effects.submit = 0;
      });
      nonGetRequests = 0;
    }
    async function expectReadOnlyEffects() {
      expect(await page.evaluate(() => (window as Window & {
        comparisonEffects?: { input: number; change: number; submit: number };
      }).comparisonEffects)).toEqual({ input: 0, change: 0, submit: 0 });
      expect(nonGetRequests).toBe(0);
      await expect(page.getByText('아직 가상 학기말 저장하지 않았습니다.', { exact: true })).toBeVisible();
      await expect(page.locator('.practice-saved')).toHaveCount(0);
    }
    const comparedButClosed = '학급·교과·학생 정보 대조를 마쳤습니다. 마감 안내가 있어 입력은 중단합니다. 기존 문장은 변경하지 않았습니다.';

    await page.getByLabel('연습 교과', { exact: true }).fill('국어');
    await beginProtectedInterval(); await inspect();
    await expect(panel.getByRole('status')).toContainText('교과 값이 작업 파일과 다릅니다');
    await expect(panel.getByRole('status')).not.toContainText(comparedButClosed);
    await expect(panel.locator('#fill')).toBeDisabled();
    await expect(field).toHaveValue(''); await expectReadOnlyEffects();

    await page.getByLabel('연습 교과', { exact: true }).fill('체육');
    await page.getByLabel('연습 학기', { exact: true }).selectOption(String(semester === 1 ? 2 : 1));
    await beginProtectedInterval(); await inspect();
    await expect(panel.getByRole('status')).toContainText('학기 값이 작업 파일과 다릅니다');
    await expect(panel.getByRole('status')).not.toContainText(comparedButClosed);
    await expect(panel.locator('#fill')).toBeDisabled();
    await expect(field).toHaveValue(''); await expectReadOnlyEffects();

    await page.getByLabel('연습 학기', { exact: true }).selectOption(String(semester));
    await beginProtectedInterval(); await inspect();
    await expect(panel.getByRole('status')).toContainText(comparedButClosed);
    await expect(panel.locator('#fill')).toBeDisabled();
    await expect(field).toHaveValue(''); await expectReadOnlyEffects();
    // DOM tampering cannot turn a comparison-only result into a prepared write.
    await panel.locator('#fill').evaluate(element => { (element as HTMLButtonElement).disabled = false; });
    await beginProtectedInterval(); await panel.locator('#fill').click();
    await expect(field).toHaveValue(''); await expectReadOnlyEffects();

    await field.fill('가상 기존 학기말 의견을 보존해야 함.');
    await beginProtectedInterval(); await inspect();
    await expect(panel.getByRole('status')).toContainText('덮어쓰지');
    await expect(panel.getByRole('status')).not.toContainText(comparedButClosed);
    await expect(panel.locator('#fill')).toBeDisabled();
    await expect(field).toHaveValue('가상 기존 학기말 의견을 보존해야 함.'); await expectReadOnlyEffects();

    await field.fill('');
    await page.getByLabel('가상 마감 안내 표시').uncheck();
    await beginProtectedInterval(); await inspect();
    await expect(panel.locator('#fill')).toBeEnabled();
    await expect(field).toHaveValue(''); await expectReadOnlyEffects();
    // A valid preparation made before closure still passes through the strict
    // write guard when the page changes to a closed notice before fill.
    await page.getByLabel('가상 마감 안내 표시').check();
    await beginProtectedInterval(); await panel.locator('#fill').click();
    await expect(panel.getByRole('status')).toContainText('마감 안내가 있어 추가 확인이 필요합니다');
    await expect(panel.locator('#fill')).toBeDisabled();
    await expect(field).toHaveValue(''); await expectReadOnlyEffects();
  });
}

type DiagnosticReport = {
  format: 'damim-neis-diagnostic';
  schemaVersion: 1;
  helperVersion: '0.5.0';
  pageKind: 'neis' | 'practice';
  visibleCounts: { textareas: number; textInputs: number; iframes: number; canvases: number; contenteditables: number };
  selection: {
    kind: 'textarea' | 'text-input' | 'other' | 'none';
    connected: boolean;
    visible: boolean;
    editable: boolean;
    labelSources: { ariaLabel: boolean; htmlLabel: boolean; ariaLabelledby: boolean };
    hasEditorRegion: boolean;
    editableTextControlCount: number;
  };
  reasonCodes: string[];
  result: 'candidate' | 'needs-review' | 'unselected';
};

async function downloadDiagnostic(page: Page, panel: Locator) {
  const downloaded = page.waitForEvent('download');
  await panel.locator('#diagnostic-download').click();
  const raw = await readFile((await (await downloaded).path())!, 'utf8');
  const report = JSON.parse(raw) as DiagnosticReport;
  // An allowlist protects the export from newly added DOM text, attributes or URLs.
  expect(Object.keys(report).sort()).toEqual([
    'format', 'helperVersion', 'pageKind', 'reasonCodes', 'result', 'schemaVersion', 'selection', 'visibleCounts',
  ]);
  expect(Object.keys(report.visibleCounts).sort()).toEqual(['canvases', 'contenteditables', 'iframes', 'textInputs', 'textareas']);
  expect(Object.keys(report.selection).sort()).toEqual([
    'connected', 'editable', 'editableTextControlCount', 'hasEditorRegion', 'kind', 'labelSources', 'visible',
  ]);
  expect(Object.keys(report.selection.labelSources).sort()).toEqual(['ariaLabel', 'ariaLabelledby', 'htmlLabel']);
  expect(report).toMatchObject({ format: 'damim-neis-diagnostic', schemaVersion: 1, helperVersion: '0.5.0', pageKind: 'practice' });
  const reasonCodes = [
    'FIELD_UNSELECTED', 'FIELD_DISCONNECTED', 'FIELD_NOT_VISIBLE', 'UNSUPPORTED_FIELD', 'FIELD_NOT_EDITABLE',
    'LABEL_CONNECTION_MISSING', 'ARIA_LABELLEDBY_UNVERIFIED', 'EDITOR_REGION_MISSING', 'EDITOR_TEXT_CONTROL_COUNT',
    'SEMESTER_FIELD_CELL_UNVERIFIED', 'SEMESTER_ROW_NOT_SELECTED', 'SEMESTER_CLOSED_NOTICE',
  ];
  expect(report.reasonCodes.every(code => reasonCodes.includes(code))).toBe(true);
  return { raw, report };
}

async function storageFingerprint(page: Page) {
  return page.evaluate(async () => {
    const entries = (storage: Storage) => Object.keys(storage).sort().map(key => [key, storage.getItem(key)]);
    const bytes = new TextEncoder().encode(JSON.stringify([entries(localStorage), entries(sessionStorage)]));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  });
}

test('loaded semester diagnostic explains closed and readonly guards without reading or writing opinion text', async ({ page, extension }) => {
  await semesterPractice(page);
  const field = page.locator('#practice-content');
  await field.fill('원인 안내 점검에 사용한 가상 기존 의견');
  await extension.click();
  const panel = page.locator('#damim-neis-helper');
  await page.getByLabel('가상 마감 안내 표시').check();
  // Finish fixture setup before counting diagnostic effects. The subsequent
  // deliberate notice toggle is not an opinion-input or save event.
  await field.focus();
  await field.evaluate(element => {
    const counts = { input: 0, change: 0, submit: 0 };
    (window as Window & { semesterDiagnosticEvents?: typeof counts }).semesterDiagnosticEvents = counts;
    element.addEventListener('input', () => { counts.input++; });
    element.addEventListener('change', () => { counts.change++; });
    document.addEventListener('submit', () => { counts.submit++; }, true);
  });
  await extension.worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const field = document.getElementById('practice-content') as HTMLTextAreaElement;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
        const counts = { reads: 0, writes: 0 };
        Object.defineProperty(field, 'value', {
          configurable: true,
          get() { counts.reads++; return descriptor.get!.call(this); },
          set(value: string) { counts.writes++; descriptor.set!.call(this, value); },
        });
        (globalThis as typeof globalThis & { semesterDiagnosticAccess?: () => typeof counts }).semesterDiagnosticAccess = () => ({ ...counts });
      },
    });
  }, page.url());
  const beforeStorage = await storageFingerprint(page);
  let nonGetRequests = 0;
  page.on('request', request => { if (request.method() !== 'GET') nonGetRequests++; });
  await expect(panel.locator('#inspect')).toBeDisabled();
  await expect(panel.locator('#fill')).toBeDisabled();
  await panel.locator('#diagnostic-pick').click();
  await field.click();
  await expect(panel.locator('#diagnostic-reasons')).toContainText('학생부 반별 마감 안내가 보입니다.');
  const closed = await downloadDiagnostic(page, panel);
  expect(closed.report.result).toBe('needs-review');
  expect(closed.report.reasonCodes).toContain('SEMESTER_CLOSED_NOTICE');

  await page.getByLabel('가상 마감 안내 표시').uncheck();
  await panel.locator('#diagnostic-check').click();
  await expect(panel.locator('#diagnostic-reasons').locator('li')).toHaveCount(0);
  await expect(panel.locator('#diagnostic-status')).toContainText('일반 입력칸 후보');
  const reopened = await downloadDiagnostic(page, panel);
  expect(reopened.report.result).toBe('candidate');
  expect(reopened.report.reasonCodes).toEqual([]);

  await field.evaluate(element => { (element as HTMLTextAreaElement).readOnly = true; });
  await panel.locator('#diagnostic-check').click();
  await expect(panel.locator('#diagnostic-reasons')).toContainText('선택한 입력칸은 현재 수정할 수 없습니다.');
  const readonly = await downloadDiagnostic(page, panel);
  expect(readonly.report.result).toBe('needs-review');
  expect(readonly.report.reasonCodes).toContain('FIELD_NOT_EDITABLE');
  expect(readonly.report.selection.editable).toBe(false);
  for (const { raw } of [closed, reopened, readonly]) {
    for (const privateValue of ['원인 안내 점검에 사용한 가상 기존 의견', '백아람', '윤보라', 'practice-content', page.url()]) {
      expect(raw.includes(privateValue)).toBe(false);
    }
  }
  const access = await extension.worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (globalThis as typeof globalThis & {
        semesterDiagnosticAccess: () => { reads: number; writes: number };
      }).semesterDiagnosticAccess(),
    });
    return result;
  }, page.url());
  expect(access).toEqual({ reads: 0, writes: 0 });
  // Verify that the isolated-world instrumentation is live after the protected
  // interval; return its counter only, never the synthetic opinion itself.
  const positiveControl = await extension.worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        void (document.getElementById('practice-content') as HTMLTextAreaElement).value;
        return (globalThis as typeof globalThis & {
          semesterDiagnosticAccess: () => { reads: number; writes: number };
        }).semesterDiagnosticAccess();
      },
    });
    return result;
  }, page.url());
  expect(positiveControl).toEqual({ reads: 1, writes: 0 });
  expect(await page.evaluate(() => (window as Window & {
    semesterDiagnosticEvents?: { input: number; change: number; submit: number };
  }).semesterDiagnosticEvents)).toEqual({ input: 0, change: 0, submit: 0 });
  await expect(field).toHaveValue('원인 안내 점검에 사용한 가상 기존 의견');
  await expect(page.getByText('아직 가상 학기말 저장하지 않았습니다.', { exact: true })).toBeVisible();
  await expect(page.locator('.practice-saved')).toHaveCount(0);
  await expect(panel.locator('#inspect')).toBeDisabled();
  await expect(panel.locator('#fill')).toBeDisabled();
  expect(nonGetRequests).toBe(0);
  expect(await storageFingerprint(page)).toBe(beforeStorage);
});

test('loaded extension diagnoses without a job and exports only structural metadata', async ({ page, extension }) => {
  await page.goto('/neis-practice?diagnostic=fake-private-query');
  await page.locator('#practice-content').fill('진단에 포함되면 안 되는 가상 기존 문장');
  await page.evaluate(() => {
    const field = document.getElementById('practice-content') as HTMLTextAreaElement;
    for (const label of Array.from(field.labels)) {
      label.htmlFor = 'fake-private-field-id';
      label.textContent = '가상 비공개 라벨 원문';
    }
    field.id = 'fake-private-field-id';
    field.setAttribute('aria-label', '가상 비공개 접근성 라벨');
    const counts = { input: 0, change: 0, submit: 0 };
    (window as Window & { diagnosticEventCounts?: typeof counts }).diagnosticEventCounts = counts;
    for (const type of ['input', 'change', 'submit'] as const) {
      document.addEventListener(type, () => { counts[type]++; }, true);
    }
  });
  const beforeStorage = await storageFingerprint(page);
  let nonGetRequests = 0;
  page.on('request', request => { if (request.method() !== 'GET') nonGetRequests++; });
  await extension.click();
  const panel = page.locator('#damim-neis-helper');
  // Instrument the extension's own isolated world: page-world getters cannot
  // detect reads made by an installed content script in Chrome's isolated world.
  await extension.worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const field = document.getElementById('fake-private-field-id') as HTMLTextAreaElement;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
        let valueReads = 0;
        Object.defineProperty(field, 'value', {
          configurable: true,
          get() { valueReads++; return descriptor.get!.call(this); },
          set(value: string) { descriptor.set!.call(this, value); },
        });
        (globalThis as typeof globalThis & { diagnosticValueReads?: () => number }).diagnosticValueReads = () => valueReads;
      },
    });
  }, page.url());
  await expect(panel.getByLabel('작업 JSON 파일')).toHaveValue('');
  await expect(panel.locator('#inspect')).toBeDisabled();
  await expect(panel.locator('#fill')).toBeDisabled();
  await panel.locator('#diagnostic-check').click();
  const initial = await downloadDiagnostic(page, panel);
  expect(initial.report.result).toBe('unselected');
  expect(initial.report.reasonCodes).toEqual(['FIELD_UNSELECTED']);
  await panel.locator('#diagnostic-pick').click();
  // The initially edited field may stay focused. Diagnostic buttons must not
  // blur it and trigger a change event or a page's blur-based saving behavior.
  const focusedBeforeSelection = await page.evaluate(() => document.activeElement?.id);
  await page.locator('#fake-private-field-id').click();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe(focusedBeforeSelection);
  const selected = await downloadDiagnostic(page, panel);
  expect(selected.report).toEqual({
    format: 'damim-neis-diagnostic', schemaVersion: 1, helperVersion: '0.5.0', pageKind: 'practice',
    visibleCounts: { textareas: 1, textInputs: 0, iframes: 0, canvases: 0, contenteditables: 0 },
    selection: {
      kind: 'textarea', connected: true, visible: true, editable: true,
      labelSources: { ariaLabel: true, htmlLabel: true, ariaLabelledby: false },
      hasEditorRegion: true, editableTextControlCount: 1,
    },
    reasonCodes: [], result: 'candidate',
  });
  for (const secret of [
    '백아람', '윤보라', '2026학년도', '가상 학생 편집', 'fake-private-query', 'fake-private-field-id',
    '가상 비공개 라벨 원문', '가상 비공개 접근성 라벨', '진단에 포함되면 안 되는 가상 기존 문장', page.url(),
  ]) {
    expect(initial.raw.includes(secret)).toBe(false);
    expect(selected.raw.includes(secret)).toBe(false);
  }
  const valueReads = await extension.worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (globalThis as typeof globalThis & { diagnosticValueReads: () => number }).diagnosticValueReads(),
    });
    return result;
  }, page.url());
  expect(valueReads).toBe(0);
  const instrumentedReads = await extension.worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Positive control happens after diagnostics and returns the count only.
        void (document.getElementById('fake-private-field-id') as HTMLTextAreaElement).value;
        return (globalThis as typeof globalThis & { diagnosticValueReads: () => number }).diagnosticValueReads();
      },
    });
    return result;
  }, page.url());
  expect(instrumentedReads).toBe(1);
  await expect(page.locator('#fake-private-field-id')).toHaveValue('진단에 포함되면 안 되는 가상 기존 문장');
  await expect(page.getByText('아직 가상 저장하지 않았습니다.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & {
    diagnosticEventCounts?: { input: number; change: number; submit: number };
  }).diagnosticEventCounts)).toEqual({ input: 0, change: 0, submit: 0 });
  expect(nonGetRequests).toBe(0);
  expect(await storageFingerprint(page)).toBe(beforeStorage);
  await expect(panel.locator('#inspect')).toBeDisabled();
  await expect(panel.locator('#fill')).toBeDisabled();
});

test('loaded extension keeps unsupported diagnostic structures under review', async ({ page, extension }) => {
  await page.goto('/neis-practice');
  await extension.click();
  const panel = page.locator('#damim-neis-helper');
  const scenarios = [
    { type: 'iframe', kind: 'other', code: 'UNSUPPORTED_FIELD', count: 'iframes' },
    { type: 'canvas', kind: 'other', code: 'UNSUPPORTED_FIELD', count: 'canvases' },
    { type: 'contenteditable', kind: 'other', code: 'UNSUPPORTED_FIELD', count: 'contenteditables' },
    { type: 'readonly', kind: 'textarea', code: 'FIELD_NOT_EDITABLE' },
    { type: 'labelledby', kind: 'textarea', code: 'ARIA_LABELLEDBY_UNVERIFIED' },
    { type: 'multiple', kind: 'textarea', code: 'EDITOR_TEXT_CONTROL_COUNT' },
  ] as const;
  let nonGetRequests = 0;
  page.on('request', request => { if (request.method() !== 'GET') nonGetRequests++; });
  for (const scenario of scenarios) {
    await page.evaluate(type => {
      const form = document.createElement('form');
      form.id = 'fake-diagnostic-structure';
      form.style.cssText = 'position:fixed;top:12px;left:12px;width:500px;padding:20px;background:white;z-index:1';
      const target = document.createElement(type === 'iframe' || type === 'canvas' ? type : type === 'contenteditable' ? 'div' : 'textarea');
      target.id = 'fake-private-structure-target';
      target.style.cssText = 'display:block;width:300px;height:80px';
      if (target instanceof HTMLIFrameElement) target.srcdoc = '<p>가상 iframe 내용</p>';
      if (target instanceof HTMLTextAreaElement) {
        target.value = '외부로 내보내지 않는 가상 기존 문장';
        target.readOnly = type === 'readonly';
        if (type !== 'labelledby') target.setAttribute('aria-label', '가상 구조 입력칸 원문');
      }
      if (type === 'contenteditable') {
        target.contentEditable = 'true';
        target.textContent = '가상 전용 편집기 내용';
      }
      if (type === 'labelledby') {
        const label = document.createElement('span');
        label.id = 'fake-private-label-id';
        label.textContent = '가상 aria-labelledby 원문';
        form.append(label);
        target.setAttribute('aria-labelledby', label.id);
      }
      form.append(target);
      if (type === 'multiple') {
        const other = document.createElement('textarea');
        other.setAttribute('aria-label', '가상 두 번째 입력칸');
        form.append(other);
      }
      const counts = { input: 0, change: 0, submit: 0 };
      (window as Window & { diagnosticStructureEvents?: typeof counts }).diagnosticStructureEvents = counts;
      for (const eventType of ['input', 'change', 'submit'] as const) {
        form.addEventListener(eventType, () => { counts[eventType]++; });
      }
      document.body.append(form);
    }, scenario.type);
    await panel.locator('#diagnostic-pick').click();
    const target = page.locator('#fake-private-structure-target');
    if (scenario.type === 'iframe') {
      // Covers the top-level unsupported-element branch, not interaction inside a frame.
      await target.dispatchEvent('click');
    } else {
      await target.click();
    }
    const { raw, report } = await downloadDiagnostic(page, panel);
    expect(report.result, scenario.type).toBe('needs-review');
    expect(report.selection.kind, scenario.type).toBe(scenario.kind);
    expect(report.reasonCodes, scenario.type).toContain(scenario.code);
    if ('count' in scenario) expect(report.visibleCounts[scenario.count]).toBe(1);
    if (scenario.type === 'labelledby') expect(report.selection.labelSources.ariaLabelledby).toBe(true);
    if (scenario.type === 'multiple') expect(report.selection.editableTextControlCount).toBe(2);
    for (const secret of [
      'fake-private-structure-target', 'fake-private-label-id', '가상 iframe 내용', '가상 전용 편집기 내용',
      '가상 aria-labelledby 원문', '가상 구조 입력칸 원문', '외부로 내보내지 않는 가상 기존 문장',
    ]) expect(raw.includes(secret)).toBe(false);
    if (scenario.kind === 'textarea') await expect(target).toHaveValue('외부로 내보내지 않는 가상 기존 문장');
    expect(await page.evaluate(() => (window as Window & {
      diagnosticStructureEvents?: { input: number; change: number; submit: number };
    }).diagnosticStructureEvents)).toEqual({ input: 0, change: 0, submit: 0 });
    await expect(panel.locator('#inspect')).toBeDisabled();
    await expect(panel.locator('#fill')).toBeDisabled();
    await page.locator('#fake-diagnostic-structure').evaluate(element => element.remove());
  }
  expect(nonGetRequests).toBe(0);
  await expect(page.getByText('아직 가상 저장하지 않았습니다.', { exact: true })).toBeVisible();
});

test('loaded extension recalculates removed diagnostic selections before downloading', async ({ page, extension }) => {
  await page.goto('/neis-practice');
  await extension.click();
  const panel = page.locator('#damim-neis-helper');
  await panel.locator('#diagnostic-pick').click();
  await page.locator('#practice-content').click();
  const first = await downloadDiagnostic(page, panel);
  expect(first.report.result).toBe('candidate');
  expect(first.report.selection.connected).toBe(true);
  await page.locator('#practice-content').evaluate(element => element.remove());
  // Download itself must recompute, without requiring another screen-check click.
  const stale = await downloadDiagnostic(page, panel);
  expect(stale.report.result).toBe('needs-review');
  expect(stale.report.reasonCodes).toContain('FIELD_DISCONNECTED');
  expect(stale.report.selection.connected).toBe(false);
  expect(stale.report.selection.visible).toBe(false);
  expect(stale.report.visibleCounts.textareas).toBe(0);
  await page.locator('form[aria-label="가상 학생 편집"]').evaluate(form => {
    const replacement = document.createElement('textarea');
    replacement.id = 'fake-private-replacement';
    replacement.setAttribute('aria-label', '가상 교체 입력칸 라벨 원문');
    replacement.rows = 3;
    form.append(replacement);
  });
  await panel.locator('#diagnostic-pick').click();
  await page.locator('#fake-private-replacement').click();
  const replacement = await downloadDiagnostic(page, panel);
  expect(replacement.report.result).toBe('candidate');
  expect(replacement.report.reasonCodes).toEqual([]);
  expect(replacement.report.selection.connected).toBe(true);
  expect(replacement.report.visibleCounts.textareas).toBe(1);
  expect(replacement.raw.includes('fake-private-replacement')).toBe(false);
  expect(replacement.raw.includes('가상 교체 입력칸 라벨 원문')).toBe(false);
  await expect(page.locator('#fake-private-replacement')).toHaveValue('');
  await expect(panel.locator('#inspect')).toBeDisabled();
  await expect(panel.locator('#fill')).toBeDisabled();
});

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
