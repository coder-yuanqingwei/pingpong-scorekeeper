import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Modal,
  useWindowDimensions, BackHandler, ScrollView, Animated, Easing, PanResponder,
} from 'react-native';
import { useVoiceQueue, buildScoreQueue } from '../voice';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { MatchNavProp, MatchRouteProp, MatchConfig } from '../navigation.types';
import { SCORE_FONT } from '../theme';
import { appendMatch, upsertOngoingMatch, completeMatch } from '../storage';
import type { GameRecord, MatchSnapshot } from '../storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Svg, Path } from 'react-native-svg';
import { THEMES, shade, readThemeId, writeThemeId, resolveTheme } from '../scoreThemes';
import { ClickHandHint } from '../components/ClickHandHint';
import { BigscreenOverlay } from '../components/BigscreenOverlay';
import {
  VoiceIcon, VoiceCloseIcon, SwapServeIcon, SwapCourtIcon, GamesIcon, StatsIcon, QuitIcon,
} from '../components/ToolIcons';
import SmallScoreDetailPanel, { ScoreCell } from '../components/SmallScoreDetailPanel';
import LiveStatsSheet, { LiveStatRow } from '../components/LiveStatsSheet';
import { createEmpty, recordPoint, finalizeGame, type MatchStats } from '../matchStats';

type Side = 'A' | 'B';


/** 原型 score-font-slider：横向刻度滑块，RN 无原生 Slider，用 PanResponder 复刻。
 *  支持拖动与点击定位，onChanging 拖动中回调、onChange 松开回调（对应原版两个事件）。 */
function RangeSlider({ value, min, max, step = 1, onChanging, onChange }: {
  value: number; min: number; max: number; step?: number;
  onChanging?: (v: number) => void; onChange?: (v: number) => void;
}) {
  const widthRef = useRef(1);
  const valueRef = useRef(value);
  valueRef.current = value;
  const quantize = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step));
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const x = e.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(1, x / Math.max(1, widthRef.current)));
      onChanging?.(quantize(min + ratio * (max - min)));
    },
    onPanResponderMove: (e) => {
      const x = e.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(1, x / Math.max(1, widthRef.current)));
      onChanging?.(quantize(min + ratio * (max - min)));
    },
    onPanResponderRelease: (e) => {
      const x = e.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(1, x / Math.max(1, widthRef.current)));
      onChange?.(quantize(min + ratio * (max - min)));
    },
  })).current;
  const pct = (value - min) / (max - min);
  return (
    <View
      style={sliderStyles.track}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width || 1; }}
      {...pan.panHandlers}
    >
      <View style={sliderStyles.rail} />
      <View style={[sliderStyles.fill, { width: `${pct * 100}%` }]} />
      <View style={[sliderStyles.thumb, { left: `${pct * 100}%` }]} />
    </View>
  );
}
const sliderStyles = StyleSheet.create({
  track: { height: 30, justifyContent: 'center', position: 'relative' },
  rail: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: '#3a3a3c' },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: '#2c6cea' },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', marginLeft: -9, top: 6 },
});

const C_BLUE = THEMES[0].home;
const RED = THEMES[0].away;
const GREEN = '#09a34a';
const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

/** 原版 scoreFlip* 翻页规格：id 递增触发，old/new 为翻页前后分数，up=true 加分（从下往上翻） */
interface FlipSpec { id: number; old: number; up: boolean; duration?: number; instant?: boolean }

/** 原版 score-flip-viewport / score-flip-strip 的 RN 复刻：
 *  视口 overflow:hidden，双层数字条常驻（高度 200%），整条 translateY 在 0 与 -视口高之间滑动。
 *  关键：动画结束后把两格都同步成新数字、并停在终点不归位——不像初版那样切回静态数字，
 *  否则会出现"翻上去又掉回来"的跳变。CSS 实测 .52s cubic-bezier(.25,.65,.25,1) + 36ms 启动延迟。 */
function FlipScore({ value, fontSize, flip }: { value: number; fontSize: number; flip: FlipSpec | null }) {
  const viewportH = Math.ceil(fontSize * 1.12);
  const anim = useRef(new Animated.Value(0)).current;
  const [cells, setCells] = useState<{ top: number; bottom: number }>({ top: value, bottom: value });
  const lastId = useRef(flip?.id ?? 0);   // 重新挂载（换边）时不重播挂载前已存在的 flip
  const curRef = useRef(value);
  curRef.current = value;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!flip || flip.id === lastId.current) return;
    lastId.current = flip.id;
    const cur = curRef.current;          // 变化后的分数（新值）
    if (flip.old === cur) return;
    running.current?.stop();
    const up = flip.up;
    // instant：局末 11→0 复位无需动画，直接把两格切到新数字并停在起点
    if (flip.instant) {
      setCells({ top: cur, bottom: cur });
      anim.setValue(0);
      return;
    }
    // 加分沿用原版 36ms 延迟/520ms；归零复位（duration 指定）走更短的启动延迟与时长
    const dur = flip.duration ?? 520;
    const delay = flip.duration != null ? 0 : 36;
    const t = setTimeout(() => {
      // 加分：上格旧数、下格新数，整条上移；减分：上格新数、下格旧数，整条下移
      setCells(up ? { top: flip.old, bottom: cur } : { top: cur, bottom: flip.old });
      anim.setValue(up ? 0 : -viewportH);
      // 等一格内容渲染后再启动动画，避免起态错位闪一下
      requestAnimationFrame(() => {
        running.current = Animated.timing(anim, {
          toValue: up ? -viewportH : 0,
          duration: dur,
          easing: Easing.bezier(0.25, 0.65, 0.25, 1),
          useNativeDriver: true,
        });
        running.current.start(({ finished }) => {
          if (!finished) return;
          // 两格统一为新数字，停在终点：上翻停在下格、下翻停在上格，视觉完全连续
          setCells({ top: cur, bottom: cur });
        });
      });
    }, delay);
    return () => { clearTimeout(t); running.current?.stop(); };
  }, [flip?.id]);

  const digitStyle: any = {
    color: '#fff', fontFamily: SCORE_FONT, fontWeight: '900', fontSize,
    lineHeight: fontSize, includeFontPadding: false, textAlign: 'center',
  };
  return (
    <View style={{ height: viewportH, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: anim }] }}>
        <View style={{ height: viewportH, justifyContent: 'center' }}><Text style={digitStyle}>{cells.top}</Text></View>
        <View style={{ height: viewportH, justifyContent: 'center' }}><Text style={digitStyle}>{cells.bottom}</Text></View>
      </Animated.View>
    </View>
  );
}

/** 原版 score-callout-slot + score-team-court__callout 的 RN 复刻：
 *  计分区右下角白底气泡（左上+右下对角圆角），0.24s 淡入 + 从下方 6dp 上移。 */
function CalloutBubble({ text, visible, color, fontSize }: {
  text: Callout; visible: boolean; color: string; fontSize: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', right: 0, bottom: 2,
        opacity: anim, transform: [{ translateY }],
        backgroundColor: '#fff',
        borderTopLeftRadius: 8, borderBottomRightRadius: 8,
        paddingHorizontal: 10, paddingVertical: 3,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
      }}
    >
      <Text style={{ color, fontSize, fontWeight: '800', lineHeight: fontSize * 1.2 }}>{text}</Text>
    </Animated.View>
  );
}

/** 与计分算法一致：按发球间隔/局点规则推导当前发球方
 *  原版 pingpong_rules.js o()：deuce 或 expedite → 每分换发(total%2)，否则每 interval 分换发 */
function serverAt(
  scoreA: number, scoreB: number, start: Side, interval: number,
  target: number, winByTwo: boolean, expedite = false,
): Side {
  const total = scoreA + scoreB;
  const deuce = winByTwo && scoreA >= target - 1 && scoreB >= target - 1;
  if (deuce || expedite) {
    return total % 2 === 0 ? start : other(start);   // 局末/轮换发球法：每分换发
  }
  return Math.floor(total / Math.max(1, interval)) % 2 === 0 ? start : other(start);
}

/** 原版 pingpongGameStartServeHomeFromState：从"当前比分 + 期望当前发球方"反推本局首发基准。
 *  用于手动换发 / 开关轮换发球法时固定 gameStartServeHome。 */
function startServerFromServe(
  a: number, b: number, interval: number, target: number,
  winByTwo: boolean, currentServe: Side, expedite: boolean,
): Side {
  return serverAt(a, b, 'A', interval, target, winByTwo, expedite) === currentServe ? 'A' : 'B';
}

/** 原版 @467834：下一局首发 g = (homeGamesWon + awayGamesWon) % 2 == 0 ? home : away */
function nextGameStartServer(gamesA: number, gamesB: number): Side {
  return (gamesA + gamesB) % 2 === 0 ? 'A' : 'B';
}

type Callout = '' | '局点' | '赛点' | '胜';

/** 原版 rt/st（@214089）：本局是否已获胜。
 *  winByTwo: (a>=target && a-b>=2) || (a===cap && b===cap-1)；否则 a>=target && a>b。 */
function isGameWon(a: number, b: number, target: number, winByTwo: boolean, cap: number): boolean {
  if (winByTwo) {
    return (a === cap && b === cap - 1) || (a >= target && a - b >= 2 && a <= cap);
  }
  return a >= target && a > b && a <= cap;
}

/** 原版 ct()（@214255）：计算双方 callout（局点/赛点/胜）与已胜方。
 *  已达局分→"胜"；下一分即胜→"局点"，若该方局数+1已达标→"赛点"。 */
function computeCallouts(
  a: number, b: number, target: number, cap: number, winByTwo: boolean,
  gamesA: number, gamesB: number, winsRequired: number,
): { home: Callout; away: Callout; winner: Side | null } {
  if (isGameWon(a, b, target, winByTwo, cap)) return { home: '胜', away: '', winner: 'A' };
  if (isGameWon(b, a, target, winByTwo, cap)) return { home: '', away: '胜', winner: 'B' };
  if (a >= cap || b >= cap) return { home: '', away: '', winner: null };
  const homeNext = isGameWon(a + 1, b, target, winByTwo, cap);
  const awayNext = isGameWon(b + 1, a, target, winByTwo, cap);
  return {
    home: homeNext ? (gamesA + 1 >= winsRequired ? '赛点' : '局点') : '',
    away: awayNext ? (gamesB + 1 >= winsRequired ? '赛点' : '局点') : '',
    winner: null,
  };
}

interface Snapshot {
  scoreA: number; scoreB: number; gamesA: number; gamesB: number;
  gameHistory: GameRecord[]; startServer: Side; serve: Side;
  courtSwapped: boolean; expediteActive: boolean;
  stats?: MatchStats;
}

function fmtTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 赛制（局数）中文标签：gamesToWin 1/2/3 → 一局一胜/三局两胜/五局三胜；9999 → 自由（原型 FREE_WINS_REQUIRED） */
function formatLabel(gamesToWin: number): string {
  if (gamesToWin >= 9999) return '自由';
  const map: Record<number, string> = { 1: '一局一胜', 2: '三局两胜', 3: '五局三胜' };
  return map[gamesToWin] ?? `${2 * gamesToWin - 1}局${gamesToWin}胜`;
}

/** 原型 buildSmallScoreRuleSummary 乒乓分支的规则摘要（用于「各局比分」弹层头部）。
 *  {gamesCount}局{winsRequired}胜 · {scorePerGame}分 · 净胜2分/无加分。复刻无决胜局/封顶配置，故省略该段。 */
function buildRuleSummary(cfg: MatchConfig): string {
  const parts = [
    cfg.free
      ? '自由（封顶100局）'
      : `${Math.max(1, 2 * cfg.gamesToWin - 1)}局${Math.max(1, cfg.gamesToWin)}胜`,
    `${Math.max(1, cfg.pointsToWin)}分`,
    cfg.winByTwo ? '净胜2分' : '无加分',
  ];
  return parts.join(' · ');
}

/** 原型 utils/matchStatsDetail.buildStatsRows + buildStatsWithBars：5 项球拍指标 + 左右比例条。
 *  比例：bluePct=round(b/(b+r)*100)，redPct=100-bluePct（总为 0 时两者皆 0），领先项加粗。 */
