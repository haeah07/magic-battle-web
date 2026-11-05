// Port of Player/PlayerState.cs, Match/MatchMessages.cs, Match/MatchAuthority.cs, Match/SimpleBot.cs
// MatchAuthority is the only judge: UI → SubmitCardCommand → MatchAuthority → RoundResult → presentation.
import { AfterHitResult, DamageOutcome, outcomeDamageTo, PlayInput, resolveRound } from './battle';
import { terms } from './combat';
import { GameContent } from './content';
import { FieldGain, FieldModeType, FieldState } from './field';
import { DeterministicRandom } from './random';
import { cloneOptions, CHARGE_CARD_ID, CombatStats, Element, PASS_CARD_ID, PlayerSlot, TestRuleOptions } from './types';

// ---------------------------------------------------------------- player
export interface CardInstance { uid: string; cardId: string }

export class PlayerState {
  slot: PlayerSlot = PlayerSlot.P1;
  hp = 0;
  maxHp = 0;
  mp = 0;
  maxMp = 0;
  mpTax = 0;
  deck: CardInstance[] = [];
  hand: CardInstance[] = [];
  discard: CardInstance[] = [];

  findInHand(uid: string | null | undefined) { return this.hand.find(c => c.uid === uid); }

  canAffordAny(content: GameContent, field: FieldState, opts: TestRuleOptions) {
    for (const c of this.hand) {
      const def = content.getCard(c.cardId);
      if (def && terms(content, def, field, opts).cost <= this.mp) return true;
    }
    return false;
  }

  get totalCards() { return this.deck.length + this.hand.length + this.discard.length; }
}

export interface PublicPlayerState {
  slot: PlayerSlot; hp: number; maxHp: number; mp: number; maxMp: number; mpTax: number;
  handCount: number; deckCount: number; discardCount: number; submitted: boolean; readyForNext: boolean;
}

export interface PrivatePlayerView {
  slot: PlayerSlot; mp: number; canAffordAny: boolean; hand: CardInstance[]; deckCount: number; discardCount: number;
  submitted: boolean; submittedCardUid: string | null; submittedCardId: string | null; submittedPass: boolean;
  submittedExtraMp: number; submittedTotalCost: number;
  /** 실험 '충전' */
  submittedCharge: boolean;
}

// ---------------------------------------------------------------- messages
export enum MatchPhase { NotStarted = 0, WaitingForSubmissions = 1, RoundResolved = 2, GameOver = 3 }
export enum MatchOutcome { InProgress = 0, P1Wins = 1, P2Wins = 2, Draw = 3 }

export interface SubmitCardCommand { slot: PlayerSlot; cardUid: string | null; pass: boolean; extraMp: number; charge?: boolean }
export const cardCommand = (slot: PlayerSlot, uid: string, extraMp = 0): SubmitCardCommand => ({ slot, cardUid: uid, pass: false, extraMp });
export const passCommand = (slot: PlayerSlot): SubmitCardCommand => ({ slot, cardUid: null, pass: true, extraMp: 0 });
/** 실험 '충전': 카드 대신 MP +2 (공격하지 않음, 카드 소비 없음) */
export const chargeCommand = (slot: PlayerSlot): SubmitCardCommand => ({ slot, cardUid: null, pass: true, extraMp: 0, charge: true });

export enum CommandError { None = 0, WrongPhase, AlreadySubmitted, CardNotInHand, UnknownCard, NotEnoughMp, PassNotAllowed, InvestmentNotAllowed, InvalidInvestment }
export interface CommandResult { ok: boolean; error: CommandError; message: string }
const ok = (): CommandResult => ({ ok: true, error: CommandError.None, message: '' });
const fail = (error: CommandError, message: string): CommandResult => ({ ok: false, error, message });

export interface RevealedPlay {
  slot: PlayerSlot; cardUid: string | null; cardId: string; isPass: boolean; extraMp: number; mpSpent: number;
  /** 실험 '충전': 이번 라운드 충전으로 얻은 MP (0 = 충전 아님) */
  isCharge?: boolean; chargeMp?: number;
  stats: CombatStats; afterHit: AfterHitResult;
}

