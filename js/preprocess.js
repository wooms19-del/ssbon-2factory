// ============================================================
// 전처리 연동
// ============================================================
async function loadOpenThawingAndRender(){
  const _yd=getYesterday_();
  // 미종료 방혈 + 어제 방혈 기록 동시 로드 (어제 종료된 방혈도 전처리 탭에 표시)
  await Promise.all([loadOpenThawing(), loadFromServer(_yd)]);
  updateThawInfo();
  updPpWagon();
}

function updPpWagon(){
  const container=document.getElementById('pp_wagonChecks');
  if(!container) return;
  const _today=tod(), _yst=getYesterday_();
  const wagons=L.thawing.filter(t=>{
    if(t.end&&t.end!=='') return false;
    const d=String(t.date||'').slice(0,10);
    return d===_today||d===_yst;
  });
  if(!wagons.length){
    container.innerHTML='<div class="emp" style="font-size:13px;padding:8px 0">방혈 완료 대기중인 대차 없음</div>';
    return;
  }
  container.innerHTML=wagons.map(t=>{
    const remain=t.remainKg!==undefined?t.remainKg:t.totalKg;
    return `<div style="background:var(--g1);border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:6px">
        <input type="checkbox" class="pp-wagon-ck" data-id="${t.id}" data-remain="${remain}" onchange="onPpWagonChange()" style="width:18px;height:18px;accent-color:var(--p)">
        <span style="font-size:14px;font-weight:600">${t.cart||'(대차)'}</span>
        <span style="font-size:13px;color:var(--g5);margin-left:auto">${t.type||'-'} · 잔여 <b style="color:var(--p)">${remain}kg</b></span>
      </label>
      <div class="pp-wagon-input" id="pp_wi_${t.id}" style="display:none">
        <label style="font-size:12px;font-weight:600;color:var(--g6)">이번 전처리 투입 중량(kg)</label>
        <input class="fc pp-wagon-kg" type="number" step="0.01" data-id="${t.id}"
          placeholder="최대 ${remain}kg" max="${remain}" oninput="onPpWagonChange()"
          style="margin-top:4px">
      </div>
    </div>`;
  }).join('');
}

function getSelectedWagons(){
  return [...document.querySelectorAll('.pp-wagon-ck:checked')]
    .map(c=>L.thawing.find(t=>t.id===c.dataset.id))
    .filter(Boolean);
}

function onPpWagonChange(){
  document.querySelectorAll('.pp-wagon-ck').forEach(ck=>{
    const inp=document.getElementById('pp_wi_'+ck.dataset.id);
    if(inp) inp.style.display=ck.checked?'block':'none';
    if(ck.checked){
      const kgInp=inp?inp.querySelector('.pp-wagon-kg'):null;
      // 체크 시 잔여중량 자동 입력 (기본값)
      if(kgInp && !kgInp.value) kgInp.value = ck.dataset.remain||'';
    } else {
      const kgInp=inp?inp.querySelector('.pp-wagon-kg'):null;
      if(kgInp) kgInp.value='';
    }
  });
  const selected=getSelectedWagons();
  const info=document.getElementById('ppWagonInfo');
  if(!selected.length){info.classList.add('hid');return;}
  const autoType=selected[0].type?selected[0].type.split(',')[0].trim():'';
  if(autoType) document.getElementById('pp_type').value=autoType;
  let totalDeduct=0;
  selected.forEach(t=>{
    const inp=document.querySelector('.pp-wagon-kg[data-id="'+t.id+'"]');
    totalDeduct+=parseFloat(inp&&inp.value)||0;
  });
  const wagons=selected.map(t=>t.cart||'(대차)').join(', ');
  const types=[...new Set(selected.map(t=>t.type||'-'))].join(', ');
  info.innerHTML=`<div class="al al-i">🧊 대차 ${wagons} · ${types}${totalDeduct>0?' · 투입 <b>'+totalDeduct.toFixed(2)+'kg</b>':''}</div>`;
  info.classList.remove('hid');
  // 매트릭스 갱신
  if(typeof updPpMatrix==='function') updPpMatrix();
}

