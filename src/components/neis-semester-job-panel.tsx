'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Classroom, WorkspaceData } from '@/lib/domain';
import {
  createNeisSemesterJob, getSemesterCandidates, getSemesterPreparation, getSemesterTaskError,
  reviewSemesterWorkspaceEntry, updateSemesterWorkspaceContent, updateSemesterWorkspaceContext,
} from '@/lib/neis-semester-job';
import { ELEMENTARY_SUBJECTS } from '@/lib/subjects';

type ChangeWorkspace = (update: WorkspaceData | ((current: WorkspaceData) => WorkspaceData)) => boolean;

export default function NeisSemesterJobPanel({ data, onChange }: { data: WorkspaceData; onChange: ChangeWorkspace }) {
  const { classroom, subject, entries } = useMemo(() => getSemesterPreparation(data), [data]);
  const [activeId, setActiveId] = useState(data.students[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const candidates = useMemo(() => getSemesterCandidates(data.students, { classroom, subject }, entries), [data.students, classroom, subject, entries]);
  const active = candidates.find(item => item.student.id === activeId) ?? candidates[0];
  const ready = candidates.filter(item => item.ready);
  const eligibleSelection = selected.filter(id => ready.some(item => item.student.id === id));
  const contextError = getSemesterTaskError(data.students, { classroom, subject });

  function save(update: (current: WorkspaceData) => WorkspaceData): boolean {
    try {
      if (!onChange(update)) throw new Error('현재 기록을 변경할 수 없습니다. 저장 상태를 확인해 주세요.');
      setMessage(''); return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '학기말 문장을 보관하지 못했습니다. 저장 상태를 확인해 주세요.');
      return false;
    }
  }

  function changeContext(nextClassroom: Classroom, nextSubject = subject) {
    if (save(current => updateSemesterWorkspaceContext(current, { classroom: nextClassroom, subject: nextSubject }))) {
      setSelected([]); setMessage('작업 학급 또는 교과가 바뀌었습니다. 문장을 다시 검토해 주세요.');
    }
  }
  function changeContent(content: string) {
    if (!active) return;
    if (save(current => updateSemesterWorkspaceContent(current, active.student.id, content))) {
      setSelected(current => current.filter(id => id !== active.student.id));
    }
  }
  function changeReview(reviewed: boolean) {
    if (!active) return;
    if (save(current => reviewSemesterWorkspaceEntry(current, active.student.id, reviewed))) {
      if (!reviewed) setSelected(current => current.filter(id => id !== active.student.id));
    }
  }
  function download() {
    try {
      const job = createNeisSemesterJob(data.students, { classroom, subject }, entries, eligibleSelection);
      const url = URL.createObjectURL(new Blob([JSON.stringify(job, null, 2)], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `담임노트_학기말_${job.classroom.year}_${job.classroom.grade}학년_${job.classroom.semester}학기_${job.rows.length}명.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${job.subject} 학기말 종합의견 ${job.rows.length}명의 작업 파일을 내려받았습니다. 나이스 입력·저장은 별도로 확인하세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '학기말 작업 파일을 만들지 못했습니다.'); }
  }

  return <div className="stack">
    <div className="page-heading"><div><div className="eyebrow">교과별 학기말 종합의견 · 초안 보관</div><h1>학기말 종합의견 준비</h1><p>작업할 교과와 학급을 확인하고 학생별 의견을 직접 작성·검토합니다.</p></div></div>
    <div className="notice notice-block"><strong>미검토 문장도 이 브라우저에 자동 보관합니다.</strong><p>다른 메뉴로 이동하거나 새로고침해도 이어 쓸 수 있습니다. 전체 기록 백업에는 학기말 초안도 포함됩니다. 다른 PC에서 이어 쓰려면 내 계정에 직접 보관하거나 백업 파일을 옮기세요. 현재 명부의 가상 학생만 사용하세요.</p></div>
    <section className="card classroom-card stack" aria-labelledby="semester-context-heading">
      <h2 id="semester-context-heading">1. 작업할 학급과 교과</h2>
      <p className="muted">아래 정보는 이 작업 파일의 대상입니다. 현재 관찰 기록의 학급 표시를 바꾸지 않습니다.</p>
      <div className="classroom-fields">
        <label className="field">작업 학년도<input type="number" min={2000} max={2100} step={1} value={classroom.year} onChange={event => changeContext({ ...classroom, year: Number(event.target.value) })}/></label>
        <label className="field">작업 학년<select aria-label="작업 학년" value={classroom.grade} onChange={event => changeContext({ ...classroom, grade: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
        <label className="field">작업 반<input value={classroom.room} maxLength={20} onChange={event => changeContext({ ...classroom, room: event.target.value })}/></label>
        <label className="field">작업 학기<select aria-label="작업 학기" value={classroom.semester} onChange={event => changeContext({ ...classroom, semester: Number(event.target.value) as 1 | 2 })}><option value={1}>1학기</option><option value={2}>2학기</option></select></label>
      </div>
      <label className="field">작업 교과<select aria-label="작업 교과" value={subject} onChange={event => changeContext(classroom, event.target.value)}><option value="">교과를 선택하세요</option>{subject && !ELEMENTARY_SUBJECTS.some(item => item === subject) && <option value={subject}>{subject} (기존 입력)</option>}{ELEMENTARY_SUBJECTS.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <div className="notice notice-block"><strong className="section-heading">{classroom.year}학년도 · {classroom.grade}학년 · {classroom.room || '미입력'}반 · {classroom.semester}학기 · {subject.trim() || '교과 미입력'}</strong><p>학기말 종합의견 작업 대상이 위 학급·학기·교과와 정확히 같은지 확인하세요.</p></div>
      {contextError && <p className="error-text">{contextError}</p>}
    </section>
    <section className="card classroom-card stack"><h2>2. 학생별 문장 작성과 교사 검토</h2><p className="muted">행동특성 문장이나 검토 상태를 가져오지 않습니다. 가상 자료로 학기말 의견을 직접 작성하세요. 교과·학급·명부·문장이 바뀌면 검토를 다시 해야 합니다.</p>
      {!active ? <p>현재 명부에 학생이 없습니다.</p> : <>
        <label className="field">학기말 작성 학생<select aria-label="학기말 작성 학생" value={active.student.id} onChange={event => setActiveId(event.target.value)}>{data.students.map(student => <option key={student.id} value={student.id}>{student.number}번 {student.name}</option>)}</select></label>
        <label className="field">{active.student.number}번 {active.student.name} 학기말 종합의견<textarea rows={6} maxLength={6000} value={active.entry.content} onChange={event => changeContent(event.target.value)} placeholder="이 교과에서 관찰한 내용을 바탕으로 직접 작성하세요."/></label>
        <p className="muted">{Array.from(active.entry.content).length}자 · 작업 파일은 6,000자 이하</p>
        {active.reasons.length > 0 && <ul className="helper-steps">{active.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <label className="row"><input type="checkbox" checked={active.reviewed} disabled={!!contextError || active.reasons.length > 0} onChange={event => changeReview(event.target.checked)}/>{active.student.number}번 {active.student.name} 학기말 문장 검토 완료</label>
      </>}
    </section>
    <section className="card classroom-card stack"><h2>3. 검토한 학생 선택과 작업 파일</h2>
      {contextError && <p className="muted">작업 학급·교과를 먼저 확인하면 학생별 준비 상태를 확인할 수 있습니다.</p>}
      <div className="row between"><span>준비된 학기말 학생 {ready.length}명 / 전체 {candidates.length}명</span><button type="button" className="button secondary" disabled={!ready.length} onClick={() => setSelected(ready.map(item => item.student.id))}>검토된 학기말 학생 모두 선택</button></div>
      <div className="table-scroll"><table className="roster-table"><thead><tr><th>선택</th><th>학생</th><th>학기말 입력 준비</th></tr></thead><tbody>{candidates.map(candidate => <tr key={candidate.student.id}>
        <td><input type="checkbox" aria-label={`${candidate.student.number}번 ${candidate.student.name} 학기말 작업 선택`} disabled={!candidate.ready} checked={candidate.ready && eligibleSelection.includes(candidate.student.id)} onChange={event => setSelected(current => event.target.checked ? [...current.filter(id => id !== candidate.student.id), candidate.student.id] : current.filter(id => id !== candidate.student.id))}/></td>
        <td><button type="button" className="text-button" onClick={() => setActiveId(candidate.student.id)}>{candidate.student.number}번 {candidate.student.name}</button></td>
        <td>{candidate.ready ? '검토 완료 · 작업 파일 생성 가능' : contextError ? '—' : candidate.reasons.length ? candidate.reasons.join(' / ') : '교사 검토가 필요합니다.'}</td>
      </tr>)}</tbody></table></div>
      <div><button type="button" className="button primary" disabled={!eligibleSelection.length} onClick={download}><Download size={16}/>선택한 {eligibleSelection.length}명 학기말 작업 파일</button></div>
      <div className="row"><a className="button secondary" href="/downloads/damim-neis-helper.zip" download><Download size={16}/>확장프로그램 받기</a><a className="button secondary" href="/neis-practice?task=semester" target="_blank" rel="noreferrer">가상 학기말 화면에서 연습</a></div>
      <p className="muted">파일은 생성 시점의 문장·학급·교과를 담고 24시간 후 만료됩니다. 변경 후 새 파일을 받으세요. 나이스 화면에서 같은 학급·학기·교과·학생을 대조하고 직접 저장을 확인해야 합니다.</p>
      <p className="muted">실제 나이스 화면 호환성은 추가 확인이 필요합니다. 도우미는 저장 버튼을 누르지 않으며 마감 안내가 보이면 확인 전 입력을 중단합니다.</p>
      {message && <p role="status" className="notice">{message}</p>}
    </section>
  </div>;
}
