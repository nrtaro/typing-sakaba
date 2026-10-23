import { CandidateInput, type Target } from './candidates';
import { defaultRomaji, firstKeys } from './romaji';
import { Rng } from './rng';
import { DIFFICULTIES, MINIGAME_SECONDS, type Difficulty, type IngredientId, type TripId } from './shopConfig';

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

  constructor(protected readonly rng: Rng, readonly difficulty: Difficulty = DIFFICULTIES[1]) {
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

function pickWord<W extends Word>(rng: Rng, list: W[], avoidFirst: Set<string>, avoid?: Word): W {
  const ok = list.filter((w) => w !== avoid && [...firstKeys(w.kana)].every((k) => !avoidFirst.has(k)));
  return rng.pick(ok.length ? ok : list.filter((w) => w !== avoid));
}

// ================= つり（女将）：あわせて、巻き上げる =================

/** 浮きが沈んだ瞬間に打つ合図 */
export const HOOK_WORDS: Word[] = [
  { text: 'いま！', kana: 'いま' }, { text: 'それ！', kana: 'それ' }, { text: 'ほい！', kana: 'ほい' }, { text: 'よし！', kana: 'よし' },
  { text: 'きた！', kana: 'きた' }, { text: 'えい！', kana: 'えい' }, { text: 'ほら！', kana: 'ほら' }, { text: 'せい！', kana: 'せい' },
];

/** 巻き上げの語句（短め） */
export const REEL_WORDS: Word[] = [
  { text: '巻け', kana: 'まけ' }, { text: '引け', kana: 'ひけ' }, { text: '粘れ', kana: 'ねばれ' }, { text: '踏ん張れ', kana: 'ふんばれ' },
  { text: 'もう少し', kana: 'もうすこし' }, { text: 'あと少し', kana: 'あとすこし' }, { text: 'ゆっくり', kana: 'ゆっくり' }, { text: '焦らず', kana: 'あせらず' },
  { text: '寄せろ', kana: 'よせろ' }, { text: '負けるな', kana: 'まけるな' }, { text: '頑張れ', kana: 'がんばれ' }, { text: 'まだまだ', kana: 'まだまだ' },
  { text: '竿を立て', kana: 'さおをたて' }, { text: '糸を巻け', kana: 'いとをまけ' }, { text: 'よいしょ', kana: 'よいしょ' }, { text: 'こらえろ', kana: 'こらえろ' },
  { text: '逃がすな', kana: 'にがすな' }, { text: '手応えあり', kana: 'てごたえあり' }, { text: '重いぞ', kana: 'おもいぞ' }, { text: '大きいぞ', kana: 'おおきいぞ' },
  { text: '水しぶき', kana: 'みずしぶき' }, { text: '跳ねた', kana: 'はねた' }, { text: '暴れるな', kana: 'あばれるな' }, { text: 'そっと', kana: 'そっと' },
  { text: '一気に', kana: 'いっきに' }, { text: '今だ', kana: 'いまだ' }, { text: '寄ってきた', kana: 'よってきた' }, { text: '見えた', kana: 'みえた' },
  { text: '網を出せ', kana: 'あみをだせ' }, { text: '釣れるぞ', kana: 'つれるぞ' }, { text: '銀色の背', kana: 'ぎんいろのせ' }, { text: '水面が光る', kana: 'みなもがひかる' },
];
/** 互換のための別名（出題データの確認に使う） */
export const FISHING_PHRASES = REEL_WORDS;

export const FISHING = {
  /** 浮きが沈んでから、あわせを打つまでの猶予（秒） */
  hookWindow: 1.6,
  bigWords: 3,
  /** ミスでテンションが上がり、この回数で糸が切れる */
  breakAt: 3,
  smallYield: 3,
  bigYield: 8,
  /** 大物と勝負中なら、時間切れでもこの秒数まで延長する */
  overtimeMax: 5,
};

export class FishingGame extends Minigame<null> {
  readonly kind = 'fishing' as const;
  phase: 'wait' | 'hook' | 'reel' | 'land' | 'lost' = 'wait';
  word: Word | null = null;
  /** 何匹目か（0始まり）。奇数番目（2匹目、4匹目…）は必ず大物 */
  fishIndex = 0;
  big = false;
  wordsLeft = 0;
  tension = 0;
  hookLeft = 0;
  overtime = 0;
  private timer = 0.4;

  /** あわせの猶予（難易度で変わる） */
  get hookWindow() {
    return FISHING.hookWindow * this.difficulty.hookMult;
  }

  get isBigNext() {
    return this.fishIndex % 2 === 1;
  }

  /** 大物と勝負している間は、時間切れでも延長する */
  get finished() {
    if (this.timeLeft > 0) return false;
    const fighting = this.big && (this.phase === 'hook' || this.phase === 'reel');
    return !(fighting && this.overtime < FISHING.overtimeMax);
  }

  targets(): Target<null>[] {
    if ((this.phase === 'hook' || this.phase === 'reel') && this.word) return [{ id: this.phase, kana: this.word.kana, data: null }];
    return [];
  }

  protected step(dt: number) {
    if (this.timeLeft <= 0) this.overtime += dt;
    if (this.phase === 'hook') {
      this.hookLeft -= dt;
      if (this.hookLeft <= 0) {
        // あわせ損ねた：魚に逃げられる（同じ大きさの魚がまた来る）
        this.events.push({ type: 'escape', id: 'hook' });
        this.word = null;
        this.phase = 'lost';
        this.timer = 0.5;
      }
      return;
    }
    if (this.phase === 'reel') return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.phase === 'wait' && this.timeLeft > 0) {
      this.big = this.isBigNext;
      this.phase = 'hook';
      this.hookLeft = this.hookWindow;
      this.word = this.rng.pick(HOOK_WORDS);
      this.events.push({ type: 'bite', big: this.big });
    } else if (this.phase === 'land' || this.phase === 'lost') {
      this.phase = 'wait';
      this.timer = this.rng.range(0.3, 0.5);
    }
  }

  protected onMiss() {
    if (this.phase !== 'reel') return;
    this.tension++;
    if (this.tension >= FISHING.breakAt) {
      // 糸が切れた：次の魚へ
      this.events.push({ type: 'escape', id: 'line' });
      this.fishIndex++;
      this.word = null;
      this.input.reset();
      this.phase = 'lost';
      this.timer = 0.6;
    }
  }

  protected onWord() {
    if (this.phase === 'hook') {
      this.phase = 'reel';
      this.tension = 0;
      this.wordsLeft = this.big ? FISHING.bigWords : 1;
      this.word = pickWord(this.rng, REEL_WORDS, new Set());
      return;
    }
    this.wordsLeft--;
    if (this.wordsLeft > 0) {
      this.word = pickWord(this.rng, REEL_WORDS, new Set(), this.word ?? undefined);
      return;
    }
    this.add('fish', this.big ? FISHING.bigYield : FISHING.smallYield, 0, 0);
    this.fishIndex++;
    this.word = null;
    this.phase = 'land';
    this.timer = 0.35;
  }
}

