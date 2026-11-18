import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Fixture, Side } from './algorithms/types';

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
