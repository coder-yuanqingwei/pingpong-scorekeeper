import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { C, shadow, R } from '../theme';
import Hero from '../components/Hero';
import { loadTournaments, saveTournament, removeTournament } from '../storage';
import type { Tournament, TournamentResult } from '../storage';
import type { Ref, RoundMatch, KnockoutSchedule, Side, FormatDef, GroupRanking, GroupResultInput } from '../algorithms/types';
import {
  FORMATS, generateFixtures, applyKnockoutResults, groupRankings,
  buildGroupKnockout, standings,
} from '../algorithms';
import type { FormatNavProp } from '../navigation.types';
import { t, tp, useI18n } from '../i18n';

const DEFAULT_OPTIONS = {
  seed: 1, groups: 4, rounds: 5, teamSize: 4, advancePerGroup: 2, games: 10,
  singlesPerTie: 3, doublesPerTie: 2, qualifyCount: 4,
};

interface TeamDefLocal { name: string; players: string[] }

function labelOf(ref: Ref, players: string[], teams?: TeamDefLocal[] | null): string {
  if (ref == null) return t('待定');
  if (Array.isArray(ref)) return ref.map((x) => labelOf(x as Ref, players, teams)).join(' / ');
  if (typeof ref === 'number') {
    if (teams) return teams[ref]?.name || tp('队伍{n}', { n: ref + 1 });
    return players[ref] || tp('选手{n}', { n: ref + 1 });
  }
  return String(ref);
}

interface MatchRowProps {
  title: string;
  a: Ref;
  b: Ref;
  result?: TournamentResult | null;
  onWin?: (side: Side) => void;
  onScore?: () => void;
  small?: boolean;
}

