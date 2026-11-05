// v9 베이스라인 규칙 테스트: DEF 없음(ATK 가 그대로 피해), MP 회복 +3, 7속성 21장 덱, 손패 최대 5장.
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/data';
import {
  AttackResult, botChoose, CardDef, cardCommand, combat, DeterministicRandom, Element, FIELD_ORDER, FieldModeType, fieldMode, FieldState,
  level, MatchAuthority, MatchOutcome, MatchPhase, MatchupStanding, PlayerSlot, relation, resolveDamage, resolveRound, scaleBaseGain,
  simulateField, terms, v6Baseline, CardRole, TestRuleOptions,
} from '../src/core';

const content = buildContent();
const R = content.rules;
const opts: TestRuleOptions = { ...v6Baseline(), chargeExperiment: true };
const empty = new FieldState();
const card = (id: string) => content.getCard(id)!;
const synthetic = (e: Element, atk: number): CardDef => ({
  id: 'synthetic-' + e, name: Element[e], element: e, baseCost: 2, atk, baseFieldGain: 18, traits: [],
  invest: { allowed: true, useRuleDefaults: true, gainPerMp: 5, maxExtraMp: 2 }, role: CardRole.Standard, isRoleSample: false, isTest: false, isPass: false, note: '',
});
const stats = (atk: number) => ({ atk, gain: 0, mods: [] });
const P1 = PlayerSlot.P1, P2 = PlayerSlot.P2;

const BEATS: Record<number, Element[]> = {
  [Element.Water]: [Element.Fire, Element.Rock], [Element.Fire]: [Element.Nature, Element.Ice], [Element.Nature]: [Element.Water, Element.Rock],
  [Element.Ice]: [Element.Water, Element.Nature], [Element.Rock]: [Element.Fire, Element.Ice],
  [Element.Dark]: [Element.Water, Element.Fire, Element.Nature, Element.Ice, Element.Rock], [Element.Light]: [Element.Dark],
};

describe('카드풀 / 덱', () => {
  it('21 cards: 7 elements × 3, costs 2–7, no DEF field', () => {
    expect(content.cards.length).toBe(21);
    for (const e of FIELD_ORDER) expect(content.cards.filter(c => c.element === e).length).toBe(3);
    const costs = content.cards.map(c => c.baseCost);
    expect(Math.min(...costs)).toBe(2);
    expect(Math.max(...costs)).toBe(7);
    for (const c of content.cards) expect('def' in c).toBe(false);
  });

  it('deck = 21 cards (1 each); every element is drawn over a match', () => {
    const a = new MatchAuthority(content, opts);
    a.startNewMatch(3);
    expect(a.totalCardsFor(P1)).toBe(21);
    const seen = new Set<Element>();
    const rng = new DeterministicRandom(9);
    for (let r = 0; r < 40 && a.currentPhase !== MatchPhase.GameOver; r++) {
      for (const s of [P1, P2]) for (const c of a.getPrivateView(s).hand) seen.add(content.getCard(c.cardId)!.element);
      for (const s of [P1, P2]) expect(a.submit(botChoose(content, a.getPrivateView(s), a.getPublicState().field, opts, rng)).ok).toBe(true);
      if (a.currentPhase === MatchPhase.RoundResolved) { a.readyForNextRound(P1); a.readyForNextRound(P2); }
      for (const s of [P1, P2]) expect(a.getPrivateView(s).hand.length).toBeLessThanOrEqual(5);
    }
    expect(seen.size).toBe(7);
  });
});

describe('상성 / 피해 (DEF 없음)', () => {
  it('49 element pairs: winner hits with full ATK, loser deals 0, no matchup → both hit', () => {
    for (const a of FIELD_ORDER) for (const b of FIELD_ORDER) {
      const exp = BEATS[a].includes(b) ? 1 : BEATS[b].includes(a) ? -1 : 0;
      expect(relation(content, a, b)).toBe(exp);
      const ca = synthetic(a, 5), cb = synthetic(b, 4);
      const o = resolveDamage(content, ca, combat(content, ca, cb, empty, opts), cb, combat(content, cb, ca, empty, opts));
      const ld = (a === Element.Light && b === Element.Dark) || (a === Element.Dark && b === Element.Light);
      if (ld) expect(o.result).toBe(AttackResult.LightDark);
      else if (exp > 0) expect([o.damageToP1, o.damageToP2]).toEqual([0, 5]);
      else if (exp < 0) expect([o.damageToP1, o.damageToP2]).toEqual([4, 0]);
      else expect([o.damageToP1, o.damageToP2]).toEqual([4, 5]);
    }
  });

  it('빛 vs 어둠: light 5 / dark 4 → dark takes 9 (both directions)', () => {
    let o = resolveDamage(content, synthetic(Element.Light, 5), stats(5), synthetic(Element.Dark, 4), stats(4));
    expect([o.damageToP1, o.damageToP2]).toEqual([0, 9]);
    o = resolveDamage(content, synthetic(Element.Dark, 4), stats(4), synthetic(Element.Light, 5), stats(5));
    expect([o.damageToP1, o.damageToP2]).toEqual([9, 0]);
  });

  it('real cards: Meteor (7 cost) hits for its full ATK', () => {
    const rc = resolveRound(content, empty, opts, { card: card('meteor'), extraMp: 0 }, { card: card('vine-whip'), extraMp: 0 });
    expect(rc.outcome.damageToP2).toBe(10);
    expect(rc.outcome.damageToP1).toBe(0);
  });

  it('failed attack deals 0 but still builds field (lose = 100%)', () => {
    const rc = resolveRound(content, empty, opts, { card: card('vine-whip'), extraMp: 0 }, { card: card('fire-bolt'), extraMp: 0 });
    expect(rc.outcome.damageToP2).toBe(0);
    expect(rc.afterHitP1.standing).toBe(MatchupStanding.Lose);
    expect(rc.gains.find(g => g.source === P1)!.amount).toBe(16);
  });
});

