// ============================================================================
//  Mini uGUI on top of Phaser.
//  Unity's battle screen is built in code with RectTransforms (anchors, pivot, sizeDelta, anchoredPosition).
//  To keep the web version visually identical, the same layout model is reproduced here so every Unity
//  view can be ported number-for-number:  RT (RectTransform) ↔ Phaser.Container, Img ↔ Image/NineSlice, Txt ↔ Text.
//  Coordinates inside RT are Unity-style (y up, origin at the parent's pivot). Reference canvas: 1920×1080.
// ============================================================================
import Phaser from 'phaser';
import { Color, cssColor, tintOf } from './color';
import { SpriteRef } from './sprites';

export interface V2 { x: number; y: number }
export const v2 = (x: number, y: number): V2 => ({ x, y });
export const V2_ZERO: V2 = { x: 0, y: 0 };

// ---------------------------------------------------------------- time + coroutines
export const Time = { dt: 1 / 60, t: 0, frame: 0 };

type Waiter = { until: number; frames: number; resolve: () => void; owner: CoOwner };
const waiters: Waiter[] = [];
export class Cancelled extends Error {}

/** Owner of coroutines (like a MonoBehaviour). stopAll() cancels everything started by it. */
export class CoOwner {
  private gen = 0;
  get generation() { return this.gen; }
  stopAll() { this.gen++; }
  /** Start a coroutine. Returns a promise that resolves when finished (or silently stops when cancelled). */
  start(fn: (co: Co) => Promise<void>): Promise<void> {
    const co = new Co(this, this.gen);
    return fn(co).catch(e => { if (!(e instanceof Cancelled)) console.error(e); });
  }
}

export class Co {
  constructor(readonly owner: CoOwner, readonly gen: number) {}
  get alive() { return this.owner.generation === this.gen; }
  private check() { if (!this.alive) throw new Cancelled(); }
  /** like `yield return null` */
  frame(): Promise<void> {
    this.check();
    return new Promise<void>(res => waiters.push({ until: -1, frames: 1, resolve: res, owner: this.owner })).then(() => this.check());
  }
  /** like `yield return new WaitForSecondsRealtime(s)` */
  wait(seconds: number): Promise<void> {
    this.check();
    if (seconds <= 0) return this.frame();
    return new Promise<void>(res => waiters.push({ until: Time.t + seconds, frames: 0, resolve: res, owner: this.owner })).then(() => this.check());
  }
}

/** Behaviours with an update(dt) — the equivalent of MonoBehaviour.Update. */
const behaviours = new Set<{ update(dt: number): void; rt?: RT }>();
export function addUpdate(b: { update(dt: number): void; rt?: RT }) { behaviours.add(b); }
export function removeUpdate(b: { update(dt: number): void }) { behaviours.delete(b as any); }

export function tick(dtSeconds: number) {
  Time.dt = Math.max(0, Math.min(0.25, dtSeconds));
  Time.t += Time.dt;
  Time.frame++;
  for (const b of [...behaviours]) {
    // Unity only updates active objects
    if (b.rt && b.rt.destroyed) { behaviours.delete(b); continue; }
    if (b.rt && !b.rt.activeInHierarchy) continue;
    b.update(Time.dt);
  }
  for (let i = waiters.length - 1; i >= 0; i--) {
    const w = waiters[i];
    if (w.frames > 0) { w.frames--; if (w.frames > 0) continue; }
    else if (Time.t < w.until) continue;
    waiters.splice(i, 1);
    w.resolve();
  }
}

// ---------------------------------------------------------------- RectTransform
let layoutDirty = true;
let rootRT: RT | null = null;
export let scene: Phaser.Scene;
export function initEngine(s: Phaser.Scene) {
  scene = s;
  // scene restart (debug "apply"): drop everything from the previous scene
  behaviours.clear();
  waiters.length = 0;
  rootRT = null;
  layoutDirty = true;
}

type Graphic = Img | Txt | RichTxt;

export class RT {
  name: string;
  parent: RT | null = null;
  children: RT[] = [];
  readonly c: Phaser.GameObjects.Container;
  graphic: Graphic | null = null;

