// 让分机制：按对阵类型给出推荐让局数（原 App 区分 MD/XD/WD 等组合）

export const EVENT_TYPES = [
  { key: 'MS', label: '男单' },
  { key: 'WS', label: '女单' },
  { key: 'MD', label: '男双' },
  { key: 'XD', label: '混双' },
  { key: 'WD', label: '女双' },
] as const;

export type EventTypeKey = (typeof EVENT_TYPES)[number]['key'];

const STRENGTH: Record<string, number> = { MS: 4, MD: 4, WS: 2, XD: 3, WD: 2 };

/** 推荐让局：数值 = 强方需多赢的局数（0 表示平分） */
export function recommendHandicap(typeA: string, typeB: string): number {
  const sa = STRENGTH[typeA] ?? 3;
  const sb = STRENGTH[typeB] ?? 3;
  const diff = sa - sb;
  if (diff >= 3) return 2;
  if (diff >= 1) return 1;
  return 0;
}

export function handicapLabel(h: number): string {
  return h === 0 ? '不让分' : `让 ${h} 局`;
}
