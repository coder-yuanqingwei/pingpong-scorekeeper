import { roundRobinRounds, standings } from './roundRobin';
import { generateKnockout } from './knockout';
import { createRng } from './random';
import type {
  GroupStageGroup, GroupRanking, Qualifier, KnockoutSchedule, RoundMatch, StandingResult, GroupResultInput,
} from './types';

/** 蛇形分档：1→A, 2→B, 3→B, 4→A ... 保证各组实力均衡 */
export function splitIntoGroups(players: unknown[], groupCount: number, seed: number | string = 1): number[][] {
  const n = players.length;
  const count = Math.max(1, Math.min(groupCount, n));
  const groups: number[][] = Array.from({ length: count }, () => []);
  const order = createRng(seed).shuffle(Array.from({ length: n }, (_, i) => i));
  order.forEach((playerIdx, k) => {
    const round = Math.floor(k / count);
    const pos = round % 2 === 0 ? k % count : count - 1 - (k % count);
    (groups[pos] as number[]).push(playerIdx);
  });
  return groups;
}

export interface GroupStageOptions {
  groups?: number;
  seed?: number | string;
  balanced?: boolean;
}

/** 小组循环赛程（先分组，再组内循环） */
export function generateGroupStage(
  players: unknown[],
  { groups = 4, seed = 1, balanced = true }: GroupStageOptions = {}
): GroupStageGroup[] {
  const grouping = splitIntoGroups(players, groups, seed);
  return grouping.map((members, gi) => ({
    name: `第${String.fromCharCode(65 + gi)}组`,
    members,
    rounds: roundRobinRounds(members.length, { balanced, seed: (seed as number) + gi + 1 }).map((pairs, ri) => ({
      round: ri + 1,
      matches: pairs.map(([a, b], mi) => ({
        id: `G${gi}R${ri + 1}M${mi + 1}`,
        a: members[a] as number,
        b: members[b] as number,
        localA: a,
        localB: b,
        winner: null,
      })) as RoundMatch[],
    })),
  }));
}

/** 根据小组赛结果计算各组排名 */
export function groupRankings(groups: GroupStageGroup[], players: unknown[], results: GroupResultInput[]): GroupRanking[] {
  return groups.map((g) => {
    const localResults: StandingResult[] = results
      .filter((r) => r.group === g.name)
      .map((r) => ({ a: r.localA ?? null, b: r.localB ?? null, winner: r.winnerLocal, scoreA: r.scoreA, scoreB: r.scoreB }));
    return {
      name: g.name,
      members: g.members,
      table: standings(g.members.map((i) => String(players[i] ?? i)), localResults),
    };
  });
}

export interface GroupKnockoutOptions {
  advancePerGroup?: number;
  thirdPlace?: boolean;
  seed?: number | string;
}

export interface GroupKnockoutResult {
  schedule: KnockoutSchedule | null;
  qualifiers: Qualifier[];
  seeds?: number[];
}

/** 由各组出线者构造交叉淘汰签表 */
export function buildGroupKnockout(
  rankings: GroupRanking[],
  { advancePerGroup = 2, thirdPlace = false, seed = 1 }: GroupKnockoutOptions = {}
): GroupKnockoutResult {
  const qualified: Qualifier[] = [];
  rankings.forEach((g, gi) => {
    g.table.slice(0, advancePerGroup).forEach((row, rank) => {
      qualified.push({ player: g.members[row.index] as number, group: gi, rank });
    });
  });
  if (qualified.length < 2) return { schedule: null, qualifiers: qualified };

  // 交叉对阵：A1 vs B2、B1 vs A2 ... 避免同组立即相遇
  const seeds: number[] = [];
  const gCount = rankings.length;
  for (let rank = 0; rank < advancePerGroup; rank++) {
    for (let gi = 0; gi < gCount; gi++) {
      const flip = rank % 2 === 1;
      const actualGi = flip ? gCount - 1 - gi : gi;
      const entry = qualified.find((q) => q.group === actualGi && q.rank === rank);
      if (entry) seeds.push(entry.player);
    }
  }
  const schedule = generateKnockout(seeds, { seed, thirdPlace });
  return { schedule, qualifiers: qualified, seeds };
}

/** 资格赛：n 人争夺 k 个正赛名额，先淘汰赛再取前 k */
export function generateQualifier(
  players: unknown[],
  { qualifyCount = 4, seed = 1 }: { qualifyCount?: number; seed?: number | string } = {}
): KnockoutSchedule {
  const schedule = generateKnockout(players, { seed, thirdPlace: false });
  return {
    ...schedule,
    qualifyCount: Math.min(qualifyCount, players.length),
    note: '获胜晋级，最终轮胜者获得正赛名额',
  };
}
