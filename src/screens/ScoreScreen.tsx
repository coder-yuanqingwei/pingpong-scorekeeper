import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, TextInput, Alert, Switch, useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { ScoreNavProp, RootTabParamList, MatchConfig } from '../navigation.types';
import { C, R } from '../theme';
import { loadSettings, saveSettings } from '../storage';
import type { Settings } from '../storage';
import { HistoryIcon } from '../components/ToolIcons';
import {
  FREE_GAMES_IDLE_LABEL, FREE_GAMES_RADIO_LABELS, FREE_GAMES_SELECTOR_RANGE,
  FREE_GAMES_CAP, FREE_WINS_REQUIRED, clampFreeGamesPickerIndex,
  freeGamesRadioLabelFromIndex, winsRequiredFromFreePickerIndex,
} from '../freeGamesOptions';
import {
  CUSTOM_SCORE_DEFAULT, CUSTOM_SCORE_SELECTOR_RANGE,
  customScoreFromPickerIndex, customScoreIndexOf, normalizeCustomScore,
} from '../customScoreOptions';

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
  // 原型 freeGamesPickerIndex / isFreeGamesSelected：自由赛制下拉（utils/freeGamesOptions）
  const [freeIdx, setFreeIdx] = useState(0);
  const [isFree, setIsFree] = useState(false);
  // 原型 currentCustomScore / isCustomSelected：自定义每局分数下拉（utils/customScoreOptions）
  const [currentCustomScore, setCurrentCustomScore] = useState(CUSTOM_SCORE_DEFAULT);
  const [isCustomSelected, setIsCustomSelected] = useState(false);
  // 通用锚定下拉：'free'（赛制）| 'custom'（每局分数）
  const [ddKind, setDdKind] = useState<'free' | 'custom' | null>(null);
  const freeAnchorRef = React.useRef<React.ComponentRef<typeof TouchableOpacity> | null>(null);
  const customAnchorRef = React.useRef<React.ComponentRef<typeof TouchableOpacity> | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const { width: winW } = useWindowDimensions();

  useFocusEffect(useCallback(() => {
    loadSettings().then((s: Settings) => {
      setGamesToWin(s.gamesToWin);
      setPointsToWin(s.pointsToWin);
      setServeInterval(s.serveInterval);
      setWinByTwo(s.winByTwo);
      setInterGameRest(s.interGameRest ?? false);
      setAutoCourtSwap(s.autoCourtSwap ?? true);
      if (s.free) {
        setIsFree(true);
        setFreeIdx(clampFreeGamesPickerIndex(s.freeGamesPickerIndex ?? 0));
        setGamesToWin(s.gamesToWin);
      }
      // 自定义分数恢复：非 21/15/11 即为自定义选中态（原型 isCustomSelected）
      if (![21, 15, 11].includes(s.pointsToWin)) {
        setCurrentCustomScore(s.pointsToWin);
        setIsCustomSelected(true);
      }
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

  const openDropdown = (kind: 'free' | 'custom', ref: React.RefObject<React.ComponentRef<typeof TouchableOpacity> | null>) => {
    ref.current?.measureInWindow((x, y, w) => {
      setAnchorPos({ x, y, w });
      setDdKind(kind);
    });
  };

  // 原型 onFreeGamesSelectorChange：选中下拉项 → 应用赛制并持久化
  const applyFreePick = (idx: number) => {
    const i = clampFreeGamesPickerIndex(idx);
    const winsRequired = winsRequiredFromFreePickerIndex(i);
    setFreeIdx(i);
    setIsFree(true);
    setDdKind(null);
    setGamesToWin(winsRequired);
    saveSettings({
      pointsToWin, winByTwo, gamesToWin: winsRequired, serveInterval,
      playerA: nameA, playerB: nameB, interGameRest, autoCourtSwap,
      free: true, freeGamesPickerIndex: i,
    }).catch(() => {});
  };

  // 原型 onCustomScoreSelectorChange：选中自定义分值 → scorePerGame=i + 标签更新 + 持久化
  const applyCustomPick = (idx: number) => {
    const v = customScoreFromPickerIndex(idx);
    setCurrentCustomScore(v);
    setIsCustomSelected(true);
    setPointsToWin(v);
    setDdKind(null);
    saveSettings({
      pointsToWin: v, winByTwo, gamesToWin, serveInterval,
      playerA: nameA, playerB: nameB, interGameRest, autoCourtSwap,
      free: isFree, freeGamesPickerIndex: freeIdx,
    }).catch(() => {});
  };

  const startMatch = () => {
    const free = isFree;
    const config: MatchConfig = {
      title: title.trim() || '训练赛',
      dateLabel,
      pointsToWin, gamesToWin: free ? winsRequiredFromFreePickerIndex(freeIdx) : gamesToWin,
      serveInterval, winByTwo, singles, nameA, nameB,
      interGameRest, autoCourtSwap,
      free: free && freeIdx === 0 ? true : undefined,
    };
    saveSettings({
      pointsToWin, winByTwo, gamesToWin: config.gamesToWin, serveInterval,
      playerA: nameA, playerB: nameB, interGameRest, autoCourtSwap,
      free: isFree, freeGamesPickerIndex: freeIdx,
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
          <TouchableOpacity style={styles.radioItem} onPress={() => { setGamesToWin(3); setIsFree(false); }}>
            <RadioDot on={gamesToWin === 3 && !isFree} /><Text style={styles.radioLabel}>5局3胜</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => { setGamesToWin(2); setIsFree(false); }}>
            <RadioDot on={gamesToWin === 2 && !isFree} /><Text style={styles.radioLabel}>3局2胜</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => { setGamesToWin(1); setIsFree(false); }}>
            <RadioDot on={gamesToWin === 1 && !isFree} /><Text style={styles.radioLabel}>1局1胜</Text>
          </TouchableOpacity>
          {/* 4. 自由赛制（原型 freeGamesOptions：闲时「更多」，选中显示赛制名；点按弹锚定下拉） */}
          <TouchableOpacity
            ref={freeAnchorRef}
            style={styles.radioItem}
            onPress={() => openDropdown('free', freeAnchorRef)}
            accessibilityLabel="自由赛制"
          >
            <RadioDot on={isFree} />
            <Text
              style={styles.radioLabel}
              numberOfLines={1}
            >
              {isFree ? freeGamesRadioLabelFromIndex(freeIdx) : FREE_GAMES_IDLE_LABEL}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.radioItem} onPress={() => { setPointsToWin(21); setIsCustomSelected(false); }}>
            <RadioDot on={pointsToWin === 21 && !isCustomSelected} /><Text style={styles.radioLabel}>21分</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => { setPointsToWin(15); setIsCustomSelected(false); }}>
            <RadioDot on={pointsToWin === 15 && !isCustomSelected} /><Text style={styles.radioLabel}>15分</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioItem} onPress={() => { setPointsToWin(11); setIsCustomSelected(false); }}>
            <RadioDot on={pointsToWin === 11 && !isCustomSelected} /><Text style={styles.radioLabel}>11分</Text>
          </TouchableOpacity>
          {/* 8. 自定义每局分数（原型 customScoreOptions：闲时「自定义(7分)」，选中显示当前分值；点按弹锚定下拉） */}
          <TouchableOpacity
            ref={customAnchorRef}
            style={styles.radioItem}
            onPress={() => openDropdown('custom', customAnchorRef)}
            accessibilityLabel="自定义分数"
          >
            <RadioDot on={isCustomSelected} />
            <Text style={styles.radioLabel} numberOfLines={1}>
              {isCustomSelected ? `自定义(${pointsToWin}分)` : `自定义(${currentCustomScore}分)`}
            </Text>
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
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => navigation.navigate('球员')}
            accessibilityLabel="历史比赛"
          >
            <HistoryIcon size={22} color="#8d8d8d" />
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

      {/* 自由赛制/自定义分数 下拉（原型 picker selector 弹出样式：白卡圆角阴影、选项居中、点外部关闭） */}
      {ddKind !== null && (() => {
        const opts = ddKind === 'free' ? FREE_GAMES_SELECTOR_RANGE : CUSTOM_SCORE_SELECTOR_RANGE;
        const curIdx = ddKind === 'free' ? freeIdx : customScoreIndexOf(pointsToWin);
        const curOn = ddKind === 'free' ? isFree : isCustomSelected;
        const onPick = ddKind === 'free' ? applyFreePick : applyCustomPick;
        return (
          <TouchableOpacity
            style={styles.ddOverlay}
            activeOpacity={1}
            onPress={() => setDdKind(null)}
          >
            <View
              style={[
                styles.ddCard,
                anchorPos && {
                  top: anchorPos.y + 96,
                  left: Math.max(12, Math.min(anchorPos.x + anchorPos.w / 2 - 130, winW - 272)),
                },
              ]}
            >
              <ScrollView style={opts.length > 8 ? styles.ddListScroll : undefined} nestedScrollEnabled>
                {opts.map((opt, i) => (
                  <TouchableOpacity
                    key={opt}
                    style={styles.ddItem}
                    activeOpacity={0.6}
                    onPress={() => onPick(i)}
                  >
                    <Text
                      style={[styles.ddItemText, curOn && curIdx === i && styles.ddItemTextOn]}
                      numberOfLines={1}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        );
      })()}

      {/* 更多设置弹层 */}
      <Modal visible={moreVisible} transparent animationType="slide" onRequestClose={() => setMoreVisible(false)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>更多设置</Text>
            <Text style={styles.modalLabel}>每局分数（可自定义）</Text>
            <TextInput
              style={styles.modalInput} keyboardType="numeric"
              value={String(pointsToWin)}
              onChangeText={(v) => {
                // 原型 normalizeCustomScore：錳到 3..100 并吸附到最近合法分值
                const snapped = normalizeCustomScore(parseInt(v, 10) || CUSTOM_SCORE_DEFAULT);
                setPointsToWin(snapped);
                setCurrentCustomScore(snapped);
                setIsCustomSelected(true);
              }}
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

  // 原型 qs-home-action-row / qs-home-start-btn / qs-home-history-btn：开始按钮与历史按钮同高(80rpx)、
  // 同背景 #f2f2f2；历史按钮正方形(80×80rpx)、圆角16rpx、图标40rpx 灰 #8d8d8d，紧贴开始按钮右侧(间距16rpx)。
  startRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 26, marginBottom: 30 },
  startBtn: { flex: 1, height: 48, borderRadius: 9, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },
  startText: { fontSize: 17, fontWeight: '700', color: '#2c6cea' },
  historyBtn: { width: 48, height: 48, borderRadius: 9, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },

  entryRow: { flexDirection: 'row', paddingHorizontal: 24, justifyContent: 'space-between' },
  entry: { alignItems: 'center', width: 90 },
  entryIconWrap: {
    width: 56, height: 56, borderRadius: 14, backgroundColor: '#eaf1ff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  entryIcon: { fontSize: 28, color: '#6f9df0' },
  entryLabel: { fontSize: 13, color: '#374151' },

  modalMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },

  // 自由赛制下拉（截图复刻：白卡圆角阴影、选项居中，覆盖在单选组上）
  ddOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 30 },
  ddCard: {
    position: 'absolute', width: 260, backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 8,
    shadowColor: 'rgba(15,23,42,0.18)', shadowOpacity: 1, shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  ddListScroll: { maxHeight: 336 },
  ddItem: { height: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  ddItemText: { fontSize: 16, color: '#1f2937' },
  ddItemTextOn: { color: RADIO_GREEN, fontWeight: '600' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: 20, paddingBottom: 30 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 14 },
  modalLabel: { fontSize: 13, color: C.sub, marginBottom: 8 },
  modalInput: { borderWidth: 1, borderColor: '#d7dce3', borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text, marginBottom: 12 },
  modalInputSmall: { borderWidth: 1, borderColor: '#d7dce3', borderRadius: R.sm, width: 70, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.text, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  modalOk: { marginTop: 18, backgroundColor: NAV_BLUE, borderRadius: R.md, paddingVertical: 13, alignItems: 'center' },
  modalOkText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
