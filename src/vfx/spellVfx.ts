// Port of VFX/SpellVfx.cs — magic orbs, trails, bursts, sparks, fizzle, shield, chips, screen flash, shatter, field wave.
// World positions are Phaser pixels (y down); Unity's `Vector3.up * x` becomes `y - x`.
import { C, CLEAR, Color, lerpColor, WHITE } from '../ui/color';
import { Co, CoOwner, Img, RT, Time, V2, v2 } from '../ui/engine';
import { makeImage, makeOutline, makeText, rect, rtOf } from '../ui/factory';
import { clamp01, lerp, rand, smoothStep } from '../ui/mathf';
import { SF } from '../ui/sprites';
import { VisualLibrary } from '../game/visuals';

const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);
const lerpV = (a: V2, b: V2, k: number) => v2(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);

export class SpellVfx {
  readonly rt: RT;
  private flash: Img;
  private flashColor: Color = CLEAR;
  private flashCo = new CoOwner();
  readonly co = new CoOwner();
  speed = 1;
  /** multiplier from config/vfx (clash/towerHit/fieldChange) applied per call */
  constructor(parent: RT, private lib: VisualLibrary) {
    this.rt = rect('Vfx', parent).stretch();
    this.flash = makeImage('ScreenFlash', this.rt, C(1, 1, 1, 0));
    this.flash.rt.stretch(-50, -50, -50, -50);
  }

  private makeOrb(color: Color, size: number): Img {
    const glow = makeImage('Orb', this.rt, color, SF.glow(128));
    glow.rt.sizeDelta = v2(size * 2.4, size * 2.4);
    const core = makeImage('Core', glow.rt, lerpColor(color, WHITE, 0.65), SF.circle(64));
    core.rt.place(v2(0.5, 0.5), v2(0, 0), v2(size * 0.75, size * 0.75));
    return glow;
  }

  private get scaleX() { return this.rt.lossyScale(); }

  async fly(co: Co, color: Color, from: V2, to: V2, duration: number, size = 34, arc = true) {
    const orb = this.makeOrb(color, size);
    const trail: Img[] = [];
    for (let i = 0; i < 7; i++) {
      const t = makeImage('Trail', this.rt, C(color.r, color.g, color.b, 0.42 - i * 0.055), SF.glow(64));
      t.rt.sizeDelta = v2(size * (1.7 - i * 0.18), size * (1.7 - i * 0.18));
      t.rt.setSiblingIndex(orb.rt.siblingIndex());
      trail.push(t);
    }
    const history: V2[] = Array.from({ length: trail.length * 2 + 1 }, () => ({ ...from }));
    const d = Math.max(0.05, duration / this.speed);
    const lift = arc ? dist(from, to) * 0.18 : 0;
    try {
      for (let t = 0; t < d; t += Time.dt) {
        const k = smoothStep(0, 1, t / d);
        const p = lerpV(from, to, k);
        p.y -= Math.sin(k * Math.PI) * lift;
        for (let i = history.length - 1; i > 0; i--) history[i] = history[i - 1];
        history[0] = p;
        orb.rt.setWorldPosition(p);
        for (let i = 0; i < trail.length; i++) trail[i].rt.setWorldPosition(history[(i + 1) * 2]);
        await co.frame();
      }
    } finally {
      orb.rt.destroy();
      for (const t of trail) t.rt.destroy();
    }
  }

  /** strength: config/vfx multiplier (alpha), 0 = off */
  burst(at: V2, color: Color, size = 240, strength = 1) {
    if (strength <= 0) return;
    this.co.start(co => this.burstRoutine(co, at, color, size, strength));
    const n = Math.round(14 * Math.min(1, strength));
    for (let i = 0; i < n; i++) this.co.start(co => this.spark(co, at, color));
  }

  private async burstRoutine(co: Co, at: V2, color: Color, size: number, strength: number) {
    const img = makeImage('Burst', this.rt, color, SF.glow(256));
    img.rt.setWorldPosition(at);
    const ring = makeImage('BurstRing', this.rt, WHITE, SF.ring(256, 0.03));
    ring.rt.setWorldPosition(at);
    const d = 0.55 / this.speed;
    try {
      for (let t = 0; t < d; t += Time.dt) {
        const k = t / d;
        const s = lerp(size * 0.2, size, k);
        img.rt.sizeDelta = v2(s, s);
        img.color = C(color.r, color.g, color.b, Math.min(1, (1 - k) * 0.95 * strength));
        const rs = lerp(size * 0.3, size * 1.4, k);
        ring.rt.sizeDelta = v2(rs, rs);
        ring.color = C(1, 1, 1, Math.min(1, (1 - k) * 0.7 * strength));
        await co.frame();
      }
    } finally { img.rt.destroy(); ring.rt.destroy(); }
  }

