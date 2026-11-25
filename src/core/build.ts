import { SHOP } from './shopConfig';
import { TAVERN_SEATS } from './tavernNavigation';
// 繁盛記（ビルドを育てる営業）：方針の一覧と、方針が営業（Shop）に与える変更。
// 数値はすべてここに置く。Shop は BuildMods だけを見てふるまいを変える（通常営業・ひがわりでは null）。
//
// 作りの方針：1皿に効いた方針の倍率は、ぜんぶ掛け算で重なる（全部込みで dishPrice.ts の MULT_CAP まで）。
// 「かけ合わせ」「型」（決まった2つ・3つが同じ皿に効く）は売上を変えず、発見として記録する。
// 連鎖・勢い・調達・台所・客あしらい、どの系統からでも店を組めるようにする。

export type PolicyId =
  | 'matome' | 'betsubara' | 'ryoshusho' | 'nushi' | 'tairyo' | 'mie' | 'sekkachi' | 'mouippai'
  | 'oomori' | 'yobikomi' | 'makanai' | 'ooiri' | 'aiso' | 'shikomi' | 'yoyaku' | 'omotenashi'
  | 'ippatsu' | 'netsu' | 'asaichi' | 'encho'
  | 'hayakuchi' | 'tema' | 'tsuyoki' | 'yoippari' | 'keiki';

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
  /** 最初から選べるか（false は解放が要る） */
  starter: boolean;
  /** 解放の条件の説明 */
  unlock?: string;
}

export const MAX_SLOTS = 5;
export const MAX_LEVEL = 3;
/** 待たせない店：待ち時間がこの割合以上残っている客が対象 */
export const QUICK_RATIO = 0.7;
/** 大入り袋：コンボを切らさずに何皿出すごとに大入りになるか（予約のみでコンボが速く進んでも皿の数で数える） */
export const FEVER_EVERY = 10;
/** 【景気づけの皿の数】景気づけ：コンボを切らさずに何皿出すごとに素材が増えるか（大入り袋とは別に数える。ユーザーの決定 2026-11-24） */
export const KEIKI_EVERY = 5;
/** おもてなし：前の皿からの間を、何秒ぶんまで数えるか／何秒あいたら効いたと数えるか */
export const IDLE_MIN = 2;
/** 【たっぷりの数】大漁旗：主素材がこの数以上あれば「たっぷり」 */
export const PLENTY_AT = 8;
/** 【仕込みたての秒数】こまめな仕込み */
export const PREP_SECS = 15;
/** 看板娘の愛想：待ち時間の残りがこの割合を切ったお客の皿に効く */
export const LATE_RATIO = 0.5;
/** 大盛り：素材の倍率と、方針がないとき（営業条件だけのとき）の売上の倍率 */
export const BIG_NEED = 2;
export const BIG_BASE_MULT = 2;
/** おかわりのお客は、1品目をこの秒数で食べ終える（ふつうは 2.4 秒。店の回りを止めない） */
export const REFILL_EAT = 0.9;
/** 一発勝負：ミスした言葉で出した皿の倍率 */
export const IPPATSU_MISS = 0.8;
/** 連打の熱：前に打って出した皿から、何秒以内なら熱が上がるか／1皿で上がる量 */
export const HEAT_GAP = 2.5;
export const HEAT_STEP = 0.1;
/** 連打の熱：ミスしたときに残る熱の割合（速さだけでなく、正確さにも損を置く） */
export const HEAT_MISS_KEEP = 0.5;
/** 延長営業：閉店の時点で、このコンボ以上なら延長する */
export const ENCHO_COMBO = 30;
/** 【長い読みの文字数】早口自慢：読み（仮名の数）がこの数以上の料理 */
export const LONG_KANA = 7;
/** 宵っ張り：朝と昼の皿の倍率（引き換え） */
export const YOI_DAY = 0.9;
/** 朝市：昼と夜の調達で持ち帰る素材の倍率 */
export const LATE_TRIP = 0.85;

