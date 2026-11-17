// Port of UI/BattleScreen.cs — builds every layer of the battle screen (1920×1080).
// Fixed layout: P1 (blue) is always on the left, P2 (red) always on the right — the battlefield never swaps or rotates.
// `acting` = whose turn it is to choose (owner of the hand at the bottom). It only drives focus emphasis and where the
// invest panel / matchup hint sit; it never moves anything on the field.
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
import { addUpdate, Img, RT, Txt, v2 } from './engine';
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
  /** 지금 카드를 고르는(손패를 가진) 플레이어. 전장 위치와는 무관 */
  acting = PlayerSlot.P1;

  private battlefield: RT;
  private chargeBtn: Button; private chargeSub: Txt; private chargeRing: Img;
  onCharge: (() => void)[] = [];
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
    this.matchupHint.rt.place(v2(0.5, 0.5), v2(LAYOUT.p1Slot.x + LAYOUT.hintOffset.x, LAYOUT.p1Slot.y + LAYOUT.hintOffset.y), MatchupHint.PanelSize, v2(0.5, 0)); // setActing() 이 현재 슬롯으로 옮김
    this.invest = new InvestPanel(root, lib);
    this.invest.rt.place(v2(0.5, 0.5), v2(LAYOUT.p1Slot.x + LAYOUT.investOffset.x, LAYOUT.p1Slot.y + LAYOUT.investOffset.y), InvestPanel.PanelSize, v2(0.5, 1));
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
    this.handoff = new HandoffOverlay(root, lib);
    this.gameOver = new GameOverOverlay(root, lib);
    this.info = new InfoPanel(root);
    this.matchup = new MatchupPanel(root, lib);
    this.debug = new DebugPanel(root, lib);
    this.layoutFixed();
    this.setActing(PlayerSlot.P1);
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
    const f = focus.v, away = other(this.acting);
    this.slot(this.acting).emphasis = f.mySlot;
    this.slot(away).emphasis = f.enemySlot;
    this.slot(away).rt.groupAlpha = emph(f.enemySlot, 0.72);
    this.slot(this.acting).rt.groupAlpha = 1;
    this.tower(this.acting).emphasis = f.myTower;
    this.tower(away).emphasis = f.enemyTower;
    this.circle.rt.groupAlpha = emph(f.center, 0.4);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = Math.max(0, Math.min(1, this.shakeTime / 0.3));
      this.battlefield.anchoredPosition = v2((Math.random() * 2 - 1) * this.shake * k, (Math.random() * 2 - 1) * this.shake * k);
      if (this.shakeTime <= 0) { this.shake = 0; this.battlefield.anchoredPosition = v2(0, 0); }
    }
  }

  /** P1 = 왼쪽, P2 = 오른쪽. 크기·구조 동일, 한 번만 배치한다. */
  private layoutFixed() {
    const center = v2(0.5, 0.5);
    const ts = LAYOUT.towerScale, ss = LAYOUT.slotScale;
    const sides: [PlayerSlot, typeof LAYOUT.p1Tower, typeof LAYOUT.p1Slot, boolean][] = [
      [PlayerSlot.P1, LAYOUT.p1Tower, LAYOUT.p1Slot, true],
      [PlayerSlot.P2, LAYOUT.p2Tower, LAYOUT.p2Slot, false],
    ];
    for (const [p, towerPos, slotPos, left] of sides) {
      this.tower(p).rt.place(center, towerPos, TowerView.ViewSize, v2(0.5, 0));
      this.tower(p).rt.setScale(ts, ts);
      this.tower(p).setSide(left);
      this.slot(p).rt.place(center, slotPos, SlotView.SlotSize);
      this.slot(p).rt.setScale(ss, ss);
      this.slot(p).setFacing(true); // 두 슬롯 모두 상태 표시는 위쪽
      this.side(p).setSide(left);
    }
    // 양쪽 HUD 는 같은 높이의 위쪽 구석 — P1 왼쪽 / P2 오른쪽 (좌우 거울 구조)
    this.side(PlayerSlot.P1).rt.place(v2(0, 1), v2(LAYOUT.margin, -LAYOUT.margin), PlayerHud.PanelSize, v2(0, 1));
    this.side(PlayerSlot.P2).rt.place(v2(1, 1), v2(-LAYOUT.margin, -LAYOUT.margin), PlayerHud.PanelSize, v2(1, 1));
    this.arena.setTeamColors(this.lib.playerColor(PlayerSlot.P1), this.lib.playerColor(PlayerSlot.P2));
  }

  /** 지금 손패를 가진(카드를 고르는) 플레이어를 알린다 — 전장은 그대로, 강조·투자 패널·상성 힌트만 그 슬롯 쪽으로. */
  setActing(slot: PlayerSlot) {
    this.acting = slot;
    const base = slot === PlayerSlot.P1 ? LAYOUT.p1Slot : LAYOUT.p2Slot;
    const center = v2(0.5, 0.5);
    this.matchupHint.rt.place(center, v2(base.x + LAYOUT.hintOffset.x, base.y + LAYOUT.hintOffset.y), MatchupHint.PanelSize, v2(0.5, 0));
    const left = slot === PlayerSlot.P1, o = LAYOUT.investOffset;
    this.invest.setSide(left);
    this.invest.rt.place(center, v2(base.x + (left ? o.x : -o.x), base.y + o.y), InvestPanel.PanelSize, v2(left ? 0 : 1, 0.5));
  }

  /** 마법이 중앙을 향해 움직이는 가로 방향: P1(왼쪽) → +1, P2(오른쪽) → -1 */
  facing(s: PlayerSlot) { return s === PlayerSlot.P1 ? 1 : -1; }
}
