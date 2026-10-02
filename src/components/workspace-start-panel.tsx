"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { WorkspaceData } from "@/lib/domain";
import { JSON_BACKUP_SIZE_LABEL, JsonBackupSizeError, serializeJsonBackup } from "@/lib/json-backup";
import { createWorkspaceStart, hasWorkspaceRecords, type WorkspaceStartMode } from "@/lib/workspace-start";

type Props = {
  data: WorkspaceData;
  onReplace: (snapshot: WorkspaceData, replacement: WorkspaceData) => void;
};
type PendingStart = {
  mode: WorkspaceStartMode;
  snapshot: WorkspaceData;
  replacement: WorkspaceData;
  backupDownloaded: boolean;
  backupConfirmed: boolean;
};

function classroomLabel(data: Pick<WorkspaceData, "classroom">) {
  const { year, grade, room, semester } = data.classroom;
  return `${year}학년도 ${grade}학년 ${room}반 ${semester}학기`;
}

function semesterSentenceCount(data: WorkspaceData) {
  return Object.values(data.semesterPreparation?.entries ?? {}).filter(entry => entry.content.trim()).length;
}

export default function WorkspaceStartPanel({ data, onReplace }: Props) {
  const [pending, setPending] = useState<PendingStart | null>(null);
  const [error, setError] = useState("");
  const changed = pending !== null && pending.snapshot !== data;
  const needsBackup = pending !== null && hasWorkspaceRecords(pending.snapshot);
  const canReplace = pending !== null && !changed && (!needsBackup || (pending.backupDownloaded && pending.backupConfirmed));

  function choose(mode: WorkspaceStartMode) {
    setPending({ mode, snapshot: data, replacement: createWorkspaceStart(data, mode), backupDownloaded: false, backupConfirmed: false });
    setError("");
  }
  function downloadBackup() {
    if (!pending || changed) return;
    try {
      const url = URL.createObjectURL(new Blob([serializeJsonBackup(pending.snapshot)], { type: "application/json;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `담임노트_학급변경전_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      try { document.body.appendChild(anchor); anchor.click(); }
      finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      setPending(current => current === pending ? { ...current, backupDownloaded: true, backupConfirmed: false } : current);
      setError("");
    } catch (err) {
      setError(err instanceof JsonBackupSizeError ? err.message : "보관 파일을 만들지 못했습니다. 현재 기록은 유지됩니다.");
    }
  }
  function replace() {
    if (!pending || !canReplace) return;
    try { onReplace(pending.snapshot, pending.replacement); setPending(null); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "학급을 바꾸지 못했습니다. 현재 기록을 확인해 주세요."); }
  }

  return <section className="card classroom-card stack" aria-labelledby="workspace-start-heading">
    <h2 id="workspace-start-heading">가상 학급 시작 방법</h2>
    <p className="muted">예시 기록을 살펴보거나 빈 명부에 가상 학생을 추가해 연습하세요. 선택만으로 현재 기록이 바뀌지는 않습니다.</p>
    <div className="row">
      <button type="button" className="button primary" onClick={() => choose("empty")}>빈 가상 학급으로 시작하기</button>
      <button type="button" className="button secondary" onClick={() => choose("example")}>예시로 연습하기</button>
    </div>
    {pending && <div className="notice notice-block stack" aria-labelledby="workspace-replace-heading">
      <h3 id="workspace-replace-heading">{pending.mode === "empty" ? "빈 가상 학급으로 바꾸기" : "예시 학급으로 바꾸기"}</h3>
      <p>현재 기록 공간의 학생·관찰·행동특성 문장·학기말 작성 자료를 아래 내용으로 교체합니다. 클라우드에 보관한 자료는 자동으로 바뀌지 않습니다.</p>
      <div className="table-scroll"><table className="roster-table" aria-label="학급 교체 전후 확인">
        <thead><tr><th>구분</th><th>학급</th><th>학생</th><th>관찰</th><th>행동특성 문장</th><th>학기말 문장</th></tr></thead>
        <tbody>{[{ label: "현재 기록", workspace: pending.snapshot }, { label: "교체할 기록", workspace: pending.replacement }].map(({ label, workspace }) =>
          <tr key={label}><th scope="row">{label}</th><td>{classroomLabel(workspace)}</td><td>{workspace.students.length}명</td><td>{workspace.observations.length}건</td><td>{workspace.drafts.length}건</td><td>{semesterSentenceCount(workspace)}건</td></tr>
        )}</tbody>
      </table></div>
      {pending.snapshot.semesterPreparation && <p className="muted">현재 학기말 작업: {classroomLabel(pending.snapshot.semesterPreparation)} · {pending.snapshot.semesterPreparation.subject || "교과 미입력"} · 문장 {semesterSentenceCount(pending.snapshot)}건. 학급 교체 시 이 작성 자료도 비워집니다.</p>}
      {needsBackup ? <>
        <p><strong>1. 현재 기록을 파일로 보관하세요.</strong> 다운로드한 파일이 저장되어 있는지 확인한 뒤 다음 단계로 진행합니다.</p>
        <div><button type="button" className="button secondary" onClick={downloadBackup} disabled={changed}><Download size={16}/>교체 전 보관 파일 내려받기</button></div>
        <p className="muted">이 앱에서 다시 불러올 수 있는 JSON 백업입니다. 최대 {JSON_BACKUP_SIZE_LABEL}를 확인하며 파일을 만들지 못하면 교체하지 않습니다.</p>
        <label className="row"><input type="checkbox" checked={pending.backupConfirmed} disabled={!pending.backupDownloaded || changed} onChange={event => setPending(current => current ? { ...current, backupConfirmed: event.target.checked } : current)}/>현재 기록의 보관 파일이 저장된 것을 확인했습니다.</label>
        <p><strong>2. 아래 학급으로 교체하세요.</strong> 보관하지 않은 기존 기록은 이 브라우저에서 사라집니다.</p>
      </> : <p>현재 학생·관찰·작성 자료가 없습니다. 아래 버튼을 눌러 선택한 학급으로 시작하세요.</p>}
      {changed && <p role="alert" className="error-text">준비하는 동안 현재 기록이 바뀌었습니다. 취소하고 현재 기록을 다시 확인해 주세요.</p>}
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="row">
        <button type="button" className="button secondary" onClick={() => { setPending(null); setError(""); }}>교체 취소</button>
        <button type="button" className="button primary" disabled={!canReplace} onClick={replace}>{pending.mode === "empty" ? "빈 가상 학급으로 교체" : "예시 학급으로 교체"}</button>
      </div>
    </div>}
  </section>;
}
