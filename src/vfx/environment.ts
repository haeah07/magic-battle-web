// Port of UI/FieldEnvironmentView.cs — element environment overlays across the whole arena
// (fire cracks/embers/haze, water ripples, nature vines/leaves, ice frost/crystals, rock dust, light pillars, dark fog).
// Each set fades with its element's field level (Lv1 ≈ 45%, Lv2 ≈ 75%, Lv3 = 100%).
import { LAYOUT } from '../config/layout';
import { VFX } from '../config/vfx';
import { FieldModeType, FieldState, fieldMode, level } from '../core/field';
import { Element } from '../core/types';
import { VisualLibrary } from '../game/visuals';
import { C, CLEAR, Color, lerpColor, WHITE } from '../ui/color';
import { addUpdate, Img, RT, V2, v2 } from '../ui/engine';
import { makeImage, rect } from '../ui/factory';
import { clamp01, lerp, moveTowards } from '../ui/mathf';
import { SF, SpriteRef } from '../ui/sprites';
import { FLOOR_TILT } from './arena';

enum Motion { Static, Rise, Fall, Drift, Ripple, Haze, Hover, Sway, Spin }

interface Piece { img: Img; motion: Motion; home: V2; size: V2; phase: number; speed: number; baseAlpha: number; rot: number; color: Color }
interface PieceSet { element: Element; root: RT; pieces: Piece[]; weight: number; target: number }

const f = Math.fround;
/** Same float32 arithmetic as Unity's Hash so the decorations land on the same spots. */
function hash(i: number, salt: number) {
  const x = f(f(f(i) * f(12.9898)) + f(f(salt) * f(78.233)));
  const m = Math.abs(f(f(Math.sin(x)) * f(43758.5453)));
  return f(m % 1);
}
const Floor = () => LAYOUT.floorCenter;
const FloorHalf = () => v2(LAYOUT.floorSize.x * 0.5, LAYOUT.floorSize.x * 0.5 * FLOOR_TILT);
function floorPoint(i: number, salt: number, minR = 0.1, maxR = 0.95): V2 {
  const a = hash(i, salt) * Math.PI * 2;
  const r = lerp(minR, maxR, Math.sqrt(hash(i, salt + 1)));
  const F = Floor(), H = FloorHalf();
  return v2(F.x + Math.cos(a) * H.x * r, F.y + Math.sin(a) * H.y * r);
}
const add = (a: V2, b: V2) => v2(a.x + b.x, a.y + b.y);

export class FieldEnvironmentView {
  readonly rt: RT;
  private sets = new Map<Element, PieceSet>();
  private grade: Img;
  private gradeTarget: Color = CLEAR;
  private unstable = false;
  private t = 0;

  constructor(parent: RT, private lib: VisualLibrary) {
    this.rt = rect('FieldEnvironment', parent).stretch();
    this.grade = makeImage('ColorGrade', this.rt, CLEAR);
    this.grade.rt.stretch(-60, -60, -60, -60);
    this.build();
    addUpdate(this);
  }

  private newSet(e: Element): PieceSet {
    const s: PieceSet = { element: e, root: rect('Env_' + Element[e], this.rt).stretch(), pieces: [], weight: 0, target: 0 };
    this.sets.set(e, s);
    return s;
  }

  private add(s: PieceSet, name: string, sprite: SpriteRef, color: Color, pos: V2, size: V2, motion: Motion, alpha: number, speed = 1, rot = 0, phase = -1): Piece {
    const img = makeImage(name, s.root, CLEAR, sprite);
    img.rt.place(v2(0.5, 0.5), pos, size);
    img.rt.rotation = rot;
    const p: Piece = { img, motion, home: pos, size, phase: phase >= 0 ? phase : hash(s.pieces.length, s.element * 13), speed, baseAlpha: alpha, rot, color };
    s.pieces.push(p);
    return p;
  }

