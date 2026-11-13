// 繁盛記（ビルドを育てる営業）：方針の一覧と、方針が営業（Shop）に与える変更。
// 数値はすべてここに置く。Shop は BuildMods だけを見てふるまいを変える（通常営業・ひがわりでは null）。
//
// 作りの方針：1つで何でも解決する方針は置かない。どの方針も単体では控えめで、
// 「かけ合わせ」（決まった2つがそろって、その皿に効く）で大きく伸びる。
// 連鎖・勢い・調達・台所・客あしらい、どの系統からでも店を組めるようにする。

export type PolicyId =
  | 'matome' | 'betsubara' | 'ryoshusho' | 'nushi' | 'tairyo' | 'mie' | 'sekkachi' | 'mouippai'
  | 'oomori' | 'yobikomi' | 'makanai' | 'ooiri' | 'aiso' | 'shikomi' | 'yoyaku' | 'omotenashi'
  | 'ippatsu' | 'netsu' | 'asaichi' | 'encho';

/** 方針の系統（色と音の個性に使う） */
export type Family = 'chain' | 'combo' | 'trip' | 'stock' | 'guest';

export interface Policy {
  id: PolicyId;
  name: string;
  /** 選ぶときに打つ言葉 */
  kana: string;
  family: Family;
  /** 一言（ユーモア） */
  quip: string;
  /** 効果の文。{0} {1} に段階ごとの値（vals）が入る */
  text: string;
  vals: [string[], string[], string[]];
  /** 皿ごとに効く方針か（false は店全体にいつも効く方針。かけ合わせでは「持っているだけ」で数える） */
  fires: boolean;
  /** 最初から選べるか（false は解放が要る） */
  starter: boolean;
  /** 解放の条件の説明 */
  unlock?: string;
}

export const MAX_SLOTS = 5;
export const MAX_LEVEL = 3;
/**
 * かけ合わせ：決まった2つの方針がそろって、その皿に効いたときに増える割合。
 * 2つの段階の合計×10%（Lv1同士で+20%、最大まで育てた同士で+60%）。広く浅くより、育てた組が強い。
 */
export const PAIR_STEP = 0.1;
export const pairBonus = (lvA: number, lvB: number) => PAIR_STEP * (lvA + lvB);
export const PAIR_MAX = pairBonus(3, 3);
/** 待たせない店：待ち時間がこの割合以上残っている客が対象 */
export const QUICK_RATIO = 0.7;
/** 大入り袋：何コンボごとに大入りになるか */
export const FEVER_EVERY = 10;
/** おもてなし：前の皿からの間を、何秒ぶんまで数えるか／何秒あいたら効いたと数えるか */
export const IDLE_MAX = 8;
export const IDLE_MIN = 2;
/** 大盛り：素材の倍率と、方針がないとき（営業条件だけのとき）の売上の倍率 */
export const BIG_NEED = 2;
export const BIG_BASE_MULT = 2;
/** おかわりのお客は、1品目をこの秒数で食べ終える（ふつうは 2.4 秒。店の回りを止めない） */
export const REFILL_EAT = 0.9;
/** 一発勝負：ミスした言葉で出した皿の倍率 */
export const IPPATSU_MISS = 0.8;
/** 連打の熱：前に打って出した皿から、何秒以内なら熱が上がるか／1皿で上がる量 */
export const HEAT_GAP = 3;
export const HEAT_STEP = 0.1;
/** 延長営業：閉店の時点で、このコンボ以上なら延長する */
export const ENCHO_COMBO = 30;
/** 朝市：昼と夜の調達で持ち帰る素材の倍率 */
export const LATE_TRIP = 0.85;
/** 型：決まった3つの方針がそろって、打った皿に効いたときに増える割合（その中のかけ合わせとは別に足す） */
export const SET_BONUS = 0.6;

