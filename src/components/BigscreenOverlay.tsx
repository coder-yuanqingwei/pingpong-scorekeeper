import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, StatusBar, Platform, Animated, Easing,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import type { DerivedTheme } from '../scoreThemes';
import { SCORE_FONT } from '../theme';
import { ClickHandHint } from './ClickHandHint';
import { t, useI18n } from '../i18n';

export type BSide = 'A' | 'B';
export type BCallout = '' | '局点' | '赛点' | '胜';

/** 大屏模式（电视投屏）全屏 overlay：
 *  手机系统「投屏/屏幕镜像」把此画面镜像到电视，电视零输入。
 *  横屏锁定 + 屏幕常亮 + 黑底主题配色 + 超大比分；
 *  点击左右半屏计分（左=左侧队伍 +1），卡下方 − 撤销，右上角双击退出。 */
export interface BigscreenOverlayProps {
  title: string;
  nameA: string; nameB: string;
  scoreA: number; scoreB: number;
  gamesA: number; gamesB: number;
  serve: BSide;
  calloutA: BCallout; calloutB: BCallout;
  awaitingConfirm: boolean;
  winner: BSide | null;
  courtSwapped: boolean;
  formatLabel: string;
  matchSeconds: number;
  theme: DerivedTheme;
  pauseActive: boolean;
  pauseSeconds: number;
  onAddPoint: (side: BSide) => void;
  onUndo: (side: BSide) => void;
  onExit: () => void;
}

function fmtTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function BigscreenOverlay(props: BigscreenOverlayProps) {
  useI18n();   // 订阅界面语言变化
  const {
    title, nameA, nameB, scoreA, scoreB, gamesA, gamesB, serve,
    calloutA, calloutB, awaitingConfirm, winner, courtSwapped,
    formatLabel, matchSeconds, theme, pauseActive, pauseSeconds,
    onAddPoint, onUndo, onExit,
  } = props;
  const { width: W, height: H } = useWindowDimensions();

  // 横屏锁定 + 屏幕常亮（web 预览无锁向 API）
  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
    activateKeepAwakeAsync().catch(() => {});
    if (Platform.OS !== 'web') StatusBar.setHidden(true);
    return () => {
      if (Platform.OS !== 'web') {
        StatusBar.setHidden(false);
        // 全局已强制横屏（app.json orientation=landscape），退出大屏时重新锁定横屏，
        // 不能用 unlockAsync()——否则方向交还系统会随手持方向变回竖屏。
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      }
      deactivateKeepAwake();
    };
  }, []);

  // 右上角退出：2.5 秒内双击确认，防比赛误触
  const [exitHint, setExitHint] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExitPress = () => {
    if (exitHint) {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      onExit();
      return;
    }
    setExitHint(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setExitHint(false), 2500);
  };
  useEffect(() => () => { if (exitTimerRef.current) clearTimeout(exitTimerRef.current); }, []);

  // 比分变化脉冲动画（复刻翻牌的轻量版：放大 8% 后回落）
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    pulse.setValue(0.92);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreA, scoreB]);

  /** 单侧队伍大卡。slot 为该队伍当前所处的左右位置（跟随 courtSwapped 对调）。 */
  const sideCard = (side: BSide, slot: 'left' | 'right') => {
    const name = side === 'A' ? nameA : nameB;
    const score = side === 'A' ? scoreA : scoreB;
    const games = side === 'A' ? gamesA : gamesB;
    const callout = side === 'A' ? calloutA : calloutB;
    const showWinHint = awaitingConfirm && winner === side;
    const grad = (side === 'A' ? theme.gradHome : theme.gradAway) as [string, string];
    const calloutColor = side === 'A' ? theme.calloutTextHome : theme.calloutTextAway;
    const scoreFont = Math.min(W * 0.19, H * 0.44);
    return (
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={0.92}
        onPress={() => onAddPoint(side)}
        accessibilityLabel={showWinHint ? t('点击开始下一局') : `${name} 加一分`}
      >
        <LinearGradient colors={grad} style={bs.card}>
          {/* 顶部：球员名 + 发球指示点 + 局分 */}
          <View style={bs.cardHead}>
            <View style={bs.serveDotWrap}>
              {serve === side && <View style={[bs.serveDot, { width: H * 0.028, height: H * 0.028, borderRadius: H * 0.014 }]} />}
            </View>
            <Text style={[bs.name, { fontSize: Math.min(W * 0.045, H * 0.09) }]} numberOfLines={1}>{name}</Text>
            <View style={bs.gamesWrap}>
              <Text style={[bs.gamesLabel, { fontSize: Math.min(W * 0.014, H * 0.03) }]}>{t("局")}</Text>
              <Text style={[bs.games, { fontSize: Math.min(W * 0.035, H * 0.075) }]}>{games}</Text>
            </View>
          </View>
          {/* 中央：超大比分 */}
          <View style={bs.scoreWrap}>
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <Text style={[bs.score, { fontSize: scoreFont, lineHeight: scoreFont * 1.05 }]}>{score}</Text>
            </Animated.View>
            {showWinHint && (
              <View style={bs.winBadge}>
                <Text style={[bs.winText, { fontSize: Math.min(W * 0.03, H * 0.065) }]}>{t("胜")}</Text>
              </View>
            )}
          </View>
          {/* 底部：局点/赛点气泡 + 撤销小按钮 */}
          <View style={bs.cardFoot}>
            {!!callout && (
              <View style={bs.callout}>
                <Text style={[bs.calloutText, { color: calloutColor, fontSize: Math.min(W * 0.02, H * 0.045) }]}>{callout}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[bs.undoBtn, { width: H * 0.11, height: H * 0.11, borderRadius: H * 0.022 }]}
              onPress={() => onUndo(side)}
              activeOpacity={0.75}
            >
              <Text style={[bs.undoText, { fontSize: H * 0.055 }]}>−</Text>
            </TouchableOpacity>
          </View>
          {/* 局胜待确认：赢家整卡覆盖点击手势（复用 ClickHandHint） */}
          {showWinHint && <ClickHandHint size={H * 0.12} onPress={() => onAddPoint(side)} />}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={bs.root}>
      {/* 左侧队伍（换边后对调显示） */}
      {courtSwapped ? sideCard('B', 'left') : sideCard('A', 'left')}

      {/* 中间信息条：赛事名/赛制/用时 + 暂停状态 + 退出 */}
      <View style={bs.center}>
        <TouchableOpacity onPress={onExitPress} style={bs.exitBtn} activeOpacity={0.8}>
          <Text style={[bs.exitText, exitHint && bs.exitTextHot]}>{exitHint ? t('再点一次退出') : '✕'}</Text>
        </TouchableOpacity>
        <View style={bs.centerBody}>
          <Text style={[bs.title, { fontSize: Math.min(W * 0.018, H * 0.038) }]} numberOfLines={1}>{title}</Text>
          <Text style={[bs.format, { fontSize: Math.min(W * 0.014, H * 0.03) }]}>{formatLabel}</Text>
          <Text style={[bs.clock, { fontSize: Math.min(W * 0.02, H * 0.042) }]}>{fmtTime(matchSeconds)}</Text>
          {pauseActive && (
            <View style={bs.pauseBadge}>
              <Text style={[bs.pauseText, { fontSize: Math.min(W * 0.018, H * 0.038) }]}>暂停中 {pauseSeconds}s</Text>
            </View>
          )}
        </View>
      </View>

      {/* 右侧队伍 */}
      {courtSwapped ? sideCard('A', 'right') : sideCard('B', 'right')}
    </View>
  );
}

const bs = StyleSheet.create({
  root: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: '#000', flexDirection: 'row', zIndex: 100,
  },
  card: { flex: 1, borderRadius: 0, overflow: 'hidden' },
  cardHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: '2.5%', paddingTop: '2%',
    gap: 12,
  },
  serveDotWrap: { width: '4%', alignItems: 'center' },
  serveDot: { backgroundColor: '#fff' },
  name: { color: '#fff', fontWeight: '800', flex: 1, includeFontPadding: false },
  gamesWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  gamesLabel: { color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  games: { color: '#fff', fontFamily: SCORE_FONT, fontWeight: '900' },
  scoreWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  score: { color: '#fff', fontFamily: SCORE_FONT, fontWeight: '900', textAlign: 'center', includeFontPadding: false },
  winBadge: { position: 'absolute', top: '6%', right: '8%' },
  winText: { color: '#fff', fontWeight: '900' },
  cardFoot: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: '2.5%', paddingBottom: '2.5%',
  },
  callout: {
    backgroundColor: '#fff', borderTopLeftRadius: 10, borderBottomRightRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  calloutText: { fontWeight: '800' },
  undoBtn: {
    backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center',
  },
  undoText: { color: '#fff', fontWeight: '700', lineHeight: 22, marginTop: -6 },
  center: { width: '16%', alignItems: 'center', paddingTop: '2%' },
  exitBtn: {
    alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)',
  },
  exitText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700' },
  exitTextHot: { color: '#ffb020', fontWeight: '900' },
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { color: '#fff', fontWeight: '700', maxWidth: '90%' },
  format: { color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  clock: { color: 'rgba(255,255,255,0.8)', fontVariant: ['tabular-nums'], fontWeight: '700' },
  pauseBadge: {
    backgroundColor: 'rgba(255,176,32,0.9)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  pauseText: { color: '#000', fontWeight: '800' },
});
