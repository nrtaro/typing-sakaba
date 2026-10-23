/** 10から毎回同じ段階を維持し、15・20・25…で一段ずつ豪華にする。 */
export function comboFx(count: number) {
  const level = count < 10 ? 0 : 1 + Math.floor((count - 10) / 5);
  return {
    level,
    particles: level ? Math.min(160, 30 + level * 16) : Math.min(24, count),
    spread: level ? Math.min(190, 85 + level * 20) : 70,
    duration: level ? Math.min(1.3, 0.85 + level * 0.1) : 0.7,
    rays: level ? Math.min(12, 4 + level * 2) : 0,
    notes: level ? Array.from({ length: Math.min(9, 4 + level) }, (_, i) => i + Math.min(3, level - 1)) : [Math.min(8, Math.floor(count / 3)) + 3],
  };
}
