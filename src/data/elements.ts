// ============================================================================
//  속성 데이터 (Unity ElementData / DefaultContent 와 동일)
//  beats: 이 속성이 이기는 속성 (상성 승리 = 상대 공격 실패)
//  resonance: 필드 Lv 1당 이 속성 카드에 주는 보정 (공명)
//  identity: 실험 기능 '속성 성향' (기본 OFF)
//  visual: 색상/배경/입자/카드 오라 — 화면 표현만 바꿉니다.
// ============================================================================
import { Element, ElementDef, HybridDef, HybridTarget, sd } from '../core/types';

export type ParticleStyle = 'Dust' | 'Ember' | 'Rain' | 'Leaf' | 'Snow' | 'Rubble' | 'Glow' | 'Wisp';
export type AuraStyle = 'None' | 'Fire' | 'Water' | 'Nature' | 'Ice' | 'Rock' | 'Light' | 'Dark';
export type RGB = [number, number, number];

export interface ElementVisual {
  color: string;          // 속성 대표색
  themeDark: RGB;         // 지배 필드일 때 배경 어두운 색
  themeBright: RGB;       // 지배 필드일 때 밝은 색 (마법진/오버레이)
  mist: RGB;              // 안개 색
  particle: ParticleStyle;
  aura: AuraStyle;        // 강화/약화 카드 오라 스타일
  icon: string | null;    // public/assets/elements/<icon>.png
}

export interface ElementData extends ElementDef { visual: ElementVisual }

