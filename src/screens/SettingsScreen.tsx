import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, shadow, R } from '../theme';
import Hero, { heroStyles } from '../components/Hero';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../storage';
import type { Settings } from '../storage';
import { t, useI18n } from '../i18n';
import type { Lang } from '../i18n';

type SettingKey = keyof Settings;

export default function SettingsScreen() {
  const { lang, setLang } = useI18n();   // 订阅界面语言变化 + 切换
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useFocusEffect(useCallback(() => { loadSettings().then(setS); }, []));

  const set = (k: SettingKey, v: string | number | boolean) => setS((prev) => ({ ...prev, [k]: v }) as Settings);

  return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* 个人中心头部（原版 mine 页 kl-dash） */}
        <Hero
          kicker="PROFILE"
          title={t("乒乓计分器")}
          lead={t("计分、活动、比赛")}
          left={<View style={heroStyles.avatar}><Text style={heroStyles.avatarText}>🏓</Text></View>}
        />

        {/* 数据面板 kl-dash */}
        <View style={styles.dash}>
          <View style={styles.dashItem}><Text style={styles.dashNum}>11</Text><Text style={styles.dashLabel}>{t("分制")}</Text></View>
          <View style={styles.dashDivider} />
          <View style={styles.dashItem}><Text style={styles.dashNum}>{s.gamesToWin}</Text><Text style={styles.dashLabel}>{t("胜局")}</Text></View>
          <View style={styles.dashDivider} />
          <View style={styles.dashItem}><Text style={styles.dashNum}>{s.serveInterval}</Text><Text style={styles.dashLabel}>{t("换发")}</Text></View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>{t("默认选手")}</Text>
        <Text style={styles.label}>{t("选手 A")}</Text>
        <TextInput style={styles.input} value={s.playerA} onChangeText={(v) => set('playerA', v)} onBlur={() => saveSettings(s)} />
        <Text style={styles.label}>{t("选手 B")}</Text>
        <TextInput style={styles.input} value={s.playerB} onChangeText={(v) => set('playerB', v)} onBlur={() => saveSettings(s)} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>{t("计分规则")}</Text>
        <Row label={t("每局分数")} value={String(s.pointsToWin)} onChange={(v) => set('pointsToWin', Math.max(1, Number(v) || 11))} onEnd={() => saveSettings(s)} />
        <Row label={t("胜局数")} value={String(s.gamesToWin)} onChange={(v) => set('gamesToWin', Math.max(1, Number(v) || 2))} onEnd={() => saveSettings(s)} />
        <Row label={t("发球交换间隔")} value={String(s.serveInterval)} onChange={(v) => set('serveInterval', Math.max(1, Number(v) || 2))} onEnd={() => saveSettings(s)} />
        <TouchableOpacity style={styles.toggleRow} onPress={() => {
          const next = { ...s, winByTwo: !s.winByTwo };
          setS(next); saveSettings(next);
        }}>
          <Text style={styles.label}>{t("净胜两分才算赢")}</Text>
          <View style={[styles.toggle, s.winByTwo && styles.toggleOn]}>
            <Text style={[styles.toggleText, s.winByTwo && styles.toggleTextOn]}>{s.winByTwo ? t('开') : t('关')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* 界面语言：独立于计分播报语言，仅切换屏幕文字 */}
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>{t('界面语言')}</Text>
        <View style={styles.langRow}>
          {(['zh', 'en'] as Lang[]).map((l) => (
            <TouchableOpacity
              key={l}
              style={[styles.langBtn, lang === l && styles.langBtnOn]}
              onPress={() => setLang(l)}
            >
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextOn]}>
                {l === 'zh' ? '中文' : 'English'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>{t("关于")}</Text>
        <Text style={styles.about}>{t("本 App 依据对微信小程序「乒乓计分器」的静态逆向分析复刻，赛制算法在本地实现，不依赖后端服务。")}</Text>
        <Text style={styles.about}>{t("已实现：贝格尔循环赛、种子淘汰赛、多目标轮转优化、小组循环+交叉淘汰、资格赛、擂台赛、团体赛、五羽轮比、确定性随机种子与让分参考。")}</Text>
        <Text style={styles.aboutSmall}>{t("版本 1.0.0 · 数据全部保存在本机")}</Text>
      </View>

      <TouchableOpacity style={styles.resetBtn} onPress={() => {
        Alert.alert(t('恢复默认'), t('将所有设置恢复为默认值？'), [
          { text: t('取消'), style: 'cancel' },
          { text: t('确定'), style: 'destructive', onPress: () => { saveSettings(DEFAULT_SETTINGS); setS(DEFAULT_SETTINGS); } },
        ]);
      }}><Text style={styles.resetText}>{t("恢复默认设置")}</Text></TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value, onChange, onEnd }: {
  label: string; value: string; onChange: (v: string) => void; onEnd: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.inputSmall} keyboardType="numeric" value={value} onChangeText={onChange} onBlur={onEnd} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  // kl-dash 数据面板：白底、radius-lg、margin-top 16rpx→8dp
  dash: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.lg, paddingVertical: 16, marginBottom: 16, borderWidth: 1, borderColor: C.borderSoft, ...shadow },
  dashItem: { flex: 1, alignItems: 'center' },
  dashDivider: { width: 1, height: 30, backgroundColor: C.line },
  dashNum: { fontSize: 22, fontWeight: '800', color: C.primary },
  dashLabel: { fontSize: 11, color: C.sub, marginTop: 4 },
  h1: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 8 },
  sub: { fontSize: 12, color: C.sub, marginTop: 4, marginBottom: 16 },
  panel: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.borderSoft, ...shadow },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.sub, marginBottom: 12, letterSpacing: 2 },
  label: { fontSize: 12, color: C.sub, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14, color: C.text, marginBottom: 10 },
  inputSmall: { borderWidth: 1, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 7, width: 90, textAlign: 'center', color: C.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  toggle: { backgroundColor: C.surfaceLow, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5 },
  toggleOn: { backgroundColor: C.primary },
  toggleText: { color: C.sub, fontSize: 12 },
  toggleTextOn: { color: '#fff' },
  langRow: { flexDirection: 'row', gap: 10 },
  langBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surfaceLow },
  langBtnOn: { borderColor: C.primary, backgroundColor: C.primary },
  langBtnText: { fontSize: 14, color: C.sub, fontWeight: '600' },
  langBtnTextOn: { color: '#fff' },
  about: { fontSize: 12, color: C.sub, lineHeight: 20, marginBottom: 10 },
  aboutSmall: { fontSize: 11, color: C.sub, marginTop: 6 },
  resetBtn: { alignItems: 'center', paddingVertical: 14 },
  resetText: { fontSize: 13, color: C.primary },
});
