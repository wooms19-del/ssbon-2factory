// timetable.js — 공정 타임테이블 플래너 (관리자 전용 PIN 잠금)

const TT_PIN = '1234'; // 기본 PIN — 변경 원하시면 말씀해주세요
const TT_ACTIVE = { tr: false, sg: false, mn: false };

// ── Firestore 튜닝값 (회사 전체 1곳 관리, 다중 디바이스 동기) ──────
// 컬렉션: _config / 문서: timetable_settings
// 모든 디바이스가 onSnapshot으로 실시간 동기. localStorage 사용 안 함.
const TT_DEFAULTS = {
  // 수율 (%)
  yPre: 89.3, yCook: 56.8, yCrush: 96.1, yPack: 99.8,
  // 생산성 (kg/인시 등)
  pPre: 48.2, pCrush: 17.2, pPackEa: 8,
  // 자숙 사이클 (분)
  cookMin: 240, wagonMin: 30,
  // 탱크
  tankKg: 750,
  // 점심 (시작분, 종료분)
  lunch1Start: 690, lunch1End: 750,   // 11:30~12:30
  lunch2Start: 750, lunch2End: 810,   // 12:30~13:30
};
let TT_TUNING = { ...TT_DEFAULTS };

async function ttLoadTuning() {
  try {
    const doc = await db.collection('_config').doc('timetable_settings').get();
    if (doc.exists) {
      TT_TUNING = { ...TT_DEFAULTS, ...doc.data() };
    }
  } catch (e) {
    console.error('[TT] 튜닝값 로드 실패:', e);
  }
  ttFillTuningInputs();
}

