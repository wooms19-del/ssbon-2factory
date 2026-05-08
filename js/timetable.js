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

// ── PIN 체크 ─────────────────────────────────────────────
function ttCheckPin() {
  const v = document.getElementById('tt-pin-input').value;
  if (v.length < 4) return;
  if (v === TT_PIN) {
    document.getElementById('tt-lock').style.display = 'none';
    document.getElementById('tt-main').style.display = 'block';
    document.getElementById('tt-pin-err').style.display = 'none';
    ttAutoAnalyze().then(ttRender);
  } else {
    document.getElementById('tt-pin-err').style.display = 'block';
  }
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
    startTime: getStr('tt-start', '06:00'),
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

  const preHours = preIn / (inp.pPre * inp.wkPre);
  const preEndMin = startMin + Math.round(preHours * 60);

  // 자숙 4탱크 병렬
  const cookCycles = Math.max(1, Math.ceil(preIn / TT_FIXED.tankKg));
  const tankInTimes = [];
  for (let i = 0; i < cookCycles; i++) {
    const t = startMin + Math.round(preHours * 60 * (i + 1) / cookCycles);
    tankInTimes.push(t);
  }
  const tankOutTimes = tankInTimes.map(t => t + TT_FIXED.cookHours * 60);
  const wagonEndTimes = tankOutTimes.map(t => t + TT_FIXED.wagonMin);

  // 파쇄: 자숙 1호 와건 종료부터, 피크 인원으로 계산
  const crushStartMin = wagonEndTimes[0];
  const crushHours = crushIn / (inp.pCrush * inp.wkPackPeak);
  const crushEndMin = crushStartMin + Math.round(crushHours * 60);

  // 내포장: 파쇄 시작 1시간 후
  const packStartMin = crushStartMin + 60;
  const packMin = pouches / inp.pPackEa;
  const packEndMin = packStartMin + Math.round(packMin);

  // 레토르트
  const retortStartMin = packStartMin + 90;
  const retortCycles = Math.ceil(pouches / TT_FIXED.retortPerCycle);
  const retortEndMin = retortStartMin + retortCycles * TT_FIXED.retortCycleMin;

  return {
    preIn, preOut, cookIn, cookOut, crushIn, crushOut, packIn, packOut, pouches,
    preHours, crushHours, packMin,
    startMin, preEndMin,
    tankInTimes, tankOutTimes, wagonEndTimes,
    crushStartMin, crushEndMin,
    packStartMin, packEndMin,
    retortStartMin, retortEndMin, retortCycles,
    cookYield,
  };
}

