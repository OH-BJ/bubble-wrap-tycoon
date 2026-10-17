import type { SheetState } from '../core/state';
import { WRAPS, type WrapStyle } from '../economy/catalog';
import type { Kind, PoppableKind } from '../sheet/bubble';
import { cellCenter, type SheetLayout } from './layout';

const TAU = Math.PI * 2;
const POP_ANIM = 0.09;

const SPECIAL: Record<'g' | 'b' | 'm' | 's', [string, string, string]> = {
  g: ['#fff8c4', '#e8a900', '#ffe066'],
  b: ['#ffd0c8', '#d8382a', '#ff8a7a'],
  m: ['#f3e2ff', '#9a5cf0', '#d4b0ff'],
  s: ['#ffffff', '#ffd6e2', '#ff6a8a'],
};

export const KIND_COLOR: Record<Kind, string> = {
  n: '#e6f4ff',
  g: '#ffd23f',
  b: '#ff6a4d',
  m: '#c79bff',
  s: '#ff6a8a',
  d: '#8899aa',
};

// 칸마다 고정된 무작위 값 (터진 자국 모양용)
export function hash(i: number, k: number): number {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---- 스프라이트 캐시: 그라디언트를 매 프레임 그리지 않도록 ----

const sprites = new Map<string, HTMLCanvasElement>();
let pixelScale = 1;

/** 화면 확대 비율이 바뀌면 다시 그린다 */
export function resetSprites(scale: number) {
  sprites.clear();
  pixelScale = scale;
}

/** 뽁뽁이 외곽선: 다이아는 팔각 보석, 나머지는 동그라미 */
function outline(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, style: WrapStyle) {
  ctx.beginPath();
  if (style === 'diamond') {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + TAU / 16;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, TAU);
  }
}

// 등급마다 생김새가 다르다: 얇은 비닐은 가볍게, 두꺼운 건 테두리가 두껍게, 황금은 금속광, 다이아는 보석
function paintBubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, kind: PoppableKind, grade: number) {
  const style = WRAPS[grade].id;
  const [inner, outer, rim] = kind === 'n' ? WRAPS[grade].tint : SPECIAL[kind];
  outline(ctx, x + r * 0.08, y + r * 0.14, r, style);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();

  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  if (kind === 'n' && style === 'rainbow') {
    // 무지개: 색이 빙글 도는 띠
    const cg = ctx.createConicGradient(0, x, y);
    ['#ff8fb1', '#ffd36e', '#a6f0a0', '#7fd1ff', '#c9a0ff', '#ff8fb1'].forEach((c, i) => cg.addColorStop(i / 5, c));
    outline(ctx, x, y, r, style);
    ctx.fillStyle = cg;
    ctx.fill();
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0.05)');
  } else if (kind === 'n' && style === 'gold') {
    // 금속: 밝음-어두움-밝음 띠
    g.addColorStop(0, '#fffbe6');
    g.addColorStop(0.45, '#f0c040');
    g.addColorStop(0.75, '#a87510');
    g.addColorStop(1, '#ffd966');
  } else {
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
  }
  outline(ctx, x, y, r, style);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * (style === 'thick' ? 0.16 : style === 'thin' ? 0.04 : 0.07));
  ctx.strokeStyle = rim;
  ctx.stroke();

  if (style === 'diamond') {
    // 보석 면
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + TAU / 16;
      ctx.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.stroke();
    outline(ctx, x, y, r * 0.45, style);
    ctx.stroke();
  } else if (style === 'ice' && kind === 'n') {
    // 성에 낀 얼음 알갱이
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.4;
      const d = r * (0.35 + (k % 3) * 0.17);
      ctx.fillRect(x + Math.cos(a) * d - 1, y + Math.sin(a) * d - 1, 2.2, 2.2);
    }
  } else if (style === 'big') {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0.3, 2.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.stroke();
  }

  if (kind === 'b') {
    ctx.beginPath();
    ctx.arc(x, y + r * 0.05, r * 0.3, 0, TAU);
    ctx.fillStyle = '#3a0f0f';
    ctx.fill();
  } else if (kind === 'm') {
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(r * 0.75)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x2', x, y + r * 0.05);
  } else if (kind === 's') {
    // 사탕 줄무늬
    ctx.save();
    outline(ctx, x, y, r * 0.92, style);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,90,130,0.75)';
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * r * 0.55 - r, y + r);
      ctx.lineTo(x + k * r * 0.55 - r + r * 0.25, y + r);
      ctx.lineTo(x + k * r * 0.55 + r + r * 0.25, y - r);
      ctx.lineTo(x + k * r * 0.55 + r, y - r);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.38, r * (style === 'big' ? 0.34 : 0.28), r * 0.15, -0.6, 0, TAU);
  ctx.fillStyle = style === 'thick' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.75)';
  ctx.fill();
  if (style === 'big' || style === 'gold') {
    ctx.beginPath();
    ctx.arc(x + r * 0.35, y + r * 0.3, r * 0.08, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }
}