  private _anchorMin: V2 = { x: 0.5, y: 0.5 };
  private _anchorMax: V2 = { x: 0.5, y: 0.5 };
  private _pivot: V2 = { x: 0.5, y: 0.5 };
  private _pos: V2 = { x: 0, y: 0 };
  private _size: V2 = { x: 100, y: 100 };
  private _sx = 1;
  private _sy = 1;
  private _rot = 0; // degrees, CCW like Unity z
  private _active = true;
  private _alpha = 1;

  // computed by layout
  w = 100;
  h = 100;
  lx = 0;
  ly = 0;

  constructor(name: string, parent: RT | null) {
    this.name = name;
    this.c = scene.add.container(0, 0);
    this.c.name = name;
    if (parent) this.setParent(parent);
    layoutDirty = true;
  }

  static root(w: number, h: number) {
    const r = new RT('Canvas', null);
    r._anchorMin = { x: 0, y: 0 }; r._anchorMax = { x: 0, y: 0 }; r._pivot = { x: 0, y: 0 };
    r._size = { x: w, y: h };
    rootRT = r;
    return r;
  }

  // ---- properties (Unity names)
  get anchorMin() { return this._anchorMin; } set anchorMin(v: V2) { this._anchorMin = { ...v }; layoutDirty = true; }
  get anchorMax() { return this._anchorMax; } set anchorMax(v: V2) { this._anchorMax = { ...v }; layoutDirty = true; }
  get pivot() { return this._pivot; } set pivot(v: V2) { this._pivot = { ...v }; layoutDirty = true; }
  get anchoredPosition() { return this._pos; } set anchoredPosition(v: V2) { this._pos = { x: v.x, y: v.y }; layoutDirty = true; }
  get sizeDelta() { return this._size; } set sizeDelta(v: V2) { this._size = { x: v.x, y: v.y }; layoutDirty = true; }
  get localScale() { return { x: this._sx, y: this._sy }; }
  set localScale(v: V2) { this._sx = v.x; this._sy = v.y; this.c.setScale(v.x, v.y); layoutDirty = true; }
  setScale(x: number, y = x) { this.localScale = { x, y }; }
  /** Euler z in degrees (Unity convention: positive = counter-clockwise) */
  get rotation() { return this._rot; } set rotation(deg: number) { this._rot = deg; this.c.setRotation(-deg * Math.PI / 180); layoutDirty = true; }

  get offsetMin(): V2 { return { x: this._pos.x - this._size.x * this._pivot.x, y: this._pos.y - this._size.y * this._pivot.y }; }
  set offsetMin(v: V2) {
    const om = this.offsetMax;
    this._size = { x: om.x - v.x, y: om.y - v.y };
    this._pos = { x: v.x + this._size.x * this._pivot.x, y: v.y + this._size.y * this._pivot.y };
    layoutDirty = true;
  }
  get offsetMax(): V2 { return { x: this._pos.x + this._size.x * (1 - this._pivot.x), y: this._pos.y + this._size.y * (1 - this._pivot.y) }; }
  set offsetMax(v: V2) {
    const om = this.offsetMin;
    this._size = { x: v.x - om.x, y: v.y - om.y };
    this._pos = { x: om.x + this._size.x * this._pivot.x, y: om.y + this._size.y * this._pivot.y };
    layoutDirty = true;
  }

  // ---- hierarchy
  get active() { return this._active; }
  setActive(v: boolean) { if (this._active === v) return; this._active = v; this.c.setVisible(v); layoutDirty = true; refreshInput(this); for (const f of this.onActiveChanged) f(v); }
  onActiveChanged: ((v: boolean) => void)[] = [];
  get activeInHierarchy(): boolean { let r: RT | null = this; while (r) { if (!r._active) return false; r = r.parent; } return true; }
  /** CanvasGroup.alpha */
  get groupAlpha() { return this._alpha; } set groupAlpha(a: number) { this._alpha = a; this.c.setAlpha(a); }
  private _blocks = true;
  get blocksRaycasts() { return this._blocks; }
  set blocksRaycasts(v: boolean) { if (this._blocks === v) return; this._blocks = v; refreshInput(this); }
  get raycastBlocked(): boolean { let r: RT | null = this; while (r) { if (!r._blocks) return true; r = r.parent; } return false; }

