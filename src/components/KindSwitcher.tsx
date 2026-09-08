import type { ItemKind } from '../types';

const KIND_OPTIONS: { kind: Exclude<ItemKind, 'class'>; label: string }[] = [
  { kind: 'event', label: '행사·일정' },
  { kind: 'shift', label: '근무·휴무' },
  { kind: 'consult', label: '상담 예약' },
  { kind: 'misc', label: '기타' },
];

interface KindSwitcherProps {
  current: Exclude<ItemKind, 'class'>;
  onChange: (kind: Exclude<ItemKind, 'class'>) => void;
}

/**
 * 이미 저장된 일정의 종류를 바꾸는 칩 줄.
 * 다른 종류를 누르면 날짜·시간·내용을 옮겨 담은 새 창이 열리고,
 * 그 창에서 저장할 때 원래 항목이 교체된다 (취소하면 그대로).
 */
export function KindSwitcher({ current, onChange }: KindSwitcherProps) {
  return (
    <div className="field">
      <label>종류 바꾸기</label>
      <div className="check-row" style={{ gap: 4 }}>
        {KIND_OPTIONS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            className={`chip${current === kind ? ' active' : ''}`}
            onClick={() => {
              if (kind !== current) onChange(kind);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
        다른 종류를 고르면 내용을 옮겨 담은 새 창이 열리고, 거기서 저장하면 이 항목이 바뀝니다.
      </span>
    </div>
  );
}
