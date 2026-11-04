// Port of UI/HandView.cs — fanned hand at the bottom centre.
import { CARD, HAND } from '../config/layout';
import { VisualLibrary } from '../game/visuals';
import { CardView } from './cardView';
import { addUpdate, RT, V2, v2 } from './engine';
import { rect } from './factory';

export class HandView {
  readonly rt: RT;
  maxWidth = 1160;
  cards: CardView[] = [];
  private targets = new Map<CardView, V2>();
  private tilts = new Map<CardView, number>();
  private insertPreview = -1;
  private lastHover = -1;
  private lowerTarget = 0;
  private lower = 0;
  dragSetup: ((c: CardView) => void) | null = null;

  constructor(parent: RT, private lib: VisualLibrary, private dragLayer: RT) {
    this.rt = rect('Hand', parent);
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  acquire(index: number): CardView {
    while (this.cards.length <= index) {
      const cv = new CardView(this.rt, this.lib, 'HandCard');
      this.dragSetup?.(cv);
      this.cards.push(cv);
    }
    const c = this.cards[index];
    if (c.rt.parent !== this.rt) c.rt.setParent(this.rt);
    c.rt.setActive(true);
    return c;
  }
  trim(count: number) { for (let i = count; i < this.cards.length; i++) this.cards[i].rt.setActive(false); }
  setInsertPreview(i: number) { this.insertPreview = i; }
  setLowered(l: boolean) { this.lowerTarget = l ? 1 : 0; }

  showBacks(count: number) {
    this.setLowered(true);
    for (let i = 0; i < count; i++) {
      const c = this.acquire(i);
      c.bind(null, null, null);
      c.setFaceDown(true);
      c.interactable = false;
      c.setHoverEnabled(false);
      c.setSelected(false);
    }
    this.trim(count);
    this.setInsertPreview(-1);
    this.layout(count, false);
  }

  layout(count: number, instant: boolean) {
    if (count <= 0) return;
    const spacing = count > 1 ? Math.max(HAND.minVisibleWidth, Math.min(HAND.preferredSpacing, (this.maxWidth - CARD.size.x) / (count - 1))) : 0;
    const start = (-spacing * (count - 1)) / 2;
    for (let i = 0; i < count; i++) {
      const c = this.cards[i];
      if (c.rt.parent !== this.rt) continue;
      const t = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
      let x = start + spacing * i;
      if (this.insertPreview >= 0) x += i >= this.insertPreview ? spacing * 0.35 : -spacing * 0.35;
      const target = v2(x, -t * t * HAND.arcHeight);
      this.targets.set(c, target);
      this.tilts.set(c, -t * HAND.maxTilt);
      c.rt.anchorMin = v2(0.5, 0.5); c.rt.anchorMax = v2(0.5, 0.5);
      c.rt.sizeDelta = CARD.size;
      if (instant) { c.rt.anchoredPosition = target; c.rt.rotation = this.tilts.get(c)!; }
      c.rt.setSiblingIndex(i);
    }
  }

  private update(dt: number) {
    const k = 1 - Math.exp(-dt * 12);
    this.lower += (this.lowerTarget - this.lower) * k;
    this.rt.anchoredPosition = v2(0, -150 * this.lower);
    const hs = 1 - 0.22 * this.lower;
    this.rt.setScale(hs, hs);
    let hovered = -1;
    for (let i = 0; i < this.cards.length; i++) if (this.cards[i].rt.active && this.cards[i].isHovered) { hovered = i; break; }
    if (hovered !== this.lastHover) {
      for (let i = 0; i < this.cards.length; i++) if (this.cards[i].rt.parent === this.rt) this.cards[i].rt.setSiblingIndex(i);
      if (hovered >= 0) this.cards[hovered].rt.setAsLastSibling();
      this.lastHover = hovered;
    }
    for (const [c, tgt] of this.targets) {
      if (!c.rt.active || c.rt.parent !== this.rt) continue;
      const target = { ...tgt };
      if (hovered >= 0) {
        const d = this.cards.indexOf(c) - hovered;
        if (d !== 0) target.x += (Math.sign(d) * HAND.neighborPush) / Math.abs(d);
      }
      const p = c.rt.anchoredPosition;
      c.rt.anchoredPosition = v2(p.x + (target.x - p.x) * k, p.y + (target.y - p.y) * k);
      let tilt = this.tilts.get(c) ?? 0;
      if (hovered >= 0 && this.cards[hovered] === c) tilt = 0;
      c.rt.rotation = c.rt.rotation + (tilt - c.rt.rotation) * k;
    }
  }

  insertIndexAt(world: V2, count: number, exclude: CardView): number {
    const local = this.rt.worldToLocal(world);
    let index = 0;
    for (let i = 0; i < count; i++) {
      const c = this.cards[i];
      const pos = this.targets.get(c);
      if (c === exclude || !pos) continue;
      if (local.x > pos.x) index++;
    }
    return index;
  }
  contains(world: V2, padding = 80) { return this.rt.containsWorld(world, padding); }
}
