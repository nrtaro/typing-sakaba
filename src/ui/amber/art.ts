// A案「琥珀の酒場」の画像素材を読み込み、manifest どおりに切り出して描く。
// 絵は低解像度の画面ではなく、拡大後の画面へ直接描く（高解像度素材の細部を残すため）。
// 平滑化はしない。配置はすべて基準の 480x270 座標で指定する。
import manifestJson from '../../../assets/amber-v2/manifest.json';
import { destRect, frameAt, sourceRect, standingHeight, type Manifest, type ManifestAnimation, type ManifestAsset, type ManifestFrame } from './manifest';
import type { Screen } from '../screen';

const manifest = manifestJson as unknown as Manifest;

// 本番ビルドでも配信されるよう、画像は Vite に URL を解決させる
const URLS = import.meta.glob('../../../assets/amber-v2/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

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

/**
 * 鏡に映して補った部分を、継ぎ目から外側へ徐々に暗くする（家具が二重に見えないように）。
 * w / h が負なら、起点から逆向き（左・上）へ広がる。
 */
function shade(sc: Screen, x: number, y: number, w: number, h: number, axis: 'x' | 'y') {
  if ((axis === 'x' ? w : h) === 0) return;
  sc.fade(x, y, w, h, '#120a10', 0.72, 0.96, axis);
}

export interface Sheet {
  asset: ManifestAsset;
  img: HTMLImageElement;
}

export class Art {
  private sheets = new Map<string, Sheet>();

  private constructor() {}

  /** すべての画像を読み込む。1枚でも失敗したら失敗にする */
  static async load(onProgress?: (done: number, total: number) => void): Promise<Art> {
    const art = new Art();
    const total = manifest.assets.length;
    let done = 0;
    await Promise.all(
      manifest.assets.map(async (asset) => {
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
   * 画面が横長・縦長で広がった部分は端を鏡に映したように補って少し暗くする（引き伸ばさない）。
   */
  drawBackground(sc: Screen, id: string) {
    const { img } = this.sheet(id);
    const W = 480;
    const H = 270;
    const kx = img.naturalWidth / W;
    const ky = img.naturalHeight / H;
    sc.blit(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, W, H);
    const e = sc.ext;
    const dx = -e.x0;
    const dy = -e.y0;
    if (dx > 0) {
      const sw = Math.min(img.naturalWidth, dx * kx);
      sc.blit(img, 0, 0, sw, img.naturalHeight, -sw / kx, 0, sw / kx, H, true);
      sc.blit(img, img.naturalWidth - sw, 0, sw, img.naturalHeight, W, 0, sw / kx, H, true);
      shade(sc, 0, 0, -dx, H, 'x');
      shade(sc, W, 0, e.x1 - W, H, 'x');
    }
    if (dy > 0) {
      const sh = Math.min(img.naturalHeight, dy * ky);
      sc.blit(img, 0, 0, img.naturalWidth, sh, 0, -sh / ky, W, sh / ky, false, 1, true);
      sc.blit(img, 0, img.naturalHeight - sh, img.naturalWidth, sh, 0, H, W, sh / ky, false, 1, true);
      shade(sc, 0, 0, W, -dy, 'y');
      shade(sc, 0, H, W, e.y1 - H, 'y');
    }
  }
}

export { manifest };
