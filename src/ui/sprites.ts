// ドット絵の部品。すべてコードで描いた仮素材（外部の画像は使っていない）
import { C, mix, type Color } from './palette';
import type { FamilyId, IngredientId } from '../core/shopConfig';

type Rect = (x: number, y: number, w: number, h: number, c: Color) => void;

/** 部品を描いたあと、隣の色を暗くした「色付きの輪郭線」を自動で付ける */
export function sprite(w: number, h: number, draw: (r: Rect) => void): HTMLCanvasElement {
  const W2 = w + 2;
  const H2 = h + 2;
  const c = document.createElement('canvas');
  c.width = W2;
  c.height = H2;
  const x = c.getContext('2d')!;
  draw((a, b, cw, ch, col) => {
    x.fillStyle = col;
    x.fillRect(a + 1, b + 1, cw, ch);
  });
  const d = x.getImageData(0, 0, W2, H2);
  const a = d.data;
  const o = new Uint8ClampedArray(a);
  for (let j = 0; j < H2; j++) {
    for (let i = 0; i < W2; i++) {
      const idx = (j * W2 + i) * 4;
      if (a[idx + 3]) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const X = i + dx;
        const Y = j + dy;
        if (X < 0 || Y < 0 || X >= W2 || Y >= H2) continue;
        const k = (Y * W2 + X) * 4;
        if (!a[k + 3]) continue;
        o[idx] = Math.round(a[k] * 0.32 + 18);
        o[idx + 1] = Math.round(a[k + 1] * 0.22 + 10);
        o[idx + 2] = Math.round(a[k + 2] * 0.3 + 20);
        o[idx + 3] = 255;
        break;
      }
    }
  }
  x.putImageData(new ImageData(o, W2, H2), 0, 0);
  return c;
}

/** 文字で描いた図案からスプライトを作る（輪郭線つき） */
export function mapSprite(rows: string[], pal: Record<string, Color>) {
  return sprite(rows[0].length, rows.length, (r) =>
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) r(x, y, 1, 1, pal[ch]); })));
}

/** 文字で描いた図案（輪郭線も図案に含む小さなアイコン用） */
export function pix(rows: string[], pal: Record<string, Color>) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const x = c.getContext('2d')!;
  rows.forEach((row, y) => [...row].forEach((ch, xx) => {
    if (pal[ch]) {
      x.fillStyle = pal[ch];
      x.fillRect(xx, y, 1, 1);
    }
  }));
  return c;
}

// ---------- 家族 ----------

const SKIN = { S: '#f7cba4', s: '#e3a47e', E: '#2a1b26', W: '#fff7ea', B: '#f29a95', m: '#a8363f' };

// ごつい男前のマスター（赤いバンダナ・ひげ・太い腕）
const MASTER_ROWS = [
  '....RRRRRRRR....', '...RRRRRRRRRR...', '...rrrrrrrrrrRR.', '...HSSSSSSSSHrR.', '...HSHHSSHHSH...', '...SSWESSEWSs...',
  '...SSSSSSSSSs...', '...HSSSssSSSH...', '...HHHHHHHHHH...', '...HHHWWWWHHH...', '....HHHHHHHH....', '..CCCcSSSSCCCC..',
  '.SCCCCAAAACCCCS.', 'SSCCCAAAAAACCCSs', 'SSCCAAaAAAAACCSs', 'SSCCAAAAAAAACCSs', 'SS.CAAAAAAAAc.Ss', 'Ss.BBBBBBBBBB.ss',
  '...AAAAAAAAAA...', '...AAaAAAAaAA...'];
const MASTER_LEGS = [['....PPPP.PPPP...', '....PPPP.PPPP...', '....KKKK.KKKK...', '...KKKKK.KKKKK..'],
  ['....PPPP..PPP...', '...PPPP...PPP...', '...KKKK...KKK...', '..KKKKK..KKKK...']];
const MASTER_PAL = { ...SKIN, R: '#d9534f', r: '#a8363f', H: '#4a2a22', h: '#6a3e2c', C: '#f5e3c4', c: '#dcc39c',
  A: '#a5643c', a: '#80492f', B: '#5e3626', P: '#4a3a4a', K: '#3d2420' };

