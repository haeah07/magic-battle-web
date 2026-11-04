// Port of Battle/BattleResolver.cs — the single place where a round is judged.
import { combat, damageOf, termsFromMods } from './combat';
import { GameContent } from './content';
import { AttackResult, resolveAttack } from './element';
import { FieldGain, FieldInfo, fieldInfo, FieldState, simulateField, strongestOther } from './field';
import { CardDef, CombatStats, Element, fieldGainMultiplier, MatchupStanding, other, PlayerSlot, TestRuleOptions } from './types';

export interface DamageOutcome {
  result: AttackResult;
  failedP1: boolean;
  failedP2: boolean;
  rawP1ToP2: number;
  rawP2ToP1: number;
  damageToP1: number;
  damageToP2: number;
  isSpecial: boolean;
  lightSlot: PlayerSlot;
  darkSlot: PlayerSlot;
  lightDamage: number;
  selfDamage: number;
  specialTotal: number;
}
export const outcomeFailed = (o: DamageOutcome, s: PlayerSlot) => (s === PlayerSlot.P1 ? o.failedP1 : o.failedP2);
export const outcomeDamageTo = (o: DamageOutcome, s: PlayerSlot) => (s === PlayerSlot.P1 ? o.damageToP1 : o.damageToP2);
export const outcomeRawFrom = (o: DamageOutcome, s: PlayerSlot) => (s === PlayerSlot.P1 ? o.rawP1ToP2 : o.rawP2ToP1);

export interface AfterHitResult {
  gain: number;
  standing: MatchupStanding;
  multiplier: number;
  rawBaseGain: number;
  baseGain: number;
  otherGain: number;
  investGain: number;
  extraGain: number;
  extraLabel: string;
  mpTax: number;
  washout: number;
  washoutTarget: Element;
}

export interface PlayInput { card: CardDef; extraMp: number }

export interface RoundComputation {
  statsP1: CombatStats;
  statsP2: CombatStats;
  outcome: DamageOutcome;
  afterHitP1: AfterHitResult;
  afterHitP2: AfterHitResult;
  gains: FieldGain[];
  fieldBefore: FieldState;
  fieldAfter: FieldState;
  infoBefore: FieldInfo;
  infoAfter: FieldInfo;
}

export function resolveDamage(content: GameContent, c1: CardDef, s1: CombatStats, c2: CardDef, s2: CombatStats): DamageOutcome {
  const p1ToP2 = damageOf(s1, s2);
  const p2ToP1 = damageOf(s2, s1);
  const result = resolveAttack(content, c1.element, c2.element);
  const o: DamageOutcome = {
    result, failedP1: false, failedP2: false, rawP1ToP2: p1ToP2, rawP2ToP1: p2ToP1, damageToP1: 0, damageToP2: 0,
    isSpecial: false, lightSlot: PlayerSlot.P1, darkSlot: PlayerSlot.P1, lightDamage: 0, selfDamage: 0, specialTotal: 0,
  };
  if (result === AttackResult.LightDark) {
    // light vs dark: only light attacks; dark takes light's damage + its own attack as self damage
    o.isSpecial = true;
    o.lightSlot = c1.element === content.rules.lightElement ? PlayerSlot.P1 : PlayerSlot.P2;
    o.darkSlot = other(o.lightSlot);
    o.lightDamage = o.lightSlot === PlayerSlot.P1 ? p1ToP2 : p2ToP1;
    o.selfDamage = o.lightSlot === PlayerSlot.P1 ? p2ToP1 : p1ToP2;
    o.specialTotal = o.lightDamage + o.selfDamage;
    o.failedP1 = o.darkSlot === PlayerSlot.P1;
    o.failedP2 = o.darkSlot === PlayerSlot.P2;
    o.damageToP1 = o.darkSlot === PlayerSlot.P1 ? o.specialTotal : 0;
    o.damageToP2 = o.darkSlot === PlayerSlot.P2 ? o.specialTotal : 0;
    return o;
  }
  // matchup decides success: the weaker side's attack fails (0 damage), no matchup → both attack
  o.failedP1 = result === AttackResult.P2Only;
  o.failedP2 = result === AttackResult.P1Only;
  o.damageToP1 = o.failedP2 ? 0 : p2ToP1;
  o.damageToP2 = o.failedP1 ? 0 : p1ToP2;
  return o;
}

export function dealtBy(slot: PlayerSlot, o: DamageOutcome) {
  if (o.isSpecial) return o.lightSlot === slot ? o.lightDamage : 0;
  return slot === PlayerSlot.P1 ? o.damageToP2 : o.damageToP1;
}

