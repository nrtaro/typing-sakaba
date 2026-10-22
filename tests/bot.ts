// テストとバランス調整用: 一定の速さとミス率で打鍵するボット
import type { ActivityModel, ActivityResult } from '../src/core/activity';
import { FishingModel } from '../src/core/fishing';
import { HuntingModel } from '../src/core/hunting';
import { Rng, subRng } from '../src/core/rng';
import {
  buyUpgrade, cook, cookableCount, completeActivity, computeScore, menuSlots, newGame, openTavern, startActivity,
  sum, toggleMenu, upgradeCost, kitchenLeft, capacity, nightsLeft, visitorsFor, menuDishCount, type GameState,
} from '../src/core/game';
import { RECIPES, RECIPE_ORDER, TRENDS, type ActivityKind, type IngredientId, type RecipeId, type UpgradeId } from '../src/core/config';
import type { RomajiMatcher } from '../src/core/romaji';

export interface Skill {
  kps: number;
  missRate: number;
  /** 狩りで次の獲物に反応するまでの時間（秒） */
  reaction?: number;
}

const WRONG = 'qxjvlz';

function wrongKey(m: RomajiMatcher): string {
  for (const c of WRONG) if (!m.wouldAccept(c)) return c;
  return '@';
}

export function runActivityBot(model: ActivityModel, skill: Skill, rng: Rng): ActivityResult {
  const dt = 1 / 60;
  let keyTimer = 0;
  let reactTimer = 0;
  while (!model.finished) {
    model.update(dt);
    if (model.finished) break;
    keyTimer += dt;
    let matcher: RomajiMatcher | null = null;
    if (model instanceof FishingModel) {
      matcher = model.phase === 'hooked' ? model.matcher : null;
    } else if (model instanceof HuntingModel) {
      // 間に合いそうな獲物のうち、いちばん逃げそうなものを狙う
      const reachable = (p: (typeof model.prey)[number]) => {
        const keys = p.matcher.remaining.length + (p.hp - 1) * 6;
        return keys / skill.kps + 0.3 < (p.x + 0.05) / (p.baseSpeed * p.speedMult);
      };
      const sorted = [...model.prey].sort((a, b) => a.x - b.x);
      const target = model.locked ?? sorted.find(reachable) ?? null;
      if (!model.locked && target) {
        reactTimer += dt;
        if (reactTimer < (skill.reaction ?? 0.25)) {
          keyTimer = Math.min(keyTimer, 1 / skill.kps);
          continue;
        }
      }
      matcher = target?.matcher ?? null;
    }
    if (!matcher) {
      keyTimer = Math.min(keyTimer, 1 / skill.kps);
      reactTimer = 0;
      continue;
    }
    while (keyTimer >= 1 / skill.kps && !model.finished) {
      keyTimer -= 1 / skill.kps;
      const wasLocked = model instanceof HuntingModel ? model.lockId : null;
      if (rng.next() < skill.missRate) model.key(wrongKey(matcher));
      else model.key(matcher.remaining[0]);
      if (model instanceof HuntingModel) {
        if (model.lockId !== wasLocked) reactTimer = 0;
        break; // 狩りは対象が変わるので1打ずつ判断し直す
      }
      if (model instanceof FishingModel && model.phase !== 'hooked') break;
      if (model instanceof FishingModel) matcher = model.matcher!;
    }
  }
  return model.result();
}

export type Policy = 'mixed' | 'fishOnly' | 'huntOnly' | 'trend' | 'noUpgrade';

export function simulateRun(seed: number, skill: Skill, policy: Policy = 'trend'): GameState {
  const s = newGame(seed);
  const botRng = subRng(seed, 999);
  let act = 0;
  while (s.phase === 'day') {
    while (s.actionsLeft > 0) {
      const kind = chooseActivity(s, policy, act++);
      const token = startActivity(s, kind, s.rev)!;
      const rng = subRng(seed, 500, token);
      const model = kind === 'fishing' ? new FishingModel(rng) : new HuntingModel(rng);
      completeActivity(s, token, runActivityBot(model, skill, botRng));
    }
    cookGreedy(s);
    setBestMenu(s);
    if (policy !== 'noUpgrade') buySmart(s);
    openTavern(s, s.rev);
  }
  return s;
}

