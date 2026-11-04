// Ports of UI/ArenaView.cs, UI/FieldCircleView.cs, UI/BackgroundView.cs (world layers).
import { LAYOUT } from '../config/layout';
import { THEME } from '../config/theme';
import { VFX } from '../config/vfx';
import { GameContent } from '../core/content';
import { FieldModeType, FieldState, fieldMode, level } from '../core/field';
import { Element } from '../core/types';
import { FieldTheme, VisualLibrary } from '../game/visuals';
import { ParticleStyle } from '../data/elements';
import { C, Color, lerpColor, WHITE } from '../ui/color';
import { addUpdate, Img, RT, V2, v2 } from '../ui/engine';
import { makeImage, rect } from '../ui/factory';
import { clamp01, lerp, rand } from '../ui/mathf';
import { art, SF } from '../ui/sprites';
import { emph, focus } from './focus';

export const FLOOR_TILT = 0.42;
const add = (a: V2, b: V2) => v2(a.x + b.x, a.y + b.y);

function plane(name: string, parent: RT, pos: V2, tilt = FLOOR_TILT) {
  const p = rect(name, parent).place(v2(0.5, 0.5), pos, v2(10, 10));
  p.setScale(1, tilt);
  return p;
}

// ============================================================================ ArenaView
export class ArenaView {
  readonly rt: RT;
  private floor: Img; private floorTint: Img; private floorGlow: Img; private floorRim: Img; private edgeMist: Img; private backFog: Img;
  private laneHome!: Img; private laneAway!: Img; private laneAxis!: Img;
  private padHome: Img; private padAway: Img; private padHomeGlow: Img; private padAwayGlow: Img;
  private flames: Img[] = []; private wallTorches: Img[] = []; private floorLights: Img[] = []; private flow: Img[] = []; private flowPath: V2[] = [];
  private bright = C(0.3, 0.42, 0.55); private target = C(0.3, 0.42, 0.55); private intensity = 0; private targetIntensity = 0; private t = 0;
  private homeColor = WHITE; private awayColor = WHITE;

