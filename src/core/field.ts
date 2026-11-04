// Port of Field/FieldSystem.cs
import { GameContent } from './content';
import { relation } from './element';
import {
  Element, FIELD_ORDER, HybridDef, HybridTarget, Modifier, ModifierKind, mod, modIsNegative, PlayerSlot, RuleSet,
  sdDescribe, sdIsZero, sdScaled, TestRuleOptions,
} from './types';

export class FieldState {
  values: number[];
  constructor(values?: number[]) {
    this.values = values ? [...values] : FIELD_ORDER.map(() => 0);
  }
  static indexOf(e: Element) {
    return FIELD_ORDER.indexOf(e);
  }
  get(e: Element): number {
    const i = FieldState.indexOf(e);
    return i < 0 ? 0 : this.values[i];
  }
  set(e: Element, v: number) {
    const i = FieldState.indexOf(e);
    if (i >= 0) this.values[i] = v;
  }
  get total() {
    return this.values.reduce((a, b) => a + b, 0);
  }
  clone() {
    return new FieldState(this.values);
  }
  sameAs(o: FieldState | null | undefined) {
    return !!o && this.values.every((v, i) => v === o.values[i]);
  }
  toString() {
    return FIELD_ORDER.map((e, i) => `${Element[e]}:${this.values[i]}`).join(', ');
  }
}

export enum FieldModeType { Neutral = 0, Dominant = 1, Hybrid = 2, Unstable = 3 }

export interface FieldMode { type: FieldModeType; top: Element; second: Element; hybrid?: HybridDef }

export function modeInPair(m: FieldMode, e: Element) {
  if (m.type === FieldModeType.Neutral) return false;
  if (m.type === FieldModeType.Dominant) return e === m.top;
  return e === m.top || e === m.second;
}

export function modeKey(m: FieldMode) {
  switch (m.type) {
    case FieldModeType.Dominant: return Element[m.top];
    case FieldModeType.Hybrid: return m.hybrid ? m.hybrid.id : 'hybrid';
    case FieldModeType.Unstable: return 'unstable';
    default: return 'neutral';
  }
}

export interface FieldInfo { name: string; badge: string; description: string; mode: FieldMode }
export interface FieldEffectInfo { title: string; text: string; negative: boolean; source: Element }
export interface FieldGain { element: Element; amount: number; source: PlayerSlot }

export function level(rules: RuleSet, value: number): number {
  let lv = 0;
  for (const t of rules.fieldLevels) if (value >= t) lv++;
  return lv;
}

export function fieldMode(content: GameContent, field: FieldState): FieldMode {
  const R = content.rules;
  // LINQ OrderByDescending is stable: ties keep FIELD_ORDER order (Array.sort is stable too)
  const sorted = FIELD_ORDER.map((e, i) => ({ e, v: field.values[i] })).sort((x, y) => y.v - x.v);
  const a = sorted[0], b = sorted[1];
  if (a.v < R.fieldLevels[0]) return { type: FieldModeType.Neutral, top: Element.None, second: Element.None };
  if (a.v - b.v >= R.dominantGap) return { type: FieldModeType.Dominant, top: a.e, second: Element.None };
  const hybrid = content.findHybrid(a.e, b.e);
  if (a.v + b.v >= R.hybridSum && hybrid) return { type: FieldModeType.Hybrid, top: a.e, second: b.e, hybrid };
  return { type: FieldModeType.Unstable, top: a.e, second: b.e };
}

export function fieldInfoOfMode(content: GameContent, mode: FieldMode): FieldInfo {
  const R = content.rules;
  switch (mode.type) {
    case FieldModeType.Dominant: {
      const el = content.getElement(mode.top);
      return { name: el?.fieldName ?? '', badge: el?.fieldBadge ?? '', description: el?.fieldDesc ?? '', mode };
    }
    case FieldModeType.Hybrid:
      return { name: mode.hybrid!.name, badge: mode.hybrid!.badge, description: mode.hybrid!.description, mode };
    case FieldModeType.Unstable:
      return { name: R.unstableFieldName, badge: R.unstableFieldBadge, description: R.unstableFieldDesc, mode };
    default:
      return { name: R.neutralFieldName, badge: R.neutralFieldBadge, description: R.neutralFieldDesc, mode };
  }
}

export const fieldInfo = (content: GameContent, field: FieldState) => fieldInfoOfMode(content, fieldMode(content, field));

function hybridTargets(h: HybridDef, e: Element, mode: FieldMode) {
  switch (h.target) {
    case HybridTarget.All: return true;
    case HybridTarget.Pair: return modeInPair(mode, e);
    default: return h.targetElements.includes(e);
  }
}

