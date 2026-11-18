import { roundRobinRounds } from './roundRobin';
import { createRng, type Rng } from './random';
import type { TeamDef, TeamMatch, TeamTie, Ref } from './types';

export interface TeamOptions {
  type?: 'fixed-doubles' | 'singles' | 'wuyulunbi';
  seed?: number | string;
  singlesPerTie?: number;
  doublesPerTie?: number;
}

export interface TeamFixtureResult {
  ties: TeamTie[];
  type: string;
  totalTies: number;
}

/**
 * 团体赛：固定双打 / 单打 / 五羽轮比。
 * teams: [{ name, players: [名, ...] }, ...]
 */
export function generateTeamFixtures(teams: TeamDef[], {
  type = 'fixed-doubles',
  seed = 1,
  singlesPerTie = 3,
  doublesPerTie = 2,
}: TeamOptions = {}): TeamFixtureResult {
  const t = teams.length;
  if (t < 2) return { ties: [], type, totalTies: 0 };
  const rng = createRng(seed);
  const rounds = roundRobinRounds(t, { seed });
  const ties: TeamTie[] = [];

  rounds.forEach((pairs, ri) => {
    pairs.forEach(([ta, tb], mi) => {
      const A = teams[ta] as TeamDef;
      const B = teams[tb] as TeamDef;
      const matches: TeamMatch[] = [];

      if (type === 'singles') {
        const count = Math.min(singlesPerTie, A.players.length, B.players.length);
        const pa = rng.shuffle(A.players.slice());
        const pb = rng.shuffle(B.players.slice());
        for (let k = 0; k < count; k++) {
          matches.push({
            id: `T${ri + 1}-${mi + 1}-S${k + 1}`, position: `第${k + 1}单打`,
            a: pa[k] as Ref, b: pb[k] as Ref, winner: null,
          });
        }
      } else if (type === 'wuyulunbi') {
        // 五羽轮比：5 个阶段，每阶段 5 分，双方各 2 人上场并轮换
        for (let stage = 1; stage <= 5; stage++) {
          const poolA = rng.shuffle(A.players.slice());
          const poolB = rng.shuffle(B.players.slice());
          matches.push({
            id: `T${ri + 1}-${mi + 1}-W${stage}`,
            position: `第${stage}阶段（5分制）`,
            a: [poolA[0], poolA[1]].filter(Boolean) as Ref,
            b: [poolB[0], poolB[1]].filter(Boolean) as Ref,
            target: 5,
            winner: null,
          });
        }
      } else {
        // 固定双打：每队拆成固定搭档
        const pairsA = makeFixedPairs(A.players, rng);
        const pairsB = makeFixedPairs(B.players, rng);
        const count = Math.min(doublesPerTie, pairsA.length, pairsB.length);
        for (let k = 0; k < count; k++) {
          matches.push({
            id: `T${ri + 1}-${mi + 1}-D${k + 1}`,
            position: `第${k + 1}双打`,
            a: pairsA[k] as Ref, b: pairsB[k] as Ref, winner: null,
          });
        }
      }

      ties.push({ id: `TIE${ri + 1}-${mi + 1}`, round: ri + 1, teamA: ta, teamB: tb, matches });
    });
  });

  return { ties, type, totalTies: ties.length };
}

function makeFixedPairs(players: string[], rng: Rng): string[][] {
  const arr = rng.shuffle(players.slice());
  const out: string[][] = [];
  for (let i = 0; i + 1 < arr.length; i += 2) out.push([arr[i] as string, arr[i + 1] as string]);
  return out;
}

export interface TeamStandingRow {
  index: number;
  name: string;
  win: number;
  loss: number;
  matchesWin: number;
  matchesLoss: number;
}

/** 团体赛积分（按场胜/局胜） */
export function teamStandings(teams: TeamDef[], ties: TeamTie[]): TeamStandingRow[] {
  const table: TeamStandingRow[] = teams.map((t, i) => ({
    index: i, name: t.name, win: 0, loss: 0, matchesWin: 0, matchesLoss: 0,
  }));
  for (const tie of ties) {
    const A = table[tie.teamA];
    const B = table[tie.teamB];
    if (!A || !B) continue;
    let wa = 0, wb = 0;
    for (const m of tie.matches) {
      if (m.winner === 'a') wa++;
      else if (m.winner === 'b') wb++;
    }
    A.matchesWin += wa; A.matchesLoss += wb;
    B.matchesWin += wb; B.matchesLoss += wa;
    if (wa > wb) { A.win++; B.loss++; }
    else if (wb > wa) { B.win++; A.loss++; }
  }
  return table.sort((x, y) => y.win - x.win || (y.matchesWin - y.matchesLoss) - (x.matchesWin - x.matchesLoss));
}
