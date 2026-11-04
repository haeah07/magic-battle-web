// Port of Game/BattleController.cs — turns UI input into commands for the IMatchClient and renders state.
// Flow: UI input → SubmitCardCommand → MatchAuthority judges → RoundResult → BattlePresenter plays it.
// The controller never computes damage or field gain itself; previews use the same core functions as the authority.
import { THEME } from '../config/theme';
import { VFX } from '../config/vfx';
import { PlayTerms, preview, terms, termsFromMods } from '../core/combat';
import { fieldInfo } from '../core/field';
import { botChoose, cardCommand, CardInstance, fieldChanged, MatchPhase, MatchOutcome, passCommand, playOf, PrivatePlayerView, PublicMatchState, PublicPlayerState, RoundResult, SubmitCardCommand } from '../core/match';
import { outcomeFailed } from '../core/battle';
import { DeterministicRandom } from '../core/random';
import { CardDef, CombatStats, Element, other, PlayerSlot, slotLabel, TestRuleOptions } from '../core/types';
import { GameContent } from '../core/content';
import { IMatchClient } from '../net/client';
import { BattleScreen } from '../ui/battleScreen';
import { CardView } from '../ui/cardView';
import { C, Color, colorize } from '../ui/color';
import { Co, CoOwner, V2 } from '../ui/engine';
import { BattlePresenter } from './presenter';
import { roundDetail, fieldDetail } from './detail';
import { runSelfTest } from './selfTest';
import { VisualLibrary } from './visuals';

enum Step { Choosing, Handoff, Submitting, WaitingOpponent, Presenting, Result, GameOver }

let seedCounter = 0;
export const newSeed = () => (Date.now() ^ Math.imul(++seedCounter, 0x2545f491)) & 0x7fffffff;
const pad2 = (n: number) => String(n).padStart(2, '0');
const nameOf = (s: PlayerSlot) => (s === PlayerSlot.P1 ? 'PLAYER 1' : 'PLAYER 2');

export interface ControllerSettings { speed: number; handoff: boolean; perspectiveFollowsTurn: boolean }

export class BattleController {
  private content: GameContent;
  private presenter: BattlePresenter;
  private step = Step.Choosing;
  private active = PlayerSlot.P1;
  private viewer = PlayerSlot.P1;
  private selection = new Map<PlayerSlot, string>();
  private handOrder = new Map<PlayerSlot, string[]>();
  private extra = new Map<PlayerSlot, number>();
  private wired = new Set<CardView>();
  private pendingResult: RoundResult | null = null;
  private presenting: RoundResult | null = null;
  private hovered: CardView | null = null;
  private seed = 0;
  speed = 1;
  handoffEnabled = THEME.showHandoffScreen;
  perspectiveFollowsTurn = true;
  private autoPlay = false;
  private submitting = false;
  private debugInfo = '';
  private botRng = new DeterministicRandom(1);
  private waitingRound = -1;
  /** MonoBehaviour coroutines of the controller (StopAllCoroutines on new match) */
  private co = new CoOwner();
  private toastCo = new CoOwner();
  /** called when the debug "수치 편집" button is pressed */
  onEditValues: (() => void)[] = [];
  /** called when the speed/handoff/perspective settings change (persisted by the scene) */
  onSettingsChanged: ((s: ControllerSettings) => void)[] = [];

  get state(): PublicMatchState { return this.client.publicState; }
  get viewerSlot() { return this.viewer; }
  private get sharedScreen() { return this.client.controlledSlots.length > 1; }

