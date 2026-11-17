// Texture registry. Procedural sprites (Unity SpriteFactory) were exported pixel-for-pixel from the Unity project
// into public/assets/ui (sprites.json keeps their 9-slice borders). Art sprites are the Unity PNGs.
import Phaser from 'phaser';
import manifest from '../../public/assets/ui/sprites.json';
import { CARDS } from '../data/cards';

export interface SpriteRef { key: string; w: number; h: number; border: [number, number, number, number] } // border: left, bottom, right, top

const refs = new Map<string, SpriteRef>();
const UI = manifest as unknown as Record<string, { file: string; w: number; h: number; border: [number, number, number, number] }>;

export const ART = {
  // card art = every `art` named in src/data/cards.ts (+ the card back)
  cards: ['card-back', ...new Set(CARDS.map(c => c.art).filter((a): a is string => !!a))],
  elements: ['icon_dark', 'icon_fire', 'icon_ice', 'icon_light', 'icon_nature', 'icon_rock', 'icon_unknown', 'icon_water'],
  arena: ['arena_backdrop', 'arena_brazier', 'arena_column', 'arena_floor', 'field_circle_lv1', 'field_circle_lv2', 'field_circle_lv3', 'summon_circle', 'tower_pad'],
  towers: ['p1', 'p2'].flatMap(p => ['intact', 'cracked', 'damaged', 'critical', 'destroyed'].map(s => `tower_${p}_${s}`)),
};

export function preloadSprites(load: Phaser.Loader.LoaderPlugin, base = 'assets/') {
  for (const [key, v] of Object.entries(UI)) load.image('ui:' + key, base + 'ui/' + v.file);
  for (const n of ART.cards) load.image('cards:' + n, `${base}cards/${n}.png`);
  for (const n of ART.elements) load.image('elements:' + n, `${base}elements/${n}.png`);
  for (const n of ART.arena) load.image('arena:' + n, `${base}arena/${n}.png`);
  for (const n of ART.towers) load.image('towers:' + n, `${base}towers/${n}.png`);
}

export function registerSize(textures: Phaser.Textures.TextureManager) {
  for (const key of textures.getTextureKeys()) {
    if (refs.has(key)) continue;
    const src = textures.get(key).getSourceImage() as HTMLImageElement;
    const uiKey = key.startsWith('ui:') ? key.slice(3) : null;
    const b = uiKey && UI[uiKey] ? UI[uiKey].border : [0, 0, 0, 0];
    refs.set(key, { key, w: src.width, h: src.height, border: b as [number, number, number, number] });
  }
}

export function spriteRef(key: string): SpriteRef {
  const r = refs.get(key);
  if (!r) { console.warn('missing sprite', key); return refs.get('white')!; }
  return r;
}

const ui = (k: string) => spriteRef('ui:' + k);
const ringKey = (size: number, t: number) => `ring${size}_${t}`;

/** Same names/arguments as Unity UI/SpriteFactory.cs */
export const SF = {
  roundedRect: (r = 18) => ui('rounded' + r),
  roundedOutline: (r = 18, t = 3) => ui(`outline${r}_${t}`),
  circle: (size = 128) => ui('circle' + size),
  glow: (size = 128) => ui('glow' + size),
  softBlob: (size = 256) => ui('blob' + size),
  ring: (size = 256, t = 0.14) => ui(ringKey(size, t)),
  verticalGradient: () => ui('vgradient'),
  vignette: () => ui('vignette256'),
  diamond: () => ui('diamond'),
  leaf: () => ui('leaf'),
  drop: () => ui('drop'),
  beam: () => ui('beam'),
  shard: () => ui('shard'),
  softFrame: (r = 18, f = 24) => ui(`softframe${r}_${f}`),
  crack: () => ui('crack'),
  hBand: () => ui('hband'),
  flame: () => ui('flame'),
  dashedRing: (n = 16) => ui('dashring' + n),
  goldFrame: (fill = true) => ui(fill ? 'goldframeTrue' : 'goldframeFalse'),
  actionButton: () => ui('actionbtn'),
  iconSocket: () => ui('iconsocket'),
  runeCircle: (lv: number) => ui('runecircle' + lv),
  stoneFloor: () => ui('stonefloor'),
  column: () => ui('column'),
  lightShaft: () => ui('lightshaft'),
  waveBand: () => ui('waveband'),
  crystal: () => ui('crystal'),
  vine: () => ui('vine'),
};

export const art = {
  card: (id: string) => (refs.has('cards:' + id) ? spriteRef('cards:' + id) : null),
  cardBack: () => spriteRef('cards:card-back'),
  icon: (name: string) => (refs.has('elements:' + name) ? spriteRef('elements:' + name) : null),
  arena: (name: string) => spriteRef('arena:' + name),
  tower: (name: string) => (refs.has('towers:' + name) ? spriteRef('towers:' + name) : null),
};

/** Card art pre-cropped to the art window (replaces Unity's Mask + FitArt cover crop). */
export function croppedArt(textures: Phaser.Textures.TextureManager, id: string, src: SpriteRef, crop: [number, number, number, number], w: number, h: number, radius: number): SpriteRef {
  const key = `artcrop:${id}`;
  if (refs.has(key)) return refs.get(key)!;
  const S = 2; // supersample for crisp display at hover scale
  const canvas = textures.createCanvas(key, w * S, h * S)!;
  const ctx = canvas.getContext();
  const img = textures.get(src.key).getSourceImage() as HTMLImageElement;
  const sw = img.width, sh = img.height;
  let [cx, cy, cw, ch] = crop;
  if (cw <= 0 || ch <= 0) { cx = 0; cy = 0; cw = 1; ch = 1; }
  const rw = cw * sw, rh = ch * sh;
  const scale = Math.max(w / rw, h / rh);
  const size = { x: sw * scale, y: sh * scale };
  const center = { x: (cx + cw * 0.5) * size.x, y: (cy + ch * 0.5) * size.y }; // Unity crop origin = bottom-left
  // art placed so its crop centre is at the window centre
  const left = w / 2 - center.x;
  const bottom = h / 2 - center.y;
  const top = h - (bottom + size.y);
  ctx.save();
  ctx.scale(S, S);
  ctx.beginPath();
  const r = radius;
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r); ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r); ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.closePath();
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, left, top, size.x, size.y);
  ctx.restore();
  canvas.refresh();
  const ref: SpriteRef = { key, w: w * S, h: h * S, border: [0, 0, 0, 0] };
  refs.set(key, ref);
  return ref;
}
