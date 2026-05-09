// ============================================================
// timetable.js — 공정 타임테이블 (데이터 기반 의사결정 도구)
// 본질: 사용자 입력 → DB 데이터로 시뮬레이션 → 보고용 분석 결과
// 다중 디바이스 동기: 모든 입력값은 휘발성, 캐시 v= 항상 증가
// ============================================================

const TT_PIN = '1234';

// 자숙·레토르트는 고정값 (DB 없음 / 사용자 명시값)
const TT_FIXED = {
  cookHours: 4,        // 자숙 사이클 (시간)
  wagonMin: 30,        // 와건 시간 (분)
  tankKg: 750,         // 탱크당 자숙량 (kg)
  retortCycleMin: 150, // 레토르트 사이클 (2.5h)
  retortPerCycle: 384, // 1회차 처리량 (96 × 4대차)
};

// 자숙 수율은 원육별 고정값 (DB 산출량 필드 없음)
const TT_COOK_YIELD = {
  '홍두깨': 56.8,
  '우둔':   55.0,
  '설도':   58.0,
};

// 내포장 수율 (모든 원육 공통)
const TT_PACK_YIELD = 99.8;
const TT_PACK_KG_PER_POUCH = 1.35;

// 자동 분석 결과 (UI에 표시할 자동값 + n)
let TT_AUTO = {
  yPre: { val: 89.3, n: 0 },
  yCrush: { val: 96.1, n: 0 },
  pPre: { val: 48.2, n: 0 },
  pCrush: { val: 17.2, n: 0 },
  pPackEa: { val: 8, n: 0 },
};

// ── 진입 시 자동 초기화 ──────────────────────────────────
function ttInit() {
  ttAutoAnalyze().then(ttRender);
}

// 페이지 진입 시 (탭 활성화 등에서 호출)
if (typeof window !== 'undefined') {
  window.ttInit = ttInit;
}

// ── 시간 유틸 ────────────────────────────────────────────
function ttFmt(m) {
  const h = Math.floor(m / 60) % 24, n = Math.round(m % 60);
  return `${String(h).padStart(2,'0')}:${String(n).padStart(2,'0')}`;
}
function ttDur(m) {
  const h = Math.floor(m / 60), n = Math.round(m % 60);
  return h ? (n ? `${h}시간 ${n}분` : `${h}시간`) : `${n}분`;
}
function ttToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ── 입력값 수집 ──────────────────────────────────────────
function ttGetInputs() {
  const get = (id, def) => {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(el.value);
    return isFinite(v) ? v : def;
  };
  const getStr = (id, def) => document.getElementById(id)?.value || def;
  return {
    meatType: getStr('tt-meat', '홍두깨'),
    meatKg: get('tt-kg', 1600),
    startTime: getStr('tt-start', '05:00'),       // 조출 시각 (외국인 출근)
    earlyWorkers: get('tt-early', 7),              // 조출 인원 (외국인)
    mgrTime: getStr('tt-mgr-time', '07:00'),       // 관리자 출근 시각
    mgrWorkers: get('tt-mgr', 2),                  // 관리자 인원
    joinTime: getStr('tt-join', '09:00'),          // 한국인 합류 시각
    totalWorkers: get('tt-total', 28),
    wkPre: get('tt-wk-pre', 10),
    wkCrush: get('tt-wk-crush', 14),
    wkPackPeak: get('tt-wk-crush-peak', 18),
    wkPack: get('tt-wk-pack', 6),
    wkTrans: get('tt-wk-trans', 2),
    yPre: get('tt-y-pre', TT_AUTO.yPre.val),
    yCrush: get('tt-y-crush', TT_AUTO.yCrush.val),
    pPre: get('tt-p-pre', TT_AUTO.pPre.val),
    pCrush: get('tt-p-crush', TT_AUTO.pCrush.val),
    pPackEa: get('tt-p-pack', TT_AUTO.pPackEa.val),
  };
}

// ── 누적 데이터 자동 분석 ────────────────────────────────
async function ttAutoAnalyze() {
  const period = document.getElementById('tt-period')?.value || 'all';
  const meatType = document.getElementById('tt-meat')?.value || '홍두깨';
  const today = new Date();
  const fmt = d => d.toISOString().slice(0,10);
  let fromDate = '2020-01-01', toDate = fmt(today);
  if (period === 'today') fromDate = fmt(today);
  else if (period === 'week') {
    const d = new Date(today); d.setDate(d.getDate() - 7);
    fromDate = fmt(d);
  }
  else if (period === 'month') {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    fromDate = fmt(d);
  }
  else if (period === 'last30') {
    const d = new Date(today); d.setDate(d.getDate() - 30);
    fromDate = fmt(d);
  }

  try {
    const [preDocs, crushDocs, packDocs] = await Promise.all([
      db.collection('preprocess').get(),
      db.collection('shredding').get(),
      db.collection('packing').get(),
    ]);
    const inRange = d => d >= fromDate && d <= toDate;
    const minutesBetween = (s, e) => {
      if (!s || !e) return 0;
      const [sh, sm] = String(s).split(':').map(Number);
      const [eh, em] = String(e).split(':').map(Number);
      let diff = (eh*60+em) - (sh*60+sm);
      return diff < 0 ? diff + 1440 : diff;
    };

    // 전처리
    let preInY=0, preOutY=0, preInP=0, prePH=0, preN=0;
    preDocs.forEach(d => {
      const r = d.data();
      if (!inRange(r.date) || r.type !== meatType) return;
      const kg = +r.kg||0, w = +r.waste||0, wk = +r.workers||0;
      const m = minutesBetween(r.start, r.end);
      if (kg <= 0 || wk <= 0 || m <= 0) return;
      // 수율: 비가식부 입력된 레코드만
      if (w > 0) { preInY += kg; preOutY += (kg - w); }
      // 생산성: 모든 레코드
      preInP += kg;
      prePH += wk * (m/60);
      preN++;
    });

    // 파쇄 (type 필드 없음)
    let crInY=0, crOutY=0, crInP=0, crPH=0, crN=0;
    crushDocs.forEach(d => {
      const r = d.data();
      if (!inRange(r.date)) return;
      const kg = +r.kg||0, w = +r.waste||0, wk = +r.workers||0;
      const m = minutesBetween(r.start, r.end);
      if (kg <= 0 || wk <= 0 || m <= 0) return;
      if (w > 0) { crInY += kg; crOutY += (kg - w); }
      crInP += kg;
      crPH += wk * (m/60);
      crN++;
    });

    // 내포장 (FC 3kg)
    let pkEa=0, pkMin=0, pkN=0;
    packDocs.forEach(d => {
      const r = d.data();
      if (!inRange(r.date)) return;
      const ea = +r.ea||0, m = minutesBetween(r.start, r.end);
      if (ea <= 0 || m <= 0) return;
      const prod = (r.product||'').toString();
      if (meatType === '홍두깨' && !prod.match(/FC|3kg|3KG/)) return;
      pkEa += ea; pkMin += m; pkN++;
    });

    if (preInY > 0) TT_AUTO.yPre = { val: +(preOutY/preInY*100).toFixed(1), n: preN };
    else TT_AUTO.yPre = { ...TT_AUTO.yPre, n: preN };
    if (crInY > 0) TT_AUTO.yCrush = { val: +(crOutY/crInY*100).toFixed(1), n: crN };
    else TT_AUTO.yCrush = { ...TT_AUTO.yCrush, n: crN };
    if (prePH > 0) TT_AUTO.pPre = { val: +(preInP/prePH).toFixed(1), n: preN };
    if (crPH > 0) TT_AUTO.pCrush = { val: +(crInP/crPH).toFixed(1), n: crN };
    if (pkMin > 0) TT_AUTO.pPackEa = { val: +(pkEa/pkMin).toFixed(1), n: pkN };

    ttFillAutoValues();
  } catch (e) {
    console.error('[TT] 자동 분석 실패:', e);
  }
}