export const ELEMENTS: ElementData[] = [
  {
    element: Element.Water, label: "물",
    beats: [Element.Fire, Element.Rock],
    isFieldElement: true, hasResonance: true, resonance: sd({ def: 1 }),
    fieldName: "수류 필드", fieldBadge: "TIDE", fieldDesc: "물기가 전장을 적시고 빗줄기가 흐릅니다.",
    identity: {
      summary: "필드 조절형 · 사용 시 가장 강한 다른 속성 필드 -6 · 투자 효율 +2/MP",
      onHitFieldBonus: 0, onHitMpTax: 0, washout: 6, decayOverride: -1,
      ignoreNegativeFieldEffects: false, investGainBonus: 2,
      dominantSelf: sd({ investGain: 3 }), dominantOthers: sd(), dominantText: "물 카드 투자 효율 +3/MP",
    },
    visual: { color: '#3D9BFF', themeDark: [0.0431, 0.1412, 0.2784], themeBright: [0.1843, 0.5255, 0.9098], mist: [0.6118, 0.7922, 0.9608], particle: 'Rain', aura: 'Water', icon: 'icon_water' },
  },
  {
    element: Element.Fire, label: "불",
    beats: [Element.Nature, Element.Ice],
    isFieldElement: true, hasResonance: true, resonance: sd({ atk: 1 }),
    fieldName: "화염 필드", fieldBadge: "FIRE", fieldDesc: "불씨와 열기가 전장을 뒤덮었습니다.",
    identity: {
      summary: "공격형 · 공격 성공 시 불 필드 +4 추가",
      onHitFieldBonus: 4, onHitMpTax: 0, washout: 0, decayOverride: -1,
      ignoreNegativeFieldEffects: false, investGainBonus: 0,
      dominantSelf: sd({ cost: -1 }), dominantOthers: sd(), dominantText: "불 카드 MP 코스트 -1",
    },
    visual: { color: '#FF7448', themeDark: [0.3529, 0.1137, 0.0627], themeBright: [1, 0.4157, 0.1725], mist: [1, 0.5412, 0.3608], particle: 'Ember', aura: 'Fire', icon: 'icon_fire' },
  },
  {
    element: Element.Nature, label: "풀",
    beats: [Element.Water, Element.Rock],
    isFieldElement: true, hasResonance: true, resonance: sd({ gain: 2 }),
    fieldName: "생장 필드", fieldBadge: "GROWTH", fieldDesc: "자라난 덩굴과 잎사귀가 마력을 키웁니다.",
    identity: {
      summary: "누적형 · 풀 필드는 라운드마다 1만 감소",
      onHitFieldBonus: 0, onHitMpTax: 0, washout: 0, decayOverride: 1,
      ignoreNegativeFieldEffects: false, investGainBonus: 0,
      dominantSelf: sd({ investMax: 1 }), dominantOthers: sd(), dominantText: "풀 카드 최대 투자 +1",
    },
    visual: { color: '#6EDB8A', themeDark: [0.0706, 0.2392, 0.1412], themeBright: [0.2588, 0.7686, 0.4314], mist: [0.6235, 0.9098, 0.7059], particle: 'Leaf', aura: 'Nature', icon: 'icon_nature' },
  },
  {
    element: Element.Ice, label: "얼음",
    beats: [Element.Water, Element.Nature],
    isFieldElement: true, hasResonance: true, resonance: sd({ def: 1 }),
    fieldName: "빙결 필드", fieldBadge: "FROST", fieldDesc: "차가운 안개와 서리가 전장을 감쌉니다.",
    identity: {
      summary: "방해형 · 공격 성공 시 상대 다음 MP 회복 -1",
      onHitFieldBonus: 0, onHitMpTax: 1, washout: 0, decayOverride: -1,
      ignoreNegativeFieldEffects: false, investGainBonus: 0,
      dominantSelf: sd(), dominantOthers: sd({ investMax: -1 }), dominantText: "얼음 외 카드 최대 투자 -1",
    },
    visual: { color: '#9FE3FF', themeDark: [0.0745, 0.1961, 0.2902], themeBright: [0.5608, 0.8471, 0.9608], mist: [0.8863, 0.9647, 1], particle: 'Snow', aura: 'Ice', icon: 'icon_ice' },
  },
  {
    element: Element.Rock, label: "바위",
    beats: [Element.Fire, Element.Ice],
    isFieldElement: true, hasResonance: true, resonance: sd({ def: 1 }),
    fieldName: "암석 필드", fieldBadge: "STONE", fieldDesc: "흙먼지와 바위 파편이 낮게 깔립니다.",
    identity: {
      summary: "안정 화력형 · 필드 약화 효과를 받지 않음",
      onHitFieldBonus: 0, onHitMpTax: 0, washout: 0, decayOverride: -1,
      ignoreNegativeFieldEffects: true, investGainBonus: 0,
      dominantSelf: sd({ gain: 6 }), dominantOthers: sd(), dominantText: "바위 카드 필드 누적 +6",
    },
    visual: { color: '#C9854A', themeDark: [0.2, 0.1294, 0.0588], themeBright: [0.7216, 0.4549, 0.2275], mist: [0.851, 0.7059, 0.549], particle: 'Rubble', aura: 'Rock', icon: 'icon_rock' },
  },
  {
    element: Element.Light, label: "빛",
    beats: [Element.Dark],
    isFieldElement: true, hasResonance: false, resonance: sd(),
    fieldName: "광휘 필드", fieldBadge: "RADIANT", fieldDesc: "맑은 빛줄기가 전장을 비춥니다.",
    identity: {
      summary: "안정형 · 필드 약화 효과를 받지 않음 · 어둠 특수 카운터",
      onHitFieldBonus: 0, onHitMpTax: 0, washout: 0, decayOverride: -1,
      ignoreNegativeFieldEffects: true, investGainBonus: 0,
      dominantSelf: sd({ cost: -1 }), dominantOthers: sd(), dominantText: "빛 카드 MP 코스트 -1",
    },
    visual: { color: '#FFE28A', themeDark: [0.2275, 0.1961, 0.0863], themeBright: [0.9608, 0.8471, 0.4471], mist: [1, 0.9569, 0.8], particle: 'Glow', aura: 'Light', icon: 'icon_light' },
  },
  {
    element: Element.Dark, label: "어둠",
    beats: [Element.Water, Element.Fire, Element.Nature, Element.Ice, Element.Rock],
    isFieldElement: true, hasResonance: false, resonance: sd(),
    fieldName: "암흑 필드", fieldBadge: "ABYSS", fieldDesc: "짙은 어둠이 빛을 삼키고 있습니다.",
    identity: {
      summary: "고위험·고보상 · 공격 성공 시 어둠 필드 +3 · 빛에게 큰 반동",
      onHitFieldBonus: 3, onHitMpTax: 0, washout: 0, decayOverride: -1,
      ignoreNegativeFieldEffects: false, investGainBonus: 0,
      dominantSelf: sd({ investGain: 2 }), dominantOthers: sd(), dominantText: "어둠 카드 투자 효율 +2/MP",
    },
    visual: { color: '#A77BFF', themeDark: [0.102, 0.0627, 0.1882], themeBright: [0.4824, 0.3216, 0.8392], mist: [0.4902, 0.4157, 0.6588], particle: 'Wisp', aura: 'Dark', icon: 'icon_dark' },
  },
  {
    element: Element.Unknown, label: "미확정",
    beats: [],
    isFieldElement: false, hasResonance: false, resonance: sd(),
    fieldName: "", fieldBadge: "", fieldDesc: "",
    identity: {
      summary: "",
      onHitFieldBonus: 0, onHitMpTax: 0, washout: 0, decayOverride: -1,
      ignoreNegativeFieldEffects: false, investGainBonus: 0,
      dominantSelf: sd(), dominantOthers: sd(), dominantText: "",
    },
    visual: { color: '#D6C25A', themeDark: [0.1725, 0.1647, 0.0706], themeBright: [0.9098, 0.8118, 0.2706], mist: [0.9529, 0.9176, 0.6902], particle: 'Dust', aura: 'None', icon: 'icon_unknown' },
  },
];

