// Condensed port of Battle/RuleSelfTest.cs for the in-game debug button ("규칙 자가 테스트").
// The full rule tests live in tests/*.test.ts (npm test); this runs inside the browser on the current data.
import { AttackResult, relation } from '../core/element';
import { combat, damageOf, termsFromMods } from '../core/combat';
import { resolveDamage, standingOf } from '../core/battle';
import { FieldState, simulateField } from '../core/field';
import { botChoose, MatchAuthority, MatchOutcome, MatchPhase } from '../core/match';
import { DeterministicRandom } from '../core/random';
import { CardDef, CombatStats, Element, FIELD_ORDER, PlayerSlot, TestRuleOptions, cloneOptions } from '../core/types';
import { GameContent } from '../core/content';

export interface SelfTestReport { summary: string; log: string[]; failures: string[]; checks: number }

const CONFIRMED: Record<number, Element[]> = {
  [Element.Water]: [Element.Fire, Element.Rock],
  [Element.Fire]: [Element.Nature, Element.Ice],
  [Element.Nature]: [Element.Water, Element.Rock],
  [Element.Ice]: [Element.Water, Element.Nature],
  [Element.Rock]: [Element.Fire, Element.Ice],
  [Element.Dark]: [Element.Water, Element.Fire, Element.Nature, Element.Ice, Element.Rock],
  [Element.Light]: [Element.Dark],
};
const expected = (a: Element, b: Element) => (CONFIRMED[a].includes(b) ? 1 : CONFIRMED[b].includes(a) ? -1 : 0);

function synthetic(e: Element, atk: number): CardDef {
  return { id: 'synthetic-' + Element[e], name: Element[e], element: e, baseCost: 2, atk, baseFieldGain: 18, traits: [], isPass: false, isTest: false } as unknown as CardDef;
}
const stats = (atk: number): CombatStats => ({ atk, gain: 0, mods: [] });

export function runSelfTest(content: GameContent, games = 100): SelfTestReport {
  const failures: string[] = [], log: string[] = [];
  let checks = 0;
  const check = (ok: boolean, msg: string) => { checks++; if (!ok) failures.push(msg); };
  const opts = cloneOptions(content.rules.defaultOptions);
  const empty = new FieldState();
  check(!opts.matchupStatBonus, 'Default option matchupStatBonus must be OFF');
  check(!opts.suppression, 'Default option suppression must be OFF');

  let pairs = 0;
  for (const a of FIELD_ORDER) for (const b of FIELD_ORDER) {
    pairs++;
    const exp = expected(a, b);
    check(relation(content, a, b) === exp, `Relation ${Element[a]} vs ${Element[b]} expected ${exp}`);
    const ca = synthetic(a, 5), cb = synthetic(b, 4);
    const sa = combat(content, ca, cb, empty, opts), sb = combat(content, cb, ca, empty, opts);
    check(sa.atk === 5 && sb.atk === 4, `${Element[a]} vs ${Element[b]}: matchup must not change ATK by default`);
    const o = resolveDamage(content, ca, sa, cb, sb);
    const ld = (a === Element.Light && b === Element.Dark) || (a === Element.Dark && b === Element.Light);
    if (ld) {
      const lightIsP1 = a === Element.Light;
      check(o.result === AttackResult.LightDark, `${Element[a]} vs ${Element[b]} should be LightDark`);
      check(lightIsP1 ? o.damageToP1 === 0 && o.damageToP2 === 9 : o.damageToP2 === 0 && o.damageToP1 === 9, `${Element[a]} vs ${Element[b]} special damage wrong`);
    } else if (exp > 0) check(o.result === AttackResult.P1Only && o.damageToP1 === 0 && o.damageToP2 === 5, `${Element[a]}>${Element[b]}: only P1 should hit`);
    else if (exp < 0) check(o.result === AttackResult.P2Only && o.damageToP1 === 4 && o.damageToP2 === 0, `${Element[a]}<${Element[b]}: only P2 should hit`);
    else check(o.result === AttackResult.Both && o.damageToP1 === 4 && o.damageToP2 === 5, `${Element[a]}=${Element[b]}: both should hit`);
  }
  log.push(`Element pairs checked: ${pairs}`);
  let ex = resolveDamage(content, synthetic(Element.Light, 0), stats(5), synthetic(Element.Dark, 0), stats(4));
  check(ex.damageToP1 === 0 && ex.damageToP2 === 9, 'Spec example light 5 / dark 4 → dark 9');
  ex = resolveDamage(content, synthetic(Element.Dark, 0), stats(4), synthetic(Element.Light, 0), stats(5));
  check(ex.damageToP1 === 9 && ex.damageToP2 === 0 && ex.lightDamage === 5 && ex.selfDamage === 4, 'Spec example mirrored → dark (P1) 9');

  const named = (id1: string, id2: string, want: AttackResult) => {
    const a = content.getCard(id1), b = content.getCard(id2);
    if (!a || !b) { log.push(`skip ${id1} vs ${id2} (card missing)`); return; }
    const s1 = combat(content, a, b, empty, opts), s2 = combat(content, b, a, empty, opts);
    const o = resolveDamage(content, a, s1, b, s2);
    check(o.result === want, `${id1} vs ${id2}: expected ${AttackResult[want]}, got ${AttackResult[o.result]}`);
    if (want === AttackResult.P1Only) check(o.damageToP1 === 0 && o.damageToP2 === damageOf(s1, s2), `${id1} vs ${id2}: damage mismatch`);
    log.push(`${id1} vs ${id2} → ${AttackResult[o.result]}  P1 받음 ${o.damageToP1} / P2 받음 ${o.damageToP2}`);
  };
  named('fire-bolt', 'vine-whip', AttackResult.P1Only);
  named('vine-whip', 'fire-bolt', AttackResult.P2Only);
  named('water-bolt', 'rock-bullet', AttackResult.P1Only);
  named('light-ray', 'fire-bolt', AttackResult.Both);
  named('light-ray', 'shadow-bolt', AttackResult.LightDark);
  named('shadow-bolt', 'ice-shard', AttackResult.P1Only);
  named('fire-bolt', 'fire-bolt', AttackResult.Both);

  simulate(content, games, opts, check, log);
  if (content.cards.some(c => c.isTest)) { const t = cloneOptions(opts); t.testCards = true; simulate(content, Math.max(1, games / 2), t, check, log); }
  const summary = failures.length === 0 ? `PASS · ${checks} checks` : `FAIL · ${failures.length}/${checks} failed\n` + failures.slice(0, 20).join('\n');
  return { summary, log, failures, checks };
}

