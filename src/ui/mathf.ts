// Unity Mathf helpers
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
export const moveTowards = (cur: number, target: number, maxDelta: number) =>
  Math.abs(target - cur) <= maxDelta ? target : cur + Math.sign(target - cur) * maxDelta;
export const smoothStep = (from: number, to: number, t: number) => { t = clamp01(t); t = -2 * t * t * t + 3 * t * t; return to * t + from * (1 - t); };
export const frac = (v: number) => v - Math.floor(v);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, bExcl: number) => Math.floor(rand(a, bExcl));
export const DEG = Math.PI / 180;
export const sign = (v: number) => (v >= 0 ? 1 : -1); // Mathf.Sign(0) == 1
