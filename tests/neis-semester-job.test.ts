import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createDemoWorkspace } from '../src/lib/demo';
import { addStudents, editStudent, parseWorkspace, removeStudent, type Student, type WorkspaceData } from '../src/lib/domain';
import { serializeJsonBackup } from '../src/lib/json-backup';
import { readWorkspace, saveWorkspace, workspaceStorageKey, WorkspaceConflict } from '../src/lib/workspace-storage';
import {
  createNeisSemesterJob, createSemesterEntries, getSemesterCandidates, invalidateSemesterReviews,
  getSemesterPreparation, getSemesterTaskError, normalizeSemesterContext, reviewSemesterEntry, reviewSemesterWorkspaceEntry,
  updateSemesterContent, updateSemesterWorkspaceContent, updateSemesterWorkspaceContext, type NeisSemesterContext,
} from '../src/lib/neis-semester-job';

const require = createRequire(import.meta.url);
const core = require('../extension/neis-helper/core.js');
const clock = new Date('2026-09-30T01:00:00.000Z');
const context = (): NeisSemesterContext => ({ classroom: { ...createDemoWorkspace().classroom }, subject: '가상교과' });

test('semester export starts empty and requires its own manually reviewed text', () => {
  const data = createDemoWorkspace();
  const before = structuredClone(data);
  const initial = createSemesterEntries(data.students);
  assert.ok(Object.values(initial).every(entry => entry.content === '' && entry.reviewedSnapshot === null));
  assert.equal(getSemesterCandidates(data.students, context(), initial).filter(item => item.ready).length, 0);
  assert.throws(() => createNeisSemesterJob(data.students, context(), initial, ['student-7'], clock));
  let entries = updateSemesterContent(initial, 'student-7', '가상 교과 활동에 꾸준히 참여하고 과제를 성실히 마침.');
  assert.throws(() => createNeisSemesterJob(data.students, context(), entries, ['student-7'], clock));
  entries = reviewSemesterEntry(data.students, context(), entries, 'student-7');
  const exported = createNeisSemesterJob(data.students, context(), entries, ['student-7'], clock);
  assert.deepEqual(exported, {
    format: 'damim-neis-job', version: 2, task: 'semester-subject-opinion', subject: '가상교과',
    createdAt: clock.toISOString(), classroom: data.classroom,
    rows: [{ number: 7, name: data.students.find(student => student.id === 'student-7')!.name,
      content: '가상 교과 활동에 꾸준히 참여하고 과제를 성실히 마침.' }],
  });
  assert.deepEqual(core.parseJob(JSON.stringify(exported), clock.getTime()), exported);
  assert.deepEqual(data, before);
});

test('semester unreviewed drafts and unfinished context survive complete JSON backup without changing legacy workspaces', () => {
  const initial = createDemoWorkspace();
  let data = updateSemesterWorkspaceContent(initial, 'student-7', '아직 검토하지 않은 가상 체육 의견.');
  data = updateSemesterWorkspaceContext(data, { classroom: { ...data.classroom, year: 0, room: '' }, subject: '' });
  const restored = parseWorkspace(JSON.parse(serializeJsonBackup(data)))!;
  assert.deepEqual(restored, data);
  assert.equal(restored.semesterPreparation!.entries['student-7'].reviewedSnapshot, null);
  assert.equal(getSemesterPreparation(restored).classroom.year, 0);
  assert.equal(getSemesterCandidates(restored.students, getSemesterPreparation(restored), getSemesterPreparation(restored).entries)[6].ready, false);
  assert.deepEqual(restored.drafts, initial.drafts);
  assert.ok(!Object.hasOwn(parseWorkspace(initial)!, 'semesterPreparation'));
  const legacy = { version: 1, students: initial.students, observations: initial.observations, drafts: initial.drafts };
  assert.ok(parseWorkspace(legacy));
  assert.ok(!Object.hasOwn(parseWorkspace(legacy)!, 'semesterPreparation'));
});

