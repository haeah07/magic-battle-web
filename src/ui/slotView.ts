// Port of UI/SlotView.cs — summoning point on the floor + the card shown in the slot.
import { CARD } from '../config/layout';
import { VFX } from '../config/vfx';
import { CombatStats, CardDef, PlayerSlot, slotLabel } from '../core/types';
import { VisualLibrary } from '../game/visuals';
import { CardView } from './cardView';
import { C, Color, WHITE } from './color';
import { addUpdate, Img, RT, Txt, V2, v2 } from './engine';
import { makeImage, makeText, rect, rtOf } from './factory';
import { lerp } from './mathf';
import { art, SF } from './sprites';

export const FLOOR_TILT = 0.42;
export enum SlotState { Empty, Hidden, Selected, Locked, Revealed }

export class SlotView {
  static readonly SlotSize = v2(CARD.size.x + 24, CARD.size.y + 24);
  readonly rt: RT;
  readonly card: CardView;
  state = SlotState.Empty;
  onClicked: ((s: SlotView) => void)[] = [];

  private floorGlow: Img; private circle: Img; private circleInner: Img; private beam: Img; private cardShadow: Img;
  private glow: Img; private plate: Img; private outline: Img; private caption: Txt; private hint: Txt; private lockRing: Img;
  private statusBg: Img; private status: Txt;
  private flyOffset = v2(0, 0); private flyT = 1; private lockT = 1; private pulse = 0;
  private active = false; private dropHighlight = false;

