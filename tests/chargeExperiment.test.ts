// 충전: 최신 규칙(Unity Final)에는 없어서 기본 OFF. 코드는 남아 있으므로 켰을 때의 동작만 회귀 검증한다 — v9 베이스라인 카드 기준
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/data';
import { AttackResult, cardCommand, MatchAuthority, MatchPhase, MatchupStanding, PlayerSlot, TestRuleOptions, v6Baseline } from '../src/core';
import { chargeCommand } from '../src/core/match';

const content = buildContent();
const on = { ...v6Baseline(), chargeExperiment: true };
const P1 = PlayerSlot.P1, P2 = PlayerSlot.P2;

function match(opts: TestRuleOptions = on) {
  const a = new MatchAuthority(content, opts);
  a.startNewMatch(7);
  return a;
}
const uid = (a: MatchAuthority, s: PlayerSlot, i = 0) => a.getPrivateView(s).hand[i].uid;
const next = (a: MatchAuthority) => { a.readyForNextRound(P1); a.readyForNextRound(P2); };

describe('충전 기본 OFF', () => {
  it('기본 규칙으로는 충전 명령이 거부된다', () => {
    const a = match(content.rules.defaultOptions);
    expect(a.submit(chargeCommand(P1)).ok).toBe(false);
  });
});

describe('충전 + 고코스트 실험 (옵션을 켰을 때)', () => {
  it('default rules have charge OFF; the deck does not depend on the toggle', () => {
    expect(content.rules.defaultOptions.chargeExperiment).toBe(false);
    expect(match().totalCardsFor(P1)).toBe(21);
    expect(match(v6Baseline()).totalCardsFor(P1)).toBe(21);
  });

  it('card vs card is unchanged', () => {
    const a = match();
    a.configureForTest(P1, 4, 'fire-bolt'); a.configureForTest(P2, 4, 'vine-whip');
    a.submit(cardCommand(P1, uid(a, P1))); a.submit(cardCommand(P2, uid(a, P2)));
    const r = a.getPublicState().lastResult!;
    expect(r.outcome.result).toBe(AttackResult.P1Only);
    expect(r.p1.afterHit.standing).toBe(MatchupStanding.Win);
  });

  it('card vs charge: card attacks unopposed as a Win, charger takes full damage and gets +2 MP', () => {
    for (const chargeSlot of [P2, P1]) {
      const cardSlot = chargeSlot === P1 ? P2 : P1;
      const a = match();
      // Rock Bullet vs (nothing): no matchup check — normally rock vs fire etc. would matter
      a.configureForTest(cardSlot, 4, 'rock-bullet'); a.configureForTest(chargeSlot, 3, 'fire-bolt');
      a.submit(chargeCommand(chargeSlot));
      a.submit(cardCommand(cardSlot, uid(a, cardSlot)));
      const r = a.getPublicState().lastResult!;
      const cardPlay = cardSlot === P1 ? r.p1 : r.p2, chargePlay = chargeSlot === P1 ? r.p1 : r.p2;
      expect(cardPlay.afterHit.standing).toBe(MatchupStanding.Win);
      expect(chargePlay.isCharge).toBe(true);
      const dmg = chargeSlot === P1 ? r.outcome.damageToP1 : r.outcome.damageToP2;
      expect(dmg).toBe(5); // Rock Bullet ATK 5
      expect(r.gains.length).toBe(1); // only the card builds field
      expect(r.gains[0].amount).toBe(9); // Rock Bullet 18 × Win 50%
      expect(a.getPrivateView(chargeSlot).mp).toBe(5); // 3 + 2
      expect(a.getPrivateView(chargeSlot).hand.length).toBe(1); // charge consumes no card
    }
  });

  it('charge vs charge: no damage, no field, both +2 MP; MP never exceeds 10', () => {
    const a = match();
    a.configureForTest(P1, 9, 'fire-bolt'); a.configureForTest(P2, 2, 'ice-shard');
    a.submit(chargeCommand(P1)); a.submit(chargeCommand(P2));
    const r = a.getPublicState().lastResult!;
    expect(r.outcome.damageToP1 + r.outcome.damageToP2).toBe(0);
    expect(r.gains.length).toBe(0);
    expect(a.getPrivateView(P1).mp).toBe(10);
    expect(a.getPrivateView(P2).mp).toBe(4);
    next(a);
    expect(a.getPrivateView(P1).mp).toBe(10); // regular regen still capped
    expect(a.getPrivateView(P2).mp).toBe(7); // 4 + 3
  });

  it('a 7-cost card can be played after saving MP', () => {
    const a = match();
    a.configureForTest(P1, 7, 'meteor'); a.configureForTest(P2, 4, 'ice-shard');
    expect(a.submit(cardCommand(P1, uid(a, P1))).ok).toBe(true);
    a.submit(cardCommand(P2, uid(a, P2)));
    const r = a.getPublicState().lastResult!;
    expect(r.outcome.damageToP2).toBe(10); // Meteor ATK 10 (fire beats ice)
  });

  it('repeated charging never grows the hand beyond 5', () => {
    const a = match();
    for (let i = 0; i < 6; i++) {
      a.submit(chargeCommand(P1)); a.submit(chargeCommand(P2));
      expect(a.getPrivateView(P1).hand.length).toBeLessThanOrEqual(5);
      next(a);
      expect(a.getPrivateView(P1).hand.length).toBeLessThanOrEqual(5);
      expect(a.getPrivateView(P1).mp).toBeLessThanOrEqual(10);
    }
    expect(a.currentPhase).toBe(MatchPhase.WaitingForSubmissions);
  });

  it('experiment OFF: charge is rejected', () => {
    const a = match(v6Baseline());
    expect(a.submit(chargeCommand(P1)).ok).toBe(false);
  });
});
