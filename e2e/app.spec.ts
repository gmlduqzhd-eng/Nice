import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createDemoWorkspace } from "../src/lib/demo";
import { MAX_JSON_BACKUP_BYTES } from "../src/lib/json-backup";

async function navigate(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
}

async function selectStudent(page: Page, name: string) {
  await page.locator(".student-list").getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.locator(".editor-title").getByRole("heading", { name: new RegExp(name) })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("이 브라우저에 저장", { exact: true })).toBeVisible();
});

test("업무 화면과 주요 메뉴가 오류 없이 열린다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // Listen before reload so hydration failures are captured as well.
  await page.reload();
  await expect(page.getByRole("heading", { name: "선생님, 오늘도 반갑습니다", level: 1 })).toBeVisible();
  await expect(page.getByText("가상 학생으로 이용하는 첫 버전입니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /쌓인 관찰 기록/ })).toContainText("12");
  for (const menu of ["관찰 노트", "나이스 입력 준비", "학교 · 학사일정", "설정 및 백업"]) {
    await navigate(page, menu);
  }
  const cloudWaiting = page.getByRole("button", { name: "클라우드 연결 대기", exact: true });
  const accountStart = page.getByRole("button", { name: /^(?:이메일로 시작하기|간편하게 시작하기)$/ });
  await expect(cloudWaiting.or(accountStart)).toBeVisible();
  if (await cloudWaiting.isVisible()) {
    await expect(cloudWaiting).toBeDisabled();
  } else {
    await expect(accountStart).toBeEnabled();
  }
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("관찰 기록 추가 결과와 학생 연결이 새로고침 후에도 유지된다", async ({ page }) => {
  const content = "수학 모둠 활동에서 그림 자료를 정리하고 친구에게 비교한 방법을 설명함.";
  await page.getByRole("button", { name: "관찰 기록 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "학생", exact: true }).selectOption({ label: "8번 오해솔" });
  await dialog.getByRole("combobox", { name: "기록 분류", exact: true }).selectOption("수학");
  await dialog.getByRole("textbox", { name: "관찰한 내용", exact: true }).fill(content);
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: /쌓인 관찰 기록/ })).toContainText("13");
  await navigate(page, "관찰 노트");
  const added = page.getByRole("article").filter({ hasText: content });
  await expect(added).toHaveCount(1);
  await expect(added).toContainText("오해솔");
  await expect(added).toContainText("수학");
  await page.reload();
  await expect(page.getByRole("button", { name: /쌓인 관찰 기록/ })).toContainText("13");
  await navigate(page, "관찰 노트");
  await expect(page.getByRole("article").filter({ hasText: content })).toContainText("오해솔");
});

test("첫 사용 안내에서 학생별 기록을 이어 쓰면 날짜·분류를 유지하고 한 건씩 저장한다", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "하루 한 줄부터 시작해 보세요.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /첫 관찰 남기기/ }).click();
  const dialog = page.getByRole("dialog");
  const student = dialog.getByRole("combobox", { name: "학생", exact: true });
  const category = dialog.getByRole("combobox", { name: "기록 분류", exact: true });
  const date = dialog.getByLabel("관찰 날짜", { exact: true });
  const content = dialog.getByRole("textbox", { name: "관찰한 내용", exact: true });
  await student.selectOption({ label: "7번 백아람" });
  await category.selectOption("과학");
  await date.fill("2026-09-28");
  const firstContent = "식물의 잎을 관찰하고 모양의 공통점을 찾아 비교 표에 정리함.";
  const secondContent = "식물의 잎을 관찰하며 잎맥을 그림으로 나타내고 발견한 점을 설명함.";
  await content.fill(firstContent);
  await dialog.getByRole("button", { name: "저장하고 다음 학생", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(student).toHaveValue("student-8");
  await expect(category).toHaveValue("과학");
  await expect(date).toHaveValue("2026-09-28");
  await expect(content).toHaveValue("");
  await expect(content).toBeFocused();
  await expect(page.getByRole("button", { name: /쌓인 관찰 기록/ })).toContainText("13");
  // An accidental second click with no new content must not duplicate the first record.
  await dialog.getByRole("button", { name: "저장하고 다음 학생", exact: true }).click();
  await expect(student).toHaveValue("student-8");
  await expect(page.getByRole("button", { name: /쌓인 관찰 기록/ })).toContainText("13");
  await content.fill(secondContent);
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: /쌓인 관찰 기록/ })).toContainText("14");
  await page.reload();
  await navigate(page, "관찰 노트");
  for (const [text, name] of [[firstContent, "백아람"], [secondContent, "오해솔"]]) {
    const record = page.getByRole("article").filter({ hasText: text });
    await expect(record).toHaveCount(1);
    await expect(record).toContainText(name);
    await expect(record).toContainText("과학");
    await expect(record).toContainText("2026.09.28");
  }
  await expect(page.getByText("총 14개의 기록", { exact: true })).toBeVisible();
});

