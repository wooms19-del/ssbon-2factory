// ============================================================
// 분석 탭
// ============================================================
// toggleDatePicker 불필요 - input이 직접 클릭됨

// ============================================================
// 월별현황
// ============================================================
var _moYm = '';
var _moBarChart = null, _moDefChart = null, _moYieldChart = null;

function chMonth(dir) {
  if(!_moYm) _moYm = tod().slice(0,7);
  const [y,m] = _moYm.split('-').map(Number);
  const d = new Date(y, m-1+dir, 1);
  _moYm = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  renderMonthly();
}

async function renderMonthly() {
  if(!_moYm) _moYm = tod().slice(0,7);
  const ym = _moYm;
  const from = ym+'-01';
  const lastDay = new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(5)), 0).getDate();
  const to = ym+'-'+String(lastDay).padStart(2,'0');
  const today = tod();
  const effectiveTo = to > today ? today : to;

  const months=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  setText('monthLbl', ym.slice(0,4)+'년 '+months[parseInt(ym.slice(5))-1]);

  const prevFrom=(()=>{const [y,m,dd]=from.split('-').map(Number);const dt=new Date(y,m-1,dd-1);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;})();
  const [pk, op, ppMonth, thMonth, shMonth, ckMonth] = await Promise.all([
    fbGetRange('packing', from, effectiveTo),
    fbGetRange('outerpacking', from, effectiveTo),
    fbGetRange('preprocess', from, effectiveTo),
    fbGetRange('thawing', prevFrom, effectiveTo),
    fbGetRange('shredding', from, effectiveTo),
    fbGetRange('cooking', from, effectiveTo)
  ]);

  // ── KPI ──────────────────────────────────────────────────
  const totalEA  = pk.reduce((s,r)=>s+(parseFloat(r.ea)||0), 0);
  const totalDef = pk.reduce((s,r)=>s+(parseFloat(r.defect)||0), 0);
  const workDays = new Set(pk.map(r=>String(r.date||'').slice(0,10)).filter(Boolean)).size;
  const avgEA    = workDays > 0 ? Math.round(totalEA/workDays) : 0;
  const opReal   = op.filter(r=>!r.testRun);
  const totalBoxes   = opReal.reduce((s,r)=>s+(parseInt(r.outerBoxes)||0), 0);
  const totalOuterEA = opReal.reduce((s,r)=>s+(parseInt(r.outerEa)||0), 0);
  const defRate  = totalEA > 0 ? totalDef/totalEA*100 : 0;

  setText('mo_ea',    totalEA.toLocaleString());
  setText('mo_avg',   avgEA.toLocaleString());
  setText('mo_days',  workDays+'작업일');
  setText('mo_boxes', totalBoxes.toLocaleString()+'박스');
  setText('mo_outer_ea', totalOuterEA.toLocaleString()+' EA');
  const defEl = document.getElementById('mo_def');
  if(defEl){ defEl.textContent=defRate.toFixed(2)+'%'; defEl.style.color=defRate>2?'var(--d)':'var(--s)'; }

  // ── 제품별 테이블 ─────────────────────────────────────────
  const byProd = {};
  pk.forEach(r=>{ const k=r.product||'기타';
    if(!byProd[k]) byProd[k]={ea:0,defect:0,days:new Set()};
    byProd[k].ea+=parseFloat(r.ea)||0; byProd[k].defect+=parseFloat(r.defect)||0;
    byProd[k].days.add(String(r.date||'').slice(0,10));
  });
  const opByProd = {};
  opReal.forEach(r=>{ const k=r.product||'기타';
    if(!opByProd[k]) opByProd[k]={outerEa:0,boxes:0};
    opByProd[k].outerEa+=parseInt(r.outerEa)||0; opByProd[k].boxes+=parseInt(r.outerBoxes)||0;
  });
  const tbody=document.getElementById('mo_prod_tbl'), tfoot=document.getElementById('mo_prod_total');
  let totEA=0,totDef=0,totOuter=0,totBx=0;
  const rows=Object.entries(byProd).sort((a,b)=>b[1].ea-a[1].ea);
  // 제품명에서 그램 파싱 → 완제품 KG (예: 170g→0.17, 3KG→3)
  function _prodKgUnit(name){ const m=(name||'').match(/(\d+(?:\.\d+)?)\s*(g|KG)\b/i); if(!m) return 0; return m[2].toUpperCase()==='KG'?parseFloat(m[1]):parseFloat(m[1])/1000; }
  let totProdKg=0;
  if(tbody) tbody.innerHTML=rows.map(([prod,v])=>{
    const op_=opByProd[prod]||{outerEa:0,boxes:0};
    const pkgKg=r2(op_.outerEa*_prodKgUnit(prod));
    totEA+=v.ea; totDef+=v.defect; totOuter+=op_.outerEa; totBx+=op_.boxes; totProdKg=r2(totProdKg+pkgKg);
    const dr=v.ea>0?(v.defect/v.ea*100).toFixed(2)+'%':'—';
    const dc=v.ea>0&&v.defect/v.ea*100>2?'var(--d)':'var(--s)';
    return `<tr>
      <td style="font-weight:500">${prod}</td>
      <td style="text-align:center">${v.days.size}일</td>
      <td style="text-align:center;font-weight:600;color:var(--p)">${v.ea.toLocaleString()}</td>
      <td style="text-align:center">${op_.outerEa>0?op_.outerEa.toLocaleString():'—'}</td>
      <td style="text-align:center;color:var(--s)">${pkgKg>0?pkgKg.toLocaleString()+'kg':'—'}</td>
      <td style="text-align:center;color:${dc}">${dr}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--g4);padding:1rem">데이터 없음</td></tr>';
  if(tfoot){ const tdr=totEA>0?(totDef/totEA*100).toFixed(2)+'%':'—';
    tfoot.innerHTML=`<tr style="font-weight:700;border-top:2px solid var(--g3)">
      <td>합계</td><td style="text-align:center">—</td>
      <td style="text-align:center;color:var(--p)">${totEA.toLocaleString()}</td>
      <td style="text-align:center">${totOuter>0?totOuter.toLocaleString():'—'}</td>
      <td style="text-align:center;color:var(--s)">${totProdKg>0?totProdKg.toLocaleString()+'kg':'—'}</td>
      <td style="text-align:center;color:${totEA>0&&totDef/totEA*100>2?'var(--d)':'var(--s)'}">${tdr}</td>
    </tr>`; }

  // ── 차트 ─────────────────────────────────────────────────
  const byDate={};
  pk.forEach(r=>{ const d=String(r.date||'').slice(0,10);
    if(!byDate[d]) byDate[d]={ea:0,def:0};
    byDate[d].ea+=parseFloat(r.ea)||0; byDate[d].def+=parseFloat(r.defect)||0;
  });
  const dates=Object.keys(byDate).sort();
  const eaVals=dates.map(d=>byDate[d].ea);
  const defVals=dates.map(d=>byDate[d].ea>0?parseFloat((byDate[d].def/byDate[d].ea*100).toFixed(2)):null);
  const labels=dates.map(d=>d.slice(5)+'('+dayOfWeek(d)+')');

  const ctx1=document.getElementById('mo_bar_chart');
  if(ctx1){ if(_moBarChart){_moBarChart.destroy();_moBarChart=null;}
    // 막대 위 수치 표시 플러그인
    const _topLbl={id:'topLbl',afterDatasetsDraw(chart){
      const {ctx}=chart; ctx.save();
      chart.data.datasets.forEach((_,i)=>{
        chart.getDatasetMeta(i).data.forEach((bar,j)=>{
          const v=chart.data.datasets[i].data[j];
          if(v==null||v<=0) return;
          const s=v>=10000?(v/10000).toFixed(1)+'만':v>=1000?(v/1000).toFixed(1)+'k':String(v);
          ctx.fillStyle='#475569'; ctx.font='bold 9px sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='bottom';
          ctx.fillText(s, bar.x, bar.y-2);
        });
      });
      ctx.restore();
    }};
        _moBarChart=new Chart(ctx1,{type:'bar',plugins:[_topLbl],data:{labels,datasets:[
      {label:'생산EA',data:eaVals,backgroundColor:'#3b82f6',borderRadius:5,borderSkipped:false}
    ]},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:v=>v.raw.toLocaleString()+' EA'}}},
      scales:{x:{ticks:{color:'#888',font:{size:10},maxRotation:45},grid:{display:false}},
              y:{ticks:{color:'#888',font:{size:10},callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v},
                 grid:{color:'rgba(128,128,128,0.1)'},min:0}}}});
  }
  const ctx2=document.getElementById('mo_def_chart');
  if(ctx2){ if(_moDefChart){_moDefChart.destroy();_moDefChart=null;}
    _moDefChart=new Chart(ctx2,{type:'line',plugins:[{id:'lineLbl',afterDatasetsDraw(chart){
      const {ctx}=chart; ctx.save();
      chart.data.datasets.forEach((ds,i)=>{
        if(ds.pointRadius===0) return; // 기준선 등 숨긴 점은 스킵
        chart.getDatasetMeta(i).data.forEach((pt,j)=>{
          const v=ds.data[j];
          if(v==null) return;
          const s=typeof v==='number'?v.toFixed(1)+'%':String(v);
          ctx.fillStyle=ds.borderColor||'#475569';
          ctx.font='bold 9px sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='bottom';
          ctx.fillText(s, pt.x, pt.y-5);
        });
      });
      ctx.restore();
    }}],data:{labels,datasets:[
      {label:'불량률',data:defVals,borderColor:'#e24b4a',backgroundColor:'rgba(226,75,74,0.08)',fill:true,tension:0.3,pointRadius:4,borderWidth:2,spanGaps:false},
      {label:'기준 2%',data:Array(dates.length).fill(2),borderColor:'#f59e0b',borderDash:[5,4],pointRadius:0,borderWidth:1.5,fill:false}
    ]},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'top',labels:{font:{size:11},boxWidth:12,usePointStyle:true}},
               tooltip:{callbacks:{label:v=>v.raw!=null?v.raw+'%':'—'}}},
      scales:{x:{ticks:{color:'#888',font:{size:10},maxRotation:45},grid:{display:false}},
              y:{ticks:{color:'#888',font:{size:10},callback:v=>v+'%'},
                 grid:{color:'rgba(128,128,128,0.1)'},min:0}}}});
  }
  // ── 테스트 체인 완전 역추적 (포장→파쇄→자숙→전처리→해동) ────────────────────
  // ① 외포장·내포장 기준 테스트 판별
  const testOpKeys = new Set(op.filter(r=>r.testRun||r.isTest).map(r=>`${String(r.date||'').slice(0,10)}_${r.product||''}`));
  const isTestPk = r => r.testRun || r.isTest || testOpKeys.has(`${String(r.date||'').slice(0,10)}_${r.product||''}`);
  const pkReport  = pk.filter(r => !isTestPk(r));

  // ② 날짜별로 전체 체인 추적 → 테스트 전처리 ID 집합 + 테스트 해동 와건 집합
  const testPpIds  = new Set();   // 제거할 전처리 레코드 ID
  const testThWByDate = {};       // 날짜별 제거할 해동 와건
  const testDates = [...new Set(pk.filter(isTestPk).map(r=>String(r.date||'').slice(0,10)))];

  testDates.forEach(d => {
    const tPkD  = pk.filter(isTestPk).filter(r=>String(r.date||'').slice(0,10)===d);
    const shD   = (shMonth||[]).filter(r=>String(r.date||'').slice(0,10)===d);
    const ckD   = (ckMonth||[]).filter(r=>String(r.date||'').slice(0,10)===d);
    const ppD   = (ppMonth||[]).filter(r=>String(r.date||'').slice(0,10)===d);

    // 포장 와건
    const tPkW = new Set(tPkD.flatMap(r=>(r.wagon||'').split(',').map(w=>w.trim()).filter(Boolean)));
    // 파쇄: 포장 와건으로 wagonOut → wagonIn 추출
    const tSh  = shD.filter(r=>(r.wagonOut||'').split(',').map(w=>w.trim()).some(w=>tPkW.has(w)));
    const tShW = new Set(tSh.flatMap(r=>(r.wagonIn||'').split(',').map(w=>w.trim()).filter(Boolean)));
    // 자숙: 파쇄 wagonIn → wagonOut → cage 추출
    const tCk  = ckD.filter(r=>(r.wagonOut||'').split(',').map(w=>w.trim()).some(w=>tShW.has(w)));
    const tCkC = new Set(tCk.flatMap(r=>(r.cage||'').split(',').map(c=>c.trim()).filter(Boolean)));
    // 전처리: cage 매칭 → 해동 wagons 추출
    const tPp  = ppD.filter(r=>(r.cage||'').split(',').map(c=>c.trim()).some(c=>tCkC.has(c)));
    const tPpW = new Set(tPp.flatMap(r=>(r.wagons||'').split(',').map(w=>w.trim()).filter(Boolean)));

    tPp.forEach(r => testPpIds.add(r.fbId||r.id));
    if(!testThWByDate[d]) testThWByDate[d] = new Set();
    tPpW.forEach(w => testThWByDate[d].add(w));
  });

  // ③ ppMonth에서 테스트 전처리 레코드 제거
  const ppMonthClean = (ppMonth||[]).filter(r => !testPpIds.has(r.fbId||r.id));

  // ④ thMonth에서 테스트 해동 와건 제거 (해동 날짜·익일 모두 체크)
  const thMonthClean = (thMonth||[]).filter(r => {
    const thD = String(r.date||'').slice(0,10);
    const w   = (r.wagon||'').trim();
    if(!w) return true;
    if(testThWByDate[thD] && testThWByDate[thD].has(w)) return false;
    const nextD = (()=>{const dt=new Date(thD);dt.setDate(dt.getDate()+1);return dt.toISOString().slice(0,10);})();
    if(testThWByDate[nextD] && testThWByDate[nextD].has(w)) return false;
    return true;
  });
  // ─────────────────────────────────────────────────────────────────────────────
  renderMonthlyReport(pkReport, from, effectiveTo, ppMonthClean, thMonthClean, opReal);
}

// 월간 생산 일보 렌더
async function renderMonthlyReport(pk, from, effectiveTo, ppMonth, thMonth, opData) {
  const tbody = document.getElementById('mo_report_tbl');
  const tfoot = document.getElementById('mo_report_total');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--g4);padding:1rem">계산 중...</td></tr>';

  const ym = _moYm || tod().slice(0,7);
  const metaKey = 'moMeta_' + ym;
  let metaMap = {};
  try { metaMap = JSON.parse(localStorage.getItem(metaKey)||'{}'); } catch(e){}

  // 날짜별 + 제품별 집계 (작업인원 포함)
  const byDateProd = {};
  pk.forEach(r => {
    const d = String(r.date||'').slice(0,10);
    const prod = r.product||'기타';
    const key = d+'|'+prod;
    if(!byDateProd[key]) byDateProd[key] = {date:d, product:prod, ea:0, pkKg:0, workers:0};
    byDateProd[key].ea += parseFloat(r.ea)||0;
    const p = L.products.find(x=>x.name===prod);
    byDateProd[key].pkKg += p ? (parseFloat(r.ea)||0)*p.kgea : 0;
    byDateProd[key].workers = Math.max(byDateProd[key].workers, parseFloat(r.workers)||0);
  });

  // 날짜 목록
  const uniqueDates = [...new Set(Object.values(byDateProd).map(r=>r.date))].sort();

  // 날짜별 원육 투입
  const rmByDate = {};
  for(const d of uniqueDates) {
    const ppDay=(ppMonth||[]).filter(r=>String(r.date||'').slice(0,10)===d);
    rmByDate[d] = getThKgByPP_(ppDay, thMonth||[], d);
  }

  // 날짜별 그룹핑
  const rows = Object.values(byDateProd).sort((a,b)=>a.date===b.date?a.product.localeCompare(b.product):a.date.localeCompare(b.date));
  const grouped = {};
  rows.forEach(row => {
    if(!grouped[row.date]) grouped[row.date] = [];
    grouped[row.date].push(row);
  });
  const dayEntries = Object.entries(grouped).sort((a,b)=>a[0].localeCompare(b[0]));

  // 외포장 EA 맵 빌드: "YYYY-MM-DD|제품명" → outerEa 합계
  const opMap = {};
  (opData||[]).filter(r=>!r.testRun&&!r.isTest).forEach(r=>{
    const dk = (String(r.date||'').slice(0,10))+'|'+(r.product||'');
    opMap[dk] = (opMap[dk]||0) + (parseInt(r.outerEa)||0);
  });

  // 글로벌 저장 (필터용)
  window._moGD = { dayEntries, rmByDate, opMap, metaMap, thMonth: thMonth||[], ppMonth: ppMonth||[], metaKey };
  _moRenderRows(null);

  // ── 수율 KPI 계산 ─────────────────────────────────────────
  {
    let moTotRm=0, moTotPkKg=0, moDays=0, moGoodDays=0;
    const dailyYields=[];
    dayEntries.forEach(([date, allR])=>{
      const dayRm=r2(rmByDate[date]||0);
      if(!dayRm) return;
      const effPkM={};
      allR.forEach(row=>{
        const oe=opMap[date+'|'+row.product]||0;
        const p=L.products.find(x=>x.name===row.product);
        effPkM[row.product]=oe>0&&p?r2(oe*p.kgea):row.pkKg;
      });
      const totalAllPk=r2(allR.reduce((s,r)=>s+(effPkM[r.product]||0),0));
      const dayPkKg=totalAllPk;
      moTotRm+=dayRm; moTotPkKg+=dayPkKg; moDays++;
      const yld=dayPkKg/dayRm*100;
      if(yld>=52) moGoodDays++;
      dailyYields.push({date, yld});
    });
    const moAvgYld=moTotRm>0?moTotPkKg/moTotRm*100:0;
    const moLossKg=r2(moTotRm*(0.55-moAvgYld/100));
    _moRenderYieldKPI(moTotRm, moTotPkKg, moAvgYld, moDays, moGoodDays, moLossKg);
    _moRenderYieldChart(dailyYields);
    _moLoadAndRenderPrevCmp(moAvgYld, moTotRm, moTotPkKg, moDays);
  }

  /* ── DEAD CODE PLACEHOLDER (do not remove – replaced by _moRenderRows) ── */
  if(false) { let dayNo=0; dayEntries.forEach(([date, dayRows]) => {
    const cnt      = dayRows.length;
    const dayRm    = r2(rmByDate[date]||0);
    const dayPkKg  = r2(dayRows.reduce((s,r)=>s+r.pkKg,0));
    const dayYld   = dayRm>0 ? dayPkKg/dayRm*100 : null;
    const dow      = ['일','월','화','수','목','금','토'][new Date(date).getDay()];
    const meta     = metaMap[date]||{};
    const bg       = dayBg[(dayNo-1)%2];

    // 수율 색상 + 배경
    const yldTxt   = dayYld==null?'color:#aaa;':dayYld>=55?'color:#047857;':dayYld>=52?'color:#1d4ed8;':dayYld>=50?'color:#c2410c;':'color:#b91c1c;';
    const yldBg    = dayYld==null?bg:dayYld>=55?'background:#ecfdf5;':dayYld>=52?'background:#eff6ff;':dayYld>=50?'background:#fff7ed;':'background:#fef2f2;';

    // 작업인원
    const autoW    = dayRows.reduce((mx,r)=>Math.max(mx,r.workers||0),0);
    const workers  = meta.workers!=null ? meta.workers : (autoW||'');
    // Full Capa
    const firstProd = L.products.find(x=>x.name===dayRows[0].product);
    const autoCapa  = firstProd&&firstProd.capa ? firstProd.capa.toLocaleString() : '';
    const capa      = meta.capa!=null ? meta.capa : autoCapa;
    const note      = meta.note!=null ? meta.note : '';

    // 원육종류 배지
    const thDay    = (thMonth||[]).filter(r=>String(r.date||'').slice(0,10)===date);
    const meatParts= [...new Set(thDay.flatMap(r=>(r.type||'').split(',').map(s=>s.trim()).filter(Boolean)))];
    const meatStr  = meatParts.length
      ? meatParts.map(p=>`<span style="display:inline-block;background:#dbeafe;color:#1e40af;border-radius:3px;padding:1px 6px;font-size:11px;font-weight:600;white-space:nowrap;margin:1px 2px">${p}</span>`).join('')
      : '<span style="color:#ccc">—</span>';

    totRm   += dayRm;
    totPkKg += dayPkKg;

    const mkEdit = (field, val, display, style='') =>
      `<span class="mo-edit" data-date="${date}" data-field="${field}" title="클릭하여 수정" style="cursor:pointer;border-bottom:1px dashed #aaa;${style}">${display}</span>`;

    const editW    = mkEdit('workers', workers, workers||'—') + '명';
    const editCapa = mkEdit('capa', capa, capa||'—');
    const editNote = mkEdit('note', note, note||'＋메모', 'font-size:12px;color:#999;display:inline-block;min-width:40px');

    dayRows.forEach((row, ri) => {
      const isFirst   = ri===0;
      const isLast    = ri===cnt-1;
      const rowBorder = isLast ? 'border-bottom:2px solid #cbd5e1;' : 'border-bottom:1px solid #e2e8f0;';
      const pkDisp    = fmtKg(r2(row.pkKg));

      let cells = '';

      if(isFirst) {
        // 일수
        cells += `<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;font-weight:700;font-size:15px;color:#1e293b;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1;">${dayNo}</td>`;
        // 생산일자
        cells += `<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1;line-height:1.5">
          <span style="font-weight:600;font-size:13px;color:#334155">${date.slice(5).replace('-','/')}</span><br>
          <span style="font-size:10px;color:#94a3b8">(${dow})</span></td>`;
        // 작업인원 (생산일자 바로 다음)
        cells += `<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;color:#475569;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${editW}</td>`;
        // 원육종류
        cells += `<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${meatStr}</td>`;
      }

      // 제품명 (행마다)
      cells += `<td style="${vm}${PC}${bg}text-align:center;font-weight:500;color:#1e293b;border-right:1px solid #e2e8f0;${rowBorder}">${row.product}</td>`;
      // 생산량(EA): 외포장 완료분 우선, 없으면 내포장 수량
      const _opKey = date+'|'+row.product;
      const _opEa  = opMap[_opKey]||0;
      const _dispEa = _opEa>0 ? _opEa : (row.ea>0?Math.round(row.ea):0);
      const _eaLabel = _opEa>0
        ? `${_dispEa.toLocaleString()}<span style="font-size:10px;color:#6b7280;margin-left:2px">(외)</span>`
        : (_dispEa>0 ? `${_dispEa.toLocaleString()}<span style="font-size:10px;color:#9ca3af;margin-left:2px">(내)</span>` : '—');
      cells += `<td style="${vm}${PC}${bg}text-align:center;font-variant-numeric:tabular-nums;color:#374151;border-right:1px solid #e2e8f0;${rowBorder}">${_eaLabel}</td>`;
      // 완제품 원육 중량(KG) (행마다)
      cells += `<td style="${vm}${PC}${bg}text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:#374151;border-right:1px solid #e2e8f0;${rowBorder}">${pkDisp}</td>`;

      if(isFirst) {
        // 원육사용량
        cells += `<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;font-variant-numeric:tabular-nums;color:#374151;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${fmtKg(dayRm)}</td>`;
        // 원육수율
        cells += `<td rowspan="${cnt}" style="${vm}${PC}${yldBg}text-align:center;font-weight:700;font-size:15px;${yldTxt}border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${dayYld!=null?dayYld.toFixed(1)+'%':'—'}</td>`;
        // Full Capa
        cells += `<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;color:#64748b;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${editCapa}</td>`;
        // 비고
        cells += `<td rowspan="${cnt}" style="${vm}${P}${bg}text-align:left;font-size:12px;color:#64748b;border-bottom:2px solid #cbd5e1;white-space:pre-wrap">${editNote}</td>`;
      }

      htmlParts.push(`<tr>${cells}</tr>`);
    });
    dayNo++;
  });

  tbody.innerHTML = htmlParts.join('') || `<tr><td colspan="11" style="text-align:center;color:#aaa;padding:2rem">데이터 없음</td></tr>`;

  // 합계 행
  const totYld = totRm>0 ? (totPkKg/totRm*100).toFixed(1)+'%' : '—';
  if(tfoot) tfoot.innerHTML = `<tr style="background:#1e293b;color:#fff;font-weight:700">
    <td colspan="3" style="padding:10px 8px;text-align:center;font-size:13px;letter-spacing:.5px">합 계 (${dayNo-1}일)</td>
    <td style="padding:10px 8px;border-left:1px solid #334155"></td>
    <td style="padding:10px 8px;border-left:1px solid #334155"></td>
    <td style="padding:10px 8px;border-left:1px solid #334155"></td>
    <td style="padding:10px 8px;text-align:center;border-left:1px solid #334155;font-variant-numeric:tabular-nums">${fmtKg(totPkKg)}</td>
    <td style="padding:10px 8px;text-align:center;border-left:1px solid #334155;font-variant-numeric:tabular-nums">${fmtKg(totRm)}</td>
    <td style="padding:10px 8px;text-align:center;border-left:1px solid #334155;color:#fcd34d">${totYld}</td>
    <td colspan="2" style="border-left:1px solid #334155"></td>
  </tr>`; } /* end if(false) dead code */

  // 필터 바 빌드
  const _fbar = document.getElementById('mo_filter_bar');
  if(_fbar) {
    const _allProds = [...new Set(dayEntries.flatMap(([,rs])=>rs.map(r=>r.product)))].sort();
    window._moFilterSel = new Set();
    _fbar.style.display = 'flex';
    _fbar.innerHTML = `<span style="font-size:12px;color:#64748b;font-weight:600;white-space:nowrap;padding:3px 4px">제품 필터:</span>`
      + _allProds.map(p=>`<button onclick="window._moToggleFilter(this,'${p.replace(/'/g,"\\'")}')" data-prod="${p.replace(/"/g,'&quot;')}" style="padding:3px 10px;border-radius:14px;border:1.5px solid #cbd5e1;background:#f1f5f9;color:#475569;font-size:12px;cursor:pointer">${p}</button>`).join('')
      + `<button onclick="window._moClearFilter()" style="padding:3px 10px;border-radius:14px;border:1.5px solid #94a3b8;background:#fff;color:#64748b;font-size:12px;cursor:pointer;margin-left:4px">전체</button>`;
  }

  // 엑셀용 캐시
  window._moReportRows = [];
  dayEntries.forEach(([date, dayRows]) => {
    const dayRm  = r2(rmByDate[date]||0);
    const dayPkKg= r2(dayRows.reduce((s,r)=>s+r.pkKg,0));
    const dayYld = dayRm>0?(dayPkKg/dayRm*100).toFixed(1)+'%':'—';
    const meta   = metaMap[date]||{};
    const autoW  = dayRows.reduce((mx,r)=>Math.max(mx,r.workers||0),0);
    const workers= meta.workers!=null?meta.workers:(autoW||'');
    const fp     = L.products.find(x=>x.name===dayRows[0].product);
    const capa   = meta.capa!=null?meta.capa:(fp&&fp.capa?fp.capa.toLocaleString():'');
    const note   = meta.note!=null?meta.note:'';
    const thD    = (thMonth||[]).filter(r=>String(r.date||'').slice(0,10)===date);
    const meatEx = [...new Set(thD.flatMap(r=>(r.type||'').split(',').map(s=>s.trim()).filter(Boolean)))].join(', ');
    dayRows.forEach((row, ri) => {
      window._moReportRows.push({
        dayNo:   ri===0 ? (dayEntries.findIndex(([d])=>d===date)+1) : '',
        date:    ri===0 ? date : '',
        product: row.product,
        meat:    ri===0 ? meatEx : '',
        workers: ri===0 ? workers : '',
        rm:      ri===0 ? (dayRm>0?dayRm.toFixed(1):'') : '',
        pkKg:    row.pkKg>0 ? r2(row.pkKg).toFixed(1) : '',
        yld:     ri===0 ? dayYld : '',
        capa:    ri===0 ? capa : '',
        note:    ri===0 ? note : ''
      });
    });
  });

  // 인라인 편집 이벤트 바인딩
  tbody.querySelectorAll('.mo-edit').forEach(el => {
    el.addEventListener('click', function() {
      const field = this.dataset.field;
      const date  = this.dataset.date;
      const labels = {workers:'작업 인원 (명)', capa:'Full Capa (예: 10,000)', note:'비고'};
      let cur = '';
      try { cur = (JSON.parse(localStorage.getItem(metaKey)||'{}')[date]||{})[field]||''; } catch(e){}
      const val = prompt(labels[field]+' 입력 (비우면 자동값 사용):', cur);
      if(val===null) return;
      let mm={};
      try{mm=JSON.parse(localStorage.getItem(metaKey)||'{}');}catch(e){}
      if(!mm[date]) mm[date]={};
      if(val.trim()==='') {
        delete mm[date][field];
      } else {
        mm[date][field] = (field==='note') ? val : (parseFloat(val.replace(/,/g,''))||val);
      }
      localStorage.setItem(metaKey, JSON.stringify(mm));
      renderMonthly();
    });
  });
}

