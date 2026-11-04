// Builds the runtime GameContent from the editable data files (rules/cards/elements/traits)
// plus optional debug overrides (Debug panel → stored in the browser, no rebuild needed).
import { GameContent } from '../core/content';
import { CardDef, CardRole, RuleSet, TestRuleOptions } from '../core/types';
import { CARDS, CardData, DEFAULT_ART_CROP } from './cards';
import { ELEMENTS, HYBRIDS } from './elements';
import { RULES } from './rules';
import { TRAITS } from './traits';

export interface CardOverride { cost?: number; atk?: number; def?: number; gain?: number }

/** Values the Debug panel can change at runtime (merged on top of src/data). */
export interface DataOverrides {
  rules?: Partial<Omit<RuleSet, 'defaultOptions'>> & { defaultOptions?: Partial<TestRuleOptions> };
  cards?: Record<string, CardOverride>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function buildRules(over?: DataOverrides): RuleSet {
  const r = clone(RULES);
  if (over?.rules) {
    const { defaultOptions, ...rest } = over.rules;
    Object.assign(r, clone(rest));
    if (defaultOptions) Object.assign(r.defaultOptions, defaultOptions);
  }
  return r;
}

export function toCardDef(c: CardData, over?: CardOverride): CardDef {
  return {
    id: c.id,
    name: c.name,
    element: c.element,
    baseCost: over?.cost ?? c.cost,
    atk: over?.atk ?? c.atk,
    def: over?.def ?? c.def,
    baseFieldGain: over?.gain ?? c.gain,
    traits: c.traits.map(id => {
      const t = TRAITS[id];
      if (!t) throw new Error(`card ${c.id}: unknown trait '${id}' (src/data/traits.ts)`);
      return t;
    }),
    invest: c.invest
      ? { allowed: c.invest.allowed, useRuleDefaults: c.invest.perMp === undefined && c.invest.max === undefined, gainPerMp: c.invest.perMp ?? 5, maxExtraMp: c.invest.max ?? 2 }
      : { allowed: true, useRuleDefaults: true, gainPerMp: 5, maxExtraMp: 2 },
    role: c.role ?? CardRole.Standard,
    isRoleSample: !!c.roleSample,
    isTest: !!c.test,
    isPass: false,
    note: c.note ?? '',
  };
}

export function buildContent(over?: DataOverrides): GameContent {
  const content = new GameContent(buildRules(over));
  for (const e of ELEMENTS) content.elements.set(e.element, e);
  for (const h of HYBRIDS) content.hybrids.push(h);
  for (const c of CARDS) content.cards.push(toCardDef(c, over?.cards?.[c.id]));
  return content;
}

export const cardData = (id: string): CardData | undefined => CARDS.find(c => c.id === id);
export const cardArtCrop = (id: string): [number, number, number, number] => cardData(id)?.artCrop ?? DEFAULT_ART_CROP;

export { CARDS, ELEMENTS, HYBRIDS, RULES, TRAITS };
