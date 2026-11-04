// Entry point. Phaser renders the 1920×1080 battle screen (Unity CanvasScaler reference resolution),
// scaled to fit the browser window (16:9 PC layout, letterboxed on other aspect ratios).
import Phaser from 'phaser';
import { REFERENCE } from './config/layout';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: REFERENCE.width,
  height: REFERENCE.height,
  backgroundColor: '#05070c',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
  input: { activePointers: 1 },
  scene: [BootScene, BattleScene],
});