test('semester parser bounds and whitelists optional saved fields and refuses broken references', () => {
  const data = updateSemesterWorkspaceContent(createDemoWorkspace(), 'student-7', '가상 의견 초안.');
  const task = data.semesterPreparation!;
  for (const changed of [null, { ...task, entries: [] }, { ...task, subject: 'a'.repeat(41) },
    { ...task, classroom: { ...task.classroom, year: null } },
    { ...task, entries: { absent: { content: '가상 의견', reviewedSnapshot: null } } },
    { ...task, entries: { 'student-7': { content: 'a'.repeat(6001), reviewedSnapshot: null } } },
    { ...task, entries: { 'student-7': { content: '가상 의견', reviewedSnapshot: true } } },
  ]) assert.equal(parseWorkspace({ ...data, semesterPreparation: changed }), null);
  const parsed = parseWorkspace({ ...data, semesterPreparation: { ...task, secret: 'synthetic-discarded',
    classroom: { ...task.classroom, secret: 'synthetic-discarded' },
    entries: { 'student-7': { ...task.entries['student-7'], secret: 'synthetic-discarded' } } } })!;
  assert.deepEqual(Object.keys(parsed.semesterPreparation!).sort(), ['classroom', 'entries', 'subject']);
  assert.deepEqual(Object.keys(parsed.semesterPreparation!.entries['student-7']).sort(), ['content', 'reviewedSnapshot']);
  parsed.semesterPreparation!.entries['student-7'].content = '변경한 가상 의견';
  assert.equal(task.entries['student-7'].content, '가상 의견 초안.');
});

function savedReviewedSemester(): WorkspaceData {
  let data = updateSemesterWorkspaceContext(createDemoWorkspace(), context());
  data = updateSemesterWorkspaceContent(data, 'student-7', '가상 체육에서 규칙을 지키며 활동함.');
  return reviewSemesterWorkspaceEntry(data, 'student-7', true);
}

test('saved semester review survives restoration but only reviewed selected students enter a job', () => {
  const reviewed = savedReviewedSemester();
  const data = updateSemesterWorkspaceContent(reviewed, 'student-2', '작성 중인 다른 가상 의견.');
  const restored = parseWorkspace(JSON.parse(serializeJsonBackup(data)))!;
  const task = getSemesterPreparation(restored);
  assert.equal(getSemesterCandidates(restored.students, task, task.entries)[6].ready, true);
  assert.equal(getSemesterCandidates(restored.students, task, task.entries)[1].ready, false);
  assert.throws(() => createNeisSemesterJob(restored.students, task, task.entries, ['student-2'], clock));
  const exported = createNeisSemesterJob(restored.students, task, task.entries, ['student-7'], clock);
  assert.equal(exported.rows.length, 1);
  assert.equal(exported.rows[0].number, 7);
  assert.ok(!Object.hasOwn(exported, 'semesterPreparation'));
  const changed = updateSemesterWorkspaceContext(restored, { ...task, subject: '다른 가상교과' });
  const reverted = updateSemesterWorkspaceContext(changed, task);
  assert.equal(getSemesterCandidates(reverted.students, getSemesterPreparation(reverted), getSemesterPreparation(reverted).entries)[6].reviewed, false);
  assert.equal(updateSemesterWorkspaceContent(restored, 'student-7', '수정한 가상 의견.').semesterPreparation!.entries['student-7'].reviewedSnapshot, null);
});

test('roster additions, student number or name edits and removals invalidate persisted semester reviews', () => {
  const original = savedReviewedSemester();
  for (const changed of [editStudent(original, 'student-2', 9, original.students[1].name),
    editStudent(original, 'student-2', 2, '새가상학생'),
    addStudents(original, [{ id: 'fake-new', number: 9, name: '추가가상학생' }]),
  ]) {
    assert.equal(changed.semesterPreparation!.entries['student-7'].reviewedSnapshot, null);
    assert.equal(changed.semesterPreparation!.entries['student-7'].content, original.semesterPreparation!.entries['student-7'].content);
    assert.ok(parseWorkspace(changed));
  }
  let removable = addStudents(original, [{ id: 'fake-new', number: 9, name: '추가가상학생' }]);
  removable = updateSemesterWorkspaceContent(removable, 'fake-new', '삭제 대상의 가상 초안.');
  assert.throws(() => removeStudent(removable, 'fake-new'), /학기말 초안/);
  removable = updateSemesterWorkspaceContent(removable, 'fake-new', '');
  const removed = removeStudent(removable, 'fake-new');
  assert.ok(!Object.hasOwn(removed.semesterPreparation!.entries, 'fake-new'));
  assert.ok(parseWorkspace(removed));
});