  constructor(parent: RT, private lib: VisualLibrary) {
    this.rt = rect('Arena', parent).stretch();
    const L = LAYOUT.floorCenter, size = LAYOUT.floorSize;
    const wall = rect('BackWall', this.rt).stretch();
    makeImage('WallShade', wall, C(0.02, 0.025, 0.05, 0.75), SF.verticalGradient()).rt.place(v2(0.5, 0.5), v2(0, 360), v2(2600, 420));
    const column = art.arena('arena_column');
    for (let i = -5; i <= 5; i++) {
      const x = i * 190, depth = 1 - Math.abs(i) * 0.04;
      const dim = 0.62 - Math.abs(i) * 0.035;
      const col = makeImage('Column' + (i + 5), wall, C(dim * 0.92, dim * 0.95, dim * 1.1, 0.95), column);
      col.rt.place(v2(0.5, 0.5), v2(x, 290 - Math.abs(i) * 14), v2(76 * depth, 304 * depth), v2(0.5, 0));
      const torch = makeImage('Torch' + (i + 5), wall, C(1, 0.6, 0.3, 0), SF.glow(64));
      torch.rt.place(v2(0.5, 0.5), v2(x + 95, 430 - Math.abs(i) * 10), v2(90, 90));
      if (i % 2 !== 0 && i < 5) this.wallTorches.push(torch); else torch.rt.setActive(false);
    }
    makeImage('WallFade', wall, C(0.02, 0.03, 0.05, 0.55), SF.verticalGradient()).rt.place(v2(0.5, 0.5), v2(0, 430), v2(2600, 320));
    this.backFog = makeImage('BackFog', wall, C(0.42, 0.4, 0.65, 0.16), SF.softBlob());
    this.backFog.rt.place(v2(0.5, 0.5), v2(0, 300), v2(2600, 260));

    const floorPlane = plane('FloorPlane', this.rt, L);
    this.floorGlow = makeImage('FloorGlow', floorPlane, C(0.3, 0.45, 0.7, 0.2), SF.softBlob());
    this.floorGlow.rt.place(v2(0.5, 0.5), v2(0, 0), v2(size.x * 1.25, size.x * 1.25));
    makeImage('FloorShadow', this.rt, C(0, 0, 0, 0.6), SF.softBlob()).rt.place(v2(0.5, 0.5), add(L, v2(0, -40)), v2(size.x * 1.1, size.y * 1.12));
    this.floor = makeImage('Floor', floorPlane, WHITE, art.arena('arena_floor'));
    this.floor.rt.place(v2(0.5, 0.5), v2(0, 0), v2(size.x, size.x));
    this.floorTint = makeImage('FieldTint', floorPlane, C(0, 0, 0, 0), SF.softBlob());
    this.floorTint.rt.place(v2(0.5, 0.5), v2(0, 0), v2(size.x * 0.95, size.x * 0.95));
    makeImage('FloorShade', floorPlane, C(0, 0, 0, 0.3), SF.softBlob()).rt.place(v2(0.5, 0.5), v2(0, size.x * 0.32), v2(size.x * 0.95, size.x * 0.5));
    this.floorRim = makeImage('FloorRim', floorPlane, C(0.9, 0.75, 0.45, 0.35), SF.ring(512, 0.006));
    this.floorRim.rt.place(v2(0.5, 0.5), v2(0, 0), v2(size.x * 0.995, size.x * 0.995));
    this.edgeMist = makeImage('EdgeMist', floorPlane, C(0.45, 0.45, 0.7, 0.1), SF.ring(256, 0.16));
    this.edgeMist.rt.place(v2(0.5, 0.5), v2(0, 0), v2(size.x * 1.12, size.x * 1.12));

    // mana lanes: my tower → my card → clash → enemy card → enemy tower
    const homeSlotBase = add(LAYOUT.homeSlot, v2(0, -90)), awaySlotBase = add(LAYOUT.awaySlot, v2(0, -80));
    const homeTower = add(LAYOUT.homeTower, v2(60, 26)), awayTower = add(LAYOUT.awayTower, v2(-50, 22));
    this.laneHome = this.lane('LaneHome', homeTower, homeSlotBase);
    this.laneAway = this.lane('LaneAway', awaySlotBase, awayTower);
    this.laneAxis = this.lane('LaneAxis', homeSlotBase, awaySlotBase);
    this.flowPath = [homeTower, homeSlotBase, awaySlotBase, awayTower];
    for (let i = 0; i < 12; i++) {
      const m = makeImage('LaneMote' + i, this.rt, C(0, 0, 0, 0), SF.glow(64));
      m.rt.place(v2(0.5, 0.5), v2(0, 0), v2(12, 12));
      this.flow.push(m);
    }
    const pad = art.arena('tower_pad');
    this.padHomeGlow = this.pad('PadHomeGlow', add(LAYOUT.homeTower, v2(0, 26)), 420, SF.softBlob());
    this.padHome = this.pad('PadHome', add(LAYOUT.homeTower, v2(0, 26)), 340, pad);
    this.padAwayGlow = this.pad('PadAwayGlow', add(LAYOUT.awayTower, v2(0, 22)), 360, SF.softBlob());
    this.padAway = this.pad('PadAway', add(LAYOUT.awayTower, v2(0, 22)), 290, pad);
    this.brazier('BrazierTL', v2(-560, 220), 0.75);
    this.brazier('BrazierTR', v2(560, 220), 0.75);
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  private lane(name: string, from: V2, to: V2) {
    const d = v2(to.x - from.x, to.y - from.y);
    const img = makeImage(name, this.rt, C(1, 1, 1, 0.12), SF.hBand());
    img.rt.place(v2(0.5, 0.5), v2((from.x + to.x) / 2, (from.y + to.y) / 2), v2(Math.hypot(d.x, d.y), 46));
    img.rt.rotation = Math.atan2(d.y, d.x) * 180 / Math.PI;
    const core = makeImage('Core', img.rt, C(1, 1, 1, 0.5), SF.hBand());
    core.rt.stretch(0, 0, 20, 20);
    (img as any).core = core;
    return img;
  }
  private pad(name: string, pos: V2, size: number, sprite: any) {
    const p = plane(name + 'Plane', this.rt, pos, 0.36);
    const img = makeImage(name, p, C(0, 0, 0, 0), sprite);
    img.rt.place(v2(0.5, 0.5), v2(0, 0), v2(size, size));
    return img;
  }
  private brazier(name: string, pos: V2, scale: number) {
    const lightPlane = plane(name + 'Light', this.rt, add(pos, v2(0, 6)), 0.4);
    const pool = makeImage('FloorLight', lightPlane, C(1, 0.55, 0.25, 0.18), SF.softBlob());
    pool.rt.place(v2(0.5, 0.5), v2(0, 0), v2(420 * scale, 420 * scale));
    this.floorLights.push(pool);
    const root = rect(name, this.rt).place(v2(0.5, 0.5), pos, v2(120, 220), v2(0.5, 0));
    root.setScale(scale, scale);
    makeImage('Shadow', root, C(0, 0, 0, 0.5), SF.softBlob()).rt.place(v2(0.5, 0), v2(0, 4), v2(150, 40));
    const prop = makeImage('Prop', root, WHITE, art.arena('arena_brazier'));
    prop.rt.stretch();
    prop.preserveAspect = true;
    const glow = makeImage('FireGlow', root, C(1, 0.5, 0.2, 0.3), SF.glow(128));
    glow.rt.place(v2(0.5, 0), v2(0, 178), v2(170, 170));
    const flame = makeImage('Flame', root, C(1, 0.55, 0.22, 0.85), SF.flame());
    flame.rt.place(v2(0.5, 0), v2(0, 160), v2(46, 78), v2(0.5, 0));
    const core = makeImage('FlameCore', root, C(1, 0.88, 0.6, 0.9), SF.flame());
    core.rt.place(v2(0.5, 0), v2(0, 161), v2(22, 42), v2(0.5, 0));
    this.flames.push(glow, flame, core);
  }

  /**
   * Turn swap: rotate the floor art (degrees, negative = clockwise, same direction as the towers' orbit)
   * and fade the side-coloured lanes/pads (0..1) so they can switch colours while hidden.
   */
  setTurn(deg: number, fade: number) {
    this.floor.rt.rotation = deg;
    const a = 1 - Math.max(0, Math.min(1, fade));
    for (const i of [this.laneHome, this.laneAway, this.laneAxis, this.padHome, this.padAway, this.padHomeGlow, this.padAwayGlow]) i.rt.groupAlpha = a;
  }
  setPerspective(home: Color, away: Color) {
    this.homeColor = home; this.awayColor = away;
    this.laneHome.color = C(home.r, home.g, home.b, 0.13);
    (this.laneHome as any).core.color = C(home.r, home.g, home.b, 0.3);
    this.laneAway.color = C(away.r, away.g, away.b, 0.13);
    (this.laneAway as any).core.color = C(away.r, away.g, away.b, 0.3);
    const mix = lerpColor(home, away, 0.5);
    this.laneAxis.color = C(mix.r, mix.g, mix.b, 0.08);
    (this.laneAxis as any).core.color = C(1, 0.92, 0.75, 0.12);
    this.padHome.color = C(home.r, home.g, home.b, 0.55);
    this.padHomeGlow.color = C(home.r, home.g, home.b, 0.22);
    this.padAway.color = C(away.r, away.g, away.b, 0.55);
    this.padAwayGlow.color = C(away.r, away.g, away.b, 0.22);
  }
  apply(theme: FieldTheme) { this.target = theme.bright; this.targetIntensity = theme.intensity; }

  private update(dt: number) {
    this.t += dt;
    const T = this.t, k = 1 - Math.exp(-dt * 1.5), A = VFX.ambient * emph(focus.v.environment, 0.5);
    this.bright = lerpColor(this.bright, this.target, k);
    this.intensity = lerp(this.intensity, this.targetIntensity, k);
    const neutral = C(0.92, 0.93, 1);
    this.floor.color = lerpColor(neutral, lerpColor(neutral, this.bright, 0.35), this.intensity * 0.5);
    const b = this.bright, I = this.intensity;
    this.floorTint.color = C(b.r, b.g, b.b, I * 0.16 * VFX.fieldIdle);
    this.floorGlow.color = C(b.r, b.g, b.b, (0.08 + I * 0.16) * emph(VFX.fieldIdle, 0.4));
    this.floorRim.color = C(b.r, b.g, b.b, I * 0.35 * VFX.fieldIdle);
    const breathe = 0.5 + 0.5 * Math.sin(T * 0.25);
    this.edgeMist.color = C(0.45, 0.45, 0.7, (0.07 + 0.04 * breathe) * A);
    this.edgeMist.rt.rotation = T * 1.5;
    this.backFog.rt.anchoredPosition = v2(Math.sin(T * 0.05) * 140, 300);
    this.floorLights.forEach((l, i) => (l.color = C(1, 0.55, 0.25, (0.15 + 0.04 * Math.sin(T * 7.3 + i * 2) * Math.sin(T * 3.1 + i)) * emph(A, 0.4))));
    const p = this.flowPath;
    this.flow.forEach((m, i) => {
      const fk = (T * 0.045 + i / this.flow.length) % 1;
      const seg = fk * (p.length - 1);
      const si = Math.min(p.length - 2, Math.floor(seg));
      const f = seg - si;
      const pos = v2(p[si].x + (p[si + 1].x - p[si].x) * f, p[si].y + (p[si + 1].y - p[si].y) * f);
      m.rt.anchoredPosition = v2(pos.x + Math.sin(T * 2 + i) * 6, pos.y + Math.cos(T * 1.7 + i) * 4);
      const c = si === 0 ? this.homeColor : si === 2 ? this.awayColor : lerpColor(this.homeColor, this.awayColor, seg / (p.length - 1));
      m.color = C(Math.min(1, c.r + 0.3), Math.min(1, c.g + 0.3), Math.min(1, c.b + 0.3), 0.35 * Math.sin((fk * Math.PI * 3) % Math.PI) * A);
    });
    this.padHome.rt.rotation = T * 8;
    this.padAway.rt.rotation = -T * 8;
    this.flames.forEach((f, i) => {
      const flick = 0.85 + 0.15 * Math.sin(T * (9 + i) + i * 1.7) * Math.sin(T * 5.3 + i);
      f.rt.setScale(1 + 0.05 * Math.sin(T * 7 + i), flick);
    });
    this.wallTorches.forEach((w, i) => (w.color = C(1, 0.6, 0.3, (0.22 + 0.08 * Math.sin(T * 6 + i * 2.1)) * A)));
  }
}

// ============================================================================ FieldCircleView
interface Mote { img: Img; phase: number; speed: number; angle: number; radius: number }
export class FieldCircleView {
  static readonly Diameter = 600;
  readonly rt: RT;
  readonly core: RT;
  private glow: Img; private base: Img; private runes: Img; private star: Img; private outer: Img; private pulse: Img; private pillar: Img; private pillarCore: Img;
  private motes: Mote[] = [];
  private colA = C(0.55, 0.65, 0.8); private colB = C(0.55, 0.65, 0.8); private tA = C(0.55, 0.65, 0.8); private tB = C(0.55, 0.65, 0.8);
  /** turn-swap rotation offset (degrees), shared with the floor and the towers' orbit */
  turnAngle = 0;
  private lv = 0; private targetLevel = 0; private unstable = false; private t = 0; private spin = 0; private pulseT = 1; private pulseColor = WHITE;
  levelNow = 0;

