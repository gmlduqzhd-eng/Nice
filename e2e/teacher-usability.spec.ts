import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDemoWorkspace } from '../src/lib/demo';
import { getIssues } from '../src/lib/domain';
import { workspaceStorageKey } from '../src/lib/workspace-storage';

async function downloadObservationDraft(page: Page) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: '관찰 초안 TXT 내려받기', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^담임노트_관찰초안_.*\.txt$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, 'utf8');
}

test('unfinished observation survives cancelling Escape and a confirmed close restores the opener', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: '관찰 기록 추가', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  const content = dialog.getByRole('textbox', { name: '관찰한 내용', exact: true });
  await expect(content).toBeFocused();
  await content.fill('가상 체육 활동에서 친구와 순서를 정하며 참여함.');
  page.once('dialog', async confirmation => { expect(confirmation.message()).toContain('저장하지 않은 관찰'); await confirmation.dismiss(); });
  await content.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(content).toHaveValue('가상 체육 활동에서 친구와 순서를 정하며 참여함.');
  page.once('dialog', async confirmation => { await confirmation.accept(); });
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.getByRole('button', { name: /쌓인 관찰 기록/ })).toContainText('12');
  await opener.click();
  await dialog.getByRole('combobox', { name: '기록 분류', exact: true }).selectOption('체육');
  await content.fill('가상 체육 활동에서 규칙을 확인하고 친구의 차례를 기다림.');
  await dialog.getByRole('button', { name: '기록 저장', exact: true }).click();
  await page.getByRole('button', { name: '관찰 노트', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: '친구의 차례를 기다림' })).toContainText('체육');
});