  private build() {
    const F = Floor(), H = FloorHalf();
    // ---- fire
    const fire = this.newSet(Element.Fire);
    this.add(fire, 'RedFog', SF.softBlob(), C(1, 0.25, 0.08), add(F, v2(0, -60)), v2(2000, 520), Motion.Drift, 0.12, 0.3);
    for (let i = 0; i < 9; i++) {
      const pos = floorPoint(i, 3, 0.35);
      this.add(fire, 'CrackGlow' + i, SF.glow(64), C(1, 0.35, 0.1), pos, v2(120, 60), Motion.Hover, 0.35, 0.7);
      this.add(fire, 'Crack' + i, SF.crack(), C(1, 0.55, 0.2), pos, v2(16, 90 + hash(i, 4) * 60), Motion.Hover, 0.9, 1.3, 50 + hash(i, 5) * 80);
    }
    for (let i = 0; i < 3; i++)
      this.add(fire, 'Haze' + i, SF.waveBand(), C(1, 0.7, 0.5), v2(-300 + i * 300, -200 + i * 120), v2(900, 70), Motion.Haze, 0.08, 0.6 + i * 0.2);
    for (let i = 0; i < 18; i++)
      this.add(fire, 'Ember' + i, SF.glow(64), i % 3 === 0 ? C(1, 0.85, 0.45) : C(1, 0.45, 0.15), floorPoint(i, 6, 0, 1), v2(9, 9), Motion.Rise, 0.9, 0.35 + hash(i, 7) * 0.4);

    // ---- water
    const water = this.newSet(Element.Water);
    this.add(water, 'BlueFog', SF.softBlob(), C(0.2, 0.5, 1), F, v2(2000, 560), Motion.Drift, 0.11, 0.25);
    for (let i = 0; i < 4; i++)
      this.add(water, 'Reflection' + i, SF.waveBand(), C(0.6, 0.85, 1), add(F, v2(-380 + i * 250, -160 + (i % 2) * 260)), v2(520, 40), Motion.Haze, 0.2, 0.4 + i * 0.1);
    for (let i = 0; i < 6; i++)
      this.add(water, 'Ripple' + i, SF.ring(128, 0.05), C(0.6, 0.85, 1), floorPoint(i, 11, 0.25), v2(160, 160 * FLOOR_TILT), Motion.Ripple, 0.6, 0.35 + hash(i, 12) * 0.2);
    for (let i = 0; i < 16; i++)
      this.add(water, 'Drop' + i, SF.drop(), C(0.7, 0.9, 1), v2(-900 + hash(i, 13) * 1800, 0), v2(10, 15), Motion.Fall, 0.7, 0.5 + hash(i, 14) * 0.4);

    // ---- nature
    const nature = this.newSet(Element.Nature);
    this.add(nature, 'GreenMana', SF.softBlob(), C(0.35, 0.95, 0.45), F, v2(1900, 520), Motion.Drift, 0.1, 0.3);
    const vinePos = [v2(-930, -330), v2(-940, 260), v2(930, -260), v2(935, 300), v2(-520, -500), v2(560, 500)];
    const vineRot = [-12, 192, 10, 170, -80, 100];
    for (let i = 0; i < vinePos.length; i++)
      this.add(nature, 'Vine' + i, SF.vine(), C(0.2, 0.5, 0.26), vinePos[i], v2(110, 420), Motion.Sway, 0.6, 0.6, vineRot[i]);
    for (let i = 0; i < 14; i++)
      this.add(nature, 'Leaf' + i, SF.leaf(), i % 2 === 0 ? C(0.45, 0.9, 0.4) : C(0.75, 0.95, 0.4), v2(-900 + hash(i, 21) * 1800, 0), v2(18, 24), Motion.Fall, 0.85, 0.12 + hash(i, 22) * 0.1);
    for (let i = 0; i < 14; i++)
      this.add(nature, 'Life' + i, SF.glow(64), C(0.6, 1, 0.6), floorPoint(i, 23, 0, 1), v2(12, 12), Motion.Rise, 0.8, 0.2 + hash(i, 24) * 0.25);

    // ---- ice
    const ice = this.newSet(Element.Ice);
    this.add(ice, 'Frost', SF.softBlob(), C(0.85, 0.95, 1), F, v2(1500, 560), Motion.Static, 0.14);
    this.add(ice, 'ColdFog', SF.softBlob(), C(0.75, 0.9, 1), add(F, v2(0, -120)), v2(2100, 420), Motion.Drift, 0.12, 0.2);
    for (let i = 0; i < 2; i++)
      this.add(ice, 'ColdLight' + i, SF.lightShaft(), C(0.8, 0.95, 1), v2(-420 + i * 840, 160), v2(260, 900), Motion.Hover, 0.16, 0.3, i === 0 ? -18 : 18);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + 0.2;
      const pos = v2(F.x + Math.cos(a) * H.x * 0.9, F.y + Math.sin(a) * H.y * 0.9);
      const h = 50 + hash(i, 31) * 60;
      this.add(ice, 'Crystal' + i, SF.crystal(), C(0.75, 0.93, 1), add(pos, v2(0, h * 0.4)), v2(h * 0.4, h), Motion.Hover, 0.75, 0.4, -15 + hash(i, 32) * 30);
    }
    for (let i = 0; i < 12; i++)
      this.add(ice, 'Glint' + i, SF.diamond(), WHITE, floorPoint(i, 33, 0.1, 1), v2(8, 8), Motion.Hover, 0.9, 2);

