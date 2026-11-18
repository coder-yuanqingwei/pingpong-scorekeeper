/**
 * 计分主题系统：1:1 复刻自微信小程序「乒乓计分器」
 *
 * 数据来源（2026-11-18 逆向核实）：
 *  - 真机联网后由后端下发：GET https://kaiwa.com.cn/api/score-themes?appId=wxe9561930baee3829
 *    （services/scoreThemeService.listScoreThemes → scoreThemeStore → getPresetThemeDefs）
 *    共 22 个主题，全部免费（isVipOnly:false），含历届奥运会系列 + 纯配色系列 + WTT。
 *  - 本地 utils/score_ui_theme.js 的 SCORE2_THEMES（10 个「青绿×琥珀」等）只是**离线兜底**，
 *    联网后被后端数据覆盖：code 相同但 name/配色完全不同（如 teal_ember 后端叫「2024巴黎奥运会」）。
 *  - 派生：gradHome/gradAway = linear-gradient(to bottom, color, shade(color,0.72))  [原型 O()]
 *          tipHome/tipAway = shade(color,0.55)                                     [原型 T()]
 *          calloutText = 亮度(accent)>0.55 ? tip : #ffffff（accent 默认 #fff → 用 tip）
 *  - 组合顺序 [原型 A()]：后端预设（按 sortOrder）+ 用户自定义主题（vipOnly:false）
 *  - 主题 id 持久化在 ymq_score2_ui_v1.themeId
 */

export interface ScoreTheme {
  id: string;
  name: string;
  home: string;        // bandHome：蓝方主色
  away: string;        // bandAway：红方主色
  pageBackgroundHex: string;
  accentHex: string;
  vipOnly: boolean;
  locked?: boolean;    // 主题管理页展示用：非 VIP 用户看到锁标
}

export interface DerivedTheme extends ScoreTheme {
  gradHome: [string, string];   // LinearGradient 颜色数组（对应 CSS linear-gradient）
  gradAway: [string, string];
  tipHome: string;              // callout tint / 派生提示色
  tipAway: string;
  calloutTextHome: string;
  calloutTextAway: string;
}

/**
 * 后端 /score-themes 真实下发的 22 个主题（按 sortOrder 排列）。
 * 元组：[code, name, homeColorHex, awayColorHex, isVipOnly]
 * 生产环境 isVipOnly 全部 false（免费）；历届奥运会系列在本地离线兜底里被写成了纯配色名，
 * 联网后以后端为准。所有主题 pageBackgroundHex=#000000、accentColorHex=#ffffff。
 */
const BUILTIN: Array<[string, string, string, string, boolean]> = [
  ['classic', '经典蓝红', '#0069d3', '#d40000', false],
  ['teal_ember', '2024巴黎奥运会', '#14365c', '#1bc0c4', false],
  ['indigo_rose', '2020东京奥运会', '#811628', '#d24555', false],
  ['slate_amber', '2016里约奥运会', '#34a2e9', '#78cc5e', false],
  ['mint_coral', '2012伦敦奥运会', '#2774bb', '#8b1a1a', false],
  ['ocean_sunset', '2008北京奥运会', '#193570', '#c01e22', false],
  ['royal_gold', '2004雅典奥运会', '#183266', '#bc2222', false],
  ['midnight_cyan', '2000悉尼奥运会', '#1a3468', '#c42021', false],
  ['dusk_lavender', '1996亚特兰大奥运会', '#855450', '#2a4732', false],
  ['chrome_rose', '1992巴塞罗那奥运会', '#1a5daa', '#84564f', false],
  ['hancheng', '1988汉城奥运会', '#07604b', '#d8bc39', false],
  ['hj_lj', '皇家 × 流金', '#3b82f6', '#fcd34d', false],
  ['dz_mh', '靛紫 × 玫红', '#6366f1', '#f43f5e', false],
  ['yh_nj', '岩灰 × 暖金', '#64748b', '#fbbf24', false],
  ['bh_sh', '薄荷 × 珊瑚', '#4ade80', '#fb7185', false],
  ['sh_wx', '深海 × 晚霞', '#0ea5e9', '#f97316', false],
  ['ql_hp', '青绿 × 琥珀', '#14b8a6', '#fb923c', false],
  ['wy_qd', '午夜 × 青电', '#1e293b', '#22d3ee', false],
  ['mz_dx', '暮紫 × 丁香', '#a78bfa', '#f0abfc', false],
  ['ly_my', '铬银 × 玫影', '#94a3b8', '#fda4af', false],
  ['wtt', 'WTT冠军赛', '#c332ff', '#c332ff', false],
  ['wtt_zjs', 'WTT联盟总决赛', '#e94d2d', '#e94d2d', false],
];