test('mobile menu hides closed controls, traps keyboard focus, closes with Escape and focuses the selected page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '관찰 노트', exact: true })).toHaveCount(0);
  const trigger = page.getByRole('button', { name: '메뉴 열기', exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /^업무 한눈에/ })).toBeFocused();
  await page.getByRole('button', { name: '메뉴 닫기', exact: true }).press('Shift+Tab');
  await expect(page.getByRole('button', { name: '설정 및 백업', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.getByRole('button', { name: '관찰 노트', exact: true }).click();
  await expect(page.getByRole('heading', { name: '관찰 노트', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('#main-content')).toBeFocused();
  const search = page.getByRole('textbox', { name: '관찰 기록 검색' });
  await expect(search).toHaveCSS('font-size', '16px');
  await expect(page.getByRole('button', { name: '관찰 노트', exact: true })).toHaveCount(0);
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});

test('dashboard exposes every check and searches tolerate surrounding spaces', async ({ page }) => {
  await page.goto('/');
  const issueList = page.locator('.issue-list');
  await expect(issueList.getByRole('button')).toHaveCount(5);
  await page.getByRole('button', { name: '점검 항목 전체보기', exact: true }).click();
  await expect(issueList.getByRole('button')).toHaveCount(getIssues(createDemoWorkspace()).length);
  await page.getByRole('button', { name: '5건만 보기', exact: true }).click();
  await expect(issueList.getByRole('button')).toHaveCount(5);
  await page.getByRole('button', { name: '관찰 노트', exact: true }).click();
  await page.getByRole('textbox', { name: '관찰 기록 검색' }).fill('  백아람  ');
  await expect(page.getByRole('article')).toHaveCount(createDemoWorkspace().observations.filter(item => item.studentId === 'student-7').length);
  for (const article of await page.getByRole('article').all()) await expect(article).toContainText('백아람');
});

test('an empty roster routes record creation to student setup instead of opening an unusable form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설정 및 백업', exact: true }).click();
  const data = createDemoWorkspace();
  data.students = []; data.observations = []; data.drafts = [];
  page.once('dialog', async dialog => { await dialog.accept(); });
  await page.getByLabel('JSON 백업 파일 선택', { exact: true }).setInputFiles({ name: 'fictional-empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await page.getByRole('button', { name: '문장 작성·검토', exact: true }).click();
  await expect(page.getByRole('heading', { name: '학생 명부를 먼저 준비해 주세요.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '업무 한눈에', exact: false }).click();
  await page.getByRole('button', { name: '관찰 기록 추가', exact: true }).click();
  await expect(page.getByRole('heading', { name: '학급 · 명부', level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a second tab conflict preserves an unfinished observation and offers its draft without overwriting the newer records', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/');
  await page.getByRole('button', { name: '관찰 기록 추가', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const content = dialog.getByRole('textbox', { name: '관찰한 내용', exact: true });
  const draft = '가상 체육 활동에서 친구와 순서를 정함.\n친구의 차례를 기다리고 함께 규칙을 확인함.';
  await dialog.getByRole('combobox', { name: '학생', exact: true }).selectOption('student-7');
  await dialog.getByLabel('관찰 날짜', { exact: true }).fill('2026-10-01');
  await dialog.getByRole('combobox', { name: '기록 분류', exact: true }).selectOption('체육');
  await content.fill(draft);

  await other.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '학급 · 명부', exact: true }).click();
  await other.getByLabel('학생 번호', { exact: true }).fill('9');
  await other.getByLabel('학생 이름', { exact: true }).fill('가상새학생');
  await other.getByRole('button', { name: '학생 추가', exact: true }).click();
  const key = workspaceStorageKey(null);
  const newerRaw = await other.evaluate(key => localStorage.getItem(key), key);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('기록 충돌이나 저장 실패로 관찰 저장을 중지했습니다.', { exact: true })).toBeVisible();
  await expect(content).toHaveValue(draft);
  await expect(content).toHaveAttribute('readonly', '');
  await expect(dialog.getByRole('combobox', { name: '학생', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('관찰 날짜', { exact: true })).toBeDisabled();
  await expect(dialog.getByRole('combobox', { name: '기록 분류', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '기록 저장', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '저장하고 다음 학생', exact: true })).toBeDisabled();
  await dialog.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit());

  const backup = await downloadObservationDraft(page);
  expect(backup).toContain('학생: 7번 백아람');
  expect(backup).toContain('관찰 날짜: 2026-10-01');
  expect(backup).toContain('기록 분류: 체육');
  expect(backup).toContain(draft);
  expect(backup).toContain('앱의 관찰 기록에는 저장되지 않았습니다.');
  await expect(dialog.getByRole('status')).toContainText('앱의 기록에는 저장되지 않았습니다.');
  expect(await other.evaluate(key => localStorage.getItem(key), key)).toBe(newerRaw);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(newerRaw);
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  page.once('dialog', async confirmation => { expect(confirmation.message()).toContain('저장하지 않은 관찰'); await confirmation.dismiss(); });
  await content.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(content).toHaveValue(draft);
  page.once('dialog', async confirmation => { await confirmation.accept(); });
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await other.close();
});

test('a quota failure preserves an edited observation as a readable draft and leaves the saved original unchanged', async ({ page }) => {
  const data = createDemoWorkspace();
  const key = workspaceStorageKey(null);
  const originalRaw = JSON.stringify(data);
  await page.goto('/');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: originalRaw });
  await page.reload();
  await page.getByRole('button', { name: '관찰 노트', exact: true }).click();
  const original = data.observations[0];
  const student = data.students.find(item => item.id === original.studentId)!;
  await page.getByRole('button', { name: `${student.name} ${original.date} 관찰 수정`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const content = dialog.getByRole('textbox', { name: '관찰한 내용', exact: true });
  const draft = '가상 모둠 활동에서 친구의 설명을 듣고 준비물을 함께 정리함.';
  await dialog.getByLabel('관찰 날짜', { exact: true }).fill('2026-10-02');
  await dialog.getByRole('combobox', { name: '기록 분류', exact: true }).selectOption('창의적 체험활동');
  await content.fill(draft);
  await page.evaluate(key => {
    const originalSetItem = Storage.prototype.setItem;
    document.documentElement.dataset.observationQuotaWrites = '0';
    Storage.prototype.setItem = function (storageKey, value) {
      if (this === localStorage && storageKey === key) {
        document.documentElement.dataset.observationQuotaWrites = String(Number(document.documentElement.dataset.observationQuotaWrites) + 1);
        throw new DOMException('Synthetic observation quota failure', 'QuotaExceededError');
      }
      originalSetItem.call(this, storageKey, value);
    };
  }, key);
  await dialog.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('기록 충돌이나 저장 실패로 관찰 저장을 중지했습니다.', { exact: true })).toBeVisible();
  await expect(content).toHaveValue(draft);
  await expect(content).toHaveAttribute('readonly', '');
  await expect(dialog.getByRole('button', { name: '기록 저장', exact: true })).toBeDisabled();
  await dialog.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit());
  expect(await page.evaluate(() => document.documentElement.dataset.observationQuotaWrites)).toBe('1');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(originalRaw);
  const backup = await downloadObservationDraft(page);
  expect(backup).toContain(`학생: ${student.number}번 ${student.name}`);
  expect(backup).toContain('관찰 날짜: 2026-10-02');
  expect(backup).toContain('기록 분류: 창의적 체험활동');
  expect(backup).toContain(draft);
  expect(backup).not.toContain(original.content);
  await expect(content).toHaveValue(draft);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(originalRaw);
});