test("사용 안내를 접은 상태가 유지되고 저작권 안내를 열어 확인할 수 있다", async ({ page }) => {
  const heading = page.getByRole("heading", { name: "하루 한 줄부터 시작해 보세요.", exact: true });
  await page.getByRole("button", { name: /입력 문장 준비하기/ }).click();
  await expect(page.getByRole("heading", { name: "나이스 입력 준비", exact: true, level: 1 })).toBeVisible();
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: /^업무 한눈에/ }).click();
  await expect(page.getByRole("heading", { name: "선생님, 오늘도 반갑습니다", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /내 기록 보관하기/ }).click();
  await expect(page.getByRole("heading", { name: "설정 및 백업", exact: true, level: 1 })).toBeVisible();
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: /^업무 한눈에/ }).click();
  await page.getByRole("button", { name: "사용 안내 접기", exact: true }).click();
  await expect(heading).not.toBeVisible();
  await page.reload();
  await expect(heading).not.toBeVisible();
  await page.getByRole("button", { name: "사용 안내 다시 보기", exact: true }).click();
  await expect(heading).toBeVisible();
  const footer = page.locator("footer.app-footer");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.locator("small")).toHaveText("© 2026 담임노트. All rights reserved.");
  await footer.getByText("저작권 안내", { exact: true }).click();
  await expect(footer.getByText(/선생님이 직접 작성한 기록은 서비스의 저작권 표기 대상에 포함되지 않습니다/)).toBeVisible();
});

test("반영 확인한 문장을 수정하면 검토 상태가 초기화된다", async ({ page }) => {
  await navigate(page, "나이스 입력 준비");
  await selectStudent(page, "강가람");
  await expect(page.locator(".editor-title").getByText("반영 확인", { exact: true })).toBeVisible();
  const editor = page.getByLabel("나이스에 입력할 문장", { exact: true });
  const changed = `${await editor.inputValue()} 친구의 의견을 듣고 자신의 생각을 덧붙임.`;
  await editor.fill(changed);
  await expect(page.locator(".editor-title").getByText("작성 중", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "문장 복사", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "나이스 반영 확인", exact: true })).toBeDisabled();
  await page.reload();
  await navigate(page, "나이스 입력 준비");
  await selectStudent(page, "강가람");
  await expect(editor).toHaveValue(changed);
  await expect(page.locator(".editor-title").getByText("작성 중", { exact: true })).toBeVisible();
});

test("관찰 원문 모으기부터 검토·실제 복사·교사 반영 확인까지 진행한다", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await navigate(page, "나이스 입력 준비");
  await selectStudent(page, "윤보라");
  const editor = page.getByLabel("나이스에 입력할 문장", { exact: true });
  await expect(editor).toHaveValue("");
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("button", { name: "선택한 관찰 원문 모으기", exact: true }).click();
  await expect(editor).toHaveValue(/분수의 크기를 비교할 때 그림을 그려/);
  const composed = await editor.inputValue();
  expect(composed).toContain("이야기의 인물이 느낀 감정을");
  await page.getByRole("button", { name: "검토 완료", exact: true }).click();
  await expect(page.locator(".editor-title").getByText("검토 완료", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "문장 복사", exact: true }).click();
  await expect(page.locator(".editor-title").getByText("복사됨", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(composed);
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("윤보라 학생의 나이스 화면");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "나이스 반영 확인", exact: true }).click();
  await expect(page.locator(".editor-title").getByText("반영 확인", { exact: true })).toBeVisible();
  await editor.fill(`${composed} 발표 준비에 참여함.`);
  await expect(page.locator(".editor-title").getByText("작성 중", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "문장 복사", exact: true })).toBeDisabled();
});

