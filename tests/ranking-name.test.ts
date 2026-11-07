// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRankingName } from '../src/ui/rankingName';

afterEach(() => { document.body.replaceChildren(); });
function open(initialName = '') {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const dialog = openRankingName({ initialName, onSubmit, onClose });
  const input = document.querySelector('input')!;
  const form = document.querySelector('form')!;
  return { dialog, input, form, onSubmit, onClose };
}
describe('ランキングの名前入力', () => {
  it('前回の名前を入れてフォーカスし、日本語の名前を送る', () => {
    const { input, form, onSubmit, onClose } = open('おかみ');
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('おかみ');
    input.value = ' 店主 ';
    form.requestSubmit();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('店主', null);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('空欄や長すぎる名前では閉じず、理由を表示する', () => {
    const { input, form, onSubmit } = open();
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('1〜10文字');
    input.value = 'あ'.repeat(11);
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('IMEでの変換中・確定Enterでは送らない', () => {
    const { input, form, onSubmit } = open('店主');
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
    form.requestSubmit(); // compositionendの直後にブラウザがsubmitを発火する場合も止める。
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector('input')).not.toBeNull();
  });
  it('変換を確定した直後でも、送信ボタンの明示的なクリックは受け付ける', () => {
    const { input, onSubmit } = open('店主');
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('button[type="submit"]')!.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('店主', null);
  });
  it('Escでキャンセルし、キーをゲームへ渡さない', () => {
    const { input, onSubmit, onClose } = open();
    const gameKey = vi.fn();
    window.addEventListener('keydown', gameKey);
    try { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }
    finally { window.removeEventListener('keydown', gameKey); }
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(gameKey).not.toHaveBeenCalled();
    expect(document.querySelector('input')).toBeNull();
  });
  it('送信イベントが重なっても一度だけ送る', () => {
    const { form, onSubmit } = open('店主');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe('Turnstile の確認つきの名前入力', () => {
  it('確認が済むまでは送らず、済んだら確認の印と一緒に送る', async () => {
    const onSubmit = vi.fn();
    let done: (token: string) => void = () => {};
    const remove = vi.fn();
    openRankingName({
      initialName: '店主', onSubmit, onClose: vi.fn(), turnstile: 'site-key',
      loadTurnstile: async () => ({
        render: (_el: HTMLElement, o: Record<string, unknown>) => { done = o.callback as (t: string) => void; expect(o.sitekey).toBe('site-key'); return 'w1'; },
        remove,
      }),
    });
    await Promise.resolve(); await Promise.resolve();
    const form = document.querySelector('form')!;
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('確認が終わるまで');
    done('token-1');
    form.requestSubmit();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('店主', 'token-1');
    expect(remove).toHaveBeenCalledWith('w1');
  });
});
