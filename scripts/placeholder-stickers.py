"""シールと台紙の仮の絵（public/stickers/）を作る。本物の絵が届いたら、同じファイル名で置き換える。

  python scripts/placeholder-stickers.py          # まだない絵だけ作る
  python scripts/placeholder-stickers.py --force  # 全部作り直す

シールは ☆ の色の丸、台紙は 3×3 の枠（完成版は金の縁）。画像ライブラリを使わずに PNG を書く。
"""
import re
import struct
import sys
import zlib
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / 'public' / 'stickers'
out.mkdir(parents=True, exist_ok=True)
force = '--force' in sys.argv
src = (root / 'src' / 'core' / 'collectionItems.ts').read_text(encoding='utf-8')
stickers = re.findall(r"sticker\('(\w+)', (\d), '([\w-]+)', (\d),", src)
series = re.findall(r"\{ id: '(\w+)', name: '[^']+' \}", src.split('SERIES_LIST')[1].split('];')[0])
STAR = {1: (200, 190, 170), 2: (120, 200, 120), 3: (110, 170, 240), 4: (240, 200, 80), 5: (230, 120, 220)}


def png(path, w, h, pixel):
    rows = b''.join(b'\x00' + b''.join(bytes(pixel(x, y)) for x in range(w)) for y in range(h))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    path.write_bytes(data)


made = 0
for _series, slot, sid, star in stickers:
    path = out / f'st-{sid}.png'
    if path.exists() and not force:
        continue
    col = STAR[int(star)]
    def px(x, y, col=col, slot=int(slot)):
        d = ((x - 31.5) ** 2 + (y - 31.5) ** 2) ** 0.5
        if d > 30:
            return (0, 0, 0, 0)
        if d > 26:
            return (255, 255, 255, 255)
        # 枠の番号ぶんの小さな点（どのシールか見分ける目印）
        if 22 <= y <= 26 and 14 <= x <= 50 and (x - 14) // 4 < slot + 1 and (x - 14) % 4 < 2:
            return (60, 40, 30, 255)
        return (*col, 255)
    png(path, 64, 64, px)
    made += 1

for sid in series:
    for done in (False, True):
        path = out / f'sheet-{sid}{"-done" if done else ""}.png'
        if path.exists() and not force:
            continue
        def px(x, y, done=done):
            if x < 4 or y < 4 or x > 187 or y > 187:
                return (230, 180, 60, 255) if done else (138, 98, 50, 255)
            if (x - 4) % 61 < 2 or (y - 4) % 61 < 2:
                return (180, 150, 110, 255)
            return (250, 236, 200, 255) if done else (238, 224, 196, 255)
        png(path, 192, 192, px)
        made += 1
print(f'public/stickers：{made}枚を作りました（シール{len(stickers)}・台紙{len(series) * 2}）')
