# 로드맵 — 일별실적 부위 분리 v2 (월단위 미러링 방식)

> **작성일**: 2026-05-06  
> **목표**: 일별실적 화면에서 같은 제품의 다른 부위(예: 시그니처 130g 우둔 / 홍두깨)를 별도 행으로 분리 표시 + 모든 컬럼 정확히 매핑.  
> **방식**: 월단위(`monthly_production.js`)의 검증된 그룹핑/분배 로직을 일별실적(`performance.js`)에 미러링.  
> **원칙**: DB raw 데이터는 그대로, 가져오는 흐름만 새로 설계.

---

## 1. 배경

### 1.1 현재 상황

| | 월단위 (monthly_production.js) | 일별실적 (performance.js) |
|------|------|------|
| 그룹핑 키 | `(date, product, type)` | `(date, product)` |
| 부위별 행 분리 | ✅ 자동 (월단위 토글로 표시) | ❌ 같은 행에 합쳐짐 |
| 부위별 원육/공정 분배 | ✅ `_allocByRatio` 분배 | ❌ 분배 로직 없음 (그룹 첫 행에 합계) |
| 사용량 (파우치/소스/부재료/박스) | ✅ 토글로 표시 | ✅ 항상 표시 |
| 박스 내역 (설도/홍두깨/우둔별 박스 수) | ❌ 없음 | ✅ 있음 |
| 외포장 세부 (트레이/박스불량/단위) | ❌ 없음 | ✅ 있음 |
| 추적/소비기한 | ❌ 없음 | ✅ 있음 |

### 1.2 사용자 요구

- 4/27 같은 날 = 시그니처 130g (우둔/홍두깨 분리 작업) → 한 행에 합쳐서 표시 X
- 월단위처럼 (날짜, 제품, 부위) 단위로 별도 행 표시
- 일별실적의 기존 컬럼(박스 내역/외포장/추적/소비기한) 그대로 유지
- 부위별 원육/전처리/자숙/파쇄 KG도 분배 표시

### 1.3 이전 시도 실패 이력 (2026-05-06 오전)

| Commit | 시도 | 결과 |
|------|------|------|
| d35b731 | byDP 키에 type 추가 | 화면 변화 없음 (데이터 흐름 일부만 수정) |
| 53b11dc | else 분기 멤버별 부위 표시 | 두 번째 멤버 빈칸 |
| 30c5317 | traced 객체 참조 공유 방지 (shallow copy) | 여전히 빈칸 |
| 06679e2 | **전체 롤백** (5d51890 시점으로) | 안전 복귀 |

**실패 원인**: 일별실적의 기존 그룹핑 로직(poolKey, getProductPartBoxes)과 새 로직 충돌. 추측 디버깅 (Karpathy 4-3 위반).

---

## 2. 새 데이터 흐름 (제안)

### 2.1 핵심 변경

```
[현재]
Firestore raw
  ↓
byDP[date|product] = 합계 (부위 정보 잃음)
  ↓
prods = ['시그니처130g'] (1개)
  ↓
화면: 1 row (부위 강제 분리 시도하다 실패)
```

```
[새 흐름]
Firestore raw
  ↓
byDPT[date|product|type] = 부위별 합계 (월단위와 동일)
  ↓
keys = [(date, product, type) 쌍 목록]
  ↓
각 key마다 1 row → 부위별 자연 분리
  ↓
부위별 분배 헬퍼로 원육/공정 KG 채움
  ↓
박스 내역/외포장/추적은 (date, product) 단위로 매핑 (기존 로직 유지)
```

### 2.2 핵심 원칙

1. **월단위와 똑같이** `(date, product, type)` 단위로 row 생성
2. 부위별 분배는 월단위의 `_allocByRatio` 사용
3. 일별실적 고유 컬럼(박스 내역, 외포장, 추적)은 **첫 행에만** 표시 (다중 부위 시), rowspan으로 시각적 병합
4. 검증 = console.log로 단계별 확인 (Karpathy 4-3 준수)

---

## 3. 공유 헬퍼 추출 계획

월단위에서 일별실적이 같이 쓸 수 있도록 별도 파일로 추출:

### 3.1 새 파일: `js/dist_helpers.js`

