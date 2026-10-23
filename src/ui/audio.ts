// 電子音系の効果音とBGM（Web Audio で生成。音声ファイルは使っていない）
import type { Settings } from '../core/save';

const SCALE = [0, 2, 4, 7, 9]; // ハ長調のペンタトニック（BGMと同じ調）
const BASE = 261.63;

export class Sound {
  private ac: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private tempo = 0;
  private mode: 'shop' | 'trip' | 'title' = 'title';

  constructor(private settings: Settings) {}

  /** ブラウザは操作の後でしか音を出せないので、最初のキー入力で呼ぶ */
  unlock() {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = new Ctor();
      this.sfx = this.ac.createGain();
      this.music = this.ac.createGain();
      this.sfx.connect(this.ac.destination);
      this.music.connect(this.ac.destination);
      this.apply(this.settings);
    } catch {
      this.ac = null;
    }
  }

  apply(s: Settings) {
    this.settings = s;
    if (!this.ac || !this.sfx || !this.music) return;
    const t = this.ac.currentTime;
    this.sfx.gain.setTargetAtTime(s.muted ? 0 : s.seVolume * 0.6, t, 0.02);
    this.music.gain.setTargetAtTime(s.muted ? 0 : s.bgmVolume * 0.6, t, 0.05);
  }

  private tone(f: number, at: number, d: number, type: OscillatorType, v: number, out: GainNode) {
    const ac = this.ac!;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + d + 0.02);
  }

  private noise(at: number, d: number, v: number, out: GainNode) {
    const ac = this.ac!;
    const b = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * d)), ac.sampleRate);
    const ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource();
    const g = ac.createGain();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    s.buffer = b;
    g.gain.setValueAtTime(v, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    s.connect(hp).connect(g).connect(out);
    s.start(at);
  }

  private note(n: number) {
    return 2 * BASE * Math.pow(2, (SCALE[n % 5] + 12 * Math.floor(n / 5)) / 12);
  }

  /** 打鍵音。n 打目ほど音階が上がる（同じ言葉の中で） */
  key(n: number) {
    if (!this.ac || !this.sfx) return;
    const t = this.ac.currentTime;
    const f = this.note(Math.min(Math.max(0, n - 1), 14));
    this.tone(f, t, 0.09, 'square', 0.06, this.sfx);
    this.tone(f * 2, t, 0.05, 'triangle', 0.04, this.sfx);
  }

  miss() {
    if (!this.ac || !this.sfx) return;
    const t = this.ac.currentTime;
    this.tone(130, t, 0.12, 'sawtooth', 0.07, this.sfx);
    this.tone(116, t + 0.04, 0.1, 'square', 0.05, this.sfx);
  }

  /** 料理を出した・調達に出たなどの和音。combo が高いほど高い音 */
  chord(level: number) {
    if (!this.ac || !this.sfx) return;
    const t = this.ac.currentTime;
    [0, 2, 4].forEach((s, i) => this.tone(this.note(s + Math.min(level, 8)), t + i * 0.045, 0.24, 'square', 0.05, this.sfx!));
    this.noise(t, 0.05, 0.06, this.sfx);
  }

  coin() {
    if (!this.ac || !this.sfx) return;
    const t = this.ac.currentTime;
    this.tone(1568, t, 0.05, 'square', 0.05, this.sfx);
    this.tone(2093, t + 0.05, 0.09, 'square', 0.05, this.sfx);
  }

  bad() {
    if (!this.ac || !this.sfx) return;
    const t = this.ac.currentTime;
    this.tone(300, t, 0.12, 'triangle', 0.1, this.sfx);
    this.tone(200, t + 0.1, 0.16, 'triangle', 0.1, this.sfx);
  }

  /** BGM：営業は時間帯で速さが変わる。調達中は少し跳ねた曲 */
  bgm(mode: 'shop' | 'trip' | 'title', tempo: number) {
    if (this.mode === mode && this.tempo === tempo && this.timer !== null) return;
    this.mode = mode;
    this.tempo = tempo;
    this.stop();
    if (!this.ac) return;
    this.step = 0;
    const beat = 60 / tempo / 2;
    const prog = mode === 'trip' ? [[0, 4, 7], [2, 5, 9], [-3, 0, 4], [-5, -1, 2]] : [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
    const lead = [12, 16, 19, 16, 14, 12, 9, 12, 7, 9, 12, 14, 16, 14, 12, 9];
    this.timer = window.setInterval(() => {
      const ac = this.ac;
      if (!ac || !this.music || ac.state !== 'running') return;
      const t = ac.currentTime + 0.03;
      const i = this.step++;
      const ch = prog[Math.floor(i / 8) % 4];
      const f = (s: number) => BASE * Math.pow(2, s / 12);
      if (i % 2 === 0) this.tone(f(ch[0] - 12) / 2, t, beat * 1.8, 'triangle', 0.13, this.music);
      this.tone(f(ch[(i >> 1) % 3] + 12), t, beat * 0.8, 'square', mode === 'title' ? 0.012 : 0.018, this.music);
      if (mode !== 'title' && (i % 4 === 2 || (tempo > 130 && i % 2))) this.noise(t, 0.03, 0.035, this.music);
      if (i % 2 === 0 && Math.floor(i / 16) % 2) this.tone(f(lead[(i >> 1) % 16]), t, beat * 1.6, 'square', 0.028, this.music);
    }, beat * 1000);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}