/** 속성 정보가 없을 때(턴 넘김 등) 쓰는 색 */
export const NONE_COLOR = '#7D8A98';

// ============================================================================
//  혼합 필드 (상위 두 속성 조합)  target: All=모든 카드, Pair=상위 두 속성, List=targetElements
// ============================================================================

export interface HybridData extends HybridDef { visual: { themeDark: RGB; themeBright: RGB; mist: RGB } }

export const HYBRIDS: HybridData[] = [
  {
    id: "steam", a: Element.Fire, b: Element.Water, name: "증기 지대", badge: "STEAM",
    description: "불과 물이 부딪혀 뜨거운 증기가 피어오릅니다.", effectText: "모든 카드 DEF -1",
    target: HybridTarget.All, targetElements: [], effect: sd({ def: -1 }),
    visual: { themeDark: [0.1686, 0.1882, 0.2118], themeBright: [0.8471, 0.8667, 0.8902], mist: [0.9098, 0.9294, 0.949] },
  },
  {
    id: "thaw", a: Element.Fire, b: Element.Ice, name: "해빙 증기", badge: "THAW",
    description: "얼음이 녹아내리며 증기가 피어오릅니다.", effectText: "모든 카드 DEF -1",
    target: HybridTarget.All, targetElements: [], effect: sd({ def: -1 }),
    visual: { themeDark: [0.1686, 0.1882, 0.2118], themeBright: [0.8471, 0.902, 0.9333], mist: [0.9333, 0.9569, 0.9725] },
  },
  {
    id: "ember", a: Element.Fire, b: Element.Nature, name: "잿불 정원", badge: "EMBER",
    description: "타오르는 잎사귀 사이로 불씨가 흩날립니다.", effectText: "불·풀 카드 ATK +1",
    target: HybridTarget.List, targetElements: [Element.Fire, Element.Nature], effect: sd({ atk: 1 }),
    visual: { themeDark: [0.2275, 0.1412, 0.0627], themeBright: [0.9098, 0.6039, 0.2275], mist: [0.9412, 0.7529, 0.5412] },
  },
  {
    id: "overgrowth", a: Element.Nature, b: Element.Water, name: "범람 수림", badge: "OVERGROWTH",
    description: "물을 머금은 숲이 전장을 뒤덮습니다.", effectText: "물·풀 카드 DEF +1",
    target: HybridTarget.List, targetElements: [Element.Nature, Element.Water], effect: sd({ def: 1 }),
    visual: { themeDark: [0.0588, 0.2, 0.2], themeBright: [0.2471, 0.7608, 0.6588], mist: [0.6588, 0.9255, 0.8745] },
  },
  {
    id: "molten", a: Element.Fire, b: Element.Rock, name: "용융 대지", badge: "MOLTEN",
    description: "녹아내린 바위가 붉게 끓어오릅니다.", effectText: "불·바위 카드 관통 +1",
    target: HybridTarget.List, targetElements: [Element.Rock, Element.Fire], effect: sd({ pierce: 1 }),
    visual: { themeDark: [0.2392, 0.0784, 0.0471], themeBright: [0.8784, 0.3451, 0.1647], mist: [0.9098, 0.6275, 0.4784] },
  },
];

/** 중립 필드 배경색 (RuleConfig.neutralThemeDark/Bright) */
export const NEUTRAL_THEME = { dark: [0.1058824, 0.1647059, 0.227451] as RGB, bright: [0.2901961, 0.4156863, 0.5490196] as RGB, mist: [0.68, 0.8, 0.89] as RGB };
