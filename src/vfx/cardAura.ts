// Port of VFX/CardAuraView.cs — empowered / weakened card VFX (never covers name or numbers:
// glow/rays/particles sit behind the card face, only thin frost/cracks are drawn on the edges).
import { CardPower } from '../core/combat';
import { AuraStyle } from '../data/elements';
import { VFX } from '../config/vfx';
import { C, Color, hex, lerpColor } from '../ui/color';
import { addUpdate, Img, RT, V2, v2 } from '../ui/engine';
import { makeImage } from '../ui/factory';
import { clamp, clamp01, frac, lerp, moveTowards } from '../ui/mathf';
import { SF, SpriteRef } from '../ui/sprites';

enum Motion { Rise, Fall, Perimeter, Orbit, Smoke, Spread, Sparkle, Drip, Flame }

interface Particle { image: Img; phase: number; lane: number; speed: number; size: number }

interface Recipe {
  glow: Color; glowAlpha: number; pulseSpeed: number; flicker: number; rim: Color; rimAlpha: number;
  motion: Motion; particleSprite: SpriteRef | null; particleKind: 'glow' | 'leaf' | 'drop' | 'other';
  particleColor: Color; particleColor2: Color; particleSize: number; particleSpeed: number; maxParticles: number;
  rotateParticles: boolean; rays: boolean; ripples: boolean; frost: boolean; cracks: boolean; crackColor: Color;
  artTint: number; artTintColor: Color;
}

const HALF: V2 = { x: 100, y: 145 };
const hash = (x: number) => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
export const visualLevel = (level: number) => (level <= 0 ? 0 : clamp01(0.45 + 0.275 * (level - 1)));

