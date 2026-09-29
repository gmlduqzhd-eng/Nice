import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createDemoWorkspace } from "../src/lib/demo";

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
