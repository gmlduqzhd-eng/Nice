import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDemoWorkspace } from '../src/lib/demo';
import { workspaceStorageKey } from '../src/lib/workspace-storage';

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
  await expect(page.getByLabel(selection, { exact: true })).not.toBeChecked();
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

test('semester sequential review returns to earlier unfinished students and clearing selection preserves reviews', async ({ page }) => {
  await openSemester(page);
  await page.getByRole('textbox', { name: opinion, exact: true }).fill(content);
  await page.getByRole('button', { name: '검토하고 다음 학생', exact: true }).click();
  const lastOpinion = page.getByRole('textbox', { name: /^8번 .+ 학기말 종합의견$/ });
  await expect(lastOpinion).toBeFocused();
  await expect(lastOpinion).toHaveValue('');
  await expect(page.getByLabel(review, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '검토하고 다음 학생', exact: true })).toBeDisabled();
  await lastOpinion.fill('가상 체육 수업에서 친구의 설명을 듣고 놀이 순서를 안내함.');
  await page.getByRole('button', { name: '검토하고 다음 학생', exact: true }).click();
  await expect(page.getByLabel('학기말 작성 학생', { exact: true })).toHaveValue('student-1');
  await expect(page.getByRole('textbox', { name: /^1번 .+ 학기말 종합의견$/ })).toBeFocused();
  await page.getByRole('button', { name: '검토된 학기말 학생 모두 선택', exact: true }).click();
  await expect(page.getByRole('button', { name: '선택한 2명 학기말 작업 파일', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '학기말 작업 선택 해제', exact: true }).click();
  await expect(page.getByRole('button', { name: '선택한 0명 학기말 작업 파일', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '7번 백아람 학기말 문장 작성', exact: true }).click();
  await expect(page.getByRole('textbox', { name: opinion, exact: true })).toBeFocused();
  await expect(page.getByLabel(review, { exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: opinion, exact: true })).toHaveValue(content);
  await expect(page.getByText('작업 파일 대상: 2026학년도 · 5학년 · 1반 · 2학기 · 체육', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '나이스로 옮기기', exact: true }).click();
  await page.getByRole('button', { name: '학기말 종합의견', exact: true }).click();
  await page.getByLabel('학기말 작성 학생', { exact: true }).selectOption('student-7');
  await expect(page.getByLabel(review, { exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: opinion, exact: true })).toHaveValue(content);
  await expect(page.getByLabel(selection, { exact: true })).not.toBeChecked();
});

test('home resumes the saved semester subject and student and skips completed reviews', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const resume = page.getByRole('button', { name: '학기말 종합의견 이어 쓰기', exact: true });
  await expect(resume).toBeInViewport();
  await resume.click();
  const subject = page.getByLabel('작업 교과', { exact: true });
  await expect(subject).toBeFocused();
  await subject.selectOption('체육');
  const student = page.getByLabel('학기말 작성 학생', { exact: true });
  await student.selectOption('student-2');
  await page.getByRole('textbox', { name: /^2번 .+ 학기말 종합의견$/ }).fill('놀이 규칙을 설명하고 친구의 차례를 기다림.');
  await page.getByLabel(/^2번 .+ 학기말 문장 검토 완료$/).check();
  await student.selectOption('student-1');
  const firstOpinion = page.getByRole('textbox', { name: /^1번 .+ 학기말 종합의견$/ });
  await firstOpinion.fill(content);
  await page.reload();
  await expect(resume).toHaveAccessibleDescription(/2학기 · 체육.*남은 학생 7명 · 1번 강가람/);
  await resume.click();
  await expect(subject).toHaveValue('체육');
  await expect(firstOpinion).toBeFocused();
  await expect(firstOpinion).toHaveValue(content);
  await page.getByRole('button', { name: '검토하고 다음 학생', exact: true }).click();
  await expect(student).toHaveValue('student-3');
  await expect(page.getByRole('textbox', { name: /^3번 .+ 학기말 종합의견$/ })).toBeFocused();
  await expect(page.getByLabel('1번 강가람 학기말 작업 선택', { exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('semester transfer opens a blocked draft directly and rechecks it after correction', async ({ page }) => {
  await openSemester(page);
  await page.getByRole('textbox', { name: opinion, exact: true }).fill(content);
  await page.getByLabel(review, { exact: true }).check();
  await page.getByLabel('학기말 작성 학생', { exact: true }).selectOption('student-8');
  const lastOpinion = page.getByRole('textbox', { name: /^8번 .+ 학기말 종합의견$/ });
  await lastOpinion.fill(content);
  const lastRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '8번 오해솔', exact: true }) });
  await expect(lastRow).toContainText('다른 학생과 같은 문장이 있어요');
  await expect(lastRow.getByRole('checkbox')).toBeDisabled();
  await lastRow.getByRole('button', { name: '8번 오해솔 학기말 문장 작성', exact: true }).click();
  await expect(lastOpinion).toBeFocused();
  await lastOpinion.fill('친구의 설명을 듣고 놀이 순서를 안내함.');
  await expect(page.getByLabel(selection, { exact: true })).toBeEnabled();
  await expect(lastRow.getByRole('checkbox')).toBeDisabled();
  await page.getByLabel('8번 오해솔 학기말 문장 검토 완료', { exact: true }).check();
  await expect(lastRow).toContainText('옮길 수 있음');
  await expect(lastRow.getByRole('checkbox')).toBeEnabled();
});

test('the last remaining semester review leads to file selection and home reopens that step', async ({ page }) => {
  const example = createDemoWorkspace();
  const data = { ...example, students: [example.students[6]], drafts: [], observations: [] };
  await page.addInitScript(({ key, snapshot }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, snapshot);
  }, { key: workspaceStorageKey(null), snapshot: JSON.stringify(data) });
  await openSemester(page);
  await page.getByRole('textbox', { name: opinion, exact: true }).fill(content);
  const selectReady = page.getByRole('button', { name: '검토된 학기말 학생 모두 선택', exact: true });
  await page.getByRole('button', { name: '검토 마치고 작업 파일로', exact: true }).click();
  await expect(selectReady).toBeFocused();
  await expect(page.getByText('모든 학생의 학기말 문장 검토를 마쳤습니다.', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '학기말 작업 파일 확인', exact: true }).click();
  await expect(selectReady).toBeFocused();
  await expect(page.getByLabel(selection, { exact: true })).toBeEnabled();
});

