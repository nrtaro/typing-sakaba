// ゲームの画面に出る文字を集める（文字の書体を、使う分だけ先に読み込むため）。
// src の中の文字列（'…' "…" `…`）にある文字を、重ねずに並べる。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const STRING = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** src の文字列に出てくる、ASCII 以外の文字（並べ替え済み） */
export function collectChars(srcDir: string): string[] {
  const set = new Set<string>();
  for (const f of files(srcDir)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(STRING)) for (const ch of m[2]) if (ch > '~') set.add(ch);
  }
  return [...set].sort();
}
