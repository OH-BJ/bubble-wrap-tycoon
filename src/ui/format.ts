// 돈 표시: 9,999 → 1.2만 → 3.4억 → 1.2조
const UNITS: [number, string][] = [
  [1e16, '경'],
  [1e12, '조'],
  [1e8, '억'],
  [1e4, '만'],
];

export function formatShort(n: number): string {
  n = Math.floor(n);
  for (const [v, u] of UNITS) {
    if (n >= v) {
      const x = n / v;
      return `${parseFloat(x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0))}${u}`;
    }
  }
  return n.toLocaleString('ko-KR');
}

export const formatWon = (n: number) => formatShort(n) + '원';
