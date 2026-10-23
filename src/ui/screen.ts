// 画面：低解像度の絵（ドット絵）を拡大して描き、文字は拡大後の画面にくっきり描く
import { C, type Color } from './palette';

export const LW = 480;
export const LH = 270;

export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** ドット絵を描く低解像度の画面 */
  readonly buf: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  S = 1;
  OX = 0;
  OY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.buf.width = LW;
    this.buf.height = LH;
    this.g = this.buf.getContext('2d')!;
    this.fit();
    window.addEventListener('resize', () => this.fit());
    new ResizeObserver(() => this.fit()).observe(canvas);
  }

  /** ウィンドウいっぱいに表示する（縦横比は保つ） */
  fit() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.S = Math.min(this.canvas.width / LW, this.canvas.height / LH);
    this.OX = Math.round((this.canvas.width - LW * this.S) / 2);
    this.OY = Math.round((this.canvas.height - LH * this.S) / 2);
  }

  /** 低解像度の絵を拡大して画面に出す */
  present() {
    const { ctx } = this;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, this.OX, this.OY, LW * this.S, LH * this.S);
  }

  // ---------- ドット絵用 ----------

  R(x: number, y: number, w: number, h: number, c: Color) {
    this.g.fillStyle = c;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // ---------- 拡大後の画面に描く文字・枠 ----------

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
    ctx.fillText(text, this.OX + x * this.S, this.OY + y * this.S);
    ctx.globalAlpha = 1;
  }

  /** 縁取り付きの文字 */
  TB(text: string, x: number, y: number, size: number, col: Color, align: CanvasTextAlign = 'center', stroke: Color = C.ink, alpha = 1) {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    this.font(size);
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.lineWidth = Math.max(2, this.S * 1.2);
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, this.OX + x * this.S, this.OY + y * this.S);
    ctx.fillStyle = col;
    ctx.fillText(text, this.OX + x * this.S, this.OY + y * this.S);
    ctx.globalAlpha = 1;
  }

  W(text: string, size: number) {
    this.font(size);
    return this.ctx.measureText(text).width / this.S;
  }

  PR(x: number, y: number, w: number, h: number, col: Color, a = 1) {
    const { ctx, S } = this;
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fillRect(this.OX + Math.round(x * S), this.OY + Math.round(y * S), Math.round(w * S), Math.round(h * S));
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
    ctx.drawImage(im, this.OX + Math.round(x * S), this.OY + Math.round(y * S), Math.round(im.width * S * scale), Math.round(im.height * S * scale));
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
    seg(rest.slice(0, 1), state === 'active' ? C.gold : C.cream, state === 'dim' ? 0.35 : 1);
    seg(rest.slice(1), C.cream, state === 'dim' ? 0.3 : 0.75);
  }
}
