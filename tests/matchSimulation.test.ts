// 현행 규칙(v9: DEF 없음, MP +3, 7속성 21장, 최대 MP 10, 손패 5장, 충전 OFF)으로 봇 대 봇 경기를 끝까지 돌려
// 라운드마다 지켜져야 하는 불변식을 확인한다. (예전 Unity v6 기록 재생 테스트를 대체)
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/data';
import { botChoose, MatchAuthority, MatchOutcome, MatchPhase, PlayerSlot, v6Baseline } from '../src/core';
import { DeterministicRandom } from '../src/core/random';

const content = buildContent();
const R = content.rules;

function playMatch(seed: number) {
  const a = new MatchAuthority(content, v6Baseline());
  a.startNewMatch(seed);
  const rng = new DeterministicRandom(seed ^ 0x5f3759df);
  const log: string[] = [];
  let rounds = 0;
  while (a.getPublicState().phase !== MatchPhase.GameOver && rounds < 100) {
    for (const s of [PlayerSlot.P1, PlayerSlot.P2]) {
      const view = a.getPrivateView(s);
      expect(view.hand.length, `seed ${seed} hand`).toBeLessThanOrEqual(R.maxHand);
      expect(view.mp).toBeGreaterThanOrEqual(0);
      expect(view.mp).toBeLessThanOrEqual(R.maxMp);
      const st = a.getPublicState();
      const c = botChoose(content, view, st.field, st.options, rng);
      c.slot = s;
      expect(a.submit(c).ok, `seed ${seed} round ${rounds + 1} submit`).toBe(true);
    }
    const r = a.getPublicState().lastResult!;
    const o = r.outcome;
    // 피해는 항상 0 이상이고 HP 는 시작 HP 를 넘지 않는다
    for (const i of [0, 1]) {
      expect(r.hpAfter[i]).toBeGreaterThanOrEqual(0);
      expect(r.hpAfter[i]).toBeLessThanOrEqual(R.startHp);
      expect(r.hpAfter[i]).toBeLessThanOrEqual(r.hpBefore[i]);
    }
    expect(r.hpBefore[0] - r.hpAfter[0]).toBe(Math.min(r.hpBefore[0], o.damageToP1));
    expect(r.hpBefore[1] - r.hpAfter[1]).toBe(Math.min(r.hpBefore[1], o.damageToP2));
    // 공격에 실패한 쪽은 상대에게 피해를 주지 못한다
    if (o.failedP1) expect(o.damageToP2).toBe(0);
    if (o.failedP2) expect(o.damageToP1).toBe(0);
    // 필드 수치는 0..fieldMax
    for (const v of r.fieldAfter.values) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(R.fieldMax); }
    // 충전은 기본 OFF
    expect(r.p1.isCharge).toBeFalsy();
    expect(r.p2.isCharge).toBeFalsy();
    // MP 투자는 최대 investMaxExtra
    expect(r.p1.extraMp).toBeLessThanOrEqual(R.investMaxExtra);
    expect(r.p2.extraMp).toBeLessThanOrEqual(R.investMaxExtra);
    log.push(`${r.hpAfter.join('/')}:${r.fieldNameAfter}`);
    rounds++;
    if (a.getPublicState().phase === MatchPhase.GameOver) break;
    a.readyForNextRound(PlayerSlot.P1);
    a.readyForNextRound(PlayerSlot.P2);
  }
  return { a, rounds, log };
}

describe('현행 규칙 전체 경기 시뮬레이션', () => {
  it('여러 시드의 경기가 모든 라운드 불변식을 지키며 끝난다', () => {
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { a, rounds } = playMatch(seed);
      total += rounds;
      expect(a.getPublicState().phase, `seed ${seed} 종료`).toBe(MatchPhase.GameOver);
      expect(a.getPublicState().outcome).not.toBe(MatchOutcome.InProgress);
    }
    expect(total).toBeGreaterThan(200);
  });

  it('같은 시드는 같은 경기, 다른 시드는 다른 경기', () => {
    expect(playMatch(42).log).toEqual(playMatch(42).log);
    expect(playMatch(42).log).not.toEqual(playMatch(43).log);
  });
});
