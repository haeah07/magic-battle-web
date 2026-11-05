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
import { emph, focus } from '../vfx/focus';
import { CardView, MANA_COLOR } from './cardView';
import { C } from './color';
import { addUpdate, CoOwner, Img, RT, Time, Txt, v2 } from './engine';
import { Button, buttonFx, makeButton, makeImage, makeOutline, makeText, rect, rtOf } from './factory';
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
  private chargeBtn: Button; private chargeSub: Txt; private chargeRing: Img;
  onCharge: (() => void)[] = [];
  private blocker: Img;
  private swapCo = new CoOwner();
  private floorAngle = 0;
  get swapping() { return this.blocker.rt.active; }
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
    this.matchupHint.rt.place(v2(0.5, 0.5), v2(LAYOUT.homeSlot.x + LAYOUT.hintOffset.x, LAYOUT.homeSlot.y + LAYOUT.hintOffset.y), MatchupHint.PanelSize, v2(0.5, 0));
    this.invest = new InvestPanel(root, lib);
    this.invest.rt.place(v2(0.5, 0.5), v2(LAYOUT.homeSlot.x + LAYOUT.investOffset.x, LAYOUT.homeSlot.y + LAYOUT.investOffset.y), InvestPanel.PanelSize, v2(0.5, 1));
    this.actionBar = new ActionBar(root, lib);
    this.actionBar.rt.place(v2(1, 0), v2(-LAYOUT.margin, LAYOUT.margin - 6), ActionBar.PanelSize, v2(1, 0));
    // 실험 '충전': 카드와 같은 무게의 행동 버튼 (제출 버튼 위)
    this.chargeBtn = makeButton('Charge', root, '충전 +2 MP', () => this.onCharge.forEach(f => f()), C(0.2, 0.42, 0.75, 0.92), 22);
    this.chargeBtn.rt.place(v2(1, 0), v2(-LAYOUT.margin - ActionBar.PanelSize.x / 2, LAYOUT.margin + ActionBar.PanelSize.y + 12), v2(260, 66), v2(0.5, 0));
    rtOf(this.chargeBtn.label!).stretch(8, 8, 6, 22);
    this.chargeSub = makeText('Sub', this.chargeBtn.rt, '이번 턴 공격하지 않습니다', 14, C(0.82, 0.9, 1, 0.85), 'MiddleCenter');
    rtOf(this.chargeSub).stretch(8, 8, 40, 6);
    this.chargeSub.wrap = false;
    this.chargeRing = makeOutline(this.chargeBtn.rt, MANA_COLOR, 14, 3);
    buttonFx(this.chargeBtn);
    this.chargeBtn.rt.setActive(false);

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
    // input lock during the turn-swap rotation (invisible, blocks clicks on hand / buttons)
    this.blocker = makeImage('TurnSwapBlocker', root, C(0, 0, 0, 0.002), null, false, true);
    this.blocker.rt.stretch();
    this.blocker.rt.setActive(false);
    this.handoff = new HandoffOverlay(root, lib);
    this.gameOver = new GameOverOverlay(root, lib);
    this.info = new InfoPanel(root);
    this.matchup = new MatchupPanel(root, lib);
    this.debug = new DebugPanel(root, lib);
    this.setPerspective(PlayerSlot.P1);
    focus.reset('choosing');
    addUpdate({ rt: root, update: dt => this.update(dt) });
  }

  /** 실험 '충전' 버튼: 보이기 / 선택됨 표시 */
  setChargeButton(show: boolean, selected: boolean) {
    this.chargeBtn.rt.setActive(show);
    this.chargeBtn.img.color = selected ? C(0.35, 0.7, 1, 1) : C(0.2, 0.42, 0.75, 0.92);
    this.chargeRing.color = C(MANA_COLOR.r, MANA_COLOR.g, MANA_COLOR.b, selected ? 1 : 0.35);
    this.chargeBtn.setLabel(selected ? '충전 선택됨' : '충전 +2 MP');
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
    // stage focus: my hand → my card → centre → enemy card → enemy tower
    focus.update(dt);
    const f = focus.v, away = other(this.home);
    this.slot(this.home).emphasis = f.mySlot;
    this.slot(away).emphasis = f.enemySlot;
    this.slot(away).rt.groupAlpha = emph(f.enemySlot, 0.72);
    this.slot(this.home).rt.groupAlpha = 1;
    this.tower(this.home).emphasis = f.myTower;
    this.tower(away).emphasis = f.enemyTower;
    this.circle.rt.groupAlpha = emph(f.center, 0.4);
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
    this.slot(away).setFacing(true); // v8: 좌우 배치 → 두 슬롯 모두 상태 표시는 위쪽

    this.side(home).rt.place(v2(0, 0), v2(LAYOUT.margin, LAYOUT.margin), PlayerHud.PanelSize, v2(0, 0));
    this.side(away).rt.place(v2(1, 1), v2(-LAYOUT.margin, -LAYOUT.margin), PlayerHud.PanelSize, v2(1, 1));
    this.side(home).setSide(true);
    this.side(away).setSide(false);

    this.arena.setPerspective(this.lib.playerColor(home), this.lib.playerColor(away));
  }

  /**
   * Turn swap (hot-seat): the battlefield turns ~180° so the player who acts next is always on the left.
   * Towers and slots travel around the arena floor (one behind, one in front) while the floor art rotates.
   * HUD, hand and buttons are not rotated. Input is blocked while it plays.
   */
  swapPerspective(home: PlayerSlot, animate: boolean) {
    if (!animate || home === this.home) {
      this.swapCo.stopAll();
      this.blocker.rt.setActive(false);
      this.applyTurn(this.floorAngle, 0);
      this.setPerspective(home);
      return;
    }
    const oldHome = this.home;
    const objs = [this.towerP1.rt, this.towerP2.rt, this.slotP1.rt, this.slotP2.rt];
    const snap = () => objs.map(r => ({ p: { ...r.anchoredPosition }, s: r.localScale.x }));
    const from = snap();
    this.setPerspective(home);
    const to = snap();
    // lanes/pads keep the old colours until the halfway point (hidden by the fade), then switch
    this.arena.setPerspective(this.lib.playerColor(oldHome), this.lib.playerColor(other(oldHome)));
    this.swapCo.stopAll();
    this.blocker.rt.setActive(true);
    this.blocker.rt.setAsLastSibling();
    const a0 = this.floorAngle;
    this.floorAngle = (this.floorAngle - 180) % 360; // clockwise, like the towers' orbit
    const started = Time.t;
    this.swapCo.start(async co => {
      const d = Math.max(0.05, LAYOUT.turnSwapSeconds);
      let switched = false;
      try {
        // one shared progress value drives everything: towers, slots, floor, centre circle, lanes
        for (let t = 0; t < d; t = Time.t - started) {
          const u = Math.min(1, t / d), k = u * u * (3 - 2 * u), e = Math.sin(Math.PI * k);
          const ang = Math.PI * k; // 0 → 180°
          objs.forEach((r, i) => {
            const a = from[i], b = to[i];
            // orbit on the floor ellipse, clockwise seen from above: left → back → right, right → front → left
            const cx = (a.p.x + b.p.x) / 2, rx = (a.p.x - b.p.x) / 2, ry = Math.abs(rx) * 0.42;
            const back = b.p.x > a.p.x ? 1 : -1;
            r.anchoredPosition = v2(cx + rx * Math.cos(ang), a.p.y + (b.p.y - a.p.y) * k + Math.sin(ang) * ry * back);
            const s = (a.s + (b.s - a.s) * k) * (1 - 0.18 * Math.sin(ang) * back); // farther = smaller
            r.setScale(s, s);
          });
          if (!switched && k >= 0.5) { switched = true; this.arena.setPerspective(this.lib.playerColor(home), this.lib.playerColor(other(home))); }
          this.applyTurn(a0 - 180 * k, e);
          await co.frame();
        }
      } finally {
        if (co.alive) {
          objs.forEach((r, i) => { r.anchoredPosition = to[i].p; r.setScale(to[i].s, to[i].s); });
          this.arena.setPerspective(this.lib.playerColor(home), this.lib.playerColor(other(home)));
          this.applyTurn(this.floorAngle, 0);
          this.blocker.rt.setActive(false);
        }
      }
    });
  }

  private applyTurn(deg: number, fade: number) {
    this.arena.setTurn(deg, fade);
    this.circle.turnAngle = deg;
  }

  /** home spells travel upward, away spells downward */
  facing(s: PlayerSlot) { return s === this.home ? 1 : -1; }
}