  constructor(parent: RT, private lib: VisualLibrary) {
    const D = FieldCircleView.Diameter;
    this.rt = rect('FieldCircle', parent).place(v2(0.5, 0.5), LAYOUT.clash, v2(D, D * FLOOR_TILT));
    const pl = rect('FloorPlane', this.rt).place(v2(0.5, 0.5), v2(0, 0), v2(10, 10));
    pl.setScale(1, FLOOR_TILT);
    const layer = (name: string, s: any, size: number) => { const i = makeImage(name, pl, C(0, 0, 0, 0), s); i.rt.place(v2(0.5, 0.5), v2(0, 0), v2(size, size)); return i; };
    this.glow = layer('Glow', SF.softBlob(), D * 1.5);
    this.outer = layer('Outer', SF.dashedRing(36), D * 1.12);
    this.base = layer('Base', art.arena('field_circle_lv1'), D);
    this.runes = layer('Runes', art.arena('field_circle_lv2'), D);
    this.star = layer('Star', art.arena('field_circle_lv3'), D);
    this.pulse = layer('Pulse', SF.ring(256, 0.03), D);
    this.pillar = makeImage('Pillar', this.rt, C(0, 0, 0, 0), SF.lightShaft());
    this.pillar.rt.place(v2(0.5, 0.5), v2(0, 0), v2(230, 520), v2(0.5, 0));
    this.pillarCore = makeImage('PillarCore', this.rt, C(0, 0, 0, 0), SF.lightShaft());
    this.pillarCore.rt.place(v2(0.5, 0.5), v2(0, 0), v2(70, 440), v2(0.5, 0));
    for (let i = 0; i < 22; i++) {
      const img = makeImage('Mote' + i, this.rt, C(0, 0, 0, 0), SF.glow(64));
      img.rt.anchorMin = v2(0.5, 0.5); img.rt.anchorMax = v2(0.5, 0.5);
      this.motes.push({ img, phase: (i * 0.37) % 1, speed: 0.25 + (i % 5) * 0.06, angle: i * 2.39996, radius: 0.25 + ((i * 7) % 10) / 13 });
    }
    this.core = rect('ClashPoint', this.rt).place(v2(0.5, 0.5), v2(0, 0), v2(40, 40));
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  render(field: FieldState, instant: boolean) {
    const content = this.lib.content;
    const mode = fieldMode(content, field);
    let lv = mode.top !== Element.None ? level(content.rules, field.get(mode.top)) : 0;
    if (mode.type === FieldModeType.Neutral) lv = 0;
    this.levelNow = lv;
    this.targetLevel = lv;
    this.unstable = mode.type === FieldModeType.Unstable;
    const neutral = C(0.55, 0.65, 0.8);
    this.tA = mode.top !== Element.None && lv > 0 ? this.lib.elementColor(mode.top) : neutral;
    const two = mode.type === FieldModeType.Hybrid || mode.type === FieldModeType.Unstable;
    this.tB = two && mode.second !== Element.None ? this.lib.elementColor(mode.second) : this.tA;
    if (instant) { this.lv = lv; this.colA = this.tA; this.colB = this.tB; }
  }
  pulseOnce(color: Color) { this.pulseColor = color; this.pulseT = 0; }

  private update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 3);
    this.lv = lerp(this.lv, this.targetLevel, k);
    this.colA = lerpColor(this.colA, this.tA, k);
    this.colB = lerpColor(this.colB, this.tB, k);
    const lv = this.lv, l1 = clamp01(lv), l2 = clamp01(lv - 1), l3 = clamp01(lv - 2), T = this.t;
    const flicker = this.unstable ? 0.75 + 0.25 * Math.sin(T * 17) * Math.sin(T * 5) : 1;
    const beat = 0.5 + 0.5 * Math.sin(T * (1.5 + lv));
    this.spin += dt * (3 + lv * 9) * (this.unstable ? 1.8 : 1);
    const mix = lerpColor(this.colA, this.colB, 0.5 + 0.5 * Math.sin(T * 1.3));
    const act = clamp01(lv / 3), idle = 0.04 * Math.sin(T * 1.1) * VFX.ambient, F = VFX.fieldIdle * (focus.phase === 'field' ? 2 : 1);
    const bright = (c: Color, a: number) => C(Math.min(1, c.r * 0.7 + 0.3), Math.min(1, c.g * 0.7 + 0.3), Math.min(1, c.b * 0.7 + 0.3), clamp01(a * flicker));
    this.glow.color = C(mix.r, mix.g, mix.b, (0.05 + 0.22 * act * act + idle) * flicker * F);
    this.base.color = bright(this.colA, 0.3 + 0.45 * act + 0.12 * beat * act + idle);
    const ta = this.turnAngle;
    this.base.rt.rotation = this.spin + ta;
    this.outer.color = bright(this.colB, (0.06 + 0.34 * act) * F);
    this.outer.rt.rotation = -this.spin * 0.4 + ta;
    this.runes.color = bright(this.colB, 0.1 + 0.2 * l1 + 0.3 * l2 + 0.15 * l3 + idle);
    this.runes.rt.rotation = -this.spin * 1.3 + ta;
    const rs = 0.96 + 0.04 * act;
    this.runes.rt.setScale(rs, rs);
    this.star.color = bright(this.colA, (0.06 + 0.12 * l1 + 0.22 * l2 + 0.45 * l3) * (0.85 + 0.15 * beat));
    this.star.rt.rotation = this.spin * 0.6 + ta;
    this.pillar.color = C(mix.r, mix.g, mix.b, 0.22 * l3 * (0.7 + 0.3 * beat) * flicker * F);
    this.pillarCore.color = C(1, 1, 1, 0.25 * l3 * (0.6 + 0.4 * beat) * F);
    const count = Math.round(this.motes.length * (0.3 + 0.7 * act));
    const D = FieldCircleView.Diameter;
    this.motes.forEach((m, i) => {
      if (i >= count) { m.img.color = C(0, 0, 0, 0); return; }
      const p = (m.phase + T * m.speed * (0.35 + lv * 0.15)) % 1;
      const a = m.angle + T * 0.2, r = m.radius * D * 0.5, rr = r * (0.25 + 0.75 * p);
      m.img.rt.anchoredPosition = v2(Math.cos(a) * rr, Math.sin(a) * rr * FLOOR_TILT + p * (50 + 40 * lv));
      const s = (6 + (6 * ((i * 3) % 4)) / 3) * (1 - p * 0.5);
      m.img.rt.sizeDelta = v2(s, s);
      const c = i % 2 === 0 ? this.colA : this.colB;
      m.img.color = C(Math.min(1, c.r + 0.25), Math.min(1, c.g + 0.25), Math.min(1, c.b + 0.25), Math.sin(p * Math.PI) * (0.35 + 0.4 * act) * VFX.ambient);
    });
    if (this.pulseT < 1) {
      this.pulseT = Math.min(1, this.pulseT + dt / 0.8);
      const s = 0.6 + this.pulseT * 0.75;
      this.pulse.rt.setScale(s, s);
      this.pulse.color = C(this.pulseColor.r, this.pulseColor.g, this.pulseColor.b, (1 - this.pulseT) * 0.9 * VFX.clash);
      this.base.color = lerpColor(this.base.color, C(1, 1, 1, this.base.color.a), (1 - this.pulseT) * 0.6);
    } else this.pulse.color = C(0, 0, 0, 0);
  }
}