    // ---- rock
    const rock = this.newSet(Element.Rock);
    this.add(rock, 'Dust', SF.softBlob(), C(0.7, 0.55, 0.38), add(F, v2(0, -80)), v2(2000, 460), Motion.Drift, 0.15, 0.35);
    for (let i = 0; i < 7; i++)
      this.add(rock, 'Crack' + i, SF.crack(), C(0.12, 0.08, 0.05), floorPoint(i, 41, 0.3), v2(22, 130 + hash(i, 42) * 70), Motion.Static, 0.85, 1, 40 + hash(i, 43) * 100);
    for (let i = 0; i < 12; i++)
      this.add(rock, 'Fragment' + i, i % 2 === 0 ? SF.diamond() : SF.shard(), C(0.62, 0.5, 0.38), add(floorPoint(i, 44, 0.2, 1), v2(0, 30 + hash(i, 45) * 120)), v2(14 + hash(i, 46) * 14, 14 + hash(i, 47) * 20), Motion.Spin, 0.9, 0.5 + hash(i, 48));
    for (let i = 0; i < 4; i++)
      this.add(rock, 'DustPuff' + i, SF.softBlob(), C(0.65, 0.52, 0.4), floorPoint(i, 49, 0.4), v2(260, 120), Motion.Drift, 0.2, 0.5);

    // ---- light
    const light = this.newSet(Element.Light);
    this.add(light, 'Halo', SF.softBlob(), C(1, 0.92, 0.6), v2(0, 330), v2(700, 240), Motion.Hover, 0.14, 0.4);
    this.add(light, 'HaloGlow', SF.softBlob(), C(1, 0.9, 0.55), v2(0, 300), v2(1300, 500), Motion.Hover, 0.1, 0.3);
    for (let i = 0; i < 4; i++)
      this.add(light, 'Pillar' + i, SF.lightShaft(), C(1, 0.93, 0.65), v2(-660 + i * 440, 60), v2(160, 1000), Motion.Hover, 0.18, 0.5 + i * 0.1);
    for (let i = 0; i < 18; i++)
      this.add(light, 'Gold' + i, SF.glow(64), C(1, 0.88, 0.45), floorPoint(i, 51, 0, 1), v2(10, 10), Motion.Rise, 0.9, 0.2 + hash(i, 52) * 0.3);

    // ---- dark
    const dark = this.newSet(Element.Dark);
    this.add(dark, 'Shadow', SF.vignette(), C(0.08, 0, 0.14), v2(0, 0), v2(2400, 1400), Motion.Static, 0.9);
    this.add(dark, 'PurpleFog', SF.softBlob(), C(0.5, 0.2, 0.85), add(F, v2(0, -40)), v2(2000, 520), Motion.Drift, 0.14, 0.25);
    for (let i = 0; i < 4; i++)
      this.add(dark, 'Wisp' + i, SF.softBlob(), C(0.3, 0.1, 0.5), floorPoint(i, 61, 0.5), v2(380, 160), Motion.Drift, 0.3, 0.4);
    for (let i = 0; i < 18; i++)
      this.add(dark, 'Mana' + i, SF.glow(64), i % 3 === 0 ? C(0.7, 0.45, 1) : C(0.12, 0.05, 0.2), floorPoint(i, 62, 0, 1), v2(14, 14), Motion.Rise, 0.9, 0.18 + hash(i, 63) * 0.25);

