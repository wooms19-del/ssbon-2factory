# DB 스키마 명세서 — 순수본 2공장 스마트팩토리 (RDBMS 이관용)

> **작성 목적**: Firebase/Firestore(NoSQL) 기반 현행 앱을 사내 로컬 표준 RDBMS로 이관·통합하기 위한 테이블 명세서.
> **작성 방식**: 현행 앱의 실제 코드(`js/*.js`)에서 저장(write)되는 필드를 직접 추출하여 정규화 번역.
> **표기 원칙(거짓말 금지)**:
> - **관찰됨(Observed)** = 현행 코드에 실제로 저장되는 필드 (사실).
> - **설계(Design)** = NoSQL 임베디드 구조를 RDBMS로 풀어내며 신설한 정규화 테이블·대리키(PK)·외래키(FK). 현행 코드에 컬럼이 존재하지 않으며, 이관 시 신규 생성 대상.
> - 마스터 도메인 분류는 "전사 공통/ERP에서 기준정보를 받아와야 하는가" 기준으로 판정.

---

## 1. 앱 개요

- **앱 이름**: 순수본 2공장(FP부문) 스마트팩토리 웹 대시보드 (`ssbon-2factory`)
- **핵심 목적**: 바코드 입고 → 방혈 → 전처리 → 자숙 → 파쇄 → 내포장 → 외포장(+레토르트)까지 축산가공 전 공정을 단위 작업 기록으로 추적하고, 원육 기준 수율·생산성·불량률을 일별/월별로 집계하여 임원 보고에 사용하는 현장 운영·분석 시스템.

---

## 2. 마스터 데이터 도메인 분류 요약

현행 앱에서 **전사 공통/ERP 기준정보 연동이 필요한 컬럼**을 도메인별로 분류한다. 이관 후 아래 도메인들은 공장별/유형별로 복수 마스터 테이블로 분할될 수 있으므로, 본 명세서는 **도메인 명칭만 지정**하고 물리 테이블명은 제안값(`tb_*`)으로만 둔다.

| 마스터 데이터 도메인 | 현행 앱 내 해당 컬럼(원천) | 비고 |
|---|---|---|
| **[완제품]** | `product`(제품명), `kgea`, `kgTot`, `capa`, 제품-소스 연결 | 현행은 제품명(문자열)이 사실상 키. ERP 품목코드와 매핑 필요. |
| **[원재료]** | `part`/`type`(부위·육절: 홍두깨/설도/우둔 등), `weightKg`, `origin`(원산지), `gtin` | 부위 마스터 + GTIN 매핑 + 원산지. ERP 원재료 코드 연동 대상. |
| **[부재료]** | `submats`(메추리알/버터 등), `subName`, `sauce`/`sauceTank`(소스) | 소스는 별도 [소스] 도메인으로 분리 가능. |
| **[소스]** | `sauce`(FC/FP 장조림 소스), `sauceKg`, `sauceTank` | [부재료] 하위 또는 독립 마스터. |
| **[사용자/권한]** | `employees`(직원명), `role`(production/QC/관리), `workers`(투입 인원), 카카오 `userId` | 인사/권한 마스터 연동. `role !== 'production'` = 생산인원 카운트 제외. |
| **[공장코드]** | `factory`('2공장'), `stockIn_f1`(1공장), `transfer.direction`(공장 간 이동) | 전사 공장/사업장 코드 연동. |
| **[설비]** | `machine`(포장설비), `tank`(자숙탱크 1~6), `wagon`/`cart`(와건/대차), `retort.machine`(레토르트 1~3호기) | 사내 설비 마스터. ERP 외 자체 관리 가능. |
| **[거래처/원산지]** | `origin`(원산지국/거래처) | [원재료] 하위 또는 독립. ERP 거래처 코드 연동. |

> **이관 핵심**: 위 도메인 컬럼들은 현행 앱에서 대부분 **자유 문자열**로 저장된다(예: `part='홍두깨'`, `product='시그니처 장조림 130g'`). RDBMS 이관 시 각 도메인 마스터 테이블의 코드(PK)로 치환하고, 트랜잭션 테이블은 해당 코드를 FK로 참조하도록 정규화해야 한다.

---

## 3. 마스터 테이블 정의

### 3.1 `tb_factory` — 공장/사업장 마스터
**역할**: 2공장/1공장 등 사업장 구분. 현행은 `factory='2공장'` 하드코딩 및 `stockIn_f1`(1공장) 컬렉션 분리로만 존재 → 코드화 신설.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| factory_code | 공장코드 | VARCHAR(10) | PK | N | **[공장코드]** | 전사 공통 사업장 코드(예: FP02). 설계 신설. |
| factory_name | 공장명 | VARCHAR(50) | | N | **[공장코드]** | 관찰됨: `'2공장'`, `'1공장'`. |
| division | 부문 | VARCHAR(30) | | Y | **[공장코드]** | 예: FP부문. |

**관계**: 1 `tb_factory` : N 거의 모든 트랜잭션 테이블(현행은 단일 공장 운영이라 암묵적).

---

