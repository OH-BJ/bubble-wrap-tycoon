import { CAT_SPEED, type Game, type GameEvent } from '../core/game';
import { AUTO_SPEC, AUTOMATIONS, BOXES, DECOR, FINALE, RARITY_NAME, RESEARCH, TOOLS, WRAPS, type Ladder, type WrapStyle } from '../economy/catalog';
import type { Sfx } from '../fx/audio';
import type { Juice } from '../fx/juice';
import type { Particles } from '../fx/particles';
import { formatShort, formatWon } from '../ui/format';
import { drawAuctionHouse } from './auction';
import { autoSlot, drawArm, drawConveyor, drawCutterBot, drawPressBlock, drawToggles, ownedAutos } from './machines';
import { drawConfettiRain, drawDecor, drawFinale, drawWalkingCat, finaleLayout } from './extras';
import { drawSheet, drawWrapBundle, KIND_COLOR } from './bubbles';
import {
  drawBell,
  drawBook,
  drawBox,
  drawDesk,
  drawHud,
  drawItem,
  drawLaptop,
  drawMat,
  drawRoom,
  drawTools,
  drawToolCursor,
  drawTrash,
  emoji,
  hint,
  itemDef,
  label,
  type BoxView,
} from './draw';
import { cellCenter, center, inRect, itemSlot, queueSlot, sheetLayout, TAPE, VW, WRAP_BUNDLE, ZONES, type SheetLayout } from './layout';

const TAPE_SEGMENTS = 24;
const DROP_TIME = AUTO_SPEC.landTime;

type Mode = 'none' | 'tape' | 'pop' | 'item' | 'wrap' | 'finale';

interface Flyer {
  kind: 'sheet' | 'box' | 'item';
  /** item 일 때: 물건 종류와 도착 지점 */
  item?: string;
  tx?: number;
  ty?: number;
  x: number;
  y: number;
  t0: number;
  tier: number;
}

export interface SceneHooks {
  openShop(): void;
  openBook(): void;
  /** 초대형 뽁뽁이를 다 터뜨렸을 때 엔딩 화면 */
  ending(): void;
  /** 물건을 경매장에 놓았을 때: 시작가 정하기 창 */
  price(index: number): void;
  persist(force?: boolean): void;
}

export class DeskScene {
  time = 0;
  cursor = 'default';
  private mode: Mode = 'none';
  private px = -999;
  private py = -999;
  private lastX = 0;
  private lastY = 0;
  private dragIndex = -1;

  // 연출용 (저장 안 함)
  private viewBoxId = -1;
  private dropAt = -99;
  private openAt = -99;
  private tapeCuts: boolean[] = [];
  private viewMatId = -1;
  private popAt = new Float64Array(0);
  /** 이번 상자에서 처음 보는 물건 (도감 NEW 안내용) */
  private deskUnseen: string[] = [];
  private presses: { index: number; t: number }[] = [];
  private armAt = -99;
  // 엔딩 연출
  private viewFinaleId = -1;
  private finalePopAt = new Float64Array(0);
  private finaleHitAt = new Float64Array(0);
  private finaleAt = -99;
  private endingAt = -99;
  private endingShown = true;
  private hitAt = new Float64Array(0);
  /** 이번 시트에서 안 터지고 찌그러지기만 한 횟수 (도구 업그레이드 안내용) */
  private toughStrain = 0;
  private unfoldAt = -99;
  private bellAt = -99;
  private trashAt = -99;
  private shownBid = 0;
  private bidder = 0;
  private bidAt = -99;
  private sold: { kind: string; price: number; value: number; ask: number; war: boolean; dumped: boolean } | null = null;
  private soldAt = -99;
  private landed = true;
  private flyers: Flyer[] = [];
  private toastText = '';
  private toastAt = -99;
  private shownMoney: number;
  private bump = 0;

  constructor(
    private game: Game,
    private fx: Particles,
    private juice: Juice,
    private sfx: Sfx,
    private hooks: SceneHooks,
  ) {
    this.shownMoney = game.state.money;
    this.syncViews(true);
  }

  private get s() {
    return this.game.state;
  }

  /** 상자/시트가 바뀌었으면 연출 상태를 맞춘다. 불러온 직후에는 애니메이션 없이 */
  private syncViews(initial = false) {
    const desk = this.s.desk;
    if ((desk?.id ?? -1) !== this.viewBoxId) {
      this.viewBoxId = desk?.id ?? -1;
      if (initial) {
        this.dropAt = this.openAt = -99;
      }
      const cut = Math.round((desk?.tape ?? 0) * TAPE_SEGMENTS);
      this.tapeCuts = Array.from({ length: TAPE_SEGMENTS }, (_, k) => k < cut);
      this.deskUnseen = (desk?.items ?? []).map((it) => it.kind).filter((k) => !this.s.found.includes(k));
    }
    const fin = this.s.finale;
    if ((fin?.id ?? -1) !== this.viewFinaleId) {
      this.viewFinaleId = fin?.id ?? -1;
      this.finalePopAt = new Float64Array(fin?.cells.length ?? 0).fill(-1);
      this.finaleHitAt = new Float64Array(fin?.cells.length ?? 0).fill(-99);
    }
    const mat = this.s.mat;
    if ((mat?.id ?? -1) !== this.viewMatId) {
      this.viewMatId = mat?.id ?? -1;
      this.popAt = new Float64Array(mat?.cells.length ?? 0).fill(-1);
      this.hitAt = new Float64Array(mat?.cells.length ?? 0).fill(-99);
      this.toughStrain = 0;
      if (initial) this.unfoldAt = -99;
    }
  }

  toast(text: string) {
    this.toastText = text;
    this.toastAt = this.time;
  }

