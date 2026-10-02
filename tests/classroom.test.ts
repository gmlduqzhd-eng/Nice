import test from "node:test";
import assert from "node:assert/strict";
import { createDemoWorkspace } from "../src/lib/demo";
import { addStudents, editStudent, removeStudent, parseWorkspace, updateClassroom } from "../src/lib/domain";
import { exportRoster, parseRoster } from "../src/lib/roster";
import { LEGACY_STORAGE_KEY, readWorkspace, saveWorkspace, workspaceStorageKey, WorkspaceConflict } from "../src/lib/workspace-storage";

test("v1 backups migrate without changing students, evidence, text or review state", () => {
  const data = createDemoWorkspace();
  const { classroom: _classroom, ...old } = data;
  const legacy = { ...old, version: 1 };
  const parsed = parseWorkspace(legacy)!;
  assert.equal(parsed.version, 3);
  assert.deepEqual(parsed.students, data.students);
  assert.deepEqual(parsed.observations, data.observations);
  assert.deepEqual(parsed.drafts, data.drafts);
  assert.equal(legacy.version, 1);
  assert.equal(parseWorkspace({ ...data, classroom: null }), null);
});

test("v2 backups migrate to v3 without losing classroom, records or optional semester drafts", () => {
  const data = createDemoWorkspace();
  data.classroom = { year: 2027, grade: 5, room: "가상반", semester: 1 };
  data.semesterPreparation = { classroom: { ...data.classroom }, subject: "체육",
    entries: { "student-7": { content: "검토 전 가상 체육 의견.", reviewedSnapshot: null } } };
  const legacy = { ...data, version: 2 };
  const original = structuredClone(legacy);
  const migrated = parseWorkspace(legacy)!;
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated, data);
  assert.deepEqual(legacy, original);
});

test("class changes round-trip with validation and leave existing records unchanged", () => {
  const data = createDemoWorkspace();
  const next = updateClassroom(data, { year: 2027, grade: 6, room: " 3 ", semester: 1 });
  assert.equal(parseWorkspace(JSON.parse(JSON.stringify(next)))?.classroom.room, "3");
  assert.deepEqual(next.observations, data.observations);
  assert.throws(() => updateClassroom(data, { year: 2027, grade: 7, room: "3", semester: 1 }));
});

test("roster edits preserve IDs and evidence, reject collisions, and invalidate name-sensitive review", () => {
  const data = createDemoWorkspace();
  const added = addStudents(data, [{ id: "new-student", number: 9, name: "가상아홉" }]);
  assert.deepEqual(added.observations, data.observations);
  assert.throws(() => addStudents(data, [{ id: "new-student", number: 1, name: "가상아홉" }]));
  assert.throws(() => editStudent(data, "student-1", 2, "가상아홉"));
  const edited = editStudent(data, "student-1", 9, "가상아홉");
  assert.equal(edited.students.find(student => student.number === 9)?.id, "student-1");
  assert.deepEqual(edited.observations, data.observations);
  assert.equal(edited.drafts[0].content, data.drafts[0].content);
  assert.ok(edited.drafts.every(draft => draft.status === "draft"));
  assert.throws(() => removeStudent(data, "student-1"), /연결된 학생/);
  assert.deepEqual(removeStudent(added, "new-student").students, data.students);
});

test("CSV and Excel paste handle Korean BOM, quotes and reject invalid or duplicate rows", () => {
  assert.deepEqual(parseRoster('\uFEFF번호,이름\r\n10,"가상,하나"\r\n9,"가상""둘"'), [{ number: 9, name: '가상"둘' }, { number: 10, name: "가상,하나" }]);
  assert.deepEqual(parseRoster("번호\t이름\n9\t가상하나\n\n"), [{ number: 9, name: "가상하나" }]);
  for (const text of ['1,하나\n01,둘', '0,하나', '1,하나,기타', '1,"미완성', '1,"닫힘"문자', '1,"줄\n바꿈"', '번호,이름', '1,\0']) assert.throws(() => parseRoster(text), text);
  assert.ok(exportRoster([{ number: 1, name: '=HYPERLINK("https://example.invalid")' }]).includes('"\'=HYPERLINK'));
});

function store() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test("legacy records stay in the guest space and cannot seed another account", () => {
  const storage = store();
  const legacy = { ...createDemoWorkspace(), version: 1 };
  legacy.students[0].name = "로그인전가상학생";
  const original = JSON.stringify(legacy);
  storage.setItem(LEGACY_STORAGE_KEY, original);
  const guest = readWorkspace(storage, null);
  assert.equal(guest.data.students[0].name, "로그인전가상학생");
  assert.equal(readWorkspace(storage, "account-a").data.students[0].name, "강가람");
  saveWorkspace(storage, workspaceStorageKey(null), guest.raw, guest.data);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), original);
  const accountData = updateClassroom(createDemoWorkspace(), { year: 2028, grade: 2, room: "1", semester: 1 });
  saveWorkspace(storage, workspaceStorageKey("account-a"), null, accountData);
  assert.equal(readWorkspace(storage, "account-a").data.classroom.year, 2028);
  assert.equal(readWorkspace(storage, "account-b").data.classroom.year, 2026);
});

test("stale writes and corrupt data never overwrite the stored original", () => {
  const storage = store(), key = workspaceStorageKey(null);
  const raw = saveWorkspace(storage, key, null, createDemoWorkspace());
  assert.throws(() => saveWorkspace(storage, key, null, createDemoWorkspace()), WorkspaceConflict);
  assert.equal(storage.getItem(key), raw);
  const damaged = '{"broken":';
  storage.setItem(key, damaged);
  assert.equal(readWorkspace(storage, null).recoveryRaw, damaged);
  assert.equal(storage.getItem(key), damaged);
  const unavailable = { getItem() { throw new Error("unavailable"); }, setItem() {} };
  assert.throws(() => readWorkspace(unavailable, null), /unavailable/);
});

test("an unsupported future workspace keeps its complete raw storage for recovery", () => {
  const storage = store(), key = workspaceStorageKey(null);
  const raw = JSON.stringify({ ...createDemoWorkspace(), version: 4,
    semesterPreparation: { classroom: createDemoWorkspace().classroom, subject: "체육",
      entries: { "student-7": { content: "보존할 가상 미래 문장.", reviewedSnapshot: null } } } });
  storage.setItem(key, raw);
  const loaded = readWorkspace(storage, null);
  assert.equal(loaded.recoveryRaw, raw);
  assert.equal(loaded.raw, raw);
  assert.equal(storage.getItem(key), raw);
  assert.equal(loaded.data.version, 3);
  assert.equal(parseWorkspace(JSON.parse(raw)), null);
});
