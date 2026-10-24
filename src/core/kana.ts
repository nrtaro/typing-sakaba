// かな → ローマ字の候補表。配列の先頭が画面に出す「おすすめ綴り」。
// し・ち・つ・ふ・じ・しゃ行・ちゃ行は訓令式（si, ti, tu, hu, zi, sya, tya）を先に出す。ほかの綴りも受け付ける。

const SINGLE: Record<string, string[]> = {
  あ: ['a'], い: ['i', 'yi'], う: ['u', 'wu', 'whu'], え: ['e'], お: ['o'],
  か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'],
  さ: ['sa'], し: ['si', 'shi', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'],
  た: ['ta'], ち: ['ti', 'chi'], つ: ['tu', 'tsu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['hu', 'fu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], を: ['wo'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['zi', 'ji'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ゔ: ['vu'],
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li'], ぅ: ['xu', 'lu'], ぇ: ['xe', 'le'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'], ゎ: ['xwa', 'lwa'],
  っ: ['xtu', 'ltu', 'xtsu', 'ltsu'],
  ー: ['-'], '、': [','], '。': ['.'], '！': ['!'], '？': ['?'], '・': ['/'],
};

const YOUON_ROWS: Record<string, string[]> = {
  き: ['ky'], ぎ: ['gy'], に: ['ny'], ひ: ['hy'], び: ['by'], ぴ: ['py'],
  み: ['my'], り: ['ry'], ぢ: ['dy'],
};

const DOUBLE: Record<string, string[]> = {
  しゃ: ['sya', 'sha'], しゅ: ['syu', 'shu'], しょ: ['syo', 'sho'], しぇ: ['sye', 'she'],
  ちゃ: ['tya', 'cha', 'cya'], ちゅ: ['tyu', 'chu', 'cyu'], ちょ: ['tyo', 'cho', 'cyo'], ちぇ: ['tye', 'che', 'cye'],
  じゃ: ['ja', 'zya', 'jya'], じゅ: ['ju', 'zyu', 'jyu'], じょ: ['jo', 'zyo', 'jyo'], じぇ: ['je', 'zye', 'jye'],
  ふぁ: ['fa'], ふぃ: ['fi'], ふぇ: ['fe'], ふぉ: ['fo'],
  てぃ: ['thi'], でぃ: ['dhi'], うぃ: ['wi'], うぇ: ['we'],
  ゔぁ: ['va'], ゔぃ: ['vi'], ゔぇ: ['ve'], ゔぉ: ['vo'],
};

for (const [kana, heads] of Object.entries(YOUON_ROWS)) {
  const vowels: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
  for (const [small, v] of Object.entries(vowels)) {
    DOUBLE[kana + small] = heads.map((h) => h + v);
  }
}

export function singleOptions(kana: string): string[] | undefined {
  return SINGLE[kana];
}

export function doubleOptions(pair: string): string[] | undefined {
  return DOUBLE[pair];
}

export function isSupportedReading(reading: string): boolean {
  for (const ch of reading) {
    if (ch === 'ん') continue;
    if (!SINGLE[ch]) return false;
  }
  return true;
}
