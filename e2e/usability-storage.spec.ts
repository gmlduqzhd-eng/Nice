import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createDemoWorkspace } from "../src/lib/demo";
import type { WorkspaceData } from "../src/lib/domain";
import { workspaceStorageKey } from "../src/lib/workspace-storage";
import { mockSupabase, TEST_USER_ID } from "./helpers/supabase";

function semesterWorkspace(): WorkspaceData {
  const workspace = createDemoWorkspace();
  workspace.semesterPreparation = {
    classroom: { year: 2027, grade: 5, room: "가상반", semester: 1 },
    subject: "수학",
    entries: {
      "student-1": { content: "가상 검증용 학기말 문장 하나.", reviewedSnapshot: null },
      "student-2": { content: "가상 검증용 학기말 문장 둘.", reviewedSnapshot: null },
      "student-3": { content: "  ", reviewedSnapshot: null },
    },
  };
  return workspace;
}

async function seedWorkspace(page: Page, userId: string | null, workspace: WorkspaceData) {
  await page.addInitScript(({ key, raw }) => {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
  }, { key: workspaceStorageKey(userId), raw: JSON.stringify(workspace) });
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "설정 및 백업", exact: true }).click();
  await expect(page.getByRole("heading", { name: "설정 및 백업", level: 1 })).toBeVisible();
}

test("로그인 전 저장 위치와 체험 기록 이전을 안내하고 전체 파일에 학기말 문장을 보관한다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  const workspace = semesterWorkspace();
  await seedWorkspace(page, null, workspace);
  await page.goto("/");
  await page.getByRole("button", { name: "회원가입 · 로그인", exact: true }).click();
  const auth = page.getByRole("dialog", { name: /^(?:이메일로 시작하기|간편하게 시작하기)$/ });
  await expect(auth).toContainText("계정으로 자동 이전되지 않습니다");
  await expect(auth).toContainText("전체 기록 백업 파일을 내려받은 뒤 로그인하고");
  await expect(auth).toContainText("다른 PC에서는 같은 계정으로 로그인하고");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await auth.getByRole("button", { name: "체험 계속하기", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSettings(page);
  const cloud = page.getByRole("region", { name: "내 계정 · 백업" });
  await expect(cloud).toContainText("이 PC의 자동 저장과 계정 백업은 별개입니다");
  await expect(cloud).toContainText("다른 PC에서 이어하기");
  await expect(cloud).toContainText("이어 쓴 뒤에도 계정 백업을 직접 저장해야 합니다");
  const local = page.getByRole("region", { name: "전체 기록 백업 파일" });
  await expect(local).toContainText("이 PC의 현재 브라우저에 자동 저장됩니다");

  const downloadReady = page.waitForEvent("download");
  await local.getByRole("button", { name: "전체 기록 백업 파일 내려받기", exact: true }).click();
  const download = await downloadReady;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported).toEqual(workspace);

  const imported = structuredClone(workspace);
  imported.semesterPreparation!.entries["student-3"].content = "가상 검증용 학기말 문장 셋.";
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("현재 기록:");
    expect(dialog.message()).toContain("학기말 문장 2건");
    expect(dialog.message()).toContain("학기말 문장 3건");
    await dialog.accept();
  });
  await page.getByLabel("JSON 백업 파일 선택", { exact: true }).setInputFiles({
    name: "fictional-whole-workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByRole("region", { name: "불러온 백업" })).toContainText("학기말 문장 3건");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mock.cloudRequests()).toHaveLength(0);
  expect(mock.state.unexpected).toEqual([]);
});

test("계정 백업 시각과 일치 여부를 보여 주고 새 편집 뒤에는 다시 저장하도록 안내한다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  const workspace = semesterWorkspace();
  await seedWorkspace(page, TEST_USER_ID, workspace);
  await mock.completeMagicLink();
  await openSettings(page);
  const backupState = page.getByRole("status", { name: "계정 백업 상태" });
  await expect(backupState).toContainText("저장 또는 불러오기를 눌러 확인하세요");
  expect(mock.cloudRequests()).toHaveLength(0);
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("학기말 문장 2건");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "클라우드에 저장", exact: true }).click();
  await expect(backupState).toContainText("마지막으로 확인한 계정 백업 시각:");
  await expect(backupState).toContainText("확인한 계정 백업은 현재 기록과 일치합니다");
  expect(mock.state.snapshot?.data).toEqual(workspace);
  expect(mock.cloudWrites()).toHaveLength(1);

  await page.getByRole("button", { name: "관찰 기록 남기기", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("관찰한 내용", { exact: true }).fill("계정 백업 이후 이 PC에서 추가한 가상 관찰 기록.");
  await editor.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(backupState).toContainText("현재 기록과 확인한 계정 백업이 다릅니다");
  expect(mock.cloudWrites()).toHaveLength(1);
  expect(mock.state.snapshot?.data.observations).toHaveLength(12);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "클라우드에 저장", exact: true }).click();
  await expect(backupState).toContainText("확인한 계정 백업은 현재 기록과 일치합니다");
  expect(mock.state.snapshot?.data.observations).toHaveLength(13);
  expect(mock.cloudWrites()).toHaveLength(2);
  expect(mock.state.unexpected).toEqual([]);
});

test("계정 백업 조회는 키 순서와 무관하게 비교하며 취소한 복원은 현재 기록을 보존한다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  const workspace = semesterWorkspace();
  await seedWorkspace(page, TEST_USER_ID, workspace);
  const reordered = structuredClone(workspace);
  reordered.semesterPreparation!.entries = Object.fromEntries(Object.entries(reordered.semesterPreparation!.entries).reverse());
  mock.state.snapshot = { data: reordered, updated_at: "2026-10-01T00:00:00.000Z" };
  await mock.completeMagicLink();
  await openSettings(page);
  const backupState = page.getByRole("status", { name: "계정 백업 상태" });
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "클라우드에서 불러오기", exact: true }).click();
  await expect(backupState).toContainText("확인한 계정 백업은 현재 기록과 일치합니다");

  const changed = structuredClone(workspace);
  changed.semesterPreparation!.entries["student-3"].content = "다른 PC에서 보관한 가상 학기말 문장.";
  mock.state.snapshot = { data: changed, updated_at: "2026-10-02T00:00:00.000Z" };
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("학기말 문장 3건");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "클라우드에서 불러오기", exact: true }).click();
  await expect(backupState).toContainText("현재 기록과 확인한 계정 백업이 다릅니다");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), workspaceStorageKey(TEST_USER_ID))).toEqual(workspace);
  await expect(page.getByRole("region", { name: "불러온 백업" })).toHaveCount(0);

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "클라우드에서 불러오기", exact: true }).click();
  await expect(page.getByRole("region", { name: "불러온 백업" })).toContainText("학기말 문장 3건");
  await expect(backupState).toContainText("확인한 계정 백업은 현재 기록과 일치합니다");
  expect(mock.cloudWrites()).toHaveLength(0);
  expect(mock.state.unexpected).toEqual([]);
});
