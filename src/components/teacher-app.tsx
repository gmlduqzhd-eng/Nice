'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, LayoutDashboard, NotebookPen, ClipboardCheck, School, Settings, Plus, Search, ChevronRight, ArrowUpRight, Check, CircleCheck, AlertCircle, FileText, Copy, X, CalendarDays, Download, Pencil, Trash2, Menu, ShieldCheck } from 'lucide-react';
import { addObservation, deleteObservation, editObservation, getIssues, transitionDraft, updateDraft, utf8ByteLength, type Draft, type Observation, type WorkspaceData } from '@/lib/domain';
import { createDemoWorkspace } from '@/lib/demo';
import SettingsPanel from './settings-panel';
import SchoolPanel from './school-panel';
import { AuthProvider, useAuth } from './auth-provider';
import GettingStarted from './getting-started';
import { COPYRIGHT } from '@/lib/site';
import ClassroomPanel from './classroom-panel';
import NeisJobPanel from './neis-job-panel';
import AiDraftControls from './ai-draft-controls';
import { readWorkspace, saveWorkspace, workspaceStorageKey } from '@/lib/workspace-storage';
import { OBSERVATION_CATEGORIES } from '@/lib/subjects';

type View = 'dashboard' | 'observations' | 'workbench' | 'school' | 'settings' | 'classroom' | 'neis-job';
type SetWorkspace = (update: WorkspaceData | ((current: WorkspaceData) => WorkspaceData)) => void;
const NAV = [
  { id: 'dashboard', label: '업무 한눈에', icon: LayoutDashboard },
  { id: 'observations', label: '관찰 노트', icon: NotebookPen },
  { id: 'workbench', label: '문장 작성·검토', icon: ClipboardCheck },
  { id: 'neis-job', label: '나이스로 옮기기', icon: FileText },
  { id: 'school', label: '학교 · 학사일정', icon: School },
  { id: 'classroom', label: '학급 · 명부', icon: BookOpen },
] as const;
const STATUS: Record<Draft['status'], string> = { draft: '작성 중', reviewed: '검토 완료', copied: '복사됨', confirmed: '반영 확인' };
function localToday() { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-'); }

function Avatar({ number, size = '' }: { number: number; size?: string }) {
  return <span className={`avatar avatar-${number % 4} ${size}`}>{String(number).padStart(2, '0')}</span>;
}
function Status({ value }: { value: Draft['status'] }) { return <span className={`badge status-${value}`}>{value === 'confirmed' && <Check size={12} />}{STATUS[value]}</span>; }

export default function TeacherApp() {
  return <AuthProvider><WorkspaceGate /></AuthProvider>;
}

function WorkspaceGate() {
  const { user, checking } = useAuth();
  if (checking) return <main id="main-content" className="workspace-loading" role="status">로그인과 기록 공간을 확인하고 있습니다…</main>;
  // Reset editors and pending callbacks on every account change, before showing any records.
  return <TeacherWorkspace key={user?.id ?? 'guest'} userId={user?.id ?? null} />;
}

function TeacherWorkspace({ userId }: { userId: string | null }) {
  const { user, checking, openAuth } = useAuth();
  const [data, setDataState] = useState<WorkspaceData>(createDemoWorkspace);
  const dataRef = useRef(data);
  const storageKey = workspaceStorageKey(userId);
  const expectedRaw = useRef<string | null>(null);
  const writable = useRef(false);
  // Keep a synchronous current snapshot so asynchronous clipboard completions
  // cannot overwrite edits or an imported workspace from a later interaction.
  const setData: SetWorkspace = (update) => {
    if (!writable.current) throw new Error('지금은 기록을 변경할 수 없습니다. 저장 상태를 확인해 주세요.');
    const next = typeof update === 'function' ? update(dataRef.current) : update;
    try { expectedRaw.current = saveWorkspace(localStorage, storageKey, expectedRaw.current, next); }
    catch (error) {
      writable.current = false;
      setStorageBlocked(true);
      const message = error instanceof Error && error.name !== 'QuotaExceededError' ? error.message : '브라우저 저장에 실패했습니다. 현재 자료를 JSON으로 백업한 뒤 저장 공간을 확인해 주세요.';
      setStorageError(message);
      throw new Error(message);
    }
    dataRef.current = next;
    setDataState(next);
  };
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [neisTask, setNeisTask] = useState<'behavior' | 'semester'>('behavior');
  const [neisStudentId, setNeisStudentId] = useState<string>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'warning' | 'info'>('all');
  const [selected, setSelected] = useState('');
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState('');
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [modal, setModal] = useState<Observation | 'new' | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (message: string) => { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4500); };
  useEffect(() => {
    try {
      const loaded = readWorkspace(localStorage, userId);
      expectedRaw.current = loaded.raw;
      dataRef.current = loaded.data;
      setDataState(loaded.data);
      setRecoveryRaw(loaded.recoveryRaw);
      writable.current = loaded.recoveryRaw === null;
      if (loaded.recoveryRaw !== null) {
        setStorageBlocked(true);
        setStorageError('저장된 자료를 읽지 못했습니다. 기존 원본은 브라우저에 그대로 보존하고 자동 저장을 멈췄습니다. 복구 사본을 내려받아 주세요.');
      }
    } catch {
      setStorageBlocked(true);
      setStorageError('이 브라우저에서 저장된 자료에 접근하지 못해 자동 저장을 멈췄습니다. 설정에서 작업 내용을 JSON으로 백업해 주세요.');
    }
    setReady(true);
    const changedElsewhere = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== storageKey && event.key !== null)) return;
      if (localStorage.getItem(storageKey) === expectedRaw.current) return;
      writable.current = false; setStorageBlocked(true); setModal(null);
      setStorageError('다른 탭에서 기록이 변경되었습니다. 덮어쓰기를 막기 위해 편집을 멈췄습니다. 현재 자료를 백업하거나 최신 기록을 불러와 주세요.');
    };
    window.addEventListener('storage', changedElsewhere);
    return () => { writable.current = false; window.removeEventListener('storage', changedElsewhere); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [storageKey, userId]);
  const downloadRecovery = () => {
    if (recoveryRaw === null) return;
    const url = URL.createObjectURL(new Blob([recoveryRaw], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `damim-note-recovery-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const issues = useMemo(() => getIssues(data), [data]);
  const confirmed = data.students.filter(student => data.drafts.find(draft => draft.studentId === student.id)?.status === 'confirmed').length;
  const reviewed = data.students.filter(student => { const draft = data.drafts.find(item => item.studentId === student.id); return draft && draft.status !== 'draft'; }).length;
  const noObservation = data.students.filter(s => !data.observations.some(o => o.studentId === s.id));
  const selectedStudent = data.students.find(s => s.id === selected) ?? data.students[0];
  const shownIssues = issues.filter(i => (filter === 'all' || i.severity === filter) && (data.students.find(s => s.id === i.studentId)?.name.includes(query) || i.title.includes(query)));
  const navigate = (target: View) => { setView(target); setMobileMenu(false); setQuery(''); };
  const openStudent = (id: string) => { setSelected(id); navigate('workbench'); };
  const openTransfer = (task: 'behavior' | 'semester', studentId?: string) => {
    setNeisTask(task); setNeisStudentId(studentId); navigate('neis-job');
  };
  const startObservation = () => {
    if (!dataRef.current.students.length) { navigate('classroom'); notify('학급·명부에서 학생을 먼저 추가해 주세요.'); return; }
    setModal('new');
  };
  const replaceData = (next: WorkspaceData) => { setData(next); setSelected(next.students[0]?.id ?? ''); };
  const isCurrentWorkspace = (snapshot: WorkspaceData) => writable.current && dataRef.current === snapshot && localStorage.getItem(storageKey) === expectedRaw.current;

  if (!ready) return <main id="main-content" className="workspace-loading" role="status">저장된 기록을 불러오고 있습니다…</main>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`}>
      <button className="brand" onClick={() => navigate('dashboard')}><span className="brand-mark"><BookOpen size={24} strokeWidth={2} /></span><span>담임노트<small>TEACHER'S WORKSPACE</small></span></button>
      <div className="class-switch"><span className="class-icon"><School size={19} /></span><div><strong>{data.classroom.grade}학년 {data.classroom.room}반</strong><span>가상 학급 · {data.classroom.year}학년도</span></div><span className="class-year">{data.classroom.semester}학기</span></div>
      <p className="nav-caption">나의 업무 공간</p>
      <nav aria-label="주 메뉴">{NAV.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={20} /><span>{item.label}</span>{item.id === 'dashboard' && <span className="nav-count">{issues.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-icon"><NotebookPen size={20}/></span><strong>작은 기록이 모여<br/>아이의 성장이 됩니다.</strong><p>오늘 발견한 순간을<br/>관찰 노트에 남겨 보세요.</p><button onClick={() => startObservation()}>관찰 기록 남기기 <Plus size={15}/></button></div><button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={20}/>설정 및 백업</button><div className="profile"><span className="profile-avatar">선</span><div><strong>{user ? "내 계정의 기록 공간" : "로그인 전 체험 공간"}</strong><span>가상 데이터로 연습</span></div><span className="profile-indicator"/></div></div>
    </aside>
    {mobileMenu && <button aria-label="메뉴 닫기" className="menu-scrim" onClick={() => setMobileMenu(false)} />}
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" aria-label="메뉴 열기" onClick={() => setMobileMenu(true)}><Menu size={21}/></button><span>나의 업무 공간</span><ChevronRight size={14}/><strong>{NAV.find(n => n.id === view)?.label ?? '설정 및 백업'}</strong></div><div className="topbar-right"><span className="save-state"><span/> {ready ? storageBlocked ? '자동 저장 일시 중지' : storageError ? '저장 상태 확인 필요' : '이 PC에 자동 저장' : '자료 불러오는 중'}</span><button type="button" className={`button ${user ? 'secondary' : 'primary'} account-button`} onClick={() => user ? navigate('settings') : openAuth()} disabled={checking}>{checking ? '로그인 확인 중' : user ? '내 계정' : '회원가입 · 로그인'}</button></div></header>
      <main id="main-content">
        <div className="demo-notice"><ShieldCheck size={16}/><span>가상 학생으로 이용하는 첫 버전입니다. 실제 학생 개인정보는 입력하지 마세요.</span><button onClick={() => navigate('settings')}>저장 방식 확인 <ChevronRight size={14}/></button></div>
        <div className="storage-location"><span>{storageBlocked ? '이 PC의 자동 저장이 중지돼 있습니다.' : '관찰·행특·학기말 초안은 이 PC 브라우저에 자동 저장됩니다.'} {user ? '계정 백업은 직접 저장해야 합니다.' : '로그인 전 기록은 체험 공간에 보관됩니다.'}</span><button className="text-button" type="button" onClick={() => navigate('settings')}>저장·다른 PC 안내 <ChevronRight size={14}/></button></div>
        {storageError && <div role="alert" className="notice error notice-block"><span>{storageError}</span><button className="text-button" onClick={() => navigate("settings")}>현재 자료 백업하기</button><button className="text-button" onClick={() => window.location.reload()}>최신 기록 불러오기</button>{recoveryRaw !== null && <button className="text-button" onClick={downloadRecovery}><Download size={16}/>복구 사본 다운로드</button>}</div>}
        <fieldset className="workspace-content" disabled={storageBlocked && view !== 'settings'}>
        {view === 'dashboard' && <>
          <div className="page-heading"><div><div className="eyebrow">{data.classroom.year}학년도 {data.classroom.semester}학기 · {data.classroom.grade}학년 {data.classroom.room}반</div><h1>선생님, 오늘도 반갑습니다 <span className="greeting-dot"/></h1><p>기록은 차곡차곡, 마무리는 빠짐없이. 우리 반 업무를 확인해 보세요.</p></div><button className="button primary" onClick={() => startObservation()}><Plus size={18}/>관찰 기록 추가</button></div>
          <GettingStarted onRecord={() => startObservation()} onPrepare={() => navigate('workbench')} onBackup={() => navigate('settings')} onClassroom={() => navigate('classroom')} />
          <div className="stats-grid">
            <button className="stat-card" onClick={() => { setFilter('all'); document.getElementById('issues')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span className="stat-top">확인이 필요한 항목 <span className="stat-icon orange"><AlertCircle size={18}/></span></span><span className="stat-value">{issues.length}<small>건</small></span><span className="stat-caption"><span className="orange-text">누락 · 검토 필요</span> 항목을 확인해 주세요</span></button>
            <button className="stat-card" onClick={() => navigate('observations')}><span className="stat-top">쌓인 관찰 기록 <span className="stat-icon blue"><NotebookPen size={18}/></span></span><span className="stat-value">{data.observations.length}<small>개</small></span><span className="stat-caption">우리 반 {data.students.length}명의 배움과 성장</span></button>
            <button className="stat-card" onClick={() => navigate('workbench')}><span className="stat-top">문장 검토 진행 <span className="stat-icon purple"><FileText size={18}/></span></span><span className="stat-value">{reviewed}<small>/ {data.students.length}명</small></span><span className="mini-progress"><i style={{ width: `${data.students.length ? reviewed / data.students.length * 100 : 0}%` }}/></span></button>
            <button className="stat-card" onClick={() => navigate('workbench')}><span className="stat-top">나이스 반영 확인 <span className="stat-icon green"><CircleCheck size={18}/></span></span><span className="stat-value">{confirmed}<small>/ {data.students.length}명</small></span><span className="stat-caption">선생님이 직접 확인한 항목 기준</span></button>
          </div>
          <div className="dashboard-grid"><div className="primary-column">
            <section className="card issue-card" id="issues"><div className="card-heading"><div><h2><span className="heading-dot"/> 먼저 확인해 주세요 <span className="count-label">{issues.length}</span></h2><p>앱에 기록한 자료에서 찾은 점검 항목입니다.</p></div><span className="small-tag">자동 점검</span></div><div className="issue-toolbar"><div className="segmented" role="group" aria-label="점검 필터">{([['all','전체'],['warning','우선 확인'],['info','참고']] as const).map(([id,label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><label className="search-box compact"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="학생 또는 항목 검색" aria-label="점검 항목 검색"/></label></div><div className="issue-list">{shownIssues.slice(0, 5).map(issue => { const s = data.students.find(s => s.id === issue.studentId)!; return <button key={issue.id} className="issue-row" onClick={() => openStudent(s.id)}><span className={`issue-symbol ${issue.severity}`}><AlertCircle size={19}/></span><div className="issue-content"><div><strong>{issue.title}</strong><span className={`issue-label ${issue.severity}`}>{issue.severity === 'warning' ? '확인 필요' : '참고'}</span></div><p>{s.number}번 {s.name} <span>·</span> {issue.detail}</p></div><ChevronRight size={17}/></button>; })}{shownIssues.length === 0 && <div className="empty-state"><CircleCheck size={30}/><strong>표시할 점검 항목이 없습니다.</strong><p>다른 필터나 검색어로 확인해 보세요.</p></div>}</div><div className="card-footer">{shownIssues.length > 5 ? `검색 결과 ${shownIssues.length}건 중 5건 표시` : `${shownIssues.length}건의 점검 항목`}<button className="text-button" onClick={() => navigate('workbench')}>입력 준비에서 전체 점검 <ArrowUpRight size={15}/></button></div></section>
            <section className="card"><div className="card-heading"><div><h2>우리 반 기록 현황</h2><p>학생별 관찰과 문장 준비 상태를 함께 확인하세요.</p></div><button className="text-button" onClick={() => navigate('workbench')}>전체 보기 <ChevronRight size={15}/></button></div><div className="table-scroll"><table><thead><tr><th>학생</th><th>관찰 기록</th><th>문장 상태</th><th className="table-last">점검</th></tr></thead><tbody>{data.students.slice(0,5).map(s => { const d = data.drafts.find(d => d.studentId === s.id); const count = issues.filter(i => i.studentId === s.id).length; return <tr key={s.id}><td><button className="student-name" onClick={() => openStudent(s.id)}><Avatar number={s.number}/><strong>{s.name}</strong><span>{s.number}번</span></button></td><td>{data.observations.filter(o=>o.studentId===s.id).length}<span className="muted">건</span></td><td>{d && <Status value={d.status}/>}</td><td className="table-last"><button className={`table-check ${count ? 'needs-check' : ''}`} onClick={() => openStudent(s.id)}>{count ? `${count}건 확인` : '이상 없음'}<ChevronRight size={14}/></button></td></tr>; })}</tbody></table></div></section>
          </div><aside className="secondary-column">
            <section className="progress-card"><div className="row between"><span className="small-tag light">학기 말 준비</span><ClipboardCheck size={20}/></div><h2>조금씩 준비하면<br/>마감이 가벼워집니다.</h2><div className="progress-ring" style={{ '--progress': `${data.students.length ? confirmed/data.students.length*100 : 0}%` } as React.CSSProperties}><span><strong>{data.students.length ? Math.round(confirmed/data.students.length*100) : 0}<small>%</small></strong><span>반영 확인</span></span></div><div className="progress-summary"><span>남은 학생</span><strong>{data.students.length-confirmed}명</strong></div><button onClick={() => navigate('workbench')}>이어서 준비하기 <ChevronRight size={16}/></button></section>
            <section className="card compact-card"><div className="card-heading"><h2><NotebookPen size={17}/> 한 번 더 살펴볼 학생</h2></div><p className="muted">아직 관찰 기록이 없는 학생이에요.</p><div className="watch-list">{noObservation.map(s => <button key={s.id} onClick={() => { setSelected(s.id); startObservation(); }}><Avatar number={s.number}/><strong>{s.name}</strong><Plus size={16}/></button>)}{data.students.length === 0 ? <div><p className="muted">학생 명부를 먼저 준비해 주세요.</p><button className="text-button" onClick={() => navigate("classroom")}>학급·명부 열기 <ChevronRight size={14}/></button></div> : noObservation.length === 0 && <p className="success-text">모든 학생에게 관찰 기록이 있습니다.</p>}</div></section>
            <section className="calendar-shortcut"><span className="calendar-icon"><CalendarDays size={23}/></span><div><strong>우리 학교 학사일정</strong><p>나이스 공개정보로 확인하세요.</p></div><button className="icon-button" aria-label="학사일정 열기" onClick={() => navigate('school')}><ArrowUpRight size={20}/></button></section>
          </aside></div>
        </>}
        {view === 'observations' && <>
          <div className="page-heading"><div><div className="eyebrow">아이들의 작은 성장 순간</div><h1>관찰 노트</h1><p>직접 본 사실을 짧게 남겨 두세요. 입력 준비에서 근거로 연결할 수 있습니다.</p></div><button className="button primary" onClick={() => startObservation()}><Plus size={18}/>관찰 기록 추가</button></div>
          <div className="card"><div className="observation-toolbar"><label className="search-box"><Search size={18}/><input aria-label="관찰 기록 검색" placeholder="학생 이름, 교과, 기록 내용 검색" value={query} onChange={e => setQuery(e.target.value)}/></label><span className="muted">총 {data.observations.length}개의 기록</span></div><div className="observation-list">{[...data.observations].sort((a,b)=>b.date.localeCompare(a.date)).filter(o => `${data.students.find(s=>s.id===o.studentId)?.name} ${o.category} ${o.content}`.includes(query)).map(o=>{const s=data.students.find(s=>s.id===o.studentId)!; return <article className="observation-row" key={o.id}><Avatar number={s.number}/><div className="observation-body"><div className="observation-meta"><strong>{s.name}</strong><span className="badge neutral">{o.category}</span><time>{o.date.replaceAll('-','.')}</time></div><p>{o.content}</p><span className="evidence-caption">{data.drafts.some(d=>d.evidenceIds.includes(o.id)) ? <><Check size={13}/> 문장 작성 근거로 연결됨</> : '아직 연결하지 않은 관찰 기록'}</span></div><div className="row"><button className="icon-button" aria-label={`${s.name} ${o.date} 관찰 수정`} onClick={()=>setModal(o)}><Pencil size={16}/></button><button className="icon-button" aria-label={`${s.name} ${o.date} 관찰 삭제`} onClick={()=>{if(window.confirm('이 관찰 기록을 삭제할까요? 연결된 문장은 다시 검토해야 합니다.')){try{setData(current=>deleteObservation(current,o.id));notify('관찰 기록을 삭제했습니다.');}catch(error){notify(error instanceof Error?error.message:'삭제하지 못했습니다.');}}}}><Trash2 size={16}/></button></div></article>;})}{data.observations.filter(o => `${data.students.find(s=>s.id===o.studentId)?.name} ${o.category} ${o.content}`.includes(query)).length===0 && <div className="empty-state"><NotebookPen size={32}/><strong>관찰 기록이 없습니다.</strong><p>검색어를 바꾸거나 첫 기록을 추가해 주세요.</p></div>}</div></div>
        </>}
        {view === 'workbench' && <>
          <div className="page-heading"><div><div className="eyebrow">행동특성 및 종합의견 · 작성부터 검토까지</div><h1>문장 작성·검토</h1><p>근거를 확인하고 문장을 정리한 뒤, 나이스에 직접 옮겨 주세요.</p></div><span className="outlined-label"><ShieldCheck size={16}/>나이스 자동 전송 없음</span></div>
          <div className="writing-routes"><span>어떤 문장을 준비하시나요?</span><strong>행동특성·종합의견 작성 중</strong><button className="button secondary" type="button" onClick={() => openTransfer('semester')}>학기말 종합의견 작성</button></div>
          <div className="workbench-layout"><aside className="card student-list"><div className="card-heading"><h2>우리 반 학생 <span className="count-label">{data.students.length}</span></h2></div>{data.students.map(s=>{const d=data.drafts.find(d=>d.studentId===s.id);return <button key={s.id} className={`student-list-item ${selectedStudent?.id===s.id?'selected':''}`} onClick={()=>setSelected(s.id)}><Avatar number={s.number}/><span><strong>{s.name}</strong><small>{d?STATUS[d.status]:'작성 전'}</small></span>{issues.some(i=>i.studentId===s.id)?<span className="attention-dot"/>:<Check size={16}/>}</button>;})}</aside>{!selectedStudent && <div className="card empty-state"><BookOpen size={30}/><h2>학생 명부를 먼저 준비해 주세요.</h2><p>학급·명부에서 번호와 이름을 추가하면 문장을 작성할 수 있습니다.</p><button className="button primary" onClick={() => navigate('classroom')}>학급·명부 열기</button></div>}{selectedStudent && <DraftEditor key={selectedStudent.id} isCurrentWorkspace={isCurrentWorkspace} data={data} studentId={selectedStudent.id} setData={setData} notify={notify} onTransfer={() => openTransfer('behavior', selectedStudent.id)} onAdd={()=>{setSelected(selectedStudent.id);startObservation();}}/>}</div>
        </>}
        {view === 'neis-job' && <NeisJobPanel data={data} onChange={update => { setData(update); return true; }} initialTask={neisTask} initialStudentId={neisStudentId} onReview={id => { setSelected(id); navigate('workbench'); }}/>}
        {view === 'classroom' && <ClassroomPanel key={JSON.stringify(data.classroom)} data={data} onChange={setData} onToast={notify}/>}
        {view === 'school' && <><div className="page-heading"><div><div className="eyebrow">나이스 교육정보 개방 포털</div><h1>학교 · 학사일정</h1><p>학교를 검색해 공개된 학사일정을 확인하세요.</p></div></div><SchoolPanel onToast={notify}/></>}
        {view === 'settings' && <><div className="page-heading"><div><div className="eyebrow">나의 업무 공간 관리</div><h1>설정 및 백업</h1><p>내 기록을 파일로 보관하거나, 로그인한 계정에 직접 저장하세요.</p></div></div><SettingsPanel data={data} onReplace={replaceData} onToast={notify} isCurrentWorkspace={isCurrentWorkspace} readOnly={storageBlocked} onViewObservations={() => navigate('observations')}/></>}
        </fieldset>
        <footer className="app-footer"><div><span>담임노트 <b>·</b> 선생님의 기록에 여유를 더합니다.</span><small>{COPYRIGHT}</small></div><nav className="service-links" aria-label="서비스 안내"><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a></nav><details className="copyright-details"><summary>저작권 안내</summary><p>{COPYRIGHT}<br/>오픈소스 구성요소에는 각 프로젝트의 라이선스가 적용됩니다. 선생님이 직접 작성한 기록은 서비스의 저작권 표기 대상에 포함되지 않습니다.</p></details><span>v0.6.0 · 가상 학급 체험판</span></footer>
      </main>
    </div>
    {toast && <div role="status" className="toast"><CircleCheck size={18}/>{toast}<button aria-label="알림 닫기" onClick={()=>setToast('')}><X size={15}/></button></div>}
    {modal && !storageBlocked && <ObservationDialog data={data} initial={modal === 'new' ? undefined : modal} selectedId={selectedStudent?.id} onClose={()=>setModal(null)} onSave={(o, keepOpen)=>{setData(current=>modal==='new'?addObservation(current,o):editObservation(current,o.id,{date:o.date,category:o.category,content:o.content}));if(!keepOpen)setModal(null);notify(keepOpen ? '저장했습니다. 다음 학생의 기록을 이어서 남겨 주세요.' : '관찰 기록을 저장했습니다.');}}/>}
  </div>;
}

function ObservationDialog({data,initial,selectedId,onClose,onSave}:{data:WorkspaceData;initial?:Observation;selectedId?:string;onClose:()=>void;onSave:(o:Observation,keepOpen?:boolean)=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const [studentId,setStudentId] = useState(initial?.studentId??selectedId??data.students[0]?.id??'');
  const [date,setDate] = useState(()=>initial?.date??localToday());
  const [category,setCategory] = useState(initial?.category??'행동 관찰');
  const [content,setContent] = useState(initial?.content??'');
  const [error,setError] = useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  function save(keepOpen: boolean) {
    try {
      onSave({id:initial?.id??crypto.randomUUID(),studentId,date,category,content:content.trim()},keepOpen);
      if(keepOpen) {
        const index = data.students.findIndex(student=>student.id===studentId);
        setStudentId(data.students[(index+1)%data.students.length]?.id??studentId);
        setContent('');
        setError('');
        contentInput.current?.focus();
      }
    } catch(err) { setError(err instanceof Error?err.message:'기록을 저장하지 못했습니다.'); }
  }
  return <dialog ref={dialog} className="observation-dialog" aria-labelledby="observation-dialog-title" onCancel={onClose}>
    <form onSubmit={event=>{event.preventDefault();const submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;save(submitter?.value==='next');}}>
      <div className="modal-heading"><div><span className="eyebrow">관찰 노트</span><h2 id="observation-dialog-title">{initial?'관찰 기록 수정':'오늘의 순간을 기록하세요'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={22}/></button></div>
      <div className="form-grid"><label className="field">학생<select value={studentId} onChange={event=>setStudentId(event.target.value)} disabled={!!initial}>{data.students.map(student=><option value={student.id} key={student.id}>{student.number}번 {student.name}</option>)}</select></label><label className="field">관찰 날짜<input type="date" required value={date} onChange={event=>setDate(event.target.value)}/></label></div>
      <label className="field">기록 분류<select value={category} onChange={event=>setCategory(event.target.value)}>{Array.from(new Set([...OBSERVATION_CATEGORIES,category])).map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="field">관찰한 내용<textarea ref={contentInput} rows={5} required minLength={2} maxLength={2000} value={content} onChange={event=>setContent(event.target.value)} placeholder="언제, 어떤 활동에서, 무엇을 했는지 한 줄로 남겨 주세요."/></label>
      <p className="input-help">직접 관찰한 행동을 남겨 주세요. 예: 모둠 토의에서 친구의 의견을 정리하고 발표 순서를 제안함.</p><p className="input-help">{content.length}/2,000자{!initial && data.students.length > 1 && ' · 여러 학생을 기록할 때는 ‘저장하고 다음 학생’을 누르세요.'}</p>
      {initial&&<div className="notice">수정하면 연결된 문장의 검토 상태가 ‘작성 중’으로 바뀝니다.</div>}
      {error&&<p role="alert" className="error-text">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>취소</button>{!initial&&data.students.length>1&&<button type="submit" value="next" className="button secondary">저장하고 다음 학생</button>}<button type="submit" value="done" className="button primary"><Check size={17}/>기록 저장</button></div>
    </form>
  </dialog>;
}
function DraftEditor({data,studentId,setData,notify,onAdd,onTransfer,isCurrentWorkspace}:{data:WorkspaceData;studentId:string;setData:SetWorkspace;notify:(s:string)=>void;onAdd:()=>void;onTransfer:()=>void;isCurrentWorkspace:(snapshot:WorkspaceData)=>boolean}){
  const student=data.students.find(s=>s.id===studentId)!;
  const draft=data.drafts.find(d=>d.studentId===studentId);
  const observations=data.observations.filter(o=>o.studentId===studentId);
  const [busy,setBusy]=useState(false);
  const [tab,setTab]=useState<'evidence'|'checks'>('evidence');
  if(!draft) return <div className="card empty-state"><FileText size={30}/><h2>준비된 문장이 없습니다.</h2><button className="button primary" onClick={()=>{try{setData(current=>current.drafts.some(item=>item.studentId===studentId)?current:{...current,drafts:[...current.drafts,{id:crypto.randomUUID(),studentId,content:'',evidenceIds:[],status:'draft',updatedAt:new Date().toISOString()}]});}catch(error){notify(error instanceof Error?error.message:'문장을 만들지 못했습니다.');}}}>새 문장 만들기</button></div>;
  const studentIssues=getIssues(data).filter(i=>i.studentId===studentId);
  const readyToTransfer = (draft.status === 'reviewed' || draft.status === 'copied') && studentIssues.length === 0;
  const validEvidenceIds=draft.evidenceIds.filter(id=>observations.some(observation=>observation.id===id));
  const invalidEvidenceCount=draft.evidenceIds.length-validEvidenceIds.length;
  const mutate=(content:string,evidenceIds:string[])=>{
    if(busy)return false;
    try{
      setData(current=>{
        if(current!==data)throw new Error('자료가 변경되었습니다. 현재 내용을 확인한 뒤 다시 수정해 주세요.');
        return updateDraft(current,draft.id,content,evidenceIds);
      });
      return true;
    }catch(e){notify(e instanceof Error?e.message:'저장하지 못했습니다.');return false;}
  };
  const transition=async(status:Draft['status'])=>{
    if(busy)return;
    setBusy(true);
    try{
      if(status==='copied'){
        if(!navigator.clipboard?.writeText)throw new Error('이 브라우저에서는 클립보드에 접근할 수 없습니다. 문장을 직접 선택해 복사해 주세요.');
        await navigator.clipboard.writeText(draft.content);
      }
      setData(current=>{
        if(current!==data)throw new Error(status==='copied'?'복사하는 동안 자료가 변경되어 상태를 바꾸지 않았습니다. 최신 문장을 확인하고 다시 복사해 주세요.':'자료가 변경되었습니다. 현재 내용을 확인한 뒤 다시 진행해 주세요.');
        return transitionDraft(current,draft.id,status,{clipboardSucceeded:status==='copied'});
      });
      notify(status==='copied'?'문장을 복사했습니다. 나이스에서 학생을 확인한 뒤 붙여넣어 주세요.':status==='confirmed'?'나이스 반영을 직접 확인한 것으로 기록했습니다.':'문장 검토를 완료했습니다.');
    }catch(e){notify(e instanceof Error?e.message:'처리하지 못했습니다.');}finally{setBusy(false);}
  };
  return <div className="editor-column"><section className="card editor-card"><div className="editor-title"><div className="row"><Avatar number={student.number}/><div><h2>{student.name} <span className="muted">{student.number}번</span></h2><p>행동특성 및 종합의견 · 작성 연습</p></div></div><Status value={draft.status}/></div><div className="workflow-steps">{(['draft','reviewed','copied','confirmed'] as const).map((s,i)=><div key={s} className={(['draft','reviewed','copied','confirmed'].indexOf(draft.status)>=i)?'done':''}><span>{i+1}</span>{STATUS[s]}{i<3&&<ChevronRight size={14}/>}</div>)}</div><div className="editor-body">{invalidEvidenceCount>0&&<div className="notice error" id="invalid-evidence"><span>연결한 기록 {invalidEvidenceCount}건을 이 학생의 관찰 기록에서 찾을 수 없습니다. 유효하지 않은 연결을 해제한 뒤 문장을 수정해 주세요.</span><button className="text-button" disabled={busy} onClick={()=>{if(mutate(draft.content,validEvidenceIds))notify('유효하지 않은 근거 연결을 해제했습니다. 관찰 기록을 다시 선택해 주세요.');}}>유효하지 않은 근거 연결 해제</button></div>}<div className="row between"><label htmlFor="draft-content" className="editor-label">나이스에 입력할 문장</label><span className="save-label"><Check size={13}/>변경 내용 자동 저장</span></div><textarea id="draft-content" className="draft-textarea" disabled={busy||invalidEvidenceCount>0} aria-describedby={invalidEvidenceCount>0?'invalid-evidence':undefined} value={draft.content} maxLength={6000} onChange={e=>mutate(e.target.value,draft.evidenceIds)} placeholder="키워드를 적고 AI 생성을 눌러 보세요. 예: 친구 의견 경청, 모둠 협력, 맡은 역할 책임감"/><div className="editor-counter"><span>{Array.from(draft.content).length}자 · UTF-8 {utf8ByteLength(draft.content)}바이트</span><span>실제 나이스 제한은 입력 화면에서 확인</span></div><AiDraftControls data={data} draft={draft} disabled={busy||invalidEvidenceCount>0} isCurrentWorkspace={isCurrentWorkspace} onApply={text=>{const saved=mutate(text,draft.evidenceIds);if(saved)notify('AI 초안을 적용했습니다. 사실과 근거를 확인하고 다시 검토해 주세요.');return saved;}}/><div className="notice subtle"><ShieldCheck size={17}/><span>문장이나 근거를 수정하면 다시 검토해야 합니다. 이 화면은 나이스에 자동으로 전송하지 않습니다.</span></div><div className="editor-actions"><button className="button secondary" disabled={busy||invalidEvidenceCount>0||!draft.content.trim()||!draft.evidenceIds.length||draft.status!=='draft'} onClick={()=>transition('reviewed')}><ClipboardCheck size={17}/>검토 완료</button><button className="button primary" disabled={busy||draft.status==='draft'} onClick={()=>transition('copied')}><Copy size={17}/>문장 복사</button><button className="button confirm-button" disabled={busy||draft.status!=='copied'} onClick={()=>{if(window.confirm(`${student.name} 학생의 나이스 화면에서 저장된 내용을 직접 확인하셨나요?`))void transition('confirmed');}}><CircleCheck size={17}/>나이스 반영 확인</button><button className="button secondary" type="button" aria-label="검토한 문장을 나이스로 옮기기" disabled={busy || !readyToTransfer} onClick={onTransfer}><ArrowUpRight size={17}/>나이스로 옮기기</button></div><p className="input-help">{readyToTransfer ? '검토한 문장을 복사하거나, 옮길 문장 파일로 준비하세요. 나이스 저장은 직접 확인해야 합니다.' : draft.status === 'confirmed' ? '이 문장은 나이스 저장을 직접 확인한 것으로 기록돼 있습니다.' : !draft.content.trim() ? '문장을 작성하고 관찰 근거를 선택하면 검토할 수 있습니다.' : !draft.evidenceIds.length ? '아래에서 이 학생의 관찰 근거를 먼저 선택해 주세요.' : draft.status === 'draft' ? '사실과 근거를 확인하고 검토 완료를 누르면 문장을 옮길 수 있습니다.' : '점검 항목을 해결하면 옮길 문장 파일을 준비할 수 있습니다.'}</p></div></section>
  <section className="card"><div className="editor-tabs"><button className={tab==='evidence'?'active':''} onClick={()=>setTab('evidence')}><NotebookPen size={17}/>관찰 근거 <span>{observations.length}</span></button><button className={tab==='checks'?'active':''} onClick={()=>setTab('checks')}><AlertCircle size={17}/>점검 항목 <span>{studentIssues.length}</span></button></div>{tab==='evidence'?<div className="evidence-panel"><div className="row between"><p className="muted">이 문장의 근거가 되는 기록을 선택해 주세요.</p><button className="text-button" disabled={busy} onClick={onAdd}><Plus size={15}/>기록 추가</button></div>{observations.map(o=><label className={`evidence-item ${draft.evidenceIds.includes(o.id)?'checked':''}`} key={o.id}><input type="checkbox" disabled={busy||invalidEvidenceCount>0} checked={draft.evidenceIds.includes(o.id)} onChange={e=>mutate(draft.content,e.target.checked?[...draft.evidenceIds,o.id]:draft.evidenceIds.filter(id=>id!==o.id))}/><span><span className="observation-meta"><span className="badge neutral">{o.category}</span><time>{o.date.replaceAll('-','.')}</time></span><span className="evidence-text">{o.content}</span></span></label>)}{observations.length===0&&<div className="empty-state"><NotebookPen size={28}/><strong>관찰 기록을 먼저 남겨 주세요.</strong></div>}<button className="button secondary evidence-compose" disabled={busy||invalidEvidenceCount>0||!draft.evidenceIds.length} onClick={()=>{if(draft.content.trim()&&!window.confirm('선택한 관찰 기록으로 현재 문장을 바꿀까요?'))return;if(mutate(observations.filter(o=>draft.evidenceIds.includes(o.id)).map(o=>o.content).join(' '),draft.evidenceIds))notify('선택한 원문을 모았습니다. 선생님의 표현으로 다듬어 주세요.');}}><FileText size={16}/>선택한 관찰 원문 모으기</button><p className="input-help">AI 생성 없이, 선택한 기록을 그대로 모읍니다.</p></div>:<div className="evidence-panel">{studentIssues.map(i=><div className="inline-issue" key={i.id}><AlertCircle size={19}/><div><strong>{i.title}</strong><p>{i.detail}</p></div></div>)}{studentIssues.length===0&&<div className="empty-state"><CircleCheck size={30}/><strong>자동 점검에서 발견한 항목이 없습니다.</strong><p>기재 적합성은 선생님이 최종 확인해 주세요.</p></div>}</div>}</section></div>;
}
