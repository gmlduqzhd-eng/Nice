import test from "node:test";
import assert from "node:assert/strict";
import { createDemoWorkspace } from "../src/lib/demo";
import { addObservation, deleteObservation, editObservation, getIssues, parseWorkspace, transitionDraft, updateDraft, utf8ByteLength } from "../src/lib/domain";

test("demo is schema-valid, independent, and exposes intended review issues", () => {
  const demo = createDemoWorkspace();
  assert.ok(parseWorkspace(demo));
  assert.equal(demo.students.length, 8);
  const kinds = new Set(getIssues(demo).map((issue) => issue.kind));
  for (const kind of ["empty-draft", "no-evidence", "missing-evidence", "duplicate-content", "other-student-name", "no-observations"] as const) assert.ok(kinds.has(kind), kind);
  demo.students[0].name = "modified";
  assert.equal(createDemoWorkspace().students[0].name, "강가람");
});

test("import rejects duplicate identities, unknown students, invalid dates and dangerous shapes", () => {
  const duplicate = createDemoWorkspace();
  duplicate.students[1].id = duplicate.students[0].id;
  assert.equal(parseWorkspace(duplicate), null);
  const unknownStudent = createDemoWorkspace();
  unknownStudent.observations[0].studentId = "unknown";
  assert.equal(parseWorkspace(unknownStudent), null);
  const invalidDate = createDemoWorkspace();
  invalidDate.observations[0].date = "2026-02-30";
  assert.equal(parseWorkspace(invalidDate), null);
  assert.equal(parseWorkspace({ version: 1, students: {}, observations: [], drafts: [] }), null);
  assert.equal(parseWorkspace(null), null);
  assert.equal(parseWorkspace({ ...createDemoWorkspace(), version: 99 }), null);
});

test("import strips unknown properties and returns independent nested arrays", () => {
  const data = createDemoWorkspace();
  const parsed = parseWorkspace({ ...data, secret: "not retained" });
  assert.ok(parsed);
  assert.equal("secret" in parsed, false);
  parsed.drafts[0].evidenceIds.push("another");
  assert.equal(data.drafts[0].evidenceIds.length, 1);
});

test("editing confirmed text resets status while unchanged content preserves state", () => {
  const data = createDemoWorkspace();
  assert.equal(updateDraft(data, "draft-1", data.drafts[0].content, data.drafts[0].evidenceIds), data);
  const edited = updateDraft(data, "draft-1", "관찰 근거에 맞게 수정한 문장.", ["observation-1"]);
  assert.equal(edited.drafts[0].status, "draft");
  assert.equal(data.drafts[0].status, "confirmed");
  assert.notEqual(edited.drafts[0].content, data.drafts[0].content);
});

test("changing evidence resets reviewed status and rejects another student's source", () => {
  const data = createDemoWorkspace();
  const edited = updateDraft(data, "draft-4", data.drafts[3].content, ["observation-7"]);
  assert.equal(edited.drafts[3].status, "draft");
  assert.throws(() => updateDraft(data, "draft-4", data.drafts[3].content, ["observation-1"]));
});

test("changing or deleting evidence invalidates dependent completed drafts", () => {
  const data = createDemoWorkspace();
  const edited = editObservation(data, "observation-1", { content: "수업에서 실제로 확인한 새로운 관찰 내용." });
  assert.equal(edited.drafts[0].status, "draft");
  assert.equal(edited.drafts[6].status, "copied");
  assert.equal(data.drafts[0].status, "confirmed");
  const deleted = deleteObservation(data, "observation-12");
  assert.equal(deleted.drafts[6].status, "draft");
  assert.ok(getIssues(deleted).some((issue) => issue.kind === "missing-evidence" && issue.draftId === "draft-7"));
  assert.ok(parseWorkspace(deleted));
});

test("empty text, no evidence and broken evidence cannot enter reviewed state", () => {
  const data = createDemoWorkspace();
  for (const id of ["draft-2", "draft-3", "draft-8"]) assert.throws(() => transitionDraft(data, id, "reviewed"));
});

test("copy and confirmation require the ordered, successful manual workflow", () => {
  let data = createDemoWorkspace();
  assert.throws(() => transitionDraft(data, "draft-5", "copied", { clipboardSucceeded: true }));
  assert.throws(() => transitionDraft(data, "draft-4", "confirmed"));
  assert.throws(() => transitionDraft(data, "draft-4", "copied"));
  data = transitionDraft(data, "draft-5", "reviewed");
  data = transitionDraft(data, "draft-5", "copied", { clipboardSucceeded: true });
  data = transitionDraft(data, "draft-5", "confirmed");
  assert.equal(data.drafts[4].status, "confirmed");
});

test("duplicate detection normalizes whitespace and flags both students", () => {
  const data = createDemoWorkspace();
  data.drafts[4].content = `  ${data.drafts[3].content.replace(/ /g, "  \n")} `;
  const duplicates = getIssues(data).filter((issue) => issue.kind === "duplicate-content");
  assert.equal(duplicates.length, 2);
  assert.deepEqual(new Set(duplicates.map((issue) => issue.studentId)), new Set(["student-4", "student-5"]));
});

test("cross-student evidence is inspectable in drafts but rejected as completed data", () => {
  const data = createDemoWorkspace();
  data.drafts[2].evidenceIds = ["observation-1"];
  assert.ok(parseWorkspace(data));
  assert.ok(getIssues(data).some((issue) => issue.kind === "wrong-student-evidence" && issue.draftId === "draft-3"));
  assert.throws(() => transitionDraft(data, "draft-3", "reviewed"));
  data.drafts[2].status = "reviewed";
  assert.equal(parseWorkspace(data), null);
});

test("new observations validate identity and remove no-observations issue", () => {
  const data = createDemoWorkspace();
  const observation = { id: "new-observation", studentId: "student-8", date: "2026-09-29", category: "국어", content: "자신의 생각을 문장으로 정리함." };
  const added = addObservation(data, observation);
  assert.equal(added.observations.length, data.observations.length + 1);
  assert.equal(getIssues(added).some((issue) => issue.kind === "no-observations" && issue.studentId === "student-8"), false);
  assert.throws(() => addObservation(added, observation));
  assert.throws(() => addObservation(data, { ...observation, content: " " }));
});

test("UTF-8 counts multibyte Hangul and emoji without implying NEIS limits", () => {
  assert.equal(utf8ByteLength("ABC"), 3);
  assert.equal(utf8ByteLength("가나다"), 9);
  assert.equal(utf8ByteLength("🙂"), 4);
  assert.equal(utf8ByteLength("가\nA"), 5);
});