### 3.2 `tb_employee` — 직원/권한 마스터
**역할**: 출퇴근·작업인원 산정의 기준 직원 명부. 원천: `_config/attendance_employees` 문서의 `employees[]`.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| employee_id | 직원ID | BIGINT | PK | N | **[사용자/권한]** | 설계 신설(현행은 `name`이 사실상 키). |
| name | 성명 | VARCHAR(50) | | N | **[사용자/권한]** | 관찰됨. 현행 식별키. |
| role | 직무구분 | VARCHAR(20) | | Y | **[사용자/권한]** | 관찰됨. `'production'`만 생산인원 카운트 포함, 그 외(QC/관리) 제외. |
| annual_days | 연차일수 | INT | | Y | **[사용자/권한]** | 관찰됨(기본 15). |
| used_days | 사용연차 | INT | | Y | **[사용자/권한]** | 관찰됨. |
| factory_code | 공장코드 | VARCHAR(10) | FK→tb_factory | Y | **[공장코드]** | 설계 신설. |

**관계**: 1 `tb_employee` : N `tb_attendance_detail`.

---

### 3.3 `tb_raw_part` — 원재료(부위/육절) 마스터
**역할**: 홍두깨/설도/우둔 등 육절(부위) 기준. 원천: `gtinMap`의 값 집합, `barcode.part`, 각 공정의 `type`.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| part_code | 부위코드 | VARCHAR(20) | PK | N | **[원재료]** | 설계 신설. ERP 원재료 코드 매핑 대상. |
| part_name | 부위명 | VARCHAR(50) | | N | **[원재료]** | 관찰됨: 홍두깨(EYE ROUND), 설도(Bottom Round), 우둔(Topside/Inside Round). |
| part_name_en | 부위명(영문) | VARCHAR(50) | | Y | **[원재료]** | 육절 영문 명칭. |

**관계**: 1 `tb_raw_part` : N `tb_gtin_map`, `tb_import_barcode`, `tb_stock_in`.

---

### 3.4 `tb_origin` — 원산지/거래처 마스터
**역할**: 원육 원산지. 원천: `barcode.origin`.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| origin_code | 원산지코드 | VARCHAR(20) | PK | N | **[거래처/원산지]** | 설계 신설. ERP 거래처/원산지 코드 연동. |
| origin_name | 원산지명 | VARCHAR(50) | | N | **[거래처/원산지]** | 관찰됨(자유 문자열). |

---

### 3.5 `tb_gtin_map` — GTIN→부위 매핑 마스터
**역할**: 입고 바코드(GS1 GTIN) → 부위 자동 판정. 원천: `_config/gtin_map.map`.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| gtin | GTIN | VARCHAR(14) | PK | N | **[원재료]** | 관찰됨. GS1-128 AI(01) 14자리. |
| part_code | 부위코드 | VARCHAR(20) | FK→tb_raw_part | N | **[원재료]** | 관찰됨(현행은 부위명 문자열). |
| updated_at | 수정일시 | DATETIME | | Y | | 관찰됨. |

---

### 3.6 `tb_product` — 완제품 마스터
**역할**: 생산 품목 기준정보. 원천: `settings/config` 문서의 `products[]`.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| product_id | 제품ID | BIGINT | PK | N | **[완제품]** | 설계 신설(현행은 `name`이 키). |
| product_name | 제품명 | VARCHAR(100) | | N | **[완제품]** | 관찰됨. 현행 매칭키. ERP 품목코드 매핑 대상. |
| kg_ea | 개당중량(kg) | DECIMAL(8,4) | | Y | **[완제품]** | 관찰됨. EA당 kg. |
| kg_tot | 총중량(kg) | DECIMAL(8,4) | | Y | **[완제품]** | 관찰됨(선택). 미존재 시 kg_ea 사용. |
| capa | 일생산능력 | INT | | Y | **[완제품]** | 관찰됨. |
| sauce_code | 소스코드 | VARCHAR(20) | FK→tb_sauce | Y | **[소스]** | 관찰됨(현행은 소스명 문자열). |
| no_meat | 무육여부 | BOOLEAN | | Y | **[완제품]** | 관찰됨. true면 원육수율 산정 제외. |
| sub_name | 기본부재료명 | VARCHAR(50) | FK→tb_submaterial | Y | **[부재료]** | 관찰됨(선택). |
| sub_kg_ea | 부재료개당중량 | DECIMAL(8,4) | | Y | **[부재료]** | 관찰됨(선택). |

**관계**: 1 `tb_product` : N `tb_packing`, `tb_outerpacking`, `tb_retort`, `tb_recipe`, `tb_schedule_item`.

---

### 3.7 `tb_sauce` — 소스 마스터
**역할**: FC/FP 장조림 소스 등. 원천: `settings/config.sauces[]`.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| sauce_code | 소스코드 | VARCHAR(20) | PK | N | **[소스]** | 설계 신설. |
| sauce_name | 소스명 | VARCHAR(50) | | N | **[소스]** | 관찰됨. |
| memo | 비고 | VARCHAR(200) | | Y | | 관찰됨(배합 메모). |

---

### 3.8 `tb_submaterial` — 부재료 마스터
**역할**: 메추리알/버터 등. 원천: `settings/config.submats[]`.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| submaterial_code | 부재료코드 | VARCHAR(20) | PK | N | **[부재료]** | 설계 신설. |
| submaterial_name | 부재료명 | VARCHAR(50) | | N | **[부재료]** | 관찰됨(현행은 문자열 배열). |

---

