import { useMemo, useState } from 'react';
import type { DateStr, MonthStr, PayslipData, WorkEntry } from '../types';
import {
  addDays,
  addMonths,
  DOW_LABELS,
  fromDateStr,
  monthDates,
  monthOf,
  monthTitle,
  shortDate,
  today,
  weekLabel,
} from '../lib/date';
import { calcEntry, parseTime, weekSummaries } from '../lib/payroll';
import { fmtMinutes, fmtWon } from '../lib/format';
import { newId } from '../lib/id';
import { Modal } from './Modal';

interface Props {
  data: PayslipData;
  month: MonthStr;
  update: (updater: (prev: PayslipData) => PayslipData) => void;
}

type Mode = 'sessions' | 'times' | 'dc' | 'custom';

/** 직원별 입력값 — 여러 명을 한 번에 등록해도 각자 다르게 넣을 수 있다 */
interface EmpValues {
  sessions: string;
  /** DC 업무 시간 (시간 단위, 0.5 단위 입력) */
  dcHours: string;
  /** 직접 입력하는 그날 급여 (원) */
  customPay: string;
  late: boolean;
  start: string;
  end: string;
  breakMinutes: string;
}

const defaultValues = (): EmpValues => ({
  sessions: '1',
  dcHours: '1',
  customPay: '',
  late: false,
  start: '18:00',
  end: '22:00',
  breakMinutes: '0',
});