// ================= かり（おやじ）：速さと狙い分け =================

export const HUNTING_WORDS: Word[] = [
  { text: '砂', kana: 'すな' }, { text: '風', kana: 'かぜ' }, { text: '撃て', kana: 'うて' }, { text: '影', kana: 'かげ' },
  { text: '茂み', kana: 'しげみ' }, { text: '弾', kana: 'たま' }, { text: '罠', kana: 'わな' }, { text: '牙', kana: 'きば' },
  { text: '角', kana: 'つの' }, { text: '跳ぶ', kana: 'とぶ' }, { text: '追え', kana: 'おえ' }, { text: '今だ', kana: 'いまだ' },
  { text: '右', kana: 'みぎ' }, { text: '左', kana: 'ひだり' }, { text: '前', kana: 'まえ' }, { text: '鉄', kana: 'てつ' },
  { text: '獲物', kana: 'えもの' }, { text: '狙え', kana: 'ねらえ' }, { text: '群れ', kana: 'むれ' }, { text: '弓', kana: 'ゆみ' },
  { text: '放て', kana: 'はなて' }, { text: '野営', kana: 'やえい' }, { text: '岩陰', kana: 'いわかげ' }, { text: '縄', kana: 'なわ' },
  { text: '光', kana: 'ひかり' }, { text: '迫る', kana: 'せまる' }, { text: '連射', kana: 'れんしゃ' }, { text: '足跡', kana: 'あしあと' },
  { text: '砂丘', kana: 'さきゅう' }, { text: '瓦礫', kana: 'がれき' }, { text: '廃墟', kana: 'はいきょ' }, { text: '照準', kana: 'しょうじゅん' },
  { text: '一発', kana: 'いっぱつ' }, { text: '静かに', kana: 'しずかに' }, { text: '息', kana: 'いき' }, { text: '引き金', kana: 'ひきがね' },
  { text: '囲め', kana: 'かこめ' }, { text: '低く', kana: 'ひくく' }, { text: '速い', kana: 'はやい' }, { text: '夕日', kana: 'ゆうひ' },
  { text: '構え', kana: 'かまえ' }, { text: '鉄塔', kana: 'てっとう' }, { text: '突進', kana: 'とっしん' }, { text: '逃すな', kana: 'のがすな' },
  { text: '土煙', kana: 'つちけむり' }, { text: '旧道', kana: 'きゅうどう' }, { text: '標的', kana: 'ひょうてき' }, { text: '荒野', kana: 'こうや' },
  { text: '足音', kana: 'あしおと' }, { text: '耳', kana: 'みみ' }, { text: '尻尾', kana: 'しっぽ' }, { text: '毛皮', kana: 'けがわ' },
  { text: '待て', kana: 'まて' }, { text: '伏せろ', kana: 'ふせろ' }, { text: '回れ', kana: 'まわれ' }, { text: '追い込め', kana: 'おいこめ' },
  { text: '仕留めろ', kana: 'しとめろ' }, { text: '弾倉', kana: 'だんそう' }, { text: '狩人', kana: 'かりゅうど' }, { text: '獣道', kana: 'けものみち' },
  { text: '草むら', kana: 'くさむら' }, { text: '岩場', kana: 'いわば' }, { text: '夜明け', kana: 'よあけ' }, { text: '双眼鏡', kana: 'そうがんきょう' },
];

