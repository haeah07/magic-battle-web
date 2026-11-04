// Ports of UI/SidePanel.cs (player HUD), TopBar.cs, FieldView.cs (field HUD), InvestPanel.cs, ActionBar.cs,
// MatchupHint.cs, BannerView.cs, ResultStrip.cs, BattleLog.cs, FloatingTextLayer.cs
import { LAYOUT } from '../config/layout';
import { THEME } from '../config/theme';
import { VFX } from '../config/vfx';
import { PlayTerms } from '../core/combat';
import { strongAgainst, weakAgainst } from '../core/element';
import { FieldModeType, FieldState, fieldInfoOfMode, fieldMode, level, modeInPair } from '../core/field';
import { PublicPlayerState } from '../core/match';
import { CardDef, CombatStats, Element, FIELD_ORDER, MatchupStanding, modFromField, modIsNegative, PlayerSlot, sdDescribe, slotLabel, maxLevel } from '../core/types';
import { GameContent } from '../core/content';
import { VisualLibrary } from '../game/visuals';
import { MANA_COLOR } from './cardView';
import { C, Color, colorize, lerpColor, WHITE } from './color';
import { addUpdate, Co, CoOwner, Img, RichTxt, RT, Time, Txt, V2, v2 } from './engine';
import { Button, buttonFx, makeButton, makeFrame, makeImage, makeRich, makeText, rect, rtOf } from './factory';
import { lerp } from './mathf';
import { SF } from './sprites';

// ============================================================================ player HUD (SidePanel)
export class PlayerHud {
  static readonly PanelSize = v2(350, 116);
  readonly rt: RT;
  private turnGlow: Img; private socket: Img; private name: Txt; private role: Txt; private statusDot: Img; private status: Txt;
  private gemGlow: Img; private gem: Img; private mpValue: Txt; private mpMax: Txt; private pips: Img[] = []; private cards: Txt; private note: Txt;
  private left = true; private highlight = false; private submitted = false; private mp = 0; private pending = 0; private t = 0;

