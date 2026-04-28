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
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="checkbox" class="pp-wagon-ck" data-id="${t.id}" data-cart="${t.cart||''}" data-type="${t.type||''}" data-remain="${remain}" onchange="onPpWagonChange()" style="width:18px;height:18px;accent-color:var(--p)">
        <span style="font-size:14px;font-weight:600">${t.cart||'(대차)'}</span>
        <span style="font-size:13px;color:var(--g5);margin-left:auto">${t.type||'-'} · 잔여 <b style="color:var(--p)">${remain}kg</b></span>
      </label>
      <div class="pp-wagon-input" id="pp_wi_${t.id}" data-id="${t.id}" data-cart="${t.cart||''}" data-type="${t.type||''}" data-remain="${remain}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px dashed var(--g3)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
          <div>
            <label style="font-size:11px;color:var(--g5);display:block;margin-bottom:2px">시작</label>
            <div style="display:flex;gap:3px">
              <input class="fc pp-w-start" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" oninput="onPpDistChange()" style="padding:5px 7px;font-size:12px;flex:1;box-sizing:border-box">
              <button onclick="ppNowFill(this,'start')" style="padding:0 8px;font-size:11px;background:#1a56db;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap">⏱지금</button>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--g5);display:block;margin-bottom:2px">종료</label>
            <div style="display:flex;gap:3px">
              <input class="fc pp-w-end" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" oninput="onPpDistChange()" style="padding:5px 7px;font-size:12px;flex:1;box-sizing:border-box">
              <button onclick="ppNowFill(this,'end')" style="padding:0 8px;font-size:11px;background:var(--s);color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap">⏱지금</button>
            </div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--g5);margin-bottom:4px">분배할 케이지 (케이지번호 + kg)</div>
        <div class="pp-w-cages" style="display:flex;flex-direction:column;gap:4px">
          <!-- 케이지 행들 -->
        </div>
        <div style="display:flex;gap:4px;margin-top:6px;align-items:center;justify-content:space-between;font-size:11px">
          <button onclick="ppAddCage('${t.id}')" style="padding:4px 8px;font-size:11px;border:1px dashed #1a56db;background:#fff;color:#1a56db;border-radius:4px;cursor:pointer">+ 케이지 추가</button>
          <span class="pp-w-sum" style="color:var(--g5);font-weight:500">합계 0kg / ${remain}kg</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// 카드 안 ⏱지금 버튼 - 현재 시각 채우기
function ppNowFill(btn, kind){
  const wrap = btn.closest('.pp-wagon-input');
  if(!wrap) return;
  const inp = wrap.querySelector(kind === 'start' ? '.pp-w-start' : '.pp-w-end');
  if(inp) inp.value = (typeof nowHM==='function') ? nowHM() : new Date().toTimeString().slice(0,5);
  onPpDistChange();
}

// 비가식부 - 원육 2종 이상이면 원육별 입력 펼침
function refreshPpWasteByType(typeList){
  const wrap = document.getElementById('pp_wasteByType');
  const rows = document.getElementById('pp_wasteByTypeRows');
  const wInp = document.getElementById('pp_waste');
  if(!wrap || !rows) return;
  if(!typeList || typeList.length < 2){
    wrap.style.display = 'none';
    if(wInp) wInp.disabled = false;
    return;
  }
  wrap.style.display = 'block';
  if(wInp) wInp.disabled = true; // 분리 입력 사용 시 총합 자동
  // 기존 입력 보존
  const prev = {};
  rows.querySelectorAll('.pp-wt-inp').forEach(i => prev[i.dataset.type] = i.value);
  rows.innerHTML = typeList.map(t => `
    <div style="display:grid;grid-template-columns:90px 1fr 30px;gap:4px;align-items:center">
      <span style="font-size:12px;color:var(--g6);font-weight:500">${t}</span>
      <input class="fc pp-wt-inp" type="number" step="0.01" data-type="${t}" value="${prev[t]||''}" placeholder="0" oninput="syncPpWasteByType()" style="padding:4px 6px;font-size:12px;text-align:right">
      <span style="font-size:11px;color:var(--g5)">kg</span>
    </div>`).join('');
  syncPpWasteByType();
}