const L = <T>(a: T, b: T, c: T) => [a, b, c] as [T, T, T];
const CHAIN = L(1, 2, 3);
const CHAIN_MULT = L(0.6, 0.7, 0.8);
const REFILL_CHANCE = L(0.35, 0.5, 0.65);
const REFILL_MULT = L(2.0, 2.8, 4.0);
const COMBO_CAP = L(2.5, 3, 3.5);
const FRESH_SECS = L(14, 18, 24);
const FRESH_MULT = L(1.6, 2.1, 2.7);
const TRIP_MULT = L(1.4, 1.7, 2.0);
const LOW_MULT = L(1.6, 2.1, 2.8);
const QUICK_TIP = L(3, 5, 8);
const ALE_ADD = L(90, 150, 230);
const BIG_CHANCE = L(0.3, 0.45, 0.6);
const BIG_MULT = L(2.4, 2.8, 3.3);
const GUESTS = L(0.15, 0.25, 0.4);
const SAVE = L(0.25, 0.4, 0.55);
const FEVER_SECS = L(5, 6, 8);
const FEVER_MULT = L(1.3, 1.5, 1.8);
const WAIT = L(0.3, 0.5, 0.7);
const STOCK = L(2, 3, 5);
const FEWER = L(0.3, 0.4, 0.5);
const COMBO_PLUS = L(1, 2, 3);
const IDLE_TIP = L(30, 45, 65);
const IPPATSU = L(1.4, 1.7, 2.0);
const HEAT_CAP = L(1.5, 1.8, 2.1);
const MORNING_TRIP = L(2.5, 3.0, 3.5);
const EXTEND = L(10, 15, 20);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const v2 = <A, B>(a: [A, A, A], b: [B, B, B], f: (x: A) => string, g: (x: B) => string) => L([f(a[0]), g(b[0])], [f(a[1]), g(b[1])], [f(a[2]), g(b[2])]);
const v1 = <A>(a: [A, A, A], f: (x: A) => string) => L([f(a[0])], [f(a[1])], [f(a[2])]);
const s = (x: number) => String(x);

