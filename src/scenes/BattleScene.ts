// Port of Game/MagicBattleBootstrap.cs — wires data → MatchAuthority → client → controller → screen.
// Modes: 'hotseat' (one screen, two players, handoff overlay) or 'bot' (online-preview: P1 vs remote-style bot).
// URL options: ?mode=bot  ?seed=1234  ?debug=0 (hide the debug button)
import Phaser from 'phaser';
import { REFERENCE } from '../config/layout';
import { MatchAuthority } from '../core/match';
import { PlayerSlot } from '../core/types';
import { buildContent } from '../data';
import { BattleController, newSeed } from '../game/controller';
import { VisualLibrary } from '../game/visuals';
import { IMatchClient, LocalMatchClient, RemoteBotOpponent } from '../net/client';
import { BattleScreen } from '../ui/battleScreen';
import { installDragTracking, resetDragTracking } from '../ui/cardView';
import { applyVfx, DebugDrawer, loadSettings, MatchMode, saveSettings, StoredSettings } from '../ui/debugDrawer';
import { frameLayout, initEngine, RT, tick } from '../ui/engine';

let drawer: DebugDrawer | null = null;

export class BattleScene extends Phaser.Scene {
  controller!: BattleController;
  screenUi!: BattleScreen;
  authority!: MatchAuthority;
  constructor() { super('Battle'); }

  create() {
    initEngine(this);
    const params = new URLSearchParams(location.search);
    const settings = loadSettings();
    applyVfx(settings);
    let content = buildContent(settings.data);
    const problems = content.validate();
    if (problems.length > 0) {
      console.warn('[MagicBattle] 데이터 문제 — 기본 데이터로 실행합니다:\n' + problems.join('\n'));
      content = buildContent();
    }
    const lib = new VisualLibrary(content);
    const root = RT.root(REFERENCE.width, REFERENCE.height);
    this.screenUi = new BattleScreen(root, lib);

    const mode: MatchMode = params.get('mode') === 'bot' ? 'bot' : params.get('mode') === 'hotseat' ? 'hotseat' : settings.mode;
    const seedParam = Number(params.get('seed'));
    const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : newSeed();
    this.authority = new MatchAuthority(content, content.rules.defaultOptions);
    let client: IMatchClient;
    if (mode === 'bot') {
      client = new LocalMatchClient(this.authority, PlayerSlot.P1);
      new RemoteBotOpponent(this.authority, PlayerSlot.P2, seed);
    } else client = new LocalMatchClient(this.authority, PlayerSlot.P1, PlayerSlot.P2);

    this.controller = new BattleController(client, lib, this.screenUi, seed, params.get('debug') !== '0', settings);
    this.controller.onSettingsChanged.push(s => {
      const cur = loadSettings();
      saveSettings({ ...cur, ...s });
    });

    drawer ??= new DebugDrawer(settings);
    drawer.bind({
      apply: (s: StoredSettings) => { drawer!.close(); this.scene.restart(); void s; },
      liveChanged: (s: StoredSettings) => { applyVfx(s); this.controller.speed = s.speed; },
      toggleAutoPlay: () => this.controller.toggleAutoPlay(),
      isAutoPlaying: () => this.controller.isAutoPlaying,
    });
    this.controller.onEditValues.push(() => { this.screenUi.debug.hide(); drawer!.open(); });

    resetDragTracking();
    const canvas = this.game.canvas;
    installDragTracking((cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left) * REFERENCE.width / r.width, y: (cy - r.top) * REFERENCE.height / r.height };
    });
    frameLayout();
    // test/automation hook: world position of the first active RectTransform with this name
    const find = (name: string, r: RT = root): RT | null => {
      if (!r.active) return null;
      if (r.name === name) return r;
      for (const c of r.children) { const f = find(name, c); if (f) return f; }
      return null;
    };
    const press = (name: string) => {
      const r = find(name);
      const o = r?.graphic?.obj as Phaser.GameObjects.GameObject | undefined;
      if (!o) return false;
      const p = { x: 0, y: 0 };
      o.emit('pointerover', p); o.emit('pointerdown', p); o.emit('pointerup', p); o.emit('pointerout', p);
      return true;
    };
    // ?manual=1 → time only advances through magicBattle.step(n) (fixed 1/30 s, like the Unity reference renderer)
    this.manual = params.get('manual') === '1';
    const step = async (n: number, dt = 1 / 30) => {
      // let the coroutine continuations (promise microtasks) run after every frame, like separate browser frames
      for (let i = 0; i < n; i++) { tick(dt); for (let k = 0; k < 24; k++) await Promise.resolve(); frameLayout(); }
    };
    (window as any).magicBattle = { scene: this, controller: this.controller, authority: this.authority, drawer, find, press, step, pos: (n: string) => find(n)?.worldPosition() ?? null };
  }

  private manual = false;
  override update(_time: number, _delta: number) {
    if (this.manual) { frameLayout(); return; }
    // Unity uses Time.unscaledDeltaTime: real elapsed time (Phaser's delta is smoothed), capped for tab switches
    tick(Math.min(0.25, this.game.loop.rawDelta / 1000));
    frameLayout();
  }
}
