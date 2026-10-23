// A案「琥珀の酒場」の素材（assets/amber-v2/manifest.json）の読み方。
// ここは画面に依存しない計算だけを置き、テストできるようにしている。

export interface ManifestFrame {
  index: number;
  name?: string;
  /** 画像内のセル [x, y, 幅, 高さ] */
  rect: [number, number, number, number];
  /** セル内の描画範囲 [左, 上, 右, 下]（セル内の座標） */
  visibleBounds: [number, number, number, number];
  /** セル内の足元の基準点 [x, y] */
  registration: [number, number];
}

export type Playback = 'loop' | 'once-hold' | 'once-hide' | 'state';

export interface ManifestAnimation {
  name: string;
  frames: number[];
  fps: number;
  loop: boolean;
  playback: Playback;
  states?: Record<string, number>;
  /** 素材プレビュー（240x240）向けの倍率。ゲーム内では使わない */
  scale?: number;
}

export interface ManifestAsset {
  id: string;
  file: string;
  width: number;
  height: number;
  frames?: ManifestFrame[];
  animations?: ManifestAnimation[];
  deprecatedFrames?: number[];
}

export interface Manifest {
  version: number;
  logicalViewport: [number, number];
  assets: ManifestAsset[];
}

/** 描画元（画像内）の範囲：セルの原点に描画範囲の位置を足す */
export function sourceRect(f: ManifestFrame) {
  const [cx, cy] = f.rect;
  const [l, t, r, b] = f.visibleBounds;
  return { x: cx + l, y: cy + t, w: r - l, h: b - t };
}

/**
 * 描画先の範囲。足元 (footX, footY) を基準点に合わせ、倍率 k（描画先の単位 / 原画像1ピクセル）で置く。
 * flip のときは足元を軸に左右反転した位置を返す。
 */
export function destRect(f: ManifestFrame, footX: number, footY: number, k: number, flip = false) {
  const [l, t, r, b] = f.visibleBounds;
  const [rx, ry] = f.registration;
  const w = (r - l) * k;
  const h = (b - t) * k;
  const y = footY + (t - ry) * k;
  const x = flip ? footX - (r - rx) * k : footX + (l - rx) * k;
  return { x, y, w, h };
}

/** 足元から頭までの高さ（原画像のピクセル） */
export function standingHeight(f: ManifestFrame) {
  return f.registration[1] - f.visibleBounds[1];
}

/**
 * アニメーションの経過時間からコマ番号を選ぶ。
 * - loop：配列順に繰り返す（同じコマが続く部分はその分だけ長く表示される）
 * - once-hold：一度再生して最後のコマで止まる
 * - once-hide：一度再生したら null（非表示）
 * 経過時間はイベント開始からの時間を渡す（全体の時刻の剰余は使わない）
 */
export function frameAt(anim: ManifestAnimation, elapsed: number): number | null {
  const n = anim.frames.length;
  if (n === 0) return null;
  const step = Math.max(0, Math.floor(elapsed * anim.fps + 1e-9));
  if (anim.playback === 'loop' || anim.loop) return anim.frames[step % n];
  if (step >= n) return anim.playback === 'once-hide' ? null : anim.frames[n - 1];
  return anim.frames[step];
}

/** 一度だけ再生する動きが終わったか */
export function animDone(anim: ManifestAnimation, elapsed: number) {
  return !anim.loop && anim.playback !== 'loop' && elapsed * anim.fps >= anim.frames.length;
}

/** 一度だけ再生する動きの長さ（秒） */
export function animLength(anim: ManifestAnimation) {
  return anim.frames.length / anim.fps;
}
