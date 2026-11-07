// 配膳の係（女将と看板娘）。料理を席へ運ぶ動きと、お客が食べ始める時刻を決める。
// 以前は描画側で動かしていたが、食べ始める時刻は営業の進み方（席が空く時刻）に関わるので、
// サーバーで同じ営業を再現できるよう、ゲームの計算側に置く。描画はこの位置を読むだけ。

import { SERVER_WALK_SPEED, TAVERN_AISLE, TAVERN_SEATS, serverWalkSpeed } from './tavernNavigation';

export type CrewId = 'wife' | 'daughter';
export const CREW_IDS: CrewId[] = ['wife', 'daughter'];
export const CREW_HOME: Record<CrewId, { x: number; y: number }> = { wife: { x: 158, y: 152 }, daughter: { x: 158, y: 182 } };
/** 配膳の動きの長さ（絵の「配膳」5コマ×毎秒5コマ） */
export const SERVE_LEN = 1;
/** 配膳を始めてから、お客の前に料理が置かれるまで */
export const SERVE_HANDOFF = 0.4;

/** 料理を待つお客（Shop の Guest のうち、ここで使う分だけ） */
export interface CrewGuest { awaitingDelivery?: boolean }

export interface CrewMember<G extends CrewGuest = CrewGuest> {
  x: number; y: number; tx: number; ty: number;
  moving: boolean;
  /** 向き：絵は右向きなので、左へ進むときに反転する */
  flip: boolean;
  /** 動きが始まった時刻（crew.time）。一回再生の動きは開始からの経過で再生する */
  walkStart: number;
  distance: number;
  /** 配膳に向かっている／配膳中 */
  serving: boolean;
  serveStart: number | null;
  /** 通り道（席の列を横切らないよう、列の間の通路を通る） */
  path: { x: number; y: number }[];
  jobs: { seat: number; guest: G }[];
}

function member<G extends CrewGuest>(id: CrewId): CrewMember<G> {
  const h = CREW_HOME[id];
  return { ...h, tx: h.x, ty: h.y, moving: false, flip: false, walkStart: 0, distance: 0, serving: false, serveStart: null, path: [], jobs: [] };
}

export class Crew<G extends CrewGuest = CrewGuest> {
  members: Record<CrewId, CrewMember<G>> = { wife: member<G>('wife'), daughter: member<G>('daughter') };
  /** 係の時計（営業の時計と同じだけ進む） */
  time = 0;
  /** 急な増減で歩きが跳ねないよう、客数に応じた目標歩速へ滑らかに近づける */
  speed = SERVER_WALK_SPEED;

  /** 料理を運ぶ係を決めて、お客を「配膳待ち」にする。調達に出ている係には頼まない */
  assign(seat: number, guest: G, away: string | undefined) {
    const pref: CrewId = seat % 2 ? 'wife' : 'daughter';
    const other: CrewId = pref === 'wife' ? 'daughter' : 'wife';
    // 担当席は同数のときの優先順。配膳待ちが偏るときは空いている係へ
    const who = away === pref ? other : away === other ? pref
      : this.members[pref].jobs.length <= this.members[other].jobs.length ? pref : other;
    guest.awaitingDelivery = true;
    this.members[who].jobs.push({ seat, guest });
  }

  /** 調達に出る係の仕事は、もう一人に回して、出口（持ち場）へ向かわせる */
  leave(id: string) {
    if (id !== 'wife' && id !== 'daughter') return;
    const away = this.members[id];
    const other = this.members[id === 'wife' ? 'daughter' : 'wife'];
    other.jobs.push(...away.jobs.splice(0));
    away.serving = false;
    away.serveStart = null;
    this.go(away, CREW_HOME[id].x, CREW_HOME[id].y);
  }

  private go(s: CrewMember<G>, x: number, y: number) {
    s.tx = x;
    s.ty = y;
    s.path = [];
    if (Math.abs(s.y - TAVERN_AISLE) > 2 && Math.abs(x - s.x) > 1) s.path.push({ x: s.x, y: TAVERN_AISLE });
    if (Math.abs(x - s.x) > 1) s.path.push({ x, y: TAVERN_AISLE });
    s.path.push({ x, y });
  }

  update(dt: number, guests: number, away: string | undefined) {
    this.time += dt;
    this.speed += (serverWalkSpeed(guests) - this.speed) * (1 - Math.exp(-dt / 0.18));
    for (const k of CREW_IDS) {
      const s = this.members[k];
      if (away === k) continue;
      const home = CREW_HOME[k];
      if (!s.serving && !s.moving && s.jobs.length && Math.hypot(s.x - home.x, s.y - home.y) < 1) {
        const seat = TAVERN_SEATS[s.jobs[0].seat];
        this.go(s, seat.x - 24, seat.ty + 6);
        s.serving = true;
        s.serveStart = null;
      }
      while (s.path.length > 1 && Math.hypot(s.path[0].x - s.x, s.path[0].y - s.y) <= 1) s.path.shift();
      const to = s.path[0] ?? { x: s.tx, y: s.ty };
      const dx = to.x - s.x;
      const dy = to.y - s.y;
      const d = Math.hypot(dx, dy);
      const wasMoving = s.moving;
      s.moving = d > 1;
      if (s.moving) {
        if (!wasMoving) s.walkStart = this.time;
        if (Math.abs(dx) > 0.5) s.flip = dx < 0;
        const sp = Math.min(d, this.speed * dt);
        s.x += (dx / d) * sp;
        s.y += (dy / d) * sp;
        s.distance += sp;
      }
      if (s.serving) {
        // 席に着いたら配膳を一回再生し、最後のコマで止めてから戻る
        if (!s.moving && s.serveStart === null) {
          s.serveStart = this.time;
          s.flip = false;
        }
        if (s.serveStart !== null && this.time - s.serveStart >= SERVE_HANDOFF && s.jobs[0]) s.jobs[0].guest.awaitingDelivery = false;
        if (s.serveStart !== null && this.time - s.serveStart >= SERVE_LEN + 0.15) {
          s.serving = false;
          s.serveStart = null;
          s.jobs.shift();
          this.go(s, home.x, home.y);
        }
      } else if (!s.moving && (s.tx !== home.x || s.ty !== home.y)) {
        this.go(s, home.x, home.y);
      }
    }
  }
}
