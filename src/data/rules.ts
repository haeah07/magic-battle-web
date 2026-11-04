// ============================================================================
//  규칙 설정 (Unity RuleConfig 와 동일한 값)  ── 밸런스 숫자는 전부 여기서 수정합니다.
//  예) 라운드당 MP 회복 2 → 3 :  mpPerRound: 3
//  저장하면 dev 서버가 즉시 새로고침됩니다. 브라우저에서 임시로 바꾸려면 왼쪽 위 ⊕(디버그) → 수치 편집을 쓰세요.
// ============================================================================
import { Element, RuleSet, sd } from '../core/types';

export const RULES: RuleSet = {
  // ── 플레이어 ───────────────────────────────
  startHp: 24,          // 시작 HP (포탑 체력)
  startMp: 4,           // 시작 MP
  maxMp: 10,            // 최대 MP
  mpPerRound: 2,        // 라운드당 MP 회복
  minMpGain: 1,         // 냉기 등으로 줄어도 최소 회복량
  handSize: 5,          // 시작 손패 크기
  drawPerRound: 1,      // 라운드당 드로우
  copiesPerCard: 2,     // 덱에 들어가는 카드별 복사 수

  // ── 상성 ──────────────────────────────────
  matchupAdvantageBonus: sd({ atk: 2 }),     // (실험 옵션 '상성 수치 보정' ON 일 때만)
  matchupDisadvantageBonus: sd({ atk: -1 }),
  lightDarkSpecial: true,   // 빛 vs 어둠 특수 판정
  lightElement: Element.Light,
  darkElement: Element.Dark,

  // ── 필드 ──────────────────────────────────
  fieldMax: 100,          // 필드 최대치
  fieldDecay: 3,          // 라운드마다 모든 속성 필드 감소량
  fieldLevels: [20, 45, 70],  // 공명 Lv1/Lv2/Lv3 기준
  dominantGap: 15,        // 1위가 2위보다 이만큼 높으면 '지배' 필드
  hybridSum: 46,          // 1위+2위 합이 이 이상이고 조합이 있으면 '혼합' 필드
  suppression: sd({ atk: -1 }),   // (실험 옵션 '우세 억제' ON 일 때만)
  neutralFieldName: "중립 필드",
  neutralFieldBadge: "NEUTRAL",
  neutralFieldDesc: "아직 어떤 속성도 전장을 장악하지 못했습니다.",
  unstableFieldName: "불안정 필드",
  unstableFieldBadge: "UNSTABLE",
  unstableFieldDesc: "상위 속성들이 팽팽합니다. 다음 마법에 따라 전장이 크게 바뀝니다.",
  unstableEffectText: "상위 두 속성 카드 필드 누적 +2",
  unstableEffect: sd({ gain: 2 }),

  // ── 전투 결과별 기본 필드 누적 배율 (MP 투자분에는 적용되지 않음) ──
  fieldGainOnWin: 0.5,     // 상성 승리
  fieldGainOnNeutral: 0.75, // 무상성
  fieldGainOnLose: 1,      // 상성 패배 (공격 실패해도 누적)

  // ── MP 추가 투자 ──────────────────────────
  investmentEnabled: true,
  investGainPerMp: 5,     // MP 1당 추가 필드 누적 (카드별 값이 없을 때)
  investMaxExtra: 2,      // 최대 추가 투자량 (카드별 값이 없을 때)
  minCardCost: 1,         // 코스트 감소 효과가 있어도 최소 코스트

  // ── 기본 테스트 옵션 (디버그 패널에서 토글) ──
  defaultOptions: {
    matchupStatBonus: false,
    resonance: true,        // 공명
    hybrid: true,           // 혼합 필드 효과
    unstable: true,         // 불안정 필드 효과
    suppression: false,
    testCards: false,
    elementIdentity: false, // 실험 기능: 속성 성향 (기본 OFF)
    roleCards: false,        // 실험 기능: 역할 카드 (기본 OFF)
  },
};
