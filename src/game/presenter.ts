// Port of Game/BattlePresenter.cs — plays a RoundResult that the MatchAuthority already judged.
// The presenter never computes rules: every number shown comes from the RoundResult.
// Sequence: reveal → magic spawns from the card → centre clash → judgement → loser fizzles/shatters →
// winner flies to the enemy tower → tower hit → field gain chips → environment change.
import { THEME } from '../config/theme';
import { VFX } from '../config/vfx';
import { outcomeDamageTo, outcomeFailed } from '../core/battle';
import { termsFromMods } from '../core/combat';
import { AttackResult } from '../core/element';
import { fieldChanged, playOf, RevealedPlay, RoundResult } from '../core/match';
import { cardHasProjectile, other, PlayerSlot, slotLabel } from '../core/types';
import { BattleScreen } from '../ui/battleScreen';
import { MANA_COLOR } from '../ui/cardView';
import { C, Color, lerpColor, WHITE } from '../ui/color';
import { Co, CoOwner, Time, V2, v2 } from '../ui/engine';
import { SlotState } from '../ui/slotView';
import { VisualLibrary } from './visuals';
import { focus } from '../vfx/focus';

const lerpV = (a: V2, b: V2, k: number) => v2(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);

export class BattlePresenter {
  speed = 1;
  keepOwnCardVisible = false;
  skip = false;
  private keepFaceUp = new Set<PlayerSlot>();
  private content;
  /** coroutines started "on the screen" (Unity _ui.StartCoroutine) */
  readonly co = new CoOwner();

  constructor(private ui: BattleScreen, private lib: VisualLibrary) { this.content = lib.content; }

  private wait(co: Co, seconds: number) { return this.skip ? co.frame() : co.wait(seconds / Math.max(0.1, this.speed)); }

  private colorOf(p: RevealedPlay): Color {
    const def = this.content.getCard(p.cardId);
    if (p.isCharge) return MANA_COLOR;
    if (!def || def.isPass) return C(0.6, 0.62, 0.66);
    if (def.id === 'lightning') return C(1, 0.92, 0.45);
    return this.lib.elementColor(def.element);
  }
  private slotPos(s: PlayerSlot) { return this.ui.slot(s).rt.worldPosition(); }
  private towerPos(s: PlayerSlot) { return this.ui.tower(s).coreRect.worldPosition(); }
  private get corePos() { return this.ui.clashRect.worldPosition(); }

  showRoundStart(r: RoundResult) {
    this.ui.tower(PlayerSlot.P1).setHp(r.hpBefore[0], this.content.rules.startHp, true);
    this.ui.tower(PlayerSlot.P2).setHp(r.hpBefore[1], this.content.rules.startHp, true);
    this.ui.renderField(r.fieldBefore, true);
  }

