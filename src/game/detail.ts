// Port of Game/DetailFormatter.cs — the "상세 정보" panel texts (round judgement + field state).
import { THEME } from '../config/theme';
import { AttackResult } from '../core/element';
import { activeEffects, decayFor, fieldInfo, level } from '../core/field';
import { fieldChanged, playOf, PublicMatchState, RoundResult } from '../core/match';
import { outcomeFailed } from '../core/battle';
import { CombatStats, Element, FIELD_ORDER, MatchupStanding, PlayerSlot, sdDescribe, slotLabel, modIsNegative } from '../core/types';
import { C as col, Color, colorize } from '../ui/color';
import { MANA_COLOR } from '../ui/cardView';
import { VisualLibrary } from './visuals';

const C = (s: string, c: Color) => colorize(s, c);
const FAIL = col(0.75, 0.7, 0.95);
const pad2 = (n: number) => String(n).padStart(2, '0');

/** v9: DEF 없음 — 공격이 성공하면 ATK 가 그대로 피해 */
function formula(a: CombatStats, _b: CombatStats, dmg: number) {
  return `ATK ${a.atk} = <b>${dmg}</b>`;
}

export function roundDetail(lib: VisualLibrary, r: RoundResult | null): string {
  const th = THEME, content = lib.content;
  if (!r) return C('이번 라운드 판정', th.accentColor) + '\n\n아직 판정된 라운드가 없습니다.\n두 플레이어가 카드를 제출하면 계산 과정이 여기에 표시됩니다.';
  const L: string[] = [];
  L.push(C(`<b>ROUND ${pad2(r.round)} 판정</b>`, th.accentColor));
  L.push('');
  for (const s of [PlayerSlot.P1, PlayerSlot.P2]) {
    const p = playOf(r, s);
    const def = content.getCard(p.cardId)!;
    const pc = lib.playerColor(s);
    const el = def.isPass ? '—' : lib.elementLabel(def.element);
    const inv = p.extraMp > 0 ? C(`  (투자 +${p.extraMp} → 필드 +${p.afterHit?.investGain ?? 0})`, MANA_COLOR) : '';
    L.push(`${C('<b>' + slotLabel(s) + '</b>', pc)}  ${def.name} (${el})  MP ${p.mpSpent}${inv}`);
    L.push(`   기본 ATK ${def.atk} / 필드 ${def.baseFieldGain}  →  최종 ATK ${p.stats.atk} / 필드 ${p.stats.gain}`);
    for (const m of p.stats.mods) L.push('   ' + C(`· ${m.label}  ${sdDescribe(m.delta)}`, modIsNegative(m) ? th.negativeColor : th.positiveColor));
    if (p.stats.mods.length === 0) L.push('   ' + C('· 보정 없음', th.mutedTextColor));
  }
  L.push('');
  const o = r.outcome;
  const c1 = content.getCard(r.p1.cardId)!, c2 = content.getCard(r.p2.cardId)!;
  switch (o.result) {
    case AttackResult.LightDark: L.push(C('<b>빛 vs 어둠 특수 판정</b>', th.accentColor)); break;
    case AttackResult.P1Only: L.push(`<b>${lib.elementLabel(c1.element)} ▶ ${lib.elementLabel(c2.element)}</b> · P1 상성 우위 → P2 공격 실패`); break;
    case AttackResult.P2Only: L.push(`<b>${lib.elementLabel(c2.element)} ▶ ${lib.elementLabel(c1.element)}</b> · P2 상성 우위 → P1 공격 실패`); break;
    default: L.push('상성 없음 → 양쪽 모두 공격'); break;
  }
  if (o.isSpecial) {
    const Ls = o.lightSlot, D = o.darkSlot;
    L.push(`   ${slotLabel(Ls)} 빛 ▶ ${slotLabel(D)}: ${formula(playOf(r, Ls).stats, playOf(r, D).stats, o.lightDamage)}`);
    L.push(`   ${slotLabel(D)} 어둠 ▶ ${slotLabel(Ls)}: ` + C('무효 (빛 특수 판정)', FAIL));
    L.push(`   ${slotLabel(D)} 자기 피해: ${formula(playOf(r, D).stats, playOf(r, Ls).stats, o.selfDamage)}`);
    L.push(`   ${slotLabel(D)} 총 피해: ${o.lightDamage} + ${o.selfDamage} = <b>${o.specialTotal}</b>`);
  } else {
    L.push('   P1 ▶ P2: ' + (o.failedP1 ? C(`공격 실패 (계산상 ${o.rawP1ToP2}) = 0`, FAIL) : formula(r.p1.stats, r.p2.stats, o.damageToP2)));
    L.push('   P2 ▶ P1: ' + (o.failedP2 ? C(`공격 실패 (계산상 ${o.rawP2ToP1}) = 0`, FAIL) : formula(r.p2.stats, r.p1.stats, o.damageToP1)));
  }
  L.push(`   HP  P1 ${r.hpBefore[0]} → ${r.hpAfter[0]}   P2 ${r.hpBefore[1]} → ${r.hpAfter[1]}`);
  for (let i = 0; i < 2; i++) if (r.mpTaxApplied[i] > 0) L.push(`   냉기: ${PlayerSlot[i]} 다음 MP 회복 -${r.mpTaxApplied[i]}`);
  L.push('');
  L.push(C('<b>필드 누적</b>', th.accentColor) + `   (전체 -${content.rules.fieldDecay} 후 누적)`);
  for (const g of r.gains) {
    const p = playOf(r, g.source);
    if (g.amount < 0) {
      L.push(`   ${slotLabel(g.source)} ${lib.elementLabel(g.element)} ${g.amount} ` + C('(물 성향: 다른 속성 필드 약화)', th.mutedTextColor));
      continue;
    }
    const ah = p.afterHit;
    const standing = !ah ? '' : ah.standing === MatchupStanding.Win ? '승리' : ah.standing === MatchupStanding.Lose ? '패배' : '상성 없음';
    const parts: string[] = [];
    if (ah) parts.push(`기본 ${ah.rawBaseGain} × ${standing} ${Math.round(ah.multiplier * 100)}% = ${ah.baseGain}`);
    if (ah && ah.otherGain !== 0) parts.push(`필드 효과 ${ah.otherGain > 0 ? '+' : ''}${ah.otherGain}`);
    if (ah && ah.investGain > 0) parts.push(C(`투자 +${ah.investGain}`, MANA_COLOR));
    if (ah && ah.extraGain > 0) parts.push(`${ah.extraLabel} +${ah.extraGain}`);
    const failed = outcomeFailed(r.outcome, g.source) ? C(' · 공격 실패해도 누적', th.mutedTextColor) : '';
    L.push(`   ${slotLabel(g.source)} ${lib.elementLabel(g.element)} <b>+${g.amount}</b>  ` + C(parts.join(' + '), th.mutedTextColor) + failed);
  }
  if (r.gains.length === 0) L.push('   누적 없음');
  L.push(`   ${r.fieldNameBefore} → <b>${r.fieldNameAfter}</b>`);
  void fieldChanged;
  return L.join('\n');
}

