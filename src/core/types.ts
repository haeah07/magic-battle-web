// Port of Unity Core/CoreTypes.cs + Core/Definitions.cs (pure data types, no Phaser).
// Enum numeric values match the C# enums so traces/seeds produce identical results.

export enum Element { Water = 0, Fire = 1, Nature = 2, Ice = 3, Rock = 4, Light = 5, Dark = 6, Unknown = 7, None = 8 }
export enum PlayerSlot { P1 = 0, P2 = 1 }

export const other = (s: PlayerSlot): PlayerSlot => (s === PlayerSlot.P1 ? PlayerSlot.P2 : PlayerSlot.P1);
export const slotLabel = (s: PlayerSlot): string => (s === PlayerSlot.P1 ? 'P1' : 'P2');

/** Field order used everywhere (field arrays, HUD cells, mode sorting ties). */
export const FIELD_ORDER: readonly Element[] = [Element.Water, Element.Fire, Element.Nature, Element.Ice, Element.Rock, Element.Light, Element.Dark];
export const BASIC_ELEMENTS: readonly Element[] = [Element.Water, Element.Fire, Element.Nature, Element.Ice, Element.Rock];
export const PASS_CARD_ID = '__pass';

// ---------------------------------------------------------------- StatDelta
export interface StatDelta { atk: number; def: number; pierce: number; gain: number; cost: number; investGain: number; investMax: number }

export const sd = (p: Partial<StatDelta> = {}): StatDelta => ({ atk: 0, def: 0, pierce: 0, gain: 0, cost: 0, investGain: 0, investMax: 0, ...p });
export const SD_ZERO: Readonly<StatDelta> = sd();
export const sdIsZero = (d: StatDelta) => !d.atk && !d.def && !d.pierce && !d.gain && !d.cost && !d.investGain && !d.investMax;
export const sdScaled = (d: StatDelta, f: number): StatDelta =>
  sd({ atk: d.atk * f, def: d.def * f, pierce: d.pierce * f, gain: d.gain * f, cost: d.cost * f, investGain: d.investGain * f, investMax: d.investMax * f });
export const sdAdd = (a: StatDelta, b: StatDelta): StatDelta =>
  sd({ atk: a.atk + b.atk, def: a.def + b.def, pierce: a.pierce + b.pierce, gain: a.gain + b.gain, cost: a.cost + b.cost, investGain: a.investGain + b.investGain, investMax: a.investMax + b.investMax });
/** C#: atk + def + pierce + gain/2 - cost + investGain/2 + investMax */
export const sdPowerScore = (d: StatDelta) => d.atk + d.def + d.pierce + d.gain / 2 - d.cost + d.investGain / 2 + d.investMax;

