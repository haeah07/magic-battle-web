// ============================================================================
//  전투 화면 레이아웃 (Unity BattleScreen.Layout 과 같은 값)
//  기준 해상도 1920×1080, 좌표는 화면 중앙 기준 (x 오른쪽 +, y 위쪽 +) — Unity 와 동일.
//  위치·크기를 바꾸려면 이 파일의 숫자만 수정하면 됩니다.
// ============================================================================
import { v2 } from '../ui/engine';

export const REFERENCE = { width: 1920, height: 1080 };

export const LAYOUT = {
  margin: 28,                         // HUD 가장자리 여백
  clash: v2(0, 40),                   // 중앙 충돌 지점 (필드 마법진 중심)
  floorCenter: v2(0, 18),             // 원형 경기장 중심
  floorSize: v2(1660, 700),           // 경기장 바닥 크기 (가로, 원근 세로)

  homeSlot: v2(0, -170),              // 내 카드 슬롯 (하단 중앙)
  awaySlot: v2(0, 262),               // 상대 카드 슬롯 (상단 중앙)
  homeSlotScale: 0.7,
  awaySlotScale: 0.62,

  homeTower: v2(-575, -372),          // 내 포탑 (좌하단, 받침 기준)
  awayTower: v2(472, 104),            // 상대 포탑 (우상단, 받침 기준)
  homeTowerScale: 0.92,
  awayTowerScale: 0.8,

  handCenterFromBottom: 152,          // 손패 중심의 화면 하단으로부터 높이
  handWidth: 1060,                    // 손패가 펼쳐지는 최대 폭 (손패 내부 좌표)
  handScale: 0.76,                    // 손패 카드 크기 배율  ← "손패 20% 크게" = 0.76 * 1.2

  bannerY: 40,
  toastY: -42,
  investOffset: v2(96, 4),            // MP 투자 패널: 내 슬롯 기준 오프셋
  hintOffset: v2(-96, 4),             // 상성 힌트: 내 슬롯 기준 오프셋
  fieldHudTop: 72,                    // 상단 필드 HUD 의 화면 위에서의 거리
  battleLogTop: 96,
};

/** 카드 / 손패 크기 설정 */
export const CARD = {
  size: v2(200, 290),                 // CardView.Size (카드 원본 크기)
  artSize: v2(180, 138),
  hoverLift: 74,                      // 손패 hover 시 올라가는 높이
  hoverScale: 1.26,                   // 손패 hover 시 확대
  selectedLift: 20,
};

export const HAND = {
  preferredSpacing: 176,              // 카드 간격 (여유 있을 때)
  minVisibleWidth: 104,               // 겹칠 때 최소로 보이는 폭
  arcHeight: 30,                      // 부채꼴 높이
  maxTilt: 9,                         // 양 끝 카드 기울기 (도)
  neighborPush: 60,                   // hover 시 양옆 카드가 비켜나는 거리
};
