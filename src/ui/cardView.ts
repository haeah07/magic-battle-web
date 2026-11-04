// Port of UI/CardView.cs (+ CardDragHandler). Card size 200×290, same layout numbers as Unity.
import { CARD } from '../config/layout';
import { THEME } from '../config/theme';
import { VFX } from '../config/vfx';
import { CardPower, powerFromStats } from '../core/combat';
import { CardDef, CombatStats, roleLabel, traitIsAlways } from '../core/types';
import { VisualLibrary } from '../game/visuals';
import { CardAuraView } from '../vfx/cardAura';
import { InvestAuraView } from '../vfx/investAura';
import { C, Color, colorize, lerpColor, WHITE } from './color';
import { addUpdate, Co, CoOwner, Img, RT, scene, Time, Txt, V2, v2 } from './engine';
import { makeImage, makeRich, makeText, rect, rtOf } from './factory';
import { RichTxt } from './engine';
import { clamp01 } from './mathf';
import { art, croppedArt, SF } from './sprites';

export const MANA_COLOR: Color = C(0.55, 0.9, 1);

export interface DragHooks {
  dragLayer: RT;
  canDrag: (c: CardView) => boolean;
  dragStarted?: (c: CardView) => void;
  dropped: (c: CardView, worldPos: V2) => boolean;
  /** called while dragging (e.g. highlight the drop zone under the pointer) */
  dragMove?: (c: CardView, worldPos: V2) => void;
}

export class CardView {
  static readonly Size = CARD.size;
  readonly rt: RT;
  readonly visual: RT;
  uid: string | null = null;
  cardId: string | null = null;
  def: CardDef | null = null;
  faceDown = true;
  interactable = true;

  onClicked: ((c: CardView) => void)[] = [];
  onHoverEnter: ((c: CardView) => void)[] = [];
  onHoverExit: ((c: CardView) => void)[] = [];

  private front: RT; private back: RT; private auraBack: RT; private auraFront: RT; private investBack: RT;
  readonly aura: CardAuraView;
  private invest: InvestAuraView;
  private investGain = 0;
  private base: Img; private border: Img; private artBg: Img; private art: Img; private artTint: Img;
  private placeholderGlyph: Txt; private name: Txt; private costGem: Img; private costRing: Img; private elementRing: Img; private cost: Txt;
  private elementBadge: Img; private elementGlyph: Txt; private elementLabel: Txt; private trait: RichTxt;
  private statValue: Txt[] = []; private statBg: Img[] = [];
  private powerChip: Img; private powerText: Txt; private testBadge: Img; private selectGlow: Img; private dim: Img;
  private elementColor: Color = WHITE;
  private hoverTarget = 0;
  private scaleTarget = 1;
  private hovered = false;
  private selected = false;
  private hoverEnabled = true;
  private flipping = false;
  private press = 1;
  readonly co = new CoOwner();
  drag: DragHooks | null = null;
  private dragState: { dragging: boolean; parent: RT; index: number; pos: V2 } | null = null;

  get isHovered() { return this.hovered && this.hoverEnabled; }
  get power(): CardPower { return this.aura.power; }

