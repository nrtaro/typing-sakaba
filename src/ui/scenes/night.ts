import type { App, Scene } from '../app';
import { fmt, h, key, onceButton, stars } from '../dom';
import { drawWorld, seatSlots, tavernCenter, FLOOR_Y, type Seat, type WorldCustomer } from '../art/world';
import { CUSTOMER_LOOKS } from '../art/actors';
import { P, W, tinyText, tinyTextWidth } from '../art/px';
import { CURRENCY, EFFECTS, QUALITY_PRICE, RECIPES, RUN, TRENDS, UPGRADES, type UpgradeId } from '../../core/config';
import type { NightReport } from '../../core/game';
import { TavernScene } from './tavern';
import { FinalScene } from './final';

interface Guest extends WorldCustomer {
  kind: 'served' | 'away' | 'nofood';
  spawnAt: number;
  phase: 'wait' | 'toDoor' | 'queue' | 'toSeat' | 'eat' | 'leave' | 'gone';
  targetX: number;
  seatIndex: number;
  timer: number;
  price: number;
  bubble: string;
  bubbleT: number;
  exitX: number;
}

const DOOR_X = 458;

/** 営業の様子を短く見せる（Space/Enterで飛ばせる） */
export class NightScene implements Scene {
  countsPlayTime = true;
  private app!: App;
  private t = 0;
  private clock = 0;
  private guests: Guest[] = [];
  private seatsTaken: (Guest | null)[] = [];
  private seats: Seat[] = [];
  private earned = 0;
  private servedShown = 0;
  private hudEl!: HTMLElement;
  private overlay: HTMLElement | null = null;
  private done = false;
  private speed = 1;
  private coins: { x: number; y: number; t: number; text: string }[] = [];
  private camX = tavernCenter() - W / 2;

  constructor(private report: NightReport, private levelsBefore: Record<UpgradeId, number>) {}

  enter(app: App) {
    this.app = app;
    app.audio.setBgm('tavern');
    const s = app.state!;
    this.seats = seatSlots(s.levels.seats);
    this.seatsTaken = this.seats.map(() => null);
    this.hudEl = h('div', { class: 'night-hud' });
    app.ui.append(
      this.hudEl,
      h('div', { class: 'night-skip' },
        h('button', { onclick: () => (this.speed = this.speed < 3 ? 3 : 1) }, '早送り'),
        h('button', { class: 'primary', onclick: () => this.skip() }, key('Space'), '結果へ'),
      ),
    );
    this.planGuests();
    // 客が多い夜は少し速めに流す
    if (this.report.visitors > 16) this.speed = 1.5;
    if (this.report.visitors === 0) this.skip();
  }

  private planGuests() {
    const r = this.report;
    // 販売した料理の価格を順番に割り当てる
    const prices: number[] = [];
    for (const line of r.sales) {
      const p = Math.round(RECIPES[line.recipe].price * QUALITY_PRICE[line.quality]);
      for (let i = 0; i < line.count; i++) prices.push(p);
    }
    const kinds: Guest['kind'][] = [
      ...Array(r.served).fill('served'),
      ...Array(r.noFood).fill('nofood'),
      ...Array(r.turnedAway).fill('away'),
    ];
    // 演出が長くなりすぎないよう、到着の間隔を人数で調整
    const span = Math.min(5, 2 + kinds.length * 0.15);
    // 来店順を混ぜる（満席で帰る客は混み合った頃に来る）
    const order = kinds.map((k, i) => ({ k, i, w: k === 'away' ? 0.5 + (i / kinds.length) * 0.5 : i / kinds.length }));
    order.sort((a, b) => a.w - b.w);
    let priceIdx = 0;
    order.forEach((o, n) => {
      const fromLeft = n % 3 === 0;
      // 画面のすぐ外から歩いてくる
      const startX = fromLeft ? this.camX - 8 : this.camX + W + 8;
      this.guests.push({
        x: startX,
        look: CUSTOMER_LOOKS[(n * 7 + this.report.day) % CUSTOMER_LOOKS.length],
        state: 'walk',
        flip: !fromLeft,
        frame: 0,
        kind: o.k,
        spawnAt: (n / Math.max(1, order.length)) * span,
        phase: 'wait',
        targetX: DOOR_X,
        seatIndex: -1,
        timer: 0,
        price: o.k === 'served' ? prices[priceIdx++] ?? 0 : 0,
        bubble: '',
        bubbleT: 0,
        exitX: fromLeft ? this.camX - 12 : this.camX + W + 12,
      });
    });
  }

