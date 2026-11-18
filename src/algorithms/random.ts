// 确定性随机源：mulberry32 PRNG + FNV-1a 派生子种子
// 原 App 用同样的思路保证「同种子 + 同配置 => 可复现赛程」

export type SeedInput = number | string;

/** 可调用的随机数生成器接口（兼容函数式 next() 与直接调用的写法） */
export interface Rng {
  (): number;
  next: () => number;
  int: (n: number) => number;
  range: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  shuffle: <T>(arr: readonly T[]) => T[];
}

export function fnv1a(str: SeedInput): number {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: SeedInput = 1831565813): Rng {
  const next = mulberry32(typeof seed === 'number' ? seed >>> 0 : fnv1a(seed));
  const rng = (() => next()) as Rng;
  rng.next = next;
  rng.int = (n: number) => Math.floor(next() * n);
  rng.range = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  rng.pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T;
  rng.shuffle = <T>(arr: readonly T[]): T[] => {
    const a = arr.slice() as T[];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  };
  return rng;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
