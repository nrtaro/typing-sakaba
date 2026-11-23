// 繁盛記：1皿の売上の掛け算。効いた倍率はぜんぶ掛け、全部込みで上限まで（店の状態は知らない純粋な計算）
import type { PolicyId } from './build';

/** 【1皿の倍率の上限】方針・大盛り・コンボ・秘伝・宴会をぜんぶ掛けた積を、ここで止める */
export const MULT_CAP = 30;

/** 倍率の出どころ。方針のほか、コンボ・秘伝・宴会・営業条件の大盛り */
export type FactorId = PolicyId | 'combo' | 'hiden' | 'banquet' | 'big';
export interface Factor { id: FactorId; mult: number }
export interface Price {
  /** 掛ける前の額（値段＋チップ＋足し算の上乗せ） */
  base: number;
  /** 効いた倍率（×1 のものは入れない） */
  factors: Factor[];
  /** 上限の前の倍率の積／実際に払われる倍率／上限で止まったか */
  raw: number;
  paid: number;
  capped: boolean;
  gain: number;
}

/** 元の額に倍率を掛ける。金額は最後に1回だけ丸める */
export function priceOf(base: number, factors: Factor[]): Price {
  const used = factors.filter((f) => f.mult !== 1);
  const raw = used.reduce((m, f) => m * f.mult, 1);
  const paid = Math.min(raw, MULT_CAP);
  return { base, factors: used, raw, paid, capped: raw > MULT_CAP + 1e-9, gain: Math.round(base * paid) };
}

/** 【銀の枠の倍率】【金の枠の倍率】注文の札の枠で、出したら何倍になるかを予告する段階 */
export const PREVIEW_SILVER = 3;
export const PREVIEW_GOLD = 10;
export type PreviewTier = 'none' | 'silver' | 'gold';
/** 実際に払われる倍率（上限で止めたあと）から、札の枠の段階を決める */
export function previewTier(paid: number): PreviewTier {
  return paid >= PREVIEW_GOLD ? 'gold' : paid >= PREVIEW_SILVER ? 'silver' : 'none';
}
