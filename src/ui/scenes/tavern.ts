import type { App, Scene } from '../app';
import { fmt, h, key, onceButton, stars } from '../dom';
import { drawWorld, tavernCenter, WORLD_W, type WorldCustomer } from '../art/world';
import { CUSTOMER_LOOKS } from '../art/actors';
import { W } from '../art/px';
import {
  CURRENCY, EFFECTS, INGREDIENTS, QUALITY_PRICE, RECIPES, RECIPE_ORDER, RUN, SCORE, TRENDS, UPGRADES, UPGRADE_ORDER,
  type ActivityKind, type IngredientId, type Quality, type RecipeId, type UpgradeId,
} from '../../core/config';
import {
  buyUpgrade, capacity, cook, cookableCount, kitchenCap, kitchenLeft, menuDishCount, menuSlots, nightsLeft, openTavern,
  sum, toggleMenu, upgradeCost, visitorsFor, type GameState,
} from '../../core/game';
import { qualitySplit, settingsPanel, stockBox } from './common';
import { ActivityScene } from './activity';
import { NightScene } from './night';
import { TitleScene, howtoPanel } from './title';

type Panel = 'none' | 'select' | 'kitchen' | 'upgrade' | 'open' | 'settings' | 'howto';

export class TavernScene implements Scene {
  countsPlayTime = true;
  private app!: App;
  private s!: GameState;
  private panel: Panel = 'none';
  private overlay: HTMLElement | null = null;
  private hudEl!: HTMLElement;
  private stockEl!: HTMLElement;
  private barEl!: HTMLElement;
  private camX = tavernCenter() - W / 2;
  private camVel = 0;
  private regulars: WorldCustomer[] = [];

  constructor(private opts: { banner?: boolean; firstDay?: boolean } = {}) {}

  enter(app: App) {
    this.app = app;
    this.s = app.state!;
    app.audio.setBgm('tavern');
    this.hudEl = h('div', { class: 'hud' });
    this.stockEl = h('div');
    this.barEl = h('div', { class: 'actionbar' });
    app.ui.append(this.hudEl, this.stockEl, this.barEl);
    this.refresh();
    // 評判が上がると昼間も常連が座っている
    const regularCount = Math.min(3, Math.floor(this.s.reputation / 25));
    this.regulars = Array.from({ length: regularCount }, (_, i) => ({
      x: 330 + 47 + i * 11, look: CUSTOMER_LOOKS[(i * 2 + 2) % CUSTOMER_LOOKS.length], state: 'sit', flip: true, frame: 0,
    }));
    if (this.opts.banner) {
      const trend = TRENDS[this.s.trend];
      app.ui.append(
        h('div', { class: 'banner' },
          h('div', { class: 'big' }, `${this.s.day}日目の朝`),
          h('div', null, '今日の噂：', h('span', { class: 'trend' }, trend.name)),
          h('div', { class: 'small dim' }, trend.desc),
        ),
      );
    }
    if (this.opts.firstDay) window.setTimeout(() => this.app.toast('まずは「調達に出る」で食材を集めよう', 3500), 1500);
  }

  // ---------- 表示更新 ----------

  private refresh() {
    const s = this.s;
    const trend = TRENDS[s.trend];
    const pips = Array.from({ length: RUN.actionsPerDay }, (_, i) =>
      h('span', { class: i < s.actionsLeft ? 'pip-on' : 'pip-off' }, i < s.actionsLeft ? '●' : '○'));
    this.hudEl.replaceChildren(
      h('span', null, h('span', { class: 'big' }, `${s.day}日目`), h('span', { class: 'dim' }, ` / ${RUN.days}日`)),
      h('span', null, '昼の行動 ', h('span', { class: 'pips' }, ...pips), h('span', { class: 'dim small' }, ` 残り${s.actionsLeft}回`)),
      h('span', null, '所持金 ', h('span', { class: 'big' }, `${fmt(s.cash)}`), h('span', { class: 'dim' }, ` ${CURRENCY}`)),
      h('span', null, '評判 ', h('span', { class: 'warm' }, s.reputation.toFixed(1))),
      h('span', { class: 'spacer' }),
      h('span', { title: trend.desc }, '今日の噂：', h('span', { class: 'trend' }, trend.name)),
    );
    this.stockEl.replaceChildren(stockBox(s));
    const noAction = s.actionsLeft <= 0;
    this.barEl.replaceChildren(
      h('button', { class: noAction ? '' : 'primary', disabled: noAction, onclick: () => this.open('select') },
        h('span', null, key('1'), '調達に出る'), h('span', { class: 'tag time' }, '⏳ 行動を1回使う')),
      h('button', { onclick: () => this.open('kitchen') },
        h('span', null, key('2'), '料理・メニュー'), h('span', { class: 'tag free' }, '時間を使わない')),
      h('button', { onclick: () => this.open('upgrade') },
        h('span', null, key('3'), '設備を改善'), h('span', { class: 'tag free' }, '時間を使わない')),
      h('button', { class: noAction ? 'primary' : '', onclick: () => this.open('open') },
        h('span', null, key('4'), '開店する'), h('span', { class: 'tag time' }, '⏳ 今日を終えて夜へ')),
      h('span', { class: 'spacer' }),
      h('div', { class: 'col small dim', style: 'justify-content:center; gap:0' },
        h('span', null, `客席 ${capacity(s)}人/夜　厨房 残り${kitchenLeft(s)}/${kitchenCap(s)}皿`),
        h('span', null, `メニュー ${s.menu.length}/${menuSlots(s)}品・${menuDishCount(s)}皿　`, key('←→'), '見回す'),
      ),
      h('button', { class: 'ghost small', onclick: () => this.open('settings') }, key('Esc'), '設定'),
    );
  }

