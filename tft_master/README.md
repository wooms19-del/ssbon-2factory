# 2공장 품목 마스터 + BOM (TFT 통합 DB 이관용)

ERP BOMList를 파싱해 TFT 통합 마스터 구조로 정리한 산출물.
모든 품목·레시피는 ERP 코드 기준. TFT 서버 구축 시 그대로 이관.

## 파일
- `bomlist_원본.tsv` — ERP BOMList 원본 (파싱 입력)
- `item_master.json` — 품목 마스터 107종 (Firestore item_master 반영본)
- `recipes_v2.json` — 레시피 51종 (반제품27/완제품22/소스2, Firestore item_recipe 반영본)
- `schema_품목마스터_BOM.sql` — RDBMS 스키마 (item_category/item_master/bom, FK·UK 포함)
- `검토용_품목마스터_BOM.xlsx` — SQL 검토용 (3시트)
- `검토용_레시피_ERP코드.xlsx` — 레시피 검토용 (반제품/완제품/소스)

## 구조 (B방식: 반제품/완제품 분리)
- 반제품(300/310/320) = 내포장: 파쇄육 + 소스 + 파우치 + 특수재료
- 완제품(600) = 외포장: 반제품 N개 + 포장재
- 소스(200009 FC / 200011 FP) = 배합 원료

## 품목 구분 (107종)
완제품 22 · 반제품 27 · 소스 2 · 공정중간 9 · 원육 3 · 원료부자재 22 · 파우치 11 · 포장재 11

## Firestore 반영 (현행 웹, ssbon-factory)
- `item_master` 컬렉션: 107종 (문서ID = ERP 코드)
- `item_recipe` 컬렉션: 51종 (문서ID = ERP 코드)

## 주의
- 파우치 500006(FC)·500012(메추리알)은 ERP상 5번대로 등록됨(4번대가 정상 대역).
  ERP 원본과 일치 위해 코드는 그대로 유지, 분류만 '파우치'로 보정.
- SQL의 item_id는 AUTO_INCREMENT. 현재 실질 키는 item_code(ERP).
  TFT 서버에서 item_id 확정 시 Firestore도 동일 item_id 부여해 정합.
- 공정중간(해동/자숙/파쇄)은 레시피에서 파쇄육까지만 펼침(웹이 파쇄 공정 관리).
