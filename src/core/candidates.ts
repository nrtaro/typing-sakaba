import { RomajiMatcher } from './romaji';

export interface Target<T> {
  id: string;
  kana: string;
  data: T;
}

export interface Live<T> {
  target: Target<T>;
  matcher: RomajiMatcher;
}

export type CandidateKey<T> =
  | { kind: 'miss' }
  | { kind: 'ok'; done: Target<T>[] };

/**
 * 入力欄を持たない入力処理。画面上のすべての候補に同時に文字を当て、
 * 打つほど候補が絞り込まれる。打ち切った候補が出たら呼び出し側に返して最初に戻る。
 */
export class CandidateInput<T> {
  private live: Live<T>[] | null = null;
  private typedKeys = '';

  constructor(private readonly source: () => Target<T>[]) {}

  /** 打った途中のローマ字（絞り込み中だけ空でない） */
  get typed(): string {
    return this.typedKeys;
  }

  /** 絞り込み中の候補（何も打っていなければ空） */
  get active(): Live<T>[] {
    return this.live ?? [];
  }

  matcherFor(id: string): RomajiMatcher | null {
    return this.live?.find((l) => l.target.id === id)?.matcher ?? null;
  }

  key(ch: string): CandidateKey<T> {
    const k = ch.toLowerCase();
    const pool = this.live ?? this.source().map((t) => ({ target: t, matcher: new RomajiMatcher(t.kana) }));
    const ok = pool.filter((l) => l.matcher.wouldAccept(k));
    if (ok.length === 0) return { kind: 'miss' };
    for (const l of ok) l.matcher.input(k);
    this.live = ok;
    this.typedKeys += k;
    const done = ok.filter((l) => l.matcher.done).map((l) => l.target);
    if (done.length) this.reset();
    return { kind: 'ok', done };
  }

  /** 1文字戻す（残りの文字を最初から当て直す） */
  backspace() {
    const keep = this.typedKeys.slice(0, -1);
    this.reset();
    for (const c of keep) this.key(c);
  }

  reset() {
    this.live = null;
    this.typedKeys = '';
  }

  /** 画面から消えた候補を外す。全部消えたら最初に戻る */
  prune(validIds: Set<string>) {
    if (!this.live) return;
    this.live = this.live.filter((l) => validIds.has(l.target.id));
    if (this.live.length === 0) this.reset();
  }
}
