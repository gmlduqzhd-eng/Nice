type AuthErrorLike = { code?: unknown; status?: unknown; name?: unknown };

export const AUTH_RESEND_SECONDS = 60;

export function validEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Keep backend messages and URL-provided descriptions out of the interface.
export function authErrorMessage(error: unknown, action: "send" | "oauth" | "session" | "signout" = "send"): string {
  const detail = error && typeof error === "object" ? error as AuthErrorLike : {};
  if (action === "oauth") {
    if (detail.status === 429 || detail.code === "over_request_rate_limit") return "로그인 요청이 잠시 많아졌습니다. 잠시 기다린 뒤 Google 버튼으로 다시 시도해 주세요.";
    if (detail.name === "AuthRetryableFetchError" || detail.name === "TypeError") return "인터넷 연결을 확인한 뒤 Google 버튼으로 다시 시도해 주세요. 로그인 없이 체험을 계속할 수도 있습니다.";
    if (["bad_jwt", "otp_expired", "session_not_found"].includes(String(detail.code))) return "Google 계정 확인 시간이 지나 로그인을 완료하지 못했습니다. Google 버튼으로 다시 시도해 주세요.";
    return "Google 로그인을 완료하지 못했습니다. 다시 시도하거나 로그인 없이 체험을 계속해 주세요.";
  }
  if (detail.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(String(detail.code))) {
    return "메일 요청이 잠시 많아졌습니다. 잠시 기다린 뒤 다시 시도해 주세요.";
  }
  if (["email_address_invalid", "validation_failed"].includes(String(detail.code))) {
    return "이메일 주소를 다시 확인해 주세요. 공백 없이 정확한 주소를 입력하면 됩니다.";
  }
  if (["email_address_not_authorized", "email_provider_disabled", "signup_disabled"].includes(String(detail.code))) {
    return "현재 이 이메일로 가입하거나 로그인할 수 없습니다. 서비스 운영자에게 이메일 로그인 설정을 문의해 주세요. 로그인 없이도 연습할 수 있습니다.";
  }
  if (["otp_expired", "otp_disabled", "access_denied", "bad_jwt", "session_not_found", "refresh_token_not_found"].includes(String(detail.code))) {
    return "로그인 요청이 만료되었거나 이미 사용되었습니다. 이메일 주소를 입력해 새 로그인 메일을 받아 주세요.";
  }
  if (detail.name === "AuthRetryableFetchError" || detail.name === "TypeError") {
    return "인터넷 연결을 확인한 뒤 다시 시도해 주세요. 현재 브라우저의 기록은 그대로 있습니다.";
  }
  if (action === "signout") return "로그아웃하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";
  if (action === "session") return "로그인 상태를 확인하지 못했습니다. 잠시 후 다시 로그인해 주세요.";
  return "로그인 메일을 보내지 못했습니다. 주소와 인터넷 연결을 확인해 주세요. 계속되지 않으면 서비스 운영자에게 문의해 주세요.";
}

export function hasAuthCallback(href: string): boolean {
  const url = new URL(href);
  const parts = [url.searchParams, new URLSearchParams(url.hash.slice(1))];
  return parts.some(part => ["error", "error_code", "error_description", "access_token", "refresh_token", "provider_token", "provider_refresh_token"].some(key => part.has(key)));
}

export function cleanAuthCallbackUrl(href: string): string {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const originalHash = hash.toString();
  const params = [url.searchParams, hash];
  for (const part of params) {
    for (const key of ["error", "error_code", "error_description", "access_token", "refresh_token", "provider_token", "provider_refresh_token", "expires_in", "expires_at", "token_type", "type"]) part.delete(key);
  }
  if (hash.toString() !== originalHash) url.hash = hash.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

export function authCallbackError(href: string): { message: string; cleanUrl: string } | null {
  const url = new URL(href);
  const params = [url.searchParams, new URLSearchParams(url.hash.slice(1))];
  if (!params.some(part => part.has("error") || part.has("error_code") || part.has("error_description"))) return null;
  const code = params.map(part => part.get("error_code") ?? part.get("error")).find(Boolean);
  return { message: authErrorMessage({ code }, "session"), cleanUrl: cleanAuthCallbackUrl(href) };
}

export function secondsUntil(readyAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((readyAt - now) / 1000));
}