function simulate(content: GameContent, games: number, opts: TestRuleOptions, check: (ok: boolean, m: string) => void, log: string[]) {
  let total = 0, maxR = 0, draws = 0;
  for (let g = 0; g < games; g++) {
    const auth = new MatchAuthority(content, opts);
    auth.startNewMatch(1000 + g);
    const rng = new DeterministicRandom(77 + g);
    const deck = auth.totalCardsFor(PlayerSlot.P1);
    let rounds = 0;
    while (auth.currentPhase !== MatchPhase.GameOver && rounds < 300) {
      const pub = auth.getPublicState();
      const v1 = auth.getPrivateView(PlayerSlot.P1);
      const c1 = botChoose(content, v1, pub.field, opts, rng);
      check(auth.submit(c1).ok, 'P1 submit rejected');
      check(auth.getPublicState().players[0].mp === v1.mp, 'Public MP must hide the pending spend');
      check(auth.getPrivateView(PlayerSlot.P2).submittedCardUid === null, 'P2 view must not contain P1 submission');
      const c2 = botChoose(content, auth.getPrivateView(PlayerSlot.P2), pub.field, opts, rng);
      check(auth.submit(c2).ok, 'P2 submit rejected');
      rounds++;
      const after = auth.getPublicState();
      const lr = after.lastResult;
      if (lr) {
        check(lr.fieldAfter.values.join() === simulateField(content, pub.field, lr.gains, opts).values.join(), 'Field after must equal decay + gains');
        for (const play of [lr.p1, lr.p2]) {
          if (play.isPass) continue;
          const t = termsFromMods(content, content.getCard(play.cardId)!, play.stats.mods);
          const st = standingOf(play.slot, lr.outcome);
          check(play.afterHit.gain === t.gainFor(content.rules, st, play.extraMp) + play.afterHit.extraGain, 'Field gain = scaled base + other + investment + on-hit');
          check(play.afterHit.investGain === t.investGain(play.extraMp), 'Investment never scaled by result');
        }
      }
      for (const p of after.players) { check(p.hp >= 0 && p.hp <= p.maxHp, 'HP out of range'); check(p.mp >= 0 && p.mp <= p.maxMp, 'MP out of range'); }
      for (const v of after.field.values) check(v >= 0 && v <= content.rules.fieldMax, 'Field out of range');
      check(auth.totalCardsFor(PlayerSlot.P1) === deck && auth.totalCardsFor(PlayerSlot.P2) === deck, 'Card count changed');
      if (auth.currentPhase === MatchPhase.RoundResolved) { auth.readyForNextRound(PlayerSlot.P1); auth.readyForNextRound(PlayerSlot.P2); }
    }
    check(auth.currentPhase === MatchPhase.GameOver, `Game ${g} did not finish in 300 rounds`);
    const f = auth.getPublicState();
    if (f.outcome === MatchOutcome.Draw) draws++;
    const ok = (f.outcome === MatchOutcome.Draw && f.players[0].hp === 0 && f.players[1].hp === 0)
      || (f.outcome === MatchOutcome.P1Wins && f.players[1].hp === 0 && f.players[0].hp > 0)
      || (f.outcome === MatchOutcome.P2Wins && f.players[0].hp === 0 && f.players[1].hp > 0);
    check(ok, `Game ${g} outcome inconsistent with HP`);
    total += rounds; maxR = Math.max(maxR, rounds);
  }
  if (games > 0) log.push(`Simulated ${games} games (testCards=${opts.testCards}, roleCards=${opts.roleCards}, identity=${opts.elementIdentity}): avg ${(total / games).toFixed(1)} rounds, max ${maxR}, draws ${draws}`);
}
