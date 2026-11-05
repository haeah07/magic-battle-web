// ============================================================================
//  카드 데이터 ── 카드 추가/수치 변경은 이 파일만 수정하면 됩니다.
//  cost: MP 코스트 · atk: 공격력(공격 성공 시 그대로 피해) · gain: 기본 필드 누적량 · traits: src/data/traits.ts 의 id
//  invest: { allowed, perMp, max }  perMp/max 를 생략하면 rules.ts 의 기본값 사용
//  art: public/assets/cards/<art>.png (없으면 속성 글자 표시)  artCrop: 그림 칸에 보일 영역 (0~1, 왼쪽 아래 기준)
//  v9 기본 테스트 덱: 7속성 × 저/중/고비용 3장 = 21장 (각 1장). 최종 디자인이 아닌 게임성 테스트용 임시 카드.
//  코스트는 8~9 도 그대로 넣을 수 있습니다 (구조상 상한 없음, MP 최대치는 rules.ts).
//  role/roleSample/test: 예전 실험용 표시 (현재 덱에는 없음)
// ============================================================================
import { CardRole, Element } from '../core/types';

export interface CardData {
  id: string;
  name: string;
  element: Element;
  cost: number;
  atk: number;
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
  // ── 물: 필드를 많이 쌓는 속성
  { id: "water-bolt", name: "Water Bolt", element: Element.Water, cost: 2, atk: 3, gain: 18, traits: [] },
  { id: "tidal-wave", name: "Tidal Wave", element: Element.Water, cost: 4, atk: 4, gain: 26, traits: ["tide"] },
  { id: "tsunami", name: "Tsunami", element: Element.Water, cost: 7, atk: 9, gain: 28, traits: [] },
  // ── 불: 공격력이 높은 속성
  { id: "fire-bolt", name: "Fire Bolt", element: Element.Fire, cost: 2, atk: 4, gain: 14, traits: [], art: "fire-ball" },
  { id: "flame-burst", name: "Flame Burst", element: Element.Fire, cost: 4, atk: 6, gain: 18, traits: ["burn"], art: "fire-ball" },
  { id: "meteor", name: "Meteor", element: Element.Fire, cost: 7, atk: 10, gain: 20, traits: [], art: "fire-ball" },
  // ── 풀: 필드가 쌓일수록 강해지는 속성
  { id: "vine-whip", name: "Vine Whip", element: Element.Nature, cost: 2, atk: 3, gain: 16, traits: [], art: "wind-arrow" },
  { id: "thorn-burst", name: "Thorn Burst", element: Element.Nature, cost: 4, atk: 4, gain: 22, traits: ["thorn"], art: "wind-arrow" },
  { id: "overgrowth", name: "Overgrowth", element: Element.Nature, cost: 6, atk: 7, gain: 32, traits: [], art: "wind-arrow" },
  // ── 얼음: 상대 MP 를 늦추는 속성
  { id: "ice-shard", name: "Ice Shard", element: Element.Ice, cost: 2, atk: 3, gain: 16, traits: ["chill"], art: "ice-ball" },
  { id: "blizzard", name: "Blizzard", element: Element.Ice, cost: 5, atk: 6, gain: 20, traits: ["chill"], art: "ice-ball" },
  { id: "absolute-zero", name: "Absolute Zero", element: Element.Ice, cost: 7, atk: 9, gain: 24, traits: [], art: "ice-wall" },
  // ── 바위: 효과 없이 묵직한 속성
  { id: "rock-bullet", name: "Rock Bullet", element: Element.Rock, cost: 3, atk: 5, gain: 18, traits: [], art: "rock-bullet" },
  { id: "landslide", name: "Landslide", element: Element.Rock, cost: 5, atk: 7, gain: 24, traits: [], art: "rock-bullet" },
  { id: "earthquake", name: "Earthquake", element: Element.Rock, cost: 7, atk: 10, gain: 24, traits: [], art: "rock-bullet" },
  // ── 빛: 기본 5속성과 상성 없음, 어둠에 우위
  { id: "light-ray", name: "Light Ray", element: Element.Light, cost: 2, atk: 3, gain: 16, traits: [] },
  { id: "holy-lance", name: "Holy Lance", element: Element.Light, cost: 4, atk: 4, gain: 22, traits: ["radiance"] },
  { id: "judgment", name: "Judgment", element: Element.Light, cost: 6, atk: 8, gain: 24, traits: [], art: "lightning" },
  // ── 어둠: 기본 5속성에 우위, 빛에게 큰 반동
  { id: "shadow-bolt", name: "Shadow Bolt", element: Element.Dark, cost: 3, atk: 3, gain: 14, traits: [] },
  { id: "dark-pulse", name: "Dark Pulse", element: Element.Dark, cost: 5, atk: 5, gain: 18, traits: ["shadow"] },
  { id: "void-collapse", name: "Void Collapse", element: Element.Dark, cost: 7, atk: 8, gain: 20, traits: [] },
];