export function fieldDetail(lib: VisualLibrary, s: PublicMatchState): string {
  const th = THEME, content = lib.content, R = content.rules;
  const L: string[] = [];
  const info = fieldInfo(content, s.field);
  L.push(C('<b>현재 필드</b>', th.accentColor) + `   ${info.name} (${info.badge})`);
  L.push(C(info.description ?? '', th.mutedTextColor));
  L.push('');
  for (const e of FIELD_ORDER) {
    const v = s.field.get(e);
    const lv = level(R, v);
    const bars = Math.round(v / R.fieldMax * 20);
    const half = Math.max(0, Math.min(10, Math.trunc(bars / 2)));
    L.push(`${C(lib.elementLabel(e).padEnd(3), lib.elementColor(e))}  ${C('■'.repeat(half), lib.elementColor(e))}${C('□'.repeat(10 - half), col(1, 1, 1, 0.2))}  ${String(v).padStart(3)}  ${lv > 0 ? 'Lv' + lv : ''}`);
  }
  const natureDecay = decayFor(content, Element.Nature, s.options);
  L.push(C(`Lv 기준 ${R.fieldLevels.join(' / ')} · 매 라운드 -${R.fieldDecay} · 최대 ${R.fieldMax}` + (s.options.elementIdentity && natureDecay !== R.fieldDecay ? ` (풀 -${natureDecay})` : ''), th.mutedTextColor));
  L.push('');
  L.push(C('<b>적용 중인 필드 효과</b>', th.accentColor) + C('  (테스트 규칙)', th.mutedTextColor));
  const effects = activeEffects(content, s.field, s.options);
  if (effects.length === 0) L.push(C(`   없음 — 한 속성을 ${R.fieldLevels[0]} 이상 쌓으면 공명이 시작됩니다.`, th.mutedTextColor));
  for (const fx of effects) L.push('   ' + C(fx.title, fx.negative ? th.negativeColor : th.positiveColor) + `  ${fx.text}`);
  L.push('');
  if (s.options.elementIdentity) {
    L.push(C('<b>속성 성향</b>', th.accentColor) + C('  (테스트 규칙)', th.mutedTextColor));
    for (const e of FIELD_ORDER) {
      const id = content.getElement(e)?.identity;
      if (id && id.summary) L.push(`   ${C(lib.elementLabel(e), lib.elementColor(e))}  ${id.summary}` + (id.dominantText ? C(` · 지배 시 ${id.dominantText}`, th.mutedTextColor) : ''));
    }
    L.push('');
  }
  L.push(C('<b>필드 기록</b>', th.accentColor));
  L.push(s.history.length === 0 ? C('   아직 없음', th.mutedTextColor) : '   ' + s.history.map(h => `R${h.round} ${h.fieldName}`).join('  '));
  L.push('');
  L.push(C('<b>플레이어</b>', th.accentColor));
  for (const p of s.players)
    L.push(`   ${slotLabel(p.slot)}  HP ${p.hp}/${p.maxHp}  MP ${p.mp}/${p.maxMp}  손패 ${p.handCount}  덱 ${p.deckCount}  버림 ${p.discardCount}${p.mpTax > 0 ? `  냉기 -${p.mpTax}` : ''}`);
  L.push(C(`   seed ${s.seed}`, th.mutedTextColor));
  return L.join('\n');
}
