/** 乒乓球单局计分核心规则（从 MatchScreen 迁入的纯函数，便于离线测试）。
 *  对应原版 pages/score/lib/pingpong_rules.js 与 @214089/@214255。 */

export type Side = 'A' | 'B';

export const otherSide = (s: Side): Side => (s === 'A' ? 'B' : 'A');

/** 原版 pingpong_rules.js o()：deuce 或 expedite → 每分换发(total%2)，否则每 interval 分换发 */
export function serverAt(
  scoreA: number, scoreB: number, start: Side, interval: number,
  target: number, winByTwo: boolean, expedite = false,
): Side {
  const total = scoreA + scoreB;
  const deuce = winByTwo && scoreA >= target - 1 && scoreB >= target - 1;
  if (deuce || expedite) {
    return total % 2 === 0 ? start : otherSide(start);   // 局末/轮换发球法：每分换发
  }
  return Math.floor(total / Math.max(1, interval)) % 2 === 0 ? start : otherSide(start);
}

/** 原版 pingpongGameStartServeHomeFromState：从"当前比分 + 期望当前发球方"反推本局首发基准。
 *  用于手动换发 / 开关轮换发球法时固定 gameStartServeHome。 */
export function startServerFromServe(
  a: number, b: number, interval: number, target: number,
  winByTwo: boolean, currentServe: Side, expedite: boolean,
): Side {
  return serverAt(a, b, 'A', interval, target, winByTwo, expedite) === currentServe ? 'A' : 'B';
}

/** 原版 @467834：下一局首发 g = (homeGamesWon + awayGamesWon) % 2 == 0 ? home : away */
export function nextGameStartServer(gamesA: number, gamesB: number): Side {
  return (gamesA + gamesB) % 2 === 0 ? 'A' : 'B';
}

export type Callout = '' | '局点' | '赛点' | '胜';

/** 原版 rt/st（@214089）：本局是否已获胜。
 *  winByTwo: (a>=target && a-b>=2) || (a===cap && b===cap-1)；否则 a>=target && a>b。 */
export function isGameWon(a: number, b: number, target: number, winByTwo: boolean, cap: number): boolean {
  if (winByTwo) {
    return (a === cap && b === cap - 1) || (a >= target && a - b >= 2 && a <= cap);
  }
  return a >= target && a > b && a <= cap;
}

/** 原版 ct()（@214255）：计算双方 callout（局点/赛点/胜）与已胜方。
 *  已达局分→"胜"；下一分即胜→"局点"，若该方局数+1已达标→"赛点"。 */
export function computeCallouts(
  a: number, b: number, target: number, cap: number, winByTwo: boolean,
  gamesA: number, gamesB: number, winsRequired: number,
): { home: Callout; away: Callout; winner: Side | null } {
  if (isGameWon(a, b, target, winByTwo, cap)) return { home: '胜', away: '', winner: 'A' };
  if (isGameWon(b, a, target, winByTwo, cap)) return { home: '', away: '胜', winner: 'B' };
  if (a >= cap || b >= cap) return { home: '', away: '', winner: null };
  const homeNext = isGameWon(a + 1, b, target, winByTwo, cap);
  const awayNext = isGameWon(b + 1, a, target, winByTwo, cap);
  return {
    home: homeNext ? (gamesA + 1 >= winsRequired ? '赛点' : '局点') : '',
    away: awayNext ? (gamesB + 1 >= winsRequired ? '赛点' : '局点') : '',
    winner: null,
  };
}
