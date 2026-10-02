'use client';

import { useMemo, useState } from 'react';
import { Download, ExternalLink, ListChecks } from 'lucide-react';
import { createNeisJob, getNeisCandidates } from '@/lib/neis-job';
import type { WorkspaceData } from '@/lib/domain';
import NeisSemesterJobPanel from './neis-semester-job-panel';

export default function NeisJobPanel({ data, onChange, onReview, initialTask = 'behavior', initialStudentId }: {
  data: WorkspaceData;
  onChange: (update: WorkspaceData | ((current: WorkspaceData) => WorkspaceData)) => boolean;
  onReview: (id: string) => void;
  initialTask?: 'behavior' | 'semester';
  initialStudentId?: string;
}) {
  const [task, setTask] = useState<'behavior' | 'semester'>(initialTask);
  const candidates = useMemo(() => getNeisCandidates(data), [data]);
  const [selected, setSelected] = useState<string[]>(() => initialStudentId && candidates.some(item => item.student.id === initialStudentId && item.ready) ? [initialStudentId] : []);
  const [message, setMessage] = useState('');
  const ready = candidates.filter(item => item.ready);
  // Recompute against current records: edits must not leave stale eligible selections.
  const eligibleSelection = selected.filter(id => ready.some(item => item.student.id === id));
  function download() {
    try {
      const job = createNeisJob(data, eligibleSelection);
      const url = URL.createObjectURL(new Blob([JSON.stringify(job, null, 2)], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `담임노트_나이스작업_${job.classroom.year}_${job.rows.length}명.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${job.rows.length}명의 작업 파일을 내려받았습니다. 나이스 입력·저장 상태는 바뀌지 않았습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '작업 파일을 만들지 못했습니다.'); }
  }
  return <div className="stack">
    <div className="segmented" role="group" aria-label="나이스 작업 종류">
      <button type="button" className={task === 'behavior' ? 'selected' : ''} aria-pressed={task === 'behavior'} onClick={() => setTask('behavior')}>행동특성·종합의견</button>
      <button type="button" className={task === 'semester' ? 'selected' : ''} aria-pressed={task === 'semester'} onClick={() => setTask('semester')}>학기말 종합의견</button>
    </div>
    <div hidden={task !== 'behavior'}><div className="stack">
    <div className="page-heading"><div><div className="eyebrow">검토한 문장 · 입력 보조</div><h1>나이스로 옮기기</h1><p>검토한 문장을 모아, 화면의 학급·학생과 대조한 뒤 입력합니다.</p></div></div>
    <div className="notice notice-block"><strong>현재는 가상 자료로 검증하는 개발 버전입니다.</strong><p>실제 나이스 화면 호환성은 아직 검증하지 않았습니다. 화면 입력과 나이스 저장은 별개이며, 확장프로그램은 저장 버튼을 누르지 않습니다. 실제 학생 자료는 입력하지 마세요.</p></div>
    <section className="card classroom-card stack"><h2>1. 작업할 문장 선택</h2><p className="muted">검토 완료 또는 복사됨 상태이고 점검 문제가 없는 학생만 선택할 수 있습니다. 내려받은 후 문장·근거·학급을 수정했다면 새 작업 파일을 만드세요.</p>
      <div className="row between"><span className="badge"><ListChecks size={14}/>준비된 학생 {ready.length}명 / 전체 {candidates.length}명</span><button className="button secondary" disabled={!ready.length} onClick={() => setSelected(ready.map(item => item.student.id))}>준비된 학생 모두 선택</button></div>
      <div className="table-scroll"><table className="roster-table"><thead><tr><th>선택</th><th>학생</th><th>입력 준비</th><th>확인</th></tr></thead><tbody>{candidates.map(({ student, draft, ready: canSelect, reasons }) => <tr key={student.id}>
        <td><input type="checkbox" aria-label={`${student.number}번 ${student.name} 작업 선택`} disabled={!canSelect} checked={canSelect && eligibleSelection.includes(student.id)} onChange={event => setSelected(current => event.target.checked ? [...current.filter(id => id !== student.id), student.id] : current.filter(id => id !== student.id))}/></td>
        <td>{student.number}번 {student.name}</td><td>{canSelect ? `준비됨 · ${Array.from(draft!.content).length}자` : reasons.join(' / ')}</td>
        <td><button className="text-button" onClick={() => onReview(student.id)} aria-label={`${student.name} 문장 확인`}>문장 확인</button></td>
      </tr>)}</tbody></table></div>
      <div><button className="button primary" disabled={!eligibleSelection.length} onClick={download}><Download size={16}/>선택한 {eligibleSelection.length}명 작업 파일</button></div>
      {message && <p role="status" className="notice">{message}</p>}
    </section>
    <section className="card classroom-card stack"><h2>2. 입력 도우미 설치와 연습</h2><p>PC의 Chrome 또는 Edge에서 확장프로그램을 설치하세요. 웹앱 배포만으로 브라우저에 자동 설치되지는 않습니다.</p>
      <div className="row"><a className="button secondary" href="/downloads/damim-neis-helper.zip" download><Download size={16}/>확장프로그램 받기</a><a className="button secondary" href="/neis-practice" target="_blank" rel="noreferrer"><ExternalLink size={16}/>가상 화면에서 연습</a></div>
      <ol className="helper-steps"><li>압축을 푼 뒤 Chrome의 확장 프로그램 관리 또는 Edge의 확장 관리를 엽니다.</li><li>개발자 모드를 켜고 ‘압축해제된 확장 프로그램을 로드합니다’를 눌러 manifest.json이 있는 폴더를 선택합니다.</li><li>연습 화면에서 확장프로그램 아이콘을 누르고 작업 JSON 파일을 엽니다.</li><li>학년도·학년·반·학기·학생 번호·이름과 문장 입력칸을 지정하고 ‘화면 대조’ 후 ‘대조한 빈칸에 입력’을 누릅니다.</li></ol>
      <p className="muted">도우미는 파일을 외부 서버로 보내지 않습니다. 일반 텍스트 입력칸만 지원하며 iframe·캔버스·전용 편집기는 중단합니다. 나이스에서 발생하는 자동 저장 여부는 실제 화면별 검증이 필요합니다.</p>
    </section>
    <section className="card classroom-card stack"><h2>3. 실제 나이스 화면 연결 점검</h2><p>작업 파일을 열기 전에 화면 연결부터 점검할 수 있습니다. 연결 점검은 문장을 입력하거나 저장하지 않습니다.</p>
      <ol className="helper-steps"><li>직접 나이스에 로그인하고 ‘학급담임 → 학생생활 → 행동특성및종합의견’의 학생별 입력 화면을 엽니다.</li><li>확장프로그램 아이콘을 누른 뒤 ‘화면 연결 점검’으로 화면 구조를 확인합니다.</li><li>‘입력칸 선택해 점검’을 누르고 행동특성 및 종합의견 입력칸을 클릭합니다. 선택하기 어려운 전용 편집기는 추가 확인이 필요합니다.</li><li>‘연결 점검 파일 받기’로 결과를 보관합니다. 학생 이름·번호·문장과 화면 주소는 포함하지 않습니다.</li></ol>
      <p className="muted">‘일반 입력칸 후보’는 화면 구조의 점검 결과입니다. 실제 나이스 입력·저장 호환성 확인은 별도로 진행합니다. 인증서와 비밀번호는 직접 사용하며 공유하지 마세요.</p>
    </section>
    </div></div>
    <div hidden={task !== 'semester'}><NeisSemesterJobPanel data={data} onChange={onChange}/></div>
  </div>;
}