  constructor(private client: IMatchClient, private lib: VisualLibrary, private ui: BattleScreen, seed: number, showDebugButton: boolean, settings?: Partial<ControllerSettings>) {
    this.content = client.content;
    this.presenter = new BattlePresenter(ui, lib);
    if (settings?.speed) this.speed = settings.speed;
    if (settings?.handoff !== undefined) this.handoffEnabled = settings.handoff;
    if (settings?.perspectiveFollowsTurn !== undefined) this.perspectiveFollowsTurn = settings.perspectiveFollowsTurn;
    ui.topBar.setDebugVisible(showDebugButton);

    client.onPublicStateChanged.push(s => this.onPublicStateChanged(s));
    client.onRoundResolved.push(r => {
      this.pendingResult = r;
      this.step = Step.Presenting;
      if (!this.submitting) this.co.start(co => this.presentRound(co, r));
    });

    ui.actionBar.onPrimary.push(() => this.onPrimary());
    ui.actionBar.onSecondary.push(() => this.onSecondary());
    ui.invest.onExtraChosen.push(x => this.onExtraChosen(x));
    ui.topBar.onMatchup.push(() => ui.matchup.show(this.focusElement(), null));
    ui.topBar.onDetail.push(() => this.showDetail());
    ui.topBar.onDebug.push(() => { ui.debug.show(); this.renderDebug(); });
    ui.topBar.onRestart.push(() => this.startMatch(newSeed()));
    ui.debug.onOptionsChanged.push(o => this.onOptionsChanged(o));
    ui.debug.onAutoPlay.push(() => this.toggleAutoPlay());
    ui.debug.onSelfTest.push(() => this.runSelfTest());
    ui.debug.onSameSeed.push(() => this.startMatch(this.seed));
    ui.debug.onSpeed.push(() => { this.speed = this.speed >= 4 ? 0.5 : this.speed * 2; this.settingsChanged(); this.renderDebug(); });
    ui.debug.onHandoff.push(() => { this.handoffEnabled = !this.handoffEnabled; this.settingsChanged(); this.renderDebug(); });
    ui.debug.onPerspective.push(() => {
      this.perspectiveFollowsTurn = !this.perspectiveFollowsTurn;
      this.setViewer(this.perspectiveFollowsTurn ? this.active : this.client.controlledSlots[0]);
      this.settingsChanged();
      this.renderAll();
      this.renderDebug();
    });
    ui.debug.onEditValues.push(() => this.onEditValues.forEach(f => f()));

    for (const s of [PlayerSlot.P1, PlayerSlot.P2]) {
      const slotView = ui.slot(s);
      slotView.onClicked.push(() => this.onSlotClicked(s));
      slotView.card.onClicked.push(() => this.onSlotClicked(s));
      slotView.card.drag = {
        dragLayer: ui.dragLayer,
        canDrag: () => this.canEdit(s) && this.selection.has(s),
        dropped: (_c, pos) => this.onSlotCardDropped(s, pos),
      };
    }
    ui.hand.dragSetup = cv => this.wire(cv);
    this.startMatch(seed);
  }

  private settingsChanged() {
    const s = { speed: this.speed, handoff: this.handoffEnabled, perspectiveFollowsTurn: this.perspectiveFollowsTurn };
    for (const f of this.onSettingsChanged) f(s);
  }

  private setViewer(slot: PlayerSlot) {
    if (!this.client.controls(slot)) slot = this.client.controlledSlots[0];
    this.viewer = slot;
    this.ui.setPerspective(slot);
  }

  startMatch(seed: number) {
    this.stopAutoPlay();
    this.co.stopAll();
    this.presenter.co.stopAll();
    this.seed = seed;
    this.selection.clear();
    this.extra.clear();
    this.handOrder.clear();
    this.pendingResult = null;
    this.presenting = null;
    this.hovered = null;
    this.ui.gameOver.hide();
    this.ui.handoff.hide();
    this.ui.banner.hide();
    this.ui.result.hide();
    this.ui.log.clear();
    const st = this.state;
    const options = st && st.phase !== MatchPhase.NotStarted && st.options ? st.options : (st?.options ?? this.content.rules.defaultOptions);
    this.client.requestNewMatch(seed, options);
    this.active = this.client.controlledSlots[0];
    this.setViewer(this.active);
    this.step = Step.Choosing;
    const s = this.state;
    for (const slot of [PlayerSlot.P1, PlayerSlot.P2]) {
      this.ui.slot(slot).card.setFailed(false);
      this.ui.tower(slot).setHp(s.players[slot].hp, s.players[slot].maxHp, true);
    }
    this.ui.renderField(s.field, true);
    this.renderAll();
    this.ui.banner.show('ROUND 01', `${nameOf(this.active)} 차례`, this.lib.playerColor(this.active), 1.4);
  }

  private onPublicStateChanged(s: PublicMatchState) {
    if (s.phase === MatchPhase.NotStarted) return;
    if (this.step === Step.WaitingOpponent && s.phase === MatchPhase.WaitingForSubmissions) {
      const next = this.nextSlotNeedingSubmission();
      if (next !== null) {
        const newRound = s.round !== this.waitingRound;
        this.beginTurn(next);
        if (newRound) {
          const info = fieldInfo(this.content, s.field);
          this.ui.banner.show(`ROUND ${pad2(s.round)}`, info.name, THEME.accentColor, 1.3 / Math.max(0.5, this.speed));
        }
        return;
      }
    }
    this.renderAll();
  }