  constructor(parent: RT, private lib: VisualLibrary, readonly slot: PlayerSlot) {
    this.rt = rect(slotLabel(slot) + 'Hud', parent);
    this.rt.sizeDelta = PlayerHud.PanelSize;
    const pc = lib.playerColor(slot), th = THEME;
    this.turnGlow = makeImage('TurnGlow', this.rt, C(pc.r, pc.g, pc.b, 0), SF.softFrame(18, 30), true);
    this.turnGlow.rt.stretch(-30, -30, -30, -30);
    makeFrame('Frame', this.rt, true, 0.96).rt.stretch();
    this.socket = makeImage('Socket', this.rt, WHITE, SF.iconSocket());
    const avatar = makeImage('Avatar', this.socket.rt, pc, SF.circle(128));
    avatar.rt.stretch(12, 12, 12, 12);
    rtOf(makeText('Label', avatar.rt, slotLabel(slot), 22, C(0.05, 0.06, 0.09), 'MiddleCenter', true)).stretch();
    this.name = makeText('Name', this.rt, slot === PlayerSlot.P1 ? 'PLAYER 1' : 'PLAYER 2', 21, pc, 'MiddleLeft', true).shadowed();
    this.role = makeText('Role', this.rt, '', 14, lib.gold, 'MiddleLeft', true);
    this.statusDot = makeImage('Dot', this.rt, WHITE, SF.diamond());
    this.status = makeText('Status', this.rt, '', 15, WHITE, 'MiddleLeft', true).shadowed(0.9);
    this.gemGlow = makeImage('GemGlow', this.rt, C(0.35, 0.5, 1, 0.35), SF.glow(128));
    this.gem = makeImage('MpGem', this.rt, C(0.33, 0.45, 1), SF.diamond());
    makeImage('Inner', this.gem.rt, C(1, 1, 1, 0.2), SF.diamond()).rt.stretch(9, 9, 9, 9);
    this.mpValue = makeText('Value', this.gem.rt, '4', 24, WHITE, 'MiddleCenter', true).shadowed(0.9);
    rtOf(this.mpValue).stretch(-10, -10, 0, 0);
    this.mpMax = makeText('Max', this.rt, 'MP /10', 13, C(0.62, 0.72, 1), 'MiddleLeft', true);
    for (let i = 0; i < 10; i++) this.pips.push(makeImage('Pip' + i, this.rt, WHITE, SF.diamond()));
    this.cards = makeText('Cards', this.rt, '', 13, th.mutedTextColor, 'MiddleRight');
    this.note = makeText('Note', this.rt, '', 12, C(th.mutedTextColor.r, th.mutedTextColor.g, th.mutedTextColor.b, 0.8), 'MiddleRight');
    for (const t of [this.name, this.role, this.status, this.mpMax, this.cards, this.note]) t.wrap = false;
    this.setSide(slot === PlayerSlot.P1);
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  setSide(home: boolean) {
    this.left = home;
    const s = home ? 1 : -1;
    const edge = v2(home ? 0 : 1, 0.5), pivotIn = v2(home ? 0 : 1, 0.5);
    const align = home ? 'MiddleLeft' : 'MiddleRight', alignOut = home ? 'MiddleRight' : 'MiddleLeft';
    this.socket.rt.place(edge, v2(s * 50, 4), v2(78, 78));
    for (const t of [this.name, this.role, this.status, this.mpMax]) t.alignment = align;
    rtOf(this.name).place(edge, v2(s * 98, 32), v2(150, 26), pivotIn);
    rtOf(this.role).place(edge, v2(s * 98, 10), v2(60, 18), pivotIn);
    this.statusDot.rt.place(edge, v2(s * 140, 10), v2(9, 9));
    rtOf(this.status).place(edge, v2(s * 150, 10), v2(110, 20), pivotIn);
    this.gem.rt.place(edge, v2(s * 118, -28), v2(46, 46));
    this.gemGlow.rt.place(edge, v2(s * 118, -28), v2(96, 96));
    rtOf(this.mpMax).place(edge, v2(s * 146, -18), v2(70, 18), pivotIn);
    this.pips.forEach((p, i) => p.rt.place(edge, v2(s * (154 + i * 17), -36), v2(13, 13)));
    this.cards.alignment = alignOut; this.note.alignment = alignOut;
    const far = v2(home ? 1 : 0, 0.5);
    rtOf(this.cards).place(far, v2(-s * 16, 32), v2(120, 20), v2(home ? 1 : 0, 0.5));
    rtOf(this.note).place(far, v2(-s * 16, 12), v2(150, 18), v2(home ? 1 : 0, 0.5));
  }

  render(p: PublicPlayerState, status: string, statusColor: Color, highlight: boolean, role: string) {
    this.highlight = highlight;
    this.submitted = status === '제출 완료';
    this.role.text = role;
    this.status.text = status;
    this.status.color = statusColor;
    this.statusDot.color = statusColor;
    this.statusDot.rt.setActive(!!status);
    this.mpMax.text = `MP / ${p.maxMp}`;
    this.mp = p.mp;
    this.mpValue.text = String(p.mp);
    this.pips.forEach((pp, i) => pp.rt.setActive(i < p.maxMp));
    const tax = p.mpTax > 0 ? ` · 다음 MP -${p.mpTax}` : '';
    this.cards.text = `손패 ${p.handCount} · 덱 ${p.deckCount}`;
    if (!this.left) { this.note.text = tax.length > 0 ? tax.substring(3) : ''; this.pending = 0; }
    this.paint(1);
  }

  /** viewer only: blink the pips that the current selection (+ investment) will spend */
  setMp(mp: number, maxMp: number, pending: number, note: string) {
    this.mp = mp;
    this.pending = Math.max(0, Math.min(mp, pending));
    this.mpValue.text = String(mp);
    this.mpMax.text = `MP / ${maxMp}`;
    this.note.text = note ?? '';
    this.pips.forEach((p, i) => p.rt.setActive(i < maxMp));
    this.paint(1);
  }

  private paint(blink: number) {
    this.pips.forEach((p, i) => {
      if (!p.rt.active) return;
      const filled = i < this.mp;
      const spending = filled && this.pending > 0 && i >= this.mp - this.pending;
      p.color = !filled ? C(1, 1, 1, 0.12) : spending ? C(1, 0.85, 0.4, 0.45 + 0.55 * blink) : C(0.45, 0.6, 1);
    });
  }

  private update(dt: number) {
    this.t += dt;
    const pc = this.lib.playerColor(this.slot);
    const a = (this.highlight ? 0.16 + 0.08 * Math.sin(this.t * 3) : this.submitted ? 0.07 : 0) * VFX.choosing;
    this.turnGlow.color = C(pc.r, pc.g, pc.b, lerp(this.turnGlow.color.a, a, 0.12));
    this.statusDot.rt.rotation = this.highlight ? this.t * 120 : 0;
    this.gemGlow.color = C(0.35, 0.5, 1, (0.25 + 0.1 * Math.sin(this.t * 2)) * VFX.ambient);
    if (this.pending > 0) this.paint(0.5 + 0.5 * Math.sin(this.t * 6));
  }
}

// ============================================================================ TopBar
export class TopBar {
  readonly rt: RT;
  onMatchup: (() => void)[] = []; onDetail: (() => void)[] = []; onDebug: (() => void)[] = []; onRestart: (() => void)[] = [];
  private round: Txt;
  private debugBtn: Button;
  readonly buttons: Record<string, Button> = {};