test('semester drafts use account storage separation and do not bypass conflicts or corrupted-data recovery', () => {
  const map = new Map<string, string>();
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
  const data = savedReviewedSemester();
  const ownerKey = workspaceStorageKey('synthetic-owner');
  const raw = saveWorkspace(storage, ownerKey, null, data);
  assert.deepEqual(readWorkspace(storage, 'synthetic-owner').data, data);
  assert.ok(!readWorkspace(storage, 'synthetic-other').data.semesterPreparation);
  assert.ok(!readWorkspace(storage, null).data.semesterPreparation);
  map.set(ownerKey, `${raw} `);
  assert.throws(() => saveWorkspace(storage, ownerKey, raw, updateSemesterWorkspaceContent(data, 'student-7', '지연된 가상 변경.')), WorkspaceConflict);
  assert.equal(map.get(ownerKey), `${raw} `);
  const broken = JSON.stringify({ ...data, semesterPreparation: { ...data.semesterPreparation, entries: null } });
  map.set(ownerKey, broken);
  assert.equal(readWorkspace(storage, 'synthetic-owner').recoveryRaw, broken);
});

test('whole-task context errors are separate from student-specific issues', () => {
  const data = createDemoWorkspace();
  const task = getSemesterPreparation(data);
  const issue = getSemesterTaskError(data.students, task);
  assert.match(issue, /교과/);
  const candidates = getSemesterCandidates(data.students, task, task.entries);
  assert.ok(candidates.every(candidate => candidate.contextError === issue && !candidate.ready));
  assert.ok(candidates.every(candidate => !candidate.reasons.includes(issue)));
  assert.throws(() => reviewSemesterEntry(data.students, task, task.entries, 'student-7'));
});

test('saved partial semester entries cannot inherit a student entry from object prototype keys', () => {
  const data: WorkspaceData = { version: 3, classroom: { ...context().classroom },
    students: [{ id: '__proto__', number: 1, name: '가상학생' }], observations: [], drafts: [],
    semesterPreparation: { ...context(), entries: {} } };
  const restored = parseWorkspace(JSON.parse(serializeJsonBackup(data)))!;
  const task = getSemesterPreparation(restored);
  assert.equal(getSemesterCandidates(restored.students, task, task.entries)[0].entry.content, '');
  assert.equal(getSemesterCandidates(restored.students, task, task.entries)[0].ready, false);
  assert.equal(removeStudent(restored, '__proto__').students.length, 0);
  const changed = updateSemesterWorkspaceContent(restored, '__proto__', '가상 의견을 작성함.');
  assert.ok(Object.hasOwn(changed.semesterPreparation!.entries, '__proto__'));
  assert.equal(changed.semesterPreparation!.entries['__proto__'].content, '가상 의견을 작성함.');
});

test('semester review becomes invalid after text, context, subject or roster edits', () => {
  const students = createDemoWorkspace().students;
  let entries = updateSemesterContent(createSemesterEntries(students), 'student-1', '가상 수업에서 차분하게 과제를 완성함.');
  entries = reviewSemesterEntry(students, context(), entries, 'student-1');
  assert.equal(getSemesterCandidates(students, context(), entries)[0].ready, true);
  const changedText = updateSemesterContent(entries, 'student-1', '가상 수업에서 과제의 해결 방법을 설명함.');
  assert.throws(() => createNeisSemesterJob(students, context(), changedText, ['student-1'], clock));
  for (const changed of [
    { ...context(), subject: '다른 가상교과' },
    { ...context(), classroom: { ...context().classroom, year: 2027 } },
    { ...context(), classroom: { ...context().classroom, grade: 3 } },
    { ...context(), classroom: { ...context().classroom, room: '3' } },
    { ...context(), classroom: { ...context().classroom, semester: 1 as const } },
  ]) assert.throws(() => createNeisSemesterJob(students, changed, entries, ['student-1'], clock));
  const changedRoster = students.map(student => student.id === 'student-2' ? { ...student, name: '새가상학생' } : student);
  assert.throws(() => createNeisSemesterJob(changedRoster, context(), entries, ['student-1'], clock));
  assert.throws(() => createNeisSemesterJob(students, context(), invalidateSemesterReviews(entries), ['student-1'], clock));
  const reverted = updateSemesterContent(changedText, 'student-1', entries['student-1'].content);
  assert.equal(getSemesterCandidates(students, context(), reverted)[0].reviewed, false);
});