// ============================================================================ BackgroundView
interface Particle { img: Img; pos: V2; vel: V2; life: number; maxLife: number; size: number; spin: number; phase: number; useB: boolean }
export class BackgroundView {
  readonly rt: RT;
  private base: Img; private art: Img; private topWash: Img; private bottomWash: Img; private auras: Img[] = []; private mistA: Img; private mistB: Img; private groundFog: Img;
  private particles: Particle[] = [];
  private theme: FieldTheme | null = null;
  private dark = C(0.106, 0.165, 0.227); private bright = C(0.29, 0.416, 0.549); private mist = C(0.68, 0.8, 0.89);
  private intensity = 0; private surge = 0; private t = 0;

  constructor(parent: RT, private lib: VisualLibrary) {
    this.rt = rect('Background', parent).stretch();
    this.base = makeImage('Base', this.rt, C(0.04, 0.06, 0.09));
    this.base.rt.stretch();
    this.art = makeImage('Art', this.rt, WHITE, art.arena('arena_backdrop'));
    this.art.rt.stretch();
    this.topWash = makeImage('TopWash', this.rt, C(0, 0, 0, 0), SF.verticalGradient());
    this.topWash.rt.anchorMin = v2(0, 0.45); this.topWash.rt.anchorMax = v2(1, 1); this.topWash.rt.offsetMin = v2(0, 0); this.topWash.rt.offsetMax = v2(0, 0);
    this.bottomWash = makeImage('BottomWash', this.rt, C(0, 0, 0, 0), SF.verticalGradient());
    this.bottomWash.rt.anchorMin = v2(0, 0); this.bottomWash.rt.anchorMax = v2(1, 0.5); this.bottomWash.rt.offsetMin = v2(0, 0); this.bottomWash.rt.offsetMax = v2(0, 0);
    this.bottomWash.rt.setScale(1, -1);
    const auraPos = [v2(0.15, 0.15), v2(0.85, 0.2), v2(0.5, 0.62)], auraSize = [1100, 1100, 1300];
    for (let i = 0; i < 3; i++) {
      const a = makeImage('Aura' + i, this.rt, C(0, 0, 0, 0), SF.softBlob());
      a.rt.place(auraPos[i], v2(0, 0), v2(auraSize[i], auraSize[i] * 0.75));
      this.auras.push(a);
    }
    const particleLayer = rect('Particles', this.rt).stretch();
    this.mistA = makeImage('MistA', this.rt, C(0, 0, 0, 0), SF.softBlob());
    this.mistA.rt.place(v2(0.3, 0.42), v2(0, 0), v2(1500, 300));
    this.mistB = makeImage('MistB', this.rt, C(0, 0, 0, 0), SF.softBlob());
    this.mistB.rt.place(v2(0.75, 0.3), v2(0, 0), v2(1400, 280));
    this.groundFog = makeImage('GroundFog', this.rt, C(0, 0, 0, 0), SF.softBlob());
    this.groundFog.rt.place(v2(0.5, 0.5), v2(0, -40), v2(2300, 520));
    makeImage('Vignette', this.rt, C(0, 0, 0, 0.6), SF.vignette()).rt.stretch(-200, -200, -120, -120);
    for (let i = 0; i < THEME.ambientParticles; i++) {
      const img = makeImage('P' + i, particleLayer, C(0, 0, 0, 0), SF.glow(64));
      img.rt.anchorMin = v2(0, 0); img.rt.anchorMax = v2(0, 0);
      const p: Particle = { img, pos: v2(0, 0), vel: v2(0, 0), life: 0, maxLife: 1, size: 4, spin: 0, phase: 0, useB: i % 2 === 1 };
      this.respawn(p, true);
      this.particles.push(p);
    }
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  surgeAmount(a: number) { this.surge = Math.max(this.surge, a); }
  apply(t: FieldTheme) { this.theme = t; }

  private style(p: Particle): ParticleStyle {
    if (!this.theme || this.theme.intensity <= 0.01) return 'Dust';
    return p.useB ? this.theme.particleB : this.theme.particleA;
  }
  private colorOf(p: Particle): Color {
    if (!this.theme || this.theme.intensity <= 0.01) return C(0.56, 0.7, 0.83);
    return p.useB ? this.theme.particleColorB : this.theme.particleColorA;
  }
  private respawn(p: Particle, anywhere: boolean) {
    const size = v2(1920, 1080);
    const style = this.style(p);
    const falls = style === 'Rain' || style === 'Snow' || style === 'Leaf';
    let y = anywhere ? rand(0, size.y) : falls ? size.y + 30 : -30;
    if (style === 'Rubble') y = rand(0, size.y * 0.35);
    if (style === 'Wisp') y = rand(0, size.y);
    p.pos = v2(rand(0, size.x), y);
    p.maxLife = rand(5, 12);
    p.life = anywhere ? rand(0, p.maxLife) : 0;
    p.phase = rand(0, 10);
    p.spin = rand(-90, 90);
    switch (style) {
      case 'Ember': p.vel = v2(rand(-20, 20), rand(70, 140)); p.size = rand(5, 11); p.img.sprite = SF.glow(64); break;
      case 'Rain': p.vel = v2(-180, -rand(900, 1200)); p.size = rand(3, 5); p.img.sprite = SF.glow(64); p.maxLife = 2; break;
      case 'Leaf': p.vel = v2(rand(-30, 30), -rand(50, 90)); p.size = rand(12, 20); p.img.sprite = SF.leaf(); break;
      case 'Snow': p.vel = v2(rand(-20, 20), -rand(40, 80)); p.size = rand(5, 10); p.img.sprite = SF.circle(64); break;
      case 'Rubble': p.vel = v2(rand(30, 70), rand(-5, 12)); p.size = rand(6, 12); p.img.sprite = SF.diamond(); break;
      case 'Glow': p.vel = v2(rand(-10, 10), rand(25, 55)); p.size = rand(10, 22); p.img.sprite = SF.glow(64); break;
      case 'Wisp': p.vel = v2(rand(-25, 25), rand(-10, 25)); p.size = rand(60, 120); p.img.sprite = SF.softBlob(); break;
      default: p.vel = v2(rand(-12, 12), rand(15, 40)); p.size = rand(3, 7); p.img.sprite = SF.glow(64); break;
    }
  }

  private update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 1.2);
    this.surge = Math.max(0, this.surge - dt * 0.8);
    const surge = (() => { const x = clamp01(this.surge); return x * x * (3 - 2 * x); })() * VFX.fieldChange;
    if (this.theme) {
      this.dark = lerpColor(this.dark, this.theme.dark, k);
      this.bright = lerpColor(this.bright, this.theme.bright, k);
      this.mist = lerpColor(this.mist, this.theme.mist, k);
      this.intensity = lerp(this.intensity, this.theme.intensity, k);
    }
    const I = this.intensity, A = VFX.ambient * emph(focus.v.environment, 0.5);
    this.base.color = lerpColor(C(0.035, 0.04, 0.075), this.dark, 0.08 + 0.14 * I);
    this.topWash.color = C(this.dark.r, this.dark.g, this.dark.b, 0.08 + 0.14 * I);
    this.bottomWash.color = C(this.bright.r * 0.6, this.bright.g * 0.6, this.bright.b * 0.6, 0.04 + I * 0.12);
    this.auras.forEach((a, i) => {
      const wob = 0.05 * Math.sin(this.t * 0.4 + i * 2);
      const c = i === 2 ? this.mist : this.bright;
      a.color = C(c.r, c.g, c.b, Math.max(0, 0.02 + I * 0.07 + wob * 0.3 + surge * 0.12));
      const s = 1 + 0.04 * Math.sin(this.t * 0.3 + i) + surge * 0.12;
      a.rt.setScale(s, s);
    });
    const m = this.mist;
    this.mistA.color = C(m.r, m.g, m.b, (0.04 + I * 0.1 + surge * 0.1) * A);
    this.mistB.color = C(m.r, m.g, m.b, (0.035 + I * 0.08 + surge * 0.08) * A);
    this.mistA.rt.anchoredPosition = v2(Math.sin(this.t * 0.07) * 220, Math.sin(this.t * 0.11) * 20);
    this.mistB.rt.anchoredPosition = v2(Math.cos(this.t * 0.05) * 260, Math.cos(this.t * 0.09) * 16);
    this.groundFog.color = C(m.r, m.g, m.b, (0.03 + I * 0.1 + surge * 0.08) * A);
    this.groundFog.rt.anchoredPosition = v2(Math.sin(this.t * 0.04) * 120, -40);

