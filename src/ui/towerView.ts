// Port of UI/TowerView.cs (art-sprite path: the 5 Unity tower stage images) with HP plate, hit shake, flash,
// debris, smoke, near-collapse warning and collapse animation.
import { THEME } from '../config/theme';
import { VFX } from '../config/vfx';
import { PlayerSlot, slotLabel } from '../core/types';
import { TowerVisual, VisualLibrary } from '../game/visuals';
import { C, Color, lerpColor, WHITE } from './color';
import { addUpdate, Co, CoOwner, Img, RT, Time, Txt, v2 } from './engine';
import { makeFrame, makeImage, makeText, rect, rtOf } from './factory';
import { clamp01, moveTowards, rand } from './mathf';
import { SF } from './sprites';

const PLATE_H = 50;
const PLATE_W = 236;
const BODY = v2(300, 380);

export class TowerView {
  static readonly ViewSize = v2(320, 440);
  readonly rt: RT;
  private visual: TowerVisual;
  private bodyRoot: RT; private body: RT; private sprite: Img; private core: Img; private coreGlow: Img;
  private danger: Img; private smoke: Img[] = []; private debris: Img[] = []; private flash: Img; private dust: Img;
  private plate: RT; private plateHit: Img; private plateOutline: Img; private hpText: Txt; private hpMax: Txt;
  private barFill: Img; private barTrail: Img; private ticks: RT; private stageBg: Img; private stageText: Txt; private warnBg: Img;
  private hitPower = 0.5; private collapsed = false; private stage = -1;
  private displayHp = -1; private trailHp = -1; private trailDelay = 0; private targetHp = 0; private maxHp = 1;
  private t = 0; private left = true; private hitTime = -10;
  private co = new CoOwner(); private hitCo = new CoOwner(); private pulseCo = new CoOwner();

  get coreRect() { return this.core.rt; }

