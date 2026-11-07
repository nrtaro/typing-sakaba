// 送られた記録どおりに営業をやり直し、成績が一致するかを確かめる。
// 一致したら、ゲームから届いた数字ではなく、やり直して出た数字を保存に使う。
import { dailyConditions, prepCap, rulesFor } from '../src/core/daily';
import type { ScoreSubmission } from '../src/core/ranking';
import { replay, validPrep } from '../src/core/session';
import { difficultyOf } from '../src/core/shopConfig';

export type Verified = { ok: true; value: ScoreSubmission } | { ok: false; error: string };

export function verifyPlay(s: ScoreSubmission): Verified {
  const rules = rulesFor(dailyConditions(s.date), s.difficulty, s.date);
  if (!validPrep(s.prep, rules.prepBudget, prepCap(rules))) return { ok: false, error: '仕込みの振り分けを確かめられませんでした' };
  const r = replay(s.seed, difficultyOf(s.difficulty), rules, s.prep, s.record);
  if (!r.ok) return { ok: false, error: '遊んだ記録を確かめられませんでした' };
  const m = r.summary;
  const same = m.score === s.score && m.served === s.served && m.maxCombo === s.maxCombo && m.angry === s.angry
    && Math.abs(m.accuracy - s.accuracy) < 1e-9 && Math.abs(m.kps - s.kps) < 1e-6;
  if (!same) return { ok: false, error: '遊んだ記録と成績が一致しませんでした' };
  return { ok: true, value: { ...s, score: m.score, served: m.served, maxCombo: m.maxCombo, angry: m.angry, accuracy: m.accuracy, kps: m.kps } };
}
