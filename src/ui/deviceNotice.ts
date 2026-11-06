// スマホ・タブレットで開いたときの案内。
// このゲームはキーボードで打って遊ぶので、指で触る端末では遊べないことを、読める大きさの文字で伝える。

/** 指で操作する端末か（マウスなどの細かく指せる操作手段がない） */
export function isTouchOnly(match: (q: string) => boolean = (q) => window.matchMedia(q).matches) {
  return match('(pointer: coarse)') && !match('(any-pointer: fine)');
}

/** 案内を出す。「このまま見る」で閉じられる */
export function showDeviceNotice(doc: Document = document) {
  const wrap = doc.createElement('div');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'パソコンで遊ぶゲームです');
  wrap.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:10', 'display:flex', 'align-items:center', 'justify-content:center',
    'padding:20px', 'background:rgba(18,10,8,0.82)', "font-family:'DotGothic16','MS Gothic',monospace",
  ].join(';');
  const card = doc.createElement('div');
  card.style.cssText = [
    'max-width:340px', 'width:100%', 'padding:22px 20px 18px', 'border:3px solid #a8743f', 'border-radius:6px',
    'background:#2a1a10', 'color:#f3dcb0', 'text-align:center', 'box-shadow:0 6px 0 #0c0604',
  ].join(';');
  card.innerHTML = `
    <div style="font-size:40px;line-height:1;margin-bottom:10px" aria-hidden="true">⌨️</div>
    <div style="font-size:20px;color:#ffd98a;margin-bottom:12px">パソコンで遊ぶゲームです</div>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
      タイピング酒場は、キーボードで<br>料理名を打って遊ぶゲームです。<br>
      パソコンでこのページを開いてください。
    </p>
    <div style="font-size:13px;line-height:1.6;margin:0 0 16px;padding:8px;background:#1d130b;border-radius:4px;word-break:break-all;color:#fff0a8">
      ${location.host}${location.pathname}
    </div>`;
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = 'このまま見る';
  close.style.cssText = [
    'font:inherit', 'font-size:15px', 'padding:10px 22px', 'border:2px solid #b9883f', 'border-radius:4px',
    'background:#ebc47e', 'color:#3a2414', 'cursor:pointer',
  ].join(';');
  close.addEventListener('click', () => wrap.remove());
  card.append(close);
  wrap.append(card);
  doc.body.append(wrap);
  return wrap;
}
