import type { App, Scene } from '../app';
import { fmt, h, key } from '../dom';
import { drawWorld, tavernCenter, WORLD_W } from '../art/world';
import { W } from '../art/px';
import { newGame } from '../../core/game';
import { randomSeed } from '../../core/rng';
import { RUN } from '../../core/config';
import { settingsPanel } from './common';
import { TavernScene } from './tavern';
import { ActivityScene } from './activity';

export class TitleScene implements Scene {
  private app!: App;
  private overlay: HTMLElement | null = null;
  private seedInput!: HTMLInputElement;

  enter(app: App) {
    this.app = app;
    app.audio.setBgm('tavern');
    const saved = app.store.loadRun();
    const best = app.store.loadBest();
    const last = app.store.loadLast();
    this.seedInput = h('input', { type: 'text', placeholder: 'ランダム', maxlength: '9', inputmode: 'numeric' });

    const menu = h('div', { class: 'title-menu' },
      saved
        ? h('button', { class: 'primary', onclick: () => this.continueRun() }, key('C'), `続きから（${saved.state.day}日目）`)
        : null,
      h('button', { class: saved ? '' : 'primary', onclick: () => this.newRun() }, key('N'), 'はじめから'),
      h('button', { onclick: () => this.showHowto() }, key('H'), '遊び方'),
      h('button', { onclick: () => this.showSettings() }, key('S'), '設定'),
      h('label', { class: 'row small dim', style: 'justify-content:center' }, 'シード指定', this.seedInput),
    );

    this.app.ui.append(
      h('div', { class: 'title-wrap' },
        h('div', { class: 'logo' }, 'LAST ORDER'),
        h('div', { class: 'logo-sub' }, '― 崩壊後の酒場で、タイピングで食材を集める ―　（仮題）'),
        menu,
      ),
      h('div', { class: 'title-foot' },
        h('span', null,
          best ? `自己ベスト ${fmt(best.score.total)}点（${best.score.rank}）` : '自己ベスト ―',
          last ? `　／　前回 ${fmt(last.score.total)}点` : '',
        ),
        h('span', null, `一周 ${RUN.days}日・約20〜30分　｜　`, h('a', { href: '#', style: 'color:inherit', onclick: (e: Event) => { e.preventDefault(); this.showCredits(); } }, 'クレジット')),
      ),
    );
  }

  private newRun() {
    if (this.app.store.loadRun() && !window.confirm('途中のデータがあります。はじめから遊ぶと上書きされます。よろしいですか？')) return;
    const raw = this.seedInput.value.trim();
    const seed = /^\d{1,9}$/.test(raw) ? Number(raw) : randomSeed();
    startRun(this.app, seed);
  }

  private continueRun() {
    const saved = this.app.store.loadRun();
    if (!saved) return;
    this.app.state = saved.state;
    this.app.playSeconds = saved.playSeconds;
    const p = saved.state.pending;
    if (p) {
      // 調達の途中で中断していた場合は、その調達を最初からやり直す（行動回数は消費済み）
      saved.state.restartedActivities++;
      this.app.go(new ActivityScene(p.kind, p.token));
      this.app.toast('中断した調達を最初からやり直します');
    } else {
      this.app.go(new TavernScene({ banner: true }));
    }
  }

  private closeOverlay() {
    this.overlay?.remove();
    this.overlay = null;
  }

  private showSettings() {
    this.closeOverlay();
    this.overlay = settingsPanel(this.app, () => this.closeOverlay());
    this.app.ui.append(this.overlay);
  }

  private showHowto() {
    this.closeOverlay();
    this.overlay = howtoPanel(() => this.closeOverlay());
    this.app.ui.append(this.overlay);
  }

