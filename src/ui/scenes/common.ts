import type { App } from '../app';
import { h, key } from '../dom';
import { INGREDIENTS, RECIPES, RECIPE_ORDER, type IngredientId } from '../../core/config';
import { sum, type GameState } from '../../core/game';

/** 設定（音量・ミュート・演出・ローマ字ガイド） */
export function settingsPanel(app: App, onClose: () => void, extra: HTMLElement[] = []): HTMLElement {
  const s = app.settings;
  const save = () => app.saveSettings();
  const range = (label: string, value: number, set: (v: number) => void) =>
    h('label', { class: 'setting' },
      h('span', null, label),
      h('input', {
        type: 'range', min: '0', max: '100', value: String(Math.round(value * 100)),
        oninput: (e: Event) => { set(Number((e.target as HTMLInputElement).value) / 100); save(); },
      }),
    );
  const check = (label: string, value: boolean, set: (v: boolean) => void, note?: string) =>
    h('label', { class: 'setting' },
      h('span', null, label),
      h('input', { type: 'checkbox', checked: value, onchange: (e: Event) => { set((e.target as HTMLInputElement).checked); save(); } }),
      note ? h('span', { class: 'tiny dim' }, note) : null,
    );

  const close = h('button', { class: 'primary', onclick: onClose }, key('Esc'), '閉じる');
  return h('div', { class: 'backdrop' },
    h('div', { class: 'panel', style: 'width: calc(var(--u) * 220)' },
      h('h2', null, '設定・一時停止'),
      range('BGMの音量', s.bgmVolume, (v) => (s.bgmVolume = v)),
      range('効果音の音量', s.seVolume, (v) => (s.seVolume = v)),
      check('ミュート', s.muted, (v) => (s.muted = v)),
      check('演出を減らす', s.reduceEffects, (v) => (s.reduceEffects = v), '点滅・湯気・光などを控えめに'),
      check('ローマ字の綴りを表示', s.showRomaji, (v) => (s.showRomaji = v), '打った分は常に表示'),
      h('p', { class: 'tiny dim' }, '音はブラウザの仕様で、最初にキーを押すかクリックするまで鳴りません。'),
      h('div', { class: 'modal-foot' }, close, h('span', { class: 'spacer' }), ...extra),
    ),
  );
}

export function stockBox(s: GameState): HTMLElement {
  const ing = (Object.keys(INGREDIENTS) as IngredientId[]).map((id) =>
    h('div', { class: 'line' },
      h('span', null, INGREDIENTS[id].name),
      h('span', null, qualitySplit(s.ingredients[id])),
    ),
  );
  const dishes = RECIPE_ORDER.filter((id) => sum(s.dishes[id]) > 0).map((id) =>
    h('div', { class: 'line' },
      h('span', null, (s.menu.includes(id) ? '◆ ' : '　') + RECIPES[id].name),
      h('span', null, `${sum(s.dishes[id])}皿`),
    ),
  );
  return h('div', { class: 'stockbox' },
    h('h4', null, '食材', h('span', { class: 'tiny dim' }, '（★1/★2/★3）')),
    ...ing,
    h('div', { class: 'sep' }),
    h('h4', null, '料理の在庫', h('span', { class: 'tiny dim' }, '　◆=メニュー')),
    ...(dishes.length ? dishes : [h('div', { class: 'dim' }, 'まだ料理がない')]),
  );
}

export function qualitySplit(q: [number, number, number]) {
  return h('span', null,
    h('span', { class: q[0] ? '' : 'mute' }, String(q[0])), '/',
    h('span', { class: q[1] ? '' : 'mute' }, String(q[1])), '/',
    h('span', { class: q[2] ? 'warm' : 'mute' }, String(q[2])),
  );
}
