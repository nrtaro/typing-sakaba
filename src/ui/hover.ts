// マウスを乗せると説明が出る場所（繁盛記の方針の判子・かけ合わせの名前など）。
// 描くたびに場所を登録し直し、最後にマウスの下にある説明を1つだけ描く。打って遊ぶ操作には影響しない。
import { C, type Color } from './palette';
import { LW, type Screen } from './screen';
import { FAMILY_COLOR, FAMILY_NAME, MAX_LEVEL, PAIR_MAX, SETS, descOf, pairKey, pairOf, pairText, partnersOf, policyOf, setOf, setText, type Owned, type PolicyId } from '../core/build';

export interface Tip { title: string; col: Color; lines: { t: string; col?: Color }[] }

interface Zone { x0: number; y0: number; x1: number; y1: number; tip: Tip }

export class Hover {
  /** マウスの位置（画面のピクセル）。画面の外なら null */
  private at: { x: number; y: number } | null = null;
  private zones: Zone[] = [];

  move(x: number | null, y = 0) {
    this.at = x === null ? null : { x, y };
  }

  /** 1コマの描き始めに呼ぶ */
  begin() {
    this.zones = [];
  }

  /** 基準の座標で、説明の出る場所を登録する（ずらして描いている最中でも、そのずれを含めて覚える） */
  add(sc: Screen, x: number, y: number, w: number, h: number, tip: Tip) {
    const a = sc.toDevice(x, y);
    const b = sc.toDevice(x + w, y + h);
    this.zones.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, tip });
  }

  /** いちばん最後に登録した（手前の）場所の説明を描く */
  draw(sc: Screen) {
    const at = this.at;
    if (!at) return;
    const z = [...this.zones].reverse().find((q) => at.x >= q.x0 && at.x <= q.x1 && at.y >= q.y0 && at.y <= q.y1);
    if (!z) return;
    const tip = z.tip;
    const W = 190;
    const rows: { t: string; col: Color }[] = [];
    for (const l of tip.lines) for (const t of wrap(sc, l.t, 8, W - 14)) rows.push({ t, col: l.col ?? C.cream });
    const h = 22 + rows.length * 11;
    const e = sc.ext;
    const m = sc.fromDevice(at.x, at.y);
    const x = Math.max(e.x0 + 2, Math.min(e.x1 - W - 2, m.x + 10));
    const y = m.y + 14 + h > e.y1 - 2 ? Math.max(e.y0 + 2, m.y - h - 6) : m.y + 14;
    sc.PR(x + 2, y + 3, W, h, '#0c0604', 0.6);
    sc.panel(x, y, W, h, '#1c1216', tip.col);
    sc.T(tip.title, x + 7, y + 5, sc.fitSize(tip.title, 10, W - 14), tip.col);
    rows.forEach((r, i) => sc.T(r.t, x + 7, y + 19 + i * 11, 8, r.col));
  }
}

function wrap(sc: Pick<Screen, 'W'>, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    if (line && sc.W(line + ch, size) > width && !/^[、。」』）！？…]$/.test(ch)) { out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

/** 方針の説明：今の段階の効果と、かけ合わせの相手（持っている相手には印） */
export function policyTip(id: PolicyId, lv: number, owned: Owned[] = []): Tip {
  const p = policyOf(id);
  const has = (q: PolicyId) => owned.some((o) => o.id === q);
  const lines: Tip['lines'] = [{ t: descOf(id, lv), col: C.w }];
  if (lv < MAX_LEVEL) lines.push({ t: `つぎの段階：${descOf(id, lv + 1)}`, col: '#b8a0b0' });
  lines.push({ t: p.fires ? '皿ごとに効く方針' : '店全体に、いつも効く方針', col: '#8fb8a8' });
  const partners = partnersOf(id);
  if (partners.length) lines.push({ t: `かけ合わせの相手：${partners.map((q) => `${has(q) ? '◆' : '◇'}${policyOf(q).name}`).join(' ')}`, col: '#ffe9b4' });
  const sets = SETS.filter((x) => x.ids.includes(id));
  if (sets.length) lines.push({ t: `型：${sets.map((x) => `『${x.name}』（${x.ids.filter((q) => q !== id).map((q) => `${has(q) ? '◆' : '◇'}${policyOf(q).name}`).join('・')}）`).join(' ')}`, col: '#ffb0e0' });
  return { title: `${p.name}　Lv${lv}（${FAMILY_NAME[p.family]}）`, col: FAMILY_COLOR[p.family], lines };
}

/** かけ合わせの説明：どの2つで、いつ効くか */
export function pairTip(key: string): Tip | null {
  const p = pairOf(key);
  if (!p) return null;
  return {
    title: `かけ合わせ『${p.name}』`, col: '#ffe27a',
    lines: [
      { t: pairText(p), col: C.w },
      { t: `増える割合は、2つの段階の合計×10%（最大+${Math.round(PAIR_MAX * 100)}%）` },
      { t: 'いくつも重なると、そのぶん足される', col: '#8fb8a8' },
    ],
  };
}

/** 型の説明：どの3つで、いつ効くか */
export function setTip(key: string): Tip | null {
  const x = setOf(key);
  if (!x) return null;
  return { title: `型『${x.name}』`, col: '#ffb0e0', lines: [{ t: setText(x), col: C.w }, { t: '3つ目の方針を選ぶ候補には「これで型がそろう」と出る', col: '#8fb8a8' }] };
}

export const pairTipOf = (a: PolicyId, b: PolicyId) => pairTip(pairKey(a, b));
export { LW };
