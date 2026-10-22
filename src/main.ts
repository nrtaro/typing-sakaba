import '@fontsource/dotgothic16/400.css';
import './ui/style.css';
import { App } from './ui/app';
import { TitleScene } from './ui/scenes/title';

const app = new App();
app.go(new TitleScene());

// 動作確認用（開発時のみ）
if (import.meta.env.DEV) {
  (window as unknown as { __app: App }).__app = app;
  void import('./devtools').then((m) => m.installDevtools(app));
}
