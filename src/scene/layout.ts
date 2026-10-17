// 화면 배치. 게임은 1600x900 가상 화면 기준으로 그리고, 창 크기에 맞게 확대/축소한다.
export const VW = 1600;
export const VH = 900;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

export const center = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

export const ZONES = {
  hud: rect(0, 0, VW, 64),
  desk: rect(225, 84, 1025, 800),
  /** 왼쪽 바닥: 주문벨, 도감, 쓰레기통 */
  bell: rect(30, 130, 170, 200),
  book: rect(30, 390, 170, 170),
  trash: rect(35, 640, 160, 200),
  /** 택배 상자가 놓이는 자리 */
  box: rect(285, 190, 340, 290),
  laptop: rect(280, 605, 340, 240),
  /** 뽁뽁이 매트 */
  mat: rect(680, 120, 545, 590),
  tools: rect(680, 735, 545, 125),
  /** 오른쪽: 경매장 */
  auction: rect(1268, 84, 318, 800),
  stage: rect(1282, 136, 290, 330),
  queue: rect(1282, 482, 290, 160),
  history: rect(1282, 660, 290, 210),
};

/** 상자 안쪽 (뚜껑을 열었을 때) */
export const BOX_INNER = rect(ZONES.box.x + 22, ZONES.box.y + 22, ZONES.box.w - 44, ZONES.box.h - 44);

/** 테이프 (상자 가운데 세로줄) */
export const TAPE = rect(ZONES.box.x + ZONES.box.w / 2 - 26, ZONES.box.y - 6, 52, ZONES.box.h + 12);

/** 상자 안 물건 자리 (최대 4개) */
export function itemSlot(index: number): [number, number] {
  const i = BOX_INNER;
  return [i.x + 42 + index * 71, i.y + 58];
}

/** 상자 안 접힌 뽁뽁이 자리 */
export const WRAP_BUNDLE = rect(BOX_INNER.x + 26, BOX_INNER.y + 120, BOX_INNER.w - 52, 106);

/** 경매 대기열 칸 (4열 x 2줄) */
export function queueSlot(index: number): [number, number] {
  const q = ZONES.queue;
  return [q.x + 38 + (index % 4) * 71, q.y + 62 + Math.floor(index / 4) * 66];
}

/** 매트 위 시트의 배치 */
export interface SheetLayout {
  x0: number;
  y0: number;
  cell: number;
  cols: number;
  rows: number;
}

export function sheetLayout(cols: number, rows: number): SheetLayout {
  const m = ZONES.mat;
  const pad = 40;
  const cell = Math.min((m.w - pad * 2) / cols, (m.h - pad * 2) / rows, 78);
  return { x0: m.x + (m.w - cell * cols) / 2, y0: m.y + (m.h - cell * rows) / 2, cell, cols, rows };
}

export function cellCenter(L: SheetLayout, i: number): [number, number] {
  return [L.x0 + ((i % L.cols) + 0.5) * L.cell, L.y0 + (Math.floor(i / L.cols) + 0.5) * L.cell];
}
