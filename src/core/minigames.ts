import { CandidateInput, type Target } from './candidates';
import { firstKeys } from './romaji';
import { Rng } from './rng';
import { MINIGAME_SECONDS, type IngredientId, type TripId } from './shopConfig';

export interface Word {
  text: string;
  kana: string;
}

export type MinigameEvent =
  | { type: 'key'; ok: boolean; count: number }
  | { type: 'word'; id: string }
  | { type: 'gain'; ingredient: IngredientId; amount: number; x: number; y: number }
  | { type: 'loss'; ingredient: IngredientId; x: number; y: number }
  | { type: 'bite'; big: boolean }
  | { type: 'escape'; id: string };

export interface MinigameResult {
  gains: Partial<Record<IngredientId, number>>;
  correctKeys: number;
  missKeys: number;
}

/** 4つの調達ミニゲームの共通部分。時間・入力・成果・演出用のイベント */
export abstract class Minigame<T = unknown> {
  abstract readonly kind: TripId;
  readonly duration = MINIGAME_SECONDS;
  timeLeft = MINIGAME_SECONDS;
  gains: Partial<Record<IngredientId, number>> = {};
  correctKeys = 0;
  missKeys = 0;
  readonly input: CandidateInput<T>;
  protected events: MinigameEvent[] = [];

  constructor(protected readonly rng: Rng) {
    this.input = new CandidateInput(() => this.targets());
  }

  get finished() {
    return this.timeLeft <= 0;
  }

  abstract targets(): Target<T>[];
  protected abstract onWord(t: Target<T>): void;
  protected abstract onMiss(): void;
  protected abstract step(dt: number): void;

  update(dt: number) {
    if (this.finished) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.step(dt);
    this.input.prune(new Set(this.targets().map((t) => t.id)));
  }

  key(ch: string) {
    if (this.finished) return;
    const r = this.input.key(ch);
    if (r.kind === 'miss') {
      this.missKeys++;
      this.events.push({ type: 'key', ok: false, count: 0 });
      this.onMiss();
      return;
    }
    this.correctKeys++;
    this.events.push({ type: 'key', ok: true, count: this.input.typed.length || 1 });
    for (const t of r.done) {
      this.events.push({ type: 'word', id: t.id });
      this.onWord(t);
    }
  }

  protected add(id: IngredientId, n: number, x = 0, y = 0) {
    this.gains[id] = Math.max(0, (this.gains[id] ?? 0) + n);
    this.events.push(n >= 0 ? { type: 'gain', ingredient: id, amount: n, x, y } : { type: 'loss', ingredient: id, x, y });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  result(): MinigameResult {
    return { gains: { ...this.gains }, correctKeys: this.correctKeys, missKeys: this.missKeys };
  }
}

function pickWord(rng: Rng, list: Word[], avoidFirst: Set<string>, avoid?: Word): Word {
  const ok = list.filter((w) => w !== avoid && [...firstKeys(w.kana)].every((k) => !avoidFirst.has(k)));
  return rng.pick(ok.length ? ok : list.filter((w) => w !== avoid));
}

// ================= つり（おかみ）：正確さ =================

export const FISHING_PHRASES: Word[] = [
  { text: '静かな湖', kana: 'しずかなみずうみ' }, { text: '糸を巻く', kana: 'いとをまく' }, { text: '浮きが沈む', kana: 'うきがしずむ' },
  { text: '竿を立てる', kana: 'さおをたてる' }, { text: '水面の光', kana: 'みなものひかり' }, { text: 'そっと引く', kana: 'そっとひく' },
  { text: '銀のうろこ', kana: 'ぎんのうろこ' }, { text: '朝の水辺', kana: 'あさのみずべ' }, { text: '波紋', kana: 'はもん' },
  { text: '大物の影', kana: 'おおものかげ' }, { text: '落ち着いて', kana: 'おちついて' }, { text: '魚影を追う', kana: 'ぎょえいをおう' },
];

export class FishingGame extends Minigame<null> {
  readonly kind = 'fishing' as const;
  phase: 'wait' | 'hooked' | 'land' = 'wait';
  word: Word | null = null;
  /** ミスなしの語句が続くとたまる。満タンで大物 */
  calm = 0;
  readonly calmToBig = 2;
  big = false;
  wordsLeft = 0;
  private wordMissed = false;
  private timer = 0.4;