  private skip() {
    if (this.done) return;
    this.done = true;
    this.earned = this.report.revenue;
    this.servedShown = this.report.served;
    this.updateHud();
    this.showReport();
  }

  update(dt: number) {
    this.t += dt;
    if (this.done) return;
    const step = dt * this.speed;
    this.clock += step;
    const walk = 80 * step;
    for (const g of this.guests) {
      if (g.phase === 'gone') continue;
      g.bubbleT = Math.max(0, g.bubbleT - step);
      g.timer -= step;
      switch (g.phase) {
        case 'wait':
          if (this.clock >= g.spawnAt) g.phase = 'toDoor';
          break;
        case 'toDoor':
          if (this.moveTo(g, DOOR_X, walk)) {
            if (g.kind === 'away') {
              g.bubble = 'FULL';
              g.bubbleT = 1.0;
              g.phase = 'leave';
              g.timer = 0.4;
            } else g.phase = 'queue';
          }
          break;
        case 'queue': {
          const free = this.seatsTaken.findIndex((x) => x === null);
          if (free >= 0) {
            this.seatsTaken[free] = g;
            g.seatIndex = free;
            g.targetX = this.seats[free].x;
            g.phase = 'toSeat';
          } else {
            g.state = 'stand';
          }
          break;
        }
        case 'toSeat':
          if (this.moveTo(g, g.targetX, walk)) {
            g.state = 'sit';
            g.flip = this.seats[g.seatIndex].flip;
            g.phase = 'eat';
            g.timer = g.kind === 'served' ? 1.3 : 0.5;
            if (g.kind === 'nofood') {
              g.bubble = '...';
              g.bubbleT = 1.2;
            }
          }
          break;
        case 'eat':
          if (g.timer <= 0) {
            if (g.kind === 'served') {
              this.earned += g.price;
              this.servedShown++;
              this.coins.push({ x: g.x, y: FLOOR_Y - 26, t: 0, text: `+${g.price}` });
              this.app.audio.play('coin');
            }
            this.seatsTaken[g.seatIndex] = null;
            g.phase = 'leave';
            g.state = 'walk';
            g.timer = 0;
          }
          break;
        case 'leave':
          if (g.timer > 0) {
            g.state = 'stand';
            break;
          }
          g.state = 'walk';
          if (this.moveTo(g, g.exitX, walk)) g.phase = 'gone';
          break;
      }
    }
    for (const c of this.coins) c.t += step;
    this.coins = this.coins.filter((c) => c.t < 1.2);
    this.updateHud();
    if (this.guests.every((g) => g.phase === 'gone')) {
      this.skip();
    }
  }

  private moveTo(g: Guest, x: number, step: number): boolean {
    const d = x - g.x;
    if (Math.abs(d) <= step) {
      g.x = x;
      return true;
    }
    g.x += Math.sign(d) * step;
    g.flip = d < 0;
    g.state = 'walk';
    g.frame = Math.floor(this.t * 6);
    return false;
  }

  private hudSig = '';
  private updateHud() {
    const sig = `${this.servedShown}|${this.earned}`;
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    this.hudEl.replaceChildren(
      h('span', null, `${this.report.day}日目の夜・営業中`),
      h('span', null, '提供 ', h('span', { class: 'warm' }, `${this.servedShown}`), ` / 来客 ${this.report.visitors}人`),
      h('span', null, '売上 ', h('span', { class: 'warm' }, `${fmt(this.earned)} ${CURRENCY}`)),
    );
  }