  constructor(parent: RT, lib: VisualLibrary) {
    this.rt = rect('TopBar', parent);
    this.rt.anchorMin = v2(0, 1); this.rt.anchorMax = v2(1, 1); this.rt.pivot = v2(0.5, 1);
    this.rt.offsetMin = v2(0, -70); this.rt.offsetMax = v2(0, 0);
    const th = THEME, gold = lib.gold;
    const medal = makeFrame('RoundMedal', this.rt, true, 0.95);
    medal.rt.place(v2(0.5, 1), v2(0, -10), v2(196, 54), v2(0.5, 1));
    makeImage('Gem', medal.rt, C(gold.r, gold.g, gold.b, 0.9), SF.diamond()).rt.place(v2(0, 0.5), v2(26, 0), v2(16, 16));
    makeImage('Gem2', medal.rt, C(gold.r, gold.g, gold.b, 0.9), SF.diamond()).rt.place(v2(1, 0.5), v2(-26, 0), v2(16, 16));
    rtOf(makeText('Label', medal.rt, 'ROUND', 14, th.mutedTextColor, 'MiddleRight', true)).place(v2(0.5, 0.5), v2(-4, 0), v2(70, 30), v2(1, 0.5));
    this.round = makeText('Round', medal.rt, '01', 28, gold, 'MiddleLeft', true).shadowed(0.9);
    rtOf(this.round).place(v2(0.5, 0.5), v2(4, 0), v2(60, 36), v2(0, 0.5));
    const icons = rect('Icons', this.rt).place(v2(0, 1), v2(LAYOUT.margin, -12), v2(260, 64), v2(0, 1));
    this.buttons['상성표'] = this.make(icons, lib, '상성표', '◈', '상성', 0, () => this.onMatchup.forEach(f => f()), 1);
    this.buttons['상세'] = this.make(icons, lib, '상세', '≡', '상세', 1, () => this.onDetail.forEach(f => f()), 1);
    this.buttons['새 게임'] = this.make(icons, lib, '새 게임', '⇄', '새 게임', 2, () => this.onRestart.forEach(f => f()), 1);
    this.debugBtn = this.buttons['디버그'] = this.make(icons, lib, '디버그', '⊕', '디버그', 3, () => this.onDebug.forEach(f => f()), 0.4);
  }

  private make(parent: RT, lib: VisualLibrary, name: string, glyph: string, caption: string, index: number, click: () => void, alpha: number) {
    const th = THEME;
    const size = index === 3 ? 30 : 44;
    const img = makeImage(name, parent, C(1, 1, 1, alpha), SF.iconSocket(), false, true);
    img.rt.place(v2(0, 1), v2(index * 56 + (index === 3 ? 7 : 0), index === 3 ? -7 : 0), v2(size, size), v2(0, 1));
    const b = new Button(img);
    b.colorTint = false;
    b.onClick(click);
    const t = makeText('Glyph', img.rt, glyph, index === 3 ? 15 : 21, C(lib.gold.r, lib.gold.g, lib.gold.b, alpha), 'MiddleCenter', true);
    rtOf(t).stretch(0, 0, 0, 2);
    const cap = makeText('Caption', img.rt, caption, 11, C(th.mutedTextColor.r, th.mutedTextColor.g, th.mutedTextColor.b, 0.85 * alpha), 'UpperCenter');
    rtOf(cap).place(v2(0.5, 0), v2(0, -2), v2(60, 14), v2(0.5, 1));
    cap.wrap = false;
    rtOf(cap).setActive(index !== 3);
    buttonFx(b);
    return b;
  }

  setRound(r: number) { this.round.text = String(r).padStart(2, '0'); }
  setDebugVisible(v: boolean) { this.debugBtn.rt.setActive(v); }
}

// ============================================================================ Field HUD (FieldView)
interface LevelCell { element: Element; dot: Img; glyph: Txt; pips: Img[]; bar: Img; rt: RT }

export class FieldHud {
  static readonly PanelSize = v2(600, 58);
  readonly rt: RT;
  private flash: Img; private iconA: Img; private iconB: Img; private glyph: Txt; private name: Txt; private badge: Txt;
  private cells: LevelCell[] = [];
  private flashT = 1; private flashColor = WHITE;

