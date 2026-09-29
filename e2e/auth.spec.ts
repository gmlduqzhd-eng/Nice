import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import type { WorkspaceData } from "../src/lib/domain";
import { createDemoWorkspace } from "../src/lib/demo";

// Synthetic identity only. These requests never reach Supabase or send email.
const TEST_EMAIL = "teacher-browser-test@example.invalid";
const TEST_USER_ID = "10000000-0000-4000-8000-000000000001";
const AUTH_DIALOG_NAME = /^(?:이메일로 시작하기|간편하게 시작하기)$/;
const GOOGLE_TEST_CREDENTIAL = "synthetic-google-id-token-not-a-credential";

type ApiRequest = { method: string; path: string; body: Record<string, unknown> | null };
type MockState = {
  requests: ApiRequest[];
  unexpected: string[];
  snapshot: { data: WorkspaceData; updated_at: string } | null;
  otpError: { status: number; code: string; message: string } | null;
  userError: { status: number; code: string; message: string } | null;
  idTokenError: { status: number; code: string; message: string } | null;
  googleScriptBlocked: boolean;
  googleScriptRequests: number;
  googleCallbackRepeats: number;
  readGate: (() => Promise<void>) | null;
  writeGate: (() => Promise<void>) | null;
};

async function mockSupabase(page: Page, baseURL: string, identity = TEST_USER_ID, issuedAt = Math.floor(Date.now() / 1000)) {
  const TEST_USER_ID = identity;
  const appOrigin = new URL(baseURL).origin;
  const now = issuedAt;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: TEST_USER_ID, aud: "authenticated", role: "authenticated", email: TEST_EMAIL, iat: now, exp: now + 3600 }),
    Buffer.from("synthetic-invalid-signature-for-browser-tests").toString("base64url"),
  ].join(".");
  const user = {
    id: TEST_USER_ID, aud: "authenticated", role: "authenticated", email: TEST_EMAIL,
    email_confirmed_at: "2026-09-29T00:00:00.000Z", phone: "",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
    identities: [], created_at: "2026-09-29T00:00:00.000Z", updated_at: "2026-09-29T00:00:00.000Z",
  };
  const state: MockState = {
    requests: [], unexpected: [], snapshot: null, otpError: null, userError: null,
    idTokenError: null, googleScriptBlocked: false, googleScriptRequests: 0, googleCallbackRepeats: 1,
    readGate: null, writeGate: null,
  };
  const callbackFragment = new URLSearchParams({
    access_token: accessToken, refresh_token: "synthetic-refresh-token-not-a-credential",
    expires_in: "3600", expires_at: String(now + 3600), token_type: "bearer", type: "magiclink",
  }).toString();

  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "https://accounts.google.com" && url.pathname === "/gsi/client") {
      state.googleScriptRequests += 1;
      if (state.googleScriptBlocked) return route.abort("blockedbyclient");
      // A tiny GIS contract stub: no real identity, popup, Google request, or token issuance.
      // Public DOM attributes let the test inspect only the nonce passed to Google.
      return route.fulfill({ status: 200, contentType: "application/javascript", body: `
        (() => {
          let configuration;
          window.google = { accounts: { id: {
            initialize(options) { configuration = options; },
            renderButton(element) {
              const options = configuration;
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = 'Google로 계속하기';
              button.setAttribute('data-google-client-id', options.client_id);
              button.setAttribute('data-google-nonce', options.nonce);
              button.addEventListener('click', () => {
                for (let index = 0; index < ${state.googleCallbackRepeats}; index += 1) {
                  options.callback({ credential: ${JSON.stringify(GOOGLE_TEST_CREDENTIAL)}, select_by: 'btn' });
                }
              });
              element.replaceChildren(button);
            },
            cancel() {},
            disableAutoSelect() {},
          } } };
        })();
      ` });
    }
    const isSupabasePath = /^\/(auth|rest|storage|functions)\/v1\//.test(url.pathname);
    if (!isSupabasePath && url.origin === appOrigin) return route.continue();
    // Block every external request; fonts can use the app's system fallback.
    if (!isSupabasePath) return route.abort("blockedbyclient");

    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : null;
    state.requests.push({ method: request.method(), path: url.pathname, body });
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname === "/auth/v1/otp" && request.method() === "POST") {
      if (state.otpError) return json({ code: state.otpError.code, msg: state.otpError.message }, state.otpError.status);
      return json({});
    }
    if (url.pathname === "/auth/v1/token" && request.method() === "POST") {
      expect(url.searchParams.get("grant_type")).toBe("id_token");
      if (state.idTokenError) return json({ code: state.idTokenError.code, msg: state.idTokenError.message }, state.idTokenError.status);
      return json({ access_token: accessToken, refresh_token: "synthetic-refresh-token-not-a-credential", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user });
    }
    if (url.pathname === "/auth/v1/user" && request.method() === "GET") {
      expect(request.headers().authorization).toBe(`Bearer ${accessToken}`);
      if (state.userError) return json({ code: state.userError.code, msg: state.userError.message }, state.userError.status);
      return json(user);
    }
    if (url.pathname === "/auth/v1/logout" && request.method() === "POST") {
      return route.fulfill({ status: 204 });
    }
    if (url.pathname === "/rest/v1/teacher_workspaces") {
      expect(request.headers().authorization).toBe(`Bearer ${accessToken}`);
      if (request.method() === "GET") {
        expect(url.searchParams.get("user_id")).toBe(`eq.${TEST_USER_ID}`);
        const snapshot = structuredClone(state.snapshot);
        await state.readGate?.();
        return json(snapshot ? [snapshot] : []);
      }
      if (request.method() === "POST") {
        expect(body?.user_id).toBe(TEST_USER_ID);
        if (state.snapshot && !url.searchParams.has("on_conflict")) return json({ code: "23505", message: "duplicate key" }, 409);
        state.snapshot = { data: structuredClone(body?.data as WorkspaceData), updated_at: String(body?.updated_at) };
        await state.writeGate?.();
        return json({ updated_at: state.snapshot.updated_at }, 201);
      }
      if (request.method() === "PATCH") {
        expect(url.searchParams.get("user_id")).toBe(`eq.${TEST_USER_ID}`);
        expect(body?.user_id).toBeUndefined();
        expect(request.headers().accept).not.toBe('application/vnd.pgrst.object+json');
        if (!state.snapshot || url.searchParams.get("updated_at") !== `eq.${state.snapshot.updated_at}`) {
          return json([]);
        }
        expect(new Date(String(body?.updated_at)).getTime()).toBeGreaterThan(new Date(state.snapshot.updated_at).getTime());
        state.snapshot = { data: structuredClone(body?.data as WorkspaceData), updated_at: String(body?.updated_at) };
        await state.writeGate?.();
        return json([{ updated_at: state.snapshot.updated_at }]);
      }
    }
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });

  return {
    state,
    issuedAt,
    callbackFragment,
    cloudRequests: () => state.requests.filter(request => request.path.startsWith("/rest/")),
    cloudWrites: () => state.requests.filter(request => request.path.startsWith("/rest/") && request.method !== "GET"),
    async completeMagicLink() {
      // A mail link opens a document; changing only the current page's hash would
      // bypass auth initialization and would not simulate that browser behavior.
      await page.goto("about:blank");
      await page.goto(`/#${callbackFragment}`);
      await expect(page.getByRole("button", { name: "내 계정", exact: true })).toBeVisible();
      await expect.poll(() => new URL(page.url()).hash).toBe("");
    },
  };
}

