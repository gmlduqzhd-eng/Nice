import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createDemoWorkspace } from '../src/lib/demo';
import type { Student } from '../src/lib/domain';
import {
  createNeisSemesterJob, createSemesterEntries, getSemesterCandidates, invalidateSemesterReviews,
  normalizeSemesterContext, reviewSemesterEntry, updateSemesterContent, type NeisSemesterContext,
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
