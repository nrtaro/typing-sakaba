import { HUNTING, qualityFromMisses } from './config';
import type { ActivityEvent, ActivityModel, ActivityResult, CatchItem } from './activity';
import { WordDeck } from './deck';
import { RomajiMatcher, firstKeys } from './romaji';
import { Rng } from './rng';
import { HUNTING_WORDS, type Word } from './words';

export type PreyKind = 'rabbit' | 'deer';

export interface Prey {
  id: number;
  kind: PreyKind;
  /** 1.05（右端の外）から -0.05（左端の外）へ進む */
  x: number;
  baseSpeed: number;
  speedMult: number;
  hp: number;
  maxHp: number;
  word: Word;
  matcher: RomajiMatcher;
  misses: number;
  /** 被弾・驚きの演出用タイマー */
  flash: number;
  /** 上下の位置（描画用、0..1） */
  lane: number;
}

const START_X = 1.05;
const END_X = -0.05;

/**
 * 狩り: 獲物が右から左へ走る。最初の1文字を打った獲物に狙いが定まり、
 * 単語を打ち切るたびに命中。逃げ切られると何も得られない。
 */
export class HuntingModel implements ActivityModel {
  readonly kind = 'hunting' as const;
  readonly duration: number;
  timeLeft: number;
  prey: Prey[] = [];
  lockId: number | null = null;
  private elapsed = 0;
  private nextRabbit = 0.6;
  private deerQueue: number[];
  private nextId = 1;
  private deck: WordDeck;
  private events: ActivityEvent[] = [];
  private catches: CatchItem[] = [];
  private correctKeys = 0;
  private missKeys = 0;
  private activeSeconds = 0;
  private wordsCompleted = 0;
  private escapes = 0;
  private over = false;

  constructor(private rng: Rng, duration = HUNTING.duration) {
    this.duration = duration;
    this.timeLeft = duration;
    this.deck = new WordDeck(HUNTING_WORDS, rng);
    this.deerQueue = [...HUNTING.deerAt].filter((t) => t < duration);
  }

  get finished() {
    return this.over;
  }

  get locked(): Prey | null {
    return this.prey.find((p) => p.id === this.lockId) ?? null;
  }

  update(dt: number) {
    if (this.over) return;
    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.prey.length > 0) this.activeSeconds += dt;

    // 出現
    this.nextRabbit -= dt;
    const rabbits = this.prey.filter((p) => p.kind === 'rabbit').length;
    if (this.nextRabbit <= 0 && rabbits < HUNTING.maxRabbits && this.timeLeft > 3) {
      this.spawn('rabbit');
      this.nextRabbit = this.rng.range(HUNTING.rabbitInterval[0], HUNTING.rabbitInterval[1]);
    }
    if (this.deerQueue.length > 0 && this.elapsed >= this.deerQueue[0]) {
      this.deerQueue.shift();
      if (!this.prey.some((p) => p.kind === 'deer')) this.spawn('deer');
    }

    // 移動・逃走
    for (const p of this.prey) {
      p.x -= p.baseSpeed * p.speedMult * dt;
      p.flash = Math.max(0, p.flash - dt);
    }
    const escaped = this.prey.filter((p) => p.x <= END_X);
    for (const p of escaped) {
      this.escapes++;
      this.events.push({ type: 'escape', label: p.kind === 'deer' ? '鉄角ジカ' : '砂ウサギ' });
      if (this.lockId === p.id) this.lockId = null;
    }
    if (escaped.length) this.prey = this.prey.filter((p) => p.x > END_X);