async function openAuth(page: Page) {
  await page.getByRole("button", { name: "회원가입 · 로그인", exact: true }).click();
  return expectAuthDialog(page);
}

test("체험 공간과 두 계정의 명부는 섞이지 않고 재로그인하면 각자 복원된다", async ({ page, baseURL }) => {
  const navigateRoster = async () => {
    await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: "학급 · 명부", exact: true }).click();
    await expect(page.getByRole("heading", { name: "학급 · 명부", level: 1 })).toBeVisible();
  };
  const add = async (number: string, name: string) => {
    await page.getByLabel("학생 번호", { exact: true }).fill(number);
    await page.getByLabel("학생 이름", { exact: true }).fill(name);
    await page.getByRole("button", { name: "학생 추가", exact: true }).click();
    await expect(page.locator(".roster-table")).toContainText(name);
  };
  const logout = async () => {
    await openSettings(page);
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(page.getByRole("button", { name: "회원가입 · 로그인", exact: true })).toBeVisible();
  };
  await mockSupabase(page, baseURL!);
  await page.goto("/"); await navigateRoster(); await add("9", "체험학생");
  const a = await mockSupabase(page, baseURL!);
  await a.completeMagicLink(); await navigateRoster();
  await expect(page.locator(".roster-table")).not.toContainText("체험학생");
  await add("10", "가상계정A"); await logout(); await navigateRoster();
  await expect(page.locator(".roster-table")).toContainText("체험학생");
  await expect(page.locator(".roster-table")).not.toContainText("가상계정A");
  const b = await mockSupabase(page, baseURL!, "10000000-0000-4000-8000-000000000002");
  await b.completeMagicLink(); await navigateRoster();
  await expect(page.locator(".roster-table")).not.toContainText("체험학생");
  await expect(page.locator(".roster-table")).not.toContainText("가상계정A");
  await add("11", "가상계정B"); await logout();
  const again = await mockSupabase(page, baseURL!);
  await again.completeMagicLink(); await navigateRoster();
  await expect(page.locator(".roster-table")).toContainText("가상계정A");
  await expect(page.locator(".roster-table")).not.toContainText("가상계정B");
  expect([...a.cloudRequests(), ...b.cloudRequests(), ...again.cloudRequests()]).toHaveLength(0);
});

