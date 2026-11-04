// Unity-style float colours (0..1)
export interface Color { r: number; g: number; b: number; a: number }
export const C = (r: number, g: number, b: number, a = 1): Color => ({ r, g, b, a });
export const WHITE: Color = C(1, 1, 1, 1);
export const BLACK: Color = C(0, 0, 0, 1);
export const CLEAR: Color = C(0, 0, 0, 0);
export const GRAY: Color = C(0.5, 0.5, 0.5, 1);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
export const lerpUnclamped = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpColor = (a: Color, b: Color, t: number): Color => {
  t = clamp01(t);
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t };
};
export const withAlpha = (c: Color, a: number): Color => ({ r: c.r, g: c.g, b: c.b, a });
export const mul = (c: Color, k: number): Color => ({ r: c.r * k, g: c.g * k, b: c.b * k, a: c.a * k });

export function hex(h: string, a = 1): Color {
  const s = h.replace('#', '');
  const n = parseInt(s.slice(0, 6), 16);
  const alpha = s.length >= 8 ? parseInt(s.slice(6, 8), 16) / 255 : a;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha };
}
export const fromRGB = (rgb: [number, number, number], a = 1): Color => ({ r: rgb[0], g: rgb[1], b: rgb[2], a });

const to255 = (v: number) => Math.round(clamp01(v) * 255);
export const tintOf = (c: Color) => (to255(c.r) << 16) | (to255(c.g) << 8) | to255(c.b);
export const cssColor = (c: Color) => (c.a >= 1 ? `rgb(${to255(c.r)},${to255(c.g)},${to255(c.b)})` : `rgba(${to255(c.r)},${to255(c.g)},${to255(c.b)},${clamp01(c.a)})`);
/** Unity ColorUtility.ToHtmlStringRGB → "#RRGGBB" */
export const htmlHex = (c: Color) => '#' + [c.r, c.g, c.b].map(v => to255(v).toString(16).padStart(2, '0')).join('').toUpperCase();
export const colorize = (s: string, c: Color) => `<color=${htmlHex(c)}>${s}</color>`;
