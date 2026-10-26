// A案「琥珀の酒場」の画像素材を読み込み、manifest どおりに切り出して描く。
// 絵は低解像度の画面ではなく、拡大後の画面へ直接描く（高解像度素材の細部を残すため）。
// 平滑化はしない。配置はすべて基準の 480x270 座標で指定する。
import manifestJson from '../../../assets/amber-v4/manifest.json';
import { destRect, frameAt, sourceRect, standingHeight, type Manifest, type ManifestAnimation, type ManifestAsset, type ManifestFrame } from './manifest';
import type { Screen } from '../screen';
import type { TripId } from '../../core/shopConfig';

const manifest = manifestJson as unknown as Manifest;

export const TRIP_ASSETS: Record<TripId, string[]> = {
  fishing: ['bg-fishing', 'wife-fishing'],
  hunting: ['bg-hunting', 'wildlife'],
  gathering: ['bg-gathering'],
  trading: ['bg-trading'],
};
const deferred = new Set(Object.values(TRIP_ASSETS).flat());

// 本番ビルドでも配信されるよう、画像は Vite に URL を解決させる
const URLS = import.meta.glob('../../../assets/amber-v4/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function urlFor(file: string) {
  const key = Object.keys(URLS).find((k) => k.endsWith(`/${file}`));
  if (!key) throw new Error(`素材が見つかりません: ${file}`);
  return URLS[key];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めませんでした: ${src}`));
    img.src = src;
  });
}

export interface Sheet {
  asset: ManifestAsset;
  img: HTMLImageElement;
}

export class Art {
  private sheets = new Map<string, Sheet>();
  private pending = new Map<string, Promise<void>>();

  has(id: string) { return this.sheets.has(id); }

  hasTrip(id: TripId) { return TRIP_ASSETS[id].every(asset => this.has(asset)); }

  async ensureTrip(id: TripId): Promise<void> {
    await Promise.all(TRIP_ASSETS[id].map(asset => this.ensure(asset)));
  }

  /** 調達背景は出発時に読み込む。失敗時は次の出発で再試行できる。 */
  ensure(id: string): Promise<void> {
    if (this.has(id)) return Promise.resolve();
    const waiting = this.pending.get(id);
    if (waiting) return waiting;
    const asset = manifest.assets.find((a) => a.id === id);
    if (!asset) return Promise.reject(new Error(`素材がありません: ${id}`));
    const task = loadImage(urlFor(asset.file)).then((img) => {
      this.sheets.set(id, { asset, img });
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, task);
    return task;
  }

  private constructor() {}

  /** 初期画面の画像を読み込む。調達先の背景は出発時に取得する。 */
  static async load(onProgress?: (done: number, total: number) => void): Promise<Art> {
    const art = new Art();
    const initial = manifest.assets.filter((a) => !deferred.has(a.id));
    const total = initial.length;
    let done = 0;
    await Promise.all(
      initial.map(async (asset) => {
        const img = await loadImage(urlFor(asset.file));
        // 裏に回ったタブでは decode が終わらないことがあるため、待つのは少しだけにする（onload 済みなので描ける）
        if (img.decode) await Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 1000))]);
        art.sheets.set(asset.id, { asset, img });
        onProgress?.(++done, total);
      }),
    );
    return art;
  }

  sheet(id: string): Sheet {
    const s = this.sheets.get(id);
    if (!s) throw new Error(`素材がありません: ${id}`);
    return s;
  }

  frame(id: string, index: number): ManifestFrame {
    const s = this.sheet(id);
    const f = s.asset.frames?.[index];
    if (!f) throw new Error(`コマがありません: ${id} #${index}`);
    if (s.asset.deprecatedFrames?.includes(index)) throw new Error(`不採用のコマです: ${id} #${index}`);
    return f;
  }

  anim(id: string, name: string): ManifestAnimation {
    const a = this.sheet(id).asset.animations?.find((x) => x.name === name);
    if (!a) throw new Error(`動きがありません: ${id} ${name}`);
    return a;
  }

  /**
   * 倍率：基準となるコマの「足元から頭まで」を height（基準座標の単位）にする。
   * 同じ人物・同じ動きでは同じ倍率を使い、コマごとに大きさを変えない。
   */
  scaleFor(id: string, frameIndex: number, height: number) {
    return height / standingHeight(this.frame(id, frameIndex));
  }

  /** 1コマを足元基準で描く。k は基準座標の単位 / 原画像1ピクセル */
  drawFrame(sc: Screen, id: string, index: number, footX: number, footY: number, k: number, flip = false, alpha = 1) {
    const s = this.sheet(id);
    const f = this.frame(id, index);
    const src = sourceRect(f);
    const d = destRect(f, footX, footY, k, flip);
    sc.blit(s.img, src.x, src.y, src.w, src.h, d.x, d.y, d.w, d.h, flip, alpha);
  }

  /** 動きの経過時間からコマを選んで描く。once-hide が終わっていれば描かない */
  drawAnim(sc: Screen, id: string, animName: string, elapsed: number, footX: number, footY: number, k: number, flip = false, alpha = 1) {
    const idx = frameAt(this.anim(id, animName), elapsed);
    if (idx === null) return false;
    this.drawFrame(sc, id, idx, footX, footY, k, flip, alpha);
    return true;
  }

  /** アイコン：描画範囲を size の正方形に収める（静止画なのでコマごとの大きさ合わせでよい） */
  drawIcon(sc: Screen, id: string, index: number, x: number, y: number, size: number, alpha = 1) {
    const s = this.sheet(id);
    const src = sourceRect(this.frame(id, index));
    const k = size / Math.max(src.w, src.h);
    const w = src.w * k;
    const h = src.h * k;
    sc.blit(s.img, src.x, src.y, src.w, src.h, x + (size - w) / 2, y + (size - h) / 2, w, h, false, alpha);
  }

  /** 人物の頭部だけを切り出して描く（調達パネルの肖像） */
  drawHead(sc: Screen, id: string, index: number, x: number, y: number, size: number, part = 0.42, alpha = 1) {
    const s = this.sheet(id);
    const src = sourceRect(this.frame(id, index));
    const h = src.h * part;
    const w = Math.min(src.w, h * 1.1);
    const sx = src.x + (src.w - w) / 2;
    sc.blit(s.img, sx, src.y, w, h, x, y, size * (w / h), size, false, alpha);
  }

  /** 背景の一部（基準座標の範囲）を描き直す。カウンターの前板で人物の下半身を隠すのに使う */
  redrawRegion(sc: Screen, id: string, r: { x: number; y: number; w: number; h: number }) {
    const { img } = this.sheet(id);
    const kx = img.naturalWidth / 480;
    const ky = img.naturalHeight / 270;
    sc.blit(img, r.x * kx, r.y * ky, r.w * kx, r.h * ky, r.x, r.y, r.w, r.h);
  }

  /**
   * 16:9 の背景を基準の範囲（0..480, 0..270）に描き、
   * 外周は無地の陰影で補う。家具や窓を複製・反転しない。
   */
  /** 余白を埋める、ぼかした背景（絵ごとに一度だけ小さく縮めて作る） */
  private soft = new Map<string, HTMLCanvasElement>();

  private softOf(id: string) {
    let c = this.soft.get(id);
    if (!c) {
      const { img } = this.sheet(id);
      c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      this.soft.set(id, c);
    }
    return c;
  }

  /**
   * 背景：16:9 の絵を基準の範囲（0..480, 0..270）にくっきり描く。
   * ウィンドウが 16:9 と違うときは、同じ絵をぼかして拡大したもので周りを埋め、黒い帯を出さない。
   */
  drawBackground(sc: Screen, id: string) {
    const { img } = this.sheet(id);
    const e = sc.ext;
    if (e.w > 480 || e.h > 270) {
      const soft = this.softOf(id);
      sc.coverImage(soft, soft.width, soft.height, 0.28);
      // くっきりした絵との境目を少し沈めて、目線を中央へ
      if (e.x0 < 0) {
        sc.fade(0, 0, e.x0, 270, '#0e0806', 0.1, 0.45, 'x');
        sc.fade(480, 0, e.x1 - 480, 270, '#0e0806', 0.1, 0.45, 'x');
      }
    }
    sc.blit(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, 480, 270);
  }

  drawMenuBackground(sc: Screen) {
    const { img } = this.sheet('bg-tavern'), e = sc.ext;
    const k = Math.max(e.w / 1672, e.h / 740);
    sc.blit(img, 0, 63, 1672, 740, e.x0 + (e.w - 1672 * k) / 2, e.y0 + (e.h - 740 * k) / 2, 1672 * k, 740 * k);
  }
}

export { manifest };
