// 起動時に読み込む文字の一覧が、ゲームの文字をすべて含んでいること
import { describe, expect, it } from 'vitest';
import { collectChars } from '../scripts/fontChars';
import { FONT_TEXT } from '../src/ui/fontText';

describe('先に読み込む文字', () => {
  it('src の文字列に出てくる文字をすべて含む（足りないときは npm run font-text で作り直す）', () => {
    const have = new Set(FONT_TEXT);
    const missing = collectChars('src').filter((ch) => !have.has(ch));
    expect(missing.join('')).toBe('');
  });
  it('英数字と記号も含む', () => {
    for (const ch of 'AZaz09!?%:/()-') expect(FONT_TEXT).toContain(ch);
  });
});
