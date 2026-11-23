"use client";

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { backupContents, formatBackupTime, readCloudBackup } from '@/lib/cloud-backup';
import { parseWorkspace, type WorkspaceData } from '@/lib/domain';
import { getSupabase } from '@/lib/supabase';

type Status = 'loading' | 'unavailable' | 'empty' | { updatedAt: string; workspace: WorkspaceData | null };

export default function DashboardBackup({ userId, data, onOpen }: {
  userId: string;
  data: WorkspaceData;
  onOpen: () => void;
}) {
  const [status, setStatus] = useState<Status>('loading');
  const [check, setCheck] = useState(0);
  const matches = useMemo(() => typeof status === 'object' && status.workspace &&
    backupContents(status.workspace) === backupContents(data), [status, data]);

  useEffect(() => {
    let active = true;
    const client = getSupabase();
    async function load() {
      try {
        if (!client) throw new Error('계정 백업 연결 필요');
        const row = await readCloudBackup(client, userId);
        if (active) setStatus(row ? { updatedAt: row.updated_at, workspace: parseWorkspace(row.data) } : 'empty');
      } catch {
        if (active) setStatus('unavailable');
      }
    }
    void load();
    return () => { active = false; };
  }, [userId, check]);

  return (
    <section className="dashboard-backup card row" aria-labelledby="dashboard-backup-title">
      <div>
        <h2 id="dashboard-backup-title">계정 백업</h2>
        <div role="status" aria-label="계정 백업 상태">
          {typeof status === 'object' ? <>
            <p>마지막 계정 백업 <time dateTime={status.updatedAt}>{formatBackupTime(status.updatedAt)}</time></p>
            <p><strong>{status.workspace
              ? matches ? '현재 기록과 일치' : '백업과 다른 기록 있음'
              : '현재 기록과 비교할 수 없는 백업입니다.'}</strong></p>
          </> : <p>{status === 'loading' ? '계정 백업을 확인하는 중…'
            : status === 'empty' ? '아직 이 계정에 저장한 백업이 없습니다.'
            : '계정 백업을 확인하지 못했습니다.'}</p>}
        </div>
      </div>
      <div className="row">
        <button type="button" className="text-button" disabled={status === 'loading'} onClick={() => {
          setStatus('loading');
          setCheck(previous => previous + 1);
        }}>백업 상태 다시 확인</button>
        <button type="button" className="button secondary" onClick={onOpen}>계정 백업 열기 <ChevronRight size={16} aria-hidden="true" /></button>
      </div>
    </section>
  );
}