function buildLiveStatRows(stats: MatchStats): LiveStatRow[] {
  const defs: Array<[string, keyof import('../matchStats').SideStats]> = [
    ['总得分', 'totalPoints'],
    ['最高连续得分', 'maxConsecutive'],
    ['逆转取胜局', 'comebackGamesWon'],
    ['发球得分', 'servePointsWon'],
    ['接发得分', 'receivePointsWon'],
  ];
  return defs.map(([label, key]) => {
    const b = Math.max(0, Math.floor(Number(stats.home[key])) || 0);
    const r = Math.max(0, Math.floor(Number(stats.away[key])) || 0);
    const sum = b + r;
    const bluePct = sum > 0 ? Math.round((b / sum) * 100) : 0;
    return {
      label, blue: String(b), red: String(r),
      bluePct, redPct: sum > 0 ? 100 - bluePct : 0,
      blueLead: b > r, redLead: r > b,
    };
  });
}

/** 原版 Ht()：秒表显示 mm:ss.d（精确到 0.1 秒） */
function fmtStopwatch(ms: number) {
  const tenths = Math.floor(ms / 100) % 10;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

/** 大屏模式首次引导文案样式 */
const tvGuideText = { color: '#d1d5db', fontSize: 14, lineHeight: 24, marginTop: 10 };
const tvGuideTip = { color: '#f5c451', fontSize: 12, lineHeight: 18, marginTop: 12 };

export default function MatchScreen() {
  const navigation = useNavigation<MatchNavProp>();
  const route = useRoute<MatchRouteProp>();
  const initial = route.params.config;
  // 从历史记录「继续比赛」恢复：快照优先于初始配置
  const resume: MatchSnapshot | undefined = route.params.resume;
  const restoredCfg: MatchConfig = resume ? { ...resume.config } : initial;
  const { width: W, height: H } = useWindowDimensions();
  const compact = W < 720;

  const [title, setTitle] = useState(restoredCfg.title || '训练赛');
  const [cfg, setCfg] = useState<MatchConfig>(restoredCfg);
  const [scoreA, setScoreA] = useState(resume?.scoreA ?? 0);
  const [scoreB, setScoreB] = useState(resume?.scoreB ?? 0);
  const [gamesA, setGamesA] = useState(resume?.gamesA ?? 0);
  const [gamesB, setGamesB] = useState(resume?.gamesB ?? 0);
  const [gameHistory, setGameHistory] = useState<GameRecord[]>(resume?.gameHistory ?? []);
  const [startServer, setStartServer] = useState<Side>(resume?.startServer ?? 'A');
  const [serve, setServe] = useState<Side>(resume?.serve ?? 'A');
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<{ winner: Side; games: GameRecord[] } | null>(null);

  // ===== 原版两段式局分结算（callout + gameWinAwaitingConfirm）=====
  const [calloutA, setCalloutA] = useState<Callout>('');   // 左队卡 callout
  const [calloutB, setCalloutB] = useState<Callout>('');   // 右队卡 callout
  const [calloutVisibleA, setCalloutVisibleA] = useState(false);
  const [calloutVisibleB, setCalloutVisibleB] = useState(false);
  const calloutHideRefA = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calloutHideRefB = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 到局分后：分数停住、显示"胜"，等待再按一次赢家 + 才结算
  const [gameWinAwaitingConfirm, setGameWinAwaitingConfirm] = useState(false);
  const [gameWinWinner, setGameWinWinner] = useState<Side | null>(null);
  const gameSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 原版 scoreFlipOld/New/Up/Run：分数变化时触发翻页动画
  const [flipA, setFlipA] = useState<FlipSpec | null>(null);
  const [flipB, setFlipB] = useState<FlipSpec | null>(null);
  const flipSeq = useRef(0);
  const triggerFlip = (side: Side, old: number, up: boolean, duration?: number, instant?: boolean) => {
    const spec: FlipSpec = { id: ++flipSeq.current, old, up, duration, instant };
    if (side === 'A') setFlipA(spec); else setFlipB(spec);
  };

  // ===== 原版真实"队伍暂停"机制（来自 pages/score 分包 onTeamTimeoutTap/startTeamTimeoutPause）=====
  // 每队本场仅 1 次、每次 60 秒；暂停时锁定计分并显示全屏倒计时遮罩
  const [homeTimeoutsLeft, setHomeTimeoutsLeft] = useState(1);
  const [awayTimeoutsLeft, setAwayTimeoutsLeft] = useState(1);
  const [pauseActive, setPauseActive] = useState(false);
  const [pauseMode, setPauseMode] = useState<'team' | 'interGame'>('team');
  const [pauseSide, setPauseSide] = useState<Side>('A');
  const [pauseSeconds, setPauseSeconds] = useState(60);
  const pauseEndsRef = useRef(0);
  const pauseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ===== 原版真实秒表（onStopwatchToggle / pauseStopwatch，100ms 刷新，独立暂停）=====
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [stopwatchDisplay, setStopwatchDisplay] = useState('00:00.0');
  const stopwatchElapsedRef = useRef(0); // 累计毫秒
  const stopwatchAnchorRef = useRef(0);  // 本段起点
  const stopwatchStartRef = useRef(0);
  const stopwatchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 原版计分大屏的真实工具/配置状态（来自 score_ui_theme / scoreDisplayPrefs）
  const [voiceOn, setVoiceOn] = useState(true);           // 语音播报（voiceOpen）
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false); // 工具栏折叠
  const [themeId, setThemeId] = useState('classic');      // 主题配色
  const [largeScreen, setLargeScreen] = useState(false);   // 大屏模式（largeScreenMode）
  const [autoCourtSwap, setAutoCourtSwap] = useState(initial.autoCourtSwap ?? true);
  const [interGameRest, setInterGameRest] = useState(initial.interGameRest ?? false);
  const [coinSide, setCoinSide] = useState<Side | null>(null);
  const [sheet, setSheet] = useState<'setting' | 'record' | 'stats' | 'theme' | null>(null);

  // ===== 工具栏第4按钮「各局比分」→ 原型 onOpenSmallScoreDetail 的小比分详情弹层 =====
  const [smallDetailOpen, setSmallDetailOpen] = useState(false);
  const [endScoreView, setEndScoreView] = useState<'games' | 'sets'>('games');
  // 工具栏第5按钮「技术统计」：原型 onOpenLiveStatsSheet 的底部统计弹层
  const [statsOpen, setStatsOpen] = useState(false);
  const statsRef = useRef<MatchStats>(resume?.stats ? JSON.parse(JSON.stringify(resume.stats)) : createEmpty());
  const [statsTick, setStatsTick] = useState(0);   // 统计变更后触发弹层数值刷新
  // 手动结束比赛的结果（原型 finalizeManualEndMatch：把当前局算作最后一局、大局分判定胜方）
  const [manualEnd, setManualEnd] = useState<{ winner: Side; games: GameRecord[]; date: string } | null>(null);
  // 弹层 mode：比赛已结束(result 或手动结束) → end，否则 running
  const detailMode: 'running' | 'end' = result || manualEnd ? 'end' : 'running';

  // ===== 大屏模式（电视投屏）：横屏沉浸界面，配合手机系统「投屏/屏幕镜像」镜像到电视 =====
  // 配对由系统投屏菜单自动发现局域网电视完成，电视端零输入；App 只提供适合电视显示的画面。
  const [tvMode, setTvMode] = useState(false);
  const [tvGuideOpen, setTvGuideOpen] = useState(false);
  // 每次进入大屏模式都显示引导（方便随时查看投屏步骤；点「知道了」即进入操作）
  const enterTvMode = () => {
    setSheet(null);            // 关闭设置面板，避免它盖住大屏模式的引导/界面
    setTvMode(true);
    setTvGuideOpen(true);
  };
  const dismissTvGuide = () => setTvGuideOpen(false);

  // ===== 原型 ≡ 设置面板 score-center-settings-panel 的全部配置项（默认值取自原版 data）=====
  const [pointInputMode, setPointInputMode] = useState<'gesture' | 'buttons'>('buttons'); // 操作方式：滑动计分/加减按钮
  const [voiceLanguage, setVoiceLanguage] = useState<'zh' | 'en'>('zh');                 // 播报语言 zh/en
  const [whistleShortcutOpen, setWhistleShortcutOpen] = useState(false);                 // 快捷操作-口哨
  const [buzzerShortcutOpen, setBuzzerShortcutOpen] = useState(false);                   // 快捷操作-蜂鸣器
  const [playerNameFontRpx, setPlayerNameFontRpx] = useState(22);                        // 姓名字号 14~34
  const [gameScoreFontScalePct, setGameScoreFontScalePct] = useState(100);               // 局比分字号 70~130
  const [rallyScoreFontScalePct, setRallyScoreFontScalePct] = useState(100);             // 局内小比分字号 70~130
  // 更多设置复选框组（原版 data 默认值）
  const [notchScreenOpen, setNotchScreenOpen] = useState(false);       // 刘海屏
  const [stopwatchFeatureOpen, setStopwatchFeatureOpen] = useState(false); // 秒表功能
  const [coinWidgetOpen, setCoinWidgetOpen] = useState(false);         // 开局硬币
  const [misconductOpen, setMisconductOpen] = useState(false);         // 判罚（乒乓模式原版不可用）
  const [showMisconductSetting, setShowMisconductSetting] = useState(false); // 是否显示判罚设置项（乒乓模式默认隐藏，可在配置中开启）
  // 规则帮助弹层
  const [ruleHelp, setRuleHelp] = useState<'expedite' | 'return13' | null>(null);

  // ===== 乒乓特有真实规则（来自 pages/score/lib/pingpong_rules.js）=====
  const [courtSwapped, setCourtSwapped] = useState(false);        // courtSidesSwapped 换边
  // 原版 beginCourtSwapSlide：确认局分后先滑动换边（620ms cubic-bezier(.22,.76,.24,1)），
  // 680ms 后才 applyBadmintonInterGameZeroFlip 把比分翻页归零。swapAnim 0→1 表示滑动进度。
  const swapAnim = useRef(new Animated.Value(0)).current;
  const cardPosRef = useRef({ left: 0, right: 0 });               // 两卡在 cardsRow 中的 x，用于算对调位移
  const settlingRef = useRef(false);                              // 结算动画进行中守卫，防重复触发
  const [expediteActive, setExpediteActive] = useState(false);    // 轮换发球法（一经启用持续全场）
  const [returnCount, setReturnCount] = useState(0);              // 数13拍（0-13，到13只提醒不加分）
  const deciderFiveDoneRef = useRef(false);                       // 决胜局5分换边防重复

  /** 原版 wx.showModal 的白色确认框（点 T 请求暂停 / 提前结束暂停） */
  const [confirmModal, setConfirmModal] = useState<{
    title: string; content: string; onConfirm: () => void; confirmText?: string; cancelText?: string;
  } | null>(null);

  const theme = resolveTheme(themeId, THEMES);
  // 真人录音语音播报（只有比分；其余场景静音）
  const voice = useVoiceQueue();
  const playScoreVoice = useCallback((a: number, b: number, serveSide: Side) => {
    if (!voiceOn) return;
    const q = buildScoreQueue(a, b, serveSide === 'A', voiceLanguage);
    if (q.length) voice.speakQueue(q);
  }, [voice, voiceOn, voiceLanguage]);

  // 原型 onLoad：从 ymq_score2_ui_v1 读取持久化主题（含自定义主题）
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('ymq_score2_ui_v1');
        const store = {
          getItem: (k: string) => raw,
          setItem: (k: string, v: string) => { AsyncStorage.setItem(k, v); },
        };
        const savedId = readThemeId(store);
        // 自定义主题也纳入解析范围
        const customRaw = await AsyncStorage.getItem('ymq_custom_themes_v1');
        const custom: typeof THEMES = customRaw ? JSON.parse(customRaw) : [];
        const all = [...THEMES, ...custom];
        if (mounted && all.some((t) => t.id === savedId)) setThemeId(savedId);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, []);

  /** 原型 onSelectScoreTheme：更新主题 + 持久化到 ymq_score2_ui_v1.themeId */
  const selectTheme = (id: string) => {
    setThemeId(id);
    try {
      AsyncStorage.getItem('ymq_score2_ui_v1').then((raw) => {
        let obj: Record<string, unknown> = {};
        try { if (raw) obj = JSON.parse(raw); } catch { /* ignore */ }
        AsyncStorage.setItem('ymq_score2_ui_v1', JSON.stringify({ ...obj, themeId: id }));
      });
    } catch { /* ignore */ }
  };

  // 比赛用时（秒）：仅在比赛进行中且非暂停、未结束时走时
  useEffect(() => {
    if (pauseActive || result) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [pauseActive, result]);

  // 卸载时清理所有 interval（对应原版 clearStopwatchTimer / stopTeamTimeoutInterval）
  useEffect(() => () => {
    voice.stop();
    if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
    if (stopwatchTimerRef.current) clearInterval(stopwatchTimerRef.current);
    if (calloutHideRefA.current) clearTimeout(calloutHideRefA.current);
    if (calloutHideRefB.current) clearTimeout(calloutHideRefB.current);
    if (gameSettleRef.current) clearTimeout(gameSettleRef.current);
  }, []);

  /** 原版 mergeCalloutTransitionPatch：新 callout 非空→立即显示；空→保留旧值 240ms 后淡出。
   *  "胜"因 gameWinAwaitingConfirm 期间持续重算为非空，故会一直显示直到结算。 */
  const applyCalloutPatch = useCallback((home: Callout, away: Callout) => {
    // home
    if (!home) {
      if (calloutHideRefA.current) clearTimeout(calloutHideRefA.current);
      setCalloutVisibleA(false);
      calloutHideRefA.current = setTimeout(() => {
        setCalloutA(''); calloutHideRefA.current = null;
      }, 240);
    } else {
      if (calloutHideRefA.current) { clearTimeout(calloutHideRefA.current); calloutHideRefA.current = null; }
      setCalloutA(home); setCalloutVisibleA(true);
    }
    // away
    if (!away) {
      if (calloutHideRefB.current) clearTimeout(calloutHideRefB.current);
      setCalloutVisibleB(false);
      calloutHideRefB.current = setTimeout(() => {
        setCalloutB(''); calloutHideRefB.current = null;
      }, 240);
    } else {
      if (calloutHideRefB.current) { clearTimeout(calloutHideRefB.current); calloutHideRefB.current = null; }
      setCalloutB(away); setCalloutVisibleB(true);
    }
  }, []);

  // 其余场景（暂停/发球/换边/轮换法/13拍/局末"胜"等）按用户选择全部静音，不播报
  const speak = useCallback((_text: string) => {}, []);

  /** 原版 buildNumericScoreVoiceQueue：真人录音播报「发球方分 比/平 接发方分」，相等读"平"。
   *  suffix（如"胜""拿下本局"）按原型无对应语音，忽略。 */
  const speakScore = useCallback((
    a: number, b: number, serveSide: Side, _suffix?: string,
  ) => {
    playScoreVoice(a, b, serveSide);
  }, [playScoreVoice]);

  const goBack = useCallback(() => {
    voice.stop();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Tabs');
  }, [navigation]);

  /** 原型 onExitTap：比赛进行中点退出需二次确认（wx.showModal：提示 / 确定退出比赛吗？可在比赛记录中继续） */
  const onExitTap = useCallback(() => {
    setConfirmModal({
      title: '提示',
      content: '确定退出比赛吗？可在比赛记录中继续',
      confirmText: '退出',
      cancelText: '取消',
      onConfirm: () => {
        // 兑现弹窗承诺：退出即存档当前进度，历史页可「继续比赛」恢复现场
        const snap: MatchSnapshot = {
          scoreA, scoreB, gamesA, gamesB, gameHistory, startServer, serve,
          stats: statsRef.current,
          config: { ...cfg, title, dateLabel: cfg.dateLabel },
        };
        upsertOngoingMatch(snap).catch(() => {});
        goBack();
      },
    });
  }, [goBack, scoreA, scoreB, gamesA, gamesB, gameHistory, startServer, serve, cfg, title]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tvMode) { setTvMode(false); return true; }   // 大屏模式下先退出大屏再返回
      onExitTap();
      return true;
    });
    return () => sub.remove();
  }, [onExitTap, tvMode]);

  useEffect(() => () => { voice.stop(); }, []);

  const snapshot = (): Snapshot => ({
    scoreA, scoreB, gamesA, gamesB, gameHistory, startServer, serve,
    courtSwapped, expediteActive, stats: statsRef.current,
  });

  const finishMatch = (list: GameRecord[], winnerSide: Side) => {
    // 整场打完：清除对应的进行中存档，写入最终结果（避免历史里同时留 ongoing + finished）
    completeMatch({
      id: `M${Date.now()}`,
      date: new Date().toISOString(),
      nameA: cfg.nameA, nameB: cfg.nameB,
      gamesA: list.filter((g) => g.winner === 'A').length,
      gamesB: list.filter((g) => g.winner === 'B').length,
      games: list, winner: winnerSide,
      config: { pointsToWin: cfg.pointsToWin, gamesToWin: cfg.gamesToWin },
    }, `ongoing_${title}_${cfg.nameA}_${cfg.nameB}`.replace(/\s+/g, ''));
    setResult({ winner: winnerSide, games: list });
    speak(`${winnerSide === 'A' ? cfg.nameA : cfg.nameB} 获胜`);
  };

  /** 原版 finalizeEndOfGame：局数+1、比分归零、下局首发、每局换边、决胜局 toast、局间休息/整场结束。
   *  由两段式确认的"再按一次赢家 +"触发。此时 scoreA/scoreB 停在本局终局分（未归零）。 */
  const finalizeEndOfGame = (w: Side) => {
    if (gameSettleRef.current) { clearTimeout(gameSettleRef.current); gameSettleRef.current = null; }
    if (settlingRef.current) return;   // 结算动画期间忽略重复确认
    const target = cfg.pointsToWin;
    const cap = target + 9;
    const endA = scoreA, endB = scoreB;
    const game: GameRecord = { a: endA, b: endB, winner: w, index: gameHistory.length + 1 };
    const list = [...gameHistory, game];
    const gA = gamesA + (w === 'A' ? 1 : 0);
    const gB = gamesB + (w === 'B' ? 1 : 0);
    const finalServe = serverAt(endA, endB, startServer, cfg.serveInterval, target, cfg.winByTwo, expediteActive);
    const nextStart = nextGameStartServer(gA, gB);
    const matchOverNow = gA >= cfg.gamesToWin || gB >= cfg.gamesToWin;

    // 原型 finalizeGame：本局结束结算「逆转取胜局」（落后≥3仍翻盘），并清零本局分差
    statsRef.current = finalizeGame(statsRef.current, w === 'A');
    setStatsTick((n) => n + 1);

    // 局数/局史/下局首发立即生效；比分要等换边滑动到位后才归零（原版顺序）
    setGameHistory(list);
    setGamesA(gA); setGamesB(gB);
    setStartServer(nextStart); setServe(nextStart);
    setReturnCount(0);
    // 原型 FREE_GAMES_CAP=100：自由赛制打满 100 局整场结束
    const matchOverNowFree = !!cfg.free && list.length >= 100;
    const matchOver = matchOverNow || matchOverNowFree;

    // 原版 applyBadmintonInterGameZeroFlip：比分从终局分翻页向下归零
    const zeroFlip = () => {
      // 局末归零复位：直接切数字、不走翻页动画（正常加分/减分动画都保留）
      if (endA !== 0) triggerFlip('A', endA, false, undefined, true);
      if (endB !== 0) triggerFlip('B', endB, false, undefined, true);
      setScoreA(0); setScoreB(0);
      const nextCallout = computeCallouts(0, 0, target, cap, cfg.winByTwo, gA, gB, cfg.gamesToWin);
      applyCalloutPatch(nextCallout.home, nextCallout.away);
      speakScore(endA, endB, finalServe, `${w === 'A' ? cfg.nameA : cfg.nameB} 拿下本局`);
      settlingRef.current = false;
      if (matchOver) {
        finishMatch(list, gA > gB ? 'A' : 'B');
      } else {
        const isDecider = gA === cfg.gamesToWin - 1 && gB === cfg.gamesToWin - 1;
        if (isDecider) deciderFiveDoneRef.current = false;
        if (interGameRest) startInterGameRest();
      }
    };

    // finalizeEndOfGame 尾部：若自动换边开 → beginCourtSwapSlide → 归零翻页
    // 原版滑动 620ms + 60ms 缓冲；按用户手感整体加快 500ms → 滑动缩到 120ms（仍保留可见换边）
    if (!matchOver && autoCourtSwap && !largeScreen && cardPosRef.current.right !== cardPosRef.current.left) {
      settlingRef.current = true;
      // 先解除等待确认态（视觉上「胜」气泡消失、进入滑动），但锁住分数输入直到归零完成
      setGameWinAwaitingConfirm(false); setGameWinWinner(null);
      swapAnim.setValue(0);
      Animated.timing(swapAnim, {
        toValue: 1, duration: 120,
        easing: Easing.bezier(0.22, 0.76, 0.24, 1),
        useNativeDriver: true,
      }).start(() => {
        // 滑动到位：交换 DOM 里的左右顺序 + 把 translateX 归零（卡片已在对方位置）
        setCourtSwapped((v) => !v);
        swapAnim.setValue(0);
        // 缓冲同步压缩：20ms 后归零翻页（原 60ms）
        gameSettleRef.current = setTimeout(() => { gameSettleRef.current = null; zeroFlip(); }, 20);
      });
    } else {
      setGameWinAwaitingConfirm(false); setGameWinWinner(null);
      if (!matchOver && autoCourtSwap) setCourtSwapped((v) => !v);
      zeroFlip();
    }
  };

  const addPoint = (side: Side) => {
    if (result || settlingRef.current) return;   // 换边滑动结算期间锁分
    if (pauseActive) {
      Alert.alert('暂停中', '点击「结束暂停」后继续比赛');
      return;
    }
    const target = cfg.pointsToWin;
    const cap = target + 9;

    // ===== 两段式确认：到局分后等待再按一次赢家 + 才结算 =====
    // 原版 recomputeButtonWinHintsIntoPatch：buttonWinHintHome/Away = calloutVisible && callout==='胜'。
    // 赢家 + 按钮上覆盖 click_hand.svg，球员回去休息时比分停在终局分；回来后点手势才开始下一局。
    if (gameWinAwaitingConfirm && gameWinWinner) {
      if (side === gameWinWinner) {
        // 原版 applyPointDelta：e===o && t===1 → finalizeEndOfGame
        finalizeEndOfGame(gameWinWinner);
      }
      // 其余按键（对方加分 / 减分）全部忽略——原版 `if(t>0) return`
      return;
    }

    setUndoStack((st) => [...st, snapshot()]);
    const nextA = scoreA + (side === 'A' ? 1 : 0);
    const nextB = scoreB + (side === 'B' ? 1 : 0);
    // 原型 recordRacketMatchStatPoint：逐分记统计（发球方=serve、得分方=side）
    statsRef.current = recordPoint(statsRef.current, {
      scoredPoint: true, servingHome: serve === 'A', winnerHome: side === 'A',
      homePoints: nextA, awayPoints: nextB,
    });
    setStatsTick((n) => n + 1);
    const c = computeCallouts(nextA, nextB, target, cap, cfg.winByTwo, gamesA, gamesB, cfg.gamesToWin);

    if (c.winner) {
      // 到局分：分数加到终局分后"停住"，只弹「胜」callout 并进入等待确认，不立即归零
      triggerFlip(side, side === 'A' ? scoreA : scoreB, true);
      setScoreA(nextA); setScoreB(nextB);
      const finalServe = serverAt(nextA, nextB, startServer, cfg.serveInterval, target, cfg.winByTwo, expediteActive);
      setServe(finalServe);
      applyCalloutPatch(c.home, c.away);
      setGameWinAwaitingConfirm(true); setGameWinWinner(c.winner);
      speakScore(nextA, nextB, finalServe, '胜');
    } else {
      // 原版 +1：triggerScoreFlip(old→new, up=true)，数字从下往上翻
      triggerFlip(side, side === 'A' ? scoreA : scoreB, true);
      setScoreA(nextA); setScoreB(nextB);
      const nextServe = serverAt(nextA, nextB, startServer, cfg.serveInterval, target, cfg.winByTwo, expediteActive);
      setServe(nextServe);
      applyCalloutPatch(c.home, c.away); // 局点/赛点提示
      // 决胜局一方到 5 分自动换边（原版 pingpongDeciderFiveSwapDone）
      const isDecider = gamesA === cfg.gamesToWin - 1 && gamesB === cfg.gamesToWin - 1;
      if (isDecider && !deciderFiveDoneRef.current &&
          cfg.pointsToWin === 11 && (nextA === 5 || nextB === 5) && autoCourtSwap) {
        deciderFiveDoneRef.current = true;
        setCourtSwapped((v) => !v);
      }
      speakScore(nextA, nextB, nextServe);
    }
  };

  // 原型 applyPointDelta(side, -1)：点哪方就减哪方自己的分，clampRallyPoints 下限 0
  // （自己 0 分时点 − 无任何效果，绝不减对方）；发球/回合态用"上一次加分前"快照回退，
  // 对应原版 pingpongServeUndoStack.pop。局数/换边不因减分而回退。
  const undo = (side: Side) => {
    // 到局分等待确认（手势出现）时比分锁定：只能再点赢家 +（或手势）确认进入下一局
    if (gameWinAwaitingConfirm) return;
    if (settlingRef.current) return;   // 换边滑动结算期间锁撤销
    if (pauseActive) { Alert.alert('暂停中', '结束暂停后才能撤销'); return; }
    const cur = side === 'A' ? scoreA : scoreB;
    if (cur <= 0) return;   // 下限 0：自己没分时 − 无效

    const next = cur - 1;
    const a = side === 'A' ? next : scoreA;
    const b = side === 'B' ? next : scoreB;
    triggerFlip(side, cur, false);   // 只有自己方分数回落，向下翻
    if (side === 'A') setScoreA(next); else setScoreB(next);

    // 发球态回退到上一次加分前（原版 pop pingpongServeUndoStack）
    const s = undoStack[undoStack.length - 1] as Snapshot | undefined;
    if (s) {
      setUndoStack((st) => st.slice(0, -1));
      setStartServer(s.startServer); setServe(s.serve);
      setExpediteActive(s.expediteActive);
      setReturnCount(0);
      if (s.stats) { statsRef.current = s.stats; setStatsTick((n) => n + 1); }
    }
    setResult(null);
    const cap = cfg.pointsToWin + 9;
    const c = computeCallouts(a, b, cfg.pointsToWin, cap, cfg.winByTwo, gamesA, gamesB, cfg.gamesToWin);
    applyCalloutPatch(c.home, c.away);
  };

  // ===== 原版真实暂停实现 =====
  /** stopTeamTimeoutInterval */
  const stopPauseInterval = useCallback(() => {
    if (pauseTimerRef.current) { clearInterval(pauseTimerRef.current); pauseTimerRef.current = null; }
  }, []);

  /** endTeamTimeoutPauseInternal：清定时器、归零、解除暂停锁定 */
  const endPauseInternal = useCallback(() => {
    stopPauseInterval();
    pauseEndsRef.current = 0;
    setPauseActive(false);
    setPauseSeconds(60);
    setPauseMode('team');
  }, [stopPauseInterval]);

  /** startTeamTimeoutInterval：每秒刷新 ceil 剩余秒数，到点自动结束 */
  const startPauseInterval = useCallback(() => {
    stopPauseInterval();
    if (pauseEndsRef.current <= Date.now()) pauseEndsRef.current = Date.now() + 60_000;
    pauseTimerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((pauseEndsRef.current - Date.now()) / 1000));
      if (left <= 0) endPauseInternal();
      else setPauseSeconds(left);
    }, 1000);
  }, [stopPauseInterval, endPauseInternal]);

  /** startTeamTimeoutPause(isHome)：请求暂停，消耗该队唯一一次机会，60 秒倒计时 */
  const startTeamPause = useCallback((side: Side) => {
    pauseEndsRef.current = Date.now() + 60_000;
    if (side === 'A') setHomeTimeoutsLeft(0); else setAwayTimeoutsLeft(0);
    setPauseSide(side);
    setPauseMode('team');
    setPauseSeconds(60);
    setPauseActive(true);
    startPauseInterval();
    speak(`${side === 'A' ? cfg.nameA : cfg.nameB} 请求暂停`);
  }, [startPauseInterval, speak, cfg.nameA, cfg.nameB]);

  /** onTeamTimeoutTap：每队仅 1 次、确认后暂停 60 秒 */
  const onTeamTimeoutTap = (side: Side) => {
    if (result || pauseActive || gameWinAwaitingConfirm) return;
    const left = side === 'A' ? homeTimeoutsLeft : awayTimeoutsLeft;
    if (Number(left) < 1) {
      Alert.alert('提示', '本队已使用过暂停');
      return;
    }
    setConfirmModal({
      title: '是否请求暂停？',
      content: '每队本场仅可使用一次，暂停 60 秒',
      onConfirm: () => startTeamPause(side),
    });
  };

  /** startInterGameRest / tryStartInterGameRest：局间休息，同为 60 秒但 mode=interGame */
  const startInterGameRest = useCallback(() => {
    pauseEndsRef.current = Date.now() + 60_000;
    setPauseMode('interGame');
    setPauseSeconds(60);
    setPauseActive(true);
    startPauseInterval();
    speak('局间休息 60 秒');
  }, [startPauseInterval, speak]);

  /** onTeamTimeoutRequestEnd：提前结束暂停/休息需二次确认 */
  const onPauseRequestEnd = () => {
    if (!pauseActive) return;
    const inter = pauseMode === 'interGame';
    setConfirmModal({
      title: inter ? '提前结束休息？' : '提前结束暂停？',
      content: inter ? '确定提前结束本次局间休息并继续比赛？' : '确定提前结束本次暂停并继续比赛？',
      onConfirm: endPauseInternal,
    });
  };

  // ===== 原版真实秒表 onStopwatchToggle / pauseStopwatch / onStopwatchReset =====
  const pauseStopwatch = useCallback(() => {
    if (stopwatchTimerRef.current) { clearInterval(stopwatchTimerRef.current); stopwatchTimerRef.current = null; }
    let t = Math.max(0, Math.floor(stopwatchElapsedRef.current));
    if (stopwatchStartRef.current > 0) {
      t = Math.max(0, Math.floor(stopwatchAnchorRef.current)) + (Date.now() - stopwatchStartRef.current);
    }
    stopwatchElapsedRef.current = t;
    stopwatchAnchorRef.current = 0;
    stopwatchStartRef.current = 0;
    setStopwatchRunning(false);
    setStopwatchDisplay(fmtStopwatch(t));
  }, []);

  const onStopwatchToggle = useCallback(() => {
    if (stopwatchRunning) {
      pauseStopwatch();
    } else {
      stopwatchAnchorRef.current = Math.max(0, Math.floor(stopwatchElapsedRef.current));
      stopwatchStartRef.current = Date.now();
      if (stopwatchTimerRef.current) clearInterval(stopwatchTimerRef.current);
      stopwatchTimerRef.current = setInterval(() => {
        const t = stopwatchAnchorRef.current + (Date.now() - stopwatchStartRef.current);
        setStopwatchDisplay(fmtStopwatch(t));
      }, 100);
      setStopwatchRunning(true);
    }
  }, [stopwatchRunning, pauseStopwatch]);

  const onStopwatchReset = useCallback(() => {
    if (stopwatchTimerRef.current) { clearInterval(stopwatchTimerRef.current); stopwatchTimerRef.current = null; }
    stopwatchElapsedRef.current = 0;
    stopwatchAnchorRef.current = 0;
    stopwatchStartRef.current = 0;
    setStopwatchRunning(false);
    setStopwatchDisplay('00:00.0');
  }, []);

  /** 完整重置：比分 + 暂停次数 + 计时器（原版 reset + onStopwatchReset + stopTeamTimeoutInterval） */
  const resetMatchState = useCallback(() => {
    stopPauseInterval();
    pauseEndsRef.current = 0;
    setPauseActive(false); setPauseSeconds(60); setPauseMode('team');
    setHomeTimeoutsLeft(1); setAwayTimeoutsLeft(1);
    onStopwatchReset();
    setFlipA(null); setFlipB(null);
    setScoreA(0); setScoreB(0); setGamesA(0); setGamesB(0);
    setGameHistory([]); setUndoStack([]); setResult(null);
    setStartServer('A'); setServe('A'); setSeconds(0);
    setCourtSwapped(false); setExpediteActive(false); setReturnCount(0);
    statsRef.current = createEmpty(); setStatsTick((n) => n + 1);
    deciderFiveDoneRef.current = false;
    settlingRef.current = false; swapAnim.setValue(0);
    setGameWinAwaitingConfirm(false); setGameWinWinner(null);
    setCalloutA(''); setCalloutB(''); setCalloutVisibleA(false); setCalloutVisibleB(false);
    if (calloutHideRefA.current) { clearTimeout(calloutHideRefA.current); calloutHideRefA.current = null; }
    if (calloutHideRefB.current) { clearTimeout(calloutHideRefB.current); calloutHideRefB.current = null; }
    if (gameSettleRef.current) { clearTimeout(gameSettleRef.current); gameSettleRef.current = null; }
  }, [stopPauseInterval, onStopwatchReset]);

  const resetScores = () => {
    Alert.alert('重置比赛', '确定清空当前比分和局数吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定', style: 'destructive', onPress: resetMatchState },
    ]);
  };

  /** 工具栏第4按钮「各局比分」面板：逐局比分格（原型 buildSmallScoreCellsPatch + Rt）。
   *  已结束局取 gameHistory；进行中再把当前比分作为最后一格追加；isLead=该局分高者。 */
  const detailCells = (): { cellsA: ScoreCell[]; cellsB: ScoreCell[] } => {
    const done = detailMode === 'end' && manualEnd ? manualEnd.games : gameHistory;
    const rows = done.map((g) => ({ a: g.a, b: g.b }));
    if (detailMode === 'running') rows.push({ a: scoreA, b: scoreB });
    return {
      cellsA: rows.map((r) => ({ text: r.a, isLead: r.a > r.b })),
      cellsB: rows.map((r) => ({ text: r.b, isLead: r.b > r.a })),
    };
  };

  /** 原型 onSmallScoreManualEndMatch：弹确认后 finalizeManualEndMatch，
   *  把当前局作为最后一局计入、按大局分(相同则按当前分)判定胜方，展示结束态面板并存档。 */
  const onManualEndMatch = () => {
    setConfirmModal({
      title: '手动结束比赛',
      content: '确定要结束本场比赛吗？将以当前场分与小局比分记录结果。',
      confirmText: '确定', cancelText: '取消',
      onConfirm: () => {
        const w: Side = gamesA !== gamesB ? (gamesA > gamesB ? 'A' : 'B') : (scoreA >= scoreB ? 'A' : 'B');
        const last: GameRecord = { a: scoreA, b: scoreB, winner: scoreA >= scoreB ? 'A' : 'B', index: gameHistory.length + 1 };
        const games = [...gameHistory, last];
        const date = cfg.dateLabel || new Date().toISOString();
        completeMatch({
          id: `M${Date.now()}`, date,
          nameA: cfg.nameA, nameB: cfg.nameB,
          gamesA: games.filter((g) => g.winner === 'A').length,
          gamesB: games.filter((g) => g.winner === 'B').length,
          games, winner: w,
          config: { pointsToWin: cfg.pointsToWin, gamesToWin: cfg.gamesToWin },
        }, `ongoing_${title}_${cfg.nameA}_${cfg.nameB}`.replace(/\s+/g, ''));
        setManualEnd({ winner: w, games, date });
        setEndScoreView('games');
        voice.stop();
      },
    });
  };

  /** 原型 onSmallScoreRestartGame：确认后 resetScoreBoardForFreshMatch。 */
  const onSmallScoreRestart = () => {
    setConfirmModal({
      title: '比赛还未结束', content: '确定重新开始比赛吗',
      confirmText: '确定', cancelText: '取消',
      onConfirm: () => { resetMatchState(); setManualEnd(null); setSmallDetailOpen(false); },
    });
  };

  /** 原型 onSmallScoreRematchMatch：再来一局，清空比分重新开打。 */
  const onSmallScoreRematch = () => {
    resetMatchState();
    setManualEnd(null);
    setEndScoreView('games');
    setSmallDetailOpen(false);
  };

  /** 结束态「退出比赛」：原型保存后 navigateBack。复刻已由 finishMatch/manualEnd 存档，直接返回。 */
  const onSmallScoreExit = () => {
    setSmallDetailOpen(false);
    goBack();
  };

  /** 强制换发球（原版 onManualSwapServe / @529367）：翻转当前发球方并用反推固定首发基准 */
  const swapServe = () => {
    const next = other(serve);
    const newStart = startServerFromServe(
      scoreA, scoreB, cfg.serveInterval, cfg.pointsToWin, cfg.winByTwo, next, expediteActive,
    );
    setServe(next);
    setStartServer(newStart);
    speak(`${next === 'A' ? cfg.nameA : cfg.nameB} 发球`);
  };

  /** 手动换边（原版 onSwapCourtSides）：真实交换左右队伍位置 */
  const swapCourtSides = () => {
    setCourtSwapped((v) => !v);
    speak('交换场地');
  };

  /** 轮换发球法开关（原版 onPingpongExpediteChange）：18 分门槛，启用后保留当前发球方、每分换发 */
  const toggleExpedite = () => {
    if (result || pauseActive || gameWinAwaitingConfirm) return;
    if (!expediteActive) {
      if (scoreA + scoreB >= 18) {
        Alert.alert('提示', '本局总分已达18分，不能启动');
        return;
      }
      Alert.alert('开启轮换发球法', `当前比分 ${scoreA}:${scoreB}。开启后每人发1球，并保留当前发球方。`, [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: () => {
          // 原版 @412620：开启时按 expedite=true 反推首发基准，保留当前发球方
          setStartServer(startServerFromServe(scoreA, scoreB, cfg.serveInterval, cfg.pointsToWin, cfg.winByTwo, serve, true));
          setExpediteActive(true);
          setReturnCount(0);
          speak('开启轮换发球法');
        } },
      ]);
    } else {
      // 原版 @413128：关闭时按 expedite=false 反推首发基准
      setStartServer(startServerFromServe(scoreA, scoreB, cfg.serveInterval, cfg.pointsToWin, cfg.winByTwo, serve, false));
      setExpediteActive(false);
      setReturnCount(0);
      speak('关闭轮换发球法');
    }
  };

  /** 数13拍（原版 onPingpongReturnCountAdd）：到13只提醒不加分 */
  const addReturnCount = () => {
    if (result || pauseActive || gameWinAwaitingConfirm) return;
    const n = Math.min(13, returnCount + 1);
    setReturnCount(n);
    if (n >= 13) {
      speak('已完成13次正确还击，请判接发方得分');
    } else {
      speak(String(n));
    }
  };
  const resetReturnCount = () => setReturnCount(0);

  /** 口哨：按用户选择静音（原型 koushao.mp3，本次不启用） */
  const whistle = () => {};
  /** 蜂鸣器：按用户选择静音（原型 fengmingqi.mp3，本次不启用） */
  const buzzer = () => {};

  /** 抛硬币（原版 coinWidgetOpen）：随机蓝/红先发 */
  const tossCoin = () => {
    const side: Side = Math.random() < 0.5 ? 'A' : 'B';
    setCoinSide(side);
    setServe(side); setStartServer(side);
    speak(`${side === 'A' ? cfg.nameA : cfg.nameB} 先发`);
    Alert.alert('抛硬币', `${side === 'A' ? '蓝方' : '红方'} 先发球`);
  };

  // 原版字号配置：局比分字号 100%=基准，局内小比分字号 100%=基准
  // 原型 onCourtTouchStart/onCourtTouchEnd：gesture 模式下整块球场竖直滑动计分
  // dy<0 上滑 +1，dy>0 下滑 -1；水平滑动忽略。手势作用于对应队伍。
  const courtTouchY = useRef<Record<Side, number | null>>({ A: null, B: null });
  const courtPan = (side: Side) => PanResponder.create({
    onStartShouldSetPanResponder: () => pointInputMode === 'gesture',
    onMoveShouldSetPanResponder: () => false,
    onPanResponderGrant: (e) => { courtTouchY.current[side] = e.nativeEvent.pageY; },
    onPanResponderRelease: (e) => {
      if (pointInputMode !== 'gesture') return;
      const startY = courtTouchY.current[side];
      if (startY == null) return;
      const dy = e.nativeEvent.pageY - startY;
      courtTouchY.current[side] = null;
      if (Math.abs(dy) < 24) return; // 原型阈值约 10rpx，这里放宽避免误触
      if (dy < 0) addPoint(side); else undo(side);
    },
  }).panHandlers;

  // 全 App 强制横屏：横屏高度小，"大屏布局"改为放大主比分，不再靠纵向堆叠挤占高度
  const bigFont = Math.min(W * 0.115, H * 0.30) * (largeScreen ? 1.1 : 1) * (rallyScoreFontScalePct / 100);
  const smallFont = Math.min(W * 0.045, H * 0.075) * (gameScoreFontScalePct / 100);
  const nameFont = (compact ? 18 : 24) * (playerNameFontRpx / 22);
  const railW = toolbarCollapsed ? 0 : (compact ? 38 : 52);

  const sideCard = (side: Side, slot: 'left' | 'right') => {
    const name = side === 'A' ? cfg.nameA : cfg.nameB;
    const score = side === 'A' ? scoreA : scoreB;
    const games = side === 'A' ? gamesA : gamesB;
    // 赢到局分（含决胜局/整场收官局）一律在赢家 + 上叠加点击手势，点它即确认结算。
    // winWillEndMatch 只用于无障碍标签区分（收官局=确认结束比赛），不再隐藏手势。
    const isDeciderGame = gamesA === cfg.gamesToWin - 1 && gamesB === cfg.gamesToWin - 1;
    const winWillEndMatch = isDeciderGame || (gameWinWinner
      ? (gameWinWinner === 'A' ? gamesA + 1 : gamesB + 1) >= cfg.gamesToWin
      : false);
    const showWinHint = gameWinAwaitingConfirm && gameWinWinner === side;
    const timeoutsLeft = side === 'A' ? homeTimeoutsLeft : awayTimeoutsLeft;
    // 原版：linear-gradient(to bottom, color, color×0.72)（来自主题派生 gradHome/gradAway）
    const grad = (side === 'A' ? theme.gradHome : theme.gradAway) as [string, string];
    const calloutText = side === 'A' ? calloutA : calloutB;
    const calloutVisible = side === 'A' ? calloutVisibleA : calloutVisibleB;
    // 原版 beginCourtSwapSlide：两张卡各自 translateX(dx) 对调，dx=对方left-自己left
    const swapDx = slot === 'left'
      ? (cardPosRef.current.right - cardPosRef.current.left)
      : (cardPosRef.current.left - cardPosRef.current.right);
    return (
      <Animated.View
        style={{ flex: 1, transform: [{ translateX: swapAnim.interpolate({
          inputRange: [0, 1], outputRange: [0, swapDx],
        }) }] }}
        onLayout={(e) => { cardPosRef.current[slot] = e.nativeEvent.layout.x; }}
        collapsable={false}
        {...courtPan(side)}
      >
      <LinearGradient colors={grad as [string, string]} style={styles.card}>
        {/* 顶部：队伍暂停按钮（每队 1 次，倒计时图标）+ 局数小分 */}
        <View style={[styles.cardHead, { height: H * (largeScreen ? 0.12 : 0.19) }]}>
          <View style={styles.headInner}>
            <TouchableOpacity
              style={[styles.tBadge, timeoutsLeft < 1 && styles.tBadgeUsed]}
              onPress={() => onTeamTimeoutTap(side)}
              activeOpacity={0.7}
            >
              <Text style={styles.tBadgeLetter}>T</Text>
            </TouchableOpacity>
            <Text style={[styles.headScore, { fontSize: smallFont }]}>{games}</Text>
          </View>
        </View>
        {/* 原版 score-team-meta / score-team-court 之间露出的黑底细线（真机实测纯 #000，占屏高约 0.54%） */}
        <View style={[styles.cardDivider, { height: Math.max(2, H * 0.0054) }]} />
        {/* 主体：发球点 + 超大比分 + +/- */}
        <View style={styles.cardBody}>
          <View style={styles.serveSlot}>
            {serve === side && <View style={[styles.serveDot, { width: H * 0.036, height: H * 0.036, borderRadius: H * 0.018 }]} />}
          </View>
          <View style={styles.scoreRow}>
            <FlipScore key={side} value={score} fontSize={bigFont} flip={side === 'A' ? flipA : flipB} />
            {/* 原型 gesture 模式隐藏加减按钮，靠整块球场上下滑动计分 */}
            {pointInputMode === 'buttons' && <View style={styles.stepCol}>
              <View style={styles.stepBtnWrap}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => addPoint(side)}
                  activeOpacity={0.8}
                  accessibilityLabel={showWinHint ? (winWillEndMatch ? '确认结束比赛' : '点击开始下一局') : '加一分'}
                >
                  <Text style={styles.stepText}>+</Text>
                </TouchableOpacity>
                {showWinHint && <ClickHandHint onPress={() => addPoint(side)} />}
              </View>
              <TouchableOpacity style={styles.stepBtn} onPress={() => undo(side)} activeOpacity={0.8}>
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
            </View>}
          </View>
          <Text style={[styles.teamName, { fontSize: nameFont }]}>{name}</Text>
          {/* 原版 score-callout-slot：计分区右下角，局点/赛点/胜 气泡，0.24s 淡入上移 */}
          <CalloutBubble
            text={calloutText}
            visible={calloutVisible}
            color={side === 'A' ? theme.calloutTextHome : theme.calloutTextAway}
            fontSize={compact ? 13 : 17}
          />
        </View>
      </LinearGradient>
      </Animated.View>
    );
  };

  return (
    <View style={styles.root}>
      {/* 顶部白条（原型 notch 刘海屏留白：36rpx vs 8rpx） */}
      <View style={[styles.topBar, notchScreenOpen && styles.topBarNotch]}>
        <TouchableOpacity style={styles.backBtn} onPress={onExitTap} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>乒乓计分器</Text>
        <View style={styles.capsule}>
          <Text style={styles.capsuleText}>···</Text>
          <View style={styles.capsuleDivider} />
          <Text style={styles.capsuleText}>◎</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* 左侧竖排工具栏：严格复刻原型 score-toolbar（从上到下 6 个按钮，真实 SVG 图标）
            原型 CSS：宽48rpx、半透明白底、圆角、flex:1 等分、图标30rpx、active opacity .75
            按钮顺序与行为：语音播报(voiceChange) / 强制换发球(onManualSwapServe) /
            换边(onSwapCourtSides) / 各局比分(onOpenSmallScoreDetail) /
            技术统计(onOpenLiveStatsSheet) / 退出(onExitTap) */}
        {!toolbarCollapsed && (
          <View style={[styles.rail, { width: railW }]}>
            {/* 1. 语音播报 voiceChange（voice.svg / voice_close.svg） */}
            <TouchableOpacity
              style={[styles.tool, !voiceOn && styles.toolInactive]}
              onPress={() => { setVoiceOn(!voiceOn); if (voiceOn) voice.stop(); }}
              accessibilityLabel="语音播报"
            >
              {voiceOn ? <VoiceIcon size={26} /> : <VoiceCloseIcon size={26} />}
            </TouchableOpacity>
            {/* 2. 强制换发球 onManualSwapServe（change_boll.svg） */}
            <TouchableOpacity style={styles.tool} onPress={swapServe} accessibilityLabel="强制换发球">
              <SwapServeIcon size={26} />
            </TouchableOpacity>
            {/* 3. 换边 onSwapCourtSides（change_space.svg） */}
            <TouchableOpacity style={styles.tool} onPress={swapCourtSides} accessibilityLabel="换边">
              <SwapCourtIcon size={26} />
            </TouchableOpacity>
            {/* 4. 各局比分 onOpenSmallScoreDetail（look_s.svg）→ 小比分详情弹层 */}
            <TouchableOpacity
              style={styles.tool}
              onPress={() => { setEndScoreView('games'); setSmallDetailOpen(true); }}
              accessibilityLabel="各局比分"
            >
              <GamesIcon size={26} />
            </TouchableOpacity>
            {/* 5. 技术统计 onOpenLiveStatsSheet（small_tech.svg，乒乓模式恒可用） */}
            <TouchableOpacity style={styles.tool} onPress={() => setStatsOpen(true)} accessibilityLabel="技术统计">
              <StatsIcon size={26} />
            </TouchableOpacity>
            {/* 6. 退出 onExitTap（quit.svg，emphasis 高亮） */}
            <TouchableOpacity style={[styles.tool, styles.toolEmphasis]} onPress={onExitTap} accessibilityLabel="退出">
              <QuitIcon size={26} />
            </TouchableOpacity>
          </View>
        )}
        {toolbarCollapsed && (
          <TouchableOpacity style={styles.railCollapsed} onPress={() => setToolbarCollapsed(false)} accessibilityLabel="显示工具栏">
            <Text style={{ color: '#fff', fontSize: 18, opacity: 0.85 }}>»</Text>
          </TouchableOpacity>
        )}

        {/* 计分主区 */}
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.formatBadge}>{formatLabel(cfg.gamesToWin)}</Text>
            <Text style={styles.matchTitle}>{title}</Text>
          </View>

          {/* 全 App 强制横屏：两卡始终左右并排；纵向堆叠在横屏低高度下会裁切比分，故不再启用 */}
          <View style={styles.cardsRow}>
            {courtSwapped ? sideCard('B', 'left') : sideCard('A', 'left')}
            <View style={styles.centerCol}>
              {/* 原版 score-head-menu：≡ 菜单，位于标题正下方、两卡之间顶部 */}
              <TouchableOpacity style={styles.centerMenu} onPress={() => setSheet('setting')} activeOpacity={0.7}>
                <Text style={styles.menuLines}>≡</Text>
                <View style={styles.menuDot} />
              </TouchableOpacity>
              {/* 原版 score-net：球网两个竖排灰点，纯装饰不可点（10rpx→5dp，#555，gap 12rpx→6dp） */}
              <View style={styles.netSlot}>
                <View style={styles.netDot} /><View style={styles.netDot} />
              </View>
              {/* 原版 score-ls-clock：比赛用时 clockText（自动走，m:ss，如 13:46），不可点 */}
              <Text style={styles.clockText}>{fmtTime(seconds)}</Text>
            </View>
            {courtSwapped ? sideCard('A', 'right') : sideCard('B', 'right')}
          </View>
        </View>

        {/* 原版暂停浮层 score-team-timeout-mask：横向 时钟|队伍名/暂停中/倒计时|时钟 + 结束按钮 */}
        {pauseActive && (
          <View style={pauseStyles.mask}>
            <View style={pauseStyles.inner}>
              <View style={pauseStyles.row}>
                {/* 左 fl：真实条件 = team 模式 && (换边后暂停方在左) */}
                <View style={pauseStyles.flank}>
                  {pauseMode === 'team' && (courtSwapped ? pauseSide === 'B' : pauseSide === 'A') && (
                    <Text style={pauseStyles.clock}>◷</Text>
                  )}
                </View>
                {/* 中间：队伍名 + 标题 + 大倒计时 */}
                <View style={pauseStyles.center}>
                  {pauseMode === 'team' && (
                    <View style={pauseStyles.names}>
                      <Text style={pauseStyles.nameLine}>
                        {pauseSide === 'A' ? cfg.nameA : cfg.nameB}
                      </Text>
                    </View>
                  )}
                  <Text style={pauseStyles.title}>
                    {pauseMode === 'interGame' ? '局间休息' : '暂停中'}
                  </Text>
                  <Text style={pauseStyles.count}>{pauseSeconds}</Text>
                </View>
                {/* 右 fl：暂停方在右时高亮时钟 */}
                <View style={pauseStyles.flank}>
                  {pauseMode === 'team' && (pauseSide === 'B') && (
                    <Text style={pauseStyles.clock}>◷</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity style={pauseStyles.endBtn} onPress={onPauseRequestEnd}>
                <Text style={pauseStyles.endText}>
                  {pauseMode === 'interGame' ? '结束休息' : '结束暂停'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* 大屏模式（电视投屏）：横屏沉浸界面，覆盖整个计分屏 */}
      {tvMode && (
        <BigscreenOverlay
          title={title}
          nameA={cfg.nameA} nameB={cfg.nameB}
          scoreA={scoreA} scoreB={scoreB}
          gamesA={gamesA} gamesB={gamesB}
          serve={serve}
          calloutA={calloutA} calloutB={calloutB}
          awaitingConfirm={gameWinAwaitingConfirm}
          winner={gameWinWinner}
          courtSwapped={courtSwapped}
          formatLabel={formatLabel(cfg.gamesToWin)}
          matchSeconds={seconds}
          theme={theme}
          pauseActive={pauseActive}
          pauseSeconds={pauseSeconds}
          onAddPoint={addPoint}
          onUndo={undo}
          onExit={() => setTvMode(false)}
        />
      )}

      {/* 设置弹层：贴近原型 score-center-settings-panel 的满屏大面板 + 横向网格 */}
      <Sheet visible={sheet === 'setting'} onClose={() => setSheet(null)} title="设置" wide>
        {/* 入口行：score-settings-entry-row（本地复刻为占位入口） */}
        <View style={s.entryRow}>
          <TouchableOpacity style={s.entryBtn} onPress={enterTvMode}>
            <Text style={s.entryTitle}>比分同步展示（投屏）</Text>
            <Text style={s.entryDesc}>投屏到电视大屏，实时显示本场比分</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.entryBtn, s.entryBtnPrimary]} onPress={() => Alert.alert('邀请好友共同执裁', '需联网与好友协作，本地版本暂不支持')}>
            <Text style={[s.entryTitle, s.entryTitlePrimary]}>邀请好友共同执裁</Text>
          </TouchableOpacity>
        </View>

        {/* 第一行：操作方式 / 页面布局 / 快捷操作 / 播报语言 —— 原型为 4 列 */}
        <View style={s.grid4}>
          {/* 操作方式 pointInputMode */}
          <View style={s.gridCell}>
            <Text style={s.groupTitle}>操作方式</Text>
            <SettingRadio label="滑动计分" checked={pointInputMode === 'gesture'} onPress={() => setPointInputMode('gesture')} />
            <SettingRadio label="加减按钮" checked={pointInputMode === 'buttons'} onPress={() => setPointInputMode('buttons')} />
          </View>

          {/* 页面布局 largeScreenMode */}
          <View style={s.gridCell}>
            <Text style={s.groupTitle}>页面布局</Text>
            <SettingRadio label="标准布局" checked={!largeScreen} onPress={() => setLargeScreen(false)} />
            <SettingRadio label="大屏布局" checked={largeScreen} onPress={() => setLargeScreen(true)} />
          </View>

          {/* 快捷操作 shortcut-icons-row */}
          <View style={s.gridCell}>
            <Text style={s.groupTitle}>快捷操作</Text>
            <View style={s.shortcutRow}>
              <TouchableOpacity style={s.shortcutItem} onPress={whistle}>
                <View style={s.shortcutCircle}><Text style={s.shortcutIcon}>♪</Text></View>
                <Text style={s.shortcutLabel}>口哨</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.shortcutItem} onPress={buzzer}>
                <View style={s.shortcutCircle}><Text style={s.shortcutIcon}>⌁</Text></View>
                <Text style={s.shortcutLabel}>蜂鸣器</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 播报语言 scoreVoiceLanguage */}
          <View style={s.gridCell}>
            <Text style={s.groupTitle}>播报语言</Text>
            <SettingRadio label="中文" checked={voiceLanguage === 'zh'} onPress={() => setVoiceLanguage('zh')} />
            <SettingRadio label="英文" checked={voiceLanguage === 'en'} onPress={() => setVoiceLanguage('en')} />
            <TouchableOpacity style={s.switchRow} onPress={() => { setVoiceOn(!voiceOn); if (voiceOn) voice.stop(); }}>
              <Text style={s.labelInline}>语音播报</Text>
              <View style={[s.switchTrack, voiceOn && s.switchTrackOn]}><View style={[s.switchThumb, voiceOn && s.switchThumbOn]} /></View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 第二行：字体调整（左） + 更多设置（右 3 列复选）—— 原型并排 */}
        <View style={s.gridMiddle}>
          <View style={s.fontCell}>
            <Text style={s.groupTitle}>字体调整</Text>
            <Text style={s.sliderCaption}>姓名字号 {playerNameFontRpx}</Text>
            <RangeSlider value={playerNameFontRpx} min={14} max={34} step={1}
              onChanging={setPlayerNameFontRpx} onChange={setPlayerNameFontRpx} />
            <Text style={s.sliderCaption}>局比分字号 {gameScoreFontScalePct}%</Text>
            <RangeSlider value={gameScoreFontScalePct} min={70} max={130} step={5}
              onChanging={setGameScoreFontScalePct} onChange={setGameScoreFontScalePct} />
            <Text style={s.sliderCaption}>局内小比分字号 {rallyScoreFontScalePct}%</Text>
            <RangeSlider value={rallyScoreFontScalePct} min={70} max={130} step={5}
              onChanging={setRallyScoreFontScalePct} onChange={setRallyScoreFontScalePct} />
          </View>

          <View style={s.moreCell}>
            <Text style={s.groupTitle}>更多设置</Text>
            <View style={s.checkGrid}>
              <SettingCheck label="自动换场地" value={autoCourtSwap} onToggle={() => setAutoCourtSwap(!autoCourtSwap)} />
              <SettingCheck label="秒表" value={stopwatchFeatureOpen} onToggle={() => setStopwatchFeatureOpen(!stopwatchFeatureOpen)} />
              <SettingCheck label="口哨" value={whistleShortcutOpen} onToggle={() => setWhistleShortcutOpen(!whistleShortcutOpen)} />
              <SettingCheck label="蜂鸣器" value={buzzerShortcutOpen} onToggle={() => setBuzzerShortcutOpen(!buzzerShortcutOpen)} />
              <SettingCheck label="刘海屏" value={notchScreenOpen} onToggle={() => setNotchScreenOpen(!notchScreenOpen)} />
              <SettingCheck label="隐藏工具栏" value={toolbarCollapsed} onToggle={() => setToolbarCollapsed(!toolbarCollapsed)} />
              <SettingCheck label="开局硬币" value={coinWidgetOpen} onToggle={() => setCoinWidgetOpen(!coinWidgetOpen)} />
              <SettingCheck label="局间休息" value={interGameRest} onToggle={() => setInterGameRest(!interGameRest)} />
              {/* 判罚在乒乓模式下原版不可用，默认隐藏；开启此开关后才显示判罚配置项 */}
              <SettingCheck label="判罚" value={misconductOpen} onToggle={() => setMisconductOpen(!misconductOpen)} />
            </View>
            {/* 工具栏严格复刻原型后，秒表/硬币不再占工具栏，操作入口移到这里（功能不丢） */}
            {(stopwatchFeatureOpen || coinWidgetOpen) && (
              <View style={s.quickOps}>
                {stopwatchFeatureOpen && (
                  <View style={s.quickOpItem}>
                    <Text style={s.quickOpLabel}>秒表 {stopwatchDisplay}</Text>
                    <TouchableOpacity style={s.quickOpBtn} onPress={onStopwatchToggle}>
                      <Text style={s.quickOpBtnText}>{stopwatchRunning ? '暂停' : '开始'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.quickOpBtn} onPress={onStopwatchReset}>
                      <Text style={s.quickOpBtnText}>复位</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {coinWidgetOpen && (
                  <View style={s.quickOpItem}>
                    <Text style={s.quickOpLabel}>抛硬币 {coinSide ? (coinSide === 'A' ? '· 蓝先发' : '· 红先发') : ''}</Text>
                    <TouchableOpacity style={s.quickOpBtn} onPress={tossCoin}>
                      <Text style={s.quickOpBtnText}>抛</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            {/* 乒乓规则 score-settings-pingpong-rule：判罚功能开关（默认隐藏判罚项） */}
            <SettingCheck label="启用判罚功能" value={showMisconductSetting} onToggle={() => setShowMisconductSetting(!showMisconductSetting)} />
          </View>
        </View>

        {/* 乒乓规则整行：轮换发球法 / 数13拍 */}
        <RuleRow
          label="轮换发球法" hint="每人发1球，本场持续生效"
          value={expediteActive} onToggle={toggleExpedite}
          onHelp={() => setRuleHelp('expedite')}
        />
        {expediteActive && (
          <RuleRow
            label="数13拍" hint="接发方正确还击13次即得1分"
            value={returnCount > 0} onToggle={() => setReturnCount(returnCount > 0 ? 0 : 1)}
            onHelp={() => setRuleHelp('return13')}
          />
        )}

        {/* 背景主题 score-center-settings-theme-head */}
        <View style={s.themeHead}>
          <Text style={s.groupTitle}>背景主题</Text>
          <TouchableOpacity onPress={() => { setSheet(null); (navigation as any).navigate('ScoreTheme'); }}>
            <Text style={s.themeTip}>更多配色请到「我的」→「计分主题」</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.themeRow}>
          {THEMES.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[s.themeCard, themeId === t.id && s.themeCardOn]}
              onPress={() => selectTheme(t.id)}
            >
              <View style={s.themeSwatches}>
                <LinearGradient colors={t.gradHome} style={s.themeSwatchBig} />
                <LinearGradient colors={t.gradAway} style={s.themeSwatchBig} />
              </View>
              <Text numberOfLines={2} style={[s.themeCardName, themeId === t.id && s.themeCardNameOn]}>{t.name}</Text>
              {t.vipOnly && <View style={s.themeVipBadge}><Text style={s.themeVipText}>VIP</Text></View>}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* —— 以下为本地复刻保留的比赛参数 —— */}
        <View style={s.groupDivider} />
        <Text style={s.groupTitle}>比赛参数</Text>
        <Text style={s.labelInline}>比赛名称</Text>
        <Text style={s.modalValue}>{title}</Text>
        <Text style={s.labelInline}>赛制（局数）</Text>
        <View style={s.optRow}>
          {[1, 2, 3].map((n) => (
            <TouchableOpacity key={n} style={[s.opt, cfg.gamesToWin === n && !cfg.free && s.optOn]} onPress={() => setCfg({ ...cfg, gamesToWin: n, free: false })}>
              <Text style={[s.optText, cfg.gamesToWin === n && s.optTextOn]}>{2 * n - 1}局{n}胜</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.labelInline}>每局分数</Text>
        <View style={s.optRow}>
          {[7, 11, 15, 21].map((n) => (
            <TouchableOpacity key={n} style={[s.opt, cfg.pointsToWin === n && s.optOn]} onPress={() => setCfg({ ...cfg, pointsToWin: n })}>
              <Text style={[s.optText, cfg.pointsToWin === n && s.optTextOn]}>{n}分</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.modalActions}>
          <TouchableOpacity style={s.modalBtn} onPress={() => setSheet(null)}><Text style={s.modalBtnText}>取消</Text></TouchableOpacity>
          <TouchableOpacity style={[s.modalBtn, s.modalBtnPrimary]} onPress={() => { resetScores(); setSheet(null); }}>
            <Text style={[s.modalBtnText, s.modalBtnTextOn]}>重置比分</Text>
          </TouchableOpacity>
        </View>
      </Sheet>

      {/* 局分记录弹层 */}
      <Sheet visible={sheet === 'record'} onClose={() => setSheet(null)} title={`局分记录（${gameHistory.length} 局）`}>
        {gameHistory.length === 0 ? (
          <Text style={s.empty}>还没有完成任何一局</Text>
        ) : gameHistory.map((g) => (
          <View key={g.index} style={s.recordRow}>
            <Text style={s.recordIndex}>第 {g.index} 局</Text>
            <Text style={[s.recordScore, g.winner === 'A' ? { color: '#4d9bff' } : { color: '#ff6b6b' }]}>{g.a} : {g.b}</Text>
            <Text style={s.recordWinner}>{g.winner === 'A' ? cfg.nameA : cfg.nameB} 胜</Text>
          </View>
        ))}
      </Sheet>

      {/* 统计弹层 */}
      <Sheet visible={sheet === 'stats'} onClose={() => setSheet(null)} title="比赛统计">
        <View style={s.statGrid}>
          <StatCell label="局分" value={`${gamesA} : ${gamesB}`} />
          <StatCell label="已完成局数" value={String(gameHistory.length)} />
          <StatCell label="用时" value={fmtTime(seconds)} />
          <StatCell label="当前比分" value={`${scoreA} : ${scoreB}`} />
        </View>
        <Text style={s.modalLabel}>总得分</Text>
        <View style={s.barRow}>
          <View style={[s.bar, { width: `${(scoreA / Math.max(1, scoreA + scoreB)) * 100}%`, backgroundColor: C_BLUE }]} />
          <View style={[s.bar, { width: `${(scoreB / Math.max(1, scoreA + scoreB)) * 100}%`, backgroundColor: RED }]} />
        </View>
        <Text style={s.barLegend}>{cfg.nameA} {scoreA} 分　|　{cfg.nameB} {scoreB} 分</Text>
      </Sheet>

      {/* 工具栏第4按钮：原型 onOpenSmallScoreDetail 小比分详情弹层（running/end 两态） */}
      <SmallScoreDetailPanel
        visible={smallDetailOpen}
        onClose={() => setSmallDetailOpen(false)}
        mode={detailMode}
        title={title}
        ruleSummary={buildRuleSummary(cfg)}
        dateText={detailMode === 'end' ? (manualEnd?.date || cfg.dateLabel) : undefined}
        nameA={cfg.nameA}
        nameB={cfg.nameB}
        gamesA={gamesA}
        gamesB={gamesB}
        cellsA={detailCells().cellsA}
        cellsB={detailCells().cellsB}
        winner={manualEnd?.winner ?? result?.winner ?? null}
        showRematch
        showStatsLink={detailMode === 'end'}
        onStats={() => { setSmallDetailOpen(false); setSheet('stats'); }}
        onManualEnd={onManualEndMatch}
        onRestart={onSmallScoreRestart}
        onToggleEndView={() => setEndScoreView((v) => (v === 'games' ? 'sets' : 'games'))}
        endScoreView={endScoreView}
        onRematch={onSmallScoreRematch}
        onExit={onSmallScoreExit}
      />

      {/* 工具栏第5按钮：原型 onOpenLiveStatsSheet 技术统计底部弹层 */}
      <LiveStatsSheet
        visible={statsOpen}
        onClose={() => setStatsOpen(false)}
        homeTitle={cfg.nameA}
        awayTitle={cfg.nameB}
        rows={buildLiveStatRows(statsRef.current)}
        swapped={courtSwapped}
        fillHome={C_BLUE}
        fillAway={RED}
      />

      {/* 结果弹层 */}
      <Modal visible={!!result} transparent animationType="fade" onRequestClose={() => setResult(null)}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.resultEmoji}>🏆</Text>
            <Text style={styles.resultTitle}>{result ? (result.winner === 'A' ? cfg.nameA : cfg.nameB) : ''} 获胜！</Text>
            <Text style={styles.resultScore}>
              {result?.games.filter((g) => g.winner === 'A').length} : {result?.games.filter((g) => g.winner === 'B').length}
            </Text>
            <Text style={styles.resultDetail}>{result?.games.map((g, i) => `第${i + 1}局 ${g.a}:${g.b}`).join('   ')}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={goBack}><Text style={styles.modalBtnText}>返回首页</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={resetMatchState}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextOn]}>再来一场</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 原版 wx.showModal：白色圆角卡片，灰「取消」+ 绿「确定」，背景不变暗 */}
      <Modal
        visible={!!confirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModal(null)}
      >
        <View style={confirmStyles.mask}>
          <View style={confirmStyles.card}>
            <Text style={confirmStyles.title}>{confirmModal?.title}</Text>
            <Text style={confirmStyles.content}>{confirmModal?.content}</Text>
            <View style={confirmStyles.buttons}>
              <TouchableOpacity
                style={confirmStyles.btnCancel}
                onPress={() => setConfirmModal(null)}
                activeOpacity={0.7}
              >
                <Text style={confirmStyles.btnCancelText}>{confirmModal?.cancelText ?? '取消'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={confirmStyles.btnConfirm}
                onPress={() => { const cb = confirmModal?.onConfirm; setConfirmModal(null); cb?.(); }}
                activeOpacity={0.7}
              >
                <Text style={confirmStyles.btnConfirmText}>{confirmModal?.confirmText ?? '确定'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 乒乓规则帮助弹层（原型 onShowPingpongReturnCountRuleHelp / 轮换发球法查看规则） */}
      <Modal visible={!!ruleHelp} transparent animationType="fade" onRequestClose={() => setRuleHelp(null)}>
        <View style={confirmStyles.mask}>
          <View style={confirmStyles.card}>
            <Text style={confirmStyles.title}>{ruleHelp === 'expedite' ? '轮换发球法' : '数13拍'}</Text>
            <Text style={confirmStyles.content}>
              {ruleHelp === 'expedite'
                ? '当一局比赛进行到双方均得 10 分（10:10）后，每人每次仅发 1 球，轮换发球；一经启用，本场持续生效。'
                : '在轮换发球法生效期间，接发方对每一次发球正确还击累计达 13 次，接发方即得 1 分；计数到 13 后重置。'}
            </Text>
            <View style={confirmStyles.buttons}>
              <TouchableOpacity style={[confirmStyles.btnConfirm, { flex: 1 }]} onPress={() => setRuleHelp(null)}>
                <Text style={confirmStyles.btnConfirmText}>知道了</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* 大屏模式投屏引导（每次进入都显示，置顶于所有弹窗） */}
      <Modal visible={tvMode && tvGuideOpen} transparent animationType="fade" onRequestClose={dismissTvGuide}>
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.resultTitle}>投屏到电视</Text>
            <Text style={tvGuideText}>
              {'① 手机下拉快捷设置 → 打开「投屏 / 屏幕镜像」\n② 在设备列表选择你的电视（系统自动发现局域网电视）\n③ 镜像成功后电视与手机同步显示大屏画面：\n     点击左/右半屏 = 对应队伍 +1，卡片下方 − = 撤销\n     右上角 ✕ 双击退出大屏模式'}
            </Text>
            <Text style={tvGuideTip}>若搜索不到电视，请在电视设置中打开「无线投屏 / Miracast」。</Text>
            <View style={[styles.modalActions, { justifyContent: 'center' }]}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={dismissTvGuide}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextOn]}>知道了</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

/** 设置面板复选项（原型 score-settings-checkbox-label） */
function SettingCheck({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity style={s.checkRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[s.checkBox, value && s.checkBoxOn]}>{value && <Text style={s.checkMark}>✓</Text>}</View>
      <Text style={s.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

/** 乒乓规则行（原型 score-settings-pingpong-rule__item）：标题+说明+查看规则+开关 */
function RuleRow({ label, hint, value, onToggle, onHelp }: {
  label: string; hint: string; value: boolean; onToggle: () => void; onHelp: () => void;
}) {
  return (
    <View style={s.ruleBox}>
      <View style={s.ruleTop}>
        <Text style={s.ruleLabel}>{label}</Text>
        <TouchableOpacity onPress={onHelp} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={s.ruleHelp}>查看规则 ⓘ</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggle} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <View style={[s.switchTrack, s.switchTrackSmall, value && s.switchTrackOn]}>
            <View style={[s.switchThumb, s.switchThumbSmall, value && s.switchThumbSmallOn]} />
          </View>
        </TouchableOpacity>
      </View>
      <Text style={s.ruleHint}>{hint}</Text>
    </View>
  );
}

/** 通用底部抽屉弹层（wide=设置面板：接近满屏大面板 + 横向网格，贴近原型） */
function Sheet({ visible, onClose, title, wide, children }: {
  visible: boolean; onClose: () => void; title: string; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={[s.sheetCard, wide && s.sheetCardWide]}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={[s.sheetBody, wide && s.sheetBodyWide]} contentContainerStyle={wide && s.sheetBodyContent}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** 单选圆点行（原型操作方式/页面布局/播报语言的单选样式） */
function SettingRadio({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.radioRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.radioCircle, checked && s.radioCircleOn]}>{checked && <Text style={s.radioMark}>✓</Text>}</View>
      <Text style={[s.radioLabel, checked && s.radioLabelOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    height: 46, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 12,
  },
  topBarNotch: { height: 62, alignItems: 'flex-end', paddingBottom: 8 },
  backBtn: { position: 'absolute', left: 12, zIndex: 2, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 34, color: '#111', lineHeight: 38, marginTop: -3 },
  topTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  capsule: {
    position: 'absolute', right: 10, flexDirection: 'row', alignItems: 'center',
    height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', paddingHorizontal: 10,
  },
  capsuleText: { fontSize: 13, color: '#111' },
  capsuleDivider: { width: 1, height: 14, backgroundColor: 'rgba(0,0,0,0.14)', marginHorizontal: 8 },

  body: { flex: 1, flexDirection: 'row' },
  // 原版 score-toolbar：background hsla(0,0%,100%,.04)、border-radius 10rpx、
  // width 48rpx、flex-direction column、按钮 flex:1 等分、图标 30rpx
  rail: {
    backgroundColor: 'rgba(255,255,255,0.04)', margin: 6, marginRight: 2, borderRadius: 5,
    alignItems: 'center', paddingVertical: 4,
  },
  tool: { flex: 1, width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  toolInactive: { opacity: 0.5 },   // 原版 --active 反过来：关闭态弱化
  toolEmphasis: { opacity: 0.95 },  // 原版 --emphasis（退出）
  railCollapsed: {
    backgroundColor: 'rgba(255,255,255,0.04)', margin: 6, marginRight: 2, borderRadius: 5,
    width: 24, alignItems: 'center', justifyContent: 'center',
  },

  main: { flex: 1, paddingHorizontal: 8, paddingTop: 4 },
  titleRow: { height: 44, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  matchTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  formatBadge: { position: 'absolute', left: 0, color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '500', letterSpacing: 0.5 },
  menuLines: { color: '#fff', fontSize: 26, lineHeight: 26, fontWeight: '700' },
  menuDot: { position: 'absolute', right: 4, top: 2, width: 7, height: 7, borderRadius: 4, backgroundColor: '#ff3b30' },

  cardsRow: { flex: 1, flexDirection: 'row', paddingBottom: 8 },
  cardsRowStack: { flexDirection: 'column' },
  card: { flex: 1, borderRadius: 16, overflow: 'hidden', marginHorizontal: 3, marginVertical: 1 },
  cardHead: { width: '100%', justifyContent: 'center' },
  cardDivider: { width: '100%', backgroundColor: '#000000' },
  headInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  // 原版 score-team-meta__timeout：默认 opacity:.25（没用过=灰），
  // timeoutsLeft<1 加 --used 修饰类 opacity:1（用过=高亮），再点 toast 拦截不能再用
  tBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 8,
    minWidth: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    opacity: 0.25,
  },
  tBadgeUsed: { opacity: 1 },
  tBadgeLetter: { color: '#fff', fontSize: 19, fontWeight: '900', lineHeight: 22 },
  headScore: { color: '#fff', fontFamily: SCORE_FONT, fontWeight: '800', marginRight: 8 },
  cardBody: { flex: 1, paddingHorizontal: 14, paddingBottom: 14 },
  serveSlot: { height: 44, justifyContent: 'flex-start', paddingTop: 8 },
  serveDot: { backgroundColor: '#fff' },
  scoreRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  bigScore: { color: '#fff', fontFamily: SCORE_FONT, fontWeight: '900', textAlign: 'center' },
  stepCol: { marginLeft: 10, gap: 8 },
  stepBtnWrap: { position: 'relative', width: 46, height: 46 },
  stepBtn: { width: 46, height: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.22)' },
  stepText: { color: '#fff', fontSize: 26, fontWeight: '700', lineHeight: 30 },
  teamName: { color: '#fff', fontWeight: '800', includeFontPadding: false },

  // 原版中间黑列（两卡之间）：顶部菜单 + 中部球网灰点 + 底部比赛用时，纯展示
  centerCol: { width: 52, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  centerColStack: { width: '100%', height: 34, flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 0 },
  centerMenu: { position: 'relative', width: 40, height: 34, alignItems: 'center', justifyContent: 'center' },
  netSlot: { alignItems: 'center', gap: 6 },
  netDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#555' },
  clockText: { color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'] },
  timerRunning: { color: '#34c759' },

  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '86%', maxWidth: 420, backgroundColor: '#1c1c1e', borderRadius: 16, padding: 20 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#2c2c2e', alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: C_BLUE },
  modalBtnText: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  modalBtnTextOn: { color: '#fff' },
  resultEmoji: { fontSize: 44, textAlign: 'center' },
  resultTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  resultScore: { color: GREEN, fontSize: 40, fontWeight: '900', textAlign: 'center', marginVertical: 8, fontFamily: SCORE_FONT },
  resultDetail: { color: '#9ca3af', fontSize: 12, textAlign: 'center' },
});

const s = StyleSheet.create({
  sheetCard: { width: '90%', maxWidth: 460, maxHeight: '76%', backgroundColor: '#1c1c1e', borderRadius: 16, padding: 18 },
  // 设置面板：贴近原型的满屏大面板（左右留边，高度近满屏）
  sheetCardWide: { width: '96%', maxWidth: 1100, height: '94%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  sheetClose: { color: '#9ca3af', fontSize: 18 },
  sheetBody: { maxHeight: 380 },
  sheetBodyWide: { maxHeight: undefined, flex: 1 },
  sheetBodyContent: { paddingBottom: 24, paddingRight: 4 },
  // 原型横向网格：第一行 4 列、第二行 字体+更多设置
  grid4: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 12, marginTop: 8 },
  gridCell: { flex: 1, minWidth: 160 },
  gridMiddle: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 12, marginTop: 4 },
  fontCell: { width: '34%', minWidth: 200 },
  moreCell: { flex: 1, minWidth: 260 },
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  quickOps: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', gap: 6 },
  quickOpItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickOpLabel: { color: '#fff', fontSize: 13, flex: 1 },
  quickOpBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.12)' },
  quickOpBtnText: { color: '#fff', fontSize: 12 },
  // 单选圆点（原型 radio）
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#6b7280', alignItems: 'center', justifyContent: 'center' },
  radioCircleOn: { backgroundColor: C_BLUE, borderColor: C_BLUE },
  radioMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  radioLabel: { color: '#d1d5db', fontSize: 15 },
  radioLabelOn: { color: '#fff' },
  // 原型背景主题横排卡片
  themeHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  themeTip: { color: '#f5c451', fontSize: 12, marginBottom: 8 },
  themeRow: { flexDirection: 'row', marginTop: 4 },
  themeCard: { width: 128, borderRadius: 10, padding: 8, marginRight: 8, backgroundColor: '#26262a', borderWidth: 2, borderColor: 'transparent', position: 'relative' },
  themeCardOn: { borderColor: C_BLUE, backgroundColor: '#2c2c30' },
  themeSwatches: { flexDirection: 'row', gap: 4 },
  themeSwatchBig: { flex: 1, height: 34, borderRadius: 6 },
  themeCardName: { color: '#9ca3af', fontSize: 11, marginTop: 8, textAlign: 'center', minHeight: 28, lineHeight: 14 },
  themeCardNameOn: { color: '#fff', fontWeight: '700' },
  themeVipBadge: { position: 'absolute', right: 4, top: 4, backgroundColor: 'rgba(245,196,81,0.9)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  themeVipText: { color: '#3a2a00', fontSize: 8, fontWeight: '800' },
  modalLabel: { color: '#9ca3af', fontSize: 12, marginTop: 12, marginBottom: 6 },
  labelInline: { color: '#d1d5db', fontSize: 13, marginTop: 12, marginBottom: 6 },
  modalValue: { color: '#fff', fontSize: 15 },
  // 原型 score-settings-entry-row
  entryRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  entryBtn: { flex: 1, minHeight: 60, backgroundColor: '#2c2c2e', borderWidth: 1, borderColor: '#3a3a3c', borderRadius: 10, padding: 12, justifyContent: 'center' },
  entryBtnPrimary: { backgroundColor: C_BLUE, borderColor: C_BLUE, alignItems: 'center' },
  entryTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  entryTitlePrimary: { fontSize: 17 },
  entryDesc: { color: '#9ca3af', fontSize: 11, marginTop: 4 },
  // 原型 score-settings-group-title
  groupTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  groupDivider: { height: 1, backgroundColor: '#2c2c2e', marginTop: 18 },
  // 原型 shortcut-icons-row
  shortcutRow: { flexDirection: 'row', gap: 24 },
  shortcutItem: { alignItems: 'center', gap: 6 },
  shortcutCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2c6cea', alignItems: 'center', justifyContent: 'center' },
  shortcutIcon: { color: '#fff', fontSize: 24, fontWeight: '700' },
  shortcutLabel: { color: '#d1d5db', fontSize: 11 },
  // 字体滑块说明
  sliderCaption: { color: '#d1d5db', fontSize: 12, marginTop: 8 },
  // 原型 score-settings-checkbox-label
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, width: '33.33%', minWidth: 96 },
  checkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#6b7280', alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: '#2c6cea', borderColor: '#2c6cea' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  checkLabel: { color: '#d1d5db', fontSize: 13 },
  // 原型 score-settings-pingpong-rule
  ruleBox: { backgroundColor: '#2c2c2e', borderRadius: 10, padding: 12, marginTop: 8 },
  ruleTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleLabel: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },
  ruleHelp: { color: '#6ba8ff', fontSize: 11 },
  ruleHint: { color: '#9ca3af', fontSize: 11, marginTop: 6 },
  optRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  opt: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2c2c2e' },
  optOn: { backgroundColor: C_BLUE },
  optText: { color: '#d1d5db', fontSize: 13 },
  optTextOn: { color: '#fff', fontWeight: '700' },
  themeOpt: { flexDirection: 'row', gap: 3, padding: 6, borderRadius: 8, backgroundColor: '#2c2c2e', borderWidth: 2, borderColor: 'transparent' },
  themeOptOn: { borderColor: '#fff' },
  themeSwatch: { width: 18, height: 18, borderRadius: 4 },
  themeName: { color: '#9ca3af', fontSize: 11, marginTop: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#3a3a3c', padding: 3, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: '#34c759' },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  switchThumbOn: { transform: [{ translateX: 18 }] },
  switchTrackSmall: { width: 38, height: 22, borderRadius: 11, padding: 2 },
  switchThumbSmall: { width: 18, height: 18, borderRadius: 9 },
  switchThumbSmallOn: { transform: [{ translateX: 16 }] },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#2c2c2e', alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: C_BLUE },
  modalBtnText: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  modalBtnTextOn: { color: '#fff' },
  empty: { color: '#6b7280', fontSize: 13, textAlign: 'center', paddingVertical: 30 },
  recordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2c2c2e' },
  recordIndex: { flex: 1, color: '#d1d5db', fontSize: 14 },
  recordScore: { fontFamily: SCORE_FONT, fontSize: 20, fontWeight: '800', marginRight: 16 },
  recordWinner: { color: '#9ca3af', fontSize: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: { width: '47%', backgroundColor: '#2c2c2e', borderRadius: 10, padding: 14, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '800', fontFamily: SCORE_FONT },
  statLabel: { color: '#9ca3af', fontSize: 11, marginTop: 6 },
  barRow: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#2c2c2e' },
  bar: { height: 12 },
  barLegend: { color: '#9ca3af', fontSize: 12, textAlign: 'center', marginTop: 10 },
});

/**
 * 原版暂停浮层（分包真实 CSS，rpx÷2→dp）：
 * mask rgba(0,0,0,.72) fixed 居中；数字 120rpx→60dp；标题 28rpx→14dp；
 * 结束按钮 高64rpx→32dp / 文字26rpx→13dp / 圆角10rpx→5dp / 半透明白+1px白边；
 * 横向结构：时钟(56rpx→28dp) | 队伍名+标题+数字 | 时钟。
 */
const pauseStyles = StyleSheet.create({
  mask: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  inner: { width: '100%', paddingHorizontal: 12, alignItems: 'center' },
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  flank: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  clock: { color: '#f8fafc', fontSize: 28, opacity: 0.95 },
  center: { alignItems: 'center', gap: 6, flexShrink: 0 },
  names: { alignItems: 'center' },
  nameLine: { color: '#f8fafc', fontSize: 14, fontWeight: '700', letterSpacing: 0.5, maxWidth: 220 },
  title: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
  count: {
    color: '#f8fafc', fontSize: 60, fontWeight: '800', letterSpacing: 2,
    lineHeight: 66, fontFamily: SCORE_FONT,
  },
  endBtn: {
    marginTop: 24, minWidth: 80, height: 32, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)', borderRadius: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  endText: { color: '#e2e8f0', fontSize: 13, lineHeight: 16 },
});

/** 原版 wx.showModal 原生确认框：白卡、灰取消、绿确定，背景不变暗 */
const confirmStyles = StyleSheet.create({
  mask: {
    flex: 1, backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    width: '68%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 12,
    paddingTop: 24, paddingHorizontal: 20, paddingBottom: 18,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  title: { color: '#111827', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  content: { color: '#6b7280', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  buttons: { flexDirection: 'row', gap: 12 },
  btnCancel: {
    flex: 1, height: 44, borderRadius: 8, backgroundColor: '#f1f3f5',
    alignItems: 'center', justifyContent: 'center',
  },
  btnCancelText: { color: '#111827', fontSize: 15, fontWeight: '600' },
  btnConfirm: {
    flex: 1, height: 44, borderRadius: 8, backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  btnConfirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