function makeRecipe(style: AuraStyle, up: boolean, ec: Color): Recipe {
  const r: Recipe = {
    glow: ec, rim: ec, particleColor: ec, particleColor2: C(1, 1, 1), glowAlpha: up ? 1 : 0.75, rimAlpha: up ? 1 : 0.6,
    pulseSpeed: 0, flicker: 0, motion: Motion.Sparkle, particleSprite: null, particleKind: 'other', particleSize: 10, particleSpeed: 0.5,
    maxParticles: 12, rotateParticles: false, rays: false, ripples: false, frost: false, cracks: false,
    crackColor: C(0.08, 0.06, 0.05, 0.9), artTint: 0, artTintColor: C(0.25, 0.25, 0.28),
  };
  const glowP = () => { r.particleSprite = SF.glow(64); r.particleKind = 'glow'; };
  const leafP = () => { r.particleSprite = SF.leaf(); r.particleKind = 'leaf'; };
  const dropP = () => { r.particleSprite = SF.drop(); r.particleKind = 'drop'; };
  switch (style) {
    case 'Fire':
      if (up) { r.glow = hex('#FF5A1F'); r.rim = hex('#FFB347'); r.pulseSpeed = 7; r.flicker = 0.3; r.motion = Motion.Flame; r.particleSprite = SF.flame(); r.particleColor = hex('#FFD25A'); r.particleColor2 = hex('#FF5A1F'); r.particleSize = 34; r.particleSpeed = 1.6; r.maxParticles = 16; }
      else { r.glow = hex('#2A2420'); r.rim = hex('#8A817A'); r.pulseSpeed = 1.2; r.motion = Motion.Smoke; r.particleSprite = SF.softBlob(64); r.particleColor = hex('#9A948E'); r.particleColor2 = hex('#5A544E'); r.particleSize = 46; r.particleSpeed = 0.22; r.maxParticles = 8; r.artTint = 0.6; r.artTintColor = hex('#2E2C2A'); }
      break;
    case 'Water':
      if (up) { r.glow = hex('#2F86E8'); r.rim = hex('#8FD3FF'); r.pulseSpeed = 2.2; r.motion = Motion.Perimeter; glowP(); r.particleColor = hex('#CFF0FF'); r.particleColor2 = hex('#5DB6FF'); r.particleSize = 14; r.particleSpeed = 0.28; r.maxParticles = 10; r.ripples = true; }
      else { r.glow = hex('#1E2A2A'); r.rim = hex('#6A7A70'); r.pulseSpeed = 0.6; r.motion = Motion.Drip; dropP(); r.particleColor = hex('#7A8A80'); r.particleColor2 = hex('#4E5E56'); r.particleSize = 12; r.particleSpeed = 0.25; r.maxParticles = 5; r.artTint = 0.62; r.artTintColor = hex('#3A4234'); }
      break;
    case 'Nature':
      if (up) { r.glow = hex('#3FD46A'); r.rim = hex('#A6F5B8'); r.pulseSpeed = 2.6; r.motion = Motion.Rise; leafP(); r.particleColor = hex('#7CF29A'); r.particleColor2 = hex('#3DBE5E'); r.particleSize = 14; r.particleSpeed = 0.38; r.maxParticles = 11; r.rotateParticles = true; }
      else { r.glow = hex('#2A2414'); r.rim = hex('#8A7A4A'); r.pulseSpeed = 0.7; r.motion = Motion.Fall; leafP(); r.particleColor = hex('#C0924A'); r.particleColor2 = hex('#7A5A2A'); r.particleSize = 18; r.particleSpeed = 0.22; r.maxParticles = 8; r.rotateParticles = true; r.artTint = 0.58; r.artTintColor = hex('#5A4E30'); }
      break;
    case 'Ice':
      if (up) { r.glow = hex('#7FD8FF'); r.rim = hex('#E6FAFF'); r.pulseSpeed = 1.6; r.motion = Motion.Sparkle; r.particleSprite = SF.diamond(); r.particleColor = hex('#F2FCFF'); r.particleColor2 = hex('#9FE3FF'); r.particleSize = 9; r.particleSpeed = 0.6; r.maxParticles = 12; r.frost = true; }
      else { r.glow = hex('#1E3440'); r.rim = hex('#6E94A6'); r.pulseSpeed = 0.8; r.motion = Motion.Drip; dropP(); r.particleColor = hex('#AFE0F5'); r.particleColor2 = hex('#6AAAC8'); r.particleSize = 13; r.particleSpeed = 0.45; r.maxParticles = 9; r.cracks = true; r.crackColor = hex('#E8F8FF', 0.9); r.artTint = 0.5; r.artTintColor = hex('#3A4A56'); }
      break;
    case 'Rock':
      if (up) { r.glow = hex('#C9854A'); r.rim = hex('#E8B47A'); r.pulseSpeed = 1.1; r.motion = Motion.Orbit; r.particleSprite = SF.diamond(); r.particleColor = hex('#B98A5A'); r.particleColor2 = hex('#7A5A3A'); r.particleSize = 13; r.particleSpeed = 0.12; r.maxParticles = 10; r.rotateParticles = true; }
      else { r.glow = hex('#22180E'); r.rim = hex('#8A7058'); r.pulseSpeed = 0.5; r.motion = Motion.Fall; glowP(); r.particleColor = hex('#C0A888'); r.particleColor2 = hex('#7A6A5A'); r.particleSize = 9; r.particleSpeed = 0.35; r.maxParticles = 12; r.cracks = true; r.crackColor = hex('#D8B890', 0.85); r.artTint = 0.55; r.artTintColor = hex('#3E342C'); }
      break;
    case 'Light':
      if (up) { r.glow = hex('#FFE7A0'); r.rim = hex('#FFFFFF'); r.pulseSpeed = 1.4; r.motion = Motion.Sparkle; glowP(); r.particleColor = hex('#FFFFFF'); r.particleColor2 = hex('#FFE28A'); r.particleSize = 10; r.particleSpeed = 0.5; r.maxParticles = 12; r.rays = true; }
      else { r.glow = hex('#8A7E50'); r.rim = hex('#B8AE80'); r.pulseSpeed = 9; r.flicker = 0.85; r.motion = Motion.Sparkle; glowP(); r.particleColor = hex('#C8C09A'); r.particleColor2 = hex('#8A8466'); r.particleSize = 9; r.particleSpeed = 0.25; r.maxParticles = 5; r.artTint = 0.6; r.artTintColor = hex('#2E2C26'); }
      break;
    case 'Dark':
      if (up) { r.glow = hex('#7A3AFF'); r.rim = hex('#C8A0FF'); r.pulseSpeed = 1.3; r.motion = Motion.Spread; r.particleSprite = SF.softBlob(64); r.particleColor = hex('#8A5AE8'); r.particleColor2 = hex('#2A0F5A'); r.particleSize = 58; r.particleSpeed = 0.22; r.maxParticles = 14; }
      else { r.glow = hex('#2A2434'); r.rim = hex('#7A7088'); r.pulseSpeed = 0.6; r.motion = Motion.Spread; r.particleSprite = SF.softBlob(64); r.particleColor = hex('#6A6078'); r.particleColor2 = hex('#4A4058'); r.particleSize = 30; r.particleSpeed = 0.15; r.maxParticles = 4; r.artTint = 0.45; r.artTintColor = hex('#8A8498'); }
      break;
    default:
      r.motion = up ? Motion.Sparkle : Motion.Fall;
      glowP();
      r.maxParticles = up ? 8 : 4;
      r.artTint = up ? 0 : 0.35;
      break;
  }
  return r;
}

