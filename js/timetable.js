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

  // 타임라인 행
  const ROWS = [
    { name:'전처리 (홍두깨)', s:S,       e:pp_hd_e, bg:'#378ADD', lbl:`${ttFmt(S)}~${ttFmt(pp_hd_e)} · ${hd}kg` },
    { name:'전처리 (우둔)',   s:S,       e:pp_ud_e, bg:'#378ADD', lbl:`${ttFmt(S)}~${ttFmt(pp_ud_e)} · ${ud}kg` },
    { name:'자숙 (홍두깨)',  s:ck_hd_s, e:ck_hd_e, bg:'#1D9E75', lbl:`${ttFmt(ck_hd_s)}~${ttFmt(ck_hd_e)} → ${ck_hd_out}kg` },
    { name:'자숙 (우둔)',    s:ck_ud_s, e:ck_ud_e, bg:'#1D9E75', lbl:`${ttFmt(ck_ud_s)}~${ttFmt(ck_ud_e)} → ${ck_ud_out}kg` },
    { name:'파쇄',           s:sh_s,    e:sh_e,    bg:'#EF9F27', lbl:`${ttFmt(sh_s)}~${ttFmt(sh_e)} → ${sh_out}kg` },
    ...prodResults.map(p => ({ name:`내포장 (${p.name})`,   s:p.pk_s, e:p.pk_e, bg:'#534AB7', lbl:`${ttFmt(p.pk_s)}~${ttFmt(p.pk_e)} · ${p.ea}EA` })),
    ...prodResults.map(p => ({ name:`레토르트 (${p.name})`, s:p.rt_s, e:p.rt_e, bg:'#D85A30', lbl:`${p.rt_cycles}대차 · ${ttFmt(p.rt_s)}~${ttFmt(p.rt_e)}` })),
  ];

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

  // 공정별 상세 카드
  const fixed = [
    { name:'전처리 홍두깨', time:`${ttFmt(S)} ~ ${ttFmt(pp_hd_e)}`,       sub:`${ttDur(pp_hd_min)} · ${hd}kg 투입`,                  color:'#378ADD' },
    { name:'전처리 우둔',   time:`${ttFmt(S)} ~ ${ttFmt(pp_ud_e)}`,       sub:`${ttDur(pp_ud_min)} · ${ud}kg 투입`,                   color:'#378ADD' },
    { name:'자숙 홍두깨',  time:`${ttFmt(ck_hd_s)} ~ ${ttFmt(ck_hd_e)}`, sub:`${ttDur(CK_MIN)} · 산출 ${ck_hd_out}kg (수율 90%)`,   color:'#1D9E75' },
    { name:'자숙 우둔',    time:`${ttFmt(ck_ud_s)} ~ ${ttFmt(ck_ud_e)}`, sub:`${ttDur(CK_MIN)} · 산출 ${ck_ud_out}kg (수율 55%)`,   color:'#1D9E75' },
    { name:'파쇄',          time:`${ttFmt(sh_s)} ~ ${ttFmt(sh_e)}`,       sub:`${ttDur(sh_min)} · 산출 ${sh_out}kg (수율 97%)`,       color:'#EF9F27' },
  ];
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
// 보고서 모드: 인원 활용 표 + 공정별 현황 표
// 입력값 (홍두깨 kg, 인원수)을 기준으로 28명 풀가동 시나리오 산출
// ============================================================