export function standingOf(slot: PlayerSlot, o: DamageOutcome): MatchupStanding {
  switch (o.result) {
    case AttackResult.P1Only: return slot === PlayerSlot.P1 ? MatchupStanding.Win : MatchupStanding.Lose;
    case AttackResult.P2Only: return slot === PlayerSlot.P2 ? MatchupStanding.Win : MatchupStanding.Lose;
    case AttackResult.LightDark: return slot === o.lightSlot ? MatchupStanding.Win : MatchupStanding.Lose;
    default: return MatchupStanding.Neutral;
  }
}

export function afterHit(content: GameContent, opts: TestRuleOptions | null, card: CardDef, stats: CombatStats, dealt: number, extraMp: number, standing: MatchupStanding): AfterHitResult {
  const t = termsFromMods(content, card, stats.mods);
  const r: AfterHitResult = {
    gain: t.gainFor(content.rules, standing, extraMp), standing, multiplier: fieldGainMultiplier(content.rules, standing),
    rawBaseGain: t.baseGain, baseGain: t.scaledBase(content.rules, standing), otherGain: t.fieldGainBonus, investGain: t.investGain(extraMp),
    extraGain: 0, extraLabel: '', mpTax: 0, washout: 0, washoutTarget: Element.None,
  };
  if (dealt <= 0) return r;
  const identity = opts && opts.elementIdentity ? content.getElement(card.element)?.identity : undefined;
  if (identity && content.isFieldElement(card.element)) {
    if (identity.onHitFieldBonus > 0) {
      r.extraGain += identity.onHitFieldBonus;
      r.extraLabel = `${content.label(card.element)} 성향`;
    }
    if (identity.onHitMpTax > 0) r.mpTax = Math.max(r.mpTax, identity.onHitMpTax);
  }
  for (const tr of card.traits) {
    if (tr.afterHitFieldGain > 0) {
      r.extraGain += tr.afterHitFieldGain;
      r.extraLabel = r.extraLabel ? r.extraLabel + '·' + tr.label : tr.label;
    }
    if (tr.afterHitMpTax > 0) r.mpTax = Math.max(r.mpTax, tr.afterHitMpTax);
  }
  r.gain += r.extraGain;
  return r;
}

function addWashout(content: GameContent, opts: TestRuleOptions | null, field: FieldState, card: CardDef, after: AfterHitResult, slot: PlayerSlot, gains: FieldGain[]) {
  if (!opts || !opts.elementIdentity || card.isPass || !content.isFieldElement(card.element)) return;
  const id = content.getElement(card.element)?.identity;
  if (!id || id.washout <= 0) return;
  const target = strongestOther(field, card.element);
  if (target === Element.None) return;
  after.washout = id.washout;
  after.washoutTarget = target;
  gains.push({ element: target, amount: -id.washout, source: slot });
}

export function resolveRound(content: GameContent, field: FieldState, opts: TestRuleOptions, p1: PlayInput, p2: PlayInput): RoundComputation {
  const fieldBefore = field.clone();
  const infoBefore = fieldInfo(content, field);
  const statsP1 = combat(content, p1.card, p2.card, field, opts, p1.extraMp);
  const statsP2 = combat(content, p2.card, p1.card, field, opts, p2.extraMp);
  const outcome = resolveDamage(content, p1.card, statsP1, p2.card, statsP2);
  const afterHitP1 = afterHit(content, opts, p1.card, statsP1, dealtBy(PlayerSlot.P1, outcome), p1.extraMp, standingOf(PlayerSlot.P1, outcome));
  const afterHitP2 = afterHit(content, opts, p2.card, statsP2, dealtBy(PlayerSlot.P2, outcome), p2.extraMp, standingOf(PlayerSlot.P2, outcome));
  const gains: FieldGain[] = [];
  // failed attacks still build field (gain is scaled by the result multiplier, never by success)
  if (content.isFieldElement(p1.card.element) && afterHitP1.gain > 0) gains.push({ element: p1.card.element, amount: afterHitP1.gain, source: PlayerSlot.P1 });
  if (content.isFieldElement(p2.card.element) && afterHitP2.gain > 0) gains.push({ element: p2.card.element, amount: afterHitP2.gain, source: PlayerSlot.P2 });
  addWashout(content, opts, field, p1.card, afterHitP1, PlayerSlot.P1, gains);
  addWashout(content, opts, field, p2.card, afterHitP2, PlayerSlot.P2, gains);
  const fieldAfter = simulateField(content, field, gains, opts);
  return { statsP1, statsP2, outcome, afterHitP1, afterHitP2, gains, fieldBefore, fieldAfter, infoBefore, infoAfter: fieldInfo(content, fieldAfter) };
}
