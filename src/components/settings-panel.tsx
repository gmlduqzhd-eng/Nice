"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Cloud, Download, HardDrive, LogOut, Mail, RotateCcw, Upload, UserRound } from "lucide-react";
import { parseWorkspace, type WorkspaceData } from "@/lib/domain";
import { createDemoWorkspace } from "@/lib/demo";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { googleAuthEnabled } from "@/lib/google-auth";
import { useAuth } from "./auth-provider";
import { CloudBackupConflict, saveCloudBackup } from "@/lib/cloud-backup";
import { JSON_BACKUP_SIZE_LABEL, MAX_JSON_BACKUP_BYTES, JsonBackupSizeError, serializeJsonBackup } from "@/lib/json-backup";

type Props = {
  data: WorkspaceData;
  onReplace: (data: WorkspaceData) => void;
  onToast: (message: string) => void;
  isCurrentWorkspace: (snapshot: WorkspaceData) => boolean;
  readOnly: boolean;
  onViewObservations: () => void;
};

function savedTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시간 확인 불가" : date.toLocaleString("ko-KR");
}

function backupSummary(data: WorkspaceData) {
  const { year, grade, room, semester } = data.classroom;
  const semesterDrafts = Object.values(data.semesterPreparation?.entries ?? {}).filter(entry => entry.content.trim()).length;
  return `${year}학년도 ${grade}학년 ${room}반 ${semester}학기 · 학생 ${data.students.length}명 · 관찰 ${data.observations.length}건 · 작성 문장 ${data.drafts.length}건 · 학기말 문장 ${semesterDrafts}건`;
}

function backupContents(data: WorkspaceData) {
  // JSONB may return object keys in a different order from browser records.
  return JSON.stringify(data, (_key, value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  });
}

class LocalBackupChanged extends Error {
  constructor() { super("백업 작업 중 현재 기록이 바뀌었거나 저장이 중지되어 작업을 멈췄습니다. 현재 기록을 확인한 뒤 다시 시도해 주세요."); }
}

