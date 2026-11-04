// Rule tests ported from Unity Battle/RuleSelfTest.cs (representative judgement values of Unity v6).
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/data';
import {
  AttackResult, botChoose, CardDef, cardCommand, combat, damageOf, DeterministicRandom, Element, evaluatePower, FIELD_ORDER, FieldModeType,
  fieldMode, FieldState, level, MatchAuthority, MatchOutcome, MatchPhase, MatchupStanding, passCommand, PlayerSlot, preview, relation,
  resolveDamage, resolveRound, scaleBaseGain, simulateField, terms, v6Baseline, CardRole,
} from '../src/core';

const content = buildContent();
const opts = v6Baseline();
const empty = new FieldState();
const card = (id: string) => content.getCard(id)!;
const synthetic = (e: Element, atk: number, def: number): CardDef => ({
  id: 'synthetic-' + e, name: Element[e], element: e, baseCost: 2, atk, def, baseFieldGain: 18, traits: [],
  invest: { allowed: true, useRuleDefaults: true, gainPerMp: 5, maxExtraMp: 2 }, role: CardRole.Standard, isRoleSample: false, isTest: false, isPass: false, note: '',
});
const stats = (atk: number, def: number, pierce = 0) => ({ atk, def, pierce, gain: 0, mods: [] });

const CONFIRMED: Record<number, Element[]> = {
  [Element.Water]: [Element.Fire, Element.Rock],
  [Element.Fire]: [Element.Nature, Element.Ice],
  [Element.Nature]: [Element.Water, Element.Rock],
  [Element.Ice]: [Element.Water, Element.Nature],
  [Element.Rock]: [Element.Fire, Element.Ice],
  [Element.Dark]: [Element.Water, Element.Fire, Element.Nature, Element.Ice, Element.Rock],
  [Element.Light]: [Element.Dark],
};

describe('기본 상성 / 무상성 / 빛 vs 어둠', () => {
  it('49 element pairs: relation, success and damage', () => {
    for (const a of FIELD_ORDER) for (const b of FIELD_ORDER) {
      const exp = CONFIRMED[a].includes(b) ? 1 : CONFIRMED[b].includes(a) ? -1 : 0;
      expect(relation(content, a, b), `${Element[a]} vs ${Element[b]}`).toBe(exp);
      const ca = synthetic(a, 5, 1), cb = synthetic(b, 4, 1);
      const sa = combat(content, ca, cb, empty, opts), sb = combat(content, cb, ca, empty, opts);
      expect([sa.atk, sb.atk], 'matchup never changes ATK by default').toEqual([5, 4]);
      const o = resolveDamage(content, ca, sa, cb, sb);
      const ld = (a === Element.Light && b === Element.Dark) || (a === Element.Dark && b === Element.Light);
      if (ld) {
        const lightIsP1 = a === Element.Light;
        expect(o.result).toBe(AttackResult.LightDark);
        expect(lightIsP1 ? [o.damageToP1, o.damageToP2] : [o.damageToP2, o.damageToP1]).toEqual([0, 7]);
      } else if (exp > 0) expect([o.result, o.damageToP1, o.damageToP2]).toEqual([AttackResult.P1Only, 0, 4]);
      else if (exp < 0) expect([o.result, o.damageToP1, o.damageToP2]).toEqual([AttackResult.P2Only, 3, 0]);
      else expect([o.result, o.damageToP1, o.damageToP2]).toEqual([AttackResult.Both, 3, 4]);
    }
  });

  it('빛 vs 어둠 spec example: light 5 / dark 4 → dark takes 9', () => {
    let o = resolveDamage(content, synthetic(Element.Light, 0, 0), stats(5, 0), synthetic(Element.Dark, 0, 0), stats(4, 0));
    expect([o.damageToP1, o.damageToP2]).toEqual([0, 9]);
    o = resolveDamage(content, synthetic(Element.Dark, 0, 0), stats(4, 0), synthetic(Element.Light, 0, 0), stats(5, 0));
    expect([o.damageToP1, o.damageToP2]).toEqual([9, 0]);
    o = resolveDamage(content, synthetic(Element.Light, 0, 0), stats(6, 2, 1), synthetic(Element.Dark, 0, 0), stats(5, 3));
    expect([o.damageToP1, o.damageToP2, o.lightDamage, o.selfDamage]).toEqual([0, 7, 4, 3]);
  });

  it('named card cases (Unity RuleSelfTest)', () => {
    const cases: [string, string, AttackResult, number, number][] = [
      ['fire-ball', 'wind-arrow', AttackResult.P1Only, 0, 4],
      ['wind-arrow', 'fire-ball', AttackResult.P2Only, 4, 0],
      ['test-water', 'rock-bullet', AttackResult.P1Only, 0, 3],
      ['test-light', 'fire-ball', AttackResult.Both, 5, 5],
      ['test-light', 'test-dark', AttackResult.LightDark, 0, 8],
      ['fire-ball', 'fire-ball', AttackResult.Both, 5, 5],
    ];
    for (const [a, b, res, d1, d2] of cases) {
      const s1 = combat(content, card(a), card(b), empty, opts), s2 = combat(content, card(b), card(a), empty, opts);
      const o = resolveDamage(content, card(a), s1, card(b), s2);
      expect([o.result, o.damageToP1, o.damageToP2], `${a} vs ${b}`).toEqual([res, d1, d2]);
    }
  });
});

