// ============================================================================
//  카드 효과 (특성) — 한 문장으로 이해되는 단순 효과만 둡니다.
//  condition: None/Always/OpponentElementIs/FieldLevelAtLeast
//  combatBonus: 조건이 맞을 때 전투 보정 · afterHitFieldGain: 적중 시 자기 속성 필드 추가 누적
//  afterHitMpTax: 적중 시 상대의 다음 MP 회복 감소 · scalesWithFieldLevel: 필드 Lv 마다 보정 반복
// ============================================================================
import { Element, TraitCondition, TraitDef, sd } from '../core/types';

const base = { conditionElement: Element.None, conditionValue: 0, combatBonus: sd(), combatLabel: '', afterHitFieldGain: 0, afterHitMpTax: 0, hasProjectile: true, scalesWithFieldLevel: false };
const onHitField = (id: string, label: string, el: string, amount: number): TraitDef =>
  ({ ...base, id, label, description: `적중하면 ${el} 필드를 ${amount} 더 쌓습니다.`, condition: TraitCondition.None, afterHitFieldGain: amount });
const fieldPower = (id: string, label: string, el: string, element: Element, atkPerLevel: number): TraitDef =>
  ({ ...base, id, label, description: `${el} 필드가 강할수록(레벨마다) 공격력이 ${atkPerLevel} 올라갑니다.`, condition: TraitCondition.FieldLevelAtLeast, conditionElement: element, conditionValue: 1, combatBonus: sd({ atk: atkPerLevel }), combatLabel: label, scalesWithFieldLevel: true });

export const TRAITS: Record<string, TraitDef> = {
  burn: onHitField('burn', '연소', '불', 5),
  tide: onHitField('tide', '밀물', '물', 6),
  shadow: onHitField('shadow', '잠식', '어둠', 5),
  thorn: fieldPower('thorn', '가시 성장', '풀', Element.Nature, 2),
  radiance: fieldPower('radiance', '광휘', '빛', Element.Light, 2),
  chill: { ...base, id: 'chill', label: '냉기', description: '적중하면 상대의 다음 MP 회복이 1 줄어듭니다.', condition: TraitCondition.None, afterHitMpTax: 1 },
};
