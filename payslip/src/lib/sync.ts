import type { PayslipData } from '../types';

/**
 * 여러 컴퓨터 실시간 공유 (Supabase 연동).
 *
 * 급여 데이터 전체를 Supabase의 boards 테이블 한 행(jsonb)에 저장한다.
 * 각 컴퓨터는 수정할 때마다 올리고(디바운스), 몇 초마다 새 버전이 있는지
 * 확인해서 내려받는다. 충돌은 '마지막에 저장한 쪽이 이긴다' 규칙.
 * 달력·시간표 앱과 같은 테이블을 쓰며, 'payslip:' 접두사로 분리 저장된다.
 *
 * 필요한 테이블 (Supabase SQL Editor에서 한 번 실행 — 달력·시간표에서
 * 이미 만들었다면 그대로 쓰면 된다):
 *   create table boards (
 *     id text primary key,
 *     data jsonb not null,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table boards enable row level security;
 *   create policy "open access" on boards for all using (true) with check (true);
 */

export interface SyncConfig {
  /** Supabase 프로젝트 URL (https://xxxx.supabase.co) */
  url: string;
  /** Supabase anon(공개) API 키 */
  anonKey: string;
  /** 학원 코드 – 같은 코드를 쓰는 기기끼리 데이터를 공유한다.
   *  달력·시간표 앱과 같은 코드를 써도 된다 ('payslip:' 접두사로 분리 저장). */
  roomId: string;
}

const CFG_KEY = 'academy-payslip/sync';
const ROOM_PREFIX = 'payslip:';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as SyncConfig;
    if (!cfg.url || !cfg.anonKey || !cfg.roomId) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function saveSyncConfig(cfg: SyncConfig | null): void {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    /* noop */
  }
}

function headers(cfg: SyncConfig): Record<string, string> {
  return {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
    'Content-Type': 'application/json',
  };
}

function endpoint(cfg: SyncConfig): string {
  // 사용자가 '/rest/v1/'까지 붙여 넣어도 동작하도록 정리한다.
  const base = cfg.url.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  return `${base}/rest/v1/boards`;
}

function roomKey(cfg: SyncConfig): string {
  return encodeURIComponent(ROOM_PREFIX + cfg.roomId);
}

export interface RemoteBoard {
  data: PayslipData;
  updatedAt: string;
}

/** 서버의 현재 데이터. 행이 없으면 null */
export async function fetchRemote(cfg: SyncConfig): Promise<RemoteBoard | null> {
  const res = await fetch(
    `${endpoint(cfg)}?id=eq.${roomKey(cfg)}&select=data,updated_at`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const rows = (await res.json()) as { data: PayslipData; updated_at: string }[];
  if (!rows.length) return null;
  return { data: rows[0].data, updatedAt: rows[0].updated_at };
}

/** 서버의 마지막 수정 시각만 가볍게 확인. 행이 없으면 null */
export async function fetchRemoteStamp(cfg: SyncConfig): Promise<string | null> {
  const res = await fetch(`${endpoint(cfg)}?id=eq.${roomKey(cfg)}&select=updated_at`, {
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const rows = (await res.json()) as { updated_at: string }[];
  return rows.length ? rows[0].updated_at : null;
}

/** 데이터를 서버에 올린다(upsert). 올린 updated_at을 돌려준다. */
export async function pushRemote(cfg: SyncConfig, data: PayslipData): Promise<string> {
  const updatedAt = new Date().toISOString();
  const res = await fetch(`${endpoint(cfg)}?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers(cfg), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: ROOM_PREFIX + cfg.roomId, data, updated_at: updatedAt }),
  });
  if (!res.ok) throw new Error(`저장 실패 (${res.status})`);
  return updatedAt;
}
