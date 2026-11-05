// Ports of UI/HandoffOverlay.cs, GameOverOverlay.cs, InfoPanel.cs, MatchupPanel.cs, DebugPanel.cs
import { THEME } from '../config/theme';
import { isLightDark, relation } from '../core/element';
import { MatchOutcome, PublicMatchState } from '../core/match';
import { Element, FIELD_ORDER, PlayerSlot, TestRuleOptions, cloneOptions } from '../core/types';
import { VisualLibrary } from '../game/visuals';
import { C, Color, colorize, WHITE } from './color';
import { RichTxt, RT, Txt, v2 } from './engine';
import { Button, makeButton, makeImage, makeModal, makeOutline, makePanel, makeRich, makeText, rect, rtOf } from './factory';
import { art, SF } from './sprites';

// ============================================================================ HandoffOverlay
export class HandoffOverlay {
  readonly rt: RT;
  private title: Txt; private desc: Txt; private button: Button;
  private onConfirm: (() => void) | null = null;
  constructor(parent: RT, lib: VisualLibrary) {
    this.rt = rect('HandoffOverlay', parent).stretch();
    makeImage('Dim', this.rt, C(0.01, 0.02, 0.04, 0.94), null, false, true).rt.stretch();
    const panel = makePanel('Panel', this.rt, C(0.06, 0.09, 0.13, 0.98), 26);
    panel.rt.place(v2(0.5, 0.5), v2(0, 0), v2(900, 380));
    makeOutline(panel.rt, C(1, 1, 1, 0.12), 26, 3);
    const back = makeImage('Back', panel.rt, WHITE, art.cardBack());
    back.preserveAspect = true;
    back.rt.place(v2(0, 0.5), v2(150, 0), v2(190, 290));
    rtOf(makeText('Kicker', panel.rt, '화면 넘기기', 18, THEME.mutedTextColor, 'MiddleLeft', true)).place(v2(0, 1), v2(290, -70), v2(560, 30), v2(0, 0.5));
    this.title = makeText('Title', panel.rt, '', 40, WHITE, 'MiddleLeft', true);
    rtOf(this.title).place(v2(0, 1), v2(290, -125), v2(580, 60), v2(0, 0.5));
    this.desc = makeText('Desc', panel.rt, '', 22, C(0.7, 0.75, 0.82), 'UpperLeft');
    rtOf(this.desc).place(v2(0, 1), v2(290, -200), v2(570, 70), v2(0, 0.5));
    this.button = makeButton('Confirm', panel.rt, '준비 완료', () => this.confirm(), null, 26);
    this.button.rt.place(v2(0, 0), v2(290, 60), v2(300, 70), v2(0, 0.5));
    this.rt.setActive(false);
  }
  show(_next: PlayerSlot, title: string, reason: string, color: Color, onConfirm: () => void) {
    this.onConfirm = onConfirm;
    this.title.text = title;
    this.title.color = color;
    this.desc.text = reason;
    this.button.setLabel('준비 완료');
    this.rt.setActive(true);
    this.rt.setAsLastSibling();
  }
  private confirm() {
    this.rt.setActive(false);
    const cb = this.onConfirm;
    this.onConfirm = null;
    cb?.();
  }
  hide() { this.rt.setActive(false); }
  get visible() { return this.rt.active; }
}

