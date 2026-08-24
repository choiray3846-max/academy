import { Modal } from './Modal';
import { BLOCKS_PER_DAY, BLOCK_NAMES, DAYS_PER_WEEK, DAY_LABELS, slotKey } from '../types';

interface AvailabilityEditorProps {
  title: string;
  /** '요일-교시' 키 목록 */
  value: string[];
  weekdayTimes: string[];
  saturdayTimes: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

/** 월~토 × A/B/C 가능 시간 체크판 */
export function AvailabilityEditor({
  title,
  value,
  weekdayTimes,
  saturdayTimes,
  onChange,
  onClose,
}: AvailabilityEditorProps) {
  const set = new Set(value);

  function toggle(key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next].sort());
  }

  function toggleDay(d: number) {
    const keys = Array.from({ length: BLOCKS_PER_DAY }, (_, b) => slotKey(d, b));
    const allOn = keys.every((k) => set.has(k));
    const next = new Set(set);
    for (const k of keys) {
      if (allOn) next.delete(k);
      else next.add(k);
    }
    onChange([...next].sort());
  }

  function setAll(on: boolean) {
    if (!on) return onChange([]);
    const all: string[] = [];
    for (let d = 0; d < DAYS_PER_WEEK; d++)
      for (let b = 0; b < BLOCKS_PER_DAY; b++) all.push(slotKey(d, b));
    onChange(all);
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={() => setAll(true)}>전체 선택</button>
          <button onClick={() => setAll(false)}>전체 해제</button>
          <button className="primary" onClick={onClose}>완료</button>
        </>
      }
    >
      <table className="avail-table">
        <thead>
          <tr>
            <th></th>
            {DAY_LABELS.map((label, d) => (
              <th key={d}>
                <button className="mini" onClick={() => toggleDay(d)} title="요일 전체 선택/해제">
                  {label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BLOCK_NAMES.map((name, b) => (
            <tr key={b}>
              <th className="avail-block">
                {name}
                <small>{weekdayTimes[b]}</small>
              </th>
              {DAY_LABELS.map((_, d) => {
                const key = slotKey(d, b);
                const on = set.has(key);
                return (
                  <td key={d}>
                    <button
                      className={`avail-cell${on ? ' on' : ''}`}
                      onClick={() => toggle(key)}
                      aria-pressed={on}
                    >
                      {on ? '✓' : ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        토요일 시간대: A {saturdayTimes[0]} · B {saturdayTimes[1]} · C {saturdayTimes[2]}.
        요일 글자를 누르면 그 요일 전체가 선택/해제됩니다.
      </p>
    </Modal>
  );
}
