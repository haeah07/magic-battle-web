// Port of UI/UIFactory.cs (+ ButtonFx). Same helper names so Unity views translate line by line.
import { THEME } from '../config/theme';
import { Color, C, colorize, WHITE } from './color';
import { addUpdate, Img, RichTxt, RT, scene, TextAnchor, Time, Txt, V2, v2 } from './engine';
import { SF, SpriteRef, spriteRef } from './sprites';

export { colorize };

export const rect = (name: string, parent: RT) => new RT(name, parent);

export function makeImage(name: string, parent: RT, color: Color, sprite: SpriteRef | null = null, sliced = false, raycast = false): Img {
  const rt = new RT(name, parent);
  const img = new Img(sprite ?? spriteRef('white'), color, sliced);
  img.rt = rt;
  rt.attach(img);
  if (raycast) img.enableRaycast();
  return img;
}

export function makePanel(name: string, parent: RT, color: Color = THEME.panelColor, radius = 18, raycast = false) {
  return makeImage(name, parent, color, SF.roundedRect(radius), true, raycast);
}

export function makeOutline(parent: RT, color: Color, radius = 18, thickness = 3) {
  const img = makeImage('Outline', parent, color, SF.roundedOutline(radius, thickness), true);
  img.rt.stretch();
  return img;
}

/** Gold-trimmed HUD frame */
export function makeFrame(name: string, parent: RT, fill = true, alpha = 1) {
  return makeImage(name, parent, C(1, 1, 1, alpha), SF.goldFrame(fill), true);
}

export function makeText(name: string, parent: RT, value: string, size: number, color: Color = THEME.textColor, align: TextAnchor = 'MiddleCenter', bold = false): Txt {
  const rt = new RT(name, parent);
  const t = new Txt(value, size, color, align, bold);
  rt.attach(t);
  (t as any).rt = rt;
  return t;
}
export const rtOf = (g: Txt | RichTxt | Img): RT => (g as any).rt;

/** Text with Unity rich text tags (<color=#..>) */
export function makeRich(name: string, parent: RT, value: string, size: number, color: Color = THEME.textColor, align: TextAnchor = 'MiddleCenter', bold = false): RichTxt {
  const rt = new RT(name, parent);
  const t = new RichTxt(value, size, color, align, bold);
  rt.attach(t);
  (t as any).rt = rt;
  return t;
}

// ---------------------------------------------------------------- Button (uGUI Button + ColorTint + ButtonFx)
export class Button {
  readonly img: Img;
  readonly rt: RT;
  label: Txt | null = null;
  interactable = true;
  private listeners: (() => void)[] = [];
  private pressed = false;
  hovered = false;
  colorTint = true;
  constructor(img: Img) {
    this.img = img;
    this.rt = img.rt;
    img.raycastTarget = true;
    img.on('pointerover', () => { this.hovered = true; });
    img.on('pointerout', () => { this.hovered = false; this.pressed = false; });
    img.on('pointerdown', () => { if (this.canClick()) this.pressed = true; });
    img.on('pointerup', () => { if (this.pressed && this.canClick()) this.invoke(); this.pressed = false; });
  }
  private canClick() { return this.interactable && this.rt.activeInHierarchy && !this.rt.raycastBlocked; }
  get isPressed() { return this.pressed; }
  onClick(fn: () => void) { this.listeners.push(fn); return this; }
  invoke() { for (const f of this.listeners) f(); }
  setLabel(s: string) { if (this.label) this.label.text = s; }
  get gameObjectActive() { return this.rt.active; }
}