async function expectAuthDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: AUTH_DIALOG_NAME });
  await expect(dialog).toBeVisible();
  const googleEnabled = await dialog.getByRole("heading", { name: "간편하게 시작하기", exact: true }).isVisible();
  await expect(dialog).toHaveAccessibleName(googleEnabled ? "간편하게 시작하기" : "이메일로 시작하기");
  return dialog;
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "설정 및 백업", exact: true }).click();
  await expect(page.getByRole("heading", { name: "설정 및 백업", level: 1 })).toBeVisible();
}

test("이메일 링크로 새 계정과 기존 계정을 같은 화면에서 시작하고 자동 전송하지 않는다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  await page.goto("/");
  const dialog = await openAuth(page);
  const email = dialog.getByRole("textbox", { name: "이메일 주소", exact: true });
  await email.fill("invalid-email");
  await dialog.getByRole("button", { name: "로그인 링크 받기", exact: true }).click();
  expect(mock.state.requests.filter(request => request.path === "/auth/v1/otp")).toHaveLength(0);
  await email.fill(TEST_EMAIL);
  await dialog.getByRole("button", { name: "로그인 링크 받기", exact: true }).click();
  await expect.poll(() => mock.state.requests.filter(request => request.path === "/auth/v1/otp").length).toBe(1);
  const sent = mock.state.requests.find(request => request.path === "/auth/v1/otp");
  expect(sent?.body?.email).toBe(TEST_EMAIL);
  expect(sent?.body?.create_user).toBe(true);
  await expect(dialog).toContainText(TEST_EMAIL);
  await expect(dialog.getByRole("button", { name: /초 후 다시 받기/ })).toBeDisabled();
  expect(mock.cloudRequests()).toHaveLength(0);
  await mock.completeMagicLink();
  expect(mock.cloudRequests()).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "내 계정", exact: true })).toBeVisible();
  expect(mock.cloudWrites()).toHaveLength(0);
  expect(mock.state.unexpected).toEqual([]);
});

