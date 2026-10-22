/** 固定シードで再現できる乱数（mulberry32） */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** 0以上1未満 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
}

/** シードと用途ごとの番号から、独立した乱数列を作る */
export function subRng(seed: number, ...parts: number[]): Rng {
  let h = seed >>> 0;
  for (const p of parts) {
    h = Math.imul(h ^ (p + 0x9e3779b9), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  return new Rng(h);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}
