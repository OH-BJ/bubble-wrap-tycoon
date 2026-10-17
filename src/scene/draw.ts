import type { BoxState, GameState } from '../core/state';
import { BOXES, GOAL, ITEMS, RARITY_COLOR, TOOLS, type ItemDef } from '../economy/catalog';
import { drawWrapBundle, hash } from './bubbles';
import { BOX_INNER, itemSlot, TAPE, VH, VW, WRAP_BUNDLE, ZONES, type Rect } from './layout';

const TAU = Math.PI * 2;
export const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const UI_FONT = 'system-ui, -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export const itemDef = (kind: string): ItemDef => ITEMS.find((it) => it.id === kind)!;

function rr(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

function shadow(ctx: CanvasRenderingContext2D, r: Rect, radius: number, dx = 6, dy = 10, alpha = 0.35) {
  ctx.beginPath();
  ctx.roundRect(r.x + dx, r.y + dy, r.w, r.h, radius);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fill();
}

export function emoji(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, size: number) {
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
}

export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color = '#fff',
  weight = 800,
  align: CanvasTextAlign = 'center',
) {
  ctx.font = `${weight} ${size}px ${UI_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * 0.2);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** 말풍선 안내 (살짝 위아래로 흔들림) */
export function hint(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, time: number) {
  const yy = y + Math.sin(time * 4) * 4;
  ctx.font = `800 17px ${UI_FONT}`;
  const w = ctx.measureText(text).width + 28;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, yy - 18, w, 36, 18);
  ctx.fillStyle = 'rgba(20,22,40,0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,226,122,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffe27a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, yy + 1);
}

// ---- 방과 책상 ----

export function drawRoom(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#3a2c23';
  ctx.fillRect(0, 0, VW, VH);
  // 마루 판자
  for (let i = 0, y = 0; y < VH; i++, y += 90) {
    const shade = 0.04 + hash(i, 1) * 0.06;
    ctx.fillStyle = `rgba(255,220,180,${shade})`;
    ctx.fillRect(0, y, VW, 88);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, y + 88, VW, 2);
    for (let x = (hash(i, 2) * 400) % 400; x < VW; x += 380 + hash(i, 3) * 120) ctx.fillRect(x, y, 2, 88);
  }
  const vignette = ctx.createRadialGradient(VW / 2, VH / 2, 300, VW / 2, VH / 2, 1000);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VW, VH);
}

export function drawDesk(ctx: CanvasRenderingContext2D) {
  const d = ZONES.desk;
  shadow(ctx, d, 22, 10, 18, 0.45);
  const g = ctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y + d.h);
  g.addColorStop(0, '#d4a46c');
  g.addColorStop(1, '#b07d4b');
  rr(ctx, d, 22);
  ctx.fillStyle = g;
  ctx.fill();
  // 나뭇결
  ctx.save();
  rr(ctx, d, 22);
  ctx.clip();
  ctx.strokeStyle = 'rgba(110,60,20,0.12)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 26; k++) {
    const y0 = d.y + 20 + k * 31;
    ctx.beginPath();
    for (let x = d.x; x <= d.x + d.w; x += 20) {
      const y = y0 + Math.sin(x * 0.01 + k) * 6 + Math.sin(x * 0.033 + k * 2) * 2;
      if (x === d.x) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  rr(ctx, d, 22);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#8a5a30';
  ctx.stroke();
}

// ---- 주문벨 ----

export function drawBell(ctx: CanvasRenderingContext2D, enabled: boolean, hover: boolean, pressAge: number, time: number) {
  const b = ZONES.bell;
  const cx = b.x + b.w / 2;
  const cy = b.y + 92;
  // 작은 원형 스툴
  ctx.beginPath();
  ctx.arc(cx + 6, cy + 10, 78, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  const g = ctx.createRadialGradient(cx - 20, cy - 20, 10, cx, cy, 80);
  g.addColorStop(0, '#9b6b44');
  g.addColorStop(1, '#6e4628');
  ctx.beginPath();
  ctx.arc(cx, cy, 78, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  if (enabled) {
    ctx.beginPath();
    ctx.arc(cx, cy, 78 + 6 + Math.sin(time * 5) * 4, 0, TAU);
    ctx.strokeStyle = `rgba(255,226,122,${0.5 + Math.sin(time * 5) * 0.3})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  const squash = pressAge < 0.15 ? 1 - Math.sin((pressAge / 0.15) * Math.PI) * 0.15 : 1;
  ctx.save();
  ctx.translate(cx, cy + 6);
  ctx.scale(1 / squash, squash * (hover && enabled ? 1.06 : 1));
  ctx.globalAlpha = enabled ? 1 : 0.45;
  emoji(ctx, '🛎️', 0, 0, 96);
  ctx.restore();
  ctx.globalAlpha = 1;
  label(ctx, '주문하기', cx, b.y + b.h - 10, 22, enabled ? '#ffe27a' : '#b9a58a');
}