export function makeButton(name: string, parent: RT, label: string, onClick: (() => void) | null, color: Color | null = null, fontSize = 24): Button {
  const primary = color === null;
  const sprite = primary ? SF.actionButton() : SF.roundedRect(14);
  const img = makeImage(name, parent, color ?? WHITE, sprite, true, true);
  const b = new Button(img);
  if (onClick) b.onClick(onClick);
  const txt = makeText('Label', img.rt, label, fontSize, primary ? C(1, 0.96, 0.86) : WHITE, 'MiddleCenter', true);
  rtOf(txt).stretch(primary ? 28 : 8, primary ? 28 : 8, 2, 2);
  if (primary) txt.shadowed(0.8);
  b.label = txt;
  // uGUI ColorTint (highlight 1.15 / pressed 0.85 / disabled grey)
  const base = { ...img.color };
  let baseSet = img.color;
  addUpdate({
    rt: img.rt,
    update: () => {
      if (img.color !== baseSet) { Object.assign(base, img.color); }
      if (!b.colorTint) return;
      const k = !b.interactable ? 0.6 : b.isPressed ? 0.85 : b.hovered ? 1.15 : 1;
      const o: any = img.obj;
      o.setTint(((Math.min(255, Math.round(255 * Math.min(1, base.r * k)))) << 16) | ((Math.min(255, Math.round(255 * Math.min(1, base.g * k)))) << 8) | Math.min(255, Math.round(255 * Math.min(1, base.b * k))));
      baseSet = img.color;
    },
  });
  return b;
}

/** Hover lift / press squash / glow (Unity ButtonFx) */
export function buttonFx(b: Button, opts: { hoverScale?: number; pressScale?: number; glow?: Img; glowHover?: number } = {}) {
  const hoverScale = opts.hoverScale ?? 1.06, pressScale = opts.pressScale ?? 0.93, glowHover = opts.glowHover ?? 0.55;
  let scale = 1, punch = 0, wasPressed = false;
  addUpdate({
    rt: b.rt,
    update: dt => {
      const target = !b.interactable ? 1 : b.isPressed ? pressScale : b.hovered ? hoverScale : 1;
      if (wasPressed && !b.isPressed && b.interactable && b.hovered) punch = 1;
      wasPressed = b.isPressed;
      scale += (target - scale) * (1 - Math.exp(-dt * 20));
      punch = Math.max(0, punch - dt * 4);
      const s = scale + 0.06 * Math.sin(punch * Math.PI);
      b.rt.setScale(s, s);
      if (opts.glow) {
        const c = opts.glow.color;
        const a = b.interactable && (b.hovered || b.isPressed) ? glowHover : 0;
        if (a > c.a) opts.glow.color = { ...c, a: c.a + (a - c.a) * 0.25 };
      }
    },
  });
}

export const group = (rt: RT) => rt;

export function makeModal(name: string, parent: RT, anchor: V2, pos: V2, size: V2, title: string, onClose: () => void, dim: boolean): { root: RT; body: RT; panel: Img; close: Button } {
  const root = rect(name, parent);
  root.stretch();
  if (dim) {
    const d = makeImage('Dim', root, C(0, 0, 0, 0.55), null, false, true);
    d.rt.stretch();
    const db = new Button(d);
    db.onClick(onClose);
  }
  const panel = makeImage('Panel', root, WHITE, SF.goldFrame(true), true, true);
  panel.rt.place(anchor, pos, size, anchor);
  const shade = makeImage('Shade', panel.rt, C(0.03, 0.04, 0.07, 0.85), SF.roundedRect(14), true);
  shade.rt.stretch(8, 8, 8, 8);
  const t = makeText('Title', panel.rt, title, 28, THEME.textColor, 'MiddleLeft', true);
  const trt = rtOf(t);
  trt.anchorMin = v2(0, 1); trt.anchorMax = v2(1, 1); trt.pivot = v2(0.5, 1);
  trt.offsetMin = v2(28, -70); trt.offsetMax = v2(-90, -18);
  const close = makeButton('Close', panel.rt, '×', onClose, C(1, 1, 1, 0.08), 26);
  close.rt.place(v2(1, 1), v2(-22, -22), v2(52, 52), v2(1, 1));
  const body = rect('Body', panel.rt);
  body.stretch(28, 28, 80, 24);
  root.setActive(false);
  return { root, body, panel, close };
}

export const nowT = () => Time.t;
export { scene };