function ttFillAutoValues() {
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.dataset.userEdited || el.dataset.userEdited === 'false') el.value = v;
  };
  setVal('tt-y-pre', TT_AUTO.yPre.val);
  setVal('tt-y-crush', TT_AUTO.yCrush.val);
  setVal('tt-p-pre', TT_AUTO.pPre.val);
  setVal('tt-p-crush', TT_AUTO.pCrush.val);
  setVal('tt-p-pack', TT_AUTO.pPackEa.val);
  // 자동값 라벨 갱신
  const lab = (id, info) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = info.n > 0 ? `자동: ${info.val} (n=${info.n})` : `자동: ${info.val} · 데이터 없음`;
  };
  lab('tt-y-pre-auto', TT_AUTO.yPre);
  lab('tt-y-crush-auto', TT_AUTO.yCrush);
  lab('tt-p-pre-auto', TT_AUTO.pPre);
  lab('tt-p-crush-auto', TT_AUTO.pCrush);
  lab('tt-p-pack-auto', TT_AUTO.pPackEa);
}

function ttMarkEdited(el) {
  el.dataset.userEdited = 'true';
  ttRender();
}

function ttResetField(id, autoKey) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = TT_AUTO[autoKey].val;
  el.dataset.userEdited = 'false';
  ttRender();
}

// 분석 기간 / 원육 종류 변경 시 → 자동 분석 재실행
async function ttPeriodChange() {
  // 사용자 수정한 입력 초기화
  ['tt-y-pre','tt-y-crush','tt-p-pre','tt-p-crush','tt-p-pack'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.dataset.userEdited = 'false';
  });
  await ttAutoAnalyze();
  ttRender();
}