export const HUNTING = {
  rabbit: { hp: 2, crossTime: 6.0, yield: 3 },
  deer: { hp: 4, crossTime: 9.0, yield: 12 },
  /** 狩り：獲物の通り道（0=奥、1=手前）。大物は専用の通り道 */
  rabbitLanes: [0, 0.45],
  deerLane: 0.95,
  spawn: [1.3, 1.9] as [number, number],
  maxRabbits: 3,
  deerAt: 2.0,
  /** 同じ通り道で前の獲物がこの位置より左に進むまで次を出さない（文字の重なり防止） */
  laneGap: 0.7,
  startle: 1.1,
};

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

  private laneFree(lane: number) {
    return !this.prey.some((p) => p.lane === lane && p.x > HUNTING.laneGap);
  }

  protected step(dt: number) {
    this.spawn -= dt;
    const elapsed = this.duration - this.timeLeft;
    if (!this.deerSpawned && elapsed > HUNTING.deerAt) {
      this.deerSpawned = true;
      this.addPrey('deer', HUNTING.deerLane);
    }
    if (this.spawn <= 0 && this.prey.filter((p) => p.kind === 'rabbit').length < HUNTING.maxRabbits && this.timeLeft > 1.5) {
      const free = HUNTING.rabbitLanes.filter((l) => this.laneFree(l));
      if (free.length) {
        this.spawn = this.rng.range(HUNTING.spawn[0], HUNTING.spawn[1]);
        this.addPrey('rabbit', this.rng.pick(free));
      }
    }
    for (const p of this.prey) {
      p.x -= p.speed * dt;
      p.flash = Math.max(0, p.flash - dt);
    }
    for (const p of this.prey.filter((q) => q.x < -0.05)) this.events.push({ type: 'escape', id: p.id });
    this.prey = this.prey.filter((p) => p.x >= -0.05);
  }

  private addPrey(kind: 'rabbit' | 'deer', lane: number) {
    const def = HUNTING[kind];
    this.prey.push({
      id: `p${this.n++}`, kind, x: 1.05, lane, speed: (1.1 / def.crossTime) * this.difficulty.preyMult,
      hp: def.hp, maxHp: def.hp, word: pickWord(this.rng, HUNTING_WORDS, this.usedFirst()), flash: 0,
    });
  }

  protected onMiss() {
    // 打ちかけの獲物が驚いて少し足が速くなる
    for (const l of this.input.active) l.target.data.speed *= HUNTING.startle;
  }

  protected onWord(t: Target<Prey>) {
    const p = this.prey.find((q) => q.id === t.id);
    if (!p) return;
    p.hp--;
    p.flash = 0.25;
    if (p.hp <= 0) {
      this.add('meat', HUNTING[p.kind].yield, p.x, p.lane);
      this.prey = this.prey.filter((q) => q !== p);
    } else {
      p.word = pickWord(this.rng, HUNTING_WORDS, this.usedFirst(p), p.word);
    }
  }
}

// ================= さいしゅ（看板娘）：見極め =================