function MatchRow({ title, a, b, result, onWin, onScore, small }: MatchRowProps) {
  const winner = result?.winner;
  const sides: Array<[Side, string]> = [['a', labelOf(a, [])], ['b', labelOf(b, [])]];
  return (
    <View style={[styles.matchRow, small && styles.matchRowSmall]}>
      <View style={styles.matchMeta}>
        <Text style={styles.matchId}>{title}</Text>
        {onScore && <TouchableOpacity onPress={onScore}><Text style={styles.scoreLink}>{t("计分 ›")}</Text></TouchableOpacity>}
      </View>
      <View style={styles.matchBody}>
        {sides.map(([side, label]) => (
          <TouchableOpacity
            key={side}
            style={[styles.side, winner === side && styles.sideWin]}
            onPress={() => onWin && onWin(side)}
            disabled={!onWin}
          >
            <Text style={[styles.sideText, winner === side && styles.sideTextWin]}>{label}</Text>
            {winner === side && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
      {result?.scoreA != null && (
        <Text style={styles.matchScore}>{tp('比分{a}:{b}', { a: result.scoreA ?? 0, b: result.scoreB ?? 0 })}</Text>
      )}
    </View>
  );
}

export default function FormatScreen() {
  useI18n();   // 订阅界面语言变化
  const navigation = useNavigation<FormatNavProp>();
  const [view, setView] = useState<'list' | 'setup' | 'detail'>('list');
  const [format, setFormat] = useState<FormatDef | null>(null);
  const [playersText, setPlayersText] = useState('张三\n李四\n王五\n赵六\n孙七\n周八');
  const [options, setOptions] = useState<Record<string, unknown>>({ ...DEFAULT_OPTIONS });
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [saved, setSaved] = useState<Tournament[]>([]);
  const [groupKo, setGroupKo] = useState<{ schedule: KnockoutSchedule; seeds?: number[] } | null>(null);

  useFocusEffect(useCallback(() => {
    loadTournaments().then(setSaved);
  }, []));

  const choose = (f: FormatDef) => {
    setFormat(f);
    setOptions({ ...DEFAULT_OPTIONS });
    setView('setup');
  };

  const updateOpt = (key: string, value: unknown) => setOptions((o) => ({ ...o, [key]: value }));

  const commit = (players: string[], teams: TeamDefLocal[] | null, fixture: import('../algorithms/types').Fixture) => {
    if (!format) return;
    const x: Tournament = {
      id: `T${Date.now()}`,
      formatKey: format.key,
      title: format.name,
      players, teams, options,
      fixture,
      results: {},
      createdAt: new Date().toISOString(),
    };
    saveTournament(x).then(setSaved);
    setTournament(x);
    setGroupKo(null);
    setView('detail');
  };

  const generate = () => {
    if (!format) return;
    if (format.needs === 'teams') {
      const teams: TeamDefLocal[] = playersText.split('\n').map((s) => s.trim()).filter(Boolean).map((line, i) => {
        const [name, rest] = line.split(/[:：]/);
        return { name: name?.trim() || tp('队伍{n}', { n: i + 1 }), players: (rest || '').split(/[,，、\s]+/).filter(Boolean) };
      });
      if (teams.length < 2) { Alert.alert(t('提示'), t('至少输入两支队伍，格式：队名:选手1,选手2')); return; }
      const fixture = generateFixtures('team', teams.flatMap((t) => t.players), { ...options, teams });
      commit(teams.flatMap((t) => t.players), teams, fixture);
      return;
    }
    const players = playersText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (players.length < 2) { Alert.alert(t('提示'), t('至少输入两位选手（每行一个）')); return; }
    const fixture = generateFixtures(format.key, players, options);
    commit(players, null, fixture);
  };

  const openSaved = (x: Tournament) => {
    setFormat(FORMATS.find((f) => f.key === x.formatKey) || FORMATS[0] as FormatDef);
    setTournament(x);
    setPlayersText((x.players || []).join('\n'));
    setOptions(x.options || { ...DEFAULT_OPTIONS });
    setView('detail');
  };

  const persist = (x: Tournament) => {
    setTournament(x);
    saveTournament(x).then(setSaved);
  };

  const setResult = (matchId: string, side: Side, match: { a?: Ref; b?: Ref } | null, scoreA?: number | null, scoreB?: number | null) => {
    if (!tournament) return;
    const next: Tournament = {
      ...tournament,
      results: {
        ...tournament.results,
        [matchId]: {
          winner: side,
          winnerIndex: side === 'a' ? match?.a : match?.b,
          a: match?.a,
          b: match?.b,
          scoreA: scoreA ?? null,
          scoreB: scoreB ?? null,
        },
      },
    };
    persist(next);
  };

  const scoreMatch = (a: Ref, b: Ref, id: string) => {
    if (!tournament) return;
    navigation.navigate('首页', {
      preset: {
        a: labelOf(a, tournament.players, tournament.teams),
        b: labelOf(b, tournament.players, tournament.teams),
      },
    });
  };

  if (view === 'list') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Hero kicker="MATCH FORMATS" title={t("比赛活动")} lead={t("赛制编排 · 本地生成，可复现可分享")} />

        {saved.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("已保存的赛程")}</Text>
            {saved.map((x) => (
              <View key={x.id} style={styles.savedRow}>
                <TouchableOpacity style={styles.savedMain} onPress={() => openSaved(x)}>
                  <Text style={styles.savedTitle}>{t(x.title)}</Text>
                  <Text style={styles.savedMeta}>{x.players?.length || x.teams?.length || 0} {t('人')} · {new Date(x.createdAt).toLocaleDateString()}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  Alert.alert(t('删除赛程'), t('确定删除这个赛程吗？'), [
                    { text: t('取消'), style: 'cancel' },
                    { text: t('删除'), style: 'destructive', onPress: () => removeTournament(tournament!.id).then(setSaved) },
                  ]);
                }}><Text style={styles.delete}>{t("删除")}</Text></TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("选择赛制")}</Text>
          <View style={styles.grid}>
            {FORMATS.filter((f) => f.key !== 'quick').map((f) => (
              <TouchableOpacity key={f.key} style={styles.formatCard} onPress={() => choose(f)}>
                <Text style={styles.formatName}>{t(f.name)}</Text>
                <Text style={styles.formatDesc}>{t(f.desc)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  if (view === 'setup' && format) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => setView('list')}><Text style={styles.back}>{t("‹ 返回")}</Text></TouchableOpacity>
        <Text style={styles.h1}>{t(format.name)}</Text>
        <Text style={styles.sub}>{t(format.desc)}</Text>

        <View style={styles.panel}>
          <Text style={styles.label}>{format.needs === 'teams' ? t('队伍与选手（每行：队名:选手1,选手2）') : t('选手名单（每行一位，顺序即种子顺序）')}</Text>
          <TextInput
            style={styles.textarea}
            multiline
            value={playersText}
            onChangeText={setPlayersText}
            textAlignVertical="top"
            placeholder={format.needs === 'teams' ? t('队名:选手1,选手2\n队名:选手1,选手2') : t('选手1\n选手2\n选手3')}
          />
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>{t("参数")}</Text>
          <OptionRow label={t("随机种子")} value={String(options.seed)} onChange={(v) => updateOpt('seed', Number(v) || 1)} />
          {['group-ko'].includes(format.key) && (
            <>
              <OptionRow label={t("分组数")} value={String(options.groups)} onChange={(v) => updateOpt('groups', Number(v) || 2)} />
              <OptionRow label={t("每组出线")} value={String(options.advancePerGroup)} onChange={(v) => updateOpt('advancePerGroup', Number(v) || 1)} />
            </>
          )}
          {['rotation', 'mixed-rotation'].includes(format.key) && (
            <OptionRow label={t("轮次数")} value={String(options.rounds)} onChange={(v) => updateOpt('rounds', Number(v) || 1)} />
          )}
          {format.key === 'arena' && (
            <OptionRow label={t("总局数")} value={String(options.games)} onChange={(v) => updateOpt('games', Number(v) || 1)} />
          )}
          {format.key === 'qualifier' && (
            <OptionRow label={t("出线名额")} value={String(options.qualifyCount)} onChange={(v) => updateOpt('qualifyCount', Number(v) || 1)} />
          )}
          {format.key === 'team' && (
            <>
              <OptionRow label={t("每场单打数")} value={String(options.singlesPerTie)} onChange={(v) => updateOpt('singlesPerTie', Number(v) || 1)} />
              <OptionRow label={t("每场双打数")} value={String(options.doublesPerTie)} onChange={(v) => updateOpt('doublesPerTie', Number(v) || 1)} />
            </>
          )}
          <Text style={styles.hint}>{t("相同种子 + 相同名单 → 生成完全相同的赛程，便于分享和复查。")}</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={generate}>
          <Text style={styles.primaryBtnText}>{t("生成赛程")}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (!tournament) return null;
  const tourney = tournament;
  const f = tourney.fixture;
  const players = tourney.players || [];
  const teams = tourney.teams || null;
  const results = tourney.results || {};

  const renderMatch = (m: RoundMatch, title?: string, compact?: boolean) => (
    <MatchRow
      key={m.id}
      title={title || m.id}
      a={m.a as Ref}
      b={m.b as Ref}
      result={results[m.id]}
      small={compact}
      onWin={(side) => {
        const sA = m.a != null && m.b != null
          ? (side === 'a' ? 11 : 9) : null;
        setResult(m.id, side, m, sA, sA == null ? null : 18 - sA);
      }}
      onScore={m.a != null && m.b != null ? () => scoreMatch(m.a as Ref, m.b as Ref, m.id) : undefined}
    />
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => setView('list')}><Text style={styles.back}>{t("‹ 赛制列表")}</Text></TouchableOpacity>
      <View style={styles.detailHead}>
        <Text style={styles.h1}>{t(tourney.title)}</Text>
        <Text style={styles.sub}>{tp('{n}{unit} · {seedPart} · {markPart}', {
          n: players.length || teams?.length || 0,
          unit: t('人'),
          seedPart: tp('种子{s}', { s: Number(tourney.options?.seed) || 1 }),
          markPart: t('点击选手名可标记胜者'),
        })}</Text>
      </View>

      {f.kind === 'rounds' && (
        <View style={styles.section}>
          {f.data.map((r) => (
            <View key={r.round} style={styles.panel}>
              <Text style={styles.roundTitle}>{t(`第 ${r.round} 轮`)}</Text>
              {r.matches.map((m) => renderMatch(m))}
            </View>
          ))}
          <Standings players={players} results={results} />
        </View>
      )}

      {f.kind === 'teams' && (
        <View style={styles.section}>
          <Text style={styles.hint}>{tp('固定搭档（{names}）', { names: (f.teams || []).map((p) => labelOf(p, players)).join(' / ') })}</Text>
          {f.data.map((r) => (
            <View key={r.round} style={styles.panel}>
              <Text style={styles.roundTitle}>{t(`第 ${r.round} 轮`)}</Text>
              {r.matches.map((m) => renderMatch(m))}
            </View>
          ))}
        </View>
      )}

      {f.kind === 'bracket' && <BracketView fixture={f.data} results={results} renderMatch={(m, title) => renderMatch(m as unknown as RoundMatch, title)} />}

      {f.kind === 'rotation' && (
        <View style={styles.section}>
          <Text style={styles.hint}>{tp('评分{s}', { s: f.data.score != null ? Math.round(f.data.score) : '-' })}{t('（越低越好）')}{t('· 每轮自动优化搭档与对手覆盖')}</Text>
          {f.data.rounds.map((r) => (
            <View key={r.round} style={styles.panel}>
              <Text style={styles.roundTitle}>{t(`第 ${r.round} 轮`)}</Text>
              {r.teams.map((tm, i) => (
                <MatchRow
                  key={i}
                  title={t(`场地 ${i + 1}`)}
                  a={tm.sideA as Ref}
                  b={tm.sideB as Ref}
                  result={results[`ROT${r.round}-${i}`]}
                  onWin={(side) => setResult(`ROT${r.round}-${i}`, side, { a: tm.sideA, b: tm.sideB }, null, null)}
                  onScore={() => scoreMatch(tm.sideA as Ref, tm.sideB as Ref, `ROT${r.round}-${i}`)}
                />
              ))}
              {r.byes.length > 0 && <Text style={styles.hint}>{tp('轮空：{names}', { names: r.byes.map((i) => labelOf(i, players)).join('、') })}</Text>}
            </View>
          ))}
        </View>
      )}

      {f.kind === 'group' && (
        <View style={styles.section}>
          {f.data.map((g) => (
            <View key={g.name} style={styles.panel}>
              <Text style={styles.roundTitle}>{t(g.name)}（{g.members.map((i) => labelOf(i, players)).join('、')}）</Text>
              {g.rounds.map((r) => r.matches.map((m) => renderMatch(m, t(`第${r.round}轮`))))}
            </View>
          ))}
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
            const localResults: GroupResultInput[] = [];
            f.data.forEach((g) => g.rounds.forEach((r) => r.matches.forEach((m) => {
              const res = results[m.id];
              if (res) localResults.push({
                group: g.name, a: Number(m.localA), b: Number(m.localB),
                winnerLocal: res.winner === 'a' ? Number(m.localA) : Number(m.localB),
                scoreA: res.scoreA ?? undefined, scoreB: res.scoreB ?? undefined,
              });
            })));
            const rankings: GroupRanking[] = groupRankings(f.data, players, localResults);
            const ko = buildGroupKnockout(rankings, {
              advancePerGroup: Number(tourney.options?.advancePerGroup) || 2,
              seed: Number(tourney.options?.seed) || 1,
            });
            if (!ko.schedule) { Alert.alert(t('提示'), t('请先完成小组赛并标记胜者')); return; }
            setGroupKo({ schedule: ko.schedule, seeds: ko.seeds });
          }}>
            <Text style={styles.secondaryBtnText}>{t("根据小组排名生成淘汰赛 →")}</Text>
          </TouchableOpacity>
          {groupKo?.schedule && (
            <BracketView
              fixture={groupKo.schedule}
              results={results}
              renderMatch={(m, title) => (
                <MatchRow
                  key={`KO${m.id}`}
                  title={title || m.id.replace('KO', '')}
                  a={groupKo.seeds && m.a != null && groupKo.seeds[m.a] != null ? groupKo.seeds[m.a] as number : m.a as Ref}
                  b={groupKo.seeds && m.b != null && groupKo.seeds[m.b] != null ? groupKo.seeds[m.b] as number : m.b as Ref}
                  result={results[`KO${m.id}`]}
                  onWin={(side) => setResult(`KO${m.id}`, side, { a: groupKo.seeds?.[m.a ?? -1], b: groupKo.seeds?.[m.b ?? -1] }, null, null)}
                  onScore={() => scoreMatch(
                    (groupKo.seeds && m.a != null ? groupKo.seeds[m.a] : m.a) as Ref,
                    (groupKo.seeds && m.b != null ? groupKo.seeds[m.b] : m.b) as Ref,
                    `KO${m.id}`
                  )}
                />
              )}
            />
          )}
        </View>
      )}

      {f.kind === 'arena' && (
        <View style={styles.section}>
          <View style={styles.panel}>
            <Text style={styles.roundTitle}>{t('擂台序列')}（{t(f.data.note)}）</Text>
            {f.data.matches.map((m, i) => renderMatch(m as unknown as RoundMatch, t(`第 ${i + 1} 局`)))}
          </View>
        </View>
      )}

      {f.kind === 'team' && (
        <View style={styles.section}>
          {f.data.ties.map((tie) => (
            <View key={tie.id} style={styles.panel}>
              <Text style={styles.roundTitle}>
                {tp('{a} vs {b}（第{n}轮）', { a: labelOf(tie.teamA, [], teams), b: labelOf(tie.teamB, [], teams), n: tie.round })}
              </Text>
              {tie.matches.map((m) => (
                <MatchRow
                  key={m.id}
                  title={t(m.position)}
                  a={m.a as Ref}
                  b={m.b as Ref}
                  result={results[m.id]}
                  onWin={(side) => setResult(m.id, side, m, null, null)}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.dangerBtn} onPress={() => {
        Alert.alert(t('删除'), t('删除这个赛程？'), [
          { text: t('取消'), style: 'cancel' },
          { text: t('删除'), style: 'destructive', onPress: () => {
            removeTournament(tourney.id).then(() => { setView('list'); loadTournaments().then(setSaved); });
          } },
        ]);
      }}><Text style={styles.dangerText}>{t("删除此赛程")}</Text></TouchableOpacity>
    </ScrollView>
  );
}

interface StandingsProps {
  players: string[];
  results: Record<string, TournamentResult>;
}

function Standings({ players, results }: StandingsProps) {
  const rows = standings(players, Object.entries(results).map(([id, r]) => {
    const m = id.match(/^R(\d+)M(\d+)$/);
    if (!m || r.winner == null) return null;
    return r.a != null ? { a: Number(r.a), b: Number(r.b), winner: r.winner === 'a' ? Number(r.a) : Number(r.b), scoreA: r.scoreA ?? undefined, scoreB: r.scoreB ?? undefined } : null;
  }).filter((x): x is NonNullable<typeof x> => x != null));
  if (!rows.some((r) => r.played > 0)) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.roundTitle}>{t("积分榜")}</Text>
      {rows.map((r, i) => (
        <View key={r.name} style={styles.standingRow}>
          <Text style={styles.rank}>{i + 1}</Text>
          <Text style={styles.standingName}>{r.name}</Text>
          <Text style={styles.standingStat}>{tp('{win}胜 {loss}负', { win: r.win, loss: r.loss })}</Text>
          <Text style={styles.standingDiff}>{r.diff >= 0 ? '+' : ''}{r.diff}</Text>
        </View>
      ))}
    </View>
  );
}

type RenderMatchFn = (m: import('../algorithms/types').KnockoutMatch, title?: string) => React.ReactNode;

function BracketView({ fixture, results, renderMatch }: {
  fixture: KnockoutSchedule;
  results: Record<string, TournamentResult>;
  renderMatch: RenderMatchFn;
}) {
  if (!fixture?.rounds) return null;
  const states = applyKnockoutResults(fixture, Object.entries(results)
    .filter(([id, r]) => !id.startsWith('KO') && r.winnerIndex != null)
    .map(([id, r]) => ({ matchId: id, winner: Number(r.winnerIndex) })));
  return (
    <View style={styles.section}>
      {states.rounds.map((round, ri) => (
        <View key={ri} style={styles.panel}>
          <Text style={styles.roundTitle}>{ri === states.rounds.length - 1 ? t('决赛') : t(`第 ${ri + 1} 轮`)}</Text>
          {round.map((m) => renderMatch(m, m.isBye ? t('轮空晋级') : m.id))}
        </View>
      ))}
      {states.champion != null && (
        <View style={styles.champion}>
          <Text style={styles.championText}>{t("🏆 冠军已产生")}</Text>
        </View>
      )}
    </View>
  );
}

function OptionRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.optionRow}>
      <Text style={styles.optionLabel}>{label}</Text>
      <TextInput style={styles.optionInput} keyboardType="numeric" value={value} onChangeText={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 8 },
  sub: { fontSize: 13, color: C.sub, marginTop: 4, marginBottom: 12 },
  back: { fontSize: 15, color: C.primary, fontWeight: '600' },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formatCard: { width: '48%', backgroundColor: C.card, borderRadius: R.lg, padding: 14, borderWidth: 1, borderColor: C.borderSoft, ...shadow },
  formatName: { fontSize: 15, fontWeight: '700', color: C.text },
  formatDesc: { fontSize: 12, color: C.sub, marginTop: 6, lineHeight: 17 },
  panel: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.borderSoft, ...shadow },
  label: { fontSize: 13, color: C.sub, marginBottom: 8 },
  textarea: { minHeight: 150, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontSize: 15, color: C.text, lineHeight: 24 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  optionLabel: { fontSize: 14, color: C.text },
  optionInput: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, width: 90, textAlign: 'center', color: C.text },
  hint: { fontSize: 12, color: C.sub, lineHeight: 19, marginTop: 10 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginVertical: 8 },
  secondaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  dangerBtn: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
  dangerText: { color: C.primary, fontSize: 14 },
  savedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8 },
  savedMain: { flex: 1 },
  savedTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  savedMeta: { fontSize: 12, color: C.sub, marginTop: 3 },
  delete: { fontSize: 13, color: C.primary },
  detailHead: { marginTop: 8 },
  roundTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 },
  matchRow: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, marginBottom: 8 },
  matchRowSmall: { padding: 6 },
  matchMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  matchId: { fontSize: 11, color: C.sub },
  scoreLink: { fontSize: 12, color: C.primary, fontWeight: '600' },
  matchBody: { flexDirection: 'row', gap: 8 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 },
  sideWin: { backgroundColor: C.softRed },
  sideText: { fontSize: 13, color: C.text, flexShrink: 1 },
  sideTextWin: { color: C.primary, fontWeight: '700' },
  check: { color: C.primary, fontWeight: '800' },
  matchScore: { fontSize: 11, color: C.sub, marginTop: 6 },
  standingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  rank: { width: 24, color: C.sub },
  standingName: { flex: 1, fontSize: 14, color: C.text },
  standingStat: { fontSize: 12, color: C.sub, marginRight: 12 },
  standingDiff: { fontSize: 13, color: C.green, width: 40, textAlign: 'right' },
  champion: { backgroundColor: C.softRed, borderRadius: 12, padding: 14, alignItems: 'center' },
  championText: { color: C.primary, fontWeight: '700' },
});