  private gainFx(x: number, y: number, amount: number, color = '#ffe27a', size = 26) {
    this.fx.text(x, y, '+' + formatWon(amount), color, size);
    this.fx.burst(x, y, 10, '#ffd23f', 380, 6, true);
    this.bump = 1;
  }

  // ---- 갱신 ----

  update(dt: number, realDt: number) {
    this.time += dt;
    this.handle(this.game.update(this.time, dt));
    this.syncViews();

    // 상자가 책상에 닿는 순간
    if (!this.landed && this.time - this.dropAt >= DROP_TIME) {
      this.landed = true;
      this.sfx.thud();
      this.juice.shake(9);
      this.juice.vibrate(30, true);
      const z = ZONES.box;
      for (let k = 0; k < 4; k++) this.fx.burst(z.x + (k % 2) * z.w, z.y + Math.floor(k / 2) * z.h, 8, 'rgba(220,200,170,0.8)', 200, 7);
    }

    // 쓰레기통으로 날아가는 것들
    this.flyers = this.flyers.filter((f) => {
      if (this.time - f.t0 < 0.45) return true;
      if (f.kind === 'item') {
        this.fx.burst(f.tx!, f.ty!, 8, '#ffe27a', 220, 5, true);
        return false;
      }
      const [tx, ty] = center(ZONES.trash);
      this.trashAt = this.time;
      this.sfx.thud();
      this.juice.shake(4);
      this.fx.burst(tx, ty - 20, 12, '#cfd8e0', 300, 6);
      return false;
    });

    // 자동 커터가 뜯은 만큼 테이프 조각도 뜯긴 모양으로
    const desk = this.s.desk;
    if (desk && !desk.open) {
      const want = Math.floor(desk.tape * TAPE_SEGMENTS);
      const segH = TAPE.h / TAPE_SEGMENTS;
      for (let k = 0; k < want; k++) {
        if (this.tapeCuts[k]) continue;
        this.tapeCuts[k] = true;
        this.fx.burst(TAPE.x + TAPE.w / 2, TAPE.y + k * segH, 2, BOXES[desk.tier].tape, 160, 5);
        this.sfx.rip();
      }
    }
    this.presses = this.presses.filter((p) => this.time - p.t < 0.3);
    if (!this.endingShown && this.time - this.endingAt > 2.8) {
      this.endingShown = true;
      this.hooks.ending();
    }

    // 입찰가 숫자가 휘리릭 따라 올라감
    const bid = this.game.currentBid();
    if (bid < this.shownBid || !this.s.auction) this.shownBid = bid;
    else this.shownBid += (bid - this.shownBid) * Math.min(1, realDt * 12);

    // 돈 숫자가 휘리릭 올라가는 연출
    const money = this.s.money;
    if (money < this.shownMoney) this.shownMoney = money;
    this.shownMoney += (money - this.shownMoney) * Math.min(1, realDt * 10);
    if (Math.abs(money - this.shownMoney) < 0.5) this.shownMoney = money;
    this.bump = Math.max(0, this.bump - realDt * 6);
  }

