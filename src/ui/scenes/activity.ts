import type { App, Scene } from '../app';
import { h, key, onceButton, stars } from '../dom';
import {
  drawFishing, drawHunting, fishingSplash, huntingShot, newFishingFx, newHuntingFx, preyScreen, stepFishingFx, stepHuntingFx,
  type FishingFx, type HuntingFx,
} from '../art/activityArt';
import { FISHING, HUNTING, INGREDIENTS, QUALITY_PRICE, STARS, type ActivityKind, type IngredientId, type Quality } from '../../core/config';
import { accuracy, speedKps, type ActivityModel, type ActivityResult } from '../../core/activity';
import { FishingModel } from '../../core/fishing';
import { HuntingModel, type Prey } from '../../core/hunting';
import { subRng } from '../../core/rng';
import { completeActivity, startActivity } from '../../core/game';
import type { RomajiMatcher } from '../../core/romaji';
import { settingsPanel } from './common';
import { TavernScene } from './tavern';

type Phase = 'intro' | 'countdown' | 'play' | 'finish' | 'result';

const TYPABLE = /^[a-z0-9\-,.!?/]$/i;

export class ActivityScene implements Scene {
  countsPlayTime = true;
  paused = false;
  private app!: App;
  private phase: Phase = 'intro';
  private model: ActivityModel | null = null;
  private countdown = 3;
  private finishTimer = 0;
  private fishFx: FishingFx = newFishingFx();
  private huntFx: HuntingFx = newHuntingFx();
  private hudEl!: HTMLElement;
  private typingEl!: HTMLElement;
  private sideEl!: HTMLElement;
  private labelsEl!: HTMLElement;
  private overlay: HTMLElement | null = null;
  private labels = new Map<number, { el: HTMLElement; sig: string }>();
  private lastMiss = 0;
  private uiTimer = 0;
  private typingSig = '';
  private result: ActivityResult | null = null;
  private t = 0;

  constructor(private kind: ActivityKind, private token: number | null) {}

  enter(app: App) {
    this.app = app;
    app.audio.setBgm(this.kind === 'fishing' ? 'calm' : 'hunt');
    this.hudEl = h('div', { class: 'act-hud' });
    this.labelsEl = h('div');
    this.sideEl = h('div', { class: 'side-info' });
    this.typingEl = h('div', { class: 'typing' });
    app.ui.append(this.labelsEl, this.hudEl, this.sideEl, this.typingEl);
    this.sideEl.style.display = 'none';
    this.typingEl.style.display = 'none';
    this.showIntro();
    // 開始前は背景だけ見せる
    this.model = this.makeModel(0);
  }

  private makeModel(token: number): ActivityModel {
    const rng = subRng(this.app.state!.seed, 500, token);
    return this.kind === 'fishing' ? new FishingModel(rng) : new HuntingModel(rng);
  }

  // ---------- 開始前 ----------

  private showIntro() {
    const fishing = this.kind === 'fishing';
    const rules = fishing
      ? [
          '浮きに魚が掛かると語句が出る。読みをローマ字で打つと釣り上げられる。',
          'ミスなく語句を打つと「水面の静けさ」がたまる。満タンで大物「大ナマズ」が掛かる（語句3つで釣り上げ）。',
          'その魚を釣る間のミスが少ないほど、品質（★）が高くなる。',
          `制限時間 ${FISHING.duration}秒。待ち時間は短く、ほとんどの時間を入力に使える。`,
        ]
      : [
          '獲物が右から左へ走ってくる。打ちたい獲物の単語の最初の1文字を打つと、その獲物に狙いが定まる。',
          '単語を打ち切るたびに命中。砂ウサギは2発、鉄角ジカは5発で仕留められる。',
          '左の柵を越えられると逃げられる。ミスすると獲物が驚いて足が速くなる。',
          `制限時間 ${HUNTING.duration}秒。Backspace で狙いを外して別の獲物に切り替えられる。`,
        ];
    const resumed = this.token !== null;
    this.setOverlay(
      h('div', { class: 'backdrop' },
        h('div', { class: 'panel intro' },
          h('h2', null, fishing ? '釣り ― 水没した街の貯水池' : '狩り ― 崩れた高架下の荒野'),
          h('ul', null, ...rules.map((r) => h('li', null, r))),
          h('p', { class: 'small dim' }, '半角英数（IMEオフ）で入力。誤入力では進まない。速さは「打鍵/秒」（ローマ字のキー数）で表示。'),
          resumed ? h('p', { class: 'small warm' }, 'この調達は行動回数を消費済みです。') : null,
          h('div', { class: 'modal-foot' },
            onceButton([key('Space'), resumed ? '開始する' : '開始する（行動を1回使う）'], () => this.begin(), { class: 'primary' }),
            resumed ? null : h('button', { onclick: () => this.backToTavern() }, key('Esc'), 'やめる（行動は使わない）'),
          ),
        ),
      ),
    );
  }

