'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Sparkles, X } from 'lucide-react';
import { AI_KEYWORD_LIMIT, AI_LENGTHS, AI_OUTPUT_BYTE_LIMIT, aiErrorMessage, normalizeAiDraft, redactRosterNames, type AiDraftLength } from '@/lib/ai-draft';
import type { Draft, WorkspaceData } from '@/lib/domain';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from './auth-provider';
import styles from './ai-draft-controls.module.css';

type Props = {
  data: WorkspaceData;
  draft: Draft;
  disabled: boolean;
  isCurrentWorkspace: (snapshot: WorkspaceData) => boolean;
  onApply: (text: string) => boolean;
};

export default function AiDraftControls({ data, draft, disabled, isCurrentWorkspace, onApply }: Props) {
  const { user, checking, authBusy, openAuth } = useAuth();
  const [length, setLength] = useState<AiDraftLength>('standard');
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ text: string; snapshot: WorkspaceData } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const evidence = data.observations.filter(item => item.studentId === draft.studentId && draft.evidenceIds.includes(item.id));

  // A changed student/account unmounts this component. Edits invalidate the exact snapshot.
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  useEffect(() => {
    if (pending.current) { pending.current.abort(); pending.current = null; setBusy(false); }
    setPreview(null);
    setError('');
  }, [data, user?.id]);

  const cancel = () => {
    pending.current?.abort(); pending.current = null;
    setBusy(false); setPreview(null); setError('');
  };

  async function generate() {
    if (disabled || pending.current || checking || authBusy) return;
    if (!user) { openAuth(); return; }
    if (draft.content.trim().length < 2 || draft.content.length > AI_KEYWORD_LIMIT) {
      setError(`문장 칸에 키워드를 2~${AI_KEYWORD_LIMIT.toLocaleString()}자로 적어 주세요.`); return;
    }
    if (includeEvidence && evidence.length > 10) { setError('함께 반영할 관찰 근거는 최대 10건입니다. 선택을 줄여 주세요.'); return; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(''); setPreview(null);
    const snapshot = data;
    const current = () => pending.current === controller && !controller.signal.aborted && isCurrentWorkspace(snapshot);
    const timer = setTimeout(() => controller.abort('timeout'), 35_000);
    try {
      const client = getSupabase();
      const session = await client?.auth.getSession();
      if (!current()) return;
      if (!session?.data.session || session.error || session.data.session.user.id !== user.id) {
        setError(aiErrorMessage('AI_LOGIN_REQUIRED')); return;
      }
      const names = data.students.map(student => student.name);
      const response = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session.access_token}` },
        signal: controller.signal,
        body: JSON.stringify({
          keywords: redactRosterNames(draft.content, names),
          evidence: includeEvidence ? evidence.map(item => redactRosterNames(item.content, names)) : [],
          length,
        }),
      });
      const payload = await response.json();
      if (!current()) return;
      if (!response.ok) { setError(aiErrorMessage(payload?.code)); return; }
      const text = normalizeAiDraft(payload?.text);
      if (!text) { setError(aiErrorMessage('AI_INVALID_OUTPUT')); return; }
      setPreview({ text, snapshot });
    } catch {
      if (pending.current !== controller || !isCurrentWorkspace(snapshot)) return;
      setError(aiErrorMessage(controller.signal.aborted ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE'));
    } finally {
      clearTimeout(timer);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }

  return <section className={styles.panel} aria-label="AI 문장 생성">
    <div className={styles.toolbar}>
      <div className={styles.intro}><Sparkles size={17} aria-hidden="true"/><div><strong>키워드로 문장 완성</strong><p>예: 친구 의견 경청, 모둠 협력, 맡은 역할 책임감</p></div></div>
      <div className={styles.actions}>
        <label className={styles.length}>분량<select aria-label="AI 문장 분량" value={length} disabled={disabled || busy} onChange={event => { setLength(event.target.value as AiDraftLength); setPreview(null); }}>{Object.entries(AI_LENGTHS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" className="button primary" disabled={disabled || busy || checking || authBusy || draft.content.trim().length < 2} onClick={() => void generate()}>{busy ? <LoaderCircle size={17} className={styles.spinner} aria-hidden="true"/> : <Sparkles size={17} aria-hidden="true"/>}{busy ? '문장 생성 중…' : 'AI 생성'}</button>
        {busy && <button type="button" className="button secondary" onClick={cancel}>생성 취소</button>}
      </div>
    </div>
    {evidence.length > 0 && <label className={styles.evidence}><input type="checkbox" checked={includeEvidence} disabled={disabled || busy} onChange={event => { setIncludeEvidence(event.target.checked); setPreview(null); }}/>선택한 관찰 근거 {evidence.length}건도 함께 반영</label>}
    <p className={styles.help}>‘AI 생성’을 누르면 입력 내용과 선택한 근거가 Google Gemini로 전송됩니다. 명부에 등록된 이름은 가려 보냅니다. 무료 API는 입력·출력을 서비스 개선에 사용할 수 있으므로 가상 자료만 사용해 주세요. {!user && 'AI 생성은 로그인 후 이용할 수 있습니다.'}</p>
    {busy && <p role="status" className={styles.help}>행동특성 및 종합의견 문체로 다듬고 있습니다. 기존 내용은 유지됩니다.</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {preview && preview.snapshot === data && <div className={styles.preview}>
      <div className="row between"><h3>AI 생성 초안</h3><span className="badge neutral">선생님 확인 필요</span></div>
      <p className={styles.result}>{preview.text}</p>
      <p className={styles.help}>사실과 표현을 확인한 뒤 적용하세요. 적용하면 ‘작성 중’으로 돌아갑니다. 출력 상한 {AI_OUTPUT_BYTE_LIMIT.toLocaleString()}바이트는 생성 기준이며 나이스 입력 제한을 보증하지 않습니다.</p>
      <div className={styles.actions}><button type="button" className="button primary" disabled={disabled} onClick={() => { if (!isCurrentWorkspace(preview.snapshot)) { cancel(); return; } if (onApply(preview.text)) setPreview(null); }}><Check size={16} aria-hidden="true"/>이 문장 적용</button><button type="button" className="button secondary" onClick={cancel}><X size={16} aria-hidden="true"/>취소 · 기존 내용 유지</button></div>
    </div>}
  </section>;
}