export interface FieldHistoryEntry { round: number; fieldName: string; modeType: FieldModeType; top: Element; second: Element }

export interface RoundResult {
  round: number;
  p1: RevealedPlay;
  p2: RevealedPlay;
  outcome: DamageOutcome;
  gains: FieldGain[];
  fieldBefore: FieldState;
  fieldAfter: FieldState;
  fieldNameBefore: string;
  fieldNameAfter: string;
  modeTypeAfter: FieldModeType;
  hpBefore: number[];
  hpAfter: number[];
  mpTaxApplied: number[];
  outcomeAfter: MatchOutcome;
}
export const playOf = (r: RoundResult, s: PlayerSlot) => (s === PlayerSlot.P1 ? r.p1 : r.p2);
export const fieldChanged = (r: RoundResult) => r.fieldNameBefore !== r.fieldNameAfter;

export interface PublicMatchState {
  round: number;
  phase: MatchPhase;
  field: FieldState;
  options: TestRuleOptions;
  players: PublicPlayerState[];
  lastResult: RoundResult | null;
  history: FieldHistoryEntry[];
  outcome: MatchOutcome;
  seed: number;
}
export const playerOf = (s: PublicMatchState, slot: PlayerSlot) => s.players[slot];

// ---------------------------------------------------------------- authority
interface PendingPlay { card: CardInstance | null; pass: boolean; extraMp: number; totalCost: number; charge?: boolean }

export class MatchAuthority {
  readonly content: GameContent;
  private players: PlayerState[] = [new PlayerState(), new PlayerState()];
  private pending: (PendingPlay | null)[] = [null, null];
  private ready = [false, false];
  private history: FieldHistoryEntry[] = [];
  private rng = new DeterministicRandom(1);
  private field = new FieldState();
  private options: TestRuleOptions;
  private lastResult: RoundResult | null = null;
  private round = 0;
  private uidCounter = 0;
  private phase = MatchPhase.NotStarted;
  private outcome = MatchOutcome.InProgress;
  seed = 0;

  onStateChanged: (() => void)[] = [];
  onRoundResolved: ((r: RoundResult) => void)[] = [];

  constructor(content: GameContent, options?: TestRuleOptions) {
    this.content = content;
    this.options = cloneOptions(options ?? content.rules.defaultOptions);
  }

  get currentPhase() { return this.phase; }
  get currentRound() { return this.round; }
  get currentOptions() { return cloneOptions(this.options); }

  private changed() { for (const f of this.onStateChanged) f(); }

  startNewMatch(seed: number) {
    this.seed = seed;
    this.rng = new DeterministicRandom(seed);
    this.uidCounter = 0;
    this.round = 1;
    this.field = new FieldState();
    this.history = [];
    this.lastResult = null;
    this.outcome = MatchOutcome.InProgress;
    const R = this.content.rules;
    for (let i = 0; i < 2; i++) {
      const p = new PlayerState();
      p.slot = i as PlayerSlot;
      p.hp = R.startHp; p.maxHp = R.startHp; p.mp = R.startMp; p.maxMp = R.maxMp; p.mpTax = 0;
      p.deck.push(...this.buildDeck());
      this.draw(p, R.handSize);
      this.players[i] = p;
      this.pending[i] = null;
      this.ready[i] = false;
    }
    this.phase = MatchPhase.WaitingForSubmissions;
    this.changed();
  }

  configureForTest(slot: PlayerSlot, mp: number, ...handCardIds: string[]) {
    const p = this.players[slot];
    p.mp = mp;
    p.hand = handCardIds.map(id => ({ uid: `${id}#t${++this.uidCounter}`, cardId: id }));
    this.changed();
  }

  setFieldForTest(field: FieldState) {
    this.field = field.clone();
    this.changed();
  }

  setHpForTest(slot: PlayerSlot, hp: number) {
    this.players[slot].hp = hp;
    this.changed();
  }