  private canEdit(slot: PlayerSlot) {
    if (this.step !== Step.Choosing || slot !== this.active || !this.client.controls(slot)) return false;
    const s = this.state;
    return s.phase === MatchPhase.WaitingForSubmissions && !s.players[slot].submitted;
  }

  private preview(def: CardDef, extraMp = 0): CombatStats { const s = this.state; return preview(this.content, def, s.field, s.options, extraMp); }
  private terms(def: CardDef): PlayTerms { const s = this.state; return terms(this.content, def, s.field, s.options); }
  private extraFor(slot: PlayerSlot) { return this.extra.get(slot) ?? 0; }
  private clampedExtra(slot: PlayerSlot, def: CardDef, mp: number) {
    const x = Math.max(0, Math.min(this.extraFor(slot), this.terms(def).maxAffordableExtra(mp)));
    this.extra.set(slot, x);
    return x;
  }
  private driftToCenter(slot: PlayerSlot) { return slot === this.ui.home ? 0.6 : -0.6; }

  private focusElement(): Element | null {
    if (this.hovered && this.hovered.def) return this.hovered.def.element;
    return this.selectedDef()?.element ?? null;
  }

  private selectedDef(): CardDef | null {
    const uid = this.selection.get(this.active);
    if (!uid) return null;
    const inst = this.client.getPrivateView(this.active).hand.find(c => c.uid === uid);
    return inst ? this.content.getCard(inst.cardId) ?? null : null;
  }

  private orderedHand(slot: PlayerSlot, view: PrivatePlayerView): CardInstance[] {
    let order = this.handOrder.get(slot);
    if (!order) { order = []; this.handOrder.set(slot, order); }
    for (let i = order.length - 1; i >= 0; i--) if (!view.hand.some(c => c.uid === order![i])) order.splice(i, 1);
    for (const c of view.hand) if (!order.includes(c.uid)) order.push(c.uid);
    return order.map(uid => view.hand.find(c => c.uid === uid)!);
  }

  private displayedPlayer(s: PublicMatchState, slot: PlayerSlot): PublicPlayerState {
    let p = { ...s.players[slot] };
    const pr = this.presenting ?? this.pendingResult;
    if (this.step === Step.Presenting && pr) {
      p = { ...p, hp: pr.hpBefore[slot], mpTax: 0, submitted: true };
    }
    return p;
  }

  renderAll() {
    const s = this.state;
    if (s.phase === MatchPhase.NotStarted) return;
    const th = THEME;
    this.ui.topBar.setRound(s.round);
    for (const slot of [PlayerSlot.P1, PlayerSlot.P2]) {
      const p = this.displayedPlayer(s, slot);
      if (slot === this.viewer && this.client.controls(slot) && this.step !== Step.Presenting) p.mp = this.client.getPrivateView(slot).mp;
      let status: string, color: Color;
      if (s.phase === MatchPhase.GameOver) { status = p.hp > 0 ? '승리' : '패배'; color = p.hp > 0 ? th.positiveColor : th.negativeColor; }
      else if (this.step === Step.Presenting || s.phase === MatchPhase.RoundResolved) { status = ''; color = th.mutedTextColor; }
      else if (p.submitted) { status = '제출 완료'; color = th.positiveColor; }
      else if (slot === this.active && (this.step === Step.Choosing || this.step === Step.Handoff)) { status = '선택 중'; color = th.accentColor; }
      else { status = '대기'; color = th.mutedTextColor; }
      const highlight = slot === this.active && this.step === Step.Choosing;
      const role = slot === this.viewer ? '나' : '상대';
      this.ui.side(slot).render(p, status, color, highlight, role);
    }
    if (this.step !== Step.Presenting) {
      this.ui.tower(PlayerSlot.P1).setHp(s.players[0].hp, s.players[0].maxHp, false);
      this.ui.tower(PlayerSlot.P2).setHp(s.players[1].hp, s.players[1].maxHp, false);
      this.ui.renderField(s.field, false);
      this.renderSlots(s);
    }
    this.renderHand(s);
    this.renderMp(s);
    this.renderInvest();
    this.renderActionBar();
    this.renderResult(s);
    this.renderHint();
    if (this.ui.info.visible) this.ui.info.refresh(roundDetail(this.lib, s.lastResult), fieldDetail(this.lib, s));
    if (this.ui.debug.visible) this.renderDebug();
  }