// 頼れる明るいおかみ（ポニーテール・緑の服・白いエプロン）
const WIFE_ROWS = [
  '...OOOOOO.....', '..OLLOOOOOO...', '.OOLOOOOOOOOT.', '.OOSSSSSSOOOOO', '.OSSSSSSSSOoOo', '.OSWESSEWSoOo.',
  '.OSSSSSSSSoOo.', '..SBSSSSBS.Oo.', '..SSSmmSSS..o.', '...SSSSSS.....', '....ssss......', '..GGAAAAGG....',
  '.SGGAAAAGGS...', '.SGGAAAAGGS...', '.SGGAaAAGGs...', '..GGAAAAGG....', '..GGAAAAGGG...', '.GGGAaAAGGG...',
  '.GGGAAAAGGGg..', '.gGGAAAAGGGg..', '..gggggggg....'];
const WIFE_LEGS = [['...SS..SS.....', '...KK..KK.....', '..KKK..KKK....'], ['..SS....SS....', '..KK....KK....', '.KKK....KKK...']];
const WIFE_PAL = { ...SKIN, O: '#e07a3c', o: '#b0552a', L: '#f3a57b', G: '#6cbf6a', g: '#3f8a52', A: '#fff7ea', a: '#dcc39c',
  K: '#7b4a33', T: '#ff9fbd' };

// 華奢で明るい看板娘（ツインテール・赤いリボン・ピンクの服）
const DAUGHTER_ROWS = [
  '....RrrR....', '..YYRRRRYY..', '.YLLYYYYYYy.', 'YYLSSSSSSYyy', 'YYSSSSSSSSyy', 'YySWESSEWSyy',
  'YySSSSSSSSyy', 'YyBSSmmSSBy.', '.y.SSSSSS.y.', '.y..ssss..y.', '...PPAAPP...', '..SPPAAPPS..',
  '..SPPAAPPs..', '...PPAAPP...', '..PPPAAPPP..', '.PPPPAAPPPP.', '.pppppppppp.'];
const DAUGHTER_LEGS = [['...SS..SS...', '...KK..KK...', '..KKK..KKK..'], ['..SS....SS..', '..KK....KK..', '.KKK....KKK.']];
const DAUGHTER_PAL = { ...SKIN, Y: '#f5cf62', y: '#d6a03a', L: '#fff0a8', R: '#d9534f', r: '#ef8577', P: '#ff9fbd', p: '#e2668f',
  A: '#fff7ea', K: '#a8363f' };

/** 家族の絵（[0]=立ち、[1]=歩き） */
export const FAM: Record<FamilyId, HTMLCanvasElement[]> = {
  master: MASTER_LEGS.map((l) => mapSprite([...MASTER_ROWS, ...l], MASTER_PAL)),
  wife: WIFE_LEGS.map((l) => mapSprite([...WIFE_ROWS, ...l], WIFE_PAL)),
  daughter: DAUGHTER_LEGS.map((l) => mapSprite([...DAUGHTER_ROWS, ...l], DAUGHTER_PAL)),
};

/** 顔だけの小さな肖像（調達パネル用） */
function portrait(who: FamilyId) {
  const c = document.createElement('canvas');
  c.width = 14;
  c.height = 13;
  c.getContext('2d')!.drawImage(FAM[who][0], who === 'master' ? 2 : 0, 0, 14, 13, 0, 0, 14, 13);
  return c;
}
export const PORTRAIT: Record<FamilyId, HTMLCanvasElement> = { master: portrait('master'), wife: portrait('wife'), daughter: portrait('daughter') };

// ---------- 客 ----------