test("메일 발송 제한을 이해할 수 있는 안내로 표시하고 이메일을 고쳐 재시도한다", async ({ page, baseURL }) => {
  await page.clock.install();
  const mock = await mockSupabase(page, baseURL!);
  mock.state.otpError = { status: 429, code: "over_email_send_rate_limit", message: "Email rate limit exceeded" };
  await page.goto("/");
  const dialog = await openAuth(page);
  await dialog.getByRole("textbox", { name: "이메일 주소", exact: true }).fill(TEST_EMAIL);
  await dialog.getByRole("button", { name: "로그인 링크 받기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(/잠시|요청|다시/);
  await expect(dialog.getByRole("alert")).not.toContainText("Email rate limit exceeded");
  expect(mock.cloudRequests()).toHaveLength(0);

  mock.state.otpError = null;
  await expect(dialog.getByRole("button", { name: /초 후 다시 받기/ })).toBeDisabled();
  await page.clock.fastForward(61_000);
  await dialog.getByRole("button", { name: "로그인 링크 받기", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "메일함을 확인해 주세요", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "다른 이메일 사용", exact: true }).click();
  const changedEmail = "another-teacher@example.invalid";
  await dialog.getByRole("textbox", { name: "이메일 주소", exact: true }).fill(changedEmail);
  await dialog.getByRole("button", { name: "로그인 링크 받기", exact: true }).click();
  await expect(dialog).toContainText(changedEmail);
  expect(mock.state.requests.filter(request => request.path === "/auth/v1/otp").at(-1)?.body?.email).toBe(changedEmail);
  await dialog.getByRole("button", { name: "체험 계속하기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "선생님, 오늘도 반갑습니다", level: 1 })).toBeVisible();
  expect(mock.state.unexpected).toEqual([]);
});

test("로그인 창은 키보드로 닫고 돌아오며 모바일에서도 가로로 넘치지 않는다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "회원가입 · 로그인", exact: true });
  const dialog = await openAuth(page);
  const googleHeading = dialog.getByRole("heading", { name: "간편하게 시작하기", exact: true });
  const initialControl = await googleHeading.isVisible() ? googleHeading : dialog.getByRole("textbox", { name: "이메일 주소", exact: true });
  await expect(initialControl).toBeFocused();
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    // Native dialogs may hand focus to browser chrome at the tab boundary
    // (activeElement is BODY); underlying application controls must stay inert.
    expect(await dialog.evaluate(element => element.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  }
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(mock.state.unexpected).toEqual([]);
});

test("로그인 후 명시적으로 저장·불러오고 로그아웃하면 체험 공간으로 돌아간다", async ({ page, baseURL }, testInfo) => {
  const mock = await mockSupabase(page, baseURL!);
  await mock.completeMagicLink();
  await page.getByRole('button', { name: '계정 알림 닫기', exact: true }).click();
  expect(mock.cloudRequests()).toHaveLength(0);
  await openSettings(page);
  await expect(page.getByText(TEST_EMAIL, { exact: true })).toBeVisible();
  expect(mock.cloudRequests()).toHaveLength(0);

  page.once("dialog", async dialog => { expect(dialog.message()).toContain("클라우드"); await dialog.dismiss(); });
  await page.getByRole("button", { name: "클라우드에 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "클라우드에 저장", exact: true })).toBeEnabled();
  expect(mock.cloudWrites()).toHaveLength(0);
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("클라우드"); await dialog.accept(); });
  await page.getByRole("button", { name: "클라우드에 저장", exact: true }).click();
  await expect(page.getByText("현재 연습 기록을 클라우드에 저장했습니다.", { exact: true })).toBeVisible();
  expect(mock.cloudWrites()).toHaveLength(1);
  expect(mock.state.snapshot?.data.observations).toHaveLength(12);

  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: /^업무 한눈에/ }).click();
  await page.getByRole("button", { name: "관찰 기록 추가", exact: true }).click();
  const observation = page.getByRole("dialog");
  await observation.getByRole("textbox", { name: "관찰한 내용", exact: true }).fill("도서 정리 활동에서 친구와 책의 분류를 확인하고 맡은 칸을 정리함.");
  await observation.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: /쌓인 관찰 기록/ })).toContainText("13");
  expect(mock.cloudWrites()).toHaveLength(1);
  await openSettings(page);
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("교체");
    expect(dialog.message()).toContain("현재 기록: 2026학년도 4학년 2반 2학기 · 학생 8명 · 관찰 13건");
    expect(dialog.message()).toContain("불러올 백업: 2026학년도 4학년 2반 2학기 · 학생 8명 · 관찰 12건");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "클라우드에서 불러오기", exact: true }).click();
  await expect(page.getByText("클라우드 백업을 이 브라우저로 불러왔습니다.", { exact: true })).toBeVisible();
  const restored = page.getByRole('region', { name: '불러온 백업' });
  await expect(restored).toContainText('학생 8명 · 관찰 12건 · 작성 문장 8건');
  await page.screenshot({ path: testInfo.outputPath('backup-restored-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await restored.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('backup-restored-mobile.png'), fullPage: true, animations: 'disabled' });
  await restored.getByRole('button', { name: '관찰 노트에서 확인' }).click();
  await expect(page.getByRole('heading', { name: '관찰 노트', level: 1, exact: true })).toBeVisible();
  await expect(page.locator('.observation-row')).toHaveCount(12);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSettings(page);
  expect(mock.cloudWrites()).toHaveLength(1);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByRole("button", { name: "회원가입 · 로그인", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: /^업무 한눈에/ }).click();
  await expect(page.getByRole("button", { name: /쌓인 관찰 기록/ })).toContainText("12");
  await page.reload();
  await expect(page.getByRole("button", { name: "회원가입 · 로그인", exact: true })).toBeVisible();
  expect(mock.state.unexpected).toEqual([]);
});

test('로그인 완료 안내는 실제 로그인 때만 표시하고 새로고침과 재방문에는 표시하지 않는다', async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  const notice = page.getByText('로그인이 완료됐습니다. ‘내 계정’에서 기록을 저장할 수 있습니다.', { exact: true });
  await mock.completeMagicLink();
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '내 계정', exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await page.goto('about:blank');
  await page.goto('/');
  await expect(page.getByRole('button', { name: '내 계정', exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await openSettings(page);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await mock.completeMagicLink();
  await expect(notice).toBeVisible();
  expect(mock.state.unexpected).toEqual([]);
});

for (const existing of [false, true]) {
  test(`다른 기기가 확인 이후 ${existing ? '수정한' : '새로 만든'} 클라우드 백업은 덮어쓰지 않는다`, async ({ page, baseURL }) => {
    const mock = await mockSupabase(page, baseURL!);
    if (existing) mock.state.snapshot = { data: createDemoWorkspace(), updated_at: '2026-09-01T00:00:00.000Z' };
    await mock.completeMagicLink();
    await openSettings(page);
    const newer = createDemoWorkspace();
    newer.observations[0].content = '다른 기기에서 방금 저장한 가상 기록';
    page.once('dialog', async dialog => {
      mock.state.snapshot = { data: newer, updated_at: '2026-09-30T01:00:00.000Z' };
      await dialog.accept();
    });
    await page.getByRole('button', { name: '클라우드에 저장', exact: true }).click();
    await expect(page.getByText(/클라우드 백업이 다른 곳에서 변경/)).toBeVisible();
    expect(mock.state.snapshot?.data).toEqual(newer);
    await expect(page.getByText('현재 연습 기록을 클라우드에 저장했습니다.', { exact: true })).toHaveCount(0);
    expect(mock.state.unexpected).toEqual([]);
  });
}

test('클라우드 조회 중 추가한 관찰은 늦은 복원 응답으로 지워지지 않는다', async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  mock.state.snapshot = { data: createDemoWorkspace(), updated_at: '2026-09-01T00:00:00.000Z' };
  await mock.completeMagicLink();
  await openSettings(page);
  let readStarted = false;
  const release = Promise.withResolvers<void>();
  mock.state.readGate = async () => { readStarted = true; await release.promise; };
  let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; await dialog.accept(); });
  await page.getByRole('button', { name: '클라우드에서 불러오기', exact: true }).click();
  await expect.poll(() => readStarted).toBe(true);
  await page.getByRole('button', { name: '관찰 기록 남기기', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('관찰한 내용', { exact: true }).fill('백업 조회를 기다리는 동안 추가한 가상 기록');
  await editor.getByRole('button', { name: '기록 저장', exact: true }).click();
  release.resolve();
  await expect(page.getByText(/백업 작업 중 현재 기록이 바뀌/)).toBeVisible();
  expect(confirmations).toBe(0);
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '관찰 노트', exact: true }).click();
  await expect(page.getByText('백업 조회를 기다리는 동안 추가한 가상 기록', { exact: true })).toBeVisible();
  await expect(page.getByText('총 13개의 기록', { exact: true })).toBeVisible();
  expect(mock.cloudWrites()).toHaveLength(0);
});