  private renderSlots(s: PublicMatchState) {
    const th = THEME;
    for (const slot of [PlayerSlot.P1, PlayerSlot.P2]) {
      const view = this.ui.slot(slot);
      const pc = this.lib.playerColor(slot);
      view.setCaption(slot === this.viewer ? `${nameOf(slot)} · 나` : nameOf(slot), pc);
      if ((s.phase === MatchPhase.RoundResolved || s.phase === MatchPhase.GameOver) && s.lastResult) {
        const play = playOf(s.lastResult, slot);
        const def = this.content.getCard(play.cardId) ?? null;
        view.showCard(def, play.cardUid, play.stats, false, false);
        view.markRevealed();
        if (def && !def.isPass) view.card.setCost(termsFromMods(this.content, def, play.stats.mods).cost);
        if (def && !def.isPass && play.extraMp > 0)
          view.card.setInvestment(play.extraMp, Math.max(play.extraMp, termsFromMods(this.content, def, play.stats.mods).maxExtra), play.afterHit?.investGain ?? 0, play.stats, this.driftToCenter(slot));
        if (def && def.isPass) view.setStatus('턴 넘김', th.mutedTextColor);
        else {
          const failed = outcomeFailed(s.lastResult.outcome, slot);
          view.card.setFailed(failed);
          view.setStatus(failed ? '공격 실패' : '공격 성공', failed ? C(0.75, 0.7, 0.95) : th.positiveColor);
        }
        continue;
      }
      view.card.setFailed(false);
      const controlled = this.client.controls(slot);
      const editable = this.canEdit(slot);
      const pub = s.players[slot];
      const sel = editable ? this.selectedDef() : null;
      if (pub.submitted && controlled && slot === this.viewer) {
        // own submitted card stays visible to its owner only
        const pv = this.client.getPrivateView(slot);
        const def = pv.submittedPass ? this.content.passCard : pv.submittedCardId ? this.content.getCard(pv.submittedCardId) ?? null : null;
        const sx = pv.submittedExtraMp;
        const sstats = def ? this.preview(def, sx) : null;
        view.showCard(def, pv.submittedCardUid, sstats, def === null, false);
        if (def && !def.isPass) {
          const st = this.terms(def);
          view.card.setCost(st.cost);
          view.card.setInvestment(sx, st.maxExtra, st.investGain(sx), sstats, this.driftToCenter(slot));
        }
        view.setStatus(sx > 0 ? `제출 완료 · 투자 +${sx}` : '제출 완료', th.positiveColor);
      } else if (pub.submitted) {
        // opponent's card and investment are never visible before the reveal
        view.showHidden();
        view.setStatus('제출 완료', th.positiveColor);
      } else if (editable && sel) {
        const pvSel = this.client.getPrivateView(slot);
        const x = this.clampedExtra(slot, sel, pvSel.mp);
        const st = this.terms(sel);
        const selStats = this.preview(sel, x);
        view.showCard(sel, this.selection.get(slot)!, selStats, false, true);
        view.card.setCost(st.cost);
        view.card.setInvestment(x, st.maxExtra, st.investGain(x), selStats, this.driftToCenter(slot));
        view.setStatus('', th.accentColor);
      } else if (editable) {
        this.selection.delete(slot);
        view.showEmpty('카드를 끌어오거나\n클릭하세요', true);
        view.setStatus('선택 중', th.accentColor);
      } else {
        view.showEmpty('', false);
        view.setStatus(this.step === Step.Handoff || slot === this.viewer ? '' : '고르는 중', th.mutedTextColor);
      }
    }
  }

  private renderHand(s: PublicMatchState) {
    const hand = this.ui.hand;
    const editing = this.canEdit(this.active);
    if (!editing && this.sharedScreen) {
      if (this.step === Step.GameOver) hand.trim(0);
      else hand.showBacks(Math.min(s.players[this.viewer].handCount, 10));
      return;
    }
    const owner = editing ? this.active : this.viewer;
    const pv = this.client.getPrivateView(owner);
    const cards = this.orderedHand(owner, pv);
    const selected = this.selection.get(owner);
    let n = 0;
    for (const inst of cards) {
      if (inst.uid === selected || (pv.submitted && inst.uid === pv.submittedCardUid)) continue;
      const def = this.content.getCard(inst.cardId);
      if (!def) continue;
      const cv = hand.acquire(n++);
      this.wire(cv);
      cv.bind(def, inst.uid, this.preview(def));
      const ht = this.terms(def);
      cv.setCost(ht.cost);
      cv.setDimmed(editing && ht.cost > pv.mp);
      cv.setSelected(false);
      cv.interactable = editing;
      cv.setHoverEnabled(true);
    }
    hand.setLowered(false);
    hand.setInsertPreview(-1);
    hand.trim(n);
    hand.layout(n, false);
  }