const signed = (v: number) => (v > 0 ? '+' + v : '-' + -v);
export function sdDescribe(d: StatDelta): string {
  const parts: string[] = [];
  if (d.atk) parts.push(`ATK ${signed(d.atk)}`);
  if (d.def) parts.push(`DEF ${signed(d.def)}`);
  if (d.pierce) parts.push(`관통 ${signed(d.pierce)}`);
  if (d.gain) parts.push(`필드 누적 ${signed(d.gain)}`);
  if (d.cost) parts.push(`MP 코스트 ${signed(d.cost)}`);
  if (d.investGain) parts.push(`투자 효율 ${signed(d.investGain)}/MP`);
  if (d.investMax) parts.push(`최대 투자 ${signed(d.investMax)}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- modifiers / stats
export enum ModifierKind { Field = 0, MatchupStat = 1, Trait = 2, FieldTrait = 3, Identity = 4 }

export interface Modifier { kind: ModifierKind; label: string; delta: StatDelta }
export const mod = (kind: ModifierKind, label: string, delta: StatDelta): Modifier => ({ kind, label, delta });
export const modIsNegative = (m: Modifier) => sdPowerScore(m.delta) < 0;
export const modFromField = (m: Modifier) => m.kind === ModifierKind.Field || m.kind === ModifierKind.FieldTrait;

export interface CombatStats { atk: number; def: number; pierce: number; gain: number; mods: Modifier[] }

// ---------------------------------------------------------------- definitions
export interface ElementIdentity {
  summary: string;
  onHitFieldBonus: number;
  onHitMpTax: number;
  washout: number;
  decayOverride: number; // -1 = use rules
  ignoreNegativeFieldEffects: boolean;
  investGainBonus: number;
  dominantSelf: StatDelta;
  dominantOthers: StatDelta;
  dominantText: string;
}

export interface ElementDef {
  element: Element;
  label: string;
  beats: Element[];
  isFieldElement: boolean;
  hasResonance: boolean;
  resonance: StatDelta;
  fieldName: string;
  fieldBadge: string;
  fieldDesc: string;
  identity: ElementIdentity;
}

export enum TraitCondition { None = 0, Always = 1, OpponentElementIs = 2, OpponentBaseDefAtMost = 3, OpponentBaseDefAtLeast = 4, FieldLevelAtLeast = 5 }

export interface TraitDef {
  id: string;
  label: string;
  description: string;
  condition: TraitCondition;
  conditionElement: Element;
  conditionValue: number;
  combatBonus: StatDelta;
  combatLabel: string;
  afterHitFieldGain: number;
  afterHitMpTax: number;
  hasProjectile: boolean;
  scalesWithFieldLevel: boolean;
}
export const traitIsAlways = (t: TraitDef) => t.condition === TraitCondition.Always && !sdIsZero(t.combatBonus);
export const traitDependsOnField = (t: TraitDef) => t.condition === TraitCondition.FieldLevelAtLeast && !sdIsZero(t.combatBonus);

export interface InvestDef { allowed: boolean; useRuleDefaults: boolean; gainPerMp: number; maxExtraMp: number }

export enum MatchupStanding { Neutral = 0, Win = 1, Lose = 2 }

export enum CardRole { Standard = 0, HeavyHitter = 1, LowCost = 2, FieldBuilder = 3, FieldDependent = 4, MatchupSpecialist = 5, HighRisk = 6, Stable = 7 }
export function roleLabel(r: CardRole): string {
  switch (r) {
    case CardRole.HeavyHitter: return '고화력';
    case CardRole.LowCost: return '저코스트';
    case CardRole.FieldBuilder: return '필드 조성';
    case CardRole.FieldDependent: return '필드 의존';
    case CardRole.MatchupSpecialist: return '상성 특화';
    case CardRole.HighRisk: return '고위험';
    case CardRole.Stable: return '안정형';
    default: return '';
  }
}

export interface CardDef {
  id: string;
  name: string;
  element: Element;
  baseCost: number;
  atk: number;
  def: number;
  baseFieldGain: number;
  traits: TraitDef[];
  invest: InvestDef;
  role: CardRole;
  isRoleSample: boolean;
  isTest: boolean;
  isPass: boolean;
  note: string;
}
export const cardHasProjectile = (c: CardDef) => c.traits.every(t => t.hasProjectile);

export enum HybridTarget { All = 0, Pair = 1, List = 2 }
export interface HybridDef {
  id: string; a: Element; b: Element; name: string; badge: string; description: string; effectText: string;
  target: HybridTarget; targetElements: Element[]; effect: StatDelta;
}
export const hybridMatches = (h: HybridDef, x: Element, y: Element) => (h.a === x && h.b === y) || (h.a === y && h.b === x);

export interface TestRuleOptions {
  matchupStatBonus: boolean;
  resonance: boolean;
  hybrid: boolean;
  unstable: boolean;
  suppression: boolean;
  testCards: boolean;
  /** 실험 기능: 속성 성향 (기본 OFF) */
  elementIdentity: boolean;
  /** 실험 기능: 역할 카드 (기본 OFF) */
  roleCards: boolean;
}
export const cloneOptions = (o: TestRuleOptions): TestRuleOptions => ({ ...o });
export const v6Baseline = (): TestRuleOptions => ({ matchupStatBonus: false, resonance: true, hybrid: true, unstable: true, suppression: false, testCards: false, elementIdentity: false, roleCards: false });

/** Port of RuleSet. All tunable numbers live in src/data/rules.ts. */
export interface RuleSet {
  startHp: number;
  startMp: number;
  maxMp: number;
  mpPerRound: number;
  minMpGain: number;
  handSize: number;
  drawPerRound: number;
  copiesPerCard: number;
  matchupAdvantageBonus: StatDelta;
  matchupDisadvantageBonus: StatDelta;
  lightDarkSpecial: boolean;
  lightElement: Element;
  darkElement: Element;
  fieldMax: number;
  fieldDecay: number;
  fieldLevels: number[];
  dominantGap: number;
  hybridSum: number;
  suppression: StatDelta;
  neutralFieldName: string;
  neutralFieldBadge: string;
  neutralFieldDesc: string;
  unstableFieldName: string;
  unstableFieldBadge: string;
  unstableFieldDesc: string;
  unstableEffectText: string;
  unstableEffect: StatDelta;
  fieldGainOnWin: number;
  fieldGainOnNeutral: number;
  fieldGainOnLose: number;
  investmentEnabled: boolean;
  investGainPerMp: number;
  investMaxExtra: number;
  minCardCost: number;
  defaultOptions: TestRuleOptions;
}

export const maxLevel = (r: RuleSet) => r.fieldLevels.length;
export function fieldGainMultiplier(r: RuleSet, s: MatchupStanding): number {
  return s === MatchupStanding.Win ? r.fieldGainOnWin : s === MatchupStanding.Lose ? r.fieldGainOnLose : r.fieldGainOnNeutral;
}
/** C# Math.Round(x, MidpointRounding.AwayFromZero) */
export function roundAwayFromZero(x: number): number {
  const a = Math.abs(x);
  const f = Math.floor(a);
  const r = a - f >= 0.5 ? f + 1 : f;
  return x < 0 ? -r : r;
}
export const scaleBaseGain = (r: RuleSet, baseGain: number, s: MatchupStanding) => roundAwayFromZero(baseGain * fieldGainMultiplier(r, s));

export const investGainPerMp = (inv: InvestDef, r: RuleSet) => (inv.useRuleDefaults ? r.investGainPerMp : inv.gainPerMp);
export const investMaxExtra = (inv: InvestDef, r: RuleSet) => (inv.useRuleDefaults ? r.investMaxExtra : inv.maxExtraMp);