interface Look { body: Color; body2: Color; head: 'helm' | 'hood' | 'robot' | 'witch' | 'bandit' | 'hair'; hair?: Color }
export const LOOKS: Look[] = [
  { body: C.blue, body2: C.blue2, head: 'helm' },
  { body: C.green2, body2: '#2c6340', head: 'hood' },
  { body: C.gray2, body2: '#4c485a', head: 'robot' },
  { body: C.purple, body2: C.purple2, head: 'witch' },
  { body: C.red2, body2: '#7a2630', head: 'hair', hair: C.hairB },
  { body: C.teal2, body2: '#1f6466', head: 'hair', hair: C.hairY },
  { body: C.gold2, body2: '#b06a20', head: 'bandit', hair: C.hairO },
];

/** 座った客の上半身。mood で表情が変わる（1=にこにこ、0=怒り） */
function makeGuest(look: Look, mood: number) {
  return sprite(14, 18, (r) => {
    const y0 = 4;
    const robot = look.head === 'robot';
    r(1, y0 + 8, 12, 6, look.body);
    r(1, y0 + 8, 12, 1, mix(look.body, '#ffffff', 0.25));
    r(10, y0 + 9, 3, 5, look.body2);
    r(5, y0 + 8, 4, 2, robot ? C.gray : C.skin2);
    r(3, y0, 8, 8, robot ? C.gray : C.skin);
    r(9, y0 + 1, 2, 7, robot ? C.gray2 : C.skin2);
    const face = () => {
      if (mood > 0.55) {
        r(4, y0 + 3, 1, 2, C.w); r(5, y0 + 3, 1, 2, C.ink); r(8, y0 + 3, 1, 2, C.ink); r(9, y0 + 3, 1, 2, C.w);
        r(6, y0 + 6, 2, 1, C.red2); r(4, y0 + 5, 1, 1, C.blush); r(9, y0 + 5, 1, 1, C.blush);
      } else if (mood > 0.28) {
        r(5, y0 + 4, 1, 1, C.ink); r(8, y0 + 4, 1, 1, C.ink); r(6, y0 + 6, 2, 1, C.skin3);
      } else {
        r(4, y0 + 3, 2, 1, C.ink); r(8, y0 + 3, 2, 1, C.ink); r(5, y0 + 4, 1, 1, C.ink); r(8, y0 + 4, 1, 1, C.ink); r(5, y0 + 6, 4, 1, C.red2);
      }
    };
    switch (look.head) {
      case 'helm': r(2, y0 - 1, 10, 5, C.gray); r(2, y0 - 1, 10, 1, C.gray3); r(10, y0, 2, 4, C.gray2); r(6, y0 - 3, 2, 2, C.red); face(); break;
      case 'hood': r(2, y0 - 1, 10, 4, look.body); r(2, y0 - 1, 2, 9, look.body); r(10, y0 - 1, 2, 9, look.body2); r(4, y0 - 1, 6, 1, mix(look.body, '#ffffff', 0.3)); face(); break;
      case 'robot': {
        const eye = mood > 0.28 ? C.teal : C.red;
        r(3, y0 + 2, 8, 3, '#2a2836'); r(4, y0 + 3, 2, 1, eye); r(8, y0 + 3, 2, 1, eye); r(6, y0 - 2, 1, 2, C.gray2); r(6, y0 - 3, 1, 1, C.teal);
        break;
      }
      case 'witch': r(1, y0, 12, 2, look.body); r(3, y0 - 3, 8, 3, look.body); r(5, y0 - 5, 4, 2, look.body2); r(3, y0 + 1, 8, 1, C.gold); face(); break;
      case 'bandit': r(3, y0, 8, 2, look.hair!); r(2, y0 + 1, 10, 1, C.red); r(12, y0 + 1, 2, 2, C.red2); face(); break;
      default: r(3, y0 - 1, 8, 3, look.hair!); r(2, y0, 1, 4, look.hair!); r(11, y0, 1, 3, look.hair!); face();
    }
  });
}