  private renderMp(s: PublicMatchState) {
    const p = this.displayedPlayer(s, this.viewer);
    if (this.client.controls(this.viewer) && this.step !== Step.Presenting) p.mp = this.client.getPrivateView(this.viewer).mp;
    const d = this.canEdit(this.viewer) ? this.selectedDef() : null;
    const pending = d ? this.terms(d).totalCost(this.extraFor(this.viewer)) : 0;
    const R = this.content.rules;
    const gain = Math.max(R.minMpGain, R.mpPerRound - p.mpTax);
    const note = p.mpTax > 0 ? `다음 라운드 +${gain} (냉기 -${p.mpTax})` : `라운드마다 +${gain}`;
    this.ui.side(this.viewer).setMp(p.mp, p.maxMp, pending, note);
  }

  private wire(cv: CardView) {
    if (this.wired.has(cv)) return;
    this.wired.add(cv);
    cv.onClicked.push(c => { if (c.uid) this.selectCard(c.uid); });
    cv.onHoverEnter.push(c => { this.hovered = c; this.renderHint(); });
    cv.onHoverExit.push(c => { if (this.hovered === c) this.hovered = null; this.renderHint(); });
    cv.drag = {
      dragLayer: this.ui.dragLayer,
      canDrag: c => this.canEdit(this.active) && !c.faceDown,
      dragStarted: () => this.ui.slot(this.active).setDropHighlight(true),
      dropped: (c, pos) => this.onHandCardDropped(c, pos),
    };
  }

  private onHandCardDropped(card: CardView, pos: V2): boolean {
    this.ui.slot(this.active).setDropHighlight(false);
    if (this.ui.slot(this.active).contains(pos)) {
      if (card.uid) this.selectCard(card.uid);
      card.rt.setParent(this.ui.hand.rt, true);
      return true;
    }
    if (this.ui.hand.contains(pos)) {
      const order = this.handOrder.get(this.active)!;
      const uid = card.uid!;
      order.splice(order.indexOf(uid), 1);
      const sel = this.selection.get(this.active);
      const visible = order.filter(u => u !== sel);
      const index = Math.max(0, Math.min(this.ui.hand.insertIndexAt(pos, visible.length + 1, card), visible.length));
      const insertAt = index < visible.length ? order.indexOf(visible[index]) : order.length;
      order.splice(insertAt, 0, uid);
      card.rt.setParent(this.ui.hand.rt, true);
      this.renderAll();
      return true;
    }
    return false;
  }

  private onSlotCardDropped(slot: PlayerSlot, pos: V2): boolean {
    if (this.ui.hand.contains(pos) || !this.ui.slot(slot).contains(pos)) {
      this.ui.slot(slot).reattachCard();
      this.deselect();
      return true;
    }
    return false;
  }

  private selectCard(uid: string) {
    if (!this.canEdit(this.active)) return;
    const pv = this.client.getPrivateView(this.active);
    const inst = pv.hand.find(c => c.uid === uid);
    const def = inst ? this.content.getCard(inst.cardId) : null;
    if (!def) return;
    const cost = this.terms(def).cost;
    if (cost > pv.mp) { this.toast(`MP 부족 (필요 ${cost})`); return; }
    const changed = this.selection.get(this.active) !== uid;
    if (changed) this.extra.set(this.active, 0);
    const source = this.ui.hand.cards.find(c => c.uid === uid && c.rt.activeInHierarchy);
    const from = source ? source.visual.worldPosition() : null;
    this.selection.set(this.active, uid);
    this.hovered = null;
    this.renderAll();
    if (changed && from) this.ui.slot(this.active).flyInFrom(from);
  }

  private deselect() {
    this.extra.delete(this.active);
    if (this.selection.delete(this.active)) this.renderAll();
  }

  private onExtraChosen(extra: number) {
    const def = this.canEdit(this.active) ? this.selectedDef() : null;
    if (!def) return;
    const t = this.terms(def);
    const mp = this.client.getPrivateView(this.active).mp;
    if (extra > t.maxAffordableExtra(mp)) { this.toast(extra > t.maxExtra ? '최대 투자량을 넘었습니다' : 'MP가 부족합니다'); return; }
    this.extra.set(this.active, extra);
    this.renderAll();
  }

