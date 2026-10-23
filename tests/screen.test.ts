import { afterEach, describe, expect, it, vi } from 'vitest';
import { Screen } from '../src/ui/screen';

afterEach(() => vi.unstubAllGlobals());

describe('画面サイズ変更時の文字描画', () => {
  it('同じサイズの通知ではCanvasの描画状態を消去しない', () => {
    const resets = vi.fn();
    const context = { font: '10px monospace' };
    let width = 300, height = 150;
    const canvas = {
      get width() { return width; }, set width(v: number) { width = v; resets(); context.font = '10px monospace'; },
      get height() { return height; }, set height(v: number) { height = v; resets(); context.font = '10px monospace'; },
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const viewport = { innerWidth: 960, innerHeight: 540, devicePixelRatio: 1, addEventListener: vi.fn() };
    vi.stubGlobal('window', viewport);
    vi.stubGlobal('document', { createElement: () => ({ width: 300, height: 150, getContext: () => ({}) }) });
    vi.stubGlobal('ResizeObserver', class { observe() {} });
    const screen = new Screen(canvas);
    resets.mockClear();
    context.font = "24px 'DotGothic16'";
    screen.fit(); screen.fit();
    expect(resets).not.toHaveBeenCalled();
    expect(context.font).toBe("24px 'DotGothic16'");
    viewport.innerWidth = 1280;
    screen.fit();
    expect(canvas.width).toBe(1280);
    expect(resets).toHaveBeenCalledTimes(1);
  });
});