test('기존 백업은 확인한 버전일 때만 갱신하고 느린 기기 시계에도 새 버전을 사용한다', async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  const old = createDemoWorkspace();
  old.observations[0].content = '이전 클라우드 가상 기록';
  mock.state.snapshot = { data: old, updated_at: '2099-01-01T00:00:00.000Z' };
  await mock.completeMagicLink();
  await openSettings(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '클라우드에 저장', exact: true }).click();
  await expect(page.getByText('현재 연습 기록을 클라우드에 저장했습니다.', { exact: true })).toBeVisible();
  expect(mock.cloudWrites().map(request => request.method)).toEqual(['PATCH']);
  expect(mock.state.snapshot.data).toEqual(createDemoWorkspace());
  expect(Date.parse(mock.state.snapshot.updated_at)).toBeGreaterThan(Date.parse('2099-01-01T00:00:00.000Z'));
});

test('저장 응답을 기다리는 동안의 편집은 별도 저장이 필요하다고 알린다', async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  await mock.completeMagicLink();
  await openSettings(page);
  const release = Promise.withResolvers<void>();
  mock.state.writeGate = () => release.promise;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '클라우드에 저장', exact: true }).click();
  await expect.poll(() => mock.state.snapshot?.data.observations.length).toBe(12);
  await page.getByRole('button', { name: '관찰 기록 남기기', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('관찰한 내용', { exact: true }).fill('클라우드 저장 응답을 기다리며 추가한 가상 기록');
  await editor.getByRole('button', { name: '기록 저장', exact: true }).click();
  release.resolve();
  await expect(page.getByText(/저장 요청 당시의 기록을 클라우드에 저장했습니다/)).toBeVisible();
  expect(mock.state.snapshot?.data.observations).toHaveLength(12);
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '관찰 노트', exact: true }).click();
  await expect(page.getByText('총 13개의 기록', { exact: true })).toBeVisible();
});

