import { getIssues, parseWorkspace, type Classroom, type WorkspaceData } from './domain';

export type NeisJobRow = { number: number; name: string; content: string };
export type NeisJob = { format: 'damim-neis-job'; version: 1; task: 'behavior-opinion'; createdAt: string; classroom: Classroom; rows: NeisJobRow[] };
export const JOB_MAX_BYTES = 1_000_000;

/** A transfer file is a reviewed snapshot, never evidence of a NEIS write. */
export function getNeisCandidates(data: WorkspaceData) {
  const issues = getIssues(data);
  return data.students.map(student => {
    const drafts = data.drafts.filter(draft => draft.studentId === student.id);
    const draft = drafts[0];
    const reasons: string[] = [];
    if (/[\u0000-\u001f]/.test(student.name)) reasons.push('학생 이름에 줄바꿈이나 제어문자가 있습니다.');
    if (drafts.length !== 1) reasons.push(drafts.length ? '문장이 여러 개여서 입력 대상을 정할 수 없습니다.' : '작성한 문장이 없습니다.');
    if (draft?.status === 'draft') reasons.push('문장 검토가 필요합니다.');
    if (draft?.status === 'confirmed') reasons.push('이미 반영 확인한 문장입니다.');
    if (draft && draft.content.length > 6000) reasons.push('도우미는 6,000자 이하의 문장을 지원합니다.');
    if (draft && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(draft.content)) reasons.push('문장에 지원하지 않는 제어문자가 있습니다.');
    for (const issue of issues.filter(item => item.studentId === student.id)) reasons.push(issue.title);
    return { student, draft, reasons: [...new Set(reasons)], ready: reasons.length === 0 && !!draft };
  });
}

export function createNeisJob(data: WorkspaceData, studentIds: string[], now = new Date()): NeisJob {
  if (!parseWorkspace(data)) throw new Error('기록 형식을 확인해 주세요.');
  if (!studentIds.length || new Set(studentIds).size !== studentIds.length) throw new Error('작업할 학생을 중복 없이 선택해 주세요.');
  const candidates = getNeisCandidates(data);
  const rows = studentIds.map(id => {
    const candidate = candidates.find(item => item.student.id === id);
    if (!candidate?.ready || !candidate.draft) throw new Error('선택한 학생의 문장과 점검 결과를 다시 확인해 주세요.');
    return { number: candidate.student.number, name: candidate.student.name, content: candidate.draft.content };
  }).sort((a, b) => a.number - b.number);
  const job: NeisJob = { format: 'damim-neis-job', version: 1, task: 'behavior-opinion', createdAt: now.toISOString(), classroom: { ...data.classroom }, rows };
  if (new TextEncoder().encode(JSON.stringify(job, null, 2)).length > JOB_MAX_BYTES) throw new Error('작업 파일이 1MB를 넘습니다. 학생을 나누어 선택해 주세요.');
  return job;
}
