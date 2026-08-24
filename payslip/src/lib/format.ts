/** 123456 → '123,456원' */
export function fmtWon(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

/** 분 → '12시간 30분' (0이면 '0시간') */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (min === 0) return '0시간';
  if (m === 0) return `${h}시간`;
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

/** 분 → '12.5h' 같은 짧은 표기 */
export function fmtHoursShort(min: number): string {
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}