    const active = Math.round(this.particles.length * (0.45 + 0.55 * Math.max(I, 0.2)));
    this.particles.forEach((p, i) => {
      if (i >= active) { p.img.color = C(0, 0, 0, 0); return; }
      const style = this.style(p);
      p.life += dt;
      const v = { ...p.vel };
      if (style === 'Leaf' || style === 'Snow') v.x += Math.sin(this.t * 1.5 + p.phase) * 40;
      p.pos = v2(p.pos.x + v.x * dt * (1 + surge * 1.5), p.pos.y + v.y * dt * (1 + surge * 1.5));
      const outside = p.pos.y > 1140 || p.pos.y < -60 || p.pos.x < -80 || p.pos.x > 2000;
      if (p.life >= p.maxLife || outside) { this.respawn(p, false); return; }
      const lifeK = Math.sin(clamp01(p.life / p.maxLife) * Math.PI);
      const c = this.colorOf(p);
      let alpha = style === 'Wisp' ? 0.25 : style === 'Rain' ? 0.55 : 0.7;
      if (style === 'Ember') alpha *= 0.7 + 0.3 * Math.sin(this.t * 12 + p.phase);
      p.img.color = C(c.r, c.g, c.b, alpha * lifeK * A);
      p.img.rt.anchoredPosition = p.pos;
      if (style === 'Rain') { p.img.rt.sizeDelta = v2(p.size * 0.6, p.size * 9); p.img.rt.rotation = 9; }
      else {
        p.img.rt.sizeDelta = style === 'Leaf' ? v2(p.size * 1.6, p.size * 0.8) : v2(p.size, p.size);
        p.img.rt.rotation = style === 'Leaf' || style === 'Rubble' ? p.phase * 30 + this.t * p.spin : 0;
      }
    });
  }
}
export type { GameContent };
