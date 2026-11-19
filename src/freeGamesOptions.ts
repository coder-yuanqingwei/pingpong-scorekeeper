/** 原型 utils/freeGamesOptions.js 的忠实移植（unpacked/app-service.js @796700）。
 *  「自由」赛制：不设胜局上限（winsRequired 9999），最多打 100 局（CAP）。 */
export const FREE_GAMES_COUNTS = [0, 7, 9, 11, 13, 15];
export const FREE_GAMES_IDLE_LABEL = '更多';
export const FREE_GAMES_RADIO_LABELS = ['自由', '7局4胜', '9局5胜', '11局6胜', '13局7胜', '15局8胜'];
export const FREE_GAMES_WINS_REQUIRED = [9999, 4, 5, 6, 7, 8];
/** 原型 FREE_GAMES_SELECTOR_RANGE：下拉选择器的选项（截图弹窗即此列表） */
export const FREE_GAMES_SELECTOR_RANGE = ['自由（封顶100局）', '7局4胜', '9局5胜', '11局6胜', '13局7胜', '15局8胜'];
export const FREE_GAMES_CAP = 100;
/** 自由模式的胜局要求哨兵值（原型 9999 = 不设上限） */
export const FREE_WINS_REQUIRED = 9999;

export function clampFreeGamesPickerIndex(r: number): number {
  const n = Math.floor(Number(r));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n >= FREE_GAMES_COUNTS.length ? FREE_GAMES_COUNTS.length - 1 : n;
}

export function gamesCountFromFreePickerIndex(r: number): number {
  return FREE_GAMES_COUNTS[clampFreeGamesPickerIndex(r)];
}

export function freeGamesRadioLabelFromIndex(r: number): string {
  return FREE_GAMES_RADIO_LABELS[clampFreeGamesPickerIndex(r)];
}

export function winsRequiredFromFreePickerIndex(r: number): number {
  return FREE_GAMES_WINS_REQUIRED[clampFreeGamesPickerIndex(r)];
}
