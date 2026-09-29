"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { authCallbackError, authErrorMessage, cleanAuthCallbackUrl, hasAuthCallback } from "@/lib/auth";
import AuthDialog from "./auth-dialog";
import styles from "./auth-dialog.module.css";

type AuthContextValue = {
  user: User | null;
  checking: boolean;
  authBusy: boolean;
  openAuth: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const SIGN_IN_NOTICE = "로그인이 완료됐습니다. ‘내 계정’에서 기록을 저장할 수 있습니다.";
const SIGN_OUT_NOTICE = "로그아웃했습니다. 로그인 전 체험 공간으로 돌아갑니다. 계정 기록은 다음 로그인 시 다시 열 수 있습니다.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(isSupabaseConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const signOutPending = useRef(false);
  // Resend timestamps live only in memory, including when the dialog is reopened.
  const resendTimes = useRef(new Map<string, number>());

  useEffect(() => {
    if (notice !== SIGN_IN_NOTICE && notice !== SIGN_OUT_NOTICE) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    let authRevision = 0;
    let initialCheckComplete = false;
    let currentUserId: string | null = null;
    const incomingCallback = hasAuthCallback(window.location.href);
    const callbackError = authCallbackError(window.location.href);
    if (callbackError) {
      window.history.replaceState(window.history.state, "", callbackError.cleanUrl);
      setDialogMessage(callbackError.message);
      setDialogOpen(true);
    }
    // Initialize here so a returned login link works on every app screen.
    const client = getSupabase();
    if (!client) {
      setChecking(false);
      return () => { alive = false; mounted.current = false; };
    }
    const applyUser = (nextUser: User | null) => {
      if (!alive) return;
      currentUserId = nextUser?.id ?? null;
      setUser(nextUser);
      setChecking(false);
      if (nextUser) {
        setDialogOpen(false);
        setDialogMessage("");
      }
    };
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      // Keep notifications synchronous; initial network validation runs separately below.
      if (!alive || event === "INITIAL_SESSION") return;
      authRevision += 1;
      // SIGNED_IN also fires when restoring an existing session or refocusing a tab.
      const newSignIn = event === "SIGNED_IN" && session?.user.id !== currentUserId && (initialCheckComplete || incomingCallback);
      applyUser(session?.user ?? null);
      if (newSignIn) setNotice(SIGN_IN_NOTICE);
    });
    const initialRevision = authRevision;
    const reportFailure = (error: unknown) => {
      const message = authErrorMessage(error, "session");
      if (incomingCallback) {
        setDialogMessage(message);
        setDialogOpen(true);
      } else setNotice(message);
    };
    const clearFailedCallback = () => {
      if (incomingCallback) window.history.replaceState(window.history.state, "", cleanAuthCallbackUrl(window.location.href));
    };
    void (async () => {
      try {
        // getUser alone loses a failed implicit callback's initialization error.
        const initialization = await client.auth.initialize();
        if (!alive) return;
        if (initialization.error) clearFailedCallback();
        const { data, error } = await client.auth.getUser();
        if (!alive || authRevision !== initialRevision) return;
        applyUser(error ? null : data.user);
        // A previous valid session can survive a failed link; report that link's failure
        // without revoking that session or treating it as a successful new login.
        if (initialization.error) reportFailure(initialization.error);
        else if (error && error.name !== "AuthSessionMissingError") reportFailure(error);
      } catch (error) {
        if (!alive) return;
        clearFailedCallback();
        if (authRevision !== initialRevision) return;
        applyUser(null);
        reportFailure(error);
      } finally {
        initialCheckComplete = true;
      }
    })();
    return () => {
      alive = false;
      mounted.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const openAuth = useCallback(() => {
    setDialogMessage("");
    setDialogOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setDialogOpen(false);
    setDialogMessage("");
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabase();
    if (!client || signOutPending.current) return;
    signOutPending.current = true;
    setAuthBusy(true);
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      if (mounted.current) setNotice(SIGN_OUT_NOTICE);
    } catch (error) {
      if (mounted.current) setNotice(authErrorMessage(error, "signout"));
    } finally {
      signOutPending.current = false;
      if (mounted.current) setAuthBusy(false);
    }
  }, []);

  const value = useMemo(() => ({ user, checking, authBusy, openAuth, signOut }), [user, checking, authBusy, openAuth, signOut]);
  return (
    <AuthContext.Provider value={value}>
      {children}
      {notice && <div className={styles.toast} role="status"><span>{notice}</span><button type="button" aria-label="계정 알림 닫기" onClick={() => setNotice("")}><X size={17} aria-hidden="true" /></button></div>}
      {dialogOpen && <AuthDialog initialMessage={dialogMessage} onClose={closeAuth} resendTimes={resendTimes.current} />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
