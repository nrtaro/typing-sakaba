import { comboFx } from './comboFx';
// 効果音は Web Audio で合成し、BGM は場面ごとの音源を再生する。
import type { Settings } from '../core/save';

const SCALE = [0, 2, 4, 7, 9]; // ハ長調のペンタトニック（打鍵音・コンボに使う）
const BASE = 261.63;

/** 音量の段階（なし・小・中・大） */
export const VOLUME_LEVELS = [0, 0.35, 0.65, 1];
export const VOLUME_NAMES = ['なし', '小', '中', '大'];
/** BGM・効果音・打鍵音の音量の初期値（0〜10。8 がこれまでの大きさ） */
export const DEFAULT_PART = 8;

/**
 * 効果音ごとの大きさをそろえる係数（1 がもとの大きさ）。
 * 測り方と測った値は docs/sfx-loudness.md。ふつうの効果音は同じくらいの大きさに、
 * 大きな出来事（大物・開店の合図）は少し大きく、頻繁に鳴るもの（コンボ・残り時間の音）は少し控えめにする。
 */
export const FX_GAIN: Record<string, number> = {
  miss: 2.0, select: 1.35, chord: 1.0, serve: 1.05, coin: 1.35, lack: 1.3, angry: 1.75, bell: 0.72,
  tripStart: 0.8, tripReturn: 1.0, gain: 1.15, shot: 1.05, kill: 0.73, poison: 1.23, bite: 1.33, loss: 1.7,
  count: 1.15, final: 1.35, tick: 2.3, stamp: 1.17, sparkle: 0.91, combo: 0.6,
};

/** 大きさをそろえる対象の効果音（測るときに使う） */
export const FX_NAMES = ['miss', 'select', 'chord', 'serve', 'coin', 'lack', 'angry', 'bell', 'tripStart', 'tripReturn', 'gain', 'shot', 'kill', 'poison', 'bite', 'loss', 'count', 'final', 'tick', 'stamp', 'sparkle', 'combo'] as const;

export type Track = 'title' | 'morning' | 'noon' | 'night' | 'fishing' | 'hunting' | 'gathering' | 'trading' | 'result';

const BGM_SAMPLE_RATE = 44100;
/**
 * BGM・効果音・打鍵音の大きさの釣り合い（docs/sfx-loudness.md）。
 * 音源の BGM は合成の効果音よりずっと大きく作られているので、BGM を下げ、効果音と打鍵音を上げる。
 * 効果音が BGM より約 6dB 上、打鍵音が BGM より少し上に聞こえるようにする。
 */
const BGM_GAIN = 0.085;
const SFX_GAIN = 2.0;
const KEY_GAIN = 2.2;
/**
 * 閉店前に曲を速める強さ。音源の再生では速さと一緒に音程も上がるので、頼まれた速さの3割だけ速める
 * （setRate(1.25) で 1.075 倍。音程は1音ほど上がる）。
 */
const RATE_STRENGTH = 0.3;

// 音楽の卵の OGG に入っている LOOPSTART と LOOPLENGTH から求めたサンプル位置。
const TRACKS: Record<Track, { url: string; start: number; end: number; offsetSeconds?: number }> = {
  title: { url: new URL('../../assets/bgm/title.ogg', import.meta.url).href, start: 187642, end: 3297305 },
  morning: { url: new URL('../../assets/bgm/morning.ogg', import.meta.url).href, start: 179389, end: 3043963 },
  noon: { url: new URL('../../assets/bgm/noon.ogg', import.meta.url).href, start: 159744, end: 2847445 },
  // 打楽器が入る直前から始め、最初の一打を残す。
  night: { url: new URL('../../assets/bgm/night.ogg', import.meta.url).href, start: 730857, end: 2921016, offsetSeconds: 8.25 },
  fishing: { url: new URL('../../assets/bgm/fishing.ogg', import.meta.url).href, start: 247381, end: 3725941 },
  hunting: { url: new URL('../../assets/bgm/hunting.ogg', import.meta.url).href, start: 142120, end: 2718352 },
  gathering: { url: new URL('../../assets/bgm/gathering.ogg', import.meta.url).href, start: 365118, end: 2654998 },
  trading: { url: new URL('../../assets/bgm/trading.ogg', import.meta.url).href, start: 99145, end: 3186203 },
  result: { url: new URL('../../assets/bgm/result.ogg', import.meta.url).href, start: 1323283, end: 3467158 },
};

