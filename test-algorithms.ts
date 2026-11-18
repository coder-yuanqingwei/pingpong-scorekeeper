import assert from 'node:assert/strict';
import {
  createRng, seedOrder, roundRobinRounds, generateKnockout, applyKnockoutResults,
  generateRotationFixtures, generateGroupStage, buildGroupKnockout, generateTeamFixtures,
  generateArena, recommendHandicap, generateFixtures,
} from './src/algorithms/index';

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log('✓', name); };

check('确定性随机同种子可复现', () => {
  const a = createRng(42), b = createRng(42);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

check('偶数循环赛覆盖全部配对且不重复', () => {
  const rounds = roundRobinRounds(6, { seed: 7 });
  assert.equal(rounds.length, 5);
  const seen = new Set<string>();
  rounds.forEach((r) => {
    assert.equal(r.length, 3);
    r.forEach(([x, y]) => {
      const k = x < y ? `${x}-${y}` : `${y}-${x}`;
      assert.ok(!seen.has(k), `重复配对 ${k}`);
      seen.add(k);
    });
  });
  assert.equal(seen.size, 15);
});

check('奇数循环赛含轮空且覆盖全部配对', () => {
  const rounds = roundRobinRounds(5, { seed: 3 });
  // 5 人单循环 = C(5,2) = 10 场；每轮 2 场 + 1 人轮空 => 共 5 轮
  assert.equal(rounds.length, 5);
  const seen = new Set<string>();
  rounds.forEach((r) => {
    assert.equal(r.length, 2); // 5人每轮2场，1人轮空
    r.forEach(([x, y]) => seen.add(`${Math.min(x, y)}-${Math.max(x, y)}`));
  });
  assert.equal(seen.size, 10);
});

check('种子排位让1、2号种子分处上下半区', () => {
  const o = seedOrder(8);
  assert.deepEqual(o, [0, 7, 3, 4, 1, 6, 2, 5]);
  assert.ok(o.indexOf(0) < 4 && o.indexOf(1) >= 4);
});

check('8人淘汰赛签表：3轮7场、首轮种子保护', () => {
  const k = generateKnockout([0, 1, 2, 3, 4, 5, 6, 7], { seed: 1 });
  assert.equal(k.bracketSize, 8);
  assert.equal(k.byes, 0);
  assert.equal(k.rounds.length, 3);
  assert.equal(k.rounds.flat().length, 7);
  const first = k.rounds[0]!.map((m) => [m.a, m.b]);
  assert.deepEqual(first, [[0, 7], [3, 4], [1, 6], [2, 5]]);
  assert.equal(k.thirdPlace?.id, 'THIRD');
});

check('淘汰赛结果推动晋级并产生冠军', () => {
  const k = generateKnockout(Array.from({ length: 8 }, (_, i) => i), { seed: 1 });
  // 逐轮提供胜者：每轮该场次的当前 a 位选手获胜
  const results: Array<{ matchId: string; winner: number | null }> = k.rounds[0]!.map((m) => ({ matchId: m.id, winner: m.a }));
  const mid = applyKnockoutResults(k, results);
  assert.deepEqual(mid.rounds[1]!.map((m) => [m.a, m.b]), [[0, 3], [1, 2]]);
  results.push(...mid.rounds[1]!.map((m) => ({ matchId: m.id, winner: m.a })));
  const semi = applyKnockoutResults(k, results);
  assert.deepEqual(semi.rounds[2]!.map((m) => [m.a, m.b]), [[0, 1]]);
  results.push(...semi.rounds[2]!.map((m) => ({ matchId: m.id, winner: m.a })));
  const st = applyKnockoutResults(k, results);
  assert.equal(st.champion, 0);
});

check('5人淘汰赛有3个轮空且自动晋级', () => {
  const k = generateKnockout([0, 1, 2, 3, 4], { seed: 1 });
  assert.equal(k.bracketSize, 8);
  assert.equal(k.byes, 3);
  assert.equal(k.rounds[0]!.filter((m) => m.isBye).length, 3);
});

check('轮转赛生成合法分组且评分有限', () => {
  const r = generateRotationFixtures(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], { rounds: 4, restarts: 30, seed: 9 });
  assert.equal(r.rounds.length, 4);
  r.rounds.forEach((round) => {
    assert.equal(round.teams.length, 2);
    const flat = round.teams.flatMap((t) => [...t.sideA, ...t.sideB]);
    assert.equal(new Set(flat).size, 8);
  });
  assert.ok(Number.isFinite(r.score));
});

check('小组循环+交叉淘汰：出线人数与签表规模正确', () => {
  const players = Array.from({ length: 8 }, (_, i) => `P${i}`);
  const groups = generateGroupStage(players, { groups: 2, seed: 1 });
  assert.equal(groups.length, 2);
  groups.forEach((g) => assert.equal(g.rounds.length, 3));
  const rankings = groups.map((g) => ({
    name: g.name, members: g.members,
    table: g.members.map((p) => ({ index: p, win: 0, loss: 0, diff: 0, pf: 0, pa: 0, played: 0, name: `P${p}` })),
  }));
  const ko = buildGroupKnockout(rankings, { advancePerGroup: 2, seed: 1 });
  assert.equal(ko.qualifiers.length, 4);
  assert.equal(ko.schedule!.bracketSize, 4);
  assert.equal(ko.schedule!.rounds.flat().length, 3);
});

check('团体赛生成对阵轮次', () => {
  const teams = [
    { name: '一队', players: ['a1', 'a2', 'a3', 'a4'] },
    { name: '二队', players: ['b1', 'b2', 'b3', 'b4'] },
    { name: '三队', players: ['c1', 'c2', 'c3', 'c4'] },
    { name: '四队', players: ['d1', 'd2', 'd3', 'd4'] },
  ];
  const t = generateTeamFixtures(teams, { type: 'fixed-doubles', seed: 1 });
  assert.equal(t.ties.length, 6);
  assert.ok(t.ties.every((x) => x.matches.length === 2));
});

check('擂台赛与让分参考', () => {
  const a = generateArena([0, 1, 2, 3], { games: 6, mode: 'fixed', seed: 1 });
  assert.equal(a.matches.length, 6);
  // MD(4) vs WD(2): 差 2 落在 >=1 档 => 让 1 局；MS(4) vs MS(4): 差 0 => 不让分
  assert.equal(recommendHandicap('MD', 'WD'), 1);
  assert.equal(recommendHandicap('MS', 'MS'), 0);
});

check('统一入口 generateFixtures 支持全部赛制', () => {
  const p = Array.from({ length: 8 }, (_, i) => `P${i}`);
  ['singles-rr', 'doubles-rr', 'knockout', 'rotation', 'mixed-rotation', 'group-ko', 'qualifier', 'arena'].forEach((k) => {
    const f = generateFixtures(k, p, { seed: 1 });
    assert.ok('data' in f && f.data, `${k} 无数据`);
  });
});

console.log(`\n${passed} 项算法测试全部通过`);