  constructor(parent: RT, private lib: VisualLibrary, readonly slot: PlayerSlot) {
    this.rt = rect(slotLabel(slot) + 'Tower', parent);
    this.rt.sizeDelta = TowerView.ViewSize;
    this.visual = lib.tower(slot);
    const accent = this.visual.accentColor;
    const th = THEME;

    this.danger = makeImage('Danger', this.rt, C(1, 0.2, 0.15, 0), SF.glow(256));
    this.danger.rt.place(v2(0.5, 0), v2(0, PLATE_H + 150), v2(420, 420));
    const cast = makeImage('CastShadow', this.rt, C(0, 0, 0, 0.32), SF.softBlob());
    cast.rt.place(v2(0.5, 0), v2(70, PLATE_H + 6), v2(330, 80));
    cast.rt.rotation = 10;
    const shadow = makeImage('Shadow', this.rt, C(0, 0, 0, 0.5), SF.softBlob());
    shadow.rt.place(v2(0.5, 0), v2(0, PLATE_H - 8), v2(300, 64));

    this.bodyRoot = rect('BodyRoot', this.rt).place(v2(0.5, 0), v2(0, PLATE_H - 22), BODY, v2(0.5, 0));
    this.body = rect('Body', this.bodyRoot).stretch();
    this.body.pivot = v2(0.5, 0);
    this.sprite = makeImage('StageSprite', this.body, WHITE);
    this.sprite.rt.stretch();
    this.sprite.rt.pivot = v2(0.5, 0);
    this.sprite.preserveAspect = true;

    this.coreGlow = makeImage('CoreGlow', this.body, C(accent.r, accent.g, accent.b, 0.55), SF.glow());
    this.coreGlow.rt.place(v2(0.5, 0), v2(0, 215), v2(160, 160));
    this.core = makeImage('Core', this.body, C(accent.r, accent.g, accent.b, 0), SF.circle());
    this.core.rt.place(v2(0.5, 0), v2(0, 215), v2(66, 66)); // spell target = painted crystal

    for (let i = 0; i < 3; i++) {
      const s = makeImage('Smoke' + i, this.rt, C(0.45, 0.47, 0.5, 0), SF.softBlob());
      s.rt.place(v2(0.5, 0), v2(-30 + i * 30, 360), v2(100, 100));
      this.smoke.push(s);
    }
    this.flash = makeImage('Flash', this.bodyRoot, C(1, 1, 1, 0), SF.glow(256));
    this.flash.rt.stretch(-70, -70, -50, -30);
    for (let i = 0; i < 8; i++) {
      const d = makeImage('Debris' + i, this.rt, C(0.55, 0.58, 0.62, 0), SF.diamond());
      d.rt.place(v2(0.5, 0), v2(0, 260), v2(14, 14));
      this.debris.push(d);
    }
    this.dust = makeImage('Dust', this.rt, C(0, 0, 0, 0), SF.softBlob());
    this.dust.rt.place(v2(0.5, 0), v2(0, PLATE_H + 40), v2(200, 120));

    // compact HP plate attached to the tower base
    this.plate = rect('HpPlate', this.rt).place(v2(0.5, 0), v2(0, 0), v2(PLATE_W, PLATE_H), v2(0.5, 0));
    makeFrame('Bg', this.plate, true, 1).rt.stretch();
    this.plateHit = makeImage('Hit', this.plate, C(1, 0.25, 0.2, 0), SF.softFrame(14, 16), true);
    this.plateHit.rt.stretch(-12, -12, -12, -12);
    this.plateOutline = makeImage('Outline', this.plate, C(accent.r, accent.g, accent.b, 0.7), SF.roundedOutline(12, 2), true);
    this.plateOutline.rt.stretch(9, 9, 9, 9);
    const heart = makeImage('HpGem', this.plate, C(1, 0.38, 0.35), SF.diamond());
    heart.rt.place(v2(0, 0.5), v2(24, 0), v2(20, 20));
    this.hpText = makeText('Hp', this.plate, '24', 28, WHITE, 'MiddleRight', true).shadowed(0.8);
    rtOf(this.hpText).place(v2(0, 0.5), v2(76, 1), v2(46, 34), v2(1, 0.5));
    this.hpText.wrap = false;
    this.hpMax = makeText('Max', this.plate, '/24', 13, th.mutedTextColor, 'MiddleLeft', true);
    rtOf(this.hpMax).place(v2(0, 0.5), v2(77, -5), v2(34, 18), v2(0, 0.5));
    const barBack = makeImage('BarBack', this.plate, C(0, 0, 0, 0.7), SF.roundedRect(6), true);
    const bb = barBack.rt;
    bb.anchorMin = v2(0, 0.5); bb.anchorMax = v2(1, 0.5); bb.pivot = v2(0.5, 0.5);
    bb.offsetMin = v2(114, -8); bb.offsetMax = v2(-16, 8);
    this.barTrail = makeImage('Trail', bb, C(1, 0.85, 0.7, 0.9), SF.roundedRect(6), true);
    this.barTrail.rt.anchorMin = v2(0, 0); this.barTrail.rt.anchorMax = v2(1, 1); this.barTrail.rt.offsetMin = v2(2, 2); this.barTrail.rt.offsetMax = v2(-2, -2);
    this.barFill = makeImage('Fill', bb, th.positiveColor, SF.roundedRect(6), true);
    this.barFill.rt.anchorMin = v2(0, 0); this.barFill.rt.anchorMax = v2(1, 1); this.barFill.rt.offsetMin = v2(2, 2); this.barFill.rt.offsetMax = v2(-2, -2);
    this.ticks = rect('Ticks', bb).stretch(2, 2, 2, 2);

    this.stageBg = makeImage('Stage', this.plate, C(0.39, 0.83, 0.53, 0.2), SF.roundedRect(10), true);
    this.stageBg.rt.place(v2(1, 1), v2(-14, 2), v2(78, 20), v2(1, 0));
    this.stageText = makeText('Text', this.stageBg.rt, '온전함', 13, WHITE, 'MiddleCenter', true).shadowed(0.9);
    rtOf(this.stageText).stretch();
    this.warnBg = makeImage('Warn', this.plate, C(1, 0.3, 0.25, 0.95), SF.roundedRect(10), true);
    this.warnBg.rt.place(v2(0, 1), v2(14, 2), v2(96, 22), v2(0, 0));
    rtOf(makeText('Text', this.warnBg.rt, '붕괴 위험', 14, WHITE, 'MiddleCenter', true)).stretch();
    this.warnBg.rt.setActive(false);
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  setSide(left: boolean) { this.left = left; }

  private buildTicks(maxHp: number) {
    for (const ch of [...this.ticks.children]) ch.destroy();
    const step = maxHp > 30 ? 5 : maxHp > 12 ? 4 : 1;
    for (let v = step; v < maxHp; v += step) {
      const tick = makeImage('Tick', this.ticks, C(0, 0, 0, 0.45));
      const x = v / maxHp;
      tick.rt.anchorMin = v2(x, 0); tick.rt.anchorMax = v2(x, 1);
      tick.rt.sizeDelta = v2(2, 0);
      tick.rt.anchoredPosition = v2(0, 0);
    }
  }

  setHp(hp: number, maxHp: number, instant: boolean) {
    maxHp = Math.max(1, maxHp);
    if (maxHp !== this.maxHp || this.ticks.children.length === 0) this.buildTicks(maxHp);
    this.maxHp = maxHp;
    if (instant || this.displayHp < 0) { this.displayHp = hp; this.trailHp = hp; }
    if (hp < this.targetHp) this.trailDelay = 0.45;
    this.targetHp = hp;
    this.applyStage(hp);
    this.hpText.text = String(hp);
    this.hpMax.text = '/' + maxHp;
  }

  private applyStage(hp: number) {
    const lib = this.lib;
    const stage = lib.towerStageIndex(this.visual, hp, this.maxHp);
    const changed = stage !== this.stage;
    this.stage = stage;
    const sv = lib.towerStage(this.visual, stage);
    this.sprite.sprite = sv.sprite;
    this.sprite.color = WHITE;
    const destroyedIndex = this.visual.stages.length;
    const severity = destroyedIndex > 0 ? stage / destroyedIndex : 0;
    const destroyed = stage >= destroyedIndex;
    const accent = this.visual.accentColor;
    const a = destroyed ? 0 : [0.3, 0.26, 0.18, 0.12][Math.max(0, Math.min(3, stage))];
    this.coreGlow.color = C(accent.r, accent.g, accent.b, a);
    const th = THEME;
    const stageColor = stage === 0 ? th.positiveColor : destroyed ? C(0.6, 0.6, 0.6) : lerpColor(th.accentColor, th.negativeColor, severity);
    this.stageBg.color = C(stageColor.r, stageColor.g, stageColor.b, 0.22);
    this.stageText.color = stageColor;
    this.stageText.text = sv.label;
    this.warnBg.rt.setActive(!destroyed && stage === destroyedIndex - 1);
    if (changed && this.displayHp >= 0 && this.rt.activeInHierarchy) {
      this.pulseCo.stopAll();
      this.pulseCo.start(co => this.stagePulse(co));
      if (destroyed && !this.collapsed) { this.collapsed = true; this.co.start(co => this.collapse(co)); }
      else if (!destroyed) { this.collapsed = false; this.bodyRoot.rotation = 0; this.bodyRoot.setScale(1, 1); if (stage > 0) this.co.start(co => this.dustPuff(co, 0.6)); }
    }
    if (!destroyed && this.collapsed) { this.collapsed = false; this.bodyRoot.rotation = 0; this.bodyRoot.setScale(1, 1); }
  }

  private async stagePulse(co: Co) {
    for (let t = 0; t < 0.6; t += Time.dt) {
      const s = 1 + 0.3 * Math.sin((t / 0.6) * Math.PI);
      this.stageBg.rt.setScale(s, s);
      await co.frame();
    }
    this.stageBg.rt.setScale(1, 1);
  }

  private async dustPuff(co: Co, strength: number) {
    for (let t = 0; t < 0.9; t += Time.dt) {
      const k = t / 0.9;
      const m = 0.7 + 0.5 * strength;
      this.dust.rt.sizeDelta = v2((160 + (420 - 160) * k) * m, (80 + (200 - 80) * k) * m);
      this.dust.rt.anchoredPosition = v2(0, PLATE_H + 30 + 40 * k);
      this.dust.color = C(0.55, 0.56, 0.6, 0.6 * strength * (1 - k));
      await co.frame();
    }
    this.dust.color = C(0, 0, 0, 0);
  }

  private async collapse(co: Co) {
    this.co.start(c => this.dustPuff(c, 1.4));
    const side = this.left ? -1 : 1;
    for (let t = 0; t < 0.8; t += Time.dt) {
      const e = (t / 0.8) ** 2;
      this.bodyRoot.rotation = side * 9 * e;
      this.bodyRoot.setScale(1 + 0.04 * e, 1 - 0.12 * e);
      await co.frame();
    }
  }

  playHit(damage = 3) {
    this.hitTime = this.t;
    this.hitPower = clamp01(0.35 + damage / 8);
    if (!this.rt.activeInHierarchy) return;
    this.hitCo.stopAll();
    this.hitCo.start(co => this.hitRoutine(co));
  }

  private async hitRoutine(co: Co) {
    const K = VFX.towerHit;
    const base = v2(0, PLATE_H - 22);
    const dirs = this.debris.map((_, i) => {
      const a = (30 + (150 - 30) * (i / (this.debris.length - 1))) * Math.PI / 180;
      const m = rand(90, 170) * (0.7 + 0.7 * this.hitPower);
      return v2(Math.cos(a) * m, Math.sin(a) * m);
    });
    for (let t = 0; t < 0.6; t += Time.dt) {
      const k = 1 - t / 0.6;
      const amp = (8 + 16 * this.hitPower) * K;
      this.bodyRoot.anchoredPosition = v2(base.x + Math.sin(t * 70) * amp * k, base.y + Math.sin(t * 53) * 4 * k * K - 10 * this.hitPower * Math.sin(Math.min(1, t / 0.12) * Math.PI) * K);
      if (!this.collapsed) this.bodyRoot.setScale(1 + 0.05 * this.hitPower * k * K, 1 - 0.07 * this.hitPower * k * K);
      this.flash.color = C(1, 0.92, 0.85, (0.6 + 0.35 * this.hitPower) * k * K);
      this.sprite.color = lerpColor(WHITE, C(1, 0.55, 0.5), 0.6 * k * K);
      this.plateHit.color = C(1, 0.25, 0.2, 0.65 * k);
      this.plate.setScale(1 + 0.08 * k, 1 + 0.08 * k);
      this.plate.anchoredPosition = v2(Math.sin(t * 90) * 5 * k, 0);
      const p = t / 0.6;
      this.debris.forEach((d, i) => {
        d.rt.anchoredPosition = v2(dirs[i].x * p, 250 + dirs[i].y * p - 260 * p * p);
        d.rt.rotation = p * 400 + i * 40;
        d.color = C(0.62, 0.64, 0.68, (1 - p) * K);
      });
      await co.frame();
    }
    this.bodyRoot.anchoredPosition = base;
    if (!this.collapsed) this.bodyRoot.setScale(1, 1);
    this.sprite.color = WHITE;
    this.plate.anchoredPosition = v2(0, 0);
    this.flash.color = C(1, 1, 1, 0);
    this.plateHit.color = C(1, 0.25, 0.2, 0);
    this.plate.setScale(1, 1);
    for (const d of this.debris) d.color = C(0, 0, 0, 0);
  }

  private update(dt: number) {
    this.t += dt;
    if (this.displayHp >= 0 && Math.abs(this.displayHp - this.targetHp) > 0.01) this.displayHp = moveTowards(this.displayHp, this.targetHp, dt * 24);
    if (this.trailDelay > 0) this.trailDelay -= dt;
    else if (this.trailHp > this.displayHp) this.trailHp = moveTowards(this.trailHp, this.displayHp, dt * 10);
    if (this.trailHp < this.displayHp) this.trailHp = this.displayHp;
    const ratio = clamp01(this.displayHp / this.maxHp);
    const trail = clamp01(this.trailHp / this.maxHp);
    this.barFill.rt.anchorMax = v2(Math.max(0.001, ratio), 1);
    this.barTrail.rt.anchorMax = v2(Math.max(0.001, trail), 1);
    const th = THEME;
    this.barFill.color = ratio > 0.5 ? th.positiveColor : ratio > 0.25 ? th.accentColor : th.negativeColor;
    const destroyedIndex = this.visual.stages.length;
    const critical = this.stage === destroyedIndex - 1;
    const beat = 0.5 + 0.5 * Math.sin(this.t * 6);
    this.danger.color = C(1, 0.2, 0.15, critical ? (0.18 + 0.22 * beat) * VFX.towerHit : 0);
    this.hpText.color = critical ? lerpColor(WHITE, th.negativeColor, beat) : WHITE;
    if (this.warnBg.rt.active) this.warnBg.rt.setScale(1 + 0.06 * beat, 1 + 0.06 * beat);
    if (this.t - this.hitTime > 0.6) {
      const ac = this.visual.accentColor;
      this.plateOutline.color = lerpColor(C(ac.r, ac.g, ac.b, 0.7), th.negativeColor, critical ? beat * 0.8 : 0);
    }
    const smoke = this.stage <= 0 ? 0 : clamp01(this.stage / destroyedIndex);
    this.smoke.forEach((s, i) => {
      const phase = (this.t * 0.5 + i / 3) % 1;
      const on = i < Math.ceil(smoke * 3);
      s.rt.anchoredPosition = v2(-30 + i * 30 + phase * 20, 330 + phase * 120 - (this.stage >= destroyedIndex ? 170 : 0));
      s.rt.setScale(0.6 + phase * 1.2, 0.6 + phase * 1.2);
      s.color = C(0.4, 0.42, 0.45, on ? 0.5 * Math.sin(phase * Math.PI) : 0);
    });
    if (this.stage < destroyedIndex) {
      const pulse = 1 + 0.06 * Math.sin(this.t * (2 + this.stage * 2.5));
      this.coreGlow.rt.setScale(pulse, pulse);
    }
  }
}
export type { Color };
