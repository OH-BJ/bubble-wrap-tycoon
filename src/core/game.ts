import { CONFIG } from '../config';
import { AUTO_SPEC, BOXES, DECOR, FINALE, GOAL, ITEMS, RARITY_VALUE, WRAPS, type AutoId, type DecorId, type ItemDef, type Ladder, type Rarity, type ResearchId } from '../economy/catalog';
import { appraiseWidth, auctionMult, auctionRush, auctionTuning, autoCost, autoLevel, comboMax, comboWindow, nextCost, perfectRate, popMult, researchCost, sheetChances } from '../economy/rules';
import type { Kind, PoppableKind } from '../sheet/bubble';
import { createSheet, isSheetDone, neighbors } from '../sheet/sheet';
import type { AuctionState, GameState, ListedLot, Lot, Rng, SheetState } from './state';

export type GameEvent =
  | { type: 'pop'; index: number; kind: Kind; gain: number; combo: number; chained: boolean; auto: boolean }
  /** 단단해서 아직 안 터짐 (찌그러지기만). power: 깎은 도구 힘 */
  | { type: 'hit'; index: number; left: number; power: number }
  /** 말랑한 뽁뽁이가 다시 부풀어 오름 */
  | { type: 'regen'; index: number; left: number }
  | { type: 'clear'; bonus: number }
  | { type: 'auctionStart'; kind: string }
  | { type: 'bid'; index: number; price: number }
  | { type: 'sold'; kind: string; price: number; value: number; ask: number; war: boolean; dumped: boolean }
  // 자동화가 한 일 (화면 연출용)
  | { type: 'autoOrder' }
  | { type: 'autoOpened' }
  | { type: 'autoList'; index: number; kind: string }
  | { type: 'autoWrap' }
  | { type: 'autoTrash'; what: 'sheet' | 'box'; tier: number }
  | { type: 'press'; index: number }
  | { type: 'cat' }
  // 엔딩: 초대형 뽁뽁이
  | { type: 'finaleHit'; index: number; left: number }
  | { type: 'finalePop'; index: number; left: number }
  | { type: 'ending' };

/** 고양이 걷는 속도 (칸/초) */
export const CAT_SPEED = 4;

export const itemDef = (kind: string): ItemDef => ITEMS.find((it) => it.id === kind)!;

// 게임 규칙만 담당한다. 화면/소리는 결과를 보고 처리한다.
// 돈이나 진행 상황을 바꾸는 일은 전부 이 클래스 안에서, 한 번에 일어난다.
export class Game {
  combo = 0;
  /** 저장이 필요한 변화가 있음 */
  dirty = false;
  /** 바로 저장해야 하는 중요한 변화 (돈이 오가거나 물건이 옮겨짐) */
  critical = false;
  private lastPopAt = -Infinity;
  /** 예약된 연쇄 폭발. auto: 기계가 일으킨 연쇄면 콤보에 안 들어감 */
  private queue: { index: number; at: number; auto: boolean }[] = [];
  /** 칸별로 마지막으로 깎은 시각 (같은 칸은 잠깐 쉬어야 다시 깎인다) */
  private lastHit = new Map<number, number>();
  // 자동화 타이머 (저장 안 함: 껐다 켜면 처음부터 다시 셈)
  private deskAge = 0;
  private armTimer = 0;
  private pressAcc = 0;
  private idle = 0;
  private catTimer = 0;
  /** 고양이 산책: 몇 번째 줄을, 언제부터 (화면에서 위치 계산용) */
  catWalk: { row: number; start: number; dir: 1 | -1 } | null = null;
  private finaleHits = new Map<number, number>();

  constructor(public state: GameState, private rng: Rng = Math.random) {}

  private change(critical = false) {
    this.dirty = true;
    if (critical) this.critical = true;
  }

  private earn(amount: number) {
    this.state.money += amount;
    this.state.totalEarned += amount;
  }

  // ---- 1. 주문 ----

