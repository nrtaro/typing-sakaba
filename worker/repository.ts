import type { D1Database } from '@cloudflare/workers-types';
import { decorationOrNone, readDecoration, type Decoration, type DailyBoard, type RankedScore, type RankReceipt, type ScoreSubmission } from '../src/core/ranking';
import type { DifficultyId } from '../src/core/shopConfig';

export class RateLimitError extends Error {
  constructor() { super('送信が多いため、10分ほど待ってからもう一度お試しください'); }
}

function myRank(db: D1Database, date: string, difficulty: DifficultyId, player: string | null) {
  return db.prepare(`SELECT score, 1 + (
    SELECT COUNT(*) FROM scores AS better
    WHERE better.date = mine.date AND better.difficulty = mine.difficulty AND better.score > mine.score
  ) AS rank FROM scores AS mine WHERE date = ? AND difficulty = ? AND player = ?`)
    .bind(date, difficulty, player);
}
function totalPlayers(db: D1Database, date: string, difficulty: DifficultyId) {
  return db.prepare('SELECT COUNT(*) AS total FROM scores WHERE date = ? AND difficulty = ?').bind(date, difficulty);
}

/** 上位の行：飾りの列をまとめ、すべて空なら付けない */
function rankedRow(r: Record<string, unknown>): RankedScore {
  const out: RankedScore = { rank: Number(r.rank), name: String(r.name), score: Number(r.score) };
  const d = decorationOrNone(readDecoration({ titleFront: r.title_front, titleLink: r.title_link, titleBack: r.title_back, plate: r.plate }));
  if (d) out.decoration = d;
  return out;
}