  private begin() {
    if (this.phase !== 'intro') return;
    const s = this.app.state!;
    if (this.token === null) {
      const token = startActivity(s, this.kind, s.rev);
      if (token === null) {
        this.backToTavern();
        return;
      }
      this.token = token;
      this.app.save();
    }
    this.model = this.makeModel(this.token);
    this.fishFx = newFishingFx();
    this.huntFx = newHuntingFx();
    this.setOverlay(null);
    this.phase = 'countdown';
    this.countdown = 3;
    this.sideEl.style.display = '';
    this.typingEl.style.display = '';
    this.app.audio.play('count');
  }

  private backToTavern() {
    this.app.go(new TavernScene());
  }

  private setOverlay(el: HTMLElement | null) {
    this.overlay?.remove();
    this.overlay = el;
    if (el) this.app.ui.append(el);
  }

  // ---------- 一時停止 ----------

  autoPause() {
    if (this.phase === 'countdown' || this.phase === 'play') this.pause();
  }

  private pause() {
    if (this.paused) return;
    this.paused = true;
    this.setOverlay(
      settingsPanel(this.app, () => this.resume(), [
        h('button', { class: 'ghost', onclick: () => this.endEarly() }, 'ここで切り上げる（獲れた分は持ち帰る）'),
      ]),
    );
    const title = this.overlay!.querySelector('h2');
    if (title) title.textContent = '一時停止中';
    const closeBtn = this.overlay!.querySelector('button.primary');
    if (closeBtn) closeBtn.replaceChildren(key('Esc'), '再開する');
  }

  private resume() {
    this.paused = false;
    this.setOverlay(null);
    // 再開直後の誤入力を防ぐため短いカウントダウン
    if (this.phase === 'play') {
      this.phase = 'countdown';
      this.countdown = 1.5;
    }
  }

  private endEarly() {
    this.paused = false;
    this.setOverlay(null);
    this.finish();
  }

  // ---------- 進行 ----------