  targets(): Target<null>[] {
    return this.phase === 'hooked' && this.word ? [{ id: 'fish', kana: this.word.kana, data: null }] : [];
  }

  protected step(dt: number) {
    this.timer -= dt;
    if (this.phase === 'wait' && this.timer <= 0) {
      this.big = this.calm >= this.calmToBig;
      this.wordsLeft = this.big ? 2 : 1;
      this.phase = 'hooked';
      this.nextWord();
      this.events.push({ type: 'bite', big: this.big });
    } else if (this.phase === 'land' && this.timer <= 0) {
      this.phase = 'wait';
      this.timer = this.rng.range(0.25, 0.5);
    }
  }

  private nextWord() {
    this.word = pickWord(this.rng, FISHING_PHRASES, new Set(), this.word ?? undefined);
    this.wordMissed = false;
  }

  protected onMiss() {
    this.wordMissed = true;
  }

  protected onWord() {
    if (!this.big) this.calm = this.wordMissed ? 0 : this.calm + 1;
    this.wordsLeft--;
    if (this.wordsLeft > 0) {
      this.nextWord();
      return;
    }
    this.add('fish', this.big ? 5 : 2, 0.5, 0.5);
    if (this.big) this.calm = 0;
    this.phase = 'land';
    this.word = null;
    this.timer = 0.35;
  }
}

// ================= かり（マスター）：速さと狙い分け =================

export const HUNTING_WORDS: Word[] = [
  { text: '砂', kana: 'すな' }, { text: '風', kana: 'かぜ' }, { text: '撃て', kana: 'うて' }, { text: '影', kana: 'かげ' },
  { text: '茂み', kana: 'しげみ' }, { text: '弾', kana: 'たま' }, { text: '罠', kana: 'わな' }, { text: '牙', kana: 'きば' },
  { text: '角', kana: 'つの' }, { text: '跳ぶ', kana: 'とぶ' }, { text: '追え', kana: 'おえ' }, { text: '今だ', kana: 'いまだ' },
  { text: '右', kana: 'みぎ' }, { text: '前', kana: 'まえ' }, { text: '鉄', kana: 'てつ' }, { text: '獲物', kana: 'えもの' },
  { text: '狙う', kana: 'ねらう' }, { text: '群れ', kana: 'むれ' }, { text: '弓', kana: 'ゆみ' }, { text: '放て', kana: 'はなて' },
  { text: '肉', kana: 'にく' }, { text: '野営', kana: 'やえい' }, { text: '岩陰', kana: 'いわかげ' }, { text: '縄', kana: 'なわ' },
  { text: '光', kana: 'ひかり' }, { text: '迫る', kana: 'せまる' }, { text: '僅差', kana: 'きんさ' }, { text: '連射', kana: 'れんしゃ' },
];

export interface Prey {
  id: string;
  kind: 'rabbit' | 'deer';
  x: number;
  lane: number;
  speed: number;
  hp: number;
  maxHp: number;
  word: Word;
  flash: number;
}

export class HuntingGame extends Minigame<Prey> {
  readonly kind = 'hunting' as const;
  prey: Prey[] = [];
  private spawn = 0.3;
  private deerSpawned = false;
  private n = 0;

  targets(): Target<Prey>[] {
    return this.prey.map((p) => ({ id: p.id, kana: p.word.kana, data: p }));
  }

  private usedFirst(except?: Prey) {
    const s = new Set<string>();
    for (const p of this.prey) if (p !== except) for (const k of firstKeys(p.word.kana)) s.add(k);
    return s;
  }

