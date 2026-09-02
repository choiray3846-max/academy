import { useMemo, useState } from 'react';
import type { Employee, MonthStr, PayslipData } from '../types';
import { PAY_TYPE_LABELS } from '../types';
import { monthTitle, shortDate, weekLabel } from '../lib/date';
import { calcPayslip, parseTime, type Payslip } from '../lib/payroll';
import { fmtMinutes, fmtWon } from '../lib/format';
import { newId } from '../lib/id';

interface Props {
  data: PayslipData;
  month: MonthStr;
  update: (updater: (prev: PayslipData) => PayslipData) => void;
}

export function PayslipTab({ data, month, update }: Props) {
  const employees = data.employees.filter((e) => !e.archived);
  const [employeeId, setEmployeeId] = useState('');
  const [printAll, setPrintAll] = useState(false);
  const selected = employees.find((e) => e.id === employeeId) ?? employees[0];

  const slips: Payslip[] = useMemo(() => {
    const targets = printAll ? employees : selected ? [selected] : [];
    return targets
      .map((e) => calcPayslip(data, e, month))
      .filter((s) => printAll ? s.entries.length > 0 || s.grossPay > 0 : true);
  }, [data, employees, selected, month, printAll]);

  if (employees.length === 0) {
    return (
      <div className="tab-body">
        <p className="empty">직원 탭에서 직원을 추가하면 명세서를 만들 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="tab-body">
      <div className="section-head no-print">
        <h2>급여 명세서</h2>
        <select
          value={selected?.id ?? ''}
          onChange={(e) => setEmployeeId(e.target.value)}
          disabled={printAll}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={printAll}
            onChange={(e) => setPrintAll(e.target.checked)}
          />
          전체 직원 일괄
        </label>
        <span className="spacer" />
        <button className="primary" onClick={() => window.print()}>인쇄 / PDF 저장</button>
      </div>

      {!printAll && selected && (
        <AdjustmentEditor data={data} month={month} employee={selected} update={update} />
      )}

      <div className="print-area">
        {slips.length === 0 && (
          <p className="empty no-print">이 달에 지급할 내역이 있는 직원이 없습니다.</p>
        )}
        {slips.map((slip) => (
          <PayslipDoc key={slip.employee.id} slip={slip} data={data} />
        ))}
      </div>
    </div>
  );
}

function AdjustmentEditor({
  data,
  month,
  employee,
  update,
}: Props & { employee: Employee }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'pay' | 'deduct'>('pay');

  const items = data.adjustments.filter(
    (a) => a.employeeId === employee.id && a.month === month,
  );

  function add() {
    const value = Number(amount);
    if (!label.trim() || !Number.isFinite(value) || value <= 0) {
      window.alert('항목명과 0보다 큰 금액을 입력하세요.');
      return;
    }
    update((prev) => ({
      ...prev,
      adjustments: [
        ...prev.adjustments,
        { id: newId('adj-'), employeeId: employee.id, month, label: label.trim(), amount: value, kind },
      ],
    }));
    setLabel('');
    setAmount('');
  }

  function remove(id: string) {
    update((prev) => ({
      ...prev,
      adjustments: prev.adjustments.filter((a) => a.id !== id),
    }));
  }

  return (
    <div className="adjust-panel no-print">
      <strong>추가 지급·공제</strong>
      {items.map((a) => (
        <span key={a.id} className={`chip adj ${a.kind}`}>
          {a.kind === 'pay' ? '+' : '−'} {a.label} {fmtWon(a.amount)}
          <button className="icon" onClick={() => remove(a.id)} aria-label="삭제">×</button>
        </span>
      ))}
      <select value={kind} onChange={(e) => setKind(e.target.value as 'pay' | 'deduct')}>
        <option value="pay">지급</option>
        <option value="deduct">공제</option>
      </select>
      <input
        placeholder="항목명 (예: 상여금, 소득세)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <input
        type="number"
        placeholder="금액"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button onClick={add}>추가</button>
    </div>
  );
}

function PayslipDoc({ slip, data }: { slip: Payslip; data: PayslipData }) {
  const { employee, month } = slip;
  const s = data.settings;
  const wage = employee.hourlyWage;

  const payRows: Array<{ label: string; detail: string; amount: number }> = [
    {
      label: '기본급',
      detail: `${fmtMinutes(slip.workMinutes)} × ${fmtWon(wage)}`,
      amount: slip.basePay,
    },
  ];
  if (slip.overtimePay > 0) {
    payRows.push({
      label: '연장근로수당',
      detail: `${fmtMinutes(slip.overtimeMinutes)} × ${fmtWon(wage)} × 50%`,
      amount: slip.overtimePay,
    });
  }
  if (slip.nightPay > 0) {
    payRows.push({
      label: '야간근로수당',
      detail: `${fmtMinutes(slip.nightMinutes)} × ${fmtWon(wage)} × 50%`,
      amount: slip.nightPay,
    });
  }
  if (slip.allowancePay > 0) {
    payRows.push({
      label: '주휴수당',
      detail: `${fmtMinutes(slip.allowanceMinutes)} × ${fmtWon(wage)}`,
      amount: slip.allowancePay,
    });
  }
  if (slip.prepPay > 0) {
    const lateDetail =
      slip.prepLateDays > 0
        ? ` − 지각 ${slip.prepLateDays}일 × ${fmtMinutes(s.latePrepDeductMinutes)}`
        : '';
    payRows.push({
      label: '준비시간',
      detail: `(출근 ${slip.prepDays}일 × ${fmtMinutes(s.prepMinutesPerDay)}${lateDetail}) × ${fmtWon(employee.prepWage ?? wage)}`,
      amount: slip.prepPay,
    });
  }
  if (slip.dcPay > 0) {
    payRows.push({
      label: 'DC 업무',
      detail: `${fmtMinutes(slip.dcMinutes)} × ${fmtWon(employee.dcWage ?? wage)}`,
      amount: slip.dcPay,
    });
  }
  if (slip.customPayTotal > 0) {
    payRows.push({
      label: '직접 입력 지급',
      detail: `${slip.customPayCount}건`,
      amount: slip.customPayTotal,
    });
  }
  for (const a of slip.extraPays) {
    payRows.push({ label: a.label, detail: '추가 지급', amount: a.amount });
  }

  const deductRows = [
    ...slip.deductions.map((d) => ({ label: d.label, amount: d.amount })),
    ...slip.extraDeducts.map((a) => ({ label: a.label, amount: a.amount })),
  ];

  return (
    <div className="payslip">
      <h3 className="payslip-title">{monthTitle(month)} 급여명세서</h3>
      <table className="payslip-meta">
        <tbody>
          <tr>
            <th>사업장</th>
            <td>{s.businessName}{s.ownerName ? ` (대표: ${s.ownerName})` : ''}</td>
            <th>성명</th>
            <td>{employee.name}</td>
          </tr>
          <tr>
            <th>시급</th>
            <td>
              {fmtWon(wage)}
              {employee.prepWage != null && employee.prepWage !== wage
                ? ` (준비 ${fmtWon(employee.prepWage)})`
                : ''}
              {employee.dcWage != null && employee.dcWage !== wage
                ? ` (DC ${fmtWon(employee.dcWage)})`
                : ''}
            </td>
            <th>공제 방식</th>
            <td>{PAY_TYPE_LABELS[employee.payType]}</td>
          </tr>
          {employee.bank && (
            <tr>
              <th>지급 계좌</th>
              <td colSpan={3}>{employee.bank}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="payslip-cols">
        <table className="payslip-table">
          <thead>
            <tr><th colSpan={2}>지급 내역</th><th>금액</th></tr>
          </thead>
          <tbody>
            {payRows.map((r, i) => (
              <tr key={i}>
                <td>{r.label}</td>
                <td className="detail">{r.detail}</td>
                <td className="num">{fmtWon(r.amount)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={2}>지급 합계</td>
              <td className="num">{fmtWon(slip.grossPay)}</td>
            </tr>
          </tbody>
        </table>

        <table className="payslip-table">
          <thead>
            <tr><th>공제 내역</th><th>금액</th></tr>
          </thead>
          <tbody>
            {deductRows.length === 0 && (
              <tr><td>공제 없음</td><td className="num">0원</td></tr>
            )}
            {deductRows.map((r, i) => (
              <tr key={i}>
                <td>{r.label}</td>
                <td className="num">{fmtWon(r.amount)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td>공제 합계</td>
              <td className="num">{fmtWon(slip.totalDeduction)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="payslip-net">
        실지급액 <strong>{fmtWon(slip.netPay)}</strong>
      </div>

      {slip.entries.length > 0 && (
        <table className="payslip-table work-detail">
          <thead>
            <tr><th>근무일</th><th>출근</th><th>퇴근</th><th>휴게</th><th>근무</th><th>야간</th></tr>
          </thead>
          <tbody>
            {slip.entries.map((c) => {
              const e = c.entry;
              const overnight =
                !e.sessions && (parseTime(e.end ?? '') ?? 0) <= (parseTime(e.start ?? '') ?? 0);
              return (
                <tr key={e.id}>
                  <td>
                    {shortDate(e.date)}
                    {e.late && <span className="late-badge">지각</span>}
                  </td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {slip.weeks.length > 0 && (
        <table className="payslip-table work-detail">
          <thead>
            <tr><th>주 (월~일)</th><th>근무</th><th>DC</th><th>준비</th><th>연장</th><th>주휴</th></tr>
          </thead>
          <tbody>
            {slip.weeks.map((w) => (
              <tr key={w.weekStart}>
                <td>{weekLabel(w.weekStart)}</td>
                <td className="num">{fmtMinutes(w.minutes)}</td>
                <td className="num">{w.dcMinutes > 0 ? fmtMinutes(w.dcMinutes) : '-'}</td>
                <td className="num">{w.prepMinutes > 0 ? fmtMinutes(w.prepMinutes) : '-'}</td>
                <td className="num">{w.overtimeMinutes > 0 ? fmtMinutes(w.overtimeMinutes) : '-'}</td>
                <td className="num">{w.allowanceMinutes > 0 ? fmtMinutes(w.allowanceMinutes) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="payslip-note">
        연장·주휴수당은 주(월~일) 단위로 계산해 그 주 일요일이 속한 달에 반영합니다.
        주휴는 근무·DC 업무·준비시간을 모두 합한 시간(주 15시간 이상)으로 판정하고,
        연장은 수업·출퇴근 근무시간만으로 계산합니다.
        {slip.dcPay > 0 && ' DC 업무 급여는 DC 시급으로 따로 계산합니다.'}
        {!s.over5 && ' 5인 미만 사업장 설정으로 연장·야간 가산수당은 적용하지 않았습니다.'}
      </p>

      {slip.warnings.length > 0 && (
        <ul className="payslip-warnings no-print">
          {slip.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