const L = <T>(a: T, b: T, c: T) => [a, b, c] as [T, T, T];
const CHAIN = L(1, 2, 3);
const REFILL_CHANCE = L(0.35, 0.5, 0.65);
const REFILL_MULT = L(2.0, 2.8, 4.0);
const COMBO_CAP = L(2.5, 3, 3.5);
const FRESH_SECS = L(14, 18, 24);
const FRESH_MULT = L(1.5, 1.8, 2.2);
const TRIP_MULT = L(1.4, 1.7, 2.0);
const LOW_MULT = L(2.5, 3.0, 3.5);
/** 【たっぷりの皿の倍率】大漁旗：主素材が PLENTY_AT 個以上ある皿 */
const PLENTY_MULT = L(1.3, 1.5, 1.8);
/** 【朝の皿の倍率】朝市 */
const MORNING_MULT = L(1.5, 1.8, 2.2);
/** 【減らなかった皿の倍率】まかない名人 */
const SAVE_MULT = L(1.5, 1.8, 2.2);
/** 【仕込みたての倍率】こまめな仕込み：時間帯のはじめ PREP_SECS 秒の全部の皿 */
const PREP_MULT = L(1.5, 1.8, 2.2);
/** 【早く出した皿の倍率】待たせない店 */
const QUICK_MULT = L(1.5, 1.8, 2.2);
/** 【予約のみの倍率】全部の皿 */
const YOYAKU_MULT = L(1.4, 1.6, 1.8);
/** 【もう一杯の倍率】酒を付けた皿 */
const ALE_MULT = L(1.3, 1.5, 1.8);
/** 【満席の倍率】呼び込み上手：8席が埋まっているあいだの全部の皿 */
const FULL_MULT = L(1.2, 1.3, 1.5);
/** 【遅れて出す皿の倍率】看板娘の愛想 */
const LATE_MULT = L(1.8, 2.2, 2.6);
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
/** 【間をあけた皿の倍率】おもてなし */
const IDLE_MULT = L(1.6, 2.0, 2.5);
const IPPATSU = L(1.4, 1.7, 2.0);
const HEAT_CAP = L(1.5, 1.8, 2.1);
const MORNING_TRIP = L(2.5, 3.0, 3.5);
const EXTEND = L(10, 15, 20);
/** 【延長の倍率】延長営業のあいだの全部の皿 */
const EXTEND_MULT = L(1.5, 1.8, 2.2);
/** 【長い読みの倍率】早口自慢 */
const LONG_MULT = L(2.0, 2.5, 3.0);
/** 【手間ひまの倍率】2種類の素材の皿／3種類以上の皿 */
const TEMA2_MULT = L(1.5, 1.8, 2.2);
const TEMA3_MULT = L(2.0, 2.5, 3.0);
/** 【強気の倍率】全部の皿／お客の待ち時間が短くなる割合 */
const BOLD_MULT = L(1.2, 1.35, 1.5);
const BOLD_WAIT = L(0.15, 0.2, 0.25);
/** 【夜の皿の倍率】宵っ張り */
const NIGHT_MULT = L(1.4, 1.6, 1.8);
/** 【景気づけの数】KEIKI_EVERY 皿ごとに、よく使った素材2種類それぞれに足す数 */
const KEIKI_GAIN = L(2, 3, 4);
/** 【景気の皿の倍率】景気づけで増えた素材を使う皿（次の KEIKI_EVERY 皿のあいだ。ユーザーの決定 2026-11-24、値は仮） */
const KEIKI_MULT = L(1.3, 1.5, 1.8);
/** 割合を「7割」の形で */
const wari = (v: number) => `${Math.round(v * 10)}割`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const v2 = <A, B>(a: [A, A, A], b: [B, B, B], f: (x: A) => string, g: (x: B) => string) => L([f(a[0]), g(b[0])], [f(a[1]), g(b[1])], [f(a[2]), g(b[2])]);
const v1 = <A>(a: [A, A, A], f: (x: A) => string) => L([f(a[0])], [f(a[1])], [f(a[2])]);
const s = (x: number) => String(x);