/** Field modifiers applied to a card (resonance, suppression, hybrid, unstable, identity dominance). */
export function fieldModifiers(content: GameContent, card: { isPass: boolean; element: Element }, field: FieldState, opts: TestRuleOptions): Modifier[] {
  let mods: Modifier[] = [];
  if (card.isPass || !content.isFieldElement(card.element)) return mods;
  const R = content.rules;
  const mode = fieldMode(content, field);
  const el = content.getElement(card.element);
  const lv = level(R, field.get(card.element));

  if (opts.resonance && lv > 0 && el && el.hasResonance)
    mods.push(mod(ModifierKind.Field, `${el.label} 공명 Lv${lv}`, sdScaled(el.resonance, lv)));

  if (opts.suppression && mode.type === FieldModeType.Dominant && relation(content, mode.top, card.element) > 0)
    mods.push(mod(ModifierKind.Field, `${content.label(mode.top)} 우세 억제`, R.suppression));

  if (opts.hybrid && mode.type === FieldModeType.Hybrid && hybridTargets(mode.hybrid!, card.element, mode))
    mods.push(mod(ModifierKind.Field, mode.hybrid!.name, mode.hybrid!.effect));

  if (opts.unstable && mode.type === FieldModeType.Unstable && modeInPair(mode, card.element))
    mods.push(mod(ModifierKind.Field, R.unstableFieldName, R.unstableEffect));

  if (opts.elementIdentity && mode.type === FieldModeType.Dominant) {
    const dom = content.getElement(mode.top)?.identity;
    if (dom) {
      const delta = card.element === mode.top ? dom.dominantSelf : dom.dominantOthers;
      if (!sdIsZero(delta)) mods.push(mod(ModifierKind.Field, `${content.label(mode.top)} 지배`, delta));
    }
  }

  if (opts.elementIdentity && el && el.identity && el.identity.ignoreNegativeFieldEffects) mods = mods.filter(m => !modIsNegative(m));
  return mods;
}

export function decayFor(content: GameContent, e: Element, opts?: TestRuleOptions | null) {
  if (opts && opts.elementIdentity) {
    const id = content.getElement(e)?.identity;
    if (id && id.decayOverride >= 0) return id.decayOverride;
  }
  return content.rules.fieldDecay;
}

/** Decay every element, then apply gains (clamped 0..fieldMax). */
export function simulateField(content: GameContent, field: FieldState, gains: Iterable<FieldGain>, opts?: TestRuleOptions | null): FieldState {
  const R = content.rules;
  const next = field.clone();
  for (let i = 0; i < next.values.length; i++) next.values[i] = Math.max(0, next.values[i] - decayFor(content, FIELD_ORDER[i], opts));
  for (const g of gains) {
    if (!content.isFieldElement(g.element)) continue;
    next.set(g.element, Math.max(0, Math.min(R.fieldMax, next.get(g.element) + g.amount)));
  }
  return next;
}

export function strongestOther(field: FieldState, except: Element): Element {
  let best = Element.None, bestValue = 0;
  for (const e of FIELD_ORDER) {
    if (e === except) continue;
    if (field.get(e) > bestValue) { best = e; bestValue = field.get(e); }
  }
  return best;
}

export function activeEffects(content: GameContent, field: FieldState, opts: TestRuleOptions): FieldEffectInfo[] {
  const list: FieldEffectInfo[] = [];
  const R = content.rules;
  const mode = fieldMode(content, field);
  if (opts.resonance) {
    for (const e of FIELD_ORDER) {
      const lv = level(R, field.get(e));
      if (lv === 0) continue;
      const el = content.getElement(e);
      const text = el && el.hasResonance ? `${el.label} 카드 ${sdDescribe(sdScaled(el.resonance, lv))}` : '공명 효과 미정 (레벨만 누적)';
      list.push({ title: `${content.label(e)} 공명 Lv${lv}`, text, negative: false, source: e });
    }
  }
  if (opts.suppression && mode.type === FieldModeType.Dominant) {
    const victims = (content.getElement(mode.top)?.beats ?? []).filter(x => content.isFieldElement(x));
    if (victims.length > 0)
      list.push({ title: `${content.label(mode.top)} 우세 억제`, text: `${victims.map(v => content.label(v)).join('·')} 카드 ${sdDescribe(R.suppression)}`, negative: true, source: mode.top });
  }
  if (opts.hybrid && mode.type === FieldModeType.Hybrid) list.push({ title: mode.hybrid!.name, text: mode.hybrid!.effectText, negative: false, source: mode.top });
  if (opts.unstable && mode.type === FieldModeType.Unstable) list.push({ title: R.unstableFieldName, text: R.unstableEffectText, negative: false, source: mode.top });
  if (opts.elementIdentity && mode.type === FieldModeType.Dominant) {
    const dom = content.getElement(mode.top)?.identity;
    if (dom && dom.dominantText)
      list.push({ title: `${content.label(mode.top)} 지배`, text: dom.dominantText, source: mode.top, negative: sdIsZero(dom.dominantSelf) && !sdIsZero(dom.dominantOthers) });
  }
  return list;
}
