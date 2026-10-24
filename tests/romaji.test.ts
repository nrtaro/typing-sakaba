import { describe, expect, it } from 'vitest';
import { RomajiMatcher, defaultRomaji, firstKeys } from '../src/core/romaji';
import { FISHING_PHRASES as FISHING_WORDS, HUNTING_WORDS } from '../src/core/minigames';

function typeAll(reading: string, keys: string): { ok: boolean; misses: number } {
  const m = new RomajiMatcher(reading);
  let misses = 0;
  for (const k of keys) {
    if (m.input(k) === 'miss') misses++;
  }
  return { ok: m.done, misses };
}

describe('RomajiMatcher', () => {
  it.each([
    ['し', 'shi'], ['し', 'si'], ['し', 'ci'],
    ['ち', 'chi'], ['ち', 'ti'],
    ['つ', 'tsu'], ['つ', 'tu'],
    ['ふ', 'fu'], ['ふ', 'hu'],
    ['じゃ', 'ja'], ['じゃ', 'zya'], ['じゃ', 'jya'], ['じゃ', 'jixya'],
    ['しょう', 'shou'], ['しょう', 'syou'], ['しょう', 'sixyou'],
    ['きゃ', 'kya'], ['きゃ', 'kilya'],
    ['かった', 'katta'], ['かった', 'kaxtuta'], ['かった', 'kaltsuta'],
    ['いっち', 'icchi'], ['いっち', 'itti'],
    ['ほんや', 'honnya'], ['ほんや', 'hoxnya'],
    ['ほんと', 'honto'], ['ほんと', 'honnto'],
    ['ほん', 'honn'], ['ほん', 'hoxn'],
    ['こんな', 'konnna'],
    ['かんい', 'kanni'],
    ['ぎゅうにゅう', 'gyuunyuu'],
  ])('%s を %s で入力できる', (reading, keys) => {
    expect(typeAll(reading, keys)).toEqual({ ok: true, misses: 0 });
  });

  it('誤入力では進まない', () => {
    const m = new RomajiMatcher('かぜ');
    expect(m.input('x')).toBe('miss');
    expect(m.kanaPos).toBe(0);
    expect(m.typed).toBe('');
    expect(m.input('k')).toBe('ok');
    expect(m.input('o')).toBe('miss');
    expect(m.input('a')).toBe('ok');
    expect(m.kanaPos).toBe(1);
  });

  it('「ん」の後に母音がくる場合 n 1打では確定しない', () => {
    // かんい: kani と打つと「かにい」になってしまうため kan + i は不可
    const m = new RomajiMatcher('かんい');
    for (const k of 'kan') m.input(k);
    expect(m.input('i')).toBe('miss');
    expect(m.input('n')).toBe('ok');
    expect(m.input('i')).toBe('complete');
  });

  it('語末の「ん」は nn が必要', () => {
    const m = new RomajiMatcher('ほん');
    for (const k of 'hon') m.input(k);
    expect(m.done).toBe(false);
    expect(m.input('n')).toBe('complete');
  });

  it('ガイド表示は入力した綴りに追従する', () => {
    const m = new RomajiMatcher('しお');
    expect(m.remaining).toBe('sio');
    m.input('s');
    m.input('h');
    expect(m.remaining).toBe('io');
    m.input('i');
    expect(m.typed).toBe('shi');
    expect(m.remaining).toBe('o');
  });

  it('し・ち・つ・ふ・じ・しゃ・ちゃ・ちぇ は訓令式の綴りを先に表示する', () => {
    const cases: [string, string][] = [
      ['ふつう', 'hutuu'], ['しち', 'siti'], ['じびーる', 'zibi-ru'], ['しゃしゅしょ', 'syasyusyo'],
      ['しぇ', 'sye'], ['ちゃちゅちょ', 'tyatyutyo'], ['ちぇ', 'tye'],
    ];
    for (const [kana, roma] of cases) expect(new RomajiMatcher(kana).remaining).toBe(roma);
  });

  it('wouldAccept は状態を変えない', () => {
    const m = new RomajiMatcher('すな');
    expect(m.wouldAccept('s')).toBe(true);
    expect(m.wouldAccept('a')).toBe(false);
    expect(m.typed).toBe('');
  });

  it('大文字でも受け付ける', () => {
    expect(typeAll('かぜ', 'KAZE')).toEqual({ ok: true, misses: 0 });
  });
});

describe('出題データ', () => {
  it.each([...FISHING_WORDS, ...HUNTING_WORDS].map((w) => [w.text, w.kana]))(
    '%s（%s）はおすすめ綴りで最後まで打てる',
    (_text, kana) => {
      const keys = defaultRomaji(kana);
      expect(typeAll(kana, keys)).toEqual({ ok: true, misses: 0 });
    },
  );

  it('狩りの単語は最初の打鍵が決まっている', () => {
    for (const w of HUNTING_WORDS) expect(firstKeys(w.kana).size).toBeGreaterThan(0);
  });
});
