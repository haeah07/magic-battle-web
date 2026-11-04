// Port of Game/VisualLibrary.cs — maps game data to colours / sprites.
import { THEME } from '../config/theme';
import { GameContent } from '../core/content';
import { FieldModeType, FieldState, fieldMode } from '../core/field';
import { Element, PlayerSlot } from '../core/types';
import { cardArtCrop, ELEMENTS, HYBRIDS } from '../data';
import { AuraStyle, NEUTRAL_THEME, ParticleStyle } from '../data/elements';
import { CARDS } from '../data/cards';
import { C, Color, fromRGB, hex } from '../ui/color';
import { art, SpriteRef } from '../ui/sprites';

export interface FieldTheme {
  dark: Color;
  bright: Color;
  mist: Color;
  intensity: number;
  particleA: ParticleStyle;
  particleB: ParticleStyle;
  particleColorA: Color;
  particleColorB: Color;
  unstable: boolean;
}

export interface TowerStage { label: string; minHpRatio: number; sprite: SpriteRef | null }
export interface TowerVisual { accentColor: Color; stages: TowerStage[]; destroyed: TowerStage }

const DEFAULT_HEX: Record<number, string> = {
  [Element.Water]: '#3D9BFF', [Element.Fire]: '#FF7448', [Element.Nature]: '#6EDB8A', [Element.Ice]: '#9FE3FF',
  [Element.Rock]: '#C9854A', [Element.Light]: '#FFE28A', [Element.Dark]: '#A77BFF', [Element.Unknown]: '#D6C25A', [Element.None]: '#7D8A98',
};

export class VisualLibrary {
  readonly theme = THEME;
  private towers: TowerVisual[];
  constructor(readonly content: GameContent) {
    const mk = (p: string, accent: Color): TowerVisual => ({
      accentColor: accent,
      stages: [
        { label: '온전함', minHpRatio: 0.76, sprite: art.tower(`tower_${p}_intact`) },
        { label: '균열', minHpRatio: 0.51, sprite: art.tower(`tower_${p}_cracked`) },
        { label: '파손', minHpRatio: 0.26, sprite: art.tower(`tower_${p}_damaged`) },
        { label: '붕괴 직전', minHpRatio: 0.01, sprite: art.tower(`tower_${p}_critical`) },
      ],
      destroyed: { label: '파괴됨', minHpRatio: 0, sprite: art.tower(`tower_${p}_destroyed`) },
    });
    this.towers = [mk('p1', C(0.4352941, 0.6980392, 1)), mk('p2', C(1, 0.5411765, 0.4470588))];
  }

  private elementData(e: Element) { return ELEMENTS.find(x => x.element === e); }

  elementColor(e: Element): Color {
    const d = this.elementData(e);
    return hex(d ? d.visual.color : DEFAULT_HEX[e] ?? '#FFFFFF');
  }
  elementIcon(e: Element): SpriteRef | null {
    const d = this.elementData(e);
    return d && d.visual.icon ? art.icon(d.visual.icon) : null;
  }
  elementGlyph(e: Element): string {
    if (e === Element.Unknown) return '?';
    if (e === Element.None) return '–';
    const l = this.elementLabel(e);
    return l ? l.substring(0, 1) : '?';
  }
  elementLabel(e: Element) { return this.content.label(e); }
  cardArt(id: string): SpriteRef | null {
    const c = CARDS.find(x => x.id === id);
    return c && c.art ? art.card(c.art) : null;
  }
  artCrop(id: string) { return cardArtCrop(id); }
  auraStyle(e: Element): AuraStyle { return this.elementData(e)?.visual.aura ?? 'None'; }
  playerColor(s: PlayerSlot) { return s === PlayerSlot.P1 ? THEME.p1Color : THEME.p2Color; }
  tower(s: PlayerSlot) { return this.towers[s]; }
  get gold() { return THEME.goldColor; }

  towerStageIndex(t: TowerVisual, hp: number, maxHp: number) {
    if (hp <= 0) return t.stages.length;
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    for (let i = 0; i < t.stages.length; i++) if (ratio >= t.stages[i].minHpRatio) return i;
    return t.stages.length - 1;
  }
  towerStage(t: TowerVisual, i: number) { return i >= t.stages.length ? t.destroyed : t.stages[Math.max(0, Math.min(t.stages.length - 1, i))]; }

  /** Port of VisualLibrary.Theme(field) */
  fieldTheme(field: FieldState): FieldTheme {
    const mode = fieldMode(this.content, field);
    const t: FieldTheme = {
      dark: fromRGB(NEUTRAL_THEME.dark), bright: fromRGB(NEUTRAL_THEME.bright), mist: fromRGB(NEUTRAL_THEME.mist), intensity: 0,
      particleA: 'Dust', particleB: 'Dust', particleColorA: C(1, 1, 1), particleColorB: C(1, 1, 1), unstable: false,
    };
    let top = 0;
    for (const v of field.values) top = Math.max(top, v);
    t.intensity = Math.max(0, Math.min(1, top / 80));
    const a = mode.top !== Element.None ? this.elementData(mode.top) : undefined;
    const b = mode.second !== Element.None ? this.elementData(mode.second) : undefined;
    if (a) { t.particleA = a.visual.particle; t.particleColorA = hex(a.visual.color); }
    if (b) { t.particleB = b.visual.particle; t.particleColorB = hex(b.visual.color); }
    else { t.particleB = t.particleA; t.particleColorB = t.particleColorA; }
    switch (mode.type) {
      case FieldModeType.Dominant:
        if (a) { t.dark = fromRGB(a.visual.themeDark); t.bright = fromRGB(a.visual.themeBright); t.mist = fromRGB(a.visual.mist); }
        else t.bright = this.elementColor(mode.top);
        break;
      case FieldModeType.Hybrid: {
        const h = HYBRIDS.find(x => x.id === mode.hybrid?.id);
        if (h) { t.dark = fromRGB(h.visual.themeDark); t.bright = fromRGB(h.visual.themeBright); t.mist = fromRGB(h.visual.mist); }
        break;
      }
      case FieldModeType.Unstable:
        t.unstable = true;
        if (a) t.dark = fromRGB(a.visual.themeDark);
        t.bright = b ? fromRGB(b.visual.themeBright) : t.bright;
        if (a) t.mist = fromRGB(a.visual.mist);
        break;
    }
    return t;
  }
}