// ── 시뮬레이션 엔진 ──────────────────────────────────────
function ttSimulate(inp) {
  const startMin = ttToMin(inp.startTime);
  const joinMin = ttToMin(inp.joinTime);
  const cookYield = TT_COOK_YIELD[inp.meatType] || 56.8;

  const preIn = inp.meatKg;
  const preOut = preIn * inp.yPre / 100;
  const cookIn = preOut;
  const cookOut = cookIn * cookYield / 100;
  const crushIn = cookOut;
  const crushOut = crushIn * inp.yCrush / 100;
  const packIn = crushOut;
  const packOut = packIn * TT_PACK_YIELD / 100;
  const pouches = Math.floor(packOut / TT_PACK_KG_PER_POUCH);

  // 전처리 시간: 조출(early) → 합류(join) 후 풀(wkPre) 단계
  // Phase 1: 조출 인원으로 startMin~joinMin 시간 동안 처리
  const phase1Min = Math.max(0, joinMin - startMin);
  const phase1Kg = inp.pPre * inp.earlyWorkers * (phase1Min / 60);
  // Phase 2: 풀 인원으로 나머지 처리
  const remainingKg = Math.max(0, preIn - phase1Kg);
  const phase2Min = remainingKg / (inp.pPre * inp.wkPre) * 60;
  const preEndMin = joinMin + Math.round(phase2Min);
  const preHours = (preEndMin - startMin) / 60;

  // 자숙 탱크 수 = 전처리 산출량 기준 (자숙에 실제 들어가는 양)
  // ※ 원육 투입량(preIn) 아니라 전처리 산출(preOut/cookIn) 기준이 맞음
  const cookCycles = Math.max(1, Math.ceil(cookIn / TT_FIXED.tankKg));
  const tankInTimes = [];
  for (let i = 0; i < cookCycles; i++) {
    // i+1번째 탱크 투입 = 전처리 누적 산출이 (i+1)*tankKg 도달 시점
    // 전처리 산출 누적 = 전처리 투입 누적 × 수율
    const targetOutKg = (i + 1) * TT_FIXED.tankKg;  // 누적 산출 목표
    const targetInKg = targetOutKg / (inp.yPre / 100);  // 그때까지 전처리 투입해야 하는 양
    let tankInMin;
    if (targetInKg <= phase1Kg) {
      tankInMin = startMin + Math.round(targetInKg / (inp.pPre * inp.earlyWorkers) * 60);
    } else {
      const extraKg = targetInKg - phase1Kg;
      tankInMin = joinMin + Math.round(extraKg / (inp.pPre * inp.wkPre) * 60);
    }
    if (i === cookCycles - 1 && tankInMin > preEndMin) tankInMin = preEndMin;
    tankInTimes.push(tankInMin);
  }
  const tankOutTimes = tankInTimes.map(t => t + TT_FIXED.cookHours * 60);
  const wagonEndTimes = tankOutTimes.map(t => t + TT_FIXED.wagonMin);

  // 파쇄: 자숙 1호 와건 종료부터 시작
  // 종료는 두 조건 중 늦은 쪽:
  //  (1) 파쇄 자체 처리 완료 = crushStart + (총kg / 속도 / 인원)
  //  (2) 자숙 마지막 와건 종료 + 잔량 처리 시간 (마지막 탱크 출하 후 그 분량 파쇄)
  const crushStartMin = wagonEndTimes[0];
  const lastWagonEnd = wagonEndTimes[wagonEndTimes.length - 1];
  const crushSpeedKgPerMin = inp.pCrush * inp.wkPackPeak / 60;  // kg/분
  const crushSelfMin = crushIn / crushSpeedKgPerMin;
  const crushSelfEndMin = crushStartMin + Math.round(crushSelfMin);
  // 마지막 탱크 산출 = tankKg × cookYield (kg)
  const lastTankOutKg = TT_FIXED.tankKg * (cookYield / 100);
  const lastTankCrushMin = lastTankOutKg / crushSpeedKgPerMin;
  const crushAfterLastWagonEndMin = lastWagonEnd + Math.round(lastTankCrushMin);
  const crushEndMin = Math.max(crushSelfEndMin, crushAfterLastWagonEndMin);
  const crushHours = (crushEndMin - crushStartMin) / 60;

  // 내포장: 파쇄 시작 1시간 후 시작 (대차 1개 누적 후 안정 가동)
  // 종료 = 파쇄 종료 시점에서 마지막 파쇄 산출분이 내포장 라인 통과하는 시간 추가
  //
  // 정확한 계산:
  //  - 파쇄에서 마지막에 나오는 산출 = 마지막 자숙 탱크 분량 × 파쇄 수율
  //  - 그 마지막 산출량이 내포장 라인 통과하는 시간 = 마지막 산출 EA / 내포장 속도
  //  - 내포장 종료 = max(자체 처리 종료, 파쇄 종료 + 마지막 산출분 처리 시간)
  const packStartMin = crushStartMin + 60;
  const packSelfMin = pouches / inp.pPackEa;
  const packSelfEndMin = packStartMin + Math.round(packSelfMin);

  // 마지막 파쇄 산출분 (= 마지막 자숙 탱크 산출 × 파쇄 수율)
  const lastTankPackEa = Math.round(lastTankOutKg * (inp.yCrush / 100) / TT_PACK_KG_PER_POUCH);
  // 그 분량이 내포장 라인 통과하는 시간
  const lastBatchPackMin = Math.round(lastTankPackEa / inp.pPackEa);
  // 파쇄 종료 + 마지막 분량 통과 시간
  const packAfterCrushEndMin = crushEndMin + lastBatchPackMin;

  // 둘 중 늦은 쪽
  const packEndMin = Math.max(packSelfEndMin, packAfterCrushEndMin);
  const packMin = packEndMin - packStartMin;

  // 레토르트: 3대 병렬 가능 + 대차 8개 한도
  //  - 설비 3대: 동시 최대 3개 회차 진행 가능
  //  - 대차 8개: 회차당 4대차 사용 시 동시 최대 2회차만 가능 (4+4=8)
  //  - 회차 끝나야 그 회차 대차 4개 회수 → 재투입 가능
  //  - 사이클 2.5h, 회차당 384EA(4대차)
  //  - 마지막 회차 = 내포장 종료 후 (마지막 EA 나와야)
  const retortCycles = Math.ceil(pouches / TT_FIXED.retortPerCycle);
  const eaPerMin = inp.pPackEa;
  const NUM_RETORTS = 3;       // 설비 3대
  const TOTAL_CARTS = 8;       // 대차 총 8개
  const CARTS_PER_BATCH = 4;   // 회차당 4대차
  const retortStartTimes = [];
  const retortEndTimes = [];
  // 각 설비가 비는 시각 (3대)
  const retortFreeAt = [0, 0, 0];
  // 대차 회수 일정: [(회차종료시각, 회수대차수), ...]
  const cartReturns = [];

  for (let i = 0; i < retortCycles; i++) {
    const isLast = i === retortCycles - 1;
    const cumEa = isLast ? pouches : (i + 1) * TT_FIXED.retortPerCycle;
    // 누적 도달 시점
    let accumulateMin = packStartMin + Math.round(cumEa / eaPerMin);
    if (isLast) accumulateMin = Math.max(accumulateMin, packEndMin);
    else if (accumulateMin > packEndMin) accumulateMin = packEndMin;

    // 가용 설비 (가장 빨리 비는 설비)
    const earliestRetort = retortFreeAt.indexOf(Math.min(...retortFreeAt));
    const retortAvailMin = retortFreeAt[earliestRetort];

    // 대차 가용 여부 — 시각 t에 사용 가능한 대차 수
    const cartsAvailableAt = (t) => {
      let inUse = 0;
      // t 시각에 진행 중인 회차 = 시작 ≤ t < 종료
      for (let k = 0; k < retortStartTimes.length; k++) {
        if (retortStartTimes[k] <= t && t < retortEndTimes[k]) {
          inUse += CARTS_PER_BATCH;
        }
      }
      return TOTAL_CARTS - inUse;
    };
    // 이 회차가 시작될 수 있는 가장 빠른 시점 = 대차 4개 가용 + 설비 가용 + EA 누적
    let candidateStart = Math.max(retortAvailMin, accumulateMin);
    // 대차 부족하면 → 가장 빨리 대차가 회수되는 시점까지 기다림
    while (cartsAvailableAt(candidateStart) < CARTS_PER_BATCH) {
      // 진행중인 회차 중 가장 빨리 끝나는 시각으로 점프
      const ongoing = retortEndTimes.filter((e, k) => retortStartTimes[k] <= candidateStart && candidateStart < e);
      if (ongoing.length === 0) break;
      candidateStart = Math.min(...ongoing);
    }

    const start = candidateStart;
    const end = start + TT_FIXED.retortCycleMin;
    retortStartTimes.push(start);
    retortEndTimes.push(end);
    retortFreeAt[earliestRetort] = end;
  }
  const retortStartMin = retortStartTimes[0];
  const retortEndMin = Math.max(...retortEndTimes);

  return {
    preIn, preOut, cookIn, cookOut, crushIn, crushOut, packIn, packOut, pouches,
    preHours, crushHours, packMin,
    startMin, preEndMin, joinMin,
    phase1Min, phase1Kg,
    tankInTimes, tankOutTimes, wagonEndTimes,
    crushStartMin, crushEndMin,
    packStartMin, packEndMin,
    retortStartMin, retortEndMin, retortCycles,
    retortStartTimes, retortEndTimes,
    cookYield,
  };
}

