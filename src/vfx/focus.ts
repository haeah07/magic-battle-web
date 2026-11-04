// Runtime of the stage-based focus (config/vfx.ts FOCUS): the controller/presenter set the phase,
// values ease toward the phase weights and the battle screen applies them to slots, towers, centre and environment.
import { FOCUS, FOCUS_SPEED, FocusPhase, FocusWeights, IMPACT_UNHIT_TOWER } from '../config/vfx';

export const focus = {
  phase: 'choosing' as FocusPhase,
  v: { ...FOCUS.choosing } as FocusWeights,
  /** impact phase: which towers actually take damage this round (only those are emphasised) */
  hit: { my: true, enemy: true },
  set(p: FocusPhase) { this.phase = p; },
  setImpact(myTowerHit: boolean, enemyTowerHit: boolean) { this.phase = 'impact'; this.hit = { my: myTowerHit, enemy: enemyTowerHit }; },
  reset(p: FocusPhase = 'choosing') { this.phase = p; this.v = { ...FOCUS[p] }; },
  update(dt: number) {
    let t = FOCUS[this.phase];
    if (this.phase === 'impact') t = { ...t, myTower: this.hit.my ? t.myTower : IMPACT_UNHIT_TOWER, enemyTower: this.hit.enemy ? t.enemyTower : IMPACT_UNHIT_TOWER };
    const k = 1 - Math.exp(-dt * FOCUS_SPEED);
    for (const key of Object.keys(t) as (keyof FocusWeights)[]) this.v[key] += (t[key] - this.v[key]) * k;
  },
};
/** 0..1 emphasis → multiplier with a floor (never fully hidden) */
export const emph = (e: number, floor: number) => floor + (1 - floor) * Math.max(0, Math.min(1, e));