  setParent(p: RT, worldPositionStays = false) {
    let world: V2 | null = null;
    if (worldPositionStays && this.parent) world = this.worldPosition();
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent.c.remove(this.c, false);
    }
    this.parent = p;
    p.children.push(this);
    p.c.add(this.c);
    layoutDirty = true;
    refreshInput(this);
    if (world) this.setWorldPosition(world);
  }

  siblingIndex() { return this.parent ? this.parent.children.indexOf(this) : 0; }
  setSiblingIndex(i: number) {
    if (!this.parent) return;
    const arr = this.parent.children;
    const cur = arr.indexOf(this);
    arr.splice(cur, 1);
    i = Math.max(0, Math.min(arr.length, i));
    arr.splice(i, 0, this);
    this.parent.syncOrder();
  }
  setAsLastSibling() { if (this.parent) this.setSiblingIndex(this.parent.children.length - 1); }
  setAsFirstSibling() { this.setSiblingIndex(0); }
  private syncOrder() {
    // graphic first (drawn below children), then children in sibling order
    let idx = 0;
    if (this.graphic) this.c.moveTo(this.graphic.obj, idx++);
    for (const ch of this.children) this.c.moveTo(ch.c, idx++);
  }

  destroy() {
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
    }
    this.destroyed = true;
    for (const ch of [...this.children]) ch.destroy();
    this.c.destroy();
    for (const f of this.onDestroy) f();
  }
  destroyed = false;
  onDestroy: (() => void)[] = [];

  attach(g: Graphic) {
    this.graphic = g;
    this.c.addAt(g.obj, 0);
  }

  // ---- convenience (UIFactory.Stretch / Place)
  stretch(left = 0, right = 0, top = 0, bottom = 0) {
    this._anchorMin = { x: 0, y: 0 };
    this._anchorMax = { x: 1, y: 1 };
    this.offsetMin = { x: left, y: bottom };
    this.offsetMax = { x: -right, y: -top };
    return this;
  }
  place(anchor: V2, pos: V2, size: V2, pivot?: V2) {
    this._anchorMin = { ...anchor };
    this._anchorMax = { ...anchor };
    this._pivot = pivot ? { ...pivot } : { x: 0.5, y: 0.5 };
    this._pos = { ...pos };
    this._size = { ...size };
    layoutDirty = true;
    return this;
  }

  /** rect in local coords: xMin, yMin (y up), relative to pivot */
  get rect() { return { x: -this.w * this._pivot.x, y: -this.h * this._pivot.y, width: this.w, height: this.h }; }

  // ---- layout
  layoutSelf() {
    const p = this.parent;
    if (!p) { this.w = this._size.x; this.h = this._size.y; this.lx = 0; this.ly = -this.h; } // root: Unity bottom-left origin = Phaser (0, h)
    else {
      const pw = p.w, ph = p.h;
      this.w = pw * (this._anchorMax.x - this._anchorMin.x) + this._size.x;
      this.h = ph * (this._anchorMax.y - this._anchorMin.y) + this._size.y;
      const pxMin = -pw * p._pivot.x, pyMin = -ph * p._pivot.y;
      const ax = pxMin + pw * (this._anchorMin.x + (this._anchorMax.x - this._anchorMin.x) * this._pivot.x);
      const ay = pyMin + ph * (this._anchorMin.y + (this._anchorMax.y - this._anchorMin.y) * this._pivot.y);
      this.lx = ax + this._pos.x;
      this.ly = ay + this._pos.y;
    }
    this.c.setPosition(this.lx, -this.ly);
    if (this.graphic) this.graphic.layout(this);
  }
  layoutAll() {
    this.layoutSelf();
    for (const ch of this.children) if (ch._active) ch.layoutAll();
  }

  // ---- world transform (Phaser screen space of the 1920×1080 game, y down)
  private worldMatrix(): number[] {
    // [a, b, c, d, tx, ty] mapping local (x right, y DOWN) → world
    const chain: RT[] = [];
    let r: RT | null = this;
    while (r) { chain.push(r); r = r.parent; }
    let m = [1, 0, 0, 1, 0, 0];
    for (let i = chain.length - 1; i >= 0; i--) {
      const n = chain[i];
      const rad = -n._rot * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const l = [cos * n._sx, sin * n._sx, -sin * n._sy, cos * n._sy, n.lx, -n.ly];
      m = [m[0] * l[0] + m[2] * l[1], m[1] * l[0] + m[3] * l[1], m[0] * l[2] + m[2] * l[3], m[1] * l[2] + m[3] * l[3], m[0] * l[4] + m[2] * l[5] + m[4], m[1] * l[4] + m[3] * l[5] + m[5]];
    }
    return m;
  }
  /** World position of the pivot (Phaser px, y down) — RectTransform.position */
  worldPosition(): V2 {
    ensureLayout();
    const m = this.worldMatrix();
    return { x: m[4], y: m[5] };
  }
  /** World point of a local Unity-style point (y up) */
  localToWorld(p: V2): V2 {
    ensureLayout();
    const m = this.worldMatrix();
    return { x: m[0] * p.x + m[2] * -p.y + m[4], y: m[1] * p.x + m[3] * -p.y + m[5] };
  }
  /** Unity-style local point (y up, relative to pivot) of a world point */
  worldToLocal(p: V2): V2 {
    ensureLayout();
    const m = this.worldMatrix();
    const det = m[0] * m[3] - m[2] * m[1];
    const dx = p.x - m[4], dy = p.y - m[5];
    const lx = (m[3] * dx - m[2] * dy) / det;
    const ly = (-m[1] * dx + m[0] * dy) / det;
    return { x: lx, y: -ly };
  }
  setWorldPosition(p: V2) {
    if (!this.parent) return;
    const local = this.parent.worldToLocal(p);
    // local = anchorRef + anchoredPosition  →  anchoredPosition = local - (lx - pos)
    ensureLayout();
    const refX = this.lx - this._pos.x, refY = this.ly - this._pos.y;
    this.anchoredPosition = { x: local.x - refX, y: local.y - refY };
  }
  lossyScale(): number {
    let s = 1; let r: RT | null = this;
    while (r) { s *= r._sx; r = r.parent; }
    return s;
  }
  containsWorld(p: V2, padding = 0): boolean {
    const l = this.worldToLocal(p);
    const rc = this.rect;
    return l.x >= rc.x - padding && l.x <= rc.x + rc.width + padding && l.y >= rc.y - padding && l.y <= rc.y + rc.height + padding;
  }
}