test('semester text reuses empty, duplicate and other-student-name checks independently of evidence', () => {
  const students = createDemoWorkspace().students;
  let entries = createSemesterEntries(students);
  assert.throws(() => reviewSemesterEntry(students, context(), entries, 'student-1'));
  entries = updateSemesterContent(entries, 'student-1', '  스스로 과제를 완성함.  ');
  entries = updateSemesterContent(entries, 'student-2', '스스로\n과제를 완성함.');
  const duplicate = getSemesterCandidates(students, context(), entries);
  assert.ok(duplicate[0].reasons.includes('다른 학생과 같은 문장이 있어요'));
  assert.ok(duplicate[1].reasons.includes('다른 학생과 같은 문장이 있어요'));
  assert.throws(() => reviewSemesterEntry(students, context(), entries, 'student-1'));
  entries = updateSemesterContent(entries, 'student-2', '가상 발표에서 자신의 생각을 설명함.');
  entries = reviewSemesterEntry(students, context(), entries, 'student-1');
  assert.equal(getSemesterCandidates(students, context(), entries)[0].ready, true);
  entries = updateSemesterContent(entries, 'student-1', `${students[1].name} 학생과 활동함.`);
  assert.ok(getSemesterCandidates(students, context(), entries)[0].reasons.includes('다른 학생 이름이 포함되어 있어요'));
  assert.throws(() => reviewSemesterEntry(students, context(), entries, 'student-1'));
});

test('semester context validates bounds and normalizes its single-line subject and room', () => {
  const normalized = normalizeSemesterContext({ classroom: { ...context().classroom, room: '  가상반  ' }, subject: '  가상교과  ' });
  assert.equal(normalized.subject, '가상교과');
  assert.equal(normalized.classroom.room, '가상반');
  for (const invalid of ['', 'a'.repeat(41), '교과\n명', '교과\t명', '교과\u007f명']) {
    assert.throws(() => normalizeSemesterContext({ ...context(), subject: invalid }));
  }
  for (const classroom of [
    { ...context().classroom, year: 1999 }, { ...context().classroom, year: 2101 },
    { ...context().classroom, grade: 0 }, { ...context().classroom, grade: 7 },
    { ...context().classroom, room: '' }, { ...context().classroom, room: 'a'.repeat(21) },
    { ...context().classroom, room: '가상\n반' }, { ...context().classroom, room: '가상\u007f반' },
    { ...context().classroom, semester: 3 },
  ]) assert.throws(() => normalizeSemesterContext({ subject: '가상교과', classroom: classroom as NeisSemesterContext['classroom'] }));
});