/** 歩く客（全身） */
function makeWalker(look: Look, f: number) {
  return sprite(12, 20, (r) => {
    const step = f % 2;
    r(3, 16, 2, 3 - step, '#3a3040'); r(7, 16, 2, 2 + step, '#3a3040');
    r(1, 9, 10, 8, look.body); r(9, 10, 2, 7, look.body2); r(1, 9, 10, 1, mix(look.body, '#ffffff', 0.25));
    r(2, 1, 8, 8, look.head === 'robot' ? C.gray : C.skin);
    if (look.head === 'helm') { r(1, 0, 10, 4, C.gray); r(5, -1, 2, 2, C.red); }
    else if (look.head === 'hood') { r(1, 0, 10, 3, look.body); r(1, 0, 2, 8, look.body); r(9, 0, 2, 8, look.body2); }
    else if (look.head === 'robot') { r(2, 3, 8, 3, '#2a2836'); r(3, 4, 2, 1, C.teal); r(7, 4, 2, 1, C.teal); }
    else if (look.head === 'witch') { r(0, 1, 12, 2, look.body); r(2, -2, 8, 3, look.body); r(4, -4, 4, 2, look.body2); }
    else r(2, 0, 8, 3, look.hair ?? C.hairB);
    if (look.head !== 'robot') { r(4, 4, 1, 2, C.ink); r(7, 4, 1, 2, C.ink); }
  });
}

const guestCache = new Map<string, HTMLCanvasElement>();
export function guestSprite(look: number, mood: number) {
  const k = `${look}:${mood > 0.55 ? 2 : mood > 0.28 ? 1 : 0}`;
  let c = guestCache.get(k);
  if (!c) {
    c = makeGuest(LOOKS[look % LOOKS.length], mood);
    guestCache.set(k, c);
  }
  return c;
}
export const WALKERS = LOOKS.map((l) => [makeWalker(l, 0), makeWalker(l, 1)]);

// ---------- 素材アイコン（12x12。o は輪郭、大文字は明るい色） ----------

export const ICON: Record<IngredientId | 'poison', HTMLCanvasElement> = {
  fish: pix(['............', '............', '...oooo.....', '.oobbbboo.oo', 'obwkbbbBBodo', 'obbbbBBBBddo', 'obBBBBBddddo', '.oddddddo.do', '..oooooo..oo', '............', '............', '............'],
    { o: '#1d2f5a', b: '#bfe0ff', B: '#6fa8ec', d: '#3d68b8', w: '#ffffff', k: '#1a1420' }),
  meat: pix(['...oooo.....', '.oorRRroo...', 'orrRRrrrro..', 'orrrrrrrro..', 'orrrrrrrdo..', 'orrrrrrddo..', '.orrrrddo...', '..ooddoowo..', '....oo.owwo.', '.......owwwo', '........owo.', '............'],
    { o: '#4a1420', r: '#d9534f', R: '#ff9a86', d: '#9a2c34', w: '#fff4e0' }),
  veg: pix(['...g..g.....', '...gg.gg....', '....gGGg....', '...ooGGoo...', '..oOOOOOOo..', '..oOyOOOOo..', '...oOyOOno..', '...oOOOOo...', '....oOnOo...', '....oOOo....', '.....oo.....', '............'],
    { o: '#6a2c10', g: '#3f8a52', G: '#8fdc7a', O: '#f08a2a', y: '#ffd08a', n: '#b85a18' }),
  mush: pix(['............', '...oooooo...', '.ooRRwwRRoo.', 'oRRwwRRRRRRo', 'oRRRRRRwwRRo', 'orrRRRRRRrro', '.oooooooooo.', '...occccco..', '...occcCco..', '...occcCco..', '...oooooo...', '............'],
    { o: '#4a1420', R: '#e6474a', r: '#a8283a', w: '#ffffff', c: '#fff0d8', C: '#d8c0a0' }),
  ale: pix(['............', '..wwwwwww...', '.wwWwwwwww..', '.owwwwwwwo..', '.oyyyyyyyooo', '.oYyyyyyyo.o', '.oYyyyyyyo.o', '.oYyyyyyyooo', '.oYyyyyyyo..', '.oyyyyyyyo..', '.ooooooooo..', '............'],
    { o: '#6a3a10', w: '#ffffff', W: '#f0e4cc', y: '#f5b52e', Y: '#ffe68a' }),
  spice: pix(['........gg..', '.......g....', '......ooo...', '.....oRRro..', '....oRRrro..', '...oRRrrro..', '..orRrrrdo..', '.orrrrrddo..', 'orrrrddo....', 'odddoo......', 'oo..........', '............'],
    { o: '#4a1018', g: '#3f8a52', R: '#ff7a6a', r: '#e0342e', d: '#9a1c24' }),
  // 毒きのこ：紫のかさにどくろ
  poison: pix(['............', '...oooooo...', '.ooPPPPPPoo.', 'oPPwwPPwwPPo', 'oPPwkwwkwPPo', 'oppPwwwwPppo', '.oooowwoooo.', '...occccco..', '...occcCco..', '...occcCco..', '...oooooo...', '............'],
    { o: '#2a1040', P: '#a35ad8', p: '#6a3a9a', w: '#f0e8ff', k: '#2a1040', c: '#e8dcc8', C: '#b8a890' }),
};

