import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, GRADIENT_COLORS, GRADIENT_START, GRADIENT_END, R, shadow } from '../theme';

interface HeroProps {
  kicker: string;
  title: string;
  lead?: string;
  left?: React.ReactNode;
}

/**
 * 原版签名渐变英雄卡（home-kinetic / --kl-gradient-signature）
 * linear-gradient(45deg, #006e2f, #22c55e)，圆角 --kl-radius-lg(16dp)，
 * 外侧柔和阴影 --kl-shadow-ambient。
 */
export default function Hero({ kicker, title, lead, left }: HeroProps) {
  return (
    <LinearGradient
      colors={[...GRADIENT_COLORS]}
      start={GRADIENT_START}
      end={GRADIENT_END}
      style={styles.hero}
    >
      <View style={styles.accent} pointerEvents="none" />
      {left}
      <View style={[styles.textWrap, left ? styles.textWrapWithLeft : null]}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.title}>{title}</Text>
        {lead ? <Text style={styles.lead}>{lead}</Text> : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: R.lg,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    minHeight: 118,
    ...shadow,
  },
  accent: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.10)',
    top: -64,
    right: -40,
  },
  textWrap: {},
  textWrapWithLeft: { marginLeft: 2 },
  kicker: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 9,
    letterSpacing: 2.2,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
    fontFamily: 'PingFang SC',
  },
  lead: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    marginTop: 4,
  },
  // 供个人中心头像复用
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 30 },
});

export { styles as heroStyles };
