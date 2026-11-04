# Magic Battle — Web (Unity v6 네이티브 웹 이식판)

`MagicBattle_UnityPrototype_v6` 와 같은 게임을 **TypeScript + Phaser 3 + Vite** 로 다시 구현한 브라우저 버전입니다.
Unity WebGL 빌드가 아니라 웹 기술로 직접 만든 정적 사이트라서, 브라우저에서 바로 실행하고 수정할 수 있습니다.

- 화면: 1920×1080 기준 16:9 PC 레이아웃 (Unity v6 와 같은 좌표, 창 크기에 맞춰 확대·축소)
- 규칙: Unity C# 의 Core/Battle/Field/Player/Match 를 1:1 로 옮겼습니다. Unity 에서 뽑은 240판의 기록을 그대로 재생해 라운드별 결과가 모두 같은지 확인합니다.
- 흐름: **UI → 명령(SubmitCardCommand) → MatchAuthority 판정 → RoundResult → 연출** (UI 에는 별도의 계산식이 없습니다)

---

## 1. 실행 방법

```bash
npm install
npm run dev        # http://localhost:5173 개발 서버 (파일을 저장하면 바로 새로고침)
npm run build      # dist/ 에 배포용 정적 사이트 생성 (타입 검사 포함)
npm run preview    # 빌드 결과 미리보기
npm test           # 규칙 테스트 (Unity 대표값 + Unity 경기 기록 재생)
```

Node.js 18 이상이 필요합니다(권장 20).

URL 옵션:

| 옵션 | 설명 |
|---|---|
| `?mode=bot` | 온라인 시점 미리보기: P1 화면만 보이고 P2 는 원격 플레이어처럼 동작하는 봇 (1.0~2.4초 고민) |
| `?mode=hotseat` | 핫시트 (기본값): 한 화면 2인. P1 선택 → 화면 넘기기 → P2 선택 → 동시 공개 |
| `?seed=1234` | 덱 순서 고정. 같은 시드면 Unity 와 같은 덱이 나옵니다 |
| `?debug=0` | 상단 디버그 버튼 숨김 |

## 2. GitHub Pages 배포

저장소 이름은 `magic-battle-web` 이고, 저장소 루트가 곧 최신 버전입니다 (버전 선택 화면 없음).

**자동 배포 (권장)** — `.github/workflows/deploy.yml` 이 포함되어 있습니다.

1. GitHub 에서 `magic-battle-web` 저장소를 만들고 이 폴더 내용을 push 합니다.
   ```bash
   git init
   git add .
   git commit -m "Magic Battle web"
   git branch -M main
   git remote add origin https://github.com/<계정>/magic-battle-web.git
   git push -u origin main
   ```
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
3. 이후 `main` 에 push 할 때마다 테스트 → 빌드 → 배포가 자동으로 진행됩니다.
   주소: `https://<계정>.github.io/magic-battle-web/`

**수동 배포** — `npm run build` 후 `dist/` 폴더 내용을 `gh-pages` 브랜치(또는 아무 정적 호스팅)에 올리면 됩니다.
`vite.config.ts` 의 `base: './'` 덕분에 어떤 하위 경로에서도 동작합니다.

## 3. 폴더 구조

```
magic-battle-web/
├─ index.html                 진입 HTML (폰트 @font-face)
├─ public/assets/             Unity 에서 가져온 그림 (.meta 없음)
│  ├─ cards/  elements/  arena/  towers/    Unity PNG 그대로
│  ├─ ui/                     Unity SpriteFactory 가 만드는 UI 스프라이트를 픽셀 그대로 내보낸 PNG + 9-slice 정보
│  └─ fonts/                  NanumGothic (woff2, 한글 2,350자 + 기호 서브셋) + 라이선스
├─ src/
│  ├─ core/        규칙 엔진 (Unity Core/Battle/Field/Player/Match/Network 이식, 화면과 무관)
│  ├─ data/        ★ 규칙·카드·속성·특성 데이터 (밸런스 수정은 여기)
│  ├─ config/      ★ 레이아웃 좌표·카드 크기, 연출(VFX) 강도, UI 색상
│  ├─ game/        컨트롤러(입력→명령), 프레젠터(결과→연출), 상세 정보 문구, 자가 테스트
│  ├─ net/         IMatchClient / LocalMatchClient / 원격 봇 (온라인 확장 지점)
│  ├─ scenes/      Phaser 씬 (로딩, 전투)
│  ├─ ui/          화면 요소 (카드, 손패, 슬롯, 포탑, HUD, 패널) + uGUI 대응 엔진
│  └─ vfx/         경기장·배경·필드 마법진·환경 오버레이·마법 연출·카드 오라
├─ tests/          vitest 규칙 테스트 + Unity 경기 기록(fixtures/unity_traces.json)
└─ .github/workflows/deploy.yml
```