test('다른 탭에서 로그아웃하면 진행 중이던 복원 응답은 체험 공간에 적용하지 않는다', async ({ page, context, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  const cloud = createDemoWorkspace();
  cloud.observations[0].content = '계정 전용 가상 관찰';
  mock.state.snapshot = { data: cloud, updated_at: '2026-09-01T00:00:00.000Z' };
  await mock.completeMagicLink();
  await openSettings(page);
  const other = await context.newPage();
  await mockSupabase(other, baseURL!, TEST_USER_ID, mock.issuedAt);
  await other.goto('/');
  await expect(other.getByRole('button', { name: '내 계정', exact: true })).toBeVisible();
  await openSettings(other);
  const release = Promise.withResolvers<void>();
  let requested = false;
  mock.state.readGate = async () => { requested = true; await release.promise; };
  let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; await dialog.accept(); });
  await page.getByRole('button', { name: '클라우드에서 불러오기', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await other.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('button', { name: '회원가입 · 로그인', exact: true })).toBeVisible();
  const returned = page.waitForResponse(response => response.url().includes('/rest/v1/teacher_workspaces'));
  release.resolve();
  await returned;
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '관찰 노트', exact: true }).click();
  await expect(page.getByText('계정 전용 가상 관찰', { exact: true })).toHaveCount(0);
  expect(confirmations).toBe(0);
  expect(mock.cloudWrites()).toHaveLength(0);
});

