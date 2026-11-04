// The in-game "규칙 자가 테스트" button (port of Unity RuleSelfTest) must pass on the shipped data.
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/data';
import { runSelfTest } from '../src/game/selfTest';

describe('in-game rule self-test', () => {
  it('passes on the default v6 data', () => {
    const r = runSelfTest(buildContent(), 40);
    expect(r.failures).toEqual([]);
    expect(r.checks).toBeGreaterThan(1000);
  });
});