의존 방향: `core` ← `data` ← `game`/`ui`/`vfx` ← `scenes`. `core` 는 Phaser 를 모르므로 서버(온라인 판정)에서도 그대로 쓸 수 있습니다.

## 4. Unity C# → TypeScript 대응표

| Unity (Assets/MagicBattle/Scripts) | Web (src) | 비고 |
|---|---|---|
| Core/CoreTypes.cs, Definitions.cs | core/types.ts | Element, StatDelta, CardDef, RuleSet, TestRuleOptions … (enum 숫자값 동일) |
| Core/DeterministicRandom.cs | core/random.ts | xorshift64 (BigInt) — 같은 시드 = 같은 덱 |
| Core/DefaultContent.cs, Data/GameDatabase.cs | data/index.ts (`buildContent`) | ScriptableObject 대신 TS 데이터 파일 |
| Data/RuleConfig.cs | **data/rules.ts** | 모든 밸런스 수치 |
| Cards/CardData.cs | **data/cards.ts** | 카드 16장 |
| Cards/TraitData.cs | data/traits.ts | 화상·냉기·방벽·연사·감전·가시·창·관통 |
| Data/ElementData.cs, HybridFieldData.cs, DefaultVisualPresets.cs | data/elements.ts | 상성, 성향, 색·입자·오라 프리셋, 혼합 필드 |
| Data/UITheme.cs | config/theme.ts | 플레이어 색, 텍스트 색, 연출 속도 |
| Battle/ElementSystem.cs | core/element.ts | 상성 판정, 빛/어둠 특수 |
| Battle/CombatCalculator.cs, CardPower.cs | core/combat.ts | PlayTerms, Preview, Combat, 강화/약화 단계 |
| Battle/BattleResolver.cs | core/battle.ts | 피해·필드 누적·배율 |
| Field/FieldSystem.cs | core/field.ts | 감쇠, 공명 Lv, 지배/혼합/불안정 |
| Player/PlayerState.cs | core/match.ts (`PlayerState`) | |
| Match/MatchAuthority.cs, MatchMessages.cs, SimpleBot.cs | core/match.ts | 판정 권한, 명령/결과 메시지, 봇 |
| Battle/RuleSelfTest.cs | game/selfTest.ts + tests/*.test.ts | 게임 안 버튼용 축약판 + vitest 전체판 |
| Network/IMatchClient.cs | net/client.ts | LocalMatchClient |
| Game/RemoteBotOpponent.cs | net/client.ts (`RemoteBotOpponent`) | |
| Game/MagicBattleBootstrap.cs | scenes/BattleScene.ts | 모드·시드 |
| Game/BattleController.cs | game/controller.ts | |
| Game/BattlePresenter.cs | game/presenter.ts | |
| Game/DetailFormatter.cs | game/detail.ts | |
| Game/VisualLibrary.cs | game/visuals.ts | |
| UI/BattleScreen.cs | ui/battleScreen.ts + **config/layout.ts** | Layout 상수는 config 로 분리 |
| UI/UIFactory.cs, ButtonFx.cs | ui/factory.ts | |
| UI/SpriteFactory.cs | ui/sprites.ts + public/assets/ui | 절차 생성 스프라이트를 PNG 로 내보냄 |
| (uGUI RectTransform/Image/Text) | ui/engine.ts | anchor·pivot·sizeDelta 를 그대로 계산하는 작은 uGUI 대응 엔진 |
| UI/CardView.cs, CardDragHandler.cs | ui/cardView.ts | |
| UI/HandView.cs | ui/handView.ts | |
| UI/SlotView.cs | ui/slotView.ts | |
| UI/TowerView.cs | ui/towerView.ts | |
| UI/SidePanel, TopBar, FieldView, InvestPanel, ActionBar, MatchupHint, BannerView, ResultStrip, BattleLog, FloatingTextLayer | ui/hud.ts | |
| UI/HandoffOverlay, GameOverOverlay, InfoPanel, MatchupPanel, DebugPanel | ui/overlays.ts | |
| UI/ArenaView, FieldCircleView, BackgroundView | vfx/arena.ts | |
| UI/FieldEnvironmentView.cs | vfx/environment.ts | |
| VFX/SpellVfx.cs | vfx/spellVfx.ts | |
| VFX/CardAuraView.cs, InvestAuraView.cs | vfx/cardAura.ts, vfx/investAura.ts | |
| Editor/MagicBattleEditorMenu.cs | (없음) | 데이터가 TS 파일이므로 불필요 |
| — | ui/debugDrawer.ts | 웹 전용 "수치 편집" 서랍 (디버그 도구) |

## 5. 규칙 수정 위치 — `src/data/rules.ts`

모든 밸런스 숫자가 한 파일에 주석과 함께 있습니다. 예: 라운드당 MP 회복 2 → 3

```ts
mpPerRound: 3,        // 라운드당 MP 회복
```

저장하면 개발 서버가 바로 새로고침됩니다. 시작 HP/MP, 최대 MP, 필드 감소, 공명 Lv 기준(`fieldLevels`), 승/무/패 배율(`fieldGainOnWin/Neutral/Lose`), 투자량, 지배·혼합 기준, 기본 테스트 옵션(속성 성향·역할 카드 기본 OFF) 이 모두 여기 있습니다.
상성표는 `src/data/elements.ts` 의 `beats` 입니다.

## 6. 카드 수정 위치 — `src/data/cards.ts`

한 줄이 카드 한 장입니다.

```ts
{ id: "fire-ball", name: "Fire Ball", element: Element.Fire, cost: 2, atk: 5, def: 0, gain: 18, traits: ["burn"], art: "fire-ball" },
```

`cost` 코스트 · `atk`/`def` · `gain` 기본 필드 누적 · `traits` 특성(id 는 `traits.ts`) · `invest: { allowed, perMp, max }` 투자 허용/MP당 누적/최대 (생략 시 rules.ts 기본값) · `art` 그림 · `artCrop` 그림 칸에 보일 영역 · `test`/`role` 실험용 표시.

## 7. 레이아웃 수정 위치 — `src/config/layout.ts`

Unity `BattleScreen.Layout` 과 같은 값입니다. 좌표는 화면 중앙 기준(x 오른쪽 +, y 위쪽 +), 1920×1080 기준.

- `LAYOUT` — 포탑·슬롯·충돌 지점·경기장·손패 위치/배율, HUD 여백
- `CARD` — 카드 크기, hover 시 들림/확대
- `HAND` — 손패 간격, 부채꼴 높이·기울기, hover 시 옆 카드 밀림

예: 손패 카드를 20% 크게 → `handScale: 0.76 * 1.2`

## 8. 연출(VFX) 강도 수정 위치 — `src/config/vfx.ts`

단계별 배율입니다. `1` = Unity v6 와 동일, `0` = 끔, `0.5` = 절반.

| 키 | 단계 |
|---|---|
| `choosing` | 카드 선택: 선택 Glow, 슬롯 마법진, 차례 표시 |
| `submit` | 제출: 버튼 Glow, 잠금 링, 제출 버스트 |
| `reveal` | 공개: 카드 뒤집기 강조 |
| `clash` | 중앙 충돌: 폭발, 섬광, 흔들림 |
| `towerHit` | 포탑 피격: 섬광, 파편, 흔들림 |
| `fieldChange` | 필드가 바뀌는 순간: 파동, 배경 Surge |
| `fieldIdle` | 평상시 필드 표현: 환경 오버레이, 바닥 틴트, 중앙 마법진 Glow |
| `ambient` | 상시 입자·안개·마나 흐름 |
| `cardAura` | 강화/약화 카드 오라 |
| `shake` | 화면 흔들림 전체 |

같은 파일의 `FOCUS` 표는 플레이 단계(선택 / 제출 후 / 공개 / 공격 / 필드 변화 / 결과)마다 내 슬롯·중앙 마법진·상대 슬롯·포탑·환경을 얼마나 강조할지(0~1) 정합니다.

게임 안에서도 **디버그 → 수치 편집** 의 슬라이더로 즉시 바꿔 볼 수 있습니다(브라우저에 저장).

## 9. 새 카드 추가 방법

1. (그림이 있으면) PNG 를 `public/assets/cards/<이름>.png` 에 넣습니다. 그림이 없으면 속성 글자가 표시됩니다.
2. `src/data/cards.ts` 의 `CARDS` 에 한 줄 추가합니다.
   ```ts
   { id: "aqua-lance", name: "Aqua Lance", element: Element.Water, cost: 2, atk: 4, def: 1, gain: 18, traits: [], art: "aqua-lance" },
   ```
3. 새 특성이 필요하면 `src/data/traits.ts` 에 추가하고 `traits: ["새id"]` 로 연결합니다.
4. `npm test` — 데이터 검증(`content.validate()`)과 규칙 테스트가 함께 돕니다.

덱은 `rules.ts` 의 `copiesPerCard`(기본 2장씩)로 자동 구성됩니다. `test: true` 카드는 디버그의 "테스트 카드 포함" 을 켤 때만 들어갑니다.

## 10. 테스트 실행

```bash
npm test
```

- `tests/rules.test.ts` — Unity 대표값으로 확인: 기본 상성 49조합, 상성 없음(양쪽 공격), 빛 vs 어둠(빛 5 / 어둠 4 → 어둠 9), 실패 시 피해 0, 실패해도 필드 누적(Ice Ball 18), MP 투자(승 +19 / 무 +24 / 패 +28, 사용 4 MP), MP 부족·초과 투자 거부, 승/무/패 배율(9/14/18), 필드 감소, 공명 Lv, 게임 종료, 봇 60판 불변식.
- `tests/unityParity.test.ts` — Unity C# 로 돌린 240판(기본·테스트 카드·역할 카드·속성 성향 조합)의 라운드별 손패·MP·명령·스탯·피해·필드·HP 를 TS 엔진이 그대로 재현하는지 비교.

게임 안 **디버그 → 규칙 자가 테스트** 는 현재 데이터로 같은 검사를 브라우저에서 돌립니다.

## 11. 디버그 패널

화면 왼쪽 위 아이콘 줄의 ⊕ 버튼. Unity 디버그 패널(테스트 규칙 토글, 자동 진행, 자가 테스트, 같은 시드, 연출 속도, 화면 넘기기, 시점)과 같고,
웹에서는 **수치 편집** 서랍이 추가되어 HP·MP·MP 회복·카드 코스트/ATK/DEF/필드·승무패 배율·필드 감소·공명 기준·역할 카드·속성 성향·연출 속도·VFX 강도를 빌드 없이 바꿀 수 있습니다.
"적용 + 새 게임" 으로 반영되고 브라우저(localStorage)에 저장됩니다. "기본값 복원" 은 `src/data` 의 값으로 되돌립니다.

## 12. Unity 와 다른 점 (알려진 차이)

| 항목 | 내용 |
|---|---|
| 색 블렌딩 | Unity 는 Linear 색 공간 + UI 정점색 감마 처리, 웹은 sRGB 블렌딩입니다. 겹친 Glow 의 밝기가 아주 약간 다를 수 있습니다. |
| 글자 | 같은 NanumGothic 이지만 줄바꿈·자간 계산이 달라 몇몇 문구의 줄 수가 다를 수 있습니다 (예: 빈 슬롯 안내문 3줄 → 2줄). 폰트는 한글 2,350자 서브셋이라 드문 글자는 시스템 한글 폰트로 표시됩니다. |
| 화면 비율 | Unity 는 CanvasScaler(Expand)로 다른 비율에도 HUD 를 가장자리에 붙입니다. 웹은 16:9 고정 화면을 창에 맞춰 확대하고 남는 부분은 검은 여백입니다(PC 16:9 대상). |
| 마스크 | Unity Mask 로 자르던 카드 그림은 같은 영역을 미리 잘라 둔 텍스처로 표시합니다(보이는 결과 동일). |
| 확장 슬롯 | Unity ScriptableObject 의 프리팹 슬롯(속성별 fieldVfx, 투사체 스프라이트, clashVfx 등)은 웹에 없습니다. v6 기본값에서는 비어 있으므로 화면은 같습니다. |
| 무작위 입자 | 불꽃 파편·스파크 방향 같은 장식용 난수는 매번 다릅니다(규칙 난수는 동일). |
| 에디터 도구 | Unity 메뉴(기본 데이터 재생성 등) 대신 TS 데이터 파일을 직접 수정합니다. |
| 자가 테스트 | 게임 안 버튼은 축약판입니다. 전체 검사는 `npm test`. |
| 수치 정밀도 | 배율 계산이 C# float 대신 JS double 입니다. v6 값에서는 240판 기록이 모두 일치하며, 반올림 경계에 걸리는 특이한 배율을 넣을 때만 차이가 날 수 있습니다. |
| 웹 전용 | 수치 편집 서랍, URL 옵션(`?mode`, `?seed`), 자동화용 `window.magicBattle` 훅은 디버그 도구로만 추가했습니다. 게임 규칙·카드·시스템 추가는 없습니다. |

---

라이선스: 폰트는 NanumGothic (SIL Open Font License, `public/assets/fonts/LICENSE-NanumFont.txt`).
