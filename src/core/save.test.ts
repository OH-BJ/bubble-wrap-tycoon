import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { DECOR, GOAL, ITEMS, RESEARCH, TOOLS, WRAPS } from '../economy/catalog';
import { auctionMult, researchCost } from '../economy/rules';
import { Game } from './game';
import { loadState, newGame, saveState, type KV } from './save';
import type { GameState } from './state';

class MemoryKV implements KV {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

// 결과가 매번 같도록 고정된 난수
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const snapshot = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

// "앱을 끄고 다시 켜기": 저장 → 불러오기 → 새 Game. 불러오기만으로는 아무것도 바뀌면 안 된다
function reopen(kv: KV, game: Game, times = 1): Game {
  const before = snapshot(game.state);
  for (let i = 0; i < times; i++) {
    saveState(kv, game.state);
    const { state, source } = loadState(kv);
    expect(source).toBe('main');
    game = new Game(state, seeded(7 + i));
  }
  expect(game.state).toEqual(before);
  return game;
}

/** 상자 속 물건을 시세의 r배 가격으로 경매에 올린다 */
function list(game: Game, r = 1, index = 0) {
  const lot = game.state.desk!.items[index];
  return game.listItem(index, Math.max(1, Math.round(lot.value * r)));
}

function fresh() {
  return new Game(newGame(), seeded());
}

/** 주문 → 테이프 → 물건 경매에 올리기 → 뽁뽁이 펼치기 */
function readyToPop(game: Game) {
  game.order();
  game.cutTape(1);
  while (game.state.desk!.items.length) list(game);
  game.moveWrapToMat();
}

function popAll(game: Game, start = 0) {
  let t = start;
  game.state.mat!.popped.forEach((p, i) => {
    if (!p) game.pop(i, (t += 0.1));
  });
  game.update(t + 10, 0);
}

/** 경매를 끝까지 진행 */
function finishAuctions(game: Game) {
  for (let i = 0; i < 2000 && (game.state.auction || game.state.lots.length); i++) game.update(0, 0.1);
}

describe('껐다 켜기: 한 판의 모든 단계', () => {
  it('새 게임', () => {
    reopen(new MemoryKV(), fresh(), 3);
  });

  it('택배가 도착한 직후 (내용물이 다시 뽑히지 않는다)', () => {
    const game = fresh();
    game.order();
    reopen(new MemoryKV(), game, 3);
  });

  it('테이프를 반쯤 뜯은 상태', () => {
    const game = fresh();
    game.order();
    game.cutTape(0.5);
    const g = reopen(new MemoryKV(), game, 2);
    expect(g.state.desk!.open).toBe(false);
  });

  it('상자를 연 상태', () => {
    const game = fresh();
    game.order();
    expect(game.cutTape(1)).toBe(true);
    reopen(new MemoryKV(), game, 2);
  });

  it('물건을 경매에 올린 상태', () => {
    const game = fresh();
    game.order();
    game.cutTape(1);
    list(game);
    reopen(new MemoryKV(), game, 2);
  });

  it('경매 도중: 입찰가와 낙찰가가 다시 뽑히지 않고, 돈은 아직 안 들어옴', () => {
    const kv = new MemoryKV();
    let game = fresh();
    game.order();
    game.cutTape(1);
    list(game);
    game.update(0, 0.1); // 경매 시작
    game.update(0, 1);
    const auction = JSON.stringify(game.state.auction);
    expect(game.state.money).toBe(0);
    game = reopen(kv, game, 3);
    expect(JSON.stringify(game.state.auction)).toBe(auction);
    expect(game.state.money).toBe(0);
  });

  it('경매가 끝나면 낙찰가가 한 번만 들어오고, 껐다 켜도 그대로', () => {
    const kv = new MemoryKV();
    let game = fresh();
    game.order();
    game.cutTape(1);
    list(game);
    game.update(0, 0.1);
    const final = game.state.auction!.bids.at(-1)!;
    finishAuctions(game);
    expect(game.state.money).toBe(final);
    expect(game.state.sales[0].price).toBe(final);
    game = reopen(kv, game, 3);
    finishAuctions(game);
    expect(game.state.money).toBe(final);
  });

  it('경매 도중 껐다 켜도 이어서 진행되고 낙찰가는 같다', () => {
    const kv = new MemoryKV();
    let game = fresh();
    game.order();
    game.cutTape(1);
    list(game);
    game.update(0, 0.1);
    const final = game.state.auction!.bids.at(-1)!;
    game.update(0, 1);
    game = reopen(kv, game);
    finishAuctions(game);
    expect(game.state.money).toBe(final);
  });

  it('뽁뽁이를 매트에 펼친 상태, 터뜨리는 도중', () => {
    const game = fresh();
    readyToPop(game);
    reopen(new MemoryKV(), game);
    game.pop(0, 0);
    game.pop(1, 0.1);
    reopen(new MemoryKV(), game, 2);
  });

  it('연쇄 폭발 도중에 꺼도 돈이 사라지거나 늘지 않는다', () => {
    const game = fresh();
    readyToPop(game);
    const s = game.state.mat!;
    s.cells = s.cells.map(() => 'n');
    s.popped = s.popped.map(() => 0);
    s.cells[s.cols + 1] = 'b';
    game.pop(s.cols + 1, 0);
    expect(game.pendingChains).toBeGreaterThan(0);
    reopen(new MemoryKV(), game, 2);
  });

  it('다 터뜨린 직후 (완벽주의 보너스가 다시 들어오지 않는다)', () => {
    const game = fresh();
    game.state.research.perfect = 3;
    readyToPop(game);
    popAll(game);
    expect(game.state.mat!.bonus).toBeGreaterThan(0);
    reopen(new MemoryKV(), game, 3);
  });

  it('여러 판을 돌려도 매번 껐다 켜기가 안전하다', () => {
    const kv = new MemoryKV();
    let game = fresh();
    for (let round = 0; round < 5; round++) {
      game.order();
      game = reopen(kv, game);
      game.cutTape(1);
      while (game.state.desk!.items.length) list(game);
      game = reopen(kv, game);
      if (game.state.mat) {
        popAll(game, round * 100);
        game.trashSheet();
      }
      game.moveWrapToMat();
      game.trashBox();
      game.update(0, 0.7);
      game = reopen(kv, game);
    }
    expect(game.state.stats.boxes).toBe(5);
  });
});

describe('규칙: 초반은 조금씩', () => {
  it('연구 전에는 특수 뽁뽁이(황금/폭탄/x2)가 안 나온다', () => {
    const game = fresh();
    for (let i = 0; i < 20; i++) {
      game.order();
      expect(game.state.desk!.wrap!.cells.every((k) => k === 'n' || k === 'd')).toBe(true);
      game.state.desk = null;
    }
  });

  it('황금 연구를 하면 다음 주문부터 황금이 나온다', () => {
    const game = fresh();
    game.state.research.gold = 5;
    let golds = 0;
    for (let i = 0; i < 20; i++) {
      game.order();
      golds += game.state.desk!.wrap!.cells.filter((k) => k === 'g').length;
      game.state.desk = null;
    }
    expect(golds).toBeGreaterThan(0);
  });

  it('집중력 연구 전에는 콤보 배수가 x1', () => {
    const game = fresh();
    readyToPop(game);
    popAll(game);
    expect(game.comboMult).toBe(1);
    expect(game.state.mat!.earned).toBe(game.state.mat!.cells.filter((k) => k !== 'd').length * WRAPS[0].value);
  });

  it('완벽주의 연구 전에는 다 터뜨려도 보너스 없음', () => {
    const game = fresh();
    readyToPop(game);
    popAll(game);
    expect(game.state.mat!.bonus).toBe(0);
  });

  it('쓰레기통에 버려도 돈은 안 들어온다', () => {
    const game = fresh();
    readyToPop(game);
    popAll(game);
    const money = game.state.money;
    expect(game.trashSheet()).toBe(true);
    expect(game.trashBox()).toBe(true);
    expect(game.state.money).toBe(money);
  });

  it('첫 상자 한 판은 수십 원 수준', () => {
    const game = fresh();
    readyToPop(game);
    popAll(game);
    finishAuctions(game);
    expect(game.state.money).toBeGreaterThan(20);
    expect(game.state.money).toBeLessThan(150);
  });
});

describe('규칙: 경매', () => {
  it('입찰가는 계속 오르고 마지막이 낙찰가', () => {
    for (let seed = 1; seed < 30; seed++) {
      const game = new Game(newGame(), seeded(seed));
      game.state.box = 3;
      game.order();
      game.cutTape(1);
      list(game);
      game.update(0, 0.1);
      const { bids, times, end } = game.state.auction!;
      for (let i = 1; i < bids.length; i++) {
        expect(bids[i]).toBeGreaterThan(bids[i - 1]);
        expect(times[i]).toBeGreaterThan(times[i - 1]);
      }
      expect(end).toBeGreaterThan(times.at(-1)!);
    }
  });

  it('경매는 하나씩 차례로 진행된다', () => {
    const game = fresh();
    game.state.box = 2;
    game.order();
    game.cutTape(1);
    const n = game.state.desk!.items.length;
    while (game.state.desk!.items.length) list(game);
    game.update(0, 0.1);
    expect(game.state.lots.length).toBe(n - 1);
    finishAuctions(game);
    expect(game.state.stats.sold).toBe(n);
  });

  it('대기열이 꽉 차면 더 못 올린다', () => {
    const game = fresh();
    game.order();
    game.cutTape(1);
    game.state.lots = Array.from({ length: CONFIG.auction.queue }, () => ({ kind: 'socks', value: 10, lo: 8, hi: 12, ask: 10 }));
    expect(list(game)).toBe(null);
    expect(game.state.desk!.items.length).toBe(1);
  });

  it('닫힌 상자에서는 물건을 꺼낼 수 없다', () => {
    const game = fresh();
    game.order();
    expect(list(game)).toBe(null);
    expect(game.moveWrapToMat()).toBe(false);
  });
});

describe('규칙: 기타', () => {
  it('상자가 책상에 있으면 새로 주문할 수 없다', () => {
    const game = fresh();
    expect(game.order()).toBe(true);
    expect(game.order()).toBe(false);
  });

  it('매트에 시트가 있으면 새 뽁뽁이를 펼칠 수 없다', () => {
    const game = fresh();
    readyToPop(game);
    game.trashBox();
    game.order();
    game.cutTape(1);
    expect(game.moveWrapToMat()).toBe(false);
  });

  it('뽁뽁이가 남은 상자, 다 안 터뜨린 시트는 버릴 수 없다', () => {
    const game = fresh();
    game.order();
    game.cutTape(1);
    while (game.state.desk!.items.length) list(game);
    expect(game.trashBox()).toBe(false);
    game.moveWrapToMat();
    game.pop(0, 0);
    expect(game.trashSheet()).toBe(false);
  });

  it('테이프는 뒤로 줄어들지 않는다', () => {
    const game = fresh();
    game.order();
    game.cutTape(0.6);
    game.cutTape(0.3);
    expect(game.state.desk!.tape).toBe(0.6);
  });

  it('구매와 연구: 돈 차감과 레벨업이 같이 일어나고, 껐다 켜도 유지된다', () => {
    const game = fresh();
    game.state.money = 10_000;
    expect(game.buy('tool')).toBe(true);
    const cost = researchCost(game.state, 'gold');
    expect(game.research('gold')).toBe(true);
    expect(game.state.money).toBe(10_000 - TOOLS[1].cost - cost);
    const g = reopen(new MemoryKV(), game, 2);
    expect(g.state.tool).toBe(1);
    expect(g.state.research.gold).toBe(1);
  });

  it('돈이 모자라면 아무것도 바뀌지 않는다', () => {
    const game = fresh();
    game.state.money = 1;
    const before = snapshot(game.state);
    expect(game.buy('wrap')).toBe(false);
    expect(game.research('gold')).toBe(false);
    expect(game.state).toEqual(before);
  });

  it('최대치 다음은 살 수 없다', () => {
    const game = fresh();
    game.state.money = 1e15;
    for (let i = 0; i < 20; i++) {
      game.buy('wrap');
      for (const r of RESEARCH) game.research(r.id);
    }
    expect(game.state.wrap).toBe(WRAPS.length - 1);
    for (const r of RESEARCH) expect(game.state.research[r.id]).toBe(r.max);
  });
});

describe('세이브 보호', () => {
  it('세이브가 깨지면 백업에서 복구한다', () => {
    const kv = new MemoryKV();
    const game = fresh();
    game.order();
    saveState(kv, game.state);
    const good = snapshot(game.state);
    game.cutTape(0.5);
    saveState(kv, game.state);
    kv.setItem(CONFIG.save.key, '{망가진 데이터');
    const { state, source } = loadState(kv);
    expect(source).toBe('backup');
    expect(state).toEqual(good);
  });

  it('이상한 값이 들어간 세이브는 받아들이지 않는다', () => {
    const kv = new MemoryKV();
    const base = fresh();
    base.order();
    base.cutTape(1);
    list(base);
    base.update(0, 0.1);
    const cases: ((s: GameState) => void)[] = [
      (s) => (s.money = Number.NaN),
      (s) => (s.money = -5),
      (s) => (s.tool = 99),
      (s) => (s.research.gold = 99),
      (s) => (s.desk!.tape = 2),
      (s) => (s.lots = [{ kind: '없는물건', value: 1, lo: 1, hi: 2, ask: 1 }]),
      (s) => (s.lots = [{ kind: 'socks', value: 10, lo: 8, hi: 12, ask: 0 }]),
      (s) => (s.desk!.wrap!.hp = [1]),
      (s) => (s.auction!.bids = []),
      (s) => (s.auction!.times = [1]),
    ];
    for (const breakIt of cases) {
      const bad = snapshot(base.state);
      breakIt(bad);
      kv.setItem(CONFIG.save.key, JSON.stringify(bad));
      expect(loadState(kv).source).toBe('new');
    }
  });

  it('예전 버전 세이브는 받아들이지 않고 새로 시작한다', () => {
    const kv = new MemoryKV();
    kv.setItem(CONFIG.save.key, JSON.stringify({ ...newGame(), version: 3, money: 999 }));
    const { state, source } = loadState(kv);
    expect(source).toBe('new');
    expect(state.money).toBe(0);
  });

  it('저장소를 쓸 수 없어도 새 게임으로 시작한다', () => {
    const broken: KV = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(loadState(broken).source).toBe('new');
    expect(saveState(broken, newGame())).toBe(false);
  });
});

describe('뽁뽁이 개성: 단단함과 줄무늬', () => {
  function toughSheet(grade: number) {
    const game = fresh();
    game.state.wrap = grade;
    readyToPop(game);
    return game;
  }

  it('두꺼운 에어캡(단단함 3)은 손가락으로 세 번 문질러야 터진다', () => {
    const game = toughSheet(2);
    const i = game.state.mat!.cells.findIndex((k) => k !== 'd');
    expect(game.hit(i, TOOLS[0].power, 0)[0].type).toBe('hit');
    expect(game.hit(i, TOOLS[0].power, 0.05)).toEqual([]); // 너무 빨리 같은 칸 → 안 깎임
    expect(game.hit(i, TOOLS[0].power, 0.2)[0].type).toBe('hit');
    expect(game.hit(i, TOOLS[0].power, 0.4)[0].type).toBe('pop');
  });

  it('도구가 좋으면 한 번에 터진다', () => {
    const game = toughSheet(2);
    const i = game.state.mat!.cells.findIndex((k) => k !== 'd');
    expect(game.hit(i, TOOLS[2].power, 0)[0].type).toBe('pop');
  });

  it('반쯤 깎인 뽁뽁이는 껐다 켜도 그대로', () => {
    const game = toughSheet(3);
    const i = game.state.mat!.cells.findIndex((k) => k !== 'd');
    game.hit(i, 3, 0);
    expect(game.state.mat!.hp[i]).toBe(WRAPS[3].hp - 3);
    reopen(new MemoryKV(), game, 2);
  });

  it('연쇄 폭발은 단단함을 무시한다', () => {
    const game = toughSheet(3);
    const s = game.state.mat!;
    s.cells = s.cells.map(() => 'n');
    s.popped = s.popped.map(() => 0);
    s.hp = s.hp.map(() => WRAPS[3].hp);
    s.cells[s.cols + 1] = 'b';
    s.hp[s.cols + 1] = 1;
    game.hit(s.cols + 1, 1, 0);
    game.update(10, 0);
    expect(s.popped[0]).toBe(1);
  });

  it('줄무늬 뽁뽁이는 한 줄을 통째로 터뜨린다', () => {
    const game = toughSheet(1);
    const s = game.state.mat!;
    s.cells = s.cells.map(() => 'n');
    s.popped = s.popped.map(() => 0);
    s.hp = s.hp.map(() => 1);
    s.cells[s.cols * 2 + 3] = 's';
    game.pop(s.cols * 2 + 3, 0);
    game.update(10, 0);
    for (let c = 0; c < s.cols; c++) expect(s.popped[s.cols * 2 + c]).toBe(1);
    expect(s.popped[s.cols]).toBe(0);
  });

  it('택배용 에어캡부터 줄무늬가 나온다', () => {
    const game = fresh();
    game.state.wrap = 1;
    let stripes = 0;
    for (let i = 0; i < 20; i++) {
      game.order();
      stripes += game.state.desk!.wrap!.cells.filter((k) => k === 's').length;
      game.state.desk = null;
    }
    expect(stripes).toBeGreaterThan(0);
  });
});

describe('경매 가격 맞추기', () => {
  /** 시세의 r배로 올린 경매를 여러 번 돌려서 결과 모음 */
  function runMany(r: number, n = 200) {
    const out: { price: number; value: number; dumped: boolean }[] = [];
    for (let seed = 1; seed <= n; seed++) {
      const game = new Game(newGame(), seeded(seed));
      game.state.box = 2;
      game.order();
      game.cutTape(1);
      list(game, r);
      game.update(0, 0.1);
      const a = game.state.auction!;
      out.push({ price: a.bids.at(-1)!, value: a.value, dumped: a.dumped });
    }
    return out;
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('예상 시세 범위 안에 진짜 시세가 있다', () => {
    for (let seed = 1; seed < 50; seed++) {
      const game = new Game(newGame(), seeded(seed));
      game.order();
      const lot = game.state.desk!.items[0];
      expect(lot.lo).toBeLessThanOrEqual(lot.value);
      expect(lot.hi).toBeGreaterThanOrEqual(lot.value);
    }
  });

  it('감정사 연구를 하면 범위가 좁아진다', () => {
    const width = (lvl: number) => {
      const w: number[] = [];
      for (let seed = 1; seed < 50; seed++) {
        const game = new Game(newGame(), seeded(seed));
        game.state.box = 3;
        game.state.research.appraiser = lvl;
        game.order();
        const lot = game.state.desk!.items[0];
        w.push((lot.hi - lot.lo) / lot.value);
      }
      return avg(w);
    };
    expect(width(4)).toBeLessThan(width(0) * 0.4);
  });

  it('싸게 부르면 무조건 팔리고, 부른 값 이상으로 팔린다', () => {
    for (const o of runMany(0.6)) {
      expect(o.dumped).toBe(false);
      expect(o.price).toBeGreaterThanOrEqual(Math.round(o.value * 0.6));
    }
  });

  it('적당한 가격(시세의 1.1~1.3배)이 평균적으로 가장 이득', () => {
    const fair = avg(runMany(1.2).map((o) => o.price / o.value));
    const cheap = avg(runMany(0.6).map((o) => o.price / o.value));
    const greedy = avg(runMany(2.5).map((o) => o.price / o.value));
    expect(fair).toBeGreaterThan(cheap);
    expect(fair).toBeGreaterThan(greedy);
    expect(fair).toBeGreaterThan(1.05);
  });

  it('터무니없는 가격은 거의 안 팔리고 떨이로 손해 본다', () => {
    const results = runMany(3);
    const dumped = results.filter((o) => o.dumped);
    expect(dumped.length / results.length).toBeGreaterThan(0.9);
    for (const o of dumped) expect(o.price).toBeLessThan(o.value);
  });

  it('시작가 0원이나 이상한 값은 받지 않는다', () => {
    const game = fresh();
    game.order();
    game.cutTape(1);
    expect(game.listItem(0, 0)).toBe(null);
    expect(game.listItem(0, Number.NaN)).toBe(null);
    expect(game.state.desk!.items.length).toBe(1);
  });
});

describe('자동화', () => {
  function auto(levels: Partial<Record<'cutter' | 'conveyor' | 'arm' | 'press', number>>) {
    const game = fresh();
    Object.assign(game.state.auto, levels);
    return game;
  }
  const run = (game: Game, seconds: number, step = 0.05) => {
    const events = [];
    for (let t = 0; t < seconds; t += step) events.push(...game.update(t, step));
    return events;
  };

  it('자동 커터는 상자를 알아서 연다', () => {
    const game = auto({ cutter: 1 });
    game.order();
    run(game, 5);
    expect(game.state.desk!.open).toBe(true);
  });

  it('컨베이어는 빈 상자를 치우고 다음 택배를 주문한다', () => {
    const game = auto({ conveyor: 1 });
    run(game, 2);
    expect(game.state.desk).not.toBe(null);
    expect(game.state.stats.boxes).toBe(1);
  });

  it('로봇팔은 흔한·고급만 시세대로 올리고 희귀 이상은 손으로 남긴다', () => {
    const game = auto({ arm: 3 });
    game.order();
    game.cutTape(1);
    game.state.desk!.items = [
      { kind: 'socks', value: 10, lo: 8, hi: 12 },
      { kind: 'phone', value: 150, lo: 120, hi: 180 },
      { kind: 'watch', value: 40, lo: 30, hi: 50 },
    ];
    run(game, 5);
    expect(game.state.desk!.items.map((i) => i.kind)).toEqual(['phone']);
    const listed = [...game.state.lots, ...(game.state.auction ? [game.state.auction] : [])];
    for (const l of game.state.lots) expect(l.ask).toBe(Math.round((l.lo + l.hi) / 2));
    expect(listed.length + game.state.stats.sold).toBe(2);
    expect(game.state.mat).not.toBe(null); // 뽁뽁이도 펼쳐줌
  });

  it('자동 프레스는 황금을 건드리지 않고, 콤보도 안 올린다', () => {
    const game = auto({ press: 5 });
    readyToPop(game);
    const s = game.state.mat!;
    s.cells = s.cells.map((_, i) => (i === 3 ? 'g' : 'n'));
    s.popped = s.popped.map(() => 0);
    s.hp = s.hp.map(() => 1);
    run(game, 30);
    expect(s.popped.filter((p) => !p).length).toBe(1);
    expect(s.popped[3]).toBe(0);
    expect(game.combo).toBe(0);
    expect(s.cleared).toBe(false);
  });

  it('꺼둔 자동화는 일하지 않는다', () => {
    const game = auto({ cutter: 3, conveyor: 1 });
    game.toggleAuto('cutter');
    game.toggleAuto('conveyor');
    game.order();
    run(game, 5);
    expect(game.state.desk!.open).toBe(false);
    expect(game.state.stats.boxes).toBe(1);
  });

  it('전부 켜두면 알아서 돌아가고, 돈은 판 만큼만 들어온다', () => {
    const game = auto({ cutter: 3, conveyor: 1, arm: 3, press: 5 });
    game.state.research.gold = 0;
    run(game, 120);
    expect(game.state.stats.boxes).toBeGreaterThan(5);
    const fromPops = game.state.totalEarned;
    expect(fromPops).toBe(game.state.money);
  });

  it('자동화 중에 껐다 켜도 불러오기만으로는 아무것도 안 바뀐다', () => {
    const kv = new MemoryKV();
    let game = auto({ cutter: 2, conveyor: 1, arm: 2, press: 3 });
    run(game, 20);
    game = reopen(kv, game, 3);
    expect(game.state.auto).toEqual({ cutter: 2, conveyor: 1, arm: 2, press: 3 });
  });

  it('자동화 구매: 돈 차감과 레벨업이 같이, 최대치 이상은 안 됨', () => {
    const game = fresh();
    game.state.money = 1e15;
    for (let i = 0; i < 10; i++) game.buyAuto('conveyor');
    expect(game.state.auto.conveyor).toBe(1);
    game.state.money = 0;
    expect(game.buyAuto('press')).toBe(false);
  });
});

describe('자동화: 콤보', () => {
  it('기계가 일으킨 연쇄(줄무늬/폭탄)도 콤보에 안 들어간다', () => {
    const game = fresh();
    game.state.auto.press = 5;
    readyToPop(game);
    const s = game.state.mat!;
    s.cells = s.cells.map((_, i) => (i % 7 === 0 ? 's' : i % 11 === 0 ? 'b' : 'n'));
    s.popped = s.popped.map(() => 0);
    s.hp = s.hp.map(() => 1);
    for (let t = 0; t < 30; t += 0.05) game.update(t, 0.05);
    expect(s.cleared).toBe(true);
    expect(game.combo).toBe(0);
  });
});

describe('3단계: 도감, 꾸미기, 엔딩', () => {
  it('v6 세이브를 불러오면 돈과 업그레이드가 그대로 유지된다', () => {
    const kv = new MemoryKV();
    const g = fresh();
    g.state.money = 12345;
    g.state.tool = 3;
    g.state.auto.press = 2;
    g.order();
    const v6 = snapshot(g.state) as unknown as Record<string, unknown>;
    v6.version = 6;
    for (const k of ['collection', 'decor', 'finale', 'ended', 'endingSeen']) delete v6[k];
    kv.setItem(CONFIG.save.key, JSON.stringify(v6));
    const { state, source } = loadState(kv);
    expect(source).toBe('main');
    expect(state.money).toBe(12345);
    expect(state.tool).toBe(3);
    expect(state.auto.press).toBe(2);
    expect(state.desk).toEqual(g.state.desk);
    expect(state.decor.cat).toBe(false);
    // 변환된 세이브도 껐다 켜기 안전
    reopen(kv, new Game(state), 2);
  });

  it('꾸미기 구매: 한 번만 살 수 있고, 돈 차감이 같이 일어난다', () => {
    const game = fresh();
    game.state.money = DECOR[0].cost * 3;
    expect(game.buyDecor('lamp')).toBe(true);
    expect(game.buyDecor('lamp')).toBe(false);
    expect(game.state.money).toBe(DECOR[0].cost * 2);
    reopen(new MemoryKV(), game, 2);
  });

  it('스탠드가 있으면 뽁뽁이 수입 +10%', () => {
    const plain = fresh();
    plain.state.wrap = 4;
    readyToPop(plain);
    const lit = fresh();
    lit.state.wrap = 4;
    lit.state.decor.lamp = true;
    readyToPop(lit);
    const i = plain.state.mat!.cells.findIndex((k) => k === 'n');
    lit.state.mat!.cells[i] = 'n';
    const a = plain.pop(i, 0)[0];
    const b = lit.pop(i, 0)[0];
    expect(a.type === 'pop' && b.type === 'pop' && b.gain).toBe(Math.round((a as { gain: number }).gain * 1.1));
  });

  it('고양이는 매트를 걸어가며 밟지만 황금은 안 밟고, 콤보도 안 올린다', () => {
    const game = fresh();
    game.state.decor.cat = true;
    readyToPop(game);
    const s = game.state.mat!;
    s.cells = s.cells.map((_, i) => (i % 5 === 0 ? 'g' : 'n'));
    s.popped = s.popped.map(() => 0);
    s.hp = s.hp.map(() => 1);
    for (let t = 0; t < 400; t += 0.05) game.update(t, 0.05);
    expect(s.popped.some((p) => p === 1)).toBe(true);
    s.cells.forEach((k, i) => {
      if (k === 'g') expect(s.popped[i]).toBe(0);
    });
    expect(game.combo).toBe(0);
  });

  it('낙찰되면 도감에 판매 횟수와 최고가가 기록된다', () => {
    const game = fresh();
    game.order();
    game.cutTape(1);
    const kind = game.state.desk!.items[0].kind;
    list(game);
    for (let i = 0; i < 200 && (game.state.auction || game.state.lots.length); i++) game.update(0, 0.1);
    expect(game.state.collection[kind].sold).toBe(1);
    expect(game.state.collection[kind].best).toBe(game.state.sales[0].price);
  });

  it('희귀도별로 다 모으면 경매가 보너스', () => {
    const game = fresh();
    expect(auctionMult(game.state)).toBe(1);
    game.state.found = ITEMS.filter((it) => it.rarity === 'c').map((it) => it.id);
    expect(auctionMult(game.state)).toBeCloseTo(1.05);
    game.state.found = ITEMS.map((it) => it.id);
    game.state.decor.plant = true;
    expect(auctionMult(game.state)).toBeCloseTo(1 + 0.05 + 0.1 + 0.15 + 0.25 + 0.1);
  });

  it('엔딩: 최종 상품 구매 → 초대형 뽁뽁이 → 다 터뜨리면 엔딩, 각 단계 껐다 켜도 안전', () => {
    const kv = new MemoryKV();
    let game = fresh();
    game.state.money = GOAL.cost + 5;
    expect(game.buyGoal()).toBe(true);
    expect(game.buyGoal()).toBe(false); // 연타
    expect(game.state.money).toBe(5);
    expect(game.state.finale).not.toBe(null);
    game = reopen(kv, game, 2);

    const f = game.state.finale!;
    f.popped.forEach((_, i) => game.hitFinale(i, 5, 0));
    expect(game.state.ended).toBe(false);
    game = reopen(kv, game, 2); // 반쯤 깎인 채로 껐다 켬

    let t = 1;
    while (game.state.finale) {
      game.state.finale.popped.forEach((p, i) => {
        if (!p) game.hitFinale(i, 30, t);
      });
      t += 1;
    }
    expect(game.state.ended).toBe(true);
    expect(game.state.endingSeen).toBe(false);
    game = reopen(kv, game, 2);
    expect(game.state.ended).toBe(true);
    game.seeEnding();
    game = reopen(kv, game);
    expect(game.state.endingSeen).toBe(true);
    game.state.money = GOAL.cost * 2;
    expect(game.buyGoal()).toBe(false); // 엔딩은 한 번만
  });

  it('초대형 뽁뽁이와 엔딩이 동시에 있는 세이브는 받아들이지 않는다', () => {
    const kv = new MemoryKV();
    const game = fresh();
    game.state.money = GOAL.cost;
    game.buyGoal();
    const bad = snapshot(game.state);
    bad.ended = true;
    kv.setItem(CONFIG.save.key, JSON.stringify(bad));
    expect(loadState(kv).source).toBe('new');
  });
});

describe('쓱쓱 장갑', () => {
  it('처음엔 없고, 중반 가격(연구 목록의 가격)에 살 수 있다', () => {
    const game = fresh();
    expect(game.state.research.rub).toBe(0);
    const cost = researchCost(game.state, 'rub');
    expect(cost).toBeGreaterThanOrEqual(1_000_000);
    game.state.money = cost;
    expect(game.research('rub')).toBe(true);
    expect(game.research('rub')).toBe(false);
    expect(game.state.money).toBe(0);
  });

  it('장갑이 생기기 전 세이브도 그대로 불러와진다 (장갑 없음으로)', () => {
    const kv = new MemoryKV();
    const g = fresh();
    g.state.money = 777;
    const old = snapshot(g.state) as unknown as { research: Record<string, number> };
    delete old.research.rub;
    kv.setItem(CONFIG.save.key, JSON.stringify(old));
    const { state, source } = loadState(kv);
    expect(source).toBe('main');
    expect(state.money).toBe(777);
    expect(state.research.rub).toBe(0);
    reopen(kv, new Game(state), 2);
  });
});

describe('재질: 말랑한 뽁뽁이 회복', () => {
  function sheetOf(grade: number) {
    const game = fresh();
    game.state.wrap = grade;
    readyToPop(game);
    const s = game.state.mat!;
    s.cells = s.cells.map(() => 'n');
    s.popped = s.popped.map(() => 0);
    s.hp = s.hp.map(() => WRAPS[grade].hp);
    return game;
  }
  const tick = (game: Game, from: number, to: number) => {
    for (let t = from; t <= to; t += 0.05) game.update(t, 0.05);
  };

  it('대왕 버블(말랑)은 깎다가 쉬면 다시 부풀어 오른다 (최대치까지만)', () => {
    const game = sheetOf(4);
    const max = WRAPS[4].hp;
    game.hit(0, 3, 0);
    expect(game.state.mat!.hp[0]).toBe(max - 3);
    tick(game, 0, 1.0);
    expect(game.state.mat!.hp[0]).toBe(max - 3); // 아직 안 쉼
    tick(game, 1.05, 30);
    expect(game.state.mat!.hp[0]).toBe(max); // 다 회복, 넘치지 않음
  });

  it('계속 문지르면 회복보다 빨리 깎인다', () => {
    const game = sheetOf(4);
    let t = 0;
    while (!game.state.mat!.popped[0] && t < 10) {
      game.hit(0, 2, t);
      game.update(t, 0.15);
      t += 0.15;
    }
    expect(game.state.mat!.popped[0]).toBe(1);
  });

  it('얼음(단단함)은 금이 간 채로 남는다', () => {
    const game = sheetOf(3);
    game.hit(0, 2, 0);
    tick(game, 0, 30);
    expect(game.state.mat!.hp[0]).toBe(WRAPS[3].hp - 2);
  });

  it('회복은 저장된 값 안에서만 일어나고, 껐다 켜기 자체로는 아무것도 안 바뀐다', () => {
    const kv = new MemoryKV();
    let game = sheetOf(2);
    game.hit(0, 1, 0);
    game = reopen(kv, game, 3);
    expect(game.state.mat!.hp[0]).toBe(WRAPS[2].hp - 1);
  });
});

describe('자동 커터 즉시 개봉 (Lv4)', () => {
  /** 상자가 열릴 때까지 걸린 시간 */
  function openTime(level: number) {
    const game = fresh();
    game.state.auto.cutter = level;
    game.order();
    let t = 0;
    while (!game.state.desk!.open && t < 10) {
      game.update(t, 0.05);
      t += 0.05;
    }
    return t;
  }

  it('Lv4는 상자가 책상에 닿자마자(0.5초 안에) 열린다', () => {
    expect(openTime(4)).toBeLessThanOrEqual(0.55);
  });

  it('Lv3은 그보다 오래 걸린다 (자리 잡고 1초 동안 뜯음)', () => {
    expect(openTime(3)).toBeGreaterThan(1.5);
  });

  it('Lv4는 3억원이고, 그 다음은 없다', () => {
    const game = fresh();
    game.state.auto.cutter = 3;
    game.state.money = 300_000_000;
    expect(game.buyAuto('cutter')).toBe(true);
    expect(game.state.money).toBe(0);
    game.state.money = 1e15;
    expect(game.buyAuto('cutter')).toBe(false);
  });
});

describe('정리 로봇팔 Lv4·Lv5', () => {
  /** 흔함·고급·희귀·전설이 하나씩 든 상자에서 로봇팔이 무엇을 남기는지 */
  function leftover(level: number) {
    const game = fresh();
    game.state.auto.arm = level;
    game.order();
    game.cutTape(1);
    game.state.desk!.items = [
      { kind: 'socks', value: 10, lo: 8, hi: 12 },
      { kind: 'watch', value: 40, lo: 30, hi: 50 },
      { kind: 'phone', value: 150, lo: 120, hi: 180 },
      { kind: 'crown', value: 1000, lo: 800, hi: 1200 },
    ];
    for (let t = 0; t < 10; t += 0.05) game.update(t, 0.05);
    return game.state.desk?.items.map((i) => i.kind) ?? [];
  }

  it('Lv3까지는 희귀·전설을 손으로 남긴다', () => {
    expect(leftover(3)).toEqual(['phone', 'crown']);
  });

  it('Lv4는 희귀도 옮기고 전설만 남긴다', () => {
    expect(leftover(4)).toEqual(['crown']);
  });

  it('Lv5는 전설까지 전부 옮긴다', () => {
    expect(leftover(5)).toEqual([]);
  });

  it('Lv4는 8억, Lv5는 50억이고 그 다음은 없다', () => {
    const game = fresh();
    game.state.auto.arm = 3;
    game.state.money = 800_000_000 + 5_000_000_000;
    expect(game.buyAuto('arm')).toBe(true);
    expect(game.buyAuto('arm')).toBe(true);
    expect(game.state.money).toBe(0);
    game.state.money = 1e15;
    expect(game.buyAuto('arm')).toBe(false);
  });
});
