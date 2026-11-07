import type { D1Database } from '@cloudflare/workers-types';
import { PLAYER_ID } from '../src/core/ranking';
import { readBoard, submitScore, RateLimitError } from './repository';
import { isBoardDate, isDifficulty, validateSubmission } from './validation';

interface Env {
  DB?: D1Database;
  RANKING_IP_SALT?: string;
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
async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > 4096) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new BodyTooLarge(); }
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
      const hash = await ipHash(request.headers.get('CF-Connecting-IP') ?? 'local', env.RANKING_IP_SALT);
      return json(await submitScore(env.DB, checked.value, hash));
    } catch (err) {
      if (err instanceof RateLimitError) return json({ error: err.message }, 429, { 'Retry-After': '600' });
      // 入力内容・名前・IPをログへ出さない。
      console.error('Daily ranking storage unavailable');
      return json({ error: '今はランキングにつながりません。しばらくしてからお試しください' }, 503);
    }
  },
};
