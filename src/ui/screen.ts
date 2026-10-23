// 画面：低解像度の絵（ドット絵）を拡大して描き、文字は拡大後の画面にくっきり描く。
// ウィンドウの縦横比に合わせて描く範囲を広げ、画面の外に黒い帯が出ないようにする。
// 配置はすべて基準の 480x270 の座標で書き、広がった分は (DX, DY) だけずらして中央に置く。
import { C, type Color } from './palette';

/** 基準の画面サイズ（配置はこの座標で書く） */
export const LW = 480;
export const LH = 270;
/** 広げられる上限（これを超える縦横比では、わずかに帯が残る） */
const MAX_W = 760;
const MAX_H = 420;

export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** ドット絵を描く低解像度の画面（大きさは vw x vh） */
  readonly buf: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  /** 実際に描く範囲の大きさ（基準より大きいことがある） */
  vw = LW;
  vh = LH;
  /** 基準の画面を中央に置くためのずれ */
  DX = 0;
  DY = 0;
  S = 1;
  OX = 0;
  OY = 0;
  /** 大きさが変わるたびに増える（背景の作り直しに使う） */
  version = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.g = this.buf.getContext('2d')!;
    this.fit();
    window.addEventListener('resize', () => this.fit());
    new ResizeObserver(() => this.fit()).observe(canvas);
  }

  fit() {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(window.innerWidth * dpr));
    const ch = Math.max(1, Math.round(window.innerHeight * dpr));
    this.canvas.width = cw;
    this.canvas.height = ch;
    const aspect = cw / ch;
    // 横長なら横に、縦長なら縦に描く範囲を広げる
    const vw = Math.min(MAX_W, Math.max(LW, Math.round(LH * aspect)));
    const vh = Math.min(MAX_H, Math.max(LH, Math.round(LW / aspect)));
    if (vw !== this.vw || vh !== this.vh || this.buf.width !== vw) {
      this.vw = vw;
      this.vh = vh;
      this.buf.width = vw;
      this.buf.height = vh;
      this.version++;
    }
    this.DX = Math.floor((this.vw - LW) / 2);
    this.DY = Math.floor((this.vh - LH) / 2);
    this.S = Math.min(cw / this.vw, ch / this.vh);
    this.OX = Math.round((cw - this.vw * this.S) / 2);
    this.OY = Math.round((ch - this.vh * this.S) / 2);
  }

  /** ドット絵の描画を始める：全体を消し、基準の座標で描けるようにずらす */
  begin() {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.vw, this.vh);
  }

  /** 基準の座標で描くための変換をかける／外す */
  toBase() {
    this.g.setTransform(1, 0, 0, 1, this.DX, this.DY);
  }

  toFull() {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** 基準の座標で見た、描く範囲全体（背景を端まで描くのに使う） */
  get ext() {
    return { x0: -this.DX, y0: -this.DY, x1: this.vw - this.DX, y1: this.vh - this.DY, w: this.vw, h: this.vh };
  }

  /** 低解像度の絵を拡大して画面に出す */
  present() {
    const { ctx } = this;
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, this.OX, this.OY, this.vw * this.S, this.vh * this.S);
  }

  /** 基準の座標 → 実際の画面の座標 */
  private px(x: number) {
    return this.OX + (x + this.DX) * this.S;
  }

  private py(y: number) {
    return this.OY + (y + this.DY) * this.S;
  }

  // ---------- 拡大後の画面に描く文字・枠（座標は基準の 480x270） ----------

  font(size: number) {
    this.ctx.font = `${Math.round(size * this.S)}px 'DotGothic16', 'MS Gothic', monospace`;
  }

  T(text: string, x: number, y: number, size: number, col: Color, align: CanvasTextAlign = 'left', alpha = 1) {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    this.font(size);
    ctx.fillText(text, this.px(x), this.py(y));
    ctx.globalAlpha = 1;
  }

  /** 縁取り付きの文字 */
  TB(text: string, x: number, y: number, size: number, col: Color, align: CanvasTextAlign = 'center', stroke: Color = C.ink, alpha = 1) {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    this.font(size);
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.lineWidth = Math.max(2, this.S * 1.3);
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, this.px(x), this.py(y));
    ctx.fillStyle = col;
    ctx.fillText(text, this.px(x), this.py(y));
    ctx.globalAlpha = 1;
  }

  /** 幅 width に収まる文字の大きさ（max から小さくしていく。min より小さくはしない） */
  fitSize(text: string, max: number, width: number, min = 6) {
    const w = this.W(text, max);
    if (w <= width) return max;
    return Math.max(min, Math.floor((max * width) / w * 2) / 2);
  }

  W(text: string, size: number) {
    this.font(size);
    return this.ctx.measureText(text).width / this.S;
  }

  PR(x: number, y: number, w: number, h: number, col: Color, a = 1) {
    const { ctx, S } = this;
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(this.px(x)), Math.round(this.py(y)), Math.round(w * S), Math.round(h * S));
    ctx.globalAlpha = 1;
  }

  /** 画面全体を覆う（暗くするなど） */
  cover(col: Color, a: number) {
    const { ctx } = this;
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalAlpha = 1;
  }

  /** ドット風の角を落とした枠 */
  panel(x: number, y: number, w: number, h: number, fill: Color, edge: Color, a = 1) {
    this.PR(x + 1, y, w - 2, h, edge, a);
    this.PR(x, y + 1, w, h - 2, edge, a);
    this.PR(x + 1, y + 1, w - 2, h - 2, fill, a);
  }

  /** 低解像度で作った絵（アイコン等）を整数倍で拡大して描く */
  spr(im: HTMLCanvasElement, x: number, y: number, scale = 1, alpha = 1) {
    const { ctx, S } = this;
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, Math.round(this.px(x)), Math.round(this.py(y)), Math.round(im.width * S * scale), Math.round(im.height * S * scale));
    ctx.globalAlpha = 1;
  }

  /** ローマ字：打った部分・次の1文字・残りを色分け */
  roma(typed: string, rest: string, x: number, y: number, size: number, state: 'active' | 'idle' | 'dim', alpha = 1) {
    const w = this.W(typed + rest, size);
    let cx = x - w / 2;
    const seg = (s: string, col: Color, a: number) => {
      if (!s) return;
      this.T(s, cx, y, size, col, 'left', a * alpha);
      cx += this.W(s, size);
    };
    seg(typed, C.teal3, 1);
    seg(rest.slice(0, 1), state === 'active' ? C.gold : C.cream, state === 'dim' ? 0.4 : 1);
    seg(rest.slice(1), C.cream, state === 'dim' ? 0.35 : 0.8);
  }
}
