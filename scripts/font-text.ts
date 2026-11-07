// src/ui/fontText.ts を作り直す：npm run font-text
import { writeFileSync } from 'node:fs';
import { collectChars } from './fontChars';

const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const text = ascii + collectChars('src').join('');
writeFileSync('src/ui/fontText.ts', `// 自動生成（npm run font-text）。ゲームの画面に出る文字。起動時に、この文字を含む書体の部分だけを読み込む。
export const FONT_TEXT = ${JSON.stringify(text)};
`);
console.log(`src/ui/fontText.ts：${[...text].length}文字`);
