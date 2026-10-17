// 자동화 기계 그리기: 컨베이어, 로봇팔, 자동 커터, 자동 프레스, 켜기/끄기 스위치
import type { BoxState, GameState } from '../core/state';
import { AUTOMATIONS, type AutoId } from '../economy/catalog';
import { emoji, label } from './draw';
import { cellCenter, rect, TAPE, ZONES, type Rect, type SheetLayout } from './layout';

/** 책상 위 자동화 스위치 자리 */
export function autoSlot(k: number): Rect {
  return rect(285 + k * 86, 556, 80, 38);
}

/** 가지고 있는 자동화만 스위치로 보여준다 */
export function ownedAutos(s: GameState): AutoId[] {
  return AUTOMATIONS.filter((a) => s.auto[a.id] > 0).map((a) => a.id);
}

export function drawToggles(ctx: CanvasRenderingContext2D, s: GameState, hover: number) {
  ownedAutos(s).forEach((id, k) => {
    const r = autoSlot(k);
    const on = s.autoOn[id];
    const def = AUTOMATIONS.find((a) => a.id === id)!;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 19);
    ctx.fillStyle = on ? (hover === k ? '#5fd17a' : '#3fae5a') : hover === k ? '#6b5a4a' : '#4a3d33';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    emoji(ctx, def.icon, r.x + 20, r.y + r.h / 2 + 1, 20);
    label(ctx, on ? 'ON' : 'OFF', r.x + 54, r.y + r.h / 2 + 1, 14, on ? '#fff' : '#b9a58a', 900);
  });
}

/** 컨베이어 벨트: 왼쪽에서 상자가 실려 온다 */
export function drawConveyor(ctx: CanvasRenderingContext2D, time: number) {
  const b = ZONES.box;
  const belt = rect(ZONES.desk.x + 6, b.y + 70, b.x + b.w - ZONES.desk.x + 10, b.h - 140);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(belt.x + 4, belt.y + 8, belt.w, belt.h);
  ctx.fillStyle = '#2d2f35';
  ctx.fillRect(belt.x, belt.y, belt.w, belt.h);
  // 움직이는 벨트 무늬
  ctx.save();
  ctx.beginPath();
  ctx.rect(belt.x, belt.y, belt.w, belt.h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 6;
  const shift = (time * 60) % 40;
  for (let x = belt.x - 40 + shift; x < belt.x + belt.w + 40; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, belt.y);
    ctx.lineTo(x + 16, belt.y + belt.h / 2);
    ctx.lineTo(x, belt.y + belt.h);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#8b939e';
  ctx.fillRect(belt.x, belt.y - 6, belt.w, 6);
  ctx.fillRect(belt.x, belt.y + belt.h, belt.w, 6);
}

/** 로봇팔: 상자와 매트 사이에서 일한다 */
export function drawArm(ctx: CanvasRenderingContext2D, age: number, time: number) {
  const swing = age < 0.4 ? Math.sin((age / 0.4) * Math.PI) * 0.6 : Math.sin(time * 1.5) * 0.06;
  ctx.save();
  ctx.translate(652, 150);
  ctx.rotate(-0.3 + swing);
  emoji(ctx, '🦾', 0, 0, 46);
  ctx.restore();
}

/** 자동 커터: 테이프를 따라 내려가는 가위 */
export function drawCutterBot(ctx: CanvasRenderingContext2D, desk: BoxState, time: number) {
  if (desk.open) return;
  const x = TAPE.x + TAPE.w / 2;
  const y = TAPE.y + desk.tape * TAPE.h;
  ctx.save();
  ctx.translate(x + 4, y);
  ctx.rotate(Math.PI / 2 + Math.sin(time * 30) * 0.15);
  emoji(ctx, '✂️', 0, 0, 36);
  ctx.restore();
  emoji(ctx, '🤖', x + 40, y - 18, 26);
}

/** 자동 프레스: 강철 블록이 3x3을 쾅 내려찍는다 */
export function drawPressBlock(ctx: CanvasRenderingContext2D, L: SheetLayout, index: number, age: number) {
  const DROP = 0.07;
  const LIFE = 0.3;
  if (age > LIFE) return;
  const [x, y] = cellCenter(L, index);
  const size = L.cell * 3;
  const fall = age < DROP ? 1 - age / DROP : 0;
  const yy = y - fall * L.cell * 2.5;
  ctx.globalAlpha = age < DROP ? 0.92 : 0.92 * (1 - (age - DROP) / (LIFE - DROP));
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(x - size / 2 + 4, y - size / 2 + 6, size, size, 8);
  ctx.fill();
  const g = ctx.createLinearGradient(0, yy - size / 2, 0, yy + size / 2);
  g.addColorStop(0, '#c9d3dc');
  g.addColorStop(1, '#5d6b78');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x - size / 2, yy - size / 2, size, size, 8);
  ctx.fill();
  ctx.strokeStyle = '#e8f0f8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffcf3f';
  ctx.fillRect(x - size / 2 + 6, yy - size / 2 + 6, size - 12, 6);
  ctx.globalAlpha = 1;
}