  private async spark(co: Co, at: V2, color: Color) {
    const img = makeImage('Spark', this.rt, color, SF.glow(64));
    const s = rand(10, 18);
    img.rt.sizeDelta = v2(s, s);
    const ang = rand(0, Math.PI * 2);
    const dd = rand(60, 170) * this.scaleX;
    const dir = v2(Math.cos(ang) * dd, -Math.sin(ang) * dd);
    const d = rand(0.4, 0.75) / this.speed;
    try {
      for (let t = 0; t < d; t += Time.dt) {
        const k = t / d;
        const e = 1 - (1 - k) * (1 - k);
        img.rt.setWorldPosition(v2(at.x + dir.x * e, at.y + dir.y * e));
        img.color = C(color.r, color.g, color.b, 1 - k);
        await co.frame();
      }
    } finally { img.rt.destroy(); }
  }

  async fizzle(co: Co, color: Color, at: V2) {
    const orb = this.makeOrb(color, 34);
    orb.rt.setWorldPosition(at);
    const d = 0.55 / this.speed;
    try {
      for (let t = 0; t < d; t += Time.dt) {
        const k = t / d;
        orb.rt.setScale(lerp(1, 0.1, k));
        orb.rt.rotation = k * 300;
        const gray = lerpColor(color, C(0.5, 0.5, 0.55), k);
        orb.color = C(gray.r, gray.g, gray.b, 1 - k);
        await co.frame();
      }
    } finally { orb.rt.destroy(); }
  }

  async shield(co: Co, color: Color, at: V2, duration: number) {
    const img = makeImage('Shield', this.rt, color, SF.ring(256, 0.08));
    img.rt.setWorldPosition(at);
    const fill = makeImage('ShieldFill', img.rt, C(color.r, color.g, color.b, 0.18), SF.circle(128));
    fill.rt.stretch(12, 12, 12, 12);
    const d = duration / this.speed;
    try {
      for (let t = 0; t < d; t += Time.dt) {
        const k = t / d;
        const s = k < 0.2 ? lerp(80, 260, k / 0.2) : 260;
        img.rt.sizeDelta = v2(s, s);
        img.color = C(color.r, color.g, color.b, k > 0.75 ? (1 - k) * 4 * 0.9 : 0.9);
        await co.frame();
      }
    } finally { img.rt.destroy(); }
  }

  async chip(co: Co, text: string, color: Color, from: V2, to: V2, duration: number) {
    const bg = makeImage('Chip', this.rt, C(color.r * 0.35, color.g * 0.35, color.b * 0.35, 0.92), SF.roundedRect(16), true);
    bg.rt.sizeDelta = v2(120, 44);
    makeOutline(bg.rt, color, 16, 3);
    const t = makeText('Text', bg.rt, text, 24, WHITE, 'MiddleCenter', true);
    rtOf(t).stretch();
    const d = duration / this.speed;
    try {
      for (let time = 0; time < d; time += Time.dt) {
        const k = time / d;
        const e = k * k;
        const p = lerpV(from, to, e);
        p.y -= Math.sin(k * Math.PI) * 60 * this.scaleX;
        bg.rt.setWorldPosition(p);
        bg.rt.setScale(k < 0.2 ? lerp(0.6, 1.1, k / 0.2) : lerp(1.1, 0.6, (k - 0.2) / 0.8));
        const c = bg.color;
        bg.color = C(c.r, c.g, c.b, k > 0.85 ? (1 - k) / 0.15 * 0.92 : 0.92);
        await co.frame();
      }
    } finally { bg.rt.destroy(); }
  }

  flashScreen(color: Color, strength = 0.5) {
    if (strength <= 0) return;
    this.flashCo.stopAll();
    this.flashColor = C(color.r, color.g, color.b, strength);
    this.flashCo.start(async co => {
      this.flash.rt.setAsLastSibling();
      const d = 0.6 / this.speed;
      for (let t = 0; t < d; t += Time.dt) {
        this.flash.color = C(this.flashColor.r, this.flashColor.g, this.flashColor.b, this.flashColor.a * (1 - t / d));
        await co.frame();
      }
      this.flash.color = C(1, 1, 1, 0);
    });
  }

