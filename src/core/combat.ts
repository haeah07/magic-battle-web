// Port of Battle/CombatCalculator.cs + Battle/CardPower.cs
import { GameContent } from './content';
import { isLightDark, relation } from './element';
import { FieldState, fieldModifiers, level } from './field';
import {
  CardDef, CombatStats, investGainPerMp, investMaxExtra, MatchupStanding, Modifier, ModifierKind, mod, modFromField,
  RuleSet, scaleBaseGain, sdIsZero, sdPowerScore, sdScaled, TestRuleOptions, TraitCondition, TraitDef, traitDependsOnField, traitIsAlways,
} from './types';

/** How much a card costs and how much field it can build (incl. MP investment). */
export class PlayTerms {
  baseCost = 0;
  cost = 0;
  investAllowed = false;
  gainPerMp = 0;
  maxExtra = 0;
  baseGain = 0;
  fieldGainBonus = 0;

  clampExtra(extraMp: number) { return this.investAllowed ? Math.max(0, Math.min(extraMp, this.maxExtra)) : 0; }
  totalCost(extraMp: number) { return this.cost + this.clampExtra(extraMp); }
  investGain(extraMp: number) { return this.clampExtra(extraMp) * this.gainPerMp; }
  maxAffordableExtra(mp: number) { return this.investAllowed ? Math.max(0, Math.min(this.maxExtra, mp - this.cost)) : 0; }
  affordable(mp: number) { return this.cost <= mp; }
  get gainWithoutInvest() { return Math.max(0, this.baseGain + this.fieldGainBonus); }
  gainWith(extraMp: number) { return Math.max(0, this.baseGain + this.fieldGainBonus + this.investGain(extraMp)); }
  scaledBase(rules: RuleSet, standing: MatchupStanding) { return scaleBaseGain(rules, this.baseGain, standing); }
  /** final field gain = base × result multiplier + other bonuses + investment (investment is never scaled) */
  gainFor(rules: RuleSet, standing: MatchupStanding, extraMp: number) {
    return Math.max(0, this.scaledBase(rules, standing) + this.fieldGainBonus + this.investGain(extraMp));
  }
}

export function identityModifiers(content: GameContent, card: CardDef, opts: TestRuleOptions): Modifier[] {
  const mods: Modifier[] = [];
  if (!opts.elementIdentity || card.isPass) return mods;
  const id = content.getElement(card.element)?.identity;
  if (!id) return mods;
  if (id.investGainBonus !== 0) mods.push(mod(ModifierKind.Identity, `${content.label(card.element)} 성향`, { atk: 0, def: 0, pierce: 0, gain: 0, cost: 0, investGain: id.investGainBonus, investMax: 0 }));
  return mods;
}

export function termsFromMods(content: GameContent, card: CardDef, mods: Modifier[]): PlayTerms {
  const R = content.rules;
  const t = new PlayTerms();
  t.baseCost = card.baseCost;
  t.baseGain = content.isFieldElement(card.element) ? card.baseFieldGain : 0;
  let costDelta = 0, investGain = 0, investMax = 0, gain = 0;
  for (const m of mods) {
    costDelta += m.delta.cost;
    investGain += m.delta.investGain;
    investMax += m.delta.investMax;
    gain += m.delta.gain;
  }
  t.cost = card.isPass ? 0 : Math.max(Math.min(R.minCardCost, card.baseCost), card.baseCost + costDelta);
  const inv = card.invest;
  t.investAllowed = !card.isPass && R.investmentEnabled && !!inv && inv.allowed && t.baseGain > 0;
  t.gainPerMp = t.investAllowed ? Math.max(0, investGainPerMp(inv, R) + investGain) : 0;
  t.maxExtra = t.investAllowed ? Math.max(0, investMaxExtra(inv, R) + investMax) : 0;
  if (t.maxExtra === 0) t.investAllowed = false;
  t.fieldGainBonus = gain;
  return t;
}

export const terms = (content: GameContent, card: CardDef, field: FieldState, opts: TestRuleOptions) =>
  termsFromMods(content, card, previewModifiers(content, card, field, opts));

export function matchupStatModifier(content: GameContent, card: CardDef, opp: CardDef, opts: TestRuleOptions): Modifier | null {
  if (!opts.matchupStatBonus || isLightDark(content, card.element, opp.element)) return null;
  const rel = relation(content, card.element, opp.element);
  if (rel > 0) return mod(ModifierKind.MatchupStat, `상성 보정 ${content.label(card.element)}▶${content.label(opp.element)}`, content.rules.matchupAdvantageBonus);
  if (rel < 0) return mod(ModifierKind.MatchupStat, `상성 보정 ${content.label(card.element)}◀${content.label(opp.element)}`, content.rules.matchupDisadvantageBonus);
  return null;
}