export class CardAuraView {
  private glow: Img; private rim: Img;
  private rays: Img[] = []; private ripples: Img[] = []; private frost: Img[] = []; private cracks: Img[] = []; private shine: Img[] = [];
  private particles: Particle[] = [];
  private recipe: Recipe | null = null;
  private style: AuraStyle = 'None';
  power: CardPower = CardPower.neutral;
  private strength = 0;
  private t = 0;
  private seed = Math.random() * 100;

  get artTint() { return this.recipe ? this.recipe.artTint * this.strength : 0; }
  get visualStrength() { return this.recipe ? this.strength : 0; }
  get artTintColor() { return this.recipe ? this.recipe.artTintColor : C(0.5, 0.5, 0.5); }

  constructor(private back: RT, private front: RT) {
    this.glow = makeImage('Glow', back, C(0, 0, 0, 0), SF.softFrame(18, 30), true);
    this.glow.rt.stretch(-30, -30, -30, -30);
    for (let i = 0; i < 8; i++) {
      const ray = makeImage('Ray' + i, back, C(0, 0, 0, 0), SF.beam());
      ray.rt.place(v2(0.5, 0.5), v2(0, 0), v2(46, 250), v2(0.5, 0));
      this.rays.push(ray);
    }
    for (let i = 0; i < 2; i++) {
      const r = makeImage('Ripple' + i, back, C(0, 0, 0, 0), SF.roundedOutline(18, 3), true);
      r.rt.stretch();
      this.ripples.push(r);
    }
    this.rim = makeImage('Rim', back, C(0, 0, 0, 0), SF.softFrame(18, 10), true);
    this.rim.rt.stretch(-10, -10, -10, -10);
    for (let i = 0; i < 6; i++) {
      const sh = makeImage('Shine' + i, back, C(0, 0, 0, 0), SF.glow(64));
      sh.rt.place(v2(0.5, 0.5), v2(0, 0), v2(18, 18));
      this.shine.push(sh);
    }
    for (let i = 0; i < 16; i++) {
      const img = makeImage('P' + i, back, C(0, 0, 0, 0), SF.glow(64));
      img.rt.place(v2(0.5, 0.5), v2(0, 0), v2(10, 10));
      this.particles.push({ image: img, phase: hash(i * 1.37), lane: hash(i * 2.91 + 0.3) * 2 - 1, speed: 0.7 + hash(i * 4.13) * 0.6, size: 0.7 + hash(i * 7.7) * 0.6 });
    }
    const corners = [v2(1, 1), v2(1, 0), v2(0, 0)];
    for (const c of corners) for (let k = 0; k < 3; k++) {
      const shard = makeImage('Frost', front, C(0, 0, 0, 0), SF.shard());
      const sx = c.x > 0.5 ? -1 : 1, sy = c.y > 0.5 ? -1 : 1;
      shard.rt.place(c, v2(sx * (4 + k * 9), sy * (4 + (2 - k) * 8)), v2(9 + k * 2, 24 + k * 6));
      const baseAngle = Math.atan2(-sy, -sx) * 180 / Math.PI - 90;
      shard.rt.rotation = baseAngle + (k - 1) * 28;
      this.frost.push(shard);
    }
    for (const cp of [[0.96, 0.62, 12], [0.04, 0.34, -15], [0.6, 0.03, 80], [0.97, 0.22, -8]]) {
      const crack = makeImage('Crack', front, C(0, 0, 0, 0), SF.crack());
      crack.rt.place(v2(cp[0], cp[1]), v2(0, 0), v2(12, 58));
      crack.rt.rotation = cp[2];
      this.cracks.push(crack);
    }
    this.apply();
    addUpdate({ rt: back, update: dt => this.update(dt) });
  }

