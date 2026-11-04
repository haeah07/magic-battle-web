// Port of UI/BattleScreen.cs — builds every layer of the battle screen (1920×1080, top/bottom diagonal layout).
// Home (viewer) = bottom: tower bottom-left, slot lower-centre, hand bottom-centre. Away = top: tower top-right.
import { LAYOUT } from '../config/layout';
import { THEME } from '../config/theme';
import { VFX } from '../config/vfx';
import { FieldState } from '../core/field';
import { other, PlayerSlot } from '../core/types';
import { VisualLibrary } from '../game/visuals';
import { ArenaView, BackgroundView, FieldCircleView } from '../vfx/arena';
import { FieldEnvironmentView } from '../vfx/environment';
import { SpellVfx } from '../vfx/spellVfx';
import { CardView } from './cardView';
import { C } from './color';
import { addUpdate, RT, Txt, v2 } from './engine';
import { makeImage, makeText, rect, rtOf } from './factory';
import { HandView } from './handView';
import { ActionBar, BannerView, BattleLog, FieldHud, FloatingTextLayer, InvestPanel, MatchupHint, PlayerHud, ResultStrip, TopBar } from './hud';
import { DebugPanel, GameOverOverlay, HandoffOverlay, InfoPanel, MatchupPanel } from './overlays';
import { SlotView } from './slotView';
import { SF } from './sprites';
import { TowerView } from './towerView';

export class BattleScreen {
  readonly root: RT;
  background: BackgroundView;
  arena: ArenaView;
  environment: FieldEnvironmentView;
  circle: FieldCircleView;
  sideP1: PlayerHud; sideP2: PlayerHud;
  towerP1: TowerView; towerP2: TowerView;
  slotP1: SlotView; slotP2: SlotView;
  field: FieldHud;
  topBar: TopBar;
  log: BattleLog;
  hand: HandView;
  actionBar: ActionBar;
  invest: InvestPanel;
  matchupHint: MatchupHint;
  vfx: SpellVfx;
  floating: FloatingTextLayer;
  banner: BannerView;
  result: ResultStrip;
  dragLayer: RT;
  handoff: HandoffOverlay;
  gameOver: GameOverOverlay;
  info: InfoPanel;
  matchup: MatchupPanel;
  debug: DebugPanel;
  toast: Txt;
  home = PlayerSlot.P1;

  private battlefield: RT;
  private shake = 0;
  private shakeTime = 0;

  tower(s: PlayerSlot) { return s === PlayerSlot.P1 ? this.towerP1 : this.towerP2; }
  slot(s: PlayerSlot) { return s === PlayerSlot.P1 ? this.slotP1 : this.slotP2; }
  side(s: PlayerSlot) { return s === PlayerSlot.P1 ? this.sideP1 : this.sideP2; }
  get clashRect() { return this.circle.core; }

