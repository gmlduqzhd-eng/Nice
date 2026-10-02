import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkspace, type WorkspaceData } from "../src/lib/domain";
import { JsonBackupSizeError, MAX_JSON_BACKUP_BYTES, serializeJsonBackup } from "../src/lib/json-backup";

function fictionalWorkspace(observationCount: number): WorkspaceData {
  return {
    version: 3,
    classroom: { year: 2026, grade: 4, room: "2", semester: 2 },
    students: [{ id: "fictional-student", number: 1, name: "가상검증학생" }],
    observations: Array.from({ length: observationCount }, (_, index) => ({
      id: `fictional-observation-${index}`,
      studentId: "fictional-student",
      date: "2026-10-01",
      category: "생활",
      content: "가".repeat(10_000),
    })),
    drafts: [],
  };
}

test("a valid Korean workspace larger than 1MiB can round-trip through its own file backup", () => {
  const workspace = fictionalWorkspace(40);
  assert.ok(parseWorkspace(workspace));
  const exported = serializeJsonBackup(workspace);
  const bytes = new Blob([exported]).size;
  assert.ok(bytes > 1024 * 1024);
  assert.ok(bytes <= MAX_JSON_BACKUP_BYTES);
  assert.deepEqual(parseWorkspace(JSON.parse(exported)), workspace);
});

test("export refuses a valid workspace exceeding the shared 20MiB UTF-8 file bound", () => {
  const workspace = fictionalWorkspace(700);
  assert.ok(parseWorkspace(workspace));
  // Character count alone is below the limit; UTF-8 file bytes are above it.
  const json = JSON.stringify(workspace, null, 2);
  assert.ok(json.length < MAX_JSON_BACKUP_BYTES);
  assert.ok(new Blob([json]).size > MAX_JSON_BACKUP_BYTES);
  const originalFirstObservation = workspace.observations[0].content;
  assert.throws(() => serializeJsonBackup(workspace), error =>
    error instanceof JsonBackupSizeError && /20MB.*내보내지 못했습니다/.test(error.message));
  assert.equal(workspace.observations.length, 700);
  assert.equal(workspace.observations[0].content, originalFirstObservation);
});
