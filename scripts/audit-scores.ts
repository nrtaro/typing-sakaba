// 上位の記録を手元でやり直して確かめる道具（読むだけで、データベースは書き換えない）。
//
//   npm run audit                          … 今日の3難易度の上位20人（本番のデータベース）
//   npm run audit -- --date 2026-11-08     … 日付を指定
//   npm run audit -- --difficulty hard --top 50
//   npm run audit -- --local               … 手元（wrangler dev）のデータベース
//
// 一致しない記録があれば、消すためのコマンドを表示する（実行はしない）。
import { execSync } from 'node:child_process';
import { jstDate } from '../src/core/daily';
import { auditRow, type ScoreRow } from '../worker/audit';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const date = arg('date') ?? jstDate();
const difficulties = arg('difficulty') ? [arg('difficulty')!] : ['easy', 'normal', 'hard'];
const top = Number(arg('top') ?? 20);
const where = args.includes('--local') ? '--local' : '--remote';

// 書き換えの心配のない値だけを SQL に入れる
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !difficulties.every((d) => /^(easy|normal|hard)$/.test(d)) || !Number.isInteger(top) || top < 1 || top > 500) {
  console.error('日付は YYYY-MM-DD、難易度は easy / normal / hard、--top は 1〜500 で指定してください');
  process.exit(1);
}

const LABEL: Record<string, string> = { easy: 'やさしい', normal: 'ふつう', hard: 'むずかしい' };
const STATUS = { ok: '一致', mismatch: '一致しない', noRecord: '記録なし（段階6より前の送信）' };
const bad: number[] = [];

for (const difficulty of difficulties) {
  const sql = `SELECT id, date, difficulty, name, score, served, max_combo, angry, accuracy, kps, seed, record, prep
    FROM scores WHERE date = '${date}' AND difficulty = '${difficulty}' ORDER BY score DESC, created_at, player LIMIT ${top}`;
  const out = execSync(`npx wrangler d1 execute typing-sakaba ${where} --json --command "${sql.replace(/\s+/g, ' ')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const rows = (JSON.parse(out) as { results: ScoreRow[] }[])[0]?.results ?? [];
  console.log(`\n${date}・${LABEL[difficulty]}：${rows.length}件`);
  rows.forEach((row, i) => {
    const r = auditRow(row);
    if (r.status === 'mismatch') bad.push(r.id);
    console.log(`  ${String(i + 1).padStart(3)}位  ${r.score.toLocaleString('ja-JP').padStart(8)}円  ${STATUS[r.status]}${r.reason ? `（${r.reason}）` : ''}  ${r.name}  [id ${r.id}]`);
  });
}

if (bad.length) {
  console.log(`\n一致しない記録が ${bad.length} 件あります。消す場合は、内容を確かめてから次を実行してください：`);
  console.log(`  npx wrangler d1 execute typing-sakaba ${where} --command "DELETE FROM scores WHERE id IN (${bad.join(', ')})"`);
} else {
  console.log('\n一致しない記録はありません。');
}