// 원육별 비가식부 입력 → pp_waste 합계 자동 반영
function syncPpWasteByType(){
  const rows = document.getElementById('pp_wasteByTypeRows');
  const wInp = document.getElementById('pp_waste');
  if(!rows || !wInp) return;
  const inps = rows.querySelectorAll('.pp-wt-inp');
  if(inps.length < 2) return; // 분리 모드 아니면 사용자 직접 입력값 유지
  let sum = 0;
  inps.forEach(i => sum += parseFloat(i.value) || 0);
  wInp.value = sum.toFixed(2);
}

// 저장 시 원육별 비가식부 객체 (있으면)
function getPpWasteByType(){
  const rows = document.getElementById('pp_wasteByTypeRows');
  if(!rows) return null;
  const inps = rows.querySelectorAll('.pp-wt-inp');
  if(inps.length < 2) return null;
  const m = {};
  inps.forEach(i => {
    const v = parseFloat(i.value) || 0;
    if(v) m[i.dataset.type] = v;
  });
  return Object.keys(m).length ? m : null;
}

// 대차 카드 안에 케이지 행 추가
function ppAddCage(wagonId){
  const wrap = document.getElementById('pp_wi_'+wagonId);
  if(!wrap) return;
  const list = wrap.querySelector('.pp-w-cages');
  const row = document.createElement('div');
  row.className = 'pp-w-cagerow';
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;align-items:center';
  row.innerHTML = `
    <input class="fc pp-w-cnum" type="text" placeholder="케이지 번호 (예: 7)" oninput="onPpDistChange()" style="padding:5px 7px;font-size:12px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:2px">
      <input class="fc pp-w-ckg" type="number" step="0.01" placeholder="0" oninput="onPpDistChange()" style="padding:5px 7px;font-size:12px;box-sizing:border-box;flex:1;text-align:right">
      <span style="font-size:11px;color:var(--g5)">kg</span>
    </div>
    <button onclick="ppRemoveCage(this)" style="width:24px;height:28px;border:1px solid var(--g3);border-radius:4px;background:#fff;color:var(--d);font-size:13px;cursor:pointer;padding:0">−</button>`;
  list.appendChild(row);
  onPpDistChange();
}

function ppRemoveCage(btn){
  const row = btn.closest('.pp-w-cagerow');
  if(row) row.remove();
  onPpDistChange();
}

