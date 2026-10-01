import { getIssues, type Classroom, type Student } from './domain';
import { JOB_MAX_BYTES, type NeisJobRow } from './neis-job';

export type NeisSemesterContext = { classroom: Classroom; subject: string };
export type NeisSemesterEntry = { content: string; reviewedSnapshot: string | null };
export type NeisSemesterEntries = Record<string, NeisSemesterEntry>;
export type NeisSemesterJob = {
  format: 'damim-neis-job';
  version: 2;
  task: 'semester-subject-opinion';
  subject: string;
  createdAt: string;
  classroom: Classroom;
  rows: NeisJobRow[];
};

const forbiddenContentControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const forbiddenSingleLineControls = /[\u0000-\u001f\u007f]/;

export function normalizeSemesterContext(context: NeisSemesterContext): NeisSemesterContext {
  const c = context.classroom;
  const room = typeof c.room === 'string' ? c.room.normalize('NFC').trim() : '';
  if (!Number.isInteger(c.year) || c.year < 2000 || c.year > 2100 ||
      !Number.isInteger(c.grade) || c.grade < 1 || c.grade > 6 ||
      !room || room.length > 20 || forbiddenSingleLineControls.test(c.room) ||
      ![1, 2].includes(c.semester)) throw new Error('학년도(2000~2100), 학년(1~6), 반(20자 이하), 학기를 확인해 주세요.');
  if (typeof context.subject !== 'string' || forbiddenSingleLineControls.test(context.subject)) throw new Error('교과는 줄바꿈 없이 입력해 주세요.');
  const subject = context.subject.normalize('NFC').trim();
  if (!subject || subject.length > 40) throw new Error('교과를 1~40자로 입력해 주세요.');
  return { classroom: { year: c.year, grade: c.grade, room, semester: c.semester }, subject };
}

function validateRoster(students: Student[]) {
  if (!students.length || students.length > 500 || new Set(students.map(student => student.id)).size !== students.length ||
      new Set(students.map(student => student.number)).size !== students.length ||
      students.some(student => typeof student.id !== 'string' || !student.id.trim() ||
        !Number.isInteger(student.number) || student.number < 1 || student.number > 999 ||
        typeof student.name !== 'string' || !student.name.trim() || student.name.length > 100 || forbiddenSingleLineControls.test(student.name))) {
    throw new Error('명부의 학생 번호(1~999), 이름, 중복과 최대 500명을 확인해 주세요.');
  }
}

export function createSemesterEntries(students: Student[]): NeisSemesterEntries {
  return Object.fromEntries(students.map(student => [student.id, { content: '', reviewedSnapshot: null }]));
}

export function invalidateSemesterReviews(entries: NeisSemesterEntries): NeisSemesterEntries {
  return Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, { content: entry.content, reviewedSnapshot: null }]));
}

export function updateSemesterContent(entries: NeisSemesterEntries, studentId: string, content: string): NeisSemesterEntries {
  return { ...entries, [studentId]: { content, reviewedSnapshot: null } };
}

function reviewSnapshot(students: Student[], context: NeisSemesterContext, studentId: string, content: string) {
  return JSON.stringify({
    context: normalizeSemesterContext(context),
    roster: students.map(student => ({ id: student.id, number: student.number, name: student.name })),
    studentId, content,
  });
}

/** Only manually composed semester text enters this temporary session. */
export function getSemesterCandidates(students: Student[], context: NeisSemesterContext, entries: NeisSemesterEntries) {
  // Reuse the existing empty/duplicate/other-name rules without importing any
  // behavior-opinion drafts, review state or observation-evidence requirements.
  const issues = getIssues({ version: 2, classroom: context.classroom, students, observations: [],
    drafts: students.map(student => ({ id: student.id, studentId: student.id, content: entries[student.id]?.content ?? '',
      evidenceIds: [], status: 'draft' as const, updatedAt: '2000-01-01T00:00:00.000Z' })) });
  let contextError = '';
  try { normalizeSemesterContext(context); validateRoster(students); } catch (error) {
    contextError = error instanceof Error ? error.message : '작업의 교과·학급·명부를 확인해 주세요.';
  }
  return students.map(student => {
    const entry = entries[student.id] ?? { content: '', reviewedSnapshot: null };
    const reasons = issues.filter(issue => issue.studentId === student.id &&
      ['empty-draft', 'duplicate-content', 'other-student-name'].includes(issue.kind)).map(issue => issue.title);
    if (contextError) reasons.push(contextError);
    if (entry.content.length > 6000) reasons.push('문장을 6,000자 이하로 입력해 주세요.');
    if (forbiddenContentControls.test(entry.content)) reasons.push('문장에 지원하지 않는 제어문자가 있습니다.');
    const reviewed = !contextError && entry.reviewedSnapshot !== null &&
      entry.reviewedSnapshot === reviewSnapshot(students, context, student.id, entry.content);
    return { student, entry, reasons: [...new Set(reasons)], reviewed, ready: reviewed && reasons.length === 0 };
  });
}

export function reviewSemesterEntry(students: Student[], context: NeisSemesterContext, entries: NeisSemesterEntries, studentId: string): NeisSemesterEntries {
  const candidate = getSemesterCandidates(students, context, entries).find(item => item.student.id === studentId);
  if (!candidate || candidate.reasons.length) throw new Error('학생의 학기말 문장과 점검 결과를 확인해 주세요.');
  return { ...entries, [studentId]: { content: candidate.entry.content,
    reviewedSnapshot: reviewSnapshot(students, context, studentId, candidate.entry.content) } };
}

export function createNeisSemesterJob(students: Student[], context: NeisSemesterContext, entries: NeisSemesterEntries, studentIds: string[], now = new Date()): NeisSemesterJob {
  const normalized = normalizeSemesterContext(context);
  validateRoster(students);
  if (!studentIds.length || new Set(studentIds).size !== studentIds.length) throw new Error('작업할 학생을 중복 없이 선택해 주세요.');
  const candidates = getSemesterCandidates(students, context, entries);
  const rows = studentIds.map(id => {
    const candidate = candidates.find(item => item.student.id === id);
    if (!candidate?.ready) throw new Error('선택한 학생의 학기말 문장을 다시 검토해 주세요.');
    return { number: candidate.student.number, name: candidate.student.name.normalize('NFC').trim(), content: candidate.entry.content.replace(/\r\n?/g, '\n') };
  }).sort((a, b) => a.number - b.number);
  const job: NeisSemesterJob = { format: 'damim-neis-job', version: 2, task: 'semester-subject-opinion',
    subject: normalized.subject, createdAt: now.toISOString(), classroom: normalized.classroom, rows };
  if (new TextEncoder().encode(JSON.stringify(job, null, 2)).length > JOB_MAX_BYTES) throw new Error('작업 파일이 1MB를 넘습니다. 학생을 나누어 선택해 주세요.');
  return job;
}
