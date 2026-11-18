import { createRng, type Rng } from './random';
import type { StandingRow, StandingResult } from './types';

export type Pair = [number, number];

// 圆桌轮转（Berger tables）：固定首位，其余顺时针旋转
function circleMethod(n: number): Pair[][] {
  const size = n % 2 === 0 ? n : n + 1; // 奇数补虚拟队，索引 = n
  const arr = Array.from({ length: size }, (_, i) => i);
  const rounds: Pair[][] = [];
  for (let r = 0; r < size - 1; r++) {
    const pairs: Pair[] = [];
    for (let i = 0; i < size / 2; i++) {
      const a = arr[i] as number;
      const b = arr[size - 1 - i] as number;
      if (a < n && b < n) pairs.push([a, b]); // 跳过虚拟队 = 轮空
    }
    rounds.push(pairs);
    const last = arr.pop() as number;
    arr.splice(1, 0, last); // 末位插到第二位，其余后移
  }
  return rounds;
}

// 小样本启发式：尽量让每轮所有人都上场且配对不重复
function heuristicBalanced(n: number, rng: Rng, attempts = 400): Pair[][] | null {
  const size = n % 2 === 0 ? n : n + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const used = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
    const rounds: Pair[][] = [];
    let ok = true;
    for (let r = 0; r < size - 1; r++) {
      const avail = rng.shuffle(Array.from({ length: size }, (_, i) => i));
      const pairs: Pair[] = [];
      while (avail.length) {
        const a = avail.shift() as number;
        let k = avail.findIndex((b) => !used[a]![b]!);
        if (k < 0) { ok = false; break; }
        const b = avail.splice(k, 1)[0] as number;
        used[a]![b] = true;
        used[b]![a] = true;
        pairs.push([a, b]);
      }
      if (!ok) break;
      rounds.push(pairs.filter(([a, b]) => a < n && b < n));
    }
    if (ok) return rounds;
  }
  return null;
}

export interface RoundRobinOptions {
  balanced?: boolean;
  seed?: number | string;
}

/** 生成循环赛轮次，返回每轮的 (选手索引A, 选手索引B) */
export function roundRobinRounds(n: number, { balanced = true, seed = 1 }: RoundRobinOptions = {}): Pair[][] {
  if (n < 2) return [];
  const rng = createRng(seed);
  if (balanced && n <= 14) {
    const found = heuristicBalanced(n, rng);
    if (found) return found;
  }
  return circleMethod(n);
}

export function roundRobinMatchCount(n: number): number {
  return (n * (n - 1)) / 2;
}

/** 循环赛积分榜 */
export function standings(
  players: string[],
  results: StandingResult[],
  { pointDiff = true }: { pointDiff?: boolean } = {}
): StandingRow[] {
  const table: StandingRow[] = players.map((name, i) => ({
    index: i, name, played: 0, win: 0, loss: 0, pf: 0, pa: 0, diff: 0,
  }));
  for (const r of results) {
    if (r.winner == null || r.a == null || r.b == null) continue;
    const A = table[r.a];
    const B = table[r.b];
    if (!A || !B) continue;
    A.played++; B.played++;
    const winner = r.winner === r.a ? A : B;
    const loser = winner === A ? B : A;
    winner.win++; loser.loss++;
    const scoreA = r.scoreA || 0;
    const scoreB = r.scoreB || 0;
    A.pf += scoreA; A.pa += scoreB;
    B.pf += scoreB; B.pa += scoreA;
  }
  table.forEach((t) => { t.diff = t.pf - t.pa; });
  return table.sort((x, y) =>
    y.win - x.win ||
    (pointDiff ? y.diff - x.diff : y.pf - x.pf) ||
    y.pf - x.pf ||
    x.index - y.index
  );
}
