/** 原型 utils/customScoreOptions.js 的忠实移植（unpacked/app-service.js @565700）。
 *  自定义每局分数：合法值 3..50 整数 + 55/60/65/70/80/90/100，默认 7。 */
export const CUSTOM_SCORE_MIN = 3;
export const CUSTOM_SCORE_MAX = 100;
export const CUSTOM_SCORE_DEFAULT = 7;

const EXTRA_TAIL = [55, 60, 65, 70, 80, 90, 100];

/** 原型 CUSTOM_SCORE_VALUES：3..50 全部整数，再追加大分值尾部 */
export const CUSTOM_SCORE_VALUES: number[] = (() => {
  const v: number[] = [];
  for (let i = 3; i <= 50; i++) v.push(i);
  for (const x of EXTRA_TAIL) v.push(x);
  return v;
})();

export const CUSTOM_SCORE_SELECTOR_RANGE = CUSTOM_SCORE_VALUES.map(String);
export const CUSTOM_SCORE_LIST = CUSTOM_SCORE_VALUES.map((v) => ({ label: String(v), value: v }));

export function customScoreIndexOf(r: number): number {
  const n = Math.floor(Number(r));
  if (!Number.isFinite(n)) return -1;
  for (let i = 0; i < CUSTOM_SCORE_VALUES.length; i++) {
    if (CUSTOM_SCORE_VALUES[i] === n) return i;
  }
  return -1;
}

/** 原型 normalizeCustomScore：非法值回退默认；越界钳到 3..100；合法值吸附到最近合法分值 */
export function normalizeCustomScore(e: number, fallback?: number): number {
  const def = fallback != null ? fallback : CUSTOM_SCORE_DEFAULT;
  const u = Math.floor(Number(e));
  if (!Number.isFinite(u)) return def;
  if (u < CUSTOM_SCORE_MIN) return CUSTOM_SCORE_MIN;
  if (u > CUSTOM_SCORE_MAX) return CUSTOM_SCORE_MAX;
  if (customScoreIndexOf(u) >= 0) return u;
  // 吸附到最近合法值（距离相等取较小者）
  let best = CUSTOM_SCORE_VALUES[0];
  let dist = Math.abs(u - best);
  for (let i = 1; i < CUSTOM_SCORE_VALUES.length; i++) {
    const f = CUSTOM_SCORE_VALUES[i];
    const d = Math.abs(u - f);
    if (d < dist || (d === dist && f < best)) { best = f; dist = d; }
  }
  return best;
}

export function customScoreFromPickerIndex(e: number): number {
  const n = Math.floor(Number(e));
  if (!Number.isFinite(n) || n < 0 || n >= CUSTOM_SCORE_VALUES.length) return CUSTOM_SCORE_DEFAULT;
  return CUSTOM_SCORE_VALUES[n];
}

export function defaultCustomScoreIndex(): number {
  const i = customScoreIndexOf(CUSTOM_SCORE_DEFAULT);
  return i >= 0 ? i : 0;
}
