/**
 * コンボ演出の強さ。
 * 1〜3 は同じ演出、4〜6 は少し豪華、7 からは 1 回ごとに 1 段ずつ強くなり、15 で最大（以降は最大を維持）。
 */
export const COMBO_MAX = 15;

const COLORS = [
  '#fff0a8', '#ffd25c', '#ffbe5c', '#ffa35c', '#ff8a7a', '#ff7fb0',
  '#e07cff', '#a89bff', '#7fc8ff', '#7ff0d8', '#fff7ea',
];

/** 節目の掛け声（7 からは区切りごとに、15 以降は 5 回ごとに） */
function calloutFor(count: number) {
  if (count >= COMBO_MAX) return count === COMBO_MAX || count % 5 === 0 ? 'FEVER!!' : null;
  return ({ 4: 'NICE!', 7: 'GREAT!', 10: 'EXCELLENT!', 13: 'AMAZING!!' } as Record<number, string>)[count] ?? null;
}

export function comboLevel(count: number) {
  if (count <= 3) return 0;
  if (count <= 6) return 1;
  return Math.min(10, count - 5);
}

export function comboFx(count: number) {
  const level = comboLevel(Math.max(1, Math.min(count, COMBO_MAX)));
  return {
    level,
    max: level === 10,
    /** 弾ける粒の数・広がり・残る時間 */
    particles: 14 + level * 12,
    spread: 60 + level * 9,
    duration: 0.75 + level * 0.06,
    /** 放射する光の筋と、広がる輪の数 */
    rays: level ? 4 + level * 2 : 0,
    rings: level ? Math.ceil(level / 3) : 0,
    color: COLORS[level],
    /** 画面全体の一瞬の光（7 から） */
    flash: level >= 2 ? 0.05 + (level - 2) * 0.025 : 0,
    /** 画面の揺れ（10 から、ピクセル） */
    shake: level >= 5 ? (level - 4) * 0.5 : 0,
    /** 上から舞う紙吹雪（11 から） */
    confetti: level >= 6 ? (level - 5) * 8 : 0,
    /** 画面の縁の光の強さ（9 から） */
    edge: level >= 4 ? (level - 3) / 7 : 0,
    /** コンボ数字の大きさ */
    numberSize: 13 + level * 1.5,
    /** ファンファーレの音（段階が上がるほど音数が増え、高くなる） */
    notes: Array.from({ length: 3 + Math.min(level, 8) }, (_, i) => i + Math.min(level, 4)),
    callout: calloutFor(count),
  };
}
