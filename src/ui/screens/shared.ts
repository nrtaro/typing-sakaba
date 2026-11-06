// 画面のファイルで共有する定数と型

/** 調達のしかた：ゲーム画面のどこを切り取るか（基準の座標で左・上・幅）と、3行の説明。【】は打つ言葉として色を変える */
export const TRIP_HELP: { id: 'fishing' | 'hunting' | 'gathering' | 'trading'; view: [number, number, number]; lines: string[] }[] = [
  { id: 'fishing', view: [28, 46, 136], lines: ['浮きが沈んだら【あわせ】', 'かかったら【巻き上げ】', '大物は3語・3ミスで糸切れ'] },
  { id: 'hunting', view: [8, 112, 160], lines: ['獲物の【言葉】で仕留める', '大物のシカは3発で肉どっさり', '柵を越えると逃げられる'] },
  { id: 'gathering', view: [62, 120, 156], lines: ['野菜やきのこの【名前】', '☠ 毒きのこは打たない', '生えている間に摘もう'] },
  { id: 'trading', view: [104, 76, 198], lines: ['【品物の名前】を打ち切る', 'ライバルより先に落札', 'ミスなしで1箱おまけ'] },
];

/** 素材 → アイコンの番号 */
export const ICON_FOR: Record<string, number> = { fish: 0, meat: 1, veg: 2, mush: 3, ale: 4, spice: 5 };

/** 「【…】」で囲んだ部分を色付きにするため、文を分ける */
export function splitHot(line: string): [string, boolean][] {
  return line.split(/(【[^】]*】)/).filter(Boolean).map((part) => (part.startsWith('【') ? [part.slice(1, -1), true] : [part, false]));
}

/** 「キーボードで打ってね」を出しておく秒数 */
export const CLICK_HINT = 2.4;
/** 「日本語入力をオフに」を出しておく秒数 */
export const IME_HINT = 3;

/** 時間帯ごとの曲 */
export const PHASE_TRACK = ['morning', 'noon', 'night'] as const;
/** 結果画面の演出が終わるまでの秒数（この後にメニューを出す） */
export const RESULT_READY = 2.6;
/** 開店前のカウントダウンの秒数 */
export const COUNTDOWN = 3;
/** 結果画面に来てから、キーを受け付けない秒数（打ちながら来ても演出を飛ばさない） */
export const RESULT_LOCK = 1.2;
export interface MenuItem { text: string; kana: string; act: () => void }
