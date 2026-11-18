import { createRng, fnv1a, mulberry32, nextPowerOfTwo } from './random';
import { roundRobinRounds, roundRobinMatchCount, standings } from './roundRobin';
import { generateKnockout, applyKnockoutResults, seedOrder } from './knockout';
import {
  generateRotationFixtures,
  generateSingleRotationFixtures,
  generateMixedRotationFixtures,
} from './rotation';
import {
  generateGroupStage,
  groupRankings,
  buildGroupKnockout,
  generateQualifier,
  splitIntoGroups,
} from './groupStage';
import { generateArena, nextArenaMatch } from './arena';
import { generateTeamFixtures, teamStandings } from './team';
import { recommendHandicap, handicapLabel, EVENT_TYPES } from './handicap';
import type { Fixture, FormatDef } from './types';

export const FORMATS: FormatDef[] = [
  { key: 'quick', name: '快速计分', desc: '两人对打，边打边记', needs: 'players' },
  { key: 'singles-rr', name: '单打循环赛', desc: '人人相遇，按胜场排名', needs: 'players' },
  { key: 'doubles-rr', name: '固定双打循环赛', desc: '搭档固定，循环对阵', needs: 'players' },
  { key: 'knockout', name: '淘汰赛', desc: '种子排位，单败出局', needs: 'players' },
  { key: 'rotation', name: '多人轮转赛', desc: '优化搭档/对手覆盖', needs: 'players' },
  { key: 'mixed-rotation', name: '混双轮转赛', desc: '男女搭档轮换上场', needs: 'players' },
  { key: 'group-ko', name: '小组循环+淘汰', desc: '分组循环，交叉出线', needs: 'players' },
  { key: 'qualifier', name: '资格赛', desc: '淘汰争夺正赛名额', needs: 'players' },
  { key: 'arena', name: '擂台赛', desc: '守擂挑战，连续作战', needs: 'players' },
  { key: 'team', name: '团体赛', desc: '队对抗，多场次计分', needs: 'teams' },
];

export interface FixtureOptions {
  seed?: number | string;
  teams?: import('./types').TeamDef[];
  [key: string]: unknown;
}

/** 统一生成入口：返回可直接渲染的赛程结构 */
export function generateFixtures(formatKey: string, players: unknown[], options: FixtureOptions = {}): Fixture {
  const seed = options.seed ?? 1;
  switch (formatKey) {
    case 'singles-rr':
      return {
        kind: 'rounds',
        data: roundRobinRounds(players.length, { seed }).map((pairs, ri) => ({
          round: ri + 1,
          matches: pairs.map(([a, b], mi) => ({ id: `R${ri + 1}M${mi + 1}`, a, b, winner: null })),
        })),
      };
    case 'doubles-rr': {
      const pairs: number[][] = [];
      for (let i = 0; i + 1 < players.length; i += 2) pairs.push([i, i + 1]);
      if (pairs.length < 2) return { kind: 'rounds', data: [] };
      const rounds = roundRobinRounds(pairs.length, { seed });
      return {
        kind: 'teams',
        teams: pairs,
        data: rounds.map((ps, ri) => ({
          round: ri + 1,
          matches: ps.map(([a, b], mi) => ({
            id: `D${ri + 1}M${mi + 1}`,
            a: pairs[a] as number[],
            b: pairs[b] as number[],
            winner: null,
          })),
        })),
      };
    }
    case 'knockout':
      return {
        kind: 'bracket',
        data: generateKnockout(Array.from({ length: players.length }, (_, i) => i), { ...options, seed }),
      };
    case 'rotation':
      return { kind: 'rotation', data: generateRotationFixtures(players, { ...options, seed, mixed: false }) };
    case 'mixed-rotation':
      return { kind: 'rotation', data: generateMixedRotationFixtures(players, { ...options, seed }) };
    case 'group-ko':
      return { kind: 'group', data: generateGroupStage(players, { ...options, seed }) };
    case 'qualifier':
      return {
        kind: 'bracket',
        data: generateQualifier(Array.from({ length: players.length }, (_, i) => i), { ...options, seed }),
      };
    case 'arena':
      return {
        kind: 'arena',
        data: generateArena(Array.from({ length: players.length }, (_, i) => i), { ...options, seed }),
      };
    case 'team':
      return { kind: 'team', data: generateTeamFixtures(options.teams || [], { ...options, seed }) };
    default:
      return { kind: 'rounds', data: [] };
  }
}

export {
  createRng, fnv1a, mulberry32, nextPowerOfTwo,
  roundRobinRounds, roundRobinMatchCount, standings,
  generateKnockout, applyKnockoutResults, seedOrder,
  generateRotationFixtures, generateSingleRotationFixtures, generateMixedRotationFixtures,
  generateGroupStage, groupRankings, buildGroupKnockout, generateQualifier, splitIntoGroups,
  generateArena, nextArenaMatch,
  generateTeamFixtures, teamStandings,
  recommendHandicap, handicapLabel, EVENT_TYPES,
};

export type * from './types';