// ---- 쓰레기통 ----

export function drawTrash(ctx: CanvasRenderingContext2D, highlight: boolean, bounceAge: number) {
  const t = ZONES.trash;
  const cx = t.x + t.w / 2;
  const cy = t.y + 85;
  const bounce = bounceAge < 0.3 ? 1 + Math.sin((bounceAge / 0.3) * Math.PI) * 0.08 : 1;
  ctx.beginPath();
  ctx.arc(cx + 6, cy + 10, 70, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(bounce, bounce);
  const g = ctx.createRadialGradient(-20, -20, 10, 0, 0, 70);
  g.addColorStop(0, '#9aa6b2');
  g.addColorStop(1, '#5d6873');
  ctx.beginPath();
  ctx.arc(0, 0, 70, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, TAU);
  ctx.fillStyle = '#232a31';
  ctx.fill();
  // 안에 쌓인 구겨진 것들
  ctx.fillStyle = 'rgba(200,215,230,0.25)';
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.ellipse(Math.cos(k * 1.7) * 22, Math.sin(k * 2.3) * 18, 16, 10, k, 0, TAU);
    ctx.fill();
  }
  if (highlight) {
    ctx.beginPath();
    ctx.arc(0, 0, 76, 0, TAU);
    ctx.strokeStyle = '#9dff8a';
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, '쓰레기통', cx, t.y + t.h - 8, 20, '#d5dde5');
}

// ---- 택배 상자 ----

export interface BoxView {
  dropAge: number;
  openAge: number;
  /** 테이프 조각별 뜯김 (화면 연출용) */
  tapeCuts: boolean[];
  hoverItem: number;
  dragItem: number;
  dragWrap: boolean;
  hover: boolean;
  /** 컨베이어: 위에서 떨어지지 않고 왼쪽에서 미끄러져 들어옴 */
  slide: boolean;
}