  canOrder(): boolean {
    return !this.state.desk;
  }

  order(): boolean {
    if (!this.canOrder()) return false;
    const s = this.state;
    const tier = s.box;
    const [lo, hi] = BOXES[tier].items;
    const count = lo + Math.floor(this.rng() * (hi - lo + 1));
    const items: Lot[] = Array.from({ length: count }, () => this.rollItem(tier));
    const wrap = createSheet(s.nextId + 1, s.wrap, sheetChances(s, s.wrap), this.rng);
    s.desk = { id: s.nextId, tier, tape: 0, open: false, items, wrap };
    s.nextId += 2;
    s.stats.boxes += 1;
    this.change(true);
    return true;
  }

  private rollItem(tier: number): Lot {
    const box = BOXES[tier];
    const r = this.rng();
    const { l, r: rare, u } = box.rarity;
    const rarity: Rarity = r < l ? 'l' : r < l + rare ? 'r' : r < l + rare + u ? 'u' : 'c';
    const pool = ITEMS.filter((it) => it.rarity === rarity);
    const def = pool[Math.floor(this.rng() * pool.length)];
    const value = Math.max(1, Math.round(RARITY_VALUE[rarity] * box.mult * (0.8 + this.rng() * 0.4)));
    // 예상 시세 힌트: 진짜 시세가 범위 안 어딘가에 숨어 있다
    const w = appraiseWidth(this.state);
    const lo = Math.max(1, Math.floor(value * (1 - w * (0.15 + this.rng() * 0.3))));
    const hi = Math.max(lo + 1, Math.ceil(value * (1 + w * (0.15 + this.rng() * 0.35))));
    return { kind: def.id, value, lo, hi };
  }

  // ---- 2. 테이프 뜯기 ----

  /** 뜯은 정도를 올린다. 상자가 이번에 열렸으면 true */
  cutTape(progress: number): boolean {
    const d = this.state.desk;
    if (!d || d.open) return false;
    const p = Math.min(1, Math.max(d.tape, progress));
    if (p === d.tape) return false;
    d.tape = p;
    if (p >= CONFIG.tapeOpen) {
      d.tape = 1;
      d.open = true;
      for (const it of d.items) if (!this.state.found.includes(it.kind)) this.state.found.push(it.kind);
      this.change(true);
      return true;
    }
    this.change();
    return false;
  }

  // ---- 3. 물건을 경매에 올리기 ----

  canList(): boolean {
    return this.state.lots.length < CONFIG.auction.queue;
  }

  /** 시작가를 정해서 경매 대기열에 올린다 */
  listItem(index: number, ask: number): ListedLot | null {
    const d = this.state.desk;
    if (!d || !d.open || index < 0 || index >= d.items.length || !this.canList()) return null;
    if (!Number.isFinite(ask) || ask < 1) return null;
    const [lot] = d.items.splice(index, 1);
    const listed: ListedLot = { ...lot, ask: Math.floor(ask) };
    this.state.lots.push(listed);
    this.change(true);
    return listed;
  }