// ============================================================================ GameOverOverlay
export class GameOverOverlay {
  readonly rt: RT;
  private title: Txt; private desc: Txt; private history: Txt;
  private onRestart: (() => void) | null = null;
  constructor(parent: RT, _lib: VisualLibrary) {
    this.rt = rect('GameOverOverlay', parent).stretch();
    makeImage('Dim', this.rt, C(0.01, 0.02, 0.04, 0.62), null, false, true).rt.stretch();
    const panel = makePanel('Panel', this.rt, C(0.06, 0.09, 0.13, 0.98), 26);
    panel.rt.place(v2(0.5, 0.5), v2(0, 40), v2(640, 320));
    const a = THEME.accentColor;
    makeOutline(panel.rt, C(a.r, a.g, a.b, 0.5), 26, 3);
    rtOf(makeText('Kicker', panel.rt, '게임 종료', 18, THEME.mutedTextColor, 'MiddleCenter', true)).place(v2(0.5, 1), v2(0, -50), v2(600, 30));
    this.title = makeText('Title', panel.rt, '', 56, WHITE, 'MiddleCenter', true).shadowed();
    rtOf(this.title).place(v2(0.5, 1), v2(0, -100), v2(600, 76));
    this.desc = makeText('Desc', panel.rt, '', 22, C(0.72, 0.77, 0.84));
    rtOf(this.desc).place(v2(0.5, 1), v2(0, -158), v2(600, 36));
    this.history = makeText('History', panel.rt, '', 17, C(0.62, 0.68, 0.75));
    rtOf(this.history).place(v2(0.5, 1), v2(0, -245), v2(680, 80));
    rtOf(this.history).setActive(false);
    const btn = makeButton('Restart', panel.rt, '다시 플레이', () => this.onRestart?.(), null, 26);
    btn.rt.place(v2(0.5, 0), v2(0, 48), v2(300, 74));
    this.rt.setActive(false);
  }
  show(state: PublicMatchState, onRestart: () => void) {
    this.onRestart = onRestart;
    switch (state.outcome) {
      case MatchOutcome.Draw:
        this.title.text = '무승부'; this.title.color = THEME.accentColor; this.desc.text = '두 포탑이 동시에 붕괴했습니다.'; break;
      case MatchOutcome.P1Wins:
        this.title.text = 'PLAYER 1 승리'; this.title.color = THEME.p1Color; this.desc.text = `ROUND ${state.round}에서 P2 포탑을 파괴했습니다.`; break;
      default:
        this.title.text = 'PLAYER 2 승리'; this.title.color = THEME.p2Color; this.desc.text = `ROUND ${state.round}에서 P1 포탑을 파괴했습니다.`; break;
    }
    this.history.text = '필드 기록  ' + state.history.map(h => `R${h.round} ${h.fieldName}   `).join('');
    this.rt.setActive(true);
    this.rt.setAsLastSibling();
  }
  hide() { this.rt.setActive(false); }
  get visible() { return this.rt.active; }
}

// ============================================================================ InfoPanel (상세 정보)
export class InfoPanel {
  readonly rt: RT;
  private left: RichTxt; private right: RichTxt;
  constructor(parent: RT) {
    const m = makeModal('InfoPanel', parent, v2(0.5, 0.5), v2(0, 0), v2(1500, 860), '상세 정보', () => this.hide(), true);
    this.rt = m.root;
    this.left = makeRich('Left', m.body, '', 19, THEME.textColor, 'UpperLeft');
    const l = rtOf(this.left);
    l.anchorMin = v2(0, 0); l.anchorMax = v2(0.52, 1); l.offsetMin = v2(0, 0); l.offsetMax = v2(-20, 0);
    this.right = makeRich('Right', m.body, '', 19, THEME.textColor, 'UpperLeft');
    const r = rtOf(this.right);
    r.anchorMin = v2(0.52, 0); r.anchorMax = v2(1, 1); r.offsetMin = v2(20, 0); r.offsetMax = v2(0, 0);
    this.left.wrap = true; this.right.wrap = true;
    this.left.lineSpacing = 1.08; this.right.lineSpacing = 1.08;
  }
  show(left: string, right: string) {
    this.left.text = left; this.right.text = right;
    this.rt.setActive(true);
    this.rt.setAsLastSibling();
  }
  refresh(left: string, right: string) {
    if (!this.visible) return;
    this.left.text = left; this.right.text = right;
  }
  hide() { this.rt.setActive(false); }
  get visible() { return this.rt.active; }
}