추출할 함수:
- `_num`, `_r2`, `_t2m`, `_hoursFromSE` (기본 유틸)
- `_isNoMeat`, `_prodKgUnit`, `_prodKgea`, `_prodNoMeat` (제품 메타)
- `recType` (부위 추출)
- `buildShTypeMap` (파쇄 부위 매칭)
- `sumByDateType` (날짜×부위 합계)
- `_allocByRatio` (비율 분배)
- `_dataByType`, `_dataAll` (부위별 / 전체 데이터)

### 3.2 기존 파일 수정

- `monthly_production.js`: 헬퍼 자체는 거기서 정의 → 나중에 `dist_helpers.js`로 옮긴 뒤 import
- `performance.js`: `dist_helpers.js`의 함수들 import 후 사용

### 3.3 의존성

- 두 파일 다 IIFE 안에서 동작 → window 전역 노출 후 다른 파일에서 사용 가능

---

## 4. 컬럼 매핑표 — 일별실적 모든 컬럼

| 컬럼 | 데이터 출처 | 매핑 단위 | 부위별 분배? |
|------|------|------|------|
| 일수 | rowIdx | row | - |
| 날짜 | date | row | - |
| 소비기한 | barcode.expDate | (date, product) | 첫 행만 |
| 제품명 | product | row | - |
| 원육종류 (부위) | byDPT.type | (date, product, type) | ✅ 자동 |
| 원육 (kg) | _allocByRatio(thawing.totalKg) | (date, product, type) | ✅ 분배 |
| 설도/홍두깨/우둔 박스 | thawing.boxes (type별) | (date, product) | 첫 행만 |
| 전처리 (kg) | _allocByRatio(preprocess.totalKg) | (date, product, type) | ✅ 분배 |
| 자숙 (kg) | _allocByRatio(cooking.totalKg) | (date, product, type) | ✅ 분배 |
| 파쇄 (kg) | _allocByRatio(shredding.totalKg) | (date, product, type) | ✅ 분배 |
| 소스 (kg) | byDPT.sauceKg | (date, product, type) | ✅ ratio |
| 내포장 (EA) | byDPT.ea | (date, product, type) | ✅ 자동 |
| 불량 파우치 | byDPT.defect | (date, product, type) | ✅ ratio |
| 완박스 | outerpacking.outerBoxes | (date, product) | 첫 행만 |
| 불량 박스 | outerpacking.boxDefect | (date, product) | 첫 행만 |
| 트레이 | outerpacking.tray | (date, product) | 첫 행만 |
| 트레이 불량 | outerpacking.trayDef | (date, product) | 첫 행만 |
| 출고 박스 | outerpacking.outerBoxes | (date, product) | 첫 행만 |
| FP소스 (kg) | sauce.fpKg | (date) | 일자 첫 행만 |
| FC소스 (kg) | sauce.fcKg | (date) | 일자 첫 행만 |
| 메추리알 (kg) | byDP[meatProd] (메추리알 제품의 raw) | (date, product) | 첫 행만 |
| 파우치 합계 | byDPT.pouch | (date, product, type) | ✅ ratio |
| 박스 합계 | outerpacking 박스 (정상+불량) | (date, product) | 첫 행만 |

**부위별 분배 (✅ 분배)** = `_allocByRatio` 비율로 정확히 나눔  
**ratio** = packing EA 비율로 단순 분배  
**첫 행만** = 다중 부위 시 첫 행에만 표시, 나머지 빈칸 (rowspan)

---

## 5. 단계별 구현 순서 (8단계)

각 단계마다 검증 포인트 명시. 한 단계 끝나야 다음.

### Step 1: 헬퍼 추출 (1시간)
- `js/dist_helpers.js` 신규 파일
- monthly의 헬퍼 함수들 복사 (수정 X)
- monthly에서는 그대로 자기 함수 사용 (이중 정의 OK, 검증 단계)
- **검증**: monthly 화면이 그대로 동작하는지 확인

### Step 2: byDPT 추가 (30분)
- `performance.js`에 `byDP` 외에 `byDPT` 추가 (date|product|type 키)
- 기존 `byDP`도 그대로 유지 (호환성)
- 새 함수 `_buildKeysByDPT()` 추가
- **검증**: console.log로 byDPT 결과 확인 (4/27에 우둔/홍두깨 2개 키 보여야)

