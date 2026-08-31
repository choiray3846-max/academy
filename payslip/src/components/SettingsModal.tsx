import { useState } from 'react';
import type { PayslipData, Settings } from '../types';
import { Modal } from './Modal';

interface Props {
  settings: Settings;
  update: (updater: (prev: PayslipData) => PayslipData) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, update, onClose }: Props) {
  const [draft, setDraft] = useState<Settings>(structuredClone(settings));

  function save() {
    update((prev) => ({ ...prev, settings: draft }));
    onClose();
  }

  const setRate = (key: keyof Settings['rates'], value: string) =>
    setDraft({ ...draft, rates: { ...draft.rates, [key]: Number(value) || 0 } });

  return (
    <Modal
      title="설정"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={save}>저장</button>
        </>
      }
    >
      <div className="form-grid">
        <label>사업장명
          <input
            value={draft.businessName}
            onChange={(e) => setDraft({ ...draft, businessName: e.target.value })}
          />
        </label>
        <label>대표자
          <input
            value={draft.ownerName}
            onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.over5}
            onChange={(e) => setDraft({ ...draft, over5: e.target.checked })}
          />
          상시 5인 이상 사업장 (연장·야간 가산수당 50% 적용)
        </label>
        <label>최저시급 (원, 경고 표시용)
          <input
            type="number"
            min={0}
            value={draft.minWage}
            onChange={(e) => setDraft({ ...draft, minWage: Number(e.target.value) || 0 })}
          />
        </label>
        <label>수업 1회당 근무시간 (분)
          <input
            type="number"
            min={1}
            step={5}
            value={draft.minutesPerSession}
            onChange={(e) =>
              setDraft({ ...draft, minutesPerSession: Number(e.target.value) || 90 })
            }
          />
        </label>
        <label>출근일당 준비시간 (분)
          <input
            type="number"
            min={0}
            step={5}
            value={draft.prepMinutesPerDay}
            onChange={(e) =>
              setDraft({ ...draft, prepMinutesPerDay: Number(e.target.value) || 0 })
            }
          />
        </label>
      </div>
      <h3 className="form-section">4대보험 근로자 부담 요율 (%)</h3>
      <p className="hint">요율은 해마다 바뀝니다. 고지된 요율에 맞춰 수정하세요.</p>
      <div className="form-grid">
        <label>국민연금
          <input type="number" step={0.001} value={draft.rates.nationalPension}
            onChange={(e) => setRate('nationalPension', e.target.value)} />
        </label>
        <label>건강보험
          <input type="number" step={0.001} value={draft.rates.healthInsurance}
            onChange={(e) => setRate('healthInsurance', e.target.value)} />
        </label>
        <label>장기요양 (건보료 대비)
          <input type="number" step={0.001} value={draft.rates.longTermCare}
            onChange={(e) => setRate('longTermCare', e.target.value)} />
        </label>
        <label>고용보험
          <input type="number" step={0.001} value={draft.rates.employmentInsurance}
            onChange={(e) => setRate('employmentInsurance', e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