/** Inactive / non-blocking subtrees must not catch pointer events (Unity raycasts skip them). */
export function refreshInput(rt: RT) {
  const ok = rt.activeInHierarchy && !rt.raycastBlocked;
  const walk = (r: RT, parentOk: boolean) => {
    const here = parentOk && r.active && r.blocksRaycasts;
    const g = r.graphic as any;
    if (g && g.obj && g.obj.input) g.obj.input.enabled = here && (g.raycastTarget !== false);
    for (const ch of r.children) walk(ch, here);
  };
  walk(rt, ok || (rt.parent ? rt.parent.activeInHierarchy && !rt.parent.raycastBlocked && rt.active && rt.blocksRaycasts : true));
}

export function ensureLayout() {
  if (layoutDirty && rootRT) { layoutDirty = false; rootRT.layoutAll(); }
}
export function markLayoutDirty() { layoutDirty = true; }
export function frameLayout() { if (rootRT) { layoutDirty = false; rootRT.layoutAll(); } }

// ---------------------------------------------------------------- graphics
export enum ImageType { Simple, Sliced, Filled }

export class Img {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice;
  private _sprite: SpriteRef | null;
  private _color: Color;
  private _sliced: boolean;
  preserveAspect = false;
  raycastTarget = false;
  enabled = true;
  rt!: RT;