  private open(p: Panel) {
    this.close();
    this.panel = p;
    this.app.audio.play('click');
    this.renderPanel();
  }

  private close() {
    this.overlay?.remove();
    this.overlay = null;
    this.panel = 'none';
  }

  private renderPanel() {
    let el: HTMLElement | null = null;
    switch (this.panel) {
      case 'select': el = this.selectPanel(); break;
      case 'kitchen': el = this.kitchenPanel(); break;
      case 'upgrade': el = this.upgradePanel(); break;
      case 'open': el = this.openPanel(); break;
      case 'settings':
        el = settingsPanel(this.app, () => this.close(), [
          h('button', { class: 'ghost', onclick: () => this.open('howto') }, '遊び方'),
          h('button', { class: 'ghost', onclick: () => { this.app.save(); this.app.go(new TitleScene()); } }, '保存してタイトルへ'),
        ]);
        break;
      case 'howto': el = howtoPanel(() => this.close()); break;
    }
    if (!el) return;
    const prevScroll = this.overlay?.querySelector('.modal')?.scrollTop ?? 0;
    this.overlay?.remove();
    this.overlay = el;
    this.app.ui.append(el);
    const m = el.querySelector('.modal');
    if (m) m.scrollTop = prevScroll;
  }

  /** 状態が変わったら保存して表示を更新 */
  private changed() {
    this.app.save();
    this.refresh();
    this.renderPanel();
  }

  // ---------- 調達先の選択 ----------

  private selectPanel() {
    const s = this.s;
    const card = (kind: ActivityKind, k: string, title: string, lines: string[], yields: string) =>
      h('div', { class: 'card pick', tabindex: '0', onclick: () => this.goActivity(kind) },
        h('h3', null, key(k), title),
        h('ul', null, ...lines.map((l) => h('li', null, l))),
        h('div', { class: 'small teal' }, yields),
      );
    const trend = TRENDS[s.trend];
    return h('div', { class: 'backdrop' },
      h('div', { class: 'panel modal' },
        h('div', { class: 'modal-head' },
          h('h2', null, 'どこへ調達に出る？'),
          h('span', { class: 'tag time' }, `⏳ 開始すると行動を1回使う（残り${s.actionsLeft}回）`),
        ),
        h('div', { class: 'cards' },
          card('fishing', 'F', '釣り ― 水没した街の貯水池', [
            '少し長めの語句を落ち着いて打つ。',
            '失敗のリスクがほぼ無く、安定して集まる。',
            'ミスなく打ち続けると水面が静まり、大物「大ナマズ」が掛かる。',
          ], `手に入る: ${INGREDIENTS.smallFish.name}・${INGREDIENTS.bigFish.name}`),
          card('hunting', 'H', '狩り ― 崩れた高架下の荒野', [
            '短い単語を素早く打つ。最初の1文字で狙う獲物が決まる。',
            '大物「鉄角ジカ」は高く売れるが、時間内に倒さないと逃げられる。',
            'ミスすると獲物が驚いて足が速くなる。',
          ], `手に入る: ${INGREDIENTS.smallMeat.name}・${INGREDIENTS.bigMeat.name}`),
        ),
        h('p', { class: 'small' },
          '今日の噂：', h('span', { class: 'trend' }, trend.name), h('span', { class: 'dim' }, `（${trend.desc}）`)),
        h('p', { class: 'small dim' }, '魚と肉の両方を使う料理（盛り合わせ・大皿）は、厨房1皿分の手間で高く売れます。'),
        h('div', { class: 'modal-foot' }, h('button', { onclick: () => this.close() }, key('Esc'), '戻る')),
      ),
    );
  }

