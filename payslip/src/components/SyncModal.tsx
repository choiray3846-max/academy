import { useState } from 'react';
import type { PayslipData } from '../types';
import { fetchRemote, pushRemote, type SyncConfig } from '../lib/sync';
import { Modal } from './Modal';

interface Props {
  data: PayslipData;
  syncCfg: SyncConfig | null;
  syncStatus: 'off' | 'ok' | 'syncing' | 'error';
  onChangeSyncConfig: (cfg: SyncConfig | null) => void;
  onClose: () => void;
}

export function SyncModal({ data, syncCfg, syncStatus, onChangeSyncConfig, onClose }: Props) {
  const [url, setUrl] = useState(syncCfg?.url ?? '');
  const [anonKey, setAnonKey] = useState(syncCfg?.anonKey ?? '');
  const [roomId, setRoomId] = useState(syncCfg?.roomId ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);

  async function connect() {
    setBusy(true);
    setMsg('');
    const cfg: SyncConfig = { url, anonKey, roomId };
    try {
      const remote = await fetchRemote(cfg);
      if (remote) {
        const useRemote = window.confirm(
          '클라우드에 이미 이 학원 코드의 급여 데이터가 있습니다.\n\n' +
            '[확인] = 클라우드 데이터를 가져와서 씁니다 (이 컴퓨터의 현재 데이터는 대체됨)\n' +
            '[취소] = 이 컴퓨터의 데이터를 클라우드에 올려 덮어씁니다',
        );
        if (!useRemote) await pushRemote(cfg, data);
      } else {
        await pushRemote(cfg, data);
      }
      onChangeSyncConfig(cfg);
      setMsg('연결 완료! 이제 이 설정을 다른 컴퓨터에도 똑같이 입력하면 공유됩니다.');
    } catch (e) {
      setMsg(
        `연결 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}. ` +
          'URL·키와 테이블 생성 여부를 확인해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="여러 컴퓨터 공유" onClose={onClose}>
      {syncCfg ? (
        <p className="sync-note ok">
          현재 공유 중입니다 — 학원 코드 '<b>{syncCfg.roomId}</b>' · 상태:{' '}
          {syncStatus === 'ok' ? '정상 ✓' : syncStatus === 'syncing' ? '저장 중…' : '오류 (인터넷·설정 확인)'}
        </p>
      ) : (
        <p className="hint" style={{ marginTop: 0 }}>
          여러 컴퓨터에서 <b>같은 급여 데이터를</b> 보고 편집하고, 브라우저 데이터를 지워도
          클라우드에서 자동 복구되게 하려면 무료 클라우드 저장소(Supabase)를 연결하세요.
          달력·시간표 앱에서 이미 만들었다면 <b>같은 URL·키·학원 코드</b>를 그대로 입력하면
          됩니다 (급여 데이터는 따로 저장되어 섞이지 않습니다).
        </p>
      )}

      <div className="form-grid">
        <label className="full-row">Supabase 프로젝트 URL
          <input
            value={url}
            placeholder="https://xxxx.supabase.co"
            onChange={(e) => setUrl(e.target.value.trim())}
          />
        </label>
        <label className="full-row">anon 공개 키
          <input
            value={anonKey}
            placeholder="eyJhbGci…"
            onChange={(e) => setAnonKey(e.target.value.trim())}
          />
        </label>
        <label className="full-row">학원 코드 (같은 코드를 쓰는 기기끼리 공유)
          <input
            value={roomId}
            placeholder="예: 우리학원-본원"
            onChange={(e) => setRoomId(e.target.value.trim())}
          />
        </label>
      </div>

      {msg && <p className="sync-note ok">{msg}</p>}

      <div className="backup-actions">
        <button className="primary" disabled={busy || !url || !anonKey || !roomId} onClick={connect}>
          {busy ? '연결 중…' : syncCfg ? '설정 다시 연결' : '연결하기'}
        </button>
        {syncCfg && (
          <button
            onClick={() => {
              if (window.confirm('공유를 끊을까요? 이 컴퓨터의 데이터는 그대로 남습니다.')) {
                onChangeSyncConfig(null);
                setMsg('공유를 끊었습니다.');
              }
            }}
          >
            공유 끊기
          </button>
        )}
      </div>

      <button className="icon" style={{ marginTop: 12 }} onClick={() => setGuideOpen(!guideOpen)}>
        {guideOpen ? '▾' : '▸'} Supabase 처음 설정하는 방법
      </button>
      {guideOpen && (
        <ol className="sync-guide">
          <li>supabase.com 에 가입하고 새 프로젝트를 만듭니다 (무료).</li>
          <li>
            왼쪽 메뉴 [SQL Editor]에서 아래를 한 번 실행합니다
            (달력·시간표 공유에서 이미 했다면 건너뛰세요):
            <pre>{`create table boards (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table boards enable row level security;
create policy "open access" on boards
  for all using (true) with check (true);`}</pre>
          </li>
          <li>[Project Settings → API]에서 Project URL과 anon public 키를 복사해 위에 붙여 넣습니다.</li>
          <li>학원 코드는 아무 문구나 정하면 됩니다. 다른 컴퓨터에도 같은 세 값을 입력하면 공유됩니다.</li>
        </ol>
      )}
    </Modal>
  );
}
