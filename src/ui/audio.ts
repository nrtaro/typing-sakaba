import { comboFx } from './comboFx';
// 効果音とBGM（Web Audio で生成。音声ファイルは使っていない）
// BGM は場面ごとに別の曲（コード進行・旋律・リズム・音色）を持ち、効果音も場面ごとに鳴らし分ける。
import type { Settings } from '../core/save';

const SCALE = [0, 2, 4, 7, 9]; // ハ長調のペンタトニック（打鍵音・コンボに使う）
const BASE = 261.63;

/** 音量の段階（なし・小・中・大） */
export const VOLUME_LEVELS = [0, 0.35, 0.65, 1];
export const VOLUME_NAMES = ['なし', '小', '中', '大'];

export type Track = 'title' | 'morning' | 'noon' | 'night' | 'fishing' | 'hunting' | 'gathering' | 'trading' | 'result';

/** 1 小節は 8 拍（8 分音符）。数字は C4 からの半音。null は休み */
interface Song {
  tempo: number;
  chords: number[][];
  /** 低音を鳴らす拍 */
  bass: number[];
  /** 和音を分散して鳴らす拍と、何番目の音か */
  arp: (number | null)[];
  lead: (number | null)[];
  leadWave: OscillatorType;
  arpWave: OscillatorType;
  kick?: number[];
  snare?: number[];
  hat?: number[];
  /** 全体の音量 */
  vol: number;
}

