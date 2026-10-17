// 실제 녹음 효과음 불러오기.
// public/sounds/manifest.json 에 적힌 파일만 불러온다. 없는 소리는 합성음으로 대신한다.
//
// manifest.json 예시:
// {
//   "pop":   { "files": ["pop-recording.m4a"], "slice": true },   ← 뽁뽁이 여러 번 터뜨린 긴 녹음 하나 → 자동으로 한 알씩 잘라 씀
//   "thud":  { "files": ["box-thud-1.ogg", "box-thud-2.ogg"] },   ← 짧은 파일 여러 개 → 무작위로 골라 씀
//   ...
// }

export type SampleId =
  | 'pop' // 뽁뽁이 터지는 소리 (가장 중요)
  | 'squeak' // 뽁뽁이를 눌렀는데 안 터질 때
  | 'tape' // 테이프 뜯기
  | 'thud' // 상자가 책상에 떨어짐
  | 'flap' // 상자 날개 열림
  | 'crumple' // 비닐 구기기 / 쓰레기통
  | 'coin' // 동전, 판매
  | 'glass' // 유리 깨짐 (다이아)
  | 'ice' // 얼음 깨짐 (보냉)
  | 'gavel' // 경매 망치
  | 'bell' // 주문벨
  | 'press' // 프레스 쾅
  | 'meow'; // 고양이

interface Entry {
  files: string[];
  /** 긴 녹음에서 터지는 순간들을 찾아 잘라 쓴다 */
  slice?: boolean;
}

export class SampleBank {
  private buffers = new Map<SampleId, AudioBuffer[]>();

  has(id: SampleId): boolean {
    return (this.buffers.get(id)?.length ?? 0) > 0;
  }

  count(id: SampleId): number {
    return this.buffers.get(id)?.length ?? 0;
  }

  pick(id: SampleId): AudioBuffer | null {
    const list = this.buffers.get(id);
    if (!list?.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  /** manifest.json 을 읽고 파일들을 불러온다. 실패해도 조용히 넘어간다 (합성음 사용) */
  async load(ctx: BaseAudioContext, base = 'sounds/'): Promise<string[]> {
    const loaded: string[] = [];
    let manifest: Partial<Record<SampleId, Entry>>;
    try {
      const res = await fetch(base + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) return loaded;
      manifest = await res.json();
    } catch {
      return loaded;
    }
    for (const [id, entry] of Object.entries(manifest) as [SampleId, Entry][]) {
      const list: AudioBuffer[] = [];
      for (const file of entry.files ?? []) {
        try {
          const res = await fetch(base + file);
          if (!res.ok) continue;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          if (entry.slice) list.push(...sliceOnsets(ctx, buf));
          else list.push(normalize(ctx, buf));
        } catch {
          // 이 파일은 건너뜀
        }
      }
      if (list.length) {
        this.buffers.set(id, list);
        loaded.push(`${id}(${list.length})`);
      }
    }
    return loaded;
  }
}

/** 소리 크기를 일정하게 맞춘다 (가장 큰 값을 0.9로) */
function normalize(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak < 1e-4) return buf;
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = (src[i] / peak) * 0.9;
  }
  return out;
}

/**
 * 긴 녹음에서 "뽁" 하는 순간들의 위치를 찾는다 (시작 샘플, 길이).
 * 5ms 단위 소리 크기를 보고, 조용하다가 갑자기 커지는 지점을 시작으로 잡는다.
 */
export function findOnsets(mono: Float32Array, sr: number, maxLen = 0.18): { start: number; len: number }[] {
  const win = Math.max(1, Math.floor(sr * 0.005));
  const env: number[] = [];
  for (let i = 0; i < mono.length; i += win) {
    let sum = 0;
    const end = Math.min(mono.length, i + win);
    for (let j = i; j < end; j++) sum += mono[j] * mono[j];
    env.push(Math.sqrt(sum / (end - i)));
  }
  let loudest = 0;
  for (const e of env) loudest = Math.max(loudest, e);
  if (loudest < 1e-4) return [];
  const threshold = loudest * 0.25;
  const out: { start: number; len: number }[] = [];
  let quietUntil = 0;
  for (let w = 1; w < env.length; w++) {
    if (w < quietUntil) continue;
    // 갑자기 커짐 (앞 구간보다 3배 이상, 그리고 충분히 큼)
    if (env[w] > threshold && env[w] > env[w - 1] * 3) {
      const start = Math.max(0, w * win - Math.floor(sr * 0.003));
      const len = Math.min(Math.floor(sr * maxLen), mono.length - start);
      if (len < sr * 0.03) continue;
      out.push({ start, len });
      quietUntil = w + Math.floor((sr * 0.08) / win); // 같은 뽁을 두 번 잡지 않게
    }
  }
  return out;
}

/** 긴 녹음을 한 알씩 잘라 AudioBuffer 목록으로 */
export function sliceOnsets(ctx: BaseAudioContext, buf: AudioBuffer, maxLen = 0.18): AudioBuffer[] {
  const mono = mixDown(buf);
  return findOnsets(mono, buf.sampleRate, maxLen).map(({ start, len }) => {
    const seg = ctx.createBuffer(1, len, buf.sampleRate);
    const d = seg.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // 끝부분은 부드럽게 줄여서 "틱" 소리 방지
      const fade = i > len * 0.6 ? 1 - (i - len * 0.6) / (len * 0.4) : 1;
      d[i] = mono[start + i] * fade;
    }
    return normalize(ctx, seg);
  });
}

function mixDown(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels;
  }
  return out;
}