  private renderInvest() {
    const def = this.canEdit(this.active) ? this.selectedDef() : null;
    if (def && !def.isPass) {
      const mp = this.client.getPrivateView(this.active).mp;
      this.ui.invest.show(def, this.terms(def), this.clampedExtra(this.active, def, mp), mp);
    } else this.ui.invest.hide();
  }

  private onSlotClicked(slot: PlayerSlot) {
    if (slot === this.active && this.canEdit(slot) && this.selection.has(slot)) this.deselect();
  }

  private renderActionBar() {
    const th = THEME, bar = this.ui.actionBar;
    let step = this.step;
    if (step === Step.Choosing && !this.client.controls(this.active)) step = Step.WaitingOpponent;
    switch (step) {
      case Step.Choosing: {
        const pv = this.client.getPrivateView(this.active);
        const selected = this.selection.has(this.active);
        const pc = this.lib.playerColor(this.active);
        if (!pv.canAffordAny) bar.render('MP 부족 · 카드 없이 진행', th.negativeColor, '턴 넘기기', true, null, false, true);
        else if (selected) bar.render(`${nameOf(this.active)} · 카드 확정`, pc, '카드 제출', true, '선택 취소', true, true);
        else bar.render(`${nameOf(this.active)} · 카드 선택`, pc, '카드 제출', false, null, false);
        break;
      }
      case Step.Handoff:
      case Step.Submitting: bar.render('', th.mutedTextColor, null, false, null, false); break;
      case Step.WaitingOpponent: bar.render('상대 선택 대기 중', th.mutedTextColor, null, false, null, false); break;
      case Step.Presenting: bar.render('', th.mutedTextColor, '건너뛰기', true, null, false); break;
      case Step.Result: bar.render('', th.mutedTextColor, '다음 라운드', true, '상세 보기', true, true); break;
      case Step.GameOver: bar.render('', th.mutedTextColor, '다시 플레이', true, '상세 보기', true, true); break;
    }
  }

  private renderResult(s: PublicMatchState) {
    const r = s.lastResult;
    if (this.step !== Step.Result || !r) { this.ui.result.hide(); return; }
    const th = THEME;
    const part = (slot: PlayerSlot) => {
      const dmg = slot === PlayerSlot.P1 ? r.outcome.damageToP1 : r.outcome.damageToP2;
      const c = dmg > 0 ? th.negativeColor : th.mutedTextColor;
      return colorize(slotLabel(slot), this.lib.playerColor(slot)) + ' ' + colorize(dmg > 0 ? `-${dmg}` : '0', c);
    };
    const home = this.viewer;
    const text = part(home) + '     ' + part(other(home));
    const sub = fieldChanged(r) ? `${r.fieldNameBefore} → ${r.fieldNameAfter}` : r.fieldNameAfter;
    this.ui.result.show(text, sub);
  }

  private renderHint() {
    let def: CardDef | null = null;
    const h = this.hovered;
    if (h && h.def && !h.faceDown && h.rt.activeInHierarchy) def = h.def;
    this.ui.matchupHint.showIdentity = this.state.options.elementIdentity;
    if (def) this.ui.matchupHint.show(def, this.preview(def));
    else this.ui.matchupHint.showIdle();
  }

  private showDetail() { this.ui.info.show(roundDetail(this.lib, this.state.lastResult), fieldDetail(this.lib, this.state)); }

  private onPrimary() {
    switch (this.step) {
      case Step.Choosing: this.submitActive(); break;
      case Step.Presenting: this.presenter.skip = true; this.ui.vfx.speed = 8; break;
      case Step.Result: this.nextRound(); break;
      case Step.GameOver: this.startMatch(newSeed()); break;
    }
  }

  private onSecondary() {
    switch (this.step) {
      case Step.Choosing: this.deselect(); break;
      case Step.Result:
      case Step.GameOver: this.showDetail(); break;
    }
  }