/** 同点は同順位（1位・1位・3位）。同点の並び順は記録が先の人から。 */
export async function readBoard(db: D1Database, date: string, difficulty: DifficultyId, player: string | null): Promise<DailyBoard> {
  const [top, me, total] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT name, score, RANK() OVER (ORDER BY score DESC) AS rank, title_front, title_link, title_back, plate
      FROM scores WHERE date = ? AND difficulty = ? ORDER BY score DESC, created_at, player LIMIT 5`).bind(date, difficulty),
    myRank(db, date, difficulty, player), totalPlayers(db, date, difficulty),
  ]);
  return { top: top.results.map(rankedRow),
    me: (me.results[0] as { rank: number; score: number } | undefined) ?? null,
    total: Number(total.results[0].total) };
}

/** 3つの難易度の順位表を、まとめて1回で読む（タイトル画面とランキングの画面で使う） */
export async function readBoards(db: D1Database, date: string, player: string | null): Promise<Record<DifficultyId, DailyBoard>> {
  const ids: DifficultyId[] = ['easy', 'normal', 'hard'];
  const results = await db.batch<Record<string, unknown>>(ids.flatMap((difficulty) => [
    db.prepare(`SELECT name, score, RANK() OVER (ORDER BY score DESC) AS rank, title_front, title_link, title_back, plate
      FROM scores WHERE date = ? AND difficulty = ? ORDER BY score DESC, created_at, player LIMIT 5`).bind(date, difficulty),
    myRank(db, date, difficulty, player), totalPlayers(db, date, difficulty),
  ]));
  return Object.fromEntries(ids.map((id, i) => {
    const [top, me, total] = results.slice(i * 3, i * 3 + 3);
    return [id, {
      top: top.results.map(rankedRow),
      me: (me.results[0] as { rank: number; score: number } | undefined) ?? null,
      total: Number(total.results[0].total),
    }];
  })) as Record<DifficultyId, DailyBoard>;
}

function decorationArgs(s: ScoreSubmission) {
  const d = readDecoration(s.decoration);
  return [d.titleFront, d.titleLink, d.titleBack, d.plate];
}

/** 回数制限・履歴・ベスト更新・順位は、ひとつのD1トランザクションで確定する。 */
export async function submitScore(db: D1Database, s: ScoreSubmission, ipHash: string, now = Math.floor(Date.now() / 1000)): Promise<RankReceipt> {
  const requestId = crypto.randomUUID();
  const cutoff = now - 600;
  const results = await db.batch<Record<string, unknown>>([
    db.prepare('DELETE FROM score_requests WHERE created_at <= ?').bind(cutoff),
    db.prepare(`INSERT INTO score_requests (request_id, player, ip_hash, created_at)
      SELECT ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM score_requests WHERE player = ? AND created_at > ?) < 10
        AND (SELECT COUNT(*) FROM score_requests WHERE ip_hash = ? AND created_at > ?) < 10`)
      .bind(requestId, s.player, ipHash, now, s.player, cutoff, ipHash, cutoff),
    // 遊んだ記録も自己ベストと一緒に残す（あとから手元でやり直して確かめるため）
    db.prepare(`INSERT INTO scores
      (date, difficulty, name, score, served, max_combo, angry, accuracy, kps, player, ip_hash, created_at, seed, record, prep,
        title_front, title_link, title_back, plate)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM score_requests WHERE request_id = ?)
      ON CONFLICT (date, difficulty, player) DO UPDATE SET
        name = excluded.name, score = excluded.score, served = excluded.served,
        max_combo = excluded.max_combo, angry = excluded.angry, accuracy = excluded.accuracy,
        kps = excluded.kps, ip_hash = excluded.ip_hash, created_at = excluded.created_at,
        seed = excluded.seed, record = excluded.record, prep = excluded.prep,
        title_front = excluded.title_front, title_link = excluded.title_link, title_back = excluded.title_back, plate = excluded.plate
      WHERE excluded.score > scores.score`)
      .bind(s.date, s.difficulty, s.name, s.score, s.served, s.maxCombo, s.angry, s.accuracy, s.kps, s.player, ipHash, now,
        s.seed, s.record, s.prep ? JSON.stringify(s.prep) : null,
        ...decorationArgs(s), requestId),
    // 段階C：自己ベストを超えない送信でも、飾りだけは送った時点のものにする
    db.prepare(`UPDATE scores SET title_front = ?, title_link = ?, title_back = ?, plate = ?
      WHERE date = ? AND difficulty = ? AND player = ? AND EXISTS (SELECT 1 FROM score_requests WHERE request_id = ?)`)
      .bind(...decorationArgs(s), s.date, s.difficulty, s.player, requestId),
    myRank(db, s.date, s.difficulty, s.player), totalPlayers(db, s.date, s.difficulty),
  ]);
  if (results[1].meta.changes !== 1) throw new RateLimitError();
  return { rank: Number(results[4].results[0].rank), total: Number(results[5].results[0].total) };
}

/**
 * 段階C：その日に載っている自分の記録（すべての難易度）の飾りと、送られたときは名前を書き換える。点数・順位は変えない。
 * 回数制限は記録の送信と同じ枠で数える。書き換えた件数を返す（まだ送っていなければ 0）。
 */
export async function updateDecoration(db: D1Database, date: string, player: string, decoration: Decoration, ipHash: string, now = Math.floor(Date.now() / 1000), name: string | null = null): Promise<{ updated: number }> {
  const requestId = crypto.randomUUID();
  const cutoff = now - 600;
  const d = readDecoration(decoration);
  const results = await db.batch<Record<string, unknown>>([
    db.prepare('DELETE FROM score_requests WHERE created_at <= ?').bind(cutoff),
    db.prepare(`INSERT INTO score_requests (request_id, player, ip_hash, created_at)
      SELECT ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM score_requests WHERE player = ? AND created_at > ?) < 10
        AND (SELECT COUNT(*) FROM score_requests WHERE ip_hash = ? AND created_at > ?) < 10`)
      .bind(requestId, player, ipHash, now, player, cutoff, ipHash, cutoff),
    // 名前が送られたときは名前も替える（null なら今の名前のまま）
    db.prepare(`UPDATE scores SET title_front = ?, title_link = ?, title_back = ?, plate = ?, name = COALESCE(?, name)
      WHERE date = ? AND player = ? AND EXISTS (SELECT 1 FROM score_requests WHERE request_id = ?)`)
      .bind(d.titleFront, d.titleLink, d.titleBack, d.plate, name, date, player, requestId),
  ]);
  if (results[1].meta.changes !== 1) throw new RateLimitError();
  return { updated: Number(results[2].meta.changes) };
}
