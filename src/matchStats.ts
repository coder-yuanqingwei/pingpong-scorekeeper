/**
 * 原型 utils/racketMatchStats.js 的 TS 复刻（证据：unpacked/app-service.js @1102773）。
 * 逐分统计五项真实指标：总得分 / 最高连续得分 / 逆转取胜局(落后≥3再翻盘) /
 * 发球得分 / 接发得分。逆转阈值 COMEBACK_THRESHOLD=3。
 */
export interface SideStats {
  totalPoints: number;
  maxConsecutive: number;
  comebackGamesWon: number;
  servePointsWon: number;
  receivePointsWon: number;
}

export interface MatchStats {
  sport: string;
  home: SideStats;
  away: SideStats;
  _game: { homeStreak: number; awayStreak: number; maxDeficitHome: number; maxDeficitAway: number };
}

export const COMEBACK_THRESHOLD = 3;

const emptySide = (): SideStats => ({
  totalPoints: 0, maxConsecutive: 0, comebackGamesWon: 0,
  servePointsWon: 0, receivePointsWon: 0,
});

export function createEmpty(sport = 'pingpong'): MatchStats {
  return {
    sport, home: emptySide(), away: emptySide(),
    _game: { homeStreak: 0, awayStreak: 0, maxDeficitHome: 0, maxDeficitAway: 0 },
  };
}

const clone = (s: MatchStats): MatchStats => JSON.parse(JSON.stringify(s));

/** 记一分。winnerHome=得分方是否为主队；servingHome=当前发球方是否主队；
 *  返回新对象（不可变）；scoredPoint=false 直接返回原样。 */
export function recordPoint(
  s: MatchStats,
  e: { scoredPoint: boolean; servingHome: boolean; winnerHome: boolean; homePoints: number; awayPoints: number },
): MatchStats {
  if (e.scoredPoint === false) return s;
  const n = clone(s);
  const h = Math.max(0, Math.floor(e.homePoints) || 0);
  const a = Math.max(0, Math.floor(e.awayPoints) || 0);
  // 记录本局中一方曾落后的最大分差（用于逆转取胜局判定）
  if (a - h > 0) n._game.maxDeficitHome = Math.max(n._game.maxDeficitHome, a - h);
  if (h - a > 0) n._game.maxDeficitAway = Math.max(n._game.maxDeficitAway, h - a);

  const side: 'home' | 'away' = e.winnerHome ? 'home' : 'away';
  n[side].totalPoints += 1;
  if (e.winnerHome === e.servingHome) n[side].servePointsWon += 1;
  else n[side].receivePointsWon += 1;

  if (e.winnerHome) {
    n._game.homeStreak += 1; n._game.awayStreak = 0;
    n.home.maxConsecutive = Math.max(n.home.maxConsecutive, n._game.homeStreak);
  } else {
    n._game.awayStreak += 1; n._game.homeStreak = 0;
    n.away.maxConsecutive = Math.max(n.away.maxConsecutive, n._game.awayStreak);
  }
  return n;
}

/** 一局结束：若该方本局曾落后≥阈值仍取胜，逆转取胜局 +1；并清零本局分差。 */
export function finalizeGame(s: MatchStats, winnerHome: boolean, threshold = COMEBACK_THRESHOLD): MatchStats {
  const n = clone(s);
  if (winnerHome && n._game.maxDeficitHome >= threshold) n.home.comebackGamesWon += 1;
  if (!winnerHome && n._game.maxDeficitAway >= threshold) n.away.comebackGamesWon += 1;
  n._game.maxDeficitHome = 0;
  n._game.maxDeficitAway = 0;
  return n;
}