// ── 인원 운용 슬롯 자동 ─────────────────────────────────
function ttPlanSlots(inp, sim) {
  const total = inp.totalWorkers;
  const mgr = inp.mgrWorkers;
  const early = inp.earlyWorkers;
  const slots = [];

  // 슬롯 1: 조출~관리자 출근
  const mgrTime = ttToMin(inp.mgrTime);
  if (mgrTime > sim.startMin) {
    slots.push({
      range: `${ttFmt(sim.startMin)}~${inp.mgrTime}`,
      cells: { 전처리: early },
      sum: early,
    });
  }
  // 슬롯 2: 관리자 출근~한국인 합류
  if (sim.joinMin > mgrTime) {
    slots.push({
      range: `${inp.mgrTime}~${inp.joinTime}`,
      cells: { 전처리: early, 관리: mgr },
      sum: early + mgr,
    });
  }
  // 슬롯 3: 한국인 합류~점심 1차 (풀가동)
  // 한국인 합류 후 = total - early - mgr 명이 추가
  const koreanArrived = total - early - mgr;
  // 전처리 인원은 wkPre로 (외국인 일부 + 한국인 일부)
  // 나머지(외포장·세팅) = total - wkPre - mgr
  const remainPeak1 = total - inp.wkPre - mgr;
  slots.push({
    range: `${inp.joinTime}~11:30`,
    cells: { 전처리: inp.wkPre, 외포장: Math.max(0, remainPeak1 - 3), 세팅: 3, 관리: mgr },
    sum: total,
  });
  // 슬롯 4: 점심 1차 (11:30~12:30)
  slots.push({
    range: `11:30~12:30`,
    cells: { 전처리: inp.wkPre, 점심: total - inp.wkPre - 1, 관리: 1 },
    sum: total,
  });
  // 슬롯 5: 점심 2차 (12:30~13:30)
  // ★ 내포장 시작 전에는 이송 인원도 파쇄로 합류
  slots.push({
    range: `12:30~13:30`,
    cells: { 파쇄: inp.wkCrush + inp.wkTrans, 점심: total - inp.wkCrush - inp.wkTrans - 1, 관리: 1 },
    sum: total,
  });
  // 슬롯 6: 풀가동 (13:30~내포장종료)
  const peakRest = total - inp.wkPackPeak - inp.wkPack - inp.wkTrans - mgr;
  slots.push({
    range: `13:30~${ttFmt(sim.packEndMin)}`,
    cells: {
      파쇄: inp.wkPackPeak,
      내포장: inp.wkPack,
      이송: inp.wkTrans,
      ...(peakRest > 0 ? { 외포장: peakRest } : {}),
      관리: mgr,
    },
    sum: total,
  });
  // 슬롯 7: 내포장 종료 후 청소 전환
  const cleanRest = total - inp.wkTrans - mgr;
  slots.push({
    range: `${ttFmt(sim.packEndMin)}~17:30`,
    cells: { 청소: cleanRest, 이송: inp.wkTrans, 관리: mgr },
    sum: total,
  });

  return slots;
}

function ttPlanNarrative(inp, sim, slots) {
  const total = inp.totalWorkers;
  const lines = [];
  lines.push(`<strong>${ttFmt(sim.startMin)} (조출)</strong> · 외국인 ${inp.earlyWorkers}명 전처리 시작`);
  lines.push(`<strong>${inp.mgrTime}</strong> · 관리자 ${inp.mgrWorkers}명 출근 (전처리는 그대로 ${inp.earlyWorkers}명)`);
  lines.push(`<strong>${inp.joinTime}</strong> · 한국인 합류 → 전처리 ${inp.wkPre}명 가동 + 외포장·세팅 병행 (${total}명 풀가동)`);
  lines.push(`<strong>${ttFmt(sim.crushStartMin)}</strong> · 자숙 1호 출하 → <strong style="color:#BA7517">파쇄 ${inp.wkCrush}명 투입 시작</strong>`);
  lines.push(`<strong>11:30~12:30</strong> · 점심 1차 (후공정조)`);
  lines.push(`<strong>12:30~13:30</strong> · 점심 2차 (전처리조) — 파쇄 ${inp.wkCrush + inp.wkTrans}명 가동 (이송 인원도 파쇄 합류)`);
  lines.push(`<strong>13:30~${ttFmt(sim.packEndMin)}</strong> · <strong style="color:#7F77DD">파쇄 ${inp.wkPackPeak}명 + 내포장 ${inp.wkPack}명 + 이송 ${inp.wkTrans}명 풀가동</strong>`);
  lines.push(`<strong>${ttFmt(sim.packEndMin)}~17:30</strong> · 내포장 종료 → 청소 전환`);
  lines.push(`<strong>레토르트</strong> · ${ttFmt(sim.retortStartMin)} 시작 · ${sim.retortCycles}회차 · 최종 ${ttFmt(sim.retortEndMin)}`);
  return lines.join('<br>');
}

