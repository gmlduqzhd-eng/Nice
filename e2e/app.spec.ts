import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.getByText("Supabase가 아직 연결되지 않았습니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "클라우드 연결 대기" })).toBeDisabled();
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
  expect(backup.version).toBe(1);
  expect(backup.students).toHaveLength(8);
  expect(backup.observations).toHaveLength(12);

  await navigate(page, "나이스 입력 준비");
  await selectStudent(page, "강가람");
  await page.getByLabel("나이스에 입력할 문장", { exact: true }).fill("백업 복원을 확인하기 위한 연습 문장입니다.");
  await navigate(page, "설정 및 백업");
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("학생 8명의 백업");
    await dialog.accept();
  });
  await page.getByLabel("JSON 백업 파일 선택", { exact: true }).setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: exported });
  await expect(page.getByRole("status")).toContainText("JSON 백업을 불러왔습니다.");
  await navigate(page, "나이스 입력 준비");
  await selectStudent(page, "강가람");
  await expect(page.getByLabel("나이스에 입력할 문장", { exact: true })).toHaveValue(backup.drafts[0].content);
  await expect(page.locator(".editor-title").getByText("반영 확인", { exact: true })).toBeVisible();
});

test("손상된 JSON과 1MB 초과 파일은 기록을 교체하지 않는다", async ({ page }) => {
  await navigate(page, "설정 및 백업");
  const input = page.getByLabel("JSON 백업 파일 선택", { exact: true });
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{broken json") });
  await expect(page.getByRole("status")).toContainText("백업 파일을 읽지 못했습니다.");
  await input.setInputFiles({ name: "wrong-format.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await expect(page.getByRole("status")).toContainText("지원하지 않는 백업 형식입니다.");
  await input.setInputFiles({ name: "too-large.json", mimeType: "application/json", buffer: Buffer.alloc(1024 * 1024 + 1, " ") });
  await expect(page.getByRole("status")).toContainText("1MB 이하의 JSON 백업 파일");
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
  await expect(page.getByRole("main").getByRole("alert")).toContainText("기존 원본은 브라우저에 별도 보관");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "복구 사본 다운로드", exact: true }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  expect(await readFile(filePath!, "utf8")).toBe(damaged);
  await expect(page.getByRole("heading", { name: "선생님, 오늘도 반갑습니다", level: 1 })).toBeVisible();
});