export const POLICIES: Policy[] = [
  {
    id: 'matome', name: 'まとめ出し', kana: 'まとめだし', family: 'chain', starter: true,
    quip: '「ついでだ、そっちの卓も持ってけ」',
    text: `同じ主素材（札の左端）の注文も{0}件いっしょに出る。ついでの皿も、その皿の倍率で数える`,
    vals: v1(CHAIN, s),
  },
  {
    id: 'betsubara', name: 'しめは別腹', kana: 'べつばら', family: 'guest', starter: true,
    quip: '「さっき食べたのは前菜です」',
    text: 'お客の{0}が食べたあとにもう1品たのむ。その2品目の皿は ×{1}',
    vals: v2(REFILL_CHANCE, REFILL_MULT, pct, s),
  },
  {
    id: 'ryoshusho', name: '領収書はいらない', kana: 'りょうしゅうしょ', family: 'combo', starter: true,
    quip: '「勢いで払う客は、勢いで出す店に来る」',
    text: `コンボの倍率の上限が ×${SHOP.comboMaxMult} から ×{0} に。コンボが切れるまでのミス{1}`,
    vals: L([s(COMBO_CAP[0]), 'は今のまま'], [s(COMBO_CAP[1]), 'が+1回'], [s(COMBO_CAP[2]), 'が+1回']),
  },
  {
    id: 'nushi', name: 'さっきのヌシ', kana: 'ぬし', family: 'trip', starter: true,
    quip: '「本日のおすすめ：さっき捕ったやつ」',
    text: '調達から帰って{0}秒は「とれたて」。そのあいだの皿は ×{1}',
    vals: v2(FRESH_SECS, FRESH_MULT, s, s),
  },
  {
    id: 'tairyo', name: '大漁旗', kana: 'たいりょうばた', family: 'trip', starter: true,
    quip: '「かごが足りん。舟ごと持って帰る」',
    text: `調達の持ち帰りが ×{0}。主素材が${PLENTY_AT}個以上ある皿は ×{1}`,
    vals: v2(TRIP_MULT, PLENTY_MULT, s, s),
  },
  {
    id: 'mie', name: 'おやじの見栄', kana: 'みえ', family: 'stock', starter: true,
    quip: '「残り少ない？ なら値打ちもんだ」',
    text: '残っている素材で一番少ない素材を使う皿は ×{0}（0個の素材は数えない）',
    vals: v1(LOW_MULT, s),
  },
  {
    id: 'sekkachi', name: '待たせない店', kana: 'またせない', family: 'combo', starter: true,
    quip: '「座る前に出てきたんだが」',
    text: `待ち時間が${wari(QUICK_RATIO)}以上残っているお客の皿は ×{0}`,
    vals: v1(QUICK_MULT, s),
  },
  {
    id: 'mouippai', name: 'とりあえずもう一杯', kana: 'もういっぱい', family: 'guest', starter: true,
    quip: '「頼んでないけど、飲む」',
    text: '酒以外の料理に酒を1杯付けた皿は ×{0}（酒を1つ使う）',
    vals: v1(ALE_MULT, s),
  },
  {
    id: 'oomori', name: '大盛り上等', kana: 'おおもり', family: 'stock', starter: false, unlock: '2日目の目標を突破する',
    quip: '「並？ うちにそんな量はない」',
    text: `お客の{0}が大盛りをたのむ。素材は${BIG_NEED}倍、大盛りの皿は ×{1}`,
    vals: v2(BIG_CHANCE, BIG_MULT, pct, s),
  },
  {
    id: 'yobikomi', name: '呼び込み上手', kana: 'よびこみ', family: 'guest', starter: true,
    quip: '「通りすがりも、気づけば座ってる」',
    text: `お客が{0}多く来る。${TAVERN_SEATS.length}席が埋まっているあいだの皿は ×{1}`,
    vals: v2(GUESTS, FULL_MULT, pct, s),
  },
  {
    id: 'makanai', name: 'まかない名人', kana: 'まかない', family: 'stock', starter: false, unlock: 'かけ合わせを3種類見つける',
    quip: '「切れ端で一品。原価は聞くな」',
    text: '{0}の確率で素材が減らない。減らなかった皿は ×{1}',
    vals: v2(SAVE, SAVE_MULT, pct, s),
  },
  {
    id: 'ooiri', name: '大入り袋', kana: 'おおいり', family: 'combo', starter: false, unlock: '繁盛記で30コンボを出す',
    quip: '「袋が配りきれん。もう投げろ」',
    text: `コンボを切らさずに${FEVER_EVERY}皿出すごとに{0}秒の大入り。そのあいだの皿は ×{1}`,
    vals: v2(FEVER_SECS, FEVER_MULT, s, s),
  },
  {
    id: 'aiso', name: '看板娘の愛想', kana: 'あいそ', family: 'guest', starter: true,
    quip: '「怒る気が、どこかへ行った」',
    text: `お客が{0}長く待ち、怒って帰っても{1}。待ち時間が${wari(LATE_RATIO)}を切ったお客の皿は ×{2}`,
    vals: L([pct(WAIT[0]), '減点なし', s(LATE_MULT[0])], [pct(WAIT[1]), '減点なし', s(LATE_MULT[1])], [pct(WAIT[2]), '減点なし・コンボも続く', s(LATE_MULT[2])]),
  },
  {
    id: 'shikomi', name: 'こまめな仕込み', kana: 'しこみ', family: 'stock', starter: true,
    quip: '「手が空いたら刻め。空いてなくても刻め」',
    text: `朝・昼・夜のはじめに全部の素材+{0}。はじめの${PREP_SECS}秒の皿は ×{1}`,
    vals: v2(STOCK, PREP_MULT, s, s),
  },
  {
    id: 'yoyaku', name: '予約のみ', kana: 'よやく', family: 'combo', starter: true,
    quip: '「本日は、ご予約のお客様だけ」',
    text: '全部の皿は ×{1}、1皿でコンボが{2}進む。そのかわり、お客が{0}減る（手が追いつかない日に向く）',
    vals: L([pct(FEWER[0]), s(YOYAKU_MULT[0]), String(COMBO_PLUS[0] + 1)], [pct(FEWER[1]), s(YOYAKU_MULT[1]), String(COMBO_PLUS[1] + 1)], [pct(FEWER[2]), s(YOYAKU_MULT[2]), String(COMBO_PLUS[2] + 1)]),
  },
  {
    id: 'omotenashi', name: 'おもてなし', kana: 'おもてなし', family: 'guest', starter: true,
    quip: '「ごゆっくり。ほんとうに、ごゆっくり」',
    text: `前の皿から${IDLE_MIN}秒以上あけて打った皿は ×{0}（ついでの皿は除く）`,
    vals: v1(IDLE_MULT, s),
  },
  {
    id: 'ippatsu', name: '一発勝負', kana: 'いっぱつ', family: 'combo', starter: true,
    quip: '「打ち直した皿は、出せん」',
    text: `ミスなしで打ち切った皿は ×{0}。ミスした皿は ×${IPPATSU_MISS}（打った皿だけ）`,
    vals: v1(IPPATSU, s),
  },
  {
    id: 'netsu', name: '連打の熱', kana: 'ねつ', family: 'combo', starter: true,
    quip: '「手が止まったら、熱が逃げる」',
    text: `${HEAT_GAP}秒以内に続けて打って出した皿は、倍率が+${HEAT_STEP}ずつ上がる（上限 ×{0}。ミスで${wari(HEAT_MISS_KEEP)}に、間があくと戻る）`,
    vals: v1(HEAT_CAP, s),
  },
  {
    id: 'asaichi', name: '朝市', kana: 'あさいち', family: 'trip', starter: true,
    quip: '「いいものは、日の出と一緒に売り切れる」',
    text: `朝に出かけた調達は持ち帰りが ×{0}（昼と夜は ×${LATE_TRIP}）。朝の皿は ×{1}`,
    vals: v2(MORNING_TRIP, MORNING_MULT, s, s),
  },
  {
    id: 'encho', name: '延長営業', kana: 'えんちょう', family: 'combo', starter: true,
    quip: '「のれんは、勢いが止まるまで下ろさない」',
    text: `閉店のときコンボが${ENCHO_COMBO}以上なら{0}秒延長（1日1回）。延長のあいだの皿は ×{1}`,
    vals: v2(EXTEND, EXTEND_MULT, s, s),
  },
  {
    id: 'hayakuchi', name: '早口自慢', kana: 'はやくち', family: 'combo', starter: false, unlock: '繁盛記で50コンボを出す',
    quip: '「舌がまわるうちは、のれんもまわる」',
    text: `読みが${LONG_KANA}文字以上の料理を打って出した皿は ×{0}`,
    vals: v1(LONG_MULT, s),
  },
  {
    id: 'tema', name: '手間ひま', kana: 'てまひま', family: 'stock', starter: false, unlock: '繁盛記で目標を5回突破する',
    quip: '「手を抜いた皿は、客にばれる」',
    text: '2種類の素材を使う皿は ×{0}、3種類以上の皿は ×{1}',
    vals: v2(TEMA2_MULT, TEMA3_MULT, s, s),
  },
  {
    id: 'tsuyoki', name: '強気の値付け', kana: 'つよき', family: 'guest', starter: true,
    quip: '「うちの味に、値切りはきかないよ」',
    text: '全部の皿は ×{0}。そのかわり、お客の待ち時間が{1}短くなる',
    vals: v2(BOLD_MULT, BOLD_WAIT, s, pct),
  },
  {
    id: 'yoippari', name: '宵っ張り', kana: 'よいっぱり', family: 'guest', starter: false, unlock: '延長営業で営業を延ばす',
    quip: '「この店は、日が暮れてからが本番だ」',
    text: `夜の皿（延長のあいだも）は ×{0}。そのかわり、朝と昼の皿は ×${YOI_DAY}`,
    vals: v1(NIGHT_MULT, s),
  },
  {
    id: 'keiki', name: '景気づけ', kana: 'けいきづけ', family: 'combo', starter: false, unlock: '大入り袋で大入りを出す',
    quip: '「景気のいい店には、品物が集まる」',
    text: `コンボを切らさずに${KEIKI_EVERY}皿ごとに、よく使った素材2種類が +{0}。次の${KEIKI_EVERY}皿は、その素材を使う皿が ×{1}`,
    vals: v2(KEIKI_GAIN, KEIKI_MULT, s, s),
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
  hayakuchi: '早口', tema: '手間', tsuyoki: '強気', yoippari: '宵', keiki: '景気',
};
export const FAMILY_NAME: Record<Family, string> = { chain: '連鎖', combo: '勢い', trip: '調達', stock: '台所', guest: '客あしらい' };

/**
 * 名前の付いたかけ合わせ。2つがそろって、その皿に効いたときに「発見」として記録する（売上は変えない）。
 * 「効いた」は、その皿に倍率（効果）が乗ったこと。持っているだけでは数えない。
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
  // 第3段で足した組（古い保存データの発見をそのまま使うため、末尾に足す）
  { a: 'hayakuchi', b: 'ippatsu', name: '立て板に水' },
  { a: 'hayakuchi', b: 'netsu', name: '早口言葉' },
  { a: 'oomori', b: 'tema', name: '特上の大皿' },
  { a: 'tema', b: 'yoippari', name: '夜の御膳' },
  { a: 'aiso', b: 'tsuyoki', name: '強気の看板' },
  { a: 'tsuyoki', b: 'yoyaku', name: '格式の店' },
  { a: 'encho', b: 'yoippari', name: '夜通し' },
  { a: 'hayakuchi', b: 'yoippari', name: '夜の早口' },
  { a: 'keiki', b: 'matome', name: '大盤振る舞い' },
  { a: 'keiki', b: 'shikomi', name: '蔵いっぱい' },
];

/**
 * 型：決まった3つの方針がそろって、打った皿に効いたときに成立する（売上は変えない。まとめ出しは入らない）。
 * 3つともその皿に効いたことが条件。ついでの皿には付かない。
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
  return `「${s.ids.map((id) => policyOf(id).name).join('」「')}」の3つがそろって打った皿に効くと、型が成立する（売上は変わらない。ついでの皿では成立しない）`;
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
  return `「${policyOf(p.a).name}」と「${policyOf(p.b).name}」が同じ皿に効くと、この組を発見`;
}

export interface Owned { id: PolicyId; lv: number }

/** 方針と、その日の営業条件・のれんの試練が営業に与える変更。Shop はこれだけを見る */
export interface BuildMods {
  /** まとめ出し：いっしょに出す件数 */
  chain: number;
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
  /** 待たせない店：早く出した皿の倍率／予約のみ：全部の皿の倍率／延長営業：延長のあいだの倍率（1 は持っていない） */
  quickMult: number;
  yoyakuMult: number;
  extendMult: number;
  /** もう一杯：酒を付けた皿の倍率（1 は持っていない） */
  aleMult: number;
  /** 呼び込み上手：満席のあいだの倍率／看板娘：遅れて出した皿の倍率／おもてなし：間をあけた皿の倍率 */
  fullMult: number;
  lateMult: number;
  idleMult: number;
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
  /** 営業条件：チップの倍率 */
  tipMult: number;
  /** のれんの試練：お客の歩く速さ／料理が何時間帯ぶん早く出るか／せっかちなお客の割合／怒って帰ったときの減点の倍率 */
  walkMult: number;
  dishShift: number;
  impatient: number;
  angryMult: number;
  /** 大漁旗：たっぷりの皿の倍率／朝市：朝の皿の倍率／まかない：減らなかった皿の倍率／仕込み：仕込みたての倍率（1 は持っていない） */
  plentyMult: number;
  morningMult: number;
  saveMult: number;
  prepMult: number;
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
  /** 早口自慢：長い読みの皿／手間ひま：2種類・3種類以上の皿／強気の値付け：全部の皿／宵っ張り：夜の皿（1 は持っていない） */
  longMult: number;
  tema2Mult: number;
  tema3Mult: number;
  boldMult: number;
  nightMult: number;
  /** 景気づけ：足す素材の数（0 は持っていない）／増えた素材を使う皿の倍率 */
  keikiGain: number;
  keikiMult: number;
}

export function emptyMods(): BuildMods {
  return {
    chain: 0, refillChance: 0, refillMult: 1, comboCap: 2, missAllowance: 0, freshSecs: 0, freshMult: 1,
    tripMult: 1, lowMult: 1, plentyMult: 1, morningMult: 1, saveMult: 1, prepMult: 1, quickMult: 1, yoyakuMult: 1, extendMult: 1, aleMult: 1, fullMult: 1, lateMult: 1, idleMult: 1, bigChance: 0, bigMult: BIG_BASE_MULT, everyMult: 1, saveChance: 0,
    feverSecs: 0, feverMult: 1, waitMult: 1, noAngryPenalty: false, keepCombo: false, startStock: 0, phaseStock: 0,
    comboPlus: 0, tipMult: 1, walkMult: 1, dishShift: 0, impatient: 0, angryMult: 1, levels: {},
    ippatsuMult: 1, heatCap: 1, morningTrip: 1, laterTrip: 1, extendSecs: 0,
    longMult: 1, tema2Mult: 1, tema3Mult: 1, boldMult: 1, nightMult: 1, keikiGain: 0, keikiMult: 1,
  };
}

/** 持っている方針から、営業への変更を作る（base は日ごとの営業条件と、のれんの試練） */
export function modsFor(owned: Owned[], base: Partial<BuildMods> = {}): BuildMods {
  const m = { ...emptyMods(), ...base, levels: {} as Partial<Record<PolicyId, number>> };
  for (const { id, lv } of owned) {
    const i = Math.max(1, Math.min(MAX_LEVEL, lv)) - 1;
    m.levels[id] = i + 1;
    switch (id) {
      case 'matome': m.chain = CHAIN[i]; break;
      case 'betsubara': m.refillChance += REFILL_CHANCE[i]; m.refillMult = REFILL_MULT[i]; break;
      case 'ryoshusho': m.comboCap = COMBO_CAP[i]; m.missAllowance += i >= 1 ? 1 : 0; break;
      case 'nushi': m.freshSecs = FRESH_SECS[i]; m.freshMult = FRESH_MULT[i]; break;
      case 'tairyo': m.tripMult *= TRIP_MULT[i]; m.plentyMult = PLENTY_MULT[i]; break;
      case 'mie': m.lowMult = LOW_MULT[i]; break;
      case 'sekkachi': m.quickMult = QUICK_MULT[i]; break;
      case 'mouippai': m.aleMult = ALE_MULT[i]; break;
      case 'oomori': m.bigChance += BIG_CHANCE[i]; m.bigMult = BIG_MULT[i]; break;
      case 'yobikomi': m.everyMult /= 1 + GUESTS[i]; m.fullMult = FULL_MULT[i]; break;
      case 'makanai': m.saveChance = SAVE[i]; m.saveMult = SAVE_MULT[i]; break;
      case 'ooiri': m.feverSecs = FEVER_SECS[i]; m.feverMult = FEVER_MULT[i]; break;
      case 'aiso': m.waitMult *= 1 + WAIT[i]; m.noAngryPenalty = true; m.keepCombo = i >= 2; m.lateMult = LATE_MULT[i]; break;
      case 'shikomi': m.phaseStock += STOCK[i]; m.prepMult = PREP_MULT[i]; break;
      case 'yoyaku': m.everyMult /= 1 - FEWER[i]; m.comboPlus = COMBO_PLUS[i]; m.yoyakuMult = YOYAKU_MULT[i]; break;
      case 'omotenashi': m.idleMult = IDLE_MULT[i]; break;
      case 'ippatsu': m.ippatsuMult = IPPATSU[i]; break;
      case 'netsu': m.heatCap = HEAT_CAP[i]; break;
      case 'asaichi': m.morningTrip = MORNING_TRIP[i]; m.laterTrip = LATE_TRIP; m.morningMult = MORNING_MULT[i]; break;
      case 'encho': m.extendSecs = EXTEND[i]; m.extendMult = EXTEND_MULT[i]; break;
      case 'hayakuchi': m.longMult = LONG_MULT[i]; break;
      case 'tema': m.tema2Mult = TEMA2_MULT[i]; m.tema3Mult = TEMA3_MULT[i]; break;
      case 'tsuyoki': m.boldMult = BOLD_MULT[i]; m.waitMult *= 1 - BOLD_WAIT[i]; break;
      case 'yoippari': m.nightMult = NIGHT_MULT[i]; break;
      case 'keiki': m.keikiGain = KEIKI_GAIN[i]; m.keikiMult = KEIKI_MULT[i]; break;
    }
  }
  return m;
}

/** こまめな仕込み：選んだ（強化した）その場で足す素材の数（次の時間帯を待たずに効き始める） */
export function stockGainOnPick(id: PolicyId, from: number, to: number) {
  if (id !== 'shikomi') return 0;
  return STOCK[Math.min(MAX_LEVEL, to) - 1] - (from > 0 ? STOCK[from - 1] : 0);
}

/** 1日に出した皿の数え：読みの長い皿・素材2種類／3種類以上の皿・朝／夜の皿・コンボを切らさずに10皿／5皿出した回数 */
export interface DaySeen { served: number; long: number; kinds2: number; kinds3: number; morning: number; night: number; tens: number; fives: number }
export const emptySeen = (): DaySeen => ({ served: 0, long: 0, kinds2: 0, kinds3: 0, morning: 0, night: 0, tens: 0, fives: 0 });

/** 目印ごとの「〇〇の皿」（光る理由の文に使う） */
export const MARK_DISH: Record<Exclude<Mark, 'all'>, string> = {
  typing: '打ち方の皿', night: '夜の皿', morning: '朝の皿', fresh: '調達帰りの皿', plenty: '素材の多い皿', scarce: '素材の少ない皿',
  combo: 'コンボを続ける皿', wait: '待たせる皿', rush: '早くさばく皿', ale: '酒の皿',
};
/** 選ぶ画面で光らせるための、重なりの目印（all は全部の皿に効くので光らせない） */
export type Mark = 'all' | 'typing' | 'night' | 'morning' | 'fresh' | 'plenty' | 'scarce' | 'combo' | 'wait' | 'rush' | 'ale';
// 一発勝負は打った皿のほぼ全部に効くので、打ち方の重なりには数えない（名前付きの組では光る）
export const MARKS: Record<PolicyId, Mark[]> = {
  matome: ['rush'], betsubara: ['wait'], ryoshusho: ['combo'], nushi: ['fresh'], tairyo: ['fresh', 'plenty'], mie: ['scarce'],
  sekkachi: ['rush'], mouippai: ['ale'], oomori: ['plenty'], yobikomi: ['rush'], makanai: ['scarce'], ooiri: ['combo'],
  aiso: ['wait'], shikomi: ['plenty'], yoyaku: ['all'], omotenashi: ['typing', 'wait'], ippatsu: [], netsu: ['typing', 'rush'],
  asaichi: ['morning', 'fresh'], encho: ['night', 'combo'], hayakuchi: ['typing', 'night'], tema: ['night'], tsuyoki: ['all'],
  yoippari: ['night'], keiki: ['combo', 'plenty'],
};

/** 営業の中で数える、方針のはたらき（結果の振り返りと実績に使う） */
export interface BuildStats {
  /** 発動タグに配分した直接売上の推計（補給・客数・コンボ進行等の間接効果は含まない） */
  yen: Partial<Record<PolicyId, number>>;
  /** 方針ごとに効いた（判子が付いた）回数 */
  fired: Partial<Record<PolicyId, number>>;
  /** 方針ごとに、倍率（1より大きいもの）が乗った皿の数 */
  boosted: Partial<Record<PolicyId, number>>;
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
  /** 出した皿の数え（方針の有無にかかわらず。次の日の選ぶ画面の見込みに使う） */
  seen: DaySeen;
  /** こまめな仕込みで、時間帯のはじめに足した素材の合計の個数（円には換えない） */
  prep: number;
  /** 景気づけで増えた素材の合計の個数（円には換えない） */
  keiki: number;
  /** 1皿に重なったかけ合わせの最大数 */
  maxStack: number;
}
export function emptyBuildStats(): BuildStats {
  return { yen: {}, fired: {}, boosted: {}, maxChain: 1, chainServes: 0, refills: 0, fevers: 0, bestServe: 0, pairs: [], sets: [], maxStack: 0, maxHeat: 1, extended: 0, keiki: 0, prep: 0, seen: emptySeen() };
}