  private showReport() {
    const r = this.report;
    const s = this.app.state!;
    const last = s.phase === 'ended';
    const salesRows = r.sales
      .sort((a, b) => b.revenue - a.revenue)
      .map((l) => h('tr', null,
        h('td', null, RECIPES[l.recipe].name, ' ', stars(l.quality)),
        h('td', { class: 'num' }, `${l.count}皿`),
        h('td', { class: 'num' }, `${fmt(l.revenue)} ${CURRENCY}`),
      ));
    const grown = (Object.keys(UPGRADES) as UpgradeId[])
      .filter((id) => s.levels[id] > this.levelsBefore[id])
      .map((id) => `${UPGRADES[id].name} Lv${s.levels[id]}`);
    this.overlay = h('div', { class: 'backdrop' },
      h('div', { class: 'panel modal', style: 'width: calc(var(--u) * 280)' },
        h('div', { class: 'modal-head' },
          h('h2', null, `${r.day}日目の営業結果`),
          h('span', { class: 'trend small' }, `噂：${TRENDS[r.trend].name}`),
        ),
        h('div', { class: 'stats' },
          statBox(`${fmt(r.revenue)}`, `売上（${CURRENCY}）`),
          statBox(`${r.served}`, '提供した料理'),
          statBox(`${r.visitors}`, '来客'),
          statBox(`${r.leftoverDishes}`, '残った料理（持ち越し）'),
        ),
        h('div', { class: 'result-grid' },
          h('div', null,
            salesRows.length
              ? h('table', { class: 'grid' }, h('thead', null, h('tr', null, h('th', null, '売れた料理'), h('th', { class: 'num' }, '数'), h('th', { class: 'num' }, '売上'))), h('tbody', null, ...salesRows))
              : h('p', { class: 'dim' }, '何も売れなかった'),
            h('p', { class: 'tiny dim' },
              `売れた数 ＝ min（来客${r.visitors}人, 受け入れ${r.capacity}人, メニューの料理）。客席は${EFFECTS.turnsPerNight}回転する。`),
          ),
          h('div', null,
            h('h3', null, 'ふりかえり'),
            h('ul', { class: 'notes small' }, ...r.notes.map((n) => h('li', null, n))),
            h('div', { class: 'small' }, '所持金 ', h('span', { class: 'warm' }, `${fmt(s.cash)} ${CURRENCY}`),
              '　評判 ', h('span', { class: 'warm' }, `${r.repBefore.toFixed(1)} → ${r.repAfter.toFixed(1)}`)),
            grown.length ? h('div', { class: 'small teal' }, `今日改善した設備：${grown.join('、')}`) : null,
          ),
        ),
        h('div', { class: 'modal-foot' },
          onceButton([key('Enter'), last ? '最終結果へ' : `${r.day + 1}日目の朝へ`], () => this.next(), { class: 'primary' }),
          h('span', { class: 'spacer' }),
          h('span', { class: 'small dim' }, last ? `${RUN.days}日間の営業が終わった` : `残り ${RUN.days - r.day}日`),
        ),
      ),
    );
    this.app.ui.append(this.overlay);
  }

  private next() {
    const s = this.app.state!;
    if (s.phase === 'ended') this.app.go(new FinalScene());
    else this.app.go(new TavernScene({ banner: true }));
  }

  onKey(e: KeyboardEvent) {
    if (!this.done && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) {
      this.skip();
      return true;
    }
    if (this.done && (e.key === 'Enter' || e.key === ' ')) {
      (this.overlay?.querySelector('button.primary') as HTMLButtonElement | null)?.click();
      return true;
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D, t: number) {
    const s = this.app.state!;
    const visible = this.guests.filter((g) => g.phase !== 'wait' && g.phase !== 'gone');
    const tables = new Map<number, number>();
    for (const g of visible) {
      if (g.phase === 'eat' && g.kind === 'served' && g.seatIndex >= 0) {
        const seat = this.seats[g.seatIndex];
        if (seat.kind === 'table') {
          const tx = seat.flip ? seat.x - 7 : seat.x + 7;
          tables.set(tx, (tables.get(tx) ?? 0) + 1);
        }
      }
    }
    drawWorld(ctx, this.camX, {
      tod: 'night', levels: s.levels, t, reduce: this.app.settings.reduceEffects, customers: visible, busy: true, dishesOnTables: tables,
    });
    ctx.save();
    ctx.translate(-Math.round(this.camX), 0);
    for (const g of visible) {
      if (g.bubbleT <= 0 || !g.bubble) continue;
      const y = FLOOR_Y - (g.state === 'sit' ? 30 : 26);
      const w = tinyTextWidth(g.bubble) + 4;
      ctx.fillStyle = P.white;
      ctx.fillRect(Math.round(g.x - w / 2), y - 1, w, 7);
      tinyText(ctx, g.bubble, g.x - w / 2 + 2, y, g.bubble === 'FULL' ? P.red : P.ink);
    }
    for (const c of this.coins) {
      const y = c.y - c.t * 14;
      tinyText(ctx, c.text, c.x - tinyTextWidth(c.text) / 2, y, P.gold);
    }
    ctx.restore();
  }
}

function statBox(v: string, l: string) {
  return h('div', { class: 'stat' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
}