// ── 메인 렌더링 ──────────────────────────────────────────
function ttRender() {
  const inp = ttGetInputs();
  if (!inp.meatKg || inp.meatKg <= 0) {
    document.getElementById('tt-result').innerHTML = `
      <div style="background:var(--color-background-secondary);border-radius:12px;padding:30px;text-align:center;color:var(--color-text-secondary);font-size:13px">
        원육량을 입력해주세요
      </div>`;
    return;
  }
  const sim = ttSimulate(inp);
  const slots = ttPlanSlots(inp, sim);
  const narrative = ttPlanNarrative(inp, sim, slots);

  const conclusion = `
    <div style="background:linear-gradient(135deg,#E6F1FB 0%,#f3f9fd 100%);border:1px solid #185FA5;border-radius:12px;padding:18px 22px;margin-bottom:16px">
      <div style="font-size:11px;color:#185FA5;font-weight:600;letter-spacing:0.5px;margin-bottom:6px">📊 데이터 기반 분석 결과</div>
      <div style="font-size:19px;font-weight:600;color:var(--color-text-primary);margin-bottom:6px">
        ${inp.meatType} ${inp.meatKg.toLocaleString()}kg → 약 <span style="color:#0F6E56">${sim.pouches.toLocaleString()}개</span> 생산 ·
        <strong style="color:#185FA5">${ttFmt(sim.packEndMin)} 종료</strong>
      </div>
      <div style="font-size:12px;color:var(--color-text-secondary);line-height:1.6">
        시작 ${inp.startTime} · 총 ${ttDur(sim.packEndMin - sim.startMin)} · 내포장 종료 ${ttFmt(sim.packEndMin)} · 레토르트 최종 ${ttFmt(sim.retortEndMin)} (${sim.retortCycles}회차)
      </div>
    </div>`;

  const planBox = `
    <div style="background:#FFF7ED;border:1px solid #BA7517;border-radius:12px;padding:16px 20px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:600;color:#BA7517;margin-bottom:10px">👥 인원 운용 전략 (총 ${inp.totalWorkers}명)</div>
      <div style="font-size:12px;color:var(--color-text-primary);line-height:1.85">${narrative}</div>
    </div>`;

  // 공정 타임라인 SVG
  const tlMin = sim.startMin;
  const tlMax = Math.max(sim.retortEndMin, sim.packEndMin) + 30;
  const span = tlMax - tlMin;
  const SVG_W = 620, LEFT = 90, RIGHT = 600;
  const xPos = m => LEFT + (m - tlMin) / span * (RIGHT - LEFT);
  let ticks = '', grid = '';
  for (let h = Math.floor(tlMin/60); h <= Math.ceil(tlMax/60); h++) {
    const x = xPos(h*60);
    if (x >= LEFT && x <= RIGHT + 10) {
      ticks += `<text x="${x}" y="20" text-anchor="middle" font-size="10" fill="var(--color-text-secondary)">${String(h%24).padStart(2,'0')}</text>`;
      grid += `<line x1="${x}" y1="28" x2="${x}" y2="380" stroke="#e5e3da" stroke-width="0.5" stroke-dasharray="2 3"/>`;
    }
  }
  const bar = (y, label, s, e, color, txt) => `
    <text x="${LEFT-6}" y="${y+14}" text-anchor="end" font-size="11" fill="var(--color-text-secondary)">${label}</text>
    <rect x="${xPos(s)}" y="${y}" width="${Math.max(xPos(e)-xPos(s),2)}" height="20" rx="4" fill="${color}"/>
    <text x="${(xPos(s)+xPos(e))/2}" y="${y+14}" text-anchor="middle" font-size="9" fill="#fff" font-weight="500">${txt}</text>`;
  let bars = '';
  bars += bar(40, '전처리', sim.startMin, sim.preEndMin, '#185FA5',
    `${ttFmt(sim.startMin)}~${ttFmt(sim.preEndMin)}`);
  sim.tankInTimes.forEach((t, i) => {
    bars += bar(70 + i*26, `자숙 ${i+1}호`, t, sim.tankOutTimes[i], '#0F6E56',
      `${ttFmt(t)}~${ttFmt(sim.tankOutTimes[i])}`);
  });
  const wagonY = 70 + sim.tankInTimes.length*26;
  sim.tankOutTimes.forEach((t) => {
    const x1 = xPos(t), x2 = xPos(t + TT_FIXED.wagonMin);
    bars += `<rect x="${x1}" y="${wagonY}" width="${Math.max(x2-x1,2)}" height="20" rx="3" fill="#D85A30"/>`;
  });
  bars += `<text x="${LEFT-6}" y="${wagonY+14}" text-anchor="end" font-size="11" fill="var(--color-text-secondary)">와건</text>`;
  bars += bar(wagonY + 28, '파쇄', sim.crushStartMin, sim.crushEndMin, '#BA7517',
    `${inp.wkPackPeak}명 · ${ttFmt(sim.crushStartMin)}~${ttFmt(sim.crushEndMin)}`);
  bars += bar(wagonY + 56, '내포장', sim.packStartMin, sim.packEndMin, '#7F77DD',
    `${inp.pPackEa}EA/분 · ${ttFmt(sim.packStartMin)}~${ttFmt(sim.packEndMin)}`);
  for (let i = 0; i < sim.retortCycles; i++) {
    const s = sim.retortStartTimes[i];
    const e = sim.retortEndTimes[i];
    bars += bar(wagonY + 84 + i*26, `레토르트 ${i+1}`, s, e, '#A32D2D',
      `${ttFmt(s)}~${ttFmt(e)}`);
  }
  const lineBottom = wagonY + 84 + sim.retortCycles*26;
  bars += `
    <line x1="${xPos(sim.packEndMin)}" y1="36" x2="${xPos(sim.packEndMin)}" y2="${lineBottom - 4}" stroke="#7F77DD" stroke-width="1" stroke-dasharray="4 3"/>
    <text x="${xPos(sim.packEndMin)}" y="${lineBottom + 12}" text-anchor="middle" font-size="10" fill="#7F77DD" font-weight="600">${ttFmt(sim.packEndMin)} 내포장</text>`;
  const svgH = lineBottom + 22;

  const timelineSvg = `
    <svg width="100%" viewBox="0 0 ${SVG_W} ${svgH}" role="img">
      ${ticks}${grid}${bars}
    </svg>`;

  // 시간대별 인원 활용 표
  const wkHeads = ['전처리','파쇄','내포장','이송','외포장','세팅','청소','점심','관리'];
  const wkColors = ['#185FA5','#BA7517','#7F77DD','#534AB7','#1D9E75','#EF9F27','#888780','var(--color-text-secondary)','#5F5E5A'];
  const slotsRows = slots.map(slot => ({
    range: slot.range,
    cells: wkHeads.map(h => slot.cells[h] || 0),
    sum: slot.sum,
    isFull: slot.sum === inp.totalWorkers,
  }));
  const wkTbl = `
    <table style="width:100%;height:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
      <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary)">
        <th style="text-align:left;padding:10px 6px;font-weight:500;font-size:11px">시간대</th>
        ${wkHeads.map((h,i) => `<th style="text-align:right;padding:10px 5px;font-weight:500;color:${wkColors[i]};font-size:11px">${h}</th>`).join('')}
        <th style="text-align:right;padding:10px 6px;font-weight:500;font-size:11px">합계</th>
      </tr></thead>
      <tbody>${slotsRows.map(r => {
        const bg = r.isFull ? 'rgba(232,243,222,0.4)' : '';
        return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary);background:${bg}">
          <td style="padding:14px 6px;font-weight:500;font-size:11px">${r.range}</td>
          ${r.cells.map(v => `<td style="padding:14px 5px;text-align:right;${v===0?'color:var(--color-text-tertiary)':'font-weight:500'}">${v||'·'}</td>`).join('')}
          <td style="padding:14px 6px;text-align:right;font-weight:600;color:${r.isFull?'#0F6E56':'var(--color-text-tertiary)'}">${r.sum}${r.isFull?' ✓':''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

  // 좌(타임라인) + 우(인원활용)
  const splitView = `
    <style>
      @media (max-width: 900px) { #tt-split { grid-template-columns: 1fr !important; } }
    </style>
    <div id="tt-split" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;align-items:stretch">
      <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px;min-width:0;display:flex;flex-direction:column">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">📋 공정 타임라인</div>
        <div style="overflow-x:auto;flex:1">${timelineSvg}</div>
      </div>
      <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px;min-width:0;display:flex;flex-direction:column">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">👥 시간대별 인원 활용</div>
        <div style="font-size:10px;color:var(--color-text-tertiary);margin-bottom:8px">정원 ${inp.totalWorkers}명 · 합계 일치 ✓</div>
        <div style="overflow-x:auto;flex:1;display:flex;flex-direction:column">${wkTbl}</div>
      </div>
    </div>`;

  // 공정별 현황 표 (수율·생산성 직접 수정 가능)
  const editYield = (id, val, autoVal, n) => `
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
      <input type="number" step="0.1" value="${val}" 
        oninput="document.getElementById('${id}').value=this.value;document.getElementById('${id}').dataset.userEdited='true';ttRender()"
        style="width:70px;height:26px;font-size:12px;text-align:right;padding:0 6px;border:0.5px solid var(--color-border-secondary);border-radius:4px;background:#fff">
      <div style="font-size:9px;color:var(--color-text-tertiary)">자동: ${autoVal}${n!==undefined?` (n=${n})`:''}</div>
    </div>`;
  const editProd = (id, val, unit, autoVal, n) => `
    <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px">
      <div style="display:flex;align-items:center;gap:4px">
        <input type="number" step="0.1" value="${val}"
          oninput="document.getElementById('${id}').value=this.value;document.getElementById('${id}').dataset.userEdited='true';ttRender()"
          style="width:60px;height:26px;font-size:12px;text-align:right;padding:0 6px;border:0.5px solid var(--color-border-secondary);border-radius:4px;background:#fff">
        <span style="font-size:10px;color:var(--color-text-secondary)">${unit}</span>
      </div>
      <div style="font-size:9px;color:var(--color-text-tertiary)">자동: ${autoVal}${n!==undefined?` (n=${n})`:''}</div>
    </div>`;

  const procRows = [
    {
      p:'전처리',
      i:Math.round(sim.preIn), o:Math.round(sim.preOut),
      yEdit: editYield('tt-y-pre', inp.yPre, TT_AUTO.yPre.val, TT_AUTO.yPre.n),
      prodEdit: editProd('tt-p-pre', inp.pPre, 'kg/인시', TT_AUTO.pPre.val, TT_AUTO.pPre.n),
      h:sim.preHours.toFixed(1)+'h', w:`${inp.wkPre}명`,
      formula:`${Math.round(sim.preIn).toLocaleString()} ÷ (${inp.pPre} × ${inp.wkPre}) = ${sim.preHours.toFixed(2)}h`,
    },
    {
      p:'자숙',
      i:Math.round(sim.cookIn), o:Math.round(sim.cookOut),
      yEdit: `<span style="font-size:11px;color:var(--color-text-secondary)">${sim.cookYield.toFixed(1)}% (고정)</span>`,
      prodEdit: `<span style="font-size:10px;color:var(--color-text-tertiary)">4h × ${sim.tankInTimes.length}탱크 (고정)</span>`,
      h:`${TT_FIXED.cookHours*sim.tankInTimes.length}h (병렬)`, w:'2명',
      formula:`탱크당 ${TT_FIXED.tankKg}kg × ${sim.cookYield}% = ${Math.round(TT_FIXED.tankKg*sim.cookYield/100)}kg/탱크`,
    },
    {
      p:'파쇄',
      i:Math.round(sim.crushIn), o:Math.round(sim.crushOut),
      yEdit: editYield('tt-y-crush', inp.yCrush, TT_AUTO.yCrush.val, TT_AUTO.yCrush.n),
      prodEdit: editProd('tt-p-crush', inp.pCrush, 'kg/인시', TT_AUTO.pCrush.val, TT_AUTO.pCrush.n),
      h:sim.crushHours.toFixed(1)+'h', w:`${inp.wkCrush}→${inp.wkPackPeak}명`,
      formula:`${Math.round(sim.crushIn).toLocaleString()} ÷ (${inp.pCrush} × ${inp.wkPackPeak}) = ${sim.crushHours.toFixed(2)}h`,
    },
    {
      p:'내포장',
      i:Math.round(sim.packIn), o:Math.round(sim.packOut),
      yEdit: `<span style="font-size:11px;color:var(--color-text-secondary)">${TT_PACK_YIELD}% (고정)</span>`,
      prodEdit: editProd('tt-p-pack', inp.pPackEa, 'EA/분', TT_AUTO.pPackEa.val, TT_AUTO.pPackEa.n),
      h:(sim.packMin/60).toFixed(1)+'h', w:`${inp.wkPack}명`,
      formula:`${sim.pouches.toLocaleString()}EA ÷ ${inp.pPackEa}EA/분 = ${Math.round(sim.packMin)}분`,
    },
    {
      p:'레토르트',
      i:sim.pouches+'EA', o:sim.pouches+'EA',
      yEdit: `<span style="font-size:11px;color:var(--color-text-secondary)">100% (고정)</span>`,
      prodEdit: `<span style="font-size:10px;color:var(--color-text-tertiary)">${TT_FIXED.retortCycleMin/60}h × ${sim.retortCycles}회 (대차 8개)</span>`,
      h:`${(sim.retortCycles*TT_FIXED.retortCycleMin/60).toFixed(1)}h (순차)`, w:'2명',
      formula:`${sim.pouches.toLocaleString()}EA ÷ 384EA/회 = ${sim.retortCycles}회차`,
    },
  ];
  const procTbl = `
    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:16px">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">📐 공정별 현황 — 수율·생산성 직접 수정 가능</div>
      <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:12px">자동값(DB)이 채워져 있습니다. 입력칸 클릭해서 직접 수정하면 즉시 결과가 갱신됩니다.</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary)">
            <th style="text-align:left;padding:10px 8px;font-weight:500">공정</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">투입</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">산출</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">수율 (수정)</th>
            <th style="text-align:left;padding:10px 8px;font-weight:500">생산성 (수정)</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">시간</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">인원</th>
            <th style="text-align:left;padding:10px 8px;font-weight:500;font-size:10px">계산 근거</th>
          </tr></thead>
          <tbody>${procRows.map(r => `
            <tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
              <td style="padding:11px 8px;font-weight:500">${r.p}</td>
              <td style="padding:11px 8px;text-align:right">${typeof r.i === 'number' ? r.i.toLocaleString()+' kg' : r.i}</td>
              <td style="padding:11px 8px;text-align:right;font-weight:500">${typeof r.o === 'number' ? r.o.toLocaleString()+' kg' : r.o}</td>
              <td style="padding:8px;text-align:right">${r.yEdit}</td>
              <td style="padding:8px">${r.prodEdit}</td>
              <td style="padding:11px 8px;text-align:right">${r.h}</td>
              <td style="padding:11px 8px;text-align:right">${r.w}</td>
              <td style="padding:11px 8px;font-size:10px;color:var(--color-text-tertiary);font-family:monospace">${r.formula}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  // ── 공정별 "왜 저 시간인지" 설명 카드 ──────────────────
  const lastTankKg = TT_FIXED.tankKg * sim.cookYield / 100;
  const lastTankCrushMin = Math.round(lastTankKg / (inp.pCrush * inp.wkPackPeak / 60));
  const lastPackEa = Math.round(lastTankKg * inp.yCrush / 100 / TT_PACK_KG_PER_POUCH);
  const lastBatchPackMin = Math.round(lastPackEa / inp.pPackEa);

  const whyCards = `
    <div style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">📐 각 공정이 왜 그 시간인지</div>
      <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:12px">대표님이 어떤 막대 가리키셔도 즉답 가능 — 모든 숫자 추적</div>

      <!-- 전처리 -->
      <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-left:4px solid #185FA5;border-radius:10px;padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:0.5px dashed var(--color-border-tertiary)">
          <div><strong style="color:#185FA5;font-size:13px">전처리</strong>
          <span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px">${ttFmt(sim.startMin)} ~ ${ttFmt(sim.preEndMin)} · ${ttDur(sim.preEndMin-sim.startMin)} · ${inp.earlyWorkers}명→${inp.wkPre}명</span></div>
          <div style="font-size:10px;color:var(--color-text-tertiary)">${Math.round(sim.preIn).toLocaleString()}kg → ${Math.round(sim.preOut).toLocaleString()}kg</div>
        </div>
        <div style="font-size:11px;color:var(--color-text-secondary);line-height:1.7;font-family:monospace">
          🕐 시작 ${ttFmt(sim.startMin)} = 외국인 조출 시각<br>
          ⏱ Phase 1 (${ttFmt(sim.startMin)}~${inp.joinTime}, 외국인 ${inp.earlyWorkers}명):<br>
          &nbsp;&nbsp;&nbsp;${inp.pPre} × ${inp.earlyWorkers} × ${(sim.phase1Min/60).toFixed(0)}h = ${Math.round(sim.phase1Kg).toLocaleString()}kg 처리 가능<br>
          ⏱ Phase 2 (${inp.joinTime}~, 한국인 ${inp.wkPre}명):<br>
          &nbsp;&nbsp;&nbsp;잔량 ${Math.max(0, Math.round(sim.preIn - sim.phase1Kg)).toLocaleString()}kg ÷ (${inp.pPre} × ${inp.wkPre}) × 60 = ${Math.max(0, sim.preEndMin - sim.joinMin)}분<br>
          📊 생산성 ${inp.pPre} kg/인시 (자동: ${TT_AUTO.pPre.val} · n=${TT_AUTO.pPre.n})
        </div>
      </div>

      <!-- 자숙 -->
      <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-left:4px solid #0F6E56;border-radius:10px;padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:0.5px dashed var(--color-border-tertiary)">
          <div><strong style="color:#0F6E56;font-size:13px">자숙 (${sim.tankInTimes.length}탱크 병렬)</strong>
          <span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px">${ttFmt(sim.tankInTimes[0])} ~ ${ttFmt(sim.wagonEndTimes[sim.wagonEndTimes.length-1])} · 2명</span></div>
          <div style="font-size:10px;color:var(--color-text-tertiary)">${Math.round(sim.cookIn).toLocaleString()}kg → ${Math.round(sim.cookOut).toLocaleString()}kg</div>
        </div>
        <div style="font-size:11px;color:var(--color-text-secondary);line-height:1.7;font-family:monospace">
          🔢 탱크 수 = ${Math.round(sim.cookIn)} ÷ ${TT_FIXED.tankKg} = ${(sim.cookIn/TT_FIXED.tankKg).toFixed(2)} → ${sim.tankInTimes.length}탱크<br>
          ⏱ 사이클 4시간 + 와건 30분 (사용자분 시스템 고정)<br>
          📊 수율 ${sim.cookYield}% (홍두깨 자숙 고정값)<br>
          ${sim.tankInTimes.map((t, i) => `└ <strong>${i+1}호</strong> 투입 ${ttFmt(t)} → 와건 ${ttFmt(sim.wagonEndTimes[i])}`).join('<br>')}
        </div>
      </div>

      <!-- 파쇄 (강조 — 사용자분이 자주 의심) -->
      <div style="background:linear-gradient(to right,#FFF7ED 0%,#fffbf5 100%);border:1px solid #BA7517;border-radius:10px;padding:14px 16px;margin-bottom:8px;box-shadow:0 1px 3px rgba(186,117,23,0.08)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:0.5px dashed rgba(186,117,23,0.3)">
          <div><strong style="color:#BA7517;font-size:13px">파쇄</strong>
          <span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px">${ttFmt(sim.crushStartMin)} ~ ${ttFmt(sim.crushEndMin)} · ${ttDur(sim.crushEndMin-sim.crushStartMin)} · ${inp.wkCrush}→${inp.wkPackPeak}명</span></div>
          <div style="font-size:10px;color:var(--color-text-tertiary)">${Math.round(sim.crushIn).toLocaleString()}kg → ${Math.round(sim.crushOut).toLocaleString()}kg</div>
        </div>
        <div style="font-size:11px;color:var(--color-text-secondary);line-height:1.7;font-family:monospace">
          🕐 시작 ${ttFmt(sim.crushStartMin)} = 자숙 1호 와건 종료 시점<br>
          <br>
          <strong>종료가 ${ttFmt(sim.crushEndMin)}인 이유 — 둘 중 늦은 쪽:</strong><br>
          ① 자체 처리 종료:<br>
          &nbsp;&nbsp;&nbsp;${Math.round(sim.crushIn)}kg ÷ (${inp.pCrush} × ${inp.wkPackPeak}) = ${(sim.crushIn / (inp.pCrush*inp.wkPackPeak)).toFixed(2)}h<br>
          &nbsp;&nbsp;&nbsp;${ttFmt(sim.crushStartMin)} + ${(sim.crushIn / (inp.pCrush*inp.wkPackPeak)).toFixed(2)}h = ${ttFmt(sim.crushStartMin + Math.round(sim.crushIn / (inp.pCrush*inp.wkPackPeak) * 60))}<br>
          ② 마지막 자숙 4호 출하 후 처리:<br>
          &nbsp;&nbsp;&nbsp;마지막 와건 ${ttFmt(sim.wagonEndTimes[sim.wagonEndTimes.length-1])} + 마지막 탱크 ${Math.round(lastTankKg)}kg 처리(${lastTankCrushMin}분)<br>
          &nbsp;&nbsp;&nbsp;= ${ttFmt(sim.wagonEndTimes[sim.wagonEndTimes.length-1] + lastTankCrushMin)}<br>
          → <strong style="color:#BA7517">늦은 쪽 = ${ttFmt(sim.crushEndMin)}</strong><br>
          <br>
          📊 생산성 ${inp.pCrush} kg/인시 (자동: ${TT_AUTO.pCrush.val} · n=${TT_AUTO.pCrush.n})
        </div>
      </div>

      <!-- 내포장 (강조 — 사용자분이 가장 자주 짚으심) -->
      <div style="background:linear-gradient(to right,#F4F2FB 0%,#faf9fd 100%);border:1px solid #7F77DD;border-radius:10px;padding:14px 16px;margin-bottom:8px;box-shadow:0 1px 3px rgba(127,119,221,0.08)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:0.5px dashed rgba(127,119,221,0.3)">
          <div><strong style="color:#7F77DD;font-size:13px">내포장</strong>
          <span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px">${ttFmt(sim.packStartMin)} ~ ${ttFmt(sim.packEndMin)} · ${ttDur(sim.packEndMin-sim.packStartMin)} · ${inp.wkPack}명</span></div>
          <div style="font-size:10px;color:var(--color-text-tertiary)">${Math.round(sim.packIn).toLocaleString()}kg → ${sim.pouches.toLocaleString()}EA</div>
        </div>
        <div style="font-size:11px;color:var(--color-text-secondary);line-height:1.7;font-family:monospace">
          🕐 시작 ${ttFmt(sim.packStartMin)} = 파쇄 시작(${ttFmt(sim.crushStartMin)}) + 1h (대차 1개 누적)<br>
          <br>
          <strong>종료가 ${ttFmt(sim.packEndMin)}인 이유 — 둘 중 늦은 쪽:</strong><br>
          ① 자체 처리 종료:<br>
          &nbsp;&nbsp;&nbsp;${sim.pouches}EA ÷ ${inp.pPackEa}EA/분 = ${Math.round(sim.pouches / inp.pPackEa)}분<br>
          &nbsp;&nbsp;&nbsp;${ttFmt(sim.packStartMin)} + ${Math.round(sim.pouches / inp.pPackEa)}분 = ${ttFmt(sim.packStartMin + Math.round(sim.pouches / inp.pPackEa))}<br>
          ② 파쇄 종료 후 마지막 산출분 처리:<br>
          &nbsp;&nbsp;&nbsp;마지막 탱크 파쇄 산출 ${lastPackEa}EA<br>
          &nbsp;&nbsp;&nbsp;${lastPackEa}EA ÷ ${inp.pPackEa} = ${lastBatchPackMin}분<br>
          &nbsp;&nbsp;&nbsp;파쇄 종료 ${ttFmt(sim.crushEndMin)} + ${lastBatchPackMin}분 = ${ttFmt(sim.crushEndMin + lastBatchPackMin)}<br>
          → <strong style="color:#7F77DD">늦은 쪽 = ${ttFmt(sim.packEndMin)}</strong><br>
          <br>
          📊 생산성 ${inp.pPackEa} EA/분 (자동: ${TT_AUTO.pPackEa.val} · n=${TT_AUTO.pPackEa.n})
        </div>
      </div>

      <!-- 레토르트 -->
      <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-left:4px solid #A32D2D;border-radius:10px;padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:0.5px dashed var(--color-border-tertiary)">
          <div><strong style="color:#A32D2D;font-size:13px">레토르트 (${sim.retortCycles}회차)</strong>
          <span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px">${ttFmt(sim.retortStartTimes[0])} ~ ${ttFmt(sim.retortEndMin)} · 2명</span></div>
          <div style="font-size:10px;color:var(--color-text-tertiary)">${sim.pouches.toLocaleString()}EA</div>
        </div>
        <div style="font-size:11px;color:var(--color-text-secondary);line-height:1.7;font-family:monospace">
          🔢 회차 = ${sim.pouches} ÷ 384 = ${(sim.pouches/384).toFixed(2)} → ${sim.retortCycles}회차<br>
          ⏱ 사이클 2.5h × ${sim.retortCycles}회 (대차 8개 한도, 1대 운영)<br>
          ${sim.retortStartTimes.map((s, i) => {
            const e = sim.retortEndTimes[i];
            const isLast = i === sim.retortStartTimes.length - 1;
            return `└ <strong>${i+1}회차</strong> ${ttFmt(s)}~${ttFmt(e)}${isLast ? ' <span style="color:#A32D2D">★ 내포장 종료('+ttFmt(sim.packEndMin)+') 후 시작</span>' : ''}`;
          }).join('<br>')}
        </div>
      </div>
    </div>`;

  document.getElementById('tt-result').innerHTML = `
    ${conclusion}
    ${planBox}
    ${splitView}
    ${whyCards}
    ${procTbl}`;
}