  constructor(parent: RT, private lib: VisualLibrary, name = 'Card') {
    const th = THEME;
    this.rt = rect(name, parent);
    this.rt.sizeDelta = CardView.Size;
    const hit = makeImage('Hit', this.rt, C(0, 0, 0, 0), null, false, true);
    hit.rt.stretch();
    this.wireInput(hit);

    this.visual = rect('Visual', this.rt).stretch();
    this.selectGlow = makeImage('SelectGlow', this.visual, C(1, 0.85, 0.4, 0), SF.softFrame(18, 24), true);
    this.selectGlow.rt.stretch(-24, -24, -24, -24);
    this.investBack = rect('InvestBack', this.visual).stretch();
    this.invest = new InvestAuraView(this.investBack);
    this.auraBack = rect('AuraBack', this.visual).stretch();

    this.front = rect('Front', this.visual).stretch();
    this.base = makeImage('Base', this.front, C(0.08, 0.1, 0.14), SF.roundedRect(18), true);
    this.base.rt.stretch();
    const sheen = makeImage('Sheen', this.base.rt, C(1, 1, 1, 0.05), SF.verticalGradient());
    sheen.rt.stretch(6, 6, 6, 150);

    const artWindow = rect('ArtWindow', this.front).place(v2(0.5, 1), v2(0, -40), CARD.artSize, v2(0.5, 1));
    this.artBg = makeImage('ArtBg', artWindow, C(0.5, 0.5, 0.5), SF.roundedRect(12), true);
    this.artBg.rt.stretch();
    const bgGrad = makeImage('ArtBgGrad', this.artBg.rt, C(0, 0, 0, 0.35), SF.verticalGradient());
    bgGrad.rt.stretch(); bgGrad.rt.setScale(1, -1);
    this.placeholderGlyph = makeText('Glyph', artWindow, '?', 64, C(1, 1, 1, 0.85), 'MiddleCenter', true).shadowed();
    rtOf(this.placeholderGlyph).stretch();
    this.art = makeImage('Art', artWindow, WHITE);
    this.art.rt.stretch();
    this.artTint = makeImage('WeakTint', artWindow, C(0, 0, 0, 0), SF.roundedRect(12), true);
    this.artTint.rt.stretch();
    const artEdge = makeImage('ArtEdge', this.front, C(0, 0, 0, 0.55), SF.roundedOutline(12, 2), true);
    artEdge.rt.place(v2(0.5, 1), v2(0, -40), CARD.artSize, v2(0.5, 1));

    this.border = makeImage('Border', this.front, WHITE, SF.roundedOutline(18, 3), true);
    this.border.rt.stretch();

    this.name = makeText('Name', this.front, '', 19, th.textColor, 'MiddleLeft', true).shadowed(0.8);
    const nrt = rtOf(this.name);
    nrt.anchorMin = v2(0, 1); nrt.anchorMax = v2(1, 1);
    nrt.offsetMin = v2(50, -38); nrt.offsetMax = v2(-10, -6);
    this.name.wrap = false;
    this.name.bestFit = { min: 12, max: 19 };

    this.costRing = makeImage('CostRing', this.front, C(0.02, 0.03, 0.05, 0.9), SF.diamond());
    this.costRing.rt.place(v2(0, 1), v2(24, -22), v2(54, 54));
    this.costGem = makeImage('Cost', this.front, C(0.33, 0.45, 1), SF.diamond());
    this.costGem.rt.place(v2(0, 1), v2(24, -22), v2(46, 46));
    this.cost = makeText('Value', this.costGem.rt, '2', 22, WHITE, 'MiddleCenter', true).shadowed(0.9);
    rtOf(this.cost).stretch();

    this.elementRing = makeImage('ElementRing', this.front, C(0.03, 0.04, 0.07, 1), SF.circle(64));
    this.elementRing.rt.place(v2(0, 1), v2(28, -176), v2(40, 40));
    this.elementBadge = makeImage('Element', this.front, WHITE, SF.circle(64));
    this.elementBadge.rt.place(v2(0, 1), v2(28, -176), v2(34, 34));
    this.elementGlyph = makeText('Glyph', this.elementBadge.rt, '', 16, C(0.04, 0.05, 0.08), 'MiddleCenter', true);
    rtOf(this.elementGlyph).stretch();
    this.elementLabel = makeText('ElementLabel', this.front, '', 15, th.textColor, 'MiddleLeft', true).shadowed(0.9);
    rtOf(this.elementLabel).place(v2(0, 1), v2(50, -176), v2(120, 22), v2(0, 0.5));

    this.trait = makeRich('Trait', this.front, '', 14, th.mutedTextColor, 'MiddleCenter');
    const trt = rtOf(this.trait);
    trt.anchorMin = v2(0, 1); trt.anchorMax = v2(1, 1);
    trt.offsetMin = v2(10, -216); trt.offsetMax = v2(-10, -196);

    const stats = rect('Stats', this.front);
    stats.anchorMin = v2(0, 0); stats.anchorMax = v2(1, 0); stats.pivot = v2(0.5, 0);
    stats.offsetMin = v2(10, 10); stats.offsetMax = v2(-10, 68);
    ['ATK', 'DEF', '필드'].forEach((l, i) => this.makeStat(stats, i, l));

    this.powerChip = makeImage('PowerChip', this.front, th.positiveColor, SF.roundedRect(10), true);
    this.powerChip.rt.place(v2(1, 1), v2(-14, -46), v2(50, 22), v2(1, 1));
    this.powerText = makeText('Text', this.powerChip.rt, '', 15, C(0.05, 0.06, 0.08), 'MiddleCenter', true);
    rtOf(this.powerText).stretch();

    this.testBadge = makeImage('TestBadge', this.front, C(0.94, 0.83, 0.43), SF.roundedRect(8), true);
    this.testBadge.rt.place(v2(1, 0), v2(-12, 74), v2(46, 18), v2(1, 0));
    const tt = makeText('Text', this.testBadge.rt, 'TEST', 12, C(0.1, 0.08, 0.02), 'MiddleCenter', true);
    rtOf(tt).stretch();

    this.dim = makeImage('Dim', this.front, C(0.02, 0.03, 0.05, 0), SF.roundedRect(18), true);
    this.dim.rt.stretch();

    this.auraFront = rect('AuraFront', this.visual).stretch();
    this.aura = new CardAuraView(this.auraBack, this.auraFront);

    this.back = rect('Back', this.visual).stretch();
    const backImg = makeImage('Image', this.back, WHITE, art.cardBack());
    backImg.rt.stretch();
    const backEdge = makeImage('Edge', this.back, C(0, 0, 0, 0.6), SF.roundedOutline(18, 3), true);
    backEdge.rt.stretch();

    this.applyFace();
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  private makeStat(parent: RT, index: number, label: string) {
    const cell = rect(label, parent);
    cell.anchorMin = v2(index / 3, 0); cell.anchorMax = v2((index + 1) / 3, 1);
    cell.offsetMin = v2(2, 0); cell.offsetMax = v2(-2, 0);
    this.statBg[index] = makeImage('Bg', cell, C(1, 1, 1, 0.06), SF.roundedRect(10), true);
    this.statBg[index].rt.stretch();
    const l = makeText('Label', cell, label, 12, C(0.62, 0.67, 0.74), 'MiddleCenter', true);
    rtOf(l).stretch(0, 0, 3, 38);
    const v = makeText('Value', cell, '0', 26, THEME.textColor, 'MiddleCenter', true).shadowed(0.7);
    rtOf(v).stretch(0, 0, 16, 2);
    v.wrap = false;
    this.statValue[index] = v;
  }

  bind(def: CardDef | null, uid: string | null, stats: CombatStats | null) {
    this.def = def;
    this.uid = uid;
    this.cardId = def ? def.id : null;
    if (!def) { this.setFaceDown(true); return; }
    const lib = this.lib;
    const ec = def.isPass ? C(0.55, 0.58, 0.62) : lib.elementColor(def.element);
    this.elementColor = ec;
    this.base.color = lerpColor(C(0.06, 0.075, 0.1), ec, 0.16);
    this.border.color = C(ec.r, ec.g, ec.b, 0.95);
    this.name.text = def.isPass ? '턴 넘김' : def.name;
    this.cost.text = String(def.baseCost);
    this.investGain = 0;
    this.invest.set(0, 1, ec);
    this.costGem.rt.setActive(!def.isPass);
    this.costRing.rt.setActive(!def.isPass);
    const icon = def.isPass ? null : lib.elementIcon(def.element);
    this.elementBadge.rt.setActive(!def.isPass);
    this.elementRing.rt.setActive(!def.isPass);
    this.elementBadge.sprite = icon ?? SF.circle(64);
    this.elementBadge.color = icon ? WHITE : ec;
    this.elementGlyph.text = icon ? '' : lib.elementGlyph(def.element);
    this.elementLabel.text = def.isPass ? '' : lib.elementLabel(def.element);
    this.elementLabel.color = lerpColor(ec, WHITE, 0.35);
    this.artBg.color = lerpColor(C(0.04, 0.05, 0.08), ec, 0.4);
    const cardArt = def.isPass ? null : lib.cardArt(def.id);
    this.art.rt.setActive(!!cardArt);
    if (cardArt) this.art.sprite = croppedArt(scene.textures, def.id, cardArt, lib.artCrop(def.id), CARD.artSize.x, CARD.artSize.y, 12);
    rtOf(this.placeholderGlyph).setActive(!cardArt);
    this.placeholderGlyph.text = def.isPass ? '-' : lib.elementGlyph(def.element);
    this.testBadge.rt.setActive(def.isTest);
    this.setStats(stats);
    this.setFaceDown(false);
  }

  setStats(stats: CombatStats | null) {
    const def = this.def;
    if (!def) return;
    const th = THEME;
    const atk = stats ? stats.atk : def.atk;
    const d = stats ? stats.def : def.def;
    const gain = stats ? stats.gain : def.isPass ? 0 : def.baseFieldGain;
    this.setStat(0, atk, def.atk);
    this.setStat(1, d, def.def);
    this.setStat(2, gain - this.investGain, def.isPass ? 0 : def.baseFieldGain);
    if (this.investGain > 0) {
      this.statValue[2].text = gain + '◆';
      this.statValue[2].color = MANA_COLOR;
      this.statBg[2].color = C(MANA_COLOR.r, MANA_COLOR.g, MANA_COLOR.b, 0.22);
    }
    const traits = def.traits.map(t => t.label);
    const role = roleLabel(def.role);
    if (role) traits.unshift(colorize(role, th.accentColor));
    const pierce = stats ? stats.pierce : def.traits.filter(traitIsAlways).reduce((a, t) => a + t.combatBonus.pierce, 0);
    if (pierce > 0 && !traits.some(t => t.includes('관통'))) traits.push(`관통 ${pierce}`);
    this.trait.text = def.isPass ? 'MP 부족 · 카드 없이 진행' : traits.join(' · ');

    const power = stats ? powerFromStats(stats) : CardPower.neutral;
    const style = def.isPass ? 'None' : this.lib.auraStyle(def.element);
    this.aura.set(style, this.lib.elementColor(def.element), power);
    this.powerChip.rt.setActive(power.tier !== 0);
    if (power.tier !== 0) {
      this.powerChip.color = power.tier > 0 ? th.positiveColor : th.negativeColor;
      this.powerText.text = (power.tier > 0 ? '▲' : '▼') + power.level;
    }
  }

  private setStat(i: number, value: number, baseValue: number) {
    const th = THEME;
    const t = this.statValue[i];
    t.text = value > baseValue ? value + '▲' : value < baseValue ? value + '▼' : String(value);
    t.color = value > baseValue ? th.positiveColor : value < baseValue ? th.negativeColor : th.textColor;
    this.statBg[i].color = value > baseValue ? C(th.positiveColor.r, th.positiveColor.g, th.positiveColor.b, 0.18)
      : value < baseValue ? C(th.negativeColor.r, th.negativeColor.g, th.negativeColor.b, 0.18) : C(1, 1, 1, 0.06);
  }

  setFaceDown(v: boolean) { this.faceDown = v; if (!this.flipping) this.applyFace(); }
  private applyFace() {
    this.front.setActive(!this.faceDown);
    this.auraBack.setActive(!this.faceDown);
    this.investBack.setActive(!this.faceDown);
    this.auraFront.setActive(!this.faceDown);
    this.back.setActive(this.faceDown);
  }

  async flip(co: Co, def: CardDef | null, uid: string | null, stats: CombatStats | null, duration: number) {
    this.flipping = true;
    const half = Math.max(0.02, duration * 0.5);
    for (let t = 0; t < half; t += Time.dt) {
      this.visual.setScale(1 + (0 - 1) * (t / half), 1 + 0.06 * VFX.reveal * (t / half));
      await co.frame();
    }
    this.flipping = false;
    this.bind(def, uid, stats);
    this.aura.setInstant();
    this.flipping = true;
    for (let t = 0; t < half; t += Time.dt) {
      this.visual.setScale(t / half, 1 + 0.06 * VFX.reveal * (1 - t / half));
      await co.frame();
    }
    this.visual.setScale(1, 1);
    this.flipping = false;
  }

  setSelected(s: boolean) {
    this.selected = s;
    this.selectGlow.color = C(1, 0.85, 0.4, s ? 0.65 * VFX.choosing : 0);
    this.updateTargets();
  }
  setCost(cost: number) {
    if (!this.def) return;
    this.cost.text = String(cost);
    this.cost.color = cost < this.def.baseCost ? C(0.6, 1, 0.7) : cost > this.def.baseCost ? C(1, 0.7, 0.65) : WHITE;
  }
  setInvestment(extra: number, maxExtra: number, investGain: number, stats: CombatStats | null, drift = 0) {
    if (!this.def) return;
    this.investGain = extra > 0 ? investGain : 0;
    this.invest.set(extra, maxExtra, this.elementColor, drift);
    this.setStats(stats);
  }
  setFailed(f: boolean) { this.dim.color = C(0.02, 0.03, 0.05, f ? 0.45 : 0); }
  setDimmed(d: boolean) {
    this.dim.color = C(0.02, 0.03, 0.05, d ? 0.5 : 0);
    this.costGem.color = d ? C(0.85, 0.3, 0.3) : C(0.33, 0.45, 1);
  }
  setHoverEnabled(e: boolean) { this.hoverEnabled = e; if (!e) { this.hovered = false; this.updateTargets(); } }
  private updateTargets() {
    const lift = this.hoverEnabled && (this.hovered || this.selected);
    this.hoverTarget = lift ? (this.hovered ? CARD.hoverLift : CARD.selectedLift) : 0;
    this.scaleTarget = lift && this.hovered ? CARD.hoverScale : 1;
  }
  resetVisual() {
    this.hovered = false;
    this.updateTargets();
    this.visual.anchoredPosition = v2(0, 0);
    this.visual.setScale(1, 1);
  }

  private update(dt: number) {
    const k = 1 - Math.exp(-dt * 14);
    const p = this.visual.anchoredPosition;
    this.visual.anchoredPosition = v2(p.x + (0 - p.x) * k, p.y + (this.hoverTarget - p.y) * k);
    if (!this.flipping) {
      let s = this.visual.localScale.x + (this.scaleTarget - this.visual.localScale.x) * k;
      if (this.press < 1) {
        this.press = Math.min(1, this.press + dt / 0.16);
        s *= 1 - 0.07 * Math.sin(this.press * Math.PI);
      }
      this.visual.setScale(s, s);
    }
    const tint = this.aura.artTint;
    const tc = this.aura.artTintColor;
    this.artTint.color = C(tc.r, tc.g, tc.b, tint);
    const vs = this.aura.visualStrength;
    const tier = this.aura.power.tier;
    const b = tier < 0 ? lerpColor(this.elementColor, C(0.42, 0.42, 0.45), 0.8 * vs) : tier > 0 ? lerpColor(this.elementColor, WHITE, 0.3 * vs) : this.elementColor;
    this.border.color = C(b.r, b.g, b.b, 0.95);
  }

  // ---------------------------------------------------------------- input (click, hover, drag)
  private wireInput(hit: Img) {
    let downAt: V2 | null = null;
    hit.on('pointerover', () => { if (this.dragState?.dragging) return; this.hovered = true; this.updateTargets(); for (const f of this.onHoverEnter) f(this); });
    hit.on('pointerout', () => { this.hovered = false; this.updateTargets(); for (const f of this.onHoverExit) f(this); });
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => { if (this.rt.raycastBlocked) return; downAt = { x: p.x, y: p.y }; activeDrag = { card: this, start: downAt }; });
    hit.on('pointerup', () => {
      if (downAt && !justDragged() && !(this.dragState && this.dragState.dragging) && this.interactable && !this.rt.raycastBlocked) {
        this.press = 0;
        for (const f of this.onClicked) f(this);
      }
      downAt = null;
    });
  }