  setOptions(options: TestRuleOptions) {
    this.options = cloneOptions(options);
    this.changed();
  }

  private buildDeck(): CardInstance[] {
    const pool = this.content.cards.filter(c => (!c.isTest || this.options.testCards) && (!c.isRoleSample || this.options.roleCards));
    const list: CardInstance[] = [];
    for (let copy = 0; copy < this.content.rules.copiesPerCard; copy++)
      for (const c of pool) list.push({ uid: `${c.id}#${++this.uidCounter}`, cardId: c.id });
    this.rng.shuffle(list);
    return list;
  }

  private draw(p: PlayerState, count: number) {
    for (let i = 0; i < count; i++) {
      if (p.deck.length === 0 && p.discard.length > 0) {
        p.deck.push(...p.discard);
        p.discard = [];
        this.rng.shuffle(p.deck);
      }
      if (p.deck.length === 0) return;
      p.hand.push(p.deck.shift()!);
    }
  }

  submit(cmd: SubmitCardCommand | null): CommandResult {
    if (!cmd) return fail(CommandError.UnknownCard, '명령이 비어 있습니다.');
    if (this.phase !== MatchPhase.WaitingForSubmissions) return fail(CommandError.WrongPhase, '지금은 카드를 제출할 수 없습니다.');
    const i = cmd.slot;
    if (this.pending[i]) return fail(CommandError.AlreadySubmitted, '이미 제출했습니다.');
    const p = this.players[i];

    if (cmd.charge) {
      if (!this.options.chargeExperiment) return fail(CommandError.PassNotAllowed, '충전은 실험 규칙이 켜져 있을 때만 사용할 수 있습니다.');
      this.pending[i] = { card: null, pass: true, extraMp: 0, totalCost: 0, charge: true };
    } else if (cmd.pass) {
      if (p.canAffordAny(this.content, this.field, this.options)) return fail(CommandError.PassNotAllowed, '낼 수 있는 카드가 있을 때는 턴을 넘길 수 없습니다.');
      this.pending[i] = { card: null, pass: true, extraMp: 0, totalCost: 0 };
    } else {
      const inst = p.findInHand(cmd.cardUid);
      if (!inst) return fail(CommandError.CardNotInHand, '손패에 없는 카드입니다.');
      const def = this.content.getCard(inst.cardId);
      if (!def) return fail(CommandError.UnknownCard, '알 수 없는 카드입니다.');
      if (cmd.extraMp < 0) return fail(CommandError.InvalidInvestment, '투자량이 올바르지 않습니다.');
      const extra = cmd.extraMp;
      const t = terms(this.content, def, this.field, this.options);
      if (extra > 0) {
        if (!t.investAllowed) return fail(CommandError.InvestmentNotAllowed, '이 카드에는 MP를 추가 투자할 수 없습니다.');
        if (extra > t.maxExtra) return fail(CommandError.InvalidInvestment, `최대 추가 투자량(${t.maxExtra})을 넘었습니다.`);
      }
      const cost = t.totalCost(extra);
      if (cost > p.mp) return fail(CommandError.NotEnoughMp, `MP가 부족합니다 (필요 ${cost}, 보유 ${p.mp}).`);
      p.hand.splice(p.hand.indexOf(inst), 1);
      p.mp -= cost;
      this.pending[i] = { card: inst, pass: false, extraMp: extra, totalCost: cost };
    }

    this.changed();
    if (this.pending[0] && this.pending[1]) this.resolve();
    return ok();
  }

