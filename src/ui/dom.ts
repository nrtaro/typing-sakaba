type Child = Node | string | number | null | undefined | false | Child[];

type Props = {
  class?: string;
  style?: string;
  onclick?: (e: MouseEvent) => void;
  [key: string]: unknown;
};

/** 要素を作る小さなヘルパー。文字列は textContent として入るので安全。 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'disabled') (el as HTMLButtonElement).disabled = Boolean(v);
      else if (k === 'checked') (el as HTMLInputElement).checked = Boolean(v);
      else if (k === 'value') (el as HTMLInputElement).value = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function key(label: string) {
  return h('span', { class: 'key' }, label);
}

export function stars(q: number) {
  return h('span', { class: 'star' }, '★'.repeat(q + 1));
}

/** 一度押したら無効化するボタン（二重クリック対策） */
export function onceButton(label: Child, onClick: () => void, props: Props = {}) {
  const b = h('button', props, label);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    b.disabled = true;
    onClick();
  });
  return b;
}

export function fmt(n: number) {
  return Math.round(n).toLocaleString('ja-JP');
}