  private goActivity(kind: ActivityKind) {
    if (this.s.actionsLeft <= 0) return;
    this.app.go(new ActivityScene(kind, null));
  }

  // ---------- 料理・メニュー ----------

  private kitchenPanel() {
    const s = this.s;
    const ingRows = (Object.keys(INGREDIENTS) as IngredientId[]).map((id) =>
      h('tr', null, h('td', null, INGREDIENTS[id].name), h('td', { class: 'num' }, qualitySplit(s.ingredients[id]))));

    const nextQuality = (id: RecipeId): Quality | null => {
      let total = 0, n = 0;
      for (const [ing, need] of Object.entries(RECIPES[id].needs)) {
        const st = s.ingredients[ing as IngredientId];
        const q = st[2] > 0 ? 2 : st[1] > 0 ? 1 : st[0] > 0 ? 0 : -1;
        if (q < 0) return null;
        total += q * need!;
        n += need!;
      }
      return Math.round(total / n) as Quality;
    };

    const recipeRows = RECIPE_ORDER.map((id) => {
      const r = RECIPES[id];
      const can = cookableCount(s, id);
      const nq = nextQuality(id);
      const needs = Object.entries(r.needs).map(([ing, n]) => `${INGREDIENTS[ing as IngredientId].name}×${n}`).join(' + ');
      const onMenu = s.menu.includes(id);
      const menuFull = !onMenu && s.menu.length >= menuSlots(s);
      const doCook = (n: number) => {
        const made = cook(s, id, n);
        if (made > 0) {
          this.app.audio.play('word');
          this.changed();
        }
      };
      return h('tr', { class: can === 0 && sum(s.dishes[id]) === 0 ? 'off' : '' },
        h('td', null, r.name, h('div', { class: 'tiny dim' }, needs)),
        h('td', { class: 'num' }, `${r.price}`, h('div', { class: 'tiny dim' }, QUALITY_PRICE.map((m) => Math.round(r.price * m)).join('/'))),
        h('td', { class: 'num' }, `${sum(s.dishes[id])}`, h('div', { class: 'tiny' }, qualitySplit(s.dishes[id]))),
        h('td', null,
          h('div', { class: 'row', style: 'gap: calc(var(--u) * 1)' },
            h('button', { class: 'small', disabled: can < 1, onclick: () => doCook(1) }, '+1'),
            h('button', { class: 'small', disabled: can < 2, onclick: () => doCook(5) }, '+5'),
            h('button', { class: 'small', disabled: can < 1, onclick: () => doCook(can) }, '最大'),
          ),
          h('div', { class: 'tiny dim' }, can > 0 ? ['作れる ', String(can), '皿 ・次は', nq !== null ? stars(nq) : '―'] : '材料か厨房の余力が足りない'),
        ),
        h('td', null,
          h('button', {
            class: onMenu ? 'small primary' : 'small', disabled: menuFull,
            onclick: () => { if (toggleMenu(s, id)) { this.app.audio.play('click'); this.changed(); } },
          }, onMenu ? '◆ 載せている' : '載せる'),
        ),
      );
    });

    const menuWarn = s.menu.length === 0 ? h('span', { class: 'bad small' }, 'メニューが空です。料理を載せないと開店しても客が来ません。') : null;

    return h('div', { class: 'backdrop' },
      h('div', { class: 'panel modal' },
        h('div', { class: 'modal-head' },
          h('h2', null, '厨房・メニュー'),
          h('span', { class: 'tag free' }, 'この画面の操作は時間を使わない'),
        ),
        h('div', { class: 'kitchen-grid' },
          h('div', null,
            h('h3', null, '食材 ', h('span', { class: 'tiny dim' }, '★1/★2/★3')),
            h('table', { class: 'grid' }, h('tbody', null, ...ingRows)),
            h('p', { class: 'small' }, '今日あと ', h('span', { class: 'warm' }, `${kitchenLeft(s)}`), ` / ${kitchenCap(s)} 皿 作れる`,
              h('div', { class: 'tiny dim' }, `厨房Lv${s.levels.kitchen}。厨房を改善すると増える。`)),
            h('p', { class: 'small' }, 'メニュー ', h('span', { class: 'warm' }, `${s.menu.length} / ${menuSlots(s)} 品`),
              h('div', { class: 'tiny dim' }, '品数が多いほど客が集まる。看板・内装で枠が増える。')),
            h('p', { class: 'tiny dim' }, '料理の品質は使った食材の平均（良い食材から使う）。価格は★2で1.3倍、★3で1.7倍。売れ残った料理は翌日に持ち越せる。'),
          ),
          h('div', null,
            h('table', { class: 'grid' },
              h('thead', null, h('tr', null,
                h('th', null, '料理'), h('th', { class: 'num' }, `価格 ${CURRENCY}`), h('th', { class: 'num' }, '在庫'), h('th', null, '作る'), h('th', null, 'メニュー'))),
              h('tbody', null, ...recipeRows),
            ),
          ),
        ),
        h('div', { class: 'modal-foot' },
          h('button', { class: 'primary', onclick: () => this.close() }, key('Esc'), '閉じる'),
          menuWarn,
          h('span', { class: 'spacer' }),
          h('span', { class: 'small dim' }, `今夜メニューに出る料理: ${menuDishCount(s)}皿`),
        ),
      ),
    );
  }

