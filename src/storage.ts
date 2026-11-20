import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Fixture, Side } from './algorithms/types';
import type { MatchStats } from './matchStats';

const KEYS = {
  MATCHES: 'pp_matches_v1',
  TOURNAMENTS: 'pp_tournaments_v1',
  SETTINGS: 'pp_settings_v1',
};

export interface Settings {
  pointsToWin: number;
  winByTwo: boolean;
  gamesToWin: number;
  serveInterval: number;
  playerA: string;
  playerB: string;
  interGameRest: boolean;
  autoCourtSwap: boolean;
  /** 自由赛制（原型 isFreeGamesSelected）与其下拉索引（freeGamesPickerIndex） */
  free?: boolean;
  freeGamesPickerIndex?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  pointsToWin: 11,
  winByTwo: true,
  gamesToWin: 2,
  serveInterval: 2,
  playerA: '选手 A',
  playerB: '选手 B',
  interGameRest: false,
  autoCourtSwap: true,
};

export interface GameRecord {
  a: number;
  b: number;
  winner: 'A' | 'B';
  index: number;
}

/** 进行中比赛的完整快照，用于从历史记录「继续比赛」恢复现场。 */
export interface MatchSnapshot {
  scoreA: number;
  scoreB: number;
  gamesA: number;
  gamesB: number;
  gameHistory: GameRecord[];
  startServer: 'A' | 'B';
  serve: 'A' | 'B';
  /** 技术统计（原型 matchStats）：继续比赛时恢复五项实时统计 */
  stats?: MatchStats;
  /** 换边状态：决胜局 5 分换边/局间换边后退出，恢复时带回正确左右侧 */
  courtSwapped?: boolean;
  /** 双方剩余暂停次数（原版每队 1 次），恢复时带回避免暂停次数凭空回满 */
  homeTimeoutsLeft?: number;
  awayTimeoutsLeft?: number;
  /** 决胜局 5 分换边是否已触发，恢复时带回避免再次换边 */
  deciderFiveDone?: boolean;
  /** 赛前完整配置（含每局分数/胜局数/发球间隔等），恢复时直接带回计分页 */
  config: {
    title: string;
    dateLabel: string;
    pointsToWin: number;
    gamesToWin: number;
    serveInterval: number;
    winByTwo: boolean;
    singles: boolean;
    nameA: string;
    nameB: string;
    interGameRest?: boolean;
    autoCourtSwap?: boolean;
    free?: boolean;
  };
}

export interface MatchRecord {
  id: string;
  date: string;
  nameA: string;
  nameB: string;
  gamesA: number;
  gamesB: number;
  games: GameRecord[];
  winner: 'A' | 'B';
  config: { pointsToWin: number; gamesToWin: number };
  /** 进行中=ongoing（可继续），已完成=finished（默认，兼容旧记录） */
  status?: 'ongoing' | 'finished';
  /** 仅 ongoing：恢复现场用的完整快照 */
  snapshot?: MatchSnapshot;
}

export interface TournamentResult {
  winner: Side | null;
  winnerIndex?: unknown;
  a?: unknown;
  b?: unknown;
  scoreA?: number | null;
  scoreB?: number | null;
  [key: string]: unknown;
}

export interface Tournament {
  id: string;
  formatKey: string;
  title: string;
  players: string[];
  teams: Array<{ name: string; players: string[] }> | null;
  options: Record<string, unknown>;
  fixture: Fixture;
  results: Record<string, TournamentResult>;
  createdAt: string;
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? { ...(fallback as object), ...JSON.parse(raw) } as T : fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadSettings = (): Promise<Settings> => readJSON<Settings>(KEYS.SETTINGS, DEFAULT_SETTINGS);
export const saveSettings = (v: Settings): Promise<boolean> => writeJSON(KEYS.SETTINGS, v);

export async function loadMatches(): Promise<MatchRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.MATCHES);
    return raw ? JSON.parse(raw) as MatchRecord[] : [];
  } catch {
    return [];
  }
}

export async function appendMatch(match: MatchRecord): Promise<MatchRecord[]> {
  const list = await loadMatches();
  const next = [match, ...list].slice(0, 200);
  await writeJSON(KEYS.MATCHES, next);
  return next;
}

export async function removeMatch(id: string): Promise<MatchRecord[]> {
  const list = await loadMatches();
  const next = list.filter((m) => m.id !== id);
  await writeJSON(KEYS.MATCHES, next);
  return next;
}

/** 进行中记录的稳定 id（标题+双方名），storage 与计分页共用，保证存档/清理指向同一条。 */
export function ongoingMatchId(title: string, nameA: string, nameB: string): string {
  return `ongoing_${title}_${nameA}_${nameB}`.replace(/\s+/g, '');
}

/** 退出比赛时存档/更新进行中记录。同场重复退出为覆盖更新。 */
export async function upsertOngoingMatch(snap: MatchSnapshot): Promise<MatchRecord[]> {
  const c = snap.config;
  const id = ongoingMatchId(c.title, c.nameA, c.nameB);
  const list = await loadMatches();
  const rec: MatchRecord = {
    id,
    date: new Date().toISOString(),
    nameA: c.nameA,
    nameB: c.nameB,
    gamesA: snap.gamesA,
    gamesB: snap.gamesB,
    games: snap.gameHistory,
    winner: snap.gamesA >= snap.gamesB ? 'A' : 'B',
    config: { pointsToWin: c.pointsToWin, gamesToWin: c.gamesToWin },
    status: 'ongoing',
    snapshot: snap,
  };
  const next = [rec, ...list.filter((m) => m.id !== id)].slice(0, 200);
  await writeJSON(KEYS.MATCHES, next);
  return next;
}

/** 整场比赛结束时，删除对应的进行中记录并写入最终结果（由 finishMatch 调用）。 */
export async function completeMatch(record: MatchRecord, ongoingId: string): Promise<MatchRecord[]> {
  const list = await loadMatches();
  const rest = list.filter((m) => m.id !== ongoingId);
  const next = [{ ...record, status: 'finished' as const, snapshot: undefined }, ...rest].slice(0, 200);
  await writeJSON(KEYS.MATCHES, next);
  return next;
}

export async function loadTournaments(): Promise<Tournament[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.TOURNAMENTS);
    return raw ? JSON.parse(raw) as Tournament[] : [];
  } catch {
    return [];
  }
}

export async function saveTournament(t: Tournament): Promise<Tournament[]> {
  const list = await loadTournaments();
  const next = [t, ...list.filter((x) => x.id !== t.id)].slice(0, 50);
  await writeJSON(KEYS.TOURNAMENTS, next);
  return next;
}

export async function removeTournament(id: string): Promise<Tournament[]> {
  const list = await loadTournaments();
  const next = list.filter((x) => x.id !== id);
  await writeJSON(KEYS.TOURNAMENTS, next);
  return next;
}
