import { doubleOptions, singleOptions } from './kana';

/** ある位置から始まる入力候補。len はその候補で進むかなの文字数。 */
export interface RomajiOption {
  romaji: string;
  len: number;
}

const N_FOLLOW_BLOCK = 'aiueoyn';

/** reading（ひらがな）の pos 位置で受け付けるローマ字の候補を返す。先頭ほど優先表示。 */
export function optionsAt(reading: string, pos: number): RomajiOption[] {
  if (pos >= reading.length) return [];
  const ch = reading[pos];
  const out: RomajiOption[] = [];

  if (ch === 'ん') {
    const nextFirsts = firstCharsAt(reading, pos + 1);
    const singleOk = pos + 1 < reading.length && [...nextFirsts].every((c) => !N_FOLLOW_BLOCK.includes(c));
    if (singleOk) out.push({ romaji: 'n', len: 1 });
    out.push({ romaji: 'nn', len: 1 }, { romaji: 'xn', len: 1 });
    return out;
  }

  if (ch === 'っ') {
    // 次の音の子音を重ねる（例: った → tta）。n と母音は重ねられない。
    for (const o of optionsAt(reading, pos + 1)) {
      const c = o.romaji[0];
      if (c && !'aiueon-,.!?/'.includes(c)) {
        out.push({ romaji: c + o.romaji, len: 1 + o.len });
      }
    }
    for (const r of singleOptions('っ') ?? []) out.push({ romaji: r, len: 1 });
    return dedupe(out);
  }

  const pair = reading.slice(pos, pos + 2);
  if (pair.length === 2) {
    for (const r of doubleOptions(pair) ?? []) out.push({ romaji: r, len: 2 });
  }
  for (const r of singleOptions(ch) ?? []) out.push({ romaji: r, len: 1 });
  return dedupe(out);
}

function firstCharsAt(reading: string, pos: number): Set<string> {
  const s = new Set<string>();
  if (pos >= reading.length) return s;
  if (reading[pos] === 'ん') {
    s.add('n');
    s.add('x');
    return s;
  }
  for (const o of optionsAt(reading, pos)) s.add(o.romaji[0]);
  return s;
}

/** この語の最初の1打鍵として受け付ける文字の集合 */
export function firstKeys(reading: string): Set<string> {
  return firstCharsAt(reading, 0);
}

function dedupe(list: RomajiOption[]): RomajiOption[] {
  const seen = new Set<string>();
  return list.filter((o) => {
    const k = `${o.romaji}:${o.len}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 先頭から最後までのおすすめ綴り */
export function defaultRomaji(reading: string, from = 0): string {
  let pos = from;
  let out = '';
  while (pos < reading.length) {
    const opts = optionsAt(reading, pos);
    if (opts.length === 0) throw new Error(`未対応のかな: ${reading[pos]} in ${reading}`);
    // 1文字の「n」は次の音と紛らわしいため、ガイドでは「nn」を優先しない限り n を使う
    const best = opts[0];
    out += best.romaji;
    pos += best.len;
  }
  return out;
}

export type KeyResult = 'ok' | 'miss' | 'complete';

/**
 * 1語分のローマ字入力判定。誤入力では一切進まない。
 * 「ん」を n 1打で確定する場合は、次のキーが来た時点で確定する。
 */
export class RomajiMatcher {
  readonly reading: string;
  private pos = 0;
  private buf = '';
  private typedKeys = '';

  constructor(reading: string) {
    this.reading = reading;
  }

  get done(): boolean {
    return this.pos >= this.reading.length;
  }

  /** 確定済みのかな文字数 */
  get kanaPos(): number {
    return this.pos;
  }

  /** 正しく打った打鍵（このまま表示できる） */
  get typed(): string {
    return this.typedKeys;
  }

  /** 残りのおすすめ綴り（入力途中の綴りに合わせて変わる） */
  get remaining(): string {
    if (this.done) return '';
    const opts = optionsAt(this.reading, this.pos);
    const cur = opts.find((o) => o.romaji.startsWith(this.buf) && o.romaji.length > this.buf.length)
      ?? opts.find((o) => o.romaji.startsWith(this.buf))
      ?? opts[0];
    if (cur.romaji === this.buf) {
      // 「ん」を n まで打った保留状態
      return defaultRomaji(this.reading, this.pos + cur.len);
    }
    return cur.romaji.slice(this.buf.length) + defaultRomaji(this.reading, this.pos + cur.len);
  }

  /** 状態を変えずに、このキーが正解になるか調べる */
  wouldAccept(key: string): boolean {
    const probe = new RomajiMatcher(this.reading);
    probe.pos = this.pos;
    probe.buf = this.buf;
    probe.typedKeys = this.typedKeys;
    return probe.input(key) !== 'miss';
  }

  input(rawKey: string): KeyResult {
    if (this.done) return 'miss';
    const key = rawKey.toLowerCase();
    if (key.length !== 1) return 'miss';

    if (this.tryAt(key)) return this.done ? 'complete' : 'ok';

    // 「ん」を n 1打で確定してから次の音として受け付ける
    if (this.buf === 'n' && this.reading[this.pos] === 'ん' && !N_FOLLOW_BLOCK.includes(key)) {
      const savedPos = this.pos;
      const savedBuf = this.buf;
      this.pos += 1;
      this.buf = '';
      if (this.tryAt(key)) return this.done ? 'complete' : 'ok';
      this.pos = savedPos;
      this.buf = savedBuf;
    }
    return 'miss';
  }

  private tryAt(key: string): boolean {
    const next = this.buf + key;
    const cands = optionsAt(this.reading, this.pos).filter((o) => o.romaji.startsWith(next));
    if (cands.length === 0) return false;
    this.buf = next;
    this.typedKeys += key;
    const exact = cands.find((o) => o.romaji === next);
    const longer = cands.some((o) => o.romaji.length > next.length);
    if (exact && !longer) {
      this.pos += exact.len;
      this.buf = '';
    }
    return true;
  }
}