const _ = null;
const SONGS: Record<Track, Song> = {
  // タイトル：ゆったりした夜の酒場。打楽器なし、柔らかい音色
  title: {
    tempo: 84, chords: [[5, 9, 12], [2, 5, 9], [-2, 2, 5], [0, 4, 7]],
    bass: [0, 4], arp: [0, _, 1, _, 2, _, 1, _], leadWave: 'triangle', arpWave: 'sine', vol: 0.9,
    lead: [17, _, 16, _, 14, _, 12, _, 14, _, _, _, 9, _, _, _, 10, _, 12, _, 14, _, 17, _, 16, _, _, _, _, _, _, _],
  },
  // 朝：明るく軽い。鈴のような音
  morning: {
    tempo: 104, chords: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]],
    bass: [0, 4], arp: [0, 1, 2, 1, 0, 1, 2, 1], leadWave: 'triangle', arpWave: 'square', vol: 0.8, hat: [2, 6],
    lead: [12, 14, 16, _, 19, _, 16, _, 14, _, 11, _, 7, _, _, _, 9, 12, 16, _, 14, _, 12, _, 9, _, _, _, 12, _, _, _],
  },
  // 昼：はずむ忙しさ
  noon: {
    tempo: 120, chords: [[-5, -1, 2], [0, 4, 7], [2, 6, 9], [4, 7, 11]],
    bass: [0, 3, 4, 6], arp: [0, 2, 1, 2, 0, 2, 1, 2], leadWave: 'square', arpWave: 'triangle', vol: 0.8,
    kick: [0, 4], snare: [2, 6], hat: [1, 3, 5, 7],
    lead: [14, _, 14, 16, 19, _, 16, 14, 12, _, 11, _, 9, _, 7, _, 9, _, 11, 12, 14, _, 16, _, 18, _, 14, _, 19, _, _, _],
  },
  // 夜：にぎやかで少し哀愁のある短調
  night: {
    tempo: 138, chords: [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]],
    bass: [0, 2, 3, 4, 6], arp: [0, 1, 2, 1, 0, 1, 2, 1], leadWave: 'square', arpWave: 'square', vol: 0.75,
    kick: [0, 3, 4], snare: [2, 6], hat: [0, 1, 2, 3, 4, 5, 6, 7],
    lead: [9, 12, 16, 12, 17, 16, 12, 9, 9, _, 12, _, 7, _, _, _, 9, 12, 16, 19, 21, 19, 16, 12, 14, _, 12, _, 11, _, 12, _],
  },
  // 釣り：水面のようにゆれる
  fishing: {
    tempo: 112, chords: [[2, 5, 9], [-5, -1, 2], [2, 5, 9], [0, 4, 7]],
    bass: [0, 5], arp: [0, 1, 2, 1, 2, 1, 0, 1], leadWave: 'sine', arpWave: 'triangle', vol: 0.85, hat: [3, 7],
    lead: [14, _, _, 17, 21, _, 19, _, 17, _, _, _, 14, _, _, _, 12, _, _, 14, 17, _, 19, _, 14, _, _, _, _, _, _, _],
  },
  // 狩り：力強く駆ける
  hunting: {
    tempo: 146, chords: [[-8, -5, -1], [-12, -8, -5], [-10, -6, -3], [-8, -5, -1]],
    bass: [0, 1, 2, 3, 4, 5, 6, 7], arp: [_, _, 2, _, _, _, 2, _], leadWave: 'sawtooth', arpWave: 'square', vol: 0.6,
    kick: [0, 2, 4, 6], snare: [4], hat: [1, 3, 5, 7],
    lead: [4, _, 7, _, 11, 9, 7, _, 4, _, _, _, 2, _, 4, _, 7, _, 11, _, 14, 12, 11, _, 9, _, _, _, 7, _, _, _],
  },
  // 採取：温室の明るい陽だまり
  gathering: {
    tempo: 126, chords: [[5, 9, 12], [0, 4, 7], [-2, 2, 5], [0, 4, 7]],
    bass: [0, 4], arp: [0, 1, 2, 3, 2, 1, 0, 1], leadWave: 'triangle', arpWave: 'triangle', vol: 0.8, hat: [2, 6], kick: [0],
    lead: [17, 19, 21, _, 24, _, 21, _, 19, _, 16, _, 17, _, _, _, 14, 16, 17, _, 21, _, 19, _, 17, _, _, _, _, _, _, _],
  },
  // 仕入れ：せり市の小気味よさ
  trading: {
    tempo: 132, chords: [[-3, 0, 4], [2, 5, 9], [-5, -1, 2], [0, 4, 7]],
    bass: [0, 2, 4, 6], arp: [_, 0, _, 1, _, 2, _, 1], leadWave: 'square', arpWave: 'square', vol: 0.7,
    kick: [0, 4], snare: [2, 6, 7], hat: [1, 5],
    lead: [16, 16, _, 14, 12, _, 9, _, 14, 14, _, 12, 11, _, _, _, 12, 12, _, 14, 16, _, 19, _, 16, _, 14, _, 12, _, _, _],
  },
  // 結果：一日の終わりのあたたかい余韻
  result: {
    tempo: 92, chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    bass: [0, 4], arp: [0, 1, 2, 1, 2, 1, 0, 1], leadWave: 'triangle', arpWave: 'sine', vol: 0.85, hat: [4],
    lead: [16, _, 19, _, 24, _, 23, _, 21, _, _, _, 19, _, _, _, 17, _, 16, _, 14, _, 12, _, 14, _, _, _, _, _, _, _],
  },
};

export class Sound {
  /** 曲の一覧（音の確認用に外から読めるようにする） */
  static readonly SONGS = SONGS;
  private ac: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  /** 次の拍を鳴らす時刻（音の時計）。先読みして予約し、タイマーの遅れで拍がずれないようにする */
  private nextTime = 0;
  /** 全体の音量と、音割れを防ぐリミッター */
  private master: GainNode | null = null;
  /** ノイズ用の音（1秒分を一度だけ作り、毎回切り出して使う） */
  private noiseBuf: AudioBuffer | null = null;
  private track: Track | null = null;
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
      if (this.wanted) {
        const w = this.wanted;
        this.track = null;
        this.play(w);
      }
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
    this.sfx.gain.setTargetAtTime(level * 1.0, t, 0.02);
    this.music.gain.setTargetAtTime(level * 0.85, t, 0.05);
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

