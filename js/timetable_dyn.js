// ─────────────────────────────────────────────────────────────────────────
// timetable_dyn.js — 진짜 동적 시뮬레이션 엔진 (DES)
//
// 모델:
//   · 시간 1분 단위
//   · 자원 풀 = 28명 (시간대별 출근 반영)
//   · 작업 큐 = 전처리, 자숙(4기), 파쇄, 내포장, 레토르트(3대)
//   · 매 분마다 인원 동적 배치 (작업 우선순위 기반)
//   · 남는 인원 → 외포장(제수)
//   · 점심 = 작업 영향 최소화 시점에 자동
// ─────────────────────────────────────────────────────────────────────────

// 고정값 (기존 타임테이블과 동일)
const TTD_FIXED = {
  cookHours: 4,
  wagonMin: 30,
  tankKg: 800,
  tankCount: 4,        // 자숙 탱크 4기
  retortCount: 3,      // 레토르트 설비 3대
  totalCarts: 8,       // 대차 8개
  cartEa: 96,          // 대차당 96 EA
  retortCycleMin: 150, // 2.5h
  packKgPerEa: 1.35,
  packYield: 99.8,
};

const TTD_COOK_YIELD = { '홍두깨': 56.8, '우둔': 55.0, '설도': 58.0 };
const TTD_PRE_YIELD = 92.4;
const TTD_CRUSH_YIELD = 97.7;
const TTD_PRE_KG_PER_HOUR = 52.6;  // 인당
const TTD_CRUSH_KG_PER_HOUR = 15.5;
const TTD_PACK_EA_PER_MIN = 8;     // 기계 한도

