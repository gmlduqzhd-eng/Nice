'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { Classroom, WorkspaceData } from '@/lib/domain';
import {
  createNeisSemesterJob, getSemesterWork, getSemesterTaskError,
  reviewSemesterWorkspaceEntry, selectSemesterSubject, updateSemesterWorkspaceClassroom, updateSemesterWorkspaceContent,
} from '@/lib/neis-semester-job';
import { ELEMENTARY_SUBJECTS } from '@/lib/subjects';

export default function NeisSemesterJobPanel({ data, onChange, initialStudentId, initialFocus, onStudentChange }: {
  data: WorkspaceData;
  onChange: (update: (current: WorkspaceData) => WorkspaceData) => void;
  initialStudentId: string;
  initialFocus?: 'editor' | 'transfer';
  onStudentChange: (id: string) => void;
}) {
  const { classroom, subject, entries, candidates } = useMemo(() => getSemesterWork(data), [data]);
  const archivedSubjects = new Set(data.semesterArchives?.map(task => task.subject));
  const subjects = new Set<string>(ELEMENTARY_SUBJECTS);
  if (subject) subjects.add(subject);
  for (const archivedSubject of archivedSubjects) subjects.add(archivedSubject);
  const [activeId, setActiveId] = useState(initialStudentId);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  const editor = useRef<HTMLTextAreaElement>(null);
  const subjectInput = useRef<HTMLSelectElement>(null);
  const contextHeading = useRef<HTMLHeadingElement>(null);
  const selectReady = useRef<HTMLButtonElement>(null);
  const selectionContext = JSON.stringify({ classroom, subject, students: data.students });
  useEffect(() => { setSelected([]); }, [selectionContext]);
  const active = candidates.find(item => item.student.id === activeId) ?? candidates[0];
  const ready = candidates.filter(item => item.ready);
  const pending = candidates.filter(item => !item.ready);
  const unreviewed = pending.filter(item => !item.reviewed);
  const next = active && (unreviewed.find(item => item.student.number > active.student.number) ??
    unreviewed.find(item => item.student.id !== active.student.id) ??
    pending.find(item => item.reviewed && item.student.id !== active.student.id));
  const eligibleSelection = selected.filter(id => ready.some(item => item.student.id === id));
  const contextError = getSemesterTaskError(data.students, { classroom, subject });

  useEffect(() => {
    if (!initialFocus) return;
    const frame = requestAnimationFrame(() => {
      if (initialFocus === 'transfer') selectReady.current?.focus();
      else if (!subjectInput.current?.value) subjectInput.current?.focus();
      else editor.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialFocus]);

  function selectStudent(id: string, focusEditor = false) {
    setActiveId(id);
    onStudentChange(id);
    if (focusEditor) requestAnimationFrame(() => editor.current?.focus());
  }

  function save(update: (current: WorkspaceData) => WorkspaceData): boolean {
    try {
      onChange(update);
      setMessage(''); setDownloadMessage(''); return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '학기말 문장을 보관하지 못했습니다. 저장 상태를 확인해 주세요.');
      return false;
    }
  }

  function changeClassroom(nextClassroom: Classroom) {
    if (save(current => updateSemesterWorkspaceClassroom(current, nextClassroom))) {
      setSelected([]);
      setMessage('이 교과의 작업 학급 또는 학기가 바뀌었습니다. 문장을 다시 검토해 주세요.');
    }
  }
  function changeSubject(nextSubject: string) {
    if (save(current => selectSemesterSubject(current, nextSubject))) {
      setSelected([]);
      setMessage(archivedSubjects.has(nextSubject)
        ? `${nextSubject}에 보관한 초안과 검토 상태를 열었습니다.`
        : `${nextSubject} 작업을 열었습니다.`);
    }
  }
  function changeContent(content: string) {
    if (!active) return;
    if (save(current => updateSemesterWorkspaceContent(current, active.student.id, content))) {
      onStudentChange(active.student.id);
      setSelected(current => current.filter(id => id !== active.student.id));
    }
  }
  function changeReview(reviewed: boolean, nextStudent = false) {
    if (!active) return;
    if (save(current => reviewSemesterWorkspaceEntry(current, active.student.id, reviewed))) {
      onStudentChange(active.student.id);
      if (!reviewed) setSelected(current => current.filter(id => id !== active.student.id));
      if (nextStudent) {
        if (next) {
          selectStudent(next.student.id, true);
          setMessage(`${active.student.number}번 ${active.student.name} 검토를 저장했습니다. ${next.student.number}번 ${next.student.name} 학생으로 이동했습니다.`);
        } else {
          setMessage('모든 학생의 학기말 문장 검토를 마쳤습니다. 작업 파일에 담을 학생을 선택하세요.');
          requestAnimationFrame(() => selectReady.current?.focus());
        }
      }
    }
  }
  function download() {
    try {
      const job = createNeisSemesterJob(data.students, { classroom, subject }, entries, eligibleSelection);
      const url = URL.createObjectURL(new Blob([JSON.stringify(job, null, 2)], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url;
      const fileSubject = ELEMENTARY_SUBJECTS.find(item => item === job.subject) ?? '기타교과';
      anchor.download = `담임노트_학기말_${fileSubject}_${job.classroom.year}_${job.classroom.grade}학년_${job.classroom.semester}학기_${job.rows.length}명.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadMessage(`${job.subject} 학기말 종합의견 ${job.rows.length}명의 작업 파일을 내려받았습니다. 나이스 입력·저장은 별도로 확인하세요.`);
    } catch (error) { setDownloadMessage(error instanceof Error ? error.message : '학기말 작업 파일을 만들지 못했습니다.'); }
  }

  return <div className="stack">
    <div className="page-heading"><div><div className="eyebrow">교과별 학기말 종합의견 · 초안 보관</div><h1>학기말 종합의견 준비</h1><p>작업할 교과와 학급을 확인하고 학생별 의견을 직접 작성·검토합니다.</p></div></div>
    <div className="notice notice-block"><strong>교과마다 초안과 검토 상태를 자동 보관합니다.</strong><p>교과를 다시 선택하면 이어 쓸 수 있습니다. 전체 기록 백업에는 모든 교과의 문장이 포함됩니다. 현재 명부의 가상 학생만 사용하세요.</p></div>
    <section className="card classroom-card stack" aria-labelledby="semester-context-heading">
      <h2 id="semester-context-heading" ref={contextHeading} tabIndex={-1}>1. 작업할 학급과 교과</h2>
      <label className="field">작업 교과<select ref={subjectInput} aria-label="작업 교과" value={subject} onChange={event => changeSubject(event.target.value)}>
        <option value="" disabled>교과를 선택하세요</option>
        {[...subjects].map(item => <option key={item} value={item}>{item}{archivedSubjects.has(item) ? ' · 보관됨' : ''}</option>)}
      </select></label>
      <p className="muted">아래 학급과 학기는 선택한 교과의 작업 파일에 사용됩니다.</p>
      <div className="classroom-fields">
        <label className="field">작업 학년도<input type="number" min={2000} max={2100} step={1} value={classroom.year} onChange={event => changeClassroom({ ...classroom, year: Number(event.target.value) })}/></label>
        <label className="field">작업 학년<select aria-label="작업 학년" value={classroom.grade} onChange={event => changeClassroom({ ...classroom, grade: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
        <label className="field">작업 반<input value={classroom.room} maxLength={20} onChange={event => changeClassroom({ ...classroom, room: event.target.value })}/></label>
        <label className="field">작업 학기<select aria-label="작업 학기" value={classroom.semester} onChange={event => changeClassroom({ ...classroom, semester: Number(event.target.value) as 1 | 2 })}><option value={1}>1학기</option><option value={2}>2학기</option></select></label>
      </div>
      <div className="notice notice-block"><strong className="section-heading">{classroom.year}학년도 · {classroom.grade}학년 · {classroom.room.trim() ? `${classroom.room.trim()}반` : '반 미입력'} · {classroom.semester}학기 · {subject.trim() || '교과 미입력'}</strong><p>학기말 종합의견 작업 대상이 위 학급·학기·교과와 정확히 같은지 확인하세요.</p></div>
      {contextError && <p className="error-text">{contextError}</p>}
    </section>
    <section className="card classroom-card stack"><h2>2. 학생별 문장 작성과 교사 검토</h2><p className="muted">이 교과의 작업 학급이나 문장을 수정하면 다시 검토해야 합니다. 학생 명부가 바뀌면 모든 교과를 다시 검토해 주세요.</p>
      {!active ? <p>현재 명부에 학생이 없습니다.</p> : <>
        <label className="field">학기말 작성 학생<select aria-label="학기말 작성 학생" value={active.student.id} onChange={event => selectStudent(event.target.value)}>{candidates.map(({ student }) => <option key={student.id} value={student.id}>{student.number}번 {student.name}</option>)}</select></label>
        <label className="field">{active.student.number}번 {active.student.name} 학기말 종합의견<textarea ref={editor} rows={6} maxLength={6000} value={active.entry.content} onChange={event => changeContent(event.target.value)} placeholder="이 교과에서 관찰한 내용을 바탕으로 직접 작성하세요."/></label>
        <p className="muted">{Array.from(active.entry.content).length}자 · 작업 파일은 6,000자 이하</p>
        {active.reasons.length > 0 && <ul className="helper-steps">{active.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <p id="semester-review-help" className="muted">교과와 문장을 확인한 뒤 검토 완료를 표시하세요. 작업 파일에 포함할 학생은 아래 3단계에서 선택합니다.</p>
        <div className="row semester-review-actions">
          <label className="row"><input type="checkbox" checked={active.reviewed} disabled={!!contextError || active.reasons.length > 0} aria-describedby="semester-review-help" onChange={event => changeReview(event.target.checked)}/>{active.student.number}번 {active.student.name} 학기말 문장 검토 완료</label>
          {active.ready ? <>
            {next && <button type="button" className="button primary" onClick={() => selectStudent(next.student.id, true)}>{next.reviewed ? '점검이 남은 학생' : '다음 미검토 학생'}</button>}
            {!next && <button type="button" className="button primary" onClick={() => selectReady.current?.focus()}>작업 파일 준비</button>}
          </> : <button type="button" className="button primary" disabled={!!contextError || active.reasons.length > 0}
            onClick={() => changeReview(true, true)}>{next ? '검토하고 다음 학생' : '검토 마치고 작업 파일로'}</button>}
        </div>
        {next && <p className="muted">다음에 확인할 학생 · {next.student.number}번 {next.student.name}</p>}
      </>}
      {message && <p role="status" className="notice">{message}</p>}
    </section>
    <section className="card classroom-card stack"><h2>3. 검토한 학생 선택과 작업 파일</h2>
      {contextError && <button type="button" className="text-button"
        onClick={() => (subject ? contextHeading.current : subjectInput.current)?.focus()}>작업 학급·교과 확인하기</button>}
      <p className="muted">작업 파일 대상: {classroom.year}학년도 · {classroom.grade}학년 · {classroom.room.trim() ? `${classroom.room.trim()}반` : '반 미입력'} · {classroom.semester}학기 · {subject.trim() || '교과 미입력'}</p>
      <div className="row between"><span>옮길 수 있음 {ready.length}명 · 수정·검토 필요 {pending.length}명</span><div className="row"><button ref={selectReady} type="button" className="button secondary" disabled={!ready.length} onClick={() => setSelected(ready.map(item => item.student.id))}>검토된 학기말 학생 모두 선택</button><button type="button" className="button secondary" disabled={!eligibleSelection.length} onClick={() => setSelected([])}>학기말 작업 선택 해제</button></div></div>
      <div className="table-scroll"><table className="roster-table transfer-table"><thead><tr><th scope="col">선택</th><th scope="col">학생</th><th scope="col">학기말 입력 준비</th></tr></thead><tbody>{candidates.map(candidate => <tr key={candidate.student.id}>
        <td><input type="checkbox" aria-label={`${candidate.student.number}번 ${candidate.student.name} 학기말 작업 선택`} disabled={!candidate.ready} checked={candidate.ready && eligibleSelection.includes(candidate.student.id)} onChange={event => setSelected(current => event.target.checked ? [...current.filter(id => id !== candidate.student.id), candidate.student.id] : current.filter(id => id !== candidate.student.id))}/></td>
        <th scope="row">{candidate.student.number}번 {candidate.student.name}</th>
        <td>
          <span className={`badge ${candidate.ready ? 'status-confirmed' : 'status-draft'}`}>{candidate.ready ? '옮길 수 있음' : '수정·검토 필요'}</span>
          {!candidate.ready && <ul className="transfer-checks">
            {candidate.reasons.length ? candidate.reasons.map(reason => <li key={reason}>{reason}</li>) : <li>교사 검토가 필요합니다.</li>}
          </ul>}
          <button type="button" className="text-button transfer-edit" aria-label={`${candidate.student.number}번 ${candidate.student.name} 학기말 문장 작성`}
            onClick={() => selectStudent(candidate.student.id, true)}>{candidate.ready ? '문장 확인' : '문장 수정·검토'}</button>
        </td>
      </tr>)}</tbody></table></div>
      <div><button type="button" className="button primary" disabled={!eligibleSelection.length} onClick={download}><Download size={16}/>선택한 {eligibleSelection.length}명 학기말 작업 파일</button></div>
      <div className="row"><a className="button secondary" href="/downloads/damim-neis-helper.zip" download><Download size={16}/>확장프로그램 받기</a><a className="button secondary" href="/neis-practice?task=semester" target="_blank" rel="noreferrer">가상 학기말 화면에서 연습</a></div>
      <p className="muted">파일은 생성 시점의 문장·학급·교과를 담고 24시간 후 만료됩니다. 변경 후 새 파일을 받으세요. 나이스 화면에서 같은 학급·학기·교과·학생을 대조하고 직접 저장을 확인해야 합니다.</p>
      <p className="muted">실제 나이스 화면 호환성은 추가 확인이 필요합니다. 도우미는 저장 버튼을 누르지 않으며 마감 안내가 보이면 확인 전 입력을 중단합니다.</p>
      {downloadMessage && <p role="status" className="notice">{downloadMessage}</p>}
    </section>
  </div>;
}
