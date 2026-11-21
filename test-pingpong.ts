/** 乒乓单局计分核心规则测试（serverAt / isGameWon / computeCallouts） */
import {
  serverAt, isGameWon, computeCallouts, nextGameStartServer, startServerFromServe, otherSide,
} from './src/algorithms/pingpong';
import type { Side } from './src/algorithms/pingpong';

let pass = 0; let fail = 0;
function eq(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else { fail++; console.log(`✗ ${desc}\n   期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`); }
}

// ===== serverAt：11 分制、每 2 分换发 =====
eq('0:0 首发 A', serverAt(0, 0, 'A', 2, 11, true), 'A');
eq('1:1(总2分) 换发 B', serverAt(1, 1, 'A', 2, 11, true), 'B');
eq('2:2(总4分) 回到 A', serverAt(2, 2, 'A', 2, 11, true), 'A');
eq('10:10 进入 deuce（偶数总分仍 A）', serverAt(10, 10, 'A', 2, 11, true), 'A');
eq('deuce 10:11 换发 B', serverAt(10, 11, 'A', 2, 11, true), 'B');
eq('deuce 11:11 回到 A', serverAt(11, 11, 'A', 2, 11, true), 'A');
eq('deuce 12:11 换发 B', serverAt(12, 11, 'A', 2, 11, true), 'B');
// 非加分制：无 deuce，按间隔走
eq('非加分制 10:10 仍按间隔', serverAt(10, 10, 'A', 2, 11, false), 'A');
// 轮换发球法：每分换发
eq('expedite 每分换发', serverAt(3, 2, 'A', 2, 11, true, true), 'B');
// interval=1（每分换发赛制）
eq('interval=1 每分换发', serverAt(1, 0, 'A', 1, 11, true), 'B');

// ===== isGameWon =====
eq('10:10 未胜', isGameWon(10, 10, 11, true, 20), false);
eq('11:9 胜', isGameWon(11, 9, 11, true, 20), true);
eq('11:10 未胜(需净胜2)', isGameWon(11, 10, 11, true, 20), false);
eq('12:10 胜', isGameWon(12, 10, 11, true, 20), true);
eq('20:20 未胜(需净胜2)', isGameWon(20, 20, 11, true, 20), false);
eq('20:19 未胜(仅净胜1)', isGameWon(20, 19, 11, true, 20), false);
eq('21:19 胜(净胜2)', isGameWon(21, 19, 11, true, 20), true);
eq('22:20 胜(无封顶)', isGameWon(22, 20, 11, true, 20), true);
eq('25:23 长局胜', isGameWon(25, 23, 11, true, 20), true);
eq('19:20 未胜', isGameWon(19, 20, 11, true, 20), false);
eq('非加分制 11:10 胜', isGameWon(11, 10, 11, false, 20), true);

// ===== computeCallouts =====
eq('10:9 → A 局点', computeCallouts(10, 9, 11, 20, true, 0, 0, 2),
  { home: '局点', away: '', winner: null });
eq('10:8 双方未到局点? A 局点', computeCallouts(10, 8, 11, 20, true, 0, 0, 2),
  { home: '局点', away: '', winner: null });
eq('9:10 → B 局点', computeCallouts(9, 10, 11, 20, true, 0, 0, 2),
  { home: '', away: '局点', winner: null });
eq('10:9 且 A 已 1 局 → 赛点', computeCallouts(10, 9, 11, 20, true, 1, 0, 2),
  { home: '赛点', away: '', winner: null });
eq('11:9 → A 胜', computeCallouts(11, 9, 11, 20, true, 1, 0, 2),
  { home: '胜', away: '', winner: 'A' });
eq('9:11 → B 胜', computeCallouts(9, 11, 11, 20, true, 0, 1, 2),
  { home: '', away: '胜', winner: 'B' });
eq('20:19 → A 局点(再+1即净胜2)', computeCallouts(20, 19, 11, 20, true, 0, 0, 2),
  { home: '局点', away: '', winner: null });
eq('21:19 → A 胜(净胜2)', computeCallouts(21, 19, 11, 20, true, 0, 0, 2),
  { home: '胜', away: '', winner: 'A' });
eq('20:20 平局无局点(需净胜2)', computeCallouts(20, 20, 11, 20, true, 0, 0, 2),
  { home: '', away: '', winner: null });
eq('21:20 → A 局点(再+1即胜)', computeCallouts(21, 20, 11, 20, true, 0, 0, 2),
  { home: '局点', away: '', winner: null });

// ===== nextGameStartServer =====
eq('1 局后下局首发 B', nextGameStartServer(1, 0), 'B');
eq('2 局后下局首发 A', nextGameStartServer(1, 1), 'A');

// ===== startServerFromServe / otherSide =====
eq('0:0 期望当前发球 B → 首发基准 B', startServerFromServe(0, 0, 2, 11, true, 'B', false), 'B');
eq('other(A)=B', otherSide('A' as Side), 'B');

console.log(`\npingpong 规则测试: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
