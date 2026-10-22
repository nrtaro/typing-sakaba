// 開発時のみ読み込まれる動作確認用の補助（本番ビルドには含まれない）
import type { App } from './ui/app';

interface AnyScene {
  phase?: string;
  paused?: boolean;
  resume?: () => void;
  model?: {
    kind: string;
    phase?: string;
    matcher?: { remaining: string } | null;
    locked?: { matcher: { remaining: string } } | null;
    prey?: { x: number; matcher: { remaining: string } }[];
  };
  result?: unknown;
}

export function installDevtools(app: App) {
  const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  const scene = () => (app as unknown as { scene: AnyScene }).scene;
  const step = (sec: number) => {
    for (let t = 0; t < sec; t += 1 / 60) app.debugStep(1 / 60);
  };
  /** 一定の速さ（打鍵/秒）で調達を最後まで進める。missEvery 打鍵ごとに1回ミス */
  const runActivity = (kps = 5, missEvery = 25) => {
    let acc = 0;
    let n = 0;
    let guard = 0;
    while (scene().phase !== 'result' && guard++ < 60 * 150) {
      const sc = scene();
      if (sc.paused) sc.resume?.();
      app.debugStep(1 / 60);
      if (sc.phase !== 'play' || !sc.model) continue;
      acc += kps / 60;
      const m = sc.model;
      while (acc >= 1) {
        acc -= 1;
        let rem: string | undefined;
        if (m.kind === 'fishing') rem = m.phase === 'hooked' ? m.matcher?.remaining : undefined;
        else rem = (m.locked ?? [...(m.prey ?? [])].sort((a, b) => a.x - b.x).find((p) => p.x > 0.25))?.matcher.remaining;
        if (!rem) {
          acc = 0;
          break;
        }
        n++;
        press(n % missEvery === 0 ? 'q' : rem[0]);
      }
    }
    return scene().result;
  };
  (window as unknown as Record<string, unknown>).__qa = { app, press, step, scene, runActivity };
}