  constructor(root: RT, private lib: VisualLibrary) {
    this.root = root;
    // ---- world layers (back to front)
    this.background = new BackgroundView(root, lib);
    this.battlefield = rect('Battlefield', root).stretch();
    this.arena = new ArenaView(this.battlefield, lib);
    this.circle = new FieldCircleView(this.battlefield, lib);
    this.environment = new FieldEnvironmentView(this.battlefield, lib);
    this.towerP1 = new TowerView(this.battlefield, lib, PlayerSlot.P1);
    this.towerP2 = new TowerView(this.battlefield, lib, PlayerSlot.P2);
    this.slotP1 = new SlotView(this.battlefield, lib, PlayerSlot.P1);
    this.slotP2 = new SlotView(this.battlefield, lib, PlayerSlot.P2);
    // very light world vignette (under the towers so HUD/card text is never darkened)
    const vignette = makeImage('WorldVignette', this.battlefield, C(0.01, 0.01, 0.03, 0.32), SF.vignette());
    vignette.rt.stretch(-260, -260, -160, -160);
    vignette.rt.setSiblingIndex(this.towerP1.rt.siblingIndex());

    // ---- HUD (edges)
    this.sideP1 = new PlayerHud(root, lib, PlayerSlot.P1);
    this.sideP2 = new PlayerHud(root, lib, PlayerSlot.P2);
    this.topBar = new TopBar(root, lib);
    this.field = new FieldHud(root, lib, lib.content);
    this.field.rt.place(v2(0.5, 1), v2(0, -LAYOUT.fieldHudTop), FieldHud.PanelSize, v2(0.5, 1));
    this.log = new BattleLog(root);
    this.log.rt.place(v2(0, 1), v2(LAYOUT.margin + 4, -LAYOUT.battleLogTop), BattleLog.PanelSize, v2(0, 1));

    this.matchupHint = new MatchupHint(root, lib);
    this.matchupHint.rt.place(v2(0.5, 0.5), v2(LAYOUT.homeSlot.x + LAYOUT.hintOffset.x, LAYOUT.homeSlot.y + LAYOUT.hintOffset.y), MatchupHint.PanelSize, v2(1, 0.5));
    this.invest = new InvestPanel(root, lib);
    this.invest.rt.place(v2(0.5, 0.5), v2(LAYOUT.homeSlot.x + LAYOUT.investOffset.x, LAYOUT.homeSlot.y + LAYOUT.investOffset.y), InvestPanel.PanelSize, v2(0, 0.5));
    this.actionBar = new ActionBar(root, lib);
    this.actionBar.rt.place(v2(1, 0), v2(-LAYOUT.margin, LAYOUT.margin - 6), ActionBar.PanelSize, v2(1, 0));

    const handRoot = rect('HandArea', root).place(v2(0.5, 0), v2(0, LAYOUT.handCenterFromBottom), v2(LAYOUT.handWidth, CardView.Size.y));
    handRoot.setScale(LAYOUT.handScale, LAYOUT.handScale);
    this.dragLayer = rect('DragLayer', root).stretch();
    this.hand = new HandView(handRoot, lib, this.dragLayer);
    this.hand.rt.stretch();
    this.hand.maxWidth = LAYOUT.handWidth;

    this.vfx = new SpellVfx(root, lib);
    this.floating = new FloatingTextLayer(root);
    this.result = new ResultStrip(root);
    this.banner = new BannerView(root);

    this.toast = makeText('Toast', root, '', 22, THEME.accentColor, 'MiddleCenter', true).shadowed(0.9);
    rtOf(this.toast).place(v2(0.5, 0.5), v2(0, LAYOUT.toastY), v2(1000, 36));

    this.dragLayer.setAsLastSibling();
    this.handoff = new HandoffOverlay(root, lib);
    this.gameOver = new GameOverOverlay(root, lib);
    this.info = new InfoPanel(root);
    this.matchup = new MatchupPanel(root, lib);
    this.debug = new DebugPanel(root, lib);
    this.setPerspective(PlayerSlot.P1);
    addUpdate({ rt: root, update: dt => this.update(dt) });
  }

  /** Field state changes the whole arena: HUD readout, floor circle, environment overlays, colour grading. */
  renderField(state: FieldState, instant: boolean) {
    this.field.render(state);
    this.circle.render(state, instant);
    this.environment.render(state, instant);
    const theme = this.lib.fieldTheme(state);
    this.background.apply(theme);
    this.arena.apply(theme);
  }

  shakeScreen(strength: number, duration = 0.3) {
    strength *= VFX.shake;
    if (strength <= 0) return;
    this.shake = Math.max(this.shake, strength);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  private update(dt: number) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = Math.max(0, Math.min(1, this.shakeTime / 0.3));
      this.battlefield.anchoredPosition = v2((Math.random() * 2 - 1) * this.shake * k, (Math.random() * 2 - 1) * this.shake * k);
      if (this.shakeTime <= 0) { this.shake = 0; this.battlefield.anchoredPosition = v2(0, 0); }
    }
  }

  setPerspective(home: PlayerSlot) {
    this.home = home;
    const away = other(home);
    const center = v2(0.5, 0.5);
    this.tower(home).rt.place(center, LAYOUT.homeTower, TowerView.ViewSize, v2(0.5, 0));
    this.tower(home).rt.setScale(LAYOUT.homeTowerScale, LAYOUT.homeTowerScale);
    this.tower(away).rt.place(center, LAYOUT.awayTower, TowerView.ViewSize, v2(0.5, 0));
    this.tower(away).rt.setScale(LAYOUT.awayTowerScale, LAYOUT.awayTowerScale);
    this.tower(home).setSide(true);
    this.tower(away).setSide(false);

    this.slot(home).rt.place(center, LAYOUT.homeSlot, SlotView.SlotSize);
    this.slot(home).rt.setScale(LAYOUT.homeSlotScale, LAYOUT.homeSlotScale);
    this.slot(away).rt.place(center, LAYOUT.awaySlot, SlotView.SlotSize);
    this.slot(away).rt.setScale(LAYOUT.awaySlotScale, LAYOUT.awaySlotScale);
    this.slot(home).setFacing(true);
    this.slot(away).setFacing(false);

    this.side(home).rt.place(v2(0, 0), v2(LAYOUT.margin, LAYOUT.margin), PlayerHud.PanelSize, v2(0, 0));
    this.side(away).rt.place(v2(1, 1), v2(-LAYOUT.margin, -LAYOUT.margin), PlayerHud.PanelSize, v2(1, 1));
    this.side(home).setSide(true);
    this.side(away).setSide(false);

    this.arena.setPerspective(this.lib.playerColor(home), this.lib.playerColor(away));
  }

  /** home spells travel upward, away spells downward */
  facing(s: PlayerSlot) { return s === this.home ? 1 : -1; }
}
