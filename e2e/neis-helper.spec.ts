import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDemoWorkspace } from '../src/lib/demo';
import { createNeisJob } from '../src/lib/neis-job';

const extension = path.resolve('extension/neis-helper');
const job = () => createNeisJob(createDemoWorkspace(), ['student-7']);
async function inject(page: Page) {
  await page.addScriptTag({ path: path.join(extension, 'core.js') });
  await page.addScriptTag({ path: path.join(extension, 'content.js') });
}
async function open(page: Page) {
  await page.goto('/neis-practice');
  await expect(page.getByRole('heading', { name: '입력 도우미 연습' })).toBeVisible();
  await inject(page);
  await page.locator('#damim-neis-helper').getByLabel('작업 JSON 파일').setInputFiles({ name: 'job.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(job())) });
}
async function map(page: Page) {
  const pairs = [['학년도', 'year'], ['학년', 'grade'], ['반', 'room'], ['학기', 'semester'], ['학생 번호', 'number'], ['학생 이름', 'name'], ['문장 입력칸', 'content']];
  for (const [label, id] of pairs) {
    await page.locator('#damim-neis-helper').getByRole('button', { name: `${label} 지정`, exact: true }).click();
    await page.locator(`#practice-${id}`).click();
  }
}
const panel = (page: Page) => page.locator('#damim-neis-helper');

test('reviewed job export feeds the actual packaged content script without changing draft status', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '나이스 작업 도우미', exact: true }).click();
  await expect(page.getByLabel('4번 한도담 작업 선택')).toBeDisabled();
  await page.getByRole('button', { name: '준비된 학생 모두 선택' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '선택한 1명 작업 파일' }).click();
  const raw = await readFile((await (await download).path())!, 'utf8');
  expect(JSON.parse(raw).rows).toEqual(job().rows);
  await expect(page.getByRole('status')).toContainText('입력·저장 상태는 바뀌지 않았습니다');
  await page.goto('/neis-practice'); await inject(page);
  await panel(page).getByLabel('작업 JSON 파일').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await map(page);
  const requests: string[] = []; page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()); });
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await panel(page).getByRole('button', { name: '대조한 빈칸에 입력' }).click();
  await expect(page.getByLabel('행동특성 및 종합의견', { exact: true })).toHaveValue(job().rows[0].content);
  await expect(page.getByText(`현재 입력 ${job().rows[0].content.length}자`, { exact: false })).toBeVisible();
  await expect(panel(page).getByRole('status')).toContainText('저장 여부는 미확인');
  await expect(page.getByText('아직 가상 저장하지 않았습니다.', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('helper-filled.png'), fullPage: true });
});

test('student mismatch and changed classroom stop the write', async ({ page }) => {
  await open(page); await map(page);
  await page.getByLabel('연습 학생 선택').selectOption('2');
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('학생 번호');
  await expect(panel(page).getByRole('button', { name: '대조한 빈칸에 입력' })).toBeDisabled();
  await page.getByLabel('연습 학생 선택').selectOption('7');
  await page.locator('#practice-year').evaluate(element => { element.textContent = '2027학년도'; });
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('학년도');
  await expect(page.locator('#practice-content')).toHaveValue('');
});

test('existing text is preserved and matching text is never reported as saved', async ({ page }) => {
  await open(page); await map(page);
  await page.locator('#practice-content').fill('교사가 이미 작성한 가상 문장');
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('덮어쓰지 않습니다');
  await expect(page.locator('#practice-content')).toHaveValue('교사가 이미 작성한 가상 문장');
  await page.locator('#practice-content').fill(job().rows[0].content);
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('저장 여부는 직접 확인');
  await expect(panel(page).getByRole('button', { name: '대조한 빈칸에 입력' })).toBeDisabled();
});

