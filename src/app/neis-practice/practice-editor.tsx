'use client';

import { useState } from 'react';

export default function PracticeEditor() {
  const [number, setNumber] = useState('7');
  const [name, setName] = useState('백아람');
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  return <main className="practice-page stack">
    <a href="/">← 담임노트로 돌아가기</a>
    <div className="page-heading"><div><div className="eyebrow">가상 화면 · 나이스 연결 없음</div><h1>입력 도우미 연습</h1><p>확장프로그램의 대조·입력을 확인하는 연습 페이지입니다. 나이스 화면을 복제하거나 연결한 페이지가 아닙니다.</p></div></div>
    <div className="notice notice-block"><strong>실제 학생 자료를 사용하지 마세요.</strong><p>학년도부터 학생 이름까지 값만 보이는 부분을 지정하세요. 기본 예시에서 7번 백아람 문장이 작업 파일로 선택 가능합니다. 가상 저장은 이 페이지 메모리에만 남으며 새로고침하면 사라집니다.</p></div>
    <section className="card classroom-card stack"><h2>가상 학급</h2><div className="row practice-context"><span id="practice-year">2026학년도</span><span id="practice-grade">4학년</span><span id="practice-room">2반</span><span id="practice-semester">2학기</span></div>
      <label className="field">연습 학생 선택<select value={number} onChange={event => { const next = event.target.value; setNumber(next); setName(next === '7' ? '백아람' : '윤보라'); setValue(''); setSaved(''); }}><option value="7">7번 백아람</option><option value="2">2번 윤보라</option></select></label>
    </section>
    <form className="card classroom-card stack" aria-label="가상 학생 편집" onSubmit={event => { event.preventDefault(); setSaved(value); }}>
      <h2>학생별 문장 편집</h2><div className="row practice-context"><span id="practice-number">{number}번</span><strong id="practice-name">{name}</strong></div>
      <div className="field"><label htmlFor="practice-content">행동특성 및 종합의견</label><textarea id="practice-content" rows={7} maxLength={6000} value={value} onChange={event => setValue(event.target.value)} placeholder="확장프로그램으로 이 빈칸에 문장을 입력하세요."/></div>
      <p className="muted">현재 입력 {value.length}자 · 도우미가 입력한 문장과 글자 수를 확인하세요.</p>
      <div><button type="submit" className="button primary" disabled={!value}>가상 저장 (직접 누르기)</button></div>
      <p role="status">{saved ? '직접 누른 가상 저장 내용:' : '아직 가상 저장하지 않았습니다.'}</p>{saved && <blockquote className="practice-saved">{saved}</blockquote>}
    </form>
    <section className="card classroom-card"><h2>확인 순서</h2><ol className="helper-steps"><li>담임노트 ‘나이스 작업 도우미’에서 준비된 학생을 선택하고 파일을 받습니다.</li><li>이 탭에서 설치한 확장프로그램을 열고 파일을 선택합니다.</li><li>일곱 항목을 지정하고 화면 대조 → 빈칸 입력을 실행합니다.</li><li>학생을 바꾸거나 다른 문장을 먼저 적은 뒤 대조하면 입력이 차단되는지 확인합니다.</li></ol></section>
  </main>;
}