test("만료된 이메일 링크는 재요청 안내를 보여주고 주소에서 인증 오류를 지운다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  await page.goto("/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  const dialog = await expectAuthDialog(page);
  await expect(dialog).toContainText(/만료|유효하지/);
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await expect(dialog.getByRole("button", { name: "로그인 링크 받기", exact: true })).toBeEnabled();
  expect(mock.cloudRequests()).toHaveLength(0);
  expect(mock.state.unexpected).toEqual([]);
});

test("콜백 토큰 검증에 실패하면 URL 토큰을 지우고 새 로그인 메일을 요청할 수 있다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  mock.state.userError = { status: 401, code: "bad_jwt", message: "Synthetic expired callback token detail" };
  await page.goto(`/?view=notes#tab=class&${mock.callbackFragment}`);
  const dialog = await expectAuthDialog(page);
  await expect(dialog.getByRole("alert")).toContainText(/새 로그인 메일|다시|만료/);
  await expect(dialog.getByRole("alert")).not.toContainText("Synthetic expired callback token detail");
  await expect.poll(() => `${new URL(page.url()).search}${new URL(page.url()).hash}`).toBe("?view=notes#tab=class");
  expect(mock.state.requests.filter(request => request.path === "/auth/v1/user")).toHaveLength(1);
  expect(mock.cloudRequests()).toHaveLength(0);
  await expect(page.getByRole("button", { name: "내 계정", exact: true, includeHidden: true })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "이메일 주소", exact: true }).fill(TEST_EMAIL);
  await dialog.getByRole("button", { name: "로그인 링크 받기", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "메일함을 확인해 주세요", exact: true })).toBeVisible();
  expect(mock.state.requests.filter(request => request.path === "/auth/v1/otp")).toHaveLength(1);
  expect(mock.state.unexpected).toEqual([]);
});

test("Google 버튼은 해시 nonce를 전달하고 중복 콜백에서도 원문 nonce로 한 번만 로그인한다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  mock.state.googleCallbackRepeats = 2;
  await page.goto("/");
  const dialog = await openAuth(page);
  const googleHeading = dialog.getByRole("heading", { name: "간편하게 시작하기", exact: true });
  // Optional runner expectation also detects an incorrectly configured build.
  if (process.env.PLAYWRIGHT_EXPECT_GOOGLE_AUTH === "true") await expect(googleHeading).toBeVisible();
  if (process.env.PLAYWRIGHT_EXPECT_GOOGLE_AUTH === "false") await expect(googleHeading).toHaveCount(0);
  if (!await googleHeading.isVisible()) {
    await expect(dialog.getByTestId("google-signin")).toHaveCount(0);
    await expect(dialog).toHaveAccessibleName("이메일로 시작하기");
    expect(mock.state.googleScriptRequests).toBe(0);
    return;
  }
  const google = dialog.getByRole("button", { name: "Google로 계속하기", exact: true });
  await expect(google).toBeVisible();
  const hashedNonce = await google.getAttribute("data-google-nonce");
  expect(hashedNonce).toMatch(/^[a-f0-9]{64}$/);
  expect(await google.getAttribute("data-google-client-id")).toMatch(/\.apps\.googleusercontent\.com$/);
  await expect(dialog.getByRole("textbox", { name: "이메일 주소", exact: true })).toHaveValue("");
  await google.click();
  await expect(page.getByRole("button", { name: "내 계정", exact: true })).toBeVisible();
  const tokens = mock.state.requests.filter(request => request.path === "/auth/v1/token");
  expect(tokens).toHaveLength(1);
  expect(tokens[0].body?.provider).toBe("google");
  expect(tokens[0].body?.id_token).toBe(GOOGLE_TEST_CREDENTIAL);
  const rawNonce = tokens[0].body?.nonce;
  expect(typeof rawNonce).toBe("string");
  expect(rawNonce).not.toBe(hashedNonce);
  expect(createHash("sha256").update(String(rawNonce)).digest("hex")).toBe(hashedNonce);
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  expect(mock.state.requests.filter(request => request.path === "/auth/v1/otp")).toHaveLength(0);
  expect(mock.cloudRequests()).toHaveLength(0);
  expect(mock.state.unexpected).toEqual([]);
});

