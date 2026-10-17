import type { Rng, SheetState } from '../core/state';
import { WRAPS, type SpecialKind } from '../economy/catalog';
import { rollKind } from './bubble';

export function createSheet(id: number, grade: number, chances: Record<SpecialKind, number>, rng: Rng): SheetState {
  const { cols, rows } = WRAPS[grade];
  const cells = Array.from({ length: cols * rows }, () => rollKind(rng, chances));
  if (!cells.some((k) => k !== 'd')) cells[0] = 'n';
  return {
    id,
    grade,
    cols,
    rows,
    cells,
    popped: cells.map((k) => (k === 'd' ? 1 : 0)),
    hp: cells.map((k) => (k === 'd' ? 0 : WRAPS[grade].hp)),
    mult: 1,
    earned: 0,
    cleared: false,
    bonus: 0,
  };
}

export function isSheetDone(s: SheetState): boolean {
  return s.popped.every((p) => p === 1);
}

// 가까운 칸부터 정렬해서 반환 (연쇄 폭발이 안쪽에서 바깥으로 퍼지게)
export function neighbors(s: SheetState, index: number, radius: number): number[] {
  const col = index % s.cols;
  const row = Math.floor(index / s.cols);
  const out: { i: number; d: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c = col + dx;
      const r = row + dy;
      if (c < 0 || r < 0 || c >= s.cols || r >= s.rows) continue;
      out.push({ i: r * s.cols + c, d: dx * dx + dy * dy });
    }
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.i);
}
