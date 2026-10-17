// 공통 밸런스 숫자. 도구/뽁뽁이/택배/연구는 economy/catalog.ts 에 있다.
export const CONFIG = {
  // 종류별 수익 배율 (뽁뽁이 등급 가치에 곱함)
  value: { n: 1, g: 25, b: 2, m: 1, s: 3 },
  multFactor: 2,
  multMax: 4,
  // window 초 안에 다음 뽁뽁이를 터뜨리면 콤보 유지, every 콤보마다 수익 +step 배 (최대치는 연구로)
  combo: { window: 0.6, every: 12, step: 0.5 },
  bomb: { delay: 0.045 },
  stripe: { delay: 0.035 },
  /** 같은 뽁뽁이를 다시 깎으려면 이만큼 기다려야 한다 (문지르는 느낌) */
  hitCooldown: 0.11,
  /** 말랑한 뽁뽁이: 마지막으로 깎고 delay 초가 지나면 interval 초마다 단단함 1씩 회복 */
  regen: { delay: 1.2, interval: 0.6 },
  /** 테이프를 이만큼 뜯으면 상자가 열린다 */
  tapeOpen: 0.92,
  auction: {
    /** 경매 대기열 최대 */
    queue: 8,
    /** 최근 낙찰 기록 */
    history: 4,
    /** 입찰 전쟁 기본 확률 (+경매사 레벨당 2%). 적당한 가격일 때만 */
    warChance: 0.06,
  },
  save: { key: 'bbwrap.desk', backupKey: 'bbwrap.desk.bak', throttleMs: 300 },
} as const;