### 3.9 `tb_recipe` — 제품 레시피(자재 BOM) 마스터
**역할**: 제품별 내포장(inner)/외포장(outer) 자재 소요량. 원천: `settings/config.recipes{제품:{inner[],outer[]}}` 임베디드 → 정규화.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| recipe_id | 레시피ID | BIGINT | PK | N | | 설계 신설(임베디드 풀이). |
| product_id | 제품ID | BIGINT | FK→tb_product | N | **[완제품]** | 관찰됨(키=제품명). |
| stage | 구분 | VARCHAR(10) | | N | | 관찰됨: `inner`(내포장)/`outer`(외포장). |
| item_name | 자재명 | VARCHAR(50) | | N | **[부재료]** | 관찰됨. |
| qty | 소요량 | DECIMAL(10,4) | | N | | 관찰됨(EA당). |
| unit | 단위 | VARCHAR(10) | | Y | | 관찰됨. |
| pkg_type | 포장유형 | VARCHAR(20) | | Y | | 관찰됨(outer만). |

**관계**: N `tb_recipe` : 1 `tb_product`.

---

### 3.10 `tb_holiday` — 공휴일 마스터
**역할**: 근무일 판정. 원천: `_config/holidays.map`(date.nager.at API 캐싱).

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| holiday_date | 공휴일 | DATE | PK | N | | 관찰됨. 대체공휴일 포함. |
| holiday_name | 명칭 | VARCHAR(50) | | N | | 관찰됨. |

---

### 3.11 `tb_equipment` — 설비 마스터(선택 도입)
**역할**: 자숙탱크(1~6)/포장설비/레토르트(1~3호기)/와건/대차. 현행은 옵션 하드코딩 또는 자유입력 → 코드화 권장.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| equipment_code | 설비코드 | VARCHAR(20) | PK | N | **[설비]** | 설계 신설. |
| equipment_type | 설비유형 | VARCHAR(20) | | N | **[설비]** | tank/machine/retort/wagon/cart. |
| equipment_name | 설비명 | VARCHAR(50) | | N | **[설비]** | 관찰됨(예: '1번탱크', '3호기'). |
| factory_code | 공장코드 | VARCHAR(10) | FK→tb_factory | Y | **[공장코드]** | |
| attr | 속성 | JSON | | Y | **[설비]** | 예: 자숙탱크 가압/일반 구분, 용량 800kg. |

---

## 4. 트랜잭션(공정) 테이블 정의

> 모든 공정 테이블 공통: 현행 NoSQL의 `id`(앱 생성 UUID), `fbId`(Firestore 문서ID)는 이관 시 대리키(`*_id` BIGINT)로 흡수하되, 추적·재동기화용으로 `src_doc_id`(원본 문서ID)를 보존 권장.

### 4.1 `tb_import_barcode` — 입고(바코드 판독)
**역할**: 원육 박스 단위 입고. 박스 1건 = 1행. (박스 수 진실 = 행 수, 현행 `importCodes` 배열 길이와 동치.)

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| import_id | 입고ID | BIGINT | PK | N | | 설계 신설(현행 `id`). |
| src_doc_id | 원본문서ID | VARCHAR(40) | | Y | | 현행 `id`/`fbId` 보존용. |
| import_date | 입고일자 | DATE | | N | | 관찰됨 `date`. |
| rf_start | 해동시작 | DATETIME | | Y | | 관찰됨 `rfStart`. |
| rf_end | 해동종료 | DATETIME | | Y | | 관찰됨 `rfEnd`(자동 계산). |
| status | 적합여부 | VARCHAR(10) | | Y | | 관찰됨(적합/부적합). |
| part_code | 부위코드 | VARCHAR(20) | FK→tb_raw_part | Y | **[원재료]** | 관찰됨 `part`(현행 문자열). |
| origin_code | 원산지코드 | VARCHAR(20) | FK→tb_origin | Y | **[거래처/원산지]** | 관찰됨 `origin`(현행 문자열). |
| gtin | GTIN | VARCHAR(14) | FK→tb_gtin_map | Y | **[원재료]** | 관찰됨. |
| weight_kg | 중량(kg) | DECIMAL(8,2) | | Y | | 관찰됨 `weightKg`(바코드 AI 310/320 판독). |
| pack_date | 포장일 | DATE | | Y | | 관찰됨 `packDate`. |
| expiry_date | 소비기한 | DATE | | Y | | 관찰됨 `expiryDate`. |
| manual | 수동입력여부 | BOOLEAN | | Y | | 관찰됨 `manual`. |
| reason | 사유 | VARCHAR(100) | | Y | | 관찰됨 `reason`. |

---

