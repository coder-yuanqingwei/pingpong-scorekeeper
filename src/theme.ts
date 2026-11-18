/**
 * 主题令牌：1:1 还原自微信小程序「乒乓计分器」的 styles/theme.wxss
 * 保留旧键名以兼容已有页面，同时提供原版语义的 token。
 */
export const C = {
  // ---- 原版 --kl-* 设计变量 ----
  primary: '#006e2f',          // --kl-primary
  primaryDark: '#005326',      // 派生深绿
  primaryContainer: '#22c55e', // --kl-primary-container
  primaryRGB: '0,110,47',      // --kl-primary-rgb
  secondary: '#0058be',        // --kl-secondary
  secondaryContainer: '#2170e4', // --kl-secondary-container
  tertiary: '#f97316',         // --kl-tertiary

  bg: '#f8f9fb',               // --kl-surface（页面底色）
  card: '#ffffff',             // --kl-surface-container-lowest（卡片）
  surfaceLow: '#f2f4f6',       // --kl-surface-container-low
  surfaceHigh: '#e8ecf1',      // --kl-surface-container-high

  text: '#0f172a',             // --kl-on-surface
  sub: 'rgba(15,23,42,0.6)',   // --kl-on-surface-variant
  line: 'rgba(15,23,42,0.12)', // --kl-outline-variant
  borderSoft: 'rgba(226,232,240,0.95)',

  // ---- 原版计分队伍色（qs-card--players）----
  teamA: '#0069d3',            // --qs-score-team-a 蓝
  teamB: '#d40000',            // --qs-score-team-b 红

  // ---- 兼容旧页面引用 ----
  accent: '#22c55e',           // 发球点亮绿
  blue: '#0069d3',             // 兼容：原 B 方蓝 → 现在 B 方红由 teamB 接管
  green: '#22c55e',
  softGreen: 'rgba(34,197,94,0.10)',
  softBlue: 'rgba(0,105,211,0.08)',
  softRed: 'rgba(212,0,0,0.06)',
} as const;

/** --kl-gradient-signature: linear-gradient(45deg, #006e2f, #22c55e) */
export const GRADIENT = { from: '#006e2f', to: '#22c55e' } as const;
/** 渐变色数组，供 expo-linear-gradient 使用（45°） */
export const GRADIENT_COLORS = ['#22c55e', '#006e2f'] as const;
export const GRADIENT_START = { x: 0, y: 1 } as const;
export const GRADIENT_END = { x: 1, y: 0 } as const;

/**
 * 圆角：原版 rpx ÷ 2 换算为 dp
 * --kl-radius-sm:12rpx→6, md:24rpx→12, lg:32rpx→16, full:9999
 */
export const R = { sm: 6, md: 12, lg: 16, full: 9999 } as const;

/**
 * 间距：原版 rpx ÷ 2 换算为 dp
 * xs:8, sm:16, md:24, lg:32, xl:48
 */
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/**
 * 字号：原版 rpx ÷ 2 换算为 dp
 * headline-lg:72/88→36, title-md:32→16, title-sm:28→14, body-md:28→14, body-sm:24→12
 */
export const FS = {
  displayLg: 56,
  headlineLg: 36,
  titleMd: 16,
  titleSm: 14,
  bodyMd: 14,
  bodySm: 12,
  label: 9,
} as const;

/** 计分数字专用字体 --score-font-display */
export const SCORE_FONT = 'DIN Alternate';

/** --kl-shadow-ambient: 0 20px 40px rgba(15,23,42,.06) */
export const shadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
} as const;

export const shadowStrong = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.09,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 6,
} as const;