  /** called by the global pointer tracker */
  beginDrag(world: V2): boolean {
    const d = this.drag;
    if (!d || !d.canDrag(this)) return false;
    this.dragState = { dragging: true, parent: this.rt.parent!, index: this.rt.siblingIndex(), pos: { ...this.rt.anchoredPosition } };
    this.rt.setParent(d.dragLayer, true);
    this.rt.blocksRaycasts = false;
    this.resetVisual();
    this.setHoverEnabled(false);
    this.rt.setScale(1.06, 1.06);
    this.rt.rotation = 0;
    d.dragStarted?.(this);
    this.moveTo(world);
    return true;
  }
  moveTo(world: V2) {
    const d = this.drag!;
    const local = d.dragLayer.worldToLocal(world);
    this.rt.anchorMin = v2(0.5, 0.5); this.rt.anchorMax = v2(0.5, 0.5);
    this.rt.anchoredPosition = local;
    d.dragMove?.(this, world);
  }
  endDrag(world: V2) {
    if (!this.dragState) return;
    this.dragState.dragging = false;
    this.rt.blocksRaycasts = true;
    this.rt.setScale(1, 1);
    this.setHoverEnabled(true);
    const handled = this.drag!.dropped(this, world);
    if (!handled) this.returnHome();
    this.dragState = null;
  }
  returnHome() {
    const s = this.dragState;
    if (!s) return;
    this.rt.setParent(s.parent, false);
    this.rt.setSiblingIndex(Math.min(s.index, s.parent.children.length - 1));
    this.rt.anchoredPosition = s.pos;
  }
  get isDragging() { return !!this.dragState?.dragging; }
}