  constructor(sprite: SpriteRef | null, color: Color, sliced: boolean) {
    this._sprite = sprite;
    this._color = { ...color };
    this._sliced = sliced && !!sprite && sprite.border.some(b => b > 0);
    this.obj = this.makeObj();
    this.applyColor();
  }
  private makeObj() {
    const s = this._sprite;
    const key = s ? s.key : 'white';
    if (this._sliced && s) {
      const [l, b, r, t] = s.border;
      return scene.add.nineslice(0, 0, key, undefined, s.w, s.h, l, r, t, b).setOrigin(0, 0);
    }
    return scene.add.image(0, 0, key).setOrigin(0, 0);
  }
  get sprite() { return this._sprite; }
  set sprite(s: SpriteRef | null) {
    if (s === this._sprite || (s && this._sprite && s.key === this._sprite.key)) { this._sprite = s; return; }
    const wantSliced = this._sliced || this.type === ImageType.Sliced;
    this._sprite = s;
    const slicedNow = wantSliced && !!s && s.border.some(b => b > 0);
    if (slicedNow !== this._sliced || slicedNow || this.obj instanceof Phaser.GameObjects.NineSlice) {
      this._sliced = slicedNow;
      this.rebuild();
    } else (this.obj as Phaser.GameObjects.Image).setTexture(s ? s.key : 'white');
    this.applyColor();
    markLayoutDirty();
  }
  get type() { return this._sliced ? ImageType.Sliced : ImageType.Simple; }
  set type(t: ImageType) {
    const want = t === ImageType.Sliced && !!this._sprite && this._sprite.border.some(b => b > 0);
    if (want !== this._sliced) { this._sliced = want; this.rebuild(); }
  }
  private rebuild() {
    const old = this.obj;
    const parent = old.parentContainer;
    const idx = parent ? parent.getIndex(old) : 0;
    this.obj = this.makeObj();
    if (parent) { parent.addAt(this.obj, idx); }
    this.wireInput(old);
    old.destroy();
    this.applyColor();
  }
  private inputHandlers: { ev: string; fn: (...a: any[]) => void }[] = [];
  private wireInput(old?: Phaser.GameObjects.GameObject) {
    if (this.inputHandlers.length === 0) return;
    this.obj.setInteractive();
    for (const h of this.inputHandlers) this.obj.on(h.ev, h.fn);
    void old;
  }
  on(ev: string, fn: (...a: any[]) => void) {
    this.inputHandlers.push({ ev, fn });
    if (!this.obj.input) { this.obj.setInteractive(); this.raycastTarget = true; this.applyColor(); if (this.rt) refreshInput(this.rt); }
    this.obj.on(ev, fn);
  }
  /** Unity raycastTarget = true: blocks pointer events for everything below it. */
  enableRaycast() {
    if (this.inputHandlers.length === 0) this.on('pointerdown', () => {});
    else { this.raycastTarget = true; this.applyColor(); }
  }
  get color() { return this._color; }
  set color(c: Color) {
    if (c.r === this._color.r && c.g === this._color.g && c.b === this._color.b && c.a === this._color.a) return;
    this._color = { ...c };
    this.applyColor();
  }
  private applyColor() {
    const o: any = this.obj;
    o.setTint(tintOf(this._color));
    // raycast targets stay "rendered" at ~0 alpha so Phaser input can hit them (Unity raycasts alpha-0 images)
    const a = Math.max(0, Math.min(1, this._color.a));
    o.setAlpha(this.raycastTarget ? Math.max(a, 0.002) : a);
    o.setVisible(this.enabled && (a > 0.001 || this.raycastTarget));
  }
  setEnabled(v: boolean) { this.enabled = v; this.applyColor(); }

  layout(rt: RT) {
    let w = rt.w, h = rt.h;
    let x = -w * rt.pivot.x, y = -h * (1 - rt.pivot.y);
    if (this.preserveAspect && this._sprite) {
      const ar = this._sprite.w / this._sprite.h;
      if (w / h > ar) { const nw = h * ar; x += (w - nw) / 2; w = nw; }
      else { const nh = w / ar; y += (h - nh) / 2; h = nh; }
    }
    if (this.obj instanceof Phaser.GameObjects.NineSlice) {
      const s = this._sprite!;
      const [l, b, r, t] = s.border;
      // Unity shrinks the borders when the rect is smaller than them
      const k = Math.min(1, Math.abs(w) / Math.max(1e-6, l + r), Math.abs(h) / Math.max(1e-6, t + b));
      const sw = Math.max(l + r, Math.abs(w) / k), shh = Math.max(t + b, Math.abs(h) / k);
      if (this.obj.width !== sw || this.obj.height !== shh) this.obj.setSize(sw, shh);
      this.obj.setPosition(x, y).setScale(k, k);
    } else {
      this.obj.setPosition(x, y);
      this.obj.setDisplaySize(Math.max(0.0001, w), Math.max(0.0001, h));
    }
    this.obj.setVisible(this.enabled && (this._color.a > 0.001 || this.raycastTarget) && w > 0 && h > 0);
  }
}

export type TextAnchor = 'UpperLeft' | 'UpperCenter' | 'UpperRight' | 'MiddleLeft' | 'MiddleCenter' | 'MiddleRight' | 'LowerLeft' | 'LowerCenter' | 'LowerRight';

const FONT_REG = 'NanumGothic, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const FONT_BOLD = 'NanumGothicBold, NanumGothic, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

