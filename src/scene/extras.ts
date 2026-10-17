// 책상 꾸미기, 고양이, 엔딩(초대형 뽁뽁이) 그리기
import type { GameState, SheetState } from '../core/state';
import { GOAL } from '../economy/catalog';
import { drawSheet } from './bubbles';
import { emoji, label } from './draw';
import { cellCenter, ZONES, type SheetLayout } from './layout';

/** 꾸미기 소품. 고양이가 산책 중이면 제자리엔 없다 */
export function drawDecor(ctx: CanvasRenderingContext2D, s: GameState, catWalking: boolean, time: number) {
  const d = ZONES.desk;
  if (s.decor.lamp) {
    // 책상 위로 따뜻한 불빛
    const g = ctx.createRadialGradient(d.x + d.w - 20, d.y + 20, 20, d.x + d.w - 20, d.y + 20, 700);
    g.addColorStop(0, 'rgba(255,220,140,0.22)');
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    emoji(ctx, '💡', d.x + d.w - 22, d.y + 26, 40);
  }
  if (s.decor.plant) {
    const sway = Math.sin(time * 1.2) * 0.04;
    ctx.save();
    ctx.translate(115, 618);
    ctx.rotate(sway);
    emoji(ctx, '🪴', 0, -18, 58);
    ctx.restore();
  }
  if (s.decor.radio) {
    emoji(ctx, '📻', 652, 640, 40);
    // 음표가 둥실둥실
    for (let k = 0; k < 2; k++) {
      const t = (time * 0.6 + k * 0.5) % 1;
      ctx.globalAlpha = 1 - t;
      label(ctx, k ? '♫' : '♪', 652 + Math.sin((t + k) * 6) * 10, 615 - t * 50, 18, '#fff2c4', 900);
    }
    ctx.globalAlpha = 1;
  }
  if (s.decor.cat && !catWalking) {
    // 왼쪽 위에서 식빵 굽는 중
    const breathe = 1 + Math.sin(time * 2) * 0.03;
    ctx.save();
    ctx.translate(172, 100);
    ctx.scale(breathe, breathe);
    emoji(ctx, '🐈', 0, 0, 44);
    ctx.restore();
    if (Math.sin(time * 0.7) > 0.6) label(ctx, 'z', 196 + Math.sin(time * 3) * 3, 78, 14, '#e8dccb', 900);
  }
}

/** 매트 위를 걸어가는 고양이 */
export function drawWalkingCat(ctx: CanvasRenderingContext2D, L: SheetLayout, row: number, start: number, dir: 1 | -1, speed: number, time: number) {
  const step = (time - start) * speed;
  const col = dir === 1 ? step - 0.5 : L.cols - 0.5 - step;
  const [, y] = cellCenter(L, row * L.cols);
  const x = L.x0 + col * L.cell + L.cell / 2;
  const bob = Math.abs(Math.sin(time * 14)) * -6;
  ctx.save();
  ctx.translate(x, y + bob);
  if (dir === -1) ctx.scale(-1, 1);
  emoji(ctx, '🐈', 0, 0, Math.max(44, L.cell * 0.9));
  ctx.restore();
}

/** 엔딩용 초대형 뽁뽁이 배치: 책상을 거의 다 덮는다 */
export function finaleLayout(s: SheetState): SheetLayout {
  const d = ZONES.desk;
  const pad = 60;
  const cell = Math.min((d.w - pad * 2) / s.cols, (d.h - pad * 2 - 40) / s.rows);
  return { x0: d.x + (d.w - cell * s.cols) / 2, y0: d.y + 40 + (d.h - 40 - cell * s.rows) / 2, cell, cols: s.cols, rows: s.rows };
}

export function drawFinale(ctx: CanvasRenderingContext2D, f: SheetState, popAt: Float64Array, hitAt: Float64Array, age: number, time: number, damage = 1) {
  const d = ZONES.desk;
  ctx.fillStyle = 'rgba(10,6,20,0.55)';
  ctx.fillRect(d.x, d.y, d.w, d.h);
  // 배달 연출: 위에서 쿵
  const k = Math.min(1, age / 0.6);
  const L = finaleLayout(f);
  ctx.save();
  ctx.translate(0, (1 - k) * (1 - k) * -700);
  const glow = 0.4 + Math.sin(time * 3) * 0.2;
  ctx.shadowColor = `rgba(150,230,255,${glow})`;
  ctx.shadowBlur = 40;
  drawSheet(ctx, L, f, popAt, hitAt, time, damage);
  ctx.shadowBlur = 0;
  ctx.restore();
  const left = f.popped.filter((p) => !p).length;
  label(ctx, `🌍 ${GOAL.name}`, d.x + d.w / 2, d.y + 30, 28, '#ffe27a', 900);
  label(ctx, `남은 뽁뽁이 ${left}개`, d.x + d.w / 2, d.y + d.h - 22, 20, '#cfe9ff', 800);
}

/** 엔딩 순간: 화면 가득 꽃가루 */
export function drawConfettiRain(ctx: CanvasRenderingContext2D, age: number) {
  if (age > 4) return;
  const colors = ['#ffd23f', '#7fd1ff', '#ff7ab6', '#9dff8a', '#c79bff'];
  for (let k = 0; k < 120; k++) {
    const x = ((k * 137.5) % 1600) + Math.sin(age * 2 + k) * 30;
    const y = ((k * 53) % 300) - 300 + age * (220 + (k % 7) * 30);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(age * 4 + k);
    ctx.fillStyle = colors[k % colors.length];
    ctx.fillRect(-6, -3, 12, 6);
    ctx.restore();
  }
}
