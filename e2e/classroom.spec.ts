import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createDemoWorkspace } from "../src/lib/demo";
import { LEGACY_STORAGE_KEY, workspaceStorageKey } from "../src/lib/workspace-storage";

async function openClassroom(page: Page) {
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: "학급 · 명부", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "학급 · 명부" })).toBeVisible();
}

test("학급 설정과 명부 추가·수정·보호 삭제 및 백업이 이어진다", async ({ page }) => {
  await page.goto("/");
  await openClassroom(page);
  await page.getByLabel("학년도", { exact: true }).fill("2027");
  await page.getByLabel("학년", { exact: true }).selectOption("5");
  await page.getByLabel("반", { exact: true }).fill("3");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "학급 정보 저장", exact: true }).click();
  await expect(page.locator(".class-switch")).toContainText("5학년 3반");
  await page.getByLabel("학생 번호", { exact: true }).fill("9");
  await page.getByLabel("학생 이름", { exact: true }).fill("가상아홉");
  await page.getByRole("button", { name: "학생 추가", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "가상아홉" })).toContainText("0 / 0");
  await expect(page.getByRole("button", { name: "1번 강가람 삭제", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "9번 가상아홉 정보 수정", exact: true }).click();
  await page.getByLabel("학생 번호", { exact: true }).fill("10");
  await page.getByRole("button", { name: "학생 수정 저장", exact: true }).click();
  await page.reload();
  await openClassroom(page);
  await expect(page.getByLabel("학년도", { exact: true })).toHaveValue("2027");
  await expect(page.getByRole("button", { name: "10번 가상아홉 정보 수정", exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "명부 CSV 내려받기", exact: true }).click();
  const downloaded = await downloadPromise;
  expect(await readFile((await downloaded.path())!, "utf8")).toContain('10,"가상아홉"');
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "10번 가상아홉 삭제", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "가상아홉" })).toHaveCount(0);
});

test("CSV와 엑셀 붙여넣기는 미리보기 후에만 적용되며 중복은 원본을 보존한다", async ({ page }) => {
  await page.goto("/"); await openClassroom(page);
  const input = page.getByLabel("명부 붙여넣기", { exact: true });
  await input.fill("번호\t이름\n1\t가상중복");
  await page.getByRole("button", { name: "명부 미리보기", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("현재 명부에 있습니다");
  await expect(page.getByRole("button", { name: "미리본 학생 추가" })).toHaveCount(0);
  await page.getByLabel("명부 파일", { exact: true }).setInputFiles({ name: "가상명부.csv", mimeType: "text/csv", buffer: Buffer.from('\uFEFF번호,이름\r\n9,가상아홉\r\n10,"가상열"') });
  await expect(page.getByRole("heading", { name: "추가할 학생 2명" })).toBeVisible();
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(8);
  await page.getByRole("button", { name: "미리본 학생 추가", exact: true }).click();
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(10);
  await page.reload(); await openClassroom(page);
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(10);
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: "관찰 노트", exact: true }).click();
  await expect(page.getByText("총 12개의 기록", { exact: true })).toBeVisible();
});

