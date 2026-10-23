import '@fontsource/dotgothic16/400.css';
import { Game } from './ui/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
canvas.focus();
// フォントの読み込みを待ってから文字の幅を測り直す
void document.fonts?.load("16px 'DotGothic16'");

// 動作確認用（開発時のみ）
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