describe('MP 경제', () => {
  it('round regen +3, capped at 10; 2–7 cost cards playable', () => {
    expect(R.mpPerRound).toBe(3);
    const a = new MatchAuthority(content, opts);
    a.startNewMatch(1);
    a.configureForTest(P1, 7, 'meteor', 'water-bolt'); a.configureForTest(P2, 9, 'water-bolt');
    expect(a.submit(cardCommand(P1, a.getPrivateView(P1).hand[0].uid)).ok).toBe(true);
    expect(a.submit(cardCommand(P2, a.getPrivateView(P2).hand[0].uid)).ok).toBe(true);
    a.readyForNextRound(P1); a.readyForNextRound(P2);
    expect(a.getPrivateView(P1).mp).toBe(3);   // 7 − 7 + 3
    expect(a.getPrivateView(P2).mp).toBe(10);  // 9 − 2 + 3
    a.configureForTest(P2, 9, 'water-bolt');
    a.submit(cardCommand(P1, a.getPrivateView(P1).hand[0].uid)); a.submit(cardCommand(P2, a.getPrivateView(P2).hand[0].uid));
    a.readyForNextRound(P1); a.readyForNextRound(P2);
    expect(a.getPrivateView(P2).mp).toBe(10);  // 7 + 3 → capped
  });

  it('cheap cards leave MP to grow toward the 5–7 cost range', () => {
    let mp = R.startMp;
    for (let i = 0; i < 4; i++) mp = Math.min(R.maxMp, mp - 2 + R.mpPerRound);
    expect(mp).toBeGreaterThanOrEqual(8);
  });

  it('investment adds field only, not ATK', () => {
    const t = terms(content, card('fire-bolt'), empty, opts);
    expect(combat(content, card('fire-bolt'), card('vine-whip'), empty, opts, 2).atk).toBe(4);
    expect(t.investGain(2)).toBe(10);
  });
});

describe('필드', () => {
  it('win/neutral/lose multipliers 50/75/100%', () => {
    expect([scaleBaseGain(R, 18, MatchupStanding.Win), scaleBaseGain(R, 18, MatchupStanding.Neutral), scaleBaseGain(R, 18, MatchupStanding.Lose)]).toEqual([9, 14, 18]);
  });
  it('decay 3 per round, clamp 0..100, levels 20/45/70', () => {
    const f = new FieldState(); f.set(Element.Fire, 2); f.set(Element.Ice, 99);
    const after = simulateField(content, f, [{ element: Element.Ice, amount: 30, source: P1 }], opts);
    expect(after.get(Element.Fire)).toBe(0); expect(after.get(Element.Ice)).toBe(100);
    expect([level(R, 19), level(R, 20), level(R, 45), level(R, 70)]).toEqual([0, 1, 2, 3]);
    const g = new FieldState(); g.set(Element.Fire, 50);
    expect(fieldMode(content, g).type).toBe(FieldModeType.Dominant);
  });
  it('field-power effect: Thorn Burst gains ATK +2 per Nature level', () => {
    const f = new FieldState(); f.set(Element.Nature, 50);
    expect(combat(content, card('thorn-burst'), card('rock-bullet'), f, opts).atk).toBe(4 + 2 * 2 + 0);
  });
});

describe('게임 종료', () => {
  it('HP 0 ends the match; bot games finish with cards conserved', () => {
    const a = new MatchAuthority(content, opts);
    a.startNewMatch(5);
    a.setHpForTest(P2, 3);
    a.configureForTest(P1, 4, 'fire-bolt'); a.configureForTest(P2, 4, 'vine-whip');
    a.submit(cardCommand(P1, a.getPrivateView(P1).hand[0].uid)); a.submit(cardCommand(P2, a.getPrivateView(P2).hand[0].uid));
    expect(a.getPublicState().outcome).toBe(MatchOutcome.P1Wins);
    for (let g = 0; g < 40; g++) {
      const m = new MatchAuthority(content, opts);
      m.startNewMatch(100 + g);
      const rng = new DeterministicRandom(g);
      let rounds = 0;
      while (m.currentPhase !== MatchPhase.GameOver && rounds++ < 200) {
        for (const s of [P1, P2]) expect(m.submit(botChoose(content, m.getPrivateView(s), m.getPublicState().field, opts, rng)).ok).toBe(true);
        expect(m.totalCardsFor(P1)).toBe(21);
        for (const p of m.getPublicState().players) { expect(p.mp).toBeLessThanOrEqual(10); expect(p.handCount).toBeLessThanOrEqual(5); }
        if (m.currentPhase === MatchPhase.RoundResolved) { m.readyForNextRound(P1); m.readyForNextRound(P2); }
      }
      expect(m.currentPhase).toBe(MatchPhase.GameOver);
    }
  });
});