  set(style: AuraStyle, elementColor: Color, power: CardPower) {
    const changed = style !== this.style || power.tier !== this.power.tier;
    this.style = style;
    this.power = power;
    if (!changed) return;
    this.recipe = power.tier === 0 ? null : makeRecipe(style, power.tier > 0, elementColor);
    this.apply();
  }

  setInstant() { this.strength = visualLevel(this.power.level); }

  private particleCount() {
    if (!this.recipe) return 0;
    const k = this.power.level / 3;
    return clamp(Math.round(lerp(this.recipe.maxParticles * 0.35, this.recipe.maxParticles, k)), 1, this.particles.length);
  }

  private apply() {
    const r = this.recipe;
    const on = !!r;
    this.glow.rt.setActive(on);
    this.rim.rt.setActive(on);
    for (const p of this.particles) { p.image.rt.setActive(false); if (on && r!.particleSprite) p.image.sprite = r!.particleSprite; }
    for (const x of this.rays) x.rt.setActive(on && r!.rays);
    for (const x of this.shine) x.rt.setActive(on && this.power.tier > 0);
    for (const x of this.ripples) x.rt.setActive(on && r!.ripples);
    for (const x of this.frost) x.rt.setActive(on && r!.frost);
    for (const x of this.cracks) x.rt.setActive(on && r!.cracks);
    if (!on) return;
    const count = this.particleCount();
    this.particles.forEach((p, i) => p.image.rt.setActive(i < count));
    const crackCount = clamp(this.power.level + 1, 0, this.cracks.length);
    this.cracks.forEach((c, i) => c.rt.setActive(r!.cracks && i < crackCount));
    const frostCount = clamp(this.power.level * 3, 0, this.frost.length);
    this.frost.forEach((f, i) => f.rt.setActive(r!.frost && i < frostCount));
  }

  private perimeterPoint(p: number): { pos: V2; n: V2 } {
    const w = HALF.x * 2, h = HALF.y * 2;
    const total = 2 * (w + h);
    let d = frac(p) * total;
    if (d < w) return { n: v2(0, 1), pos: v2(-HALF.x + d, HALF.y) };
    d -= w;
    if (d < h) return { n: v2(1, 0), pos: v2(HALF.x, HALF.y - d) };
    d -= h;
    if (d < w) return { n: v2(0, -1), pos: v2(HALF.x - d, -HALF.y) };
    d -= w;
    return { n: v2(-1, 0), pos: v2(-HALF.x, -HALF.y + d) };
  }