// ============================================================================ MatchupPanel (속성 상성표)
export class MatchupPanel {
  readonly rt: RT;
  private cells = new Map<string, RT>();
  constructor(parent: RT, private lib: VisualLibrary) {
    const m = makeModal('MatchupPanel', parent, v2(0.5, 0.5), v2(0, 0), v2(980, 820), '속성 상성표', () => this.hide(), true);
    this.rt = m.root;
    this.build(m.body);
  }
  private build(body: RT) {
    const content = this.lib.content, th = THEME;
    const order = FIELD_ORDER;
    const cell = 74, head = 90;
    const gridW = head + cell * order.length;
    const grid = rect('Grid', body).place(v2(0.5, 1), v2(0, 0), v2(gridW, head + cell * order.length), v2(0.5, 1));
    rtOf(makeText('Corner', grid, '내 카드 \\ 상대', 15, th.mutedTextColor)).place(v2(0, 1), v2(head / 2, -head / 2), v2(head, head));
    order.forEach((e, i) => {
      this.headerCell(grid, e, v2(head + cell * i + cell / 2, -head / 2), cell);
      this.headerCell(grid, e, v2(head / 2, -head - cell * i - cell / 2), cell);
    });
    for (let r = 0; r < order.length; r++)
      for (let c = 0; c < order.length; c++) {
        const a = order[r], b = order[c];
        const rel = relation(content, a, b);
        const special = isLightDark(content, a, b);
        const bg = rel > 0 ? C(th.positiveColor.r, th.positiveColor.g, th.positiveColor.b, 0.22)
          : rel < 0 ? C(th.negativeColor.r, th.negativeColor.g, th.negativeColor.b, 0.2) : C(1, 1, 1, 0.04);
        const img = makeImage(`Cell_${a}_${b}`, grid, bg, SF.roundedRect(10), true);
        img.rt.place(v2(0, 1), v2(head + cell * c + cell / 2, -head - cell * r - cell / 2), v2(cell - 6, cell - 6));
        let txt = rel > 0 ? '승' : rel < 0 ? '패' : '=';
        if (special) txt += '★';
        const color = rel > 0 ? th.positiveColor : rel < 0 ? th.negativeColor : th.mutedTextColor;
        rtOf(makeText('Text', img.rt, txt, 24, color, 'MiddleCenter', true)).stretch();
        if (special) makeOutline(img.rt, C(th.accentColor.r, th.accentColor.g, th.accentColor.b, 0.8), 10, 3);
        this.cells.set(`${a}_${b}`, img.rt);
      }
    const legend = makeRich('Legend', body,
      `${colorize('승', th.positiveColor)} 내 공격만 성공 (상대 피해 0)   ${colorize('패', th.negativeColor)} 상대 공격만 성공   = 둘 다 공격\n` +
      `${colorize('★ 빛 vs 어둠 특수 판정', th.accentColor)}: 빛의 공격만 성공 · 어둠은 빛의 실제 피해 + 자신이 빛에게 가했을 피해를 받음\n` +
      '기본 5속성은 각각 2속성에 우위 · 어둠은 기본 5속성 모두에 우위 · 빛과 기본 5속성 사이에는 상성 없음',
      18, C(0.8, 0.84, 0.9), 'UpperLeft');
    const lr = rtOf(legend);
    lr.anchorMin = v2(0, 0); lr.anchorMax = v2(1, 0); lr.pivot = v2(0.5, 0);
    lr.offsetMin = v2(10, 0); lr.offsetMax = v2(-10, 90);
    legend.wrap = true;
  }
  private headerCell(grid: RT, e: Element, pos: { x: number; y: number }, cell: number) {
    const icon = this.lib.elementIcon(e);
    const img = makeImage('H_' + Element[e], grid, icon ? WHITE : this.lib.elementColor(e), icon ?? SF.circle(64));
    img.rt.place(v2(0, 1), v2(pos.x, pos.y + 9), v2(38, 38));
    if (!icon) rtOf(makeText('G', img.rt, this.lib.elementGlyph(e), 20, C(0.04, 0.05, 0.08), 'MiddleCenter', true)).stretch();
    rtOf(makeText('L_' + Element[e], grid, this.lib.elementLabel(e), 15, this.lib.elementColor(e), 'MiddleCenter', true)).place(v2(0, 1), v2(pos.x, pos.y - 22), v2(cell, 20));
  }
  show(mine: Element | null = null, theirs: Element | null = null) {
    for (const c of this.cells.values()) c.setScale(1);
    if (mine !== null && theirs !== null) this.cells.get(`${mine}_${theirs}`)?.setScale(1.15);
    this.rt.setActive(true);
    this.rt.setAsLastSibling();
  }
  hide() { this.rt.setActive(false); }
  get visible() { return this.rt.active; }
}

// ============================================================================ DebugPanel (디버그 · 테스트 규칙)
type ToggleKey = 'chargeExperiment' | 'matchupStatBonus' | 'resonance' | 'hybrid' | 'unstable' | 'suppression' | 'elementIdentity' | 'roleCards' | 'testCards';
const RULES: [ToggleKey, string, string][] = [
  ['chargeExperiment', '충전', '카드 대신 충전 (+2 MP, 이번 턴 공격 안 함) (새 게임)'],
  ['matchupStatBonus', '상성 수치 보정 (구 규칙)', '우위 ATK +2 / 열세 ATK -1 추가 · 빛·어둠 제외'],
  ['resonance', '공명 Lv1~3', '같은 속성 필드가 쌓이면 해당 카드 강화'],
  ['hybrid', '혼합 필드 효과', '상위 두 속성 조합 효과'],
  ['unstable', '불안정 필드 효과', '상위 두 속성 카드 필드 누적 +2'],
  ['suppression', '우세 억제', '우세 속성에 불리한 카드 ATK -1'],
  ['elementIdentity', '속성 성향 · 지배 효과', '7속성 성향(상세 보기 참고) + 지배 시 코스트·투자 변화'],
];

