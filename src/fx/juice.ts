// 화면 흔들림, 번쩍임, 히트스톱(순간 멈춤), 진동
export class Juice {
  shakeAmp = 0;
  flashAlpha = 0;
  flashColor = '#ffffff';
  hitstop = 0;
  private lastVibrate = 0;

  shake(amount: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  flash(color: string, alpha: number) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  freeze(seconds: number) {
    this.hitstop = Math.max(this.hitstop, seconds);
  }

  /** 안드로이드만 지원 (아이폰 사파리는 진동 API가 없음) */
  vibrate(pattern: number | number[], important = false) {
    if (!('vibrate' in navigator)) return;
    const now = performance.now();
    if (!important && now - this.lastVibrate < 45) return;
    this.lastVibrate = now;
    navigator.vibrate(pattern);
  }

  update(dt: number) {
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * (this.shakeAmp * 10 + 4));
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3);
    this.hitstop = Math.max(0, this.hitstop - dt);
  }

  offset(): [number, number] {
    const a = this.shakeAmp;
    return [(Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a];
  }
}