export const POLICIES: Policy[] = [
  {
    id: 'matome', name: 'まとめ出し', kana: 'まとめだし', family: 'chain', fires: true, starter: true,
    quip: '「ついでだ、そっちの卓も持ってけ」',
    text: '料理を出すと、同じ主素材（札の左端の素材）の注文も{0}件いっしょに出る。ついでの皿は売上×{1}',
    vals: v2(CHAIN, CHAIN_MULT, s, s),
  },
  {
    id: 'betsubara', name: 'しめは別腹', kana: 'べつばら', family: 'guest', fires: true, starter: true,
    quip: '「さっき食べたのは前菜です」',
    text: 'お客の{0}が、食べたあとにもう1品たのむ。その2品目は売上×{1}',
    vals: v2(REFILL_CHANCE, REFILL_MULT, pct, s),
  },
  {
    id: 'ryoshusho', name: '領収書はいらない', kana: 'りょうしゅうしょ', family: 'combo', fires: true, starter: true,
    quip: '「勢いで払う客は、勢いで出す店に来る」',
    text: 'コンボで売上が増える倍率（10コンボごとに+0.5）の上限が、×2から×{0}に。コンボが切れるまでのミス{1}',
    vals: L([s(COMBO_CAP[0]), 'は今のまま'], [s(COMBO_CAP[1]), 'が+1回'], [s(COMBO_CAP[2]), 'が+1回']),
  },
  {
    id: 'nushi', name: 'さっきのヌシ', kana: 'ぬし', family: 'trip', fires: true, starter: true,
    quip: '「本日のおすすめ：さっき捕ったやつ」',
    text: '調達から帰って{0}秒のあいだ「とれたて」。そのあいだは全部の皿が売上×{1}',
    vals: v2(FRESH_SECS, FRESH_MULT, s, s),
  },
  {
    id: 'tairyo', name: '大漁旗', kana: 'たいりょうばた', family: 'trip', fires: false, starter: true,
    quip: '「かごが足りん。舟ごと持って帰る」',
    text: '調達で持ち帰る素材が×{0}',
    vals: v1(TRIP_MULT, s),
  },
  {
    id: 'mie', name: 'おやじの見栄', kana: 'みえ', family: 'stock', fires: true, starter: true,
    quip: '「残り少ない？ なら値打ちもんだ」',
    text: 'いま一番残りが少ない素材を使う皿は、売上×{0}',
    vals: v1(LOW_MULT, s),
  },
  {
    id: 'sekkachi', name: '待たせない店', kana: 'またせない', family: 'combo', fires: true, starter: true,
    quip: '「座る前に出てきたんだが」',
    text: '待ち時間が7割以上残っているお客に出すと、チップ（早いほど多い・最大60円）が×{0}',
    vals: v1(QUICK_TIP, s),
  },
  {
    id: 'mouippai', name: 'とりあえずもう一杯', kana: 'もういっぱい', family: 'guest', fires: true, starter: true,
    quip: '「頼んでないけど、飲む」',
    text: '酒以外の料理を出すたび、酒を1杯付けて+{0}円（酒を1つ使う。コンボの倍率も乗る）',
    vals: v1(ALE_ADD, s),
  },
  {
    id: 'oomori', name: '大盛り上等', kana: 'おおもり', family: 'stock', fires: true, starter: false, unlock: '2日目の目標を突破する',
    quip: '「並？ うちにそんな量はない」',
    text: 'お客の{0}が「大盛り」をたのむ。大盛りは素材を2倍使い、売上×{1}',
    vals: v2(BIG_CHANCE, BIG_MULT, pct, s),
  },
  {
    id: 'yobikomi', name: '呼び込み上手', kana: 'よびこみ', family: 'guest', fires: false, starter: true,
    quip: '「通りすがりも、気づけば座ってる」',
    text: 'お客が{0}多く来る',
    vals: v1(GUESTS, pct),
  },
  {
    id: 'makanai', name: 'まかない名人', kana: 'まかない', family: 'stock', fires: true, starter: false, unlock: 'かけ合わせを3種類見つける',
    quip: '「切れ端で一品。原価は聞くな」',
    text: '料理を出すとき、{0}の確率で素材が減らない',
    vals: v1(SAVE, pct),
  },
  {
    id: 'ooiri', name: '大入り袋', kana: 'おおいり', family: 'combo', fires: true, starter: false, unlock: '繁盛記で30コンボを出す',
    quip: '「袋が配りきれん。もう投げろ」',
    text: '10コンボごとに{0}秒の「大入り」。そのあいだは全部の皿が売上×{1}',
    vals: v2(FEVER_SECS, FEVER_MULT, s, s),
  },
  {
    id: 'aiso', name: '看板娘の愛想', kana: 'あいそ', family: 'guest', fires: false, starter: true,
    quip: '「怒る気が、どこかへ行った」',
    text: 'お客が{0}長く待ってくれる。怒って帰っても{1}',
    vals: L([pct(WAIT[0]), '減点なし'], [pct(WAIT[1]), '減点なし'], [pct(WAIT[2]), '減点なし・コンボも続く']),
  },
  {
    id: 'shikomi', name: 'こまめな仕込み', kana: 'しこみ', family: 'stock', fires: false, starter: true,
    quip: '「手が空いたら刻め。空いてなくても刻め」',
    text: '朝・昼・夜が始まるたびに、全部の素材が+{0}',
    vals: v1(STOCK, s),
  },
  {
    id: 'yoyaku', name: '予約のみ', kana: 'よやく', family: 'combo', fires: false, starter: true,
    quip: '「本日は、ご予約のお客様だけ」',
    text: 'お客が{0}減る。かわりに、1皿出すとコンボが{1}進む',
    vals: v2(FEWER, COMBO_PLUS, pct, (n) => String(n + 1)),
  },
  {
    id: 'omotenashi', name: 'おもてなし', kana: 'おもてなし', family: 'guest', fires: true, starter: true,
    quip: '「ごゆっくり。ほんとうに、ごゆっくり」',
    text: `前の皿から間があくほどチップが増える。1秒につき+{0}円（${IDLE_MAX}秒ぶんまで）`,
    vals: v1(IDLE_TIP, s),
  },
  {
    id: 'ippatsu', name: '一発勝負', kana: 'いっぱつ', family: 'combo', fires: true, starter: true,
    quip: '「打ち直した皿は、出せん」',
    text: `ミスなしで打ち切った皿は売上×{0}。ミスした言葉で出した皿は×${IPPATSU_MISS}（打った皿だけ）`,
    vals: v1(IPPATSU, s),
  },
  {
    id: 'netsu', name: '連打の熱', kana: 'ねつ', family: 'combo', fires: true, starter: true,
    quip: '「手が止まったら、熱が逃げる」',
    text: `前に打って出した皿から${HEAT_GAP}秒以内に出すと、売上の倍率が+${HEAT_STEP}ずつ上がる（上限×{0}。${HEAT_GAP}秒あくと元に戻る。打った皿だけ）`,
    vals: v1(HEAT_CAP, s),
  },
  {
    id: 'asaichi', name: '朝市', kana: 'あさいち', family: 'trip', fires: false, starter: true,
    quip: '「いいものは、日の出と一緒に売り切れる」',
    text: `朝に出かけた調達は持ち帰りが×{0}。昼と夜の調達は×${LATE_TRIP}`,
    vals: v1(MORNING_TRIP, s),
  },
  {
    id: 'encho', name: '延長営業', kana: 'えんちょう', family: 'combo', fires: false, starter: true,
    quip: '「のれんは、勢いが止まるまで下ろさない」',
    text: `閉店の時点でコンボが${ENCHO_COMBO}以上なら、営業が{0}秒延びる（1日1回）`,
    vals: v1(EXTEND, s),
  },
];