function anchorFactors(a: TextAnchor) {
  const fx = a.endsWith('Left') ? 0 : a.endsWith('Right') ? 1 : 0.5;
  const fy = a.startsWith('Upper') ? 0 : a.startsWith('Lower') ? 1 : 0.5;
  return { fx, fy };
}

export class Txt {
  obj: Phaser.GameObjects.Text;
  private _text = '';
  private _color: Color;
  private _size: number;
  private _bold: boolean;
  alignment: TextAnchor;
  wrap = true;
  bestFit: { min: number; max: number } | null = null;
  lineSpacing = 1;
  enabled = true;
  private shadow: { a: number; dist: number } | null = null;
  private outline: { a: number } | null = null;
  private lastW = -1;
  private needsFit = true;

  constructor(text: string, size: number, color: Color, align: TextAnchor, bold: boolean) {
    this._size = size;
    this._bold = bold;
    this._color = { ...color };
    this.alignment = align;
    this.obj = scene.add.text(0, 0, '', { fontFamily: bold ? FONT_BOLD : FONT_REG, fontSize: `${size}px`, color: '#ffffff', resolution: 2 });
    this.text = text;
    this.applyColor();
  }
  get text() { return this._text; }
  set text(v: string) {
    v = v ?? '';
    if (v === this._text) return;
    this._text = v;
    this.obj.setText(v);
    this.needsFit = true;
  }
  get fontSize() { return this._size; }
  set fontSize(v: number) { if (v === this._size) return; this._size = v; this.obj.setFontSize(v); this.needsFit = true; }
  get color() { return this._color; }
  set color(c: Color) {
    if (c.r === this._color.r && c.g === this._color.g && c.b === this._color.b && c.a === this._color.a) return;
    this._color = { ...c };
    this.applyColor();
  }
  private applyColor() {
    this.obj.setColor(cssColor({ ...this._color, a: 1 }));
    this.obj.setAlpha(Math.max(0, Math.min(1, this._color.a)));
    this.obj.setVisible(this.enabled && this._color.a > 0.001);
  }
  setEnabled(v: boolean) { this.enabled = v; this.applyColor(); }
  shadowed(alpha = 0.6) {
    this.shadow = { a: alpha, dist: 2 };
    this.obj.setShadow(0, 2, `rgba(0,0,0,${alpha})`, 0, false, true);
    return this;
  }
  outlined(alpha = 0.8) {
    this.outline = { a: alpha };
    this.obj.setStroke(`rgba(0,0,0,${alpha})`, 4);
    return this;
  }
  layout(rt: RT) {
    const w = rt.w, h = rt.h;
    if (this.wrap) {
      if (w !== this.lastW) { this.obj.setWordWrapWidth(Math.max(1, w), true); this.lastW = w; this.needsFit = true; }
    } else if (this.lastW !== -2) { this.obj.setWordWrapWidth(0); this.lastW = -2; }
    if (this.bestFit && this.needsFit) {
      let s = this.bestFit.max;
      this.obj.setFontSize(s);
      while (s > this.bestFit.min && (this.obj.width > w + 1 || this.obj.height > h + 2)) { s--; this.obj.setFontSize(s); }
    }
    this.needsFit = false;
    if (this.obj.lineSpacing !== (this.lineSpacing - 1) * this._size) this.obj.setLineSpacing((this.lineSpacing - 1) * this._size);
    const { fx, fy } = anchorFactors(this.alignment);
    this.obj.setAlign(fx === 0 ? 'left' : fx === 1 ? 'right' : 'center');
    const x0 = -w * rt.pivot.x, yTop = -h * (1 - rt.pivot.y);
    this.obj.setOrigin(fx, fy);
    this.obj.setPosition(x0 + w * fx, yTop + h * fy);
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(s: string, bold: boolean, size: number) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  measureCtx.font = `${size}px ${bold ? FONT_BOLD : FONT_REG}`;
  return measureCtx.measureText(s).width;
}

/** Unity rich text subset: <color=#rrggbb>..</color> and <b>..</b>. Lines split by \n (no auto wrap). */
export class RichTxt {
  obj: Phaser.GameObjects.Container;
  private _text = '';
  private _color: Color;
  private size: number;
  private bold: boolean;
  alignment: TextAnchor;
  lineSpacing = 1;
  enabled = true;
  private shadowA = 0;
  private dirty = true;
  /** wrap long lines at word boundaries (default off, like the HUD texts) */
  wrap = false;
  private builtW = -1;
  private lines: { parts: Phaser.GameObjects.Text[]; width: number; height: number }[] = [];

