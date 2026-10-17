import type { WrapStyle } from '../economy/catalog';
import { SampleBank, type SampleId } from './samples';

// 모든 소리는 Web Audio로 합성한다. 나중에 실제 녹음 파일로 교체 예정.
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private burstAt = 0;
  private burstCount = 0;

  /** 모바일은 터치 이벤트 안에서 한 번 깨워야 소리가 난다. */
  /** 실제 녹음 효과음 (public/sounds). 없는 소리는 합성음으로 */
  readonly bank = new SampleBank();
  private bankLoading = false;

  /** 녹음이 있으면 재생하고 true. rate: 재생 속도(=음높이), 매번 살짝 흔든다 */
  private sample(id: SampleId, rate = 1, gain = 1, filter?: { type: BiquadFilterType; freq: number }, delay = 0): boolean {
    const ctx = this.ready();
    if (!ctx) return false;
    const buf = this.bank.pick(id);
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    let node: AudioNode = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    node.connect(g).connect(this.master);
    src.start(ctx.currentTime + delay);
    return true;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(comp);
      this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.bankLoading) {
      this.bankLoading = true;
      void this.bank.load(this.ctx).then((list) => {
        if (list.length) console.info('[소리] 녹음 효과음 사용:', list.join(', '));
      });
    }
  }

  private ready(): AudioContext | null {
    return this.muted || !this.ctx || this.ctx.state !== 'running' ? null : this.ctx;
  }

  private env(ctx: AudioContext, t: number, peak: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    g.connect(this.master);
    return g;
  }

  private noiseHit(ctx: AudioContext, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this.env(ctx, t, peak, decay));
    src.start(t, Math.random() * 0.2, decay + 0.02);
  }

  private tone(ctx: AudioContext, t: number, type: OscillatorType, from: number, to: number, peak: number, decay: number) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay);
    o.connect(this.env(ctx, t, peak, decay));
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  /** 콤보가 쌓일수록 음이 올라간다. */
  /** 뽁뽁이 등급마다 소리가 다르다: 톡 → 뽁 → 퍽 → 펑! → 띠링 → 쨍그랑 */
  pop(combo: number, style: WrapStyle = 'thin') {
    const ctx = this.ready();
    if (!ctx) return;
    // 한꺼번에 너무 많이 터지면 소리가 뭉개지므로 짧은 순간에 6개까지만
    const now = ctx.currentTime;
    if (now - this.burstAt > 0.03) {
      this.burstAt = now;
      this.burstCount = 0;
    }
    if (++this.burstCount > 6) return;

    const p = (1 + Math.min(combo, 40) * 0.025) * (0.9 + Math.random() * 0.2);
    if (this.bank.has('pop')) {
      const up = 1 + Math.min(combo, 40) * 0.01;
      switch (style) {
        case 'thin':
          this.sample('pop', 1.35 * up, 0.6, { type: 'highpass', freq: 900 });
          return;
        case 'parcel':
          this.sample('pop', 1.1 * up, 0.85);
          return;
        case 'thick':
          this.sample('pop', 0.8 * up, 1, { type: 'lowpass', freq: 2600 });
          return;
        case 'ice':
          this.sample('pop', 1.05 * up, 0.8);
          if (!this.sample('ice', 1.1, 0.5)) {
            for (let k = 1; k <= 3; k++) this.noiseHit(ctx, now + k * 0.025, 'highpass', 6000, 0.6, 0.18 / k, 0.02);
          }
          return;
        case 'big':
          this.sample('pop', 0.55 * up, 1.2, { type: 'lowpass', freq: 1800 });
          this.tone(ctx, now, 'sine', 140, 45, 0.5, 0.16);
          return;
        case 'gold':
          this.sample('pop', 0.95 * up, 0.8);
          if (!this.sample('coin', 1, 0.45, undefined, 0.03)) this.tone(ctx, now + 0.02, 'triangle', 2093, 2093, 0.12, 0.25);
          return;
        case 'rainbow': {
          this.sample('pop', 1 * up, 0.8);
          const notes = [523, 659, 784, 1046, 1318];
          const f = notes[combo % notes.length] * (1 + Math.floor(combo / notes.length) * 0.06);
          this.tone(ctx, now, 'triangle', f, f, 0.16, 0.25);
          return;
        }
        case 'diamond':
          this.sample('pop', 1.25 * up, 0.6);
          if (!this.sample('glass', 1.1, 0.6)) {
            for (let k = 1; k <= 4; k++) this.noiseHit(ctx, now + k * 0.03, 'highpass', 7000 + k * 500, 0.8, 0.22 / k, 0.03);
          }
          return;
      }
    }
    switch (style) {
      case 'thin':
        this.noiseHit(ctx, now, 'bandpass', 3200 * p, 1.6, 0.7, 0.03);
        this.tone(ctx, now, 'sine', 1600 * p, 400 * p, 0.25, 0.035);
        break;
      case 'parcel':
        this.noiseHit(ctx, now, 'bandpass', 2400 * p, 1.4, 0.9, 0.045);
        this.tone(ctx, now, 'sine', 1200 * p, 220 * p, 0.35, 0.05);
        break;
      case 'thick':
        this.noiseHit(ctx, now, 'lowpass', 1500 * p, 0.9, 1, 0.07);
        this.tone(ctx, now, 'sine', 520 * p, 110 * p, 0.6, 0.08);
        break;
      case 'ice':
        this.noiseHit(ctx, now, 'highpass', 4200 * p, 1.2, 0.7, 0.06);
        this.tone(ctx, now, 'triangle', 1800 * p, 1200 * p, 0.25, 0.07);
        this.tone(ctx, now + 0.01, 'sine', 400 * p, 120 * p, 0.35, 0.06);
        // 얼음이 갈라지는 바스락 꼬리
        for (let k = 1; k <= 3; k++) this.noiseHit(ctx, now + k * 0.025, 'highpass', 6000, 0.6, 0.18 / k, 0.02);
        break;
      case 'rainbow': {
        // 터질 때마다 화음 한 음씩 (콤보가 쌓이면 올라감)
        const notes = [523, 659, 784, 1046, 1318];
        const f = notes[combo % notes.length] * (1 + Math.floor(combo / notes.length) * 0.06);
        this.noiseHit(ctx, now, 'bandpass', 2400 * p, 1.2, 0.6, 0.05);
        this.tone(ctx, now, 'triangle', f, f, 0.22, 0.25);
        break;
      }
      case 'big':
        this.noiseHit(ctx, now, 'lowpass', 900 * p, 0.7, 1, 0.16);
        this.tone(ctx, now, 'sine', 260 * p, 50, 0.9, 0.18);
        break;
      case 'gold':
        this.noiseHit(ctx, now, 'bandpass', 2000 * p, 1.2, 0.7, 0.05);
        this.tone(ctx, now, 'sine', 700 * p, 160 * p, 0.4, 0.07);
        this.tone(ctx, now + 0.02, 'triangle', 2093 * p, 2093 * p, 0.12, 0.25);
        // 동전 짤랑
        this.tone(ctx, now + 0.06, 'sine', 2637, 2637, 0.06, 0.12);
        this.tone(ctx, now + 0.1, 'sine', 3136, 3136, 0.05, 0.12);
        break;
      case 'diamond':
        this.noiseHit(ctx, now, 'highpass', 5500, 0.8, 0.8, 0.09);
        this.tone(ctx, now, 'triangle', 2600 * p, 1900 * p, 0.25, 0.14);
        this.tone(ctx, now + 0.015, 'sine', 3500 * p, 3300 * p, 0.12, 0.2);
        // 유리가 와르르
        for (let k = 1; k <= 4; k++) this.noiseHit(ctx, now + k * 0.03 + Math.random() * 0.02, 'highpass', 7000 + k * 500, 0.8, 0.22 / k, 0.03);
        break;
    }
  }

  private lastSquish = 0;
  /**
   * 단단해서 안 터지고 깎이기만 할 때. 재질마다 소리가 다르고,
   * 많이 깎일수록(health↓) 음이 올라가서 터지기 직전이 귀로 느껴진다.
   */
  squish(style: WrapStyle, health: number) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastSquish < 0.04) return;
    this.lastSquish = t;
    const rise = 1 + (1 - health) * 0.8;
    if (this.bank.has('squeak')) {
      const rate: Record<WrapStyle, number> = { thin: 1.4, parcel: 1.2, thick: 0.75, ice: 1.5, big: 0.55, gold: 1.1, rainbow: 1.2, diamond: 1.7 };
      this.sample('squeak', rate[style] * (0.85 + (1 - health) * 0.4), 0.55);
      if (style === 'ice') this.sample('ice', 1.6, 0.2);
      if (style === 'diamond') this.sample('glass', 1.8, 0.15);
      return;
    }
    switch (style) {
      case 'thick':
        // 고무 "뿍": 낮게 눌렸다 튕김
        this.tone(ctx, t, 'sine', 260 * rise, 140 * rise, 0.4, 0.07);
        this.noiseHit(ctx, t, 'lowpass', 500, 0.8, 0.12, 0.05);
        break;
      case 'ice':
        // 얼음 "틱": 높고 짧게 + 사각사각
        this.tone(ctx, t, 'triangle', 2400 * rise, 2200 * rise, 0.16, 0.03);
        this.noiseHit(ctx, t, 'highpass', 5000, 0.8, 0.22, 0.035);
        break;
      case 'big':
        // 풍선 문지르는 "뿌욱": 낮게 떨림
        this.tone(ctx, t, 'sawtooth', 110 * rise, 160 * rise, 0.09, 0.12);
        this.tone(ctx, t, 'sine', 90 * rise, 70 * rise, 0.3, 0.12);
        break;
      case 'gold':
        // 금속 "깡": 맑게 울리는 두 음
        this.tone(ctx, t, 'sine', 1250 * rise, 1250 * rise, 0.16, 0.22);
        this.tone(ctx, t, 'sine', 1810 * rise, 1810 * rise, 0.1, 0.16);
        this.noiseHit(ctx, t, 'bandpass', 3000, 2, 0.15, 0.02);
        break;
      case 'rainbow': {
        // 깎을수록 한 음씩 올라가는 실로폰
        const notes = [523, 587, 659, 784, 880, 1046, 1175, 1318];
        const f = notes[Math.min(notes.length - 1, Math.floor((1 - health) * notes.length))];
        this.tone(ctx, t, 'triangle', f, f, 0.18, 0.2);
        break;
      }
      case 'diamond':
        // 유리 "팅"
        this.tone(ctx, t, 'sine', 3200 * rise, 3100 * rise, 0.13, 0.12);
        this.tone(ctx, t, 'sine', 4700 * rise, 4600 * rise, 0.06, 0.08);
        this.noiseHit(ctx, t, 'highpass', 7000, 0.7, 0.12, 0.02);
        break;
      default:
        this.tone(ctx, t, 'sine', 340 * rise, 540 * rise, 0.22, 0.06);
        this.noiseHit(ctx, t, 'lowpass', 700, 0.8, 0.15, 0.04);
    }
  }

  /** 말랑한 뽁뽁이가 다시 부풀 때 "쉬익" (아주 작게) */
  private lastInflate = 0;
  inflate() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastInflate < 0.25) return;
    this.lastInflate = t;
    this.tone(ctx, t, 'sine', 180, 260, 0.06, 0.12);
  }

  bomb() {
    if (this.sample('press', 0.7, 1) || this.sample('thud', 0.6, 1)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', 140, 38, 0.9, 0.3);
    this.noiseHit(ctx, t, 'lowpass', 900, 0.7, 0.8, 0.22);
  }

  gold() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [1046, 1568, 2093].forEach((f, i) => this.tone(ctx, t + i * 0.06, 'triangle', f, f, 0.28, 0.35));
  }

  multi() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'square', 440, 880, 0.12, 0.18);
  }

  clear() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(ctx, t + i * 0.07, 'triangle', f, f, 0.3, 0.5));
    this.noiseHit(ctx, t + 0.35, 'highpass', 6000, 0.5, 0.25, 0.6);
  }

  buy() {
    if (this.sample('coin', 1, 0.8)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'square', 988, 988, 0.12, 0.08);
    this.tone(ctx, t + 0.07, 'square', 1319, 1319, 0.12, 0.25);
  }

  click() {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(ctx, ctx.currentTime, 'sine', 700, 500, 0.15, 0.04);
  }

  private lastPress = 0;
  press() {
    if (this.sample('press', 1, 0.9)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastPress < 0.06) return;
    this.lastPress = t;
    this.tone(ctx, t, 'sine', 90, 45, 0.6, 0.15);
    this.noiseHit(ctx, t, 'lowpass', 1500, 0.8, 0.5, 0.08);
  }

  /** 딩동 */
  doorbell() {
    if (this.sample('bell', 1, 0.8)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', 1318, 1318, 0.35, 0.5);
    this.tone(ctx, t + 0.28, 'sine', 1046, 1046, 0.35, 0.7);
  }

  /** 상자가 책상에 쿵 */
  thud() {
    if (this.sample('thud', 1, 1)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', 120, 50, 0.9, 0.2);
    this.noiseHit(ctx, t, 'lowpass', 700, 0.7, 0.7, 0.15);
  }

  private lastRip = 0;
  /** 테이프 찌익 */
  rip() {
    if (this.sample('tape', 1, 0.7)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastRip < 0.035) return;
    this.lastRip = t;
    this.noiseHit(ctx, t, 'bandpass', 2600 + Math.random() * 1600, 2.5, 0.5, 0.05);
  }

  /** 상자 날개가 펄럭 */
  flap() {
    if (this.sample('flap', 1, 0.9)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseHit(ctx, t, 'lowpass', 1100, 0.6, 0.8, 0.12);
    this.noiseHit(ctx, t + 0.08, 'lowpass', 900, 0.6, 0.6, 0.12);
  }

  pickup() {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(ctx, ctx.currentTime, 'sine', 500, 900, 0.18, 0.08);
  }

  /** 휙 (쓰레기통으로) */
  whoosh() {
    if (this.sample('crumple', 1, 0.8)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    src.connect(f).connect(this.env(ctx, t, 0.6, 0.28));
    src.start(t, 0, 0.3);
  }

  /** 입찰 "띵" (입찰이 이어질수록 높아짐) */
  bid(index: number) {
    const ctx = this.ready();
    if (!ctx) return;
    const f = 660 * Math.pow(2, Math.min(index, 12) / 12);
    this.tone(ctx, ctx.currentTime, 'triangle', f, f, 0.22, 0.18);
  }

  /** 땅땅땅 */
  gavel() {
    if (this.sample('gavel', 1, 1)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      this.tone(ctx, t + k * 0.16, 'sine', 420, 160, 0.7, 0.09);
      this.noiseHit(ctx, t + k * 0.16, 'bandpass', 1800, 1.5, 0.5, 0.04);
    }
  }

  /** 떨이: 뿌우우 (실망) */
  sad() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 370, 349, 311].forEach((f, i) => this.tone(ctx, t + i * 0.22, 'sawtooth', f, i === 3 ? f * 0.9 : f, 0.12, i === 3 ? 0.6 : 0.2));
  }

  /** 야옹 */
  meow() {
    if (this.sample('meow', 1, 0.8)) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, t);
    o.frequency.linearRampToValueAtTime(900, t + 0.12);
    o.frequency.linearRampToValueAtTime(500, t + 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.45);
  }

  /** 비닐 펼치는 소리 */
  rustle() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let k = 0; k < 5; k++) this.noiseHit(ctx, t + k * 0.04, 'highpass', 3500, 0.7, 0.25, 0.05);
  }

  fanfare() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(ctx, t + i * 0.1, 'triangle', f, f, 0.32, 0.6));
    [1046, 1318, 1568].forEach((f) => this.tone(ctx, t + 0.55, 'triangle', f, f, 0.2, 1.2));
  }
}
