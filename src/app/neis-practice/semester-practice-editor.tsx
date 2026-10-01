'use client';

import { useRef, useState } from 'react';
import { DEFAULT_CLASSROOM, type Classroom } from '@/lib/domain';
import { loadHelperScript } from './practice-editor';

const students = [{ number: 7, name: '백아람' }, { number: 2, name: '윤보라' }];

export default function SemesterPracticeEditor() {
  const [classroom, setClassroom] = useState<Classroom>({ ...DEFAULT_CLASSROOM });
  const [subject, setSubject] = useState('체육');
  const [selected, setSelected] = useState(7);
  const [contents, setContents] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [closedNotice, setClosedNotice] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const launching = useRef(false);
  function changeContext(next: Classroom) { setClassroom(next); setContents({}); setSaved({}); }
  async function openHelper() {
    if (launching.current) return;
    if (document.getElementById('damim-neis-helper')) { setMessage('도우미가 이미 열려 있습니다. 오른쪽 패널을 사용하세요.'); return; }
    launching.current = true; setLoading(true); setMessage('');
    try {
      await loadHelperScript('core'); await loadHelperScript('content');
      if (!document.getElementById('damim-neis-helper')) throw new Error('도우미를 열지 못했습니다. 연습 페이지를 다시 확인하세요.');
      setMessage('학기말 작업 파일을 열고 연습 항목을 지정한 뒤 화면 대조를 누르세요.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '도우미를 열지 못했습니다.'); }
    finally { launching.current = false; setLoading(false); }
  }
  return <main className="practice-page stack" data-damim-practice="1" data-damim-practice-task="semester-subject-opinion">
    <a href="/">← 담임노트로 돌아가기</a>
    <div className="page-heading"><div><div className="eyebrow">가상 화면 · 교과별 입력 연습</div><h1>학기말 종합의견 입력 연습</h1><p>일반 HTML 표에서 교과·학기와 선택한 학생 행을 대조합니다. 실제 나이스 화면과 저장 동작은 별도 확인 대상입니다.</p></div></div>
    <div className="notice notice-block"><strong>가상 자료만 사용하세요.</strong><p>현재 선택된 학생의 입력칸만 편집할 수 있습니다. 조회 조건이나 교과를 바꾸면 이 연습의 문장과 가상 저장 내용은 초기화됩니다.</p></div>
    <section className="card classroom-card stack"><h2>연습 조회 조건</h2><div className="row practice-context">
      <label className="field">연습 학년도<input type="number" min={2000} max={2100} value={classroom.year} onChange={event => changeContext({ ...classroom, year: Number(event.target.value) })}/></label>
      <label className="field">연습 학년<select aria-label="연습 학년" value={classroom.grade} onChange={event => changeContext({ ...classroom, grade: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
      <label className="field">연습 반<input value={classroom.room} maxLength={20} onChange={event => changeContext({ ...classroom, room: event.target.value })}/></label>
      <label className="field">연습 학기<select aria-label="연습 학기" value={classroom.semester} onChange={event => changeContext({ ...classroom, semester: Number(event.target.value) as 1 | 2 })}><option value={1}>1학기</option><option value={2}>2학기</option></select></label>
      <label className="field">연습 교과<input value={subject} maxLength={40} onChange={event => { setSubject(event.target.value); setContents({}); setSaved({}); }}/></label>
    </div><div className="row practice-context" aria-label="연습 조회 조건 표시"><span id="practice-year">{classroom.year}학년도</span><span id="practice-grade">{classroom.grade}학년</span><span id="practice-room">{classroom.room}반</span><span id="practice-semester">{classroom.semester}학기</span><span id="practice-subject">{subject}</span></div>
      <label><input type="checkbox" checked={closedNotice} onChange={event => setClosedNotice(event.target.checked)}/> 가상 마감 안내 표시</label>{closedNotice && <strong className="notice">※ 학생부 반별 마감됨</strong>}
    </section>
    <section className="card classroom-card stack"><h2>학기말 도우미 연습</h2><div><button type="button" className="button primary" disabled={loading} onClick={openHelper}>{loading ? '도우미 여는 중…' : '학기말 웹 연습 도우미 열기'}</button></div><p role="status">{message}</p>
      <p className="muted">학기말 작업 파일 → 연습 화면 항목 자동 지정 → 화면 대조 → 빈칸 입력 순서입니다. 다른 학생이나 교과·학기, 기존 문장과 마감 안내가 있으면 중단해야 합니다.</p>
    </section>
    <section className="card classroom-card stack"><h2>가상 학생별 의견</h2><div className="table-scroll"><div role="grid" aria-label="가상 학기말 종합의견 표" className="semester-practice-grid">
      <div role="row" className="semester-practice-row semester-practice-header">{['선택', '반/번호', '성명', '참고자료', '학기말 종합의견'].map((label, index) => <div role="columnheader" key={label}>{index === 0 ? <input type="checkbox" disabled aria-label="가상 전체 학생 선택"/> : label}</div>)}</div>
      {students.map(student => <div role="row" aria-selected={selected === student.number} key={student.number} className="semester-practice-row">
        <div role="gridcell"><button type="button" className="text-button" onClick={() => setSelected(student.number)} aria-label={`${student.number}번 ${student.name} 연습 행 선택`}>{selected === student.number ? '선택됨' : '선택'}</button></div>
        <div role="gridcell"><span id={selected === student.number ? 'practice-number' : undefined} data-testid={`semester-number-${student.number}`}>{student.number}번</span></div>
        <div role="gridcell"><strong id={selected === student.number ? 'practice-name' : undefined} data-testid={`semester-name-${student.number}`}>{student.name}</strong></div>
        <div role="gridcell">가상 참고자료</div>
        <div role="gridcell" data-testid={`semester-opinion-cell-${student.number}`}>{selected === student.number ? <textarea id="practice-content" aria-label="학기말 종합의견" rows={5} maxLength={6000} value={contents[student.number] ?? ''} onChange={event => setContents(current => ({ ...current, [student.number]: event.target.value }))} placeholder="학기말 파일로 빈칸 입력을 연습하세요."/> : <p>{contents[student.number] || '행을 선택하면 입력칸이 열립니다.'}</p>}</div>
      </div>)}
    </div></div><div><button type="button" className="button secondary" disabled={closedNotice || !contents[selected]} onClick={() => setSaved(current => ({ ...current, [selected]: contents[selected] }))}>가상 학기말 저장 (직접 누르기)</button></div><p role="status">{saved[selected] ? '직접 누른 가상 저장 내용:' : '아직 가상 학기말 저장하지 않았습니다.'}</p>{saved[selected] && <blockquote className="practice-saved">{saved[selected]}</blockquote>}</section>
  </main>;
}
