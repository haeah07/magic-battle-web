// ============================================================================
//  카드 특성 (trait)
//  condition: None/Always/OpponentElementIs/OpponentBaseDefAtMost/OpponentBaseDefAtLeast/FieldLevelAtLeast
//  combatBonus: 조건을 만족하면 전투 스탯 보정 · afterHitFieldGain/afterHitMpTax: 피해를 줬을 때 효과
// ============================================================================
import { Element, TraitCondition, TraitDef, sd } from '../core/types';

export const TRAITS: Record<string, TraitDef> = {
  "burn": {
    id: "burn", label: "연소", description: "피해를 주면 불 필드 +5 추가 누적",
    condition: TraitCondition.None, conditionElement: Element.None, conditionValue: 0,
    combatBonus: sd(), combatLabel: "",
    afterHitFieldGain: 5, afterHitMpTax: 0, hasProjectile: true, scalesWithFieldLevel: false,
  },
  "chill": {
    id: "chill", label: "냉기", description: "피해를 주면 상대의 다음 MP 회복 -1",
    condition: TraitCondition.None, conditionElement: Element.None, conditionValue: 0,
    combatBonus: sd(), combatLabel: "",
    afterHitFieldGain: 0, afterHitMpTax: 1, hasProjectile: true, scalesWithFieldLevel: false,
  },
  "wall": {
    id: "wall", label: "방벽", description: "투사체 없이 막아섭니다. 불 속성 상대에게 DEF +2",
    condition: TraitCondition.OpponentElementIs, conditionElement: Element.Fire, conditionValue: 0,
    combatBonus: sd({ def: 2 }), combatLabel: "Ice Wall 화염 방어",
    afterHitFieldGain: 0, afterHitMpTax: 0, hasProjectile: false, scalesWithFieldLevel: false,
  },
  "multi": {
    id: "multi", label: "연사", description: "상대 카드 기본 DEF 1 이하이면 ATK +1",
    condition: TraitCondition.OpponentBaseDefAtMost, conditionElement: Element.None, conditionValue: 1,
    combatBonus: sd({ atk: 1 }), combatLabel: "WindArrow 연사",
    afterHitFieldGain: 0, afterHitMpTax: 0, hasProjectile: true, scalesWithFieldLevel: false,
  },
  "shock": {
    id: "shock", label: "감전", description: "상대 카드 기본 DEF 5 이상이면 관통 3",
    condition: TraitCondition.OpponentBaseDefAtLeast, conditionElement: Element.None, conditionValue: 5,
    combatBonus: sd({ pierce: 3 }), combatLabel: "Lightning 감전",
    afterHitFieldGain: 0, afterHitMpTax: 0, hasProjectile: true, scalesWithFieldLevel: false,
  },
  "thorn": {
    id: "thorn", label: "가시 성장", description: "풀 필드 Lv1 이상이면 레벨마다 ATK +2",
    condition: TraitCondition.FieldLevelAtLeast, conditionElement: Element.Nature, conditionValue: 1,
    combatBonus: sd({ atk: 2 }), combatLabel: "가시 성장",
    afterHitFieldGain: 0, afterHitMpTax: 0, hasProjectile: true, scalesWithFieldLevel: true,
  },
  "lance": {
    id: "lance", label: "빙창", description: "물 속성 상대에게 ATK +2 · 관통 2",
    condition: TraitCondition.OpponentElementIs, conditionElement: Element.Water, conditionValue: 0,
    combatBonus: sd({ atk: 2, pierce: 2 }), combatLabel: "Frost Lance 빙창",
    afterHitFieldGain: 0, afterHitMpTax: 0, hasProjectile: true, scalesWithFieldLevel: false,
  },
  "pierce": {
    id: "pierce", label: "관통", description: "항상 관통 2 (상대 DEF를 2만큼 무시)",
    condition: TraitCondition.Always, conditionElement: Element.None, conditionValue: 0,
    combatBonus: sd({ pierce: 2 }), combatLabel: "RockBullet 관통",
    afterHitFieldGain: 0, afterHitMpTax: 0, hasProjectile: true, scalesWithFieldLevel: false,
  },
};