async function ttSaveTuning() {
  // 입력 폼에서 값 수집
  const get = (id, def) => {
    const v = parseFloat(document.getElementById(id)?.value);
    return isFinite(v) ? v : def;
  };
  TT_TUNING = {
    yPre:    get('tt-y-pre',    TT_DEFAULTS.yPre),
    yCook:   get('tt-y-cook',   TT_DEFAULTS.yCook),
    yCrush:  get('tt-y-crush',  TT_DEFAULTS.yCrush),
    yPack:   get('tt-y-pack',   TT_DEFAULTS.yPack),
    pPre:    get('tt-p-pre',    TT_DEFAULTS.pPre),
    pCrush:  get('tt-p-crush',  TT_DEFAULTS.pCrush),
    pPackEa: get('tt-p-pack',   TT_DEFAULTS.pPackEa),
    cookMin: get('tt-cook-min', TT_DEFAULTS.cookMin),
    wagonMin:get('tt-wagon-min',TT_DEFAULTS.wagonMin),
    tankKg:  get('tt-tank-kg',  TT_DEFAULTS.tankKg),
    lunch1Start: TT_TUNING.lunch1Start, lunch1End: TT_TUNING.lunch1End,
    lunch2Start: TT_TUNING.lunch2Start, lunch2End: TT_TUNING.lunch2End,
  };
  try {
    await db.collection('_config').doc('timetable_settings').set({
      ...TT_TUNING,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    if (typeof toast === 'function') toast('저장됨 · 모든 디바이스에 반영','s');
    ttRenderReport();
  } catch (e) {
    console.error('[TT] 튜닝값 저장 실패:', e);
    if (typeof toast === 'function') toast('저장 실패','d');
  }
}

function ttFillTuningInputs() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('tt-y-pre',    TT_TUNING.yPre);
  set('tt-y-cook',   TT_TUNING.yCook);
  set('tt-y-crush',  TT_TUNING.yCrush);
  set('tt-y-pack',   TT_TUNING.yPack);
  set('tt-p-pre',    TT_TUNING.pPre);
  set('tt-p-crush',  TT_TUNING.pCrush);
  set('tt-p-pack',   TT_TUNING.pPackEa);
  set('tt-cook-min', TT_TUNING.cookMin);
  set('tt-wagon-min',TT_TUNING.wagonMin);
  set('tt-tank-kg',  TT_TUNING.tankKg);
}

function ttResetTuning() {
  if (!confirm('튜닝값을 기본값(실측 기준)으로 되돌리시겠습니까?')) return;
  TT_TUNING = { ...TT_DEFAULTS };
  ttFillTuningInputs();
  ttSaveTuning();
}

// ── 누적 데이터 자동 분석 ────────────────────────────────
// 기간 + 원육 종류 필터 → 수율·생산성 평균 + 데이터 건수(n)
async function ttAutoAnalyze() {
  const period = document.getElementById('tt-aa-period')?.value || 'all';
  const meatType = document.getElementById('tt-aa-meat')?.value || '홍두깨';
  const fromInp = document.getElementById('tt-aa-from')?.value;
  const toInp = document.getElementById('tt-aa-to')?.value;
  const result = document.getElementById('tt-aa-result');
  if (result) result.innerHTML = '<div style="color:var(--color-text-secondary);font-size:12px">분석 중…</div>';

  // 기간 결정
  let fromDate, toDate;
  const today = new Date();
  const fmt = d => d.toISOString().slice(0,10);
  if (period === 'all') {
    fromDate = '2020-01-01';
    toDate = fmt(today);
  } else if (period === 'month') {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    fromDate = fmt(d);
    toDate = fmt(today);
  } else if (period === 'last30') {
    const d = new Date(today); d.setDate(d.getDate() - 30);
    fromDate = fmt(d);
    toDate = fmt(today);
  } else if (period === 'custom') {
    fromDate = fromInp;
    toDate = toInp;
    if (!fromDate || !toDate) {
      if (result) result.innerHTML = '<div style="color:#A32D2D;font-size:12px">시작/종료 날짜를 모두 입력해주세요</div>';
      return;
    }
  }

  try {
    // 4개 컬렉션 병렬 조회 (Firestore 컬렉션 전체 가져온 후 클라에서 필터)
    const [preDocs, cookDocs, crushDocs, packDocs] = await Promise.all([
      db.collection('preprocess').get(),
      db.collection('cooking').get(),
      db.collection('shredding').get(),
      db.collection('packing').get(),
    ]);

    const inRange = d => d >= fromDate && d <= toDate;
    const matchType = r => !meatType || (r.type && r.type === meatType);
    const minutesBetween = (s, e) => {
      if (!s || !e) return 0;
      const [sh, sm] = String(s).split(':').map(Number);
      const [eh, em] = String(e).split(':').map(Number);
      let diff = (eh*60+em) - (sh*60+sm);
      if (diff < 0) diff += 24*60;
      return diff;
    };

    // 전처리 누적 (원육 종류 필터)
    let preInSum=0, preOutSum=0, prePersonHours=0, preN=0;
    preDocs.forEach(doc => {
      const r = doc.data();
      if (!inRange(r.date)) return;
      if (!matchType(r)) return;
      const kg = +r.kg||0, waste = +r.waste||0, w = +r.workers||0;
      const m = minutesBetween(r.start, r.end);
      if (kg <= 0 || w <= 0 || m <= 0) return;
      preInSum += kg;
      preOutSum += (kg - waste);
      prePersonHours += w * (m/60);
      preN++;
    });

    // 파쇄 누적 (shredding은 type 필드 없을 수 있음 → wagonIn/wagonOut으로 추적 어려움)
    // → 파쇄는 필터 없이 전체 사용 (사용자분 시스템 데이터 구조상 부득이)
    let crushInSum=0, crushOutSum=0, crushPersonHours=0, crushN=0;
    crushDocs.forEach(doc => {
      const r = doc.data();
      if (!inRange(r.date)) return;
      const kg = +r.kg||0, waste = +r.waste||0, w = +r.workers||0;
      const m = minutesBetween(r.start, r.end);
      if (kg <= 0 || w <= 0 || m <= 0) return;
      crushInSum += kg;
      crushOutSum += (kg - waste);
      crushPersonHours += w * (m/60);
      crushN++;
    });

    // 내포장 누적 (FC 3kg 제품으로 필터링 — 홍두깨 선택 시)
    let packEaSum = 0, packMins = 0, packN = 0;
    const packProductFilter = (r) => {
      if (!meatType) return true;
      if (meatType === '홍두깨') return (r.product||'').includes('FC') || (r.product||'').includes('3kg') || (r.product||'').includes('3KG');
      return true;  // 우둔/설도는 모든 제품
    };
    packDocs.forEach(doc => {
      const r = doc.data();
      if (!inRange(r.date)) return;
      if (!packProductFilter(r)) return;
      const ea = +r.ea||0;
      const m = minutesBetween(r.start, r.end);
      if (ea <= 0 || m <= 0) return;
      packEaSum += ea;
      packMins += m;
      packN++;
    });

    // 자숙은 사이클 4시간(240분) 고정 — 자동 계산 안 함
    const calc = {
      yPre:    { val: preInSum > 0 ? +(preOutSum/preInSum*100).toFixed(1) : null, n: preN, formula: `(투입${preInSum.toFixed(0)}-비가식부) ÷ 투입 × 100` },
      yCrush:  { val: crushInSum > 0 ? +(crushOutSum/crushInSum*100).toFixed(1) : null, n: crushN, formula: `(투입${crushInSum.toFixed(0)}-비가식부) ÷ 투입 × 100` },
      pPre:    { val: prePersonHours > 0 ? +(preInSum/prePersonHours).toFixed(1) : null, n: preN, formula: `${preInSum.toFixed(0)}kg ÷ ${prePersonHours.toFixed(1)}인시` },
      pCrush:  { val: crushPersonHours > 0 ? +(crushInSum/crushPersonHours).toFixed(1) : null, n: crushN, formula: `${crushInSum.toFixed(0)}kg ÷ ${crushPersonHours.toFixed(1)}인시` },
      pPackEa: { val: packMins > 0 ? +(packEaSum/packMins).toFixed(1) : null, n: packN, formula: `${packEaSum.toFixed(0)}EA ÷ ${packMins.toFixed(0)}분` },
    };

    // 결과 표시
    const items = [
      { label:'전처리 수율', cur:TT_TUNING.yPre,    info:calc.yPre,    unit:'%', inputId:'tt-y-pre' },
      { label:'파쇄 수율',  cur:TT_TUNING.yCrush,  info:calc.yCrush,  unit:'%', inputId:'tt-y-crush' },
      { label:'전처리 생산성', cur:TT_TUNING.pPre, info:calc.pPre, unit:'kg/인시', inputId:'tt-p-pre' },
      { label:'파쇄 생산성',   cur:TT_TUNING.pCrush, info:calc.pCrush, unit:'kg/인시', inputId:'tt-p-crush' },
      { label:'내포장 생산성', cur:TT_TUNING.pPackEa, info:calc.pPackEa, unit:'EA/분', inputId:'tt-p-pack' },
    ];

    const totalN = preN + crushN + packN;
    const sampleTxt = totalN > 0
      ? `<span style="color:var(--color-text-secondary);font-size:12px">📊 <strong>${meatType}</strong> 데이터 분석 — 전처리 <strong>n=${preN}</strong>건 · 파쇄 <strong>n=${crushN}</strong>건 · 내포장 <strong>n=${packN}</strong>건</span>`
      : `<span style="color:#A32D2D;font-size:12px">⚠ 해당 기간/원육종류 데이터가 부족합니다</span>`;

    const tbl = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px">
        <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary)">
          <th style="text-align:left;padding:9px 8px;font-weight:500;color:var(--color-text-secondary)">항목</th>
          <th style="text-align:right;padding:9px 8px;font-weight:500;color:var(--color-text-secondary)">현재값</th>
          <th style="text-align:right;padding:9px 8px;font-weight:500;color:var(--color-text-secondary)">분석값 (n=건수)</th>
          <th style="text-align:left;padding:9px 8px;font-weight:500;color:var(--color-text-secondary)">근거</th>
          <th style="text-align:right;padding:9px 8px;font-weight:500;color:var(--color-text-secondary)">적용</th>
        </tr></thead>
        <tbody>${items.map(it=>{
          const hasNew = it.info.val !== null && isFinite(it.info.val);
          const diff = hasNew ? (it.info.val - it.cur) : 0;
          const diffColor = Math.abs(diff) < 0.1 ? 'var(--color-text-tertiary)' : (diff > 0 ? '#0F6E56' : '#A32D2D');
          const diffArrow = Math.abs(diff) < 0.1 ? '' : (diff > 0 ? ' ▲' : ' ▼');
          return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
            <td style="padding:10px 8px;font-weight:500">${it.label}</td>
            <td style="padding:10px 8px;text-align:right;color:var(--color-text-secondary)">${it.cur} ${it.unit}</td>
            <td style="padding:10px 8px;text-align:right;font-weight:500;color:${hasNew?diffColor:'var(--color-text-tertiary)'}">
              ${hasNew ? `${it.info.val} ${it.unit}<span style="font-size:10px;color:var(--color-text-tertiary);font-weight:400">${diffArrow} (n=${it.info.n})</span>` : '데이터 없음'}
            </td>
            <td style="padding:10px 8px;font-size:10px;color:var(--color-text-tertiary)">${hasNew ? it.info.formula : '-'}</td>
            <td style="padding:10px 8px;text-align:right">
              ${hasNew ? `<button onclick="ttApplyAuto('${it.inputId}', ${it.info.val})" style="padding:5px 12px;font-size:11px;background:#185FA5;border:none;border-radius:4px;cursor:pointer;color:#fff">적용</button>` : '-'}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button onclick="ttApplyAllAuto(${JSON.stringify(items.filter(i=>i.info.val!==null&&isFinite(i.info.val)).map(i=>({id:i.inputId,v:i.info.val}))).replace(/"/g,'&quot;')})" style="padding:8px 16px;font-size:12px;background:#0F6E56;border:none;border-radius:6px;cursor:pointer;color:#fff;font-weight:500">전부 적용</button>
      </div>`;

    if (result) {
      result.innerHTML = `<div style="margin-bottom:8px">${sampleTxt}</div>${tbl}`;
    }
  } catch (e) {
    console.error('[TT] 자동 분석 실패:', e);
    if (result) result.innerHTML = `<div style="color:#A32D2D;font-size:12px">분석 실패: ${e.message}</div>`;
  }
}

function ttApplyAuto(inputId, val) {
  const el = document.getElementById(inputId);
  if (el) {
    el.value = val;
    el.style.background = '#E8F3DE';
    setTimeout(() => { el.style.background = ''; }, 1500);
  }
}

function ttApplyAllAuto(list) {
  list.forEach(it => ttApplyAuto(it.id, it.v));
  if (typeof toast === 'function') toast('적용됨 · 저장 버튼 눌러주세요','s');
}

function ttToggleCustomDate() {
  const sel = document.getElementById('tt-aa-period');
  const cust = document.getElementById('tt-aa-custom');
  if (sel && cust) cust.style.display = sel.value === 'custom' ? 'flex' : 'none';
}

// ── PIN 체크 ─────────────────────────────────────────────
function ttCheckPin() {
  const v = document.getElementById('tt-pin-input').value;
  if (v.length < 4) return;
  if (v === TT_PIN) {
    document.getElementById('tt-lock').style.display = 'none';
    document.getElementById('tt-main').style.display = 'block';
    document.getElementById('tt-pin-err').style.display = 'none';
    ttLoadTuning().then(() => { ttGo(); ttRenderReport(); });
  } else {
    document.getElementById('tt-pin-err').style.display = 'block';
    document.getElementById('tt-pin-input').value = '';
  }
}

// ── 제품 토글 ────────────────────────────────────────────
function ttToggle(k) {
  TT_ACTIVE[k] = !TT_ACTIVE[k];
  const card = document.getElementById('tt-pc-' + k);
  const sel  = document.getElementById('tt-src-' + k);
  card.classList.toggle('tt-on', TT_ACTIVE[k]);
  sel.style.display = TT_ACTIVE[k] ? 'block' : 'none';
  ttGo();
}

// ── 탭 전환 ──────────────────────────────────────────────
function ttTab(id, el) {
  ['tl','dt','rp','tn'].forEach(p => {
    const pane = document.getElementById('tt-pane-' + p);
    if (pane) pane.style.display = p === id ? 'block' : 'none';
  });
  document.querySelectorAll('.tt-tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  if (id === 'rp') ttRenderReport();
}

// ── 유틸 ─────────────────────────────────────────────────
function ttFmt(m) {
  const h = Math.floor(m / 60) % 24, n = m % 60;
  return `${String(h).padStart(2,'0')}:${String(n).padStart(2,'0')}`;
}
function ttDur(m) {
  const h = Math.floor(m / 60), n = m % 60;
  return h ? (n ? `${h}시간 ${n}분` : `${h}시간`) : `${n}분`;
}

// ── 메인 계산 + 렌더 ─────────────────────────────────────
function ttGo() {
  const hd = +document.getElementById('tt_hd').value || 0;
  const ud = +document.getElementById('tt_ud').value || 0;
  const wk = +document.getElementById('tt_wk').value || 7;
  const [sh, sm] = document.getElementById('tt_st').value.split(':').map(Number);
  const S = sh * 60 + sm;

  // 생산성 (실측 기반)
  const PP_HD = 44.8, PP_UD = 67.5;
  const CK_MIN = 190;
  const PK_HD = 44.83, PK_UD = 48.17;

  // 전처리
  const pp_hd_min = Math.round(hd / (PP_HD * wk) * 60);
  const pp_ud_min = Math.round(ud / (PP_UD * wk) * 60);
  const pp_hd_e = S + pp_hd_min;
  const pp_ud_e = S + pp_ud_min;

  // 자숙
  const ck_hd_s = pp_hd_e, ck_hd_e = ck_hd_s + CK_MIN;
  const ck_ud_s = pp_ud_e, ck_ud_e = ck_ud_s + CK_MIN;
  const ck_hd_out = Math.round(hd * 0.90);
  const ck_ud_out = Math.round(ud * 0.55);

  // 파쇄
  const sh_min = Math.max(30, Math.round(ck_hd_out * 0.08));
  const sh_s = ck_hd_e, sh_e = sh_s + sh_min;
  const sh_out = Math.round(ck_hd_out * 0.974);

  // 제품 목록
  const getV = id => {
    const el = document.getElementById(id);
    return el ? el.value : 'ud';
  };
  const PRODS = [
    { key:'fc', name:'FC 3KG',         g:3000, rt_ea:380,  rt_min:150, src:'hd',           on:true  },
    { key:'tr', name:'트레이더스 460g', g:460,  rt_ea:380,  rt_min:120, src:getV('tt-src-tr'), on:TT_ACTIVE.tr },
    { key:'sg', name:'시그니처 130g',   g:130,  rt_ea:1024, rt_min:120, src:getV('tt-src-sg'), on:TT_ACTIVE.sg },
    { key:'mn', name:'미니 70g×5',      g:350,  rt_ea:1280, rt_min:120, src:getV('tt-src-mn'), on:TT_ACTIVE.mn },
  ].filter(p => p.on);

  // 산출량 풀
  let hd_pool = sh_out, ud_pool = ck_ud_out;
  const prodResults = [];
  PRODS.forEach(p => {
    const kg = p.src === 'hd' ? hd_pool : ud_pool;
    const ea = Math.round(kg / p.g * 1000);
    const pk_rate = p.src === 'hd' ? PK_HD : PK_UD;
    const pk_min = Math.round(kg / (pk_rate * wk) * 60);
    const pk_s = p.src === 'hd' ? sh_e : ck_ud_e;
    const pk_e = pk_s + pk_min;
    const rt_cycles = Math.ceil(ea / p.rt_ea);
    const rt_s = pk_e;
    const rt_e = rt_s + rt_cycles * p.rt_min;
    if (p.src === 'hd') hd_pool = 0; else ud_pool = 0;
    prodResults.push({ ...p, kg, ea, pk_min, pk_s, pk_e, rt_cycles, rt_s, rt_e });
  });

  const total_end = Math.max(...prodResults.map(p => p.rt_e), sh_e, ck_ud_e);

  // 축 범위 (30분 단위)
  const T0 = Math.floor((S - 30) / 30) * 30;
  const T1 = Math.ceil((total_end + 30) / 30) * 30;
  const SPAN = T1 - T0;

  // 축
  const axis = document.getElementById('tt-axis');
  axis.innerHTML = '';
  for (let m = T0; m <= T1; m += 30) {
    const t = document.createElement('span');
    t.style.cssText = `position:absolute;font-size:10px;transform:translateX(-50%);color:${m%60===0?'var(--color-text-primary)':'var(--color-text-secondary)'};font-weight:${m%60===0?'500':'400'}`;
    t.style.left = ((m - T0) / SPAN * 100) + '%';
    t.textContent = ttFmt(m);
    axis.appendChild(t);
  }

  // 타임라인 행 (0kg 항목은 제외)
  const ROWS = [
    hd > 0 && { name:'전처리 (홍두깨)', s:S,       e:pp_hd_e, bg:'#378ADD', lbl:`${ttFmt(S)}~${ttFmt(pp_hd_e)} · ${hd}kg` },
    ud > 0 && { name:'전처리 (우둔)',   s:S,       e:pp_ud_e, bg:'#378ADD', lbl:`${ttFmt(S)}~${ttFmt(pp_ud_e)} · ${ud}kg` },
    hd > 0 && { name:'자숙 (홍두깨)',  s:ck_hd_s, e:ck_hd_e, bg:'#1D9E75', lbl:`${ttFmt(ck_hd_s)}~${ttFmt(ck_hd_e)} → ${ck_hd_out}kg` },
    ud > 0 && { name:'자숙 (우둔)',    s:ck_ud_s, e:ck_ud_e, bg:'#1D9E75', lbl:`${ttFmt(ck_ud_s)}~${ttFmt(ck_ud_e)} → ${ck_ud_out}kg` },
    hd > 0 && { name:'파쇄',           s:sh_s,    e:sh_e,    bg:'#EF9F27', lbl:`${ttFmt(sh_s)}~${ttFmt(sh_e)} → ${sh_out}kg` },
    ...prodResults.map(p => ({ name:`내포장 (${p.name})`,   s:p.pk_s, e:p.pk_e, bg:'#534AB7', lbl:`${ttFmt(p.pk_s)}~${ttFmt(p.pk_e)} · ${p.ea}EA` })),
    ...prodResults.map(p => ({ name:`레토르트 (${p.name})`, s:p.rt_s, e:p.rt_e, bg:'#D85A30', lbl:`${p.rt_cycles}대차 · ${ttFmt(p.rt_s)}~${ttFmt(p.rt_e)}` })),
  ].filter(Boolean);

  const cont = document.getElementById('tt-rows');
  cont.innerHTML = '';
  ROWS.forEach(r => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;margin-bottom:3px;min-height:30px';
    const nm = document.createElement('div');
    nm.style.cssText = 'width:130px;flex-shrink:0;font-size:11px;color:var(--color-text-secondary);text-align:right;padding-right:8px;line-height:1.3';
    nm.textContent = r.name;
    const track = document.createElement('div');
    track.style.cssText = 'position:relative;flex:1;min-width:500px;height:26px;background:var(--color-background-secondary);border-radius:4px';
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;height:100%;border-radius:4px;display:flex;align-items:center;overflow:hidden;background:${r.bg}`;
    bar.style.left = ((r.s - T0) / SPAN * 100) + '%';
    bar.style.width = Math.max(((r.e - r.s) / SPAN * 100), 0.5) + '%';
    bar.title = r.lbl;
    const sp = document.createElement('span');
    sp.style.cssText = 'font-size:10px;font-weight:500;color:#fff;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none';
    sp.textContent = r.lbl;
    bar.appendChild(sp);
    track.appendChild(bar);
    row.appendChild(nm);
    row.appendChild(track);
    cont.appendChild(row);
  });

  // 종료 배지
  document.getElementById('tt-badge').innerHTML =
    `<span style="display:inline-block;background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-radius:99px;padding:4px 14px;font-size:12px;font-weight:500;color:var(--color-text-primary)">예상 종료 ${ttFmt(total_end)} · 총 ${ttDur(total_end - S)}</span>`;

  // 공정별 상세 카드 (0kg 항목은 제외)
  const fixed = [
    hd > 0 && { name:'전처리 홍두깨', time:`${ttFmt(S)} ~ ${ttFmt(pp_hd_e)}`,       sub:`${ttDur(pp_hd_min)} · ${hd}kg 투입`,                  color:'#378ADD' },
    ud > 0 && { name:'전처리 우둔',   time:`${ttFmt(S)} ~ ${ttFmt(pp_ud_e)}`,       sub:`${ttDur(pp_ud_min)} · ${ud}kg 투입`,                   color:'#378ADD' },
    hd > 0 && { name:'자숙 홍두깨',  time:`${ttFmt(ck_hd_s)} ~ ${ttFmt(ck_hd_e)}`, sub:`${ttDur(CK_MIN)} · 산출 ${ck_hd_out}kg (수율 90%)`,   color:'#1D9E75' },
    ud > 0 && { name:'자숙 우둔',    time:`${ttFmt(ck_ud_s)} ~ ${ttFmt(ck_ud_e)}`, sub:`${ttDur(CK_MIN)} · 산출 ${ck_ud_out}kg (수율 55%)`,   color:'#1D9E75' },
    hd > 0 && { name:'파쇄',          time:`${ttFmt(sh_s)} ~ ${ttFmt(sh_e)}`,       sub:`${ttDur(sh_min)} · 산출 ${sh_out}kg (수율 97%)`,       color:'#EF9F27' },
  ].filter(Boolean);
  const prodCards = prodResults.flatMap(p => [
    { name:`내포장 ${p.name}`,   time:`${ttFmt(p.pk_s)} ~ ${ttFmt(p.pk_e)}`, sub:`${ttDur(p.pk_min)} · ${p.kg}kg → ${p.ea}EA`,                        color:'#534AB7' },
    { name:`레토르트 ${p.name}`, time:`${ttFmt(p.rt_s)} ~ ${ttFmt(p.rt_e)}`, sub:`${p.rt_cycles}대차 × ${p.rt_min}분 · 대차당 ${p.rt_ea}EA`,            color:'#D85A30' },
  ]);

  document.getElementById('tt-cards').innerHTML = [...fixed, ...prodCards].map(c =>
    `<div style="background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-left:3px solid ${c.color};border-radius:8px;padding:10px 12px">
      <div style="font-size:10px;color:var(--color-text-secondary);margin-bottom:3px">${c.name}</div>
      <div style="font-size:13px;font-weight:500;color:var(--color-text-primary)">${c.time}</div>
      <div style="font-size:10px;color:var(--color-text-secondary);margin-top:2px;line-height:1.5">${c.sub}</div>
    </div>`
  ).join('');

  document.getElementById('tt-note').innerHTML =
    `예상 종료 <strong>${ttFmt(total_end)}</strong> · 총 ${ttDur(total_end - S)}<br>
    생산성 기준 — 전처리 홍두깨 ${PP_HD} kg/인시 · 우둔 ${PP_UD} kg/인시 · 내포장 FC ${PK_HD} kg/인시 · 시그니처 ${PK_UD} kg/인시`;
}

