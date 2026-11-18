import { nextPowerOfTwo, createRng } from './random';
import type { KnockoutMatch, KnockoutSchedule, KnockoutState } from './types';

/** 标准签表种子位置：1/2 号种子分处上下半区，决赛才相遇 */
export function seedOrder(n: number): number[] {
  if (n <= 1) return [0];
  const half = n / 2;
  const prev = seedOrder(half);
  const out: number[] = [];
  for (let i = 0; i < half; i++) {
    out.push(prev[i] as number);
    out.push(n - 1 - (prev[i] as number));
  }
  return out;
}

function swapIn(arr: Array<number | null>, i: number, j: number): void {
  [arr[i], arr[j]] = [arr[j] as number | null, arr[i] as number | null];
}

export interface KnockoutOptions {
  seed?: number | string;
  thirdPlace?: boolean;
  shuffleUnseeded?: boolean;
  seedCount?: number;
}

/**
 * 单败淘汰赛签表。
 * players 按种子顺序传入（第 0 个为 1 号种子）。
 */
export function generateKnockout(
  players: unknown[],
  {
    seed = 1,
    thirdPlace = true,
    shuffleUnseeded = false,
    seedCount,
  }: KnockoutOptions = {}
): KnockoutSchedule {
  const n = players.length;
  if (n < 2) {
    return { rounds: [], bracketSize: n, byes: 0, thirdPlace: null };
  }

  const size = nextPowerOfTwo(n);
  const byes = size - n;
  const protectedSeeds = seedCount == null ? Math.min(2, n) : seedCount;
  const rng = createRng(seed);

  // 选手索引数组：null = 轮空。前 n 个按种子序，后面补轮空
  let slots: Array<number | null> = Array.from({ length: size }, (_, i) => (i < n ? i : null));
  if (shuffleUnseeded && n > protectedSeeds) {
    const unseeded = slots.slice(protectedSeeds).filter((v): v is number => v != null);
    const shuffled = rng.shuffle(unseeded);
    let k = 0;
    slots = slots.map((v) => (v != null && v >= protectedSeeds ? shuffled[k++] as number : v));
  }

  const order = seedOrder(size);
  let bracket: Array<number | null> = order.map((seedIdx) => slots[seedIdx] ?? null);

  // 种子防碰撞：最多 300 次，若前两种子在首轮相遇就打散
  for (let attempt = 0; attempt < 300; attempt++) {
    const collision: number[] = [];
    for (let m = 0; m < size / 2; m++) {
      const a = bracket[2 * m];
      const b = bracket[2 * m + 1];
      if (a != null && b != null && a < protectedSeeds && b < protectedSeeds) {
        collision.push(2 * m + 1);
      }
    }
    if (!collision.length) break;
    const target = collision[0] as number;
    const spare = bracket.findIndex((v, i) =>
      i % 2 === 0 && (v == null || v >= protectedSeeds) && i !== target - 1
    );
    if (spare < 0) break;
    swapIn(bracket, target, spare);
  }

  const matchId = (r: number, m: number) => `R${r + 1}M${m + 1}`;
  const rounds: KnockoutMatch[][] = [];

  // 首轮：轮空者直接晋级
  const first: KnockoutMatch[] = [];
  for (let m = 0; m < size / 2; m++) {
    const a = bracket[2 * m] ?? null;
    const b = bracket[2 * m + 1] ?? null;
    const isBye = a == null || b == null;
    first.push({
      id: matchId(0, m), round: 0, a, b,
      isBye,
      winner: isBye ? (a != null ? a : b) : null,
      next: Math.floor(m / 2),
      slot: m % 2,
    });
  }
  rounds.push(first);

  // 后续轮次：上一轮相邻两场的胜者相遇
  let matchCount = size / 2;
  let r = 1;
  while (matchCount > 1) {
    const cur: KnockoutMatch[] = [];
    for (let m = 0; m < matchCount / 2; m++) {
      cur.push({
        id: matchId(r, m), round: r, a: null, b: null,
        isBye: false, winner: null,
        next: Math.floor(m / 2),
        slot: m % 2,
      });
    }
    rounds.push(cur);
    matchCount /= 2;
    r++;
  }

  // 季军赛：两场半决赛的负者
  let thirdPlaceMatch: KnockoutMatch | null = null;
  if (thirdPlace && rounds.length >= 2) {
    const sf = rounds[rounds.length - 2] as KnockoutMatch[];
    if (sf.length >= 2) {
      thirdPlaceMatch = {
        id: 'THIRD', round: rounds.length, a: null, b: null,
        isBye: false, winner: null, next: null, slot: null,
        from: [
          { match: (sf[0] as KnockoutMatch).id, type: 'loser' },
          { match: (sf[1] as KnockoutMatch).id, type: 'loser' },
        ],
      };
    }
  }

  return {
    rounds,
    bracketSize: size,
    byes,
    thirdPlace: thirdPlaceMatch,
    totalMatches: size - 1 + (thirdPlaceMatch ? 1 : 0),
  };
}

export interface KnockoutResultInput {
  matchId: string;
  winner: number | null;
  scoreA?: number;
  scoreB?: number;
}

/** 将已结束比赛的结果填入签表，推导后续轮次的对阵与冠军 */
export function applyKnockoutResults(
  schedule: KnockoutSchedule,
  results: KnockoutResultInput[]
): KnockoutState {
  const rounds = schedule.rounds.map((round) => round.map((m) => ({ ...m })));
  const byId = new Map<string, KnockoutMatch>();
  rounds.forEach((round) => round.forEach((m) => byId.set(m.id, m)));

  for (const res of results) {
    const m = byId.get(res.matchId);
    if (!m) continue;
    if (res.winner != null) {
      m.winner = res.winner;
      m.scoreA = res.scoreA;
      m.scoreB = res.scoreB;
    }
  }

  for (let r = 0; r < rounds.length; r++) {
    const cur = rounds[r] as KnockoutMatch[];
    for (const m of cur) {
      if (m.next == null) continue;
      const target = rounds[r + 1]?.[m.next];
      if (!target) continue;
      if (m.winner != null) target[m.slot === 0 ? 'a' : 'b'] = m.winner;
    }
  }

  const last = rounds[rounds.length - 1];
  const champion = last?.[0]?.winner ?? null;
  return { rounds, champion };
}
