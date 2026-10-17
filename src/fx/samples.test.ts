import { describe, expect, it } from 'vitest';
import { findOnsets } from './samples';

/** 조용한 녹음 사이사이에 "뽁" 소리(짧은 잡음 + 빠른 감쇠)를 넣은 가짜 녹음 */
function fakeRecording(sr: number, popsAt: number[], seconds: number, noise = 0.002) {
  const d = new Float32Array(Math.floor(sr * seconds));
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * noise;
  for (const t of popsAt) {
    const s = Math.floor(sr * t);
    for (let i = 0; i < sr * 0.06 && s + i < d.length; i++) {
      d[s + i] += (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.01)) * (0.6 + Math.random() * 0.4);
    }
  }
  return d;
}

describe('녹음 자동 자르기', () => {
  const sr = 44100;

  it('뽁 소리 개수만큼 정확히 잘라낸다', () => {
    const pops = [0.3, 0.8, 1.25, 1.9, 2.4, 3.1];
    const found = findOnsets(fakeRecording(sr, pops, 3.6), sr);
    expect(found.length).toBe(pops.length);
    found.forEach((f, i) => expect(Math.abs(f.start / sr - pops[i])).toBeLessThan(0.02));
  });

  it('빠르게 연달아 터뜨린 것도 따로 잡는다 (0.12초 간격)', () => {
    const pops = [0.2, 0.32, 0.44, 0.56];
    expect(findOnsets(fakeRecording(sr, pops, 1), sr).length).toBe(4);
  });

  it('조용한 녹음이면 아무것도 안 잡는다', () => {
    expect(findOnsets(new Float32Array(sr), sr)).toEqual([]);
  });

  it('잘라낸 조각은 녹음 길이를 넘지 않는다', () => {
    const found = findOnsets(fakeRecording(sr, [0.95], 1), sr);
    for (const f of found) expect(f.start + f.len).toBeLessThanOrEqual(sr);
  });
});
