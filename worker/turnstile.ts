// Cloudflare Turnstile：送信した人が自動の仕組みでないかを、Cloudflare に確かめてもらう。
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** ゲームの名前入力で出すときの名前（ほかの用途の確認結果を使い回させない） */
export const TURNSTILE_ACTION = 'ranking';

export async function checkTurnstile(secret: string, token: unknown, ip: string | null, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const response = await fetcher(SITEVERIFY, { method: 'POST', body });
    const result = await response.json() as { success?: boolean; action?: string };
    return result.success === true && (result.action === undefined || result.action === TURNSTILE_ACTION);
  } catch {
    return false;
  }
}
