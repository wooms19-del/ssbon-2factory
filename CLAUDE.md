# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. No Closing Colons (Korean Output)

**End Korean sentences with a period, not a colon.**

When the user writes in Korean, your output is Korean too:
- Don't end a sentence with `:` even when a list or example follows.
- LLMs leak the English colon habit into Korean. Catch it.
- Every Korean sentence should end in `.`, `?`, or `!` — not `:`.
- Colons are fine inside code, key-value pairs, or labels — not as sentence enders.

## 6. Korean File Header Comment

**First line of every new JS file: a one-line Korean comment stating its role.**

- e.g. `// 파쇄 공정: 입력·저장·잔량(FIFO) 계산 — sh2*`
- Agents read files selectively, not whole codebases. One Korean line gives the next session instant context.
- Skip vendor/config files.

## 7. Plan First, Log Decisions (Obsidian)

**Before any non-trivial task, state a brief plan. Capture decisions as you go.**

- Plan: what we're building and why, with a verify step per item (see #4).
- ssbon has no `checklist.md`/`context-notes.md` convention — record decisions and their reasoning so they can drop into the Obsidian troubleshooting log.
- Don't start a multi-step change without naming the success check first.

## 8. Verify Before "Done" (no test suite)

**ssbon has no test harness. Self-verify instead — every time, before push.**

- `node -c <file>.js` for syntax on any touched JS.
- Run the actual computed value against real Firestore data (or a LibreOffice render for xlsx/pdf) and eyeball it.
- The user must never be the one to find the error via screenshot.
- Verify proactively, before the user says "끝", "완료", "다 됐어".

## 9. Semantic Commits + 3-Set Deploy

**One logical change = one commit. Ship it through the full deploy chain.**

- The test: can you describe the commit in one sentence? If not, split it.
- Every code change to a live `js/*.js` ships as 3 ordered steps:
  1. code commit + push
  2. `index.html` `?v=` bump — increase only, and to a NEW value (reusing the same `?v=` serves the stale cached file)
  3. Firestore `_config/version` PATCH (`value` stringValue) to trigger auto-reload
- Back up to `/home/claude/backups/` before any destructive Firestore op.

## 10. Read What Actually Runs — Don't Guess

**Read the real error/log. When a screen value is wrong, confirm which code actually executes.**

- Read the full error/stack, not the keyword. Don't apply a "common fix" before confirming the cause.
- When a displayed number is wrong, don't jump to "cache" or any single theory. First find the exact function the browser runs and trace it on the real data.
- Watch for: a function redefined/overridden later in the same file (the override runs, not the top definition); a stale file cached at an unchanged `?v=`; the wrong render function for that screen.
- If unclear, add a probe (independent page, or a node trace on live data) to see the real value — then fix.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# 프로젝트 — 순수본 FP부문 2공장 스마트팩토리

공장 전 공정을 다루는 생산 대시보드. 우무송 대리가 직접 만들어 운영 중.
호칭은 "관리자님", 정중한 존댓말.

## 스택
- Firestore (프로젝트 ID `ssbon-factory`) + Vanilla JS + GitHub Pages
- 보안 규칙이 열려 있어 Firestore REST API로 직접 읽기/쓰기 가능 (인증 불필요)
- 회사 PC·태블릿·모바일 동시 사용. **단일 디바이스에서만 동작하는 기능 금지**
- localStorage에 업무 데이터 저장 금지 (설정값만). Firestore가 유일한 진실 공급원

## 공정
해동 → 방혈 → 전처리 → 자숙 → 파쇄 → 내포장 → 외포장 → 레토르트

컬렉션: `thawing` `preprocess` `cooking` `shredding` `packing` `packing_pending`
`outerpacking` `retort` `sauce` `barcode` `attendance` `_config/*`

## 화면 ↔ 파일
| 화면 | 파일 |
|---|---|
| 일별실적 | `analysis.js` → `renderDaily` |
| 월별현황 | `analysis.js` → `renderMonthlyReport` |
| 월단위생산량 | `monthly_production.js` |
| 내포장 | `packing.js` |
| 외포장 | `outerpacking.js` |
| 레토르트 | `retort.js` |
| 출퇴근 | `attendance.js` |

같은 계산이 여러 화면에 흩어져 있다. **공유 로직을 고치면 연결된 화면 전부 감사할 것.**
한 곳만 고치고 끝내면 화면마다 값이 달라진다. 이게 이 코드베이스 최대 약점이다.

## 배포 3-set (항상 세트로)
1. commit + push
2. `index.html`의 해당 스크립트 `?v=` 를 새 unix timestamp로 (증가만, 재사용 금지)
3. Firestore `_config/version` 의 `value` 필드(stringValue)를 같은 값으로 PATCH
   `?updateMask.fieldPaths=value` — `v` 필드 아님

3번을 빼먹으면 현장 태블릿이 옛 코드를 계속 쓴다.

## 도메인 규칙
- **부위 판정**: 파쇄(`shredding`) 기록의 `type`을 우선 사용. 와건 번호는 같은 날
  재사용되므로 자숙 역추적은 틀린 회차를 집는다. 없을 때만 파쇄 시작 전에 끝난
  자숙 중 가장 나중 것을 고른다 (`_ckPickForWIn`)
- **박스 카운트**: `importCodes` 배열 길이 (수동 `boxes` 필드 아님)
- **불량률** = 불량 ÷ (내포장 EA + 불량)
- **수율** = 원육 대비 누적 (단계별 곱 아님). 파쇄 ~50% 정상. 포장 100% 초과 정상
  (물·양념 흡수)
- **무게**: 세척 전(`kg`)과 세척 후(`kgWashed`) 혼용 금지
- **완제품 수량**: 외포장(`outerpacking`)의 `outerEa + remainEa`. 내포장 EA는 완제품이 아님
- **레토르트**: 1대 최대 4대차, 3대 운영, 한 회차 150분
- 원육: EYE ROUND=홍두깨 / Bottom Round=설도 / Topside·Inside Round=우둔
- 제품명 변경 시 `packing`·`outerpacking` 양쪽 `product` 모두 PATCH

## 검증
테스트 하네스 없음. 푸시 전 반드시 자체 검증할 것.
- 바꾼 JS는 `node --check`
- 계산을 바꿨으면 실제 Firestore 데이터로 값을 뽑아 눈으로 확인
- 파괴적 작업 전 백업 필수

## Firestore 주의
- 숫자로 시작하는 필드명 PATCH는 백틱 URL 인코딩 (`%60숫자%60`)
- map 통째 PATCH 시 기존 키를 전부 포함해야 함 (빠진 키는 삭제됨)

## UI 색상
- 손실·불량·폐기 등 부정 수치: `#dc2626`
- 정상·달성·절감 등 긍정 수치: `#1d4ed8` 또는 녹색
