import { CONFIG } from '../config';
import { AUTOMATIONS, BOXES, DECOR, ITEMS, RESEARCH, TOOLS, WRAPS, type AutoId, type DecorId, type ResearchId } from '../economy/catalog';
import { isKind } from '../sheet/bubble';
import { isSheetDone } from '../sheet/sheet';
import { SAVE_VERSION, type AuctionState, type BoxState, type GameState, type ListedLot, type Lot, type Sale, type SheetState } from './state';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function emptyResearch(): Record<ResearchId, number> {
  return Object.fromEntries(RESEARCH.map((r) => [r.id, 0])) as Record<ResearchId, number>;
}

function emptyAuto(): Record<AutoId, number> {
  return Object.fromEntries(AUTOMATIONS.map((a) => [a.id, 0])) as Record<AutoId, number>;
}

function allOn(): Record<AutoId, boolean> {
  return Object.fromEntries(AUTOMATIONS.map((a) => [a.id, true])) as Record<AutoId, boolean>;
}

function noDecor(): Record<DecorId, boolean> {
  return Object.fromEntries(DECOR.map((d) => [d.id, false])) as Record<DecorId, boolean>;
}

// 필드 순서는 sanitize 결과와 같아야 한다 (껐다 켜도 세이브 내용이 한 글자도 안 바뀌게)
export function newGame(): GameState {
  return {
    version: SAVE_VERSION,
    money: 0,
    totalEarned: 0,
    nextId: 1,
    tool: 0,
    wrap: 0,
    box: 0,
    research: emptyResearch(),
    auto: emptyAuto(),
    autoOn: allOn(),
    desk: null,
    mat: null,
    lots: [],
    auction: null,
    sales: [],
    found: [],
    collection: {},
    decor: noDecor(),
    finale: null,
    ended: false,
    endingSeen: false,
    stats: { boxes: 0, sold: 0, popped: 0, sheets: 0, bestSale: 0, playTime: 0 },
  };
}

// 예전 버전 세이브를 이어서 쓸 수 있게 바꾼다 (돈, 업그레이드, 진행 중인 것 전부 유지)
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version === 6) {
    raw = { ...raw, version: 7, collection: {}, decor: noDecor(), finale: null, ended: false, endingSeen: false };
  }
  return raw;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown, min = 0): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min ? v : null;
const int = (v: unknown, min = 0, max = Infinity): number | null => {
  const n = num(v, min);
  return n !== null && Number.isInteger(n) && n <= max ? n : null;
};
const itemIds = new Set(ITEMS.map((it) => it.id));

/** undefined = 망가짐, null = 없음 */
function sanitizeSheet(raw: unknown): SheetState | null | undefined {
  if (raw === null) return null;
  if (!isObj(raw)) return undefined;
  const id = int(raw.id, 1);
  const grade = int(raw.grade, 0, WRAPS.length - 1);
  const cols = int(raw.cols, 1);
  const rows = int(raw.rows, 1);
  const mult = num(raw.mult, 1);
  const earned = num(raw.earned);
  const bonus = num(raw.bonus);
  if (id === null || grade === null || cols === null || rows === null || mult === null || earned === null || bonus === null) {
    return undefined;
  }
  const n = cols * rows;
  const { cells, popped, hp } = raw;
  if (!Array.isArray(cells) || !Array.isArray(popped) || !Array.isArray(hp)) return undefined;
  if (cells.length !== n || popped.length !== n || hp.length !== n) return undefined;
  if (!cells.every(isKind) || !popped.every((p) => p === 0 || p === 1)) return undefined;
  if (!hp.every((h) => int(h, 0, WRAPS[grade].hp) !== null)) return undefined;
  if (typeof raw.cleared !== 'boolean') return undefined;

  const sheet: SheetState = {
    id,
    grade,
    cols,
    rows,
    cells: [...cells],
    popped: cells.map((k, i) => (k === 'd' ? 1 : (popped[i] as number))),
    hp: cells.map((k, i) => (k === 'd' || popped[i] === 1 ? 0 : (hp[i] as number))),
    mult,
    earned,
    cleared: raw.cleared,
    bonus,
  };
  // 전부 터졌는데 클리어 표시가 없으면 치울 수 없게 막히므로 표시만 맞춘다 (보너스는 주지 않음)
  if (!sheet.cleared && isSheetDone(sheet)) sheet.cleared = true;
  return sheet;
}