  constructor(parent: RT, private lib: VisualLibrary, readonly slot: PlayerSlot) {
    this.rt = rect(slotLabel(slot) + 'Slot', parent);
    this.rt.sizeDelta = SlotSize();
    const pc = lib.playerColor(slot);
    const floor = rect('SummonPlane', this.rt).place(v2(0.5, 0.5), v2(0, -SlotSize().y / 2 + 18), v2(10, 10));
    floor.setScale(1, FLOOR_TILT);
    this.floorGlow = makeImage('FloorGlow', floor, C(pc.r, pc.g, pc.b, 0.25), SF.softBlob());
    this.floorGlow.rt.place(v2(0.5, 0.5), v2(0, 0), v2(520, 520));
    this.circle = makeImage('MagicCircle', floor, C(pc.r, pc.g, pc.b, 0.3), art.arena('summon_circle'));
    this.circle.rt.place(v2(0.5, 0.5), v2(0, 0), v2(400, 400));
    this.circleInner = makeImage('MagicCircleInner', floor, C(pc.r, pc.g, pc.b, 0.18), SF.dashedRing(16));
    this.circleInner.rt.place(v2(0.5, 0.5), v2(0, 0), v2(300, 300));
    this.beam = makeImage('SummonBeam', this.rt, C(pc.r, pc.g, pc.b, 0), SF.lightShaft());
    this.beam.rt.place(v2(0.5, 0), v2(0, 0), v2(SlotSize().x * 1.4, SlotSize().y * 1.5), v2(0.5, 0));
    this.cardShadow = makeImage('CardShadow', this.rt, C(0, 0, 0, 0), SF.softBlob());
    this.cardShadow.rt.place(v2(0.5, 0), v2(0, 4), v2(CARD.size.x * 1.25, 70));
    this.glow = makeImage('Glow', this.rt, C(pc.r, pc.g, pc.b, 0), SF.softFrame(22, 40), true);
    this.glow.rt.stretch(-28, -28, -28, -28);
    this.plate = makeImage('Plate', this.rt, C(0, 0, 0, 0), SF.roundedRect(22), true, true);
    this.plate.rt.stretch();
    this.plate.on('pointerup', () => { if (!this.rt.raycastBlocked) for (const f of this.onClicked) f(this); });
    this.outline = makeImage('Outline', this.rt, C(pc.r, pc.g, pc.b, 0), SF.roundedOutline(22, 2), true);
    this.outline.rt.stretch();
    this.caption = makeText('Caption', this.rt, slotLabel(slot), 22, pc, 'MiddleCenter', true).shadowed();
    this.hint = makeText('Hint', this.rt, '', 24, C(0.78, 0.84, 0.9, 0.7), 'MiddleCenter', true).shadowed(0.8);
    rtOf(this.hint).stretch(18, 18, 18, 18);
    this.card = new CardView(this.rt, lib, 'SlotCard');
    this.card.rt.anchorMin = v2(0.5, 0.5); this.card.rt.anchorMax = v2(0.5, 0.5);
    this.card.rt.anchoredPosition = v2(0, 0);
    this.card.setHoverEnabled(false);
    this.card.rt.setActive(false);
    this.lockRing = makeImage('LockRing', this.rt, C(0, 0, 0, 0), SF.softFrame(22, 26), true);
    this.lockRing.rt.stretch(-26, -26, -26, -26);
    this.statusBg = makeImage('Status', this.rt, C(0, 0, 0, 0), SF.roundedRect(14), true);
    this.status = makeText('Text', this.statusBg.rt, '', 26, WHITE, 'MiddleCenter', true).shadowed(0.95);
    this.setFacing(slot === PlayerSlot.P1);
    rtOf(this.status).stretch(8, 8, 0, 0);
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  /** put the slot card back after it was dragged out (keeps it under the lock ring / status) */
  reattachCard() {
    this.card.rt.setParent(this.rt, false);
    this.card.rt.setSiblingIndex(this.lockRing.rt.siblingIndex());
    this.card.rt.anchorMin = v2(0.5, 0.5); this.card.rt.anchorMax = v2(0.5, 0.5);
    this.card.rt.anchoredPosition = v2(0, 0);
  }

  /** Home slot (bottom) shows its status toward the centre (above); away slot (top) below. */
  setFacing(home: boolean) {
    this.statusBg.rt.place(v2(0.5, home ? 1 : 0), v2(0, home ? 14 : -14), v2(220, 40), v2(0.5, home ? 0 : 1));
    rtOf(this.caption).place(v2(1, 0.5), v2(18, 0), v2(120, 30), v2(0, 0.5));
    this.caption.alignment = 'MiddleLeft';
    rtOf(this.caption).setActive(false); // names live in the corner HUDs
  }
  setCaption(text: string, color: Color) { this.caption.text = text; this.caption.color = color; }

  showEmpty(hint: string, active: boolean) {
    this.state = SlotState.Empty;
    this.card.rt.setActive(false);
    this.hint.text = hint;
    rtOf(this.hint).setActive(!!hint);
    this.active = active;
  }
  showHidden(active = false) {
    this.state = SlotState.Hidden;
    this.prepareCard();
    this.card.bind(null, null, null);
    this.card.setFaceDown(true);
    this.active = active;
  }
  showCard(def: CardDef | null | undefined, uid: string | null, stats: CombatStats | null, faceDown: boolean, active: boolean) {
    if (!def || faceDown) { this.showHidden(active); return; }
    this.state = active ? SlotState.Selected : SlotState.Locked;
    this.prepareCard();
    this.card.bind(def, uid, stats);
    this.active = active;
  }
  markRevealed() { this.state = SlotState.Revealed; }

  private prepareCard() {
    this.card.rt.setActive(true);
    if (this.card.rt.parent !== this.rt) this.card.rt.setParent(this.rt);
    this.card.rt.anchorMin = v2(0.5, 0.5); this.card.rt.anchorMax = v2(0.5, 0.5);
    this.card.rt.anchoredPosition = v2(0, 0);
    this.card.resetVisual();
    this.card.setFailed(false);
    this.card.rt.rotation = 0;
    this.card.rt.setScale(1, 1);
    rtOf(this.hint).setActive(false);
  }

  setStatus(text: string, color: Color) {
    this.statusBg.rt.setActive(!!text);
    this.status.text = text;
    this.status.color = color;
    this.statusBg.rt.sizeDelta = v2(Math.max(140, Math.min(340, 50 + (text ?? '').length * 26)), 40);
  }

  flyInFrom(world: V2) {
    const local = this.rt.worldToLocal(world);
    this.flyOffset = local;
    if (local.x * local.x + local.y * local.y < 1) return;
    this.flyT = 0;
    this.card.rt.anchoredPosition = this.flyOffset;
  }
  playLock() { this.lockT = 0; }
  setDropHighlight(on: boolean) { this.dropHighlight = on; }
  contains(world: V2, padding = 40) { return this.rt.containsWorld(world, padding); }

  private update(dt: number) {
    const pc = this.lib.playerColor(this.slot);
    const K = VFX.choosing;
    this.pulse += dt;
    const a = this.dropHighlight ? 0.6 : this.active && this.card.rt.active ? 0.14 + 0.08 * Math.sin(this.pulse * 3) : 0;
    this.glow.color = C(pc.r, pc.g, pc.b, lerp(this.glow.color.a, a * K, 0.15));
    this.outline.color = C(pc.r, pc.g, pc.b, this.dropHighlight ? 0.9 : 0);
    const hasCard = this.card.rt.active;
    const ca = hasCard ? 0.55 : this.active ? 0.6 + 0.2 * Math.sin(this.pulse * 3) : 0.3;
    this.circle.color = C(pc.r, pc.g, pc.b, lerp(this.circle.color.a, ca, 0.12));
    this.circle.rt.rotation = this.pulse * (this.active ? 14 : 5);
    const lockK = VFX.submit;
    this.floorGlow.color = C(pc.r, pc.g, pc.b, (hasCard ? 0.32 : this.active ? 0.28 : 0.14) + (this.lockT < 1 ? 0.4 * (1 - this.lockT) * lockK : 0));
    this.cardShadow.color = C(0, 0, 0, lerp(this.cardShadow.color.a, hasCard ? 0.5 : 0, 0.2));
    this.beam.color = C(pc.r, pc.g, pc.b, this.lockT < 1 ? 0.55 * Math.sin(this.lockT * Math.PI) * lockK : this.active && !hasCard ? (0.06 + 0.04 * Math.sin(this.pulse * 3)) * K : 0);
    this.circleInner.color = C(pc.r, pc.g, pc.b, lerp(this.circleInner.color.a, ca * 0.6, 0.12));
    this.circleInner.rt.rotation = -this.pulse * 9;
    if (this.flyT < 1) {
      this.flyT = Math.min(1, this.flyT + dt / 0.22);
      const e = 1 - (1 - this.flyT) ** 3;
      this.card.rt.anchoredPosition = v2(this.flyOffset.x * (1 - e), this.flyOffset.y * (1 - e));
      const sc = 1 + 0.08 * Math.sin(this.flyT * Math.PI);
      this.card.rt.setScale(sc, sc);
      if (this.flyT >= 1) { this.card.rt.anchoredPosition = v2(0, 0); this.card.rt.setScale(1, 1); }
    }
    if (this.lockT < 1) {
      this.lockT = Math.min(1, this.lockT + dt / 0.45);
      const k = this.lockT;
      const sc = k < 0.3 ? lerp(1, 1.1, k / 0.3) : lerp(1.1, 1, (k - 0.3) / 0.7);
      this.card.rt.setScale(sc, sc);
      this.lockRing.color = C(lerp(1, pc.r, k), lerp(1, pc.g, k), lerp(1, pc.b, k), (1 - k) * 0.95 * lockK);
      this.lockRing.rt.setScale(1 + 0.25 * k, 1 + 0.25 * k);
      if (this.lockT >= 1) this.card.rt.setScale(1, 1);
    }
  }
}
function SlotSize() { return SlotView.SlotSize; }