// ── 월간 보고서 테이블 렌더 (필터 적용) ─────────────────────────────────────
function _moRenderRows(selProds) {
  const tbody = document.getElementById('mo_report_tbl');
  const tfoot = document.getElementById('mo_report_total');
  if(!tbody || !window._moGD) return;
  const {dayEntries, rmByDate, opMap, metaMap, thMonth, ppMonth, metaKey} = window._moGD;
  const fmtKg = v => v>0 ? v.toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1}) : '—';
  const PC='padding:8px 8px;', P='padding:8px 10px;', vm='vertical-align:middle;';
  const dayBg=['background:#ffffff;','background:#f8fafc;'];
  let dayNo=1, totRm=0, totPkKg=0, totEa=0;
  const html=[];

  dayEntries.forEach(([date, allRows])=>{
    const dayRows = selProds&&selProds.size>0 ? allRows.filter(r=>selProds.has(r.product)) : allRows;
    if(!dayRows.length) return;
    const cnt    = dayRows.length;
    const dayRm  = r2(rmByDate[date]||0);
    // 외포장 EA 기준으로 완제품 원육 중량 재계산 (필터 포함 전체 행 대상)
    const effPkMap = {};
    allRows.forEach(row=>{
      const _opEa2 = opMap[date+'|'+row.product]||0;
      const _p2 = L.products.find(x=>x.name===row.product);
      effPkMap[row.product] = _opEa2>0&&_p2 ? r2(_opEa2*_p2.kgea) : row.pkKg;
    });
    const totalAllPkKg = r2(allRows.reduce((s,r)=>s+(effPkMap[r.product]||0),0));
    const dayPkKg = r2(dayRows.reduce((s,r)=>s+(effPkMap[r.product]||0),0));
    // 비례 배분: 필터된 제품 비중만큼 원육 배분
    const propRm  = totalAllPkKg>0 ? r2(dayRm*(dayPkKg/totalAllPkKg)) : dayRm;
    const dayYld  = propRm>0 ? dayPkKg/propRm*100 : null;
    const dow    = ['일','월','화','수','목','금','토'][new Date(date).getDay()];
    const meta   = metaMap[date]||{};
    const bg     = dayBg[(dayNo-1)%2];
    const yldTxt = dayYld==null?'color:#aaa;':dayYld>=55?'color:#047857;':dayYld>=52?'color:#1d4ed8;':dayYld>=50?'color:#c2410c;':'color:#b91c1c;';
    const yldBg  = dayYld==null?bg:dayYld>=55?'background:#ecfdf5;':dayYld>=52?'background:#eff6ff;':dayYld>=50?'background:#fff7ed;':'background:#fef2f2;';
    const autoW  = allRows.reduce((mx,r)=>Math.max(mx,r.workers||0),0);
    const workers= meta.workers!=null?meta.workers:(autoW||'');
    const firstProd=L.products.find(x=>x.name===allRows[0].product);
    const capa   = meta.capa!=null?meta.capa:(firstProd&&firstProd.capa?firstProd.capa.toLocaleString():'');
    const note   = meta.note!=null?meta.note:'';
    const thDay  = thMonth.filter(r=>String(r.date||'').slice(0,10)===date);
    let meatParts=[...new Set(thDay.flatMap(r=>(r.type||'').split(',').map(s=>s.trim()).filter(Boolean)))];
    // 방혈 type 없으면 전처리 type으로 fallback
    if(!meatParts.length && ppMonth){
      const ppDay=(ppMonth||[]).filter(r=>String(r.date||'').slice(0,10)===date);
      meatParts=[...new Set(ppDay.flatMap(r=>(r.type||'').split(',').map(s=>s.trim()).filter(Boolean)))];
    }
    const meatStr= meatParts.length
      ? meatParts.map(p=>`<span style="display:inline-block;background:#dbeafe;color:#1e40af;border-radius:3px;padding:1px 6px;font-size:11px;font-weight:600;white-space:nowrap;margin:1px 2px">${p}</span>`).join('')
      : '<span style="color:#ccc">—</span>';
    totRm+=propRm; totPkKg+=dayPkKg;
    const mkEdit=(field,val,display,style='')=>`<span class="mo-edit" data-date="${date}" data-field="${field}" title="클릭하여 수정" style="cursor:pointer;border-bottom:1px dashed #aaa;${style}">${display}</span>`;
    const editW   =mkEdit('workers',workers,workers||'—')+'명';
    const editCapa=mkEdit('capa',capa,capa||'—');
    const editNote=mkEdit('note',note,note||'＋메모','font-size:12px;color:#999;display:inline-block;min-width:40px');

    dayRows.forEach((row,ri)=>{
      const isFirst=ri===0, isLast=ri===cnt-1;
      const rowBorder=isLast?'border-bottom:2px solid #cbd5e1;':'border-bottom:1px solid #e2e8f0;';
      const pkDisp=fmtKg(effPkMap[row.product]||r2(row.pkKg));
      let cells='';
      if(isFirst){
        cells+=`<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;font-weight:700;font-size:15px;color:#1e293b;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1;">${dayNo}</td>`;
        cells+=`<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1;line-height:1.5"><span style="font-weight:600;font-size:13px;color:#334155">${date.slice(5).replace('-','/')}</span><br><span style="font-size:10px;color:#94a3b8">(${dow})</span></td>`;
        cells+=`<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;color:#475569;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${editW}</td>`;
        cells+=`<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${meatStr}</td>`;
      }
      cells+=`<td style="${vm}${PC}${bg}text-align:center;font-weight:500;color:#1e293b;border-right:1px solid #e2e8f0;${rowBorder}">${row.product}</td>`;
      if(isFirst){
        cells+=`<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;font-variant-numeric:tabular-nums;color:#374151;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${fmtKg(propRm)}</td>`;
      }
      const _opEa=opMap[date+'|'+row.product]||0;
      const _dispEa=_opEa>0?_opEa:(row.ea>0?Math.round(row.ea):0);
      totEa+=_dispEa;
      const _lbl=_opEa>0?`${_dispEa.toLocaleString()}<span style="font-size:10px;color:#6b7280;margin-left:2px">(외)</span>`:(_dispEa>0?`${_dispEa.toLocaleString()}<span style="font-size:10px;color:#9ca3af;margin-left:2px">(내)</span>`:'—');
      cells+=`<td style="${vm}${PC}${bg}text-align:center;font-variant-numeric:tabular-nums;color:#374151;border-right:1px solid #e2e8f0;${rowBorder}">${_lbl}</td>`;
      cells+=`<td style="${vm}${PC}${bg}text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:#374151;border-right:1px solid #e2e8f0;${rowBorder}">${pkDisp}</td>`;
      if(isFirst){
        cells+=`<td rowspan="${cnt}" style="${vm}${PC}${yldBg}text-align:center;font-weight:700;font-size:15px;${yldTxt}border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${dayYld!=null?dayYld.toFixed(1)+'%':'—'}</td>`;
        cells+=`<td rowspan="${cnt}" style="${vm}${PC}${bg}text-align:center;color:#64748b;border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1">${editCapa}</td>`;
        cells+=`<td rowspan="${cnt}" style="${vm}${P}${bg}text-align:left;font-size:12px;color:#64748b;border-bottom:2px solid #cbd5e1;white-space:pre-wrap">${editNote}</td>`;
      }
      html.push(`<tr>${cells}</tr>`);
    });
    dayNo++;
  });

  tbody.innerHTML=html.join('')||`<tr><td colspan="11" style="text-align:center;color:#aaa;padding:2rem">데이터 없음</td></tr>`;

  const totYld=totRm>0?(totPkKg/totRm*100).toFixed(1)+'%':'—';
  const selLabel=selProds&&selProds.size>0?` [${[...selProds].join(' + ')}]`:'';
  if(tfoot) tfoot.innerHTML=`<tr style="background:#1e293b;color:#fff;font-weight:700">
    <td colspan="5" style="padding:10px 8px;text-align:center;font-size:13px;letter-spacing:.5px">합 계 (${dayNo-1}일)${selLabel}</td>
    <td style="padding:10px 8px;text-align:center;border-left:1px solid #334155;font-variant-numeric:tabular-nums">${fmtKg(totRm)}</td>
    <td style="padding:10px 8px;text-align:center;border-left:1px solid #334155;font-variant-numeric:tabular-nums">${totEa>0?totEa.toLocaleString():'—'}</td>
    <td style="padding:10px 8px;text-align:center;border-left:1px solid #334155;font-variant-numeric:tabular-nums">${fmtKg(totPkKg)}</td>
    <td style="padding:10px 8px;text-align:center;border-left:1px solid #334155;color:#fcd34d">${totYld}</td>
    <td colspan="2" style="border-left:1px solid #334155"></td>
  </tr>`;

  // 인라인 편집 이벤트 재바인딩
  tbody.querySelectorAll('.mo-edit').forEach(el=>{
    el.addEventListener('click',function(){
      const field=this.dataset.field, date=this.dataset.date;
      const labels={workers:'작업 인원 (명)',capa:'Full Capa (예: 10,000)',note:'비고'};
      let cur='';
      try{cur=(JSON.parse(localStorage.getItem(metaKey)||'{}')[date]||{})[field]||'';}catch(e){}
      const val=prompt(labels[field]+' 입력 (비우면 자동값 사용):',cur);
      if(val===null) return;
      let mm={};
      try{mm=JSON.parse(localStorage.getItem(metaKey)||'{}');}catch(e){}
      if(!mm[date]) mm[date]={};
      if(val.trim()===''){delete mm[date][field];}else{mm[date][field]=(field==='note')?val:(parseFloat(val.replace(/,/g,''))||val);}
      localStorage.setItem(metaKey,JSON.stringify(mm));
      renderMonthly();
    });
  });
}