test('semester export rejects invalid selection, names, text controls and oversized files', () => {
  const students = createDemoWorkspace().students;
  let entries = updateSemesterContent(createSemesterEntries(students), 'student-1', '가상 수업의 과제를 마침.');
  entries = reviewSemesterEntry(students, context(), entries, 'student-1');
  for (const selection of [[], ['missing'], ['student-1', 'student-1'], ['student-2']]) {
    assert.throws(() => createNeisSemesterJob(students, context(), entries, selection, clock));
  }
  for (const content of ['가'.repeat(6001), '가상\u0001문장', '가상\u007f문장']) {
    assert.throws(() => reviewSemesterEntry(students, context(), updateSemesterContent(entries, 'student-1', content), 'student-1'));
  }
  const badName = students.map(student => student.id === 'student-1' ? { ...student, name: '가상\n학생' } : student);
  assert.throws(() => createNeisSemesterJob(badName, context(), entries, ['student-1'], clock));
  const tooMany: Student[] = Array.from({ length: 501 }, (_, index) => ({ id: `fake-${index}`, number: index + 1, name: `가상학생${index + 1}` }));
  assert.throws(() => createNeisSemesterJob(tooMany, context(), createSemesterEntries(tooMany), [tooMany[0].id], clock));
  const duplicateNumber = students.map(student => student.id === 'student-2' ? { ...student, number: 1 } : student);
  assert.throws(() => createNeisSemesterJob(duplicateNumber, context(), entries, ['student-1'], clock));
  const largeRoster: Student[] = Array.from({ length: 80 }, (_, index) => ({ id: `fake-${index}`, number: index + 1, name: `가상학생${index + 1}` }));
  let largeEntries = createSemesterEntries(largeRoster);
  for (const student of largeRoster) largeEntries = updateSemesterContent(largeEntries, student.id, '가'.repeat(5900) + student.number);
  for (const student of largeRoster) largeEntries = reviewSemesterEntry(largeRoster, context(), largeEntries, student.id);
  assert.throws(() => createNeisSemesterJob(largeRoster, context(), largeEntries, largeRoster.map(student => student.id), clock), /1MB/);
});

test('semester rows are sorted and line endings are normalized without changing review state', () => {
  const students = createDemoWorkspace().students;
  let entries = updateSemesterContent(createSemesterEntries(students), 'student-2', '첫 가상 활동을 마침.\r\n자신의 방법을 설명함.');
  entries = updateSemesterContent(entries, 'student-1', '두 번째 가상 활동에서 다양한 방법을 시도함.');
  for (const id of ['student-2', 'student-1']) entries = reviewSemesterEntry(students, context(), entries, id);
  const before = structuredClone(entries);
  const job = createNeisSemesterJob(students, context(), entries, ['student-2', 'student-1'], clock);
  assert.deepEqual(job.rows.map(row => row.number), [1, 2]);
  assert.equal(job.rows[1].content, '첫 가상 활동을 마침.\n자신의 방법을 설명함.');
  assert.deepEqual(entries, before);
  assert.deepEqual(core.parseJob(JSON.stringify(job), clock.getTime()), job);
});

test('semester parser rejects version/task mismatches and invalid subjects and drops unknown data', () => {
  const students = createDemoWorkspace().students;
  let entries = updateSemesterContent(createSemesterEntries(students), 'student-1', '가상 교과에서 문제 해결 방법을 설명함.');
  entries = reviewSemesterEntry(students, context(), entries, 'student-1');
  const job = createNeisSemesterJob(students, context(), entries, ['student-1'], clock);
  for (const changed of [
    { ...job, version: 1 }, { ...job, task: 'behavior-opinion' }, { ...job, task: 'attendance' },
    { ...job, subject: undefined }, { ...job, subject: '' }, { ...job, subject: 'a'.repeat(41) },
    { ...job, subject: '가상\n교과' }, { ...job, subject: '가상\t교과' }, { ...job, subject: '가상\u007f교과' },
    { ...job, classroom: { ...job.classroom, room: '가상\u007f반' } },
    { ...job, rows: [{ ...job.rows[0], name: '가상\u007f학생' }] },
    { ...job, rows: [{ ...job.rows[0], content: '가상\u007f문장' }] },
  ]) assert.throws(() => core.parseJob(JSON.stringify(changed), clock.getTime()));
  const withUnknownFields = { ...job, secret: 'synthetic-discarded-value',
    classroom: { ...job.classroom, secret: 'synthetic-discarded-context' },
    rows: job.rows.map(row => ({ ...row, secret: 'synthetic-discarded-row' })) };
  assert.deepEqual(core.parseJob(JSON.stringify(withUnknownFields), clock.getTime()), job);
  assert.equal(core.parseJob(JSON.stringify({ ...job, subject: '  가상교과  ' }), clock.getTime()).subject, '가상교과');
});