test("구버전 원본을 남기고 변환하며 다른 탭의 편집을 감지한다", async ({ page, context }) => {
  await page.goto("/");
  const { classroom: _classroom, ...data } = createDemoWorkspace();
  const legacy = JSON.stringify({ ...data, version: 1 });
  await page.evaluate(raw => localStorage.setItem("damim-note.demo.v1", raw), legacy);
  await page.reload();
  const other = await context.newPage();
  await other.goto("/"); await openClassroom(other);
  await openClassroom(page);
  await page.getByLabel("학생 번호", { exact: true }).fill("9");
  await page.getByLabel("학생 이름", { exact: true }).fill("탭에서추가");
  await page.getByRole("button", { name: "학생 추가", exact: true }).click();
  await expect(other.getByRole("main").getByRole("alert")).toContainText("다른 탭");
  await expect(other.getByRole("button", { name: "학생 추가", exact: true })).toBeDisabled();
  await other.getByRole('button', { name: '설정 및 백업', exact: true }).click();
  await expect(other.getByRole('button', { name: '전체 기록 백업 파일 불러오기', exact: true })).toBeDisabled();
  await expect(other.getByRole('button', { name: '예시 데이터 초기화', exact: true })).toBeDisabled();
  await expect(other.getByRole('button', { name: '전체 기록 백업 파일 내려받기', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("damim-note.demo.v1"))).toBe(legacy);
  await other.getByRole("button", { name: "최신 기록 불러오기", exact: true }).click();
  await openClassroom(other);
  await expect(other.getByRole("row").filter({ hasText: "탭에서추가" })).toBeVisible();
  await other.close();
});

test("390px 명부 화면은 가로 넘침 없이 입력할 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await openClassroom(page);
  await expect(page.getByLabel("학생 번호", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("새 학급 선택과 취소 또는 보관 파일 실패는 현재 기록을 바꾸지 않는다", async ({ page }) => {
  await page.goto("/"); await openClassroom(page);
  const key = workspaceStorageKey(null);
  const before = await page.evaluate(storageKey => localStorage.getItem(storageKey), key);
  await page.getByRole("button", { name: "빈 가상 학급으로 시작하기", exact: true }).click();
  const confirmation = page.getByRole("table", { name: "학급 교체 전후 확인" });
  await expect(confirmation.getByRole("row", { name: /현재 기록/ })).toContainText("8명");
  await expect(confirmation.getByRole("row", { name: /현재 기록/ })).toContainText("12건");
  await expect(confirmation.getByRole("row", { name: /교체할 기록/ })).toContainText("0명");
  await expect(page.getByRole("button", { name: "빈 가상 학급으로 교체", exact: true })).toBeDisabled();
  await expect(page.getByLabel("현재 기록의 보관 파일이 저장된 것을 확인했습니다.", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "교체 취소", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(8);
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBe(before);

  await page.getByRole("button", { name: "빈 가상 학급으로 시작하기", exact: true }).click();
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error("가상 테스트: 보관 파일 생성 실패"); }; });
  await page.getByRole("button", { name: "교체 전 보관 파일 내려받기", exact: true }).click();
  await expect(page.getByRole("region", { name: "가상 학급 시작 방법", exact: true }).getByRole("alert")).toContainText("보관 파일을 만들지 못했습니다. 현재 기록은 유지됩니다.");
  await expect(page.getByRole("button", { name: "빈 가상 학급으로 교체", exact: true })).toBeDisabled();
  await expect(page.getByLabel("현재 기록의 보관 파일이 저장된 것을 확인했습니다.", { exact: true })).toBeDisabled();
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBe(before);
});

test("전체 보관 파일 확인 후 빈 가상 학급으로 교체하고 같은 번호의 새 명부를 추가한다", async ({ page }) => {
  const sample = createDemoWorkspace();
  sample.classroom = { year: 2027, grade: 5, room: "3", semester: 1 };
  sample.semesterPreparation = {
    classroom: { ...sample.classroom }, subject: "가상교과",
    entries: { "student-1": { content: "가상 활동에서 순서를 지키며 참여함.", reviewedSnapshot: null } },
  };
  const guestKey = workspaceStorageKey(null), accountKey = workspaceStorageKey("fictional-other-account");
  const untouched = JSON.stringify(createDemoWorkspace()), legacy = "synthetic-original-legacy";
  await page.goto("/");
  await page.evaluate(({ sample, guestKey, accountKey, untouched, legacyKey, legacy }) => {
    localStorage.setItem(guestKey, JSON.stringify(sample));
    localStorage.setItem(accountKey, untouched);
    localStorage.setItem(legacyKey, legacy);
  }, { sample, guestKey, accountKey, untouched, legacyKey: LEGACY_STORAGE_KEY, legacy });
  await page.reload(); await openClassroom(page);
  await page.getByRole("button", { name: "빈 가상 학급으로 시작하기", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "교체 전 보관 파일 내려받기", exact: true }).click();
  const downloaded = await downloadPromise;
  expect(JSON.parse(await readFile((await downloaded.path())!, "utf8"))).toEqual(sample);
  await expect(page.getByRole("button", { name: "빈 가상 학급으로 교체", exact: true })).toBeDisabled();
  await page.getByLabel("현재 기록의 보관 파일이 저장된 것을 확인했습니다.", { exact: true }).check();
  await page.getByRole("button", { name: "빈 가상 학급으로 교체", exact: true }).click();
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(0);
  await expect(page.getByLabel("학년도", { exact: true })).toHaveValue("2027");
  await expect(page.getByLabel("학년", { exact: true })).toHaveValue("5");
  await expect(page.getByLabel("반", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("학기", { exact: true })).toHaveValue("1");
  const persisted = await page.evaluate(({ guestKey, accountKey, legacyKey }) => ({
    current: JSON.parse(localStorage.getItem(guestKey)!), account: localStorage.getItem(accountKey), legacy: localStorage.getItem(legacyKey),
  }), { guestKey, accountKey, legacyKey: LEGACY_STORAGE_KEY });
  expect(persisted.current).toEqual({ version: 3, classroom: sample.classroom, students: [], observations: [], drafts: [] });
  expect(persisted.account).toBe(untouched); expect(persisted.legacy).toBe(legacy);

  await page.getByLabel("명부 붙여넣기", { exact: true }).fill("번호\t이름\n1\t가상새하나\n2\t가상새둘");
  await page.getByRole("button", { name: "명부 미리보기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "추가할 학생 2명" })).toBeVisible();
  await page.getByRole("button", { name: "미리본 학생 추가", exact: true }).click();
  await page.reload(); await openClassroom(page);
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(2);
  await expect(page.getByRole("row").filter({ hasText: "가상새하나" })).toContainText("0 / 0");
});

test("보관 이후 현재 자료가 바뀌면 준비한 학급 교체를 다시 확인해야 한다", async ({ page }) => {
  await page.goto("/"); await openClassroom(page);
  await page.getByRole("button", { name: "빈 가상 학급으로 시작하기", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "교체 전 보관 파일 내려받기", exact: true }).click();
  await downloaded;
  await page.getByLabel("현재 기록의 보관 파일이 저장된 것을 확인했습니다.", { exact: true }).check();
  await page.getByLabel("학생 번호", { exact: true }).fill("9");
  await page.getByLabel("학생 이름", { exact: true }).fill("가상추가학생");
  await page.getByRole("button", { name: "학생 추가", exact: true }).click();
  await expect(page.getByRole("region", { name: "가상 학급 시작 방법", exact: true }).getByRole("alert")).toContainText("현재 기록이 바뀌었습니다");
  await expect(page.getByRole("button", { name: "빈 가상 학급으로 교체", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "교체 전 보관 파일 내려받기", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "교체 취소", exact: true }).click();
  await page.reload(); await openClassroom(page);
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(9);
  await expect(page.getByRole("row").filter({ hasText: "가상추가학생" })).toBeVisible();
});

test("빈 기록에서 예시 학급 선택은 명시적 교체 후에만 예시를 채운다", async ({ page }) => {
  const demo = createDemoWorkspace();
  const empty = { version: 3, classroom: { ...demo.classroom, grade: 5 }, students: [], observations: [], drafts: [] };
  const key = workspaceStorageKey(null);
  await page.goto("/");
  await page.evaluate(({ key, empty }) => localStorage.setItem(key, JSON.stringify(empty)), { key, empty });
  await page.reload(); await openClassroom(page);
  await page.getByRole("button", { name: "예시로 연습하기", exact: true }).click();
  expect(JSON.parse((await page.evaluate(storageKey => localStorage.getItem(storageKey), key))!)).toEqual(empty);
  await expect(page.getByRole("button", { name: "교체 전 보관 파일 내려받기", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "예시 학급으로 교체", exact: true }).click();
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(8);
  expect(JSON.parse((await page.evaluate(storageKey => localStorage.getItem(storageKey), key))!)).toEqual(demo);
});

test("미검토 학기말 문장도 명부의 문장 수에 포함하고 학생 삭제를 막는다", async ({ page }) => {
  const sample = createDemoWorkspace();
  sample.students = [{ id: "fictional-semester-student", number: 1, name: "가상학기말학생" }];
  sample.observations = []; sample.drafts = [];
  sample.semesterPreparation = {
    classroom: { ...sample.classroom }, subject: "가상교과",
    entries: { "fictional-semester-student": { content: "가상 활동에서 자신의 생각을 설명함.", reviewedSnapshot: null } },
  };
  const key = workspaceStorageKey(null);
  await page.goto("/");
  await page.evaluate(({ key, sample }) => localStorage.setItem(key, JSON.stringify(sample)), { key, sample });
  await page.reload(); await openClassroom(page);
  await expect(page.getByRole("row").filter({ hasText: "가상학기말학생" })).toContainText("0 / 1");
  await expect(page.getByRole("button", { name: "1번 가상학기말학생 삭제", exact: true })).toBeDisabled();

  sample.semesterPreparation.entries["fictional-semester-student"].content = "";
  await page.evaluate(({ key, sample }) => localStorage.setItem(key, JSON.stringify(sample)), { key, sample });
  await page.reload(); await openClassroom(page);
  await expect(page.getByRole("row").filter({ hasText: "가상학기말학생" })).toContainText("0 / 0");
  await expect(page.getByRole("button", { name: "1번 가상학기말학생 삭제", exact: true })).toBeEnabled();

  // Older backups allow arbitrary clean student IDs. A missing own entry must
  // not read Object.prototype.constructor as a student's semester sentence.
  sample.students = [{ id: "constructor", number: 1, name: "가상생성자학생" }];
  sample.semesterPreparation.entries = {};
  await page.evaluate(({ key, sample }) => localStorage.setItem(key, JSON.stringify(sample)), { key, sample });
  await page.reload(); await openClassroom(page);
  await expect(page.getByRole("row").filter({ hasText: "가상생성자학생" })).toContainText("0 / 0");
  const remove = page.getByRole("button", { name: "1번 가상생성자학생 삭제", exact: true });
  await expect(remove).toBeEnabled();
  page.once("dialog", dialog => dialog.accept());
  await remove.click();
  await expect(page.locator(".roster-table tbody tr")).toHaveCount(0);
});
