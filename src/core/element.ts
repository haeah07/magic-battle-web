// Port of Battle/ElementSystem.cs
import { GameContent } from './content';
import { Element, FIELD_ORDER } from './types';

export enum AttackResult { Both = 0, P1Only = 1, P2Only = 2, LightDark = 3 }

/** 1: a beats b, -1: b beats a, 0: no matchup */
export function relation(content: GameContent, a: Element, b: Element): number {
  const da = content.getElement(a);
  const db = content.getElement(b);
  if (!da || !db) return 0;
  if (da.beats.includes(b)) return 1;
  if (db.beats.includes(a)) return -1;
  return 0;
}

export function isLightDark(content: GameContent, a: Element, b: Element): boolean {
  const R = content.rules;
  return R.lightDarkSpecial && ((a === R.lightElement && b === R.darkElement) || (a === R.darkElement && b === R.lightElement));
}

export function resolveAttack(content: GameContent, p1: Element, p2: Element): AttackResult {
  if (isLightDark(content, p1, p2)) return AttackResult.LightDark;
  const rel = relation(content, p1, p2);
  return rel > 0 ? AttackResult.P1Only : rel < 0 ? AttackResult.P2Only : AttackResult.Both;
}

export const strongAgainst = (content: GameContent, e: Element): Element[] => [...(content.getElement(e)?.beats ?? [])];
export const weakAgainst = (content: GameContent, e: Element): Element[] => FIELD_ORDER.filter(k => content.getElement(k)?.beats.includes(e) === true);
