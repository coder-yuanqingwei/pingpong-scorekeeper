import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, TextInput, Alert, Switch,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { ScoreNavProp, RootTabParamList, MatchConfig } from '../navigation.types';
import { C, R } from '../theme';
import { loadSettings, saveSettings } from '../storage';
import type { Settings } from '../storage';

type ScoreRoute = RouteProp<RootTabParamList, '首页'>;

const NAV_BLUE = '#4a76e8';
const RADIO_GREEN = '#09a34a';

/** 单选圆点 */
function RadioDot({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioInner} />}</View>;
}

export default function ScoreScreen() {
  const navigation = useNavigation<ScoreNavProp>();
  const route = useRoute<ScoreRoute>();

  const [title, setTitle] = useState('训练赛');
  const [dateLabel] = useState(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  const [gamesToWin, setGamesToWin] = useState(2);
  const [pointsToWin, setPointsToWin] = useState(11);
  const [singles, setSingles] = useState(true);
  const [nameA, setNameA] = useState('蓝方');
  const [nameB, setNameB] = useState('红方');
  const [serveInterval, setServeInterval] = useState(2);
  const [winByTwo, setWinByTwo] = useState(true);
  const [interGameRest, setInterGameRest] = useState(false);
  const [autoCourtSwap, setAutoCourtSwap] = useState(true);
  const [moreVisible, setMoreVisible] = useState(false);
  const [playerModal, setPlayerModal] = useState<'A' | 'B' | null>(null);
  const [playerDraft, setPlayerDraft] = useState('');

  useFocusEffect(useCallback(() => {
    loadSettings().then((s: Settings) => {
      setGamesToWin(s.gamesToWin);
      setPointsToWin(s.pointsToWin);
      setServeInterval(s.serveInterval);
      setWinByTwo(s.winByTwo);
      setInterGameRest(s.interGameRest ?? false);
      setAutoCourtSwap(s.autoCourtSwap ?? true);
      if (s.playerA && s.playerA !== '选手 A') setNameA(s.playerA);
      if (s.playerB && s.playerB !== '选手 B') setNameB(s.playerB);
    });
    const preset = route.params?.preset;
    if (preset) {
      if (preset.a) setNameA(preset.a);
      if (preset.b) setNameB(preset.b);
      navigation.setParams({ preset: null });
    }
  }, [route.params, navigation]));

  const startMatch = () => {
    const config: MatchConfig = {
      title: title.trim() || '训练赛',
      dateLabel,
      pointsToWin, gamesToWin, serveInterval, winByTwo, singles, nameA, nameB,
      interGameRest, autoCourtSwap,
    };
    saveSettings({
      pointsToWin, winByTwo, gamesToWin, serveInterval,
      playerA: nameA, playerB: nameB, interGameRest, autoCourtSwap,
    });
    navigation.navigate('Match', { config });
  };

  const commitPlayer = () => {
    const v = playerDraft.trim() || (playerModal === 'A' ? '蓝方' : '红方');
    if (playerModal === 'A') setNameA(v); else setNameB(v);
    setPlayerModal(null);
  };

  return (
    <View style={styles.screen}>
      {/* 蓝色导航栏（原版顶部导航） */}
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>乒乓计分器</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 圆形比分徽章：蓝/红各半 + 11:8 */}
        <View style={styles.badgeWrap}>
          <View style={styles.badge}>
            <View style={styles.badgeHalfBlue} />
            <View style={styles.badgeHalfRed} />
            <View style={styles.badgeCenter} />
            <Text style={[styles.badgeScore, styles.badgeScoreBlue]}>11</Text>
            <Text style={[styles.badgeScore, styles.badgeScoreRed]}>8</Text>
            <Text style={styles.badgeSmall}>PINGPONG</Text>
          </View>
        </View>

        {/* 比赛名 + 日期时间 */}
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="训练赛" />
          <View style={styles.dateBox}><Text style={styles.dateText}>{dateLabel}</Text></View>
        </View>

        {/* 赛制单选组 */}
        <View style={styles.radioGrid}>
          <TouchableOpacity style={styles.radioItem} onPress={() => setGamesToWin(3)}>
            <RadioDot on={gamesToWin === 3} /><Text style={styles.radioLabel}>5局3胜</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => setGamesToWin(2)}>
            <RadioDot on={gamesToWin === 2} /><Text style={styles.radioLabel}>3局2胜</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => setGamesToWin(1)}>
            <RadioDot on={gamesToWin === 1} /><Text style={styles.radioLabel}>1局1胜</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => setMoreVisible(true)}>
            <RadioDot on={false} /><Text style={styles.radioLabel}>更多</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.radioItem} onPress={() => setPointsToWin(21)}>
            <RadioDot on={pointsToWin === 21} /><Text style={styles.radioLabel}>21分</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => setPointsToWin(15)}>
            <RadioDot on={pointsToWin === 15} /><Text style={styles.radioLabel}>15分</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => setPointsToWin(11)}>
            <RadioDot on={pointsToWin === 11} /><Text style={styles.radioLabel}>11分</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => setMoreVisible(true)}>
            <RadioDot on={pointsToWin !== 11 && pointsToWin !== 15 && pointsToWin !== 21} />
            <Text style={styles.radioLabel}>自定义({pointsToWin}分)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.radioItem} onPress={() => setSingles(true)}>
            <RadioDot on={singles} /><Text style={styles.radioLabel}>单打</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => setSingles(false)}>
            <RadioDot on={!singles} /><Text style={styles.radioLabel}>双打</Text>
          </TouchableOpacity>
          <View style={styles.radioItem} />
          <TouchableOpacity style={styles.radioItem} onPress={() => setMoreVisible(true)}>
            <Text style={[styles.radioLabel, styles.moreLink]}>更多设置 ›</Text>
          </TouchableOpacity>
        </View>

        {/* 选手栏 */}
        <View style={styles.playerRow}>
          <View style={[styles.playerBox, styles.playerBoxA]}>
            <Text style={styles.playerHint}>默认：蓝方</Text>
            <TouchableOpacity style={[styles.playerAdd, styles.playerAddA]} onPress={() => { setPlayerModal('A'); setPlayerDraft(nameA); }}>
              <Text style={styles.playerAddIcon}>♙+</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.playerBox, styles.playerBoxB]}>
            <Text style={styles.playerHint}>默认：红方</Text>
            <TouchableOpacity style={[styles.playerAdd, styles.playerAddB]} onPress={() => { setPlayerModal('B'); setPlayerDraft(nameB); }}>
              <Text style={styles.playerAddIcon}>♙+</Text>
            </TouchableOpacity>
          </View>
        </View>
        {nameA !== '蓝方' && <Text style={styles.playerChosen}>蓝方选手：{nameA}</Text>}
        {nameB !== '红方' && <Text style={styles.playerChosen}>红方选手：{nameB}</Text>}

        {/* 开始比赛 */}
        <View style={styles.startRow}>
          <TouchableOpacity style={styles.startBtn} onPress={startMatch}>
            <Text style={styles.startText}>开始比赛</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('球员')}>
            <Text style={styles.historyIcon}>↺</Text>
          </TouchableOpacity>
        </View>

        {/* 三个功能入口 */}
        <View style={styles.entryRow}>
          <TouchableOpacity style={styles.entry} onPress={() => navigation.navigate('比赛活动')}>
            <View style={styles.entryIconWrap}><Text style={styles.entryIcon}>▦</Text></View>
            <Text style={styles.entryLabel}>比赛活动</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.entry} onPress={() => navigation.navigate('比赛活动')}>
            <View style={styles.entryIconWrap}><Text style={styles.entryIcon}>♟</Text></View>
            <Text style={styles.entryLabel}>俱乐部</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.entry} onPress={() => navigation.navigate('球员')}>
            <View style={styles.entryIconWrap}><Text style={styles.entryIcon}>♙</Text></View>
            <Text style={styles.entryLabel}>好友</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 更多设置弹层 */}
      <Modal visible={moreVisible} transparent animationType="slide" onRequestClose={() => setMoreVisible(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>更多设置</Text>
            <Text style={styles.modalLabel}>每局分数（可自定义）</Text>
            <TextInput
              style={styles.modalInput} keyboardType="numeric"
              value={String(pointsToWin)}
              onChangeText={(v) => setPointsToWin(Math.max(1, parseInt(v, 10) || 1))}
            />
            <View style={styles.switchRow}>
              <Text style={styles.modalLabel}>净胜两分才算赢</Text>
              <Switch value={winByTwo} onValueChange={setWinByTwo} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.modalLabel}>发球间隔（分）</Text>
              <TextInput
                style={styles.modalInputSmall} keyboardType="numeric"
                value={String(serveInterval)}
                onChangeText={(v) => setServeInterval(Math.max(1, parseInt(v, 10) || 2))}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.modalLabel}>局间休息 60 秒</Text>
              <Switch value={interGameRest} onValueChange={setInterGameRest} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.modalLabel}>自动换边</Text>
              <Switch value={autoCourtSwap} onValueChange={setAutoCourtSwap} />
            </View>
            <TouchableOpacity style={styles.modalOk} onPress={() => setMoreVisible(false)}>
              <Text style={styles.modalOkText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 选手编辑弹层 */}
      <Modal visible={!!playerModal} transparent animationType="fade" onRequestClose={() => setPlayerModal(null)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{playerModal === 'A' ? '蓝方' : '红方'}选手</Text>
            <TextInput style={styles.modalInput} autoFocus value={playerDraft} onChangeText={setPlayerDraft} onSubmitEditing={commitPlayer} />
            <TouchableOpacity style={styles.modalOk} onPress={commitPlayer}>
              <Text style={styles.modalOkText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  navBar: {
    height: 52, backgroundColor: NAV_BLUE, alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  content: { paddingBottom: 30 },

  badgeWrap: { alignItems: 'center', marginTop: 22, marginBottom: 18 },
  badge: {
    width: 108, height: 108, borderRadius: 54, overflow: 'hidden',
    backgroundColor: '#eaf0fb', shadowColor: 'rgba(15,23,42,0.18)',
    shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  badgeHalfBlue: { position: 'absolute', left: 0, top: 0, width: 54, height: 108, backgroundColor: '#1667d6' },
  badgeHalfRed: { position: 'absolute', right: 0, top: 0, width: 54, height: 108, backgroundColor: '#d40000' },
  badgeCenter: {
    position: 'absolute', left: 49, top: 18, width: 10, height: 72, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  badgeScore: { position: 'absolute', top: 26, fontSize: 22, fontWeight: '800', color: '#fff' },
  badgeScoreBlue: { left: 17 },
  badgeScoreRed: { right: 16 },
  badgeSmall: { position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: 7, fontWeight: '700', letterSpacing: 1 },

  inputRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 14 },
  input: {
    flex: 1, height: 44, borderWidth: 1, borderColor: '#d7dce3', borderRadius: 8,
    paddingHorizontal: 14, fontSize: 15, color: C.text,
  },
  dateBox: {
    flex: 1, height: 44, borderWidth: 1, borderColor: '#d7dce3', borderRadius: 8,
    paddingHorizontal: 12, justifyContent: 'center',
  },
  dateText: { fontSize: 14, color: '#4b5563' },

  radioGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, rowGap: 18, marginBottom: 18 },
  radioItem: { width: '25%', alignItems: 'center', justifyContent: 'center' },
  radio: {
    width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: '#c7ced8',
    alignItems: 'center', justifyContent: 'center', marginBottom: 7,
  },
  radioOn: { borderColor: RADIO_GREEN },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: RADIO_GREEN },
  radioLabel: { fontSize: 13, color: '#374151' },
  moreLink: { color: '#6b7280', marginTop: 30 },

  playerRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 10 },
  playerBox: {
    flex: 1, height: 48, borderRadius: 8, borderWidth: 1.5, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14,
  },
  playerBoxA: { borderColor: '#1667d6' },
  playerBoxB: { borderColor: '#d40000' },
  playerHint: { fontSize: 14, color: '#6b7280' },
  playerAdd: { width: 50, height: 46, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  playerAddA: { backgroundColor: '#1667d6' },
  playerAddB: { backgroundColor: '#d40000' },
  playerAddIcon: { color: '#fff', fontSize: 16, fontWeight: '700' },
  playerChosen: { paddingHorizontal: 18, fontSize: 12, color: '#6b7280', marginBottom: 6 },

  startRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 26, marginBottom: 30 },
  startBtn: { flex: 1, height: 48, borderRadius: 8, backgroundColor: '#f2f3f5', alignItems: 'center', justifyContent: 'center' },
  startText: { fontSize: 17, fontWeight: '700', color: '#1667d6' },
  historyBtn: { width: 50, height: 48, borderRadius: 8, backgroundColor: '#f2f3f5', alignItems: 'center', justifyContent: 'center' },
  historyIcon: { fontSize: 26, color: '#9ca3af' },

  entryRow: { flexDirection: 'row', paddingHorizontal: 24, justifyContent: 'space-between' },
  entry: { alignItems: 'center', width: 90 },
  entryIconWrap: {
    width: 56, height: 56, borderRadius: 14, backgroundColor: '#eaf1ff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  entryIcon: { fontSize: 28, color: '#6f9df0' },
  entryLabel: { fontSize: 13, color: '#374151' },

  modalMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: 20, paddingBottom: 30 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 14 },
  modalLabel: { fontSize: 13, color: C.sub, marginBottom: 8 },
  modalInput: { borderWidth: 1, borderColor: '#d7dce3', borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text, marginBottom: 12 },
  modalInputSmall: { borderWidth: 1, borderColor: '#d7dce3', borderRadius: R.sm, width: 70, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.text, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  modalOk: { marginTop: 18, backgroundColor: NAV_BLUE, borderRadius: R.md, paddingVertical: 13, alignItems: 'center' },
  modalOkText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
