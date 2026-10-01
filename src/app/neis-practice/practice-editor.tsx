'use client';

import { useRef, useState } from 'react';

// Execute the same first-party scripts as the downloadable extension, on demand.
// A web rehearsal does not verify browser installation or a real NEIS screen.
export function loadHelperScript(name: 'core' | 'content') {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/neis-helper/${name}.js?v=0.5.0`;
    script.dataset.damimMode = 'web-practice';
    const finish = (error?: Error) => {
      clearTimeout(timer); script.remove();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(new Error('도우미를 불러오는 시간이 초과되었습니다. 다시 시도하세요.')), 15000);
    script.onload = () => finish();
    script.onerror = () => finish(new Error('도우미를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.'));
    document.head.append(script);
  });
}

export default function PracticeEditor() {
  const [number, setNumber] = useState('7');
  const [name, setName] = useState('백아람');
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [helperMessage, setHelperMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const launching = useRef(false);
  async function openHelper() {
    if (launching.current) return;
    if (document.getElementById('damim-neis-helper')) {
      setHelperMessage('도우미가 이미 열려 있습니다. 오른쪽 패널을 사용하세요.'); return;
    }
    launching.current = true; setLoading(true); setHelperMessage('');
    try {
      await loadHelperScript('core'); await loadHelperScript('content');
      if (!document.getElementById('damim-neis-helper')) throw new Error('지원하는 연습 주소에서 도우미를 열어 주세요.');
      setHelperMessage('웹 연습 도우미를 열었습니다. 작업 파일 → 연습 화면 항목 자동 지정 → 화면 대조 순서로 진행하세요.');
    } catch (error) { setHelperMessage(error instanceof Error ? error.message : '도우미를 열지 못했습니다. 다시 시도하세요.'); }
    finally { launching.current = false; setLoading(false); }
  }
  return <main className="practice-page stack" data-damim-practice="1">
    <a href="/">← 담임노트로 돌아가기</a>
    <div className="page-heading"><div><div className="eyebrow">가상 화면 · 나이스 연결 없음</div><h1>입력 도우미 연습</h1><p>확장프로그램의 대조·입력을 확인하는 연습 페이지입니다. 나이스 화면을 복제하거나 연결한 페이지가 아닙니다.</p></div></div>
    <div className="notice notice-block"><strong>실제 학생 자료를 사용하지 마세요.</strong><p>학년도부터 학생 이름까지 값만 보이는 부분을 지정하세요. 기본 예시에서 7번 백아람 문장이 작업 파일로 선택 가능합니다. 가상 저장은 이 페이지 메모리에만 남으며 새로고침하면 사라집니다.</p></div>
    <section className="card classroom-card stack"><h2>이 화면에서 바로 연습</h2><p>Chrome 확장프로그램과 같은 입력 코드를 웹에서 실행합니다. 확장프로그램 설치 여부와 실제 나이스 호환성은 별도로 확인해야 합니다.</p><div><button type="button" className="button primary" disabled={loading} onClick={openHelper}>{loading ? '도우미 여는 중…' : '웹 연습 도우미 열기'}</button></div><p role="status">{helperMessage}</p></section>
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
    <section className="card classroom-card"><h2>확인 순서</h2><ol className="helper-steps"><li>담임노트 ‘나이스 작업 도우미’에서 준비된 학생을 선택하고 파일을 받습니다.</li><li>위 버튼으로 웹 연습 도우미를 열거나, 설치한 확장프로그램을 연 뒤 파일을 선택합니다.</li><li>‘연습 화면 항목 자동 지정’ → ‘화면 대조’ → ‘대조한 빈칸에 입력’을 실행합니다. 수동 지정도 가능합니다.</li><li>대조가 실패하면 ‘지정한 값 확인’에서 선택값과 작업 파일을 비교하세요. 학생을 바꾸거나 기존 문장을 적으면 입력이 차단되어야 합니다.</li></ol></section>
  </main>;
}