  private submitActive() {
    if (!this.canEdit(this.active)) return;
    const pv = this.client.getPrivateView(this.active);
    let cmd: SubmitCardCommand;
    const uid = this.selection.get(this.active);
    if (uid) cmd = cardCommand(this.active, uid, this.extraFor(this.active));
    else if (!pv.canAffordAny) cmd = passCommand(this.active);
    else { this.toast('먼저 카드를 선택하세요'); return; }

    this.pendingResult = null;
    this.submitting = true;
    let res;
    try { res = this.client.submit(cmd); } finally { this.submitting = false; }
    if (!res.ok) { this.toast(res.message); return; }
    this.selection.delete(this.active);
    this.extra.delete(this.active);
    this.hovered = null;
    const submitted = this.active;
    if (this.pendingResult) {
      this.submitFx(submitted);
      const r = this.pendingResult;
      this.co.start(co => this.presentRound(co, r));
      return;
    }
    this.co.start(co => this.afterSubmit(co, submitted));
  }

  private logLine(r: RoundResult) {
    const th = THEME;
    const card = (slot: PlayerSlot) => {
      const play = playOf(r, slot);
      const def = play ? this.content.getCard(play.cardId) : null;
      if (!def || def.isPass) return colorize('패스', th.mutedTextColor);
      return colorize(def.name, this.lib.elementColor(def.element));
    };
    const dmg = (slot: PlayerSlot) => {
      const d = slot === PlayerSlot.P1 ? r.outcome.damageToP1 : r.outcome.damageToP2;
      return colorize(slotLabel(slot), this.lib.playerColor(slot)) + (d > 0 ? colorize(` -${d}`, th.negativeColor) : ' 0');
    };
    const field = fieldChanged(r) ? ` · ${r.fieldNameAfter}` : '';
    return `R${pad2(r.round)}  ${card(PlayerSlot.P1)} vs ${card(PlayerSlot.P2)}  ${dmg(PlayerSlot.P1)} ${dmg(PlayerSlot.P2)}${field}`;
  }

  private submitFx(submitted: PlayerSlot) {
    const slot = this.ui.slot(submitted);
    slot.playLock();
    this.ui.vfx.burst(slot.rt.worldPosition(), this.lib.playerColor(submitted), 260, VFX.submit);
  }

  private async afterSubmit(co: Co, submitted: PlayerSlot) {
    this.step = Step.Submitting;
    this.renderAll();
    this.submitFx(submitted);
    await co.wait(this.autoPlay ? 0.05 : 0.45);
    if (this.step !== Step.Submitting) return;
    const next = this.nextSlotNeedingSubmission();
    if (next !== null) {
      const target = next;
      if (this.handoffEnabled && !this.autoPlay && this.sharedScreen) {
        this.step = Step.Handoff;
        this.renderAll();
        this.ui.handoff.show(target, `${nameOf(target)} 차례`, `${nameOf(this.active)}의 카드는 뒷면으로 잠겼습니다.`, this.lib.playerColor(target), () => this.beginTurn(target));
      } else this.beginTurn(target);
    } else {
      this.step = Step.WaitingOpponent;
      this.renderAll();
    }
  }

  private nextSlotNeedingSubmission(): PlayerSlot | null {
    const s = this.state;
    for (const slot of this.client.controlledSlots) if (!s.players[slot].submitted) return slot;
    return null;
  }

  private beginTurn(slot: PlayerSlot) {
    this.active = slot;
    if (this.perspectiveFollowsTurn) this.setViewer(slot);
    this.step = Step.Choosing;
    this.renderAll();
  }

  private async presentRound(co: Co, r: RoundResult) {
    this.step = Step.Presenting;
    this.presenting = r;
    this.presenter.skip = false;
    this.presenter.keepOwnCardVisible = !this.sharedScreen;
    await co.wait(this.autoPlay ? 0.05 : 0.3);
    this.presenter.speed = Math.max(0.1, THEME.animationSpeed * this.speed * (this.autoPlay ? 3 : 1));
    this.ui.result.hide();
    this.presenter.showRoundStart(r);
    this.renderAll();
    let s = this.state;
    const maxHp = [s.players[0].maxHp, s.players[1].maxHp];
    await this.presenter.play(co, r, maxHp);
    this.ui.log.add(this.logLine(r));
    this.pendingResult = null;
    this.presenting = null;
    s = this.state;
    if (s.phase === MatchPhase.GameOver) {
      this.step = Step.GameOver;
      this.renderAll();
      await co.wait(this.autoPlay ? 0.3 : 0.8);
      this.ui.gameOver.show(s, () => this.startMatch(newSeed()));
    } else {
      this.step = Step.Result;
      this.renderAll();
    }
  }

