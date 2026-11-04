// ============================================================================
//  카드 데이터 ── 카드 추가/수치 변경은 이 파일만 수정하면 됩니다.
//  cost: MP 코스트 · atk/def · gain: 기본 필드 누적량 · traits: src/data/traits.ts 의 id
//  invest: { allowed, perMp, max }  perMp/max 를 생략하면 rules.ts 의 기본값 사용
//  art: public/assets/cards/<art>.png (없으면 속성 글자 표시)  artCrop: 그림 칸에 보일 영역 (0~1, 왼쪽 아래 기준)
//  role/roleSample: 실험 기능 '역할 카드' (기본 OFF) · test: 테스트 카드 (디버그에서 ON)
// ============================================================================
import { CardRole, Element } from '../core/types';

export interface CardData {
  id: string;
  name: string;
  element: Element;
  cost: number;
  atk: number;
  def: number;
  gain: number;
  traits: string[];
  invest?: { allowed: boolean; perMp?: number; max?: number };
  art?: string;
  artCrop?: [number, number, number, number];
  role?: CardRole;
  roleSample?: boolean;
  test?: boolean;
  note?: string;
}

/** Unity 카드 일러스트(완성 카드 이미지)에서 그림 부분만 잘라 쓰는 기본 영역 */
export const DEFAULT_ART_CROP: [number, number, number, number] = [0.07, 0.3, 0.86, 0.52];

export const CARDS: CardData[] = [
  { id: "fire-ball", name: "Fire Ball", element: Element.Fire, cost: 2, atk: 5, def: 0, gain: 18, traits: ["burn"], art: "fire-ball" },
  { id: "ice-ball", name: "Ice Ball", element: Element.Ice, cost: 2, atk: 4, def: 1, gain: 18, traits: ["chill"], art: "ice-ball" },
  { id: "ice-wall", name: "Ice Wall", element: Element.Ice, cost: 2, atk: 0, def: 5, gain: 15, traits: ["wall"], art: "ice-wall" },
  { id: "wind-arrow", name: "WindArrow", element: Element.Nature, cost: 2, atk: 4, def: 1, gain: 17, traits: ["multi"], art: "wind-arrow", note: "풀 속성 임시 유지" },
  { id: "rock-bullet", name: "RockBullet", element: Element.Rock, cost: 3, atk: 5, def: 1, gain: 20, traits: ["pierce"], art: "rock-bullet" },
  { id: "lightning", name: "Lightning", element: Element.Unknown, cost: 3, atk: 6, def: 0, gain: 20, traits: ["shock"], art: "lightning", test: true, note: "속성 미확정 테스트 카드" },
  { id: "test-water", name: "Water Test", element: Element.Water, cost: 2, atk: 4, def: 1, gain: 18, traits: [], test: true, note: "물 속성 검증용 테스트 카드" },
  { id: "test-light", name: "Light Test", element: Element.Light, cost: 2, atk: 5, def: 0, gain: 18, traits: [], test: true, note: "빛 속성 검증용 테스트 카드" },
  { id: "test-dark", name: "Dark Test", element: Element.Dark, cost: 2, atk: 4, def: 1, gain: 18, traits: [], test: true, note: "어둠 속성 검증용 테스트 카드" },
  { id: "meteor", name: "Meteor", element: Element.Fire, cost: 4, atk: 8, def: 0, gain: 12, traits: [], invest: { allowed: true, perMp: 3, max: 1 }, role: CardRole.HeavyHitter, roleSample: true, note: "고화력형: 높은 ATK·코스트, 필드 효율 낮음" },
  { id: "pebble-shot", name: "Pebble Shot", element: Element.Rock, cost: 1, atk: 3, def: 1, gain: 10, traits: [], invest: { allowed: true, perMp: 4, max: 1 }, role: CardRole.LowCost, roleSample: true, note: "저코스트형: 남는 MP로 언제든 사용" },
  { id: "tide-call", name: "Tide Call", element: Element.Water, cost: 2, atk: 2, def: 1, gain: 26, traits: [], invest: { allowed: true, perMp: 8, max: 3 }, role: CardRole.FieldBuilder, roleSample: true, note: "필드 조성형: 피해 낮음, 누적·투자 효율 높음" },
  { id: "bramble-lash", name: "Bramble Lash", element: Element.Nature, cost: 2, atk: 2, def: 1, gain: 16, traits: ["thorn"], role: CardRole.FieldDependent, roleSample: true, note: "필드 의존형: 풀 필드 레벨마다 ATK +2" },
  { id: "frost-lance", name: "Frost Lance", element: Element.Ice, cost: 3, atk: 4, def: 0, gain: 16, traits: ["lance"], role: CardRole.MatchupSpecialist, roleSample: true, note: "상성 특화형: 물 상대로 ATK +2 · 관통 2" },
  { id: "void-bolt", name: "Void Bolt", element: Element.Dark, cost: 2, atk: 6, def: 0, gain: 14, traits: [], role: CardRole.HighRisk, roleSample: true, note: "고위험형: 기본 5속성에 강하지만 빛에게 큰 반동" },
  { id: "holy-ray", name: "Holy Ray", element: Element.Light, cost: 2, atk: 4, def: 2, gain: 14, traits: [], role: CardRole.Stable, roleSample: true, note: "안정형: 필드 약화 무시, 어둠 카운터" },
];