test("모바일 390px에서 가로 넘침 없이 메뉴와 입력 화면을 이용한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "메뉴 열기", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: "나이스 입력 준비", exact: true }).click();
  await expect(page.getByRole("heading", { name: "나이스 입력 준비", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "메뉴 닫기", exact: true })).not.toBeVisible();
  await expect(page.getByLabel("나이스에 입력할 문장", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("JSON 백업 다운로드와 확인을 거친 복원이 실제 기록을 되돌린다", async ({ page }) => {
  await navigate(page, "설정 및 백업");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 백업 내려받기", exact: true }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const exported = await readFile(filePath!);
  const backup = JSON.parse(exported.toString("utf8"));
  expect(backup.version).toBe(2);
  expect(backup.students).toHaveLength(8);
  expect(backup.observations).toHaveLength(12);

  await navigate(page, "나이스 입력 준비");
  await selectStudent(page, "강가람");
  await page.getByLabel("나이스에 입력할 문장", { exact: true }).fill("백업 복원을 확인하기 위한 연습 문장입니다.");
  await navigate(page, "설정 및 백업");
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("학생 8명의 백업");
    expect(dialog.message()).toContain("불러올 백업: 2026학년도 4학년 2반 2학기 · 학생 8명 · 관찰 12건");
    await dialog.accept();
  });
  await page.getByLabel("JSON 백업 파일 선택", { exact: true }).setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: exported });
  await expect(page.getByRole("status")).toContainText("JSON 백업을 불러왔습니다.");
  await expect(page.getByRole('region', { name: '불러온 백업' })).toContainText('관찰 12건');
  await navigate(page, "나이스 입력 준비");
  await selectStudent(page, "강가람");
  await expect(page.getByLabel("나이스에 입력할 문장", { exact: true })).toHaveValue(backup.drafts[0].content);
  await expect(page.locator(".editor-title").getByText("반영 확인", { exact: true })).toBeVisible();
});

test("1MB보다 큰 유효한 가상 기록도 JSON 내보내기와 다시 불러오기를 완료한다", async ({ page }) => {
  const workspace = createDemoWorkspace();
  workspace.observations.push(...Array.from({ length: 40 }, (_, index) => ({
    id: `large-fictional-${index}`,
    studentId: workspace.students[0].id,
    date: "2026-10-01",
    category: "생활",
    content: `대용량 백업 검증용 가상 기록 ${index} ${"가".repeat(9960)}`,
  })));
  const file = Buffer.from(JSON.stringify(workspace, null, 2), "utf8");
  expect(file.byteLength).toBeGreaterThan(1024 * 1024);
  expect(file.byteLength).toBeLessThan(MAX_JSON_BACKUP_BYTES);
  await navigate(page, "설정 및 백업");
  page.once("dialog", dialog => dialog.accept());
  await page.getByLabel("JSON 백업 파일 선택", { exact: true }).setInputFiles({ name: "large-fictional.json", mimeType: "application/json", buffer: file });
  await expect(page.getByRole("region", { name: "불러온 백업" })).toContainText("관찰 52건");

  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 백업 내려받기", exact: true }).click();
  const exported = await readFile((await (await downloaded).path())!);
  expect(exported.byteLength).toBeGreaterThan(1024 * 1024);
  expect(JSON.parse(exported.toString("utf8"))).toEqual(workspace);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "예시 데이터 초기화", exact: true }).click();
  await expect(page.getByRole("region", { name: "불러온 백업" })).toHaveCount(0);

  page.once("dialog", dialog => dialog.accept());
  await page.getByLabel("JSON 백업 파일 선택", { exact: true }).setInputFiles({ name: "exported-large-fictional.json", mimeType: "application/json", buffer: exported });
  await expect(page.getByRole("region", { name: "불러온 백업" })).toContainText("관찰 52건");
  await navigate(page, "관찰 노트");
  await expect(page.getByText("총 52개의 기록", { exact: true })).toBeVisible();
});

