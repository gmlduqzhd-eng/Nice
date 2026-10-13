"use client";

import { useEffect, useRef, useState } from "react";
import { createGoogleNonce, googleClientId, loadGoogleIdentity } from "@/lib/google-auth";
import styles from "./auth-dialog.module.css";

type Props = {
  disabled: boolean;
  onCredential: (credential: string, nonce: string) => Promise<boolean>;
};

export default function GoogleSignIn({ disabled, onCredential }: Props) {
  const buttonHost = useRef<HTMLDivElement>(null);
  const latest = useRef({ disabled, onCredential });
  const pending = useRef(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  const recoverFocus = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [readyAttempt, setReadyAttempt] = useState(-1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [credentialError, setCredentialError] = useState("");

  useEffect(() => { latest.current = { disabled, onCredential }; }, [disabled, onCredential]);
  useEffect(() => {
    if (state === 'loading' || readyAttempt !== attempt || disabled || submitting || !recoverFocus.current) return;
    const button = retryButton.current;
    button?.focus();
    if (document.activeElement === button) recoverFocus.current = false;
  }, [state, readyAttempt, attempt, disabled, submitting]);

  useEffect(() => {
    let active = true;
    const host = buttonHost.current;
    pending.current = false;
    setState("loading");
    setSubmitting(false);
    setCredentialError("");
    void Promise.all([loadGoogleIdentity(), createGoogleNonce()]).then(([google, nonce]) => {
      if (!active || !host) return;
      google.initialize({
        client_id: googleClientId,
        nonce: nonce.hashed,
        auto_select: false,
        button_auto_select: false,
        use_fedcm_for_button: true,
        ux_mode: "popup",
        callback: response => {
          if (!active || pending.current || latest.current.disabled) return;
          if (!response.credential) {
            setCredentialError("Google 계정을 확인하지 못했습니다. 아래 버튼을 눌러 다시 시도해 주세요.");
            return;
          }
          pending.current = true;
          setSubmitting(true);
          setCredentialError("");
          // The raw nonce is used only for Supabase verification; Google receives its hash.
          void latest.current.onCredential(response.credential, nonce.raw).then(success => {
            if (active && !success) { recoverFocus.current = true; setAttempt(value => value + 1); }
          }).catch(() => {
            if (active) {
              setCredentialError("Google 로그인을 완료하지 못했습니다. 다시 시도하거나 체험을 계속해 주세요.");
              recoverFocus.current = true;
              setAttempt(value => value + 1);
            }
          }).finally(() => {
            if (!active) return;
            pending.current = false;
            setSubmitting(false);
          });
        },
      });
      host.replaceChildren();
      google.renderButton(host, {
        type: "standard",
        theme: "filled_blue",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        locale: "ko",
        width: String(Math.min(400, Math.max(200, Math.floor(host.getBoundingClientRect().width)))),
      });
      setReadyAttempt(attempt);
      setState("ready");
    }).catch(() => {
      if (active) { setReadyAttempt(attempt); setState("error"); }
    });
    return () => {
      active = false;
      host?.replaceChildren();
    };
  }, [attempt]);

  return (
    <div className={styles.googleSignIn} data-testid="google-signin" data-state={state} aria-busy={state === "loading" || submitting}>
      {state === "loading" && <p className={styles.hint} role="status">Google 로그인 준비 중…</p>}
      <div ref={buttonHost} data-testid="google-signin-button" className={styles.googleButton} inert={disabled || submitting || state !== "ready"} />
      {state === "ready" && <p className={styles.hint}>계정 창이 열리지 않거나 닫혔다면 아래에서 로그인 버튼을 다시 준비할 수 있어요.</p>}
      {state === "error" && <p className={styles.notice} role="alert">Google 로그인 화면을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p>}
      <button ref={retryButton} type="button" className={styles.textButton} disabled={disabled || submitting || state === "loading"} onClick={() => setAttempt(value => value + 1)}>Google 로그인 다시 준비하기</button>
      {submitting && <p className={styles.hint} role="status">Google 로그인 확인 중…</p>}
      {credentialError && <p className={styles.notice} role="alert">{credentialError}</p>}
    </div>
  );
}