  constructor(parent: RT, private lib: VisualLibrary, private content: GameContent) {
    this.rt = rect('FieldHud', parent);
    this.rt.sizeDelta = FieldHud.PanelSize;
    makeFrame('Frame', this.rt, true, 0.92).rt.stretch();
    this.flash = makeImage('Flash', this.rt, C(0, 0, 0, 0), SF.softFrame(14, 22), true);
    this.flash.rt.stretch(-22, -22, -22, -22);
    const nameRoot = rect('Name', this.rt).place(v2(0, 0.5), v2(14, 0), v2(200, 50), v2(0, 0.5));
    this.iconA = makeImage('IconA', nameRoot, WHITE);
    this.iconA.rt.place(v2(0, 0.5), v2(20, 0), v2(34, 34));
    this.iconA.preserveAspect = true;
    this.iconB = makeImage('IconB', nameRoot, WHITE);
    this.iconB.rt.place(v2(0, 0.5), v2(38, -6), v2(24, 24));
    this.iconB.preserveAspect = true;
    this.glyph = makeText('Glyph', nameRoot, '◆', 24, WHITE, 'MiddleCenter', true).shadowed();
    rtOf(this.glyph).place(v2(0, 0.5), v2(20, 0), v2(44, 34));
    this.name = makeText('Text', nameRoot, '중립 필드', 19, WHITE, 'MiddleLeft', true).shadowed();
    rtOf(this.name).place(v2(0, 0.5), v2(50, 8), v2(150, 24), v2(0, 0.5));
    this.badge = makeText('Badge', nameRoot, '', 12, lib.gold, 'MiddleLeft', true);
    rtOf(this.badge).place(v2(0, 0.5), v2(50, -12), v2(150, 16), v2(0, 0.5));
    this.name.wrap = false; this.badge.wrap = false;
    makeImage('Sep', this.rt, C(lib.gold.r, lib.gold.g, lib.gold.b, 0.35)).rt.place(v2(0, 0.5), v2(218, 0), v2(1, 34));
    const row = rect('Levels', this.rt).place(v2(0, 0.5), v2(226, 0), v2(FieldHud.PanelSize.x - 236, 50), v2(0, 0.5));
    const n = FIELD_ORDER.length;
    const cw = (FieldHud.PanelSize.x - 236) / n;
    FIELD_ORDER.forEach((e, i) => {
      const cellRt = rect('Cell_' + Element[e], row).place(v2(0, 0.5), v2(cw * (i + 0.5), 0), v2(cw, 50));
      const icon = lib.elementIcon(e);
      const dot = makeImage('Dot', cellRt, icon ? WHITE : lib.elementColor(e), icon ?? SF.circle(64));
      dot.rt.place(v2(0.5, 1), v2(0, -15), v2(24, 24));
      const glyph = makeText('Glyph', dot.rt, icon ? '' : lib.elementGlyph(e), 13, C(0.04, 0.05, 0.08), 'MiddleCenter', true);
      rtOf(glyph).stretch();
      const pips: Img[] = [];
      const ml = maxLevel(content.rules);
      for (let p = 0; p < ml; p++) {
        const pip = makeImage('Pip' + p, cellRt, WHITE, SF.diamond());
        pip.rt.place(v2(0.5, 0), v2((p - (ml - 1) / 2) * 10, 12), v2(8, 8));
        pips.push(pip);
      }
      const barBack = makeImage('BarBack', cellRt, C(1, 1, 1, 0.1), SF.roundedRect(4), true);
      barBack.rt.place(v2(0.5, 0), v2(0, 4), v2(cw - 18, 4));
      const bar = makeImage('Bar', barBack.rt, lib.elementColor(e), SF.roundedRect(4), true);
      bar.rt.anchorMin = v2(0, 0); bar.rt.anchorMax = v2(0.001, 1); bar.rt.offsetMin = v2(0, 0); bar.rt.offsetMax = v2(0, 0);
      this.cells.push({ element: e, dot, glyph, pips, bar, rt: cellRt });
    });
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  render(field: FieldState) {
    const R = this.content.rules;
    const mode = fieldMode(this.content, field);
    const info = fieldInfoOfMode(this.content, mode);
    this.name.text = info.name;
    this.badge.text = info.badge;
    const theme = this.lib.fieldTheme(field);
    this.name.color = mode.type === FieldModeType.Neutral ? WHITE : lerpColor(theme.bright, WHITE, 0.45);
    const two = mode.type === FieldModeType.Hybrid || mode.type === FieldModeType.Unstable;
    const a = mode.type !== FieldModeType.Neutral ? this.lib.elementIcon(mode.top) : null;
    const b = two ? this.lib.elementIcon(mode.second) : null;
    this.iconA.rt.setActive(!!a); if (a) this.iconA.sprite = a;
    this.iconB.rt.setActive(two && !!b); if (b) this.iconB.sprite = b;
    if (!a) {
      rtOf(this.glyph).setActive(true);
      this.glyph.text = mode.type === FieldModeType.Neutral ? '◆' : two ? this.lib.elementGlyph(mode.top) + this.lib.elementGlyph(mode.second) : this.lib.elementGlyph(mode.top);
      this.glyph.color = mode.type === FieldModeType.Neutral ? C(0.7, 0.78, 0.9) : this.lib.elementColor(mode.top);
    } else rtOf(this.glyph).setActive(false);
    for (const c of this.cells) {
      const v = field.get(c.element);
      const lv = level(R, v);
      c.pips.forEach((p, i) => (p.color = i < lv ? this.lib.elementColor(c.element) : C(1, 1, 1, 0.14)));
      c.bar.rt.anchorMax = v2(Math.max(0.001, Math.max(0, Math.min(1, v / R.fieldMax))), 1);
      c.rt.groupAlpha = v > 0 ? 1 : 0.4;
      const s = modeInPair(mode, c.element) && mode.type !== FieldModeType.Neutral ? 1.12 : 1;
      c.rt.setScale(s, s);
    }
  }
  pulse(color: Color) { this.flashColor = color; this.flashT = 0; }
  private update(dt: number) {
    if (this.flashT >= 1) return;
    this.flashT = Math.min(1, this.flashT + dt / 0.9);
    this.flash.color = C(this.flashColor.r, this.flashColor.g, this.flashColor.b, (1 - this.flashT) * 0.8 * VFX.fieldChange);
    const s = 1 + 0.06 * Math.sin(this.flashT * Math.PI);
    this.rt.setScale(s, s);
  }
}

// ============================================================================ InvestPanel
export class InvestPanel {
  static readonly PanelSize = v2(292, 132);
  static readonly MaxChips = 5;
  readonly rt: RT;
  onExtraChosen: ((x: number) => void)[] = [];
  private outline: Img; private pointer: Img; private title: Txt; private icon: Img; private costLine: RichTxt; private fieldLine: RichTxt;
  readonly chips: Button[] = [];
  private chipRow: RT;
  private showT = 1;