function onPpDistChange(){
  let totalKg = 0;
  const cageNums = new Set();
  const carts = [];
  const types = new Set();
  let earliest = '', latest = '';

  document.querySelectorAll('.pp-wagon-input').forEach(wrap => {
    if(wrap.style.display === 'none') return;
    const remain = parseFloat(wrap.dataset.remain) || 0;
    let wSum = 0;
    wrap.querySelectorAll('.pp-w-cagerow').forEach(row => {
      const cn = (row.querySelector('.pp-w-cnum')||{}).value || '';
      const kg = parseFloat((row.querySelector('.pp-w-ckg')||{}).value) || 0;
      if(cn) cageNums.add(String(cn).trim());
      wSum += kg;
    });
    totalKg += wSum;
    const sumEl = wrap.querySelector('.pp-w-sum');
    if(sumEl){
      const willRemain = remain - wSum;
      sumEl.innerHTML = `합계 <b>${wSum.toFixed(2)}kg</b> / ${remain}kg · 빠지면 잔여 <b style="color:${willRemain<-0.01?'var(--d)':willRemain<0.01?'var(--s)':'var(--p)'}">${willRemain.toFixed(2)}kg</b>`;
      sumEl.style.color = wSum > remain + 0.01 ? 'var(--d)' : 'var(--g5)';
    }
    if(wSum > 0){
      if(wrap.dataset.cart) carts.push(wrap.dataset.cart);
      if(wrap.dataset.type) types.add(wrap.dataset.type);
    }
    // 가장 이른 시작 / 가장 늦은 종료
    const ws = (wrap.querySelector('.pp-w-start')||{}).value || '';
    const we = (wrap.querySelector('.pp-w-end')||{}).value || '';
    if(ws){ if(!earliest || ws < earliest) earliest = ws; }
    if(we){ if(!latest || we > latest) latest = we; }
  });

  // 외부 공통 필드에 자동 반영
  const kgInp = document.getElementById('pp_kg');
  if(kgInp) kgInp.value = totalKg ? totalKg.toFixed(2) : '';
  const cageInp = document.getElementById('pp_cage');
  if(cageInp) cageInp.value = [...cageNums].join(',');
  const typeInp = document.getElementById('pp_type');
  if(typeInp){
    if(types.size === 1) typeInp.value = [...types][0];
    else if(types.size > 1) typeInp.value = '혼합';
    else typeInp.value = '';
  }
  const startInp = document.getElementById('pp_start');
  if(startInp) startInp.value = earliest;
  const endInp = document.getElementById('pp_end');
  if(endInp) endInp.value = latest;

  // 원육 2종 이상이면 비가식부 분리 입력 펼침
  refreshPpWasteByType([...types]);

  // 알림 영역
  const info = document.getElementById('pp_wagonInfo');
  if(info){
    if(carts.length){
      info.innerHTML = `<div class="al al-i">🧊 대차 ${carts.join(',')} · ${[...types].join(',')||'-'} · 투입 <b>${totalKg.toFixed(2)}kg</b></div>`;
      info.classList.remove('hid');
    } else {
      info.classList.add('hid');
    }
  }
}

// distribution 객체 생성 (저장 시)
function getPpDistribution(){
  const dist = {};
  document.querySelectorAll('.pp-wagon-input').forEach(wrap => {
    if(wrap.style.display === 'none') return;
    const cart = wrap.dataset.cart;
    if(!cart) return;
    const cages = {};
    let total = 0;
    wrap.querySelectorAll('.pp-w-cagerow').forEach(row => {
      const cn = (row.querySelector('.pp-w-cnum')||{}).value || '';
      const kg = parseFloat((row.querySelector('.pp-w-ckg')||{}).value) || 0;
      if(cn && kg){
        cages[String(cn).trim()] = (cages[String(cn).trim()]||0) + kg;
        total += kg;
      }
    });
    if(total > 0){
      dist[cart] = {
        type: wrap.dataset.type || '',
        start: (wrap.querySelector('.pp-w-start')||{}).value || '',
        end: (wrap.querySelector('.pp-w-end')||{}).value || '',
        cages: cages,
        total: total
      };
    }
  });
  return dist;
}

// 대차별 차감량 (잔여중량 차감용)
function getPpDeductByCart(){
  const m = {};
  document.querySelectorAll('.pp-wagon-input').forEach(wrap => {
    if(wrap.style.display === 'none') return;
    const id = wrap.dataset.id;
    let total = 0;
    wrap.querySelectorAll('.pp-w-cagerow').forEach(row => {
      total += parseFloat((row.querySelector('.pp-w-ckg')||{}).value) || 0;
    });
    if(total > 0) m[id] = total;
  });
  return m;
}

function getSelectedWagons(){
  return [...document.querySelectorAll('.pp-wagon-ck:checked')]
    .map(c=>L.thawing.find(t=>t.id===c.dataset.id))
    .filter(Boolean);
}

function onPpWagonChange(){
  document.querySelectorAll('.pp-wagon-ck').forEach(ck=>{
    const inp=document.getElementById('pp_wi_'+ck.dataset.id);
    if(!inp) return;
    inp.style.display = ck.checked ? 'block' : 'none';
    if(ck.checked){
      // 체크 시 케이지 행이 없으면 1개 자동 추가
      const list = inp.querySelector('.pp-w-cages');
      if(list && list.children.length === 0){
        ppAddCage(ck.dataset.id);
      }
    }
  });
  onPpDistChange();
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
// (구버전 매트릭스 함수들 제거됨 - B안 카드 통합 방식 사용)

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