test("Google 인증 실패 안내 후 버튼을 다시 눌러 정상 로그인할 수 있다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  mock.state.idTokenError = { status: 401, code: "bad_jwt", message: "Synthetic Google credential rejection detail" };
  await page.goto("/");
  const dialog = await openAuth(page);
  test.skip(!await dialog.getByRole("heading", { name: "간편하게 시작하기", exact: true }).isVisible(), "Google 로그인 비활성 환경");
  const google = dialog.getByRole("button", { name: "Google로 계속하기", exact: true });
  await expect(google).toBeVisible();
  const firstNonce = await google.getAttribute("data-google-nonce");
  await google.click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("alert")).not.toContainText("Synthetic Google credential rejection detail");
  await expect(page.getByRole("button", { name: "내 계정", exact: true, includeHidden: true })).toHaveCount(0);
  const firstToken = mock.state.requests.find(request => request.path === "/auth/v1/token");
  expect(createHash("sha256").update(String(firstToken?.body?.nonce)).digest("hex")).toBe(firstNonce);
  mock.state.idTokenError = null;
  await expect.poll(() => google.getAttribute("data-google-nonce")).not.toBe(firstNonce);
  await expect(dialog.getByTestId("google-signin")).toHaveAttribute("data-state", "ready");
  const nextNonce = await google.getAttribute("data-google-nonce");
  expect(nextNonce).toMatch(/^[a-f0-9]{64}$/);
  await google.click();
  await expect(page.getByRole("button", { name: "내 계정", exact: true })).toBeVisible();
  const tokens = mock.state.requests.filter(request => request.path === "/auth/v1/token");
  expect(tokens).toHaveLength(2);
  expect(createHash("sha256").update(String(tokens[1].body?.nonce)).digest("hex")).toBe(nextNonce);
  expect(mock.cloudRequests()).toHaveLength(0);
  expect(mock.state.unexpected).toEqual([]);
});

test("Google SDK가 차단되면 이메일 입력을 유지하고 다시 준비하여 로그인할 수 있다", async ({ page, baseURL }) => {
  const mock = await mockSupabase(page, baseURL!);
  mock.state.googleScriptBlocked = true;
  await page.goto("/");
  const dialog = await openAuth(page);
  test.skip(!await dialog.getByRole("heading", { name: "간편하게 시작하기", exact: true }).isVisible(), "Google 로그인 비활성 환경");
  await expect(dialog.getByRole("alert")).toContainText("Google 로그인 화면을 불러오지 못했습니다.");
  await expect(dialog.getByRole("textbox", { name: "이메일 주소", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "로그인 링크 받기", exact: true })).toBeEnabled();
  expect(mock.state.requests.filter(request => request.path === "/auth/v1/token")).toHaveLength(0);
  mock.state.googleScriptBlocked = false;
  await dialog.getByRole("button", { name: "Google 로그인 다시 준비하기", exact: true }).click();
  const google = dialog.getByRole("button", { name: "Google로 계속하기", exact: true });
  await expect(google).toBeVisible();
  expect(mock.state.googleScriptRequests).toBe(2);
  await google.click();
  await expect(page.getByRole("button", { name: "내 계정", exact: true })).toBeVisible();
  expect(mock.state.requests.filter(request => request.path === "/auth/v1/token")).toHaveLength(1);
  expect(mock.cloudRequests()).toHaveLength(0);
  expect(mock.state.unexpected).toEqual([]);
});
