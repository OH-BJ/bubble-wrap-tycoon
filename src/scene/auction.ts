import type { GameState } from '../core/state';
import { CONFIG } from '../config';
import { RARITY_COLOR, RARITY_NAME } from '../economy/catalog';
import { formatWon } from '../ui/format';
import { drawItem, emoji, itemDef, label } from './draw';
import { queueSlot, ZONES } from './layout';

const TAU = Math.PI * 2;
const BIDDERS = ['🧑', '👩', '👴', '👱‍♀️', '🤵'];

export interface AuctionView {
  /** 지금 화면에 보이는 입찰가 (숫자가 휘리릭 올라가는 연출) */
  shownBid: number;
  /** 마지막 입찰: 누가, 언제 */
  bidder: number;
  bidAge: number;
  /** 낙찰 직후 연출 */
  sold: { kind: string; price: number; value: number; ask: number; war: boolean; dumped: boolean } | null;
  soldAge: number;
  highlight: boolean;
}

export function drawAuctionHouse(ctx: CanvasRenderingContext2D, s: GameState, v: AuctionView, time: number) {
  const z = ZONES.auction;
  // 벽에 붙은 경매장 부스
  ctx.beginPath();
  ctx.roundRect(z.x + 6, z.y + 10, z.w, z.h, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();
  const g = ctx.createLinearGradient(0, z.y, 0, z.y + z.h);
  g.addColorStop(0, '#5a1f24');
  g.addColorStop(1, '#3a1418');
  ctx.beginPath();
  ctx.roundRect(z.x, z.y, z.w, z.h, 14);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = v.highlight ? '#9dff8a' : '#b8862f';
  ctx.stroke();
  label(ctx, '🔨 경매장', z.x + z.w / 2, z.y + 28, 24, '#ffe27a', 900);

  drawStage(ctx, s, v, time);
  drawQueue(ctx, s, time);
  drawHistory(ctx, s);
}

function drawStage(ctx: CanvasRenderingContext2D, s: GameState, v: AuctionView, time: number) {
  const st = ZONES.stage;
  const cx = st.x + st.w / 2;
  ctx.beginPath();
  ctx.roundRect(st.x, st.y, st.w, st.h, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  const a = s.auction;
  // 낙찰 직후: 땅땅땅
  if (!a && v.sold && v.soldAge < 1.6) {
    const def = itemDef(v.sold.kind);
    spotlight(ctx, cx, st.y + 120, '#ffe27a');
    drawItem(ctx, def, cx, st.y + 110, 1.6, time);
    const k = Math.min(1, v.soldAge / 0.15);
    ctx.save();
    ctx.translate(cx, st.y + 205);
    ctx.rotate(-0.12);
    ctx.scale(2 - k, 2 - k);
    ctx.globalAlpha = k;
    const dumped = v.sold.dumped;
    ctx.strokeStyle = dumped ? '#9aa4b0' : '#ff4d4d';
    ctx.lineWidth = 4;
    ctx.strokeRect(-80, -26, 160, 52);
    label(ctx, dumped ? '떨이…' : '낙찰!', 0, 1, 34, dumped ? '#c9d1da' : '#ff6b6b', 900);
    ctx.restore();
    ctx.globalAlpha = 1;
    label(ctx, formatWon(v.sold.price), cx, st.y + 268, 32, '#ffe27a', 900);
    // 팔고 나서야 진짜 시세가 공개된다 (다음엔 더 잘 맞추게)
    label(ctx, `진짜 시세 ${formatWon(v.sold.value)}`, cx, st.y + 302, 16, v.sold.price >= v.sold.value ? '#9dff8a' : '#ff9f9f', 800);
    // 망치
    const swing = Math.sin(Math.min(1, v.soldAge / 0.9) * Math.PI * 3);
    ctx.save();
    ctx.translate(st.x + st.w - 50, st.y + 60);
    ctx.rotate(-0.6 + Math.abs(swing) * 0.8);
    emoji(ctx, '🔨', 0, 0, 48);
    ctx.restore();
    return;
  }

  if (!a) {
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(255,226,122,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(st.x + 20, st.y + 40, st.w - 40, st.h - 120);
    ctx.setLineDash([]);
    emoji(ctx, '🪑', cx, st.y + 130, 56);
    label(ctx, '물건을 여기로', cx, st.y + 200, 20, '#ffe27a');
    label(ctx, '끌어오면 경매 시작!', cx, st.y + 228, 20, '#ffe27a');
    drawBidders(ctx, st.y + st.h - 40, -1, 0, time);
    return;
  }

  const def = itemDef(a.kind);
  if (a.war) {
    const flash = 0.5 + Math.sin(time * 14) * 0.5;
    label(ctx, '🔥 입찰 전쟁! 🔥', cx, st.y + 22, 20, `rgba(255,${120 + flash * 100},80,1)`, 900);
  } else {
    label(ctx, '경매 진행 중', cx, st.y + 22, 16, '#e8c9a0', 700);
  }
  spotlight(ctx, cx, st.y + 100, a.war ? '#ff8a4d' : '#fff2c4');
  drawItem(ctx, def, cx, st.y + 92 + Math.sin(time * 2) * 3, 1.5, time);
  label(ctx, `${def.name} · ${RARITY_NAME[def.rarity]}`, cx, st.y + 160, 18, RARITY_COLOR[def.rarity], 800);
  label(ctx, `시작가 ${formatWon(a.ask)}`, cx, st.y + 186, 15, '#d9c3a5', 700);

  const pulse = v.bidAge < 0.25 ? 1 + (0.25 - v.bidAge) * 1.2 : 1;
  ctx.save();
  ctx.translate(cx, st.y + 228);
  ctx.scale(pulse, pulse);
  const waiting = a.dumped ? (a.elapsed > 0.8 ? '입찰자 없음…' : '입찰 대기...') : '입찰 대기...';
  label(ctx, v.shownBid > 0 ? formatWon(v.shownBid) : waiting, 0, 0, v.shownBid > 0 ? 30 : 24, v.shownBid > 0 ? '#ffe27a' : '#e8c9a0', 900);
  ctx.restore();

  // 망치까지 남은 시간
  const bar = { x: st.x + 24, y: st.y + 256, w: st.w - 48, h: 8 };
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  ctx.fillStyle = '#ffb703';
  ctx.fillRect(bar.x, bar.y, bar.w * Math.min(1, a.elapsed / a.end), bar.h);

  drawBidders(ctx, st.y + st.h - 40, v.bidder, v.bidAge, time, a.dumped && v.shownBid === 0 && a.elapsed > 0.8);
}

function spotlight(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 10, x, y, 110);
  g.addColorStop(0, color + '66');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 110, 0, TAU);
  ctx.fill();
}

function drawBidders(ctx: CanvasRenderingContext2D, y: number, active: number, age: number, time: number, refusing = false) {
  const z = ZONES.stage;
  const step = (z.w - 40) / BIDDERS.length;
  BIDDERS.forEach((b, i) => {
    const x = z.x + 20 + step * (i + 0.5);
    const up = i === active && age < 0.6;
    const jump = up ? Math.sin((age / 0.6) * Math.PI) * -14 : Math.sin(time * 2 + i) * 1.5;
    // 너무 비싸면 다들 고개를 젓는다
    const shake = refusing ? Math.sin(time * 18 + i) * 4 : 0;
    emoji(ctx, b, x + shake, y + jump, 34);
    if (refusing) emoji(ctx, '🙅', x + 14, y - 28, 20);
    else if (up) emoji(ctx, '🙋', x + 14, y - 28 + jump, 22);
  });
}

function drawQueue(ctx: CanvasRenderingContext2D, s: GameState, time: number) {
  const q = ZONES.queue;
  label(ctx, `대기 ${s.lots.length} / ${CONFIG.auction.queue}`, q.x + q.w / 2, q.y + 18, 16, '#e8c9a0', 800);
  for (let i = 0; i < CONFIG.auction.queue; i++) {
    const [x, y] = queueSlot(i);
    ctx.beginPath();
    ctx.roundRect(x - 30, y - 28, 60, 56, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    const lot = s.lots[i];
    if (lot) drawItem(ctx, itemDef(lot.kind), x, y, 0.75, time);
  }
}

function drawHistory(ctx: CanvasRenderingContext2D, s: GameState) {
  const h = ZONES.history;
  label(ctx, '최근 낙찰', h.x + h.w / 2, h.y + 16, 16, '#e8c9a0', 800);
  if (!s.sales.length) {
    label(ctx, '아직 없음', h.x + h.w / 2, h.y + 70, 15, '#9a7f66', 700);
    return;
  }
  s.sales.forEach((sale, i) => {
    const y = h.y + 52 + i * 42;
    const def = itemDef(sale.kind);
    ctx.beginPath();
    ctx.roundRect(h.x + 4, y - 18, h.w - 8, 36, 8);
    ctx.fillStyle = i === 0 ? 'rgba(255,226,122,0.12)' : 'rgba(0,0,0,0.2)';
    ctx.fill();
    emoji(ctx, def.icon, h.x + 26, y, 24);
    label(ctx, formatWon(sale.price), h.x + 50, y, 16, '#fff', 800, 'left');
    // 시세 대비 얼마나 잘 팔았나
    const ratio = sale.price / sale.value;
    label(ctx, `시세 x${ratio.toFixed(1)}`, h.x + h.w - 14, y, 14, ratio >= 1.5 ? '#ffb800' : ratio >= 1 ? '#9dff8a' : '#ff9f9f', 900, 'right');
  });
}
