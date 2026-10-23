/** 描画と入店判定が同じ経路・速さを使う。座標は480×270基準。 */
export const TAVERN_SEATS = [110, 190].flatMap((ty) => [196, 260, 324, 388].map((x) => ({ x, ty })));
/** 客の入退店。以前の68から約24%速くする。 */
export const WALK_SPEED = 84;
/** 配膳は客より速く、往復で営業のテンポを止めない。 */
export const SERVER_WALK_SPEED = 112;
export const TAVERN_DOOR = { x: 452, y: 202 };
export const TAVERN_AISLE = 156;

export function entryPath(seat: { x: number; ty: number }) {
  return [TAVERN_DOOR, { x: 430, y: TAVERN_AISLE }, { x: seat.x - 26, y: TAVERN_AISLE },
    { x: seat.x - 26, y: seat.ty - 2 }, { x: seat.x, y: seat.ty - 2 }];
}

export function entryDistance(seat: { x: number; ty: number }) {
  const points = entryPath(seat);
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
}

export function entryPose(seat: { x: number; ty: number }, progress: number) {
  const points = entryPath(seat);
  const travelled = Math.max(0, Math.min(1, progress)) * entryDistance(seat);
  let remaining = travelled;
  let right = false; // 客の素材は左向き。縦の区間では直前の向きを保つ。
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i];
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (dx) right = dx > 0;
    if (remaining <= length || i === points.length - 1) {
      const p = Math.min(1, remaining / length);
      return { x: from.x + dx * p, y: from.y + dy * p, flip: right, distance: travelled };
    }
    remaining -= length;
  }
  return { x: seat.x, y: seat.ty - 2, flip: true, distance: travelled };
}

export function entryPosition(seat: { x: number; ty: number }, progress: number) {
  const { x, y } = entryPose(seat, progress);
  return { x, y };
}