  private handle(events: GameEvent[]) {
    for (const e of events) {
      if (e.type === 'cat') {
        this.sfx.meow();
        continue;
      }
      if (e.type === 'finaleHit' || e.type === 'finalePop' || e.type === 'ending') {
        this.onFinale(e);
        continue;
      }
      // ---- 자동화가 한 일 ----
      if (e.type === 'autoOrder') {
        this.onOrdered();
        continue;
      }
      if (e.type === 'autoOpened') {
        if (AUTO_SPEC.cutTime[this.s.auto.cutter] === 0) {
          // 즉시 개봉: 테이프를 한 번에 싹둑
          for (let k = 0; k <= 10; k++) {
            this.fx.emit(TAPE.x + TAPE.w / 2, TAPE.y + (TAPE.h * k) / 10, 2, { color: '#ffffff', speed: 240, size: 5, shape: 'spark', gravity: 0, life: [0.15, 0.3] });
          }
          this.sfx.rip();
        }
        this.onOpened(this.deskUnseen);
        continue;
      }
      if (e.type === 'autoList') {
        const [x, y] = itemSlot(e.index);
        const [tx, ty] = queueSlot(Math.max(0, this.s.lots.length - 1));
        this.flyers.push({ kind: 'item', item: e.kind, x, y, tx, ty, t0: this.time, tier: 0 });
        this.armAt = this.time;
        this.sfx.pickup();
        continue;
      }
      if (e.type === 'autoWrap') {
        this.syncViews();
        this.unfoldAt = this.time;
        this.armAt = this.time;
        this.sfx.rustle();
        continue;
      }
      if (e.type === 'autoTrash') {
        const [x, y] = center(e.what === 'sheet' ? ZONES.mat : ZONES.box);
        this.flyers.push({ kind: e.what, x, y, t0: this.time, tier: e.tier });
        this.sfx.whoosh();
        continue;
      }
      if (e.type === 'press') {
        this.presses.push({ index: e.index, t: this.time });
        this.sfx.press();
        this.juice.shake(2.5);
        continue;
      }
      if (e.type === 'auctionStart') {
        this.sfx.click();
        this.sold = null;
        continue;
      }
      if (e.type === 'bid') {
        this.bidder = Math.floor(Math.random() * 5);
        this.bidAt = this.time;
        this.sfx.bid(e.index);
        continue;
      }
      if (e.type === 'sold') {
        this.onSold(e);
        continue;
      }
      const mat = this.s.mat!;
      const L = sheetLayout(mat.cols, mat.rows);
      if (e.type === 'clear') {
        this.sfx.clear();
        this.juice.shake(10);
        this.juice.flash('#ffffff', 0.25);
        this.juice.vibrate([30, 40, 60], true);
        const colors = ['#ffd23f', '#7fd1ff', '#ff7ab6', '#9dff8a'];
        for (let k = 0; k < 16; k++) {
          const [x, y] = cellCenter(L, Math.floor((k / 16) * mat.cells.length));
          this.fx.burst(x, y, 4, colors[k % 4], 500, 7, true);
        }
        if (e.bonus > 0) {
          const [cx, cy] = center(ZONES.mat);
          this.gainFx(cx, cy - 40, e.bonus, '#ffe27a', 34);
          this.toast(`💯 완벽! 보너스 +${formatWon(e.bonus)}`);
        } else {
          this.toast('다 터뜨렸다! 시트를 클릭해서 치우기');
        }
        continue;
      }
      const [x, y] = cellCenter(L, e.index);
      const c = L.cell;
      const style = WRAPS[mat.grade].id;
      if (e.type === 'regen') {
        // 말랑한 뽁뽁이가 다시 부풀어 오름
        this.fx.pulse(x, y, 'ring', 'rgba(255,255,255,0.5)', c * 0.35, 0.35);
        this.sfx.inflate();
        continue;
      }
      if (e.type === 'hit') {
        // 단단해서 아직 안 터짐: 재질별 소리와 부스러기
        this.hitAt[e.index] = this.time;
        const health = e.left / WRAPS[mat.grade].hp;
        this.sfx.squish(style, health);
        this.hitFx(style, x, y, c, health);
        this.toughStrain++;
        if (this.toughStrain === 40 && this.s.tool < TOOLS.length - 1) {
          this.toast(`💪 단단하다! 노트북에서 더 좋은 도구를 사면 한 번에 터져요`);
        }
        continue;
      }
      this.popAt[e.index] = this.time;
      let size = 18;
      switch (e.kind) {
        case 'g':
          this.sfx.pop(e.combo, style);
          this.sfx.gold();
          this.fx.burst(x, y, 16, KIND_COLOR.g, 420, c * 0.1);
          this.fx.burst(x, y, 22, '#ffffff', 520, c * 0.07, true);
          this.juice.flash('#ffd23f', 0.22);
          this.juice.shake(6);
          this.juice.freeze(0.05);
          this.juice.vibrate([15, 30, 25], true);
          size = 34;
          break;
        case 'b':
          this.sfx.bomb();
          this.fx.burst(x, y, 20, KIND_COLOR.b, 480, c * 0.1);
          this.fx.burst(x, y, 10, '#ffd27a', 600, c * 0.06, true);
          this.juice.flash('#ff6a4d', 0.14);
          this.juice.shake(10);
          this.juice.freeze(0.04);
          this.juice.vibrate(35, true);
          size = 22;
          break;
        case 'm':
          this.sfx.pop(e.combo, style);
          this.sfx.multi();
          this.fx.burst(x, y, 14, KIND_COLOR.m, 380, c * 0.09);
          this.juice.flash('#c79bff', 0.18);
          this.fx.text(x, y - c * 0.7, `수익 x${mat.mult}!`, KIND_COLOR.m, 26);
          break;
        case 's':
          this.sfx.pop(e.combo, style);
          this.sfx.whoosh();
          this.fx.burst(x, y, 16, KIND_COLOR.s, 500, c * 0.08, true);
          this.juice.shake(5);
          size = 22;
          break;
        default:
          this.sfx.pop(e.combo, style);
          this.popFx(style, x, y, c, e.chained || e.auto);
          if (e.combo >= 30) this.juice.shake(1.5);
      }
      // 기계가 터뜨린 일반 뽁뽁이는 숫자를 안 띄움 (화면이 숫자로 덮이지 않게)
      if (!e.auto || e.kind !== 'n') this.fx.text(x, y - c * 0.3, '+' + formatShort(e.gain), KIND_COLOR[e.kind], e.auto ? size * 0.8 : size);
      this.bump = Math.max(this.bump, 0.5);
    }
    if (this.game.critical) this.hooks.persist();
  }

  // ---- 입력 ----

  private toggleAt(x: number, y: number): number {
    return ownedAutos(this.s).findIndex((_, k) => inRect(autoSlot(k), x, y));
  }

  pointerDown(x: number, y: number) {
    this.px = this.lastX = x;
    this.py = this.lastY = y;
    if (this.s.finale) {
      // 엔딩 중에는 초대형 뽁뽁이만
      if (inRect(ZONES.desk, x, y)) {
        this.mode = 'finale';
        this.scrapeFinale(x, y, x, y);
      } else if (inRect(ZONES.laptop, x, y)) this.hooks.openShop();
      return;
    }
    if (inRect(ZONES.book, x, y)) {
      this.sfx.click();
      this.hooks.openBook();
      return;
    }
    const toggle = this.toggleAt(x, y);
    if (toggle >= 0) {
      const id = ownedAutos(this.s)[toggle];
      this.game.toggleAuto(id);
      this.sfx.click();
      this.hooks.persist(true);
      return;
    }
    const s = this.s;
    const desk = s.desk;
    const landed = this.time - this.dropAt >= DROP_TIME;

    if (desk && landed) {
      if (!desk.open && inRect(TAPE, x, y, 16)) {
        this.mode = 'tape';
        this.cut(x, y, x, y);
        return;
      }
      if (desk.open) {
        const item = this.itemAt(x, y);
        if (item >= 0) {
          this.mode = 'item';
          this.dragIndex = item;
          this.sfx.pickup();
          return;
        }
        if (desk.wrap && inRect(WRAP_BUNDLE, x, y)) {
          this.mode = 'wrap';
          this.sfx.rustle();
          return;
        }
        if (this.game.canTrashBox() && inRect(ZONES.box, x, y, 40)) {
          this.throwBox();
          return;
        }
      }
    }
    if (s.mat && inRect(ZONES.mat, x, y)) {
      if (s.mat.cleared) {
        this.throwSheet();
        return;
      }
      this.mode = 'pop';
      this.scrape(x, y, x, y);
      return;
    }
    if (inRect(ZONES.bell, x, y)) {
      this.ring();
      return;
    }
    if (inRect(ZONES.laptop, x, y)) {
      this.sfx.click();
      this.hooks.openShop();
    }
  }

