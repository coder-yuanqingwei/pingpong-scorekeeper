import { createRng } from './random';
import type { ArenaMatch } from './types';

export interface ArenaOptions {
  mode?: 'fixed' | 'rotating';
  games?: number;
  seed?: number | string;
}

export interface ArenaState {
  matches: ArenaMatch[];
  mode: 'fixed' | 'rotating';
  games: number;
  note: string;
}

/**
 * 擂台赛：fixed = 胜者留守，败者排到队尾；rotating = 每局整体轮换。
 */
export function generateArena(
  players: unknown[],
  { mode = 'fixed', games = 10, seed = 1 }: ArenaOptions = {}
): ArenaState {
  const n = players.length;
  if (n < 2) return { matches: [], mode, games, note: '' };
  const rng = createRng(seed);
  let queue = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  const matches: ArenaMatch[] = [];

  for (let g = 0; g < games; g++) {
    const a = queue[0] as number;
    const b = queue[1] as number;
    matches.push({
      id: `A${g + 1}`,
      a, b,
      winner: null,
      isKing: g > 0 && mode === 'fixed',
    });
    if (mode === 'fixed') {
      // 胜者留在 1 号位，挑战者插到队尾；败者出队
      queue = [a, ...queue.slice(2), b];
    } else {
      queue = [...queue.slice(1), queue[0] as number];
    }
  }

  return {
    matches, mode, games,
    note: mode === 'fixed' ? '胜者守擂，败者排至队尾' : '每局全员轮换',
  };
}

/** 根据实际胜负重排固定擂台的下一局对阵 */
export function nextArenaMatch(state: { queue: number[] }, winner: number, loser: number): { a: number; b: number | null; queue: number[] } {
  const queue = state.queue.filter((x) => x !== loser);
  const rest = queue.filter((x) => x !== winner);
  return { a: winner, b: rest[0] ?? null, queue: [winner, ...rest] };
}
