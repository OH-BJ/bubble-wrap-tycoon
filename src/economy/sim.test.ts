// 밸런스 시뮬레이션: 봇이 실제 게임 규칙으로 처음부터 최종 목표까지 플레이한다.
// 자동화 기계와 봇이 동시에 일한다 (기계가 있으면 봇은 그 일을 안 한다).
// 실행: SIM=1 npx vitest run src/economy/sim.test.ts --silent=false
//       SIM=tune ... (가격 자동 조율)
import { describe, it } from 'vitest';
import { Game, itemDef } from '../core/game';
import { newGame } from '../core/save';
import { formatShort } from '../ui/format';
import { AUTOMATIONS, BOXES, DECOR, GOAL, RESEARCH, TOOLS, WRAPS, type Ladder } from './catalog';
import { autoCost, nextCost, researchCost } from './rules';

// 사람이 하는 데 걸리는 시간 (초, 대략)
const T = { order: 1.5, tape: 1.5, item: 3, wrap: 1, trash: 0.6, rub: 0.5 };
/** 1초에 터뜨리는(깎는) 칸 수: 장갑이 있으면 드래그, 없으면 클릭 (초당 3번, 범위만큼) */
const rubRate = (tool: number, rub: boolean) => (rub ? 3 + TOOLS[tool].radius / 6 : 3 * (1 + TOOLS[tool].radius / 30));

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function run(seed: number, limit = 5 * 3600) {
  const game = new Game(newGame(), seeded(seed));
  const s = game.state;
  const log: string[] = [];
  const dt = 0.05;
  let t = 0;
  let busy = 0;
  let nextShop = 0;

  const shop = () => {
    for (;;) {
      const options: { cost: number; buy: () => boolean; name: string }[] = [];
      for (const l of ['tool', 'wrap', 'box'] as Ladder[]) {
        const name = l === 'tool' ? TOOLS[s.tool + 1]?.name : l === 'wrap' ? WRAPS[s.wrap + 1]?.name : BOXES[s.box + 1]?.name;
        options.push({ cost: nextCost(s, l), buy: () => game.buy(l), name: name ?? '' });
      }
      for (const a of AUTOMATIONS) {
        const lvl = s.auto[a.id];
        options.push({ cost: autoCost(s, a.id), buy: () => game.buyAuto(a.id), name: `${a.name}${a.max > 1 ? ` Lv${lvl + 1}` : ''}` });
      }
      for (const r of RESEARCH) options.push({ cost: researchCost(s, r.id), buy: () => game.research(r.id), name: r.id === 'rub' ? '🧤 쓱쓱 장갑' : '' });
      for (const d of DECOR) if (!s.decor[d.id]) options.push({ cost: d.cost, buy: () => game.buyDecor(d.id), name: d.name });
      const best = options.filter((o) => o.cost <= s.money).sort((a, b) => a.cost - b.cost)[0];
      if (!best) return;
      best.buy();
      if (best.name) log.push(`${(t / 60).toFixed(1).padStart(5)}분  ${best.name.padEnd(12)} (${formatShort(best.cost)}원)`);
    }
  };

  /** 봇이 지금 할 일 하나를 고르고, 걸리는 시간을 돌려준다 (할 일이 없으면 0) */
  const act = (): number => {
    // 엔딩: 초대형 뽁뽁이 문지르기
    if (s.finale) {
      s.finale.popped.forEach((p, i) => {
        if (!p) game.hitFinale(i, TOOLS[s.tool].power, t);
      });
      return T.rub;
    }
    if (game.canBuyGoal()) {
      log.push(`${(t / 60).toFixed(1).padStart(5)}분  🌍 최종 상품 구매`);
      game.buyGoal();
      return 1;
    }
    const d = s.desk;
    const auto = (id: 'cutter' | 'conveyor' | 'arm' | 'press') => s.auto[id] > 0;
    if (!d && !auto('conveyor')) return game.order() ? T.order : 0;
    if (d && !d.open && !auto('cutter')) {
      game.cutTape(1);
      return T.tape;
    }
    if (d?.open && game.canList()) {
      // 로봇팔이 있으면 희귀 이상만 손으로
      const i = d.items.findIndex((it) => !auto('arm') || 'rl'.includes(itemDef(it.kind).rarity));
      if (i >= 0) {
        const lot = d.items[i];
        game.listItem(i, Math.round(((lot.lo + lot.hi) / 2) * 1.15));
        return T.item;
      }
    }
    if (game.canMoveWrap() && !auto('arm')) {
      game.moveWrapToMat();
      return T.wrap;
    }
    const m = s.mat;
    if (m && !m.cleared) {
      // 문지르기: 황금 먼저, 그다음 아무 칸이나
      const power = TOOLS[s.tool].power;
      const cells = m.popped.flatMap((p, i) => (p ? [] : [i])).sort((a, b) => Number(m.cells[b] === 'g') - Number(m.cells[a] === 'g'));
      const n = Math.ceil(rubRate(s.tool, s.research.rub > 0) * T.rub);
      cells.slice(0, n).forEach((i, k) => game.hit(i, power, t + (k / n) * T.rub));
      return T.rub;
    }
    if (!auto('conveyor')) {
      if (m?.cleared && game.trashSheet()) return T.trash;
      if (game.canTrashBox() && game.trashBox()) return T.trash;
    }
    return 0;
  };

  while (!s.ended && t < limit) {
    game.update(t, dt);
    if (busy <= t) {
      if (t >= nextShop) {
        shop();
        nextShop = t + 1;
      }
      busy = t + act();
    }
    t += dt;
  }
  log.push(`🎉 엔딩 (${formatShort(GOAL.cost)}원): ${(t / 60).toFixed(1)}분, 상자 ${s.stats.boxes}개, 도감 ${s.found.length}`);
  return { log, minutes: t / 60 };
}