  update(dt: number) {
    this.t += dt;
    if (this.paused) return;
    stepFishingFx(this.fishFx, dt);
    stepHuntingFx(this.huntFx, dt);
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) this.app.audio.play('count');
      if (this.countdown <= 0) {
        this.phase = 'play';
        this.app.audio.play('start');
      }
    } else if (this.phase === 'play' && this.model) {
      this.model.update(dt);
      this.handleEvents(new Map());
      if (this.model.finished) this.finish();
    } else if (this.phase === 'finish') {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.showResult();
    }
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.1;
      this.updateHud();
    }
    this.updateTyping();
    this.updateLabels();
  }

  private finish() {
    if (this.phase === 'finish' || this.phase === 'result' || !this.model || this.token === null) return;
    this.phase = 'finish';
    this.finishTimer = 1.2;
    this.result = this.model.result();
    // 結果はこの時点で反映・保存（同じ token では二度反映されない）
    completeActivity(this.app.state!, this.token, this.result);
    this.app.save();
    this.app.audio.play('end');
    this.setOverlay(h('div', { class: 'countdown' }, '終了！'));
  }

  private handleEvents(snapshot: Map<number, Prey>) {
    const m = this.model!;
    for (const ev of m.drainEvents()) {
      switch (ev.type) {
        case 'key':
          if (ev.ok) this.app.audio.play('key');
          else {
            this.app.audio.play('miss');
            this.lastMiss = this.t;
            this.huntFx.missFlash = 0.25;
          }
          break;
        case 'word':
          this.app.audio.play('word');
          break;
        case 'bite':
          this.app.audio.play('bite');
          fishingSplash(this.fishFx, m as FishingModel);
          if (ev.big) this.app.toast('大物が掛かった！ 語句3つで釣り上げろ', 1800);
          break;
        case 'catch': {
          const big = ev.item.ingredient === 'bigFish' || ev.item.ingredient === 'bigMeat';
          this.app.audio.play(big ? 'big' : 'catch');
          if (this.kind === 'fishing') {
            this.fishFx.jump = { t: 0, big };
            fishingSplash(this.fishFx, m as FishingModel);
            if (big) this.fishFx.bigBasket++;
            else this.fishFx.basket++;
          }
          break;
        }
        case 'hit': {
          const p = snapshot.get(ev.targetId);
          if (p) huntingShot(this.huntFx, p, p.hp <= 0);
          break;
        }
        case 'escape':
          this.app.audio.play('escape');
          break;
      }
    }
  }

  // ---------- 入力 ----------

  onKey(e: KeyboardEvent) {
    if (this.phase === 'intro') {
      if (e.key === ' ' || e.key === 'Enter') {
        (this.overlay?.querySelector('button.primary') as HTMLButtonElement | null)?.click();
        return true;
      }
      if (e.key === 'Escape' && this.token === null) {
        this.backToTavern();
        return true;
      }
      return false;
    }
    if (this.phase === 'result') {
      if (e.key === 'Enter' || e.key === ' ') {
        (this.overlay?.querySelector('button.primary') as HTMLButtonElement | null)?.click();
        return true;
      }
      return false;
    }
    if (e.key === 'Escape') {
      if (this.paused) this.resume();
      else if (this.phase === 'countdown' || this.phase === 'play') this.pause();
      return true;
    }
    if (this.paused || this.phase !== 'play' || !this.model) {
      // 入力欄以外ではスペース等によるスクロールを止める
      return e.key === ' ' || e.key === 'Backspace';
    }
    if (e.key === 'Backspace') {
      this.model.control?.('release');
      return true;
    }
    if (e.key.length === 1 && TYPABLE.test(e.key)) {
      const snapshot = this.model instanceof HuntingModel ? new Map(this.model.prey.map((p) => [p.id, p])) : new Map();
      this.model.key(e.key);
      this.handleEvents(snapshot);
      if (this.model.finished) this.finish();
      this.updateTyping();
      return true;
    }
    return e.key === ' ';
  }

  // ---------- UI ----------

  private updateHud() {
    const m = this.model;
    if (!m) return;
    const r = m.result();
    const left = m.timeLeft;
    const pct = (left / m.duration) * 100;
    const kps = speedKps(r);
    const acc = accuracy(r);
    this.hudEl.replaceChildren(
      h('span', null, this.kind === 'fishing' ? '釣り' : '狩り'),
      h('span', null, '残り ', h('span', { class: 'warm' }, `${left.toFixed(1)}秒`)),
      h('div', { class: `timebar ${left < 8 ? 'low' : ''}` }, h('i', { style: `width:${pct}%` })),
      h('span', null, '速さ ', h('span', { class: 'warm' }, kps.toFixed(1)), h('span', { class: 'dim small' }, ' 打鍵/秒')),
      h('span', null, '正確さ ', h('span', { class: 'warm' }, `${(acc * 100).toFixed(0)}%`)),
      h('span', { class: 'spacer' }),
      h('span', { class: 'small dim' }, key('Esc'), '一時停止'),
    );
    if (this.phase !== 'intro') this.sideEl.replaceChildren(...this.sideInfo(r));
  }

  private haulLines(r: ActivityResult) {
    const map = new Map<IngredientId, number>();
    for (const c of r.catches) map.set(c.ingredient, (map.get(c.ingredient) ?? 0) + c.count);
    if (map.size === 0) return [h('div', { class: 'dim' }, 'まだ何も獲れていない')];
    return [...map].map(([id, n]) => h('div', null, `${INGREDIENTS[id].name} ×${n}`));
  }

  private sideInfo(r: ActivityResult): HTMLElement[] {
    const m = this.model!;
    const out: HTMLElement[] = [h('div', { class: 'warm' }, '今回の収穫'), ...this.haulLines(r)];
    if (m instanceof FishingModel) {
      const cells = Array.from({ length: FISHING.calmToBig }, (_, i) =>
        h('i', { class: m.calm >= i + 1 ? 'on' : m.calm >= i + 0.5 ? 'half' : '' }));
      out.push(
        h('div', { style: 'margin-top: calc(var(--u) * 2)' }, '水面の静けさ'),
        h('div', { class: 'gauge' }, ...cells),
        h('div', { class: 'tiny dim' }, m.calm >= FISHING.calmToBig ? '満ちた。次は大物が掛かる！' : 'ミスなく語句を打つとたまる。2回以上ミスすると減る。'),
      );
      if (m.fish) {
        out.push(
          h('div', { style: 'margin-top: calc(var(--u) * 2)' },
            m.fish.big ? h('span', { class: 'warm' }, '大ナマズ') : '川魚', ` 釣り上げ ${m.fish.wordsDone}/${m.fish.wordsNeeded}`),
          h('div', { class: 'tiny dim' }, `この魚へのミス ${m.fish.misses}回 → 予想品質 `, stars(predictQuality('fishing', m.fish.big, m.fish.misses))),
        );
      }
    } else if (m instanceof HuntingModel) {
      out.push(h('div', { class: 'small', style: 'margin-top: calc(var(--u) * 2)' }, `逃げられた ${r.escapes}匹`));
      const t = m.locked;
      if (t) {
        out.push(
          h('div', { class: 'small' }, `狙い: ${t.kind === 'deer' ? '鉄角ジカ' : '砂ウサギ'} 残り${t.hp}発`),
          h('div', { class: 'tiny dim' }, `この獲物へのミス ${t.misses}回 → 予想品質 `, stars(predictQuality('hunting', t.kind === 'deer', t.misses))),
        );
      }
      out.push(h('div', { class: 'tiny dim', style: 'margin-top: calc(var(--u) * 1.5)' }, key('BS'), '狙いを外す'));
    }
    return out;
  }

  private updateTyping() {
    const m = this.model;
    if (!m || this.phase === 'intro' || this.phase === 'result') return;
    let matcher: RomajiMatcher | null = null;
    let text = '';
    let msg = '';
    if (m instanceof FishingModel) {
      if (m.phase === 'hooked' && m.matcher && m.word) {
        matcher = m.matcher;
        text = m.word.text;
      } else if (m.phase === 'landing') msg = '釣り上げた！';
      else if (m.phase === 'waiting') msg = '浮きを見つめている…';
    } else if (m instanceof HuntingModel) {
      const t = m.locked;
      if (t) {
        matcher = t.matcher;
        text = t.word.text;
      } else msg = m.prey.length ? '狙う獲物の単語の、最初の1文字を打つ' : '獲物を待っている…';
    }
    if (this.phase === 'countdown') msg = '準備…';
    if (this.phase === 'finish') msg = '終了！';
    const missOn = this.t - this.lastMiss < 0.25;
    const sig = `${text}|${matcher?.typed ?? ''}|${matcher?.kanaPos ?? ''}|${msg}|${missOn}`;
    if (sig === this.typingSig) return;
    this.typingSig = sig;
    this.typingEl.classList.toggle('missed', missOn);
    if (!matcher) {
      this.typingEl.replaceChildren(h('div', { class: 'w-text' }, ' '), h('div', { class: 'hint' }, msg));
      return;
    }
    const rest = matcher.remaining;
    const kana = matcher.reading;
    this.typingEl.replaceChildren(
      h('div', { class: 'w-text' }, text),
      h('div', { class: 'w-kana' },
        h('span', { class: 'done' }, kana.slice(0, matcher.kanaPos)), kana.slice(matcher.kanaPos)),
      h('div', { class: 'w-roma' },
        h('span', { class: 'typed' }, matcher.typed),
        h('span', { class: `next ${missOn ? 'err' : ''}` }, rest.slice(0, 1)),
        h('span', { class: 'rest' }, rest.slice(1)),
      ),
    );
  }

  private updateLabels() {
    const m = this.model;
    if (!(m instanceof HuntingModel) || this.phase === 'intro' || this.phase === 'result') {
      if (this.labels.size) {
        this.labelsEl.replaceChildren();
        this.labels.clear();
      }
      return;
    }
    const alive = new Set<number>();
    for (const p of m.prey) {
      alive.add(p.id);
      let entry = this.labels.get(p.id);
      if (!entry) {
        entry = { el: h('div', { class: `prey-label ${p.kind}` }), sig: '' };
        this.labels.set(p.id, entry);
        this.labelsEl.append(entry.el);
      }
      const s = preyScreen(p);
      const top = s.y - (p.kind === 'deer' ? 40 : 24);
      entry.el.style.left = `calc(var(--u) * ${s.x.toFixed(1)})`;
      entry.el.style.top = `calc(var(--u) * ${top.toFixed(1)})`;
      const locked = m.lockId === p.id;
      const sig = `${p.word.kana}|${p.matcher.typed}|${locked}`;
      if (sig !== entry.sig) {
        entry.sig = sig;
        entry.el.classList.toggle('locked', locked);
        const rest = p.matcher.remaining;
        entry.el.replaceChildren(
          h('div', null, p.word.text),
          h('div', { class: 'roma' },
            h('span', { class: 'typed' }, p.matcher.typed),
            h('span', { class: p.matcher.typed ? '' : 'first' }, rest.slice(0, 1)),
            h('span', { class: 'rest' }, rest.slice(1)),
          ),
        );
      }
    }
    for (const [id, entry] of this.labels) {
      if (!alive.has(id)) {
        entry.el.remove();
        this.labels.delete(id);
      }
    }
  }

  // ---------- 結果 ----------

  private showResult() {
    this.phase = 'result';
    this.updateLabels();
    this.typingEl.style.display = 'none';
    this.sideEl.style.display = 'none';
    const r = this.result!;
    const groups = new Map<string, { id: IngredientId; q: Quality; n: number }>();
    for (const c of r.catches) {
      const k = `${c.ingredient}:${c.quality}`;
      const g = groups.get(k) ?? { id: c.ingredient, q: c.quality, n: 0 };
      g.n += c.count;
      groups.set(k, g);
    }
    const chips = [...groups.values()]
      .sort((a, b) => b.q - a.q)
      .map((g) => h('div', { class: 'catch-chip' }, INGREDIENTS[g.id].name, ' ', stars(g.q), ` ×${g.n}`));
    const total = r.catches.reduce((a, c) => a + c.count, 0);
    const big = r.catches.filter((c) => c.ingredient === 'bigFish' || c.ingredient === 'bigMeat').length;
    const kps = speedKps(r);
    const acc = accuracy(r);
    const tips: string[] = [];
    if (this.kind === 'fishing') {
      if (big === 0) tips.push('大物はミスの少ない語句を続けると掛かる。');
      else tips.push(`大物を${big}回釣り上げた。`);
    } else {
      if (r.escapes > 0) tips.push(`${r.escapes}匹に逃げられた。逃げそうな獲物を先に狙うか、早めに Backspace で切り替えよう。`);
      if (big > 0) tips.push(`鉄角ジカを${big}頭仕留めた。`);
    }
    if (acc < 0.9) tips.push('ミスを減らすと★の高い食材になり、料理が高く売れる（★3は1.7倍）。');
    this.setOverlay(
      h('div', { class: 'backdrop' },
        h('div', { class: 'panel', style: 'width: calc(var(--u) * 250)' },
          h('h2', null, `${this.kind === 'fishing' ? '釣り' : '狩り'}の成果`),
          chips.length ? h('div', { class: 'catch-list' }, ...chips) : h('p', { class: 'dim' }, '今回は何も獲れなかった…'),
          h('div', { class: 'stats' },
            stat(`${total}`, '獲れた食材'),
            stat(kps.toFixed(2), '速さ（打鍵/秒）'),
            stat(`${(acc * 100).toFixed(1)}%`, '正確さ'),
            stat(`${r.correctKeys}`, '正しく打った打鍵数'),
          ),
          h('p', { class: 'tiny dim' }, `速さ ＝ 正しい打鍵数 ÷ 入力できた時間（${r.activeSeconds.toFixed(1)}秒、魚待ち等は除く）。正確さ ＝ 正しい打鍵 ÷（正しい打鍵＋ミス${r.missKeys}回）。品質の価格倍率 ${STARS.map((s, i) => `${s}×${QUALITY_PRICE[i]}`).join('　')}`),
          tips.length ? h('ul', { class: 'notes small' }, ...tips.map((t) => h('li', null, t))) : null,
          h('div', { class: 'modal-foot' }, onceButton([key('Enter'), '酒場に戻る'], () => this.backToTavern(), { class: 'primary' })),
        ),
      ),
    );
  }

  render(ctx: CanvasRenderingContext2D) {
    const m = this.model;
    if (!m) return;
    const reduce = this.app.settings.reduceEffects;
    if (m instanceof FishingModel) drawFishing(ctx, m, this.fishFx, this.t, reduce);
    else if (m instanceof HuntingModel) drawHunting(ctx, m, this.huntFx, this.t, reduce);
    if (this.phase === 'countdown' && !this.paused) {
      const n = Math.ceil(this.countdown);
      const el = this.overlay;
      if (!el || !el.classList.contains('countdown')) this.setOverlay(h('div', { class: 'countdown' }, String(n)));
      else if (el.textContent !== String(n)) el.textContent = String(n);
    } else if (this.phase === 'play' && this.overlay?.classList.contains('countdown')) {
      this.setOverlay(null);
    }
  }
}

function stat(v: string, l: string) {
  return h('div', { class: 'stat' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
}

function predictQuality(kind: ActivityKind, big: boolean, misses: number): Quality {
  const lim = kind === 'fishing'
    ? big ? FISHING.qualityMisses.big : FISHING.qualityMisses.small
    : big ? HUNTING.qualityMisses.deer : HUNTING.qualityMisses.rabbit;
  return misses <= lim[0] ? 2 : misses <= lim[1] ? 1 : 0;
}