    if (this.timeLeft <= 0) {
      this.over = true;
      this.lockId = null;
    }
  }

  private usedFirstKeys(except?: Prey): Set<string> {
    const s = new Set<string>();
    for (const p of this.prey) {
      if (p === except) continue;
      for (const k of firstKeys(p.matcher.reading.slice(p.matcher.kanaPos))) s.add(k);
    }
    return s;
  }

  /** 画面上の他の獲物と最初の文字がかぶらない語を選ぶ */
  private drawWord(except?: Prey): Word {
    const used = this.usedFirstKeys(except);
    const prev = except?.word;
    return this.deck.draw((w) => w !== prev && [...firstKeys(w.kana)].every((k) => !used.has(k)));
  }

  private spawn(kind: 'rabbit' | 'deer') {
    const def = HUNTING[kind];
    const word = this.drawWord();
    const lanes = kind === 'deer' ? [0.55] : [0.25, 0.5, 0.75];
    const free = lanes.filter((l) => !this.prey.some((p) => Math.abs(p.lane - l) < 0.1 && p.x > 0.7));
    const p: Prey = {
      id: this.nextId++,
      kind,
      x: START_X,
      baseSpeed: (START_X - END_X) / def.crossTime,
      speedMult: 1,
      hp: def.hp,
      maxHp: def.hp,
      word,
      matcher: new RomajiMatcher(word.kana),
      misses: 0,
      flash: 0,
      lane: this.rng.pick(free.length ? free : lanes),
    };
    this.prey.push(p);
    this.events.push({ type: 'spawn', targetId: p.id });
  }

  key(ch: string) {
    if (this.over) return;
    let target = this.locked;
    if (!target) {
      // 最初の1文字で狙う獲物を決める（候補が複数なら逃げられそうな方）
      const cands = this.prey.filter((p) => p.matcher.wouldAccept(ch)).sort((a, b) => a.x - b.x);
      target = cands[0] ?? null;
      if (target) {
        this.lockId = target.id;
        this.events.push({ type: 'lock', targetId: target.id });
      }
    }
    if (!target) {
      this.missKeys++;
      this.events.push({ type: 'key', ok: false });
      return;
    }
    const r = target.matcher.input(ch);
    if (r === 'miss') {
      this.missKeys++;
      target.misses++;
      target.speedMult = Math.min(HUNTING.maxStartle, target.speedMult * HUNTING.startle);
      target.flash = 0.25;
      this.events.push({ type: 'key', ok: false });
      return;
    }
    this.correctKeys++;
    this.events.push({ type: 'key', ok: true });
    if (r !== 'complete') return;

    this.wordsCompleted++;
    target.hp--;
    target.flash = 0.3;
    this.events.push({ type: 'hit', targetId: target.id });
    if (target.hp <= 0) {
      this.kill(target);
    } else {
      target.word = this.drawWord(target);
      target.matcher = new RomajiMatcher(target.word.kana);
      this.lockId = null;
    }
  }

  /** Backspace: 狙いを外して別の獲物に切り替える（その単語の入力はやり直し） */
  control(name: 'release') {
    if (name !== 'release' || this.over) return;
    const t = this.locked;
    if (!t) return;
    t.matcher = new RomajiMatcher(t.word.kana);
    this.lockId = null;
  }

  private kill(p: Prey) {
    const isDeer = p.kind === 'deer';
    const id = isDeer ? 'bigMeat' : 'smallMeat';
    const item: CatchItem = {
      ingredient: id,
      quality: qualityFromMisses(p.misses, isDeer ? HUNTING.qualityMisses.deer : HUNTING.qualityMisses.rabbit),
      count: isDeer ? HUNTING.deer.yield : HUNTING.rabbit.yield,
      label: isDeer ? '鉄角ジカ' : '砂ウサギ',
      misses: p.misses,
    };
    this.catches.push(item);
    this.events.push({ type: 'catch', item });
    this.prey = this.prey.filter((q) => q !== p);
    this.lockId = null;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  result(): ActivityResult {
    return {
      kind: 'hunting',
      catches: [...this.catches],
      correctKeys: this.correctKeys,
      missKeys: this.missKeys,
      activeSeconds: this.activeSeconds,
      wordsCompleted: this.wordsCompleted,
      escapes: this.escapes,
    };
  }
}