function chooseActivity(s: GameState, policy: Policy, n: number): ActivityKind {
  if (policy === 'fishOnly') return 'fishing';
  if (policy === 'huntOnly') return 'hunting';
  if (policy === 'mixed' || policy === 'noUpgrade') return n % 2 === 0 ? 'fishing' : 'hunting';
  // trend: 足りない材料と噂に合わせる
  const fish = sum(s.ingredients.smallFish) + sum(s.ingredients.bigFish) * 2;
  const meat = sum(s.ingredients.smallMeat) + sum(s.ingredients.bigMeat) * 2;
  const boost = TRENDS[s.trend].tagBoost;
  if (boost === 'fish' && fish <= meat + 4) return 'fishing';
  if (boost === 'meat' && meat <= fish + 4) return 'hunting';
  return fish <= meat ? 'fishing' : 'hunting';
}

const VALUE_ORDER: RecipeId[] = ['feast', 'hunterPlate', 'catfishSteam', 'deerSteak', 'rabbitStew', 'grilledFish'];

export function cookGreedy(s: GameState) {
  // 今夜売れそうな数だけ作る（多めに）
  const target = Math.min(kitchenLeft(s), capacity(s) + 2);
  let made = RECIPE_ORDER.reduce((a, id) => a + sum(s.dishes[id]), 0);
  for (const id of VALUE_ORDER) {
    if (made >= target + 4) break;
    const n = Math.min(cookableCount(s, id), target + 4 - made);
    if (n > 0) made += cook(s, id, n);
  }
}

export function setBestMenu(s: GameState) {
  for (const id of [...s.menu]) toggleMenu(s, id);
  const boost = TRENDS[s.trend].tagBoost;
  const ranked = RECIPE_ORDER.filter((id) => sum(s.dishes[id]) > 0).sort((a, b) => {
    const score = (id: RecipeId) => sum(s.dishes[id]) * RECIPES[id].price + (boost && RECIPES[id].tags.includes(boost) ? 500 : 0);
    return score(b) - score(a);
  });
  for (const id of ranked.slice(0, menuSlots(s))) toggleMenu(s, id);
}

function buySmart(s: GameState) {
  const remaining = nightsLeft(s);
  for (let guard = 0; guard < 4; guard++) {
    const visitors = visitorsFor(s, 1);
    const cap = capacity(s);
    const dishes = menuDishCount(s);
    const canCookMore = kitchenLeft(s) === 0 && RECIPE_ORDER.some((id) => {
      const needs = RECIPES[id].needs;
      return Object.entries(needs).every(([ing, n]) => sum(s.ingredients[ing as IngredientId]) >= n!);
    });
    const limit = Math.min(visitors, cap, dishes + (canCookMore ? 99 : 0));
    const binding: UpgradeId[] = [];
    if (canCookMore && dishes <= limit) binding.push('kitchen');
    if (cap <= limit && (dishes > cap || canCookMore)) binding.push('seats');
    if (visitors <= limit && (dishes > visitors || canCookMore) && cap > visitors) binding.push('sign');
    const affordable = binding.filter((id) => upgradeCost(s, id) !== null).sort((a, b) => upgradeCost(s, a)! - upgradeCost(s, b)!);
    const pick: UpgradeId | null = affordable[0] ?? null;
    if (!pick) return;
    const cost = upgradeCost(s, pick);
    if (cost === null || s.cash < cost) return;
    // 残りの夜で元が取れる見込み（1夜あたり4皿×40Cr増と仮定）
    if (cost * 0.5 > (remaining - 0.5) * 160) return;
    buyUpgrade(s, pick, s.rev);
    cookGreedy(s);
    setBestMenu(s);
  }
}

export function runScore(seed: number, skill: Skill, policy: Policy = 'trend') {
  const s = simulateRun(seed, skill, policy);
  return { state: s, score: computeScore(s) };
}
