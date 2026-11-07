// 段階6：打鍵音の種類
import { describe, expect, it } from 'vitest';
import { Sound } from '../src/ui/audio';
import { DEFAULT_SETTINGS } from '../src/core/save';

/** 作った音の部品を数える、偽の音の部屋 */
function fakeContext() {
  const oscs: { type: string; f: number }[] = [];
  let noises = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ connect(n: unknown) { return n; }, gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  const ac = {
    currentTime: 0, sampleRate: 100, state: 'running', destination: {},
    createGain: node, createDynamicsCompressor: node, createBiquadFilter: () => ({ ...node(), type: '' }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
    createOscillator: () => {
      const o = { ...node(), type: 'sine', start() {}, stop() {}, frequency: { ...param(), setValueAtTime(f: number) { o.f = f; } }, f: 0 };
      oscs.push(o as never);
      return o;
    },
    createBufferSource: () => { noises++; return { ...node(), buffer: null, start() {} }; },
  };
  return { ac, oscs, noises: () => noises };
}
function sound(muted = false) {
  const s = new Sound({ ...DEFAULT_SETTINGS, muted });
  const f = fakeContext();
  (s as unknown as { build(ac: unknown): void }).build(f.ac);
  return { s, f };
}

describe('打鍵音', () => {
  it('付けた音の波形で鳴り、外すと元の音に戻る', () => {
    const { s, f } = sound();
    s.key(1);
    expect(f.oscs[0].type).toBe('square');
    f.oscs.length = 0;
    s.setKeyVoice({ wave: 'sine', base: 440, decay: 0.1, partial: 2, noise: 0.05 });
    s.key(1);
    expect(f.oscs.map((o) => o.type)).toEqual(['sine', 'sine']);
    expect(f.oscs[0].f).toBeCloseTo(440);
    expect(f.noises()).toBe(1);
    f.oscs.length = 0;
    s.key(3);
    expect(f.oscs[0].f).toBeGreaterThan(440);
    f.oscs.length = 0;
    s.setKeyVoice(null);
    s.key(1);
    expect(f.oscs[0].type).toBe('square');
  });

  it('消音中は何も作らない', () => {
    const { s, f } = sound(true);
    s.setKeyVoice({ wave: 'sine', base: 440, decay: 0.1 });
    s.key(1);
    expect(f.oscs).toHaveLength(0);
  });
});
