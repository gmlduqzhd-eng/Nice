import { expect, type Page } from '@playwright/test';
import type { WorkspaceData } from '../../src/lib/domain';
export const TEST_EMAIL = 'teacher-browser-test@example.invalid';
export const TEST_USER_ID = '10000000-0000-4000-8000-000000000001';
export const GOOGLE_TEST_CREDENTIAL = 'synthetic-google-id-token-not-a-credential';

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

export async function mockSupabase(page: Page, baseURL: string, identity = TEST_USER_ID, issuedAt = Math.floor(Date.now() / 1000)) {
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