  // ---------- 設備 ----------

  private upgradePanel() {
    const s = this.s;
    const nights = nightsLeft(s);
    const effect = (id: UpgradeId, lv: number) => {
      switch (id) {
        case 'seats': return `客席 ${EFFECTS.seats[lv]}席（一晩 ${EFFECTS.seats[lv] * EFFECTS.turnsPerNight}人まで）`;
        case 'kitchen': return `1日に ${EFFECTS.kitchenPerDay[lv]}皿 作れる`;
        case 'sign': return `来客 ×${EFFECTS.signAttract[lv].toFixed(1)}・メニュー ${EFFECTS.menuSlots[lv]}品`;
      }
    };
    const look: Record<UpgradeId, string[]> = {
      seats: ['天幕つきの離れができる', '離れにテーブルとカウンター席が増える', '外にパラソルのテラス席ができる'],
      kitchen: ['石窯が増える', '大きなフードと煙突がつく', '旧文明のプラズマグリルが動き出す'],
      sign: ['ネオン看板になる', '電球の縁取りと矢印がつく', 'ホログラム看板とサーチライト'],
    };
    const cards = UPGRADE_ORDER.map((id) => {
      const lv = s.levels[id];
      const cost = upgradeCost(s, id);
      const max = cost === null;
      const perNight = cost !== null ? Math.ceil((cost * (1 - SCORE.upgradeValueRate)) / Math.max(1, nights)) : 0;
      const rev = s.rev;
      return h('div', { class: 'card upgrade-card' },
        h('h3', null, UPGRADES[id].name, ' ', h('span', { class: 'lv' }, `Lv${lv}/${UPGRADES[id].costs.length}`)),
        h('div', { class: 'small dim' }, UPGRADES[id].desc),
        h('div', { class: 'small' }, '今：', effect(id, lv)),
        max
          ? h('div', { class: 'small good' }, '最大レベル')
          : [
              h('div', { class: 'small' }, '次：', h('span', { class: 'teal' }, effect(id, lv + 1))),
              h('div', { class: 'tiny dim' }, '見た目：', look[id][lv]),
              h('div', null, '価格 ', h('span', { class: 'cost' }, `${fmt(cost)} ${CURRENCY}`)),
              h('div', { class: 'tiny dim' },
                `スコアでは購入額の${Math.round(SCORE.upgradeValueRate * 100)}%が設備評価額として残る。残り${nights}夜で元を取るには、1夜あたり約+${perNight}${CURRENCY}の売上増が必要。`),
              onceButton(s.cash >= cost ? '買う' : '所持金が足りない', () => {
                if (buyUpgrade(s, id, rev)) {
                  this.app.audio.play('buy');
                  this.app.toast(`${UPGRADES[id].name}を改善した（Lv${s.levels[id]}）`);
                  this.changed();
                } else this.renderPanel();
              }, { class: 'primary', disabled: s.cash < cost }),
            ],
      );
    });
    return h('div', { class: 'backdrop' },
      h('div', { class: 'panel modal' },
        h('div', { class: 'modal-head' },
          h('h2', null, '設備を改善'),
          h('span', null, '所持金 ', h('span', { class: 'warm' }, `${fmt(s.cash)} ${CURRENCY}`)),
          h('span', { class: 'tag free' }, '時間を使わない'),
        ),
        h('div', { style: 'display:grid; grid-template-columns: repeat(3, 1fr); gap: calc(var(--u) * 3)' }, ...cards),
        h('p', { class: 'small dim' }, '売れる数は「来客」「席」「料理」のうち一番少ないもので決まる。足りないものを補おう。'),
        h('div', { class: 'modal-foot' }, h('button', { class: 'primary', onclick: () => this.close() }, key('Esc'), '閉じる')),
      ),
    );
  }