  private showCredits() {
    this.closeOverlay();
    this.overlay = h('div', { class: 'backdrop' },
      h('div', { class: 'panel', style: 'width: calc(var(--u) * 240)' },
        h('h2', null, 'クレジット'),
        h('p', null, 'フォント: DotGothic16（Fontworks） — SIL Open Font License 1.1'),
        h('p', { class: 'small dim' }, 'ピクセルアート・効果音・BGMはすべてプログラムで生成した仮素材です。最終的なアートではありません。'),
        h('p', { class: 'small dim' }, 'タイトル「LAST ORDER」は仮題です。'),
        h('div', { class: 'modal-foot' }, h('button', { class: 'primary', onclick: () => this.closeOverlay() }, key('Esc'), '閉じる')),
      ),
    );
    this.app.ui.append(this.overlay);
  }

  onKey(e: KeyboardEvent) {
    if (this.overlay) {
      if (e.key === 'Escape') {
        this.closeOverlay();
        return true;
      }
      return false;
    }
    const k = e.key.toLowerCase();
    if (k === 'n') this.newRun();
    else if (k === 'c' && this.app.store.loadRun()) this.continueRun();
    else if (k === 'h') this.showHowto();
    else if (k === 's' || e.key === 'Escape') this.showSettings();
    else return false;
    return true;
  }

  render(ctx: CanvasRenderingContext2D, t: number) {
    const center = tavernCenter() - W / 2;
    const camX = Math.max(0, Math.min(WORLD_W - W, center + Math.sin(t * 0.08) * 60));
    drawWorld(ctx, camX, {
      tod: 'dusk', levels: { seats: 0, kitchen: 0, sign: 1 }, t, reduce: this.app.settings.reduceEffects, customers: [], busy: false,
    });
  }
}

export function startRun(app: App, seed: number) {
  app.state = newGame(seed);
  app.playSeconds = 0;
  app.save();
  app.go(new TavernScene({ banner: true, firstDay: true }));
}

export function howtoPanel(onClose: () => void) {
  return h('div', { class: 'backdrop' },
    h('div', { class: 'panel modal' },
      h('h2', null, '遊び方'),
      h('div', { class: 'cards' },
        h('div', { class: 'card' },
          h('h3', null, '1. 昼：調達に出る（1日3回）'),
          h('ul', null,
            h('li', null, '釣りか狩りを選び、タイピングで食材を集めます。'),
            h('li', null, '速く打つほど多く、ミスが少ないほど品質（★）の高い食材が手に入ります。'),
            h('li', null, '日本語の読みをローマ字で入力します。shi / si などの一般的な綴りはどれでも受け付けます。'),
          ),
        ),
        h('div', { class: 'card' },
          h('h3', null, '2. 料理してメニューに載せる'),
          h('ul', null,
            h('li', null, '食材から料理を作り、メニューに載せます。この操作は時間を使いません。'),
            h('li', null, '魚と肉を組み合わせた料理は高く売れます。'),
            h('li', null, '朝に出る「今日の噂」に合う料理を出すと客が増えます。'),
          ),
        ),
        h('div', { class: 'card' },
          h('h3', null, '3. 夜：開店（自動営業）'),
          h('ul', null,
            h('li', null, '「開店する」を押すと、その日が終わり自動で営業します。'),
            h('li', null, '売れる数は「来客」「席」「料理の在庫」のうち一番少ないものまで。'),
          ),
        ),
        h('div', { class: 'card' },
          h('h3', null, `4. 設備を改善して${RUN.days}日間を乗り切る`),
          h('ul', null,
            h('li', null, '客席・厨房・看板を買うと店が大きくなります。'),
            h('li', null, 'スコア ＝ 所持金 ＋ 設備の評価額（購入額の半分）＋ 評判。'),
            h('li', null, '終盤の買い物は元が取れるか考えましょう。'),
          ),
        ),
      ),
      h('p', { class: 'small dim' }, 'Esc：設定・一時停止　／　調達中にウィンドウから離れると自動で一時停止します。'),
      h('div', { class: 'modal-foot' }, h('button', { class: 'primary', onclick: onClose }, key('Esc'), '閉じる')),
    ),
  );
}
