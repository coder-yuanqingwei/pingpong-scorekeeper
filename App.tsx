import 'react-native-gesture-handler';
import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootTabParamList, RootStackParamList } from './src/navigation.types';
import ScoreScreen from './src/screens/ScoreScreen';
import FormatScreen from './src/screens/FormatScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import MatchScreen from './src/screens/MatchScreen';
import ScoreThemeScreen from './src/screens/ScoreThemeScreen';
import { C } from './src/theme';
import { I18nProvider, useI18n, t } from './src/i18n';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// 原小程序四个 tab：首页 / 比赛活动 / 球员 / 我的
const ICONS: Record<string, string> = {
  首页: '⌂',
  比赛活动: '◉',
  球员: '♙',
  我的: '◍',
};

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: C.bg,
    text: C.text,
    border: C.line,
    primary: C.primary,
  },
  fonts: {
    ...DefaultTheme.fonts,
    regular: { fontFamily: 'PingFang SC', fontWeight: '400' as const },
    medium: { fontFamily: 'PingFang SC', fontWeight: '500' as const },
    bold: { fontFamily: 'PingFang SC', fontWeight: '700' as const },
    heavy: { fontFamily: 'PingFang SC', fontWeight: '800' as const },
  },
};

function MainTabs() {
  useI18n();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <View style={styles.iconWrap}>
            <Text style={[styles.icon, focused && styles.iconActive]}>{ICONS[route.name]}</Text>
          </View>
        ),
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: styles.tabLabel,
        tabBarLabel: t(route.name),   // 路由 name 保持中文不变，仅显示文案跟随语言
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      })}
    >
      <Tab.Screen name="首页" component={ScoreScreen} />
      <Tab.Screen name="比赛活动" component={FormatScreen} />
      <Tab.Screen name="球员" component={HistoryScreen} />
      <Tab.Screen name="我的" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={MainTabs} />
          <Stack.Screen
            name="Match"
            component={MatchScreen}
            options={{ animation: 'slide_from_right', gestureEnabled: false }}
          />
          <Stack.Screen
            name="ScoreTheme"
            component={ScoreThemeScreen}
            options={{ animation: 'slide_from_right' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 30, height: 24, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22, color: '#94a3b8' },
  iconActive: { color: C.primary },
  tabLabel: { fontSize: 10, marginTop: 2, fontFamily: 'PingFang SC' },
  tabItem: { paddingVertical: 4 },
  tabBar: {
    height: 52,
    backgroundColor: '#f8f9fb',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.14)',
    elevation: 0,
  },
});