  /**
   * 경매: 대기열에서 하나씩 꺼내 진행. 결과는 시작할 때 전부 정해진다.
   * - 시세보다 싸게 부르면 무조건 팔리지만 시세 근처까지만 오른다
   * - 적당히 부르면 부른 값보다 더 오르고, 입찰 전쟁이 날 수 있다
   * - 욕심낼수록 안 팔릴 확률이 커지고, 안 팔리면 떨이(시세의 30~60%)로 넘어간다
   */
  private startAuction(lot: ListedLot): AuctionState {
    const tune = auctionTuning(this.state);
    // 대기열이 쌓이면 경매사가 빨라진다 (물건이 밀리지 않게)
    const speed = tune.speed * auctionRush(this.state.lots.length);
    const r = lot.ask / lot.value;
    const pSell = r <= 1 ? 1 : Math.max(0.03, Math.min(1, 1 - (r - 1) * 0.9 + tune.greed));
    // 필드 순서는 세이브 검사 결과와 같게 (껐다 켜도 세이브가 한 글자도 안 바뀌게)
    const make = (dumped: boolean, bids: number[], times: number[], end: number, war: boolean): AuctionState => ({
      kind: lot.kind,
      value: lot.value,
      ask: lot.ask,
      dumped,
      bids,
      times,
      end,
      elapsed: 0,
      war,
    });

    if (this.rng() >= pSell) {
      // 아무도 안 삼 → 한참 뒤 떨이 손님 한 명
      const lowball = Math.max(1, Math.round(lot.value * (0.3 + this.rng() * 0.3)));
      const at = 2.6 / speed;
      return make(true, [lowball], [at], at + 1.1 / speed, false);
    }

    let final = r < 1 ? Math.max(lot.ask, lot.value * (0.85 + this.rng() * 0.3)) : lot.ask * (1 + this.rng() * 0.25);
    let war = false;
    if (r >= 0.9 && r <= 1.4 && this.rng() < tune.war) {
      war = true;
      final *= 1.5 + this.rng();
    }
    final = Math.max(lot.ask, Math.round(final * auctionMult(this.state)));
    const count = 2 + Math.floor(this.rng() * 4) + (war ? 4 : 0);
    // 첫 입찰은 시작가, 그 뒤로 낙찰가까지 계속 오른다 (매번 최소 1원씩은 오름)
    const bids: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 1 : i / (count - 1);
      const ideal = i === count - 1 ? final : lot.ask * Math.pow(final / lot.ask, t) * (0.95 + this.rng() * 0.1);
      bids.push(Math.max(Math.round(ideal), (bids[i - 1] ?? 0) + 1));
    }
    const times: number[] = [];
    let at = 0.4 / speed;
    for (let i = 0; i < count; i++) {
      at += (0.4 + this.rng() * 0.5) / speed;
      times.push(at);
    }
    return make(false, bids, times, at + 1.1 / speed, war);
  }

  /** 지금까지 나온 가장 높은 입찰가 (아직 없으면 0) */
  currentBid(): number {
    const a = this.state.auction;
    if (!a) return 0;
    let bid = 0;
    a.times.forEach((t, i) => {
      if (a.elapsed >= t) bid = a.bids[i];
    });
    return bid;
  }

  private updateAuction(dt: number): GameEvent[] {
    const s = this.state;
    const events: GameEvent[] = [];
    if (!s.auction && s.lots.length) {
      s.auction = this.startAuction(s.lots.shift()!);
      this.change(true);
      events.push({ type: 'auctionStart', kind: s.auction.kind });
    }
    const a = s.auction;
    if (!a || dt <= 0) return events;
    const before = a.elapsed;
    a.elapsed = Math.min(a.end, a.elapsed + dt);
    this.change();
    a.times.forEach((t, i) => {
      if (before < t && a.elapsed >= t) events.push({ type: 'bid', index: i, price: a.bids[i] });
    });
    if (a.elapsed >= a.end) {
      // 낙찰: 돈 지급과 경매 종료는 같이 일어난다
      const price = a.bids[a.bids.length - 1];
      s.auction = null;
      this.earn(price);
      s.sales.unshift({ kind: a.kind, price, value: a.value, ask: a.ask });
      s.sales.length = Math.min(s.sales.length, CONFIG.auction.history);
      s.stats.sold += 1;
      s.stats.bestSale = Math.max(s.stats.bestSale, price);
      const rec = s.collection[a.kind] ?? { sold: 0, best: 0 };
      s.collection[a.kind] = { sold: rec.sold + 1, best: Math.max(rec.best, price) };
      this.change(true);
      events.push({ type: 'sold', kind: a.kind, price, value: a.value, ask: a.ask, war: a.war, dumped: a.dumped });
    }
    return events;
  }

  // ---- 4. 뽁뽁이 꺼내서 매트에 펼치기 ----

  canMoveWrap(): boolean {
    const d = this.state.desk;
    return !!d && d.open && !!d.wrap && !this.state.mat;
  }

  moveWrapToMat(): boolean {
    if (!this.canMoveWrap()) return false;
    const d = this.state.desk!;
    this.state.mat = d.wrap;
    d.wrap = null;
    this.combo = 0;
    this.queue = [];
    this.lastHit.clear();
    this.change(true);
    return true;
  }

  // ---- 5. 터뜨리기 ----

  get comboMult(): number {
    const c = CONFIG.combo;
    return Math.min(comboMax(this.state), 1 + Math.floor(Math.max(0, this.combo - 1) / c.every) * c.step);
  }

  comboAlive(now: number): boolean {
    return this.combo > 1 && now - this.lastPopAt <= comboWindow(this.state);
  }

  get pendingChains(): number {
    return this.queue.length;
  }

  /**
   * 도구로 문지르기: 단단함을 힘만큼 깎고, 0이 되면 터진다.
   * 같은 칸은 잠깐 쉬어야 다시 깎이므로, 단단한 뽁뽁이는 여러 번 문질러야 한다.
   */
  hit(index: number, power: number, now: number, auto = false): GameEvent[] {
    const s = this.state.mat;
    if (!s || s.cleared || index < 0 || index >= s.popped.length || s.popped[index]) return [];
    if (now - (this.lastHit.get(index) ?? -Infinity) < CONFIG.hitCooldown) return [];
    this.lastHit.set(index, now);
    s.hp[index] = Math.max(0, s.hp[index] - power);
    if (s.hp[index] > 0) {
      this.change();
      return [{ type: 'hit', index, left: s.hp[index], power }];
    }
    return this.pop(index, now, false, auto);
  }

  /** 바로 터뜨린다 (연쇄 폭발은 단단함 무시). 기계가 터뜨린 건 콤보에 안 들어간다 */
  pop(index: number, now: number, chained = false, auto = false): GameEvent[] {
    const s = this.state.mat;
    if (!s || s.cleared || index < 0 || index >= s.popped.length || s.popped[index]) return [];

    const kind = s.cells[index] as PoppableKind;
    s.popped[index] = 1;
    s.hp[index] = 0;
    this.state.stats.popped += 1;
    if (!auto) {
      this.combo = now - this.lastPopAt <= comboWindow(this.state) ? this.combo + 1 : 1;
      this.lastPopAt = now;
    }
    if (kind === 'm') s.mult = Math.min(CONFIG.multMax, s.mult * CONFIG.multFactor);

    const gain = Math.round(WRAPS[s.grade].value * CONFIG.value[kind] * s.mult * (auto ? 1 : this.comboMult) * popMult(this.state));
    this.earn(gain);
    s.earned += gain;
    this.change();

    const events: GameEvent[] = [{ type: 'pop', index, kind, gain, combo: this.combo, chained, auto }];
    if (kind === 'b') {
      neighbors(s, index, 1).forEach((n, i) => {
        if (!s.popped[n]) this.queue.push({ index: n, at: now + CONFIG.bomb.delay * (i + 1), auto });
      });
    } else if (kind === 's') {
      // 줄무늬: 같은 가로줄 전체가 가까운 순서로 다다닥
      const row = Math.floor(index / s.cols) * s.cols;
      const col = index % s.cols;
      for (let c = 0; c < s.cols; c++) {
        if (c !== col && !s.popped[row + c]) this.queue.push({ index: row + c, at: now + CONFIG.stripe.delay * Math.abs(c - col), auto });
      }
    }
    if (isSheetDone(s)) {
      // 완벽주의 보너스: 다 터뜨린 순간 한 번만 (연구 전에는 0)
      s.cleared = true;
      s.bonus = Math.round(s.earned * perfectRate(this.state));
      this.earn(s.bonus);
      this.state.stats.sheets += 1;
      this.queue = [];
      this.change(true);
      events.push({ type: 'clear', bonus: s.bonus });
    }
    return events;
  }

  /** 연쇄 폭발과 경매를 진행한다. */
  update(now: number, dt: number): GameEvent[] {
    this.state.stats.playTime += dt;
    const events: GameEvent[] = [];
    for (;;) {
      let next = -1;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].at <= now && (next < 0 || this.queue[i].at < this.queue[next].at)) next = i;
      }
      if (next < 0) break;
      const [item] = this.queue.splice(next, 1);
      events.push(...this.pop(item.index, item.at, true, item.auto));
    }
    events.push(...this.regenerate(now));
    events.push(...this.updateAuction(dt));
    events.push(...this.updateAutomation(now, dt));
    events.push(...this.updateCat(now, dt));
    return events;
  }

  /** 말랑한 재질(두꺼운, 대왕 버블)은 안 건드리면 조금씩 다시 부풀어 오른다 */
  private regenerate(now: number): GameEvent[] {
    const m = this.state.mat;
    if (!m || m.cleared || !WRAPS[m.grade].elastic) return [];
    const max = WRAPS[m.grade].hp;
    const { delay, interval } = CONFIG.regen;
    const ev: GameEvent[] = [];
    for (let i = 0; i < m.hp.length; i++) {
      if (m.popped[i] || m.hp[i] >= max) continue;
      const last = this.lastHit.get(i);
      if (last === undefined) {
        // 껐다 켠 직후 등: 지금부터 셈
        this.lastHit.set(i, now);
        continue;
      }
      if (now - last >= delay + interval) {
        m.hp[i] += 1;
        this.lastHit.set(i, last + interval);
        this.change();
        ev.push({ type: 'regen', index: i, left: m.hp[i] });
      }
    }
    return ev;
  }

  // ---- 자동화 ----

  private updateAutomation(now: number, dt: number): GameEvent[] {
    const s = this.state;
    const ev: GameEvent[] = [];
    if (dt <= 0) return ev;
    const d = s.desk;
    this.deskAge = d ? this.deskAge + dt : 0;

    // 자동 커터: 상자가 자리 잡으면 테이프를 위에서부터 뜯는다.
    // 최고 레벨(뜯는 시간 0)은 책상에 닿자마자 한 번에 연다
    const cut = autoLevel(s, 'cutter');
    const cutTime = AUTO_SPEC.cutTime[cut];
    if (cut && d && !d.open) {
      if (cutTime === 0) {
        if (this.deskAge >= AUTO_SPEC.landTime && this.cutTape(1)) ev.push({ type: 'autoOpened' });
      } else if (this.deskAge > 0.6 && this.cutTape(d.tape + dt / cutTime)) {
        ev.push({ type: 'autoOpened' });
      }
    }

    // 정리 로봇팔: 레벨에 맞는 희귀도의 물건만 시세대로 경매에 올리고, 그다음 뽁뽁이를 펼친다
    const arm = autoLevel(s, 'arm');
    if (arm && d?.open) {
      this.armTimer += dt;
      if (this.armTimer >= AUTO_SPEC.armInterval[arm]) {
        const i = d.items.findIndex((it) => AUTO_SPEC.armRarities[arm].includes(itemDef(it.kind).rarity));
        if (i >= 0 && this.canList()) {
          const lot = d.items[i];
          this.listItem(i, Math.round((lot.lo + lot.hi) / 2));
          ev.push({ type: 'autoList', index: i, kind: lot.kind });
          this.armTimer = 0;
        } else if (this.canMoveWrap()) {
          this.moveWrapToMat();
          ev.push({ type: 'autoWrap' });
          this.armTimer = 0;
        }
      }
    } else {
      this.armTimer = 0;
    }

    // 자동 프레스: 3x3을 내리찍는다. 황금은 황금 프레스(최고 레벨)부터
    const press = autoLevel(s, 'press');
    const m = s.mat;
    if (press && m && !m.cleared) {
      this.pressAcc = Math.min(this.pressAcc + dt * AUTO_SPEC.pressRate[press], 3);
      while (this.pressAcc >= 1 && !m.cleared) {
        const goldOk = press >= AUTO_SPEC.pressGoldLevel;
        const targets = m.popped.flatMap((p, i) => (!p && (goldOk || m.cells[i] !== 'g') ? [i] : []));
        if (!targets.length) {
          this.pressAcc = 0;
          break;
        }
        this.pressAcc -= 1;
        const c = targets[Math.floor(this.rng() * targets.length)];
        ev.push({ type: 'press', index: c });
        for (const i of [c, ...neighbors(m, c, 1)]) {
          if (goldOk || m.cells[i] !== 'g') ev.push(...this.hit(i, AUTO_SPEC.pressPower[press], now, true));
        }
      }
    } else {
      this.pressAcc = 0;
    }

    // 컨베이어: 다 쓴 것 치우고 다음 택배 주문
    if (autoLevel(s, 'conveyor')) {
      if (s.mat?.cleared) {
        this.idle += dt;
        if (this.idle > 0.6 && this.trashSheet()) {
          ev.push({ type: 'autoTrash', what: 'sheet', tier: 0 });
          this.idle = 0;
        }
      } else if (this.canTrashBox()) {
        const tier = s.desk!.tier;
        this.trashBox();
        ev.push({ type: 'autoTrash', what: 'box', tier });
      } else if (!s.desk) {
        this.idle += dt;
        if (this.idle > 0.8 && this.order()) {
          ev.push({ type: 'autoOrder' });
          this.idle = 0;
        }
      } else {
        this.idle = 0;
      }
    }
    return ev;
  }

  /** 고양이: 30초쯤마다 매트 위 한 줄을 걸어가며 밟는다 (황금은 안 밟음) */
  private updateCat(now: number, dt: number): GameEvent[] {
    const s = this.state;
    const m = s.mat;
    const ev: GameEvent[] = [];
    if (!s.decor.cat || !m || m.cleared) {
      this.catWalk = null;
      return ev;
    }
    if (!this.catWalk) {
      this.catTimer += dt;
      if (this.catTimer < 30) return ev;
      this.catTimer = 0;
      const rows = Array.from({ length: m.rows }, (_, r) => r).filter((r) =>
        Array.from({ length: m.cols }, (_, c) => r * m.cols + c).some((i) => !m.popped[i] && m.cells[i] !== 'g'),
      );
      if (!rows.length) return ev;
      this.catWalk = { row: rows[Math.floor(this.rng() * rows.length)], start: now, dir: this.rng() < 0.5 ? 1 : -1 };
      ev.push({ type: 'cat' });
    }
    const w = this.catWalk;
    const step = (now - w.start) * CAT_SPEED;
    for (let k = 0; k < m.cols && k <= step; k++) {
      const c: number = w.dir === 1 ? k : m.cols - 1 - k;
      const i: number = w.row * m.cols + c;
      if (!m.popped[i] && m.cells[i] !== 'g') ev.push(...this.pop(i, now, false, true));
    }
    if (step >= m.cols + 1) this.catWalk = null;
    return ev;
  }

  canBuyAuto(id: AutoId): boolean {
    return autoCost(this.state, id) <= this.state.money;
  }

  buyAuto(id: AutoId): boolean {
    if (!this.canBuyAuto(id)) return false;
    this.state.money -= autoCost(this.state, id);
    this.state.auto[id] += 1;
    this.change(true);
    return true;
  }

  toggleAuto(id: AutoId) {
    this.state.autoOn[id] = !this.state.autoOn[id];
    this.change(true);
  }

  // ---- 6. 쓰레기통 (치우기만, 돈은 없음) ----

  trashSheet(): boolean {
    if (!this.state.mat?.cleared) return false;
    this.state.mat = null;
    this.change(true);
    return true;
  }

  canTrashBox(): boolean {
    const d = this.state.desk;
    return !!d && d.open && d.items.length === 0 && !d.wrap;
  }

  trashBox(): boolean {
    if (!this.canTrashBox()) return false;
    this.state.desk = null;
    this.change(true);
    return true;
  }

  // ---- 상점 (노트북) ----

  canBuy(ladder: Ladder): boolean {
    return nextCost(this.state, ladder) <= this.state.money;
  }

  buy(ladder: Ladder): boolean {
    if (!this.canBuy(ladder)) return false;
    this.state.money -= nextCost(this.state, ladder);
    this.state[ladder] += 1;
    this.change(true);
    return true;
  }

  canBuyDecor(id: DecorId): boolean {
    return !this.state.decor[id] && DECOR.find((d) => d.id === id)!.cost <= this.state.money;
  }

  buyDecor(id: DecorId): boolean {
    if (!this.canBuyDecor(id)) return false;
    this.state.money -= DECOR.find((d) => d.id === id)!.cost;
    this.state.decor[id] = true;
    this.change(true);
    return true;
  }

  canBuyGoal(): boolean {
    return !this.state.finale && !this.state.ended && this.state.money >= GOAL.cost;
  }

  /** 최종 상품: 책상을 덮는 초대형 뽁뽁이가 배달된다 */
  buyGoal(): boolean {
    if (!this.canBuyGoal()) return false;
    const s = this.state;
    s.money -= GOAL.cost;
    const n = FINALE.cols * FINALE.rows;
    const sheet: SheetState = {
      id: s.nextId,
      grade: FINALE.grade,
      cols: FINALE.cols,
      rows: FINALE.rows,
      cells: Array.from({ length: n }, () => 'n'),
      popped: Array.from({ length: n }, () => 0),
      hp: Array.from({ length: n }, () => WRAPS[FINALE.grade].hp),
      mult: 1,
      earned: 0,
      cleared: false,
      bonus: 0,
    };
    s.finale = sheet;
    s.nextId += 1;
    this.finaleHits.clear();
    this.change(true);
    return true;
  }

  /** 초대형 뽁뽁이 문지르기. 다 터지면 엔딩 */
  hitFinale(index: number, power: number, now: number): GameEvent[] {
    const f = this.state.finale;
    if (!f || index < 0 || index >= f.popped.length || f.popped[index]) return [];
    if (now - (this.finaleHits.get(index) ?? -Infinity) < CONFIG.hitCooldown) return [];
    this.finaleHits.set(index, now);
    // 마지막 뽁뽁이는 어떤 도구로도 여러 번 문질러야 터진다 (엔딩을 오래 즐기게)
    f.hp[index] = Math.max(0, f.hp[index] - Math.max(1, Math.round(power / 4)));
    const left = f.popped.filter((p) => !p).length;
    if (f.hp[index] > 0) {
      this.change();
      return [{ type: 'finaleHit', index, left: f.hp[index] }];
    }
    f.popped[index] = 1;
    this.state.stats.popped += 1;
    this.change();
    const ev: GameEvent[] = [{ type: 'finalePop', index, left: left - 1 }];
    if (left - 1 === 0) {
      this.state.finale = null;
      this.state.ended = true;
      this.state.endingSeen = false;
      this.change(true);
      ev.push({ type: 'ending' });
    }
    return ev;
  }

  seeEnding() {
    if (!this.state.ended || this.state.endingSeen) return;
    this.state.endingSeen = true;
    this.change(true);
  }

  canResearch(id: ResearchId): boolean {
    return researchCost(this.state, id) <= this.state.money;
  }

  research(id: ResearchId): boolean {
    if (!this.canResearch(id)) return false;
    this.state.money -= researchCost(this.state, id);
    this.state.research[id] += 1;
    this.change(true);
    return true;
  }
}
