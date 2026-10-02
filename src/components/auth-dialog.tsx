"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Mail, UserRound, X } from "lucide-react";
import { AUTH_RESEND_SECONDS, authErrorMessage, secondsUntil, validEmail } from "@/lib/auth";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { googleAuthEnabled } from "@/lib/google-auth";
import GoogleSignIn from "./google-sign-in";
import styles from "./auth-dialog.module.css";

type Props = {
  initialMessage: string;
  onClose: () => void;
  resendTimes: Map<string, number>;
};

export default function AuthDialog({ initialMessage, onClose, resendTimes }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const editingEmail = useRef(false);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestRevision = useRef(0);
  const pending = useRef(false);
  const alive = useRef(false);
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [now, setNow] = useState(() => Date.now());
  const cooldownEmail = (sentEmail || email.trim()).toLowerCase();
  const secondsLeft = secondsUntil(resendTimes.get(cooldownEmail) ?? 0, now);

  useEffect(() => {
    alive.current = true;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    (googleAuthEnabled ? headingRef.current : emailRef.current)?.focus();
    return () => {
      alive.current = false;
      requestRevision.current += 1;
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!secondsLeft) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (sentEmail) sentHeadingRef.current?.focus();
    else (googleAuthEnabled && !editingEmail.current ? headingRef.current : emailRef.current)?.focus();
  }, [sentEmail]);

  function changeEmail() {
    editingEmail.current = true;
    requestRevision.current += 1;
    pending.current = false;
    setBusy(false);
    setSentEmail("");
    setMessage("");
    setNow(Date.now());
  }

  async function signInWithGoogle(credential: string, nonce: string) {
    const client = getSupabase();
    if (!client || pending.current || !googleAuthEnabled) return false;
    const revision = ++requestRevision.current;
    const current = () => alive.current && requestRevision.current === revision;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await client.auth.signInWithIdToken({
        provider: "google",
        token: credential,
        nonce,
      });
      if (error || !data.session) throw error ?? new Error("Google sign-in unavailable");
      return true;
    } catch (error) {
      if (current()) setMessage(authErrorMessage(error, "oauth"));
      return false;
    } finally {
      if (current()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  async function requestLink(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const client = getSupabase();
    const address = sentEmail || email.trim();
    const key = address.toLowerCase();
    if (!client || pending.current) return;
    if (!validEmail(address)) {
      setMessage("이메일 주소를 정확히 입력해 주세요.");
      emailRef.current?.focus();
      return;
    }
    if (secondsUntil(resendTimes.get(key) ?? 0) > 0) {
      setNow(Date.now());
      return;
    }
    const revision = ++requestRevision.current;
    const current = () => alive.current && requestRevision.current === revision;
    pending.current = true;
    setBusy(true);
    setMessage("");
    // Keep the cooldown even if the user closes the dialog while a request is pending.
    resendTimes.set(key, Date.now() + AUTH_RESEND_SECONDS * 1000);
    setNow(Date.now());
    try {
      const { error } = await client.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (!current()) return;
      setSentEmail(address);
      setMessage("");
    } catch (error) {
      if (!current()) return;
      setMessage(authErrorMessage(error));
    } finally {
      if (current()) {
        pending.current = false;
        setBusy(false);
        setNow(Date.now());
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="auth-dialog-title"
      aria-describedby="auth-dialog-description"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className={styles.content}>
        <button type="button" className={styles.close} aria-label="로그인 창 닫기" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        <div className={styles.icon}>{googleAuthEnabled ? <UserRound size={25} aria-hidden="true" /> : <Mail size={25} aria-hidden="true" />}</div>
        <p className={styles.eyebrow}>담임노트 계정</p>
        <h2 id="auth-dialog-title" ref={headingRef} tabIndex={-1}>{googleAuthEnabled ? "간편하게 시작하기" : "이메일로 시작하기"}</h2>
        <p id="auth-dialog-description" className={styles.description}>{googleAuthEnabled ? <>Google 계정을 선택하면 시작할 수 있어요.<br />처음이라면 가입도 함께 진행해요.</> : <>비밀번호 없이, 이메일 하나로.<br />처음이라면 가입까지 한 번에 진행해요.</>}</p>
        <div className={styles.availability}>
          <strong>체험 기록을 계정으로 옮기려면</strong>
          <p>로그인 전 기록은 이 PC의 체험 공간에 남고 계정으로 자동 이전되지 않습니다. ‘설정 및 백업’에서 전체 기록 백업 파일을 내려받은 뒤 로그인하고, 그 파일을 불러오세요.</p>
          <p>다른 PC에서 이어하려면 로그인 후 ‘클라우드에 저장’을 누르세요. 다른 PC에서는 같은 계정으로 로그인하고 ‘클라우드에서 불러오기’를 직접 눌러야 합니다.</p>
        </div>
        {isSupabaseConfigured && <p className={styles.availability}>{googleAuthEnabled ? "이메일 로그인은 테스트 계정만 이용할 수 있어요." : "현재 이메일 로그인은 테스트 계정만 이용할 수 있어요. 로그인 없이 기록 기능을 먼저 체험해 보세요."}</p>}

        {!isSupabaseConfigured ? (
          <p className={styles.notice} role="status">{googleAuthEnabled ? "로그인 연결을 준비하고 있습니다." : "이메일 로그인 연결을 준비하고 있습니다."} 지금은 로그인 없이 모든 연습 기능을 이용해 주세요.</p>
        ) : sentEmail ? (
          <div className={styles.sent}>
            <div className={styles.successIcon}><Check size={20} aria-hidden="true" /></div>
            <h3 ref={sentHeadingRef} tabIndex={-1}>메일함을 확인해 주세요</h3>
            <p className={styles.address}>{sentEmail}</p>
            <p>메일의 로그인 링크를 누르면 가입과 로그인이 한 번에 완료됩니다.</p>
            <p className={styles.hint}>메일이 없다면 스팸함도 확인해 주세요. 로그인 링크는 한 번만 사용할 수 있습니다.</p>
            <button type="button" className={`button secondary ${styles.fullWidth}`} onClick={() => void requestLink()} disabled={busy || secondsLeft > 0}>
              {busy ? "보내는 중…" : secondsLeft > 0 ? `${secondsLeft}초 후 다시 받기` : "로그인 링크 다시 받기"}
            </button>
            <button type="button" className={styles.textButton} onClick={changeEmail}><ArrowLeft size={15} aria-hidden="true" /> 다른 이메일 사용</button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={requestLink}>
            {googleAuthEnabled && <><GoogleSignIn disabled={busy} onCredential={signInWithGoogle} /><span className={styles.divider}>테스트 계정용 이메일</span></>}
            <label className="field" htmlFor="auth-email">이메일 주소
              <input ref={emailRef} id="auth-email" className="input" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="teacher@example.com" required maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setMessage(""); setNow(Date.now()); }} disabled={busy} />
            </label>
            <button className={`button ${googleAuthEnabled ? "secondary" : "primary"} ${styles.fullWidth}`} type="submit" disabled={busy || secondsLeft > 0}>
              {busy ? "보내는 중…" : secondsLeft > 0 ? `${secondsLeft}초 후 다시 받기` : "로그인 링크 받기"}<ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className={styles.hint}>메일을 열어 링크 한 번만 누르면 됩니다. 학생 정보는 가입할 때 입력하지 않아요.</p>
          </form>
        )}
        {message && <p className={styles.notice} role="alert">{message}</p>}
        <div className={styles.footer}>
          <p>로그인은 계정에 기록을 백업할 때 필요해요.</p>
          <nav className="service-links" aria-label="가입 전 확인"><a href="/privacy" target="_blank" rel="noopener noreferrer">개인정보처리방침</a><a href="/terms" target="_blank" rel="noopener noreferrer">이용약관</a></nav>
          <button type="button" className={styles.textButton} onClick={onClose}>체험 계속하기 <ArrowRight size={14} aria-hidden="true" /></button>
        </div>
      </div>
    </dialog>
  );
}
