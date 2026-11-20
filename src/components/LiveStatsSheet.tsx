import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing,
  useWindowDimensions,
} from 'react-native';
import { t, useI18n } from '../i18n';

/**
 * 原型 pages/score 第5个按钮「技术统计」→ onOpenLiveStatsSheet 打开的
 * score-live-stats-sheet 深度复刻。证据来自 REA 静态分析：
 *  - WXML 编译体 page-frame.js @175060（模板）、@343588/@344410（CSS）
 *  - app-service.js @376502 onOpenLiveStatsSheet、@375363 buildLiveStatsSheetPatch
 *  - utils/matchStatsDetail.js（unpacked/app-service.js @930722）：STAT_ROWS_RACKET 五项指标
 *    + buildStatsWithBars（比例条 bluePct/redPct、领先项加粗）
 *
 * 视觉要点（按原型 CSS 1:1）：
 *  - 全屏遮罩 active 后 rgba(0,0,0,.45)；底部弹层 bg rgba(0,0,0,.88)、圆角 20 上、
 *    宽 65%、max-height 78vh、从下方滑入 0.32s cubic-bezier(.32,.72,0,1)。
 *  - 顶部 蓝方/红方 名单（各 flex:1 居中，18px，rgba(226,232,240,.82)）。
 *  - 每行 = [左值 | 中标签(宽152) | 右值] + 下方左右分半的细比例条(gap5, 高4)。
 *  - 数值 20px rgba(248,250,252,.72)，领先方 #f8fafc + 800 加粗；标签 16px rgba(226,232,240,.68)。
 *  - courtSidesSwapped 时名单/数值/比例条左右镜像（row-reverse + 文案左右对齐翻转）。
 */
export interface LiveStatRow {
  label: string;
  blue: string;
  red: string;
  bluePct: number;
  redPct: number;
  blueLead: boolean;
  redLead: boolean;
}

export interface LiveStatsSheetProps {
  visible: boolean;
  onClose: () => void;
  homeTitle: string;
  awayTitle: string;
  rows: LiveStatRow[];
  /** courtSidesSwapped：左右镜像（原型 score-live-stats-sheet--swapped） */
  swapped?: boolean;
  /** 蓝/红比例条填充色（主题色） */
  fillHome?: string;
  fillAway?: string;
}

export default function LiveStatsSheet({
  visible, onClose, homeTitle, awayTitle, rows, swapped = false,
  fillHome = '#2c6cea', fillAway = '#e05252',
}: LiveStatsSheetProps) {
  useI18n();   // 订阅界面语言变化
  const { width: W, height: H } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [active, setActive] = useState(false);
  const anim = useRef(new Animated.Value(0)).current; // 0 关闭 → 1 打开
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (visible) {
      setMounted(true);
      // 原型 wx.nextTick + setTimeout(30) 再置 active，触发 .3s 过渡
      const t = setTimeout(() => setActive(true), 30);
      Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true }).start();
      return () => clearTimeout(t);
    }
    setActive(false);
    Animated.timing(anim, { toValue: 0, duration: 260, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true }).start();
    closeTimer.current = setTimeout(() => setMounted(false), 300);
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [visible, anim]);

  if (!mounted && !visible) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [H, 0] });
  const maskOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const names = (
    <View style={[v.names, swapped && v.rowReverse]}>
      <View style={v.nameCol}><Text style={v.name} numberOfLines={1}>{swapped ? awayTitle : homeTitle}</Text></View>
      <View style={v.nameCol}><Text style={v.name} numberOfLines={1}>{swapped ? homeTitle : awayTitle}</Text></View>
    </View>
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={v.maskOuter}>
        {/* 半透明遮罩层：点遮罩关闭（原型 tap mask 关闭） */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,.45)', opacity: maskOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        </Animated.View>
        {/* 底部弹层内容：点内部不关闭 */}
        <Animated.View style={[v.sheet, { width: W * 0.65, transform: [{ translateY }] }]} pointerEvents={active ? 'auto' : 'none'}>
          {names}
          <View style={v.body}>
            {rows.map((r, i) => (
              <View key={i} style={v.row}>
                {/* 数值行：[左值 | 中标签 | 右值]，swapped 时镜像 */}
                <View style={[v.nums, swapped && v.rowReverse]}>
                  <Text style={[v.val, !swapped && r.blueLead && v.valLead, swapped && r.redLead && v.valLead]}>
                    {swapped ? r.red : r.blue}
                  </Text>
                  <Text style={v.label}>{r.label}</Text>
                  <Text style={[v.val, v.valRight, !swapped && r.redLead && v.valLead, swapped && r.blueLead && v.valLead]}>
                    {swapped ? r.blue : r.red}
                  </Text>
                </View>
                {/* 比例条：左右两个半槽，各带填充；swapped 时镜像 */}
                <View style={[v.barSplit, swapped && v.rowReverse]}>
                  <View style={[v.barSide, v.barSideHome, swapped && v.barSideAway]}>
                    <View style={[v.barFill, { width: `${swapped ? r.redPct : r.bluePct}%`, backgroundColor: swapped ? fillAway : fillHome }]} />
                  </View>
                  <View style={[v.barSide, v.barSideAway, swapped && v.barSideHome]}>
                    <View style={[v.barFill, { width: `${swapped ? r.bluePct : r.redPct}%`, backgroundColor: swapped ? fillHome : fillAway }]} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** rpx→dp 近似 2:1 后按横屏观感微调；颜色/字号/间距严格取原型 CSS。 */
const v = StyleSheet.create({
  maskOuter: {
    flex: 1, justifyContent: 'flex-end', alignItems: 'center',
    paddingBottom: 24,
  },
  sheet: {
    backgroundColor: 'rgba(0,0,0,.88)', borderWidth: 1, borderColor: 'hsla(0,0%,100%,.06)',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, elevation: 12,
    paddingTop: 12, paddingBottom: 16, paddingHorizontal: 20,
    maxHeight: '78%',
  },
  rowReverse: { flexDirection: 'row-reverse' },
  names: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  nameCol: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  name: { color: 'rgba(226,232,240,.82)', fontSize: 18, fontWeight: '600', lineHeight: 22, textAlign: 'center' },
  body: { flexDirection: 'column', paddingBottom: 8 },
  row: { marginBottom: 8 },
  nums: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  val: { flex: 1, color: 'rgba(248,250,252,.72)', fontSize: 20, fontWeight: '600', lineHeight: 23 },
  valRight: { textAlign: 'right' },
  valLead: { color: '#f8fafc', fontWeight: '800' },
  label: { flexShrink: 0, width: 152, color: 'rgba(226,232,240,.68)', fontSize: 16, lineHeight: 19, textAlign: 'center' },
  barSplit: { flexDirection: 'row', gap: 5, height: 4 },
  barSide: { flex: 1, height: '100%', backgroundColor: 'hsla(0,0%,100%,.12)', borderRadius: 999, overflow: 'hidden', flexDirection: 'row' },
  barSideHome: { justifyContent: 'flex-end' },
  barSideAway: { justifyContent: 'flex-start' },
  barFill: { height: '100%', borderRadius: 999 },
});
