import { Rng } from './rng';
import type { Word } from './words';

/** 出題の山札。一巡するまで同じ語を出さない。 */
export class WordDeck {
  private pile: Word[] = [];
  constructor(private readonly words: readonly Word[], private readonly rng: Rng) {}

  draw(accept: (w: Word) => boolean = () => true): Word {
    if (this.pile.length === 0) this.refill();
    const idx = this.pile.findIndex(accept);
    if (idx >= 0) return this.pile.splice(idx, 1)[0];
    // 条件に合う語が山に無ければ、全体から探す
    const any = this.words.filter(accept);
    return any.length > 0 ? this.rng.pick(any) : this.pile.pop()!;
  }

  private refill() {
    this.pile = [...this.words];
    for (let i = this.pile.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [this.pile[i], this.pile[j]] = [this.pile[j], this.pile[i]];
    }
  }
}