const BY_ID = new Map(POLICIES.map((p) => [p.id, p]));
export const policyOf = (id: PolicyId) => BY_ID.get(id)!;
export const isPolicy = (v: unknown): v is PolicyId => typeof v === 'string' && BY_ID.has(v as PolicyId);

/** 効果の文（その段階の値を入れたもの） */
export function descOf(id: PolicyId, lv: number): string {
  const p = policyOf(id);
  const vals = p.vals[Math.max(1, Math.min(MAX_LEVEL, lv)) - 1];
  return p.text.replace(/\{(\d)\}/g, (_, i) => vals[Number(i)]);
}

/** ずかん用の文：段階で変わる値を「Lv1→Lv2→Lv3」の順に並べて入れる */
export function descAll(id: PolicyId): { t: string; hot: boolean }[] {
  const p = policyOf(id);
  return p.text.split(/(\{\d\})/).filter(Boolean).map((part) => {
    const m = /^\{(\d)\}$/.exec(part);
    if (!m) return { t: part, hot: false };
    const v = p.vals.map((x) => x[Number(m[1])]);
    return v[0] === v[2] && v[0] === v[1] ? { t: v[0], hot: false } : { t: v.join('→'), hot: true };
  });
}

/** 強化の文：変わる値を「前→後」で入れ、その部分に印（hot）を付ける */
export function descDiff(id: PolicyId, from: number, to: number): { t: string; hot: boolean }[] {
  const p = policyOf(id);
  const a = p.vals[Math.max(1, Math.min(MAX_LEVEL, from)) - 1];
  const b = p.vals[Math.max(1, Math.min(MAX_LEVEL, to)) - 1];
  return p.text.split(/(\{\d\})/).filter(Boolean).map((part) => {
    const m = /^\{(\d)\}$/.exec(part);
    if (!m) return { t: part, hot: false };
    const i = Number(m[1]);
    return a[i] === b[i] ? { t: b[i], hot: false } : { t: `${a[i]}→${b[i]}`, hot: true };
  });
}

export const FAMILY_COLOR: Record<Family, string> = {
  chain: '#7fe0ff', combo: '#ff9fbd', trip: '#8fe6a0', stock: '#ffb86a', guest: '#e0a8ff',
};
/** 営業中の判子に入れる2文字 */
export const POLICY_SEAL: Record<PolicyId, string> = {
  matome: 'まと', betsubara: '別腹', ryoshusho: '領収', nushi: 'ヌシ', tairyo: '大漁', mie: '見栄', sekkachi: '即出', mouippai: '一杯',
  oomori: '大盛', yobikomi: '呼込', makanai: '賄い', ooiri: '大入', aiso: '愛想', shikomi: '仕込', yoyaku: '予約', omotenashi: 'もて',
  ippatsu: '一発', netsu: '熱', asaichi: '朝市', encho: '延長',
};
export const FAMILY_NAME: Record<Family, string> = { chain: '連鎖', combo: '勢い', trip: '調達', stock: '台所', guest: '客あしらい' };

/**
 * 名前の付いたかけ合わせ。2つがそろって、その皿に効いたときに売上が増え、「発見」として記録する。
 * 皿ごとに効く方針（fires）は「その皿に効いた」こと、店全体に効く方針は「持っている」ことが条件。
 * どの方針にも2つ以上の相手があり、どの系統からでも組める。
 */
