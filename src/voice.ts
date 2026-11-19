/**
 * 真人录音语音播报（复刻原型 pages/score/assets/voices）
 *
 * 原型逻辑（app-service.js @143347 buildNumericScoreVoiceQueue）：
 *   中文：[发球方分.mp3, "bi"/"ping", 接发方分.mp3]（相同读 ping="平"，0:0 不播）
 *   英文：[发球方数字词.mp3, 相同?"all.mp3":接发方数字词.mp3]（乒乓不用 love/advantage）
 *   按发球方在前，串行播放（一个播完播下一个）。
 *
 * 本复刻按用户选择：只有比分用真人录音，其余场景（口哨/蜂鸣/暂停/换边等）全部静音。
 */
import { AudioPlayer, AudioSource, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';

// ===== 中文数字音频（0-30, 40；11 分制 cap=21 最高播到 21，充足）=====
const ZH_NUM: Record<number, AudioSource> = {
  0: require('../assets/voices/0.mp3'), 1: require('../assets/voices/1.mp3'),
  2: require('../assets/voices/2.mp3'), 3: require('../assets/voices/3.mp3'),
  4: require('../assets/voices/4.mp3'), 5: require('../assets/voices/5.mp3'),
  6: require('../assets/voices/6.mp3'), 7: require('../assets/voices/7.mp3'),
  8: require('../assets/voices/8.mp3'), 9: require('../assets/voices/9.mp3'),
  10: require('../assets/voices/10.mp3'), 11: require('../assets/voices/11.mp3'),
  12: require('../assets/voices/12.mp3'), 13: require('../assets/voices/13.mp3'),
  14: require('../assets/voices/14.mp3'), 15: require('../assets/voices/15.mp3'),
  16: require('../assets/voices/16.mp3'), 17: require('../assets/voices/17.mp3'),
  18: require('../assets/voices/18.mp3'), 19: require('../assets/voices/19.mp3'),
  20: require('../assets/voices/20.mp3'), 21: require('../assets/voices/21.mp3'),
  22: require('../assets/voices/22.mp3'), 23: require('../assets/voices/23.mp3'),
  24: require('../assets/voices/24.mp3'), 25: require('../assets/voices/25.mp3'),
  26: require('../assets/voices/26.mp3'), 27: require('../assets/voices/27.mp3'),
  28: require('../assets/voices/28.mp3'), 29: require('../assets/voices/29.mp3'),
  30: require('../assets/voices/30.mp3'), 40: require('../assets/voices/40.mp3'),
};
const ZH_BI = require('../assets/voices/bi.mp3');
const ZH_PING = require('../assets/voices/ping.mp3');

// ===== 英文数字词音频 =====
const EN_NUM: Record<number, AudioSource> = {
  0: require('../assets/voices/en/zero.mp3'), 1: require('../assets/voices/en/one.mp3'),
  2: require('../assets/voices/en/two.mp3'), 3: require('../assets/voices/en/three.mp3'),
  4: require('../assets/voices/en/four.mp3'), 5: require('../assets/voices/en/five.mp3'),
  6: require('../assets/voices/en/six.mp3'), 7: require('../assets/voices/en/seven.mp3'),
  8: require('../assets/voices/en/eight.mp3'), 9: require('../assets/voices/en/nine.mp3'),
  10: require('../assets/voices/en/ten.mp3'), 11: require('../assets/voices/en/eleven.mp3'),
  12: require('../assets/voices/en/twelve.mp3'), 13: require('../assets/voices/en/thirteen.mp3'),
  14: require('../assets/voices/en/fourteen.mp3'), 15: require('../assets/voices/en/fifteen.mp3'),
  16: require('../assets/voices/en/sixteen.mp3'), 17: require('../assets/voices/en/seventeen.mp3'),
  18: require('../assets/voices/en/eighteen.mp3'), 19: require('../assets/voices/en/nineteen.mp3'),
  20: require('../assets/voices/en/twenty.mp3'), 21: require('../assets/voices/en/twenty-one.mp3'),
  22: require('../assets/voices/en/twenty-two.mp3'), 23: require('../assets/voices/en/twenty-three.mp3'),
  24: require('../assets/voices/en/twenty-four.mp3'), 25: require('../assets/voices/en/twenty-five.mp3'),
  26: require('../assets/voices/en/twenty-six.mp3'), 27: require('../assets/voices/en/twenty-seven.mp3'),
  28: require('../assets/voices/en/twenty-eight.mp3'), 29: require('../assets/voices/en/twenty-nine.mp3'),
  30: require('../assets/voices/en/thirty.mp3'), 40: require('../assets/voices/en/forty.mp3'),
};
const EN_ALL = require('../assets/voices/en/all.mp3');

/**
 * 把单个数字转成音频 token 序列（纯逻辑，便于离线穷举测试）。
 * token 形如 'z0'..'z30'（中文真人数）、'zbi'/'zping'、'e0'..'e40'、'eall'。
 *
 * 中文：0–30 用现成真人音（11–19="十一…十九"、20/30="二十/三十"）；
 *       31+ 用 0–9 + '十'(10.mp3 单字) 组合，个位为 0 省略：41→[四,十,一]、40→[四,十]。
 *       100+ 极端自定义分数按位逐个读。
 * 英文：0–30、40 用现成真人音；31–39=thirty+个位；41–49=forty+个位；
 *       50–99=十位词+个位（无 fifty+ 音时读 个位数字+ten 兜底，如 51=five+ten+one）。
 */
function numTokens(n: number, lang: 'zh' | 'en'): string[] {
  if (lang === 'zh') {
    if (n >= 0 && n <= 30) return [`z${n}`];
    if (n <= 99) {
      const t = Math.floor(n / 10), u = n % 10;
      const r = [`z${t}`, 'z10'];          // 如 四 + 十
      if (u > 0) r.push(`z${u}`);          // 个位非零才补，40=四十 不补
      return r;
    }
    return String(n).split('').map((c) => `z${Number(c)}`); // 100+ 逐位
  }
  // 英文：现成音只有 0-30 与 40
  if ((n >= 0 && n <= 30) || n === 40) return [`e${n}`];
  if (n >= 31 && n <= 39) return ['e30', `e${n - 30}`]; // thirty-one...thirty-nine
  if (n >= 41 && n <= 49) return ['e40', `e${n - 40}`]; // forty-one...forty-nine
  if (n <= 99) {
    const t = Math.floor(n / 10), u = n % 10;
    // 31-39 无 thirtyX 现成音，用 thirty + 个位组合；40+ 见上
    const tens = t === 3 ? ['e30'] : t === 4 ? ['e40'] : [`e${t}`, 'e10']; // 50+=five+ten 兜底
    const r = [...tens];
    if (u > 0) r.push(`e${u}`);
    return r;
  }
  return String(n).split('').map((c) => `e${Number(c)}`);
}

/** 比分播报的 token 序列（纯逻辑）。serveIsA=发球方是否为主队(A)。 */
export function scoreQueueTokens(a: number, b: number, serveIsA: boolean, lang: 'zh' | 'en'): string[] {
  if (a === 0 && b === 0) return [];       // 0:0 不播
  const first = serveIsA ? a : b;          // 发球方分在前
  const second = serveIsA ? b : a;
  const equal = first === second;
  if (lang === 'en') {
    const q = numTokens(first, 'en');
    if (equal) q.push('eall'); else q.push(...numTokens(second, 'en'));
    return q;
  }
  const q = numTokens(first, 'zh');
  q.push(equal ? 'zping' : 'zbi');
  if (!equal) q.push(...numTokens(second, 'zh'));
  return q;
}

/** 构造比分播报音频队列。serveIsA=发球方是否为主队(A)。 */
export function buildScoreQueue(a: number, b: number, serveIsA: boolean, lang: 'zh' | 'en'): AudioSource[] {
  const TOKEN_TO_SRC: Record<string, AudioSource> = {
    ...Object.fromEntries(Object.entries(ZH_NUM).map(([k, v]) => [`z${k}`, v])),
    ...Object.fromEntries(Object.entries(EN_NUM).map(([k, v]) => [`e${k}`, v])),
    zbi: ZH_BI, zping: ZH_PING, eall: EN_ALL,
  };
  return scoreQueueTokens(a, b, serveIsA, lang)
    .map((t) => TOKEN_TO_SRC[t])
    .filter((s): s is AudioSource => s != null);
}

/** 串行播放一个音频队列；返回 stop 方法用于打断。 */
export function useVoiceQueue() {
  // 用一个静音占位源创建播放器（null 也可，replace 后加载真实源）
  const player: AudioPlayer = useAudioPlayer(null);
  const queueRef = useRef<AudioSource[]>([]);
  const idxRef = useRef(0);
  const playingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndedRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const playIndex = useCallback((i: number) => {
    const src = queueRef.current[i];
    if (src == null) { playingRef.current = false; return; }
    player.replace(src);
    player.play();
    // 兜底：某些环境（尤其 web）onEnded/didJustFinish 不稳定，按时长推进
    clearTimer();
    const dur = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0.5;
    timerRef.current = setTimeout(() => {
      if (playingRef.current && idxRef.current === i) onEndedRef.current();
    }, Math.max(120, dur * 1000 + 120));
  }, [player, clearTimer]);

  onEndedRef.current = () => {
    const next = idxRef.current + 1;
    if (next < queueRef.current.length) {
      idxRef.current = next;
      playIndex(next);
    } else {
      clearTimer();
      playingRef.current = false;
      queueRef.current = [];
    }
  };

  // 监听播放器结束事件（原生端 didJustFinish），优先于超时兜底
  useEffect(() => {
    const unsub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && playingRef.current) {
        clearTimer();
        onEndedRef.current();
      }
    });
    return () => { unsub.remove(); };
  }, [player, clearTimer]);

  const stop = useCallback(() => {
    clearTimer();
    playingRef.current = false;
    queueRef.current = [];
    try { player.pause(); } catch { /* ignore */ }
  }, [player, clearTimer]);

  const speakQueue = useCallback((q: AudioSource[]) => {
    stop();                        // 打断上一条残留（原型 Xe.stop()）
    if (!q.length) return;
    queueRef.current = q;
    idxRef.current = 0;
    playingRef.current = true;
    playIndex(0);
  }, [stop, playIndex]);

  useEffect(() => () => { stop(); player.remove(); }, [stop, player]);

  // 固定返回对象引用，避免消费方 useCallback 依赖变化导致反复重算
  const apiRef = useRef<{ speakQueue: typeof speakQueue; stop: typeof stop } | null>(null);
  if (!apiRef.current) apiRef.current = { speakQueue, stop };
  return apiRef.current;
}