  private update(dt: number) {
    this.t += dt;
    const target = visualLevel(this.power.level);
    this.strength = moveTowards(this.strength, target, dt * 2.5);
    const r = this.recipe;
    if (!r) return;
    const K = VFX.cardAura;
    const s = Math.max(this.strength, 0.001);
    const level = 0.45 + 0.55 * s;
    let pulse = 0.82 + 0.18 * Math.sin(this.t * r.pulseSpeed + this.seed);
    if (r.flicker > 0) {
      const n = hash(Math.floor(this.t * 14) + this.seed);
      pulse *= 1 - r.flicker * n * (this.power.tier < 0 ? 1 : 0.5);
    }
    this.glow.color = C(r.glow.r, r.glow.g, r.glow.b, r.glowAlpha * level * pulse * K);
    this.rim.color = C(r.rim.r, r.rim.g, r.rim.b, r.rimAlpha * level * (0.75 + 0.25 * pulse) * K);
    const grow = (r.motion === Motion.Rise && r.particleKind === 'leaf' ? 1 + 0.03 * Math.sin(this.t * 2.6) * s : 1) * (this.power.tier > 0 ? 0.96 + 0.1 * s : 1);
    this.glow.rt.setScale(grow, grow);

    if (this.power.tier > 0) {
      const speed = 0.16 + 0.06 * this.power.level;
      this.shine.forEach((sh, i) => {
        const q = this.perimeterPoint(this.t * speed + this.seed - i * 0.009);
        sh.rt.anchoredPosition = v2(q.pos.x + q.n.x * 1.5, q.pos.y + q.n.y * 1.5);
        const sz = (26 - i * 3.5) * (0.7 + 0.3 * s);
        sh.rt.sizeDelta = v2(sz, sz);
        const sc = lerpColor(r.rim, C(1, 1, 1), 0.6);
        sh.color = C(sc.r, sc.g, sc.b, (0.95 - i * 0.14) * level * K);
      });
    }
    if (r.rays) {
      this.rays.forEach((ray, i) => {
        ray.rt.rotation = this.t * 9 + i * (360 / this.rays.length);
        const len = 170 + 60 * s + 20 * Math.sin(this.t * 1.7 + i);
        ray.rt.sizeDelta = v2(34 + 16 * s, len);
        ray.color = C(1, 0.95, 0.75, (0.12 + 0.22 * s) * (0.7 + 0.3 * Math.sin(this.t * 2 + i * 1.3)) * K);
      });
    }
    if (r.ripples) {
      this.ripples.forEach((rp, i) => {
        const p = frac(this.t * 0.45 + i * 0.5);
        rp.rt.setScale(1 + p * (0.08 + 0.1 * s), 1 + p * (0.06 + 0.07 * s));
        rp.color = C(0.75, 0.92, 1, (1 - p) * 0.55 * s * K);
      });
    }
    for (const f of this.frost) {
      if (!f.rt.active) continue;
      const tw = 0.75 + 0.25 * Math.sin(this.t * 3 + f.rt.anchoredPosition.x);
      f.color = C(0.92, 0.98, 1, 0.85 * level * tw);
    }
    for (const c of this.cracks) if (c.rt.active) c.color = C(r.crackColor.r, r.crackColor.g, r.crackColor.b, r.crackColor.a * level);
    const count = this.particleCount();
    for (let i = 0; i < count; i++) this.animate(this.particles[i], r, s, K);
  }

