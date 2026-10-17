import type { AutoId, DecorId, ResearchId } from '../economy/catalog';
import type { Kind } from '../sheet/bubble';

export const SAVE_VERSION = 7;

export type Rng = () => number;

/** 뽁뽁이 시트 (상자 안에 접혀 있거나, 매트 위에 펼쳐져 있음) */
export interface SheetState {
  id: number;
  /** 뽁뽁이 등급 번호 (WRAPS 인덱스) */
  grade: number;
  cols: number;
  rows: number;
  cells: Kind[];
  popped: number[]; // 0 = 안 터짐, 1 = 터짐
  /** 남은 단단함 (0이 되면 터짐) */
  hp: number[];
  mult: number;
  earned: number;
  cleared: boolean;
  /** 다 터뜨렸을 때 받은 완벽주의 보너스 */
  bonus: number;
}

/** 상자 속 물건 (감정가는 상자를 주문할 때 정해진다) */
export interface Lot {
  /** ITEMS 의 id */
  kind: string;
  /** 진짜 시세 (화면에는 안 보임) */
  value: number;
  /** 예상 시세 힌트 범위 (진짜 시세가 이 안에 있음) */
  lo: number;
  hi: number;
}

/** 경매 대기열의 물건: 플레이어가 정한 시작가가 붙음 */
export interface ListedLot extends Lot {
  ask: number;
}

/** 책상 위 택배 상자 */
export interface BoxState {
  id: number;
  /** 택배 등급 번호 (BOXES 인덱스) */
  tier: number;
  /** 테이프 뜯은 정도 0..1 */
  tape: number;
  open: boolean;
  items: Lot[];
  wrap: SheetState | null;
}

/**
 * 진행 중인 경매. 입찰가와 낙찰가는 경매가 시작될 때 전부 정해져서 저장된다
 * (껐다 켜도 다시 뽑히지 않음). 돈은 끝났을 때 한 번만 들어온다.
 */
export interface AuctionState {
  kind: string;
  value: number;
  ask: number;
  /** 손님이 없어서 떨이로 넘어감 */
  dumped: boolean;
  bids: number[];
  /** 각 입찰이 나오는 시각 (경매 시작부터 초) */
  times: number[];
  /** 망치 땅땅땅 시각 = 끝 */
  end: number;
  elapsed: number;
  war: boolean;
}

export interface Sale {
  kind: string;
  price: number;
  value: number;
  ask: number;
}

export interface GameState {
  version: number;
  money: number;
  totalEarned: number;
  nextId: number;
  /** 구매한 단계 (도구/뽁뽁이/택배) */
  tool: number;
  wrap: number;
  box: number;
  research: Record<ResearchId, number>;
  /** 자동화 레벨과 켜짐/꺼짐 */
  auto: Record<AutoId, number>;
  autoOn: Record<AutoId, boolean>;
  desk: BoxState | null;
  mat: SheetState | null;
  /** 경매 대기열 */
  lots: ListedLot[];
  auction: AuctionState | null;
  /** 최근 낙찰 기록 (최신이 앞) */
  sales: Sale[];
  /** 한 번이라도 나온 물건 (도감) */
  found: string[];
  /** 도감 기록: 물건별 판매 횟수와 최고 낙찰가 */
  collection: Record<string, { sold: number; best: number }>;
  /** 산 꾸미기 */
  decor: Record<DecorId, boolean>;
  /** 엔딩: 세계에서 가장 큰 뽁뽁이 (사면 생기고, 다 터뜨리면 끝) */
  finale: SheetState | null;
  ended: boolean;
  endingSeen: boolean;
  stats: { boxes: number; sold: number; popped: number; sheets: number; bestSale: number; playTime: number };
}
