/** 赛制算法共享类型定义 */

/** 选手/队伍引用：索引、索引/名称数组（双打/团体）、名称或 null(待定) */
export type Ref = number | number[] | string[] | string | null;

/** 对阵一方的胜负标记 */
export type Side = 'a' | 'b';

/** 通用比赛结果 */
export interface MatchResult {
  winner: Side | null;
  scoreA?: number | null;
  scoreB?: number | null;
  [key: string]: unknown;
}

/** 循环赛 / 通用轮次比赛 */
export interface RoundMatch {
  id: string;
  a: Ref;
  b: Ref;
  winner: Side | null;
  scoreA?: number | null;
  scoreB?: number | null;
  [key: string]: unknown;
}

export interface Round {
  round: number;
  matches: RoundMatch[];
  [key: string]: unknown;
}

/** 淘汰赛对阵 */
export interface KnockoutMatch {
  id: string;
  round: number;
  a: number | null;
  b: number | null;
  isBye: boolean;
  winner: number | null;
  next: number | null;
  slot: number | null;
  scoreA?: number;
  scoreB?: number;
  from?: Array<{ match: string; type: 'winner' | 'loser' }>;
}

export interface KnockoutSchedule {
  rounds: KnockoutMatch[][];
  bracketSize: number;
  byes: number;
  thirdPlace: KnockoutMatch | null;
  totalMatches?: number;
  qualifyCount?: number;
  note?: string;
}

export interface KnockoutState {
  rounds: KnockoutMatch[][];
  champion: number | null;
}

/** 积分榜行 */
export interface StandingRow {
  index: number;
  name: string;
  played: number;
  win: number;
  loss: number;
  pf: number;
  pa: number;
  diff: number;
}

/** 循环赛结果输入 */
export interface StandingResult {
  a: number | null;
  b: number | null;
  winner: number | Side | null;
  scoreA?: number;
  scoreB?: number;
  [key: string]: unknown;
}

/** 轮转赛分组内的一场比赛队伍 */
export interface RotationTeam {
  sideA: number[];
  sideB: number[];
}

export interface RotationRound {
  round: number;
  teams: RotationTeam[];
  byes: number[];
}

export interface RotationPlan {
  rounds: RotationRound[];
  score: number | null;
  byes: number[];
}

/** 小组赛 */
export interface GroupStageGroup {
  name: string;
  members: number[];
  rounds: Round[];
}

export interface GroupRanking {
  name: string;
  members: number[];
  table: StandingRow[];
}

export interface Qualifier {
  player: number;
  group: number;
  rank: number;
}

/** 小组赛结果输入 */
export interface GroupResultInput {
  group: string;
  a?: number | null;
  b?: number | null;
  localA?: number;
  localB?: number;
  winnerLocal: number | null;
  scoreA?: number;
  scoreB?: number;
}

/** 擂台赛 */
export interface ArenaMatch {
  id: string;
  a: number;
  b: number;
  winner: number | null;
  isKing: boolean;
}

/** 团体赛 */
export interface TeamDef {
  name: string;
  players: string[];
}

export interface TeamMatch {
  id: string;
  position: string;
  a: Ref;
  b: Ref;
  target?: number;
  winner: Side | null;
}

export interface TeamTie {
  id: string;
  round: number;
  teamA: number;
  teamB: number;
  matches: TeamMatch[];
}

/** generateFixtures 统一返回结构（判别联合） */
export type Fixture =
  | { kind: 'rounds'; data: Round[] }
  | { kind: 'teams'; teams: number[][]; data: Round[] }
  | { kind: 'bracket'; data: KnockoutSchedule }
  | { kind: 'rotation'; data: RotationPlan }
  | { kind: 'group'; data: GroupStageGroup[] }
  | { kind: 'arena'; data: { matches: ArenaMatch[]; mode: string; games: number; note: string } }
  | { kind: 'team'; data: { ties: TeamTie[]; type: string; totalTies: number } };

/** 赛制定义 */
export interface FormatDef {
  key: string;
  name: string;
  desc: string;
  needs: 'players' | 'teams';
}