export interface Pair { a: PolicyId; b: PolicyId; name: string }
export const PAIRS: Pair[] = [
  { a: 'matome', b: 'mouippai', name: '乾杯の大号令' },
  { a: 'matome', b: 'nushi', name: 'とれたて一斉出し' },
  { a: 'betsubara', b: 'matome', name: '唐揚げ永久機関' },
  { a: 'matome', b: 'yobikomi', name: '満席さばき' },
  { a: 'betsubara', b: 'mouippai', name: '酒は別腹' },
  { a: 'aiso', b: 'betsubara', name: '長っ尻歓迎' },
  { a: 'ooiri', b: 'ryoshusho', name: '止まらない伝票' },
  { a: 'ryoshusho', b: 'sekkachi', name: '電光石火' },
  { a: 'ryoshusho', b: 'yoyaku', name: '常連の勢い' },
  { a: 'ooiri', b: 'yobikomi', name: '大入り満員' },
  { a: 'omotenashi', b: 'yoyaku', name: '一見さんお断り' },
  { a: 'aiso', b: 'omotenashi', name: 'ゆっくりしてって' },
  { a: 'sekkachi', b: 'yobikomi', name: '座った瞬間に出る店' },
  { a: 'nushi', b: 'oomori', name: 'ヌシの姿盛り' },
  { a: 'oomori', b: 'tairyo', name: '舟ごと大盛り' },
  { a: 'makanai', b: 'oomori', name: '山盛りまかない' },
  { a: 'oomori', b: 'shikomi', name: '仕込みは山ほど' },
  { a: 'makanai', b: 'mie', name: '在庫ゼロ秒前' },
  { a: 'mie', b: 'shikomi', name: '一点豪華主義' },
  { a: 'nushi', b: 'tairyo', name: '大漁祭り' },
  { a: 'mie', b: 'mouippai', name: '最後の一杯' },
  { a: 'sekkachi', b: 'shikomi', name: '作り置きの早業' },
  { a: 'ippatsu', b: 'omotenashi', name: '丁寧な仕事' },
  { a: 'ippatsu', b: 'mie', name: '一点集中' },
  { a: 'ippatsu', b: 'yoyaku', name: '針の穴を通す' },
  { a: 'netsu', b: 'sekkachi', name: '目にも止まらぬ' },
  { a: 'netsu', b: 'ooiri', name: '祭り囃子' },
  { a: 'netsu', b: 'yobikomi', name: '行列さばき' },
  { a: 'asaichi', b: 'nushi', name: '朝獲れ' },
  { a: 'asaichi', b: 'oomori', name: '朝市の山盛り' },
  { a: 'asaichi', b: 'mouippai', name: '朝酒' },
  { a: 'encho', b: 'ooiri', name: '大入りの延長戦' },
  { a: 'encho', b: 'netsu', name: '閉店まぎわの追い込み' },
  { a: 'encho', b: 'ryoshusho', name: '伝票が終わらない' },
];

/**
 * 型：決まった3つの方針がそろって、打った皿に効いたときの大きな見返り（まとめ出しは入らない）。
 * 皿ごとに効く方針はその皿に効いたこと、店全体に効く方針は持っていることが条件。ついでの皿には付かない。
 */
export interface FormSet { ids: [PolicyId, PolicyId, PolicyId]; name: string }
export const SETS: FormSet[] = [
  { ids: ['netsu', 'sekkachi', 'ooiri'], name: '疾風の型' },
  { ids: ['ippatsu', 'ryoshusho', 'yoyaku'], name: '職人の型' },
  { ids: ['encho', 'netsu', 'yobikomi'], name: '大詰めの型' },
  { ids: ['asaichi', 'nushi', 'tairyo'], name: '朝駆けの型' },
  { ids: ['mie', 'makanai', 'shikomi'], name: '始末の型' },
  { ids: ['omotenashi', 'aiso', 'betsubara'], name: 'もてなしの型' },
  { ids: ['oomori', 'tairyo', 'makanai'], name: '大食いの型' },
];
export const setKey = (s: FormSet) => `set:${[...s.ids].sort().join('+')}`;
const SET_BY_KEY = new Map(SETS.map((s) => [setKey(s), s]));
export const setOf = (key: string) => SET_BY_KEY.get(key);
/** 型の説明 */
export function setText(s: FormSet): string {
  return `「${s.ids.map((id) => policyOf(id).name).join('」「')}」の3つがそろって打った皿に効くと、その皿の売上+${Math.round(SET_BONUS * 100)}%（中のかけ合わせとは別に足す。ついでの皿には付かない）`;
}
export const pairKey = (a: PolicyId, b: PolicyId) => (a < b ? `${a}+${b}` : `${b}+${a}`);
const PAIR_BY_KEY = new Map(PAIRS.map((p) => [pairKey(p.a, p.b), p]));
export const pairOf = (key: string) => PAIR_BY_KEY.get(key);
/** その方針と名前付きのかけ合わせになる相手 */
export function partnersOf(id: PolicyId): PolicyId[] {
  return PAIRS.filter((p) => p.a === id || p.b === id).map((p) => (p.a === id ? p.b : p.a));
}
/** かけ合わせの説明（どの2つで、いつ効くか） */
export function pairText(p: Pair): string {
  const when = (id: PolicyId) => (policyOf(id).fires ? `「${policyOf(id).name}」が効いた皿` : `「${policyOf(id).name}」を持っている`);
  const [x, y] = policyOf(p.a).fires ? [p.a, p.b] : [p.b, p.a];
  return policyOf(y).fires
    ? `「${policyOf(x).name}」と「${policyOf(y).name}」が同じ皿に効くと、その皿の売上アップ`
    : `${when(y)}と、${when(x)}の売上アップ`;
}

