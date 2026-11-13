import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { wrapText } from '../src/ui/screens/records';

// 1文字＝幅1として測る
const sc = { W: (t: string) => [...t].length };

describe('折り返し', () => {
  it('数字や倍率（x1.4・+150円の数字・Lv2）を行の途中で切らない', () => {
    const rows = wrapText(sc, 'ミスなしで打ち切った皿は売上x1.4。', 1, 14);
    expect(rows).toEqual(['ミスなしで打ち切った皿は売上', 'x1.4。']);
    expect(wrapText(sc, '酒を1杯付けて+150円', 1, 8)).toEqual(['酒を1杯付けて', '+150円']);
  });

  it('日本語は1文字ずつ折り返し、句読点や閉じかっこは行頭に置かない', () => {
    expect(wrapText(sc, 'あいうえおか。', 1, 6)).toEqual(['あいうえおか。']);
    expect(wrapText(sc, 'あいうえおかき', 1, 3)).toEqual(['あいう', 'えおか', 'き']);
  });

  it('幅より長い英数字の並びは、1文字ずつに戻して折り返す', () => {
    expect(wrapText(sc, 'abcdefgh', 1, 3)).toEqual(['abc', 'def', 'gh']);
  });
});
