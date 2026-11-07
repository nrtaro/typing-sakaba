import { normalizeRankingName } from '../core/ranking';
import { loadTurnstile, type TurnstileApi } from './turnstile';

interface NameOptions {
  initialName: string;
  /** Turnstile の公開キー。あるときは、確認が済むまで送信しない */
  turnstile?: string | null;
  onSubmit(name: string, token: string | null): void;
  onClose(): void;
  /** 動作確認用：Turnstile の読み込みを差し替える */
  loadTurnstile?: () => Promise<TurnstileApi>;
}

const WAIT = '確認が終わるまで、少しお待ちください。';

/** 名前入力だけはHTMLにし、ブラウザの日本語入力をそのまま使う。 */
export function openRankingName(options: NameOptions, doc: Document = document) {
  const previous = doc.activeElement as HTMLElement | null;
  const wrap = doc.createElement('div');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', 'ランキングのなまえ');
  wrap.style.cssText = "position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(18,10,8,.85);font-family:'DotGothic16','MS Gothic',monospace";
  const form = doc.createElement('form');
  form.style.cssText = 'width:340px;max-width:100%;padding:24px;border:3px solid #a8743f;border-radius:6px;background:#2a1a10;color:#f3dcb0;box-shadow:0 6px 0 #0c0604';
  const label = doc.createElement('label');
  label.textContent = 'ランキングのなまえ';
  label.style.cssText = 'display:block;color:#ffd98a;font-size:22px;line-height:1.5';
  const note = doc.createElement('p');
  note.textContent = '1〜10文字。名前と売上が公開されます。';
  note.style.cssText = 'font-size:14px;line-height:1.7;margin:12px 0';
  const input = doc.createElement('input');
  input.type = 'text';
  input.name = 'ranking-name';
  input.autocomplete = 'off';
  input.maxLength = 20; // UTF-16では絵文字が2文字になるため、最後にコードポイントで確認する。
  input.value = options.initialName;
  input.style.cssText = 'display:block;box-sizing:border-box;width:100%;margin-top:12px;padding:10px;border:2px solid #c79a52;border-radius:3px;font:20px inherit;font-family:inherit;font-size:20px;background:#fff3d6;color:#2a1a10';
  label.append(input);
  const error = doc.createElement('p');
  error.setAttribute('role', 'alert');
  error.style.cssText = 'min-height:2.8em;font-size:14px;line-height:1.4;color:#ffb6a4;margin:10px 0';
  const actions = doc.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px';
  const submit = doc.createElement('button');
  submit.type = 'submit';
  submit.textContent = '送信する（Enter）';
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'やめる（Esc）';
  for (const button of [submit, cancel]) button.style.cssText = 'font:inherit;font-size:14px;padding:10px 8px;border:2px solid #b9883f;border-radius:4px;background:#ebc47e;color:#3a2414;cursor:pointer';
  actions.append(submit, cancel);
  // Turnstile：人が送っていることを確かめる欄（多くの場合は自動で済む）
  let token: string | null = null;
  let widget: string | null = null;
  let api: TurnstileApi | null = null;
  const check = doc.createElement('div');
  check.style.cssText = 'min-height:0;margin:4px 0 8px';
  if (options.turnstile) {
    const siteKey = options.turnstile;
    (options.loadTurnstile ?? (() => loadTurnstile(doc)))().then((t) => {
      if (closed) return;
      api = t;
      widget = t.render(check, {
        sitekey: siteKey, action: 'ranking', theme: 'dark', language: 'ja',
        callback: (v: string) => { token = v; if (error.textContent === WAIT) error.textContent = ''; },
        'expired-callback': () => { token = null; },
        'error-callback': () => { token = null; error.textContent = '確認を読み込めませんでした。少し待ってからもう一度お試しください。'; },
      });
    }).catch(() => { if (!closed) error.textContent = '確認を読み込めませんでした。通信の状態を確かめてください。'; });
  }
  form.append(label, note, check, error, actions);
  wrap.append(form);
  let closed = false;
  let composing = false;
  let confirmedAt = -Infinity;
  let pointerSubmit = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (api && widget) api.remove(widget);
    wrap.remove();
    previous?.focus();
    options.onClose();
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; confirmedAt = performance.now(); });
  wrap.addEventListener('keydown', e => {
    e.stopPropagation();
    // IMEの変換確定Enterを、送信として扱わない（ブラウザ差も吸収）。
    if (e.isComposing || e.keyCode === 229 || composing) return;
    if (e.key === 'Enter' && performance.now() - confirmedAt < 80) { e.preventDefault(); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      if (e.shiftKey && doc.activeElement === input) { e.preventDefault(); cancel.focus(); }
      else if (!e.shiftKey && doc.activeElement === cancel) { e.preventDefault(); input.focus(); }
    }
  });
  submit.addEventListener('click', e => { pointerSubmit = e.detail > 0; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const explicitClick = pointerSubmit;
    pointerSubmit = false;
    if (closed || composing || (!explicitClick && performance.now() - confirmedAt < 80)) return;
    const name = normalizeRankingName(input.value);
    if (!name) {
      error.textContent = '名前は1〜10文字で入力してください。使えない文字や言葉があります。';
      input.focus();
      return;
    }
    if (options.turnstile && !token) {
      error.textContent = WAIT;
      return;
    }
    close();
    options.onSubmit(name, token);
  });
  cancel.addEventListener('click', close);
  doc.body.append(wrap);
  input.focus();
  input.select();
  return { close };
}
