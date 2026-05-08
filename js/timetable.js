// timetable.js — 공정 타임테이블 플래너 (관리자 전용 PIN 잠금)

const TT_PIN = '1234'; // 기본 PIN — 변경 원하시면 말씀해주세요
const TT_ACTIVE = { tr: false, sg: false, mn: false };

// ── PIN 체크 ─────────────────────────────────────────────
function ttCheckPin() {
  const v = document.getElementById('tt-pin-input').value;
  if (v.length < 4) return;
  if (v === TT_PIN) {
    document.getElementById('tt-lock').style.display = 'none';
    document.getElementById('tt-main').style.display = 'block';
    document.getElementById('tt-pin-err').style.display = 'none';
    ttGo();
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
  ['tl','dt'].forEach(p => {
    document.getElementById('tt-pane-' + p).style.display = p === id ? 'block' : 'none';
  });
  document.querySelectorAll('.tt-tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
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
