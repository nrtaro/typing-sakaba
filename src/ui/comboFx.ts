/** 各段階内の入力でも毎回強さを維持。20以降は最上位の演出を継続。 */
export function comboFx(count: number) {
  const level = count >= 20 ? 6 : count >= 18 ? 5 : count >= 15 ? 4 : count >= 12 ? 3 : count >= 9 ? 2 : count >= 6 ? 1 : 0;
  return {
    level,
    particles: level ? 32 + level * 20 : Math.min(24, count),
    spread: level ? 105 + level * 18 : 70,
    duration: level ? 0.9 + level * 0.08 : 0.7,
    rays: level ? 6 + level * 2 : 0,
    rings: level ? Math.ceil(level / 2) : 0,
    color: ['#fff0a8', '#ffd25c', '#ffad6b', '#ff9fbd', '#b3a6ff', '#a9f0e4', '#fff7ea'][level],
    notes: level ? Array.from({ length: 3 + level }, (_, i) => i + Math.min(3, level - 1)) : [Math.min(8, Math.floor(count / 3)) + 3],
  };
}