function sprite(kind: PoppableKind, r: number, grade: number): HTMLCanvasElement {
  const key = `${kind}:${grade}:${r.toFixed(1)}`;
  let c = sprites.get(key);
  if (!c) {
    const size = Math.ceil(r * 2.6 * pixelScale);
    c = document.createElement('canvas');
    c.width = c.height = Math.max(1, size);
    const g = c.getContext('2d')!;
    g.scale(pixelScale, pixelScale);
    paintBubble(g, (r * 2.6) / 2, (r * 2.6) / 2, r, kind, grade);
    sprites.set(key, c);
  }
  return c;
}

export function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  kind: PoppableKind,
  grade: number,
  time: number,
  i: number,
  scale = 1,
) {
  if (kind === 'g') scale *= 1 + Math.sin(time * 5 + i) * 0.04;
  const s = (r * 2.6 * scale) / 2;
  ctx.drawImage(sprite(kind, r, grade), x - s, y - s, s * 2, s * 2);
  r *= scale;

  if (kind === 'b') {
    const flicker = 0.6 + Math.sin(time * 20 + i * 3) * 0.4;
    ctx.beginPath();
    ctx.arc(x + r * 0.22, y - r * 0.25, r * 0.1 * (0.7 + flicker * 0.5), 0, TAU);
    ctx.fillStyle = `rgb(255,${180 + flicker * 60},80)`;
    ctx.fill();
  } else if (kind === 'g') {
    const a = time * 2 + i;
    const sx = x + Math.cos(a) * r * 0.5;
    const sy = y + Math.sin(a) * r * 0.5;
    const z = r * 0.22 * (0.6 + Math.abs(Math.sin(time * 6 + i)) * 0.6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(sx, sy - z);
    ctx.lineTo(sx + z * 0.25, sy);
    ctx.lineTo(sx, sy + z);
    ctx.lineTo(sx - z * 0.25, sy);
    ctx.closePath();
    ctx.moveTo(sx - z, sy);
    ctx.lineTo(sx, sy + z * 0.25);
    ctx.lineTo(sx + z, sy);
    ctx.lineTo(sx, sy - z * 0.25);
    ctx.closePath();
    ctx.fill();
  }
}

// 터진 뒤 납작하게 쭈글쭈글해진 자국
function drawFlat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, i: number, kind: Kind) {
  const pts = 9;
  ctx.beginPath();
  for (let k = 0; k < pts; k++) {
    const a = (k / pts) * TAU;
    const rr = r * (0.72 + hash(i, k) * 0.22);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = kind === 'd' ? 'rgba(90,100,110,0.18)' : 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = kind === 'g' ? 'rgba(255,210,63,0.45)' : 'rgba(255,255,255,0.28)';
  ctx.stroke();

  ctx.beginPath();
  for (let k = 0; k < 2; k++) {
    const a = hash(i, k + 20) * TAU;
    const len = r * (0.3 + hash(i, k + 30) * 0.3);
    ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();
}

// ---- 재질별 손상 연출 ----

/** 재질별 강조색 (내구도 링, 한 방 남음 빛) */
export function materialColor(style: WrapStyle, time = 0, i = 0): string {
  switch (style) {
    case 'thick':
      return '#5fd6b8';
    case 'ice':
      return '#bfefff';
    case 'big':
      return '#f3a6ff';
    case 'gold':
      return '#ffd23f';
    case 'rainbow':
      return `hsl(${(time * 160 + i * 40) % 360},90%,65%)`;
    case 'diamond':
      return '#9ff0ff';
    default:
      return '#e6f4ff';
  }
}

/** 금 한 줄: 안쪽에서 바깥으로 꺾이며 뻗는다 */
function crackLine(ctx: CanvasRenderingContext2D, ox: number, oy: number, a: number, len: number, i: number, k: number) {
  ctx.moveTo(ox, oy);
  const mid = a + (hash(i, k + 50) - 0.5) * 0.9;
  ctx.lineTo(ox + Math.cos(mid) * len * 0.5, oy + Math.sin(mid) * len * 0.5);
  ctx.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
}

/**
 * 힘이 모자라 아직 안 터진 뽁뽁이.
 * - 두꺼운: 고무처럼 움푹 패고 주름   - 보냉: 성에가 끼고 얼음 금
 * - 대왕: 출렁출렁, 늘어난 자국        - 황금: 금속이 찍히고 긁힘
 * - 무지개: 색이 일렁이고 무지개 금    - 다이아: 맞은 자리에서 방사형 유리 금
 * 공통: 내구도 링, 한 방 남으면 부들부들 떨며 빛남
 */
function drawDamaged(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  kind: PoppableKind,
  grade: number,
  health: number,
  hitAge: number,
  nearBreak: boolean,
  time: number,
  i: number,
) {
  const style = WRAPS[grade].id;
  const dmg = 1 - health;
  const fresh = hitAge < 0.2;
  ctx.save();
  ctx.translate(x, y);
  if (nearBreak) ctx.translate(Math.sin(time * 70 + i) * 1.6, Math.cos(time * 60 + i) * 1.2);

  // 모양 변화: 말랑한 건 눌리고 출렁, 딱딱한 건 살짝만 흔들림
  let sx = 1;
  let sy = 1;
  if (style === 'big') {
    const w = Math.sin(hitAge * 32) * Math.exp(-hitAge * 5) * 0.16;
    sx = (1 + w) * (0.9 + 0.1 * health);
    sy = (1 - w) * (0.9 + 0.1 * health);
  } else if (style === 'thick' || style === 'gold' || style === 'rainbow') {
    const sq = fresh ? Math.sin((hitAge / 0.2) * Math.PI) * (style === 'thick' ? 0.22 : 0.1) : 0;
    sx = (1 + sq) * (0.86 + 0.14 * health);
    sy = (1 - sq) * (0.86 + 0.14 * health);
  } else if (fresh) {
    ctx.translate((hash(i, Math.floor(hitAge * 60)) - 0.5) * 2.5, (hash(i, Math.floor(hitAge * 60) + 7) - 0.5) * 2.5);
  }
  ctx.scale(sx, sy);
  drawBubble(ctx, 0, 0, r, kind, grade, time, i);

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.98, 0, TAU);
  ctx.clip();
  ctx.lineCap = 'round';
  switch (style) {
    case 'thick': {
      // 움푹 팬 자국 + 주름
      const dx = (hash(i, 61) - 0.5) * r * 0.5;
      const dy = (hash(i, 62) - 0.5) * r * 0.5;
      const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, r * (0.25 + dmg * 0.45));
      g.addColorStop(0, 'rgba(10,60,50,0.45)');
      g.addColorStop(1, 'rgba(10,60,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = 'rgba(20,70,60,0.5)';
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath();
      for (let k = 0; k < Math.ceil(dmg * 3); k++) {
        const a = hash(i, k + 70) * TAU;
        ctx.moveTo(dx + Math.cos(a) * r * (0.3 + k * 0.15), dy + Math.sin(a) * r * (0.3 + k * 0.15));
        ctx.arc(dx, dy, r * (0.3 + k * 0.15), a, a + 1.4);
      }
      ctx.stroke();
      break;
    }
    case 'ice': {
      // 성에 + 하얀 얼음 금 (가지를 침)
      ctx.fillStyle = `rgba(255,255,255,${dmg * 0.45})`;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.beginPath();
      const n = Math.ceil(dmg * 6);
      for (let k = 0; k < n; k++) {
        const a = hash(i, k + 40) * TAU;
        crackLine(ctx, 0, 0, a, r * (0.6 + hash(i, k) * 0.4), i, k);
        // 잔가지
        crackLine(ctx, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, a + 0.9, r * 0.3, i, k + 9);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,120,160,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    case 'big': {
      // 늘어난 자국 (가로 줄무늬)
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + dmg * 0.35})`;
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.beginPath();
      for (let k = 0; k < Math.ceil(dmg * 5); k++) {
        const yy = (hash(i, k + 80) - 0.5) * r * 1.4;
        const w = r * (0.3 + hash(i, k + 81) * 0.5);
        ctx.moveTo(-w, yy);
        ctx.quadraticCurveTo(0, yy + r * 0.08, w, yy);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(120,40,140,${dmg * 0.18})`;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      break;
    }
    case 'gold': {
      // 찍힌 자국 (어두운 점 + 밝은 테두리) + 긁힌 선
      for (let k = 0; k < Math.ceil(dmg * 7); k++) {
        const px = (hash(i, k + 90) - 0.5) * r * 1.3;
        const py = (hash(i, k + 91) - 0.5) * r * 1.3;
        const pr = r * (0.08 + hash(i, k + 92) * 0.08);
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, TAU);
        ctx.fillStyle = 'rgba(110,70,0,0.55)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px - pr * 0.2, py - pr * 0.2, pr, Math.PI * 0.9, Math.PI * 1.6);
        ctx.strokeStyle = 'rgba(255,250,200,0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,230,0.6)';
      ctx.beginPath();
      for (let k = 0; k < Math.ceil(dmg * 3); k++) {
        const a = hash(i, k + 95) * Math.PI;
        const o = (hash(i, k + 96) - 0.5) * r;
        ctx.moveTo(Math.cos(a) * -r * 0.6, o + Math.sin(a) * -r * 0.2);
        ctx.lineTo(Math.cos(a) * r * 0.6, o + Math.sin(a) * r * 0.2);
      }
      ctx.stroke();
      break;
    }
    case 'rainbow': {
      // 색이 일렁임 + 무지개색 금
      ctx.fillStyle = `hsla(${(time * 200 + i * 30) % 360},90%,60%,${dmg * 0.35})`;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      const n = Math.ceil(dmg * 5);
      for (let k = 0; k < n; k++) {
        ctx.strokeStyle = `hsl(${(k * 70 + time * 120) % 360},95%,62%)`;
        ctx.beginPath();
        crackLine(ctx, 0, 0, hash(i, k + 40) * TAU, r * 0.9, i, k);
        ctx.stroke();
      }
      break;
    }
    case 'diamond': {
      // 맞은 자리에서 방사형 유리 금 + 동심원 금
      const ix = (hash(i, 63) - 0.5) * r * 0.6;
      const iy = (hash(i, 64) - 0.5) * r * 0.6;
      ctx.beginPath();
      const n = Math.ceil(dmg * 9);
      for (let k = 0; k < n; k++) crackLine(ctx, ix, iy, (k / n) * TAU + hash(i, k) * 0.5, r * (0.5 + hash(i, k + 3) * 0.7), i, k);
      if (dmg > 0.4) {
        ctx.moveTo(ix + r * 0.35, iy);
        ctx.arc(ix, iy, r * 0.35, 0, TAU * dmg);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1, r * 0.035);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(40,110,150,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (fresh) {
        // 반짝
        const s = r * 0.4;
        ctx.globalAlpha = 1 - hitAge / 0.2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(ix, iy - s);
        ctx.lineTo(ix + s * 0.18, iy);
        ctx.lineTo(ix, iy + s);
        ctx.lineTo(ix - s * 0.18, iy);
        ctx.closePath();
        ctx.moveTo(ix - s, iy);
        ctx.lineTo(ix, iy + s * 0.18);
        ctx.lineTo(ix + s, iy);
        ctx.lineTo(ix, iy - s * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      break;
    }
    default: {
      ctx.strokeStyle = 'rgba(40,40,60,0.55)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      for (let k = 0; k < Math.ceil(dmg * 5); k++) crackLine(ctx, 0, 0, hash(i, k + 40) * TAU, r * 0.85, i, k);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();

  // 내구도 링: 남은 만큼만 재질 색으로
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(x, y, r * 1.12, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = materialColor(style, time, i);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.12, -Math.PI / 2, -Math.PI / 2 + TAU * health);
  ctx.stroke();
  if (nearBreak) {
    // 한 방 남음: 테두리가 깜빡이며 빛남
    ctx.globalAlpha = 0.5 + Math.sin(time * 18) * 0.4;
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.02, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** 매트 위에 펼쳐진 뽁뽁이 시트 */
export function drawSheet(
  ctx: CanvasRenderingContext2D,
  L: SheetLayout,
  s: SheetState,
  popAt: Float64Array,
  hitAt: Float64Array,
  time: number,
  /** 한 번 문지를 때 깎이는 양 ("한 방 남음" 표시용) */
  damage = 1,
) {
  const maxHp = WRAPS[s.grade].hp;
  // 비닐 바탕
  const pad = L.cell * 0.18;
  ctx.beginPath();
  ctx.roundRect(L.x0 - pad, L.y0 - pad, L.cell * L.cols + pad * 2, L.cell * L.rows + pad * 2, 10);
  ctx.fillStyle = s.cleared ? 'rgba(230,240,250,0.16)' : 'rgba(230,245,255,0.22)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();

  const r = Math.round(L.cell * 0.42 * 10) / 10;
  for (let i = 0; i < s.cells.length; i++) {
    const [x, y] = cellCenter(L, i);
    const kind = s.cells[i];
    if (kind === 'd') {
      drawFlat(ctx, x, y, r, i, kind);
      continue;
    }
    if (!s.popped[i]) {
      const health = maxHp > 0 ? s.hp[i] / maxHp : 1;
      if (health >= 1 && time - hitAt[i] > 0.15) {
        drawBubble(ctx, x, y, r, kind, s.grade, time, i);
        continue;
      }
      // 깎인 뽁뽁이: 재질마다 다르게 망가진다
      drawDamaged(ctx, x, y, r, kind, s.grade, health, time - hitAt[i], s.hp[i] <= damage, time, i);
      continue;
    }
    drawFlat(ctx, x, y, r, i, kind);
    const t = time - popAt[i];
    if (popAt[i] >= 0 && t < POP_ANIM) {
      const k = t / POP_ANIM;
      ctx.globalAlpha = 1 - k;
      drawBubble(ctx, x, y, r, kind, s.grade, time, i, 1 + k * 0.25);
      ctx.globalAlpha = 1;
    }
  }
}

/** 접혀 있는 뽁뽁이 묶음 (상자 안이나 끌고 다닐 때) */
export function drawWrapBundle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, grade: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 4, -h / 2 + 6, w, h, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 12);
  ctx.fillStyle = 'rgba(220,240,255,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 접힌 주름
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 8, -h / 6);
  ctx.lineTo(w / 2 - 8, -h / 6 + 4);
  ctx.moveTo(-w / 2 + 8, h / 6);
  ctx.lineTo(w / 2 - 8, h / 6 - 4);
  ctx.stroke();
  const r = 9;
  for (let yy = -h / 2 + 16; yy < h / 2 - 8; yy += 22) {
    for (let xx = -w / 2 + 16; xx < w / 2 - 8; xx += 22) {
      drawBubble(ctx, xx, yy, r, 'n', grade, time, 0);
    }
  }
  ctx.restore();
}
