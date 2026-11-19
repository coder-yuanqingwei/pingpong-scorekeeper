import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, useWindowDimensions,
} from 'react-native';
import { SCORE_FONT } from '../theme';

/**
 * 原型 pages/score「各局比分」按钮（工具栏第 4 个 onOpenSmallScoreDetail）打开的
 * score-small-detail-modal 深度复刻。证据来自 REA 静态分析：
 *  - WXML 编译体 page-frame.js @176563（模板）与 @325697（CSS）
 *  - app-service.js @474474 onOpenSmallScoreDetail、@424836 buildSmallScoreCellsPatch、
 *    @472623 buildSmallScoreRuleSummary、@222590 Rt（isLead 逐局高亮）、@475097 视图切换。
 *
 * 两种状态（与原版共用同一个弹层，靠 smallScoreEndMatchMode 切换）：
 *  - running 比赛进行中：标题 + 规则摘要；名字列(32%) + 可横向滚动的逐局比分(68%)，
 *    含进行中当前局；底部三按钮 手动结束比赛/重新开始/继续比赛。
 *  - end 比赛结束：标题「比赛结束」+ 日期；大局比分(56px + 皇冠)/各局比分两视图切换；
 *    底部三按钮 视图切换/再来一局/退出比赛。
 */
export interface ScoreCell { text: number; isLead: boolean }

export interface SmallScoreDetailProps {
  visible: boolean;
  onClose: () => void;                 // 继续比赛 / 关闭
  mode: 'running' | 'end';             // smallScoreEndMatchMode
  title: string;                       // 比赛标题（running 头部）
  ruleSummary: string;                 // smallScoreRuleSummary
  dateText?: string;                   // end 头部日期
  nameA: string;
  nameB: string;
  gamesA: number;                      // 大局数 homeGamesWon
  gamesB: number;                      // 大局数 awayGamesWon
  cellsA: ScoreCell[];                 // 逐局比分（含进行中当前局）
  cellsB: ScoreCell[];
  winner?: 'A' | 'B' | null;           // end 胜方
  showRematch?: boolean;               // end 是否显示「再来一局」
  showStatsLink?: boolean;             // end 是否显示「技术统计」
  onStats?: () => void;
  onManualEnd?: () => void;            // running「手动结束比赛」
  onRestart?: () => void;              // running「重新开始」
  onToggleEndView?: () => void;        // end 视图切换
  endScoreView?: 'games' | 'sets';     // end 当前视图
  onRematch?: () => void;              // end「再来一局」
  onExit?: () => void;                 // end「退出比赛」
}