test('screen changes after inspection are checked again immediately before writing', async ({ page }) => {
  await open(page); await map(page);
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: '대조한 빈칸에 입력' })).toBeEnabled();
  await page.getByLabel('연습 학생 선택').selectOption('2');
  await panel(page).getByRole('button', { name: '대조한 빈칸에 입력' }).click();
  await expect(panel(page).getByRole('status')).toContainText('학생 번호');
  await expect(page.locator('#practice-content')).toHaveValue('');
});

test('replaced field, wrong purpose and ambiguous editors are refused', async ({ page }) => {
  await open(page); await map(page);
  await page.locator('#practice-content').evaluate(element => { element.setAttribute('readonly', ''); });
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('수정할 수 없는');
  await page.locator('#practice-content').evaluate(element => { element.removeAttribute('readonly'); });
  await page.locator('label[for="practice-content"]').evaluate(element => { element.textContent = '출결 비고'; });
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('행동특성 및 종합의견');
  await page.locator('label[for="practice-content"]').evaluate(element => { element.textContent = '행동특성 및 종합의견'; });
  await page.locator('#practice-content').evaluate(element => { const extra = document.createElement('textarea'); element.parentElement!.append(extra); });
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('여러 개');
  await page.locator('#practice-content').evaluate(element => { element.parentElement!.querySelector('textarea:last-child')!.remove(); element.replaceWith(element.cloneNode(true)); });
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('바뀌거나 보이지');
});

test('a destination that alters the entered value is never reported as successful', async ({ page }) => {
  await open(page); await map(page);
  await page.locator('#practice-content').evaluate(element => { element.addEventListener('input', () => { (element as HTMLTextAreaElement).value = '대상 화면이 변경한 가상 문장'; }, true); });
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await panel(page).getByRole('button', { name: '대조한 빈칸에 입력' }).click();
  await expect(panel(page).getByRole('status')).toContainText('변경이 남아 있을 수');
  await expect(page.locator('#practice-content')).toHaveValue('대상 화면이 변경한 가상 문장');
  await expect(page.getByText('아직 가상 저장하지 않았습니다.', { exact: true })).toBeVisible();
});

test('invalid import clears the old job and closing removes listeners and data', async ({ page }) => {
  await open(page); await map(page);
  await panel(page).getByLabel('작업 JSON 파일').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(panel(page).getByRole('status')).toContainText('작업 파일이 아닙니다');
  await expect(panel(page).getByRole('button', { name: '화면 대조', exact: true })).toBeDisabled();
  await panel(page).getByRole('button', { name: '도우미 닫기' }).click();
  await expect(panel(page)).toHaveCount(0);
  await inject(page); await expect(panel(page).getByRole('button', { name: '화면 대조', exact: true })).toBeDisabled();
  await page.goto('/'); await inject(page); await expect(panel(page)).toHaveCount(0);
});