export function traitApplies(content: GameContent | null, t: TraitDef, opp: CardDef | null, field: FieldState | null): boolean {
  if (sdIsZero(t.combatBonus)) return false;
  switch (t.condition) {
    case TraitCondition.Always: return true;
    case TraitCondition.OpponentElementIs: return !!opp && opp.element === t.conditionElement;
    case TraitCondition.OpponentBaseDefAtMost: return !!opp && opp.def <= t.conditionValue;
    case TraitCondition.OpponentBaseDefAtLeast: return !!opp && opp.def >= t.conditionValue;
    case TraitCondition.FieldLevelAtLeast:
      return !!content && !!field && level(content.rules, field.get(t.conditionElement)) >= Math.max(1, t.conditionValue);
    default: return false;
  }
}

function traitMod(content: GameContent, t: TraitDef, field: FieldState): Modifier {
  let delta = t.combatBonus;
  const label = t.combatLabel ? t.combatLabel : t.label;
  if (t.condition === TraitCondition.FieldLevelAtLeast) {
    const lv = level(content.rules, field.get(t.conditionElement));
    if (t.scalesWithFieldLevel) delta = sdScaled(delta, lv);
    return mod(ModifierKind.FieldTrait, `${label} (Lv${lv})`, delta);
  }
  return mod(ModifierKind.Trait, label, delta);
}

function previewModifiers(content: GameContent, card: CardDef, field: FieldState, opts: TestRuleOptions): Modifier[] {
  const mods = fieldModifiers(content, card, field, opts);
  for (const t of card.traits)
    if ((traitIsAlways(t) || traitDependsOnField(t)) && traitApplies(content, t, null, field)) mods.push(traitMod(content, t, field));
  mods.push(...identityModifiers(content, card, opts));
  return mods;
}

export function sumStats(content: GameContent, card: CardDef, mods: Modifier[], extraMp: number): CombatStats {
  const t = termsFromMods(content, card, mods);
  const s: CombatStats = { atk: card.atk, def: card.def, pierce: 0, gain: t.gainWith(extraMp), mods };
  for (const m of mods) {
    s.atk += m.delta.atk;
    s.def += m.delta.def;
    s.pierce += m.delta.pierce;
  }
  s.atk = Math.max(0, s.atk);
  s.def = Math.max(0, s.def);
  s.pierce = Math.max(0, s.pierce);
  return s;
}

/** Stats shown on a card in hand / selection (no opponent known yet). */
export const preview = (content: GameContent, card: CardDef, field: FieldState, opts: TestRuleOptions, extraMp = 0) =>
  sumStats(content, card, previewModifiers(content, card, field, opts), extraMp);

/** Stats used for the actual clash (opponent card known). */
export function combat(content: GameContent, card: CardDef, opp: CardDef, field: FieldState, opts: TestRuleOptions, extraMp = 0): CombatStats {
  const mods = fieldModifiers(content, card, field, opts);
  const matchup = matchupStatModifier(content, card, opp, opts);
  if (matchup) mods.push(matchup);
  for (const t of card.traits) if (traitApplies(content, t, opp, field)) mods.push(traitMod(content, t, field));
  mods.push(...identityModifiers(content, card, opts));
  return sumStats(content, card, mods, extraMp);
}

export const damageOf = (attacker: CombatStats, defender: CombatStats) => Math.max(0, attacker.atk - Math.max(0, defender.def - attacker.pierce));

// ---------------------------------------------------------------- CardPower (empowered / weakened display)
export enum CardPowerState { Weakened = -1, Neutral = 0, Empowered = 1 }
export const MAX_TIER = 3;
export class CardPower {
  readonly tier: number;
  constructor(tier: number) { this.tier = Math.max(-MAX_TIER, Math.min(MAX_TIER, tier)); }
  static readonly neutral = new CardPower(0);
  get state() { return this.tier > 0 ? CardPowerState.Empowered : this.tier < 0 ? CardPowerState.Weakened : CardPowerState.Neutral; }
  get level() { return Math.abs(this.tier); }
  get strength() { return this.level / MAX_TIER; }
}

export function powerFromStats(stats: CombatStats | null | undefined): CardPower {
  if (!stats) return CardPower.neutral;
  let score = 0;
  for (const m of stats.mods) if (modFromField(m)) score += sdPowerScore(m.delta);
  // C# uses float accumulation; |score| < 0.01 → neutral
  if (Math.abs(score) < 0.01) return CardPower.neutral;
  const lv = Math.ceil(Math.abs(score) - 0.001);
  return new CardPower(Math.sign(score) * lv);
}

export function evaluatePower(content: GameContent, card: CardDef | null | undefined, field: FieldState, opts: TestRuleOptions): CardPower {
  if (!card || card.isPass) return CardPower.neutral;
  return powerFromStats(preview(content, card, field, opts));
}
