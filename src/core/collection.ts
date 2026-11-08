// 段階6：コレクション（二つ名・ネームプレート・打鍵音・シール）。
// 一覧のデータは collectionItems.ts。飾りは永続ID（id）で保存し、使い回さない。
import { ITEM_LIST, LINK_LIST, SERIES_LIST } from './collectionItems';
import type { Rng } from './rng';

export type Kind = 'front' | 'back' | 'plate' | 'sound' | 'sticker';
export type Star = 1 | 2 | 3 | 4 | 5;
/** 入手先：実績（段階5の永続ID）か、ふくびき */
export type Source = { achievement: string } | 'gacha';
export interface Item {
  id: string;
  kind: Kind;
  star: Star;
  source: Source;
  name: string;
  plate?: { bg: string; border: string; text: string; pattern?: 'plain' | 'stripe' | 'dots' | 'wood' | 'gold' };
  sound?: { wave: OscillatorType; base: number; decay: number; partial?: number; noise?: number };
  /** シール：シリーズと台紙の枠（0〜8） */
  sticker?: { series: string; slot: number };
}
export interface Series { id: string; name: string }
/** 二つ名のつなぎ。text が '' のものは（なし） */
export interface Link { id: string; text: string }

export const ITEMS: Item[] = ITEM_LIST;
export const SERIES: Series[] = SERIES_LIST;
export const LINKS: Link[] = LINK_LIST;

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export function itemById(id: string): Item | undefined {
  return BY_ID.get(id);
}

export function achievementItem(achievementId: string): Item | undefined {
  return ITEMS.find((i) => typeof i.source === 'object' && i.source.achievement === achievementId);
}

// ---------- ふくびき（値段・確率・枚数はここで調整する） ----------

export const PULL_PRICE = 5000;
export const STAR_RATE: Record<Star, number> = { 1: 0.4, 2: 0.3, 3: 0.18, 4: 0.11, 5: 0.01 };
/** かぶったときにもらえるおまけ札 */
export const DUP_TICKETS: Record<Star, number> = { 1: 1, 2: 2, 3: 5, 4: 15, 5: 50 };
/** おまけ札で交換するときに要る枚数 */
export const EXCHANGE_COST: Record<Star, number> = { 1: 5, 2: 10, 3: 25, 4: 75, 5: 200 };
const STARS: Star[] = [1, 2, 3, 4, 5];
/** 売上を足した営業IDを覚えておく数 */
const CREDITED_KEEP = 200;

export interface Equip { front: string | null; link: string; back: string | null; plate: string | null; sound: string | null }
export interface CollectionState {
  v: 1;
  /** 貯金箱（円） */
  coins: number;
  /** おまけ札 */
  tickets: number;
  /** ふくびき・交換で手に入れた飾り（永続ID → 手に入れた日時）。実績限定は入れない */
  owned: Record<string, string>;
  equip: Equip;
  /** 最初の無料の1回を使ったか */
  freeUsed: boolean;
  /** 売上を足した営業ID（直近の分） */
  credited: string[];
}

