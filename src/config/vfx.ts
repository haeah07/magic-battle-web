// ============================================================================
//  연출 강도 설정 — 단계별 Glow / VFX 세기를 한곳에서 조절합니다.
//  1 = Unity v6 와 동일, 0 = 끔, 0.5 = 절반.
//  교수 피드백 반영(v7): 평상시 장식 광원은 낮추고, 순간 연출(충돌·피격·필드 변화)은 유지.
// ============================================================================
export const VFX = {
  /** 카드 선택 단계: 선택 카드 Glow, 손패 hover, 슬롯 마법진, 차례 표시 (선택 중 시선 유도 → 약간 강화) */
  choosing: 1.15,
  /** 제출 단계: 제출 버튼 Glow, 잠금 링, 제출 버스트 */
  submit: 1,
  /** 공개 단계: 카드 뒤집기, 투자 표시 */
  reveal: 1,
  /** 중앙 충돌: 투사체, 충돌 폭발, 화면 흔들림 (유지) */
  clash: 1,
  /** 포탑 피격: 섬광, 파편, 흔들림 (유지) */
  towerHit: 1,
  /** 필드가 바뀌는 순간: 필드 파동, 배경 Surge, 마법진 펄스 (전투 후 짧게, 유지) */
  fieldChange: 1,
  /** 평상시 필드 표현: 환경 오버레이, 바닥 틴트, 중앙 마법진 Glow (상시 → 낮춤) */
  fieldIdle: 0.5,
  /** 상시 Ambient (입자, 안개, 횃불, 마나 흐름) (크게 낮춤) */
  ambient: 0.35,
  /** 강화/약화 카드 오라 */
  cardAura: 0.6,
  /** 화면 흔들림 전체 배율 */
  shake: 1,
};
export type VfxKey = keyof typeof VFX;

// ============================================================================
//  단계별 시선 집중 (Focus) — 플레이 단계마다 각 영역의 강조 정도(0~1).
//  1 = 원래 밝기, 낮을수록 차분하게(마법진·광원 약화, 상대 쪽은 살짝 어둡게).
//  시선 순서: 내 손패 → 내 제출 카드 → 중앙 충돌 → 상대 카드 → 상대 포탑
// ============================================================================
export type FocusPhase = 'choosing' | 'submitted' | 'reveal' | 'impact' | 'field' | 'result';
export interface FocusWeights {
  mySlot: number;      // 내 카드 슬롯 (마법진·바닥 Glow)
  center: number;      // 중앙 필드 마법진
  enemySlot: number;   // 상대 카드 슬롯
  enemyTower: number;  // 상대 포탑 (광원·밝기)
  myTower: number;     // 내 포탑
  environment: number; // 배경·환경 오버레이·장식 광원
}
export const FOCUS: Record<FocusPhase, FocusWeights> = {
  // 카드 선택: 손패가 주인공, 전장은 차분하게
  choosing:  { mySlot: 0.8, center: 0.45, enemySlot: 0.5, enemyTower: 0.45, myTower: 0.6, environment: 0.5 },
  // 제출 후: 내가 낸 카드
  submitted: { mySlot: 1,   center: 0.5,  enemySlot: 0.6, enemyTower: 0.5,  myTower: 0.6, environment: 0.5 },
  // 동시 공개 ~ 중앙 충돌: 양쪽 카드와 중앙
  reveal:    { mySlot: 1,   center: 1,    enemySlot: 1,   enemyTower: 0.6,  myTower: 0.6, environment: 0.6 },
  // 공격: 마법 이동 → 맞는 포탑
  impact:    { mySlot: 0.75, center: 0.75, enemySlot: 0.75, enemyTower: 1,  myTower: 1,   environment: 0.6 },
  // 필드 변화: 중앙 필드 / 마법진 (짧게)
  field:     { mySlot: 0.6, center: 1,    enemySlot: 0.6, enemyTower: 0.6,  myTower: 0.6, environment: 1 },
  // 결과 확인
  result:    { mySlot: 0.85, center: 0.7, enemySlot: 0.85, enemyTower: 0.7, myTower: 0.7, environment: 0.6 },
};
/** 공격 단계에서 피해를 받지 않는 포탑의 강조 (평상시 0.45~0.6 보다 약간 차분하게) */
export const IMPACT_UNHIT_TOWER = 0.35;
/** 강조 전환 속도 (클수록 빠르게) */
export const FOCUS_SPEED = 4;