  private get now() {
    return this.ac?.currentTime ?? 0;
  }

  private get ok() {
    return !!this.ac && !!this.sfx;
  }

  // ---------- 打鍵 ----------

  /** 打鍵音。n 打目ほど音階が上がる（同じ言葉の中で） */
  key(n: number) {
    if (!this.ok) return;
    const t = this.now;
    const f = this.note(Math.min(Math.max(0, n - 1), 14));
    this.tone(f, t, 0.08, 'square', 0.05, this.sfx!);
    this.tone(f * 2, t, 0.04, 'triangle', 0.035, this.sfx!);
  }

  miss() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(150, t, 0.12, 'sawtooth', 0.06, this.sfx!, 110);
    this.noise(t, 0.05, 0.04, this.sfx!, 'lowpass', 900);
  }

  /** メニューを選んだ */
  select() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(this.semi(19), t, 0.12, 'triangle', 0.06, this.sfx!);
    this.tone(this.semi(24), t + 0.06, 0.18, 'triangle', 0.06, this.sfx!);
  }

  /** 互換用の短い和音（level が高いほど高い） */
  chord(level: number) {
    if (!this.ok) return;
    const t = this.now;
    [0, 2, 4].forEach((s, i) => this.tone(this.note(s + Math.min(level, 8)), t + i * 0.045, 0.22, 'square', 0.04, this.sfx!));
  }

  // ---------- 店 ----------

  /** 料理を出した：皿を置く音と、硬貨の音 */
  serve() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(2350, t, 0.09, 'triangle', 0.05, this.sfx!);
    this.tone(2490, t + 0.004, 0.07, 'triangle', 0.035, this.sfx!);
    this.noise(t, 0.04, 0.05, this.sfx!, 'bandpass', 3200);
    this.coin(t + 0.06);
  }

  coin(at?: number) {
    if (!this.ok) return;
    const t = at ?? this.now;
    this.tone(1568, t, 0.05, 'square', 0.04, this.sfx!);
    this.tone(2093, t + 0.05, 0.1, 'square', 0.04, this.sfx!);
  }

  /** 素材が足りない：短いブザー2回 */
  lack() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(196, t, 0.08, 'square', 0.05, this.sfx!);
    this.tone(196, t + 0.11, 0.08, 'square', 0.05, this.sfx!);
  }

  /** 客が怒って帰った：低くうなる声と、足を踏み鳴らす音 */
  angry() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(240, t, 0.32, 'sawtooth', 0.05, this.sfx!, 120);
    this.noise(t + 0.12, 0.08, 0.08, this.sfx!, 'lowpass', 300);
    this.noise(t + 0.26, 0.08, 0.06, this.sfx!, 'lowpass', 300);
  }

  /** 互換用：失敗音 */
  bad() {
    this.angry();
  }

  /** 時間帯が変わった：鐘の音 */
  bell() {
    if (!this.ok) return;
    const t = this.now;
    for (const [f, d] of [[880, 1.2], [1318, 0.9], [1760, 0.6]] as const) this.tone(f, t, d, 'sine', 0.035, this.sfx!);
  }

  /** 調達に出かける：扉の鈴と足音 */
  tripStart() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(1318, t, 0.5, 'sine', 0.05, this.sfx!);
    this.tone(1760, t + 0.07, 0.45, 'sine', 0.04, this.sfx!);
    for (let i = 0; i < 3; i++) this.noise(t + 0.18 + i * 0.12, 0.05, 0.06, this.sfx!, 'lowpass', 500);
  }

  /** 調達から帰った：明るく駆け上がる「ただいま」 */
  tripReturn() {
    if (!this.ok) return;
    const t = this.now;
    [12, 16, 19, 24].forEach((s, i) => this.tone(this.semi(s), t + i * 0.07, 0.2, 'triangle', 0.05, this.sfx!));
    this.tone(this.semi(28), t + 0.28, 0.35, 'sine', 0.04, this.sfx!);
  }

  // ---------- 調達 ----------

  /** 調達で手に入れた（種類ごとに音を変える） */
  gain(kind: 'fishing' | 'hunting' | 'gathering' | 'trading') {
    if (!this.ok) return;
    const t = this.now;
    if (kind === 'fishing') {
      // 水しぶき
      this.noise(t, 0.25, 0.08, this.sfx!, 'bandpass', 1400);
      this.tone(600, t, 0.18, 'sine', 0.05, this.sfx!, 1200);
    } else if (kind === 'hunting') {
      // 銃声：乾いた破裂と低い響き
      this.noise(t, 0.12, 0.14, this.sfx!, 'lowpass', 2500);
      this.tone(110, t, 0.18, 'sine', 0.1, this.sfx!, 50);
    } else if (kind === 'gathering') {
      // 摘み取る「ぽん」
      this.tone(420, t, 0.1, 'sine', 0.08, this.sfx!, 900);
      this.tone(this.semi(24), t + 0.06, 0.12, 'triangle', 0.04, this.sfx!);
    } else {
      // 落札の木槌2回と硬貨
      this.tone(330, t, 0.06, 'triangle', 0.09, this.sfx!);
      this.tone(330, t + 0.1, 0.06, 'triangle', 0.09, this.sfx!);
      this.coin(t + 0.18);
    }
  }

  /** 魚がかかった */
  bite() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(300, t, 0.12, 'sine', 0.08, this.sfx!, 700);
    this.noise(t, 0.1, 0.05, this.sfx!, 'bandpass', 1800);
  }

  /** 調達の失敗（逃げられた・取られた・毒） */
  loss() {
    if (!this.ok) return;
    const t = this.now;
    this.tone(330, t, 0.2, 'triangle', 0.06, this.sfx!, 165);
  }

  // ---------- 結果画面 ----------

  /** 開店のカウントダウン：3・2・1 は短い音、0 は開店の明るい和音 */
  count(n: number) {
    if (!this.ok) return;
    const t = this.now;
    if (n > 0) {
      this.tone(this.semi(19), t, 0.16, 'square', 0.05, this.sfx!);
      this.tone(this.semi(31), t, 0.08, 'triangle', 0.03, this.sfx!);
    } else {
      [24, 28, 31, 36].forEach((s, i) => this.tone(this.semi(s), t + i * 0.03, 0.5, 'square', 0.04, this.sfx!));
      this.noise(t, 0.08, 0.05, this.sfx!);
    }
  }

  /** 売上を数える間のカチカチ音 */
  tick() {
    if (!this.ok) return;
    this.tone(1800, this.now, 0.025, 'square', 0.025, this.sfx!);
  }

  /** ランクの判子を押す */
  stamp() {
    if (!this.ok) return;
    const t = this.now;
    this.noise(t, 0.12, 0.12, this.sfx!, 'lowpass', 400);
    this.tone(90, t, 0.2, 'sine', 0.12, this.sfx!, 50);
  }

  /** 自己ベスト更新のきらめき */
  sparkle() {
    if (!this.ok) return;
    const t = this.now;
    [24, 28, 31, 36, 40].forEach((s, i) => this.tone(this.semi(s), t + i * 0.06, 0.3, 'triangle', 0.04, this.sfx!));
  }

  /**
   * コンボのファンファーレ。段階が上がるほど音数が増え、駆け上がる音が高く・速くなる。
   * 音量は上げずに、和音とキラキラした高音で厚みを足す（15 で最大）。
   */
  combo(count: number) {
    if (!this.ok) return;
    const t = this.now, fx = comboFx(count);
    const step = Math.max(0.026, 0.045 - fx.level * 0.002);
    fx.notes.forEach((n, i) => this.tone(this.note(n), t + i * step, fx.level ? 0.22 : 0.12, fx.level >= 5 ? 'square' : 'triangle', fx.level >= 5 ? 0.032 : 0.05, this.sfx!));
    const end = t + fx.notes.length * step;
    if (fx.level >= 1) this.tone(this.note(fx.notes[fx.notes.length - 1] + 2), end, 0.3, 'sine', 0.04, this.sfx!);
    if (fx.level >= 2) this.noise(t, 0.05, 0.025 + fx.level * 0.002, this.sfx!);
    if (fx.level >= 4) [0, 2, 4].forEach((s) => this.tone(this.note(Math.min(fx.level, 6) + s), end, 0.4, 'sine', 0.022, this.sfx!));
    if (fx.level >= 7) for (let i = 0; i < 4; i++) this.tone(this.note(10 + i * 2), end + 0.04 + i * 0.03, 0.12, 'square', 0.018, this.sfx!);
    if (fx.max) [0, 2, 4, 5].forEach((s, i) => this.tone(this.note(8 + s), end + 0.12 + i * 0.02, 0.6, 'triangle', 0.028, this.sfx!));
  }

  // ---------- BGM ----------

  /** 場面の曲を流す（同じ曲ならそのまま続ける） */
  play(track: Track) {
    this.wanted = track;
    if (this.track === track && this.timer !== null) return;
    this.stop();
    this.track = track;
    if (!this.ac) return;
    const song = SONGS[track];
    this.step = 0;
    this.nextTime = this.ac.currentTime + 0.06;
    const beat = 60 / song.tempo / 2;
    // 25ミリ秒ごとに、少し先（0.15秒）までの拍を音の時計で予約する。
    // 画面の処理で一瞬止まっても、拍の時刻はずれない
    this.timer = window.setInterval(() => {
      const ac = this.ac;
      if (!ac || !this.music || ac.state !== 'running') return;
      // 裏に回るなどで大きく遅れたら、まとめて鳴らさずに今から仕切り直す
      if (this.nextTime < ac.currentTime - 0.1) this.nextTime = ac.currentTime + 0.05;
      while (this.nextTime < ac.currentTime + 0.15) {
        this.beatAt(song, this.step++, this.nextTime, beat);
        this.nextTime += beat;
      }
    }, 25);
  }

  /** 1拍分の伴奏・旋律・打楽器を、時刻 t に予約する */
  private beatAt(song: Song, i: number, t: number, beat: number) {
    const out = this.music!;
    const bar = song.chords.length * 8;
    const pos = i % 8;
    const ch = song.chords[Math.floor(i / 8) % song.chords.length];
    const v = song.vol;
    if (song.bass.includes(pos)) this.tone(this.semi(ch[0] - 24), t, beat * 1.7, 'triangle', 0.12 * v, out);
    const a = song.arp[pos];
    if (a !== null && a !== undefined) this.tone(this.semi(ch[a % ch.length] + (a >= ch.length ? 24 : 12)), t, beat * 0.9, song.arpWave, 0.016 * v, out);
    const l = song.lead[i % bar % song.lead.length];
    // 旋律は2周に1回だけ鳴らし、伴奏だけの小節で息継ぎさせる
    if (l !== null && l !== undefined && Math.floor(i / bar) % 2 === 0) this.tone(this.semi(l), t, beat * 1.7, song.leadWave, (song.leadWave === 'sawtooth' ? 0.016 : 0.028) * v, out);
    if (song.kick?.includes(pos)) this.tone(130, t, 0.12, 'sine', 0.13 * v, out, 45);
    if (song.snare?.includes(pos)) this.noise(t, 0.09, 0.05 * v, out, 'bandpass', 1800);
    if (song.hat?.includes(pos)) this.noise(t, 0.03, 0.025 * v, out);
  }

  /** 互換用：昔の呼び方（mode と速さ）を曲に読み替える */
  bgm(mode: 'shop' | 'trip' | 'title', tempo: number) {
    if (mode === 'title') this.play('title');
    else if (mode === 'trip') this.play('fishing');
    else this.play(tempo >= 130 ? 'night' : tempo >= 115 ? 'noon' : 'morning');
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}
