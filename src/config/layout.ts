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

  // v10: P1/P2 는 차례와 상관없이 항상 같은 자리 — P1 왼쪽(파랑) · P2 오른쪽(빨강). 양쪽 크기·구조 동일.
  //      P1 포탑 → P1 카드 → 중앙 충돌 → P2 카드 → P2 포탑
  //      (슬롯/포탑 스케일 0.8 / 0.88 은 제안값 — 실제 화면 확인 후 조정)
  p1Slot: v2(-330, 30),               // P1 카드 슬롯 (중앙 왼쪽)
  p2Slot: v2(330, 30),                // P2 카드 슬롯 (중앙 오른쪽)
  slotScale: 0.8,                     // 두 슬롯 공통 배율

  p1Tower: v2(-650, -150),            // P1 포탑 (왼쪽, 받침 기준)
  p2Tower: v2(650, -150),             // P2 포탑 (오른쪽, 받침 기준)
  towerScale: 0.88,                   // 두 포탑 공통 배율

  handCenterFromBottom: 170,         // 손패 중심의 화면 하단으로부터 높이 (v7: 확대 카드 하단이 잘리지 않게)
  handWidth: 960,                     // 손패가 펼쳐지는 최대 폭 (손패 내부 좌표) — v7: 확대분만큼 좁힘
  handScale: 0.93,                    // 손패 카드 크기 배율 — v7: 0.76 → 0.93 (약 22% 확대)

  bannerY: 40,
  toastY: -42,
  investOffset: v2(0, -134),          // MP 투자 패널: 현재 선택 중인 슬롯 기준 오프셋 (슬롯 아래, 슬롯 0.8배 기준)
  hintOffset: v2(0, 160),             // 상성 힌트: 현재 선택 중인 슬롯 기준 오프셋 (슬롯 위)
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
