import '@fontsource/dotgothic16/400.css';
import { Game } from './ui/game';

performance.mark('game:boot');

const canvas = document.getElementById('game') as HTMLCanvasElement;
// 途中で初出の漢字が出ても字体・文字幅が切り替わらないよう、全サブセットを先読み。
const loading = document.createElement('p');
loading.textContent = '読み込み中…';
loading.style.cssText = 'position:fixed;inset:45% 0 auto;text-align:center;color:#f8ddb0;font:20px monospace';
document.body.append(loading);
// フォントと画像は並行取得。フォント確定前の文字の切替は見せない。
canvas.style.visibility = 'hidden';
const game = new Game(canvas);
await Promise.allSettled([...document.fonts].filter(face => face.family.includes('DotGothic16')).map(face => face.load()));
await document.fonts.ready;
performance.mark('game:fonts-ready');
loading.remove();
canvas.style.visibility = 'visible';
canvas.focus();

// 動作確認用（開発時のみ）
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
