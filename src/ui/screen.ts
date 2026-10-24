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
    // 同じサイズの通知でも代入すると、文字を含む描画状態が消去される。
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
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

  /** 背景の外側へ動くスプライトを描かない（横長・縦長画面の余白へ飛び出させない）。 */
  clip(x: number, y: number, w: number, h: number, draw: () => void) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(this.px(x), this.py(y), w * this.S, h * this.S);
    this.ctx.clip();
    try { draw(); } finally { this.ctx.restore(); }
  }

  /** 色の濃さを徐々に変えて塗る（a0 が始点側、a1 が終点側）。端の暗がりなどに使う */
  fade(x: number, y: number, w: number, h: number, col: Color, a0: number, a1: number, axis: 'x' | 'y') {
    const { ctx } = this;
    const x0 = Math.round(this.px(x));
    const y0 = Math.round(this.py(y));
    const x1 = Math.round(this.px(x + w));
    const y1 = Math.round(this.py(y + h));
    ctx.save();
    // 実際の画面の1画素ずつ、濃さだけを変えて塗る
    ctx.fillStyle = col;
    const steps = Math.max(1, Math.abs(axis === 'x' ? x1 - x0 : y1 - y0));
    const lx = Math.min(x0, x1);
    const ly = Math.min(y0, y1);
    const W = Math.abs(x1 - x0);
    const H = Math.abs(y1 - y0);
    for (let i = 0; i < steps; i++) {
      const p = i / steps;
      ctx.globalAlpha = a0 + (a1 - a0) * p;
      if (axis === 'x') ctx.fillRect(x1 >= x0 ? x0 + i : x0 - i - 1, ly, 1, H);
      else ctx.fillRect(lx, y1 >= y0 ? y0 + i : y0 - i - 1, W, 1);
    }
    ctx.restore();
  }

  /**
   * 画面全体を、絵で縦横比を保ったまま覆う（はみ出す分は切る）。
   * 小さく縮めた絵を滑らかに拡大するので、ぼかしたように見える。余白を埋める背景に使う。
   */
  coverImage(img: CanvasImageSource, iw: number, ih: number, darken = 0) {
    const { ctx, canvas } = this;
    const k = Math.max(canvas.width / iw, canvas.height / ih);
    const w = iw * k;
    const h = ih * k;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    ctx.restore();
    if (darken > 0) this.cover('#120a08', darken);
  }

  /**
   * 描く位置を基準の座標で (dx, dy) だけずらして描く。
   * 上の帯をウィンドウの上端に、下の欄を下端に付けるのに使う（縦に長いウィンドウでも浮かない）。
   */
  shifted(dx: number, dy: number, draw: () => void) {
    const ox = this.OX;
    const oy = this.OY;
    this.OX = ox + dx * this.S;
    this.OY = oy + dy * this.S;
    try { draw(); } finally { this.OX = ox; this.OY = oy; }
  }

  /** 中心から外へ自然に消えていく丸い光（加算で重ねて、周りに溶け込ませる） */
  radialGlow(x: number, y: number, r: number, col: Color, alpha: number, squash = 1) {
    if (alpha <= 0 || r <= 0) return;
    const { ctx } = this;
    const cx = this.px(x);
    const cy = this.py(y);
    const rr = r * this.S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.translate(cx, cy);
    ctx.scale(1, squash);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
    g.addColorStop(0, col);
    g.addColorStop(0.35, col + '99');
    g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

  /**
   * 画像の一部を、拡大後の画面へ直接描く（座標は基準の 480x270）。
   * 平滑化はしない。端は実際の画面の画素に合わせて丸め、隙間やにじみを出さない。
   */
  blit(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number, flipX = false, alpha = 1, flipY = false) {
    const { ctx } = this;
    const x0 = Math.round(this.px(x));
    const y0 = Math.round(this.py(y));
    const x1 = Math.round(this.px(x + w));
    const y1 = Math.round(this.py(y + h));
    if (x1 <= x0 || y1 <= y0 || sw <= 0 || sh <= 0) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha;
    if (flipX || flipY) {
      ctx.translate(flipX ? x0 + x1 : 0, flipY ? y0 + y1 : 0);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    }
    ctx.drawImage(img, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  /** 画面全体を背景色で塗る（絵を直接描く画面の描き始め） */
  clearScreen() {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = C.bg;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 低解像度で作った絵（アイコン等）を整数倍で拡大して描く */
  spr(im: HTMLCanvasElement, x: number, y: number, scale = 1, alpha = 1) {
    const { ctx, S } = this;
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, Math.round(this.px(x)), Math.round(this.py(y)), Math.round(im.width * S * scale), Math.round(im.height * S * scale));
    ctx.globalAlpha = 1;
  }

  /** 描画に使う時計（秒）。Game が毎フレーム進める。点滅や打鍵の跳ねに使う */
  now = 0;
  /** 打った文字の跳ね：ローマ字を描いた位置ごとに、最後に文字数が増えた時刻を覚える */
  private hops = new Map<string, { len: number; at: number }>();

  /**
   * ローマ字：打った部分・次の1文字・残りを描き分ける。
   * active では次に打つ文字に光る枠を付け、打った部分に下線を引き、打った直後の文字を少し跳ねさせる。
   */
  roma(typed: string, rest: string, x: number, y: number, size: number, state: 'active' | 'idle' | 'dim', alpha = 1, dark = false) {
    const w = this.W(typed + rest, size);
    const key = `${Math.round(x)}|${Math.round(y)}`;
    const hop = this.hops.get(key);
    if (!hop || typed.length !== hop.len) {
      this.hops.set(key, { len: typed.length, at: hop && typed.length > hop.len ? this.now : -1 });
      if (this.hops.size > 200) this.hops.clear();
    }
    const since = this.now - (this.hops.get(key)?.at ?? -1);
    const popping = state === 'active' && typed.length > 0 && since >= 0 && since < 0.14;
    let cx = x - w / 2;
    const active = state === 'active';
    const dimA = state === 'dim' ? 0.3 : 1;
    // 打った部分：色を変え、下線で「ここまで打った」を見せる
    if (typed) {
      const tw = this.W(typed, size);
      const head = popping ? typed.slice(0, -1) : typed;
      this.T(head, cx, y, size, dark ? '#1f5a48' : C.teal3, 'left', alpha * dimA);
      if (popping) {
        const last = typed.slice(-1);
        const lift = (1 - since / 0.14) * size * 0.22;
        this.T(last, cx + this.W(head, size), y - lift, size, dark ? '#0f3d30' : C.w, 'left', alpha);
      }
      if (active) this.PR(cx, y + size + 0.6, tw, Math.max(0.8, size * 0.1), dark ? '#1f5a48' : C.teal3, alpha * 0.9);
      cx += tw;
    }
    const next = rest.slice(0, 1);
    if (next) {
      const nw = this.W(next, size);
      if (active) {
        // 次に打つ文字：ゆっくり明滅する枠で囲む
        const pulse = 0.78 + 0.22 * Math.sin(this.now * 9);
        this.PR(cx - size * 0.08, y - size * 0.08, nw + size * 0.16, size * 1.16, dark ? '#3a2414' : C.gold, alpha * pulse);
        this.T(next, cx, y, size, dark ? '#ffe9b8' : C.ink, 'left', alpha);
      } else {
        this.T(next, cx, y, size, dark ? '#382215' : C.cream, 'left', alpha * (state === 'dim' ? 0.35 : 1));
      }
      cx += nw;
    }
    const tail = rest.slice(1);
    if (tail) this.T(tail, cx, y, size, dark ? '#674526' : C.cream, 'left', alpha * (state === 'dim' ? 0.3 : active ? 0.95 : 0.8));
  }

  /** 打っている最中の枠：外側に明滅する光の縁を付ける */
  glow(x: number, y: number, w: number, h: number, col: Color = C.gold, alpha = 1) {
    const a = (0.35 + 0.25 * Math.sin(this.now * 7)) * alpha;
    this.PR(x - 1, y - 1, w + 2, 1, col, a);
    this.PR(x - 1, y + h, w + 2, 1, col, a);
    this.PR(x - 1, y, 1, h, col, a);
    this.PR(x + w, y, 1, h, col, a);
    this.PR(x - 2, y + 1, 1, h - 2, col, a * 0.5);
    this.PR(x + w + 1, y + 1, 1, h - 2, col, a * 0.5);
    this.PR(x + 1, y - 2, w - 2, 1, col, a * 0.5);
    this.PR(x + 1, y + h + 1, w - 2, 1, col, a * 0.5);
  }

  /** キーの形の小さな札（Enter・Esc など） */
  keycap(label: string, x: number, y: number, size: number, alpha = 1) {
    const w = this.W(label, size) + size * 1.1;
    const h = size * 1.7;
    this.PR(x, y + 1.5, w, h, '#2a1a0e', alpha * 0.9);
    this.panel(x, y, w, h, '#f1dcae', '#8a6232', alpha);
    this.T(label, x + w / 2, y + h * 0.18, size, '#3a2414', 'center', alpha);
    return w;
  }
}