  private resolve() {
    const plays: PlayInput[] = [0, 1].map(i => {
      const pp = this.pending[i]!;
      return { card: pp.charge ? this.content.chargeCard : pp.pass ? this.content.passCard : this.content.getCard(pp.card!.cardId)!, extraMp: pp.extraMp, charge: !!pp.charge };
    });
    const rc = resolveRound(this.content, this.field, this.options, plays[0], plays[1]);
    const result: RoundResult = {
      round: this.round, outcome: rc.outcome, gains: rc.gains, fieldBefore: rc.fieldBefore, fieldAfter: rc.fieldAfter.clone(),
      fieldNameBefore: rc.infoBefore.name, fieldNameAfter: rc.infoAfter.name, modeTypeAfter: rc.infoAfter.mode.type,
      hpBefore: [0, 0], hpAfter: [0, 0], mpTaxApplied: [0, 0], outcomeAfter: MatchOutcome.InProgress,
      p1: null as unknown as RevealedPlay, p2: null as unknown as RevealedPlay,
    };
    for (let i = 0; i < 2; i++) {
      const pp = this.pending[i]!;
      const revealed: RevealedPlay = {
        slot: i as PlayerSlot, cardUid: pp.card ? pp.card.uid : null, cardId: pp.charge ? CHARGE_CARD_ID : pp.pass ? PASS_CARD_ID : pp.card!.cardId, isPass: pp.pass,
        isCharge: !!pp.charge, chargeMp: 0,
        extraMp: pp.extraMp, mpSpent: pp.pass ? 0 : pp.totalCost, stats: i === 0 ? rc.statsP1 : rc.statsP2, afterHit: i === 0 ? rc.afterHitP1 : rc.afterHitP2,
      };
      if (i === 0) result.p1 = revealed; else result.p2 = revealed;
      result.hpBefore[i] = this.players[i].hp;
    }
    for (let i = 0; i < 2; i++) {
      this.players[i].hp = Math.max(0, this.players[i].hp - outcomeDamageTo(rc.outcome, i as PlayerSlot));
      result.hpAfter[i] = this.players[i].hp;
    }
    if (rc.afterHitP1.mpTax > 0) { this.players[1].mpTax = rc.afterHitP1.mpTax; result.mpTaxApplied[1] = rc.afterHitP1.mpTax; }
    if (rc.afterHitP2.mpTax > 0) { this.players[0].mpTax = rc.afterHitP2.mpTax; result.mpTaxApplied[0] = rc.afterHitP2.mpTax; }
    this.field = rc.fieldAfter;
    // 실험 '충전': 전투 해결 후 추가 MP (최대 MP 유지)
    for (let i = 0; i < 2; i++) {
      if (!this.pending[i]!.charge) continue;
      const p = this.players[i], before = p.mp;
      p.mp = Math.min(p.maxMp, p.mp + this.content.rules.chargeMp);
      (i === 0 ? result.p1 : result.p2).chargeMp = p.mp - before;
    }
    for (let i = 0; i < 2; i++) if (!this.pending[i]!.pass) this.players[i].discard.push(this.pending[i]!.card!);
    this.history.push({ round: this.round, fieldName: rc.infoAfter.name, modeType: rc.infoAfter.mode.type, top: rc.infoAfter.mode.top, second: rc.infoAfter.mode.second });

    const d1 = this.players[0].hp <= 0, d2 = this.players[1].hp <= 0;
    this.outcome = d1 && d2 ? MatchOutcome.Draw : d2 ? MatchOutcome.P1Wins : d1 ? MatchOutcome.P2Wins : MatchOutcome.InProgress;
    result.outcomeAfter = this.outcome;
    this.phase = this.outcome === MatchOutcome.InProgress ? MatchPhase.RoundResolved : MatchPhase.GameOver;
    this.ready = [false, false];
    this.lastResult = result;
    for (const f of this.onRoundResolved) f(result);
    this.changed();
  }

  readyForNextRound(slot: PlayerSlot): CommandResult {
    if (this.phase !== MatchPhase.RoundResolved) return fail(CommandError.WrongPhase, '다음 라운드로 넘어갈 수 없는 상태입니다.');
    this.ready[slot] = true;
    if (this.ready[0] && this.ready[1]) this.advanceRound();
    else this.changed();
    return ok();
  }