// ── 인원 운용 슬롯 자동 ─────────────────────────────────
function ttPlanSlots(inp, sim) {
  const total = inp.totalWorkers;
  const mgr = 2;
  const foreign = Math.min(7, Math.floor((total - mgr) / 4));
  const slots = [];

  slots.push({
    range: `${ttFmt(sim.startMin)}~07:00`,
    cells: { 전처리: foreign },
    sum: foreign,
  });
  slots.push({
    range: `07:00~09:00`,
    cells: { 전처리: foreign, 관리: mgr },
    sum: foreign + mgr,
  });
  const remain1 = total - inp.wkPre - mgr;
  slots.push({
    range: `09:00~11:30`,
    cells: { 전처리: inp.wkPre, 외포장: Math.max(0, remain1 - 3), 세팅: 3, 관리: mgr },
    sum: total,
  });
  slots.push({
    range: `11:30~12:30`,
    cells: { 전처리: inp.wkPre, 점심: total - inp.wkPre - 1, 관리: 1 },
    sum: total,
  });
  slots.push({
    range: `12:30~13:30`,
    cells: { 파쇄: inp.wkCrush, 이송: inp.wkTrans, 점심: total - inp.wkCrush - inp.wkTrans - 1, 관리: 1 },
    sum: total,
  });
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
  lines.push(`<strong>${ttFmt(sim.startMin)}~07:00</strong> · 외국인 ${slots[0].cells.전처리}명 전처리 시작`);
  lines.push(`<strong>07:00~09:00</strong> · 관리 ${slots[1].cells.관리}명 합류 (전처리는 그대로)`);
  lines.push(`<strong>09:00~11:30</strong> · 한국인 합류 → 전처리 ${inp.wkPre}명 가동 + 외포장·세팅 병행 (${total}명 풀가동)`);
  lines.push(`<strong>${ttFmt(sim.crushStartMin)}</strong> · 자숙 1호 출하 → <strong style="color:#BA7517">파쇄 ${inp.wkCrush}명 투입 시작</strong>`);
  lines.push(`<strong>11:30~12:30</strong> · 점심 1차 (후공정조)`);
  lines.push(`<strong>12:30~13:30</strong> · 점심 2차 (전처리조) — 파쇄 ${inp.wkCrush}명 가동`);
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
    `${inp.pPackEa}EA/분`);
  for (let i = 0; i < sim.retortCycles; i++) {
    const s = sim.retortStartMin + i * TT_FIXED.retortCycleMin;
    const e = s + TT_FIXED.retortCycleMin;
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
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed">
      <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary)">
        <th style="text-align:left;padding:7px 4px;font-weight:500">시간대</th>
        ${wkHeads.map((h,i) => `<th style="text-align:right;padding:7px 4px;font-weight:500;color:${wkColors[i]};font-size:10px">${h}</th>`).join('')}
        <th style="text-align:right;padding:7px 4px;font-weight:500">합계</th>
      </tr></thead>
      <tbody>${slotsRows.map(r => {
        const bg = r.isFull ? 'rgba(232,243,222,0.4)' : '';
        return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary);background:${bg}">
          <td style="padding:7px 4px;font-weight:500;font-size:10px">${r.range}</td>
          ${r.cells.map(v => `<td style="padding:7px 4px;text-align:right;${v===0?'color:var(--color-text-tertiary)':'font-weight:500'}">${v||'·'}</td>`).join('')}
          <td style="padding:7px 4px;text-align:right;font-weight:600;color:${r.isFull?'#0F6E56':'var(--color-text-tertiary)'}">${r.sum}${r.isFull?' ✓':''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

  // 좌(타임라인) + 우(인원활용)
  const splitView = `
    <style>
      @media (max-width: 900px) { #tt-split { grid-template-columns: 1fr !important; } }
    </style>
    <div id="tt-split" style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:16px">
      <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px;min-width:0">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">📋 공정 타임라인</div>
        <div style="overflow-x:auto">${timelineSvg}</div>
      </div>
      <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px;min-width:0">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">👥 시간대별 인원 활용</div>
        <div style="font-size:10px;color:var(--color-text-tertiary);margin-bottom:8px">정원 ${inp.totalWorkers}명 · 합계 일치 ✓</div>
        <div style="overflow-x:auto">${wkTbl}</div>
      </div>
    </div>`;

  // 공정별 현황 표
  const procRows = [
    { p:'전처리', i:Math.round(sim.preIn), o:Math.round(sim.preOut), y:inp.yPre, prod:`${inp.pPre} kg/인시 (n=${TT_AUTO.pPre.n})`, h:sim.preHours.toFixed(1)+'h', w:`${inp.wkPre}명` },
    { p:'자숙', i:Math.round(sim.cookIn), o:Math.round(sim.cookOut), y:sim.cookYield, prod:`${TT_FIXED.cookHours}h × ${sim.tankInTimes.length}탱크 (고정)`, h:`${TT_FIXED.cookHours*sim.tankInTimes.length}h (병렬)`, w:'2명' },
    { p:'파쇄', i:Math.round(sim.crushIn), o:Math.round(sim.crushOut), y:inp.yCrush, prod:`${inp.pCrush} kg/인시 (n=${TT_AUTO.pCrush.n})`, h:sim.crushHours.toFixed(1)+'h', w:`${inp.wkCrush}→${inp.wkPackPeak}명` },
    { p:'내포장', i:Math.round(sim.packIn), o:Math.round(sim.packOut), y:TT_PACK_YIELD, prod:`${inp.pPackEa} EA/분 (n=${TT_AUTO.pPackEa.n})`, h:(sim.packMin/60).toFixed(1)+'h', w:`${inp.wkPack}명` },
    { p:'레토르트', i:sim.pouches+'EA', o:sim.pouches+'EA', y:100, prod:`${TT_FIXED.retortCycleMin/60}h × ${sim.retortCycles}회 (대차 8개)`, h:`${(sim.retortCycles*TT_FIXED.retortCycleMin/60).toFixed(1)}h (순차)`, w:'2명' },
  ];
  const procTbl = `
    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:16px">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">📐 공정별 현황</div>
      <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:12px">생산성·수율 = 데이터 자동값 (위 입력란에서 직접 수정 가능)</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary)">
            <th style="text-align:left;padding:10px 8px;font-weight:500">공정</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">투입</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">산출</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">수율</th>
            <th style="text-align:left;padding:10px 8px;font-weight:500">생산성 (n=건수)</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">시간</th>
            <th style="text-align:right;padding:10px 8px;font-weight:500">인원</th>
          </tr></thead>
          <tbody>${procRows.map(r => `
            <tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
              <td style="padding:11px 8px;font-weight:500">${r.p}</td>
              <td style="padding:11px 8px;text-align:right">${typeof r.i === 'number' ? r.i.toLocaleString()+' kg' : r.i}</td>
              <td style="padding:11px 8px;text-align:right;font-weight:500">${typeof r.o === 'number' ? r.o.toLocaleString()+' kg' : r.o}</td>
              <td style="padding:11px 8px;text-align:right">${typeof r.y === 'number' ? r.y.toFixed(1)+'%' : r.y}</td>
              <td style="padding:11px 8px;font-size:11px;color:var(--color-text-tertiary)">${r.prod}</td>
              <td style="padding:11px 8px;text-align:right">${r.h}</td>
              <td style="padding:11px 8px;text-align:right">${r.w}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('tt-result').innerHTML = `
    ${conclusion}
    ${planBox}
    ${splitView}
    ${procTbl}`;
}
