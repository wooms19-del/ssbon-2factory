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
        <span style="font-size:14px;font-weight:600">${t.wagon||'(대차)'}</span>
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
  const wagons=selected.map(t=>t.wagon||'(대차)').join(', ');
  const types=[...new Set(selected.map(t=>t.type||'-'))].join(', ');
  info.innerHTML=`<div class="al al-i">🧊 대차 ${wagons} · ${types}${totalDeduct>0?' · 투입 <b>'+totalDeduct.toFixed(2)+'kg</b>':''}</div>`;
  info.classList.remove('hid');
}

function onPpStartBtn(){
  const existing=document.getElementById('pp_start').value;
  const t=existing||nowHM();
  document.getElementById('pp_start').value=t;
  document.getElementById('pp_startDisplay').textContent=`✅ 전처리 시작: ${t}`;
  document.getElementById('pp_startBtn').textContent=`전처리 시작됨 ${t}`;
  document.getElementById('pp_startBtn').style.background='var(--s)';

  // 선택된 대차 미리 저장 (나중에 saveP에서 사용)
  _ppSelectedWagons = getSelectedWagons().map(t=>t.wagon||'').filter(Boolean);

  // 즉시 잔여중량 차감
  const selectedWagons=getSelectedWagons();
  let deducted=false;
  selectedWagons.forEach(rec=>{
    if(!rec||(rec.end&&rec.end!=='')) return;
    const kgInp=document.querySelector('.pp-wagon-kg[data-id="'+rec.id+'"]');
    const deductKg=parseFloat(kgInp&&kgInp.value)||0;
    if(!deductKg){toast('대차 '+(rec.wagon||'')+' 투입 중량을 입력하세요','d');return;}
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
    if(remain<=0) gasRecord('updateThawEnd', {wagon:rec.wagon, end:t});
  });
  if(deducted) updPpWagon();
  updateThawInfo();
}

function updateThawInfo(){
  const _td=tod(), _yd=getYesterday_();
  const thawings=L.thawing.filter(t=>{
    const d=String(t.date||'').slice(0,10);
    if(d===_td) return true; // 오늘 시작 → 항상 표시
    if(d===_yd){
      // 어제 시작 → end에 날짜가 포함(다음날까지 이어진 경우)만 표시
      const e=String(t.end||'');
      return e.includes(_td)||e.length>8;
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
        <span style="font-size:13px;color:var(--g5);margin-left:8px">대차 ${t.wagon||'-'} · ${t.boxes||0}박스 · ${t.totalKg||0}kg · 시작 ${(t.start||'-').slice(0,5)}${done?' · 종료 '+(t.end||'').slice(0,5):''}</span>
        <span style="font-size:12px;margin-left:6px">${done?'✅완료':'🔄방혈중'}</span>
      </div>
    </div>`;
  }).join('');
}