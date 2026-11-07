"""docs/stage5-achievements-and-family-dialogue.md（台詞の正本）から、src/core/achievementText.ts を作る。

  python scripts/achievement-text.py

見出し「### 01｜題名」、**解放条件** の行、*場面説明*、> 話者「台詞」 を読み取る。
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / 'docs' / 'stage5-achievements-and-family-dialogue.md').read_text(encoding='utf-8')
body = src[src.index('## 実績と会話 全26本'):]
entries = []
for block in re.split(r'\n(?=### \d{2}｜)', body)[1:]:
    head = re.match(r'### (\d{2})｜(.+)', block)
    no, title = int(head.group(1)), head.group(2).strip()
    cond = re.search(r'\*\*解放条件\*\*\s*(.+)', block).group(1).strip()
    scene = re.search(r'^\*([^*].*?)\*\s*$', block, re.M)
    lines = []
    for m in re.finditer(r'^> (おやじ|女将|看板娘)「(.*)」\s*$', block, re.M):
        lines.append({'who': m.group(1), 'text': m.group(2)})
    if not lines:
        sys.exit(f'{no}: 台詞を読み取れません')
    entries.append({'no': no, 'title': title, 'condition': cond, 'scene': scene.group(1).strip() if scene else None, 'lines': lines})

if [e['no'] for e in entries] != list(range(1, 27)):
    sys.exit('01〜26 がそろっていません')

out = ['// 自動生成（python scripts/achievement-text.py）。正本は docs/stage5-achievements-and-family-dialogue.md。手で直さない。',
       "export type Speaker = 'おやじ' | '女将' | '看板娘';",
       'export interface AchievementText { no: number; title: string; condition: string; scene: string | null; lines: { who: Speaker; text: string }[] }',
       'export const ACHIEVEMENT_TEXT: AchievementText[] = ' + json.dumps(entries, ensure_ascii=False, indent=2) + ';', '']
(root / 'src' / 'core' / 'achievementText.ts').write_text('\n'.join(out), encoding='utf-8', newline='\n')
print(f'src/core/achievementText.ts：{len(entries)}本、台詞{sum(len(e["lines"]) for e in entries)}行')
