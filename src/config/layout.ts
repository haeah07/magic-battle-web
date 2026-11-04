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

  // v8: 전장 좌 → 우 흐름.  내 포탑 → 내 카드 → 중앙 충돌 → 상대 카드 → 상대 포탑
  //     (현재 행동하는 플레이어가 항상 왼쪽, 턴 교대 시 전장이 회전하며 좌우가 바뀜)
  homeSlot: v2(-330, 30),             // 내 카드 슬롯 (중앙 왼쪽)
  awaySlot: v2(330, 30),              // 상대 카드 슬롯 (중앙 오른쪽)
  homeSlotScale: 0.7,
  awaySlotScale: 0.6,                 // v7: 상대 카드는 한 단계 작게 (시선 우선순위)

  homeTower: v2(-650, -150),          // 내 포탑 (왼쪽, 받침 기준)
  awayTower: v2(650, -150),           // 상대 포탑 (오른쪽, 받침 기준)
  homeTowerScale: 0.88,
  awayTowerScale: 0.76,               // v7: 상대 포탑 약간 작게

  handCenterFromBottom: 170,         // 손패 중심의 화면 하단으로부터 높이 (v7: 확대 카드 하단이 잘리지 않게)
  handWidth: 960,                     // 손패가 펼쳐지는 최대 폭 (손패 내부 좌표) — v7: 확대분만큼 좁힘
  handScale: 0.93,                    // 손패 카드 크기 배율 — v7: 0.76 → 0.93 (약 22% 확대)

  bannerY: 40,
  toastY: -42,
  investOffset: v2(0, -118),          // MP 투자 패널: 내 슬롯 기준 오프셋 (v8: 슬롯 아래)
  hintOffset: v2(0, 152),             // 상성 힌트: 내 슬롯 기준 오프셋 (v8: 슬롯 위)
  turnSwapSeconds: 0.8,               // 턴 교대 시 전장 회전 시간 (초)
  fieldHudTop: 72,                    // 상단 필드 HUD 의 화면 위에서의 거리
  battleLogTop: 96,
};

/** 카드 / 손패 크기 설정 */
export const CARD = {
  size: v2(200, 290),                 // CardView.Size (카드 원본 크기)
  artSize: v2(180, 138),
  hoverLift: 74,                      // 손패 hover 시 올라가는 높이
  hoverScale: 1.22,                   // v7: 손패 자체가 커져서 hover 배율은 살짝 낮춤                   // 손패 hover 시 확대
  selectedLift: 20,
};

export const HAND = {
  preferredSpacing: 170,              // 카드 간격 (여유 있을 때)
  minVisibleWidth: 104,               // 겹칠 때 최소로 보이는 폭
  arcHeight: 22,                      // v7: 부채꼴 완만하게 (좌우 시선 정리)                      // 부채꼴 높이
  maxTilt: 6,                         // 양 끝 카드 기울기 (도)
  neighborPush: 60,                   // hover 시 양옆 카드가 비켜나는 거리
};