const SIM = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIM;

describe.skipIf(!SIM || SIM === 'tune')('밸런스 시뮬레이션', () => {
  it('목표까지 걸리는 시간', () => {
    for (const seed of [1, 2]) console.log(`[seed ${seed}]\n` + run(seed).log.join('\n'));
  });
});

// 자동 조율: 업그레이드가 목표 시각표대로 나오도록 도구/뽁뽁이/택배 가격을 조금씩 고친다.
describe.skipIf(SIM !== 'tune')('가격 자동 조율', () => {
  it('목표 시각표에 맞추기', () => {
    const TARGET_TOTAL = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.TOTAL ?? 125);
    const all = () => [...TOOLS.slice(1), ...WRAPS.slice(1), ...BOXES.slice(1)].sort((a, b) => a.cost - b.cost);
    const nice = (n: number) => {
      const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
      return Math.round(n / p) * p;
    };
    const fixedEarly = 3; // 처음 몇 개는 손으로 정한 가격 유지 (초반 템포)
    for (let iter = 0; iter < 10; iter++) {
      const when = new Map<string, number>();
      let total = 0;
      for (const seed of [1, 2]) {
        const r = run(seed);
        total += r.minutes / 2;
        for (const line of r.log) {
          const m = line.match(/^\s*([\d.]+)분\s+(.+?)\s+\(/);
          if (m) when.set(m[2].trim(), (when.get(m[2].trim()) ?? 0) + Number(m[1]) / 2);
        }
      }
      const order = all();
      order.forEach((u, k) => {
        if (k < fixedEarly) return;
        const target = 0.6 + Math.pow((k + 1) / order.length, 1.45) * TARGET_TOTAL * 0.86;
        const actual = Math.max(0.3, when.get(u.name) ?? target);
        const f = Math.min(3, Math.max(0.33, target / actual));
        u.cost = nice(u.cost * Math.pow(f, 0.8));
      });
      GOAL.cost = nice(GOAL.cost * Math.pow(Math.min(3, Math.max(0.33, TARGET_TOTAL / total)), 0.9));
      console.log(`반복 ${iter + 1}: 전체 ${total.toFixed(1)}분`);
    }
    console.log(all().map((u) => `${u.name}: ${u.cost}`).join('\n') + `\n목표: ${GOAL.cost}`);
    console.log(run(1).log.join('\n'));
  });
});