### 4.2 `tb_thawing` — 방혈/해동
**역할**: 해동기에서 나온 원육을 방혈통(대차)에 투입. 1회 투입 = 1행.
**주의(도메인 룰)**: `date = start의 +1일`(작업일=종료일=박스 출고일)로 강제 정정됨.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| thawing_id | 방혈ID | BIGINT | PK | N | | 설계 신설. |
| src_doc_id | 원본문서ID | VARCHAR(40) | | Y | | 현행 `id`/`fbId`. |
| work_date | 작업일자 | DATE | | N | | 관찰됨 `date`(=시작+1일). |
| cart_no | 대차번호 | VARCHAR(20) | FK→tb_equipment | Y | **[설비]** | 관찰됨 `cart`. |
| part_types | 부위(복수) | VARCHAR(100) | | Y | **[원재료]** | 관찰됨 `type`(콤마 결합) → 정규화 시 `tb_thawing_part` 분리 권장. |
| start_dt | 시작일시 | DATETIME | | N | | 관찰됨 `start`. |
| end_dt | 종료일시 | DATETIME | | Y | | 관찰됨 `end`(전처리 차감 시 자동 채움). |
| boxes | 박스수 | INT | | N | | 관찰됨 `boxes`. |
| total_kg | 총중량(kg) | DECIMAL(10,2) | | N | | 관찰됨 `totalKg`(박스별 실측합). |
| remain_kg | 잔량(kg) | DECIMAL(10,2) | | N | | 관찰됨 `remainKg`. 전처리 FIFO 차감 대상. |

#### 4.2-c `tb_thawing_import` — 방혈↔입고 매핑 (child)
**역할**: 현행 `importCodes[]`(투입된 입고 바코드 배열) 정규화.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| thawing_id | 방혈ID | BIGINT | PK,FK→tb_thawing | N | | 설계 신설. |
| import_id | 입고ID | BIGINT | PK,FK→tb_import_barcode | N | | 관찰됨(`importCodes` 원소). |

**관계**: 1 `tb_thawing` : N `tb_thawing_import` : 1 `tb_import_barcode` (N:M 해소).

---

### 4.3 `tb_preprocess` — 전처리 (v2)
**역할**: 방혈 원육을 케이지(cage)에 손질·적재. 1행 = 1케이지 작업. (`_v=2` = v2 레코드.)

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| preprocess_id | 전처리ID | BIGINT | PK | N | | 설계 신설. |
| src_doc_id | 원본문서ID | VARCHAR(40) | | Y | | 현행 `id`/`fbId`. |
| work_date | 작업일자 | DATE | | N | | 관찰됨 `date`. |
| part_code | 부위코드 | VARCHAR(20) | FK→tb_raw_part | N | **[원재료]** | 관찰됨 `type`. |
| cage | 케이지 | VARCHAR(20) | FK→tb_equipment | Y | **[설비]** | 관찰됨 `cage`. |
| wagons | 와건(복수) | VARCHAR(100) | | Y | **[설비]** | 관찰됨 `wagons`(콤마 결합). |
| kg | 산출중량(kg) | DECIMAL(10,2) | | N | | 관찰됨 `kg`. |
| waste_kg | 비가식부(kg) | DECIMAL(10,2) | | N | | 관찰됨 `waste`. |
| workers | 작업인원 | DECIMAL(5,1) | | Y | **[사용자/권한]** | 관찰됨 `workers`. |
| start_t | 시작시각 | TIME | | Y | | 관찰됨 `start`. |
| end_t | 종료시각 | TIME | | Y | | 관찰됨 `end`. |
| version | 버전 | INT | | Y | | 관찰됨 `_v`(=2). |

#### 4.3-c `tb_preprocess_thawing_touch` — 전처리 FIFO 차감 추적 (child)
**역할**: 현행 `thawingTouches[]`/`distribution{}` 정규화. 어느 방혈 잔량에서 얼마를 차감했는지.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| touch_id | 차감ID | BIGINT | PK | N | | 설계 신설. |
| preprocess_id | 전처리ID | BIGINT | FK→tb_preprocess | N | | 관찰됨. |
| thawing_id | 방혈ID | BIGINT | FK→tb_thawing | N | | 관찰됨(`touch.cart`/추적키). |
| deduct_kg | 차감중량(kg) | DECIMAL(10,2) | | N | | 관찰됨 `deductKg`. |

**관계**: 1 `tb_preprocess` : N `tb_preprocess_thawing_touch` : 1 `tb_thawing`.

---

### 4.4 `tb_cooking` — 자숙
**역할**: 케이지 원육을 탱크에서 자숙 후 와건으로 배출. 1행 = 1탱크 1회차.
**도메인 룰**: 6탱크(가압2/일반4), 회차당 800kg, 가압 2.5h/일반 4h.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| cooking_id | 자숙ID | BIGINT | PK | N | | 설계 신설. |
| src_doc_id | 원본문서ID | VARCHAR(40) | | Y | | 현행 `id`/`fbId`. |
| work_date | 작업일자 | DATE | | N | | 관찰됨 `date`. |
| tank | 탱크 | VARCHAR(20) | FK→tb_equipment | N | **[설비]** | 관찰됨 `tank`. |
| part_code | 부위코드 | VARCHAR(20) | FK→tb_raw_part | Y | **[원재료]** | 관찰됨 `type`. |
| cage | 케이지 | VARCHAR(20) | FK→tb_equipment | Y | **[설비]** | 관찰됨 `cage`. |
| workers | 작업인원 | DECIMAL(5,1) | | Y | **[사용자/권한]** | 관찰됨 `workers`. |
| start_t | 시작시각 | TIME | | Y | | 관찰됨 `start`. |
| end_t | 종료시각 | TIME | | Y | | 관찰됨 `end`. |
| out_kg | 배출중량(kg) | DECIMAL(10,2) | | N | | 관찰됨 `kg`(=배출 기준). |
| in_kg | 투입중량(kg) | DECIMAL(10,2) | | Y | | 관찰됨 `kgIn`(케이지에서). |
| wagon_out | 배출와건(복수) | VARCHAR(100) | | Y | **[설비]** | 관찰됨 `wagonOut`. |
| note | 비고 | VARCHAR(200) | | Y | | 관찰됨 `note`. |