  // ---------- 開店 ----------

  private openPanel() {
    const s = this.s;
    const est = visitorsFor(s, 1);
    const dishes = menuDishCount(s);
    const cap = capacity(s);
    const warn: HTMLElement[] = [];
    if (s.actionsLeft > 0) warn.push(h('li', { class: 'warm' }, `昼の行動がまだ${s.actionsLeft}回残っています。開店すると今日の残り行動は使えません。`));
    if (s.menu.length === 0 || dishes === 0) warn.push(h('li', { class: 'bad' }, 'メニューに料理がありません。このままでは客が来ません。'));
    const limit = Math.min(est, cap, dishes);
    let hint = '';
    if (dishes > 0) {
      if (limit === dishes && dishes < Math.min(est, cap)) hint = '料理が足りなくなりそう。';
      else if (limit === cap && cap < est) hint = '席が足りなくなりそう。';
      else if (limit === est && est < Math.min(cap, dishes)) hint = '料理と席に余裕がある。客を呼べればもっと売れる。';
    }
    const rev = s.rev;
    return h('div', { class: 'backdrop' },
      h('div', { class: 'panel', style: 'width: calc(var(--u) * 210)' },
        h('h2', null, `${s.day}日目の夜：開店する？`),
        h('table', { class: 'grid' }, h('tbody', null,
          h('tr', null, h('td', null, '見込み客'), h('td', { class: 'num' }, `約${est}人`)),
          h('tr', null, h('td', null, '受け入れられる客'), h('td', { class: 'num' }, `${cap}人`)),
          h('tr', null, h('td', null, 'メニューの料理'), h('td', { class: 'num' }, `${dishes}皿（${s.menu.length}品）`)),
          h('tr', null, h('td', null, '今日の噂'), h('td', { class: 'num trend' }, TRENDS[s.trend].name)),
        )),
        hint ? h('p', { class: 'small teal' }, hint) : null,
        warn.length ? h('ul', { class: 'notes small' }, ...warn) : null,
        h('div', { class: 'modal-foot' },
          onceButton([key('Enter'), '開店する'], () => this.doOpen(rev), { class: 'primary' }),
          h('button', { onclick: () => this.close() }, key('Esc'), '戻る'),
        ),
      ),
    );
  }

  private doOpen(rev: number) {
    const s = this.s;
    const before = { levels: { ...s.levels } };
    const report = openTavern(s, rev);
    if (!report) return;
    this.app.save();
    if (s.phase === 'ended') this.app.store.clearRun();
    this.app.go(new NightScene(report, before.levels));
  }

  // ---------- 入力・描画 ----------

  onKey(e: KeyboardEvent) {
    const k = e.key;
    if (this.panel !== 'none') {
      if (k === 'Escape') {
        this.close();
        return true;
      }
      if (this.panel === 'select') {
        if (k.toLowerCase() === 'f') this.goActivity('fishing');
        else if (k.toLowerCase() === 'h') this.goActivity('hunting');
        else return false;
        return true;
      }
      if (this.panel === 'open' && k === 'Enter') {
        const btn = this.overlay?.querySelector('button.primary') as HTMLButtonElement | null;
        btn?.click();
        return true;
      }
      return false;
    }
    switch (k) {
      case '1': if (this.s.actionsLeft > 0) this.open('select'); return true;
      case '2': this.open('kitchen'); return true;
      case '3': this.open('upgrade'); return true;
      case '4': this.open('open'); return true;
      case 'Escape': this.open('settings'); return true;
      case 'ArrowLeft': this.camVel = -1; return true;
      case 'ArrowRight': this.camVel = 1; return true;
    }
    return false;
  }

  update(dt: number) {
    if (this.camVel !== 0) {
      this.camX = Math.max(0, Math.min(WORLD_W - W, this.camX + this.camVel * 160 * dt));
      this.camVel *= 0.85;
      if (Math.abs(this.camVel) < 0.05) this.camVel = 0;
    }
  }

  render(ctx: CanvasRenderingContext2D, t: number) {
    drawWorld(ctx, this.camX, {
      tod: 'day', levels: this.s.levels, t, reduce: this.app.settings.reduceEffects, customers: this.regulars, busy: false,
    });
  }
}
