import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const content = '가상 체육 관찰: 공을 주고받는 활동에서 규칙을 지키며 참여함.';
const opinion = '7번 백아람 학기말 종합의견';
const review = '7번 백아람 학기말 문장 검토 완료';
const selection = '7번 백아람 학기말 작업 선택';

async function openSemester(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '나이스로 옮기기', exact: true }).click();
  await page.getByRole('button', { name: '학기말 종합의견', exact: true }).click();
  await page.getByLabel('작업 학년', { exact: true }).selectOption('5');
  await page.getByLabel('작업 반', { exact: true }).fill('1');
  await page.getByLabel('작업 학기', { exact: true }).selectOption('2');
  await page.getByLabel('작업 교과', { exact: true }).selectOption('체육');
  await page.getByLabel('학기말 작성 학생').selectOption('student-7');
}

test('separate semester review exports a grade 5 term 2 subject job and fills only the fictional selected row', async ({ page }) => {
  await openSemester(page);
  await expect(page.getByRole('textbox', { name: opinion, exact: true })).toHaveValue('');
  await expect(page.getByLabel(selection, { exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: opinion, exact: true }).fill(content);
  await page.getByLabel(review, { exact: true }).check();
  await page.getByLabel(selection, { exact: true }).check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '선택한 1명 학기말 작업 파일', exact: true }).click();
  const raw = await readFile((await (await download).path())!, 'utf8');
  const file = JSON.parse(raw);
  expect(file).toMatchObject({ format: 'damim-neis-job', version: 2, task: 'semester-subject-opinion', subject: '체육',
    classroom: { year: 2026, grade: 5, room: '1', semester: 2 }, rows: [{ number: 7, name: '백아람', content }] });
  await page.getByRole('button', { name: '행동특성·종합의견', exact: true }).click();
  await expect(page.getByLabel('7번 백아람 작업 선택', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '선택한 0명 작업 파일', exact: true })).toBeDisabled();

  await page.goto('/neis-practice?task=semester');
  await page.getByLabel('연습 학년', { exact: true }).selectOption('5');
  await page.getByLabel('연습 반', { exact: true }).fill('1');
  await page.getByRole('button', { name: '학기말 웹 연습 도우미 열기', exact: true }).click();
  const panel = page.locator('#damim-neis-helper');
  await panel.getByLabel('작업 JSON 파일').setInputFiles({ name: 'semester.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await panel.getByRole('button', { name: '연습 화면 항목 자동 지정', exact: true }).click();
  await panel.getByRole('button', { name: '화면 대조', exact: true }).click();
  await panel.getByRole('button', { name: '대조한 빈칸에 입력', exact: true }).click();
  await expect(page.getByLabel('학기말 종합의견', { exact: true })).toHaveValue(content);
  await expect(page.getByText('아직 가상 학기말 저장하지 않았습니다.', { exact: true })).toBeVisible();
});

test('saved semester text survives reload and context or text changes invalidate review and export', async ({ page }) => {
  await openSemester(page);
  await page.getByRole('textbox', { name: opinion, exact: true }).fill(content);
  await page.getByLabel(review, { exact: true }).check();
  await page.getByLabel(selection, { exact: true }).check();
  await page.getByRole('button', { name: '행동특성·종합의견', exact: true }).click();
  await page.getByRole('button', { name: '학기말 종합의견', exact: true }).click();
  await expect(page.getByRole('textbox', { name: opinion, exact: true })).toHaveValue(content);
  await expect(page.getByLabel(review, { exact: true })).toBeChecked();
  await page.getByLabel('작업 학기', { exact: true }).selectOption('1');
  await expect(page.getByLabel(review, { exact: true })).not.toBeChecked();
  await expect(page.getByLabel(selection, { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '선택한 0명 학기말 작업 파일', exact: true })).toBeDisabled();
  await page.getByLabel('작업 학기', { exact: true }).selectOption('2');
  await page.getByLabel(review, { exact: true }).check();
  await page.getByLabel(selection, { exact: true }).check();
  await page.getByRole('textbox', { name: opinion, exact: true }).fill(`${content} 가상 수정 문장.`);
  await expect(page.getByLabel(review, { exact: true })).not.toBeChecked();
  await expect(page.getByLabel(selection, { exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: '나이스로 옮기기', exact: true }).click();
  await page.getByRole('button', { name: '학기말 종합의견', exact: true }).click();
  await page.getByLabel('학기말 작성 학생').selectOption('student-7');
  await expect(page.getByRole('textbox', { name: opinion, exact: true })).toHaveValue(`${content} 가상 수정 문장.`);
  await expect(page.getByLabel('작업 교과', { exact: true })).toHaveValue('체육');
  await expect(page.getByLabel('작업 학기', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel(review, { exact: true })).not.toBeChecked();
  await expect(page.getByLabel(selection, { exact: true })).toBeDisabled();
});

test('unreviewed semester draft persists across menus and reload while missing subject is explained once', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '나이스로 옮기기', exact: true }).click();
  await page.getByRole('button', { name: '학기말 종합의견', exact: true }).click();
  await page.getByLabel('학기말 작성 학생').selectOption('student-7');
  await page.getByRole('textbox', { name: opinion, exact: true }).fill(content);
  await expect(page.getByText('작업 교과를 선택해 주세요.', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel(review, { exact: true })).toBeDisabled();
  await expect(page.getByLabel(selection, { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '관찰 노트', exact: true }).click();
  await page.getByRole('button', { name: '나이스로 옮기기', exact: true }).click();
  await page.getByRole('button', { name: '학기말 종합의견', exact: true }).click();
  await page.getByLabel('학기말 작성 학생').selectOption('student-7');
  await expect(page.getByRole('textbox', { name: opinion, exact: true })).toHaveValue(content);
  await page.reload();
  await page.getByRole('button', { name: '나이스로 옮기기', exact: true }).click();
  await page.getByRole('button', { name: '학기말 종합의견', exact: true }).click();
  await page.getByLabel('학기말 작성 학생').selectOption('student-7');
  await expect(page.getByRole('textbox', { name: opinion, exact: true })).toHaveValue(content);
  await expect(page.getByLabel('작업 교과', { exact: true })).toHaveValue('');
  await expect(page.getByLabel(review, { exact: true })).not.toBeChecked();
});