#### 4.4-c `tb_cooking_wagon_dist` — 자숙 와건 분배 (child)
**역할**: 현행 `wagonDist{}`(배출)/`wagonInDist{}`(투입) 맵 정규화.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| dist_id | 분배ID | BIGINT | PK | N | | 설계 신설. |
| cooking_id | 자숙ID | BIGINT | FK→tb_cooking | N | | 관찰됨. |
| wagon | 와건 | VARCHAR(20) | FK→tb_equipment | N | **[설비]** | 관찰됨(맵 key). |
| direction | 구분 | VARCHAR(10) | | N | | out(배출)/in(투입). |
| kg | 중량(kg) | DECIMAL(10,2) | | N | | 관찰됨(맵 value). |

---

### 4.5 `tb_shredding` — 파쇄
**역할**: 자숙육을 파쇄하여 와건/대차로 배출. 1행 = 1파쇄 작업.
**목표 수율**: 55%.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| shredding_id | 파쇄ID | BIGINT | PK | N | | 설계 신설. |
| src_doc_id | 원본문서ID | VARCHAR(40) | | Y | | 현행 `id`/`fbId`. |
| work_date | 작업일자 | DATE | | N | | 관찰됨 `date`. |
| wagon_in | 투입와건 | VARCHAR(20) | FK→tb_equipment | Y | **[설비]** | 관찰됨 `wagonIn`. |
| out_kg | 배출중량(kg) | DECIMAL(10,2) | | N | | 관찰됨 `kg`(와건+대차 합산). |
| in_kg | 투입중량(kg) | DECIMAL(10,2) | | Y | | 관찰됨 `kgIn`(자숙에서). |
| waste_kg | 비가식부(kg) | DECIMAL(10,2) | | Y | | 관찰됨 `waste`. |
| workers | 작업인원 | DECIMAL(5,1) | | Y | **[사용자/권한]** | 관찰됨 `workers`. |
| start_t | 시작시각 | TIME | | Y | | 관찰됨 `start`. |
| end_t | 종료시각 | TIME | | Y | | 관찰됨 `end`. |

#### 4.5-c `tb_shredding_out_dist` — 파쇄 배출 분배 (child)
**역할**: 현행 `wagonOutDist{}`·`cartOutDist{}` 맵 정규화. (옵션 A: 와건별 무게 개별 입력 대응.)

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| dist_id | 분배ID | BIGINT | PK | N | | 설계 신설. |
| shredding_id | 파쇄ID | BIGINT | FK→tb_shredding | N | | 관찰됨. |
| container_type | 용기유형 | VARCHAR(10) | | N | **[설비]** | wagon/cart. |
| container_no | 용기번호 | VARCHAR(20) | FK→tb_equipment | N | **[설비]** | 관찰됨(맵 key). |
| kg | 중량(kg) | DECIMAL(10,2) | | N | | 관찰됨(맵 value). |

---

### 4.6 `tb_packing` — 내포장
**역할**: 파쇄육+소스+부재료를 파우치 포장. 1행 = 설비별 1작업.
**불량률 공식**: `defect/(ea+defect)`(폐기=빈파우치, 분모=파우치 기준).

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| packing_id | 내포장ID | BIGINT | PK | N | | 설계 신설. |
| src_doc_id | 원본문서ID | VARCHAR(40) | | Y | | 현행 `id`/`fbId`. |
| work_date | 작업일자 | DATE | | N | | 관찰됨 `date`. |
| product_id | 제품ID | BIGINT | FK→tb_product | N | **[완제품]** | 관찰됨 `product`(현행 제품명). |
| machine | 포장설비 | VARCHAR(20) | FK→tb_equipment | Y | **[설비]** | 관찰됨 `machine`. |
| wagon | 와건 | VARCHAR(20) | FK→tb_equipment | Y | **[설비]** | 관찰됨 `wagon`. |
| cart | 대차 | VARCHAR(20) | FK→tb_equipment | Y | **[설비]** | 관찰됨 `cart`. |
| part_code | 부위코드 | VARCHAR(20) | FK→tb_raw_part | Y | **[원재료]** | 관찰됨 `type`. |
| sub_name | 부재료명 | VARCHAR(50) | FK→tb_submaterial | Y | **[부재료]** | 관찰됨 `subName`. |
| workers | 작업인원 | DECIMAL(5,1) | | Y | **[사용자/권한]** | 관찰됨 `workers`. |
| start_t | 시작시각 | TIME | | Y | | 관찰됨 `start`. |
| end_t | 종료시각 | TIME | | Y | | 관찰됨 `end`. |
| ea | 생산EA | INT | | N | | 관찰됨 `ea`. |
| pouch | 파우치수 | INT | | Y | | 관찰됨 `pouch`. |
| defect | 불량(폐기) | INT | | Y | | 관찰됨 `defect`(빈파우치). |
| sauce_kg | 소스사용(kg) | DECIMAL(10,2) | | Y | **[소스]** | 관찰됨 `sauceKg`. |
| sub_kg | 부재료사용(kg) | DECIMAL(10,2) | | Y | **[부재료]** | 관찰됨 `subKg`. |

