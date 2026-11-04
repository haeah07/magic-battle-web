// Web-only numeric editor ("수치 편집") — a compact HTML drawer on the right edge.
// Changes are stored in this browser (localStorage) and applied by rebuilding the game content
// and starting a new match — no rebuild of the project is needed. "기본값 복원" returns to src/data.
import { VFX, VfxKey } from '../config/vfx';
import { CARDS, RULES } from '../data';
import { DataOverrides } from '../data';
import { RuleSet } from '../core/types';

export type MatchMode = 'hotseat' | 'bot';

export interface StoredSettings {
  data: DataOverrides;
  vfx: Partial<Record<VfxKey, number>>;
  speed: number;
  handoff: boolean;
  perspectiveFollowsTurn: boolean;
  mode: MatchMode;
}

const KEY = 'magic-battle-web.settings.v1';
export const DEFAULT_SETTINGS = (): StoredSettings => ({ data: {}, vfx: {}, speed: 1, handoff: true, perspectiveFollowsTurn: true, mode: 'hotseat' });

export function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS();
    return { ...DEFAULT_SETTINGS(), ...JSON.parse(raw) };
  } catch { return DEFAULT_SETTINGS(); }
}
export function saveSettings(s: StoredSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: keep in memory only */ }
}
export function applyVfx(s: StoredSettings) {
  for (const k of Object.keys(VFX) as VfxKey[]) VFX[k] = s.vfx[k] ?? 1;
}

type NumRule = { key: keyof RuleSet; label: string; step?: number };
const RULE_FIELDS: NumRule[] = [
  { key: 'startHp', label: '시작 HP' },
  { key: 'startMp', label: '시작 MP' },
  { key: 'maxMp', label: '최대 MP' },
  { key: 'mpPerRound', label: '라운드당 MP 회복' },
  { key: 'fieldDecay', label: '필드 감소 (라운드마다)' },
  { key: 'fieldGainOnWin', label: '필드 배율 · 상성 승리', step: 0.05 },
  { key: 'fieldGainOnNeutral', label: '필드 배율 · 상성 없음', step: 0.05 },
  { key: 'fieldGainOnLose', label: '필드 배율 · 상성 패배', step: 0.05 },
  { key: 'investGainPerMp', label: 'MP 투자 1당 필드 +' },
  { key: 'investMaxExtra', label: '최대 추가 투자 MP' },
  { key: 'dominantGap', label: '지배 필드 차이' },
  { key: 'hybridSum', label: '혼합 필드 합계' },
];
const VFX_LABELS: Record<VfxKey, string> = {
  choosing: '선택 (Glow·hover)', submit: '제출', reveal: '공개', clash: '충돌 · 판정', towerHit: '포탑 피격',
  fieldChange: '필드 변화 순간', fieldIdle: '평상시 필드 · 환경', ambient: '상시 Ambient', cardAura: '강화/약화 오라', shake: '화면 흔들림',
};

export interface DrawerHooks {
  apply: (s: StoredSettings) => void;      // rebuild content + new match
  liveChanged: (s: StoredSettings) => void; // vfx / speed changed (no restart)
  toggleAutoPlay: () => void;
  isAutoPlaying: () => boolean;
}

const CSS = `
#mb-drawer{position:fixed;top:0;right:0;height:100%;width:340px;max-width:92vw;background:rgba(10,14,22,.96);color:#e8ecf2;
 font:13px/1.35 NanumGothic,"Malgun Gothic",sans-serif;box-shadow:-8px 0 24px rgba(0,0,0,.5);border-left:1px solid rgba(242,204,122,.35);
 z-index:20;display:none;flex-direction:column}
#mb-drawer.open{display:flex}
#mb-drawer header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08)}
#mb-drawer header b{color:#f2cc7a;font-size:14px}
#mb-drawer .body{overflow:auto;padding:6px 12px 12px;flex:1}
#mb-drawer h4{margin:12px 0 6px;color:#f0d46e;font-size:12px;letter-spacing:.04em}
#mb-drawer .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:3px 0}
#mb-drawer .row span{color:#b8c0cc}
#mb-drawer input[type=number]{width:62px;background:#141b27;color:#fff;border:1px solid #2c3546;border-radius:4px;padding:2px 4px;font:inherit;text-align:right}
#mb-drawer input.changed{border-color:#f0d46e}
#mb-drawer input[type=range]{width:120px}
#mb-drawer table{width:100%;border-collapse:collapse;font-size:12px}
#mb-drawer td{padding:1px 2px}#mb-drawer td:first-child{color:#b8c0cc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}
#mb-drawer td input{width:40px}
#mb-drawer footer{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08)}
#mb-drawer button{background:#5a4bd0;color:#fff;border:0;border-radius:6px;padding:7px 6px;font:inherit;cursor:pointer}
#mb-drawer button.ghost{background:#263044}
#mb-drawer button.primary{background:#c9a24a;color:#1a1408;font-weight:bold;grid-column:span 2}
#mb-drawer .x{background:none;font-size:18px;padding:0 4px}
#mb-drawer .note{color:#8a94a3;font-size:11px;margin-top:4px}
#mb-drawer select{background:#141b27;color:#fff;border:1px solid #2c3546;border-radius:4px;font:inherit}
`;