export function emptyCollection(): CollectionState {
  return { v: 1, coins: 0, tickets: 0, owned: {}, equip: { front: null, link: 'na', back: null, plate: null, sound: null }, freeUsed: false, credited: [] };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const isGacha = (i: Item | undefined): i is Item => !!i && i.source === 'gacha';
const ofKind = (id: unknown, kind: Kind) => (typeof id === 'string' && itemById(id)?.kind === kind ? id : null);

/** 保存された値を読み取る。壊れた値でも読める分を使い、一覧にない飾りは捨てる */
export function readCollection(raw: unknown): CollectionState {
  const s = emptyCollection();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
  const o = raw as Record<string, unknown>;
  s.coins = num(o.coins);
  s.tickets = num(o.tickets);
  if (o.owned && typeof o.owned === 'object' && !Array.isArray(o.owned)) {
    for (const [k, v] of Object.entries(o.owned as Record<string, unknown>)) if (typeof v === 'string' && isGacha(itemById(k))) s.owned[k] = v;
  }
  const e = (o.equip && typeof o.equip === 'object' ? o.equip : {}) as Record<string, unknown>;
  s.equip = {
    front: ofKind(e.front, 'front'), back: ofKind(e.back, 'back'), plate: ofKind(e.plate, 'plate'), sound: ofKind(e.sound, 'sound'),
    link: LINKS.some((l) => l.id === e.link) ? (e.link as string) : 'na',
  };
  s.freeUsed = o.freeUsed === true;
  s.credited = Array.isArray(o.credited) ? o.credited.filter((x): x is string => typeof x === 'string').slice(-CREDITED_KEEP) : [];
  return s;
}

/** 持っているか（実績限定は段階5の解放から導く） */
export function owns(s: CollectionState, unlocked: Record<string, string>, id: string): boolean {
  const it = itemById(id);
  if (!it) return false;
  return it.source === 'gacha' ? !!s.owned[id] : !!unlocked[it.source.achievement];
}

export function canPull(s: CollectionState): boolean {
  return !s.freeUsed || s.coins >= PULL_PRICE;
}

export interface PullResult { state: CollectionState; star: Star; items: { id: string; isNew: boolean; tickets: number }[] }

/** ☆ごとの枠（後ろの言葉は前の言葉に付いてくるので枠にしない） */
const SLOTS = new Map(STARS.map((st) => [st, ITEMS.filter((i) => isGacha(i) && i.star === st && i.kind !== 'back')]));
const BACKS = new Map(STARS.map((st) => [st, ITEMS.filter((i) => isGacha(i) && i.star === st && i.kind === 'back')]));

/** 1回引く。引けなければ null。状態は書き換えず、新しい状態を返す */
export function pull(s: CollectionState, rng: Rng, now = new Date()): PullResult | null {
  if (!canPull(s)) return null;
  const next: CollectionState = { ...s, owned: { ...s.owned } };
  if (!s.freeUsed) next.freeUsed = true;
  else next.coins -= PULL_PRICE;
  let r = rng.next();
  let star: Star = 5;
  for (const st of STARS) {
    if (r < STAR_RATE[st]) { star = st; break; }
    r -= STAR_RATE[st];
  }
  const first = rng.pick(SLOTS.get(star)!);
  const got = [first];
  if (first.kind === 'front') got.push(rng.pick(BACKS.get(star)!));
  const items = got.map((it) => {
    if (next.owned[it.id]) {
      next.tickets += DUP_TICKETS[it.star];
      return { id: it.id, isNew: false, tickets: DUP_TICKETS[it.star] };
    }
    next.owned[it.id] = now.toISOString();
    return { id: it.id, isNew: true, tickets: 0 };
  });
  return { state: next, star, items };
}

/** おまけ札で、まだ持っていないふくびきの飾りと交換する */
export function exchange(s: CollectionState, id: string, now = new Date()): { state: CollectionState } | { error: string } {
  const it = itemById(id);
  if (!isGacha(it)) return { error: 'この飾りは交換できません' };
  if (s.owned[id]) return { error: 'もう持っています' };
  const cost = EXCHANGE_COST[it.star];
  if (s.tickets < cost) return { error: `おまけ札が足りません（あと${cost - s.tickets}枚）` };
  return { state: { ...s, tickets: s.tickets - cost, owned: { ...s.owned, [id]: now.toISOString() } } };
}

/** 飾りを付け替える。持っていないもの・種類の違うものは無視する（null は外す） */
export function setEquip(s: CollectionState, unlocked: Record<string, string>, patch: Partial<Equip>): CollectionState {
  const equip = { ...s.equip };
  for (const k of ['front', 'back', 'plate', 'sound'] as const) {
    if (!(k in patch)) continue;
    const id = patch[k];
    if (id === null) equip[k] = null;
    else if (typeof id === 'string' && itemById(id)?.kind === k && owns(s, unlocked, id)) equip[k] = id;
  }
  if (patch.link !== undefined && LINKS.some((l) => l.id === patch.link)) equip.link = patch.link;
  return { ...s, equip };
}

/** シリーズの9枚がそろったか */
export function seriesComplete(s: CollectionState, unlocked: Record<string, string>, seriesId: string): boolean {
  const st = ITEMS.filter((i) => i.sticker?.series === seriesId);
  return st.length > 0 && st.every((i) => owns(s, unlocked, i.id));
}

/** 付けている二つ名の文字列。前と後ろがそろっていなければ null */
export function titleText(front: string | null, link: string | null, back: string | null): string | null {
  const f = front ? itemById(front) : undefined;
  const b = back ? itemById(back) : undefined;
  if (f?.kind !== 'front' || b?.kind !== 'back') return null;
  const l = LINKS.find((x) => x.id === link) ?? LINKS[0];
  return `${f.name}${l.text}${b.name}`;
}
export function equippedTitle(e: Equip): string | null {
  return titleText(e.front, e.link, e.back);
}
