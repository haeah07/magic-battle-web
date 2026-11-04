// Port of VFX/InvestAuraView.cs — mana rune ring + pillar + motes behind a card that has MP invested.
import { C, Color, lerpColor } from '../ui/color';
import { addUpdate, Img, RT, v2 } from '../ui/engine';
import { makeImage, rect } from '../ui/factory';
import { clamp01, moveTowards } from '../ui/mathf';
import { SF } from '../ui/sprites';
import { VFX } from '../config/vfx';

interface Mote { image: Img; phase: number; lane: number; speed: number }

export class InvestAuraView {
  readonly rt: RT;
  private pool: Img; private ring: Img; private ringInner: Img; private pillar: Img;
  private motes: Mote[] = [];
  private color: Color = C(1, 1, 1);
  extra = 0;
  private max = 2;
  private level = 0;
  private target = 0;
  private drift = 0;
  private t = 0;

  constructor(parent: RT) {
    this.rt = rect('InvestAura', parent).stretch();
    this.pool = makeImage('ManaPool', this.rt, C(0, 0, 0, 0), SF.glow(256));
    this.pool.rt.place(v2(0.5, 0.5), v2(0, 10), v2(380, 420));
    this.pillar = makeImage('Pillar', this.rt, C(0, 0, 0, 0), SF.beam());
    this.pillar.rt.place(v2(0.5, 1), v2(0, -40), v2(120, 300), v2(0.5, 0));
    this.ring = makeImage('RuneRing', this.rt, C(0, 0, 0, 0), SF.dashedRing(18));
    this.ring.rt.place(v2(0.5, 0.5), v2(0, 0), v2(360, 360));
    this.ringInner = makeImage('RuneRingInner', this.rt, C(0, 0, 0, 0), SF.dashedRing(10));
    this.ringInner.rt.place(v2(0.5, 0.5), v2(0, 0), v2(300, 300));
    for (let i = 0; i < 18; i++) {
      const img = makeImage('Mana' + i, this.rt, C(0, 0, 0, 0), SF.diamond());
      img.rt.place(v2(0.5, 0.5), v2(0, 0), v2(10, 10));
      let h = Math.sin(i * 12.9898) * 43758.5453; h -= Math.floor(h);
      let h2 = Math.sin(i * 78.233) * 12345.678; h2 -= Math.floor(h2);
      this.motes.push({ image: img, phase: h, lane: h2 * 2 - 1, speed: 0.45 + h * 0.4 });
    }
    this.apply();
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  set(extra: number, maxExtra: number, elementColor: Color, driftTowardCenter = 0) {
    this.extra = Math.max(0, extra);
    this.max = Math.max(1, maxExtra);
    this.color = lerpColor(elementColor, C(0.75, 0.95, 1), 0.35);
    this.drift = driftTowardCenter;
    this.target = this.extra <= 0 ? 0 : clamp01(0.4 + (0.6 * (this.extra - 1)) / Math.max(1, this.max - 1));
    this.apply();
  }

  private apply() {
    const on = this.target > 0 || this.level > 0.01;
    for (const g of [this.pool, this.ring, this.ringInner, this.pillar]) g.rt.setActive(on);
    const count = Math.round(this.motes.length * this.target);
    this.motes.forEach((m, i) => m.image.rt.setActive(on && i < Math.max(count, 0)));
  }

  private update(dt: number) {
    this.t += dt;
    const prev = this.level;
    this.level = moveTowards(this.level, this.target, dt * 3);
    if (prev > 0.01 !== this.level > 0.01) this.apply();
    if (this.level <= 0.001 && this.target <= 0) return;
    const c = this.color, L = this.level, k = VFX.choosing;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 3.2);
    this.pool.color = C(c.r, c.g, c.b, 0.32 * L * pulse * k);
    this.ring.color = C(c.r, c.g, c.b, (0.35 + 0.45 * L) * pulse * k);
    this.ring.rt.rotation = this.t * 22;
    const rs = 0.92 + 0.12 * L;
    this.ring.rt.setScale(rs, rs);
    this.ringInner.color = C(1, 1, 1, 0.25 * L * pulse * k);
    this.ringInner.rt.rotation = -this.t * 35;
    this.pillar.color = C(c.r, c.g, c.b, 0.55 * L * pulse * k);
    this.pillar.rt.sizeDelta = v2(70 + 70 * L, 180 + 160 * L);
    for (const m of this.motes) {
      if (!m.image.rt.active) continue;
      const p = (this.t * m.speed * (0.8 + L) + m.phase) % 1;
      const x = m.lane * 90 + this.drift * p * 90 + Math.sin(this.t * 2.4 + m.phase * 9) * 8;
      const y = 60 + p * 260;
      m.image.rt.anchoredPosition = v2(x, y);
      const sz = (7 + 7 * L) * (1 - p * 0.5);
      m.image.rt.sizeDelta = v2(sz, sz);
      m.image.rt.rotation = 45;
      m.image.color = C(c.r + (1 - c.r) * 0.5, c.g + (1 - c.g) * 0.5, c.b + (1 - c.b) * 0.5, Math.sin(p * Math.PI) * (0.5 + 0.5 * L) * k);
    }
  }
}
