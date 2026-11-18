import { createRng, type Rng } from './random';
import type { RotationPlan, RotationRound, RotationTeam } from './types';

function emptyMatrix(n: number): number[][] {
  return Array.from({ length: n }, () => Array<number>(n).fill(0));
}

export interface RotationOptions {
  rounds?: number;
  teamSize?: number;
  seed?: number | string;
  restarts?: number;
  mixed?: boolean;
  genders?: Array<'M' | 'F' | null> | null;
}

/**
 * 轮转赛多目标优化：最小化搭档/对手重复，兼顾组合覆盖与连续出场。
 * 对应原 App rotationFixturePlan.js 的加权评分 + 随机重启启发式搜索。
 */
export function generateRotationFixtures(
  players: unknown[],
  {
    rounds = 5,
    teamSize = 4,
    seed = 1,
    restarts = 260,
    mixed = false,
    genders = null,
  }: RotationOptions = {}
): RotationPlan {
  const n = players.length;
  if (n < teamSize) return { rounds: [], byes: players.slice() as number[], score: null };
  const sideSize = Math.max(1, Math.floor(teamSize / 2));
  const rng = createRng(seed);

  function buildCandidate(): RotationPlan {
    const out: RotationRound[] = [];
    const partner = emptyMatrix(n);
    const opponent = emptyMatrix(n);
    const appeared = Array<number>(n).fill(0);

    for (let r = 0; r < rounds; r++) {
      const pool = rng.shuffle(Array.from({ length: n }, (_, i) => i));
      const teams: RotationTeam[] = [];
      const byes: number[] = [];

      if (mixed && genders && teamSize === 4) {
        const men = pool.filter((i) => genders[i] === 'M');
        const women = pool.filter((i) => genders[i] === 'F');
        const pairs: Array<[number, number]> = [];
        const mCount = Math.min(men.length, women.length);
        for (let k = 0; k < mCount; k++) pairs.push([men[k] as number, women[k] as number]);
        byes.push(...men.slice(mCount), ...women.slice(mCount));
        const shuffledPairs = rng.shuffle(pairs);
        for (let k = 0; k + 1 < shuffledPairs.length; k += 2) {
          teams.push({ sideA: shuffledPairs[k] as [number, number], sideB: shuffledPairs[k + 1] as [number, number] });
        }
        if (shuffledPairs.length % 2) byes.push(...(shuffledPairs[shuffledPairs.length - 1] as [number, number]));
      } else {
        for (let k = 0; k + teamSize <= pool.length; k += teamSize) {
          const group = pool.slice(k, k + teamSize);
          teams.push({ sideA: group.slice(0, sideSize), sideB: group.slice(sideSize) });
        }
        byes.push(...pool.slice(Math.floor(pool.length / teamSize) * teamSize));
      }

      for (const t of teams) {
        for (let i = 0; i < t.sideA.length; i++) {
          for (let j = i + 1; j < t.sideA.length; j++) { partner[t.sideA[i] as number]![t.sideA[j] as number]!++; }
          for (let j = i + 1; j < t.sideB.length; j++) { partner[t.sideB[i] as number]![t.sideB[j] as number]!++; }
        }
        for (const a of t.sideA) for (const b of t.sideB) opponent[a]![b]!++;
      }
      for (const t of teams) [...t.sideA, ...t.sideB].forEach((i) => { appeared[i]++; });
      out.push({ round: r + 1, teams, byes });
    }

    // 加权目标函数（权重分级，与原 App 一致的思想）
    let maxPartner = 0, sumPartner = 0, partnerSq = 0;
    let maxOpponent = 0, sumOpponent = 0, opponentSq = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = Math.max(0, partner[i]![j]! - 1);
        const o = Math.max(0, opponent[i]![j]! - 1);
        maxPartner = Math.max(maxPartner, p);
        maxOpponent = Math.max(maxOpponent, o);
        sumPartner += p; sumOpponent += o;
        partnerSq += p * p; opponentSq += o * o;
      }
    }
    const idealPartner = (rounds * (sideSize - 1)) / Math.max(1, n - 1);
    const idealOpponent = (rounds * sideSize) / Math.max(1, n - 1);
    let missingPartner = 0, missingOpponent = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        missingPartner += Math.max(0, idealPartner - partner[i]![j]!);
        missingOpponent += Math.max(0, idealOpponent - opponent[i]![j]!);
      }
    }
    let consecutive = 0;
    for (let r = 1; r < out.length; r++) {
      const prev = new Set((out[r - 1] as RotationRound).teams.flatMap((t) => [...t.sideA, ...t.sideB]));
      const cur = (out[r] as RotationRound).teams.flatMap((t) => [...t.sideA, ...t.sideB]);
      consecutive += cur.filter((i) => prev.has(i)).length;
    }

    const score =
      1e12 * maxPartner +
      1e9 * maxOpponent +
      1e7 * sumPartner +
      1e6 * sumOpponent +
      1e4 * partnerSq +
      100 * opponentSq +
      10 * missingPartner +
      missingOpponent +
      0.01 * consecutive;

    return { rounds: out, score, byes: players.filter((_, i) => appeared[i] === 0) as number[] };
  }

  let best: RotationPlan | null = null;
  for (let k = 0; k < restarts; k++) {
    const c = buildCandidate();
    if (!best || (c.score ?? Infinity) < (best.score ?? Infinity)) best = c;
    if (best.score === 0) break;
  }
  return best as RotationPlan;
}

export function generateSingleRotationFixtures(players: unknown[], opts: RotationOptions = {}): RotationPlan {
  return generateRotationFixtures(players, { ...opts, teamSize: 2 });
}

export function generateMixedRotationFixtures(players: unknown[], opts: RotationOptions = {}): RotationPlan {
  return generateRotationFixtures(players, { ...opts, teamSize: 4, mixed: true });
}