function drawShippingLabel(ctx: CanvasRenderingContext2D, x: number, y: number, box: (typeof BOXES)[number]) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, 110, 70);
  ctx.fillStyle = '#333';
  for (let k = 0; k < 18; k++) ctx.fillRect(8 + k * 5, 42, k % 3 === 0 ? 3 : 1.5, 20);
  ctx.font = `800 11px ${UI_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(box.name, 8, 8);
  ctx.font = `600 9px ${UI_FONT}`;
  ctx.fillText('뽁뽁이 타이쿤 귀하', 8, 24);
  ctx.restore();
}

export function drawBox(ctx: CanvasRenderingContext2D, desk: BoxState, v: BoxView, time: number) {
  const z = ZONES.box;
  const box = BOXES[desk.tier];
  // 떨어지는 연출
  const d = Math.min(1, v.dropAge / 0.45);
  const fall = d < 1 ? (1 - d) * (1 - d) * -500 : 0;
  const bounce = d >= 1 && v.dropAge < 0.65 ? Math.sin(((v.dropAge - 0.45) / 0.2) * Math.PI) * -12 : 0;
  const lift = v.slide ? 0 : fall + bounce;
  const dx = v.slide && d < 1 ? -(1 - d) * (1 - d) * 520 : 0;
  const shadowScale = 1 + Math.min(0.4, -lift / 800);

  ctx.save();
  ctx.globalAlpha = 0.35 / shadowScale;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(z.x + dx + 10 - (shadowScale - 1) * 80, z.y + 16, z.w * shadowScale, z.h * shadowScale, 10);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(dx, lift);

  if (!desk.open) {
    // 닫힌 상자 (위에서 본 모습)
    const g = ctx.createLinearGradient(z.x, z.y, z.x + z.w, z.y + z.h);
    g.addColorStop(0, shade(box.color, 18));
    g.addColorStop(1, shade(box.color, -14));
    rr(ctx, z, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = shade(box.color, -40);
    ctx.lineWidth = 3;
    ctx.stroke();
    // 날개 이음새
    ctx.fillStyle = shade(box.color, -45);
    ctx.fillRect(z.x + z.w / 2 - 1.5, z.y, 3, z.h);
    drawShippingLabel(ctx, z.x + 26, z.y + 24, box);
    if (box.label) {
      ctx.save();
      ctx.translate(z.x + z.w * 0.76, z.y + z.h * 0.78);
      ctx.rotate(-0.15);
      ctx.font = `900 22px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(200,40,40,0.75)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-62, -16, 124, 32);
      ctx.fillStyle = 'rgba(200,40,40,0.75)';
      ctx.fillText(box.label, 0, 1);
      ctx.restore();
    }
    // 테이프
    const n = v.tapeCuts.length;
    const segH = TAPE.h / n;
    for (let k = 0; k < n; k++) {
      const y = TAPE.y + k * segH;
      if (v.tapeCuts[k]) {
        // 뜯긴 조각: 양쪽으로 말려 올라감
        ctx.fillStyle = shade(box.tape, -30);
        ctx.fillRect(TAPE.x - 4, y, 10, segH + 0.5);
        ctx.fillRect(TAPE.x + TAPE.w - 6, y, 10, segH + 0.5);
      } else {
        ctx.fillStyle = box.tape;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(TAPE.x, y, TAPE.w, segH + 0.5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(TAPE.x + 6, y, 8, segH + 0.5);
      }
    }
    if (v.hover) {
      ctx.strokeStyle = 'rgba(255,226,122,0.9)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(TAPE.x - 4, TAPE.y, TAPE.w + 8, TAPE.h);
      ctx.setLineDash([]);
    }
  } else {
    // 열린 상자: 날개가 바깥으로 젖혀짐
    const o = Math.min(1, v.openAge / 0.3);
    const flap = 70 * easeOut(o);
    const fc = shade(box.color, 10);
    ctx.fillStyle = fc;
    ctx.strokeStyle = shade(box.color, -40);
    ctx.lineWidth = 3;
    const flaps: [number, number][][] = [
      [[z.x, z.y], [z.x + z.w, z.y], [z.x + z.w - 20, z.y - flap], [z.x + 20, z.y - flap]],
      [[z.x, z.y + z.h], [z.x + z.w, z.y + z.h], [z.x + z.w - 20, z.y + z.h + flap], [z.x + 20, z.y + z.h + flap]],
      [[z.x, z.y], [z.x, z.y + z.h], [z.x - flap, z.y + z.h - 20], [z.x - flap, z.y + 20]],
      [[z.x + z.w, z.y], [z.x + z.w, z.y + z.h], [z.x + z.w + flap, z.y + z.h - 20], [z.x + z.w + flap, z.y + 20]],
    ];
    for (const f of flaps) {
      ctx.beginPath();
      f.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    rr(ctx, z, 6);
    ctx.fillStyle = shade(box.color, -10);
    ctx.fill();
    ctx.stroke();
    // 안쪽 그림자
    const inner = ctx.createLinearGradient(0, BOX_INNER.y, 0, BOX_INNER.y + BOX_INNER.h);
    inner.addColorStop(0, shade(box.color, -70));
    inner.addColorStop(1, shade(box.color, -45));
    rr(ctx, BOX_INNER, 4);
    ctx.fillStyle = inner;
    ctx.fill();
    // 종이 완충재
    ctx.fillStyle = 'rgba(240,230,210,0.18)';
    for (let k = 0; k < 9; k++) {
      ctx.beginPath();
      ctx.ellipse(BOX_INNER.x + 30 + hash(k, desk.id) * (BOX_INNER.w - 60), BOX_INNER.y + 20 + hash(k, desk.id + 1) * (BOX_INNER.h - 40), 26, 12, k, 0, TAU);
      ctx.fill();
    }

    if (desk.wrap && !v.dragWrap) {
      const w = WRAP_BUNDLE;
      drawWrapBundle(ctx, w.x + w.w / 2, w.y + w.h / 2, w.w, w.h, desk.wrap.grade, time);
    }
    desk.items.forEach((it, i) => {
      if (i === v.dragItem) return;
      const [x, y] = itemSlot(i);
      drawItem(ctx, itemDef(it.kind), x, y + Math.sin(time * 3 + i) * 2, i === v.hoverItem ? 1.12 : 1, time);
    });
  }
  ctx.restore();
}