describe('공격 실패', () => {
  it('failed attack deals 0 damage, applies no on-hit effects, but still accumulates field', () => {
    const rc = resolveRound(content, empty, opts, { card: card('ice-ball'), extraMp: 0 }, { card: card('fire-ball'), extraMp: 0 });
    expect(rc.outcome.failedP1).toBe(true);
    expect(rc.outcome.damageToP2).toBe(0);
    expect(rc.afterHitP1.mpTax).toBe(0);
    expect(rc.afterHitP1.extraGain).toBe(0);
    // Ice Ball base 18 × lose 100% = 18 (failed attack still builds field)
    expect(rc.gains.find(g => g.element === Element.Ice)?.amount).toBe(18);
    expect(rc.fieldAfter.get(Element.Ice)).toBe(18);
    // winner Fire Ball: 18 × 50% = 9 + burn 5
    expect(rc.afterHitP2.standing).toBe(MatchupStanding.Win);
    expect(rc.afterHitP2.gain).toBe(14);
  });
});

describe('MP 투자', () => {
  const fb = card('fire-ball'), wa = card('wind-arrow'), water = card('test-water');
  const t = terms(content, fb, empty, opts);
  it('gain per MP, cap, never changes ATK/DEF/pierce', () => {
    expect(t.investAllowed).toBe(true);
    expect([t.gainPerMp, t.maxExtra]).toEqual([5, 2]);
    for (let x = 0; x <= 2; x++) expect(preview(content, fb, empty, opts, x).gain).toBe(18 + x * 5);
    expect(preview(content, fb, empty, opts, 7).gain).toBe(28);
    const p0 = preview(content, fb, empty, opts, 0), p2 = preview(content, fb, empty, opts, 2);
    expect([p2.atk, p2.def, p2.pierce]).toEqual([p0.atk, p0.def, p0.pierce]);
  });
  it('승/무/패 expected gains shown in the invest panel (사용 4 MP · 승 +19 / 무 +24 / 패 +28)', () => {
    expect(t.totalCost(2)).toBe(4);
    expect([t.gainFor(content.rules, MatchupStanding.Win, 2), t.gainFor(content.rules, MatchupStanding.Neutral, 2), t.gainFor(content.rules, MatchupStanding.Lose, 2)]).toEqual([19, 24, 28]);
  });
  it('investment is not scaled by the battle result', () => {
    const win = resolveRound(content, empty, opts, { card: fb, extraMp: 2 }, { card: wa, extraMp: 0 });
    expect(win.outcome.damageToP2).toBe(damageOf(win.statsP1, win.statsP2));
    expect(win.afterHitP1.gain).toBe(9 + 10 + 5); // 18×50% + 2×5 + burn
    const lose = resolveRound(content, empty, opts, { card: fb, extraMp: 2 }, { card: water, extraMp: 0 });
    expect(lose.outcome.damageToP2).toBe(0);
    expect(lose.afterHitP1.gain).toBe(18 + 10);
    expect(lose.fieldAfter.get(Element.Fire)).toBe(28);
    const both = resolveRound(content, empty, opts, { card: fb, extraMp: 1 }, { card: fb, extraMp: 2 });
    expect([both.afterHitP1.standing, both.afterHitP2.standing]).toEqual([MatchupStanding.Neutral, MatchupStanding.Neutral]);
    // 18×75% = 13.5 → 14 (round half away from zero) + invest + burn
    expect([both.afterHitP1.gain, both.afterHitP2.gain]).toEqual([14 + 5 + 5, 14 + 10 + 5]);
  });
  it('authority deducts cost+investment, rejects over-investment and MP shortage, hides pending spend', () => {
    const a = new MatchAuthority(content, opts);
    a.startNewMatch(7);
    a.configureForTest(PlayerSlot.P1, 4, 'fire-ball', 'rock-bullet');
    a.configureForTest(PlayerSlot.P2, 4, 'wind-arrow');
    const uid = a.getPrivateView(PlayerSlot.P1).hand[0].uid;
    expect(a.submit(cardCommand(PlayerSlot.P1, uid, 3)).ok).toBe(false); // over max
    a.configureForTest(PlayerSlot.P1, 3, 'fire-ball');
    const uid2 = a.getPrivateView(PlayerSlot.P1).hand[0].uid;
    const short = a.submit(cardCommand(PlayerSlot.P1, uid2, 2));
    expect(short.ok).toBe(false);
    expect(short.message).toContain('MP가 부족');
    expect(a.submit(cardCommand(PlayerSlot.P1, uid2, 1)).ok).toBe(true);
    expect(a.getPrivateView(PlayerSlot.P1).mp).toBe(0);
    expect(a.getPublicState().players[0].mp).toBe(3); // opponent sees MP before the pending spend
  });
  it('MP 부족: pass only when nothing is affordable', () => {
    const a = new MatchAuthority(content, opts);
    a.startNewMatch(3);
    a.configureForTest(PlayerSlot.P1, 1, 'fire-ball');
    expect(a.submit(passCommand(PlayerSlot.P1)).ok).toBe(true);
    a.configureForTest(PlayerSlot.P2, 2, 'fire-ball');
    expect(a.submit(passCommand(PlayerSlot.P2)).ok).toBe(false);
  });
});

