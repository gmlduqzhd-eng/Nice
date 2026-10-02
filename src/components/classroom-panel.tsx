"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, Pencil, Plus, Trash2, Users } from "lucide-react";
import { addStudents, editStudent, removeStudent, updateClassroom, type Classroom, type Student, type WorkspaceData } from "@/lib/domain";
import { exportRoster, parseRoster, type RosterEntry } from "@/lib/roster";
import { replaceWorkspaceFromSnapshot } from "@/lib/workspace-start";
import WorkspaceStartPanel from "./workspace-start-panel";

type Props = {
  data: WorkspaceData;
  onChange: (update: (current: WorkspaceData) => WorkspaceData) => void;
  onToast: (message: string) => void;
};

export default function ClassroomPanel({ data, onChange, onToast }: Props) {
  const [classroom, setClassroom] = useState<Classroom>(data.classroom);
  const [editing, setEditing] = useState<Student | null>(null);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const alive = useRef(false);
  const fileRevision = useRef(0);
  const numberInput = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; fileRevision.current++; }; }, []);

  function run(action: () => void) {
    try { action(); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "처리하지 못했습니다. 다시 확인해 주세요."); }
  }
  function saveClassroom(event: FormEvent) {
    event.preventDefault();
    run(() => {
      if (JSON.stringify(classroom) !== JSON.stringify(data.classroom) &&
          !window.confirm("현재 학급의 표시 정보를 바꿀까요? 학생과 기록은 그대로 유지됩니다. 다른 학급의 새 기록 공간을 만드는 기능은 아닙니다.")) return;
      onChange(current => updateClassroom(current, classroom));
      onToast("학급 정보를 저장했습니다.");
    });
  }
  function saveStudent(event: FormEvent) {
    event.preventDefault();
    run(() => {
      if (editing && editing.name !== name.trim() && !window.confirm("이름을 수정하면 모든 문장을 다시 검토해야 합니다. 원문과 관찰 근거는 유지됩니다. 수정할까요?")) return;
      onChange(current => editing ? editStudent(current, editing.id, Number(number), name) : addStudents(current, [{ id: crypto.randomUUID(), number: Number(number), name }]));
      onToast(editing ? "학생 정보를 수정했습니다." : "학생을 추가했습니다.");
      setEditing(null); setNumber(""); setName(""); numberInput.current?.focus();
    });
  }
  function checkText(value: string) {
    const parsed = parseRoster(value);
    const duplicate = parsed.find(student => data.students.some(existing => existing.number === student.number));
    if (duplicate) throw new Error(`${duplicate.number}번은 현재 명부에 있습니다. 기존 번호를 바꾸거나 가져올 명부에서 제외해 주세요.`);
    if (data.students.length + parsed.length > 500) throw new Error("현재 명부와 합쳐 500명 이하로 입력해 주세요.");
    setPreview(parsed);
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const revision = ++fileRevision.current;
    setPreview(null); setError("");
    if (file.size > 300_000) { setError("300KB 이하의 UTF-8 CSV 또는 TSV 파일을 선택해 주세요."); return; }
    setReading(true);
    try {
      const value = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (!alive.current || revision !== fileRevision.current) return;
      setText(value); checkText(value);
    } catch (err) {
      if (alive.current && revision === fileRevision.current) setError(err instanceof TypeError ? "UTF-8 파일이 아닙니다. 엑셀에서 ‘CSV UTF-8’로 저장하거나 두 열을 복사해 붙여넣어 주세요." : err instanceof Error ? err.message : "명부를 읽지 못했습니다.");
    } finally { if (alive.current && revision === fileRevision.current) setReading(false); }
  }
  function download() {
    run(() => {
      const url = URL.createObjectURL(new Blob([exportRoster(data.students)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `담임노트_${data.classroom.year}_${data.classroom.grade}학년_명부.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  function replaceStart(snapshot: WorkspaceData, replacement: WorkspaceData) {
    onChange(current => replaceWorkspaceFromSnapshot(current, snapshot, replacement));
    fileRevision.current++;
    setClassroom(replacement.classroom); setEditing(null); setNumber(""); setName("");
    setText(""); setPreview(null); setReading(false); setError("");
    onToast(replacement.students.length ? "예시 학급으로 바꿨습니다." : "빈 가상 학급으로 바꿨습니다. 가상 학생 명부를 추가해 주세요.");
  }
  return <div className="classroom-panel stack">
    <div className="page-heading"><div><div className="eyebrow">우리 반을 준비하는 첫 단계</div><h1>학급 · 명부</h1><p>학급 정보를 정하고 가상 학생 명부로 기록 흐름을 연습하세요.</p></div><span className="badge neutral"><Users size={16} /> {data.students.length}명</span></div>
    {error && <p role="alert" className="notice error">{error}</p>}
    <WorkspaceStartPanel data={data} onReplace={replaceStart}/>
    <section className="card classroom-card"><h2>학급 정보</h2><p className="muted">현재 기록의 학급 표시를 수정합니다. 새 학년의 별도 기록 공간은 아직 제공하지 않습니다.</p>
      <form onSubmit={saveClassroom}>
        <div className="classroom-fields">
          <label className="field">학년도<input type="number" min="2000" max="2100" required value={classroom.year} onChange={event => setClassroom({ ...classroom, year: Number(event.target.value) })} /></label>
          <label className="field">학년<select aria-label="학년" value={classroom.grade} onChange={event => setClassroom({ ...classroom, grade: Number(event.target.value) })}>{[1,2,3,4,5,6].map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
          <label className="field">반<input required maxLength={20} value={classroom.room} onChange={event => setClassroom({ ...classroom, room: event.target.value })} /></label>
          <label className="field">학기<select aria-label="학기" value={classroom.semester} onChange={event => setClassroom({ ...classroom, semester: Number(event.target.value) as 1 | 2 })}><option value={1}>1학기</option><option value={2}>2학기</option></select></label>
        </div><button className="button primary" type="submit">학급 정보 저장</button>
      </form>
    </section>
    <section className="card classroom-card stack"><h2>명부 한 번에 추가</h2>
      <p className="muted">엑셀의 번호·이름 두 열을 복사해 아래에 붙여넣으세요. 미리보기로 확인한 학생만 추가하며 기존 기록은 유지합니다. 가상 학생 이름으로 연습하세요.</p>
      <label className="field">명부 붙여넣기<textarea rows={5} maxLength={100000} value={text} disabled={reading} placeholder={'번호\t이름\n1\t가상하나\n2\t가상둘'} onChange={event => { fileRevision.current++; setText(event.target.value); setPreview(null); setError(""); }}/></label>
      <label className="field">명부 파일<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={event => void readFile(event)} disabled={reading}/></label>
      <p className="muted">파일을 사용한다면 엑셀에서 CSV UTF-8로 저장하세요. 같은 번호가 이미 있으면 기존 학생을 바꾸지 않고 확인을 요청합니다.</p>
      <div><button className="button secondary" disabled={reading} onClick={() => run(() => { setPreview(null); checkText(text); })}>{reading ? "명부 읽는 중…" : "명부 미리보기"}</button></div>
      {preview && <div className="roster-preview"><h3>추가할 학생 {preview.length}명</h3><ul>{preview.map(student => <li key={student.number}>{student.number}번 {student.name}</li>)}</ul><button className="button primary" onClick={() => run(() => {
        onChange(current => addStudents(current, preview.map(student => ({ ...student, id: crypto.randomUUID() }))));
        onToast(`${preview.length}명을 추가했습니다. 기존 기록은 유지됩니다.`); setPreview(null); setText("");
      })}>미리본 학생 추가</button></div>}
    </section>
    <section className="card classroom-card"><h2>{editing ? "학생 정보 수정" : "학생 추가"}</h2>
      <form onSubmit={saveStudent} className="student-form">
        <label className="field">학생 번호<input ref={numberInput} type="number" min="1" max="999" required value={number} onChange={event => setNumber(event.target.value)} /></label>
        <label className="field">학생 이름<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="가상 학생 이름" /></label>
        <button className="button primary" type="submit"><Plus size={16}/>{editing ? "학생 수정 저장" : "학생 추가"}</button>
        {editing && <button className="button secondary" type="button" onClick={() => { setEditing(null); setNumber(""); setName(""); }}>수정 취소</button>}
      </form>
    </section>
    <section className="card classroom-card"><div className="section-heading"><h2>우리 반 명부</h2><button className="button secondary" onClick={download} disabled={!data.students.length}><Download size={16}/>명부 CSV 내려받기</button></div>
      <p className="muted">관찰이나 작성 문장이 연결된 학생은 삭제하지 않습니다. 작성 문장 수에는 학기말에 적은 내용도 포함합니다. 이름 변경 시 문장은 원문을 유지하고 재검토 상태로 바뀝니다.</p>
      <div className="table-scroll"><table className="roster-table"><thead><tr><th>번호</th><th>이름</th><th>관찰 / 초안</th><th>관리</th></tr></thead><tbody>{data.students.map(student => {
        const observations = data.observations.filter(item => item.studentId === student.id).length;
        const semesterEntries = data.semesterPreparation?.entries;
        const semesterDraft = semesterEntries && Object.hasOwn(semesterEntries, student.id) && semesterEntries[student.id].content.trim() ? 1 : 0;
        const drafts = data.drafts.filter(item => item.studentId === student.id).length + semesterDraft;
        return <tr key={student.id}><td>{student.number}</td><td>{student.name}</td><td>{observations} / {drafts}</td><td><div className="row">
          <button className="icon-button" aria-label={`${student.number}번 ${student.name} 정보 수정`} onClick={() => { setEditing(student); setNumber(String(student.number)); setName(student.name); numberInput.current?.focus(); }}><Pencil size={16}/></button>
          <button className="icon-button" aria-label={`${student.number}번 ${student.name} 삭제`} disabled={!!observations || !!drafts} onClick={() => run(() => {
            if (!window.confirm(`${student.number}번 ${student.name} 학생을 명부에서 삭제할까요?`)) return;
            onChange(current => removeStudent(current, student.id));
            if (editing?.id === student.id) { setEditing(null); setName(""); setNumber(""); }
            onToast("명부에서 삭제했습니다.");
          })}><Trash2 size={16}/></button></div></td></tr>;
      })}</tbody></table></div>
      {!data.students.length && <p className="empty-state">위에서 명부를 붙여넣거나 학생을 한 명씩 추가하세요.</p>}
    </section>
  </div>;
}