    for (const s of this.sets.values()) s.root.setActive(false);
  }

  render(field: FieldState, instant: boolean) {
    const content = this.lib.content;
    const mode = fieldMode(content, field);
    this.unstable = mode.type === FieldModeType.Unstable;
    for (const s of this.sets.values()) s.target = 0;
    const amount = (e: Element) => {
      const lv = level(content.rules, field.get(e));
      return lv <= 0 ? 0 : lv === 1 ? 0.45 : lv === 2 ? 0.75 : 1;
    };
    if (mode.type !== FieldModeType.Neutral && mode.top !== Element.None) {
      const a = this.sets.get(mode.top);
      if (a) a.target = amount(mode.top) * (mode.type === FieldModeType.Dominant ? 1 : 0.8);
    }
    if ((mode.type === FieldModeType.Hybrid || mode.type === FieldModeType.Unstable) && mode.second !== Element.None) {
      const b = this.sets.get(mode.second);
      if (b) b.target = amount(mode.second) * 0.8;
    }
    const theme = this.lib.fieldTheme(field);
    this.gradeTarget = C(theme.bright.r, theme.bright.g, theme.bright.b, mode.type === FieldModeType.Neutral ? 0 : 0.015 + theme.intensity * 0.035);
    if (instant) for (const s of this.sets.values()) s.weight = s.target;
  }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 1.4);
    this.grade.color = lerpColor(this.grade.color, this.gradeTarget, k);
    const strength = VFX.fieldChange;
    for (const s of this.sets.values()) {
      s.weight = moveTowards(lerp(s.weight, s.target, k), s.target, dt * 0.05);
      const on = s.weight * strength > 0.004;
      if (s.root.active !== on) s.root.setActive(on);
      if (!on) continue;
      const w = s.weight * (this.unstable ? 0.75 + 0.25 * Math.sin(this.t * 9 + s.element) : 1);
      const visible = Math.ceil(s.pieces.length * clamp01(0.35 + w));
      for (let i = 0; i < s.pieces.length; i++) this.animate(s.pieces[i], i < visible ? w : 0, strength);
    }
  }

  private animate(p: Piece, w: number, strength: number) {
    const rt = p.img.rt;
    let a = p.baseAlpha * w;
    const t = this.t * p.speed + p.phase * 10;
    switch (p.motion) {
      case Motion.Static: break;
      case Motion.Hover: a *= 0.65 + 0.35 * Math.sin(t * 2); break;
      case Motion.Drift:
        rt.anchoredPosition = v2(p.home.x + Math.sin(t * 0.4) * 120, p.home.y + Math.sin(t * 0.3) * 14);
        rt.setScale(1 + 0.06 * Math.sin(t * 0.5));
        break;
      case Motion.Rise: {
        const c = (t * 0.25) % 1;
        rt.anchoredPosition = v2(p.home.x + Math.sin(t * 1.1 + p.phase * 6) * 18, p.home.y + c * 360);
        const sz = (0.55 + 0.9 * p.phase) * (1 - 0.45 * c);
        rt.setScale(sz, sz);
        a *= Math.sin(c * Math.PI) * (0.8 + 0.2 * Math.sin(t * 9 + p.phase * 20));
        break;
      }
      case Motion.Fall: {
        const c = (t * 0.25 + p.phase) % 1;
        rt.anchoredPosition = v2(p.home.x + Math.sin(t * 1.2) * 30, 600 - c * 1150);
        rt.rotation = p.rot + Math.sin(t) * 40;
        a *= clamp01(Math.sin(c * Math.PI) * 2);
        break;
      }
      case Motion.Ripple: {
        const c = (t * 0.35) % 1;
        rt.setScale(0.3 + c * 1.4, 0.3 + c * 1.4);
        a *= 1 - c;
        break;
      }
      case Motion.Haze: {
        const c = (t * 0.12) % 1;
        rt.anchoredPosition = v2(p.home.x + Math.sin(t * 0.6) * 60, p.home.y + c * 160);
        rt.setScale(1 + 0.08 * Math.sin(t * 2.3), 1);
        a *= Math.sin(c * Math.PI);
        break;
      }
      case Motion.Sway:
        rt.rotation = p.rot + Math.sin(t * 0.8) * 3;
        rt.setScale(1, 0.35 + 0.65 * w);
        break;
      case Motion.Spin:
        rt.anchoredPosition = v2(p.home.x, p.home.y + Math.sin(t * 1.3) * 16);
        rt.rotation = p.rot + t * 25;
        break;
    }
    p.img.color = C(p.color.r, p.color.g, p.color.b, clamp01(a * strength));
  }
}