describe('필드 배율 / 감소 / 공명 / 혼합', () => {
  const R = content.rules;
  it('승/무/패 base multipliers 50% / 75% / 100%', () => {
    expect([scaleBaseGain(R, 18, MatchupStanding.Win), scaleBaseGain(R, 18, MatchupStanding.Neutral), scaleBaseGain(R, 18, MatchupStanding.Lose)]).toEqual([9, 14, 18]);
    expect([scaleBaseGain(R, 15, MatchupStanding.Win), scaleBaseGain(R, 17, MatchupStanding.Win)]).toEqual([8, 9]);
  });
  it('field decays by 3 every round and is clamped to 0..100', () => {
    const f = new FieldState(); f.set(Element.Fire, 50); f.set(Element.Water, 2);
    const n = simulateField(content, f, [{ element: Element.Fire, amount: 80, source: PlayerSlot.P1 }], opts);
    expect([n.get(Element.Fire), n.get(Element.Water)]).toEqual([100, 0]);
  });
  it('resonance Lv1/2/3 at 20/45/70 (fire: ATK +1 per level)', () => {
    for (const [v, lv] of [[19, 0], [20, 1], [45, 2], [70, 3]]) {
      expect(level(R, v)).toBe(lv);
      const f = new FieldState(); f.set(Element.Fire, v);
      expect(preview(content, card('fire-ball'), f, opts).atk).toBe(5 + lv);
      expect(evaluatePower(content, card('fire-ball'), f, opts).tier).toBe(lv);
    }
  });
  it('dominant / hybrid / unstable modes', () => {
    const f = new FieldState(); f.set(Element.Fire, 40);
    expect(fieldMode(content, f).type).toBe(FieldModeType.Dominant);
    f.set(Element.Ice, 30);
    expect(fieldMode(content, f).type).toBe(FieldModeType.Hybrid); // 해빙 증기: all cards DEF -1
    expect(preview(content, card('rock-bullet'), f, opts).def).toBe(0);
    const u = new FieldState(); u.set(Element.Water, 22); u.set(Element.Light, 20);
    expect(fieldMode(content, u).type).toBe(FieldModeType.Unstable);
  });
});

describe('게임 종료', () => {
  it('HP reaching 0 ends the match with the right winner', () => {
    const a = new MatchAuthority(content, opts);
    a.startNewMatch(11);
    a.setHpForTest(PlayerSlot.P2, 3);
    a.configureForTest(PlayerSlot.P1, 4, 'fire-ball');
    a.configureForTest(PlayerSlot.P2, 4, 'wind-arrow');
    a.submit(cardCommand(PlayerSlot.P1, a.getPrivateView(PlayerSlot.P1).hand[0].uid));
    a.submit(cardCommand(PlayerSlot.P2, a.getPrivateView(PlayerSlot.P2).hand[0].uid));
    const s = a.getPublicState();
    expect(s.phase).toBe(MatchPhase.GameOver);
    expect(s.outcome).toBe(MatchOutcome.P1Wins);
    expect(s.players[1].hp).toBe(0);
  });
  it('bot games always finish with cards conserved and hidden info kept', () => {
    for (let g = 0; g < 60; g++) {
      const a = new MatchAuthority(content, opts);
      a.startNewMatch(500 + g);
      const rng = new DeterministicRandom(g);
      const total = a.totalCardsFor(PlayerSlot.P1);
      let rounds = 0;
      while (a.getPublicState().phase !== MatchPhase.GameOver && rounds < 300) {
        for (const s of [PlayerSlot.P1, PlayerSlot.P2]) {
          const st = a.getPublicState();
          const c = botChoose(content, a.getPrivateView(s), st.field, st.options, rng);
          c.slot = s;
          expect(a.submit(c).ok).toBe(true);
          if (s === PlayerSlot.P1 && a.getPublicState().phase === MatchPhase.WaitingForSubmissions) {
            expect(a.getPublicState().players[0].submitted).toBe(true);
            expect(a.getPublicState().lastResult?.round ?? 0).toBeLessThan(a.getPublicState().round);
          }
        }
        if (a.getPublicState().phase === MatchPhase.GameOver) break;
        a.readyForNextRound(PlayerSlot.P1); a.readyForNextRound(PlayerSlot.P2);
        expect(a.totalCardsFor(PlayerSlot.P1)).toBe(total);
        const p = a.getPublicState().players[0];
        expect(p.mp).toBeGreaterThanOrEqual(0);
        expect(p.mp).toBeLessThanOrEqual(p.maxMp);
        rounds++;
      }
      expect(a.getPublicState().phase).toBe(MatchPhase.GameOver);
    }
  });
});