#### 4.6-c1 `tb_packing_type_kg` — 부위별 투입중량 (child)
**역할**: 현행 `typeKgs{}` 맵(부위별 와건 무게) 정규화. 일별실적 부위 분리(ROADMAP v2)의 핵심.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| packing_id | 내포장ID | BIGINT | PK,FK→tb_packing | N | | 설계 신설. |
| part_code | 부위코드 | VARCHAR(20) | PK,FK→tb_raw_part | N | **[원재료]** | 관찰됨(맵 key). |
| kg | 투입중량(kg) | DECIMAL(10,2) | | N | | 관찰됨(맵 value). |

#### 4.6-c2 `tb_packing_sauce_tank` — 소스탱크 사용 (child)
**역할**: 현행 `sauceTanks[]`/`sauceTank` 정규화.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| id | 일련번호 | BIGINT | PK | N | | 설계 신설. |
| packing_id | 내포장ID | BIGINT | FK→tb_packing | N | | 관찰됨. |
| tank | 소스탱크 | VARCHAR(20) | FK→tb_equipment | N | **[설비]** | 관찰됨 `sauceTanks[].tank`. |

> **이관 주의(도메인 룰)**: 제품명 변경 시 현행은 `packing`+`outerpacking` 두 컬렉션을 모두 PATCH해야 매칭(키=date+product)이 유지됨. RDBMS에서는 `product_id` FK로 통일되어 이 문제가 구조적으로 해소됨.

---

### 4.7 `tb_outerpacking` — 외포장
**역할**: 내포장품을 박스 단위로 외포장. 1행 = (작업일+제품) 단위(현행 docId=`date_product`).
**수율 특성**: 파쇄 후 물·양념 흡수로 포장 수율 100% 초과 정상.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| outerpacking_id | 외포장ID | BIGINT | PK | N | | 설계 신설. |
| work_date | 작업일자 | DATE | | N | | 관찰됨 `date`. |
| product_id | 제품ID | BIGINT | FK→tb_product | N | **[완제품]** | 관찰됨 `product`. |
| inner_ea | 내포장EA | INT | | Y | | 관찰됨 `innerEa`. |
| outer_ea | 외포장EA | INT | | Y | | 관찰됨 `outerEa`. |
| outer_boxes | 외박스수 | INT | | Y | | 관찰됨 `outerBoxes`. |
| partial_box_ea | 잔박스EA | INT | | Y | | 관찰됨 `partialBoxEa`. |
| product_defect | 제품불량 | INT | | Y | | 관찰됨 `productDefect`. |
| sample | 시료 | INT | | Y | | 관찰됨 `sample`. |
| remain_ea | 잔량EA | INT | | Y | | 관찰됨 `remainEa`. |
| tray_used | 트레이사용 | INT | | Y | | 관찰됨 `trayUsed`. |
| tray_defect | 트레이불량 | INT | | Y | | 관찰됨 `trayDefect`. |
| defect_rate | 불량률 | DECIMAL(6,3) | | Y | | 관찰됨 `defectRate`. |
| note | 비고 | VARCHAR(200) | | Y | | 관찰됨 `note`. |
| test_run | 테스트여부 | BOOLEAN | | Y | | 관찰됨 `testRun`(집계 제외). |
| saved_at | 저장일시 | DATETIME | | Y | | 관찰됨 `savedAt`. |

#### 4.7-c `tb_outerpacking_material` — 외포장 자재 실적 (child)
**역할**: 현행 `materials[]` 정규화(자재별 이론/불량/실투입).

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| id | 일련번호 | BIGINT | PK | N | | 설계 신설. |
| outerpacking_id | 외포장ID | BIGINT | FK→tb_outerpacking | N | | 관찰됨. |
| material_name | 자재명 | VARCHAR(50) | | N | **[부재료]** | 관찰됨 `name`. |
| theory_qty | 이론수량 | DECIMAL(12,2) | | Y | | 관찰됨 `theory`. |
| defect_qty | 불량수량 | INT | | Y | | 관찰됨 `defect`. |
| actual_qty | 실투입수량 | DECIMAL(12,2) | | Y | | 관찰됨 `actual`. |
| pkg_type | 포장유형 | VARCHAR(20) | | Y | | 관찰됨 `pkgType`. |

---

### 4.8 `tb_retort` — 레토르트(가압살균)
**역할**: 완제품 레토르트 살균. 1행 = 호기별 1회차.
**도메인 룰**: 3대 운영, 회차당 최대 4대차/150분.

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| retort_id | 레토르트ID | BIGINT | PK | N | | 설계 신설. |
| src_doc_id | 원본문서ID | VARCHAR(40) | | Y | | 현행 `id`/`fbId`. |
| work_date | 작업일자 | DATE | | N | | 관찰됨 `date`. |
| machine | 호기 | VARCHAR(20) | FK→tb_equipment | N | **[설비]** | 관찰됨 `machine`(1~3호기). |
| round | 회차 | INT | | N | | 관찰됨 `round`. |
| product_id | 제품ID | BIGINT | FK→tb_product | N | **[완제품]** | 관찰됨 `product`. |
| ccp | CCP기준 | VARCHAR(50) | | Y | | 관찰됨 `ccp`(제품 기본값). |
| batch | 배치(대차:수량) | VARCHAR(100) | | Y | | 관찰됨 `batch`(자유 문자열) → 필요시 child 분리. |
| ea | 총EA | INT | | Y | | 관찰됨 `ea`. |
| t1 | 투입시각 | TIME | | Y | | 관찰됨 `t1`. |
| t2 | 단계2시각 | TIME | | Y | | 관찰됨 `t2`. |
| t3 | 단계3시각 | TIME | | Y | | 관찰됨 `t3`. |
| t4 | 종료시각 | TIME | | Y | | 관찰됨 `t4`(미입력=진행중). |
| temp | 온도 | DECIMAL(5,1) | | Y | | 관찰됨 `temp`. |