export const GATHER_GOOD: (Word & { ing: IngredientId })[] = [
  { text: 'にんじん', kana: 'にんじん', ing: 'veg' }, { text: 'かぶ', kana: 'かぶ', ing: 'veg' }, { text: 'たまねぎ', kana: 'たまねぎ', ing: 'veg' },
  { text: 'じゃがいも', kana: 'じゃがいも', ing: 'veg' }, { text: 'トマト', kana: 'とまと', ing: 'veg' }, { text: 'ねぎ', kana: 'ねぎ', ing: 'veg' },
  { text: 'だいこん', kana: 'だいこん', ing: 'veg' }, { text: 'キャベツ', kana: 'きゃべつ', ing: 'veg' }, { text: 'なす', kana: 'なす', ing: 'veg' },
  { text: 'ピーマン', kana: 'ぴーまん', ing: 'veg' }, { text: 'かぼちゃ', kana: 'かぼちゃ', ing: 'veg' }, { text: 'ほうれんそう', kana: 'ほうれんそう', ing: 'veg' },
  { text: 'ごぼう', kana: 'ごぼう', ing: 'veg' }, { text: 'れんこん', kana: 'れんこん', ing: 'veg' }, { text: 'さつまいも', kana: 'さつまいも', ing: 'veg' },
  { text: 'しいたけ', kana: 'しいたけ', ing: 'mush' }, { text: 'まいたけ', kana: 'まいたけ', ing: 'mush' }, { text: 'えのき', kana: 'えのき', ing: 'mush' },
  { text: 'しめじ', kana: 'しめじ', ing: 'mush' }, { text: 'なめこ', kana: 'なめこ', ing: 'mush' }, { text: 'エリンギ', kana: 'えりんぎ', ing: 'mush' },
  { text: 'マッシュルーム', kana: 'まっしゅるーむ', ing: 'mush' }, { text: 'きくらげ', kana: 'きくらげ', ing: 'mush' },
];
export const GATHER_BAD: Word[] = [
  { text: 'べにてんぐたけ', kana: 'べにてんぐたけ' }, { text: 'つきよたけ', kana: 'つきよたけ' }, { text: 'かえんたけ', kana: 'かえんたけ' },
  { text: 'どくつるたけ', kana: 'どくつるたけ' }, { text: 'にがくりたけ', kana: 'にがくりたけ' }, { text: 'てんぐたけ', kana: 'てんぐたけ' },
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
export const GATHER = { perPick: 4, poisonLoss: 2, poisonRate: 0.25, life: [3.6, 4.6] as [number, number] };

export class GatheringGame extends Minigame<Sprout> {
  readonly kind = 'gathering' as const;
  sprouts: Sprout[] = [];
  /** 摘んだ順（毒を打つと最後に摘んだものからこぼれる） */
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
        const bad = this.rng.next() < this.difficulty.poisonRate;
        const w = bad ? pickWord(this.rng, GATHER_BAD, used) : pickWord(this.rng, GATHER_GOOD, used);
        const life = this.rng.range(GATHER.life[0], GATHER.life[1]) * this.difficulty.sproutLifeMult;
        this.sprouts.push({ id: `s${this.n++}`, word: w, ing: bad ? null : (w as unknown as { ing: IngredientId }).ing, slot: this.rng.pick(free), life, maxLife: life });
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
      for (let i = 0; i < GATHER.perPick; i++) this.basket.push(s.ing);
      this.add(s.ing, GATHER.perPick, s.slot, 0);
    } else {
      // 毒きのこを摘んでしまった：かごからこぼれる
      let lostAny = false;
      for (let i = 0; i < GATHER.poisonLoss; i++) {
        const lost = this.basket.pop();
        if (lost) {
          this.add(lost, -1, s.slot, 0);
          lostAny = true;
        }
      }
      if (!lostAny) this.events.push({ type: 'loss', ingredient: 'mush', x: s.slot, y: 0 });
    }
  }
}

// ================= しいれ（おやじ）：早い者勝ちの競り =================

