"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Cloud, Download, HardDrive, LogOut, Mail, RotateCcw, Upload, UserRound } from "lucide-react";
import { parseWorkspace, type WorkspaceData } from "@/lib/domain";
import { createDemoWorkspace } from "@/lib/demo";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "./auth-provider";

const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

type Props = {
  data: WorkspaceData;
  onReplace: (data: WorkspaceData) => void;
  onToast: (message: string) => void;
};

function savedTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시간 확인 불가" : date.toLocaleString("ko-KR");
}

export default function SettingsPanel({ data, onReplace, onToast }: Props) {
  const { user, checking: authChecking, authBusy, openAuth, signOut } = useAuth();
  const [cloudBusy, setCloudBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");
  const [remoteUpdatedAt, setRemoteUpdatedAt] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const userIdRef = useRef<string | null>(null);
  const accountRevision = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const client = getSupabase();
    const { data: listener } = client?.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id ?? null;
      if (userIdRef.current === nextId) return;
      // Invalidate pending cloud responses immediately, before React renders a new account.
      accountRevision.current += 1;
      userIdRef.current = nextId;
      setRemoteUpdatedAt(null);
      setCloudMessage("");
      setCloudBusy(false);
    }) ?? { data: null };
    return () => {
      mounted.current = false;
      accountRevision.current += 1;
      listener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const nextId = user?.id ?? null;
    if (userIdRef.current === nextId) return;
    accountRevision.current += 1;
    userIdRef.current = nextId;
    setRemoteUpdatedAt(null);
    setCloudMessage("");
    setCloudBusy(false);
  }, [user?.id]);
  async function syncCloud(direction: "upload" | "download") {
    const client = getSupabase();
    if (!client || !user || cloudBusy) return;
    const expectedUserId = user.id;
    const revision = accountRevision.current;
    const current = () => mounted.current && revision === accountRevision.current && userIdRef.current === expectedUserId;
    setCloudBusy(true);
    setCloudMessage("");
    try {
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || identity.user?.id !== expectedUserId) throw new Error("인증 확인 필요");
      if (!current()) return;
      const { data: snapshot, error: readError } = await client
        .from("teacher_workspaces")
        .select("data, updated_at")
        .eq("user_id", expectedUserId)
        .maybeSingle();
      if (readError) throw readError;
      if (!current()) return;
      setRemoteUpdatedAt(snapshot?.updated_at ?? null);

      if (direction === "download") {
        if (!snapshot) {
          setCloudMessage("이 계정에 저장된 클라우드 백업이 없습니다.");
          return;
        }
        const restored = parseWorkspace(snapshot.data);
        if (!restored) throw new Error("백업 형식 확인 필요");
        if (!window.confirm("클라우드 백업으로 이 브라우저의 모든 연습 기록을 교체할까요? 현재 기록이 필요하면 먼저 JSON 백업을 내려받아 주세요.")) return;
        if (!current()) return;
        onReplace(restored);
        setCloudMessage("클라우드 백업을 이 브라우저로 불러왔습니다.");
        onToast("클라우드 백업을 불러왔습니다.");
      } else {
        const confirmation = snapshot
          ? `이 계정에 ${savedTime(snapshot.updated_at)} 저장한 백업이 있습니다. 현재 브라우저의 연습 기록으로 덮어쓸까요?`
          : "현재 브라우저의 연습 기록을 로그인한 계정의 클라우드에 저장할까요? 가상 학생의 연습 데이터만 저장해 주세요.";
        if (!window.confirm(confirmation) || !current()) return;
        const updatedAt = new Date().toISOString();
        const { data: saved, error: saveError } = await client.from("teacher_workspaces")
          .upsert({ user_id: expectedUserId, data, updated_at: updatedAt }, { onConflict: "user_id" })
          .select("updated_at")
          .single();
        if (saveError || !saved) throw saveError ?? new Error("저장 확인 실패");
        if (!current()) return;
        setRemoteUpdatedAt(saved.updated_at);
        setCloudMessage("현재 연습 기록을 클라우드에 저장했습니다.");
        onToast("클라우드 백업을 저장했습니다.");
      }
    } catch {
      if (!current()) return;
      const message = "클라우드 작업을 완료하지 못했습니다. 로그인 상태, 연결 상태, 데이터베이스 설정과 백업 형식을 확인해 주세요.";
      setCloudMessage(message);
      onToast("클라우드 작업에 실패했습니다. 현재 브라우저 기록은 유지됩니다.");
    } finally {
      if (current()) setCloudBusy(false);
    }
  }

  function exportBackup() {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `담임업무비서_연습백업_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onToast("JSON 백업 다운로드를 시작했습니다.");
    } catch {
      onToast("백업 파일을 만들지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      onToast("1MB 이하의 JSON 백업 파일을 선택해 주세요.");
      return;
    }
    setImportBusy(true);
    try {
      const parsed = parseWorkspace(JSON.parse(await file.text()));
      if (!mounted.current) return;
      if (!parsed) {
        onToast("지원하지 않는 백업 형식입니다. 이 앱에서 내보낸 JSON 파일을 선택해 주세요.");
        return;
      }
      if (window.confirm(`학생 ${parsed.students.length}명의 백업으로 현재 브라우저의 연습 기록을 모두 교체할까요? 기존 기록은 먼저 백업해 주세요.`)) {
        onReplace(parsed);
        onToast("JSON 백업을 불러왔습니다.");
      }
    } catch {
      onToast("백업 파일을 읽지 못했습니다. 올바른 JSON 파일인지 확인해 주세요.");
    } finally {
      if (mounted.current) setImportBusy(false);
    }
  }

  function resetDemo() {
    if (!window.confirm("이 브라우저의 모든 연습 기록을 처음 예시 데이터로 되돌릴까요? 필요한 기록은 먼저 JSON 백업으로 보관해 주세요. 클라우드 백업은 바뀌지 않습니다.")) return;
    onReplace(createDemoWorkspace());
    onToast("가상 학생의 예시 데이터로 초기화했습니다.");
  }

  return (
    <div className="stack settings-panel">
      <div className="notice notice-block">
        <strong>가상 학생으로 먼저 연습해 주세요.</strong>
        <p>이 버전은 업무 흐름을 검증하는 시제품입니다. 실제 학생 정보의 저장·전송은 학교의 운영 기준을 확인한 뒤 도입합니다.</p>
      </div>

      <section className="card stack" aria-labelledby="cloud-title">
        <div className="section-heading">
          <div><span className="badge"><Cloud size={14} aria-hidden="true" /> 선택 기능</span><h2 id="cloud-title">내 계정 · 백업</h2></div>
          <span className="badge">{!isSupabaseConfigured ? "연결 준비 중" : authChecking ? "로그인 확인 중" : user ? "로그인됨" : "로그인 필요"}</span>
        </div>
        <p className="muted">로그인한 계정에 연습 기록을 직접 저장하고 불러옵니다. 버튼을 눌렀을 때만 자료를 전송하며 자동 동기화하지 않습니다.</p>
        {!isSupabaseConfigured ? (
          <div className="notice notice-block">
            <strong>Supabase가 아직 연결되지 않았습니다.</strong>
            <p>현재는 브라우저 저장과 JSON 백업을 사용할 수 있습니다. 서비스 연결을 마치면 이메일 로그인과 클라우드 백업이 활성화됩니다.</p>
            <button type="button" className="button secondary" disabled><Cloud size={16} aria-hidden="true" /> 클라우드 연결 대기</button>
          </div>
        ) : authChecking ? (
          <p role="status" className="muted">로그인 상태를 확인하고 있습니다…</p>
        ) : user ? (
          <div className="stack">
            <div className="row"><strong>{user.email ?? "로그인 계정"}</strong><button type="button" className="button secondary" onClick={signOut} disabled={authBusy || cloudBusy}><LogOut size={15} aria-hidden="true" /> {authBusy ? "처리 중…" : "로그아웃"}</button></div>
            <div className="row">
              <button type="button" className="button primary" onClick={() => void syncCloud("upload")} disabled={cloudBusy || importBusy || authBusy}><Upload size={16} aria-hidden="true" /> {cloudBusy ? "처리 중…" : "클라우드에 저장"}</button>
              <button type="button" className="button secondary" onClick={() => void syncCloud("download")} disabled={cloudBusy || importBusy || authBusy}><Download size={16} aria-hidden="true" /> 클라우드에서 불러오기</button>
            </div>
            <p className="muted">{remoteUpdatedAt ? `확인한 클라우드 저장 시각: ${savedTime(remoteUpdatedAt)}` : "클라우드 백업은 아직 조회하지 않았습니다."}</p>
            <p className="muted">이 브라우저의 연습 기록은 계정을 바꾸거나 로그아웃해도 남아 있습니다.</p>
          </div>
        ) : (
          <div className="stack">
            <p className="muted">{googleAuthEnabled ? "Google 계정으로 간편하게 시작하세요. 처음이라면 회원가입도 함께 진행됩니다." : "이메일을 입력하고 메일의 링크를 누르면 끝. 처음이라면 회원가입도 함께 진행됩니다."}</p>
            <div><button className="button primary" type="button" onClick={openAuth}>{googleAuthEnabled ? <UserRound size={16} aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}{googleAuthEnabled ? "간편하게 시작하기" : "이메일로 시작하기"}</button></div>
          </div>
        )}
        {cloudMessage && <p className="notice" role="status">{cloudMessage}</p>}
      </section>

      <section className="card stack" aria-labelledby="local-backup-title">
        <div className="section-heading">
          <div><span className="badge"><HardDrive size={14} aria-hidden="true" /> 이 브라우저</span><h2 id="local-backup-title">연습 기록 백업</h2></div>
        </div>
        <p className="muted">현재 기록은 이 기기의 브라우저에 저장됩니다. 브라우저 데이터를 삭제하면 사라질 수 있으니, 필요한 기록을 파일로 보관해 주세요.</p>
        <div className="row">
          <button type="button" className="button secondary" onClick={exportBackup}><Download size={16} aria-hidden="true" /> JSON 백업 내려받기</button>
          <button type="button" className="button secondary" onClick={() => fileInput.current?.click()} disabled={importBusy || cloudBusy}><Upload size={16} aria-hidden="true" /> {importBusy ? "백업 읽는 중…" : "JSON 백업 불러오기"}</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="JSON 백업 파일 선택" onChange={importBackup} />
        </div>
        <p className="muted">지원 형식: 이 앱에서 내보낸 JSON · 최대 1MB · 불러오기 전 교체 여부를 확인합니다.</p>
      </section>

      <section className="card stack" aria-labelledby="reset-title">
        <h2 id="reset-title">예시 데이터로 다시 시작</h2>
        <p className="muted">가상 학생과 관찰 기록이 있는 처음 상태로 되돌립니다. 현재 브라우저의 변경 내용은 교체됩니다.</p>
        <div><button type="button" className="button secondary" onClick={resetDemo} disabled={cloudBusy || importBusy}><RotateCcw size={16} aria-hidden="true" /> 예시 데이터 초기화</button></div>
      </section>
    </div>
  );
}
