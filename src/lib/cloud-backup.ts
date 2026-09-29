import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkspaceData } from './domain';

export class CloudBackupConflict extends Error {
  constructor() {
    super('클라우드 백업이 다른 곳에서 변경되어 덮어쓰지 않았습니다. 현재 기록을 JSON으로 보관한 뒤 최신 클라우드 백업을 확인해 주세요.');
  }
}

/** Compare the observed version in the write itself; never retry a conflict as an upsert. */
export async function saveCloudBackup(client: SupabaseClient, userId: string, data: WorkspaceData, previousUpdatedAt: string | null) {
  const previousTime = previousUpdatedAt === null ? 0 : Date.parse(previousUpdatedAt);
  if (!Number.isFinite(previousTime)) throw new Error('클라우드 백업 시각 확인 필요');
  // Even with a slow local clock, a successful write must change the comparison value.
  const updatedAt = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
  const table = client.from('teacher_workspaces');
  const result = previousUpdatedAt === null
    ? await table.insert({ user_id: userId, data, updated_at: updatedAt }).select('updated_at').single()
    : await table.update({ data, updated_at: updatedAt }).eq('user_id', userId).eq('updated_at', previousUpdatedAt).select('updated_at').maybeSingle();
  if (result.error?.code === '23505') throw new CloudBackupConflict();
  if (result.error) throw result.error;
  if (!result.data) throw new CloudBackupConflict();
  return result.data.updated_at as string;
}