export const ALE_GOODS: Word[] = [
  { text: '黒ビール', kana: 'くろびーる' }, { text: '琥珀エール', kana: 'こはくえーる' }, { text: 'ラガー', kana: 'らがー' },
  { text: 'はちみつ酒', kana: 'はちみつしゅ' }, { text: 'ぶどう酒', kana: 'ぶどうしゅ' }, { text: 'りんご酒', kana: 'りんごしゅ' },
  { text: '米の酒', kana: 'こめのさけ' }, { text: 'ラム酒', kana: 'らむしゅ' }, { text: '白ワイン', kana: 'しろわいん' },
  { text: '赤ワイン', kana: 'あかわいん' }, { text: 'ウイスキー', kana: 'ういすきー' }, { text: '果実酒', kana: 'かじつしゅ' },
  { text: '地ビール', kana: 'じびーる' }, { text: '古酒', kana: 'こしゅ' }, { text: '梅酒', kana: 'うめしゅ' },
];
export const SPICE_GOODS: Word[] = [
  { text: '胡椒', kana: 'こしょう' }, { text: '唐辛子', kana: 'とうがらし' }, { text: '山椒', kana: 'さんしょう' },
  { text: 'シナモン', kana: 'しなもん' }, { text: '生姜', kana: 'しょうが' }, { text: 'にんにく', kana: 'にんにく' },
  { text: '黒胡椒', kana: 'くろこしょう' }, { text: 'ナツメグ', kana: 'なつめぐ' }, { text: 'サフラン', kana: 'さふらん' },
  { text: 'わさび', kana: 'わさび' }, { text: 'からし', kana: 'からし' }, { text: 'バジル', kana: 'ばじる' },
  { text: 'ローズマリー', kana: 'ろーずまりー' }, { text: 'クミン', kana: 'くみん' }, { text: '八角', kana: 'はっかく' },
];
/** 互換のための別名（出題データの確認に使う） */
export const TRADE_PHRASES = [...ALE_GOODS, ...SPICE_GOODS];

export const TRADING = {
  /** 落札したときの箱の数と、ミスなしのおまけ */
  win: 3,
  bonus: 1,
  /** ライバルが打ち始めるまでの時間と速さ（打鍵/秒）。品物ごとに速くなる */
  rivalDelay: 0.5,
  rivalSpeed: 2.6,
  rivalGrow: 0.35,
  rivalMax: 5.5,
  pause: 0.7,
};

export interface Lot {
  item: 'ale' | 'spice';
  word: Word;
  /** ライバルの進み具合（0〜1） */
  rival: number;
  rivalKeys: number;
  rivalSpeed: number;
  delay: number;
  missed: boolean;
  outcome: 'open' | 'won' | 'lost';
}

export class TradingGame extends Minigame<null> {
  readonly kind = 'trading' as const;
  lot: Lot;
  lots = 0;
  wins = 0;
  losses = 0;
  private pause = 0;

  constructor(rng: Rng, difficulty?: Difficulty) {
    super(rng, difficulty);
    this.lot = this.newLot();
  }

  private newLot(): Lot {
    const item = this.lots % 2 === 0 ? 'ale' : 'spice';
    const list = item === 'ale' ? ALE_GOODS : SPICE_GOODS;
    const word = pickWord(this.rng, list, new Set(), this.lot?.word);
    return {
      item, word, rival: 0, rivalKeys: defaultRomaji(word.kana).length, delay: TRADING.rivalDelay, missed: false, outcome: 'open',
      rivalSpeed: Math.min(TRADING.rivalMax, TRADING.rivalSpeed + this.lots * TRADING.rivalGrow) * this.difficulty.rivalMult,
    };
  }

  targets(): Target<null>[] {
    return this.lot.outcome === 'open' ? [{ id: `lot${this.lots}`, kana: this.lot.word.kana, data: null }] : [];
  }

  protected step(dt: number) {
    const lot = this.lot;
    if (lot.outcome !== 'open') {
      this.pause -= dt;
      if (this.pause <= 0) {
        this.lots++;
        this.lot = this.newLot();
      }
      return;
    }
    lot.delay -= dt;
    if (lot.delay > 0) return;
    lot.rival = Math.min(1, lot.rival + (lot.rivalSpeed * dt) / lot.rivalKeys);
    if (lot.rival >= 1) {
      // ライバルに先を越された
      lot.outcome = 'lost';
      this.losses++;
      this.pause = TRADING.pause;
      this.events.push({ type: 'escape', id: 'lot' });
    }
  }

  protected onMiss() {
    this.lot.missed = true;
  }

  protected onWord() {
    const lot = this.lot;
    lot.outcome = 'won';
    this.wins++;
    this.add(lot.item, TRADING.win + (lot.missed ? 0 : TRADING.bonus), 0, 0);
    this.pause = TRADING.pause;
  }
}

export function createMinigame(id: TripId, rng: Rng, difficulty?: Difficulty): Minigame<unknown> {
  switch (id) {
    case 'fishing': return new FishingGame(rng, difficulty) as Minigame<unknown>;
    case 'hunting': return new HuntingGame(rng, difficulty) as Minigame<unknown>;
    case 'gathering': return new GatheringGame(rng, difficulty) as Minigame<unknown>;
    case 'trading': return new TradingGame(rng, difficulty) as Minigame<unknown>;
  }
}