/** 名字列(左 32%) + 逐局比分轨道(右 68%)。原型 score-small-bands。 */
function Bands({ nameA, nameB, gamesA, gamesB, cellsA, cellsB, winner, end }: {
  nameA: string; nameB: string; gamesA: number; gamesB: number;
  cellsA: ScoreCell[]; cellsB: ScoreCell[];
  winner?: 'A' | 'B' | null; end?: boolean;
}) {
  const homeWin = end && winner === 'A';
  const awayWin = end && winner === 'B';
  return (
    <View style={d.bands}>
      <View style={d.bandsBody}>
        {/* 名字列 flex 0 1 32% */}
        <View style={d.namesCol}>
          <View style={d.nameRow}>
            <Text style={d.name} numberOfLines={1}>{nameA}</Text>
          </View>
          <View style={d.nameRow}>
            <Text style={d.name} numberOfLines={1}>{nameB}</Text>
          </View>
        </View>
        {/* 比分轨道 flex 0 1 68%：左侧固定大局数 + 右侧横向滚动逐局格 */}
        <View style={d.scoresRail}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={d.scoresScroll}
            contentContainerStyle={d.scoresStack}>
            {/* 主队行 */}
            <View style={d.scoreRow}>
              <View style={[d.gwSticky, homeWin && d.totalWinner]}>
                <Text style={[d.total, homeWin && d.totalWinnerText]}>{gamesA}</Text>
              </View>
              <View style={d.ptsInner}>
                {cellsA.map((c, i) => (
                  <Text key={i} style={[d.game, i === 0 && d.gameFirstCol, end && c.isLead && d.gameWinner]}>
                    {c.text}
                  </Text>
                ))}
              </View>
            </View>
            {/* 客队行 */}
            <View style={d.scoreRow}>
              <View style={[d.gwSticky, awayWin && d.totalWinner]}>
                <Text style={[d.total, awayWin && d.totalWinnerText]}>{gamesB}</Text>
              </View>
              <View style={d.ptsInner}>
                {cellsB.map((c, i) => (
                  <Text key={i} style={[d.game, i === 0 && d.gameFirstCol, end && c.isLead && d.gameWinner]}>
                    {c.text}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

/** 大局比分视图（原型 score-end-sets）：两侧大比分 56px + 胜方皇冠。 */
function SetsView({ nameA, nameB, gamesA, gamesB, winner }: {
  nameA: string; nameB: string; gamesA: number; gamesB: number; winner?: 'A' | 'B' | null;
}) {
  const side = (name: string, score: number, win: boolean) => (
    <View style={d.setSide}>
      <View style={[d.setPill, win && d.setPillWinner]}>
        {win && <Text style={d.crown}>👑</Text>}
        <Text style={d.setName} numberOfLines={1}>{name}</Text>
      </View>
      <Text style={[d.setScore, win && d.setScoreWinner]}>{score}</Text>
    </View>
  );
  return (
    <View style={[d.sets, winner === 'B' && d.setsSwapped]}>
      {side(nameA, gamesA, winner === 'A')}
      <Text style={d.setDash}>-</Text>
      {side(nameB, gamesB, winner === 'B')}
    </View>
  );
}

export default function SmallScoreDetailPanel(props: SmallScoreDetailProps) {
  const { width: W, height: H } = useWindowDimensions();
  const end = props.mode === 'end';
  const view = props.endScoreView ?? 'games';
  const winner = props.winner ?? null;

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={d.mask}>
        <View style={[d.modal, { width: W * 0.8, height: H * 0.72 }]}>
          {end ? (
            /* ===== 比赛结束头部 ===== */
            <View style={d.endHead}>
              {props.showStatsLink && (
                <TouchableOpacity style={d.statsLink} onPress={props.onStats} activeOpacity={0.7}>
                  <Text style={d.statsLinkText}>技术统计</Text>
                </TouchableOpacity>
              )}
              <Text style={d.endTitle}>比赛结束</Text>
              {!!props.dateText && <Text style={d.endSub}>{props.dateText}</Text>}
            </View>
          ) : (
            /* ===== 进行中头部：标题 + 规则摘要 ===== */
            <View style={d.runningHead}>
              <Text style={d.runningTitle} numberOfLines={1}>{props.title}</Text>
              <Text style={d.runningRules} numberOfLines={1}>{props.ruleSummary}</Text>
            </View>
          )}

          {end && view === 'sets' ? (
            <SetsView nameA={props.nameA} nameB={props.nameB} gamesA={props.gamesA}
              gamesB={props.gamesB} winner={winner} />
          ) : (
            <View style={end ? d.sContainerEnd : d.sContainer}>
              <View style={d.bandsWrap}>
                <Bands nameA={props.nameA} nameB={props.nameB} gamesA={props.gamesA}
                  gamesB={props.gamesB} cellsA={props.cellsA} cellsB={props.cellsB}
                  winner={winner} end={end} />
              </View>
            </View>
          )}

          {/* ===== 底部三按钮 ===== */}
          <View style={d.footer}>
            {end ? (
              <>
                <TouchableOpacity style={[d.btn, d.btnToggle]} onPress={props.onToggleEndView} activeOpacity={0.7}>
                  <Text style={d.btnText}>{view === 'sets' ? '各局比分' : '大局比分'}</Text>
                </TouchableOpacity>
                {props.showRematch !== false && (
                  <TouchableOpacity style={[d.btn, d.btnRematch]} onPress={props.onRematch} activeOpacity={0.7}>
                    <Text style={d.btnText}>再来一局</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[d.btn, d.btnExit]} onPress={props.onExit} activeOpacity={0.7}>
                  <Text style={d.btnText}>退出比赛</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={[d.btn, d.btnExit]} onPress={props.onManualEnd} activeOpacity={0.7}>
                  <Text style={d.btnText}>手动结束比赛</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[d.btn, d.btnToggle]} onPress={props.onRestart} activeOpacity={0.7}>
                  <Text style={d.btnText}>重新开始</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[d.btn, d.btnRematch]} onPress={props.onClose} activeOpacity={0.7}>
                  <Text style={d.btnText}>继续比赛</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** 原型 CSS 值 rpx→dp 约 2:1，但原版大弹层在横屏下用固定 dp 观感更好，按视觉 1:1 取值。 */
const d = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', alignItems: 'center', justifyContent: 'center' },
  modal: {
    backgroundColor: '#2e2e2e', borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
  },
  // running head
  runningHead: { paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center', flexShrink: 0 },
  runningTitle: { color: 'rgba(248,250,252,.9)', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  runningRules: { color: 'rgba(226,232,240,.62)', fontSize: 10, fontWeight: '500', textAlign: 'center', marginTop: 3 },
  // end head
  endHead: { alignItems: 'center', justifyContent: 'center', paddingTop: 18, paddingBottom: 10, paddingHorizontal: 16, flexShrink: 0, position: 'relative' },
  endTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  endSub: { color: '#a1a1aa', fontSize: 13, fontWeight: '500', marginTop: 8, maxWidth: '100%' },
  statsLink: { position: 'absolute', right: 12, top: 14, zIndex: 1, paddingVertical: 4, paddingHorizontal: 8 },
  statsLinkText: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
  // bands
  sContainer: { flex: 1, paddingHorizontal: 12, paddingBottom: 8, justifyContent: 'center' },
  sContainerEnd: { flex: 1, paddingTop: 8, paddingBottom: 12, paddingHorizontal: 16, justifyContent: 'center' },
  bandsWrap: { flex: 1, minHeight: 0, justifyContent: 'center' },
  bands: { flex: 1, minHeight: 0, borderRadius: 8, overflow: 'hidden' },
  bandsBody: { flex: 1, flexDirection: 'row', alignItems: 'stretch', minHeight: 0 },
  namesCol: { width: '32%', maxWidth: '32%', minWidth: 0 },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 8, minHeight: 0 },
  name: { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 20 },
  scoresRail: { width: '68%', maxWidth: '68%', minWidth: 0, height: '100%' },
  scoresScroll: { width: '100%', height: '100%' },
  scoresStack: { alignItems: 'flex-end', minWidth: '100%' },
  scoreRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minWidth: '100%', minHeight: 0, paddingRight: 4 },
  gwSticky: { alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', paddingLeft: 2, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,.9)', marginRight: 2 },
  totalWinner: {}, // 视觉由文字色区分，边框保持一致
  total: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', fontFamily: SCORE_FONT },
  totalWinnerText: { color: '#fde047' },
  ptsInner: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', paddingRight: 2 },
  game: { color: '#fff', fontSize: 20, lineHeight: 24, minWidth: 40, textAlign: 'center', fontFamily: SCORE_FONT },
  gameFirstCol: {},
  gameWinner: { color: '#fde047' },
  // sets view
  sets: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 0, columnGap: 12 },
  setsSwapped: { flexDirection: 'row-reverse' },
  setSide: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, rowGap: 14 },
  setPill: { maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, position: 'relative' },
  setPillWinner: { paddingLeft: 18 },
  setName: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  crown: { position: 'absolute', left: -2, top: -10, fontSize: 16, transform: [{ rotate: '-22deg' }] },
  setScore: { color: '#fff', fontSize: 56, fontWeight: '700', lineHeight: 60, textAlign: 'center', fontFamily: SCORE_FONT },
  setScoreWinner: { color: '#fde047' },
  setDash: { color: '#71717a', fontSize: 32, fontWeight: '600', paddingTop: 28 },
  // footer
  footer: { flexDirection: 'row', flexShrink: 0, columnGap: 10, paddingTop: 12, paddingBottom: 16, paddingHorizontal: 14 },
  btn: { flex: 1, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minWidth: 0, paddingHorizontal: 6 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  btnToggle: { backgroundColor: '#3f3f46' },
  btnRematch: { backgroundColor: '#2563eb' },
  btnExit: { backgroundColor: '#b91c1c' },
});