  protected step(dt: number) {
    this.spawn -= dt;
    const elapsed = this.duration - this.timeLeft;
    if (!this.deerSpawned && elapsed > 2.5) {
      this.deerSpawned = true;
      this.addPrey('deer');
    }
    if (this.spawn <= 0 && this.prey.filter((p) => p.kind === 'rabbit').length < 3 && this.timeLeft > 1.5) {
      this.spawn = this.rng.range(0.9, 1.4);
      this.addPrey('rabbit');
    }
    for (const p of this.prey) {
      p.x -= p.speed * dt;
      p.flash = Math.max(0, p.flash - dt);
    }
    for (const p of this.prey.filter((q) => q.x < -0.05)) this.events.push({ type: 'escape', id: p.id });
    this.prey = this.prey.filter((p) => p.x >= -0.05);
  }

  private addPrey(kind: 'rabbit' | 'deer') {
    const lanes = kind === 'deer' ? [0.5] : [0.2, 0.5, 0.8];
    const hp = kind === 'deer' ? 3 : 1;
    this.prey.push({
      id: `p${this.n++}`, kind, x: 1.05, lane: this.rng.pick(lanes), speed: 1.1 / (kind === 'deer' ? 6.5 : 4.2),
      hp, maxHp: hp, word: pickWord(this.rng, HUNTING_WORDS, this.usedFirst()), flash: 0,
    });
  }

  protected onMiss() {
    // 打ちかけの獲物が驚いて足が速くなる
    for (const l of this.input.active) l.target.data.speed *= 1.1;
  }

  protected onWord(t: Target<Prey>) {
    const p = this.prey.find((q) => q.id === t.id);
    if (!p) return;
    p.hp--;
    p.flash = 0.25;
    if (p.hp <= 0) {
      this.add('meat', p.kind === 'deer' ? 3 : 1, p.x, p.lane);
      this.prey = this.prey.filter((q) => q !== p);
    } else {
      p.word = pickWord(this.rng, HUNTING_WORDS, this.usedFirst(p), p.word);
    }
  }
}

// ================= さいしゅ（看板娘）：見極め =================

export const GATHER_GOOD: (Word & { ing: IngredientId })[] = [
  { text: 'にんじん', kana: 'にんじん', ing: 'veg' }, { text: 'かぶ', kana: 'かぶ', ing: 'veg' }, { text: 'たまねぎ', kana: 'たまねぎ', ing: 'veg' },
  { text: 'じゃがいも', kana: 'じゃがいも', ing: 'veg' }, { text: 'とまと', kana: 'とまと', ing: 'veg' }, { text: 'ねぎ', kana: 'ねぎ', ing: 'veg' },
  { text: 'しいたけ', kana: 'しいたけ', ing: 'mush' }, { text: 'まいたけ', kana: 'まいたけ', ing: 'mush' }, { text: 'えのき', kana: 'えのき', ing: 'mush' },
  { text: 'しめじ', kana: 'しめじ', ing: 'mush' }, { text: 'なめこ', kana: 'なめこ', ing: 'mush' },
];
export const GATHER_BAD: Word[] = [
  { text: 'べにてんぐ', kana: 'べにてんぐ' }, { text: 'つきよたけ', kana: 'つきよたけ' }, { text: 'かえんたけ', kana: 'かえんたけ' },
  { text: 'どくつるたけ', kana: 'どくつるたけ' },
];

export interface Sprout {
  id: string;
  word: Word;
  ing: IngredientId | null;
  slot: number;
  life: number;
  maxLife: number;
}

export const GATHER_SLOTS = 6;

export class GatheringGame extends Minigame<Sprout> {
  readonly kind = 'gathering' as const;
  sprouts: Sprout[] = [];
  /** 摘んだ順（毒を打つと最後に摘んだものがこぼれる） */
  basket: IngredientId[] = [];
  private spawn = 0.1;
  private n = 0;

  targets(): Target<Sprout>[] {
    return this.sprouts.map((s) => ({ id: s.id, kana: s.word.kana, data: s }));
  }