  private advanceRound() {
    const R = this.content.rules;
    this.round++;
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      const gain = Math.max(R.minMpGain, R.mpPerRound - p.mpTax);
      p.mpTax = 0;
      p.mp = Math.min(p.maxMp, p.mp + gain);
      // 손패 최대 장수: 가득 차 있으면 드로우를 건너뜀 (충전은 카드를 소비하지 않으므로)
      const room = Math.max(0, R.maxHand - p.hand.length);
      this.draw(p, Math.min(R.drawPerRound, room));
      this.pending[i] = null;
      this.ready[i] = false;
    }
    this.phase = MatchPhase.WaitingForSubmissions;
    this.changed();
  }

  getPublicState(): PublicMatchState {
    const s: PublicMatchState = {
      round: this.round, phase: this.phase, field: this.field.clone(), options: cloneOptions(this.options), lastResult: this.lastResult,
      history: [...this.history], outcome: this.outcome, seed: this.seed, players: [],
    };
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      s.players.push({
        slot: i as PlayerSlot, hp: p.hp, maxHp: p.maxHp, mp: this.publicMp(i), maxMp: p.maxMp, mpTax: p.mpTax,
        handCount: p.hand.length, deckCount: p.deck.length, discardCount: p.discard.length, submitted: this.pending[i] !== null, readyForNext: this.ready[i],
      });
    }
    return s;
  }

  /** Opponents must not learn the pending spend (card cost + investment) before reveal. */
  private publicMp(i: number) {
    const p = this.players[i];
    const pend = this.pending[i];
    if (this.phase === MatchPhase.WaitingForSubmissions && pend && !pend.pass) return p.mp + pend.totalCost;
    return p.mp;
  }

  getPrivateView(slot: PlayerSlot): PrivatePlayerView {
    const p = this.players[slot];
    const pend = this.pending[slot];
    return {
      slot, mp: p.mp, canAffordAny: p.canAffordAny(this.content, this.field, this.options), hand: p.hand.map(c => ({ ...c })),
      deckCount: p.deck.length, discardCount: p.discard.length, submitted: pend !== null,
      submittedCardUid: pend?.card?.uid ?? null, submittedCardId: pend?.card?.cardId ?? null, submittedPass: !!pend && pend.pass,
      submittedExtraMp: pend?.extraMp ?? 0, submittedTotalCost: pend?.totalCost ?? 0, submittedCharge: !!pend?.charge,
    };
  }

  cardsInPlayFor(slot: PlayerSlot) {
    if (this.phase !== MatchPhase.WaitingForSubmissions) return 0;
    const pend = this.pending[slot];
    return pend && !pend.pass ? 1 : 0;
  }

  totalCardsFor(slot: PlayerSlot) { return this.players[slot].totalCards + this.cardsInPlayFor(slot); }
}

// ---------------------------------------------------------------- bot
export function botChoose(content: GameContent, view: PrivatePlayerView, field: FieldState, opts: TestRuleOptions, rng: DeterministicRandom): SubmitCardCommand {
  const affordable = view.hand
    .map(inst => ({ inst, def: content.getCard(inst.cardId) }))
    .filter(x => x.def && terms(content, x.def, field, opts).cost <= view.mp);
  if (opts.chargeExperiment) {
    // 실험: 낼 카드가 없으면 충전, 손에 아직 못 쓰는 고코스트 카드가 있으면 1/3 확률로 충전
    if (affordable.length === 0) return chargeCommand(view.slot);
    const saving = view.hand.some(c => { const d = content.getCard(c.cardId); return d && terms(content, d, field, opts).cost > view.mp; });
    if (saving && rng.next(3) === 0) return chargeCommand(view.slot);
  }
  if (affordable.length === 0) return passCommand(view.slot);
  const pick = affordable[rng.next(affordable.length)];
  const t = terms(content, pick.def!, field, opts);
  const maxExtra = t.maxAffordableExtra(view.mp);
  const extra = maxExtra > 0 && rng.next(2) === 0 ? 1 + rng.next(maxExtra) : 0;
  return cardCommand(view.slot, pick.inst.uid, extra);
}