  async play(co: Co, r: RoundResult, maxHp: number[]) {
    this.ui.vfx.speed = this.speed;
    focus.set('reveal');
    const th = THEME;
    this.keepFaceUp.clear();
    for (const s of [PlayerSlot.P1, PlayerSlot.P2]) {
      const view = this.ui.slot(s);
      const play = playOf(r, s);
      const alreadyVisible = view.state === SlotState.Locked && !view.card.faceDown && view.card.uid === play.cardUid && play.cardUid !== null;
      if (alreadyVisible && this.keepOwnCardVisible) this.keepFaceUp.add(s);
      else view.showHidden();
      view.setStatus('', th.accentColor);
    }
    this.ui.banner.show('동시 공개', '', th.accentColor, 0.8 / this.speed);
    await this.wait(co, 0.15);
    await this.flip(co, r);
    for (const s of [PlayerSlot.P1, PlayerSlot.P2]) {
      const play = playOf(r, s);
      if (play && play.isCharge) { this.ui.floating.spawn(this.ui.slot(s).rt, v2(0, 175), `충전 +${play.chargeMp ?? 0} MP`, MANA_COLOR, 30, 1.6 / this.speed); continue; }
      if (!play || play.isPass || play.extraMp <= 0) continue;
      this.ui.floating.spawn(this.ui.slot(s).rt, v2(0, 175), `MP 투자 +${play.extraMp} → 필드 +${play.afterHit?.investGain ?? 0}`, MANA_COLOR, 24, 1.6 / this.speed);
    }
    await this.wait(co, 0.35);

    // magic spawns from each card and travels to the clash point (the card itself stays in the slot)
    for (const s of [PlayerSlot.P1, PlayerSlot.P2]) {
      const play = playOf(r, s);
      const def = this.content.getCard(play.cardId);
      if (!def || def.isPass) continue;
      this.co.start(c => this.lunge(c, s));
      if (!cardHasProjectile(def)) this.co.start(c => this.ui.vfx.shield(c, this.colorOf(play), this.slotPos(s), 1.6));
      else this.co.start(c => this.ui.vfx.fly(c, this.colorOf(play), this.slotPos(s), this.corePos, 0.45, 38, false));
    }
    await this.wait(co, 0.45);
    const charges = (r.p1.isCharge ? 1 : 0) + (r.p2.isCharge ? 1 : 0);
    if (charges === 0) {
      this.ui.vfx.burst(this.corePos, lerpColor(this.colorOf(r.p1), this.colorOf(r.p2), 0.5), 300, VFX.clash);
      if (VFX.clash > 0) this.ui.circle.pulseOnce(WHITE);
      this.ui.shakeScreen(9 * VFX.clash, 0.25);
    }

    const o = r.outcome;
    let title: string, sub: string;
    let accent = th.accentColor;
    if (charges === 2) { title = '양쪽 충전'; sub = '공격 없음 · 양쪽 MP +2'; accent = MANA_COLOR; }
    else if (charges === 1) {
      const attacker = r.p1.isCharge ? PlayerSlot.P2 : PlayerSlot.P1;
      const ae = this.content.getCard(playOf(r, attacker).cardId);
      title = ae && !ae.isPass ? `${this.lib.elementLabel(ae.element)} ▶ 직접 공격` : '충전';
      sub = `${slotLabel(other(attacker))} 충전 +2 MP · 상성 판정 없음`;
      accent = this.lib.playerColor(attacker);
    } else switch (o.result) {
      case AttackResult.LightDark:
        title = '빛 vs 어둠';
        sub = '빛만 공격 성공 · 어둠은 자기 피해';
        this.ui.vfx.flashScreen(C(1, 0.95, 0.75), 0.45 * VFX.clash);
        break;
      case AttackResult.P1Only:
      case AttackResult.P2Only: {
        const winner = o.result === AttackResult.P1Only ? PlayerSlot.P1 : PlayerSlot.P2;
        const we = this.content.getCard(playOf(r, winner).cardId)!.element;
        const le = this.content.getCard(playOf(r, other(winner)).cardId)!.element;
        title = `${this.lib.elementLabel(we)} ▶ ${this.lib.elementLabel(le)}`;
        sub = `${slotLabel(other(winner))} 공격 실패 (상성 열세)`;
        accent = this.lib.playerColor(winner);
        break;
      }
      default:
        title = '상성 없음';
        sub = '양쪽 공격';
        break;
    }
    this.ui.banner.show(title, sub, accent, 1.5 / this.speed);
    await this.wait(co, 0.4);

    // only the tower(s) that actually take damage are emphasised
    const hitP1 = o.damageToP1 > 0, hitP2 = o.damageToP2 > 0;
    const homeIsP1 = this.ui.home === PlayerSlot.P1;
    focus.setImpact(homeIsP1 ? hitP1 : hitP2, homeIsP1 ? hitP2 : hitP1);
    let hp1 = r.hpBefore[0], hp2 = r.hpBefore[1];
    if (o.isSpecial) {
      const light = o.lightSlot, dark = o.darkSlot;
      this.ui.floating.spawn(this.ui.slot(dark).rt, v2(0, 40), '어둠 무효', C(0.8, 0.75, 1), 30);
      await this.ui.vfx.fly(co, this.colorOf(playOf(r, light)), this.corePos, this.towerPos(dark), 0.5, 40);
      if (dark === PlayerSlot.P1) hp1 = Math.max(0, hp1 - o.lightDamage); else hp2 = Math.max(0, hp2 - o.lightDamage);
      this.hitTower(dark, o.lightDamage, dark === PlayerSlot.P1 ? hp1 : hp2, maxHp[dark], '');
      await this.wait(co, 0.45);
      if (o.selfDamage > 0) {
        await this.ui.vfx.fly(co, this.colorOf(playOf(r, dark)), this.corePos, this.towerPos(dark), 0.55, 36);
        if (dark === PlayerSlot.P1) hp1 = r.hpAfter[0]; else hp2 = r.hpAfter[1];
        this.hitTower(dark, o.selfDamage, dark === PlayerSlot.P1 ? hp1 : hp2, maxHp[dark], ' 자기 피해');
      }
      await this.wait(co, 0.5);
    } else {
      // both strikes run in parallel (Unity: two coroutines, then wait for both)
      await Promise.all([this.strike(co, r, PlayerSlot.P1, maxHp), this.strike(co, r, PlayerSlot.P2, maxHp)]);
      await this.wait(co, 0.25);
    }
    this.ui.tower(PlayerSlot.P1).setHp(r.hpAfter[0], maxHp[0], false);
    this.ui.tower(PlayerSlot.P2).setHp(r.hpAfter[1], maxHp[1], false);

    // field gain chips fly from each card into the field circle
    let ci = 0;
    for (const g of r.gains) {
      if (ci++ >= 4) break;
      const play = playOf(r, g.source);
      const invested = g.amount > 0 && play && play.extraMp > 0 && this.content.getCard(play.cardId)?.element === g.element;
      let text = g.amount >= 0 ? `${this.lib.elementLabel(g.element)} +${g.amount}` : `${this.lib.elementLabel(g.element)} ${g.amount}`;
      if (invested) text += ' ◆';
      const core = this.corePos;
      const from = g.amount >= 0 ? this.slotPos(g.source) : v2(core.x, core.y - 120 * this.ui.root.lossyScale());
      this.co.start(c => this.ui.vfx.chip(c, text, g.amount >= 0 ? this.lib.elementColor(g.element) : C(0.6, 0.65, 0.72), from, core, 0.8));
    }
    await this.wait(co, 0.75);
    if (fieldChanged(r)) focus.set('field');
    const newTheme = this.lib.fieldTheme(r.fieldAfter);
    this.ui.renderField(r.fieldAfter, false);
    if (VFX.fieldChange > 0) {
      this.ui.circle.pulseOnce(newTheme.bright);
      this.ui.field.pulse(newTheme.bright);
    }
    if (fieldChanged(r)) {
      this.ui.vfx.fieldWave(this.corePos, newTheme.bright, VFX.fieldChange);
      this.ui.background.surgeAmount(1.2 * VFX.fieldChange);
      this.ui.banner.show('필드 변화', `${r.fieldNameBefore} → ${r.fieldNameAfter}`, newTheme.bright, 1.6 / this.speed);
      await this.wait(co, 1.1);
    } else await this.wait(co, 0.4);
  }

