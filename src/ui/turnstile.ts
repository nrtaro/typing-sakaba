// Cloudflare Turnstile の読み込み。名前入力でランキングへ送るときだけ使う。
// 公開キーがない（準備前の）ときは読み込まない。

export interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

export function loadTurnstile(doc: Document = document): Promise<TurnstileApi> {
  const ready = (globalThis as { turnstile?: TurnstileApi }).turnstile;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      const api = (globalThis as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else { loading = null; reject(new Error('turnstile')); }
    };
    s.onerror = () => { loading = null; reject(new Error('turnstile')); };
    doc.head.append(s);
  });
  return loading;
}