  constructor(text: string, size: number, color: Color, align: TextAnchor, bold: boolean) {
    this.size = size;
    this.bold = bold;
    this._color = { ...color };
    this.alignment = align;
    this.obj = scene.add.container(0, 0);
    this.text = text;
  }
  get text() { return this._text; }
  set text(v: string) { v = v ?? ''; if (v === this._text) return; this._text = v; this.dirty = true; }
  get color() { return this._color; }
  set color(c: Color) { this._color = { ...c }; this.dirty = true; }
  shadowed(a = 0.6) { this.shadowA = a; this.dirty = true; return this; }
  setEnabled(v: boolean) { this.enabled = v; this.obj.setVisible(v); }
  private rebuild(maxW: number) {
    this.obj.removeAll(true);
    this.lines = [];
    this.builtW = maxW;
    const base = cssColor({ ...this._color, a: 1 });
    type Seg = { s: string; col: string; bold: boolean };
    const make = (g: Seg) => {
      const t = scene.add.text(0, 0, g.s, { fontFamily: g.bold ? FONT_BOLD : FONT_REG, fontSize: `${this.size}px`, color: g.col.startsWith('#') && g.col.length > 7 ? g.col.slice(0, 7) : g.col, resolution: 2 });
      if (this.shadowA > 0) t.setShadow(0, 2, `rgba(0,0,0,${this.shadowA})`, 0, false, true);
      return t;
    };
    const emit = (segs: Seg[]) => {
      const parts = segs.filter(g => g.s.length > 0).map(make);
      let width = 0, height = this.size * 1.2;
      for (const p of parts) { width += p.width; height = Math.max(height, p.height); }
      this.lines.push({ parts, width, height });
      for (const p of parts) this.obj.add(p);
    };
    for (const raw of this._text.split('\n')) {
      const segs: Seg[] = [];
      const re = /<color=(#[0-9a-fA-F]{6,8})>|<\/color>|<b>|<\/b>/g;
      const stack: string[] = [];
      let bold = this.bold;
      let last = 0;
      let m: RegExpExecArray | null;
      const push = (s: string) => { if (s) segs.push({ s, col: stack.length ? stack[stack.length - 1] : base, bold }); };
      while ((m = re.exec(raw))) {
        push(raw.slice(last, m.index));
        if (m[1]) stack.push(m[1]);
        else if (m[0] === '</color>') stack.pop();
        else if (m[0] === '<b>') bold = true;
        else bold = this.bold;
        last = re.lastIndex;
      }
      push(raw.slice(last));
      if (!this.wrap || maxW <= 0) { emit(segs); continue; }
      // greedy word wrap across coloured segments (Unity Text horizontalOverflow = Wrap)
      let line: Seg[] = [], x = 0;
      for (const g of segs) {
        for (const tok of g.s.split(/(?<=\s)/)) {
          const w = measure(tok, g.bold, this.size);
          if (x + w > maxW && x > 0 && tok.trim()) { emit(line); line = []; x = 0; }
          const prev = line[line.length - 1];
          if (prev && prev.col === g.col && prev.bold === g.bold) prev.s += tok; else line.push({ s: tok, col: g.col, bold: g.bold });
          x += w;
        }
      }
      emit(line);
    }
    this.obj.setAlpha(Math.max(0, Math.min(1, this._color.a)));
    this.dirty = false;
  }
  layout(rt: RT) {
    const w = rt.w, h = rt.h;
    if (this.dirty || (this.wrap && Math.abs(w - this.builtW) > 0.5)) this.rebuild(w);
    const { fx, fy } = anchorFactors(this.alignment);
    const x0 = -w * rt.pivot.x, yTop = -h * (1 - rt.pivot.y);
    const lh = this.lines.map(l => l.height * this.lineSpacing);
    const total = lh.reduce((a, b) => a + b, 0);
    let y = yTop + (h - total) * fy;
    this.lines.forEach((l, i) => {
      let x = x0 + (w - l.width) * fx;
      for (const p of l.parts) { p.setPosition(x, y); x += p.width; }
      y += lh[i];
    });
    this.obj.setAlpha(Math.max(0, Math.min(1, this._color.a)));
  }
}
