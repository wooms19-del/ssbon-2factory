-- 웹 제품명 ↔ ERP 완제품코드 매핑 (현장앱 호환 다리)
CREATE TABLE external_key_map (
  map_id      INT PRIMARY KEY AUTO_INCREMENT,
  web_name    VARCHAR(60) NOT NULL,        -- 현행 웹 제품명
  erp_code    VARCHAR(20) NOT NULL,        -- ERP 완제품코드 (item_master.item_code FK)
  CONSTRAINT fk_ekm_item FOREIGN KEY (erp_code) REFERENCES item_master(item_code),
  CONSTRAINT uk_ekm UNIQUE (web_name, erp_code)
);

INSERT INTO external_key_map (web_name, erp_code) VALUES
  ('코스트코 장조림 170g','600006'),
  ('코스트코 장조림 170g','600007'),
  ('코스트코 장조림 170g','600020'),
  ('시그니처 장조림 130g','600010'),
  ('시그니처 장조림 130g','600021'),
  ('시그니처 장조림 130g','600028'),
  ('미니쇠고기장조림 70g 낱개','600003'),
  ('미니쇠고기장조림 70g 낱개','600019'),
  ('미니쇠고기장조림 70g 5입','600001'),
  ('미니쇠고기장조림 70g 5입','600018'),
  ('시그니처 장조림 120g','600013'),
  ('시그니처 장조림 120g','600022'),
  ('시그니처 장조림 130g 마트용','600014'),
  ('시그니처 장조림 130g 마트용','600023'),
  ('FC 장조림 3KG','600017'),
  ('FC 장조림 3KG','600025'),
  ('트레이더스 장조림 460g','600015'),
  ('트레이더스 장조림 460g','600024'),
  ('트레이더스 장조림 460g','600026'),
  ('메추리알 장조림 180g','600027'),
  ('미니쇠고기 장조림 70g 리뉴얼','600029'),
  ('미니쇠고기 장조림 70g 맥스용','600030');