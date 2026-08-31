import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AcademyData, Session } from '../types';
import { loadData, loadSession, saveData, saveSession } from '../lib/storage';
import {
  fetchRemote,
  fetchRemoteStamp,
  loadSyncConfig,
  pushRemote,
  saveSyncConfig,
  type SyncConfig,
} from '../lib/sync';

interface AppStoreValue {
  data: AcademyData;
  /** 데이터를 갱신한다. updater는 이전 상태를 받아 새 상태를 돌려준다. */
  update: (updater: (prev: AcademyData) => AcademyData) => void;
  /** 데이터 전체 교체 (백업 복원 등) */
  replaceAll: (next: AcademyData) => void;
  session: Session;
  setSession: (s: Session) => void;
  /** 마지막 저장 실패 메시지. 정상이면 null */
  saveError: string | null;
  /** 여러 컴퓨터 공유 설정과 상태 */
  syncCfg: SyncConfig | null;
  syncStatus: 'off' | 'ok' | 'syncing' | 'error';
  changeSyncConfig: (cfg: SyncConfig | null) => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AcademyData>(() => loadData());
  const [session, setSessionState] = useState<Session>(
    () => loadSession() ?? { role: 'owner' },
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  /* ----- 여러 컴퓨터 공유 (Supabase) ----- */
  const [syncCfg, setSyncCfg] = useState<SyncConfig | null>(loadSyncConfig);
  const [syncStatus, setSyncStatus] = useState<'off' | 'ok' | 'syncing' | 'error'>(
    loadSyncConfig() ? 'syncing' : 'off',
  );
  const remoteStampRef = useRef<string | null>(null);
  const applyingRemoteRef = useRef(false);
  const dirtyRef = useRef(false);

  const applyRemote = useCallback((remoteData: AcademyData, stamp: string) => {
    applyingRemoteRef.current = true;
    remoteStampRef.current = stamp;
    dirtyRef.current = false;
    setData(remoteData);
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }, []);

  const changeSyncConfig = useCallback((cfg: SyncConfig | null) => {
    saveSyncConfig(cfg);
    setSyncCfg(cfg);
    remoteStampRef.current = null;
    setSyncStatus(cfg ? 'syncing' : 'off');
  }, []);

  // 처음 연결: 서버에 데이터가 있으면 내려받고, 없으면 지금 데이터를 올린다.
  useEffect(() => {
    if (!syncCfg) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchRemote(syncCfg);
        if (cancelled) return;
        if (remote) applyRemote(remote.data, remote.updatedAt);
        else remoteStampRef.current = await pushRemote(syncCfg, data);
        setSyncStatus('ok');
      } catch {
        if (!cancelled) setSyncStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCfg, applyRemote]);

  // 로컬 변경 → 1.5초 디바운스 후 올리기
  useEffect(() => {
    if (!syncCfg) return;
    if (applyingRemoteRef.current) return;
    dirtyRef.current = true;
    const timer = setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        remoteStampRef.current = await pushRemote(syncCfg, data);
        dirtyRef.current = false;
        setSyncStatus('ok');
      } catch {
        setSyncStatus('error');
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, syncCfg]);

  // 8초마다 새 버전 확인
  useEffect(() => {
    if (!syncCfg) return;
    const interval = setInterval(async () => {
      try {
        const stamp = await fetchRemoteStamp(syncCfg);
        if (stamp && stamp !== remoteStampRef.current && !dirtyRef.current) {
          const remote = await fetchRemote(syncCfg);
          if (remote) applyRemote(remote.data, remote.updatedAt);
        }
        setSyncStatus((prev) => (prev === 'syncing' ? prev : 'ok'));
      } catch {
        setSyncStatus('error');
      }
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCfg, applyRemote]);

  // 저장은 약간 미뤄서 연타 입력에도 한 번만 쓰게 한다.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const result = saveData(data);
      setSaveError(result.ok ? null : (result.error ?? '저장 실패'));
    }, 250);
    return () => window.clearTimeout(saveTimer.current);
  }, [data]);

  // 같은 브라우저의 다른 탭에서 바뀐 내용을 반영한다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'academy-calendar/data') {
        setData(loadData());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((updater: (prev: AcademyData) => AcademyData) => {
    setData((prev) => updater(prev));
  }, []);

  const replaceAll = useCallback((next: AcademyData) => {
    setData(next);
  }, []);

  const setSession = useCallback((s: Session) => {
    setSessionState(s);
    saveSession(s);
  }, []);

  const value = useMemo(
    () => ({ data, update, replaceAll, session, setSession, saveError, syncCfg, syncStatus, changeSyncConfig }),
    [data, update, replaceAll, session, setSession, saveError, syncCfg, syncStatus, changeSyncConfig],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore는 AppStoreProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