export function drawItem(ctx: CanvasRenderingContext2D, def: ItemDef, x: number, y: number, scale: number, time: number) {
  const size = 54 * scale;
  if (def.rarity !== 'c') {
    const pulse = 0.6 + Math.sin(time * 4) * 0.25;
    const g = ctx.createRadialGradient(x, y, 4, x, y, size * 0.85);
    g.addColorStop(0, hexA(RARITY_COLOR[def.rarity], pulse));
    g.addColorStop(1, hexA(RARITY_COLOR[def.rarity], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.85, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(x + 4, y + size * 0.42, size * 0.38, size * 0.12, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  emoji(ctx, def.icon, x, y, size);
}

// ---- 매트 ----

export function drawMat(ctx: CanvasRenderingContext2D, highlight: boolean) {
  const m = ZONES.mat;
  shadow(ctx, m, 14, 5, 8, 0.3);
  rr(ctx, m, 14);
  ctx.fillStyle = '#2f6f57';
  ctx.fill();
  ctx.save();
  rr(ctx, m, 14);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = m.x + 20; x < m.x + m.w; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, m.y);
    ctx.lineTo(x, m.y + m.h);
    ctx.stroke();
  }
  for (let y = m.y + 20; y < m.y + m.h; y += 20) {
    ctx.beginPath();
    ctx.moveTo(m.x, y);
    ctx.lineTo(m.x + m.w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  for (let x = m.x + 20, k = 0; x < m.x + m.w; x += 20, k++) {
    ctx.beginPath();
    ctx.moveTo(x, m.y);
    ctx.lineTo(x, m.y + (k % 5 === 4 ? 14 : 7));
    ctx.stroke();
  }
  ctx.restore();
  ctx.font = `800 13px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CUTTING MAT · A2', m.x + m.w - 14, m.y + m.h - 12);
  rr(ctx, m, 14);
  ctx.lineWidth = highlight ? 5 : 3;
  ctx.strokeStyle = highlight ? '#9dff8a' : '#1f4d3c';
  ctx.stroke();
}

// ---- 노트북 (상점) ----

export function drawLaptop(ctx: CanvasRenderingContext2D, hover: boolean, badge: boolean, time: number) {
  const l = ZONES.laptop;
  const screen = { x: l.x + 20, y: l.y, w: l.w - 40, h: 130 };
  const base = { x: l.x, y: l.y + 136, w: l.w, h: 100 };
  shadow(ctx, { x: l.x, y: l.y, w: l.w, h: l.h - 4 }, 12, 6, 10, 0.35);
  rr(ctx, screen, 10);
  ctx.fillStyle = '#2a2f3a';
  ctx.fill();
  const sg = ctx.createLinearGradient(0, screen.y, 0, screen.y + screen.h);
  sg.addColorStop(0, hover ? '#4fb3ff' : '#2f86d9');
  sg.addColorStop(1, hover ? '#2b6fd6' : '#1d4f9e');
  rr(ctx, { x: screen.x + 10, y: screen.y + 10, w: screen.w - 20, h: screen.h - 20 }, 6);
  ctx.fillStyle = sg;
  ctx.fill();
  emoji(ctx, '🛒', screen.x + 52, screen.y + screen.h / 2, 44);
  label(ctx, '뽁팡 쇼핑', screen.x + 170, screen.y + screen.h / 2 - 12, 26, '#fff');
  label(ctx, '도구 · 뽁뽁이 · 택배 · 연구', screen.x + 170, screen.y + screen.h / 2 + 20, 14, '#cfe6ff', 700);
  rr(ctx, base, 12);
  ctx.fillStyle = '#c3c9d3';
  ctx.fill();
  ctx.fillStyle = '#9aa2ae';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 13; c++) ctx.fillRect(base.x + 22 + c * 23, base.y + 12 + r * 16, 19, 12);
  }
  ctx.fillRect(base.x + base.w / 2 - 50, base.y + 78, 100, 16);
  if (badge) {
    const pulse = 1 + Math.sin(time * 6) * 0.1;
    ctx.beginPath();
    ctx.arc(screen.x + screen.w - 6, screen.y + 6, 16 * pulse, 0, TAU);
    ctx.fillStyle = '#ff4d6d';
    ctx.fill();
    label(ctx, '!', screen.x + screen.w - 6, screen.y + 7, 20);
  }
}

// ---- 도구함 ----

export function drawTools(ctx: CanvasRenderingContext2D, state: GameState) {
  const t = ZONES.tools;
  shadow(ctx, t, 14, 4, 8, 0.3);
  rr(ctx, t, 14);
  ctx.fillStyle = '#5a3b26';
  ctx.fill();
  rr(ctx, { x: t.x + 8, y: t.y + 8, w: t.w - 16, h: t.h - 16 }, 10);
  ctx.fillStyle = '#3c271a';
  ctx.fill();
  const slotW = (t.w - 30) / TOOLS.length;
  TOOLS.forEach((tool, i) => {
    const x = t.x + 15 + slotW * (i + 0.5);
    const y = t.y + 52;
    const owned = i <= state.tool;
    if (i === state.tool) {
      ctx.beginPath();
      ctx.roundRect(x - slotW / 2 + 4, t.y + 14, slotW - 8, t.h - 28, 10);
      ctx.fillStyle = 'rgba(255,226,122,0.18)';
      ctx.fill();
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = owned ? 1 : 0.25;
    emoji(ctx, owned ? tool.icon : '❔', x, y - 4, 40);
    ctx.globalAlpha = 1;
    label(ctx, owned ? tool.name : '???', x, y + 40, 14, owned ? '#fff' : '#9a8670', 700);
  });
}

// ---- 도감 ----

export function drawBook(ctx: CanvasRenderingContext2D, found: number) {
  const b = ZONES.book;
  emoji(ctx, '📖', b.x + b.w / 2, b.y + 50, 64);
  label(ctx, `도감 ${found} / ${ITEMS.length}`, b.x + b.w / 2, b.y + 112, 18, '#ffe27a');
}

// ---- 상단 바 ----

export function drawHud(ctx: CanvasRenderingContext2D, state: GameState, shownMoney: number, bump: number, format: (n: number) => string) {
  const h = ZONES.hud;
  const g = ctx.createLinearGradient(0, 0, 0, h.h);
  g.addColorStop(0, 'rgba(10,8,6,0.85)');
  g.addColorStop(1, 'rgba(10,8,6,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, h.h);
  ctx.save();
  ctx.translate(40, h.h / 2);
  ctx.scale(1 + bump * 0.12, 1 + bump * 0.12);
  emoji(ctx, '💰', 0, 0, 34);
  label(ctx, format(shownMoney) + '원', 30, 1, 34, '#ffe27a', 900, 'left');
  ctx.restore();
  label(ctx, `📦 ${state.stats.boxes}   🫧 ${format(state.stats.popped)}   🔨 ${state.stats.sold}`, VW / 2 - 90, h.h / 2, 20, '#e8dccb', 700);

  // 최종 목표
  const bar = { x: VW - 470, y: 18, w: 440, h: 28 };
  const frac = state.ended || state.finale ? 1 : Math.min(1, state.money / GOAL.cost);
  rr(ctx, bar, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  if (frac > 0) {
    rr(ctx, { ...bar, w: Math.max(28, bar.w * frac) }, 14);
    const bg = ctx.createLinearGradient(bar.x, 0, bar.x + bar.w, 0);
    bg.addColorStop(0, '#ffb703');
    bg.addColorStop(1, '#ffe27a');
    ctx.fillStyle = bg;
    ctx.fill();
  }
  const goalText = state.ended
    ? '🏆 엔딩 달성! 자유롭게 놀아요'
    : state.finale
      ? '🌍 초대형 뽁뽁이를 터뜨려라!'
      : `🎯 ${GOAL.name}  ${format(state.money)} / ${format(GOAL.cost)}원`;
  label(ctx, goalText, bar.x + bar.w / 2, bar.y + bar.h / 2 + 1, 14, '#fff', 800);
}

// ---- 도구 커서 ----

export function drawToolCursor(ctx: CanvasRenderingContext2D, tool: number, x: number, y: number, pressed: boolean, time: number) {
  const t = TOOLS[tool];
  if (tool > 0) {
    ctx.beginPath();
    ctx.arc(x, y, t.radius, 0, TAU);
    ctx.strokeStyle = pressed ? 'rgba(255,226,122,0.8)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -time * 30;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const size = 34 + tool * 6;
  ctx.save();
  ctx.translate(x + size * 0.25, y + size * 0.3);
  ctx.rotate(pressed ? 0.25 : 0);
  ctx.scale(pressed ? 0.88 : 1, pressed ? 0.88 : 1);
  emoji(ctx, t.icon, 0, 0, size);
  ctx.restore();
}

// ---- 색 도우미 ----

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