### Step 3: 부위별 분배 함수 호출 (30분)
- `_allocByRatio` import
- 4/27 시그니처 130g에 대해 우둔/홍두깨 비율로 rmKg, ppKg, ckKg, shKg 분배
- **검증**: console.log로 분배 결과 확인

### Step 4: row 빌드 변경 — 1단계 (1시간)
- `prods` 대신 `prodTypeKeys` 사용
- 각 key마다 1 row 생성 (부위 정보 포함)
- 박스/외포장/추적은 일단 첫 행만 표시 (다른 행 빈칸)
- **검증**: 4/27에 2 row (우둔, 홍두깨) 표시되는지

### Step 5: 부위별 KG 표시 (30분)
- 각 row의 rmKg, ppKg, ckKg, shKg를 분배된 값으로
- **검증**: 4/27 우둔 KG / 홍두깨 KG가 비율대로 분배됐는지

### Step 6: 사용량 분배 — ratio (30분)
- byDPT.sauceKg, .pouch는 이미 type별 합계 → 그대로 사용
- **검증**: 4/27 우둔/홍두깨 각 사용량 정확한지

### Step 7: rowspan 시각적 병합 (1시간)
- 박스 내역/외포장/추적은 다중 부위 시 첫 행만 표시 + rowspan 적용
- **검증**: 4/27 박스 내역이 두 행 걸쳐 한 칸으로 병합되는지

### Step 8: 합계 행 검증 (30분)
- sumRow가 부위별 분리된 row들을 정확히 합산하는지
- **검증**: 합계가 기존과 동일하게 나오는지

---

## 6. 위험 요소 + 완화책

### 6.1 박스 내역 (설도/홍두깨/우둔)
- **위험**: 부위별 row마다 박스 내역이 따로 표시되면 = 박스 합계 두 배
- **완화**: 다중 부위 시 첫 행만 박스 내역 표시 (Step 7)

### 6.2 외포장 EA
- **위험**: 외포장은 (date, product) 단위라 부위 분리 없음
- **완화**: 첫 행에만 표시. innerEa = byDPT.ea로 자연 분리됨

### 6.3 추적 코드/소비기한
- **위험**: 부위별로 다를 수 있음 (다른 lot)
- **완화**: 일단 첫 행만 표시. 사용자분 검토 후 부위별 표시 필요시 추가 작업

### 6.4 합계 행
- **위험**: 부위별 row가 추가되어 합계 변경
- **완화**: rmKg, ppKg, ckKg, shKg는 분배된 값들의 합계 = 원본 합계와 동일 (수학적 보장)

### 6.5 메추리알 같은 noMeat 제품
- **위험**: 부위 없는 제품도 새 로직에 영향
- **완화**: type='' 또는 '무육'은 단일 row로 (월단위와 동일 처리)

---

## 7. 롤백 계획

각 Step마다 git commit. 실패 시 롤백 anchor:
- 시작 anchor: 현재 production 마지막 commit (`6a77da0` 부재료 추가 시점)
- Step 1 commit: `feat: dist_helpers.js 추출`
- Step 2 commit: `feat: performance byDPT 추가`
- ...

문제 발견 시 = `git revert` 또는 `git checkout {anchor} -- js/performance.js`

---

## 8. 예상 시간

| 단계 | 시간 |
|------|------|
| Step 1 | 1시간 |
| Step 2 | 30분 |
| Step 3 | 30분 |
| Step 4 | 1시간 |
| Step 5 | 30분 |
| Step 6 | 30분 |
| Step 7 | 1시간 |
| Step 8 | 30분 |
| **합계** | **5.5시간** |

세션 분할 가능. 한 번에 다 안 해도 됨.

---

## 9. 사용자 승인 후 진행 순서

1. 사용자분이 이 ROADMAP 검토
2. 수정/추가 요청 → 갱신 push
3. **사용자분 OK → Step 1부터 진행**
4. 각 Step 끝나면 사용자분 화면 검증 → OK 받고 다음
5. 8 Step 완료 시 = 일별실적 부위 분리 완성

---

## 10. 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-05-06 | v2 초안 | 첫 작성. 월단위 미러링 방식 |