  constructor(parent: RT, private lib: VisualLibrary) {
    this.rt = rect('InvestPanel', parent);
    this.rt.sizeDelta = InvestPanel.PanelSize;
    const th = THEME;
    this.pointer = makeImage('Pointer', this.rt, C(1, 1, 1, 1), SF.diamond());
    this.pointer.rt.place(v2(0, 0.5), v2(-2, 0), v2(26, 26));
    makeFrame('Bg', this.rt, true, 0.97).rt.stretch();
    this.outline = makeImage('Outline', this.rt, C(1, 1, 1, 0.2), SF.softFrame(14, 18), true);
    this.outline.rt.stretch(-18, -18, -18, -18);
    this.outline.rt.setAsFirstSibling();
    this.title = makeText('Title', this.rt, 'MP 투자', 16, lib.gold, 'MiddleLeft', true);
    rtOf(this.title).place(v2(0, 1), v2(18, -21), v2(110, 22), v2(0, 0.5));
    this.icon = makeImage('Icon', this.rt, WHITE, SF.circle(64));
    this.icon.rt.place(v2(0, 0), v2(26, 22), v2(18, 18));
    this.chipRow = rect('Chips', this.rt).place(v2(0.5, 1), v2(0, -58), v2(InvestPanel.PanelSize.x - 28, 36));
    for (let i = 0; i < InvestPanel.MaxChips; i++) {
      const b = makeButton('Invest' + i, this.chipRow, i === 0 ? '0' : '+' + i, () => this.onExtraChosen.forEach(f => f(i)), C(1, 1, 1, 0.08), 17);
      buttonFx(b, { hoverScale: 1.1 });
      this.chips.push(b);
    }
    this.costLine = makeRich('Cost', this.rt, '', 16, th.textColor, 'MiddleRight', true);
    rtOf(this.costLine).place(v2(1, 1), v2(-18, -21), v2(160, 22), v2(1, 0.5));
    this.fieldLine = makeRich('Field', this.rt, '', 16, MANA_COLOR, 'MiddleLeft', true);
    rtOf(this.fieldLine).place(v2(0, 0), v2(42, 22), v2(InvestPanel.PanelSize.x - 56, 22), v2(0, 0.5));
    this.hide();
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  get visible() { return this.rt.blocksRaycasts; }
  hide() { this.showT = 1; this.rt.groupAlpha = 0; this.rt.blocksRaycasts = false; }

  show(card: CardDef, terms: PlayTerms, extra: number, mp: number) {
    if (this.rt.groupAlpha < 0.5) this.showT = 0;
    this.rt.groupAlpha = Math.max(this.rt.groupAlpha, 0.01);
    this.rt.blocksRaycasts = true;
    const ec = this.lib.elementColor(card.element);
    this.outline.color = C(ec.r, ec.g, ec.b, 0.45);
    this.pointer.color = lerpColor(ec, this.lib.gold, 0.4);
    const icon = this.lib.elementIcon(card.element);
    this.icon.sprite = icon ?? SF.circle(64);
    this.icon.color = icon ? WHITE : ec;
    const maxAffordable = terms.maxAffordableExtra(mp);
    const shown = terms.investAllowed ? Math.min(terms.maxExtra, InvestPanel.MaxChips - 1) + 1 : 0;
    const chipW = shown > 0 ? Math.min(58, (InvestPanel.PanelSize.x - 28 - (shown - 1) * 8) / shown) : 0;
    const total = shown * chipW + Math.max(0, shown - 1) * 8;
    this.chips.forEach((b, i) => {
      const vis = i < shown;
      b.rt.setActive(vis);
      if (!vis) return;
      b.rt.place(v2(0.5, 0.5), v2(-total / 2 + chipW / 2 + i * (chipW + 8), 0), v2(chipW, 34));
      const affordable = i <= maxAffordable, selected = i === extra;
      b.interactable = affordable;
      b.img.color = selected ? C(ec.r * 0.8 + 0.1, ec.g * 0.8 + 0.1, ec.b * 0.8 + 0.1, 1) : affordable ? C(1, 1, 1, 0.1) : C(1, 1, 1, 0.03);
      b.label!.color = selected ? C(0.03, 0.04, 0.07) : affordable ? WHITE : C(1, 1, 1, 0.25);
    });
    const totalCost = terms.totalCost(extra);
    this.costLine.text = `사용 ${colorize(totalCost + ' MP', C(0.6, 0.75, 1))}`;
    const R = this.lib.content.rules;
    const win = terms.gainFor(R, MatchupStanding.Win, extra), neutral = terms.gainFor(R, MatchupStanding.Neutral, extra), lose = terms.gainFor(R, MatchupStanding.Lose, extra);
    const muted = C(0.62, 0.66, 0.74);
    this.fieldLine.color = lerpColor(ec, WHITE, 0.35);
    this.fieldLine.text = `${colorize('승', muted)} +${win}  ${colorize('/ 무', muted)} +${neutral}  ${colorize('/ 패', muted)} +${lose}`;
    this.title.text = terms.investAllowed ? 'MP 투자' : '투자 불가';
    this.chipRow.setActive(terms.investAllowed);
  }

  private update(dt: number) {
    if (this.showT >= 1) return;
    this.showT = Math.min(1, this.showT + dt / 0.22);
    const e = 1 - (1 - this.showT) * (1 - this.showT);
    const s = 0.85 + 0.15 * e;
    this.rt.setScale(s, s);
    this.rt.groupAlpha = e;
  }
}

// ============================================================================ ActionBar (fantasy submit button)
export class ActionBar {
  static readonly PanelSize = v2(330, 150);
  readonly rt: RT;
  onPrimary: (() => void)[] = []; onSecondary: (() => void)[] = [];
  private status: Txt; readonly primary: Button; readonly secondary: Button; private primaryGlow: Img; private shine: Img; private runeL: Img; private runeR: Img;
  private waiting: RT; private waitingRing: Img;
  private emphasize = false; private enabled = false; private t = 0; private flashT = 1;

