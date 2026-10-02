import { createDemoWorkspace } from "./demo";
import type { WorkspaceData } from "./domain";

export type WorkspaceStartMode = "empty" | "example";

export function createWorkspaceStart(current: WorkspaceData, mode: WorkspaceStartMode): WorkspaceData {
  if (mode === "example") return createDemoWorkspace();
  return { version: 3, classroom: { ...current.classroom }, students: [], observations: [], drafts: [] };
}

export function hasWorkspaceRecords(current: WorkspaceData): boolean {
  return current.students.length > 0 || current.observations.length > 0 || current.drafts.length > 0 || current.semesterPreparation !== undefined;
}

export function replaceWorkspaceFromSnapshot(current: WorkspaceData, snapshot: WorkspaceData, replacement: WorkspaceData): WorkspaceData {
  if (current !== snapshot) throw new Error("준비하는 동안 현재 기록이 바뀌었습니다. 현재 기록을 보관하고 다시 선택해 주세요.");
  return replacement;
}
