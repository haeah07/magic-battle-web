// Loads every texture (Unity PNGs + exported procedural UI sprites) and the Korean font, then starts the battle.
import Phaser from 'phaser';
import { preloadSprites, registerSize } from '../ui/sprites';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const w = this.scale.width, h = this.scale.height;
    const bar = this.add.rectangle(w / 2 - 300, h / 2, 2, 6, 0xf2cc7a).setOrigin(0, 0.5);
    this.add.rectangle(w / 2, h / 2, 604, 10).setStrokeStyle(1, 0xf2cc7a, 0.4);
    this.add.text(w / 2, h / 2 - 40, 'MAGIC BATTLE', { fontFamily: 'sans-serif', fontSize: '28px', color: '#f2cc7a' }).setOrigin(0.5);
    this.load.on('progress', (p: number) => bar.setSize(600 * p, 6));
    preloadSprites(this.load);
  }

  async create() {
    // plain white texture used by Image components without a sprite (Unity: Image with no sprite)
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4);
    g.generateTexture('white', 4, 4);
    g.destroy();
    registerSize(this.textures);
    try {
      await Promise.all([document.fonts.load('20px NanumGothic', '가A'), document.fonts.load('20px NanumGothicBold', '가A')]);
    } catch { /* fall back to system Korean fonts */ }
    this.scene.start('Battle');
  }
}