  constructor(parent: RT, private lib: VisualLibrary) {
    this.rt = rect('ActionBar', parent);
    this.rt.sizeDelta = ActionBar.PanelSize;
    const th = THEME, size = v2(300, 80);
    this.status = makeText('Status', this.rt, '', 18, th.textColor, 'MiddleCenter', true).shadowed(0.9);
    rtOf(this.status).place(v2(0.5, 1), v2(0, -10), v2(ActionBar.PanelSize.x, 26));
    this.status.wrap = false;
    this.waiting = rect('Waiting', this.rt).place(v2(0.5, 1), v2(-ActionBar.PanelSize.x / 2 + 26, -10), v2(22, 22));
    this.waitingRing = makeImage('Ring', this.waiting, C(1, 1, 1, 0.8), SF.dashedRing(8));
    this.waitingRing.rt.stretch();
    this.waiting.setActive(false);
    this.primaryGlow = makeImage('PrimaryGlow', this.rt, C(1, 1, 1, 0), SF.softFrame(20, 30), true);
    this.primaryGlow.rt.place(v2(0.5, 0), v2(0, 44 - 30), v2(size.x + 60, size.y + 60), v2(0.5, 0));
    const img = makeImage('Primary', this.rt, WHITE, SF.actionButton(), true, true);
    img.rt.place(v2(0.5, 0), v2(0, 44), size, v2(0.5, 0));
    this.primary = new Button(img);
    this.primary.colorTint = false;
    this.primary.onClick(() => { this.flashT = 0; this.onPrimary.forEach(f => f()); });
    // light sweep clipped to the button: drawn as a thin beam inside the button rect
    this.shine = makeImage('Shine', img.rt, C(1, 1, 1, 0), SF.beam());
    this.shine.rt.place(v2(0.5, 0.5), v2(0, 0), v2(46, 70));
    this.shine.rt.rotation = -25;
    this.runeL = makeImage('RuneL', img.rt, C(1, 0.9, 0.6, 0.9), SF.diamond());
    this.runeL.rt.place(v2(0, 0.5), v2(36, 0), v2(12, 12));
    this.runeR = makeImage('RuneR', img.rt, C(1, 0.9, 0.6, 0.9), SF.diamond());
    this.runeR.rt.place(v2(1, 0.5), v2(-36, 0), v2(12, 12));
    const label = makeText('Label', img.rt, '카드 제출', 28, C(1, 0.96, 0.86), 'MiddleCenter', true).shadowed(0.9);
    rtOf(label).stretch(50, 50, 2, 4);
    label.wrap = false;
    this.primary.label = label;
    buttonFx(this.primary, { glow: this.primaryGlow });
    this.secondary = makeButton('Secondary', this.rt, '선택 취소', () => this.onSecondary.forEach(f => f()), C(1, 1, 1, 0), 16);
    this.secondary.rt.place(v2(0.5, 0), v2(0, 2), v2(220, 36), v2(0.5, 0));
    this.secondary.label!.color = C(0.78, 0.8, 0.86, 0.8);
    buttonFx(this.secondary);
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }

  render(status: string, statusColor: Color, primary: string | null, primaryEnabled: boolean, secondary: string | null, secondaryEnabled: boolean, emphasize = false) {
    this.status.text = status ?? '';
    this.status.color = statusColor;
    const waiting = (status ?? '').includes('대기');
    this.waiting.setActive(waiting);
    this.waitingRing.color = C(statusColor.r, statusColor.g, statusColor.b, 0.9);
    this.primary.rt.setActive(!!primary);
    this.primary.setLabel(primary ?? '');
    this.primary.interactable = primaryEnabled;
    this.enabled = primaryEnabled;
    this.primary.img.color = primaryEnabled ? WHITE : C(0.42, 0.42, 0.5, 0.85);
    this.primary.label!.color = primaryEnabled ? C(1, 0.96, 0.86) : C(0.75, 0.75, 0.8, 0.6);
    this.runeL.rt.setActive(primaryEnabled); this.runeR.rt.setActive(primaryEnabled);
    this.secondary.rt.setActive(!!secondary);
    this.secondary.setLabel(secondary ?? '');
    this.secondary.interactable = secondaryEnabled;
    this.emphasize = emphasize && primaryEnabled && !!primary;
    this.primaryGlow.rt.setActive(this.primary.rt.active);
  }

