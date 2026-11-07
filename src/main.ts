import '@fontsource/dotgothic16/400.css';
import { Game } from './ui/game';
import { isTouchOnly, showDeviceNotice } from './ui/deviceNotice';
import { FONT_TEXT } from './ui/fontText';

performance.mark('game:boot');

const canvas = document.getElementById('game') as HTMLCanvasElement;
const loading = document.createElement('p');
loading.textContent = '読み込み中…';
loading.style.cssText = 'position:fixed;inset:45% 0 auto;text-align:center;color:#f8ddb0;font:20px monospace';
document.body.append(loading);
// フォントと画像は並行取得。フォント確定前の文字の切替は見せない。
canvas.style.visibility = 'hidden';
const game = new Game(canvas);
// ゲームの画面に出る文字（FONT_TEXT）を含む書体の部分だけを先に読み込む（全部だと約0.77MB、使う分は約0.27MB）。
// それ以外の文字（ランキングの名前など）は、描いたときに必要な部分だけ追加で読み込まれる。
await Promise.allSettled([document.fonts.load('16px "DotGothic16"', FONT_TEXT)]);
await document.fonts.ready;
performance.mark('game:fonts-ready');
loading.remove();
canvas.style.visibility = 'visible';
canvas.focus();
// スマホ・タブレットでは遊べないので、読める大きさで案内する
if (isTouchOnly()) showDeviceNotice();

// 動作確認用（開発時のみ）
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
