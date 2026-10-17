import { CONFIG } from '../config';
import type { GameState } from '../core/state';
import { AUTOMATIONS, COLLECTION_BONUS, ITEMS, LADDERS, RESEARCH, WRAPS, type AutoId, type Ladder, type Rarity, type ResearchDef, type ResearchId, type SpecialKind } from './catalog';

/** 다음 단계 가격. 더 살 게 없으면 Infinity */
export function nextCost(state: GameState, ladder: Ladder): number {
  return LADDERS[ladder][state[ladder] + 1]?.cost ?? Infinity;
}

export function researchDef(id: ResearchId): ResearchDef {
  return RESEARCH.find((r) => r.id === id)!;
}

export function researchCost(state: GameState, id: ResearchId): number {
  const def = researchDef(id);
  const level = state.research[id];
  return level >= def.max ? Infinity : def.cost(level);
}

export function autoCost(state: GameState, id: AutoId): number {
  const def = AUTOMATIONS.find((a) => a.id === id)!;
  const level = state.auto[id];
  return level >= def.max ? Infinity : def.cost(level);
}

/** 자동화가 있고 켜져 있으면 레벨, 아니면 0 */
export function autoLevel(state: GameState, id: AutoId): number {
  return state.autoOn[id] ? state.auto[id] : 0;
}

/** 지금 주문하면 나올 뽁뽁이의 특수 확률 (연구로 해금) */
export function sheetChances(state: GameState, grade: number): Record<SpecialKind, number> {
  const r = state.research;
  const n = WRAPS[grade].native;
  return {
    g: 0.01 * r.gold + (n.g ?? 0),
    b: 0.015 * r.bomb + (n.b ?? 0),
    m: 0.006 * r.double + (n.m ?? 0),
    s: n.s ?? 0,
    d: WRAPS[grade].dud,
  };
}

/** 콤보 배수 최대치 (집중력 연구 전에는 x1) */
export function comboMax(state: GameState): number {
  return 1 + 0.5 * state.research.combo;
}

export function perfectRate(state: GameState): number {
  return 0.1 * state.research.perfect;
}

export function auctionTuning(state: GameState) {
  const r = state.research;
  return {
    /** 욕심낸 가격에도 팔릴 확률 보너스 */
    greed: 0.06 * r.auctioneer,
    war: CONFIG.auction.warChance + 0.02 * r.auctioneer,
    speed: 1 + 0.25 * r.promo,
  };
}

/** 예상 시세 힌트 범위의 폭 (감정사 연구로 좁아짐) */
export function appraiseWidth(state: GameState): number {
  return 1 - 0.2 * state.research.appraiser;
}

/** 뽁뽁이 수입 배율 (스탠드) */
export function popMult(state: GameState): number {
  return state.decor.lamp ? 1.1 : 1;
}

/** 희귀도별로 다 모았는지 */
export function completedRarities(state: GameState): Rarity[] {
  return (['c', 'u', 'r', 'l'] as Rarity[]).filter((r) => ITEMS.filter((it) => it.rarity === r).every((it) => state.found.includes(it.id)));
}

/** 경매 낙찰가 배율 (화분 + 도감 완성 보상) */
export function auctionMult(state: GameState): number {
  const fromBook = completedRarities(state).reduce((sum, r) => sum + COLLECTION_BONUS[r], 0);
  return 1 + fromBook + (state.decor.plant ? 0.1 : 0);
}

/** 콤보 유지 시간 (라디오) */
export function comboWindow(state: GameState): number {
  return CONFIG.combo.window + (state.decor.radio ? 0.25 : 0);
}

/** 경매 대기열이 쌓였을 때 빨라지는 배율 (대기 1개당 +35%, 최대 3.5배) */
export function auctionRush(waiting: number): number {
  return Math.min(3.5, 1 + 0.35 * waiting);
}