  private update(dt: number) {
    this.t += dt;
    const K = VFX.submit;
    let a = this.emphasize ? 0.32 + 0.18 * Math.sin(this.t * 4) : 0;
    if (this.flashT < 1) { this.flashT = Math.min(1, this.flashT + dt / 0.4); a = Math.max(a, 1 - this.flashT); }
    const c = lerpColor(C(0.6, 0.45, 1), this.lib.gold, 0.35 + 0.25 * Math.sin(this.t * 1.7));
    this.primaryGlow.color = C(c.r, c.g, c.b, lerp(this.primaryGlow.color.a, a * K, 0.2));
    const sweep = (this.t * 0.45) % 1;
    this.shine.rt.anchoredPosition = v2(-110 + 220 * sweep, 0);
    this.shine.color = C(1, 1, 1, this.enabled ? 0.22 * Math.sin(sweep * Math.PI) * K : 0);
    const r = 0.8 + 0.2 * Math.sin(this.t * 5);
    this.runeL.rt.rotation = this.t * 90; this.runeR.rt.rotation = -this.t * 90;
    this.runeL.rt.setScale(r, r); this.runeR.rt.setScale(r, r);
    if (this.waiting.active) this.waiting.rotation = -this.t * 160;
  }
}

// ============================================================================ MatchupHint (hover only)
export class MatchupHint {
  static readonly PanelSize = v2(320, 104);
  readonly rt: RT;
  private dot: Img; private dotGlyph: Txt; private header: Txt; private body: RichTxt;
  showIdentity = true;
  constructor(parent: RT, private lib: VisualLibrary) {
    this.rt = rect('MatchupHint', parent);
    this.rt.sizeDelta = MatchupHint.PanelSize;
    this.rt.blocksRaycasts = false;
    makeFrame('Bg', this.rt, true, 0.94).rt.stretch();
    this.dot = makeImage('Dot', this.rt, WHITE, SF.circle(64));
    this.dot.rt.place(v2(0, 1), v2(30, -26), v2(30, 30));
    this.dotGlyph = makeText('Glyph', this.dot.rt, '', 15, C(0.04, 0.05, 0.08), 'MiddleCenter', true);
    rtOf(this.dotGlyph).stretch();
    this.header = makeText('Header', this.rt, '', 18, WHITE, 'MiddleLeft', true);
    rtOf(this.header).place(v2(0, 1), v2(54, -26), v2(250, 28), v2(0, 0.5));
    this.body = makeRich('Body', this.rt, '', 16, C(0.82, 0.86, 0.92), 'UpperLeft');
    rtOf(this.body).stretch(16, 12, 46, 8);
    this.body.lineSpacing = 1.05;
    this.showIdle();
  }
  private names(els: Element[]) { return els.map(e => colorize(this.lib.elementLabel(e), this.lib.elementColor(e))).join(' '); }
  showIdle() { this.rt.groupAlpha = 0; }
  show(card: CardDef, stats: CombatStats | null) {
    const content = this.lib.content, th = THEME;
    this.rt.groupAlpha = 1;
    const icon = this.lib.elementIcon(card.element);
    this.dot.sprite = icon ?? SF.circle(64);
    this.dot.color = icon ? WHITE : this.lib.elementColor(card.element);
    this.dotGlyph.text = icon ? '' : this.lib.elementGlyph(card.element);
    this.header.text = card.name;
    const lines: string[] = [];
    if (card.isPass || !content.isFieldElement(card.element)) lines.push(card.isPass ? '턴 넘김' : '상성 없음 (미확정 속성)');
    else {
      const strong = strongAgainst(content, card.element), weak = weakAgainst(content, card.element);
      lines.push(colorize('이김 ', th.positiveColor) + (strong.length ? this.names(strong) : '-') + '   ' + colorize('짐 ', th.negativeColor) + (weak.length ? this.names(weak) : '-'));
    }
    const id = content.getElement(card.element)?.identity;
    if (id && id.summary && this.showIdentity) {
      const parts = id.summary.split('·');
      lines.push(colorize(parts[0].trim() + ' 속성', th.accentColor) + colorize(id.summary.includes('·') ? ' ·' + id.summary.substring(id.summary.indexOf('·') + 1) : '', th.mutedTextColor));
    }
    const m = stats?.mods.find(modFromField);
    if (m) lines.push(colorize(`${m.label} ${sdDescribe(m.delta)}`, modIsNegative(m) ? th.negativeColor : th.positiveColor));
    else if (card.element === content.rules.lightElement || card.element === content.rules.darkElement) lines.push(colorize('빛 vs 어둠: 특수 판정', th.accentColor));
    this.body.text = lines.join('\n');
  }
}

// ============================================================================ Banner / ResultStrip / BattleLog / Floating text
export class BannerView {
  readonly rt: RT;
  private band: Img; private lineTop: Img; private lineBottom: Img; private title: Txt; private sub: Txt;
  private co = new CoOwner();
  constructor(parent: RT) {
    this.rt = rect('Banner', parent).place(v2(0.5, 0.5), v2(0, LAYOUT.bannerY), v2(900, 104));
    this.rt.blocksRaycasts = false;
    this.band = makeImage('Band', this.rt, C(0.01, 0.015, 0.03, 0.85), SF.hBand());
    this.band.rt.stretch();
    this.lineTop = makeImage('LineTop', this.rt, WHITE, SF.hBand());
    this.lineTop.rt.anchorMin = v2(0, 1); this.lineTop.rt.anchorMax = v2(1, 1); this.lineTop.rt.offsetMin = v2(80, -2); this.lineTop.rt.offsetMax = v2(-80, 0);
    this.lineBottom = makeImage('LineBottom', this.rt, WHITE, SF.hBand());
    this.lineBottom.rt.anchorMin = v2(0, 0); this.lineBottom.rt.anchorMax = v2(1, 0); this.lineBottom.rt.offsetMin = v2(80, 0); this.lineBottom.rt.offsetMax = v2(-80, 2);
    this.title = makeText('Title', this.rt, '', 40, WHITE, 'MiddleCenter', true).shadowed(0.9);
    rtOf(this.title).stretch(20, 20, 8, 42);
    this.sub = makeText('Sub', this.rt, '', 20, C(0.8, 0.84, 0.9), 'MiddleCenter', true);
    rtOf(this.sub).stretch(20, 20, 62, 10);
    this.rt.groupAlpha = 0;
  }
  show(title: string, subtitle: string, accent: Color, duration = 1.6) {
    this.co.stopAll();
    this.title.text = title;
    this.sub.text = subtitle ?? '';
    rtOf(this.title).offsetMin = v2(20, subtitle ? 42 : 8);
    this.lineTop.color = C(accent.r, accent.g, accent.b, 0.9);
    this.lineBottom.color = C(accent.r, accent.g, accent.b, 0.9);
    this.title.color = lerpColor(WHITE, accent, 0.3);
    this.co.start(co => this.run(co, duration));
  }
  private async run(co: Co, duration: number) {
    for (let t = 0; t < 0.16; t += Time.dt) {
      const k = t / 0.16;
      this.rt.groupAlpha = k;
      this.rt.setScale(0.85 + 0.15 * k, 1);
      await co.frame();
    }
    this.rt.groupAlpha = 1;
    this.rt.setScale(1, 1);
    await co.wait(Math.max(0.1, duration - 0.4));
    for (let t = 0; t < 0.24; t += Time.dt) { this.rt.groupAlpha = 1 - t / 0.24; await co.frame(); }
    this.rt.groupAlpha = 0;
  }
  hide() { this.co.stopAll(); this.rt.groupAlpha = 0; }
}

export class ResultStrip {
  readonly rt: RT;
  private text: RichTxt; private sub: Txt;
  constructor(parent: RT) {
    this.rt = rect('ResultStrip', parent).place(v2(0.5, 0.5), v2(0, LAYOUT.bannerY), v2(760, 92));
    this.rt.blocksRaycasts = false;
    makeImage('Band', this.rt, C(0.01, 0.015, 0.03, 0.7), SF.hBand()).rt.stretch();
    this.text = makeRich('Text', this.rt, '', 30, WHITE, 'MiddleCenter', true).shadowed(0.9);
    rtOf(this.text).stretch(20, 20, 8, 38);
    this.sub = makeText('Sub', this.rt, '', 18, C(0.78, 0.82, 0.88), 'MiddleCenter', true);
    rtOf(this.sub).stretch(20, 20, 56, 8);
    this.rt.groupAlpha = 0;
  }
  show(text: string, sub: string) { this.text.text = text; this.sub.text = sub ?? ''; this.rt.groupAlpha = 1; }
  hide() { this.rt.groupAlpha = 0; }
}

export class BattleLog {
  static readonly PanelSize = v2(330, 66);
  readonly rt: RT;
  private lines: string[] = [];
  private text: RichTxt;
  private fresh = 0;
  constructor(parent: RT) {
    this.rt = rect('BattleLog', parent);
    this.rt.sizeDelta = BattleLog.PanelSize;
    this.rt.blocksRaycasts = false;
    this.text = makeRich('Text', this.rt, '', 13, C(0.78, 0.8, 0.86, 0.62), 'UpperLeft').shadowed(0.9);
    rtOf(this.text).stretch();
    this.text.lineSpacing = 1.15;
    addUpdate({ rt: this.rt, update: dt => this.update(dt) });
  }
  clear() { this.lines = []; this.text.text = ''; }
  add(rich: string) {
    this.lines.unshift(rich);
    while (this.lines.length > 3) this.lines.pop();
    this.text.text = this.lines.join('\n');
    this.fresh = 1;
  }
  private update(dt: number) {
    if (this.fresh <= 0) return;
    this.fresh = Math.max(0, this.fresh - dt * 0.6);
    this.text.color = C(0.78, 0.8, 0.86, 0.62 + 0.33 * this.fresh);
  }
}

export class FloatingTextLayer {
  readonly rt: RT;
  private co = new CoOwner();
  constructor(parent: RT) {
    this.rt = rect('FloatingText', parent).stretch();
    this.rt.blocksRaycasts = false;
  }
  spawn(anchor: RT, offset: V2, text: string, color: Color, size = 52, duration = 1.2) {
    const t = makeText('Pop', this.rt, text, size, color, 'MiddleCenter', true).outlined(0.8);
    t.wrap = false;
    const r = rtOf(t);
    r.sizeDelta = v2(420, 90);
    r.anchorMin = v2(0.5, 0.5); r.anchorMax = v2(0.5, 0.5);
    r.setWorldPosition(anchor.worldPosition());
    const start = { x: r.anchoredPosition.x + offset.x, y: r.anchoredPosition.y + offset.y };
    r.anchoredPosition = start;
    this.co.start(async co => {
      for (let time = 0; time < duration; time += Time.dt) {
        const k = time / duration;
        const pop = k < 0.15 ? lerp(0.6, 1.2, k / 0.15) : lerp(1.2, 1, Math.min(1, (k - 0.15) / 0.2));
        r.setScale(pop, pop);
        r.anchoredPosition = v2(start.x, start.y + 70 * k);
        t.color = C(color.r, color.g, color.b, k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
        await co.frame();
      }
      r.destroy();
    });
  }
}