// global drag tracking (Unity EventSystem drag threshold ≈ 10px)
let activeDrag: { card: CardView; start: V2; started?: boolean } | null = null;
/**
 * Drag tracking on the window (DOM pointer events), not on Phaser's scene input:
 * keeps following the pointer even outside the canvas and does not depend on Phaser's pointer state.
 * `toGame` converts client coordinates to the 1920×1080 game space.
 */
let toGameFn: ((clientX: number, clientY: number) => V2) | null = null;
/** time of the last finished drag: the pointerup that ends a drag must not also count as a click */
let lastDragEnd = -1;
export const justDragged = () => performance.now() - lastDragEnd < 120;
let domInstalled = false;
export function installDragTracking(toGame: (clientX: number, clientY: number) => V2) {
  toGameFn = toGame;
  if (domInstalled) return;
  domInstalled = true;
  const move = (e: PointerEvent) => {
    if (!activeDrag || !toGameFn) return;
    if ((e.buttons & 1) === 0 && e.pointerType === 'mouse') { cancel(e); return; }
    const w = toGameFn(e.clientX, e.clientY);
    if (!activeDrag.started) {
      if (Math.hypot(w.x - activeDrag.start.x, w.y - activeDrag.start.y) < 10) return;
      activeDrag.started = activeDrag.card.beginDrag(w);
      if (!activeDrag.started) { activeDrag = null; return; }
    }
    activeDrag.card.moveTo(w);
  };
  const cancel = (e: PointerEvent) => {
    const d = activeDrag;
    activeDrag = null;
    if (d && d.started && toGameFn) { lastDragEnd = performance.now(); d.card.endDrag(toGameFn(e.clientX, e.clientY)); }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', cancel);
  window.addEventListener('pointercancel', cancel);
}
/** drop any half-started drag (scene restart) */
export function resetDragTracking() { activeDrag = null; }

void clamp01;
