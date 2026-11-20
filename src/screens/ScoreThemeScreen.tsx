/**
 * 计分器主题管理页：1:1 复刻原小程序 pages/score/score_theme/score_theme
 * 原型结构（page-frame / chunk_4.webview.js + wxss）：
 *  - 顶部 sticky 预览卡：蓝方/红方渐变 + 中间 gutter + 大比分 + 小分 + 提示角标
 *  - 两 tab：系统主题（数量）/ 自定义（数量），默认系统
 *  - 主题网格 2 列：两个渐变色块 + 名称 + 选中勾 + VIP 锁标；末尾「+ 创建自定义」
 *  - 自定义编辑面板：主色/客色/强调色/背景色 颜色行（hex 输入 + 色点）+ 保存按钮
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation.types';
import {
  THEMES, DerivedTheme, deriveTheme, normalizeHex,
  readThemeId, writeThemeId,
} from '../scoreThemes';
import { t, useI18n } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ScoreTheme'>;
const CUSTOM_KEY = 'ymq_custom_themes_v1';
const UI_KEY = 'ymq_score2_ui_v1';

interface CustomTheme extends DerivedTheme {}

/** 顶部实时预览卡（原型 preview-card / preview-side / preview-gutter / preview-tip） */
function PreviewCard({ theme }: { theme: DerivedTheme }) {
  return (
    <View style={st.previewCard}>
      <LinearGradient colors={theme.gradHome} style={st.previewSide}>
        <View style={st.previewTotal}><Text style={st.previewTotalNum}>2</Text></View>
        <View style={st.previewMain}>
          <Text style={st.previewMainNum}>11</Text>
          <View style={[st.previewTip, { backgroundColor: theme.tipHome }]}>
            <Text style={[st.previewTipText, { color: theme.calloutTextHome }]}>{t("局点")}</Text>
          </View>
        </View>
      </LinearGradient>
      <View style={st.previewGutter} />
      <LinearGradient colors={theme.gradAway} style={st.previewSide}>
        <View style={st.previewTotal}><Text style={st.previewTotalNum}>1</Text></View>
        <View style={st.previewMain}>
          <Text style={st.previewMainNum}>8</Text>
          <View style={[st.previewTip, { backgroundColor: theme.tipAway }]}>
            <Text style={[st.previewTipText, { color: theme.calloutTextAway }]}>{t("胜")}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

export default function ScoreThemeScreen() {
  useI18n();   // 订阅界面语言变化
  const nav = useNavigation<Nav>();
  const [tab, setTab] = useState<'system' | 'custom'>('system');
  const [themeId, setThemeId] = useState('classic');
  const [custom, setCustom] = useState<CustomTheme[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: t('我的主题'), home: '#0069d3', away: '#d40000', accent: '#ffffff', pageBg: '#000000' });

  // 加载持久化主题与自定义列表
  useEffect(() => {
    (async () => {
      try {
        const [uiRaw, customRaw] = await Promise.all([
          AsyncStorage.getItem(UI_KEY),
          AsyncStorage.getItem(CUSTOM_KEY),
        ]);
        let id = 'classic';
        try { if (uiRaw) id = String(JSON.parse(uiRaw)?.themeId || 'classic'); } catch { /* ignore */ }
        setThemeId(id);
        let list: CustomTheme[] = [];
        try {
          const arr = customRaw ? JSON.parse(customRaw) : [];
          list = Array.isArray(arr) ? arr.map((x: CustomTheme) => deriveTheme(x)) : [];
        } catch { /* ignore */ }
        setCustom(list);
      } catch { /* ignore */ }
    })();
  }, []);

  const allThemes = [...THEMES, ...custom];
  const current = allThemes.find((x) => x.id === themeId) || THEMES[0];

  const select = (id: string) => {
    setThemeId(id);
    (async () => {
      const raw = await AsyncStorage.getItem(UI_KEY);
      let obj: Record<string, unknown> = {};
      try { if (raw) obj = JSON.parse(raw); } catch { /* ignore */ }
      await AsyncStorage.setItem(UI_KEY, JSON.stringify({ ...obj, themeId: id }));
    })();
  };

  const saveCustom = async () => {
    const id = 'custom_' + Date.now();
    const def = deriveTheme({
      id,
      name: form.name.trim() || t('自定义主题'),
      home: normalizeHex(form.home, '#0069d3'),
      away: normalizeHex(form.away, '#d40000'),
      accentHex: normalizeHex(form.accent, '#ffffff'),
      pageBackgroundHex: normalizeHex(form.pageBg, '#000000'),
      vipOnly: false,
      locked: false,
    });
    const next = [...custom, def];
    setCustom(next);
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    select(id);
    setEditing(false);
    setTab('custom');
    Alert.alert(t('已保存'), t('自定义主题已创建并应用'));
  };

  const deleteCustom = (id: string) => {
    Alert.alert(t('删除主题'), t('确定删除这个自定义主题？'), [
      { text: t('取消'), style: 'cancel' },
      {
        text: t('删除'), style: 'destructive', onPress: async () => {
          const next = custom.filter((x) => x.id !== id);
          setCustom(next);
          await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
          if (themeId === id) select('classic');
        },
      },
    ]);
  };

  const editColorRows: Array<{ key: keyof typeof form; label: string }> = [
    { key: 'home', label: t('蓝方主色') },
    { key: 'away', label: t('红方主色') },
    { key: 'accent', label: t('强调色（提示文字）') },
    { key: 'pageBg', label: t('背景色') },
  ];

  return (
    <View style={st.page}>
      {/* 顶部标题栏（原型 navigationStyle:default，深色） */}
      <View style={st.navBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={st.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={st.navTitle}>{t("计分器主题")}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={st.body}>
        {/* sticky 实时预览 */}
        <View style={st.previewSticky}>
          <PreviewCard theme={current} />
        </View>

        {/* 两 tab：系统 / 自定义 */}
        <View style={st.tabs}>
          <TouchableOpacity
            style={[st.tab, tab === 'system' && st.tabActive]}
            onPress={() => setTab('system')}
          >
            <Text style={[st.tabText, tab === 'system' && st.tabTextActive]}>{t("系统主题")}</Text>
            <Text style={[st.tabCount, tab === 'system' && st.tabTextActive]}>{THEMES.length}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.tab, tab === 'custom' && st.tabActive]}
            onPress={() => setTab('custom')}
          >
            <Text style={[st.tabText, tab === 'custom' && st.tabTextActive]}>{t("自定义")}</Text>
            <Text style={[st.tabCount, tab === 'custom' && st.tabTextActive]}>{custom.length}</Text>
          </TouchableOpacity>
        </View>

        {tab === 'system' ? (
          <>
            <Text style={st.sectionTitle}>{t("内置主题")}</Text>
            <View style={st.grid}>
              {THEMES.map((theme) => (
                <ThemeRow
                  key={theme.id}
                  theme={theme}
                  active={theme.id === themeId}
                  onPress={() => select(theme.id)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={st.sectionTitle}>{t("我的自定义主题")}</Text>
            <View style={st.grid}>
              {custom.map((theme) => (
                <ThemeRow
                  key={theme.id}
                  theme={theme}
                  active={theme.id === themeId}
                  onPress={() => select(theme.id)}
                  onDelete={() => deleteCustom(theme.id)}
                />
              ))}
              {/* 创建卡片 */}
              <TouchableOpacity style={[st.themeRow, st.createCard]} onPress={() => setEditing(true)}>
                <Text style={st.createPlus}>+</Text>
                <Text style={st.createText}>{t("创建自定义主题")}</Text>
              </TouchableOpacity>
            </View>

            {editing && (
              <View style={st.customPanel}>
                <View style={st.customHead}>
                  <Text style={st.customTitle}>{t("新建自定义主题")}</Text>
                  <Text style={st.customHint}>{t("设置主色后自动派生渐变与提示色")}</Text>
                </View>
                <View style={st.nameRow}>
                  <Text style={st.nameLabel}>{t("名称")}</Text>
                  <TextInput
                    style={st.nameInput}
                    value={form.name}
                    onChangeText={(v) => setForm({ ...form, name: v })}
                    placeholder={t("我的主题")}
                    placeholderTextColor="#64748b"
                  />
                </View>
                {editColorRows.map(({ key, label }) => (
                  <View key={key} style={st.colorRow}>
                    <View style={st.colorMain}>
                      <View style={[st.colorDot, { backgroundColor: normalizeHex(form[key], '#000000') }]} />
                      <View style={st.colorTexts}>
                        <Text style={st.colorLabel}>{label}</Text>
                        <TextInput
                          style={st.colorHex}
                          value={String(form[key])}
                          onChangeText={(v) => setForm({ ...form, [key]: v })}
                          placeholder="#0069d3"
                          placeholderTextColor="#64748b"
                          autoCapitalize="none"
                          maxLength={7}
                        />
                      </View>
                    </View>
                    <Text style={st.colorArrow}>›</Text>
                  </View>
                ))}
                <TouchableOpacity style={st.saveBtn} onPress={saveCustom}>
                  <Text style={st.saveBtnText}>{t("保存并应用")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditing(false)} style={st.cancelBtn}>
                  <Text style={st.cancelText}>{t("取消")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** 主题网格单项（原型 theme-row：两色块 + 名称 + 选中勾 + VIP 锁 + 删除） */
function ThemeRow({ theme, active, onPress, onDelete }: {
  theme: DerivedTheme; active: boolean; onPress: () => void; onDelete?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[st.themeRow, active && st.themeRowActive]}
      onPress={onPress}
    >
      {active && <Text style={st.themeCheck}>✓</Text>}
      {theme.vipOnly && <Text style={st.themeLock}>🔒 VIP</Text>}
      {onDelete && (
        <TouchableOpacity style={st.deleteBtn} onPress={onDelete} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={st.deleteText}>×</Text>
        </TouchableOpacity>
      )}
      <View style={st.themeSwatches}>
        <LinearGradient colors={theme.gradHome} style={st.themeSwatch} />
        <LinearGradient colors={theme.gradAway} style={st.themeSwatch} />
      </View>
      <Text numberOfLines={2} style={st.themeName}>{t(theme.name)}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a' },
  navBar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  back: { width: 30, alignItems: 'center' },
  backText: { color: '#fff', fontSize: 30, lineHeight: 34, marginTop: -2 },
  navTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  body: { paddingHorizontal: 12, paddingBottom: 40 },
  previewSticky: { backgroundColor: '#0f172a', paddingVertical: 12, zIndex: 5 },
  previewCard: { flexDirection: 'row', gap: 6, height: 140, borderRadius: 14, overflow: 'hidden' },
  previewSide: { flex: 1, justifyContent: 'center' },
  previewGutter: { width: 4, backgroundColor: '#0b1220', borderRadius: 2 },
  previewTotal: { height: '26%', alignItems: 'center', justifyContent: 'center' },
  previewTotalNum: { color: '#fff', fontSize: 18, fontWeight: '700' },
  previewMain: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewMainNum: { color: '#fff', fontSize: 44, fontWeight: '700' },
  previewTip: { position: 'absolute', right: 0, bottom: 0, borderTopLeftRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  previewTipText: { fontSize: 11, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 9, padding: 3, marginTop: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: 7 },
  tabActive: { backgroundColor: '#22c55e' },
  tabText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  tabCount: { color: '#94a3b8', fontSize: 11, marginLeft: 4 },
  tabTextActive: { color: '#fff' },
  sectionTitle: { color: '#94a3b8', fontSize: 13, marginTop: 16, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeRow: { width: '48%', height: 88, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  themeRowActive: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: '#22c55e' },
  themeSwatches: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  themeSwatch: { width: 24, height: 30, borderRadius: 5 },
  themeName: { color: '#e2e8f0', fontSize: 13, textAlign: 'center' },
  themeCheck: { color: '#22c55e', fontSize: 16, fontWeight: '700', position: 'absolute', left: 8, top: 6 },
  themeLock: { color: '#f5c451', fontSize: 10, position: 'absolute', right: 6, top: 6 },
  deleteBtn: { position: 'absolute', right: 6, top: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(248,113,113,0.16)', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  deleteText: { color: '#f87171', fontSize: 16, lineHeight: 18 },
  createCard: { borderStyle: 'dashed', gap: 4 },
  createPlus: { color: '#22c55e', fontSize: 30, fontWeight: '300' },
  createText: { color: '#cbd5e1', fontSize: 13 },
  customPanel: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, marginTop: 16 },
  customHead: { marginBottom: 8 },
  customTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  customHint: { color: '#64748b', fontSize: 12, marginTop: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  nameLabel: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  nameInput: { width: '60%', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, color: '#fff', fontSize: 14 },
  colorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  colorMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  colorTexts: { gap: 2 },
  colorLabel: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  colorHex: { color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', width: 90 },
  colorArrow: { color: '#64748b', fontSize: 22 },
  saveBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: '#94a3b8', fontSize: 13 },
});