  private animate(pt: Particle, r: Recipe, s: number, K: number) {
    const speed = r.particleSpeed * pt.speed * (0.7 + 0.6 * s);
    const p = frac(this.t * speed + pt.phase);
    let pos = v2(0, 0);
    let alpha = 1, scale = pt.size, rot = 0;
    const T = this.t;
    switch (r.motion) {
      case Motion.Rise: {
        const side = pt.lane;
        let x = side * (HALF.x + 6);
        if (Math.abs(side) < 0.75) x = Math.sign(side === 0 ? 1 : side) * (HALF.x + 4 - Math.abs(side) * 10);
        x += Math.sin(T * 2.2 + pt.phase * 9) * (r.rotateParticles ? 14 : 6);
        pos = v2(x, -HALF.y - 10 + p * (HALF.y * 2 + 70));
        alpha = Math.sin(p * Math.PI);
        scale *= 1 - p * 0.4;
        rot = r.rotateParticles ? Math.sin(T * 1.8 + pt.phase * 7) * 50 : 0;
        break;
      }
      case Motion.Fall: {
        const x = pt.lane * (HALF.x + 8) + Math.sin(T * 1.6 + pt.phase * 6) * (r.rotateParticles ? 16 : 4);
        pos = v2(x, HALF.y + 10 - p * (HALF.y * 2 + 60));
        alpha = Math.sin(p * Math.PI) * 0.9;
        rot = r.rotateParticles ? T * 60 + pt.phase * 300 : 0;
        break;
      }
      case Motion.Flame: {
        const w = HALF.x * 2, h = HALF.y * 1.3;
        const total = h * 2 + w;
        const d = frac(pt.phase + pt.lane * 0.07) * total;
        let lean: number;
        if (d < h) { pos = v2(-HALF.x - 2, -HALF.y * 0.3 + d); lean = 28; }
        else if (d < h + w) { pos = v2(-HALF.x + (d - h), HALF.y + 2); lean = 0; }
        else { pos = v2(HALF.x + 2, HALF.y - (d - h - w)); lean = -28; }
        const flick = 0.65 + 0.35 * Math.sin(T * (9 + pt.speed * 5) + pt.phase * 20) + 0.2 * hash(Math.floor(T * 12) + pt.phase * 50);
        alpha = 0.75 + 0.25 * Math.sin(T * 7 + pt.phase * 9);
        rot = lean + Math.sin(T * 5 + pt.phase * 11) * 8;
        const frt = pt.image.rt;
        frt.pivot = v2(0.5, 0.08);
        const fs = r.particleSize * pt.size * (0.55 + 0.45 * s);
        const fc = lerpColor(r.particleColor, r.particleColor2, frac(pt.lane * 3.7));
        pt.image.color = C(fc.r, fc.g, fc.b, alpha * (0.55 + 0.45 * s) * K);
        frt.sizeDelta = v2(fs * 0.55, fs * flick);
        frt.anchoredPosition = pos;
        frt.rotation = rot;
        return;
      }
      case Motion.Drip: {
        const x = pt.lane * (HALF.x - 16);
        pos = v2(x, -HALF.y + 2 - p * p * 70);
        alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
        scale *= 0.8 + p * 0.4;
        break;
      }
      case Motion.Perimeter: {
        const q = this.perimeterPoint(p + pt.lane * 0.5);
        const o = 3 + 3 * Math.sin(T * 4 + pt.phase * 9);
        pos = v2(q.pos.x + q.n.x * o, q.pos.y + q.n.y * o);
        alpha = 0.6 + 0.4 * Math.sin(T * 3 + pt.phase * 6);
        break;
      }
      case Motion.Orbit: {
        const q = this.perimeterPoint(pt.phase + T * speed * 0.3);
        const o = 14 + 6 * Math.sin(T * 1.5 + pt.phase * 8);
        pos = v2(q.pos.x + q.n.x * o, q.pos.y + q.n.y * o + Math.sin(T * 9 + pt.phase * 20) * 1.2 * s);
        alpha = 0.95;
        rot = pt.phase * 360 + T * 20;
        break;
      }
      case Motion.Smoke: {
        const x = pt.lane * (HALF.x * 0.8) + Math.sin(T * 0.8 + pt.phase * 5) * 12;
        pos = v2(x, HALF.y - 30 + p * 120);
        alpha = Math.sin(p * Math.PI) * 0.7;
        scale *= 0.6 + p * 1.3;
        break;
      }
      case Motion.Spread: {
        const q = this.perimeterPoint(pt.phase + pt.lane * 0.13);
        pos = v2(q.pos.x + q.n.x * p * 34, q.pos.y + q.n.y * p * 34);
        alpha = Math.sin(p * Math.PI) * 0.85;
        scale *= 0.6 + p * 0.9;
        break;
      }
      default: {
        const q = this.perimeterPoint(pt.phase + Math.floor(T * speed + pt.phase) * 0.37);
        const o = 6 + 14 * pt.size;
        pos = v2(q.pos.x + q.n.x * o, q.pos.y + q.n.y * o);
        alpha = Math.pow(Math.sin(p * Math.PI), 2);
        scale *= 0.6 + 0.6 * Math.sin(p * Math.PI);
        rot = 45;
        break;
      }
    }
    const c = lerpColor(r.particleColor, r.particleColor2, pt.lane * 0.5 + 0.5);
    pt.image.color = C(c.r, c.g, c.b, c.a * alpha * (0.45 + 0.55 * s) * K);
    const sz = r.particleSize * scale;
    pt.image.rt.sizeDelta = r.particleKind === 'leaf' || r.particleKind === 'drop' ? v2(sz * 0.75, sz) : v2(sz, sz);
    pt.image.rt.anchoredPosition = pos;
    pt.image.rt.rotation = rot;
  }
}
