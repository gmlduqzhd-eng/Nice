import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createDemoWorkspace } from '../src/lib/demo';
import { workspaceStorageKey } from '../src/lib/workspace-storage';

test('빈 학급은 기록 완료 대신 명부 준비를 안내하고 관찰 입력을 막는다', async ({ page }) => {
  const empty = { ...createDemoWorkspace(), students: [], observations: [], drafts: [] };
  await page.goto('/');
  await page.evaluate(({ key, empty }) => localStorage.setItem(key, JSON.stringify(empty)),
    { key: workspaceStorageKey(null), empty });
  await page.reload();
  await expect(page.getByText('모든 학생에게 관찰 기록이 있습니다.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('학생 명부를 먼저 준비해 주세요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '관찰 기록 추가', exact: true }).click();
  await expect(page.getByRole('heading', { name: '학급 · 명부', level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('체육·음악·미술·영어·실과 관찰 분류를 선택하고 기록을 보관한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '관찰 기록 추가', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const category = dialog.getByRole('combobox', { name: '기록 분류', exact: true });
  for (const subject of ['체육', '음악', '미술', '영어', '실과', '도덕', '바른 생활', '슬기로운 생활', '즐거운 생활']) {
    await category.selectOption(subject);
    await expect(category).toHaveValue(subject);
  }
  await category.selectOption('체육');
  await dialog.getByRole('textbox', { name: '관찰한 내용', exact: true }).fill('가상 체육 활동에서 전통 표현의 기본 움직임을 연습함.');
  await dialog.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '관찰 노트', exact: true }).click();
  const record = page.getByRole('article').filter({ hasText: '가상 체육 활동에서 전통 표현의 기본 움직임을 연습함.' });
  await expect(record).toContainText('체육');
});

test('검토한 학생 문장을 옮기는 단계에 연결하고 다른 학생은 자동 선택하지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '문장 작성·검토', exact: true }).click();
  await page.locator('.student-list').getByRole('button', { name: /07 백아람/ }).click();
  if (process.env.USABILITY_SCREENSHOT_DIR) {
    await mkdir(process.env.USABILITY_SCREENSHOT_DIR, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(process.env.USABILITY_SCREENSHOT_DIR, 'teacher-writing.png') });
  }
  await page.getByRole('button', { name: '검토한 문장을 나이스로 옮기기', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '7번 백아람 작업 선택', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '2번 윤보라 작업 선택', exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: '선택한 1명 작업 파일', exact: true })).toBeEnabled();
});

test('문장 작성 화면에서 학기말 작성으로 바로 이동할 수 있다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '문장 작성·검토', exact: true }).click();
  await page.getByRole('button', { name: '학기말 종합의견 작성', exact: true }).click();
  await expect(page.getByRole('heading', { name: '학기말 종합의견 준비', exact: true })).toBeVisible();
  await expect(page.getByLabel('작업 교과', { exact: true })).toBeVisible();
  await expect(page.getByText('관찰·행특·학기말 초안은 이 PC 브라우저에 자동 저장됩니다.', { exact: false })).toBeVisible();
  if (process.env.USABILITY_SCREENSHOT_DIR) {
    await mkdir(process.env.USABILITY_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.USABILITY_SCREENSHOT_DIR, 'semester-preparation.png') });
  }
});
