/**
 * 파티클 모양
 * - shard: 납작한 조각 (기본)   - spark: 반짝이는 네모
 * - flake: 하늘하늘 떨어지는 비닐 조각   - chunk: 묵직한 덩어리
 * - tri: 회전하는 삼각 유리 파편   - coin: 동전   - star: 별
 * - ring: 퍼져나가는 원 (공기 빠짐, 충격파)   - mist: 부드럽게 퍼지는 안개
 */
export type Shape = 'shard' | 'spark' | 'flake' | 'chunk' | 'tri' | 'coin' | 'star' | 'ring' | 'mist';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: Shape;
  gravity: number;
  drag: number;
  rot: number;
  spin: number;
}

export interface EmitOptions {
  color: string;
  speed: number;
  size: number;
  shape?: Shape;
  /** 아래로 끌어당기는 힘 (기본 900) */
  gravity?: number;
  /** 공기 저항 (기본 2) */
  drag?: number;
  /** 수명 [최소, 최대] 초 */
  life?: [number, number];
  /** 위로 튀어 오르는 정도 (기본 0.3) */
  lift?: number;
}

interface FloatText {
  x: number;
  y: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
}

const MAX_PARTICLES = 700;
const MAX_TEXTS = 50;
const TAU = Math.PI * 2;

export class Particles {
  private ps: Particle[] = [];
  private ts: FloatText[] = [];

  /** 예전 방식 (조각/네모) */
  burst(x: number, y: number, n: number, color: string, speed: number, size: number, spark = false) {
    this.emit(x, y, n, { color, speed, size, shape: spark ? 'spark' : 'shard' });
  }

  emit(x: number, y: number, n: number, o: EmitOptions) {
    const [lo, hi] = o.life ?? [0.35, 0.7];
    for (let i = 0; i < n && this.ps.length < MAX_PARTICLES; i++) {
      const a = Math.random() * TAU;
      const v = o.speed * (0.4 + Math.random() * 0.8);
      const max = lo + Math.random() * (hi - lo);
      this.ps.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - o.speed * (o.lift ?? 0.3),
        life: max,
        max,
        size: o.size * (0.6 + Math.random() * 0.6),
        color: o.color,
        shape: o.shape ?? 'shard',
        gravity: o.gravity ?? 900,
        drag: o.drag ?? 2,
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 16,
      });
    }
  }

  /** 제자리에서 퍼지는 링/안개 하나 */
  pulse(x: number, y: number, shape: 'ring' | 'mist', color: string, size: number, life = 0.4) {
    if (this.ps.length >= MAX_PARTICLES) return;
    this.ps.push({ x, y, vx: 0, vy: 0, life, max: life, size, color, shape, gravity: 0, drag: 0, rot: 0, spin: 0 });
  }

  text(x: number, y: number, text: string, color: string, size: number) {
    if (this.ts.length >= MAX_TEXTS) this.ts.shift();
    this.ts.push({ x: x + (Math.random() - 0.5) * 10, y, life: 0.8, max: 0.8, text, color, size });
  }

  update(dt: number) {
    for (const p of this.ps) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - p.drag * dt;
      if (p.shape === 'flake') {
        // 비닐 조각은 좌우로 하늘하늘
        p.vx += Math.sin(p.life * 12 + p.rot) * 300 * dt;
        p.vy *= 1 - 3 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.ps = this.ps.filter((p) => p.life > 0);
    for (const t of this.ts) {
      t.life -= dt;
      t.y -= 60 * dt;
    }
    this.ts = this.ts.filter((t) => t.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.ps) {
      const k = p.life / p.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.shape) {
        case 'spark': {
          const s = p.size * k;
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          break;
        }
        case 'ring':
          // 퍼지면서 얇아지는 원
          ctx.lineWidth = Math.max(1, p.size * 0.12 * k);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - k), 0, TAU);
          ctx.stroke();
          break;
        case 'mist': {
          const r = p.size * (1.8 - k * 0.8);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, p.color);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = k * 0.7;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fill();
          break;
        }
        case 'tri':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.8, p.size * 0.7);
          ctx.lineTo(-p.size * 0.6, p.size * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = k * 0.9;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
          break;
        case 'coin':
          // 회전하는 동전 (납작해졌다 넓어졌다)
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * Math.abs(Math.cos(p.rot)) + 1, p.size, 0, 0, TAU);
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#a87510';
          ctx.stroke();
          break;
        case 'star':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? p.size * 0.45 : p.size;
            const a = (i / 10) * TAU;
            if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        case 'chunk':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.roundRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4, p.size * 0.5);
          ctx.fill();
          ctx.restore();
          break;
        case 'flake':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = k * 0.8;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.35 * Math.abs(Math.sin(p.rot * 2)) + 0.8, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        default:
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.5, Math.atan2(p.vy, p.vx), 0, TAU);
          ctx.fill();
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.ts) {
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `800 ${Math.round(t.size * pop)}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
