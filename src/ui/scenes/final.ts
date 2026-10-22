import type { App, Scene } from '../app';
import { fmt, h, key, onceButton } from '../dom';
import { drawWorld, tavernCenter, WORLD_W } from '../art/world';
import { W } from '../art/px';
import { CURRENCY, EFFECTS, SCORE, UPGRADES, UPGRADE_ORDER } from '../../core/config';
import { computeScore, reflections, typingSummary, sum } from '../../core/game';
import { randomSeed } from '../../core/rng';
import { startRun, TitleScene } from './title';

export class FinalScene implements Scene {
  private app!: App;
  private panel!: HTMLElement;
  private viewing = false;
  private t = 0;

  enter(app: App) {
    this.app = app;
    app.audio.setBgm('tavern');
    const s = app.state!;
    app.store.clearRun();
    const score = computeScore(s);
    const typing = typingSummary(s.hauls);
    const prevBest = app.store.loadBest();
    const isBest = app.store.recordResult({
      seed: s.seed, score, typing, finishedAt: new Date().toISOString(), playSeconds: app.playSeconds,
    });
    const refl = reflections(s);
    const fishing = typingSummary(s.hauls, 'fishing');
    const hunting = typingSummary(s.hauls, 'hunting');
    const actRow = (label: string, kind: 'fishing' | 'hunting', t: typeof fishing) => {
      const hauls = s.hauls.filter((x) => x.kind === kind);
      const items = hauls.reduce((a, x) => a + x.result.catches.reduce((b, c) => b + c.count, 0), 0);
      const big = hauls.reduce((a, x) => a + x.result.catches.filter((c) => c.ingredient.startsWith('big')).length, 0);
      const esc = hauls.reduce((a, x) => a + x.result.escapes, 0);
      return h('tr', null,
        h('td', null, label), h('td', { class: 'num' }, `${t.count}回`), h('td', { class: 'num' }, `${items}`),
        h('td', { class: 'num' }, `${big}`), h('td', { class: 'num' }, t.count ? t.kps.toFixed(2) : '―'),
        h('td', { class: 'num' }, t.count ? `${(t.accuracy * 100).toFixed(1)}%` : '―'), h('td', { class: 'num' }, `${esc}`),
      );
    };
    const mm = Math.floor(app.playSeconds / 60);
    const ss = Math.floor(app.playSeconds % 60);
    const nightsRows = s.nights.map((n) =>
      h('tr', null, h('td', null, `${n.day}日目`), h('td', { class: 'num' }, `${n.visitors}`), h('td', { class: 'num' }, `${n.served}`), h('td', { class: 'num' }, `${fmt(n.revenue)}`)));

    this.panel = h('div', { class: 'backdrop' },
      h('div', { class: 'panel modal', style: 'width: calc(var(--u) * 360)' },
        h('div', { class: 'row', style: 'align-items:flex-end' },
          h('div', null, h('div', { class: 'small dim' }, '総合スコア'), h('div', { class: 'score-big' }, fmt(score.total))),
          h('div', null, h('div', { class: 'small dim' }, 'ランク'), h('div', { class: 'rank' }, score.rank)),
          h('div', null,
            h('div', { class: 'warm' }, score.rankTitle),
            isBest ? h('div', { class: 'good small' }, prevBest ? `自己ベスト更新！（前回ベスト ${fmt(prevBest.score.total)}）` : '初めての記録！') : h('div', { class: 'small dim' }, `自己ベスト ${fmt(prevBest?.score.total ?? 0)}`),
          ),
          h('span', { class: 'spacer' }),
          h('div', { class: 'small dim', style: 'text-align:right' }, `プレイ時間 ${mm}分${String(ss).padStart(2, '0')}秒`, h('br'), `シード ${s.seed}`),
        ),
        h('div', { class: 'result-grid', style: 'margin-top: calc(var(--u) * 3)' },
          h('div', null,
            h('h3', null, 'スコアの内訳'),
            h('table', { class: 'grid' }, h('tbody', null,
              h('tr', null, h('td', null, '最終所持金'), h('td', { class: 'num' }, `${fmt(score.cash)}`)),
              h('tr', null, h('td', null, '設備評価額', h('div', { class: 'tiny dim' }, `購入額 ${fmt(s.spentOnUpgrades)} の${Math.round(SCORE.upgradeValueRate * 100)}%`)), h('td', { class: 'num' }, `${fmt(score.upgradeValue)}`)),
              h('tr', null, h('td', null, '評判ボーナス', h('div', { class: 'tiny dim' }, `評判 ${s.reputation.toFixed(1)} × ${SCORE.perReputation}`)), h('td', { class: 'num' }, `${fmt(score.reputationBonus)}`)),
              h('tr', null, h('td', { class: 'warm' }, '合計'), h('td', { class: 'num warm' }, `${fmt(score.total)}`)),
            )),
            h('p', { class: 'tiny dim' }, `売上の累計 ${fmt(s.totalSales)}${CURRENCY} は所持金に含まれているため、二重には数えない。売れ残った食材・料理は0点。`),
            h('h3', null, '酒場の状態'),
            h('table', { class: 'grid' }, h('tbody', null,
              ...UPGRADE_ORDER.map((id) => h('tr', null, h('td', null, UPGRADES[id].name), h('td', { class: 'num' }, `Lv${s.levels[id]} / ${UPGRADES[id].costs.length}`))),
              h('tr', null, h('td', null, '一晩の受け入れ'), h('td', { class: 'num' }, `${EFFECTS.seats[s.levels.seats] * EFFECTS.turnsPerNight}人`)),
              h('tr', null, h('td', null, '残った食材・料理'), h('td', { class: 'num' }, `${Object.values(s.ingredients).reduce((a, q) => a + sum(q), 0)}個・${Object.values(s.dishes).reduce((a, q) => a + sum(q), 0)}皿`)),
            )),
          ),
          h('div', null,
            h('h3', null, 'タイピング'),
            h('div', { class: 'stats', style: 'grid-template-columns: repeat(3, 1fr)' },
              statBox(typing.kps.toFixed(2), '速さ（打鍵/秒）'),
              statBox(`${(typing.accuracy * 100).toFixed(1)}%`, '正確さ'),
              statBox(fmt(typing.correctKeys), '正しい打鍵数'),
            ),
            h('table', { class: 'grid' },
              h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, '回数'), h('th', { class: 'num' }, '食材'), h('th', { class: 'num' }, '大物'), h('th', { class: 'num' }, '打鍵/秒'), h('th', { class: 'num' }, '正確さ'), h('th', { class: 'num' }, '逃した'))),
              h('tbody', null, actRow('釣り', 'fishing', fishing), actRow('狩り', 'hunting', hunting)),
            ),
            h('h3', { style: 'margin-top: calc(var(--u) * 3)' }, '毎晩の営業'),
            h('table', { class: 'grid' },
              h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, '来客'), h('th', { class: 'num' }, '提供'), h('th', { class: 'num' }, `売上 ${CURRENCY}`))),
              h('tbody', null, ...nightsRows),
            ),
          ),
        ),
        h('div', { class: 'result-grid', style: 'margin-top: calc(var(--u) * 3)' },
          h('div', null, h('h3', null, 'うまくいった点'), h('ul', { class: 'notes small' }, ...refl.good.map((g) => h('li', { class: 'good' }, g)))),
          h('div', null, h('h3', null, '次に改善できる点'), h('ul', { class: 'notes small' }, ...refl.improve.map((g) => h('li', null, g)))),
        ),
        h('p', { class: 'tiny dim' }, 'ランクの基準（仮）：', SCORE.ranks.filter((r) => r.min > 0).map((r) => `${r.name} ${fmt(r.min)}点以上`).join('　')),
        h('div', { class: 'modal-foot sticky' },
          onceButton([key('R'), '再挑戦（新しい条件）'], () => startRun(this.app, randomSeed()), { class: 'primary' }),
          onceButton('同じ条件で再挑戦', () => startRun(this.app, s.seed)),
          h('button', { onclick: () => this.toggleView() }, key('V'), '酒場を眺める'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'ghost', onclick: () => this.app.go(new TitleScene()) }, 'タイトルへ'),
        ),
      ),
    );
    app.ui.append(this.panel);
  }

  private toggleView() {
    this.viewing = !this.viewing;
    this.panel.style.display = this.viewing ? 'none' : '';
    if (this.viewing) this.app.toast('もう一度 V か Esc で結果に戻る', 2500);
  }

  onKey(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k === 'v' || (this.viewing && e.key === 'Escape')) {
      this.toggleView();
      return true;
    }
    if (k === 'r' && !this.viewing) {
      (this.panel.querySelector('button.primary') as HTMLButtonElement | null)?.click();
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D, t: number) {
    const s = this.app.state!;
    const center = tavernCenter() - W / 2;
    const camX = Math.max(0, Math.min(WORLD_W - W, center + Math.sin(this.t * 0.15) * 50));
    drawWorld(ctx, camX, { tod: 'night', levels: s.levels, t, reduce: this.app.settings.reduceEffects, customers: [], busy: true });
  }
}

function statBox(v: string, l: string) {
  return h('div', { class: 'stat' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
}
