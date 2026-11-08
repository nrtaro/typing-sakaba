import type { D1Database } from '@cloudflare/workers-types';
import { PLAYER_ID } from '../src/core/ranking';
import { readBoard, readBoards, submitScore, updateDecoration, RateLimitError } from './repository';
import { isBoardDate, isDifficulty, validateDecorationUpdate, validateSubmission } from './validation';
import { verifyPlay } from './verify';
import { checkTurnstile } from './turnstile';

interface Env {
  DB?: D1Database;
  RANKING_IP_SALT?: string;
  /** Turnstile の公開キー（ゲームに渡す）と秘密キー。両方そろうまでは確認しない */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** 'off' のときだけ、遊んだ記録のやり直しを省く（処理時間の上限が厳しい場合の逃げ道） */
  RANKING_REPLAY?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

function json(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...extra,
  } });
}

async function ipHash(ip: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, enc.encode(ip));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}

class BodyTooLarge extends Error {}
/** 本文の上限：入力の記録（上限3万文字）が入る大きさ */
const BODY_MAX = 65536;
async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > BODY_MAX) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BODY_MAX) { await reader.cancel(); throw new BodyTooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS?.fetch(request) ?? new Response('Not found', { status: 404 });
    const isTop = url.pathname === '/api/daily/top';
    const isScore = url.pathname === '/api/daily/score';
    // ゲームに渡す設定（Turnstile の公開キー）。秘密キーは渡さない
    if (url.pathname === '/api/daily/config') {
      if (request.method !== 'GET') return json({ error: '使えない送信方法です' }, 405, { Allow: 'GET' });
      return json({ turnstile: env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY : null });
    }
    // 3つの難易度の順位表（タイトル画面とランキングの画面）
    if (url.pathname === '/api/daily/boards') {
      if (request.method !== 'GET') return json({ error: '使えない送信方法です' }, 405, { Allow: 'GET' });
      if (!env.DB) return json({ error: 'ランキングは準備中です。端末の記録は残っています' }, 503);
      const date = url.searchParams.get('date');
      const player = url.searchParams.get('player');
      if (!isBoardDate(date) || (player !== null && !PLAYER_ID.test(player))) return json({ error: '日付・端末の情報を確かめてください' }, 400);
      try {
        return json(await readBoards(env.DB, date, player?.toLowerCase() ?? null));
      } catch {
        console.error('Daily ranking storage unavailable');
        return json({ error: '今はランキングにつながりません。しばらくしてからお試しください' }, 503);
      }
    }
    // 段階C：今日のランキングに載っている自分の記録の飾りだけを書き換える
    if (url.pathname === '/api/daily/decoration') {
      if (request.method !== 'POST') return json({ error: '使えない送信方法です' }, 405, { Allow: 'POST' });
      if (!env.DB || !env.RANKING_IP_SALT) return json({ error: 'ランキングは準備中です' }, 503);
      const origin = request.headers.get('Origin');
      if ((origin !== null && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'ゲームの画面から送信してください' }, 403);
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: '飾りを読み取れませんでした' }, 415);
      let input: unknown;
      try { input = await readJson(request); }
      catch (err) { return json({ error: err instanceof BodyTooLarge ? '送信する内容が大きすぎます' : '飾りを読み取れませんでした' }, err instanceof BodyTooLarge ? 413 : 400); }
      const checked = validateDecorationUpdate(input);
      if (!checked.ok) return json({ error: checked.error }, 400);
      try {
        const hash = await ipHash(request.headers.get('CF-Connecting-IP') ?? 'local', env.RANKING_IP_SALT);
        return json(await updateDecoration(env.DB, checked.value.date, checked.value.player, checked.value.decoration, hash));
      } catch (err) {
        if (err instanceof RateLimitError) return json({ error: err.message }, 429, { 'Retry-After': '600' });
        console.error('Daily ranking storage unavailable');
        return json({ error: '今はランキングにつながりません。しばらくしてからお試しください' }, 503);
      }
    }
    if (!isTop && !isScore) return json({ error: '見つかりませんでした' }, 404);
    const method = isTop ? 'GET' : 'POST';
    if (request.method !== method) return json({ error: '使えない送信方法です' }, 405, { Allow: method });
    if (!env.DB) return json({ error: 'ランキングは準備中です。端末の記録は残っています' }, 503);
    try {
      if (isTop) {
        const date = url.searchParams.get('date');
        const difficulty = url.searchParams.get('difficulty');
        const player = url.searchParams.get('player');
        if (!isBoardDate(date) || !isDifficulty(difficulty) || (player !== null && !PLAYER_ID.test(player))) return json({ error: '日付・難易度・端末の情報を確かめてください' }, 400);
        return json(await readBoard(env.DB, date, difficulty, player?.toLowerCase() ?? null));
      }
      const origin = request.headers.get('Origin');
      if ((origin !== null && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'ゲームの画面から送信してください' }, 403);
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: '記録を読み取れませんでした' }, 415);
      if (!env.RANKING_IP_SALT) return json({ error: 'ランキングは準備中です。端末の記録は残っています' }, 503);
      let input: unknown;
      try { input = await readJson(request); }
      catch (err) { return json({ error: err instanceof BodyTooLarge ? '送信する内容が大きすぎます' : '記録を読み取れませんでした' }, err instanceof BodyTooLarge ? 413 : 400); }
      const checked = validateSubmission(input);
      if (!checked.ok) return json({ error: checked.error }, 400);
      const ip = request.headers.get('CF-Connecting-IP');
      // 人が送っているかを先に確かめてから、時間のかかるやり直しをする
      if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET) {
        const token = (input as { turnstile?: unknown }).turnstile;
        if (!(await checkTurnstile(env.TURNSTILE_SECRET, token, ip))) return json({ error: '確認できませんでした。もう一度送ってください' }, 403);
      }
      let value = checked.value;
      if (env.RANKING_REPLAY !== 'off') {
        const verified = verifyPlay(value);
        if (!verified.ok) return json({ error: verified.error }, 400);
        value = verified.value;
      }
      const hash = await ipHash(ip ?? 'local', env.RANKING_IP_SALT);
      return json(await submitScore(env.DB, value, hash));
    } catch (err) {
      if (err instanceof RateLimitError) return json({ error: err.message }, 429, { 'Retry-After': '600' });
      // 入力内容・名前・IPをログへ出さない。
      console.error('Daily ranking storage unavailable');
      return json({ error: '今はランキングにつながりません。しばらくしてからお試しください' }, 503);
    }
  },
};