  async shatter(co: Co, color: Color, at: V2) {
    const orb = this.makeOrb(color, 34);
    orb.rt.setWorldPosition(at);
    const squash = 0.12 / this.speed;
    try {
      for (let t = 0; t < squash; t += Time.dt) {
        const k = t / squash;
        orb.rt.setScale(1 + 0.5 * k, 1 - 0.4 * k);
        await co.frame();
      }
    } finally { orb.rt.destroy(); }
    const ring = makeImage('ShatterRing', this.rt, WHITE, SF.ring(256, 0.04));
    ring.rt.setWorldPosition(at);
    const smoke = makeImage('ShatterSmoke', this.rt, C(0.5, 0.52, 0.56, 0.6), SF.softBlob());
    smoke.rt.setWorldPosition(at);
    const n = 10;
    const shards: Img[] = [], dirs: V2[] = [];
    const sc = this.scaleX;
    for (let i = 0; i < n; i++) {
      const s = makeImage('Shard', this.rt, color, SF.shard());
      s.rt.sizeDelta = v2(8, 22);
      s.rt.setWorldPosition(at);
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const r = rand(70, 140) * sc;
      dirs.push(v2(Math.cos(a) * r, -Math.sin(a) * r));
      s.rt.rotation = a * 180 / Math.PI - 90;
      shards.push(s);
    }
    const d = 0.6 / this.speed;
    try {
      for (let t = 0; t < d; t += Time.dt) {
        const k = t / d;
        const e = 1 - (1 - k) * (1 - k);
        for (let i = 0; i < n; i++) {
          shards[i].rt.setWorldPosition(v2(at.x + dirs[i].x * e, at.y + dirs[i].y * e + 60 * k * k * sc));
          const g = lerpColor(color, C(0.55, 0.56, 0.6), k);
          shards[i].color = C(g.r, g.g, g.b, 1 - k);
        }
        const rs = lerp(40, 170, e); ring.rt.sizeDelta = v2(rs, rs);
        ring.color = C(1, 1, 1, (1 - k) * 0.6);
        const ss = lerp(60, 200, e); smoke.rt.sizeDelta = v2(ss, ss);
        smoke.color = C(0.5, 0.52, 0.56, 0.5 * (1 - k));
        await co.frame();
      }
    } finally {
      for (const s of shards) s.rt.destroy();
      ring.rt.destroy(); smoke.rt.destroy();
    }
  }

  fieldWave(at: V2, color: Color, strength = 1) {
    if (strength <= 0) return;
    this.co.start(async co => {
      const wash = makeImage('FieldWash', this.rt, CLEAR, SF.glow(256));
      wash.rt.setWorldPosition(at);
      wash.rt.setAsFirstSibling();
      const ring = makeImage('FieldWaveRing', this.rt, CLEAR, SF.ring(256, 0.02));
      ring.rt.setWorldPosition(at);
      const ring2 = makeImage('FieldWaveRing2', this.rt, CLEAR, SF.ring(256, 0.05));
      ring2.rt.setWorldPosition(at);
      const d = 1.3 / this.speed;
      try {
        for (let t = 0; t < d; t += Time.dt) {
          const k = t / d;
          const e = 1 - (1 - k) ** 3;
          const ws = lerp(200, 3400, e); wash.rt.sizeDelta = v2(ws, ws);
          wash.color = C(color.r, color.g, color.b, 0.35 * (1 - k) * strength);
          const rs = lerp(120, 2600, e); ring.rt.sizeDelta = v2(rs, rs);
          ring.color = C(color.r, color.g, color.b, 0.8 * (1 - k) * strength);
          const k2 = clamp01((t / d - 0.12) / 0.88);
          const e2 = 1 - (1 - k2) ** 3;
          const r2 = lerp(80, 1900, e2); ring2.rt.sizeDelta = v2(r2, r2);
          ring2.color = C(1, 1, 1, 0.35 * (1 - k2) * strength);
          await co.frame();
        }
      } finally { wash.rt.destroy(); ring.rt.destroy(); ring2.rt.destroy(); }
    });
  }
}