function onPpStartBtn(){
  const existing=document.getElementById('pp_start').value;
  const t=existing||nowHM();
  document.getElementById('pp_start').value=t;
  document.getElementById('pp_startDisplay').textContent=`✅ 전처리 시작: ${t}`;
  document.getElementById('pp_startBtn').textContent=`전처리 시작됨 ${t}`;
  document.getElementById('pp_startBtn').style.background='var(--s)';

  // 선택된 대차 미리 저장 (나중에 saveP에서 사용)
  _ppSelectedWagons = getSelectedWagons().map(t=>t.cart||'').filter(Boolean);

  // 즉시 잔여중량 차감
  const selectedWagons=getSelectedWagons();
  let deducted=false;
  selectedWagons.forEach(rec=>{
    if(!rec||(rec.end&&rec.end!=='')) return;
    const kgInp=document.querySelector('.pp-wagon-kg[data-id="'+rec.id+'"]');
    const deductKg=parseFloat(kgInp&&kgInp.value)||0;
    if(!deductKg){toast('해동대차 '+(rec.cart||'')+' 투입 중량을 입력하세요','d');return;}
    deducted=true;
    const cur=rec.remainKg!==undefined?rec.remainKg:rec.totalKg;
    const remain=r2(cur-deductKg);
    rec.remainKg=remain<0?0:remain;
    if(remain<=0) rec.end=t;
    saveL();
    // Firebase 업데이트 + 구글시트 백업
    if(rec.fbId){
      const updateData={remainKg:rec.remainKg};
      if(remain<=0) updateData.end=t;
      fbUpdate('thawing', rec.fbId, updateData);
    }
    if(remain<=0) gasRecord('updateThawEnd', {wagon:rec.cart, end:t});
  });
  if(deducted) updPpWagon();
  updateThawInfo();
}