---

### 4.9 `tb_attendance` / `tb_attendance_detail` — 출퇴근
**역할**: 일자별 직원 근태. 현행 `attendance` 문서(docId=date) 내 `records{직원명:{tags,inTime,outTime}}` 맵 → 헤더/디테일 정규화.

#### 4.9-a `tb_attendance` (헤더)

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| att_date | 근태일자 | DATE | PK | N | | 관찰됨 `date`. |
| factory_code | 공장코드 | VARCHAR(10) | FK→tb_factory | Y | **[공장코드]** | 설계 신설. |
| updated_at | 수정일시 | DATETIME | | Y | | 관찰됨. |

> 현행 `summary{totalWorkers, totalAbsent, ...}`는 집계값이므로 RDBMS에서는 디테일 GROUP BY로 산출(저장 불필요). 필요 시 VIEW로 제공.

#### 4.9-b `tb_attendance_detail` (디테일)

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| att_date | 근태일자 | DATE | PK,FK→tb_attendance | N | | 관찰됨. |
| employee_id | 직원ID | BIGINT | PK,FK→tb_employee | N | **[사용자/권한]** | 관찰됨(현행 키=직원명). |
| in_time | 출근시각 | TIME | | Y | | 관찰됨 `inTime`. |
| out_time | 퇴근시각 | TIME | | Y | | 관찰됨 `outTime`. |
| tags | 근태태그 | VARCHAR(100) | | Y | | 관찰됨 `tags[]`(결근/연차/휴무/조출/연장) → 다중이면 `tb_attendance_tag` 분리 권장. |

---

### 4.10 `tb_schedule` / `tb_schedule_item` — 생산 일정
**역할**: 월별 생산계획. 현행 `schedules` 문서(docId=YYYY-MM) 내 `days{date:{items[],note}}` → 정규화.

#### 4.10-a `tb_schedule` (일자 헤더)

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| sched_date | 계획일자 | DATE | PK | N | | 관찰됨(`days` key). |
| note | 비고 | VARCHAR(200) | | Y | | 관찰됨 `note`. |

#### 4.10-b `tb_schedule_item` (품목 라인)

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| id | 일련번호 | BIGINT | PK | N | | 설계 신설. |
| sched_date | 계획일자 | DATE | FK→tb_schedule | N | | 관찰됨. |
| product_id | 제품ID | BIGINT | FK→tb_product | N | **[완제품]** | 관찰됨 `product`. |
| raw_meat_kg | 원육계획(kg) | DECIMAL(10,2) | | Y | | 관찰됨 `rawMeat`. |
| pack_qty | 포장계획(EA) | INT | | Y | | 관찰됨 `packQty`. |

---

### 4.11 `tb_stock_in` / `tb_stock_transfer` — 재고
**역할**: 박스 단위 입고/공장 간 이동. 현행 `stockIn`(2공장)·`stockIn_f1`(1공장)·`transfer`.

#### 4.11-a `tb_stock_in`

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| stock_id | 재고ID | BIGINT | PK | N | | 설계 신설. |
| factory_code | 공장코드 | VARCHAR(10) | FK→tb_factory | N | **[공장코드]** | 관찰됨(컬렉션 분리 `stockIn`/`stockIn_f1` → 컬럼 통합). |
| stock_date | 입고일자 | DATE | | N | | 관찰됨 `date`. |
| part_code | 부위코드 | VARCHAR(20) | FK→tb_raw_part | N | **[원재료]** | 관찰됨 `type`. |
| boxes | 박스수 | INT | | N | | 관찰됨 `boxes`. |
| note | 비고 | VARCHAR(200) | | Y | | 관찰됨 `note`. |

#### 4.11-b `tb_stock_transfer`

| 컬럼명(영문) | 컬럼명(한글) | 데이터 타입 | PK·FK | NULL | 연동 마스터 도메인 | 설명 및 비고 |
|---|---|---|---|---|---|---|
| transfer_id | 이동ID | BIGINT | PK | N | | 설계 신설. |
| transfer_date | 이동일자 | DATE | | N | | 관찰됨 `date`. |
| part_code | 부위코드 | VARCHAR(20) | FK→tb_raw_part | N | **[원재료]** | 관찰됨 `type`. |
| boxes | 박스수 | INT | | N | | 관찰됨 `boxes`. |
| direction | 이동방향 | VARCHAR(20) | | N | **[공장코드]** | 관찰됨 `direction`(공장 간). |
| note | 비고 | VARCHAR(200) | | Y | | 관찰됨 `note`. |

---

## 5. 보조/시스템 테이블 (이관 선택)

