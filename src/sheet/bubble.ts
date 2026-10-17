import type { SpecialKind } from '../economy/catalog';

// n 일반, g 황금, b 폭탄, m 배수, s 줄무늬, d 꽝(처음부터 터져 있음)
export type Kind = 'n' | SpecialKind;
export type PoppableKind = Exclude<Kind, 'd'>;

const KINDS: readonly string[] = ['n', 'g', 'b', 'm', 's', 'd'];
const SPECIALS = ['g', 'b', 'm', 's', 'd'] as const;

export function isKind(v: unknown): v is Kind {
  return typeof v === 'string' && KINDS.includes(v);
}

export function rollKind(rng: () => number, chances: Record<SpecialKind, number>): Kind {
  let r = rng();
  for (const k of SPECIALS) {
    const c = chances[k];
    if (r < c) return k;
    r -= c;
  }
  return 'n';
}
