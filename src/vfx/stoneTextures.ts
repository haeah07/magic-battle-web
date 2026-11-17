// Procedural stone textures for the arena set dressing (castle walls, parapet, banners, skyline).
// Drawn once with a 2D canvas at boot and used as ordinary Images — no new rendering system.
import Phaser from 'phaser';
import { makeCanvasSprite } from '../ui/sprites';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** brick courses inside [x0,x1]×[y0,y1] */
function bricks(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, bw: number, bh: number, rnd: () => number, base: [number, number, number], jitter = 14) {
  const r = rnd;
  let row = 0;
  for (let y = y0; y < y1; y += bh, row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = x0 - off; x < x1; x += bw) {
      const j = (r() - 0.5) * jitter;
      const k = 1 - (y - y0) / Math.max(1, y1 - y0) * 0.0;
      ctx.fillStyle = `rgb(${Math.round(base[0] * k + j)},${Math.round(base[1] * k + j)},${Math.round(base[2] * k + j * 1.2)})`;
      const bx = Math.max(x0, x), bxe = Math.min(x1, x + bw);
      ctx.fillRect(bx, y, bxe - bx, Math.min(bh, y1 - y));
      // mortar + top highlight
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(bx, y + bh - 2, bxe - bx, 2);
      if (x >= x0) ctx.fillRect(x, y, 2, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(bx, y, bxe - bx, 1);
    }
  }
}

export function createStoneTextures(textures: Phaser.Textures.TextureManager) {
  // ---- castle wall with crenellations (512×320), merlons on top, transparent gaps
  makeCanvasSprite(textures, 'wall', 512, 320, (ctx, w, h) => {
    const r = rng(7);
    const top = 70, merlonW = 64, gap = 40;
    bricks(ctx, 0, top, w, h, 56, 24, r, [58, 60, 76]);
    for (let x = 14; x < w; x += merlonW + gap) {
      bricks(ctx, x, 22, Math.min(w, x + merlonW), top, 32, 24, r, [64, 66, 84]);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(x, 22, Math.min(merlonW, w - x), 2);
    }
    // cornice line under the merlons
    ctx.fillStyle = 'rgba(20,20,32,0.7)'; ctx.fillRect(0, top - 4, w, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, top - 4, w, 2);
    // vertical falloff: lighter on top, deep shadow at the foot
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, top, w, h - top);
    // arrow slits
    for (const sx of [120, 256, 392]) {
      ctx.fillStyle = 'rgba(6,8,16,0.9)'; ctx.fillRect(sx - 7, 130, 14, 52);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx - 9, 126, 18, 4);
    }
  });
  // ---- low parapet wall (1024×128), tileable
  makeCanvasSprite(textures, 'parapet', 1024, 128, (ctx, w, h) => {
    const r = rng(21);
    const top = 40;
    bricks(ctx, 0, top, w, h, 48, 22, r, [52, 54, 70]);
    for (let x = 0; x < w; x += 96) {
      bricks(ctx, x + 8, 8, x + 64, top, 28, 16, r, [60, 62, 80]);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x + 8, 8, 56, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, top - 3, w, 5);
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, top, w, h - top);
  });
  // ---- banner (white body so it can be tinted with the team colour), swallow-tail
  makeCanvasSprite(textures, 'banner', 128, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgb(230,230,235)'); g.addColorStop(1, 'rgb(150,150,165)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(w - 6, 0); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w / 2, h - 58); ctx.lineTo(6, h - 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,150,0.9)'; ctx.lineWidth = 4; ctx.stroke();
    // emblem: diamond with inner cross
    ctx.strokeStyle = 'rgba(255,235,170,0.85)'; ctx.lineWidth = 3;
    const cx = w / 2, cy = h * 0.40;
    ctx.beginPath(); ctx.moveTo(cx, cy - 34); ctx.lineTo(cx + 24, cy); ctx.lineTo(cx, cy + 34); ctx.lineTo(cx - 24, cy); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.stroke();
    // cloth folds
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (const fx of [w * 0.3, w * 0.7]) ctx.fillRect(fx - 2, 8, 4, h - 80);
  });
  // ---- distant gothic skyline (white silhouette, tinted at runtime)
  makeCanvasSprite(textures, 'skyline', 1920, 300, (ctx, w, h) => {
    const r = rng(99);
    ctx.fillStyle = 'rgb(255,255,255)';
    let x = -20;
    while (x < w) {
      const bw = 50 + r() * 90, bh = 70 + r() * 150;
      ctx.fillRect(x, h - bh, bw, bh);
      if (r() > 0.45) { // pointed roof / spire
        ctx.beginPath(); ctx.moveTo(x + 6, h - bh); ctx.lineTo(x + bw / 2, h - bh - 40 - r() * 70); ctx.lineTo(x + bw - 6, h - bh); ctx.closePath(); ctx.fill();
      } else if (r() > 0.5) { // crenellated top
        for (let m = 0; m < bw - 10; m += 18) ctx.fillRect(x + 4 + m, h - bh - 12, 10, 12);
      }
      x += bw + 6 + r() * 30;
    }
    // fade the base into the mist and the very top away
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createLinearGradient(0, h * 0.6, 0, h);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g2; ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.globalCompositeOperation = 'source-over';
  });
}