function updateThawInfo(){
  const _td=tod(), _yd=getYesterday_();
  const thawings=L.thawing.filter(t=>{
    const d=String(t.date||'').slice(0,10);
    const e=String(t.end||'');
    // 1) 오늘 시작 + 미종료(방혈 진행 중) → 표시
    if(d===_td && !e) return true;
    // 2) end가 오늘 날짜로 종료된 것 → 오늘 전처리 대상이므로 표시
    //    (end는 'HH:MM' 또는 'YYYY-MM-DD HH:MM' 두 가지 포맷)
    if(e){
      // 'YYYY-MM-DD HH:MM' 포맷이면 앞 10자가 종료일
      if(e.length>=10 && e.slice(0,10)===_td) return true;
      // 'HH:MM' 포맷이면 thawing.date가 종료일
      if(e.length<=5 && d===_td) return true;
    }
    return false;
  });
  if(!thawings.length){
    document.getElementById('thawInfo').innerHTML='<div class="emp">방혈 데이터 없음</div>';
    return;
  }
  document.getElementById('thawInfo').innerHTML=thawings.map(t=>{
    const remain=t.remainKg!==undefined?t.remainKg:t.totalKg;
    const done=t.end&&t.end!=='';
    return`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--g2)">
      <div>
        <span style="font-size:14px;font-weight:700">${t.type||'-'}</span>
        <span style="font-size:13px;color:var(--g5);margin-left:8px">대차 ${t.cart||'-'} · ${t.boxes||0}박스 · ${t.totalKg||0}kg · 시작 ${(()=>{const d=new Date(t.date||tod());d.setDate(d.getDate()-1);return (d.getMonth()+1+'').padStart(2,'0')+'-'+(d.getDate()+'').padStart(2,'0');})()  } ${(t.start||'-').slice(0,5)}${done?' · 종료 '+(()=>{const e=t.end||'';return e.length>8?e.slice(5,10)+' '+e.slice(11,16):tod().slice(5)+' '+e;})():''}</span>
        <span style="font-size:12px;margin-left:6px">${done?'✅완료':'🔄방혈중'}</span>
      </div>
    </div>`;
  }).join('');
}
// ============================================================
// 대차×케이지 분배 매트릭스
// ============================================================
function updPpMatrix(){
  const wrap = document.getElementById('pp_matrixWrap');
  const root = document.getElementById('pp_matrix');
  if(!wrap || !root) return;

  const selected = getSelectedWagons();
  const cageStr = (document.getElementById('pp_cage')||{}).value || '';
  const cages = cageStr.split(',').map(s=>s.trim()).filter(Boolean);

  if(!selected.length || !cages.length){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';

  // 기존 입력값 보존
  const prev = {};
  root.querySelectorAll('.pp-mx-cell').forEach(inp => {
    prev[inp.dataset.cart+'|'+inp.dataset.cage] = inp.value;
  });

  let html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;background:var(--bg)">';
  html += '<thead><tr style="background:var(--g2)"><th style="padding:6px;border:1px solid var(--g3);min-width:80px;text-align:left">대차 \\ 케이지</th>';
  cages.forEach(cg => {
    html += `<th style="padding:6px;border:1px solid var(--g3);min-width:70px">${cg}번</th>`;
  });
  html += '<th style="padding:6px;border:1px solid var(--g3);min-width:70px;background:#eef">합계</th>';
  html += '<th style="padding:6px;border:1px solid var(--g3);min-width:70px;color:var(--g5)">잔여</th></tr></thead><tbody>';

  selected.forEach(t => {
    const remain = t.remainKg!==undefined?t.remainKg:t.totalKg;
    const cart = t.cart || '-';
    html += `<tr><td style="padding:6px;border:1px solid var(--g3);font-weight:600;background:var(--g1)">${cart}번</td>`;
    cages.forEach(cg => {
      const key = cart+'|'+cg;
      const v = prev[key] || '';
      html += `<td style="padding:2px;border:1px solid var(--g3)"><input type="number" step="0.01"
        class="pp-mx-cell" data-cart="${cart}" data-cage="${cg}" data-id="${t.id}" data-remain="${remain}"
        value="${v}" oninput="onPpMxInput()" placeholder="0"
        style="width:100%;padding:4px;border:none;text-align:right;font-size:12px;background:transparent"></td>`;
    });
    html += `<td class="pp-mx-rowsum" data-cart="${cart}" style="padding:6px;border:1px solid var(--g3);text-align:right;background:#eef;font-weight:600">0</td>`;
    html += `<td style="padding:6px;border:1px solid var(--g3);text-align:right;color:var(--g5)">${remain}</td></tr>`;
  });

  html += '<tr style="background:#fef"><td style="padding:6px;border:1px solid var(--g3);font-weight:600">케이지별 합</td>';
  cages.forEach(cg => {
    html += `<td class="pp-mx-colsum" data-cage="${cg}" style="padding:6px;border:1px solid var(--g3);text-align:right;font-weight:600">0</td>`;
  });
  html += `<td class="pp-mx-total" style="padding:6px;border:1px solid var(--g3);text-align:right;font-weight:700;background:#dfd">0</td>`;
  html += `<td style="padding:6px;border:1px solid var(--g3)"></td></tr>`;
  html += '</tbody></table></div>';

  // 자동 분배 버튼
  html += '<div style="display:flex;gap:6px;margin-top:6px"><button class="btn" onclick="ppMxAutoFill()" style="flex:1;padding:6px;font-size:12px">▦ 잔여중량 자동분배 (균등)</button><button class="btn" onclick="ppMxClear()" style="flex:1;padding:6px;font-size:12px;color:var(--d)">↺ 모두 지우기</button></div>';

  root.innerHTML = html;
  onPpMxInput();
}

function onPpMxInput(){
  const root = document.getElementById('pp_matrix');
  if(!root) return;
  const rowSums = {};
  const colSums = {};
  let total = 0;
  root.querySelectorAll('.pp-mx-cell').forEach(inp => {
    const v = parseFloat(inp.value) || 0;
    rowSums[inp.dataset.cart] = (rowSums[inp.dataset.cart]||0) + v;
    colSums[inp.dataset.cage] = (colSums[inp.dataset.cage]||0) + v;
    total += v;
  });
  root.querySelectorAll('.pp-mx-rowsum').forEach(td => {
    const cart = td.dataset.cart;
    const sum = rowSums[cart] || 0;
    // 잔여 초과 시 빨간색
    const cell = root.querySelector('.pp-mx-cell[data-cart="'+cart+'"]');
    const remain = cell ? parseFloat(cell.dataset.remain) || 0 : 0;
    td.textContent = sum.toFixed(2);
    td.style.color = sum > remain + 0.01 ? 'var(--d)' : '';
  });
  root.querySelectorAll('.pp-mx-colsum').forEach(td => {
    td.textContent = (colSums[td.dataset.cage] || 0).toFixed(2);
  });
  const totalEl = root.querySelector('.pp-mx-total');
  if(totalEl) totalEl.textContent = total.toFixed(2);

  // 총합을 pp_kg에 반영
  const kgInp = document.getElementById('pp_kg');
  if(kgInp && total > 0) kgInp.value = total.toFixed(2);
}

function ppMxAutoFill(){
  // 각 대차의 잔여중량을 케이지 수만큼 균등 분배
  const root = document.getElementById('pp_matrix');
  if(!root) return;
  const cartRemains = {};
  root.querySelectorAll('.pp-mx-cell').forEach(inp => {
    cartRemains[inp.dataset.cart] = parseFloat(inp.dataset.remain) || 0;
  });
  const cageCount = (document.getElementById('pp_cage').value||'').split(',').filter(s=>s.trim()).length;
  if(!cageCount) return;
  root.querySelectorAll('.pp-mx-cell').forEach(inp => {
    const remain = parseFloat(inp.dataset.remain) || 0;
    inp.value = (remain / cageCount).toFixed(2);
  });
  onPpMxInput();
}

function ppMxClear(){
  document.querySelectorAll('.pp-mx-cell').forEach(inp => inp.value = '');
  onPpMxInput();
}

// 매트릭스 입력값 → distribution 객체로 변환 (저장 시 사용)
function getPpDistribution(){
  const dist = {};
  document.querySelectorAll('.pp-mx-cell').forEach(inp => {
    const v = parseFloat(inp.value) || 0;
    if(!v) return;
    const cart = inp.dataset.cart, cage = inp.dataset.cage;
    if(!dist[cart]) dist[cart] = {};
    dist[cart][cage] = v;
  });
  return dist;
}
// 대차별 총 차감량 (잔여중량 차감용)
function getPpDeductByCart(){
  const m = {};
  document.querySelectorAll('.pp-mx-cell').forEach(inp => {
    const v = parseFloat(inp.value) || 0;
    if(!v) return;
    const id = inp.dataset.id;
    m[id] = (m[id]||0) + v;
  });
  return m;
}

function savePpEdit(id, fbId) {
  const rec = L.preprocess.find(r=>r.id===id);
  if(!rec){ toast('기록 없음','d'); return; }
  const cage    = document.getElementById('ppEd_cage_'+id)?.value||'';
  const start   = document.getElementById('ppEd_start_'+id)?.value||'';
  const end_    = document.getElementById('ppEd_end_'+id)?.value||'';
  const kg      = parseFloat(document.getElementById('ppEd_kg_'+id)?.value)||0;
  const waste   = parseFloat(document.getElementById('ppEd_waste_'+id)?.value)||0;
  const workers = parseFloat(document.getElementById('ppEd_workers_'+id)?.value)||0;
  Object.assign(rec, {cage, start, end:end_, kg, waste, workers});
  saveL();
  renderPL('preprocess');
  renderDailyFromLocal_(tod());
  if(fbId) fbUpdate('preprocess', fbId, {cage, start, end:end_, kg, waste, workers});
  toast('전처리 기록 수정됨 ✓','s');
}
