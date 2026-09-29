import { test } from "node:test";
import assert from "node:assert/strict";
import { authCallbackError, authErrorMessage, cleanAuthCallbackUrl, hasAuthCallback, secondsUntil, validEmail } from "../src/lib/auth";

test("expired callback is actionable and strips error descriptions and tokens from URL", () => {
  const result = authCallbackError("https://school.example/?view=notes#error=access_denied&error_code=otp_expired&error_description=private-server-detail&access_token=secret&refresh_token=secret2");
  assert.ok(result);
  assert.match(result.message, /새 로그인 메일/);
  assert.equal(result.cleanUrl, "/?view=notes");
  assert.doesNotMatch(result.message, /private-server-detail|secret/);
});

test("OAuth query failures are cleaned while keeping unrelated navigation parameters", () => {
  const result = authCallbackError("https://school.example/?view=notes&error=access_denied&error_description=do-not-display#tab=class");
  assert.ok(result);
  assert.equal(result.cleanUrl, "/?view=notes#tab=class");
  assert.equal(authCallbackError("https://school.example/#access_token=valid&refresh_token=valid2"), null);
  assert.equal(authCallbackError("https://school.example/?view=notes#help"), null);
});

test("failed implicit callback tokens are removable even without URL error fields", () => {
  const href = "https://school.example/?view=notes&access_token=query-secret#access_token=secret&refresh_token=secret2&provider_token=google-secret&provider_refresh_token=google-refresh&expires_in=3600&expires_at=123456&token_type=bearer&type=signup&tab=class";
  assert.equal(hasAuthCallback(href), true);
  assert.equal(authCallbackError(href), null);
  assert.equal(cleanAuthCallbackUrl(href), "/?view=notes#tab=class");
  assert.equal(cleanAuthCallbackUrl("https://school.example/?error=access_denied#help"), "/#help");
  assert.equal(hasAuthCallback("https://school.example/?view=notes#help"), false);
});

test("backend details never appear in user-facing auth failures", () => {
  const error = { code: "unknown_future_code", message: "<script>token-secret@private.example</script>", status: 500 };
  for (const action of ["send", "session", "signout", "oauth"] as const) {
    assert.doesNotMatch(authErrorMessage(error, action), /script|token-secret|private\.example|unknown_future_code/);
  }
  assert.match(authErrorMessage({ status: 429 }), /기다린 뒤/);
  assert.match(authErrorMessage({ code: "email_address_not_authorized" }), /서비스 운영자/);
  assert.match(authErrorMessage(new TypeError("network detail")), /인터넷 연결/);
});

test("resend waits the complete cooldown and email validation rejects unsafe or oversized values", () => {
  assert.equal(secondsUntil(61_000, 1_001), 60);
  assert.equal(secondsUntil(61_000, 60_999), 1);
  assert.equal(secondsUntil(61_000, 61_000), 0);
  assert.equal(secondsUntil(61_000, 99_999), 0);
  assert.equal(validEmail(" teacher@example.com "), true);
  for (const value of ["", "teacher", "teacher @example.com", "t@exam\nple.com", "t@example", `${"a".repeat(250)}@example.com`]) {
    assert.equal(validEmail(value), false);
  }
});