  protected step(dt: number) {
    this.spawn -= dt;
    if (this.spawn <= 0 && this.sprouts.length < 5) {
      this.spawn = this.rng.range(0.5, 0.8);
      const free = Array.from({ length: GATHER_SLOTS }, (_, i) => i).filter((i) => !this.sprouts.some((s) => s.slot === i));
      if (free.length) {
        const used = new Set<string>();
        for (const s of this.sprouts) for (const k of firstKeys(s.word.kana)) used.add(k);
        const bad = this.rng.next() < 0.25;
        const pool = bad ? GATHER_BAD : GATHER_GOOD;
        const w = pickWord(this.rng, pool, used) as Word & { ing?: IngredientId };
        const life = this.rng.range(3.6, 4.6);
        this.sprouts.push({ id: `s${this.n++}`, word: w, ing: bad ? null : w.ing ?? null, slot: this.rng.pick(free), life, maxLife: life });
      }
    }
    for (const s of this.sprouts) s.life -= dt;
    this.sprouts = this.sprouts.filter((s) => s.life > 0);
  }

  protected onMiss() {}

  protected onWord(t: Target<Sprout>) {
    const s = t.data;
    this.sprouts = this.sprouts.filter((q) => q.id !== s.id);
    if (s.ing) {
      // 1回摘むと2つ取れる
      this.basket.push(s.ing, s.ing);
      this.add(s.ing, 2, s.slot, 0);
    } else {
      // 毒きのこを摘んでしまった：かごから1つこぼれる
      const lost = this.basket.pop();
      if (lost) this.add(lost, -1, s.slot, 0);
      const lost2 = this.basket.pop();
      if (lost2) this.add(lost2, -1, s.slot, 0);
      else this.events.push({ type: 'loss', ingredient: 'mush', x: s.slot, y: 0 });
    }
  }
}

// ================= しいれ（マスター）：値切りの言葉 =================

export const TRADE_PHRASES: Word[] = [
  { text: 'もう少しまけて', kana: 'もうすこしまけて' }, { text: 'まとめて買うよ', kana: 'まとめてかうよ' }, { text: 'いつもありがとう', kana: 'いつもありがとう' },
  { text: 'おまけしてよ', kana: 'おまけしてよ' }, { text: 'それで頼む', kana: 'それでたのむ' }, { text: '良い品だね', kana: 'よいしなだね' },
  { text: '常連だろう', kana: 'じょうれんだろう' }, { text: '箱ごともらう', kana: 'はこごともらう' }, { text: '次も来るよ', kana: 'つぎもくるよ' },
];

export class TradingGame extends Minigame<null> {
  readonly kind = 'trading' as const;
  word: Word;
  deals = 0;
  private wordMissed = false;

  constructor(rng: Rng) {
    super(rng);
    this.word = rng.pick(TRADE_PHRASES);
  }

  targets(): Target<null>[] {
    return [{ id: 'deal', kana: this.word.kana, data: null }];
  }

  protected step() {}

  protected onMiss() {
    this.wordMissed = true;
  }

  protected onWord() {
    // 酒と香辛料の箱を交互に。ミスなしなら反対側をおまけで1つ
    const main: IngredientId = this.deals % 2 === 0 ? 'ale' : 'spice';
    this.add(main, 1, this.deals, 0);
    if (!this.wordMissed) this.add(main === 'ale' ? 'spice' : 'ale', 1, this.deals, 1);
    this.deals++;
    this.word = pickWord(this.rng, TRADE_PHRASES, new Set(), this.word);
    this.wordMissed = false;
  }
}

export function createMinigame(id: TripId, rng: Rng): Minigame<unknown> {
  switch (id) {
    case 'fishing': return new FishingGame(rng) as Minigame<unknown>;
    case 'hunting': return new HuntingGame(rng) as Minigame<unknown>;
    case 'gathering': return new GatheringGame(rng) as Minigame<unknown>;
    case 'trading': return new TradingGame(rng) as Minigame<unknown>;
  }
}