이관 시 **운영 메타·캐시·알림** 성격으로, 마스터/트랜잭션과 분리하거나 일부는 RDBMS VIEW로 대체 가능.

| 현행 컬렉션/문서 | 성격 | RDBMS 이관 권고 |
|---|---|---|
| `daily_summary`(docId=date) | 일별 공정 집계 **캐시**(processes[], totalEa) | **VIEW 또는 배치 집계 테이블**. 원천 트랜잭션에서 재계산 가능하므로 진실의 출처 아님. |
| `monthlyMeta`(docId=YYYY-MM) | 월간 메모/메타 | `tb_monthly_memo`로 단순 이관. |
| `_config/version` | 클라이언트 캐시 버전 트리거(`value`) | 웹 배포 매커니즘 전용. **RDBMS 이관 불필요**. |
| `_config/ai_settings`, `_config/manualRm` | AI 설정/수동 보정값 | 운영 파라미터 테이블 또는 제외. |
| `notify_subscribers` | 카카오 알림 구독자(토큰) | `tb_notify_subscriber`. 토큰은 보안 저장. **[사용자/권한]** 일부 연계. |
| `kakao_sent_log` | 알림 발송 이력 | `tb_notify_log`(로그 테이블). |

---

## 6. 전체 관계성 요약 (ERD 텍스트)

**공정 흐름 (1:N 추적 체인)**

```
tb_import_barcode (입고)
      │  N:M (tb_thawing_import 경유)
      ▼
tb_thawing (방혈/해동)
      │  1:N (tb_preprocess_thawing_touch 경유, FIFO 차감)
      ▼
tb_preprocess (전처리) ──1:N──> tb_preprocess_thawing_touch
      ▼ (와건/케이지 흐름)
tb_cooking (자숙) ──1:N──> tb_cooking_wagon_dist
      ▼
tb_shredding (파쇄) ──1:N──> tb_shredding_out_dist
      ▼
tb_packing (내포장) ──1:N──> tb_packing_type_kg, tb_packing_sauce_tank
      ▼ (date + product_id 매칭)
tb_outerpacking (외포장) ──1:N──> tb_outerpacking_material
      ▼ (선택)
tb_retort (레토르트)
```

**마스터 ↔ 트랜잭션 참조 (1:N)**

- `tb_factory` 1:N → (모든 공장 귀속 테이블)
- `tb_employee` 1:N → `tb_attendance_detail`
- `tb_raw_part` 1:N → `tb_gtin_map`, `tb_import_barcode`, `tb_stock_in`, `tb_stock_transfer`, 각 공정의 `part_code`
- `tb_origin` 1:N → `tb_import_barcode`
- `tb_gtin_map` 1:N → `tb_import_barcode`
- `tb_product` 1:N → `tb_packing`, `tb_outerpacking`, `tb_retort`, `tb_recipe`, `tb_schedule_item`
- `tb_sauce` 1:N → `tb_product`, `tb_packing`(소스 사용)
- `tb_submaterial` 1:N → `tb_product`, `tb_recipe`, `tb_outerpacking_material`, `tb_packing`(subName)
- `tb_equipment` 1:N → 자숙탱크/포장설비/레토르트호기/와건/대차 참조 컬럼 전반

**1:1 / 헤더-디테일**

- `tb_attendance` 1:N `tb_attendance_detail` (일자 헤더 ↔ 직원 라인)
- `tb_schedule` 1:N `tb_schedule_item` (일자 헤더 ↔ 품목 라인)
- `tb_recipe`: `tb_product` 1:N (제품 ↔ 내/외포장 자재 라인)

---

## 7. 이관 시 핵심 검토 사항 (도메인 룰 보존)

1. **박스 수 진실**: 입고/방혈 박스 수는 `importCodes` 배열 길이(= `tb_thawing_import` 행 수)로 산정. 수동 `boxes` 컬럼과 불일치 시 매핑 테이블 우선.
2. **방혈 date 규칙**: 작업일자 = 시작일 + 1일 = 박스 출고일. 이관 시 동일 규칙 유지 또는 시작/종료 분리 후 파생.
3. **수율 정의**: 원육 기준 **누적 수율**(원육 대비), 공정 체인곱 아님. 포장 수율 100% 초과는 정상(물·양념 흡수).
4. **불량률**: `defect/(ea+defect)`, 분모는 파우치 기준.
5. **작업인원 카운트**: `tb_employee.role <> 'production'` 자동 제외(QC/관리직).
6. **testRun 제외**: `tb_outerpacking.test_run = true` 및 전파된 packing 레코드는 실적 집계 제외.
7. **무육(noMeat) 제품**: 원육수율 컬럼 NULL 처리.
8. **마스터 코드화**: 현행 자유 문자열(part/product/origin/sauce/equipment)을 마스터 코드(PK)로 치환하는 매핑 작업이 이관 1순위. 신·구 명칭 매핑 테이블 별도 관리 권장.

---

*본 명세서는 현행 앱 코드(`js/*.js`)에서 실제 저장되는 필드를 직접 추출하여 작성되었습니다. "관찰됨"은 코드에 존재하는 사실, "설계"는 정규화를 위한 신설 제안입니다. ERP 품목/거래처/사업장 코드와의 실제 매핑값은 사내 ERP 명세 입수 후 확정해야 합니다.*
