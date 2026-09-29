import { parseWorkspace, type WorkspaceData } from "./domain";
import { createDemoWorkspace } from "./demo";

export const LEGACY_STORAGE_KEY = "damim-note.demo.v1";
export const workspaceStorageKey = (userId: string | null) => `damim-note.workspace.v2.${userId ? `user.${encodeURIComponent(userId)}` : "guest"}`;
type Store = Pick<Storage, "getItem" | "setItem">;

export function readWorkspace(storage: Store, userId: string | null) {
  const key = workspaceStorageKey(userId);
  const raw = storage.getItem(key);
  // Unowned legacy records belong only to the guest space, never to a signed-in account.
  const source = raw ?? (userId === null ? storage.getItem(LEGACY_STORAGE_KEY) : null);
  if (source === null) return { data: createDemoWorkspace(), raw, recoveryRaw: null };
  let parsed: WorkspaceData | null = null;
  try { parsed = parseWorkspace(JSON.parse(source)); } catch { /* Preserve the source verbatim. */ }
  return { data: parsed ?? createDemoWorkspace(), raw, recoveryRaw: parsed ? null : source };
}

export class WorkspaceConflict extends Error {
  constructor() { super("다른 탭에서 기록이 변경되었습니다. 현재 자료를 백업한 뒤 최신 기록을 불러와 주세요."); }
}

/** Check immediately before writing, so delayed UI actions cannot overwrite a newer tab. */
export function saveWorkspace(storage: Store, key: string, expectedRaw: string | null, data: WorkspaceData): string {
  if (storage.getItem(key) !== expectedRaw) throw new WorkspaceConflict();
  if (!parseWorkspace(data)) throw new Error("저장할 자료 형식을 확인해 주세요.");
  const raw = JSON.stringify(data);
  storage.setItem(key, raw);
  return raw;
}
