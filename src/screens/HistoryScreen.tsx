import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { C, shadow, R } from '../theme';
import Hero from '../components/Hero';
import { loadMatches, removeMatch } from '../storage';
import type { MatchRecord } from '../storage';
import type { HistoryNavProp } from '../navigation.types';

export default function HistoryScreen() {
  const navigation = useNavigation<HistoryNavProp>();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadMatches().then(setMatches);
  }, []));

  if (!matches.length) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emoji}>🏓</Text>
        <Text style={styles.emptyTitle}>还没有比赛记录</Text>
        <Text style={styles.emptyText}>去「计分」页打一场，结果会自动保存在这里</Text>
      </View>
    );
  }

  return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Hero kicker="PLAYERS & RECORDS" title="球员" lead={`交手记录 · 共 ${matches.length} 场`} />
      {matches.map((m) => {
        const open = expanded === m.id;
        const ongoing = m.status === 'ongoing' && !!m.snapshot;
        const snap = m.snapshot;
        return (
          <View key={m.id} style={[styles.card, ongoing && styles.cardOngoing]}>
            <TouchableOpacity onPress={() => setExpanded(open ? null : m.id)} disabled={ongoing}>
              <View style={styles.row}>
                <Text style={styles.date}>{new Date(m.date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
                {ongoing ? (
                  <Text style={styles.ongoingTag}>进行中</Text>
                ) : (
                  <Text style={[styles.resultTag, m.winner === 'B' && styles.resultTagBlue]}>
                    {m.winner === 'A' ? m.nameA : m.nameB} 胜
                  </Text>
                )}
              </View>
              <View style={styles.scoreRow}>
                <Text style={[styles.name, !ongoing && m.winner === 'A' && styles.nameWin]}>{m.nameA}</Text>
                <Text style={styles.score}>{`${m.gamesA} : ${m.gamesB}`}</Text>
                <Text style={[styles.name, styles.nameRight, !ongoing && m.winner === 'B' && styles.nameWin]}>{m.nameB}</Text>
              </View>
              {ongoing && snap && (
                <Text style={styles.ongoingHint}>第 {snap.gameHistory.length + 1} 局 · 当前 {snap.scoreA} : {snap.scoreB}</Text>
              )}
              {!ongoing && <Text style={styles.detailHint}>{open ? '收起详情 ▲' : '查看详情 ▼'}</Text>}
            </TouchableOpacity>
            {ongoing && snap && (
              <View>
                <TouchableOpacity
                  style={styles.resumeBtn}
                  onPress={() => navigation.navigate('Match', { config: snap.config, resume: snap })}
                >
                  <Text style={styles.resumeBtnText}>继续比赛 →</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.delOngoing} onPress={() => {
                  Alert.alert('删除记录', '确定放弃这场未完成的比赛？', [
                    { text: '取消', style: 'cancel' },
                    { text: '删除', style: 'destructive', onPress: () => removeMatch(m.id).then(setMatches) },
                  ]);
                }}><Text style={styles.delText}>放弃这场比赛</Text></TouchableOpacity>
              </View>
            )}
            {!ongoing && open && (
              <View style={styles.detail}>
                {(m.games || []).map((g, i) => (
                  <View key={i} style={styles.gameRow}>
                    <Text style={styles.gameIndex}>第 {g.index || i + 1} 局</Text>
                    <Text style={styles.gameScore}>{g.a} : {g.b}</Text>
                    <Text style={styles.gameWinner}>{g.winner === 'A' ? m.nameA : m.nameB}</Text>
                  </View>
                ))}
                <TouchableOpacity style={styles.delBtn} onPress={() => {
                  Alert.alert('删除记录', '确定删除这场比赛？', [
                    { text: '取消', style: 'cancel' },
                    { text: '删除', style: 'destructive', onPress: () => removeMatch(m.id).then(setMatches) },
                  ]);
                }}><Text style={styles.delText}>删除记录</Text></TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emoji: { fontSize: 54, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  emptyText: { fontSize: 13, color: C.sub, marginTop: 8, textAlign: 'center' },
  h1: { fontSize: 24, fontWeight: '800', color: C.text, marginTop: 8 },
  sub: { fontSize: 13, color: C.sub, marginTop: 4, marginBottom: 16 },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.borderSoft, ...shadow },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12, color: C.sub },
  resultTag: { fontSize: 12, color: C.primary, backgroundColor: C.softRed, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  resultTagBlue: { color: C.blue, backgroundColor: C.softBlue },
  cardOngoing: { borderColor: C.blue, borderWidth: 1.5 },
  ongoingTag: { fontSize: 12, color: '#fff', backgroundColor: C.blue, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontWeight: '700' },
  ongoingHint: { fontSize: 12, color: C.blue, textAlign: 'center', marginTop: 8 },
  resumeBtn: { marginTop: 12, backgroundColor: C.blue, borderRadius: R.md, paddingVertical: 10, alignItems: 'center' },
  resumeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  delOngoing: { alignSelf: 'center', marginTop: 10, paddingVertical: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  name: { flex: 1, fontSize: 14, color: C.text },
  nameRight: { textAlign: 'right' },
  nameWin: { fontWeight: '800', color: C.primary },
  score: { fontSize: 20, fontWeight: '800', color: C.text, marginHorizontal: 16 },
  detailHint: { fontSize: 11, color: C.sub, textAlign: 'center', marginTop: 12 },
  detail: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  gameRow: { flexDirection: 'row', paddingVertical: 8 },
  gameIndex: { flex: 1, fontSize: 13, color: C.sub },
  gameScore: { fontSize: 14, fontWeight: '700', color: C.text, marginRight: 20 },
  gameWinner: { fontSize: 12, color: C.sub },
  delBtn: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 8 },
  delText: { fontSize: 13, color: C.primary },
});
