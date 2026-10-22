import { FISHING, INGREDIENTS, qualityFromMisses } from './config';
import type { ActivityEvent, ActivityModel, ActivityResult, CatchItem } from './activity';
import { WordDeck } from './deck';
import { RomajiMatcher } from './romaji';
import { Rng } from './rng';
import { FISHING_WORDS, type Word } from './words';

export type FishingPhase = 'waiting' | 'hooked' | 'landing' | 'over';

export interface HookedFish {
  big: boolean;
  wordsNeeded: number;
  wordsDone: number;
  misses: number;
}

/**
 * 釣り: 魚が掛かったら語句を打って釣り上げる。
 * ミスなしで語句を打ち続けると「水面の静けさ」がたまり、満タンで大物が掛かる。
 */
export class FishingModel implements ActivityModel {
  readonly kind = 'fishing' as const;
  readonly duration: number;
  timeLeft: number;
  phase: FishingPhase = 'waiting';
  fish: HookedFish | null = null;
  word: Word | null = null;
  matcher: RomajiMatcher | null = null;
  /** 0..calmToBig */
  calm = 0;
  /** 現在の語句でのミス数 */
  wordMisses = 0;
  private phaseTimer: number;
  private deck: WordDeck;
  private events: ActivityEvent[] = [];
  private catches: CatchItem[] = [];
  private correctKeys = 0;
  private missKeys = 0;
  private activeSeconds = 0;
  private wordsCompleted = 0;
  private escapes = 0;

  constructor(private rng: Rng, duration = FISHING.duration) {
    this.duration = duration;
    this.timeLeft = duration;
    this.deck = new WordDeck(FISHING_WORDS, rng);
    this.phaseTimer = this.biteWait();
  }

  get finished() {
    return this.phase === 'over';
  }

  private biteWait() {
    return this.rng.range(FISHING.biteWait[0], FISHING.biteWait[1]);
  }

  update(dt: number) {
    if (this.phase === 'over') return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.phase === 'hooked') this.activeSeconds += dt;

    if (this.phase === 'waiting') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.hook();
    } else if (this.phase === 'landing') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'waiting';
        this.phaseTimer = this.biteWait();
      }
    }

    if (this.timeLeft <= 0) {
      if (this.phase === 'hooked' && this.fish) {
        this.escapes++;
        this.events.push({ type: 'escape', label: this.fish.big ? INGREDIENTS.bigFish.name : INGREDIENTS.smallFish.name });
      }
      this.phase = 'over';
      this.matcher = null;
      this.word = null;
    }
  }

  private hook() {
    const big = this.calm >= FISHING.calmToBig;
    this.fish = { big, wordsNeeded: big ? FISHING.bigWords : 1, wordsDone: 0, misses: 0 };
    this.phase = 'hooked';
    this.nextWord();
    this.events.push({ type: 'bite', big });
  }

  private nextWord() {
    const prev = this.word;
    this.word = this.deck.draw((w) => w !== prev);
    this.matcher = new RomajiMatcher(this.word.kana);
    this.wordMisses = 0;
  }

  key(ch: string) {
    if (this.phase !== 'hooked' || !this.matcher || !this.fish) return;
    const r = this.matcher.input(ch);
    if (r === 'miss') {
      this.missKeys++;
      this.fish.misses++;
      this.wordMisses++;
      this.events.push({ type: 'key', ok: false });
      return;
    }
    this.correctKeys++;
    this.events.push({ type: 'key', ok: true });
    if (r !== 'complete') return;

    this.wordsCompleted++;
    this.fish.wordsDone++;
    this.events.push({ type: 'word' });
    if (!this.fish.big) {
      const g = FISHING.calmGain[Math.min(2, this.wordMisses)];
      this.calm = Math.max(0, Math.min(FISHING.calmToBig, this.calm + g));
    }
    if (this.fish.wordsDone >= this.fish.wordsNeeded) {
      this.land();
    } else {
      this.nextWord();
    }
  }

  private land() {
    const fish = this.fish!;
    const id = fish.big ? 'bigFish' : 'smallFish';
    const quality = qualityFromMisses(fish.misses, fish.big ? FISHING.qualityMisses.big : FISHING.qualityMisses.small);
    const item: CatchItem = {
      ingredient: id,
      quality,
      count: fish.big ? FISHING.bigYield : FISHING.smallYield,
      label: INGREDIENTS[id].name,
      misses: fish.misses,
    };
    this.catches.push(item);
    this.events.push({ type: 'catch', item });
    if (fish.big) this.calm = 0;
    this.fish = null;
    this.matcher = null;
    this.word = null;
    this.phase = 'landing';
    this.phaseTimer = FISHING.landTime;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  result(): ActivityResult {
    return {
      kind: 'fishing',
      catches: [...this.catches],
      correctKeys: this.correctKeys,
      missKeys: this.missKeys,
      activeSeconds: this.activeSeconds,
      wordsCompleted: this.wordsCompleted,
      escapes: this.escapes,
    };
  }
}