test('behavior transfer opens the right correction and returns to updated eligibility', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '나이스로 옮기기', exact: true }).click();
  await expect(page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '1번 강가람', exact: true }) }))
    .toContainText('나이스 저장 직접 확인');
  const correction = page.getByRole('button', { name: '한도담: 다른 학생과 같은 문장이 있어요 수정', exact: true });
  await correction.click();
  const editor = page.getByRole('textbox', { name: '나이스에 입력할 문장', exact: true });
  await expect(editor).toBeFocused();
  await expect(page.locator('.editor-title').getByRole('heading')).toContainText('한도담');
  await expect(page.locator('.inline-issue')).toContainText('다른 학생과 같은 문장이 있어요');
  await editor.fill('자료 정리를 맡아 모둠 친구들과 필요한 준비물을 확인함.');
  await page.getByRole('button', { name: '검토 완료', exact: true }).click();
  await page.getByRole('button', { name: '나이스 작업 목록으로 돌아가기', exact: true }).click();
  await expect(page.getByLabel('4번 한도담 작업 선택', { exact: true })).toBeEnabled();
  await expect(correction).toHaveCount(0);
  await page.getByRole('button', { name: '서하늘: 관찰 근거가 연결되지 않았어요 수정', exact: true }).click();
  await expect(page.getByRole('region', { name: '관찰 근거 선택', exact: true })).toBeFocused();
  await expect(page.locator('.editor-title').getByRole('heading')).toContainText('서하늘');
});

test('behavior job selection can be cleared while reviewed text and eligibility stay intact', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '나이스로 옮기기', exact: true }).click();
  await page.getByRole('button', { name: '준비된 학생 모두 선택', exact: true }).click();
  await expect(page.getByLabel('7번 백아람 작업 선택', { exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /^선택한 [1-9]\d*명 작업 파일$/ })).toBeEnabled();
  await page.getByRole('button', { name: '작업 선택 해제', exact: true }).click();
  await expect(page.getByLabel('7번 백아람 작업 선택', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('7번 백아람 작업 선택', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '선택한 0명 작업 파일', exact: true })).toBeDisabled();
  await page.getByLabel('7번 백아람 작업 선택', { exact: true }).check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '선택한 1명 작업 파일', exact: true }).click();
  const file = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(file).toMatchObject({ format: 'damim-neis-job', version: 1, rows: [expect.objectContaining({ number: 7, name: '백아람' })] });
});