// 제품 필터 토글
window._moToggleFilter = function(btn, prod) {
  if(!window._moFilterSel) window._moFilterSel=new Set();
  if(window._moFilterSel.has(prod)) window._moFilterSel.delete(prod);
  else window._moFilterSel.add(prod);
  document.querySelectorAll('#mo_filter_bar button[data-prod]').forEach(b=>{
    const active=window._moFilterSel.has(b.getAttribute('data-prod'));
    b.style.background=active?'#1e293b':'#f1f5f9';
    b.style.color=active?'#fff':'#475569';
    b.style.borderColor=active?'#1e293b':'#cbd5e1';
  });
  _moRenderRows(window._moFilterSel.size>0?window._moFilterSel:null);
};
window._moClearFilter = function() {
  window._moFilterSel=new Set();
  document.querySelectorAll('#mo_filter_bar button[data-prod]').forEach(b=>{
    b.style.background='#f1f5f9'; b.style.color='#475569'; b.style.borderColor='#cbd5e1';
  });
  _moRenderRows(null);
};

// ── 수율 KPI 카드 렌더 ──────────────────────────────────────
function _moRenderYieldKPI(totRm, totPkKg, avgYld, workDays, goodDays, lossKg) {
  const el=document.getElementById('mo_yield_kpi');
  if(!el) return;
  const yldColor=avgYld>=55?'#047857':avgYld>=52?'#1d4ed8':avgYld>=50?'#c2410c':'#b91c1c';
  const yldBg=avgYld>=55?'#ecfdf5':avgYld>=52?'#eff6ff':avgYld>=50?'#fff7ed':'#fef2f2';
  const lossIsGain=lossKg<=0;
  const lossColor=lossIsGain?'#047857':'#b91c1c';
  const lossIcon=lossIsGain?'▲':'▼';
  const lossLabel=lossIsGain?'목표 초과 절감':'목표 대비 손실';
  const pct=Math.min(100,avgYld>0?avgYld/55*100:0);
  const fmt=v=>v>0?v.toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1}):'—';
  el.innerHTML=`
    <div class="card" style="text-align:center;padding:16px 10px">
      <div style="font-size:11px;color:var(--g5);margin-bottom:6px">총 원육 사용량</div>
      <div style="font-size:24px;font-weight:700;color:#1e293b">${fmt(totRm)}</div>
      <div style="font-size:11px;color:var(--g4);margin-top:3px">KG · ${workDays}작업일</div>
    </div>
    <div class="card" style="padding:14px 10px;background:${yldBg}">
      <div style="font-size:11px;color:#64748b;margin-bottom:4px;text-align:center">평균 원육수율</div>
      <div style="font-size:28px;font-weight:700;color:${yldColor};text-align:center">${avgYld>0?avgYld.toFixed(1)+'%':'—'}</div>
      <div style="margin-top:8px;background:#e2e8f0;border-radius:4px;height:6px;overflow:hidden">
        <div style="height:100%;width:${pct.toFixed(1)}%;background:${yldColor};border-radius:4px"></div>
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:3px;text-align:right">목표 55% 기준 ${pct.toFixed(0)}%</div>
    </div>
    <div class="card" style="text-align:center;padding:16px 10px">
      <div style="font-size:11px;color:var(--g5);margin-bottom:6px">${lossLabel}</div>
      <div style="font-size:24px;font-weight:700;color:${lossColor}">${lossIcon}${fmt(Math.abs(lossKg))}</div>
      <div style="font-size:11px;color:var(--g4);margin-top:3px">KG (55% 기준 대비)</div>
    </div>
    <div class="card" style="text-align:center;padding:16px 10px">
      <div style="font-size:11px;color:var(--g5);margin-bottom:6px">수율 52% 이상 달성</div>
      <div style="font-size:24px;font-weight:700;color:#1e293b">${goodDays}<span style="font-size:14px;color:var(--g4)"> / ${workDays}일</span></div>
      <div style="font-size:11px;color:var(--g4);margin-top:3px">${workDays>0?(goodDays/workDays*100).toFixed(0)+'% 달성':''}</div>
    </div>`;
}