// ============================================================
// 의사결정 보고서 (데이터 기반)
// 입력: 원육 종류·kg + 인원 + 시작 + 목표 종료(선택)
// 출력: 결론 박스 + 공정별 필요 인원 계산 + 병목 진단 + 해결책
// ============================================================

function ttRenderReport() {
  const rpPane = document.getElementById('tt-pane-rp');
  if (!rpPane) return;

  // ─ 입력값 ──────────────────────────────────────────────
  const meatType = document.getElementById('tt_meat')?.value || '홍두깨';
  const hd = +document.getElementById('tt_hd').value || 0;
  const ud = +document.getElementById('tt_ud').value || 0;
  const totalWorkers = +document.getElementById('tt_wk').value || 28;
  const startTime = document.getElementById('tt_st').value || '05:00';
  const target = document.getElementById('tt_target').value || '';

  // 활성 원육 = 입력값에 따라
  const meatKg = meatType === '홍두깨' ? hd : (meatType === '우둔' ? ud : 0);
  const T = TT_TUNING;

  if (meatKg <= 0) {
    rpPane.innerHTML = `
      <div style="background:var(--color-background-secondary);border-radius:12px;padding:30px;text-align:center;color:var(--color-text-secondary);font-size:13px">
        ${meatType} 원육량을 입력해주세요
      </div>`;
    return;
  }

  // ─ 공정별 산출 (수율 체인) ─────────────────────────────
  const preIn = meatKg;
  const preOut  = Math.round(preIn  * T.yPre   / 100);
  const cookIn  = preOut;
  const cookOut = Math.round(cookIn * T.yCook  / 100);
  const crushIn = cookOut;
  const crushOut= Math.round(crushIn* T.yCrush / 100);
  const packIn  = crushOut;
  const packOut = Math.round(packIn * T.yPack  / 100);
  const pouches = Math.round(packOut / 1.35);

  // ─ 시작 시각 분 단위 ───────────────────────────────────
  const [sh, sm] = startTime.split(':').map(Number);
  const startMin = sh*60 + sm;

  // ─ 현재 인원 가정 (자동 분배: 28명 = 외국인 7 + 한국인 19 + 관리 2) ─
  // 시간대별로 다르게 배치되지만, 보고서 계산용으로는 대표 인원 사용
  const curWorkers = {
    pre: Math.min(10, Math.floor(totalWorkers * 0.36)),  // 전처리 10명 (28명 기준)
    crush: Math.min(18, Math.floor(totalWorkers * 0.64)), // 파쇄 최대 18명
    pack: Math.min(8, Math.floor(totalWorkers * 0.28)),   // 내포장 8명
  };

  // ─ 시나리오 1: 현재 인원으로 종료 시각 계산 ─────────────
  // 전처리: preIn / (pPre × 인원)
  const preHours = preIn / (T.pPre * curWorkers.pre);
  const preEndMin = startMin + Math.round(preHours * 60);
  // 자숙: 4시간 × 회차 (병렬 가능, 마지막 회차 종료 = 전처리 종료 + 4시간)
  const cookCycles = Math.ceil(preIn / T.tankKg);
  const cookEndMin = preEndMin + T.cookMin + T.wagonMin;
  // 파쇄: crushIn / (pCrush × 인원), 자숙 종료 후 시작
  const crushHours = crushIn / (T.pCrush * curWorkers.crush);
  const crushStartMin = cookEndMin;
  const crushEndMin = crushStartMin + Math.round(crushHours * 60);
  // 내포장: pouches / (pPackEa EA/분)
  const packMin = pouches / T.pPackEa;
  const packStartMin = crushStartMin + 60;  // 파쇄 1시간 후 시작 (분리)
  const packEndMin = packStartMin + Math.round(packMin);
  // 최종 = max(파쇄 종료, 내포장 종료)
  const finalEndMin = Math.max(crushEndMin, packEndMin);

  const fmtT = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(Math.round(m%60)).padStart(2,'0')}`;
  const dur = m => {
    const h = Math.floor(m/60), n = m%60;
    return h ? `${h}시간 ${n}분` : `${n}분`;
  };

  // ─ 시나리오 2: 목표 시간 입력 시 → 역산 분석 ──────────
  let targetAnalysis = null;
  if (target) {
    const [th, tm] = target.split(':').map(Number);
    const targetMin = th*60 + tm;
    // 가용 시간 (시작~목표)
    const availMin = targetMin - startMin;
    if (availMin > 0) {
      // 자숙·와건 고정 시간 차감
      const cookFixed = T.cookMin + T.wagonMin;  // 자숙 + 와건
      // 전처리 시간을 줄이려면 인원 늘려야 함
      // 파쇄·내포장은 자숙 후에 시작 → 가용 시간 = availMin - cookFixed - preTime
      // 단순화: 전처리는 자숙 첫 회차까지 끝나면 됨 (1.5시간 가정)
      const prePhase = Math.min(2.5, availMin/60 * 0.3) * 60;  // 전처리 phase 분
      const postCookPhase = availMin - prePhase - cookFixed;  // 자숙 종료 후 가용 시간
      // 필요 인원
      const preNeeded = Math.ceil(preIn / (T.pPre * (prePhase/60)));
      const crushNeeded = Math.ceil(crushIn / (T.pCrush * (postCookPhase/60)));
      const packEaPerMinNeeded = pouches / postCookPhase;
      const packNeeded = curWorkers.pack;  // 인원이 아니라 속도 문제
      const totalNeeded = preNeeded + crushNeeded + packNeeded + 2;  // +2 관리/이송

      targetAnalysis = {
        availMin, prePhase, postCookPhase,
        preNeeded, crushNeeded, packNeeded, packEaPerMinNeeded,
        totalNeeded,
        feasible: totalNeeded <= totalWorkers && packEaPerMinNeeded <= 10,
      };
    }
  }

  // ─ 결론 박스 ──────────────────────────────────────────
  const goodColor = '#0F6E56', badColor = '#A32D2D', warnColor = '#BA7517';
  let conclusionBox;
  if (target) {
    const [th, tm] = target.split(':').map(Number);
    const targetMin = th*60 + tm;
    const onTime = finalEndMin <= targetMin;
    const diff = finalEndMin - targetMin;
    if (onTime) {
      conclusionBox = `
        <div style="background:linear-gradient(135deg, #E8F3DE 0%, #f5fbef 100%);border:1px solid ${goodColor};border-radius:12px;padding:18px 22px;margin-bottom:16px">
          <div style="font-size:11px;color:${goodColor};font-weight:600;letter-spacing:0.5px;margin-bottom:6px">✅ 목표 달성 가능</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-text-primary);margin-bottom:4px">
            ${meatType} ${meatKg.toLocaleString()}kg → 약 ${pouches.toLocaleString()}개 · <strong style="color:${goodColor}">${fmtT(finalEndMin)} 종료</strong>
          </div>
          <div style="font-size:12px;color:var(--color-text-secondary)">
            목표 ${target} 대비 ${dur(Math.abs(diff))} 여유 · 현재 인원 ${totalWorkers}명으로 가능
          </div>
        </div>`;
    } else {
      conclusionBox = `
        <div style="background:linear-gradient(135deg, #FCEAEA 0%, #fef5f5 100%);border:1px solid ${badColor};border-radius:12px;padding:18px 22px;margin-bottom:16px">
          <div style="font-size:11px;color:${badColor};font-weight:600;letter-spacing:0.5px;margin-bottom:6px">⚠ 목표 시간 초과</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-text-primary);margin-bottom:4px">
            ${meatType} ${meatKg.toLocaleString()}kg → <strong style="color:${badColor}">${fmtT(finalEndMin)} 종료 예상</strong>
          </div>
          <div style="font-size:12px;color:var(--color-text-secondary)">
            목표 ${target} 대비 <strong style="color:${badColor}">${dur(diff)} 초과</strong> · 인원 보강 또는 생산성 개선 필요 (아래 해결책 참조)
          </div>
        </div>`;
    }
  } else {
    conclusionBox = `
      <div style="background:linear-gradient(135deg, #E6F1FB 0%, #f3f9fd 100%);border:1px solid #185FA5;border-radius:12px;padding:18px 22px;margin-bottom:16px">
        <div style="font-size:11px;color:#185FA5;font-weight:600;letter-spacing:0.5px;margin-bottom:6px">📊 현재 인원 기준 분석</div>
        <div style="font-size:18px;font-weight:600;color:var(--color-text-primary);margin-bottom:4px">
          ${meatType} ${meatKg.toLocaleString()}kg → 약 ${pouches.toLocaleString()}개 · <strong style="color:#185FA5">${fmtT(finalEndMin)} 종료</strong>
        </div>
        <div style="font-size:12px;color:var(--color-text-secondary)">
          시작 ${startTime} · ${totalWorkers}명 가동 · 총 ${dur(finalEndMin - startMin)}
        </div>
      </div>`;
  }

  // ─ 공정별 필요 인원 vs 현재 인원 표 ────────────────────
  // 표준 가동 시간 (기준): 전처리 ~3시간, 파쇄 ~5시간, 내포장 ~5시간
  const stdHours = { pre: 3, crush: 5, pack: 5 };
  const reqWorkers = {
    pre: Math.ceil(preIn / (T.pPre * stdHours.pre)),
    crush: Math.ceil(crushIn / (T.pCrush * stdHours.crush)),
    pack: Math.ceil(pouches / (T.pPackEa * stdHours.pack * 60)) || 1,  // EA/분 → 인당 처리량 추정
  };
  // 내포장은 인원수보다 라인 속도(EA/분)가 결정적 → 표시는 현재 그대로
  const procDataRows = [
    {
      name: '전처리',
      productivity: `${T.pPre} kg/인시`,
      formula: `${preIn.toLocaleString()}kg ÷ ${T.pPre} ÷ ${stdHours.pre}h`,
      required: reqWorkers.pre,
      current: curWorkers.pre,
      unit: '명',
    },
    {
      name: '파쇄',
      productivity: `${T.pCrush} kg/인시`,
      formula: `${crushIn.toLocaleString()}kg ÷ ${T.pCrush} ÷ ${stdHours.crush}h`,
      required: reqWorkers.crush,
      current: curWorkers.crush,
      unit: '명',
    },
    {
      name: '내포장 (속도)',
      productivity: `${T.pPackEa} EA/분`,
      formula: `${pouches.toLocaleString()}EA ÷ ${T.pPackEa}EA/분 ÷ 60 = ${(pouches/T.pPackEa/60).toFixed(1)}h`,
      required: '8명',
      current: curWorkers.pack + '명',
      unit: '',
      note: `포장 라인 속도 ${T.pPackEa}EA/분 (인원보다 라인 속도가 결정적)`,
    },
  ];

  const reqTbl = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary)">
        <th style="text-align:left;padding:10px 8px;font-weight:500">공정</th>
        <th style="text-align:left;padding:10px 8px;font-weight:500">기준 생산성 (설정값)</th>
        <th style="text-align:left;padding:10px 8px;font-weight:500;color:var(--color-text-secondary)">근거 계산식</th>
        <th style="text-align:right;padding:10px 8px;font-weight:500">필요</th>
        <th style="text-align:right;padding:10px 8px;font-weight:500">현재</th>
        <th style="text-align:right;padding:10px 8px;font-weight:500">차이</th>
      </tr></thead>
      <tbody>${procDataRows.map(r => {
        const reqNum = typeof r.required === 'number' ? r.required : parseInt(r.required) || 0;
        const curNum = typeof r.current === 'number' ? r.current : parseInt(r.current) || 0;
        const diff = curNum - reqNum;
        const status = diff >= 0 ? '✓ 충족' : `${diff} 부족`;
        const statusColor = diff >= 0 ? goodColor : badColor;
        return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
          <td style="padding:11px 8px;font-weight:500">${r.name}</td>
          <td style="padding:11px 8px">${r.productivity}</td>
          <td style="padding:11px 8px;font-size:11px;color:var(--color-text-tertiary);font-family:monospace">${r.formula}</td>
          <td style="padding:11px 8px;text-align:right;font-weight:500">${r.required}${r.unit}</td>
          <td style="padding:11px 8px;text-align:right;color:var(--color-text-secondary)">${r.current}${r.unit}</td>
          <td style="padding:11px 8px;text-align:right;font-weight:600;color:${statusColor}">${status}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <div style="font-size:10px;color:var(--color-text-tertiary);margin-top:8px;line-height:1.6">
      ※ 기준 가동시간: 전처리 ${stdHours.pre}h · 파쇄 ${stdHours.crush}h · 내포장 ${stdHours.pack}h
    </div>`;

  // ─ 병목 진단 ─────────────────────────────────────────
  const bottlenecks = [];
  if (curWorkers.crush < reqWorkers.crush) {
    bottlenecks.push({
      proc: '파쇄',
      issue: `필요 ${reqWorkers.crush}명 vs 현재 ${curWorkers.crush}명`,
      shortfall: reqWorkers.crush - curWorkers.crush,
      solution: `파쇄 인원 +${reqWorkers.crush - curWorkers.crush}명 → 총 ${reqWorkers.crush}명`,
      data: `생산성 ${T.pCrush}kg/인시 기준`,
    });
  }
  // 내포장: 8 EA/분이 가능 속도, 4 EA/분이면 부족
  if (T.pPackEa < pouches / (stdHours.pack * 60)) {
    const needed = Math.ceil(pouches / (stdHours.pack * 60) * 10) / 10;
    bottlenecks.push({
      proc: '내포장 라인 속도',
      issue: `현재 ${T.pPackEa}EA/분 → 필요 ${needed}EA/분`,
      shortfall: (needed - T.pPackEa).toFixed(1) + ' EA/분',
      solution: `포장 라인 속도 업그레이드 또는 작업자 숙련도 향상 필요`,
      data: `${pouches.toLocaleString()}EA를 ${stdHours.pack}시간 안에 처리 시`,
    });
  }

  let bottleneckBox = '';
  if (bottlenecks.length > 0) {
    bottleneckBox = `
      <div style="background:#FFF7ED;border:1px solid ${warnColor};border-radius:12px;padding:14px 18px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:600;color:${warnColor};margin-bottom:8px">⚠ 병목 지점 (${bottlenecks.length}개)</div>
        ${bottlenecks.map(b => `
          <div style="margin-bottom:10px;padding:10px;background:rgba(255,255,255,0.6);border-radius:6px">
            <div style="font-size:12px;font-weight:500;margin-bottom:3px">${b.proc}</div>
            <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">└ <strong>현황:</strong> ${b.issue}</div>
            <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">└ <strong>해결:</strong> ${b.solution}</div>
            <div style="font-size:10px;color:var(--color-text-tertiary)">└ 근거: ${b.data}</div>
          </div>
        `).join('')}
      </div>`;
  } else {
    bottleneckBox = `
      <div style="background:#E8F3DE;border:1px solid ${goodColor};border-radius:12px;padding:14px 18px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:600;color:${goodColor}">✓ 병목 없음 — 현재 인원·생산성으로 처리 가능</div>
      </div>`;
  }

  // ─ 공정별 산출 표 ─────────────────────────────────────
  const procStatusRows = [
    { p:'전처리', it:meatType, i:preIn,  o:preOut,  bg:Math.round(preIn*(100-T.yPre)/100), y:T.yPre,  h:preHours.toFixed(1)+'h', w:curWorkers.pre+'명', prod:T.pPre+' kg/인시' },
    { p:'자숙',  it:meatType, i:cookIn, o:cookOut, bg:'-', y:T.yCook+'%', h:`${(T.cookMin/60).toFixed(1)}h × ${cookCycles}회`, w:'2명', prod:T.tankKg+'kg/탱크' },
    { p:'파쇄',  it:meatType, i:crushIn,o:crushOut,bg:Math.round(crushIn*(100-T.yCrush)/100), y:T.yCrush+'%', h:crushHours.toFixed(1)+'h', w:curWorkers.crush+'명', prod:T.pCrush+' kg/인시' },
    { p:'내포장',it:meatType+'·FC 3KG', i:packIn, o:packOut, bg:'-', y:T.yPack+'%', h:(packMin/60).toFixed(1)+'h', w:curWorkers.pack+'명', prod:T.pPackEa+' EA/분' },
  ];

  const procStatusTbl = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary)">
        <th style="text-align:left;padding:9px 6px;font-weight:500">공정</th>
        <th style="text-align:left;padding:9px 6px;font-weight:500">품목</th>
        <th style="text-align:right;padding:9px 6px;font-weight:500">투입</th>
        <th style="text-align:right;padding:9px 6px;font-weight:500">산출</th>
        <th style="text-align:right;padding:9px 6px;font-weight:500">비가식부</th>
        <th style="text-align:right;padding:9px 6px;font-weight:500">수율</th>
        <th style="text-align:right;padding:9px 6px;font-weight:500">시간</th>
        <th style="text-align:right;padding:9px 6px;font-weight:500">인원</th>
      </tr></thead>
      <tbody>${procStatusRows.map(r=>`
        <tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
          <td style="padding:10px 6px;font-weight:500">${r.p}</td>
          <td style="padding:10px 6px">${r.it}</td>
          <td style="padding:10px 6px;text-align:right">${typeof r.i==='number'?r.i.toLocaleString():r.i}</td>
          <td style="padding:10px 6px;text-align:right;font-weight:500">${typeof r.o==='number'?r.o.toLocaleString():r.o}</td>
          <td style="padding:10px 6px;text-align:right;color:${r.bg==='-'?'var(--color-text-tertiary)':badColor}">${r.bg==='-'?'-':r.bg.toLocaleString()+'kg'}</td>
          <td style="padding:10px 6px;text-align:right;font-weight:500">${typeof r.y==='number'?r.y.toFixed(1)+'%':r.y}</td>
          <td style="padding:10px 6px;text-align:right">${r.h}</td>
          <td style="padding:10px 6px;text-align:right">${r.w}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  // ─ 종료시각 카드 ──────────────────────────────────────
  const endCards = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:12px">
      <div style="background:var(--color-background-secondary);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">전처리 종료</div>
        <div style="font-size:16px;font-weight:500">${fmtT(preEndMin)}</div>
      </div>
      <div style="background:var(--color-background-secondary);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">자숙 완료 (마지막)</div>
        <div style="font-size:16px;font-weight:500">${fmtT(cookEndMin)}</div>
      </div>
      <div style="background:var(--color-background-secondary);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">파쇄 종료</div>
        <div style="font-size:16px;font-weight:500">${fmtT(crushEndMin)}</div>
      </div>
      <div style="background:var(--color-background-secondary);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">내포장 종료</div>
        <div style="font-size:16px;font-weight:500;color:#7F77DD">${fmtT(packEndMin)}</div>
      </div>
    </div>`;

  // ─ 시간대별 인원 활용 표 (28명 시나리오) ────────────────
  const wkRows = [
    { t:'05:00~07:00', d:[7,'·','·','·','·','·','·','·','·'], sum:7,  hl:'' },
    { t:'07:00~09:00', d:[7,'·','·','·','·','·','·','·',2],   sum:9,  hl:'' },
    { t:'09:00~11:30', d:[10,'·','·','·',13,3,'·','·',2],     sum:28, hl:'g' },
    { t:'11:30~12:30', d:[10,'·','·','·','·','·','·',17,1],   sum:28, hl:'y' },
    { t:'12:30~13:30', d:['·',14,'·',2,'·','·','·',11,1],     sum:28, hl:'y' },
    { t:'13:30~17:30', d:['·',18,6,2,'·','·','·','·',2],      sum:28, hl:'g' },
    { t:'17:30~18:10', d:['·','·',6,2,'·','·',18,'·',2],      sum:28, hl:'g' },
  ];
  const wkHeads = ['전처리','파쇄','내포장','이송','외포장','세팅','청소','점심','관리'];
  const wkColors= ['#185FA5','#BA7517','#7F77DD','#534AB7','#1D9E75','#EF9F27','#888780','var(--color-text-secondary)','#5F5E5A'];
  const wkTbl = `
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed">
      <colgroup><col style="width:12%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:13%"></colgroup>
      <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary)">
        <th style="text-align:left;padding:9px 6px;font-weight:500">시간대</th>
        ${wkHeads.map((h,i)=>`<th style="text-align:right;padding:9px 6px;font-weight:500;color:${wkColors[i]}">${h}</th>`).join('')}
        <th style="text-align:right;padding:9px 6px;font-weight:500">합계</th>
      </tr></thead>
      <tbody>${wkRows.map(r=>{
        const bg = r.hl==='g'?'rgba(232,243,222,0.4)':r.hl==='y'?'rgba(241,239,232,0.6)':'';
        return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary);background:${bg}">
          <td style="padding:9px 6px;font-weight:500">${r.t}</td>
          ${r.d.map(v=>`<td style="padding:9px 6px;text-align:right;${v==='·'?'color:var(--color-text-tertiary)':'font-weight:500'}">${v}</td>`).join('')}
          <td style="padding:9px 6px;text-align:right;font-weight:500;color:${r.sum===28?goodColor:'var(--color-text-tertiary)'}">${r.sum}${r.sum===28?' ✓':''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

  // ─ 최종 렌더링 ────────────────────────────────────────
  rpPane.innerHTML = `
    ${conclusionBox}
    ${bottleneckBox}

    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:14px;font-weight:600">📐 데이터 기반 필요 인원 계산</div>
        <span style="font-size:10px;background:var(--color-background-info);color:var(--color-text-info);padding:3px 10px;border-radius:99px">설정값 기준</span>
      </div>
      <div style="overflow-x:auto">${reqTbl}</div>
    </div>

    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px">📋 공정별 수율·산출 흐름</div>
      <div style="overflow-x:auto">${procStatusTbl}</div>
      ${endCards}
    </div>

    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">👥 시간대별 인원 활용 (정원 28명)</div>
      <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:10px">유휴 0명 · 점심 2차 분산</div>
      <div style="overflow-x:auto">${wkTbl}</div>
    </div>`;
}
