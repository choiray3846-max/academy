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
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AcademyData>(() => loadData());
  const [session, setSessionState] = useState<Session>(
    () => loadSession() ?? { role: 'owner' },
  );
  const [saveError, setSaveError] = useState<string | null>(null);

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
    () => ({ data, update, replaceAll, session, setSession, saveError }),
    [data, update, replaceAll, session, setSession, saveError],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore는 AppStoreProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