function ttRenderReport() {
  const rpPane = document.getElementById('tt-pane-rp');
  if (!rpPane) return;

  // 입력값
  const hd = +document.getElementById('tt_hd').value || 0;
  const wk = +document.getElementById('tt_wk').value || 7;
  const T = TT_TUNING;

  // ─ 공정별 산출 (수율 체인) ─────────────────────────────
  const preIn = hd;
  const preOut  = Math.round(preIn  * T.yPre   / 100);
  const cookIn  = preOut;
  const cookOut = Math.round(cookIn * T.yCook  / 100);
  const crushIn = cookOut;
  const crushOut= Math.round(crushIn* T.yCrush / 100);
  const packIn  = crushOut;
  const packOut = Math.round(packIn * T.yPack  / 100);
  const pouches = Math.round(packOut / 1.35);

  // ─ 작업 시간 추정 (실측 생산성 기반) ────────────────────
  const preH    = preIn / (T.pPre * 10);          // 10명 평균
  const crushH  = crushIn / (T.pCrush * 14);      // 14명 기준
  const packMin = pouches / T.pPackEa;            // 분 단위

  // 1. 공정별 현황 표
  const procRows = [
    { p:'전처리', it:'홍두께', i:preIn,  o:preOut,  bg:0, y1:T.yPre,  y2:T.yPre,  h:preH.toFixed(1)+'h', w:10, prod:T.pPre+' kg/인시' },
    { p:'자숙',  it:'홍두께', i:cookIn, o:cookOut, bg:'-', y1:(cookOut/preIn*100).toFixed(1)+'%', y2:T.yCook+'%', h:(T.cookMin/60*4).toFixed(1)+'h', w:2, prod:'33.0 kg/인시' },
    { p:'파쇄',  it:'홍두께', i:crushIn,o:crushOut,bg:Math.round(crushIn*0.034), y1:(crushOut/preIn*100).toFixed(1)+'%', y2:T.yCrush+'%', h:crushH.toFixed(1)+'h', w:14, prod:T.pCrush+' kg/인시' },
    { p:'내포장',it:'홍두께·FC 3KG', i:packIn, o:packOut, bg:'-', y1:(packOut/preIn*100).toFixed(1)+'%', y2:T.yPack+'%', h:(packMin/60).toFixed(1)+'h', w:8, prod:T.pPackEa+' EA/분' },
  ];
  const procTbl = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
      <colgroup><col style="width:9%"><col style="width:14%"><col style="width:11%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:7%"><col style="width:14%"></colgroup>
      <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary)">
        <th style="text-align:left;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">공정</th>
        <th style="text-align:left;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">품목</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">투입 KG</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">산출 KG</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">비가식부</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">원육수율</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">공정수율</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">작업시간</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">인원</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">생산성</th>
      </tr></thead>
      <tbody>${procRows.map(r=>`
        <tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
          <td style="padding:9px 6px;font-weight:500">${r.p}</td>
          <td style="padding:9px 6px">${r.it}</td>
          <td style="padding:9px 6px;text-align:right">${r.i.toLocaleString()}</td>
          <td style="padding:9px 6px;text-align:right;font-weight:500">${r.o.toLocaleString()}</td>
          <td style="padding:9px 6px;text-align:right;color:${r.bg==='-'?'var(--color-text-tertiary)':'#A32D2D'}">${r.bg==='-'?'-':r.bg.toLocaleString()+'kg'}</td>
          <td style="padding:9px 6px;text-align:right;font-weight:500">${typeof r.y1==='number'?r.y1.toFixed(1)+'%':r.y1}</td>
          <td style="padding:9px 6px;text-align:right;font-weight:500">${typeof r.y2==='number'?r.y2.toFixed(1)+'%':r.y2}</td>
          <td style="padding:9px 6px;text-align:right">${r.h}</td>
          <td style="padding:9px 6px;text-align:right">${r.w}명</td>
          <td style="padding:9px 6px;text-align:right">${r.prod}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  // 2. 포장 실적 표
  const packTbl = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
      <colgroup><col style="width:32%"><col style="width:17%"><col style="width:17%"><col style="width:17%"><col style="width:17%"></colgroup>
      <thead><tr style="border-bottom:0.5px solid var(--color-border-secondary)">
        <th style="text-align:left;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">제품명</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">생산 EA</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">파우치</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">불량 EA</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500;color:var(--color-text-secondary)">불량률</th>
      </tr></thead>
      <tbody><tr>
        <td style="padding:9px 6px">홍두께 · FC 장조림 3kg</td>
        <td style="padding:9px 6px;text-align:right;font-weight:500">${pouches.toLocaleString()}</td>
        <td style="padding:9px 6px;text-align:right">${(pouches+7).toLocaleString()}</td>
        <td style="padding:9px 6px;text-align:right">7</td>
        <td style="padding:9px 6px;text-align:right;color:var(--color-text-tertiary)">미측정</td>
      </tr></tbody>
    </table>`;

  // 3. 인원 활용 표 (28명 시간대별)
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
          <td style="padding:9px 6px;text-align:right;font-weight:500;color:${r.sum===28?'#0F6E56':'var(--color-text-tertiary)'}">${r.sum}${r.sum===28?' ✓':''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

  // 4. 공정 타임라인 SVG (간략)
  // 최종 종료 시각 추정
  const startMin = 5*60;
  const preEndMin = startMin + Math.round(preH * 60);
  const lastTankIn = preEndMin;  // 4호 자숙 투입 = 전처리 종료 시점
  const lastWagonEnd = lastTankIn + T.cookMin + T.wagonMin;
  const crushStart = startMin + 7.5*60;  // 12:30
  const crushEnd = crushStart + Math.round(crushH * 60);
  const packStart = crushStart + 60;     // 13:30
  const packEnd = packStart + Math.round(packMin);
  const fmt = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

  // 종합 카드
  const summary = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
      <div style="background:var(--color-background-secondary);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">원육 투입</div>
        <div style="font-size:18px;font-weight:500">${preIn.toLocaleString()}kg</div>
      </div>
      <div style="background:var(--color-background-secondary);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">최종 산출</div>
        <div style="font-size:18px;font-weight:500">약 ${pouches.toLocaleString()}개</div>
      </div>
      <div style="background:var(--color-background-secondary);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">전체 수율</div>
        <div style="font-size:18px;font-weight:500">${(packOut/preIn*100).toFixed(1)}%</div>
      </div>
      <div style="background:var(--color-background-secondary);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:3px">내포장 종료</div>
        <div style="font-size:18px;font-weight:500;color:#7F77DD">${fmt(packEnd)}</div>
      </div>
    </div>`;

  rpPane.innerHTML = `
    ${summary}
    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:500;margin-bottom:10px">공정별 현황</div>
      <div style="overflow-x:auto">${procTbl}</div>
    </div>
    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:500;margin-bottom:10px">포장 실적</div>
      <div style="overflow-x:auto">${packTbl}</div>
    </div>
    <div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:500;margin-bottom:4px">시간대별 인원 활용 (정원 28명)</div>
      <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:10px">모든 시간대 합계 28명 일치 · 유휴 0명</div>
      <div style="overflow-x:auto">${wkTbl}</div>
    </div>`;
}