export class DebugPanel {
  readonly rt: RT;
  onOptionsChanged: ((o: TestRuleOptions) => void)[] = [];
  onAutoPlay: (() => void)[] = [];
  onSelfTest: (() => void)[] = [];
  onSameSeed: (() => void)[] = [];
  onSpeed: (() => void)[] = [];
  onHandoff: (() => void)[] = [];
  onPerspective: (() => void)[] = [];
  onEditValues: (() => void)[] = [];
  private options: TestRuleOptions | null = null;
  private toggles: { key: ToggleKey; label: string; text: RichTxt }[] = [];
  private info!: Txt;
  private speed!: Button; private handoff!: Button; private perspective!: Button; private auto!: Button;

  constructor(parent: RT, _lib: VisualLibrary) {
    const m = makeModal('DebugPanel', parent, v2(0, 0.5), v2(24, 0), v2(1180, 700), '디버그 · 테스트 규칙', () => this.hide(), false);
    this.rt = m.root;
    this.build(m.body);
  }

  private build(body: RT) {
    const th = THEME;
    let y = 0;
    rtOf(makeText('Note', body, '팀 확정 전 규칙입니다. 켜고 끄며 비교할 수 있습니다.', 16, th.mutedTextColor, 'UpperLeft')).place(v2(0, 1), v2(0, y), v2(560, 26), v2(0, 1));
    y -= 36;
    for (const [key, label, desc] of RULES) {
      const b = makeButton('Toggle_' + key, body, '', () => this.toggle(key), C(1, 1, 1, 0.07), 18);
      b.rt.place(v2(0, 1), v2(0, y), v2(560, 38), v2(0, 1));
      const text = makeRich('Label', b.rt, '', 18, WHITE, 'MiddleLeft', true);
      rtOf(text).stretch(18, 18, 2, 2);
      this.toggles.push({ key, label, text });
      const d = makeText('Desc', body, desc, 14, th.mutedTextColor, 'UpperLeft');
      rtOf(d).place(v2(0, 1), v2(18, y - 40), v2(540, 18), v2(0, 1));
      d.bestFit = { min: 11, max: 14 };
      y -= 62;
    }
    y = 0;
    const row = (label: string, click: () => void) => {
      const b = makeButton(label, body, label, click, C(0.42, 0.35, 0.85, 0.85), 18);
      b.rt.place(v2(0, 1), v2(580, y), v2(544, 44), v2(0, 1));
      y -= 52;
      return b;
    };
    const fire = (l: (() => void)[]) => () => l.forEach(f => f());
    this.auto = row('자동 진행 (봇 vs 봇)', fire(this.onAutoPlay));
    row('규칙 자가 테스트 (49조합 + 시뮬레이션)', fire(this.onSelfTest));
    row('같은 시드로 새 게임', fire(this.onSameSeed));
    this.speed = row('연출 속도', fire(this.onSpeed));
    this.handoff = row('화면 넘기기', fire(this.onHandoff));
    this.perspective = row('시점', fire(this.onPerspective));
    // web: numeric rule / card / VFX editing lives in a compact side drawer (no rebuild needed)
    row('수치 편집 (HP·MP·코스트·배율·감쇠·공명·VFX)', fire(this.onEditValues));
    this.info = makeText('Info', body, '', 15, C(0.78, 0.82, 0.88), 'UpperLeft');
    rtOf(this.info).place(v2(0, 1), v2(580, y - 4), v2(544, 200), v2(0, 1));
  }

  private toggle(key: ToggleKey) {
    if (!this.options) return;
    const o = cloneOptions(this.options);
    o[key] = !o[key];
    for (const f of this.onOptionsChanged) f(o);
  }

  render(options: TestRuleOptions, defaults: TestRuleOptions, speed: number, handoff: boolean, perspectiveFollowsTurn: boolean, autoPlaying: boolean, info: string | null) {
    this.options = cloneOptions(options);
    const th = THEME;
    for (const t of this.toggles) {
      const on = !!options[t.key], def = !!defaults[t.key];
      t.text.text = `${on ? colorize('● ON ', th.positiveColor) : colorize('○ OFF', th.mutedTextColor)}   ${t.label}` + (on !== def ? colorize('  (기본값과 다름)', th.accentColor) : '');
    }
    this.speed.setLabel(`연출 속도  x${+speed.toFixed(2)}`);
    this.handoff.setLabel(`화면 넘기기 표시  ${handoff ? 'ON' : 'OFF'}`);
    this.perspective.setLabel(perspectiveFollowsTurn ? '시점: 현재 플레이어 (온라인 미리보기)' : '시점: P1 고정');
    this.auto.setLabel(autoPlaying ? '자동 진행 중지' : '자동 진행 (봇 vs 봇)');
    if (info !== null) this.info.text = info;
  }
  show() { this.rt.setActive(true); this.rt.setAsLastSibling(); }
  hide() { this.rt.setActive(false); }
  get visible() { return this.rt.active; }
}