// ── 수율 일별 추이 차트 ──────────────────────────────────────
function _moRenderYieldChart(dailyYields) {
  const canvas=document.getElementById('mo_yield_chart');
  if(!canvas) return;
  if(_moYieldChart){_moYieldChart.destroy();_moYieldChart=null;}
  if(!dailyYields.length) return;
  const n=dailyYields.length;
  const labels=dailyYields.map(d=>d.date.slice(5)+'('+['일','월','화','수','목','금','토'][new Date(d.date).getDay()]+')');
  const ylds=dailyYields.map(d=>parseFloat(d.yld.toFixed(1)));
  const ptColors=ylds.map(v=>v>=55?'#047857':v>=52?'#3b82f6':v>=50?'#f59e0b':'#ef4444');
  _moYieldChart=new Chart(canvas,{plugins:[{id:'lineLbl',afterDatasetsDraw(chart){
      const {ctx}=chart; ctx.save();
      chart.data.datasets.forEach((ds,i)=>{
        if(ds.pointRadius===0||ds.pointRadius===undefined&&ds.borderDash) return;
        chart.getDatasetMeta(i).data.forEach((pt,j)=>{
          const v=ds.data[j];
          if(v==null) return;
          const s=typeof v==='number'?v.toFixed(1)+'%':String(v);
          ctx.fillStyle=ds.borderColor||'#475569';
          ctx.font='bold 9px sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='bottom';
          ctx.fillText(s, pt.x, pt.y-5);
        });
      });
      ctx.restore();
    }}],
    type:'line',
    data:{labels,datasets:[
      {label:'일별 수율',data:ylds,borderColor:'#64748b',backgroundColor:'rgba(100,116,139,0.08)',fill:true,tension:0.3,pointRadius:5,pointBackgroundColor:ptColors,pointBorderColor:ptColors,borderWidth:2,spanGaps:false},
      {label:'목표 55%',data:Array(n).fill(55),borderColor:'#047857',borderDash:[6,3],pointRadius:0,borderWidth:1.5,fill:false},
      {label:'적절 52%',data:Array(n).fill(52),borderColor:'#3b82f6',borderDash:[4,3],pointRadius:0,borderWidth:1.5,fill:false},
      {label:'위험 50%',data:Array(n).fill(50),borderColor:'#ef4444',borderDash:[4,3],pointRadius:0,borderWidth:1.5,fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'top',labels:{font:{size:10},boxWidth:12,usePointStyle:true}},
               tooltip:{callbacks:{label:v=>v.dataset.label+': '+v.raw+'%'}}},
      scales:{x:{ticks:{color:'#888',font:{size:10},maxRotation:45},grid:{display:false}},
              y:{ticks:{color:'#888',font:{size:10},callback:v=>v+'%'},
                 grid:{color:'rgba(128,128,128,0.1)'},min:44,suggestedMax:60}}}
  });
}

