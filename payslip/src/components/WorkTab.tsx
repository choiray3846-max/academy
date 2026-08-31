import { useMemo, useState } from 'react';
import type { MonthStr, PayslipData, WorkEntry } from '../types';
import { addDays, monthOf, shortDate, today, weekLabel } from '../lib/date';
import { calcEntry, parseTime, weekSummaries } from '../lib/payroll';
import { fmtMinutes } from '../lib/format';
import { newId } from '../lib/id';
import { Modal } from './Modal';

interface Props {
  data: PayslipData;
  month: MonthStr;
  update: (updater: (prev: PayslipData) => PayslipData) => void;
}

interface Draft {
  id?: string;
  employeeId: string;
  date: string;
  /** 'sessions' = 수업 횟수로 기록, 'times' = 출퇴근 시각으로 기록 */
  mode: 'sessions' | 'times';
  sessions: string;
  start: string;
  end: string;
  breakMinutes: string;
  memo: string;
}

export function WorkTab({ data, month, update }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const employees = data.employees.filter((e) => !e.archived);
  const selected = employees.find((e) => e.id === employeeId);
  const nameOf = (id: string) => data.employees.find((e) => e.id === id)?.name ?? '(삭제됨)';

  const entries = useMemo(
    () =>
      data.entries
        .filter(
          (e) =>
            monthOf(e.date) === month && (!employeeId || e.employeeId === employeeId),
        )
        .sort((a, b) =>
          a.date === b.date
            ? (a.start ?? '').localeCompare(b.start ?? '')
            : a.date < b.date
              ? -1
              : 1,
        ),
    [data.entries, month, employeeId],
  );

  // 이 달과 겹치는 주들의 요약 (직원을 골랐을 때만)
  const weeks = useMemo(() => {
    if (!selected) return [];
    return weekSummaries(data.entries, selected, data.settings.minutesPerSession).filter((w) => {
      for (let i = 0; i < 7; i++) {
        if (monthOf(addDays(w.weekStart, i)) === month) return true;
      }
      return false;
    });
  }, [data.entries, data.settings.minutesPerSession, selected, month]);

  function openNew() {
    if (employees.length === 0) {
      window.alert('먼저 직원 탭에서 직원을 추가하세요.');
      return;
    }
    setError('');
    const now = today();
    setDraft({
      employeeId: employeeId || employees[0].id,
      date: monthOf(now) === month ? now : `${month}-01`,
      mode: 'sessions',
      sessions: '1',
      start: '18:00',
      end: '22:00',
      breakMinutes: '0',
      memo: '',
    });
  }

  function openEdit(e: WorkEntry) {
    setError('');
    setDraft({
      id: e.id,
      employeeId: e.employeeId,
      date: e.date,
      mode: e.sessions ? 'sessions' : 'times',
      sessions: String(e.sessions ?? 1),
      start: e.start ?? '18:00',
      end: e.end ?? '22:00',
      breakMinutes: String(e.breakMinutes),
      memo: e.memo ?? '',
    });
  }

  function save() {
    if (!draft) return;
    if (!draft.employeeId) {
      setError('직원을 선택하세요.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError('날짜를 선택하세요.');
      return;
    }
    let fields: Omit<WorkEntry, 'id'>;
    if (draft.mode === 'sessions') {
      const sessions = Number(draft.sessions);
      if (!Number.isInteger(sessions) || sessions < 1) {
        setError('수업 횟수를 선택하세요.');
        return;
      }
      // 수정으로 방식을 바꿀 수 있으니 다른 방식의 필드는 지운다
      fields = {
        employeeId: draft.employeeId,
        date: draft.date,
        sessions,
        start: undefined,
        end: undefined,
        breakMinutes: 0,
        memo: draft.memo.trim() || undefined,
      };
    } else {
      if (parseTime(draft.start) === null || parseTime(draft.end) === null) {
        setError('출퇴근 시각을 HH:MM 형식으로 입력하세요.');
        return;
      }
      const breakMinutes = Number(draft.breakMinutes) || 0;
      if (breakMinutes < 0) {
        setError('휴게시간은 0 이상이어야 합니다.');
        return;
      }
      fields = {
        employeeId: draft.employeeId,
        date: draft.date,
        sessions: undefined,
        start: draft.start,
        end: draft.end,
        breakMinutes,
        memo: draft.memo.trim() || undefined,
      };
      if (calcEntry({ id: '', ...fields }).workMinutes === 0) {
        setError('근무시간이 0입니다. 시각과 휴게시간을 확인하세요.');
        return;
      }
    }
    update((prev) => ({
      ...prev,
      entries: draft.id
        ? prev.entries.map((e) => (e.id === draft.id ? { ...e, ...fields } : e))
        : [...prev.entries, { id: newId('ent-'), ...fields }],
    }));
    setDraft(null);
  }

  function remove(e: WorkEntry) {
    if (!window.confirm(`${shortDate(e.date)} ${nameOf(e.employeeId)} 기록을 삭제할까요?`)) return;
    update((prev) => ({ ...prev, entries: prev.entries.filter((x) => x.id !== e.id) }));
  }

  const totalMinutes = entries.reduce(
    (s, e) => s + calcEntry(e, data.settings.minutesPerSession).workMinutes,
    0,
  );

  return (
    <div className="tab-body">
      <div className="section-head">
        <h2>근무 기록</h2>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">전체 직원</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <span className="spacer" />
        <button className="primary" onClick={openNew}>+ 근무 추가</button>
      </div>

      {selected && weeks.length > 0 && (
        <div className="week-cards">
          {weeks.map((w) => (
            <div key={w.weekStart} className="week-card">
              <div className="week-card-title">{weekLabel(w.weekStart)}</div>
              <div>근무 {fmtMinutes(w.minutes)}</div>
              {w.overtimeMinutes > 0 && <div>연장 {fmtMinutes(w.overtimeMinutes)}</div>}
              <div className={w.allowanceMinutes > 0 ? 'ok-text' : 'muted-text'}>
                {w.allowanceMinutes > 0
                  ? `주휴 발생 (${fmtMinutes(w.allowanceMinutes)})`
                  : '주휴 없음 (15시간 미만)'}
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="empty">이 달의 근무 기록이 없습니다. ‘근무 추가’로 출퇴근을 기록하세요.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>날짜</th><th>직원</th><th>출근</th><th>퇴근</th><th>휴게</th><th>근무</th><th>야간</th><th>메모</th><th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const c = calcEntry(e, data.settings.minutesPerSession);
              const overnight =
                !e.sessions && (parseTime(e.end ?? '') ?? 0) <= (parseTime(e.start ?? '') ?? 0);
              return (
                <tr key={e.id}>
                  <td>{shortDate(e.date)}</td>
                  <td>{nameOf(e.employeeId)}</td>
                  {e.sessions ? (
                    <td colSpan={3}>수업 {e.sessions}회</td>
                  ) : (
                    <>
                      <td className="num">{e.start}</td>
                      <td className="num">{e.end}{overnight ? ' +1일' : ''}</td>
                      <td className="num">{e.breakMinutes > 0 ? `${e.breakMinutes}분` : '-'}</td>
                    </>
                  )}
                  <td className="num">{fmtMinutes(c.workMinutes)}</td>
                  <td className="num">{c.nightMinutes > 0 ? fmtMinutes(c.nightMinutes) : '-'}</td>
                  <td>{e.memo ?? ''}</td>
                  <td className="actions">
                    <button onClick={() => openEdit(e)}>수정</button>
                    <button className="danger-ghost" onClick={() => remove(e)}>삭제</button>
                  </td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td colSpan={5}>합계 ({entries.length}건)</td>
              <td className="num">{fmtMinutes(totalMinutes)}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      )}

      {draft && (
        <Modal
          title={draft.id ? '근무 기록 수정' : '근무 추가'}
          onClose={() => setDraft(null)}
          footer={
            <>
              {error && <span className="form-error">{error}</span>}
              <span className="spacer" />
              <button onClick={() => setDraft(null)}>취소</button>
              <button className="primary" onClick={save}>저장</button>
            </>
          }
        >
          <div className="form-grid">
            <label>직원
              <select
                value={draft.employeeId}
                onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label>날짜
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>기록 방식
              <select
                value={draft.mode}
                onChange={(e) =>
                  setDraft({ ...draft, mode: e.target.value as Draft['mode'] })
                }
              >
                <option value="sessions">수업 횟수</option>
                <option value="times">출퇴근 시각</option>
              </select>
            </label>
            {draft.mode === 'sessions' ? (
              <label>수업 횟수
                <select
                  value={draft.sessions}
                  onChange={(e) => setDraft({ ...draft, sessions: e.target.value })}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}회 ({fmtMinutes(n * data.settings.minutesPerSession)} 근무)
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>출근
                  <input
                    type="time"
                    value={draft.start}
                    onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  />
                </label>
                <label>퇴근
                  <input
                    type="time"
                    value={draft.end}
                    onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                  />
                </label>
                <label>휴게시간 (분)
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={draft.breakMinutes}
                    onChange={(e) => setDraft({ ...draft, breakMinutes: e.target.value })}
                  />
                </label>
              </>
            )}
            <label>메모
              <input
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
              />
            </label>
          </div>
          {draft.mode === 'sessions' ? (
            <p className="hint">
              수업 1회 = {fmtMinutes(data.settings.minutesPerSession)} 근무로 계산합니다.
              (설정에서 변경 가능)
            </p>
          ) : (
            <p className="hint">퇴근 시각이 출근보다 빠르면 다음 날 퇴근(자정 넘김)으로 계산합니다.</p>
          )}
        </Modal>
      )}
    </div>
  );
}
