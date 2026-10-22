// 仮の効果音とBGM（Web Audio で合成。音声ファイルは使っていない）
import type { Settings } from '../core/save';

type Sfx = 'key' | 'miss' | 'word' | 'catch' | 'big' | 'escape' | 'coin' | 'buy' | 'click' | 'count' | 'start' | 'end' | 'bite';

export class Audio {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmMode: 'tavern' | 'calm' | 'hunt' | 'off' = 'off';
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  /** ブラウザはユーザー操作の後でしか音を出せないため、最初のキー入力・クリックで呼ぶ */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
      this.bgmGain.connect(this.ctx.destination);
      this.apply(this.settings);
      if (this.bgmMode !== 'off') this.startLoop();
    } catch {
      this.ctx = null;
    }
  }

  apply(s: Settings) {
    this.settings = s;
    if (!this.ctx || !this.sfxGain || !this.bgmGain) return;
    const now = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(s.muted ? 0 : s.seVolume * 0.5, now, 0.02);
    this.bgmGain.gain.setTargetAtTime(s.muted ? 0 : s.bgmVolume * 0.22, now, 0.05);
  }

  play(name: Sfx) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || this.settings.muted) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'key': return this.tone(1200 + Math.random() * 200, t, 0.03, 'square', 0.08);
      case 'miss': return this.tone(140, t, 0.09, 'sawtooth', 0.18);
      case 'word': return this.tone(880, t, 0.05, 'triangle', 0.18), this.tone(1320, t + 0.04, 0.06, 'triangle', 0.14);
      case 'bite': return this.tone(330, t, 0.08, 'triangle', 0.2), this.tone(220, t + 0.08, 0.1, 'triangle', 0.2);
      case 'catch': return [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.06, 0.1, 'triangle', 0.2));
      case 'big': return [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.07, 0.14, 'square', 0.12));
      case 'escape': return this.tone(300, t, 0.12, 'triangle', 0.15), this.tone(200, t + 0.1, 0.15, 'triangle', 0.15);
      case 'coin': return this.tone(1568, t, 0.05, 'square', 0.08), this.tone(2093, t + 0.05, 0.08, 'square', 0.08);
      case 'buy': return [440, 554, 659, 880].forEach((f, i) => this.tone(f, t + i * 0.05, 0.1, 'square', 0.1));
      case 'click': return this.tone(660, t, 0.03, 'square', 0.08);
      case 'count': return this.tone(440, t, 0.1, 'square', 0.12);
      case 'start': return this.tone(880, t, 0.2, 'square', 0.14);
      case 'end': return [784, 659, 523].forEach((f, i) => this.tone(f, t + i * 0.1, 0.16, 'triangle', 0.18));
    }
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.sfxGain!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  setBgm(mode: 'tavern' | 'calm' | 'hunt' | 'off') {
    if (mode === this.bgmMode) return;
    this.bgmMode = mode;
    this.stopLoop();
    if (mode !== 'off' && this.ctx) this.startLoop();
  }

  private stopLoop() {
    if (this.bgmTimer !== null) window.clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  private startLoop() {
    this.stopLoop();
    this.bgmStep = 0;
    const tempo = this.bgmMode === 'hunt' ? 0.16 : this.bgmMode === 'calm' ? 0.32 : 0.26;
    this.bgmTimer = window.setInterval(() => this.bgmTick(tempo), tempo * 1000);
  }

  private bgmTick(step: number) {
    const ctx = this.ctx;
    if (!ctx || !this.bgmGain || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.05;
    const i = this.bgmStep++;
    // 落ち着いたマイナー調の進行
    const roots = this.bgmMode === 'hunt' ? [110, 110, 98, 131] : [110, 87.3, 98, 82.4];
    const root = roots[Math.floor(i / 8) % 4];
    const arp = [1, 1.5, 2, 2.4, 2, 1.5, 3, 2.4];
    const note = (f: number, d: number, type: OscillatorType, v: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.bgmGain!);
      o.start(t);
      o.stop(t + d + 0.05);
    };
    if (i % 8 === 0) note(root / 2, step * 7, 'triangle', 0.5);
    if (this.bgmMode === 'hunt') {
      if (i % 2 === 0) note(root, step * 0.8, 'square', 0.12);
      if (i % 4 === 2) note(root * 3, step * 0.5, 'square', 0.06);
    } else {
      note(root * arp[i % 8] * 2, step * 1.6, 'triangle', 0.18);
      if (this.bgmMode === 'tavern' && i % 4 === 3) note(root * 4, step * 0.6, 'square', 0.04);
    }
  }
}