function sanitizeLot(raw: unknown): Lot | undefined {
  if (!isObj(raw) || typeof raw.kind !== 'string' || !itemIds.has(raw.kind)) return undefined;
  const value = num(raw.value, 1);
  const lo = num(raw.lo, 1);
  const hi = num(raw.hi, 1);
  if (value === null || lo === null || hi === null || lo > hi) return undefined;
  return { kind: raw.kind, value, lo, hi };
}

function sanitizeLots(raw: unknown): Lot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lots = raw.map(sanitizeLot);
  return lots.every((l): l is Lot => !!l) ? lots : undefined;
}

function sanitizeListed(raw: unknown): ListedLot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ListedLot[] = [];
  for (const r of raw) {
    const lot = sanitizeLot(r);
    const ask = isObj(r) ? int(r.ask, 1) : null;
    if (!lot || ask === null) return undefined;
    out.push({ ...lot, ask });
  }
  return out;
}

function sanitizeBox(raw: unknown): BoxState | null | undefined {
  if (raw === null) return null;
  if (!isObj(raw)) return undefined;
  const id = int(raw.id, 1);
  const tier = int(raw.tier, 0, BOXES.length - 1);
  const tape = num(raw.tape);
  const wrap = sanitizeSheet(raw.wrap);
  const items = sanitizeLots(raw.items);
  if (id === null || tier === null || tape === null || tape > 1 || wrap === undefined || !items) return undefined;
  if (typeof raw.open !== 'boolean') return undefined;
  return { id, tier, tape, open: raw.open, items, wrap };
}

function sanitizeAuction(raw: unknown): AuctionState | null | undefined {
  if (raw === null) return null;
  if (!isObj(raw) || typeof raw.kind !== 'string' || !itemIds.has(raw.kind)) return undefined;
  const value = num(raw.value, 1);
  const ask = int(raw.ask, 1);
  const end = num(raw.end);
  const elapsed = num(raw.elapsed);
  const { bids, times } = raw;
  if (value === null || ask === null || end === null || elapsed === null) return undefined;
  if (typeof raw.war !== 'boolean' || typeof raw.dumped !== 'boolean') return undefined;
  if (!Array.isArray(bids) || !Array.isArray(times) || !bids.length || bids.length !== times.length) return undefined;
  if (!bids.every((b) => num(b, 1) !== null) || !times.every((t) => num(t) !== null)) return undefined;
  return {
    kind: raw.kind,
    value,
    ask,
    dumped: raw.dumped,
    bids: [...bids],
    times: [...times],
    end,
    elapsed: Math.min(elapsed, end),
    war: raw.war,
  };
}

function sanitizeSales(raw: unknown): Sale[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Sale[] = [];
  for (const s of raw) {
    if (!isObj(s) || typeof s.kind !== 'string' || !itemIds.has(s.kind)) return undefined;
    const price = num(s.price);
    const value = num(s.value);
    const ask = num(s.ask);
    if (price === null || value === null || ask === null) return undefined;
    out.push({ kind: s.kind, price, value, ask });
  }
  return out.slice(0, CONFIG.auction.history);
}