test('job screen fits a 390px viewport and supplies the packaged download', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await page.getByRole('button', { name: '나이스 작업 도우미', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const response = await request.get('/downloads/damim-neis-helper.zip');
  expect(response.ok()).toBe(true); expect((await response.body()).readUInt32LE(0)).toBe(0x04034b50);
});

test('deployed web launcher uses packaged scripts and fills through automatic practice mapping', async ({ page, request }, testInfo) => {
  for (const name of ['core.js', 'content.js']) {
    const response = await request.get(`/neis-helper/${name}?v=0.5.0`);
    expect(response.ok()).toBe(true);
    expect((await response.text()).replace(/\r\n/g, '\n')).toBe((await readFile(path.join(extension, name), 'utf8')).replace(/\r\n/g, '\n'));
  }
  await page.goto('/neis-practice');
  await page.getByRole('button', { name: '웹 연습 도우미 열기', exact: true }).click();
  await expect(panel(page).getByText(/0.5.0 · 웹 연습/)).toBeVisible();
  await panel(page).getByLabel('작업 JSON 파일').setInputFiles({ name: 'job.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(job())) });
  await panel(page).getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await expect(panel(page).getByRole('button', { name: '대조한 빈칸에 입력' })).toBeDisabled();
  const writes: string[] = []; page.on('request', req => { if (req.method() !== 'GET') writes.push(req.url()); });
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await panel(page).getByRole('button', { name: '대조한 빈칸에 입력' }).click();
  await expect(page.locator('#practice-content')).toHaveValue(job().rows[0].content);
  await expect(page.getByText('현재 입력 45자', { exact: false })).toBeVisible();
  await expect(panel(page).getByRole('status')).toContainText('저장 여부는 미확인');
  await expect(page.getByText('아직 가상 저장하지 않았습니다.', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('web-practice-filled.png'), fullPage: true });
  await panel(page).getByRole('button', { name: '도우미 닫기' }).click();
  await page.getByRole('button', { name: '웹 연습 도우미 열기', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: '화면 대조', exact: true })).toBeDisabled();
  await expect(page.locator('#practice-content')).toHaveValue(job().rows[0].content);
});

test('a mistaken manual mapping displays actual and expected values and can be repaired', async ({ page }) => {
  await open(page);
  await panel(page).getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await panel(page).getByRole('button', { name: '학년 다시 지정 ✓', exact: true }).click();
  await page.locator('#practice-year').click();
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('선택한 값: 「2026학년도」 / 작업 파일: 「4」');
  await panel(page).getByText('지정한 값 확인', { exact: true }).click();
  await expect(panel(page).getByRole('list', { name: '지정한 값' })).toContainText('학년: 2026학년도 / 작업 파일: 4');
  await expect(panel(page).getByRole('button', { name: '대조한 빈칸에 입력' })).toBeDisabled();
  await panel(page).getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: '대조한 빈칸에 입력' })).toBeEnabled();
});

test('automatic practice mapping keeps student and existing-content protections', async ({ page }) => {
  await open(page);
  await panel(page).getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await page.getByLabel('연습 학생 선택').selectOption('2');
  await panel(page).getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('선택한 값: 「2번」 / 작업 파일: 「7」');
  await expect(page.locator('#practice-content')).toHaveValue('');
  await page.getByLabel('연습 학생 선택').selectOption('7');
  await page.locator('#practice-content').fill('기존 가상 문장');
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('덮어쓰지 않습니다');
  await expect(page.locator('#practice-content')).toHaveValue('기존 가상 문장');
});

test('ambiguous or outdated practice markup clears previously prepared mappings', async ({ page }) => {
  await open(page);
  await panel(page).getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await panel(page).getByRole('button', { name: '화면 대조', exact: true }).click();
  await page.locator('#practice-grade').evaluate(el => el.after(el.cloneNode(true)));
  await panel(page).getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await expect(panel(page).getByRole('status')).toContainText('정확히 찾지 못');
  await expect(panel(page).getByRole('button', { name: '대조한 빈칸에 입력' })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: '학년도 지정', exact: true })).toBeVisible();
  await page.locator('main').evaluate(el => el.removeAttribute('data-damim-practice'));
  await panel(page).getByRole('button', { name: '연습 화면 항목 자동 지정' }).click();
  await expect(panel(page).getByRole('status')).toContainText('지원하는 연습 화면이 아닙니다');
  await expect(page.locator('#practice-content')).toHaveValue('');
});

test('web launcher recovers from a script load failure', async ({ page }) => {
  await page.route('**/neis-helper/core.js*', route => route.abort());
  await page.goto('/neis-practice');
  await page.getByRole('button', { name: '웹 연습 도우미 열기', exact: true }).click();
  await expect(page.getByText('도우미를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.', { exact: true })).toBeVisible();
  await page.unroute('**/neis-helper/core.js*');
  await page.getByRole('button', { name: '웹 연습 도우미 열기', exact: true }).click();
  await expect(panel(page).getByRole('heading', { name: '담임노트 입력 도우미' })).toBeVisible();
});