test('JSON 파일을 읽는 동안 추가한 기록은 복원으로 덮어쓰지 않는다', async ({ page }) => {
  await navigate(page, '설정 및 백업');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON 백업 내려받기', exact: true }).click();
  const file = await readFile((await (await downloaded).path())!);
  await page.evaluate(() => {
    const original = File.prototype.text;
    const release = Promise.withResolvers<void>();
    (window as unknown as { releaseBackupRead: () => void }).releaseBackupRead = release.resolve;
    File.prototype.text = async function () { const text = await original.call(this); await release.promise; return text; };
  });
  await page.getByLabel('JSON 백업 파일 선택', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: file });
  await expect(page.getByRole('button', { name: '백업 읽는 중…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '관찰 기록 남기기', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('관찰한 내용', { exact: true }).fill('파일 읽기 중 새로 추가한 가상 기록');
  await editor.getByRole('button', { name: '기록 저장', exact: true }).click();
  let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; await dialog.accept(); });
  await page.evaluate(() => (window as unknown as { releaseBackupRead: () => void }).releaseBackupRead());
  await expect(page.getByRole('status')).toContainText('백업 작업 중 현재 기록이 바뀌');
  expect(confirmations).toBe(0);
  await navigate(page, '관찰 노트');
  await expect(page.getByText('파일 읽기 중 새로 추가한 가상 기록', { exact: true })).toBeVisible();
});

test("손상된 JSON과 20MB 초과 파일은 기록을 교체하지 않는다", async ({ page }) => {
  await navigate(page, "설정 및 백업");
  const input = page.getByLabel("JSON 백업 파일 선택", { exact: true });
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{broken json") });
  await expect(page.getByRole("status")).toContainText("백업 파일을 읽지 못했거나 적용하지 못했습니다.");
  await input.setInputFiles({ name: "wrong-format.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await expect(page.getByRole("status")).toContainText("지원하지 않는 백업 형식입니다.");
  await input.setInputFiles({ name: "too-large.json", mimeType: "application/json", buffer: Buffer.alloc(MAX_JSON_BACKUP_BYTES + 1, " ") });
  await expect(page.getByRole("status")).toContainText("20MB 이하의 JSON 백업 파일");
  await navigate(page, "관찰 노트");
  await expect(page.getByText("총 12개의 기록", { exact: true })).toBeVisible();
});

test("나이스 인증키가 없으면 503과 연결 준비 안내를 표시한다", async ({ page }) => {
  await navigate(page, "학교 · 학사일정");
  await page.getByLabel("학교 이름", { exact: true }).fill("가재울초등학교");
  const responsePromise = page.waitForResponse(response => response.url().includes("/api/neis?") && response.request().method() === "GET");
  await page.getByRole("button", { name: "학교 검색", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(503);
  expect((await response.json()).code).toBe("NEIS_NOT_CONFIGURED");
  await expect(page.getByRole("region", { name: "우리 학교 찾기" }).getByRole("alert")).toContainText("나이스 API 인증키가 아직 설정되지 않았습니다.");
  await expect(page.getByRole("button", { name: "선택", exact: true })).toHaveCount(0);
  await expect(page.getByText("위에서 학교를 선택하면 월별 학사일정을 조회할 수 있습니다.", { exact: true })).toBeVisible();
});

test("없는 관찰 근거는 직접 해제하고 새 근거를 연결해 검토할 수 있다", async ({ page }) => {
  await navigate(page, "나이스 입력 준비");
  await selectStudent(page, "오해솔");
  const editor = page.getByLabel("나이스에 입력할 문장", { exact: true });
  await expect(editor).toBeDisabled();
  await expect(page.getByRole("button", { name: "검토 완료", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "유효하지 않은 근거 연결 해제", exact: true }).click();
  await expect(editor).toBeEnabled();
  await expect(page.getByRole("button", { name: "검토 완료", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "기록 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "학생", exact: true })).toHaveValue("student-8");
  await dialog.getByRole("textbox", { name: "관찰한 내용", exact: true }).fill("학급 책 정리에서 책의 분류를 확인하고 맡은 칸을 정리함.");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "검토 완료", exact: true }).click();
  await expect(page.locator(".editor-title").getByText("검토 완료", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "문장 복사", exact: true })).toBeEnabled();
});

test("손상된 브라우저 저장 원문을 복구 사본으로 내려받을 수 있다", async ({ page }) => {
  // Deliberately damage persisted storage to exercise the app's recovery path.
  const damaged = '{"version":1,"students":[{"name":"손상된 연습 자료"}';
  await page.evaluate(raw => localStorage.setItem("damim-note.demo.v1", raw), damaged);
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("기존 원본은 브라우저에 그대로 보존");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "복구 사본 다운로드", exact: true }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  expect(await readFile(filePath!, "utf8")).toBe(damaged);
  await expect(page.getByRole("heading", { name: "선생님, 오늘도 반갑습니다", level: 1 })).toBeVisible();
});