  private async strike(co: Co, r: RoundResult, attacker: PlayerSlot, maxHp: number[]) {
    const o = r.outcome;
    const play = playOf(r, attacker);
    const target = other(attacker);
    const def = this.content.getCard(play.cardId);
    if (!def || def.isPass) return;
    if (outcomeFailed(o, attacker)) {
      const at = lerpV(this.corePos, this.slotPos(attacker), 0.2);
      this.ui.slot(attacker).card.setFailed(true);
      this.ui.floating.spawn(this.ui.slot(attacker).rt, v2(0, 40), '공격 실패', C(0.75, 0.7, 0.95), 32);
      await this.ui.vfx.shatter(co, this.colorOf(play), at);
      return;
    }
    const dmg = outcomeDamageTo(o, target);
    if (dmg > 0) {
      await this.ui.vfx.fly(co, this.colorOf(play), this.corePos, this.towerPos(target), 0.42, 44, true);
      this.hitTower(target, dmg, r.hpAfter[target], maxHp[target], '');
    } else {
      await this.wait(co, 0.3);
      this.ui.floating.spawn(this.ui.tower(target).coreRect, v2(0, 80), play.stats.atk > 0 ? '막힘!' : '공격 없음', C(0.75, 0.9, 1), 32);
    }
  }

  private hitTower(slot: PlayerSlot, damage: number, newHp: number, maxHp: number, note: string) {
    const tower = this.ui.tower(slot);
    tower.playHit(damage);
    tower.setHp(newHp, maxHp, false);
    this.ui.vfx.burst(this.towerPos(slot), C(1, 0.6, 0.45), 200 + damage * 12, VFX.towerHit);
    this.ui.shakeScreen(Math.min(26, 6 + damage * 2) * VFX.towerHit, newHp <= 0 ? 0.6 : 0.3);
    this.ui.floating.spawn(tower.coreRect, v2(0, 90), `-${damage}${note}`, note.length > 0 ? C(0.8, 0.66, 1) : C(1, 0.6, 0.52), note.length > 0 ? 40 : 60);
  }

  private async lunge(co: Co, slot: PlayerSlot) {
    const card = this.ui.slot(slot).card.rt;
    const dir = this.ui.facing(slot);
    const d = 0.28 / Math.max(0.1, this.speed);
    try {
      for (let t = 0; t < d; t += Time.dt) {
        const k = t / d;
        const off = Math.sin(k * Math.PI) * 34;
        card.anchoredPosition = v2(0, dir * off);
        card.setScale(1 + 0.05 * Math.sin(k * Math.PI));
        await co.frame();
      }
    } finally {
      card.anchoredPosition = v2(0, 0);
      card.setScale(1);
    }
  }

  private async flip(co: Co, r: RoundResult) {
    const d = 0.36 / Math.max(0.1, this.speed);
    const routines: Promise<void>[] = [];
    for (const slot of [PlayerSlot.P1, PlayerSlot.P2]) {
      const play = playOf(r, slot);
      const view = this.ui.slot(slot);
      view.markRevealed();
      if (this.keepFaceUp.has(slot)) { view.card.setStats(play.stats); continue; }
      if (this.skip) { view.showCard(this.content.getCard(play.cardId), play.cardUid, play.stats, false, false); continue; }
      routines.push(view.card.flip(co, this.content.getCard(play.cardId) ?? null, play.cardUid, play.stats, d));
    }
    await Promise.all(routines);
    for (const slot of [PlayerSlot.P1, PlayerSlot.P2]) {
      const play = playOf(r, slot);
      const def = this.content.getCard(play.cardId);
      if (!def || def.isPass) continue;
      const t = termsFromMods(this.content, def, play.stats.mods);
      const card = this.ui.slot(slot).card;
      card.setCost(t.cost);
      card.setInvestment(play.extraMp, Math.max(play.extraMp, t.maxExtra), play.afterHit?.investGain ?? 0, play.stats, slot === this.ui.home ? 0.6 : -0.6);
    }
  }
}
