/** 짧고 충돌 가능성이 낮은 로컬 ID 생성기 */
export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-6);
  return `${prefix}${time}${rand}`;
}
