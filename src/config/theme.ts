// Port of UITheme.asset (Unity v6 values). Colours of the whole UI live here.
import { C } from '../ui/color';

export const THEME = {
  p1Color: C(0.4352941, 0.6980392, 1),
  p2Color: C(1, 0.5411765, 0.4470588),
  panelColor: C(0.05, 0.08, 0.12, 0.86),
  panelBorderColor: C(1, 1, 1, 0.12),
  textColor: C(0.93, 0.95, 0.97),
  mutedTextColor: C(0.55, 0.6, 0.66),
  accentColor: C(0.94, 0.83, 0.43),
  positiveColor: C(0.47, 0.89, 0.61),
  negativeColor: C(1, 0.5, 0.42),
  buttonColor: C(0.42, 0.35, 0.85),
  goldColor: C(0.95, 0.8, 0.48),
  /** UITheme.animationSpeed */
  animationSpeed: 1,
  /** show the "pass the screen" overlay in hot-seat */
  showHandoffScreen: true,
  /** BackgroundView ambient particles */
  ambientParticles: 56,
};
export type Theme = typeof THEME;