interface Draft {
  id?: string;
  /** 선택한 직원들. 새 기록은 여러 명 한 번에, 수정은 한 명만 */
  employeeIds: string[];
  /** 직원별 입력값 (선택된 직원마다 따로) */
  perEmp: Record<string, EmpValues>;
  /** 선택한 날짜들. 새 기록은 여러 날, 수정은 한 날짜만 */
  dates: DateStr[];
  /** 달력에 표시 중인 달 */
  calMonth: MonthStr;
  /**
   * 'sessions' = 수업 횟수, 'times' = 출퇴근 시각,
   * 'dc' = DC 업무(시간만), 'custom' = 그날 급여 직접 입력
   */
  mode: Mode;
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
    return weekSummaries(data.entries, selected, data.settings).filter((w) => {
      for (let i = 0; i < 7; i++) {
        if (monthOf(addDays(w.weekStart, i)) === month) return true;
      }
      return false;
    });
  }, [data.entries, data.settings, selected, month]);

  function openNew() {
    if (employees.length === 0) {
      window.alert('먼저 직원 탭에서 직원을 추가하세요.');
      return;
    }
    setError('');
    setDraft({
      employeeIds: employeeId ? [employeeId] : [],
      perEmp: employeeId ? { [employeeId]: defaultValues() } : {},
      dates: [],
      calMonth: month,
      mode: 'sessions',
      memo: '',
    });
  }

  function openEdit(e: WorkEntry) {
    setError('');
    setDraft({
      id: e.id,
      employeeIds: [e.employeeId],
      perEmp: {
        [e.employeeId]: {
          sessions: String(e.sessions ?? 1),
          dcHours: String((e.dcMinutes ?? 60) / 60),
          customPay: e.customPay != null ? String(e.customPay) : '',
          late: e.late ?? false,
          start: e.start ?? '18:00',
          end: e.end ?? '22:00',
          breakMinutes: String(e.breakMinutes),
        },
      },
      dates: [e.date],
      calMonth: monthOf(e.date),
      mode: e.customPay != null ? 'custom' : e.dcMinutes ? 'dc' : e.sessions ? 'sessions' : 'times',
      memo: e.memo ?? '',
    });
  }

  /** 한 직원의 입력값으로 기록 필드를 만든다. 문제가 있으면 오류 문자열을 돌려준다 */
  function buildFields(
    mode: Mode,
    v: EmpValues,
    memo: string | undefined,
  ): Omit<WorkEntry, 'id' | 'date' | 'employeeId'> | string {
    if (mode === 'sessions') {
      const sessions = Number(v.sessions);
      if (!Number.isInteger(sessions) || sessions < 1) return '수업 횟수를 선택하세요.';
      // 수정으로 방식을 바꿀 수 있으니 다른 방식의 필드는 지운다
      return {
        sessions,
        dcMinutes: undefined,
        customPay: undefined,
        start: undefined,
        end: undefined,
        breakMinutes: 0,
        late: v.late || undefined,
        memo,
      };
    }
    if (mode === 'dc') {
      const hours = Number(v.dcHours);
      if (!Number.isFinite(hours) || hours <= 0) return 'DC 업무 시간을 입력하세요.';
      return {
        sessions: undefined,
        dcMinutes: Math.round(hours * 60),
        customPay: undefined,
        start: undefined,
        end: undefined,
        breakMinutes: 0,
        late: v.late || undefined,
        memo,
      };
    }
    if (mode === 'custom') {
      const amount = Number(v.customPay);
      if (!Number.isFinite(amount) || amount <= 0) return '그날 지급할 금액을 입력하세요.';
      return {
        sessions: undefined,
        dcMinutes: undefined,
        customPay: Math.round(amount),
        start: undefined,
        end: undefined,
        breakMinutes: 0,
        late: undefined,
        memo,
      };
    }
    if (parseTime(v.start) === null || parseTime(v.end) === null) {
      return '출퇴근 시각을 HH:MM 형식으로 입력하세요.';
    }
    const breakMinutes = Number(v.breakMinutes) || 0;
    if (breakMinutes < 0) return '휴게시간은 0 이상이어야 합니다.';
    const fields = {
      sessions: undefined,
      dcMinutes: undefined,
      customPay: undefined,
      start: v.start,
      end: v.end,
      breakMinutes,
      late: v.late || undefined,
      memo,
    };
    if (calcEntry({ id: '', date: '2000-01-01', employeeId: '', ...fields }).workMinutes === 0) {
      return '근무시간이 0입니다. 시각과 휴게시간을 확인하세요.';
    }
    return fields;
  }

  function save() {
    if (!draft) return;
    if (draft.employeeIds.length === 0) {
      setError('직원을 한 명 이상 선택하세요.');
      return;
    }
    if (draft.dates.length === 0) {
      setError('달력에서 날짜를 하나 이상 선택하세요.');
      return;
    }
    const memo = draft.memo.trim() || undefined;
    const many = draft.employeeIds.length > 1;
    const perEmpFields = new Map<string, Omit<WorkEntry, 'id' | 'date' | 'employeeId'>>();
    for (const id of draft.employeeIds) {
      const result = buildFields(draft.mode, draft.perEmp[id] ?? defaultValues(), memo);
      if (typeof result === 'string') {
        setError(many ? `${nameOf(id)}: ${result}` : result);
        return;
      }
      perEmpFields.set(id, result);
    }
    update((prev) => ({
      ...prev,
      entries: draft.id
        ? prev.entries.map((e) =>
            e.id === draft.id
              ? {
                  ...e,
                  ...perEmpFields.get(draft.employeeIds[0])!,
                  employeeId: draft.employeeIds[0],
                  date: draft.dates[0],
                }
              : e,
          )
        : [
            ...prev.entries,
            // 선택한 직원 × 날짜 조합을 한 번에 등록한다 (직원별 입력값 각각 적용)
            ...draft.employeeIds.flatMap((employeeId) =>
              draft.dates.map((date) => ({
                id: newId('ent-'),
                employeeId,
                date,
                ...perEmpFields.get(employeeId)!,
              })),
            ),
          ],
    }));
    setDraft(null);
  }

  /** 직원 칩 클릭: 새 기록은 여러 명 토글, 수정은 한 명 교체 */
  function toggleEmployee(id: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.id) {
        return {
          ...prev,
          employeeIds: [id],
          perEmp: { [id]: prev.perEmp[prev.employeeIds[0]] ?? defaultValues() },
        };
      }
      if (prev.employeeIds.includes(id)) {
        return { ...prev, employeeIds: prev.employeeIds.filter((x) => x !== id) };
      }
      // 새로 추가하는 직원은 첫 번째 직원의 값을 복사해서 시작 (없으면 기본값)
      const base = prev.perEmp[prev.employeeIds[0]] ?? defaultValues();
      return {
        ...prev,
        employeeIds: [...prev.employeeIds, id],
        perEmp: { ...prev.perEmp, [id]: { ...(prev.perEmp[id] ?? base) } },
      };
    });
  }

  /** 직원별 입력값 수정 */
  function setEmpValue(id: string, patch: Partial<EmpValues>) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            perEmp: {
              ...prev.perEmp,
              [id]: { ...(prev.perEmp[id] ?? defaultValues()), ...patch },
            },
          }
        : prev,
    );
  }

  /** 달력 날짜 클릭: 새 기록은 여러 날 토글, 수정은 한 날짜 교체 */
  function toggleDate(d: DateStr) {
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.id) return { ...prev, dates: [d] };
      return {
        ...prev,
        dates: prev.dates.includes(d)
          ? prev.dates.filter((x) => x !== d)
          : [...prev.dates, d].sort(),
      };
    });
  }

  function remove(e: WorkEntry) {
    if (!window.confirm(`${shortDate(e.date)} ${nameOf(e.employeeId)} 기록을 삭제할까요?`)) return;
    update((prev) => ({ ...prev, entries: prev.entries.filter((x) => x.id !== e.id) }));
  }

  const totalMinutes = entries.reduce(
    (s, e) => s + calcEntry(e, data.settings.minutesPerSession).workMinutes,
    0,
  );
  const totalDcMinutes = entries.reduce(
    (s, e) => s + calcEntry(e, data.settings.minutesPerSession).dcMinutes,
    0,
  );

  /** 직원 한 명의 입력 줄 (여러 명이면 이름과 함께 표시) */
  function renderEmpRow(id: string, showName: boolean) {
    if (!draft) return null;
    const v = draft.perEmp[id] ?? defaultValues();
    return (
      <div className="emp-values" key={id}>
        {showName && <span className="emp-values-name">{nameOf(id)}</span>}
        {draft.mode === 'custom' ? (
          <label>그날 급여 (원)
            <input
              type="number"
              min={0}
              step={10}
              value={v.customPay}
              onChange={(e) => setEmpValue(id, { customPay: e.target.value })}
              placeholder="예: 50000"
            />
          </label>
        ) : draft.mode === 'dc' ? (
          <label>DC 업무 시간 (시간)
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={v.dcHours}
              onChange={(e) => setEmpValue(id, { dcHours: e.target.value })}
            />
          </label>
        ) : draft.mode === 'sessions' ? (
          <label>수업 횟수
            <select
              value={v.sessions}
              onChange={(e) => setEmpValue(id, { sessions: e.target.value })}
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
                value={v.start}
                onChange={(e) => setEmpValue(id, { start: e.target.value })}
              />
            </label>
            <label>퇴근
              <input
                type="time"
                value={v.end}
                onChange={(e) => setEmpValue(id, { end: e.target.value })}
              />
            </label>
            <label>휴게 (분)
              <input
                type="number"
                min={0}
                step={5}
                value={v.breakMinutes}
                onChange={(e) => setEmpValue(id, { breakMinutes: e.target.value })}
              />
            </label>
          </>
        )}
        {draft.mode !== 'custom' && (
          <label className="check">
            <input
              type="checkbox"
              checked={v.late}
              onChange={(e) => setEmpValue(id, { late: e.target.checked })}
            />
            지각
          </label>
        )}
      </div>
    );
  }

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
              {w.dcMinutes > 0 && <div>DC {fmtMinutes(w.dcMinutes)}</div>}
              {w.prepMinutes > 0 && <div>준비 {fmtMinutes(w.prepMinutes)}</div>}
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
        <p className="empty">
          이 달의 근무 기록이 없습니다. ‘근무 추가’에서 직원 여러 명과 달력의 여러 날을 골라 한 번에 등록할 수 있습니다.
        </p>
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
                  <td>
                    {shortDate(e.date)}
                    {e.late && <span className="late-badge">지각</span>}
                  </td>
                  <td>{nameOf(e.employeeId)}</td>
                  {e.customPay != null ? (
                    <td colSpan={3}>금액 직접 입력</td>
                  ) : e.dcMinutes ? (
                    <td colSpan={3}>DC 업무</td>
                  ) : e.sessions ? (
                    <td colSpan={3}>수업 {e.sessions}회</td>
                  ) : (
                    <>
                      <td className="num">{e.start}</td>
                      <td className="num">{e.end}{overnight ? ' +1일' : ''}</td>
                      <td className="num">{e.breakMinutes > 0 ? `${e.breakMinutes}분` : '-'}</td>
                    </>
                  )}
                  <td className="num">
                    {c.customPay > 0
                      ? fmtWon(c.customPay)
                      : c.dcMinutes > 0
                        ? `DC ${fmtMinutes(c.dcMinutes)}`
                        : fmtMinutes(c.workMinutes)}
                  </td>
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
              <td className="num">
                {fmtMinutes(totalMinutes)}
                {totalDcMinutes > 0 ? ` + DC ${fmtMinutes(totalDcMinutes)}` : ''}
              </td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      )}

      {draft && (
        <Modal
          title={draft.id ? '근무 기록 수정' : '근무 추가'}
          wide={draft.employeeIds.length > 1}
          onClose={() => setDraft(null)}
          footer={
            <>
              {error && <span className="form-error">{error}</span>}
              <span className="spacer" />
              <button onClick={() => setDraft(null)}>취소</button>
              <button className="primary" onClick={save}>
                저장
                {!draft.id && draft.dates.length * draft.employeeIds.length > 1
                  ? ` (${draft.employeeIds.length}명 × ${draft.dates.length}일)`
                  : ''}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <div className="full-row">
              <div className="emp-chips">
                <span className="chips-label">직원</span>
                {employees.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    className={`chip${draft.employeeIds.includes(e.id) ? ' active' : ''}`}
                    onClick={() => toggleEmployee(e.id)}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
              {!draft.id && (
                <p className="hint">
                  직원을 여러 명 누르면 한 번에 등록되고, 아래에서 직원마다 시간을 따로 넣을 수 있습니다.
                  ({draft.employeeIds.length}명 선택)
                </p>
              )}
            </div>
            <div className="full-row">
              <MiniCalendar
                calMonth={draft.calMonth}
                selected={draft.dates}
                existing={
                  new Set(
                    data.entries
                      .filter(
                        (e) => draft.employeeIds.includes(e.employeeId) && e.id !== draft.id,
                      )
                      .map((e) => e.date),
                  )
                }
                onToggle={toggleDate}
                onMonth={(m) => setDraft({ ...draft, calMonth: m })}
              />
              <p className="hint">
                {draft.id
                  ? '날짜를 누르면 이 기록의 날짜가 바뀝니다.'
                  : `날짜를 여러 개 누르면 한 번에 등록됩니다. (${draft.dates.length}일 선택)`}
                {' '}점이 있는 날은 이미 기록이 있는 날입니다.
              </p>
            </div>
            <label>기록 방식
              <select
                value={draft.mode}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value as Mode })}
              >
                <option value="sessions">수업 횟수</option>
                <option value="times">출퇴근 시각</option>
                <option value="dc">DC 업무</option>
                <option value="custom">금액 직접 입력</option>
              </select>
            </label>
            <label>메모
              <input
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
              />
            </label>
            <div className="full-row">
              {draft.employeeIds.length === 0 ? (
                <p className="hint">위에서 직원을 선택하면 입력 칸이 나옵니다.</p>
              ) : (
                draft.employeeIds.map((id) => renderEmpRow(id, draft.employeeIds.length > 1))
              )}
            </div>
          </div>
          {draft.mode === 'custom' ? (
            <p className="hint">
              입력한 금액이 그날 급여로 그대로 지급됩니다.
              시간 계산이 없어 준비시간·주휴·연장에는 포함되지 않습니다.
            </p>
          ) : draft.mode === 'dc' ? (
            <p className="hint">
              DC 업무는 입력한 시간 × 직원별 DC 시급으로 계산합니다.
              (DC 시급은 직원 탭에서 설정, 비우면 기본 시급)
            </p>
          ) : draft.mode === 'sessions' ? (
            <p className="hint">
              수업 1회 = {fmtMinutes(data.settings.minutesPerSession)} 근무로 계산합니다.
              지각한 날은 준비시간에서 {data.settings.latePrepDeductMinutes}분을 차감합니다.
            </p>
          ) : (
            <p className="hint">
              퇴근 시각이 출근보다 빠르면 다음 날 퇴근(자정 넘김)으로 계산합니다.
              지각한 날은 준비시간에서 {data.settings.latePrepDeductMinutes}분을 차감합니다.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

interface MiniCalendarProps {
  calMonth: MonthStr;
  selected: DateStr[];
  /** 이미 근무 기록이 있는 날 (표시용 점) */
  existing: Set<DateStr>;
  onToggle: (d: DateStr) => void;
  onMonth: (m: MonthStr) => void;
}

function MiniCalendar({ calMonth, selected, existing, onToggle, onMonth }: MiniCalendarProps) {
  const days = monthDates(calMonth);
  const firstDow = fromDateStr(days[0]).getDay(); // 0=일
  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <button type="button" onClick={() => onMonth(addMonths(calMonth, -1))} aria-label="이전 달">◀</button>
        <strong>{monthTitle(calMonth)}</strong>
        <button type="button" onClick={() => onMonth(addMonths(calMonth, 1))} aria-label="다음 달">▶</button>
      </div>
      <div className="mini-cal-grid">
        {DOW_LABELS.map((d) => (
          <div key={d} className="mini-cal-dow">{d}</div>
        ))}
        {Array.from({ length: firstDow }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {days.map((d) => (
          <button
            type="button"
            key={d}
            className={[
              'mini-cal-day',
              selected.includes(d) ? 'selected' : '',
              existing.has(d) ? 'has-entry' : '',
              d === today() ? 'today' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onToggle(d)}
          >
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}