// ---------- ミニゲーム用 ----------

export const RABBIT = [0, 1].map((f) => sprite(14, 12, (r) => {
  const up = f === 0 ? 0 : 1;
  r(2, 4 + up, 9, 6, C.sand3); r(2, 8 + up, 9, 2, C.sand); r(8, 5 + up, 3, 4, C.sand);
  r(0, 2 + up, 5, 5, C.sand3); r(1, 3 + up, 1, 1, C.ink); r(0, 5 + up, 1, 1, C.pink2);
  r(2, 0 + up, 1, 3, C.sand3); r(4, 0 + up, 1, 3, C.sand); r(2, -1 + up, 1, 1, C.teal3); r(4, -1 + up, 1, 1, C.teal3);
  r(11, 5 + up, 2, 2, C.w);
  r(3, 10, 2, 2 - up, C.sand2); r(8, 10, 2, 1 + up, C.sand2);
}));

export const DEER = [0, 1].map((f) => sprite(26, 24, (r) => {
  const a = f === 0;
  for (const [lx, ph] of [[5, 0], [8, 1], [18, 0], [21, 1]]) r(lx, 16, 2, a === (ph === 0) ? 8 : 7, C.wood2);
  r(4, 9, 20, 8, C.wood3); r(4, 15, 20, 2, C.wood2); r(5, 9, 18, 1, C.wood4);
  for (let i = 0; i < 4; i++) r(8 + i * 4, 7, 3, 2, i % 2 ? C.gray : C.gray3);
  r(0, 3, 7, 7, C.wood3); r(1, 4, 1, 1, C.ink); r(0, 7, 2, 1, C.wood1); r(4, 8, 3, 3, C.wood3);
  r(2, 0, 1, 4, C.gray3); r(0, 0, 3, 1, C.gray3); r(5, -1, 1, 5, C.gray3); r(5, -1, 3, 1, C.gray3);
  r(24, 10, 2, 2, C.wood4);
}));

/** 隊商の商人（フードをかぶった行商人） */
export const MERCHANT = sprite(18, 26, (r) => {
  r(2, 9, 14, 15, C.purple2); r(3, 10, 12, 13, C.purple); r(8, 10, 2, 13, C.gold2);
  r(3, 0, 12, 10, C.purple2); r(4, 1, 10, 3, C.purple);
  r(5, 4, 8, 6, C.skin); r(11, 5, 2, 5, C.skin2); r(6, 6, 1, 1, C.ink); r(10, 6, 1, 1, C.ink); r(6, 8, 6, 2, C.cream2);
  r(0, 13, 3, 6, C.skin); r(15, 13, 3, 6, C.skin2); r(4, 24, 4, 2, C.brown); r(10, 24, 4, 2, C.brown);
});

export const CRATE = pix(['oooooooooo', 'owwwwwwwwo', 'owoooooowo', 'owowwwwowo', 'owowwwwowo', 'owoooooowo', 'owwwwwwwwo', 'oooooooooo'],
  { o: '#5e3626', w: '#c98a52' });

export const FAMILY_SPRITE = FAM;