  private nextRound() {
    if (this.step !== Step.Result) return;
    for (const slot of this.client.controlledSlots) {
      const res = this.client.readyForNextRound(slot);
      if (!res.ok) this.toast(res.message);
    }
    const s = this.state;
    if (s.phase !== MatchPhase.WaitingForSubmissions) {
      this.waitingRound = s.round;
      this.step = Step.WaitingOpponent;
      this.renderAll();
      return;
    }
    const first = this.client.controlledSlots[0];
    const info = fieldInfo(this.content, s.field);
    if (this.handoffEnabled && !this.autoPlay && this.sharedScreen && this.perspectiveFollowsTurn && this.viewer !== first) {
      this.active = first;
      this.step = Step.Handoff;
      this.renderAll();
      this.ui.handoff.show(first, `ROUND ${pad2(s.round)} · ${nameOf(first)} 차례`, `현재 필드: ${info.name}`, this.lib.playerColor(first), () => {
        this.beginTurn(first);
        this.ui.banner.show(`ROUND ${pad2(s.round)}`, info.name, THEME.accentColor, 1.2 / Math.max(0.5, this.speed));
      });
      return;
    }
    this.beginTurn(first);
    this.ui.banner.show(`ROUND ${pad2(s.round)}`, `${info.name} · ${nameOf(first)} 차례`, THEME.accentColor, 1.3 / Math.max(0.5, this.speed));
  }

  toast(message: string) {
    this.toastCo.stopAll();
    this.toastCo.start(async co => {
      this.ui.toast.text = message;
      await co.wait(2.2);
      this.ui.toast.text = '';
    });
  }

  private onOptionsChanged(o: TestRuleOptions) {
    const deckChanged = o.testCards !== this.state.options.testCards || o.roleCards !== this.state.options.roleCards;
    this.client.requestOptions(o);
    if (deckChanged) {
      this.startMatch(newSeed());
      this.debugInfo = '테스트 카드 설정이 바뀌어 새 게임을 시작했습니다.';
    } else this.renderAll();
    this.renderDebug();
  }

  /** debug drawer: change test-rule options and start a new game in one step */
  applyOptionsAndRestart(o: TestRuleOptions) {
    this.client.requestOptions(o);
    this.startMatch(newSeed());
  }

  get currentOptions() { return this.state.options; }

  renderDebug() {
    this.ui.debug.render(this.state.options, this.content.rules.defaultOptions, this.speed, this.handoffEnabled, this.perspectiveFollowsTurn, this.autoPlay, this.debugInfo);
  }

  private runSelfTest() {
    const report = runSelfTest(this.content, 100);
    this.debugInfo = report.summary + '\n' + report.log.slice(0, 4).join('\n');
    console.log('[MagicBattle] Rule self-test\n' + report.summary + '\n' + report.log.join('\n'));
    this.renderDebug();
  }

  get isAutoPlaying() { return this.autoPlay; }

  toggleAutoPlay() {
    if (this.autoPlay) this.stopAutoPlay();
    else this.co.start(co => this.autoPlayRoutine(co));
    this.renderDebug();
  }

  private stopAutoPlay() { this.autoPlay = false; }

  private async autoPlayRoutine(co: Co) {
    this.autoPlay = true;
    this.botRng = new DeterministicRandom(this.seed ^ 0x5f3759df);
    this.ui.debug.hide();
    let games = 0;
    while (this.autoPlay) {
      if (this.ui.handoff.visible) { this.ui.handoff.hide(); this.beginTurn(this.nextSlotNeedingSubmission() ?? this.active); }
      switch (this.step) {
        case Step.Choosing:
          if (this.canEdit(this.active)) {
            const st = this.state;
            const cmd = botChoose(this.content, this.client.getPrivateView(this.active), st.field, st.options, this.botRng);
            if (!cmd.pass && cmd.cardUid) { this.selection.set(this.active, cmd.cardUid); this.extra.set(this.active, cmd.extraMp); }
            this.renderAll();
            await co.wait(0.25 / Math.max(0.5, this.speed));
            this.submitActive();
          }
          break;
        case Step.Result:
          await co.wait(0.3);
          this.nextRound();
          break;
        case Step.GameOver: {
          games++;
          const s = this.state;
          this.debugInfo = `자동 진행 ${games}판 완료 · 마지막: ${MatchOutcome[s.outcome]} (R${s.round})`;
          console.log('[MagicBattle] Auto play finished: ' + this.debugInfo);
          this.autoPlay = false;
          break;
        }
      }
      await co.frame();
    }
    this.renderDebug();
  }
}
