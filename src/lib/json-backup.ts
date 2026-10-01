import type { WorkspaceData } from "./domain";

// File backup and cloud storage have separate limits. Measure the exact UTF-8
// bytes that Blob/File use so every file emitted here can pass the import guard.
export const MAX_JSON_BACKUP_BYTES = 20 * 1024 * 1024;
export const JSON_BACKUP_SIZE_LABEL = "20MB";

export class JsonBackupSizeError extends Error {
  constructor() {
    super(`JSON 백업 파일이 ${JSON_BACKUP_SIZE_LABEL}를 넘어 내보내지 못했습니다. 현재 기록은 유지됩니다. 기록 분량을 줄인 뒤 다시 시도해 주세요.`);
  }
}

export function serializeJsonBackup(data: WorkspaceData): string {
  const json = JSON.stringify(data, null, 2);
  if (new TextEncoder().encode(json).byteLength > MAX_JSON_BACKUP_BYTES) throw new JsonBackupSizeError();
  return json;
}