export interface Owned { id: PolicyId; lv: number }

/** 方針と、その日の営業条件・のれんの試練が営業に与える変更。Shop はこれだけを見る */
export interface BuildMods {
  /** まとめ出し：いっしょに出す件数／ついでの皿の倍率 */
  chain: number;
  chainMult: number;
  refillChance: number;
  refillMult: number;
  comboCap: number;
  missAllowance: number;
  /** さっきのヌシ：とれたての秒数と倍率 */
  freshSecs: number;
  freshMult: number;
  tripMult: number;
  /** おやじの見栄：一番少ない素材を使う皿の倍率 */
  lowMult: number;
  quickTip: number;
  aleAdd: number;
  /** 大盛りをたのむお客の割合と、大盛りの売上の倍率 */
  bigChance: number;
  bigMult: number;
  /** お客の来る間隔の倍率（小さいほど多い） */
  everyMult: number;
  saveChance: number;
  feverSecs: number;
  feverMult: number;
  waitMult: number;
  noAngryPenalty: boolean;
  keepCombo: boolean;
  /** 開店のときに足す素材（挑戦をまたぐおまけ） */
  startStock: number;
  /** こまめな仕込み：朝・昼・夜が始まるたびに足す素材 */
  phaseStock: number;
  /** 予約のみ：1皿でよけいに進むコンボ */
  comboPlus: number;
  /** おもてなし：前の皿からの1秒あたりのチップ */
  idleTip: number;
  /** 営業条件：チップの倍率 */
  tipMult: number;
  /** のれんの試練：お客の歩く速さ／料理が何時間帯ぶん早く出るか／せっかちなお客の割合／怒って帰ったときの減点の倍率 */
  walkMult: number;
  dishShift: number;
  impatient: number;
  angryMult: number;
  /** 持っている「店全体に効く方針」（かけ合わせの判定に使う） */
  passive: PolicyId[];
  /** 持っている方針の段階（かけ合わせの増え方に使う） */
  levels: Partial<Record<PolicyId, number>>;
  /** 一発勝負：ミスなしの皿の倍率（1 は持っていない） */
  ippatsuMult: number;
  /** 連打の熱：倍率の上限（1 は持っていない） */
  heatCap: number;
  /** 朝市：朝の調達の倍率／昼夜の調達の倍率 */
  morningTrip: number;
  laterTrip: number;
  /** 延長営業：延びる秒数（0 は持っていない） */
  extendSecs: number;
}

export function emptyMods(): BuildMods {
  return {
    chain: 0, chainMult: 1, refillChance: 0, refillMult: 1, comboCap: 2, missAllowance: 0, freshSecs: 0, freshMult: 1,
    tripMult: 1, lowMult: 1, quickTip: 1, aleAdd: 0, bigChance: 0, bigMult: BIG_BASE_MULT, everyMult: 1, saveChance: 0,
    feverSecs: 0, feverMult: 1, waitMult: 1, noAngryPenalty: false, keepCombo: false, startStock: 0, phaseStock: 0,
    comboPlus: 0, idleTip: 0, tipMult: 1, walkMult: 1, dishShift: 0, impatient: 0, angryMult: 1, passive: [], levels: {},
    ippatsuMult: 1, heatCap: 1, morningTrip: 1, laterTrip: 1, extendSecs: 0,
  };
}