// 시간 변환
function ttdToMin(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}
function ttdFmt(min) {
  if (min < 0 || min >= 30*60) return '?';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function ttdDur(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

// ─────────────────────────────────────────────────────────────────────────
// DES 시뮬레이션
// ─────────────────────────────────────────────────────────────────────────
function ttdSimulate(inp) {
  const startMin = ttdToMin(inp.startTime);
  const joinMin = ttdToMin(inp.joinTime);
  const mgrMin = 7 * 60;  // 관리 출근 07:00 고정
  const cookYield = TTD_COOK_YIELD[inp.meatType] || 56.8;

  // 산출 계산
  const preIn = inp.meatKg;
  const preOut = preIn * TTD_PRE_YIELD / 100;
  const cookOut = preOut * cookYield / 100;
  const crushOut = cookOut * TTD_CRUSH_YIELD / 100;
  const packOut = crushOut * TTD_FIXED.packYield / 100;
  const totalEa = Math.floor(packOut / TTD_FIXED.packKgPerEa);

  // 시간대 상수
  const L1S = 11*60+30, L1E = 12*60+30, L2E = 13*60+30;
  const SIM_END = 26*60;  // 26시까지 시뮬

  // 상태 변수
  let preProcessed = 0;        // 전처리 누적 (kg)
  let crushProcessed = 0;      // 파쇄 누적 (kg)
  let packProcessedEa = 0;     // 내포장 누적 (EA)

  let preEndMin = -1;
  let crushStartMin = -1;
  let crushEndMin = -1;
  let packStartMin = -1;
  let packEndMin = -1;

  // 자숙 탱크 상태: 비어있는 탱크 / 가동 중 / 와건 중
  // tank = { idx: 1~4, state: 'idle'|'cook'|'wagon', kgIn, kgOut, inMin, cookEndMin, wagonEndMin }
  const tanks = [
    { idx: 1, state: 'idle', kgIn: 0, kgOut: 0, inMin: 0, cookEndMin: 0, wagonEndMin: 0 },
    { idx: 2, state: 'idle', kgIn: 0, kgOut: 0, inMin: 0, cookEndMin: 0, wagonEndMin: 0 },
    { idx: 3, state: 'idle', kgIn: 0, kgOut: 0, inMin: 0, cookEndMin: 0, wagonEndMin: 0 },
    { idx: 4, state: 'idle', kgIn: 0, kgOut: 0, inMin: 0, cookEndMin: 0, wagonEndMin: 0 },
  ];

  // 자숙 산출 누적 (kg) - 와건 끝난 자숙 산출 합
  let cookAvailKg = 0;
  let cookConsumedKg = 0;  // 파쇄가 가져간 양
  // 자숙 투입할 전처리 산출 누적
  let preReadyForCookKg = 0;
  let preConsumedForCookKg = 0;
  // 다음 자숙 탱크에 채울 양 (누적 중)
  let pendingCookKg = 0;

  // 레토르트 상태
  const retortFreeAt = [0, 0, 0];
  const retortBatches = [];  // [{idx, start, end, ea, carts}]
  let retortEaConsumed = 0;

  // 시간대별 인원 슬롯 (매 분마다 cells 추적, 변경 시 새 슬롯)
  const slots = [];
  let prevKey = null;
  let slotStart = startMin;

  // 자숙 호별 파쇄 처리 추적 (시각화용)
  const tankCrushTimes = [];  // [{idx, start, end, kg}]
  let currentTankCrush = null;  // 현재 처리 중인 자숙 호

  // 파쇄 막대 (인원 변화 시 분할)
  const crushBars = [];  // [{start, end, workers}]
  let currentCrushBar = null;

  // 내포장 막대 (정지/재가동 분할)
  const packBars = [];
  let currentPackBar = null;

  // 시뮬 루프 (1분 단위)
  for (let t = startMin; t < SIM_END; t++) {
    // ── 1. 자숙 탱크 상태 업데이트 ──
    for (const tank of tanks) {
      if (tank.state === 'cook' && t >= tank.cookEndMin) {
        tank.state = 'wagon';
      }
      if (tank.state === 'wagon' && t >= tank.wagonEndMin) {
        // 와건 종료 → 산출 가능
        tank.state = 'done';
        cookAvailKg += tank.kgOut;
      }
    }

    // ── 2. 가용 인원 계산 ──
    let totalAvail;
    if (t < mgrMin) totalAvail = inp.earlyWorkers;
    else if (t < joinMin) totalAvail = inp.earlyWorkers + 2;  // + 관리 2
    else totalAvail = inp.totalWorkers;

    // 제수는 항상 별도 (외포장 작업)
    const leftoverWorkers = (t >= joinMin) ? inp.wkLeftover : 0;
    let avail = totalAvail - leftoverWorkers;

    // ── 3. 점심 시간대 인원 정리 ──
    // 11:30~12:30: 후공정조 점심 (파쇄·내포장·이송 인원이 점심)
    // 12:30~13:30: 전처리조 점심
    let lunchPriority = '';
    if (t >= L1S && t < L1E) lunchPriority = 'post';   // 후공정조 점심
    else if (t >= L1E && t < L2E) lunchPriority = 'pre'; // 전처리조 점심

    // ── 4. 작업 우선순위 결정 ──
    const cells = {};
    let preW = 0, crushW = 0, packW = 0, transW = 0, mgrW = 0;

    // 관리: 항상 2명 (관리 출근 후), 점심에 1명만 (1명은 점심)
    if (t >= mgrMin) {
      mgrW = (t >= L1S && t < L2E) ? 1 : 2;
    }

    // ★ 우선순위 1: 전처리 (자숙 탱크 못 채우면 후속 다 늦음)
    // 자숙 탱크 = 4기, 동시 가동 가능
    // 전처리 산출 800kg마다 자숙 1탱크 가능
    // 전처리 진행 = 아직 처리 안 한 원육이 남아있는지
    const preNeeded = preProcessed < preIn;
    if (preNeeded) {
      if (t < joinMin) {
        // 한국인 합류 전: 외국인 전부 전처리
        preW = inp.earlyWorkers;
      } else if (lunchPriority === 'pre') {
        // 전처리조 점심 시간대: 일부만 전처리 (점심 가는 인원 빼고)
        // 단순화: 전처리조 절반만 일하고 절반 점심
        preW = Math.floor(inp.earlyWorkers / 2);  // 외국인은 일찍 출근했으니 점심 1차에 갔을 것
      } else if (lunchPriority === 'post') {
        // 후공정조 점심 시간대: 전처리는 풀가동 가능
        // 자숙 사이클 따라잡을 만큼만 투입
        // 단순: 한국인 합류 후 = max(외국인 + 한국인 일부)
        // 자숙 1사이클 4시간 = 800kg → 200 kg/h 필요
        // 인당 52.6 kg/h → 4명이면 충분
        // 근데 전처리 빨리 끝낼수록 자숙 1호 빨리 시작 → 좋음
        // 룰: 가용 인원 중 (총원 - 후공정조 - 점심) 만큼
        preW = inp.earlyWorkers;  // 외국인 전부
        // 한국인 일부 추가? 자숙 1호 따라잡는 만큼
        // 단순: 자숙 첫 탱크 못 채워졌으면 한국인 추가
        if (preReadyForCookKg < TTD_FIXED.tankKg && tanks[0].state === 'idle') {
          preW += 3;  // 한국인 3명 추가
        }
      } else {
        // 정상 시간 (점심 외)
        preW = inp.earlyWorkers;
        // 자숙 1탱크 안 차거나 진행 중인 자숙 부족하면 한국인 추가
        if (t >= joinMin) {
          const tanksStarted = tanks.filter(tk => tk.state !== 'idle').length;
          if (preReadyForCookKg < TTD_FIXED.tankKg * (tanksStarted + 1) && preNeeded) {
            preW += 3;  // 한국인 3명 추가 (자숙 따라잡기)
          }
        }
      }
    }
    preW = Math.min(preW, avail);

    // 전처리 산출 (1분간)
    if (preW > 0 && preNeeded) {
      const preMinKg = TTD_PRE_KG_PER_HOUR * preW / 60;
      const newProc = Math.min(preMinKg, preIn - preProcessed);
      preProcessed += newProc;
      preReadyForCookKg += newProc * TTD_PRE_YIELD / 100;
      if (preProcessed >= preIn - 0.01 && preEndMin < 0) {
        preEndMin = t + 1;
      }
    }

    // ★ 자숙 탱크 투입: 800kg 모이거나 마지막이면 투입
    for (const tank of tanks) {
      if (tank.state === 'idle') {
        const remaining = preReadyForCookKg - preConsumedForCookKg;
        const isLastBatch = !preNeeded && remaining > 0;
        if (remaining >= TTD_FIXED.tankKg || (isLastBatch && remaining > 0)) {
          const kgIn = Math.min(remaining, TTD_FIXED.tankKg);
          tank.state = 'cook';
          tank.kgIn = kgIn;
          tank.kgOut = kgIn * cookYield / 100;
          tank.inMin = t;
          tank.cookEndMin = t + TTD_FIXED.cookHours * 60;
          tank.wagonEndMin = tank.cookEndMin + TTD_FIXED.wagonMin;
          preConsumedForCookKg += kgIn;
          break;  // 한 분에 한 탱크만 투입 (현실적)
        }
      }
    }

    // ★ 우선순위 2: 파쇄 (자숙 산출 적체 방지)
    const cookRemaining = cookAvailKg - cookConsumedKg;
    const crushNeeded = cookRemaining > 0;
    if (crushNeeded) {
      // 가용 인원 = avail - preW - mgrW - 내포장(6) - 이송(2)
      // 단 점심 시간대는 다름
      let availForCrush = avail - preW - mgrW;
      // 내포장·이송 자리 미리 빼기
      let packReserved = 0, transReserved = 0;

      // 내포장 가능 시점인지 미리 체크 (파쇄 산출 누적 + 시간)
      const packReadyEa = Math.floor(crushProcessed * TTD_CRUSH_YIELD / 100 / TTD_FIXED.packKgPerEa);
      const packCanRun = packReadyEa - packProcessedEa >= TTD_FIXED.cartEa &&  // 1대차분 누적
                          lunchPriority !== 'post' &&
                          packProcessedEa < totalEa;
      if (packCanRun) {
        packReserved = 6;
        availForCrush -= 6;
      }
      // 이송 자리
      if (lunchPriority !== 'post' && t >= joinMin) {
        transReserved = 2;
        availForCrush -= 2;
      }

      // 파쇄 인원 = 남은 가용 (최소 0, 최대 18)
      crushW = Math.max(0, Math.min(18, availForCrush));
      packW = packReserved;
      transW = transReserved;
    } else {
      // 파쇄 처리할 거 없음 → 0
      // 그래도 내포장은 가능하면 가동
      const packReadyEa = Math.floor(crushProcessed * TTD_CRUSH_YIELD / 100 / TTD_FIXED.packKgPerEa);
      const packCanRun = packReadyEa - packProcessedEa > 0 &&
                          lunchPriority !== 'post' &&
                          packProcessedEa < totalEa;
      if (packCanRun) {
        packW = 6;
        if (t >= joinMin) transW = 2;
      }
    }

    // 파쇄 처리 (1분간)
    if (crushW > 0 && crushNeeded) {
      const crushMinKg = TTD_CRUSH_KG_PER_HOUR * crushW / 60;
      const newCrush = Math.min(crushMinKg, cookRemaining);
      crushProcessed += newCrush;
      cookConsumedKg += newCrush;
      if (crushStartMin < 0) crushStartMin = t;
      // 자숙 호별 추적
      // 어떤 자숙 호 산출이 처리되고 있는지: 가장 빨리 와건 끝난 호
      const activeTank = tanks.find(tk => tk.state === 'done' && cookConsumedKg < cumulativeTankOut(tanks, tk.idx));
      if (activeTank) {
        if (!currentTankCrush || currentTankCrush.idx !== activeTank.idx) {
          if (currentTankCrush) {
            currentTankCrush.end = t;
            tankCrushTimes.push(currentTankCrush);
          }
          currentTankCrush = { idx: activeTank.idx, start: t, end: t, kg: activeTank.kgOut };
        }
      }
      // 전체 자숙 다 처리하면 파쇄 종료
      if (!preNeeded && cookConsumedKg >= cookOut - 0.01 && crushEndMin < 0) {
        crushEndMin = t + 1;
        if (currentTankCrush) {
          currentTankCrush.end = t + 1;
          tankCrushTimes.push(currentTankCrush);
          currentTankCrush = null;
        }
      }
    }

    // 파쇄 막대 추적
    if (crushW > 0) {
      if (!currentCrushBar || currentCrushBar.workers !== crushW) {
        if (currentCrushBar) {
          currentCrushBar.end = t;
          crushBars.push(currentCrushBar);
        }
        currentCrushBar = { start: t, end: t+1, workers: crushW };
      } else {
        currentCrushBar.end = t + 1;
      }
    } else {
      if (currentCrushBar) {
        crushBars.push(currentCrushBar);
        currentCrushBar = null;
      }
    }

    // 내포장 처리 (1분간)
    if (packW > 0) {
      const packReadyEa = Math.floor(crushProcessed * TTD_CRUSH_YIELD / 100 / TTD_FIXED.packKgPerEa);
      const newPack = Math.min(TTD_PACK_EA_PER_MIN, packReadyEa - packProcessedEa, totalEa - packProcessedEa);
      if (newPack > 0) {
        packProcessedEa += newPack;
        if (packStartMin < 0) packStartMin = t;
      }
      if (packProcessedEa >= totalEa && packEndMin < 0) {
        packEndMin = t + 1;
      }
    }

    // 내포장 막대 추적
    if (packW > 0 && packProcessedEa < totalEa) {
      if (!currentPackBar) {
        currentPackBar = { start: t, end: t+1 };
      } else {
        currentPackBar.end = t + 1;
      }
    } else if (currentPackBar) {
      packBars.push(currentPackBar);
      currentPackBar = null;
    }

    // ★ 우선순위 3: 외포장 = 남는 인원
    let usedSoFar = preW + crushW + packW + transW + mgrW;
    let lunchCount = 0;
    if (lunchPriority === 'post') {
      // 후공정조 점심: 가용에서 사용된 인원 외 = 점심
      // 후공정조 = 18명 정도 (파쇄+내포장+이송) → 그 중 점심
      lunchCount = Math.max(0, avail - usedSoFar - 0);
    } else if (lunchPriority === 'pre') {
      // 전처리조 점심: 외국인 + 일부 한국인이 점심
      lunchCount = Math.max(0, avail - usedSoFar);
    }

    let outerW = 0;
    if (lunchPriority === '') {
      // 점심 외 시간 = 남는 인원 외포장
      outerW = Math.max(0, avail - usedSoFar);
    }

    // 인원 합 = totalAvail (부족분 = 외포장 음수가 안 되게)
    if (preW > 0) cells['전처리'] = preW;
    if (crushW > 0) cells['파쇄'] = crushW;
    if (packW > 0) cells['내포장'] = packW;
    if (transW > 0) cells['이송'] = transW;
    if (outerW > 0) cells['외포장'] = outerW + leftoverWorkers;
    else if (leftoverWorkers > 0) cells['외포장'] = leftoverWorkers;
    if (lunchCount > 0) cells['점심'] = lunchCount;
    if (mgrW > 0) cells['관리'] = mgrW;
    if (mgrW < 2 && t >= mgrMin && (lunchPriority === 'post' || lunchPriority === 'pre')) {
      // 관리 1명 점심 = 점심 cells 추가
      cells['점심'] = (cells['점심'] || 0) + (2 - mgrW);
    }

    // 합계 검증 (사용 안 함, 디버그)
    const sum = Object.values(cells).reduce((a,b) => a+b, 0);

    // 슬롯 추적 (cells 변경 시 새 슬롯)
    const key = JSON.stringify(cells);
    if (key !== prevKey) {
      if (prevKey !== null) {
        const prevCells = JSON.parse(prevKey);
        slots.push({
          range: `${ttdFmt(slotStart)}~${ttdFmt(t)}`,
          cells: prevCells,
          sum: Object.values(prevCells).reduce((a,b) => a+b, 0),
        });
      }
      slotStart = t;
      prevKey = key;
    }

    // 종료 조건: 모든 작업 완료
    if (preEndMin > 0 && crushEndMin > 0 && packEndMin > 0 && t > packEndMin + 5) {
      // 마지막 슬롯 마감
      if (prevKey !== null) {
        const prevCells = JSON.parse(prevKey);
        slots.push({
          range: `${ttdFmt(slotStart)}~${ttdFmt(t)}`,
          cells: prevCells,
          sum: Object.values(prevCells).reduce((a,b) => a+b, 0),
        });
      }
      break;
    }
  }

  // 마지막 슬롯 마감 (loop 안 끝났으면)
  if (prevKey !== null && slots.length === 0) {
    const prevCells = JSON.parse(prevKey);
    slots.push({
      range: `${ttdFmt(slotStart)}~${ttdFmt(packEndMin || SIM_END)}`,
      cells: prevCells,
      sum: Object.values(prevCells).reduce((a,b) => a+b, 0),
    });
  }

  // 막대 마감
  if (currentCrushBar) crushBars.push(currentCrushBar);
  if (currentPackBar) packBars.push(currentPackBar);
  if (currentTankCrush) {
    currentTankCrush.end = crushEndMin || SIM_END;
    tankCrushTimes.push(currentTankCrush);
  }

  // ── 레토르트 시뮬 (균등 분배) ──
  // 회차 수 = ceil(totalEa / 384)
  const retortCycles = Math.ceil(totalEa / (TTD_FIXED.cartEa * 4));
  const eaPerBatch = Math.floor(totalEa / retortCycles);
  const eaRemainder = totalEa - eaPerBatch * retortCycles;
  const batchEa = [];
  for (let i = 0; i < retortCycles; i++) {
    batchEa.push(i === retortCycles - 1 ? eaPerBatch + eaRemainder : eaPerBatch);
  }
  const batchCarts = batchEa.map(ea => Math.min(4, Math.ceil(ea / TTD_FIXED.cartEa)));

  const retortStartTimes = [];
  const retortEndTimes = [];
  const retortFreeAtArr = [0, 0, 0];

  for (let i = 0; i < retortCycles; i++) {
    const isLast = i === retortCycles - 1;
    const cumEa = batchEa.slice(0, i + 1).reduce((a, b) => a + b, 0);
    let accumulateMin = (packStartMin > 0 ? packStartMin : L2E) + Math.round(cumEa / TTD_PACK_EA_PER_MIN);
    if (isLast) accumulateMin = Math.max(accumulateMin, packEndMin || SIM_END);
    else if (accumulateMin > (packEndMin || SIM_END)) accumulateMin = packEndMin || SIM_END;

    const earliest = retortFreeAtArr.indexOf(Math.min(...retortFreeAtArr));
    let candidate = Math.max(retortFreeAtArr[earliest], accumulateMin);

    const cartsAvailAt = (tt) => {
      let inUse = 0;
      for (let k = 0; k < retortStartTimes.length; k++) {
        if (retortStartTimes[k] <= tt && tt < retortEndTimes[k]) {
          inUse += batchCarts[k];
        }
      }
      return TTD_FIXED.totalCarts - inUse;
    };

    while (cartsAvailAt(candidate) < batchCarts[i]) {
      const ongoing = retortEndTimes.filter((e, k) => retortStartTimes[k] <= candidate && candidate < e);
      if (ongoing.length === 0) break;
      candidate = Math.min(...ongoing);
    }
    const start = candidate;
    const end = start + TTD_FIXED.retortCycleMin;
    retortStartTimes.push(start);
    retortEndTimes.push(end);
    retortFreeAtArr[earliest] = end;
  }
  const retortStartMin = retortStartTimes[0];
  const retortEndMin = Math.max(...retortEndTimes);

  return {
    inp,
    preIn, preOut, cookOut, crushOut, packOut, totalEa,
    cookYield,
    startMin, joinMin, mgrMin,
    preEndMin, crushStartMin, crushEndMin, packStartMin, packEndMin,
    retortStartMin, retortEndMin, retortCycles,
    retortStartTimes, retortEndTimes,
    batchEa, batchCarts,
    tanks,
    tankCrushTimes,
    crushBars,
    packBars,
    slots,
  };
}

// 자숙 호 i까지 누적 산출 (FIFO 추적용)
function cumulativeTankOut(tanks, idx) {
  let cum = 0;
  for (const t of tanks) {
    if (t.idx <= idx && t.state === 'done') cum += t.kgOut;
  }
  return cum;
}

// ─────────────────────────────────────────────────────────────────────────
// 입력 + 렌더
// ─────────────────────────────────────────────────────────────────────────
function ttdGetInputs() {
  const get = (id, def) => {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(el.value);
    return isNaN(v) ? def : v;
  };
  const getStr = (id, def) => {
    const el = document.getElementById(id);
    return el ? (el.value || def) : def;
  };
  return {
    meatType: getStr('ttd-meat', '홍두깨'),
    meatKg: get('ttd-kg', 2100),
    totalWorkers: get('ttd-total', 28),
    wkLeftover: get('ttd-leftover', 0),
    startTime: getStr('ttd-start', '05:00'),
    earlyWorkers: get('ttd-early', 7),
    joinTime: getStr('ttd-join', '09:00'),
  };
}

function ttdRender() {
  const container = document.getElementById('ttd-result');
  if (!container) return;
  const inp = ttdGetInputs();
  if (!inp.meatKg || inp.meatKg <= 0) {
    container.innerHTML = '<div style="padding:20px;color:#999;text-align:center">원육량을 입력하세요</div>';
    return;
  }
  const sim = ttdSimulate(inp);
  const fmt = ttdFmt;

  // 결론 박스
  const conclusion = `
    <div style="background:linear-gradient(135deg,#E8F5E9 0%,#f3faf4 100%);border:1px solid #2E7D32;border-radius:12px;padding:18px 22px;margin-bottom:14px">
      <div style="font-size:11px;color:#2E7D32;font-weight:600;letter-spacing:0.5px;margin-bottom:6px">🔬 동적 시뮬레이션 (DES) 결과</div>
      <div style="font-size:19px;font-weight:600;color:var(--color-text-primary);margin-bottom:6px">
        ${inp.meatType} ${inp.meatKg.toLocaleString()}kg → 약 <span style="color:#0F6E56">${sim.totalEa.toLocaleString()}개</span> ·
        <strong style="color:#2E7D32">${fmt(sim.packEndMin)} 종료</strong>
      </div>
      <div style="font-size:12px;color:var(--color-text-secondary);line-height:1.6">
        총 ${ttdDur((sim.packEndMin||0) - sim.startMin)} · 전처리 ${fmt(sim.preEndMin)} · 파쇄 ${fmt(sim.crushStartMin)}~${fmt(sim.crushEndMin)} · 내포장 ${fmt(sim.packStartMin)}~${fmt(sim.packEndMin)} · 레토르트 ${fmt(sim.retortStartMin)}~${fmt(sim.retortEndMin)} (${sim.retortCycles}회차)
      </div>
    </div>`;

  // 인원 슬롯 표
  const allKeys = new Set();
  sim.slots.forEach(s => Object.keys(s.cells).forEach(k => allKeys.add(k)));
  const order = ['전처리','파쇄','내포장','이송','외포장','점심','관리'];
  const heads = order.filter(k => allKeys.has(k));
  const colors = { 전처리:'#185FA5', 파쇄:'#BA7517', 내포장:'#7F77DD', 이송:'#5C8DAB', 외포장:'#0F6E56', 점심:'#888780', 관리:'#666' };

  const slotsTable = `
    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">👥 시간대별 인원 동적 배치</div>
      <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:10px">매 분마다 작업 큐 우선순위에 따라 자동 배치 · 정원 ${inp.totalWorkers}명</div>
      <div style="border:2px solid #2E7D32;border-radius:6px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;table-layout:fixed">
          <colgroup>
            ${Array(heads.length + 2).fill(0).map(() => `<col style="width:${100/(heads.length+2)}%">`).join('')}
          </colgroup>
          <thead>
            <tr style="background:linear-gradient(135deg,#2E7D32,#43A047);color:#fff">
              <th style="padding:10px;border:1px solid #1B5E20;font-size:12px">시간대</th>
              ${heads.map(h => `<th style="padding:10px;border:1px solid #1B5E20;font-size:12px;text-align:center">${h}</th>`).join('')}
              <th style="padding:10px;border:1px solid #1B5E20;font-size:12px;text-align:center;background:#1B5E20">합계</th>
            </tr>
          </thead>
          <tbody>
          ${sim.slots.map((s, idx) => {
            const stripe = idx % 2 === 1 ? 'background:#f7faf7' : '';
            const ok = s.sum === inp.totalWorkers;
            return `<tr style="${stripe}">
              <td style="padding:7px 4px;font-weight:600;border:1px solid #ddd;font-size:11px;text-align:center">${s.range}</td>
              ${heads.map(h => {
                const v = s.cells[h] || 0;
                const c = v > 0 ? (colors[h] || '#666') : '#ccc';
                return `<td style="padding:7px 4px;text-align:center;border:1px solid #ddd;color:${c};font-weight:${v>=10?700:600};font-size:13px">${v||'·'}</td>`;
              }).join('')}
              <td style="padding:7px 4px;text-align:center;font-weight:700;color:${ok?'#2E7D32':'#A32D2D'};font-size:13px;border:1px solid #ddd">${s.sum}${ok?' ✓':' ❌'}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  // 보고서 (간단)
  const report = `
    <div style="background:var(--color-background-primary);border:1px solid #d4a82c;border-radius:12px;padding:16px 20px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#9a7a1a;margin-bottom:10px">📋 동적 시뮬 결과 — 핵심 지표</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:12px">
        <div style="background:#f7f9fc;border-radius:6px;padding:10px 12px">
          <div style="color:#185FA5;font-weight:600;font-size:11px">전처리</div>
          <div style="font-size:14px;font-weight:700;margin-top:2px">${fmt(sim.preEndMin)}</div>
          <div style="color:#666;font-size:10px;margin-top:2px">${inp.meatKg}kg → ${Math.round(sim.preOut)}kg</div>
        </div>
        <div style="background:#f7f9fc;border-radius:6px;padding:10px 12px">
          <div style="color:#BA7517;font-weight:600;font-size:11px">파쇄</div>
          <div style="font-size:14px;font-weight:700;margin-top:2px">${fmt(sim.crushStartMin)}~${fmt(sim.crushEndMin)}</div>
          <div style="color:#666;font-size:10px;margin-top:2px">${Math.round(sim.cookOut)}kg → ${Math.round(sim.crushOut)}kg</div>
        </div>
        <div style="background:#f7f9fc;border-radius:6px;padding:10px 12px">
          <div style="color:#7F77DD;font-weight:600;font-size:11px">내포장</div>
          <div style="font-size:14px;font-weight:700;margin-top:2px">${fmt(sim.packStartMin)}~${fmt(sim.packEndMin)}</div>
          <div style="color:#666;font-size:10px;margin-top:2px">${sim.totalEa.toLocaleString()} EA</div>
        </div>
        <div style="background:#f7f9fc;border-radius:6px;padding:10px 12px">
          <div style="color:#A32D2D;font-weight:600;font-size:11px">레토르트</div>
          <div style="font-size:14px;font-weight:700;margin-top:2px">${fmt(sim.retortStartMin)}~${fmt(sim.retortEndMin)}</div>
          <div style="color:#666;font-size:10px;margin-top:2px">${sim.retortCycles}회차 · ${sim.batchEa.join('·')}EA</div>
        </div>
      </div>
    </div>`;

  container.innerHTML = conclusion + report + slotsTable;
}

// 페이지 진입
if (typeof window !== 'undefined') {
  window.ttdRender = ttdRender;
  window.ttdInit = ttdRender;
}