// 세이브 데이터를 검사한다. 고칠 수 없으면 null.
export function sanitize(input: unknown): GameState | null {
  if (!isObj(input)) return null;
  const raw = migrate(input);
  if (raw.version !== SAVE_VERSION) return null;
  const money = num(raw.money);
  const totalEarned = num(raw.totalEarned);
  const nextId = int(raw.nextId, 1);
  const tool = int(raw.tool, 0, TOOLS.length - 1);
  const wrap = int(raw.wrap, 0, WRAPS.length - 1);
  const box = int(raw.box, 0, BOXES.length - 1);
  const desk = sanitizeBox(raw.desk);
  const mat = sanitizeSheet(raw.mat);
  const finale = sanitizeSheet(raw.finale);
  const lots = sanitizeListed(raw.lots);
  const auction = sanitizeAuction(raw.auction);
  const sales = sanitizeSales(raw.sales);
  const st = raw.stats;
  if (
    money === null ||
    totalEarned === null ||
    nextId === null ||
    tool === null ||
    wrap === null ||
    box === null ||
    desk === undefined ||
    mat === undefined ||
    !lots ||
    auction === undefined ||
    !sales ||
    !isObj(raw.research) ||
    !isObj(raw.auto) ||
    !isObj(raw.autoOn) ||
    !isObj(raw.decor) ||
    !isObj(raw.collection) ||
    finale === undefined ||
    typeof raw.ended !== 'boolean' ||
    typeof raw.endingSeen !== 'boolean' ||
    !Array.isArray(raw.found) ||
    !isObj(st)
  ) {
    return null;
  }
  const research = emptyResearch();
  for (const def of RESEARCH) {
    // 나중에 생긴 연구는 예전 세이브에 없으니 0으로 시작
    const level = int((raw.research as Record<string, unknown>)[def.id] ?? 0);
    if (level === null || level > def.max) return null;
    research[def.id] = level;
  }
  const auto = emptyAuto();
  const autoOn = allOn();
  for (const def of AUTOMATIONS) {
    const level = int((raw.auto as Record<string, unknown>)[def.id]);
    const on = (raw.autoOn as Record<string, unknown>)[def.id];
    if (level === null || level > def.max || typeof on !== 'boolean') return null;
    auto[def.id] = level;
    autoOn[def.id] = on;
  }
  const decor = noDecor();
  for (const d of DECOR) {
    const owned = (raw.decor as Record<string, unknown>)[d.id];
    if (typeof owned !== 'boolean') return null;
    decor[d.id] = owned;
  }
  const collection: GameState['collection'] = {};
  for (const [kind, rec] of Object.entries(raw.collection as Record<string, unknown>)) {
    if (!itemIds.has(kind) || !isObj(rec)) return null;
    const sold = int(rec.sold);
    const best = num(rec.best);
    if (sold === null || best === null) return null;
    collection[kind] = { sold, best };
  }
  // 엔딩은 하나만: 초대형 뽁뽁이가 있으면 아직 안 끝난 것
  if (finale && raw.ended) return null;
  const usedIds = [desk?.id ?? 0, desk?.wrap?.id ?? 0, mat?.id ?? 0, finale?.id ?? 0];
  return {
    version: SAVE_VERSION,
    money,
    totalEarned,
    nextId: Math.max(nextId, ...usedIds.map((i) => i + 1)),
    tool,
    wrap,
    box,
    research,
    auto,
    autoOn,
    desk,
    mat,
    lots: lots.slice(0, CONFIG.auction.queue),
    auction,
    sales,
    found: [...new Set(raw.found.filter((k): k is string => typeof k === 'string' && itemIds.has(k)))],
    collection,
    decor,
    finale,
    ended: raw.ended,
    endingSeen: raw.ended && raw.endingSeen,
    stats: {
      boxes: int(st.boxes) ?? 0,
      sold: int(st.sold) ?? 0,
      popped: int(st.popped) ?? 0,
      sheets: int(st.sheets) ?? 0,
      bestSale: num(st.bestSale) ?? 0,
      playTime: num(st.playTime) ?? 0,
    },
  };
}

function parse(json: string | null): GameState | null {
  if (!json) return null;
  try {
    return sanitize(JSON.parse(json));
  } catch {
    return null;
  }
}

export type LoadSource = 'main' | 'backup' | 'new';

// 불러오기는 읽기만 한다. 보상 지급이나 진행은 절대 하지 않는다.
export function loadState(kv: KV | null): { state: GameState; source: LoadSource } {
  if (kv) {
    try {
      const main = parse(kv.getItem(CONFIG.save.key));
      if (main) return { state: main, source: 'main' };
      const backup = parse(kv.getItem(CONFIG.save.backupKey));
      if (backup) return { state: backup, source: 'backup' };
    } catch {
      // 저장소 접근 불가 (사생활 보호 모드 등)
    }
  }
  return { state: newGame(), source: 'new' };
}

export function saveState(kv: KV | null, state: GameState): boolean {
  if (!kv) return false;
  try {
    const json = JSON.stringify(state);
    const prev = kv.getItem(CONFIG.save.key);
    if (prev && prev !== json && parse(prev)) kv.setItem(CONFIG.save.backupKey, prev);
    kv.setItem(CONFIG.save.key, json);
    return true;
  } catch {
    return false;
  }
}

export function getStorage(): KV | null {
  try {
    const s = window.localStorage;
    const probe = '__bbwrap_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