/** 打鍵音の作り方（飾りの一覧の sound と同じ形） */
export interface KeyVoice { wave: OscillatorType; base: number; decay: number; partial?: number; noise?: number }

export class Sound {
  private ac: AudioContext | null = null;
  private sfx: GainNode | null = null;
  /** 打鍵音だけの出口（設定で効果音とは別に音量を変える） */
  private keyBus: GainNode | null = null;
  /** 効果音ごとの出口（大きさをそろえる係数 FX_GAIN をかける） */
  private fxBus = new Map<string, GainNode>();
  private music: GainNode | null = null;
  private playing: AudioBufferSourceNode | null = null;
  private pending: AbortController | null = null;
  /** 読み込んだ曲のデータ（場面を行き来するたびに読み直さない。展開前のデータなので小さい） */
  private encoded = new Map<Track, ArrayBuffer>();
  private rate = 1;
  /** 全体の音量と、音割れを防ぐリミッター */
  private master: GainNode | null = null;
  /** ノイズ用の音（1秒分を一度だけ作り、毎回切り出して使う） */
  private noiseBuf: AudioBuffer | null = null;
  private wanted: Track | null = null;

  constructor(private settings: Settings) {}

  /** ブラウザは操作の後でしか音を出せないので、最初のキー入力やクリックで呼ぶ */
  unlock() {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.build(new Ctor());
      this.apply(this.settings);
      // 音が使えるようになる前に頼まれていた曲を、ここで始める
      if (this.wanted) this.play(this.wanted);
    } catch {
      this.ac = null;
    }
  }

  /**
   * 音の通り道を作る：効果音・BGM → 全体の音量 → リミッター → スピーカー。
   * 音が重なっても上限を超えないよう、最後にリミッターでならす（音割れの「プツッ」を防ぐ）。
   */
  private build(ac: BaseAudioContext) {
    this.ac = ac as AudioContext;
    this.sfx = ac.createGain();
    this.music = ac.createGain();
    this.master = ac.createGain();
    this.master.gain.value = 0.8;
    const limit = ac.createDynamicsCompressor();
    limit.threshold.value = -12;
    limit.knee.value = 6;
    limit.ratio.value = 12;
    limit.attack.value = 0.002;
    limit.release.value = 0.2;
    this.sfx.connect(this.master);
    this.keyBus = ac.createGain();
    this.keyBus.connect(this.master);
    this.fxBus.clear();
    this.music.connect(this.master);
    this.master.connect(limit).connect(ac.destination);
    const len = ac.sampleRate;
    this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  }

  /** 音が鳴らせる状態か（ブラウザは最初の操作まで音を止めている） */
  get ready() {
    return !!this.ac && this.ac.state === 'running';
  }

  apply(s: Settings) {
    this.settings = s;
    if (!this.ac || !this.sfx || !this.music) return;
    const t = this.ac.currentTime;
    // 段階ごとの音量。「大」は以前の約2.5倍
    const level = s.muted ? 0 : VOLUME_LEVELS[Math.max(0, Math.min(3, s.volume ?? 3))];
    // 種類ごとの音量（0〜10。8 がこれまでの大きさ）
    const part = (v: number | undefined) => Math.max(0, Math.min(10, v ?? DEFAULT_PART)) / DEFAULT_PART;
    this.sfx.gain.setTargetAtTime(level * SFX_GAIN * part(s.seLevel), t, 0.02);
    this.keyBus?.gain.setTargetAtTime(level * KEY_GAIN * part(s.keyLevel), t, 0.02);
    this.music.gain.setTargetAtTime(level * BGM_GAIN * part(s.bgmLevel), t, 0.05);
  }

  // ---------- 音の部品 ----------

  /**
   * 1音。立ち上がりと消え際を必ずなめらかにし（いきなり鳴らさない・いきなり止めない）、
   * 角のある波形ほど立ち上がりを少し長くする。
   */
  private tone(f: number, at: number, d: number, type: OscillatorType, v: number, out: GainNode, f2?: number) {
    const ac = this.ac!;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + d);
    const attack = type === 'sine' || type === 'triangle' ? 0.006 : 0.01;
    // 音量の初期値は 1。鳴り始めの瞬間に1サンプルだけ全開で出て「プツッ」となるので、作った時点で 0 にしておく
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + attack);
    g.gain.exponentialRampToValueAtTime(0.001, at + Math.max(d, attack + 0.01));
    g.gain.linearRampToValueAtTime(0, at + d + 0.02);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + d + 0.05);
  }

  /** ノイズ（打楽器・水しぶき・足音など）。作り置きの音から切り出し、前後をなめらかにつなぐ */
  private noise(at: number, d: number, v: number, out: GainNode, type: BiquadFilterType = 'highpass', freq = 7000) {
    const ac = this.ac!;
    const s = ac.createBufferSource();
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    s.buffer = this.noiseBuf;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, at + Math.max(d, 0.01));
    g.gain.linearRampToValueAtTime(0, at + d + 0.02);
    s.connect(f).connect(g).connect(out);
    s.start(at, Math.random() * 0.5, d + 0.05);
  }

  private note(n: number) {
    return 2 * BASE * Math.pow(2, (SCALE[n % 5] + 12 * Math.floor(n / 5)) / 12);
  }

  private semi(s: number) {
    return BASE * Math.pow(2, s / 12);
  }

  /** 効果音ごとの出口。大きさをそろえる係数をかけてから、効果音の音量へつなぐ */
  private fx(name: string): GainNode {
    let g = this.fxBus.get(name);
    if (!g) {
      g = this.ac!.createGain();
      g.gain.value = FX_GAIN[name] ?? 1;
      g.connect(this.sfx!);
      this.fxBus.set(name, g);
    }
    return g;
  }

  private get now() {
    return this.ac?.currentTime ?? 0;
  }

  private get ok() {
    return !!this.ac && !!this.sfx;
  }

  // ---------- 打鍵 ----------

  /** 打鍵音。n 打目ほど音階が上がる（同じ言葉の中で） */
  key(n: number) {
    if (!this.ok || this.settings.muted) return;
    const t = this.now;
    const step = Math.min(Math.max(0, n - 1), 14);
    const v = this.keyVoice;
    if (v) {
      // 段階6：選んだ打鍵音。音の高さの上がり方は元の音と同じ
      const f = v.base * (this.note(step) / this.note(0));
      this.tone(f, t, v.decay, v.wave, 0.05, this.keyBus!);
      if (v.partial) this.tone(f * v.partial, t, v.decay * 0.6, v.wave, 0.025, this.keyBus!);
      if (v.noise) this.noise(t, 0.03, v.noise, this.keyBus!, 'bandpass', 2500);
      return;
    }
    const f = this.note(step);
    this.tone(f, t, 0.08, 'square', 0.05, this.keyBus!);
    this.tone(f * 2, t, 0.04, 'triangle', 0.035, this.keyBus!);
  }

  private keyVoice: KeyVoice | null = null;
  /** 段階6：打鍵音を選ぶ（null で元の音） */
  setKeyVoice(v: KeyVoice | null) {
    this.keyVoice = v;
  }

  miss() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(150, t, 0.12, 'sawtooth', 0.06, this.fx('miss'), 110);
    this.noise(t, 0.05, 0.04, this.fx('miss'), 'lowpass', 900);
  }

  /** メニューを選んだ */
  select() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(this.semi(19), t, 0.12, 'triangle', 0.06, this.fx('select'));
    this.tone(this.semi(24), t + 0.06, 0.18, 'triangle', 0.06, this.fx('select'));
  }

  /** 互換用の短い和音（level が高いほど高い） */
  chord(level: number) {
    if (!this.ok) return;
    const t = this.now;
    [0, 2, 4].forEach((s, i) => this.tone(this.note(s + Math.min(level, 8)), t + i * 0.045, 0.22, 'square', 0.04, this.fx('chord')));
  }

  // ---------- 店 ----------

  /** 料理を出した：皿を置く音と、硬貨の音 */
  serve() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(2350, t, 0.09, 'triangle', 0.05, this.fx('serve'));
    this.tone(2490, t + 0.004, 0.07, 'triangle', 0.035, this.fx('serve'));
    this.noise(t, 0.04, 0.05, this.fx('serve'), 'bandpass', 3200);
    this.coin(t + 0.06);
  }

  coin(at?: number) {
    if (!this.ok) return;
    const t = at ?? this.now;
    this.tone(1568, t, 0.05, 'square', 0.04, this.fx('coin'));
    this.tone(2093, t + 0.05, 0.1, 'square', 0.04, this.fx('coin'));
  }

  /** 素材が足りない：短いブザー2回 */
  lack() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(196, t, 0.08, 'square', 0.05, this.fx('lack'));
    this.tone(196, t + 0.11, 0.08, 'square', 0.05, this.fx('lack'));
  }

  /** 客が怒って帰った：低くうなる声と、足を踏み鳴らす音 */
  angry() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(240, t, 0.32, 'sawtooth', 0.05, this.fx('angry'), 120);
    this.noise(t + 0.12, 0.08, 0.08, this.fx('angry'), 'lowpass', 300);
    this.noise(t + 0.26, 0.08, 0.06, this.fx('angry'), 'lowpass', 300);
  }

  /** 互換用：失敗音 */
  bad() {
    this.angry();
  }

  /** 時間帯が変わった：鐘の音 */
  bell() {
    if (!this.ok) return;
    const t = this.now;
    for (const [f, d] of [[880, 1.2], [1318, 0.9], [1760, 0.6]] as const) this.tone(f, t, d, 'sine', 0.035, this.fx('bell'));
  }

  /** 調達に出かける：扉の鈴と足音 */
  tripStart() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(1318, t, 0.5, 'sine', 0.05, this.fx('tripStart'));
    this.tone(1760, t + 0.07, 0.45, 'sine', 0.04, this.fx('tripStart'));
    for (let i = 0; i < 3; i++) this.noise(t + 0.18 + i * 0.12, 0.05, 0.06, this.fx('tripStart'), 'lowpass', 500);
  }

  /** 調達から帰った：明るく駆け上がる「ただいま」 */
  tripReturn() {
    if (!this.ok) return;
    const t = this.now;
    [12, 16, 19, 24].forEach((s, i) => this.tone(this.semi(s), t + i * 0.07, 0.2, 'triangle', 0.05, this.fx('tripReturn')));
    this.tone(this.semi(28), t + 0.28, 0.35, 'sine', 0.04, this.fx('tripReturn'));
  }

  // ---------- 調達 ----------

  /** 調達で手に入れた（種類ごとに音を変える） */
  gain(kind: 'fishing' | 'hunting' | 'gathering' | 'trading') {
    if (!this.ok) return;
    const t = this.now;
    if (kind === 'fishing') {
      // 水しぶき
      this.noise(t, 0.25, 0.08, this.fx('gain'), 'bandpass', 1400);
      this.tone(600, t, 0.18, 'sine', 0.05, this.fx('gain'), 1200);
    } else if (kind === 'hunting') {
      // 銃声：乾いた破裂と低い響き
      this.noise(t, 0.12, 0.14, this.fx('gain'), 'lowpass', 2500);
      this.tone(110, t, 0.18, 'sine', 0.1, this.fx('gain'), 50);
    } else if (kind === 'gathering') {
      // 摘み取る「ぽん」
      this.tone(420, t, 0.1, 'sine', 0.08, this.fx('gain'), 900);
      this.tone(this.semi(24), t + 0.06, 0.12, 'triangle', 0.04, this.fx('gain'));
    } else {
      // 落札の木槌2回と硬貨
      this.tone(330, t, 0.06, 'triangle', 0.09, this.fx('gain'));
      this.tone(330, t + 0.1, 0.06, 'triangle', 0.09, this.fx('gain'));
      this.coin(t + 0.18);
    }
  }

  /** 獲物に当たった：乾いた銃声 */
  shot() {
    if (!this.ok) return;
    const t = this.now;
    this.noise(t, 0.1, 0.12, this.fx('shot'), 'lowpass', 3000);
    this.tone(160, t, 0.12, 'sine', 0.08, this.fx('shot'), 70);
  }

  /** 仕留めた：小物は弾む音、大物は二連の銃声と重い響きとファンファーレ */
  kill(big: boolean) {
    if (!this.ok) return;
    const t = this.now;
    if (!big) {
      this.noise(t, 0.14, 0.16, this.fx('kill'), 'lowpass', 2600);
      this.tone(130, t, 0.2, 'sine', 0.12, this.fx('kill'), 50);
      [19, 24].forEach((s, i) => this.tone(this.semi(s), t + 0.06 + i * 0.06, 0.18, 'triangle', 0.05, this.fx('kill')));
      return;
    }
    for (const d of [0, 0.12]) {
      this.noise(t + d, 0.2, 0.2, this.fx('kill'), 'lowpass', 2200);
      this.tone(110, t + d, 0.35, 'sine', 0.16, this.fx('kill'), 38);
    }
    this.noise(t + 0.15, 0.5, 0.06, this.fx('kill'), 'lowpass', 400);
    [12, 16, 19, 24, 28].forEach((s, i) => this.tone(this.semi(s), t + 0.28 + i * 0.07, 0.32, 'square', 0.035, this.fx('kill')));
    this.tone(this.semi(31), t + 0.65, 0.6, 'triangle', 0.05, this.fx('kill'));
  }

  /** 毒きのこを摘んだ：くぐもった「ぼふっ」 */
  poison() {
    if (!this.ok) return;
    const t = this.now;
    this.noise(t, 0.25, 0.1, this.fx('poison'), 'lowpass', 600);
    this.tone(200, t, 0.3, 'triangle', 0.06, this.fx('poison'), 90);
  }

  /** 魚がかかった */
  bite() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(300, t, 0.12, 'sine', 0.08, this.fx('bite'), 700);
    this.noise(t, 0.1, 0.05, this.fx('bite'), 'bandpass', 1800);
  }

  /** 調達の失敗（逃げられた・取られた・毒） */
  loss() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(330, t, 0.2, 'triangle', 0.06, this.fx('loss'), 165);
  }

  // ---------- 結果画面 ----------

  /** 開店のカウントダウン：3・2・1 は短い音、0 は開店の明るい和音 */
  count(n: number) {
    if (!this.ok) return;
    const t = this.now;
    if (n > 0) {
      this.tone(this.semi(19), t, 0.16, 'square', 0.05, this.fx('count'));
      this.tone(this.semi(31), t, 0.08, 'triangle', 0.03, this.fx('count'));
    } else {
      [24, 28, 31, 36].forEach((s, i) => this.tone(this.semi(s), t + i * 0.03, 0.5, 'square', 0.04, this.fx('count')));
      this.noise(t, 0.08, 0.05, this.fx('count'));
    }
  }

  /** BGM の速さを変える（1 が元の速さ） */
  setRate(rate: number) {
    this.rate = 1 + (rate - 1) * RATE_STRENGTH;
    if (this.playing) this.playing.playbackRate.value = this.rate;
  }

  /** 閉店前の秒読み：残り秒数が少ないほど高く、最後の3秒は2音にする */
  final(n: number) {
    if (!this.ok) return;
    const t = this.now;
    const s = 26 + (10 - n);
    this.tone(this.semi(s), t, 0.09, 'square', 0.045, this.fx('final'));
    if (n <= 3) this.tone(this.semi(s + 12), t + 0.1, 0.09, 'square', 0.035, this.fx('final'));
  }

  /** 売上を数える間のカチカチ音 */
  tick() {
    if (!this.ok) return;
    this.tone(1800, this.now, 0.025, 'square', 0.025, this.fx('tick'));
  }

  /** ランクの判子を押す */
  stamp() {
    if (!this.ok) return;
    const t = this.now;
    this.noise(t, 0.12, 0.12, this.fx('stamp'), 'lowpass', 400);
    this.tone(90, t, 0.2, 'sine', 0.12, this.fx('stamp'), 50);
  }

  /** 自己ベスト更新のきらめき */
  sparkle() {
    if (!this.ok) return;
    const t = this.now;
    [24, 28, 31, 36, 40].forEach((s, i) => this.tone(this.semi(s), t + i * 0.06, 0.3, 'triangle', 0.04, this.fx('sparkle')));
  }

  /**
   * コンボのファンファーレ。段階が上がるほど音数が増え、駆け上がる音が高く・速くなる。
   * 音量は上げずに、和音とキラキラした高音で厚みを足す（15 で最大）。
   */
  combo(count: number) {
    if (!this.ok) return;
    const t = this.now, fx = comboFx(count);
    const step = Math.max(0.026, 0.045 - fx.level * 0.002);
    fx.notes.forEach((n, i) => this.tone(this.note(n), t + i * step, fx.level ? 0.22 : 0.12, fx.level >= 5 ? 'square' : 'triangle', fx.level >= 5 ? 0.032 : 0.05, this.fx('combo')));
    const end = t + fx.notes.length * step;
    if (fx.level >= 1) this.tone(this.note(fx.notes[fx.notes.length - 1] + 2), end, 0.3, 'sine', 0.04, this.fx('combo'));
    if (fx.level >= 2) this.noise(t, 0.05, 0.025 + fx.level * 0.002, this.fx('combo'));
    if (fx.level >= 4) [0, 2, 4].forEach((s) => this.tone(this.note(Math.min(fx.level, 6) + s), end, 0.4, 'sine', 0.022, this.fx('combo')));
    if (fx.level >= 7) for (let i = 0; i < 4; i++) this.tone(this.note(10 + i * 2), end + 0.04 + i * 0.03, 0.12, 'square', 0.018, this.fx('combo'));
    if (fx.max) [0, 2, 4, 5].forEach((s, i) => this.tone(this.note(8 + s), end + 0.12 + i * 0.02, 0.6, 'triangle', 0.028, this.fx('combo')));
  }

  // ---------- BGM ----------

  /** 場面の曲を流す（同じ曲ならそのまま続ける） */
  play(track: Track) {
    if (this.wanted === track && (this.playing || this.pending)) return;
    this.stop();
    this.wanted = track;
    this.rate = 1;
    if (!this.ac || !this.music) return;

    const pending = new AbortController();
    this.pending = pending;
    void this.startTrack(track, this.ac, this.music, pending);
  }

  private async startTrack(track: Track, ac: AudioContext, output: GainNode, pending: AbortController) {
    const { url, start, end, offsetSeconds = 0 } = TRACKS[track];
    try {
      let data = this.encoded.get(track);
      if (!data) {
        const response = await fetch(url, { signal: pending.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.arrayBuffer();
        this.encoded.set(track, data);
      }
      // 展開すると元のデータは使えなくなるので、写しを渡す
      const buffer = await ac.decodeAudioData(data.slice(0));
      // デコードの間に場面が変わった場合は、古い曲を鳴らさない。
      if (pending.signal.aborted) return;
      const source = ac.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = this.rate;
      source.loopStart = start / BGM_SAMPLE_RATE;
      source.loopEnd = Math.min(buffer.duration, end / BGM_SAMPLE_RATE);
      source.connect(output);
      source.start(0, offsetSeconds);
      this.playing = source;
    } catch (error) {
      if (!pending.signal.aborted) console.warn(`BGM を再生できませんでした: ${track}`, error);
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }

  /** 互換用：昔の呼び方（mode と速さ）を曲に読み替える */
  bgm(mode: 'shop' | 'trip' | 'title', tempo: number) {
    if (mode === 'title') this.play('title');
    else if (mode === 'trip') this.play('fishing');
    else this.play(tempo >= 130 ? 'night' : tempo >= 115 ? 'noon' : 'morning');
  }

  stop() {
    this.wanted = null;
    this.pending?.abort();
    this.pending = null;
    this.playing?.stop();
    this.playing = null;
  }
}