/** 持っている方針から、営業への変更を作る（base は日ごとの営業条件と、のれんの試練） */
export function modsFor(owned: Owned[], base: Partial<BuildMods> = {}): BuildMods {
  const m = { ...emptyMods(), ...base, passive: [] as PolicyId[], levels: {} as Partial<Record<PolicyId, number>> };
  for (const { id, lv } of owned) {
    const i = Math.max(1, Math.min(MAX_LEVEL, lv)) - 1;
    m.levels[id] = i + 1;
    if (!policyOf(id).fires) m.passive.push(id);
    switch (id) {
      case 'matome': m.chain = CHAIN[i]; m.chainMult = CHAIN_MULT[i]; break;
      case 'betsubara': m.refillChance += REFILL_CHANCE[i]; m.refillMult = REFILL_MULT[i]; break;
      case 'ryoshusho': m.comboCap = COMBO_CAP[i]; m.missAllowance += i >= 1 ? 1 : 0; break;
      case 'nushi': m.freshSecs = FRESH_SECS[i]; m.freshMult = FRESH_MULT[i]; break;
      case 'tairyo': m.tripMult *= TRIP_MULT[i]; break;
      case 'mie': m.lowMult = LOW_MULT[i]; break;
      case 'sekkachi': m.quickTip = QUICK_TIP[i]; break;
      case 'mouippai': m.aleAdd = ALE_ADD[i]; break;
      case 'oomori': m.bigChance += BIG_CHANCE[i]; m.bigMult = BIG_MULT[i]; break;
      case 'yobikomi': m.everyMult /= 1 + GUESTS[i]; break;
      case 'makanai': m.saveChance = SAVE[i]; break;
      case 'ooiri': m.feverSecs = FEVER_SECS[i]; m.feverMult = FEVER_MULT[i]; break;
      case 'aiso': m.waitMult *= 1 + WAIT[i]; m.noAngryPenalty = true; m.keepCombo = i >= 2; break;
      case 'shikomi': m.phaseStock += STOCK[i]; break;
      case 'yoyaku': m.everyMult /= 1 - FEWER[i]; m.comboPlus = COMBO_PLUS[i]; break;
      case 'omotenashi': m.idleTip = IDLE_TIP[i]; break;
      case 'ippatsu': m.ippatsuMult = IPPATSU[i]; break;
      case 'netsu': m.heatCap = HEAT_CAP[i]; break;
      case 'asaichi': m.morningTrip = MORNING_TRIP[i]; m.laterTrip = LATE_TRIP; break;
      case 'encho': m.extendSecs = EXTEND[i]; break;
    }
  }
  return m;
}

/** こまめな仕込み：選んだ（強化した）その場で足す素材の数（次の時間帯を待たずに効き始める） */
export function stockGainOnPick(id: PolicyId, from: number, to: number) {
  if (id !== 'shikomi') return 0;
  return STOCK[Math.min(MAX_LEVEL, to) - 1] - (from > 0 ? STOCK[from - 1] : 0);
}

/** 営業の中で数える、方針のはたらき（結果の振り返りと実績に使う） */
export interface BuildStats {
  /** 方針ごとに増えた売上 */
  yen: Partial<Record<PolicyId, number>>;
  /** 方針ごとに効いた回数 */
  fired: Partial<Record<PolicyId, number>>;
  /** 1回の入力でいっしょに出た皿の最大（打った1皿を含む） */
  maxChain: number;
  chainServes: number;
  refills: number;
  fevers: number;
  /** 1皿の最高額 */
  bestServe: number;
  /** 成立した、名前付きのかけ合わせ */
  pairs: string[];
  /** 成立した型 */
  sets: string[];
  /** 連打の熱の最高倍率／延長営業で延びた秒数 */
  maxHeat: number;
  extended: number;
  /** 1皿に重なったかけ合わせの最大数 */
  maxStack: number;
}
export function emptyBuildStats(): BuildStats {
  return { yen: {}, fired: {}, maxChain: 1, chainServes: 0, refills: 0, fevers: 0, bestServe: 0, pairs: [], sets: [], maxStack: 0, maxHeat: 1, extended: 0 };
}