export class DebugDrawer {
  private el: HTMLDivElement;
  private body: HTMLDivElement;
  private draft: StoredSettings;
  private hooks: DrawerHooks | null = null;
  private autoBtn!: HTMLButtonElement;

  constructor(private settings: StoredSettings) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'mb-drawer';
    this.el.innerHTML = `<header><b>수치 편집</b><button class="x" title="닫기">×</button></header><div class="body"></div><footer></footer>`;
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('.body')!;
    this.el.querySelector('.x')!.addEventListener('click', () => this.close());
    this.draft = JSON.parse(JSON.stringify(settings));
    this.buildFooter();
    // keep keyboard input inside the drawer from reaching the game
    this.el.addEventListener('keydown', e => e.stopPropagation());
  }

  bind(hooks: DrawerHooks) { this.hooks = hooks; this.refreshAuto(); }
  get isOpen() { return this.el.classList.contains('open'); }
  open() { this.draft = JSON.parse(JSON.stringify(this.settings)); this.build(); this.el.classList.add('open'); this.refreshAuto(); }
  close() { this.el.classList.remove('open'); }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  private buildFooter() {
    const f = this.el.querySelector('footer')!;
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label; b.className = cls; b.addEventListener('click', fn); f.appendChild(b); return b;
    };
    btn('적용 + 새 게임', 'primary', () => this.applyDraft());
    btn('기본값 복원', 'ghost', () => {
      const keep = { speed: this.draft.speed, handoff: this.draft.handoff, perspectiveFollowsTurn: this.draft.perspectiveFollowsTurn, mode: this.draft.mode };
      this.draft = { ...DEFAULT_SETTINGS(), ...keep };
      this.build();
    });
    this.autoBtn = btn('자동 진행', '', () => { this.hooks?.toggleAutoPlay(); setTimeout(() => this.refreshAuto(), 50); });
  }
  refreshAuto() { if (this.autoBtn) this.autoBtn.textContent = this.hooks?.isAutoPlaying() ? '자동 진행 중지' : '자동 진행 (봇 vs 봇)'; }

  private applyDraft() {
    this.settings = JSON.parse(JSON.stringify(this.draft));
    saveSettings(this.settings);
    this.hooks?.apply(this.settings);
  }

  private build() {
    const d = this.draft;
    d.data.rules ??= {};
    d.data.cards ??= {};
    const rules = d.data.rules as Record<string, unknown>;
    const B = this.body;
    B.innerHTML = '';
    const h = (t: string) => { const e = document.createElement('h4'); e.textContent = t; B.appendChild(e); };
    const row = (label: string, input: HTMLElement) => {
      const r = document.createElement('div'); r.className = 'row';
      const s = document.createElement('span'); s.textContent = label;
      r.append(s, input); B.appendChild(r);
    };
    const num = (value: number, base: number, step: number, onChange: (v: number | undefined) => void) => {
      const i = document.createElement('input'); i.type = 'number'; i.step = String(step); i.value = String(value);
      const mark = () => i.classList.toggle('changed', Number(i.value) !== base);
      mark();
      i.addEventListener('input', () => { const v = Number(i.value); if (!Number.isFinite(v)) return; onChange(v === base ? undefined : v); mark(); });
      return i;
    };

    h('모드');
    const sel = document.createElement('select');
    sel.innerHTML = `<option value="hotseat">핫시트 (한 화면 2인)</option><option value="bot">온라인 시점 미리보기 (P1 vs 원격 봇)</option>`;
    sel.value = d.mode;
    sel.addEventListener('change', () => { d.mode = sel.value as MatchMode; });
    row('경기 모드 (적용 시)', sel);

    h('규칙 (src/data/rules.ts)');
    for (const f of RULE_FIELDS) {
      const base = RULES[f.key] as number;
      const cur = (rules[f.key] as number | undefined) ?? base;
      row(f.label, num(cur, base, f.step ?? 1, v => { if (v === undefined) delete rules[f.key]; else rules[f.key] = v; }));
    }
    const lv = (rules.fieldLevels as number[] | undefined) ?? [...RULES.fieldLevels];
    RULES.fieldLevels.forEach((base, i) => {
      row(`공명 Lv${i + 1} 기준`, num(lv[i], base, 1, v => {
        const arr = ((rules.fieldLevels as number[] | undefined) ?? [...RULES.fieldLevels]).slice();
        arr[i] = v ?? base;
        if (arr.every((x, k) => x === RULES.fieldLevels[k])) delete rules.fieldLevels; else rules.fieldLevels = arr;
      }));
    });

    h('실험 기능 (기본 OFF)');
    const opt = ((rules.defaultOptions as Record<string, boolean> | undefined) ?? {});
    for (const [k, label] of [['elementIdentity', '속성 성향 · 지배 효과'], ['roleCards', '역할 카드 포함']] as const) {
      const c = document.createElement('input'); c.type = 'checkbox';
      c.checked = opt[k] ?? RULES.defaultOptions[k];
      c.addEventListener('change', () => {
        const o = { ...((rules.defaultOptions as Record<string, boolean> | undefined) ?? {}) };
        if (c.checked === RULES.defaultOptions[k]) delete o[k]; else o[k] = c.checked;
        if (Object.keys(o).length) rules.defaultOptions = o; else delete rules.defaultOptions;
      });
      row(label, c);
    }

    h('연출 (즉시 반영)');
    const speed = num(d.speed, 1, 0.25, v => { d.speed = v ?? 1; this.live(); });
    row('연출 속도 배율', speed);
    for (const k of Object.keys(VFX_LABELS) as VfxKey[]) {
      const r = document.createElement('input'); r.type = 'range'; r.min = '0'; r.max = '2'; r.step = '0.05';
      r.value = String(d.vfx[k] ?? 1);
      r.title = r.value;
      r.addEventListener('input', () => { const v = Number(r.value); if (v === 1) delete d.vfx[k]; else d.vfx[k] = v; r.title = r.value; this.live(); });
      row(VFX_LABELS[k], r);
    }
    const note = document.createElement('div'); note.className = 'note';
    note.textContent = '1 = Unity v6 와 동일 · 0 = 끔. 기본값은 src/config/vfx.ts';
    B.appendChild(note);

    h('카드 (src/data/cards.ts)  코스트 / ATK / DEF / 필드');
    const table = document.createElement('table');
    for (const c of CARDS) {
      const tr = document.createElement('tr');
      const name = document.createElement('td'); name.textContent = c.name; name.title = c.id; tr.appendChild(name);
      const o = (d.data.cards![c.id] ??= {});
      const cell = (key: 'cost' | 'atk' | 'def' | 'gain', base: number) => {
        const td = document.createElement('td');
        td.appendChild(num(o[key] ?? base, base, 1, v => { if (v === undefined) delete o[key]; else o[key] = v; }));
        tr.appendChild(td);
      };
      cell('cost', c.cost); cell('atk', c.atk); cell('def', c.def); cell('gain', c.gain);
      table.appendChild(tr);
    }
    B.appendChild(table);
    const n2 = document.createElement('div'); n2.className = 'note';
    n2.textContent = '노란 테두리 = 기본값과 다름. 브라우저에만 저장되며, 확정하려면 src/data 의 파일을 수정하세요.';
    B.appendChild(n2);
  }

  private live() {
    this.settings.vfx = { ...this.draft.vfx };
    this.settings.speed = this.draft.speed;
    saveSettings(this.settings);
    this.hooks?.liveChanged(this.settings);
  }
}
