import test from "node:test";
import assert from "node:assert/strict";
import { createDemoWorkspace } from "../src/lib/demo";
import type { WorkspaceData } from "../src/lib/domain";
import { createWorkspaceStart, hasWorkspaceRecords, replaceWorkspaceFromSnapshot } from "../src/lib/workspace-start";

test("an empty start keeps the classroom and creates independent empty records", () => {
  const current = createDemoWorkspace();
  current.classroom = { year: 2027, grade: 6, room: "가상반", semester: 1 };
  const original = structuredClone(current);

  const next = createWorkspaceStart(current, "empty");
  assert.deepEqual(next, { version: 3, classroom: current.classroom, students: [], observations: [], drafts: [] });
  assert.notEqual(next, current);
  assert.notEqual(next.classroom, current.classroom);
  assert.notEqual(next.students, current.students);
  assert.notEqual(next.observations, current.observations);
  assert.notEqual(next.drafts, current.drafts);
  assert.deepEqual(current, original);

  const another = createWorkspaceStart(current, "empty");
  next.classroom.room = "다른가상반";
  next.students.push({ id: "fictional-new-student", number: 1, name: "가상새학생" });
  next.observations.push({ ...current.observations[0] });
  next.drafts.push({ ...current.drafts[0], evidenceIds: [] });
  assert.deepEqual(current, original);
  assert.deepEqual(another, { version: 3, classroom: original.classroom, students: [], observations: [], drafts: [] });
});

test("example starts are fresh demo workspaces independent of current records and one another", () => {
  const current = createDemoWorkspace();
  current.classroom = { year: 2028, grade: 2, room: "가상반", semester: 1 };
  current.students[0].name = "가상변경학생";
  current.observations[0].content = "가상 검증용으로 변경한 관찰 기록.";
  current.drafts[0].content = "가상 검증용으로 변경한 문장.";
  const original = structuredClone(current);
  const expected = createDemoWorkspace();

  const next = createWorkspaceStart(current, "example");
  const another = createWorkspaceStart(current, "example");
  assert.deepEqual(next, expected);
  assert.deepEqual(another, expected);
  assert.notEqual(next, current);
  assert.notEqual(next, another);

  next.classroom.room = "다른가상반";
  next.students[0].name = "가상독립학생";
  next.observations[0].content = "다른 예시의 가상 관찰 기록.";
  next.drafts[0].content = "다른 예시의 가상 문장.";
  next.drafts[0].evidenceIds.push("fictional-new-evidence");
  assert.deepEqual(current, original);
  assert.deepEqual(another, expected);
  assert.deepEqual(createWorkspaceStart(current, "example"), expected);
  assert.deepEqual(createDemoWorkspace(), expected);
});

test("record detection protects any nonempty collection, including standalone observations or drafts", () => {
  const sample = createDemoWorkspace();
  const empty: WorkspaceData = {
    version: 3,
    classroom: { year: 2027, grade: 5, room: "가상반", semester: 1 },
    students: [],
    observations: [],
    drafts: [],
  };
  assert.equal(hasWorkspaceRecords(empty), false);
  assert.equal(hasWorkspaceRecords({ ...empty, students: [sample.students[0]] }), true);
  assert.equal(hasWorkspaceRecords({ ...empty, observations: [sample.observations[0]] }), true);
  assert.equal(hasWorkspaceRecords({ ...empty, drafts: [sample.drafts[0]] }), true);
  assert.equal(hasWorkspaceRecords({ ...empty, semesterPreparation: { classroom: { ...empty.classroom }, subject: "가상교과", entries: {} } }), true);
  assert.equal(hasWorkspaceRecords(sample), true);
});

test("empty starts clear semester preparation only in the explicitly prepared replacement", () => {
  const current = createDemoWorkspace();
  current.semesterPreparation = {
    classroom: { ...current.classroom, grade: 5 }, subject: "가상교과",
    entries: { "student-1": { content: "가상 활동에서 맡은 역할을 마침.", reviewedSnapshot: null } },
  };
  const original = structuredClone(current);
  const next = createWorkspaceStart(current, "empty");
  assert.equal(next.semesterPreparation, undefined);
  assert.deepEqual(current, original);
  assert.equal(hasWorkspaceRecords(current), true);
});

const changedRecordsMessage = "준비하는 동안 현재 기록이 바뀌었습니다. 현재 기록을 보관하고 다시 선택해 주세요.";

test("a newer current workspace refuses a prepared replacement and preserves both workspaces", () => {
  const snapshot = createDemoWorkspace();
  const current: WorkspaceData = { ...snapshot, classroom: { ...snapshot.classroom, room: "가상변경반" } };
  const replacement = createWorkspaceStart(snapshot, "empty");
  const originalSnapshot = structuredClone(snapshot);
  const originalCurrent = structuredClone(current);
  const originalReplacement = structuredClone(replacement);

  assert.throws(() => replaceWorkspaceFromSnapshot(current, snapshot, replacement), { message: changedRecordsMessage });
  assert.deepEqual(snapshot, originalSnapshot);
  assert.deepEqual(current, originalCurrent);
  assert.deepEqual(replacement, originalReplacement);
});

test("an equal-content clone is still a stale workspace snapshot", () => {
  const snapshot = createDemoWorkspace();
  const current = structuredClone(snapshot);
  const replacement = createWorkspaceStart(snapshot, "empty");
  assert.deepEqual(current, snapshot);
  assert.throws(() => replaceWorkspaceFromSnapshot(current, snapshot, replacement), { message: changedRecordsMessage });
  assert.deepEqual(current, snapshot);
  assert.equal(replacement.students.length, 0);
});

test("an unchanged snapshot returns the prepared replacement without changing either input", () => {
  const current = createDemoWorkspace();
  const snapshot = current;
  const replacement = createWorkspaceStart(current, "empty");
  const originalCurrent = structuredClone(current);
  const originalReplacement = structuredClone(replacement);

  assert.equal(replaceWorkspaceFromSnapshot(current, snapshot, replacement), replacement);
  assert.equal(current, snapshot);
  assert.deepEqual(current, originalCurrent);
  assert.deepEqual(replacement, originalReplacement);
});
