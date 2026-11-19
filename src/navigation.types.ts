/** React Navigation 类型声明（@react-navigation 7）—— tab 名对齐原小程序 */
import type { CompositeNavigationProp, NavigationProp, RouteProp } from '@react-navigation/native';
import type { MatchSnapshot } from './storage';

/** 一局比赛的赛前配置（首页「开始比赛」带入计分页） */
export interface MatchConfig {
  title: string;
  dateLabel: string;
  pointsToWin: number;
  gamesToWin: number;
  serveInterval: number;
  winByTwo: boolean;
  singles: boolean;
  nameA: string;
  nameB: string;
  /** 局间休息 60 秒开关（原版 scoreInterGameRestOpen，默认关） */
  interGameRest?: boolean;
  /** 自动换边开关（原版 scoreAutoCourtSwapOpen，默认开） */
  autoCourtSwap?: boolean;
  /** 自由赛制（原型 isFreeGamesSelected）：gamesToWin 为 9999 哨兵，封顶 100 局 */
  free?: boolean;
}

export type RootTabParamList = {
  首页: { preset?: { a: string; b: string; config?: MatchConfig } | null } | undefined;
  比赛活动: undefined;
  球员: undefined;
  我的: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Match: { config: MatchConfig; resume?: MatchSnapshot };
  ScoreTheme: undefined;
};

export type ScoreNavProp = CompositeNavigationProp<
  NavigationProp<RootTabParamList, '首页'>,
  NavigationProp<RootStackParamList, 'Tabs'>
>;
export type ScoreRouteProp = RouteProp<RootTabParamList, '首页'>;
export type FormatNavProp = NavigationProp<RootTabParamList, '比赛活动'>;
export type HistoryNavProp = CompositeNavigationProp<
  NavigationProp<RootTabParamList, '球员'>,
  NavigationProp<RootStackParamList, 'Tabs'>
>;
export type MatchNavProp = NavigationProp<RootStackParamList, 'Match'>;
export type MatchRouteProp = RouteProp<RootStackParamList, 'Match'>;

declare module '@react-navigation/native' {
  export interface RootParamList extends RootTabParamList {}
}
