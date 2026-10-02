'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, HelpCircle, NotebookPen, ClipboardCheck, Cloud, X } from 'lucide-react';

const GUIDE_KEY = 'damim-note.guide.dismissed.v1';

export default function GettingStarted({ onRecord, onPrepare, onBackup, onClassroom }: {
  onRecord: () => void;
  onPrepare: () => void;
  onBackup: () => void;
  onClassroom: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    try { setExpanded(localStorage.getItem(GUIDE_KEY) !== 'true'); }
    catch { setExpanded(true); }
  }, []);
  const close = () => {
    setExpanded(false);
    try { localStorage.setItem(GUIDE_KEY, 'true'); } catch { /* Optional preference only. */ }
  };
  if (!expanded) return <div className="guide-toggle"><button type="button" className="text-button" onClick={() => setExpanded(true)}><HelpCircle size={16} aria-hidden="true"/>사용 안내 다시 보기</button></div>;
  return <section className="quick-guide" aria-labelledby="quick-guide-title">
    <div className="quick-guide-heading"><div><span className="eyebrow">처음이라면 이렇게</span><h2 id="quick-guide-title">하루 한 줄부터 시작해 보세요.</h2><p>가입 전에도 바로 연습할 수 있어요. 기록 → 문장 준비 → 보관, 세 가지만 기억하세요.</p></div><button type="button" className="icon-button" aria-label="사용 안내 접기" onClick={close}><X size={20}/></button></div>
    <p className="guide-classroom">새 학급을 준비하시나요? <button type="button" className="text-button" onClick={onClassroom}>빈 학급으로 시작하기</button></p>
    <div className="quick-guide-actions">
      <button type="button" onClick={onRecord}><span className="quick-guide-icon"><NotebookPen size={21}/></span><span><strong>첫 관찰 남기기</strong><small>학생을 고르고, 직접 본 순간을 한 줄로</small></span><ArrowRight size={17}/></button>
      <button type="button" onClick={onPrepare}><span className="quick-guide-icon"><ClipboardCheck size={21}/></span><span><strong>입력 문장 준비하기</strong><small>관찰을 모아 검토하고, 나이스에 복사</small></span><ArrowRight size={17}/></button>
      <button type="button" onClick={onBackup}><span className="quick-guide-icon"><Cloud size={21}/></span><span><strong>내 기록 보관하기</strong><small>파일로 내려받거나, 로그인해 직접 저장</small></span><ArrowRight size={17}/></button>
    </div>
  </section>;
}
