import { expect, test, type Page } from '@playwright/test';
import { createDemoWorkspace } from '../src/lib/demo';
import { workspaceStorageKey } from '../src/lib/workspace-storage';

const resume = (page: Page) => page.getByRole('button', { name: '이어서 검토', exact: true });
const next = (page: Page) => page.getByRole('button', { name: '검토하고 다음 학생', exact: true });
const editorHeading = (page: Page) => page.locator('.editor-title').getByRole('heading');
const draft = (page: Page) => page.getByRole('textbox', { name: '나이스에 입력할 문장', exact: true });
const guestKey = workspaceStorageKey(null);

test('홈에서 마지막 미검토 학생의 관찰 근거를 새로고침 후 바로 연다', async ({ page }) => {
  await page.goto('/');
  await expect(resume(page)).toHaveAccessibleDescription(/2번 윤보라 · 문장 작성/);
  await resume(page).click();
  await expect(draft(page)).toBeFocused();
  await page.locator('.student-list').getByRole('button', { name: /서하늘/ }).click();
  await page.reload();
  await expect(resume(page)).toHaveAccessibleDescription(/3번 서하늘 · 관찰 근거 선택/);
  await resume(page).click();
  await expect(editorHeading(page)).toContainText('서하늘');
  await expect(page.getByRole('region', { name: '관찰 근거 선택', exact: true })).toBeFocused();
});

test('홈 점검 항목은 해당 학생의 점검 사유에 초점을 둔다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /다른 학생과 같은 문장이 있어요.*한도담.*임나래/ }).first().click();
  await expect(editorHeading(page)).toContainText('한도담');
  const issue = page.locator('.inline-issue').filter({ hasText: '다른 학생과 같은 문장이 있어요' });
  await expect(issue).toBeFocused();
});

test('모바일에서 검토를 저장하며 이미 검토한 학생을 건너뛰고 마지막 학생에 머문다', async ({ page }) => {
  const data = createDemoWorkspace();
  data.students = data.students.filter(student => student.number <= 5).reverse();
  data.observations = data.observations.filter(observation => data.students.some(student => student.id === observation.studentId));
  data.drafts = data.drafts.filter(entry => data.students.some(student => student.id === entry.studentId));
  data.drafts[1].content = '분수 크기를 그림으로 비교하고 풀이 방법을 설명함.';
  data.drafts[2].evidenceIds = ['observation-5'];
  data.drafts[4].content = '맡은 그림 자료를 준비하고 발표 순서를 친구와 상의함.';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ key, raw }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
  }, { key: guestKey, raw: JSON.stringify(data) });
  await page.goto('/');
  await expect(resume(page)).toBeInViewport();
  await resume(page).click();
  await expect(editorHeading(page)).toContainText('윤보라');
  await expect(next(page)).toBeFocused();
  await next(page).press('Enter');
  await expect(editorHeading(page)).toContainText('서하늘');
  await expect(editorHeading(page)).toBeFocused();
  await next(page).click();
  await expect(editorHeading(page)).toContainText('임나래');
  await expect(next(page)).toHaveCount(0);
  await page.getByRole('button', { name: '검토 완료', exact: true }).click();
  await expect(editorHeading(page)).toContainText('임나래');
  await expect(page.getByText('우리 반 학생의 문장 검토를 모두 마쳤습니다.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: '옮길 문장 확인', exact: false })).toBeVisible();
  await expect(resume(page)).toHaveCount(0);
});

test('검토 저장이 실패하면 다음 학생으로 이동하지 않는다', async ({ page }) => {
  await page.goto('/');
  await resume(page).click();
  await draft(page).fill('분수 크기를 그림으로 비교하고 풀이 방법을 설명함.');
  await page.evaluate(key => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (item, value) {
      if (item === key) throw new DOMException('test quota', 'QuotaExceededError');
      write.call(this, item, value);
    };
  }, guestKey);
  await next(page).click();
  await expect(editorHeading(page)).toContainText('윤보라');
  await expect(page.locator('.editor-title').getByText('작성 중', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: '브라우저 저장에 실패했습니다' })).toBeVisible();
});