export default function SettingsPanel({ data, onReplace, onToast, isCurrentWorkspace, readOnly, onViewObservations }: Props) {
  const { user, checking: authChecking, authBusy, openAuth, signOut } = useAuth();
  const [cloudBusy, setCloudBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");
  const [remoteUpdatedAt, setRemoteUpdatedAt] = useState<string | null>(null);
  const [confirmedCloudWorkspace, setConfirmedCloudWorkspace] = useState<WorkspaceData | null>(null);
  const [restoredWorkspace, setRestoredWorkspace] = useState<WorkspaceData | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const userIdRef = useRef<string | null>(null);
  const accountRevision = useRef(0);
  const mounted = useRef(false);
  const operationPending = useRef(false);
  const ensureUnchanged = () => { if (!isCurrentWorkspace(data)) throw new LocalBackupChanged(); };
  const matchesConfirmedBackup = useMemo(() => confirmedCloudWorkspace !== null &&
    backupContents(confirmedCloudWorkspace) === backupContents(data), [confirmedCloudWorkspace, data]);

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
      setConfirmedCloudWorkspace(null);
      setCloudMessage("");
      setCloudBusy(false);
      setRestoredWorkspace(null);
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
    setConfirmedCloudWorkspace(null);
    setCloudMessage("");
    setCloudBusy(false);
    setRestoredWorkspace(null);
  }, [user?.id]);
  async function syncCloud(direction: "upload" | "download") {
    const client = getSupabase();
    if (!client || !user || operationPending.current || readOnly) return;
    operationPending.current = true;
    const expectedUserId = user.id;
    const revision = accountRevision.current;
    const current = () => mounted.current && revision === accountRevision.current && userIdRef.current === expectedUserId;
    setCloudBusy(true);
    setCloudMessage("");
    setRestoredWorkspace(null);
    try {
      ensureUnchanged();
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
      ensureUnchanged();
      setRemoteUpdatedAt(snapshot?.updated_at ?? null);
      const remoteWorkspace = snapshot ? parseWorkspace(snapshot.data) : null;
      setConfirmedCloudWorkspace(remoteWorkspace);

      if (direction === "download") {
        if (!snapshot) {
          setCloudMessage("이 계정에 저장된 클라우드 백업이 없습니다.");
          return;
        }
        const restored = remoteWorkspace;
        if (!restored) throw new Error("백업 형식 확인 필요");
        if (!window.confirm(`클라우드 백업으로 현재 기록 공간의 모든 연습 기록을 교체할까요?\n\n현재 기록: ${backupSummary(data)}\n불러올 백업: ${backupSummary(restored)}\n저장 시각: ${savedTime(snapshot.updated_at)}\n\n현재 기록이 필요하면 먼저 JSON 백업을 내려받아 주세요.`)) return;
        if (!current()) return;
        ensureUnchanged();
        onReplace(restored);
        setRestoredWorkspace(restored);
        setCloudMessage("클라우드 백업을 이 브라우저로 불러왔습니다.");
        onToast("클라우드 백업을 불러왔습니다.");
      } else {
        const confirmation = snapshot
          ? `이 계정에 ${savedTime(snapshot.updated_at)} 저장한 백업이 있습니다. 현재 기록 공간의 연습 기록으로 덮어쓸까요?`
          : "현재 기록 공간의 연습 기록을 로그인한 계정의 클라우드에 저장할까요? 가상 학생의 연습 데이터만 저장해 주세요.";
        if (!window.confirm(`${confirmation}\n\n저장할 기록: ${backupSummary(data)}`) || !current()) return;
        ensureUnchanged();
        const savedAt = await saveCloudBackup(client, expectedUserId, data, snapshot?.updated_at ?? null);
        if (!current()) return;
        setRemoteUpdatedAt(savedAt);
        setConfirmedCloudWorkspace(data);
        setCloudMessage(isCurrentWorkspace(data)
          ? "현재 연습 기록을 클라우드에 저장했습니다."
          : "저장 요청 당시의 기록을 클라우드에 저장했습니다. 그동안 바뀐 현재 기록은 아직 저장되지 않았으니 다시 저장해 주세요.");
        onToast("클라우드 백업을 저장했습니다.");
      }
    } catch (error) {
      if (!current()) return;
      if (error instanceof CloudBackupConflict) {
        setRemoteUpdatedAt(null);
        setConfirmedCloudWorkspace(null);
      }
      const conflict = error instanceof CloudBackupConflict || error instanceof LocalBackupChanged;
      const message = conflict ? error.message : "클라우드 작업을 완료하지 못했습니다. 로그인 상태, 연결 상태, 데이터베이스 설정과 백업 형식을 확인해 주세요.";
      setCloudMessage(message);
      onToast(conflict ? "현재 기록을 유지했습니다. 백업 안내를 확인해 주세요." : "클라우드 작업에 실패했습니다. 현재 브라우저 기록은 유지됩니다.");
    } finally {
      operationPending.current = false;
      if (current()) setCloudBusy(false);
    }
  }

  function exportBackup() {
    try {
      const blob = new Blob([serializeJsonBackup(data)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `담임업무비서_연습백업_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onToast("JSON 백업 다운로드를 시작했습니다.");
    } catch (error) {
      onToast(error instanceof JsonBackupSizeError ? error.message : "백업 파일을 만들지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || operationPending.current || readOnly) return;
    if (file.size > MAX_JSON_BACKUP_BYTES) {
      onToast(`${JSON_BACKUP_SIZE_LABEL} 이하의 JSON 백업 파일을 선택해 주세요.`);
      return;
    }
    setImportBusy(true);
    operationPending.current = true;
    const revision = accountRevision.current;
    const current = () => mounted.current && revision === accountRevision.current;
    setRestoredWorkspace(null);
    try {
      ensureUnchanged();
      const parsed = parseWorkspace(JSON.parse(await file.text()));
      if (!current()) return;
      ensureUnchanged();
      if (!parsed) {
        onToast("지원하지 않는 백업 형식입니다. 이 앱에서 내보낸 JSON 파일을 선택해 주세요.");
        return;
      }
      if (window.confirm(`학생 ${parsed.students.length}명의 백업으로 현재 기록 공간의 연습 기록을 모두 교체할까요?\n\n현재 기록: ${backupSummary(data)}\n불러올 백업: ${backupSummary(parsed)}\n\n기존 기록은 먼저 백업해 주세요.`)) {
        if (!current()) return;
        ensureUnchanged();
        onReplace(parsed);
        setRestoredWorkspace(parsed);
        onToast("JSON 백업을 불러왔습니다.");
      }
    } catch (error) {
      if (!current()) return;
      onToast(error instanceof LocalBackupChanged ? error.message : "백업 파일을 읽지 못했거나 적용하지 못했습니다. 올바른 JSON 파일과 브라우저 저장 상태를 확인해 주세요.");
    } finally {
      operationPending.current = false;
      if (current()) setImportBusy(false);
    }
  }

  function resetDemo() {
    if (readOnly || operationPending.current) return;
    if (!window.confirm("현재 기록 공간의 모든 연습 기록을 처음 예시 데이터로 되돌릴까요? 필요한 기록은 먼저 JSON 백업으로 보관해 주세요. 클라우드 백업은 바뀌지 않습니다.")) return;
    try {
      onReplace(createDemoWorkspace());
      onToast("현재 기록 공간을 가상 학생의 예시 데이터로 초기화했습니다.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "초기화하지 못했습니다. 저장 상태를 확인해 주세요.");
    }
  }

  return (
    <div className="stack settings-panel">
      <div className="notice notice-block">
        <strong>가상 학생으로 먼저 연습해 주세요.</strong>
        <p>이 버전은 업무 흐름을 검증하는 시제품입니다. 실제 학생 정보의 저장·전송은 학교의 운영 기준을 확인한 뒤 도입합니다.</p>
      </div>

      {restoredWorkspace === data && <section className="card stack" aria-labelledby="restored-title">
        <h2 id="restored-title">불러온 백업</h2>
        <p>{backupSummary(data)}</p>
        <p className="muted">관찰 노트에서 불러온 기록의 내용을 확인하세요.</p>
        <div><button type="button" className="button primary" onClick={onViewObservations}>관찰 노트에서 확인</button></div>
      </section>}

      <section className="card stack" aria-labelledby="cloud-title">
        <div className="section-heading">
          <div><span className="badge"><Cloud size={14} aria-hidden="true" /> 선택 기능</span><h2 id="cloud-title">내 계정 · 백업</h2></div>
          <span className="badge">{!isSupabaseConfigured ? "연결 준비 중" : authChecking ? "로그인 확인 중" : user ? "로그인됨" : "로그인 필요"}</span>
        </div>
        <p className="muted">이 PC의 자동 저장과 계정 백업은 별개입니다. ‘클라우드에 저장’을 눌러야 현재 기록을 계정에 보관합니다. 로그인만으로 자료를 보내거나 다른 PC의 기록을 자동으로 불러오지 않습니다.</p>
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
              <button type="button" className="button primary" onClick={() => void syncCloud("upload")} disabled={cloudBusy || importBusy || authBusy || readOnly}><Upload size={16} aria-hidden="true" /> {cloudBusy ? "처리 중…" : "클라우드에 저장"}</button>
              <button type="button" className="button secondary" onClick={() => void syncCloud("download")} disabled={cloudBusy || importBusy || authBusy || readOnly}><Download size={16} aria-hidden="true" /> 클라우드에서 불러오기</button>
            </div>
            <div className="notice notice-block" role="status" aria-label="계정 백업 상태">
              <strong>{remoteUpdatedAt ? `마지막으로 확인한 계정 백업 시각: ${savedTime(remoteUpdatedAt)}` : "계정 백업 시각은 저장 또는 불러오기를 눌러 확인하세요."}</strong>
              {remoteUpdatedAt && <p>{confirmedCloudWorkspace
                ? matchesConfirmedBackup ? "확인한 계정 백업은 현재 기록과 일치합니다." : "현재 기록과 확인한 계정 백업이 다릅니다. 이 PC의 기록을 이어 쓰려면 계정에 다시 저장하세요."
                : "확인한 백업의 내용을 비교하지 못했습니다. 안내를 확인하고 다시 시도하세요."}</p>}
              <p>다른 PC에서 바꾼 내용은 여기서 자동으로 확인하지 않습니다.</p>
            </div>
            <p className="muted">계정을 바꾸면 해당 계정의 별도 기록 공간을 엽니다. 로그아웃하면 로그인 전 체험 공간으로 돌아갑니다.</p>
          </div>
        ) : (
          <div className="stack">
            <p className="muted">{googleAuthEnabled ? "Google 계정으로 간편하게 시작하세요. 처음이라면 회원가입도 함께 진행됩니다." : "이메일을 입력하고 메일의 링크를 누르면 끝. 처음이라면 회원가입도 함께 진행됩니다."}</p>
            <div><button className="button primary" type="button" onClick={openAuth}>{googleAuthEnabled ? <UserRound size={16} aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}{googleAuthEnabled ? "간편하게 시작하기" : "이메일로 시작하기"}</button></div>
          </div>
        )}
        {cloudMessage && <p className="notice" role="status">{cloudMessage}</p>}
        <div className="notice notice-block">
          <strong>다른 PC에서 이어하기</strong>
          <ol>
            <li>지금 PC에서 로그인한 뒤 ‘클라우드에 저장’을 누르고 저장 완료 안내를 확인하세요.</li>
            <li>다른 PC에서 같은 계정으로 로그인하고 ‘설정 및 백업’을 여세요.</li>
            <li>‘클라우드에서 불러오기’를 눌러 학급과 기록 수를 확인한 뒤 가져오세요.</li>
          </ol>
          <p>가져오면 그 PC의 현재 기록을 교체합니다. 남겨 둘 기록은 먼저 전체 기록 백업 파일로 내려받으세요. 이어 쓴 뒤에도 계정 백업을 직접 저장해야 합니다.</p>
        </div>
      </section>

      <section className="card stack" aria-labelledby="local-backup-title">
        <div className="section-heading">
          <div><span className="badge"><HardDrive size={14} aria-hidden="true" /> 이 PC의 브라우저</span><h2 id="local-backup-title">전체 기록 백업 파일</h2></div>
        </div>
        <p className="muted">편집한 기록은 이 PC의 현재 브라우저에 자동 저장됩니다. 관찰 기록·작성 문장·학기말 문장을 한 파일로 보관하거나 다른 브라우저로 옮길 때 아래 버튼을 이용하세요. 브라우저 데이터를 삭제하면 이 PC의 기록이 사라질 수 있습니다.</p>
        <p className="muted">로그인 전 체험 기록은 계정으로 자동 이전되지 않습니다. 옮기려면 로그인 전에 전체 기록 백업 파일을 내려받고, 로그인 후 그 파일을 불러오세요.</p>
        <div className="row">
          <button type="button" className="button secondary" onClick={exportBackup}><Download size={16} aria-hidden="true" /> 전체 기록 백업 파일 내려받기</button>
          <button type="button" className="button secondary" onClick={() => fileInput.current?.click()} disabled={importBusy || cloudBusy || readOnly}><Upload size={16} aria-hidden="true" /> {importBusy ? "백업 읽는 중…" : "전체 기록 백업 파일 불러오기"}</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="JSON 백업 파일 선택" onChange={importBackup} disabled={importBusy || cloudBusy || readOnly} />
        </div>
        <p className="muted">지원 형식: 이 앱에서 내보낸 JSON · 최대 {JSON_BACKUP_SIZE_LABEL} · 불러오기 전 교체 여부를 확인합니다.</p>
      </section>

      <section className="card stack" aria-labelledby="reset-title">
        <h2 id="reset-title">예시 데이터로 다시 시작</h2>
        <p className="muted">가상 학생과 관찰 기록이 있는 처음 상태로 되돌립니다. 현재 브라우저의 변경 내용은 교체됩니다.</p>
        <div><button type="button" className="button secondary" onClick={resetDemo} disabled={cloudBusy || importBusy || readOnly}><RotateCcw size={16} aria-hidden="true" /> 예시 데이터 초기화</button></div>
      </section>
    </div>
  );
}
