import { useState } from 'react';
import type { Employee, PayslipData, PayType } from '../types';
import { PAY_TYPE_LABELS } from '../types';
import { newId } from '../lib/id';
import { fmtWon } from '../lib/format';
import { Modal } from './Modal';

interface Props {
  data: PayslipData;
  update: (updater: (prev: PayslipData) => PayslipData) => void;
}

interface Draft {
  id?: string;
  name: string;
  hourlyWage: string;
  payType: PayType;
  weeklyAllowance: boolean;
  joinDate: string;
  phone: string;
  bank: string;
  memo: string;
}

const emptyDraft = (minWage: number): Draft => ({
  name: '',
  hourlyWage: String(minWage),
  payType: 'freelance',
  weeklyAllowance: true,
  joinDate: '',
  phone: '',
  bank: '',
  memo: '',
});

export function EmployeesTab({ data, update }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const active = data.employees.filter((e) => !e.archived);
  const archived = data.employees.filter((e) => e.archived);

  function openNew() {
    setError('');
    setDraft(emptyDraft(data.settings.minWage));
  }

  function openEdit(e: Employee) {
    setError('');
    setDraft({
      id: e.id,
      name: e.name,
      hourlyWage: String(e.hourlyWage),
      payType: e.payType,
      weeklyAllowance: e.weeklyAllowance,
      joinDate: e.joinDate ?? '',
      phone: e.phone ?? '',
      bank: e.bank ?? '',
      memo: e.memo ?? '',
    });
  }

  function save() {
    if (!draft) return;
    const name = draft.name.trim();
    const wage = Number(draft.hourlyWage);
    if (!name) {
      setError('이름을 입력하세요.');
      return;
    }
    if (!Number.isFinite(wage) || wage <= 0) {
      setError('시급을 숫자로 입력하세요.');
      return;
    }
    const fields = {
      name,
      hourlyWage: wage,
      payType: draft.payType,
      weeklyAllowance: draft.weeklyAllowance,
      joinDate: draft.joinDate || undefined,
      phone: draft.phone.trim() || undefined,
      bank: draft.bank.trim() || undefined,
      memo: draft.memo.trim() || undefined,
    };
    update((prev) => ({
      ...prev,
      employees: draft.id
        ? prev.employees.map((e) => (e.id === draft.id ? { ...e, ...fields } : e))
        : [...prev.employees, { id: newId('emp-'), ...fields }],
    }));
    setDraft(null);
  }

  function setArchived(id: string, value: boolean) {
    update((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, archived: value } : e)),
    }));
  }

  function remove(e: Employee) {
    const count = data.entries.filter((x) => x.employeeId === e.id).length;
    const msg =
      count > 0
        ? `${e.name} 님과 근무 기록 ${count}건을 모두 삭제합니다. 되돌릴 수 없습니다.`
        : `${e.name} 님을 삭제합니다.`;
    if (!window.confirm(msg)) return;
    update((prev) => ({
      ...prev,
      employees: prev.employees.filter((x) => x.id !== e.id),
      entries: prev.entries.filter((x) => x.employeeId !== e.id),
      adjustments: prev.adjustments.filter((x) => x.employeeId !== e.id),
    }));
  }

  function renderRow(e: Employee) {
    return (
      <tr key={e.id} className={e.archived ? 'muted-row' : undefined}>
        <td>{e.name}</td>
        <td className="num">{fmtWon(e.hourlyWage)}</td>
        <td>{PAY_TYPE_LABELS[e.payType]}</td>
        <td>{e.weeklyAllowance ? '자동' : '없음'}</td>
        <td>{e.bank ?? ''}</td>
        <td>{e.memo ?? ''}</td>
        <td className="actions">
          <button onClick={() => openEdit(e)}>수정</button>
          {e.archived ? (
            <>
              <button onClick={() => setArchived(e.id, false)}>복구</button>
              <button className="danger-ghost" onClick={() => remove(e)}>삭제</button>
            </>
          ) : (
            <button className="danger-ghost" onClick={() => setArchived(e.id, true)}>보관</button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="tab-body">
      <div className="section-head">
        <h2>직원 ({active.length}명)</h2>
        <button className="primary" onClick={openNew}>+ 직원 추가</button>
      </div>
      {active.length === 0 && archived.length === 0 ? (
        <p className="empty">아직 직원이 없습니다. 먼저 직원을 추가하세요.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>이름</th><th>시급</th><th>공제 방식</th><th>주휴수당</th><th>계좌</th><th>메모</th><th></th>
            </tr>
          </thead>
          <tbody>
            {active.map(renderRow)}
            {archived.length > 0 && (
              <tr className="group-row"><td colSpan={7}>보관됨 ({archived.length}명)</td></tr>
            )}
            {archived.map(renderRow)}
          </tbody>
        </table>
      )}

      {draft && (
        <Modal
          title={draft.id ? '직원 수정' : '직원 추가'}
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
            <label>이름
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </label>
            <label>시급 (원)
              <input
                type="number"
                min={0}
                step={10}
                value={draft.hourlyWage}
                onChange={(e) => setDraft({ ...draft, hourlyWage: e.target.value })}
              />
            </label>
            <label>공제 방식
              <select
                value={draft.payType}
                onChange={(e) => setDraft({ ...draft, payType: e.target.value as PayType })}
              >
                {Object.entries(PAY_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.weeklyAllowance}
                onChange={(e) => setDraft({ ...draft, weeklyAllowance: e.target.checked })}
              />
              주휴수당 자동 계산 (주 15시간 이상인 주)
            </label>
            <label>입사일
              <input
                type="date"
                value={draft.joinDate}
                onChange={(e) => setDraft({ ...draft, joinDate: e.target.value })}
              />
            </label>
            <label>연락처
              <input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="010-0000-0000"
              />
            </label>
            <label>지급 계좌
              <input
                value={draft.bank}
                onChange={(e) => setDraft({ ...draft, bank: e.target.value })}
                placeholder="예: 국민 123456-78-901234"
              />
            </label>
            <label>메모
              <input
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