/** 规范化 hex：原型 u() */
export function normalizeHex(value: unknown, fallback: string): string {
  let t = String(value ?? '').trim();
  if (!t) return fallback;
  if (t[0] !== '#') t = '#' + t;
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    return ('#' + t[1] + t[1] + t[2] + t[2] + t[3] + t[3]).toLowerCase();
  }
  return fallback;
}

/** 按系数调暗颜色：原型 f(color, factor) */
export function shade(hex: string, factor: number): string {
  const t = normalizeHex(hex, '#000000').slice(1);
  const parts = [0, 2, 4].map((i) => {
    const v = Math.max(0, Math.min(255, Math.round(parseInt(t.slice(i, i + 2), 16) * factor)));
    return v.toString(16).padStart(2, '0');
  });
  return '#' + parts.join('');
}

/** 相对亮度：原型 d(color)，WCAG sRGB 线性化 */
export function luminance(hex: string): number {
  const t = normalizeHex(hex, '#000000').slice(1);
  const channels = [0, 2, 4]
    .map((i) => parseInt(t.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** 由主题定义派生全部显示属性：原型 p() */
export function deriveTheme(def: ScoreTheme): DerivedTheme {
  const accent = normalizeHex(def.accentHex, '#ffffff');
  const tipHome = shade(def.home, 0.55);
  const tipAway = shade(def.away, 0.55);
  const brightAccent = luminance(accent) > 0.55;
  return {
    ...def,
    pageBackgroundHex: normalizeHex(def.pageBackgroundHex, '#000000'),
    accentHex: accent,
    gradHome: [def.home, shade(def.home, 0.72)],
    gradAway: [def.away, shade(def.away, 0.72)],
    tipHome,
    tipAway,
    calloutTextHome: brightAccent ? tipHome : '#ffffff',
    calloutTextAway: brightAccent ? tipAway : '#ffffff',
  };
}

/** 后端预设派生：vipOnly 直接取后端 isVipOnly（生产环境全部 false） */
export const THEMES: DerivedTheme[] = BUILTIN.map(([id, name, home, away, vipOnly]) =>
  deriveTheme({
    id, name, home, away,
    pageBackgroundHex: '#000000', accentHex: '#ffffff', vipOnly,
  }),
);

/** 当前用户是否 VIP：本地复刻无会员系统，按"全部解锁"处理（视觉上仍显示 VIP 标） */
export const IS_VIP = true;

/** 主题管理页列表：内置主题全部可见（VIP 标仅作视觉还原），外加自定义主题 */
export function buildThemeList(customThemes: ScoreTheme[] = []): DerivedTheme[] {
  const built = THEMES.map((t) => ({ ...t, locked: t.vipOnly && !IS_VIP }));
  return [...built, ...customThemes.map((t) => deriveTheme({ ...t, locked: true }))];
}

/** 点主题选择：原型 onSelectScoreTheme / onSelectDisplayTheme —— VIP 主题本地不做付费拦截 */
export function canSelectTheme(_theme: DerivedTheme): boolean {
  return true;
}

/** 存储 key：原型 ymq_score2_ui_v1 */
const UI_STORAGE_KEY = 'ymq_score2_ui_v1';

/** 读取当前主题 id（原型 readSharedThemeId） */
export function readThemeId(storage: { getItem(k: string): string | null }): string {
  try {
    const raw = storage.getItem(UI_STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      const id = String(obj?.themeId || '').trim();
      if (id) return id;
    }
  } catch { /* ignore */ }
  return 'classic';
}

/** 写入当前主题 id（原型 writeSharedThemeId） */
export function writeThemeId(
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void },
  id: string,
): string {
  const clean = String(id || '').trim();
  if (!clean) return readThemeId(storage);
  let obj: Record<string, unknown> = {};
  try {
    const raw = storage.getItem(UI_STORAGE_KEY);
    if (raw) obj = JSON.parse(raw);
  } catch { /* ignore */ }
  storage.setItem(UI_STORAGE_KEY, JSON.stringify({ ...obj, themeId: clean }));
  return clean;
}

/** 解析主题：找不到时回退到 classic（原型 resolveTheme） */
export function resolveTheme(id: string, list: DerivedTheme[] = THEMES): DerivedTheme {
  return list.find((t) => t.id === id)
    || list.find((t) => !t.vipOnly)
    || list.find((t) => t.id === 'classic')
    || list[0];
}