  pointerMove(x: number, y: number) {
    this.px = x;
    this.py = y;
    if (this.mode === 'tape') this.cut(this.lastX, this.lastY, x, y);
    // 쓱쓱 장갑이 없으면 클릭할 때만 터지고, 끌어도 안 터진다
    else if (this.mode === 'pop' && this.s.research.rub) this.scrape(this.lastX, this.lastY, x, y);
    else if (this.mode === 'finale' && this.s.research.rub) this.scrapeFinale(this.lastX, this.lastY, x, y);
    this.lastX = x;
    this.lastY = y;
    this.cursor = this.cursorFor(x, y);
  }

  pointerUp(x: number, y: number) {
    if (this.mode === 'item') this.dropItem(x, y);
    else if (this.mode === 'wrap') this.dropWrap(x, y);
    this.mode = 'none';
    this.dragIndex = -1;
    this.cursor = this.cursorFor(x, y);
  }

  pointerLeave() {
    this.px = this.py = -999;
  }

  private itemAt(x: number, y: number): number {
    const desk = this.s.desk;
    if (!desk?.open) return -1;
    for (let i = desk.items.length - 1; i >= 0; i--) {
      const [ix, iy] = itemSlot(i);
      if (Math.hypot(x - ix, y - iy) < 40) return i;
    }
    return -1;
  }

  private cursorFor(x: number, y: number): string {
    if (this.toggleAt(x, y) >= 0) return 'pointer';
    if (this.mode === 'item' || this.mode === 'wrap') return 'grabbing';
    if (this.mode === 'tape' || this.mode === 'pop' || this.mode === 'finale') return 'none';
    if (this.s.finale) return inRect(ZONES.desk, x, y) ? 'none' : 'default';
    if (inRect(ZONES.book, x, y)) return 'pointer';
    const s = this.s;
    const desk = s.desk;
    const landed = this.time - this.dropAt >= DROP_TIME;
    if (desk && landed && !desk.open && inRect(TAPE, x, y, 16)) return 'none';
    if (desk?.open && (this.itemAt(x, y) >= 0 || (desk.wrap && inRect(WRAP_BUNDLE, x, y)))) return 'grab';
    if (this.game.canTrashBox() && inRect(ZONES.box, x, y, 40)) return 'pointer';
    if (s.mat && inRect(ZONES.mat, x, y)) return s.mat.cleared ? 'pointer' : 'none';
    if (inRect(ZONES.bell, x, y) || inRect(ZONES.laptop, x, y)) return 'pointer';
    return 'default';
  }

  // ---- 행동 ----

  private ring() {
    this.bellAt = this.time;
    if (!this.game.order()) {
      this.sfx.click();
      this.juice.shake(3);
      this.toast(this.s.desk?.open ? '책상 위 상자를 먼저 비우고 버려야 해요' : '먼저 책상 위 상자를 열어요');
      return;
    }
    this.onOrdered();
  }

  /** 최종 상품을 샀을 때: 초대형 뽁뽁이 배달 */
  onGoalBought() {
    this.syncViews();
    this.finaleAt = this.time;
    this.sfx.doorbell();
    this.sfx.fanfare();
    this.juice.shake(20);
    this.juice.flash('#ffffff', 0.5);
    this.toast('🌍 세계에서 가장 큰 뽁뽁이가 도착했다! 전부 터뜨려라!');
    this.hooks.persist(true);
  }

