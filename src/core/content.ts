// Port of GameContent (Core/Definitions.cs). Built from the editable data files in src/data.
import { CardDef, Element, ElementDef, FIELD_ORDER, HybridDef, hybridMatches, PASS_CARD_ID, RuleSet, CardRole, sd } from './types';

export class GameContent {
  readonly rules: RuleSet;
  readonly elements = new Map<Element, ElementDef>();
  readonly cards: CardDef[] = [];
  readonly hybrids: HybridDef[] = [];
  readonly passCard: CardDef = {
    id: PASS_CARD_ID, name: '턴 넘김', element: Element.None, baseCost: 0, atk: 0, def: 0, baseFieldGain: 0, traits: [],
    invest: { allowed: true, useRuleDefaults: true, gainPerMp: 5, maxExtraMp: 2 }, role: CardRole.Standard,
    isRoleSample: false, isTest: false, isPass: true, note: '',
  };

  constructor(rules: RuleSet) {
    this.rules = rules;
  }

  getElement(e: Element): ElementDef | undefined {
    return this.elements.get(e);
  }

  isFieldElement(e: Element): boolean {
    if (FIELD_ORDER.indexOf(e) < 0) return false;
    const def = this.getElement(e);
    return def === undefined || def.isFieldElement;
  }

  getCard(id: string | null | undefined): CardDef | undefined {
    if (id === PASS_CARD_ID) return this.passCard;
    return this.cards.find(c => c.id === id);
  }

  findHybrid(x: Element, y: Element): HybridDef | undefined {
    return this.hybrids.find(h => hybridMatches(h, x, y));
  }

  label(e: Element): string {
    const def = this.getElement(e);
    if (def && def.label) return def.label;
    return e === Element.None ? '없음' : Element[e];
  }

  validate(): string[] {
    const problems: string[] = [];
    for (const e of FIELD_ORDER) if (!this.getElement(e)) problems.push(`ElementData missing: ${Element[e]}`);
    if (this.cards.length === 0) problems.push('No cards defined');
    const ids = new Set<string>();
    for (const c of this.cards) {
      if (!c.id) problems.push(`Card without id: ${c.name}`);
      else if (ids.has(c.id)) problems.push(`Duplicate card id: ${c.id}`);
      else ids.add(c.id);
    }
    if (this.cards.every(c => c.isTest)) problems.push('All cards are test cards; default deck would be empty');
    if (!this.rules.fieldLevels || this.rules.fieldLevels.length === 0) problems.push('Field levels empty');
    return problems;
  }
}

export { sd };
