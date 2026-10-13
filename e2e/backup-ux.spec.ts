import { expect, test } from "@playwright/test";
import { createDemoWorkspace } from "../src/lib/demo";

test("잘못 고른 나이스 파일과 손상된 백업은 지속 안내를 표시하고 현재 기록을 보존한다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "설정 및 백업", exact: true }).click();
  const backup = page.getByRole("region", { name: "전체 기록 백업 파일" });
  const input = page.getByLabel("JSON 백업 파일 선택", { exact: true });
  await input.setInputFiles({ name: "neis-job.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "damim-neis-job", version: 1, rows: [] })) });
  await expect(backup).toContainText("선택한 파일은 나이스 입력 작업 파일입니다.");
  // The card retains an actionable explanation after the toast goes away.
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(backup).toContainText("‘전체 기록 백업 파일 내려받기’로 보관한 파일을 사용");
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{broken") });
  await expect(backup).toContainText("백업 파일을 읽지 못했거나 적용하지 못했습니다.");
  await expect(backup).toContainText("현재 기록은 유지됩니다.");
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: "관찰 노트", exact: true }).click();
  await expect(page.getByText("총 12개의 기록", { exact: true })).toBeVisible();
});

test("파일 복원과 예시 초기화 취소는 현재 자료를 유지하며 같은 파일로 다시 복원할 수 있다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "설정 및 백업", exact: true }).click();
  const restored = createDemoWorkspace();
  restored.classroom.room = "3";
  restored.observations.push({ id: "fictional-backup-marker", studentId: restored.students[0].id, date: "2026-10-01", category: "생활", content: "복원 확인을 위한 가상 기록" });
  const file = { name: "fictional-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(restored)) };
  const backup = page.getByRole("region", { name: "전체 기록 백업 파일" });
  const input = page.getByLabel("JSON 백업 파일 선택", { exact: true });
  page.once("dialog", async dialog => {
    await dialog.dismiss();
  });
  await input.setInputFiles(file);
  await expect(backup).toContainText("JSON 백업 복원을 취소했습니다. 현재 기록은 유지됩니다.");
  await expect(page.locator(".class-switch")).toContainText("2반");
  await expect(page.getByRole("region", { name: "불러온 백업" })).toHaveCount(0);
  page.once("dialog", dialog => dialog.accept());
  await input.setInputFiles(file);
  await expect(page.locator(".class-switch")).toContainText("3반");
  await expect(page.getByRole("region", { name: "불러온 백업" })).toContainText("관찰 13건");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "예시 데이터 초기화", exact: true }).click();
  await expect(backup).toContainText("예시 데이터 초기화를 취소했습니다. 현재 기록은 유지됩니다.");
  await expect(page.getByRole("region", { name: "불러온 백업" })).toContainText("관찰 13건");
  await page.getByRole("button", { name: "관찰 노트에서 확인", exact: true }).click();
  await expect(page.getByText("복원 확인을 위한 가상 기록", { exact: true })).toBeVisible();
});