  private scrapeFinale(x0: number, y0: number, x1: number, y1: number) {
    const f = this.s.finale;
    if (!f || this.time - this.finaleAt < 0.6) return;
    const L = finaleLayout(f);
    const R = TOOLS[this.s.tool].radius + L.cell * 0.3;
    const power = TOOLS[this.s.tool].power;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const y = y0 + ((y1 - y0) * k) / n;
      for (let i = 0; i < f.cells.length; i++) {
        if (f.popped[i]) continue;
        const [cx, cy] = cellCenter(L, i);
        if (Math.hypot(x - cx, y - cy) <= R) this.handle(this.game.hitFinale(i, power, this.time));
        if (!this.s.finale) return;
      }
    }
  }

  private onFinale(e: Extract<GameEvent, { type: 'finaleHit' | 'finalePop' | 'ending' }>) {
    if (e.type === 'ending') {
      this.endingAt = this.time;
      this.endingShown = false;
      this.sfx.clear();
      this.sfx.fanfare();
      this.juice.flash('#ffffff', 1);
      this.juice.shake(30);
      this.juice.freeze(0.3);
      this.juice.vibrate([100, 50, 200, 50, 300], true);
      this.hooks.persist(true);
      return;
    }
    const f = this.s.finale ?? null;
    const L = finaleLayout(f ?? { cols: FINALE.cols, rows: FINALE.rows } as never);
    const [x, y] = cellCenter(L, e.index);
    if (e.type === 'finaleHit') {
      this.finaleHitAt[e.index] = this.time;
      this.sfx.squish('diamond', e.left / WRAPS[FINALE.grade].hp);
      this.fx.burst(x, y, 4, '#ffffff', 200, 6, true);
      return;
    }
    this.finalePopAt[e.index] = this.time;
    this.sfx.pop(10, 'big');
    this.sfx.pop(20, 'diamond');
    this.juice.shake(10);
    this.juice.flash('#bff4ff', 0.2);
    this.juice.vibrate(40, true);
    const colors = ['#ffd23f', '#7fd1ff', '#ff7ab6', '#9dff8a', '#c79bff'];
    for (const c of colors) this.fx.burst(x, y, 8, c, 600, 8, true);
    this.fx.text(x, y - 30, ['펑!', '뻥!', '팡!', '쾅!'][e.index % 4], '#ffe27a', 40);
  }

  /** 택배 도착 연출 (벨이든 컨베이어든) */
  private onOrdered() {
    this.sfx.doorbell();
    this.dropAt = this.time;
    this.landed = false;
    this.syncViews();
    this.hooks.persist(true);
  }

  private cut(x0: number, y0: number, x1: number, y1: number) {
    const desk = this.s.desk;
    if (!desk || desk.open) return;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6));
    const segH = TAPE.h / TAPE_SEGMENTS;
    let fresh = 0;
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const y = y0 + ((y1 - y0) * k) / n;
      if (!inRect(TAPE, x, y, 16)) continue;
      const seg = Math.floor((y - TAPE.y) / segH);
      if (seg >= 0 && seg < TAPE_SEGMENTS && !this.tapeCuts[seg]) {
        this.tapeCuts[seg] = true;
        fresh++;
        this.fx.burst(TAPE.x + TAPE.w / 2, TAPE.y + seg * segH, 2, BOXES[desk.tier].tape, 160, 5);
      }
    }
    if (!fresh) return;
    this.sfx.rip();
    this.juice.vibrate(6);
    const progress = this.tapeCuts.filter(Boolean).length / TAPE_SEGMENTS;
    if (this.game.cutTape(progress)) this.onOpened(this.deskUnseen);
  }

  private onOpened(unseen: string[]) {
    const desk = this.s.desk!;
    this.mode = 'none';
    this.openAt = this.time;
    this.tapeCuts.fill(true);
    this.sfx.flap();
    this.juice.shake(4);
    const [cx, cy] = center(ZONES.box);
    this.fx.burst(cx, cy, 18, 'rgba(240,225,200,0.9)', 420, 8);
    // 가장 좋은 물건 (흔함 < 고급 < 희귀 < 전설)
    const rank = (k: string) => 'curl'.indexOf(itemDef(k).rarity);
    const best = desk.items.map((it) => itemDef(it.kind).rarity).sort((a, b) => 'curl'.indexOf(b) - 'curl'.indexOf(a))[0];
    if (best === 'r' || best === 'l') {
      this.sfx.gold();
      this.juice.flash(best === 'l' ? '#ffb800' : '#5aa8ff', 0.3);
      this.fx.burst(cx, cy, 40, best === 'l' ? '#ffd23f' : '#9fd0ff', 650, 7, true);
      this.toast(best === 'l' ? '🌟 전설 물건이 들어있다!!' : '✨ 희귀 물건이 들어있다!');
    } else if (unseen.length) {
      const def = itemDef([...unseen].sort((a, b) => rank(b) - rank(a))[0]);
      this.toast(`NEW! 도감 등록: ${def.icon} ${def.name} (${RARITY_NAME[def.rarity]})`);
    }
    this.hooks.persist(true);
  }

  private dropItem(x: number, y: number) {
    if (!inRect(ZONES.auction, x, y, 30)) return;
    if (!this.game.canList()) {
      this.toast('경매 대기열이 꽉 찼어요. 조금만 기다려요');
      return;
    }
    this.sfx.pickup();
    this.hooks.price(this.dragIndex);
  }

  /** 시작가를 정하고 나서 실제로 경매 대기열에 올린다 */
  confirmListing(index: number, ask: number) {
    if (!this.game.listItem(index, ask)) return;
    const [qx, qy] = queueSlot(this.s.lots.length - 1);
    this.sfx.click();
    this.fx.burst(qx, qy, 10, '#ffe27a', 260, 5, true);
    this.hooks.persist(true);
  }

  /** 깎일 때 튀는 부스러기: 재질마다 다르다 */
  private hitFx(style: WrapStyle, x: number, y: number, c: number, health: number) {
    const f = this.fx;
    switch (style) {
      case 'thick':
        f.emit(x, y, 2, { color: 'rgba(90,200,175,0.9)', speed: 110, size: c * 0.05, shape: 'chunk', life: [0.2, 0.35] });
        break;
      case 'ice':
        f.emit(x, y, 4, { color: '#e8fbff', speed: 200, size: c * 0.05, shape: 'tri', life: [0.25, 0.45] });
        if (health < 0.5) f.pulse(x, y, 'mist', 'rgba(220,245,255,0.6)', c * 0.3, 0.4);
        break;
      case 'big':
        f.pulse(x, y, 'ring', 'rgba(250,200,255,0.6)', c * 0.45, 0.25);
        break;
      case 'gold':
        // 불꽃이 튐
        f.emit(x, y, 5, { color: '#ffe066', speed: 380, size: c * 0.04, shape: 'spark', gravity: 600, life: [0.15, 0.3] });
        break;
      case 'rainbow':
        f.emit(x, y, 3, { color: `hsl(${Math.random() * 360},95%,65%)`, speed: 220, size: c * 0.07, shape: 'star', gravity: 200, life: [0.3, 0.5] });
        break;
      case 'diamond':
        f.emit(x, y, 3, { color: '#ffffff', speed: 260, size: c * 0.04, shape: 'spark', gravity: 0, life: [0.15, 0.3] });
        f.emit(x, y, 2, { color: 'rgba(190,240,255,0.9)', speed: 180, size: c * 0.06, shape: 'tri', life: [0.25, 0.4] });
        break;
      default:
        f.burst(x, y, 2, 'rgba(255,255,255,0.7)', 120, c * 0.05);
    }
  }

  /** 뽁뽁이 등급마다 터지는 모습이 다르다 */
  private popFx(style: WrapStyle, x: number, y: number, c: number, chained: boolean) {
    const f = this.fx;
    switch (style) {
      case 'thin':
        // 하늘하늘 떨어지는 얇은 비닐 조각
        f.emit(x, y, 5, { color: 'rgba(235,247,255,0.9)', speed: 160, size: c * 0.1, shape: 'flake', gravity: 120, drag: 3, life: [0.6, 1] });
        if (!chained) this.juice.vibrate(6);
        break;
      case 'parcel':
        // 공기가 훅 빠지는 링 + 조각
        f.pulse(x, y, 'ring', 'rgba(255,255,255,0.75)', c * 0.4, 0.25);
        f.emit(x, y, 5, { color: '#dcefff', speed: 260, size: c * 0.08, shape: 'flake', gravity: 300, life: [0.4, 0.7] });
        if (!chained) this.juice.vibrate(8);
        break;
      case 'thick':
        // 묵직한 고무 덩어리
        f.emit(x, y, 6, { color: 'rgba(80,190,165,0.95)', speed: 260, size: c * 0.07, shape: 'chunk', gravity: 1300, life: [0.35, 0.55] });
        f.pulse(x, y, 'ring', 'rgba(160,240,220,0.6)', c * 0.35, 0.2);
        if (!chained) this.juice.vibrate(14);
        break;
      case 'ice':
        // 얼음 파편 + 냉기 안개
        f.emit(x, y, 9, { color: '#e8fbff', speed: 420, size: c * 0.07, shape: 'tri', gravity: 1000, life: [0.35, 0.6] });
        f.pulse(x, y, 'mist', 'rgba(220,245,255,0.7)', c * 0.55, 0.6);
        if (!chained) this.juice.vibrate(12);
        break;
      case 'big':
        // 충격파 + 큰 비닐 조각 + 흔들림
        f.pulse(x, y, 'ring', 'rgba(250,200,255,0.9)', c * 0.7, 0.35);
        f.pulse(x, y, 'ring', 'rgba(255,255,255,0.6)', c * 0.45, 0.25);
        f.emit(x, y, 10, { color: 'rgba(250,215,255,0.9)', speed: 460, size: c * 0.12, shape: 'flake', gravity: 500, life: [0.5, 0.9] });
        this.juice.shake(4);
        if (!chained) this.juice.vibrate(22, true);
        break;
      case 'gold':
        // 동전이 쏟아짐
        f.emit(x, y, 6, { color: '#ffd23f', speed: 360, size: c * 0.09, shape: 'coin', gravity: 1400, lift: 0.9, life: [0.5, 0.8] });
        f.emit(x, y, 6, { color: '#fff6c4', speed: 380, size: c * 0.05, shape: 'spark', life: [0.2, 0.4] });
        if (!chained) this.juice.vibrate(10);
        break;
      case 'rainbow':
        // 무지개 별
        for (let k = 0; k < 6; k++) {
          f.emit(x, y, 1, { color: `hsl(${k * 60},95%,65%)`, speed: 340, size: c * 0.09, shape: 'star', gravity: 400, life: [0.5, 0.8] });
        }
        f.pulse(x, y, 'ring', `hsl(${(this.time * 200) % 360},95%,70%)`, c * 0.5, 0.3);
        if (!chained) this.juice.vibrate(10);
        break;
      case 'diamond':
        // 회전하는 삼각 유리 파편 + 반짝임
        f.emit(x, y, 10, { color: 'rgba(190,240,255,0.95)', speed: 480, size: c * 0.08, shape: 'tri', gravity: 900, life: [0.4, 0.7] });
        f.emit(x, y, 6, { color: '#ffffff', speed: 520, size: c * 0.05, shape: 'spark', gravity: 0, life: [0.2, 0.35] });
        if (!chained) this.juice.vibrate(12);
        break;
    }
  }

  private onSold(e: { kind: string; price: number; value: number; ask: number; war: boolean; dumped: boolean }) {
    this.sold = e;
    this.soldAt = this.time;
    const def = itemDef(e.kind);
    const st = ZONES.stage;
    const cx = st.x + st.w / 2;
    if (e.dumped) {
      this.sfx.sad();
      this.fx.text(cx, st.y + 250, '+' + formatWon(e.price), '#ff9f9f', 26);
      this.toast(`😢 아무도 안 사서 떨이로 ${formatWon(e.price)}… 시작가가 너무 높았나 봐요`);
      this.hooks.persist(true);
      return;
    }
    this.sfx.gavel();
    this.sfx.buy();
    this.juice.shake(5);
    this.juice.vibrate([20, 60, 20, 60, 30], true);
    this.gainFx(cx, st.y + 250, e.price, '#ffe27a', 30);
    const ratio = e.price / e.value;
    if (e.war || ratio >= 2 || def.rarity === 'r' || def.rarity === 'l') {
      this.sfx.gold();
      this.juice.flash('#ffd23f', 0.3);
      this.juice.shake(10);
      this.fx.burst(cx, st.y + 110, 50, '#ffd23f', 700, 7, true);
    }
    if (e.war) this.toast(`🔥 입찰 전쟁! ${def.icon} ${def.name} 감정가의 x${ratio.toFixed(1)}에 낙찰!`);
    else if (ratio >= 1.4) this.toast(`👏 비싸게 팔렸다! ${def.icon} ${def.name} ${formatWon(e.price)}`);
    this.hooks.persist(true);
  }

  private dropWrap(x: number, y: number) {
    if (!inRect(ZONES.mat, x, y, 20)) return;
    if (this.s.mat) {
      this.toast('매트 위 뽁뽁이를 먼저 다 터뜨리고 버려요');
      return;
    }
    if (!this.game.moveWrapToMat()) return;
    this.syncViews();
    this.unfoldAt = this.time;
    this.sfx.rustle();
    this.juice.shake(3);
    this.hooks.persist(true);
  }

  private scrape(x0: number, y0: number, x1: number, y1: number) {
    const s = this.s.mat;
    if (!s || s.cleared || this.time - this.unfoldAt < 0.25) return;
    const L = sheetLayout(s.cols, s.rows);
    const R = TOOLS[this.s.tool].radius + L.cell * 0.3;
    const power = TOOLS[this.s.tool].power;
    const step = Math.max(3, Math.min(R, L.cell) * 0.5);
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const y = y0 + ((y1 - y0) * k) / n;
      const c0 = Math.max(0, Math.floor((x - R - L.x0) / L.cell));
      const c1 = Math.min(L.cols - 1, Math.floor((x + R - L.x0) / L.cell));
      const r0 = Math.max(0, Math.floor((y - R - L.y0) / L.cell));
      const r1 = Math.min(L.rows - 1, Math.floor((y + R - L.y0) / L.cell));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const i = r * L.cols + c;
          if (s.popped[i]) continue;
          const [cx, cy] = cellCenter(L, i);
          if (Math.hypot(x - cx, y - cy) <= R) this.handle(this.game.hit(i, power, this.time));
        }
      }
    }
  }

  private throwSheet() {
    if (!this.game.trashSheet()) return;
    const [x, y] = center(ZONES.mat);
    this.flyers.push({ kind: 'sheet', x, y, t0: this.time, tier: 0 });
    this.sfx.whoosh();
    this.hooks.persist(true);
  }

  private throwBox() {
    const tier = this.s.desk!.tier;
    if (!this.game.trashBox()) return;
    const [x, y] = center(ZONES.box);
    this.flyers.push({ kind: 'box', x, y, t0: this.time, tier });
    this.sfx.whoosh();
    this.hooks.persist(true);
  }

  // ---- 그리기 ----

  draw(ctx: CanvasRenderingContext2D, shopBadge: boolean, format: (n: number) => string) {
    const s = this.s;
    const t = this.time;
    const x = this.px;
    const y = this.py;
    drawRoom(ctx);

    const trashable = this.game.canTrashBox() || !!s.mat?.cleared;
    drawBell(ctx, this.game.canOrder(), inRect(ZONES.bell, x, y), t - this.bellAt, t);
    drawTrash(ctx, trashable, t - this.trashAt);
    drawDesk(ctx);
    if (s.auto.conveyor) drawConveyor(ctx, s.autoOn.conveyor ? t : 0);
    drawMat(ctx, this.mode === 'wrap' && !s.mat && inRect(ZONES.mat, x, y, 20));
    if (s.mat) this.drawMatSheet(ctx, s.mat, t);
    if (s.mat) {
      const L = sheetLayout(s.mat.cols, s.mat.rows);
      for (const p of this.presses) drawPressBlock(ctx, L, p.index, t - p.t);
    }
    drawLaptop(ctx, inRect(ZONES.laptop, x, y), shopBadge, t);
    drawTools(ctx, s);
    drawAuctionHouse(
      ctx,
      s,
      {
        shownBid: Math.round(this.shownBid),
        bidder: this.bidder,
        bidAge: t - this.bidAt,
        sold: this.sold,
        soldAge: t - this.soldAt,
        highlight: this.mode === 'item' && inRect(ZONES.auction, x, y, 30),
      },
      t,
    );
    drawBook(ctx, s.found.length);
    drawToggles(ctx, s, this.toggleAt(x, y));
    const cat = this.game.catWalk;
    drawDecor(ctx, s, !!cat, t);
    if (cat && s.mat) drawWalkingCat(ctx, sheetLayout(s.mat.cols, s.mat.rows), cat.row, cat.start, cat.dir, CAT_SPEED, t);
    if (s.auto.arm) drawArm(ctx, t - this.armAt, t);

    if (s.desk) {
      const v: BoxView = {
        dropAge: t - this.dropAt,
        openAge: t - this.openAt,
        tapeCuts: this.tapeCuts,
        hoverItem: this.mode === 'none' ? this.itemAt(x, y) : -1,
        dragItem: this.mode === 'item' ? this.dragIndex : -1,
        dragWrap: this.mode === 'wrap',
        hover: !s.desk.open && inRect(TAPE, x, y, 16),
        slide: s.auto.conveyor > 0 && s.autoOn.conveyor,
      };
      drawBox(ctx, s.desk, v, t);
      if (s.auto.cutter && s.autoOn.cutter && t - this.dropAt > DROP_TIME) drawCutterBot(ctx, s.desk, t);
    }

    for (const f of this.flyers) this.drawFlyer(ctx, f);
    if (s.finale) drawFinale(ctx, s.finale, this.finalePopAt, this.finaleHitAt, t - this.finaleAt, t, Math.max(1, Math.round(TOOLS[s.tool].power / 4)));
    drawConfettiRain(ctx, t - this.endingAt);
    this.drawHint(ctx);
    this.fx.draw(ctx);

    // 끌고 있는 것
    if (this.mode === 'item' && s.desk?.items[this.dragIndex]) {
      drawItem(ctx, itemDef(s.desk.items[this.dragIndex].kind), x, y, 1.25, t);
      const it = s.desk.items[this.dragIndex];
      // 진짜 시세는 숨기고 예상 범위만
      label(ctx, `${formatWon(it.lo)} ~ ${formatWon(it.hi)}`, x, y + 48, 16, '#ffe27a');
    } else if (this.mode === 'wrap' && s.desk?.wrap) {
      drawWrapBundle(ctx, x, y, WRAP_BUNDLE.w * 0.8, WRAP_BUNDLE.h * 0.8, s.desk.wrap.grade, t);
    }

    // 콤보
    if (s.mat && this.game.comboAlive(t)) {
      const heat = Math.min(1, this.game.combo / 40);
      const m = this.game.comboMult;
      label(ctx, `${this.game.combo} COMBO${m > 1 ? `  x${m}` : ''}`, ZONES.mat.x + ZONES.mat.w / 2, ZONES.mat.y - 8, 24 + heat * 10, `hsl(${200 - heat * 200},100%,65%)`, 900);
    }

    // 도구/커터 커서
    if (this.cursor === 'none' && x > -900) {
      if (s.desk && !s.desk.open && (this.mode === 'tape' || inRect(TAPE, x, y, 16))) {
        emoji(ctx, '✂️', x + 12, y + 12, 40);
      } else {
        drawToolCursor(ctx, s.tool, x, y, this.mode === 'pop', t);
      }
    }

    drawHud(ctx, s, Math.round(this.shownMoney), this.bump, format);

    const age = t - this.toastAt;
    if (age < 2.4 && this.toastText) {
      ctx.globalAlpha = Math.min(1, (2.4 - age) * 3);
      hint(ctx, this.toastText, VW / 2, 98, 0);
      ctx.globalAlpha = 1;
    }
  }

  private drawMatSheet(ctx: CanvasRenderingContext2D, mat: NonNullable<typeof this.s.mat>, t: number) {
    const L: SheetLayout = sheetLayout(mat.cols, mat.rows);
    const u = Math.min(1, (t - this.unfoldAt) / 0.25);
    ctx.save();
    if (u < 1) {
      // 펼쳐지는 연출
      const [cx, cy] = center(ZONES.mat);
      const k = 0.3 + 0.7 * (1 - Math.pow(1 - u, 3));
      ctx.translate(cx, cy);
      ctx.scale(k, 0.15 + 0.85 * k);
      ctx.translate(-cx, -cy);
    }
    if (mat.cleared) {
      ctx.globalAlpha = 0.85;
    }
    drawSheet(ctx, L, mat, this.popAt, this.hitAt, t, TOOLS[this.s.tool].power);
    ctx.restore();
  }

  private drawFlyer(ctx: CanvasRenderingContext2D, f: Flyer) {
    const k = Math.min(1, (this.time - f.t0) / 0.45);
    if (f.kind === 'item') {
      // 로봇팔이 경매 대기열로 옮기는 물건
      const x = f.x + (f.tx! - f.x) * k;
      const y = f.y + (f.ty! - f.y) * k - Math.sin(k * Math.PI) * 120;
      drawItem(ctx, itemDef(f.item!), x, y, 1 - k * 0.3, this.time);
      return;
    }
    const [tx, ty] = center(ZONES.trash);
    const x = f.x + (tx - f.x) * k;
    const y = f.y + (ty - 20 - f.y) * k - Math.sin(k * Math.PI) * 220;
    const scale = 1 - k * 0.7;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(k * 6);
    ctx.scale(scale, scale);
    if (f.kind === 'sheet') {
      // 구겨진 뽁뽁이 뭉치
      ctx.beginPath();
      for (let a = 0; a < 12; a++) {
        const r = 70 + ((a * 37) % 5) * 9;
        const ang = (a / 12) * Math.PI * 2;
        if (a === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(225,240,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // 납작하게 접힌 상자
      ctx.fillStyle = BOXES[f.tier].color;
      ctx.fillRect(-120, -70, 240, 140);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 4;
      ctx.strokeRect(-120, -70, 240, 140);
      ctx.beginPath();
      ctx.moveTo(-120, 0);
      ctx.lineTo(120, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 지금 할 일을 알려주는 말풍선 (처음 몇 번만, 막히는 단계는 항상) */
  private drawHint(ctx: CanvasRenderingContext2D) {
    if (this.mode !== 'none' || this.s.finale) return;
    const s = this.s;
    const t = this.time;
    const early = s.stats.boxes <= 3;
    const desk = s.desk;
    const landed = t - this.dropAt >= DROP_TIME + 0.2;
    if (s.mat && !s.mat.cleared && !s.research.rub && s.stats.boxes <= 2) {
      hint(ctx, '👆 클릭해서 하나씩 톡! (🧤 쓱쓱 장갑을 사면 드래그로)', ZONES.mat.x + ZONES.mat.w / 2, ZONES.mat.y + ZONES.mat.h - 20, t);
    }
    if (s.mat?.cleared) {
      hint(ctx, `👆 클릭해서 버리기 (+${formatWon(s.mat.bonus)})`, ZONES.mat.x + ZONES.mat.w / 2, ZONES.mat.y + ZONES.mat.h / 2, t);
    }
    if (!desk) {
      if (s.auto.conveyor && s.autoOn.conveyor) return;
      if (early || !s.mat) hint(ctx, '🔔 눌러서 택배 주문!', ZONES.bell.x + ZONES.bell.w / 2 + 40, ZONES.bell.y - 22, t);
      return;
    }
    if (!landed) return;
    const [bx] = center(ZONES.box);
    if (!desk.open) {
      if (early) hint(ctx, '✂️ 테이프를 따라 위아래로 쭉 긁기', bx, ZONES.box.y - 34, t);
      return;
    }
    if (desk.items.length) {
      if (early) hint(ctx, '물건을 경매장으로 끌어다 올리기 →', bx, ZONES.box.y - 52, t);
      return;
    }
    if (desk.wrap) {
      if (s.mat) {
        if (early && !s.mat.cleared) hint(ctx, '매트 위 뽁뽁이부터 터뜨려요', bx, ZONES.box.y - 52, t);
      } else if (early) hint(ctx, '뽁뽁이를 매트로 끌어다 펼치기 →', bx, ZONES.box.y - 52, t);
      return;
    }
    hint(ctx, `빈 상자 클릭 → 버리기`, bx, ZONES.box.y - 52, t);
  }

  shopBadge(): boolean {
    return (
      (['tool', 'wrap', 'box'] as Ladder[]).some((l) => this.game.canBuy(l)) ||
      RESEARCH.some((r) => this.game.canResearch(r.id)) ||
      AUTOMATIONS.some((a) => this.game.canBuyAuto(a.id)) ||
      DECOR.some((d) => this.game.canBuyDecor(d.id)) ||
      this.game.canBuyGoal()
    );
  }
}
