import json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/amber-v3'
TARGET = ROOT / 'assets/amber-v4'
TARGET.mkdir(exist_ok=True)
manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
rows = []
converted = {}
for asset in manifest['assets']:
    src, dst = SOURCE / asset['file'], TARGET / asset['file']
    if asset['file'] in converted:
        rows.append({**converted[asset['file']], 'id': asset['id']})
        continue
    original = Image.open(src).convert('RGBA')
    background = asset['id'].startswith('bg-')
    quality = 88 if background else 94
    original.save(dst, format='WEBP', quality=quality, method=6, alpha_quality=100, exact=True)
    restored = Image.open(dst).convert('RGBA')
    assert original.size == restored.size
    assert ImageChops.difference(original.getchannel('A'), restored.getchannel('A')).getbbox() is None, asset['id']
    errors = []
    for color in ['black', 'white']:
        bg = Image.new('RGBA', original.size, color)
        a = np.array(Image.alpha_composite(bg, original).convert('RGB'), dtype=np.float32)
        b = np.array(Image.alpha_composite(bg, restored).convert('RGB'), dtype=np.float32)
        mse = float(np.mean((a - b) ** 2))
        errors.append(round(10 * math.log10(255 ** 2 / mse), 2) if mse else 100)
    assert min(errors) >= (30 if background else 37), asset['id']
    rows.append({'id': asset['id'], 'file': asset['file'], 'beforeBytes': src.stat().st_size, 'afterBytes': dst.stat().st_size,
                 'quality': quality, 'compositePsnrDb': errors, 'alphaExact': True})
    converted[asset['file']] = rows[-1]
    print(asset['id'], src.stat().st_size, '->', dst.stat().st_size, errors, flush=True)
manifest['version'] = 4
manifest['integrationStatus'] = 'optimized delivery; original geometry and alpha preserved'
(TARGET / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(TARGET / 'optimization.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('TOTAL', sum(r['beforeBytes'] for r in converted.values()), '->', sum(r['afterBytes'] for r in converted.values()), flush=True)