// ── 전월 비교 로드 + 렌더 ────────────────────────────────────
async function _moLoadAndRenderPrevCmp(curYld, curRm, curPkKg, curDays) {
  const el=document.getElementById('mo_prev_cmp');
  if(!el) return;
  const ym=_moYm||tod().slice(0,7);
  const [y,m]=ym.split('-').map(Number);
  const prevM=m===1?12:m-1, prevY=m===1?y-1:y;
  const prevYm=`${prevY}-${String(prevM).padStart(2,'0')}`;
  const prevFrom=prevYm+'-01';
  const prevLastDay=new Date(prevY,prevM,0).getDate();
  const prevTo=prevYm+'-'+String(prevLastDay).padStart(2,'0');
  const prevPrevFrom=(()=>{const dt=new Date(prevY,prevM-2,1);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-01`;})();
  try {
    const [prevPk,prevPp,prevTh,prevOp]=await Promise.all([
      fbGetRange('packing',prevFrom,prevTo),
      fbGetRange('preprocess',prevFrom,prevTo),
      fbGetRange('thawing',prevPrevFrom,prevTo),
      fbGetRange('outerpacking',prevFrom,prevTo)
    ]);
    const prevOpMap={};
    prevOp.filter(r=>!r.testRun&&!r.isTest).forEach(r=>{
      const dk=String(r.date||'').slice(0,10)+'|'+(r.product||'');
      prevOpMap[dk]=(prevOpMap[dk]||0)+(parseInt(r.outerEa)||0);
    });
    const prevBDP={};
    prevPk.forEach(r=>{
      const d=String(r.date||'').slice(0,10), prod=r.product||'기타', key=d+'|'+prod;
      if(!prevBDP[key]) prevBDP[key]={date:d,product:prod,pkKg:0};
      const p=L.products.find(x=>x.name===prod);
      prevBDP[key].pkKg+=p?(parseFloat(r.ea)||0)*p.kgea:0;
    });
    const prevGrouped={};
    Object.values(prevBDP).forEach(row=>{if(!prevGrouped[row.date])prevGrouped[row.date]=[];prevGrouped[row.date].push(row);});
    let pRm=0,pPk=0,pDays=0;
    Object.entries(prevGrouped).forEach(([date,allR])=>{
      const ppDay=(prevPp||[]).filter(r=>String(r.date||'').slice(0,10)===date);
      const dayRm=r2(getThKgByPP_(ppDay,prevTh||[],date));
      if(!dayRm) return;
      const effM={};
      allR.forEach(row=>{const oe=prevOpMap[date+'|'+row.product]||0;const p=L.products.find(x=>x.name===row.product);effM[row.product]=oe>0&&p?r2(oe*p.kgea):row.pkKg;});
      pRm+=dayRm; pPk+=r2(allR.reduce((s,r)=>s+(effM[r.product]||0),0)); pDays++;
    });
    const pYld=pRm>0?pPk/pRm*100:0;
    _moRenderPrevCmp(el,{yld:curYld,rm:curRm,pkKg:curPkKg,days:curDays},{yld:pYld,rm:pRm,pkKg:pPk,days:pDays},prevYm);
  } catch(e) {
    el.innerHTML=`<div class="ct">전월 비교</div><div style="text-align:center;color:#94a3b8;font-size:12px;padding:1.5rem">전월 데이터 없음</div>`;
  }
}
function _moRenderPrevCmp(el, cur, prev, prevYm) {
  const [py,pm]=prevYm.split('-');
  const months=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const prevLbl=py+'년 '+months[parseInt(pm)-1];
  const [cy,cm]=(_moYm||tod().slice(0,7)).split('-');
  const curLbl=cy+'년 '+months[parseInt(cm)-1];
  const fmt=v=>v>0?v.toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1}):'—';
  const delta=(c,p,up)=>{
    if(!c||!p) return '<span style="color:#94a3b8">—</span>';
    const d=c-p, good=up?(d>=0):(d<=0);
    const color=good?'#1a56db':'#e53935', icon=d>=0?'▲':'▼';
    return `<span style="color:${color};font-weight:600">${icon}${Math.abs(d).toFixed(1)}</span>`;
  };
  el.innerHTML=`<div class="ct">전월 비교</div>
    <table style="width:100%;font-size:12px;border-collapse:collapse">
      <thead><tr style="font-size:10px;color:#94a3b8;border-bottom:1px solid #f1f5f9">
        <td style="padding:5px 3px">항목</td>
        <td style="padding:5px 3px;text-align:right">${prevLbl}</td>
        <td style="padding:5px 3px;text-align:right">${curLbl}</td>
        <td style="padding:5px 3px;text-align:right">증감</td>
      </tr></thead>
      <tbody>
        <tr style="border-top:1px solid #f1f5f9">
          <td style="padding:7px 3px;color:#64748b">원육 사용량</td>
          <td style="padding:7px 3px;text-align:right">${fmt(prev.rm)}<span style="font-size:9px;color:#94a3b8">kg</span></td>
          <td style="padding:7px 3px;text-align:right;font-weight:600">${fmt(cur.rm)}<span style="font-size:9px;color:#94a3b8">kg</span></td>
          <td style="padding:7px 3px;text-align:right">${delta(cur.rm,prev.rm,true)}</td>
        </tr>
        <tr style="border-top:1px solid #f1f5f9">
          <td style="padding:7px 3px;color:#64748b">완제품 중량</td>
          <td style="padding:7px 3px;text-align:right">${fmt(prev.pkKg)}<span style="font-size:9px;color:#94a3b8">kg</span></td>
          <td style="padding:7px 3px;text-align:right;font-weight:600">${fmt(cur.pkKg)}<span style="font-size:9px;color:#94a3b8">kg</span></td>
          <td style="padding:7px 3px;text-align:right">${delta(cur.pkKg,prev.pkKg,true)}</td>
        </tr>
        <tr style="border-top:1px solid #f1f5f9;background:#f8fafc">
          <td style="padding:7px 3px;font-weight:700">평균 수율</td>
          <td style="padding:7px 3px;text-align:right">${prev.yld>0?prev.yld.toFixed(1)+'%':'—'}</td>
          <td style="padding:7px 3px;text-align:right;font-weight:700;color:${cur.yld>=52?'#1d4ed8':cur.yld>=50?'#c2410c':'#b91c1c'}">${cur.yld>0?cur.yld.toFixed(1)+'%':'—'}</td>
          <td style="padding:7px 3px;text-align:right">${delta(cur.yld,prev.yld,true)}</td>
        </tr>
        <tr style="border-top:1px solid #f1f5f9">
          <td style="padding:7px 3px;color:#64748b">작업일수</td>
          <td style="padding:7px 3px;text-align:right">${prev.days}일</td>
          <td style="padding:7px 3px;text-align:right;font-weight:600">${cur.days}일</td>
          <td style="padding:7px 3px;text-align:right">${delta(cur.days,prev.days,true)}</td>
        </tr>
        <tr style="border-top:1px solid #f1f5f9">
          <td style="padding:7px 3px;color:#64748b">일평균 원육</td>
          <td style="padding:7px 3px;text-align:right">${prev.days>0?fmt(prev.rm/prev.days):'—'}<span style="font-size:9px;color:#94a3b8">kg</span></td>
          <td style="padding:7px 3px;text-align:right;font-weight:600">${cur.days>0?fmt(cur.rm/cur.days):'—'}<span style="font-size:9px;color:#94a3b8">kg</span></td>
          <td style="padding:7px 3px;text-align:right">${cur.days>0&&prev.days>0?delta(cur.rm/cur.days,prev.rm/prev.days,true):'—'}</td>
        </tr>
      </tbody>
    </table>`;
}

function exportMonthlyReport() {
  const ym   = _moYm || tod().slice(0,7);
  const rows = window._moReportRows || [];
  if(!rows.length){ toast('데이터 없음','d'); return; }

  const [y,m]  = ym.split('-');
  const opMap  = (window._moGD && window._moGD.opMap) || {};
  const fmtNum = '#,##0.0';
  const fmtEa  = '#,##0';
  const fmtPct = '0.0%';
  const COL    = 'ABCDEFGHIJK';

  const wb = XLSX.utils.book_new();
  const ws = {};
  const merges = [];

  // 1행: 헤더
  ['생산일수','생산일자','작업인원','원육종류','제품명',
   '원육 사용량(KG)','생산량(EA)','완제품 원육 중량(KG)',
   '원육수율','Full Capa','비고'
  ].forEach((h,ci) => { ws[COL[ci]+'1'] = {t:'s', v:h}; });

  let r = 2;
  let i = 0;
  let dayCnt = 0;

  while(i < rows.length) {
    // 같은 날짜 행 묶기 (첫 행만 dayNo 있음)
    let j = i + 1;
    while(j < rows.length && rows[j].dayNo === '') j++;
    const dayRows = rows.slice(i, j);
    const cnt    = dayRows.length;
    const rStart = r;
    const rEnd   = r + cnt - 1;
    const date   = dayRows[0].date;   // "2026-04-01"
    dayCnt++;

    dayRows.forEach((row, ri) => {
      const isFirst = ri === 0;
      const ea = opMap[date+'|'+row.product] || 0;
      const rmVal  = isFirst ? (parseFloat(row.rm)||0) : 0;
      const pkVal  = parseFloat(row.pkKg)||0;
      const capaRaw = isFirst ? parseFloat(String(row.capa||'').replace(/,/g,'')) : NaN;

      ws['A'+r] = isFirst ? {t:'n', v:parseInt(row.dayNo)||dayCnt}           : {t:'s',v:''};
      ws['B'+r] = isFirst ? {t:'s', v:date.slice(5).replace('-','/')}         : {t:'s',v:''};
      ws['C'+r] = isFirst && row.workers!=='' ? {t:'n', v:parseFloat(row.workers)||0} : {t:'s',v:''};
      ws['D'+r] = isFirst ? {t:'s', v:row.meat||''}                           : {t:'s',v:''};
      ws['E'+r] = {t:'s', v:row.product||''};
      ws['F'+r] = isFirst && rmVal  ? {t:'n', v:rmVal,  z:fmtNum}             : {t:'s',v:''};
      ws['G'+r] = ea>0              ? {t:'n', v:ea,     z:fmtEa}              : {t:'s',v:''};
      ws['H'+r] = pkVal>0           ? {t:'n', v:pkVal,  z:fmtNum}             : {t:'s',v:''};
      // 원육수율: 수식 (첫 행에만, 다제품 날은 SUM(H start:H end)/F first)
      if(isFirst && rmVal) {
        const hRef = cnt>1 ? 'SUM(H'+rStart+':H'+rEnd+')' : 'H'+r;
        ws['I'+r] = {t:'n', f:hRef+'/F'+r, z:fmtPct};
      } else {
        ws['I'+r] = {t:'s',v:''};
      }
      ws['J'+r] = isFirst && !isNaN(capaRaw) && capaRaw>0 ? {t:'n', v:capaRaw, z:fmtEa} : {t:'s',v:''};
      ws['K'+r] = isFirst ? {t:'s', v:row.note||''}                           : {t:'s',v:''};
      r++;
    });

    // 다제품 날 → 셀 병합 (일수·날짜·인원·원육종류·원육사용량·수율·Capa·비고)
    if(cnt > 1) {
      [0,1,2,3,5,8,9,10].forEach(ci => {
        merges.push({s:{r:rStart-1,c:ci}, e:{r:rEnd-1,c:ci}});
      });
    }
    i = j;
  }

  // 합계 행 (수식)
  const rF = r;
  ws['A'+rF] = {t:'s', v:'합  계  ('+dayCnt+'일)'};
  merges.push({s:{r:rF-1,c:0}, e:{r:rF-1,c:4}});
  ws['F'+rF] = {t:'n', f:'SUM(F2:F'+(rF-1)+')', z:fmtNum};
  ws['G'+rF] = {t:'n', f:'SUM(G2:G'+(rF-1)+')', z:fmtEa};
  ws['H'+rF] = {t:'n', f:'SUM(H2:H'+(rF-1)+')', z:fmtNum};
  ws['I'+rF] = {t:'n', f:'H'+rF+'/F'+rF,         z:fmtPct};

  ws['!merges'] = merges;
  ws['!ref']    = 'A1:K'+rF;
  ws['!cols']   = [
    {wch:6},{wch:10},{wch:8},{wch:12},{wch:22},
    {wch:14},{wch:12},{wch:16},{wch:10},{wch:10},{wch:20}
  ];

  XLSX.utils.book_append_sheet(wb, ws, y+'년'+parseInt(m,10)+'월');
  XLSX.writeFile(wb, ym+'_월간생산일보.xlsx');
  toast('엑셀 다운로드 완료 ✓ (수식 포함)','s');
}


var _calY = 0, _calM = 0;

function toggleCal(){
  var pop = document.getElementById('calPop');
  if(pop.style.display === 'none'){
    var parts = (DDATE||tod()).split('-').map(Number);
    _calY = parts[0]; _calM = parts[1];
    renderCal();
    pop.style.display = 'block';
    setTimeout(function(){ document.addEventListener('click', closeCal); }, 100);
  } else {
    pop.style.display = 'none';
    document.removeEventListener('click', closeCal);
  }
}

function closeCal(e){
  var pop = document.getElementById('calPop');
  var btn = document.getElementById('calBtn');
  if(pop && !pop.contains(e.target) && e.target !== btn){
    pop.style.display = 'none';
    document.removeEventListener('click', closeCal);
  }
}

function calMove(dir){
  _calM += dir;
  if(_calM > 12){ _calM = 1; _calY++; }
  if(_calM < 1){ _calM = 12; _calY--; }
  renderCal();
}

function renderCal(){
  var months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('calTitle').textContent = _calY + '년 ' + months[_calM-1];
  var grid = document.getElementById('calGrid');
  var firstDay = new Date(_calY, _calM-1, 1).getDay();
  var lastDate = new Date(_calY, _calM, 0).getDate();
  var today = tod();
  var selected = DDATE || today;
  var html = '';
  for(var i=0;i<firstDay;i++) html += '<span></span>';
  for(var d=1;d<=lastDate;d++){
    var ds = _calY + '-' + String(_calM).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var isToday = ds === today;
    var isSel = ds === selected;
    var dow = (firstDay + d - 1) % 7;
    var col = dow===0?'#e00':dow===6?'#00e':'#333';
    var bg = isSel ? '#1a56db' : isToday ? '#e8f0fe' : 'transparent';
    var tc = isSel ? '#fff' : col;
    html += '<span onclick="pickDate(\''+ds+'\')" style="cursor:pointer;padding:4px 2px;border-radius:4px;font-size:13px;background:'+bg+';color:'+tc+';display:block">'+d+'</span>';
  }
  grid.innerHTML = html;
}

function pickDate(dateStr){
  document.getElementById('calPop').style.display = 'none';
  document.removeEventListener('click', closeCal);
  goDate(dateStr);
}

function goDate(dateStr){
  if(!dateStr) return;
  DDATE = dateStr;
  renderDaily();
}

function chDay(d){ const dt=new Date(DDATE);dt.setDate(dt.getDate()+d);DDATE=dt.toISOString().slice(0,10);renderDaily(); }

// 전처리 wagons → 해동 매칭으로 원육KG 계산 (중복 와건 제거)
function getThKgByPP_(ppRecs, allThawing, packDate) {
  const prevD=(()=>{const [y,m,dd]=packDate.split('-').map(Number);const dt=new Date(y,m-1,dd-1);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;})();
  const _normW=w=>String(w||'').replace(/[^0-9]/g,'')||String(w||'').trim();
  const wagons=[...new Set(ppRecs.flatMap(r=>(r.wagons||'').split(',').map(w=>_normW(w)).filter(Boolean)))];
  let matched=[];
  if(wagons.length){
    const sameTh=allThawing.filter(r=>String(r.date||'').slice(0,10)===packDate&&wagons.includes(_normW(r.wagon)));
    if(sameTh.length){
      matched=sameTh;
    } else {
      const todayAny=allThawing.filter(r=>String(r.date||'').slice(0,10)===packDate);
      const prevTh=allThawing.filter(r=>String(r.date||'').slice(0,10)===prevD&&wagons.includes(_normW(r.wagon)));
      if(todayAny.length){
        matched=todayAny;
      } else if(prevTh.length){
        matched=prevTh;
      }
    }
  } else {
    matched=allThawing.filter(r=>String(r.date||'').slice(0,10)===packDate);
    if(!matched.length) matched=allThawing.filter(r=>String(r.date||'').slice(0,10)===prevD);
  }
  if(!matched.length){
    matched=allThawing.filter(r=>String(r.date||'').slice(0,10)===packDate);
    if(!matched.length) matched=allThawing.filter(r=>String(r.date||'').slice(0,10)===prevD);
  }
  // 재입력이 다음날로 저장된 경우 보정 (날짜 오입력 대비)
  if(wagons.length){
    const _nextD=addDays(packDate,1);
    const _nextMatched=allThawing.filter(r=>String(r.date||'').slice(0,10)===_nextD&&wagons.includes(_normW(r.wagon)));
    const _curKg=r2(matched.reduce((s,r)=>s+(parseFloat(r.totalKg)||0),0));
    const _nxtKg=r2(_nextMatched.reduce((s,r)=>s+(parseFloat(r.totalKg)||0),0));
    if(_nextMatched.length && _nxtKg>_curKg*2) matched=_nextMatched;
  }
  const seen=new Set();
  const deduped=matched.filter(r=>{const k=(r.wagon||'')+'|'+String(r.date||'').slice(0,10)+'|'+(r.type||'');if(seen.has(k))return false;seen.add(k);return true;});
  return r2(deduped.reduce((s,r)=>s+(parseFloat(r.totalKg)||0),0));
}

async function renderDaily(){
  document.getElementById('dLbl').textContent=dateWithDay(DDATE);
  const prevD=(()=>{const [y,m,dd]=DDATE.split('-').map(Number);const dt=new Date(y,m-1,dd-1);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;})();
  const nextD=addDays(DDATE,1);
  // nextD도 로드 → 방혈 재입력이 다음날로 저장된 경우 반영
  await Promise.all([loadFromServer(prevD), loadFromServer(DDATE), loadFromServer(nextD)]);
  renderDailyFromLocal_(DDATE);
}

function renderDailyFromLocal_(d){
  const prevD=(()=>{const [y,m,dd]=d.split('-').map(Number);const dt=new Date(y,m-1,dd-1);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;})();
  // ── 테스트 체인 역추적: 내포장 testRun → 파쇄 → 자숙 → 전처리 → 방혈 ──────
  const pkAll=L.packing.filter(r=>String(r.date||'').slice(0,10)===d);
  const shAll=L.shredding.filter(r=>String(r.date||'').slice(0,10)===d);
  const ckAll=L.cooking.filter(r=>String(r.date||'').slice(0,10)===d);
  const ppAll=L.preprocess.filter(r=>String(r.date||'').slice(0,10)===d);

  // ① 내포장 중 테스트 레코드 와건 추출
  const _testPk=pkAll.filter(r=>r.testRun||r.isTest);
  const _testPkW=new Set(_testPk.flatMap(r=>(r.wagon||'').split(',').map(w=>w.trim()).filter(Boolean)));

  // ② 파쇄: 테스트 와건으로 나온(wagonOut) 레코드 → wagonIn 추출
  const _testSh=shAll.filter(r=>(r.wagonOut||'').split(',').map(w=>w.trim()).some(w=>_testPkW.has(w)));
  const _testShW=new Set(_testSh.flatMap(r=>(r.wagonIn||'').split(',').map(w=>w.trim()).filter(Boolean)));

  // ③ 자숙: 테스트 파쇄 wagonIn으로 나온(wagonOut) 레코드 → cage 추출
  const _testCk=ckAll.filter(r=>(r.wagonOut||'').split(',').map(w=>w.trim()).some(w=>_testShW.has(w)));
  const _testCkC=new Set(_testCk.flatMap(r=>(r.cage||'').split(',').map(c=>c.trim()).filter(Boolean)));

  // ④ 전처리: 테스트 자숙 cage 레코드 → wagons 추출
  const _testPp=ppAll.filter(r=>(r.cage||'').split(',').map(c=>c.trim()).some(c=>_testCkC.has(c)));
  const _testPpW=new Set(_testPp.flatMap(r=>(r.wagons||'').split(',').map(w=>w.trim()).filter(Boolean)));

  // ⑤ 각 공정 필터 (ID 기준 테스트 체인 제외)
  const _tPkId=new Set(_testPk.map(r=>r.fbId||r.id));
  const _tShId=new Set(_testSh.map(r=>r.fbId||r.id));
  const _tCkId=new Set(_testCk.map(r=>r.fbId||r.id));
  const _tPpId=new Set(_testPp.map(r=>r.fbId||r.id));

  const pk=pkAll.filter(r=>!_tPkId.has(r.fbId||r.id));
  const sh=shAll.filter(r=>!_tShId.has(r.fbId||r.id));
  const ck=ckAll.filter(r=>!_tCkId.has(r.fbId||r.id));
  const pp=ppAll.filter(r=>!_tPpId.has(r.fbId||r.id));
  // ────────────────────────────────────────────────────────────────────────────

  const bc=L.barcodes.filter(r=>String(r.date||'').slice(0,10)===prevD);
  // 방혈 데이터: 테스트 와건 제외
  const thByType={};
  L.thawing.filter(r=>String(r.date||'').slice(0,10)===d&&!_testPpW.has((r.wagon||'').trim())).forEach(r=>{
    (r.type||'').split(',').map(t=>t.trim()).filter(Boolean).forEach(t=>{
      if(!thByType[t]) thByType[t]=0;
      thByType[t]+=parseFloat(r.totalKg)||0;
    });
  });

  // 원육 계산: 전처리 wagons → 해동 매칭 (중복 와건 제거)
  // wagon 번호 정규화: "7호"/"7번대차"/"7" → 모두 "7"로 통일
  const _normW=w=>String(w||'').replace(/[^0-9]/g,'')||String(w||'').trim();
  const _ppWagons=[...new Set(pp.flatMap(r=>(r.wagons||'').split(',').map(w=>_normW(w)).filter(Boolean)))];
  const _thMatchFn=(r,date)=>String(r.date||'').slice(0,10)===date&&!_testPpW.has((r.wagon||'').trim())&&_ppWagons.includes(_normW(r.wagon));
  let _rawTh=[];
  if(_ppWagons.length){
    const _st=L.thawing.filter(r=>_thMatchFn(r,d));
    if(_st.length){
      _rawTh=_st;
    } else {
      // 오늘 wagon 매칭 실패 → 오늘 방혈 존재 여부 확인
      const _todayAny=L.thawing.filter(r=>String(r.date||'').slice(0,10)===d&&!_testPpW.has((r.wagon||'').trim()));
      const _yt=L.thawing.filter(r=>_thMatchFn(r,prevD));
      if(_todayAny.length){
        // 오늘 방혈은 있으나 wagon 포맷 불일치 → 오늘 전체 방혈 사용 (어제 wagon 오염 방지)
        _rawTh=_todayAny;
      } else if(_yt.length){
        // 오늘 방혈 없음(새벽 전처리) → 어제 wagon 매칭 사용
        _rawTh=_yt;
      }
    }
    // 모두 실패 시 최후 폴백 → 당일 전체, 없으면 전날 전체
    if(!_rawTh.length){
      _rawTh=L.thawing.filter(r=>String(r.date||'').slice(0,10)===d&&!_testPpW.has((r.wagon||'').trim()));
      if(!_rawTh.length) _rawTh=L.thawing.filter(r=>String(r.date||'').slice(0,10)===prevD&&!_testPpW.has((r.wagon||'').trim()));
    }
  } else {
    _rawTh=L.thawing.filter(r=>String(r.date||'').slice(0,10)===d&&!_testPpW.has((r.wagon||'').trim()));
    if(!_rawTh.length) _rawTh=L.thawing.filter(r=>String(r.date||'').slice(0,10)===prevD&&!_testPpW.has((r.wagon||'').trim()));
  }
  // 재입력이 다음날로 저장된 경우 보정 (날짜 미변경 입력 오류 대비)
  // 현재 찾은 방혈 totalKg보다 다음날 같은 wagon이 2배 이상이면 다음날 기록 우선 사용
  if(_ppWagons.length){
    const _nextD=addDays(d,1);
    const _nextRaw=L.thawing.filter(r=>String(r.date||'').slice(0,10)===_nextD&&!_testPpW.has((r.wagon||'').trim())&&_ppWagons.includes(_normW(r.wagon)));
    const _curKg=r2(_rawTh.reduce((s,r)=>s+(parseFloat(r.totalKg)||0),0));
    const _nxtKg=r2(_nextRaw.reduce((s,r)=>s+(parseFloat(r.totalKg)||0),0));
    if(_nextRaw.length && _nxtKg > _curKg*2) _rawTh=_nextRaw;
  }
  const _seenTh=new Set();
  const matchedTh=_rawTh.filter(r=>{const k=(r.wagon||'')+'|'+String(r.date||'').slice(0,10)+'|'+(r.type||'');if(_seenTh.has(k))return false;_seenTh.add(k);return true;});
  const rmKg=r2(matchedTh.reduce((s,r)=>s+(parseFloat(r.totalKg)||0),0));
  // 원육 타입별 KG: matchedTh 기준으로 재계산 (바코드·중복 해동 오염 방지)
  Object.keys(thByType).forEach(k=>delete thByType[k]);
  matchedTh.forEach(r=>{(r.type||'').split(',').map(t=>t.trim()).filter(Boolean).forEach(t=>{if(!thByType[t])thByType[t]=0;thByType[t]+=parseFloat(r.totalKg)||0;});});
  const ppKg=r2(pp.reduce((s,r)=>s+(parseFloat(r.kg)||0),0));
  const ckKg=r2(ck.reduce((s,r)=>s+(parseFloat(r.kg)||0),0));
  const shKg=r2(sh.reduce((s,r)=>s+(parseFloat(r.kg)||0),0));
  const totalEA=pk.reduce((s,r)=>s+(parseFloat(r.ea)||0),0);
  const totalMH=r2(sumMH(pp)+sumMH(ck)+sumMH(sh)+sumMH(pk));
  const defect=pk.reduce((s,r)=>s+(parseFloat(r.defect)||0),0);
  const defRate=totalEA>0?r2(defect/totalEA*100):0;
  // 원육수율 = 완제품 원료육(포장EA×원료육kgEA) / 원육투입
  const pkRawKg = r2(pk.reduce((s,r)=>{
    const p=L.products.find(x=>x.name===r.product);
    return s + (p ? (parseFloat(r.ea)||0)*p.kgea : 0);
  },0));
  const oYld = rmKg>0 ? r2(pkRawKg/rmKg*100) : 0;

  const _s=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  _s('d_ea', totalEA ? totalEA.toLocaleString() : '-');
  _s('d_yld', oYld ? parseFloat(oYld).toFixed(1)+'%' : '-');
  // 인시당 EA
  const mhPk = r2(sumMH(pk));
  const eaPerMh = mhPk>0 ? r2(totalEA/mhPk) : 0;
  _s('d_mh', eaPerMh||'-');
  // 포장불량 + 기준 2% 색상
  _s('d_def', defRate ? parseFloat(defRate).toFixed(1)+'%' : '-');
  const defEl = document.getElementById('d_def');
  if(defEl) defEl.style.color = defRate>2 ? 'var(--d)' : defRate>0 ? 'var(--s)' : '';
  const defLabel = document.getElementById('d_def_label');
  if(defLabel) defLabel.textContent = defRate>2 ? '% ▲기준초과' : defRate>0 ? '% ▼기준이하' : '%';

  // 공정별 현황 - 파쇄 원육타입: 연결된 자숙 레코드에서 type 가져오기
  function getShType(shRecs, ckRecs) {
    const types = new Set();
    shRecs.forEach(sh => {
      const wIns = (sh.wagonIn||'').split(',').map(w=>w.trim()).filter(Boolean);
      wIns.forEach(wIn => {
        const ckRec2 = ckRecs.find(cr => (cr.wagonOut||'').split(',').map(w=>w.trim()).includes(wIn));
        if(ckRec2 && ckRec2.type) ckRec2.type.split(',').forEach(t=>{ if(t.trim()) types.add(t.trim()); });
      });
    });
    if(types.size) return [...types].join(',');
    // fallback: 자숙 전체 타입
    const fallback = [...new Set(ckRecs.map(c=>c.type||'').filter(Boolean))];
    return fallback.join(',') || '-';
  }
  // 타입별 그룹핑 헬퍼
  function groupByType(recs, kgField) {
    const map = {};
    recs.forEach(r => {
      const types = (r.type||'미분류').split(',').map(t=>t.trim()).filter(Boolean);
      types.forEach(t => {
        if(!map[t]) map[t] = {kg:0, mh:0, h:0, _recs:[]};
        map[t].kg += parseFloat(r[kgField]||0);
        map[t].mh += dur(r.start,r.end)*(parseFloat(r.workers)||0);
        map[t].h += dur(r.start,r.end);
        map[t]._recs.push(r);
      });
    });
    return map;
  }

  // 포장 와건→파쇄→자숙 체인으로 원육타입 추적
  function getPkType(pkRec) {
    const wagons = (pkRec.wagon||'').split(',').map(w=>w.trim()).filter(Boolean);
    const types = new Set();
    wagons.forEach(wNum => {
      const shRec = sh.find(r=>(r.wagonOut||'').split(',').map(w=>w.trim()).includes(wNum));
      if(shRec) {
        (shRec.wagonIn||'').split(',').map(w=>w.trim()).filter(Boolean).forEach(wIn => {
          const ckRec = ck.find(r=>(r.wagonOut||'').split(',').map(w=>w.trim()).includes(wIn));
          if(ckRec && ckRec.type) ckRec.type.split(',').forEach(t=>types.add(t.trim()));
        });
      }
    });
    if(types.size) return [...types].join(', ');
    // 폴백: 전처리 데이터에서 가장 많이 사용된 타입
    const ppTypes = pp.map(r=>r.type).filter(Boolean);
    if(ppTypes.length) return [...new Set(ppTypes)].join(', ');
    return '';
  }

  const ppGroup = groupByType(pp, 'kg');
  const ckGroup = groupByType(ck, 'kg');
  // 파쇄는 type 필드 없으므로 wagonIn → 자숙 wagonOut → 자숙 type으로 추적
  const shGroup = {};
  sh.forEach(r => {
    const wIns = (r.wagonIn||'').split(',').map(w=>w.trim()).filter(Boolean);
    let type = r.type || '';
    if(!type) {
      for(const wIn of wIns) {
        const ckRec = ck.find(c2=>(c2.wagonOut||'').split(',').map(w=>w.trim()).includes(wIn));
        if(ckRec && ckRec.type){ type = ckRec.type.split(',')[0].trim(); break; }
      }
    }
    if(!type) type = '미분류';
    if(!shGroup[type]) shGroup[type] = {kg:0, mh:0, h:0, _recs:[]};
    shGroup[type].kg += parseFloat(r.kg)||0;
    shGroup[type].mh += dur(r.start,r.end)*(parseFloat(r.workers)||0);
    shGroup[type].h += dur(r.start,r.end);
    shGroup[type]._recs.push(r);
  });

  // 원육타입별 투입KG + 박스수 (matchedTh 기준, 바코드 대체)
  const rmByType = {};
  const rmBoxByType = {};
  matchedTh.forEach(r=>{
    const t=(r.type||'미분류').split(',')[0].trim();
    if(!rmByType[t]) rmByType[t]=0;
    if(!rmBoxByType[t]) rmBoxByType[t]=0;
    rmByType[t]+=parseFloat(r.totalKg)||0;
    rmBoxByType[t]+=parseFloat(r.boxes)||1;
  });

  // 포장 원료육 계산은 위 KPI 섹션에서 처리

  // 행 조립
  const procRows = [];
  const allTypes = [...new Set([...Object.keys(ppGroup), ...Object.keys(ckGroup), ...Object.keys(shGroup)])];

  allTypes.forEach(t => {
    if(ppGroup[t]) {
      const inKg = r2(rmByType[t]||thByType[t]||rmKg||0);
      const ppWaste = r2((ppGroup[t]._recs||[]).reduce((s,r)=>s+(parseFloat(r.waste)||0),0));
      const ppWorkers = Math.round((ppGroup[t]._recs||[]).reduce((s,r)=>s+(parseFloat(r.workers)||0),0) / Math.max((ppGroup[t]._recs||[]).length,1));
      const ppBoxes = rmBoxByType[t]||0;
      procRows.push({name:'전처리', type:t, origKg:inKg, in:inKg, out:r2(ppGroup[t].kg), waste:ppWaste, mh:r2(ppGroup[t].mh), h:calcActualHours(ppGroup[t]._recs||[])||r2(ppGroup[t].h), workers:ppWorkers, boxes:ppBoxes});
    }
  });
  allTypes.forEach(t => {
    if(ckGroup[t]) {
      const ckInKg = r2((ppGroup[t]?.kg)||ppKg||0); // 자숙 투입 = 전처리 산출
      const ckOrigKg = r2(rmByType[t]||thByType[t]||rmKg||0);
      const ckWorkers = Math.round((ckGroup[t]._recs||[]).reduce((s,r)=>s+(parseFloat(r.workers)||0),0) / Math.max((ckGroup[t]._recs||[]).length,1));
      procRows.push({name:'자숙', type:t, origKg:ckOrigKg, in:ckInKg, out:r2(ckGroup[t].kg), waste:0, mh:r2(ckGroup[t].mh), h:calcActualHours(ckGroup[t]._recs||[])||r2(ckGroup[t].h), workers:ckWorkers});
    }
  });
  allTypes.forEach(t => {
    if(shGroup[t]) {
      // 타입별 독립 계산 (우둔/홍두께 각각 1:1 매칭)
      const _shShare = 1;
      const shOrigKg = r2((rmByType[t]||thByType[t]||0));
      const shRecs_t = shGroup[t]._recs||[]; const shH = calcActualHours(shRecs_t)||r2(shGroup[t].h)||calcActualHours(sh);
      // 투입 KG: 자숙 산출을 파쇄 타입 비중으로 비례 배분 (복수 파쇄 타입 이중계산 방지)
      const shInKg = r2((ckGroup[t]?.kg) ?? ckKg);
      const shWaste = r2((shRecs_t).reduce((s,r)=>s+(parseFloat(r.waste)||0),0));
      const shWorkers = Math.round(shRecs_t.reduce((s,r)=>s+(parseFloat(r.workers)||0),0) / Math.max(shRecs_t.length,1));
      procRows.push({name:'파쇄', type:t, origKg:shOrigKg, in:shInKg, out:r2(shGroup[t].kg), waste:shWaste, mh:r2(shGroup[t].mh), h:shH, workers:shWorkers});
    }
  });

  // 포장: 제품+원육타입 조합별
  const pkMap = {};
  pk.forEach(r => {
    const rawType = getPkType(r);
    const key = (rawType||r.product||'기타') + '__' + (r.product||'기타');
    if(!pkMap[key]) pkMap[key]={type:rawType, product:r.product||'기타', kg:0, mh:0, h:0};
    const p = L.products.find(x=>x.name===r.product);
    pkMap[key].kg += p ? (parseFloat(r.ea)||0)*p.kgea : 0;
    pkMap[key].ea = (pkMap[key].ea||0) + (parseFloat(r.ea)||0);
    pkMap[key].mh += dur(r.start,r.end)*(parseFloat(r.workers)||0);
    pkMap[key]._recs = pkMap[key]._recs||[]; pkMap[key]._recs.push(r);
    pkMap[key].h += dur(r.start,r.end);
  });
  // 포장 투입/원육 분모: 전체 pkKg 비중으로 shKg·rmKg 배분 (육종별 분할 오류 방지)
  const _totalPkKgAll = r2(Object.values(pkMap).reduce((s,vv)=>s+vv.kg, 0));
  Object.values(pkMap).forEach(v => {
    const _pkShare = _totalPkKgAll > 0 ? v.kg / _totalPkKgAll : 1;
    const pkInKg = r2(shKg * _pkShare);
    const pkOrig = r2(rmKg * _pkShare);
    const label = v.type ? v.type+' · '+v.product : v.product;
    const pkWorkers = Math.round((v._recs||[]).reduce((s,r)=>s+(parseFloat(r.workers)||0),0) / Math.max((v._recs||[]).length,1));
    procRows.push({name:'포장', type:label, origKg:pkOrig||rmKg, in:pkInKg, out:r2(v.kg), waste:0, ea:v.ea||0, mh:r2(v.mh), h:calcActualHours(v._recs||[])||r2(v.h), workers:pkWorkers});
  });

  // 원육수율 색상 기준 (원육 투입 대비 각 공정 산출)
  function getOrigYldColor(name, y){
    if(y===null) return 'var(--g4)';
    if(name==='전처리') return y>=97?'var(--s)':y>=93?'var(--w)':'var(--d)';
    if(name==='자숙')   return y>=52?'var(--s)':y>=48?'var(--w)':'var(--d)';
    if(name==='파쇄')   return y>=48?'var(--s)':y>=44?'var(--w)':'var(--d)';
    return y>=48?'var(--s)':y>=44?'var(--w)':'var(--d)';
  }
  // 공정수율 색상 기준 (직전 공정 대비)
  function getProcYldColor(name, y){
    if(y===null) return 'var(--g4)';
    if(name==='전처리') return y>=97?'var(--s)':y>=93?'var(--w)':'var(--d)';
    if(name==='자숙')   return y>=54&&y<=58?'var(--s)':y>=50?'var(--w)':'var(--d)';
    if(name==='파쇄')   return y>=90?'var(--s)':y>=85?'var(--w)':'var(--d)';
    return y>=98&&y<=102?'var(--s)':y>=95?'var(--w)':'var(--d)';
  }

  const tbody=document.getElementById('pTbl');
  let _prevName = '';
  if(tbody) tbody.innerHTML = procRows.map(p => {
    const showName = p.name !== _prevName;
    if(showName) _prevName = p.name;
    const oYld = p.origKg>0 ? p.out/p.origKg*100 : null;
    const pYld = p.in>0 ? p.out/p.in*100 : null;
    const borderTop = showName && procRows.indexOf(p)>0 ? 'border-top:2px solid var(--g2);' : '';
    // 생산성: 전처리/자숙/파쇄는 kg/인시, 포장은 EA/인시
    let productivity = '-';
    if(p.name==='포장' && p.mh>0 && p.ea>0) productivity = r2(p.ea/p.mh).toLocaleString()+' EA/인시';
    else if(p.mh>0 && p.out>0) productivity = r2(p.out/p.mh).toFixed(1)+' kg/인시';
    return `<tr style="${borderTop}">
      <td style="text-align:left;font-weight:600">${showName?p.name:''}</td>
      <td style="text-align:center;color:var(--g6);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.type||'-'}">${p.type||'-'}</td>
      <td style="text-align:center">${p.in>0?p.in.toFixed(2):'-'}${p.boxes?'<br><span style="font-size:11px;color:var(--g5)">'+p.boxes+'박스</span>':''}</td>
      <td style="text-align:center;font-weight:600">${p.out.toFixed(2)}</td>
      <td style="text-align:center;color:var(--d);font-size:12px">${p.waste>0?p.waste.toFixed(2)+'kg':'-'}</td>
      <td style="text-align:center;font-weight:600">${oYld!==null?oYld.toFixed(1)+'%':'-'}</td>
      <td style="text-align:center;font-weight:600">${pYld!==null?pYld.toFixed(1)+'%':'-'}</td>
      <td style="text-align:center">${p.h.toFixed(1)}h</td>
      <td style="text-align:center">${p.workers||'-'}명</td>
      <td style="text-align:center;font-size:12px;color:var(--g6)">${productivity}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:1rem;color:var(--g4)">데이터 없음</td></tr>';

  // 포장 실적
  const pkTbody=document.getElementById('pkTbl');
  if(pkTbody){
    const byProd={};
    pk.forEach(r=>{ if(!byProd[r.product||'-']) byProd[r.product||'-']={ea:0,pouch:0,defect:0}; byProd[r.product||'-'].ea+=parseFloat(r.ea)||0; byProd[r.product||'-'].pouch+=parseFloat(r.pouch)||0; byProd[r.product||'-'].defect+=parseFloat(r.defect)||0; });
    pkTbody.innerHTML=Object.entries(byProd).map(([prod,v])=>`
      <tr>
        <td style="text-align:left">${prod}</td>
        <td style="text-align:center;font-weight:600">${v.ea.toLocaleString()}</td>
        <td style="text-align:center">${v.pouch.toLocaleString()}</td>
        <td style="text-align:center">${v.defect.toLocaleString()}</td>
        <td style="text-align:center;font-weight:600;color:${v.ea>0&&r2(v.defect/v.ea*100)<2?'var(--s)':'var(--d)'}">
          ${v.ea>0?r2(v.defect/v.ea*100).toFixed(2)+'%':'-'}
        </td>
      </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--g4)">데이터 없음</td></tr>';
  }

  // 방혈 데이터도 타임라인에 포함
  renderTL(pp,ck,sh,pk);

  // 원육 검수
  const bcGd=bc.filter(b=>b.status==='적합');
  const bPart={};
  bcGd.forEach(b=>{if(!bPart[b.part])bPart[b.part]={count:0,kg:0};bPart[b.part].count++;bPart[b.part].kg+=parseFloat(b.weightKg)||0;});
  const bcSumEl=document.getElementById('bcSum');
  if(bcSumEl) bcSumEl.innerHTML=bc.length?
    `<div class="kg3" style="margin-bottom:1rem">
      <div class="kc inf"><div class="klb">총검수</div><div class="kv">${bc.length}</div></div>
      <div class="kc gd"><div class="klb">적합</div><div class="kv">${bcGd.length}</div></div>
      <div class="kc bd2"><div class="klb">부적합</div><div class="kv">${bc.length-bcGd.length}</div></div>
    </div>
    <table class="tbl"><thead><tr><th>부위</th><th class="tr">수량</th><th class="tr">총중량(kg)</th></tr></thead>
    <tbody>${Object.entries(bPart).map(([p,v])=>`<tr><td>${p}</td><td class="tr">${v.count}</td><td class="tr">${r2(v.kg).toFixed(2)}</td></tr>`).join('')}</tbody></table>`:
    '<div class="emp">데이터 없음 (전날 원육 검수)</div>';
}

function renderTL(pp,ck,sh,pk){
  const el=document.getElementById('tlWrap');
  if(!el) return;
  const all=[...pp.map(r=>({...r,lbl:'전처리',col:'#1a56db'})),...ck.map(r=>({...r,lbl:'자숙',col:'#0e9f6e'})),...sh.map(r=>({...r,lbl:'파쇄',col:'#c27803'})),...pk.map(r=>({...r,lbl:'포장',col:'#7e3af2'}))];
  if(!all.length){el.innerHTML='<div class="emp">데이터 없음</div>';return;}
  const toMin=t=>{if(!t)return null;const p=t.slice(0,5).split(':');return+p[0]*60+(+p[1]||0);};
  const mins=all.flatMap(r=>[toMin(r.start),toMin(r.end)]).filter(v=>v!==null);
  const minT=Math.min(...mins), maxT=Math.max(...mins);
  const range=maxT-minT||60;
  const hours=[];
  for(let h=Math.floor(minT/60);h<=Math.ceil(maxT/60);h++) hours.push(h%24);
  el.innerHTML=`<div class="tlw"><div class="tlg">
    <div class="tlh">${hours.map(h=>`<div class="tlhr">${String(h).padStart(2,'0')}:00</div>`).join('')}</div>
    ${all.map(r=>{
      const s=toMin(r.start),e=toMin(r.end);
      if(s===null||e===null) return '';
      const left=r2((s-minT)/range*100), width=r2((e-s)/range*100);
      return `<div class="tlr"><div class="tll">${r.lbl}</div><div class="tlt"><div class="tlb" style="left:${left}%;width:${Math.max(width,2)}%;background:${r.col}">${r.start?r.start.slice(0,5):''}-${r.end?r.end.slice(0,5):''}</div></div></div>`;
    }).join('')}
  </div></div>`;
}

// ============================================================
// 트렌드
// ============================================================
var _trendChart=null;
async function renderTrend(){
  const days = PD==='week'?7 : PD==='month'?30 : 90;
  const endDate = tod();
  const startDate = (()=>{ const d=new Date(); d.setDate(d.getDate()-(days-1)); return d.toISOString().slice(0,10); })();

  const [pkRecs,ppRecs,ckRecs,shRecs] = await Promise.all([
    fbGetRange('packing',startDate,endDate),
    fbGetRange('preprocess',startDate,endDate),
    fbGetRange('cooking',startDate,endDate),
    fbGetRange('shredding',startDate,endDate)
  ]);

  // 포장 완료된 날짜만 (작업일)
  const pkDates = new Set(pkRecs.map(r=>String(r.date||'').slice(0,10)).filter(Boolean));
  const allDays=[];
  for(let i=days-1;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); allDays.push(d.toISOString().slice(0,10)); }
  const activeDates = allDays.filter(ds=>pkDates.has(ds));
  if(!activeDates.length) return;

  const lbl = activeDates.map(ds=>ds.slice(5)+'('+dayOfWeek(ds)+')');

  // 데이터 계산
  const eaData  = activeDates.map(ds=>pkRecs.filter(r=>r.date===ds).reduce((s,r)=>s+(parseFloat(r.ea)||0),0));
  const rmData  = activeDates.map(ds=>ppRecs.filter(r=>r.date===ds).reduce((s,r)=>s+(parseFloat(r.kg)||0),0));
  const ckYd    = activeDates.map(ds=>{ const rm=rmData[activeDates.indexOf(ds)]; const kg=ckRecs.filter(r=>r.date===ds).reduce((s,r)=>s+(parseFloat(r.kg)||0),0); return rm>0?r2(kg/rm*100):null; });
  const shYd    = activeDates.map(ds=>{ const rm=rmData[activeDates.indexOf(ds)]; const kg=shRecs.filter(r=>r.date===ds).reduce((s,r)=>s+(parseFloat(r.kg)||0),0); return rm>0?r2(kg/rm*100):null; });
  const pkYd    = activeDates.map(ds=>{ const rm=rmData[activeDates.indexOf(ds)]; const pkKg=pkRecs.filter(r=>r.date===ds).reduce((s,r)=>{ const p=L.products.find(x=>x.name===r.product); return s+(p?(parseFloat(r.ea)||0)*p.kgea:0); },0); return rm>0?r2(pkKg/rm*100):null; });
  const wasteData = activeDates.map(ds=>{
    const ppW=ppRecs.filter(r=>r.date===ds).reduce((s,r)=>s+(parseFloat(r.waste)||0),0);
    const shW=shRecs.filter(r=>r.date===ds).reduce((s,r)=>s+(parseFloat(r.waste)||0),0);
    const rm=rmData[activeDates.indexOf(ds)];
    return rm>0?r2((ppW+shW)/rm*100):null;
  });
  const defData  = activeDates.map(ds=>{ const ea=pkRecs.filter(r=>r.date===ds).reduce((s,r)=>s+(parseFloat(r.ea)||0),0); const def=pkRecs.filter(r=>r.date===ds).reduce((s,r)=>s+(parseFloat(r.defect)||0),0); return ea>0?r2(def/ea*100):null; });
  const mhEaData = activeDates.map((ds,i)=>{ const mh=sumMH([...ppRecs,...ckRecs,...shRecs,...pkRecs].filter(r=>r.date===ds)); return mh>0?r2(eaData[i]/mh):null; });

  // 이달 평균 / 전달 평균 (원육)
  const rmAvg = rmData.length>0 ? r2(rmData.reduce((s,v)=>s+v,0)/rmData.length) : 0;
  // 전달 평균 - 로컬 데이터에서
  const prevMonth = (()=>{ const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })();
  const prevPkRecs = (L.preprocess||[]).filter(r=>String(r.date||'').slice(0,7)===prevMonth);
  const prevRmAvg = prevPkRecs.length>0 ? r2(prevPkRecs.reduce((s,r)=>s+(parseFloat(r.kg)||0),0)/prevPkRecs.length) : 0;

  const baseOpts = (yLabel) => ({
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false} },
    scales:{
      x:{ticks:{color:'#888',font:{size:10},maxRotation:45},grid:{display:false}},
      y:{ticks:{color:'#888',font:{size:10},callback:yLabel},grid:{color:'rgba(128,128,128,0.1)'}}
    }
  });
  const lineOpts = (yLabel) => ({...baseOpts(yLabel), plugins:{legend:{position:'top',display:true}}});

  // ① 일별 생산량
  const c1=document.getElementById('c_ea');
  if(c1){ if(window._eaChart) window._eaChart.destroy();
    const target = L.dbTarget||0;
    window._eaChart=new Chart(c1,{ type:'bar',
      data:{labels:lbl,datasets:[
        {label:'생산EA',data:eaData,backgroundColor:'rgba(26,86,219,.7)',borderRadius:4,borderSkipped:false},
        ...(target>0?[{label:'목표',data:Array(lbl.length).fill(target),type:'line',borderColor:'#f87171',borderDash:[4,3],pointRadius:0,borderWidth:1.5,fill:false}]:[])
      ]},
      options:{...baseOpts(v=>v>=1000?(v/1000).toFixed(0)+'k':v),plugins:{legend:{display:target>0,position:'top'}}} }); }

  // ② 원육 사용량 + 이달평균/전월평균
  const c2=document.getElementById('trendChart');
  if(c2){ if(_trendChart) _trendChart.destroy();
    _trendChart=new Chart(c2,{ type:'bar',
      data:{labels:lbl,datasets:[
        {label:'원육(kg)',data:rmData,backgroundColor:'rgba(14,159,110,.7)',borderRadius:4,borderSkipped:false},
        {label:'이달평균',data:Array(lbl.length).fill(rmAvg),type:'line',borderColor:'#f59e0b',borderDash:[4,3],pointRadius:0,borderWidth:2,fill:false},
        ...(prevRmAvg>0?[{label:'전월평균',data:Array(lbl.length).fill(prevRmAvg),type:'line',borderColor:'#f87171',borderDash:[4,3],pointRadius:0,borderWidth:2,fill:false}]:[])
      ]},
      options:{...baseOpts(v=>v.toFixed(0)+'kg'),plugins:{legend:{display:true,position:'top'}}} }); }

  // ③ 공정별 수율
  const c3=document.getElementById('c_yd');
  if(c3){ if(_ydChart) _ydChart.destroy();
    _ydChart=new Chart(c3,{ type:'line',
      data:{labels:lbl,datasets:[
        {label:'자숙수율',data:ckYd,borderColor:'#22c55e',fill:false,tension:.3,pointRadius:4,spanGaps:true},
        {label:'파쇄수율',data:shYd,borderColor:'#f97316',fill:false,tension:.3,pointRadius:4,spanGaps:true},
        {label:'포장수율',data:pkYd,borderColor:'#6d28d9',fill:false,tension:.3,pointRadius:4,spanGaps:true}
      ]},
      options:{...lineOpts(v=>v+'%'),scales:{...baseOpts().scales,y:{...baseOpts().scales.y,min:0,max:100,ticks:{color:'#888',font:{size:10},callback:v=>v+'%'}}}} }); }

  // ④ 비가식부 손실률
  const c4=document.getElementById('c_waste');
  if(c4){ if(window._wasteChart) window._wasteChart.destroy();
    window._wasteChart=new Chart(c4,{ type:'bar',
      data:{labels:lbl,datasets:[{label:'손실률',data:wasteData,backgroundColor:'rgba(107,114,128,.6)',borderRadius:4,borderSkipped:false}]},
      options:{...baseOpts(v=>v!=null?v+'%':'')} }); }

  // ⑤ 포장 불량률 + 2% 기준선
  const c5=document.getElementById('c_def');
  if(c5){ if(window._defChart) window._defChart.destroy();
    window._defChart=new Chart(c5,{ type:'line',
      data:{labels:lbl,datasets:[
        {label:'불량률',data:defData,borderColor:'#e24b4a',backgroundColor:'rgba(226,75,74,0.1)',fill:true,tension:.3,pointRadius:4,spanGaps:true},
        {label:'기준(2%)',data:Array(lbl.length).fill(2),borderColor:'#f59e0b',borderDash:[4,3],pointRadius:0,borderWidth:1.5,fill:false}
      ]},
      options:{...lineOpts(v=>v+'%'),scales:{...baseOpts().scales,y:{...baseOpts().scales.y,min:0,ticks:{color:'#888',font:{size:10},callback:v=>v+'%'}}}} }); }

  // ⑥ 인시당 EA
  const c6=document.getElementById('c_mh');
  if(c6){ if(_mhChart) _mhChart.destroy();
    _mhChart=new Chart(c6,{ type:'bar',
      data:{labels:lbl,datasets:[{label:'인시당EA',data:mhEaData,backgroundColor:'rgba(194,120,3,.7)',borderRadius:4,borderSkipped:false}]},
      options:{...baseOpts(v=>v!=null?v.toFixed(1):''),plugins:{legend:{display:false}}} }); }
}


function setPd(pd, el){
  PD=pd;
  document.querySelectorAll('#p-trend .pt').forEach(b=>b.classList.remove('on'));
  if(el) el.classList.add('on');
  renderTrend();
}