// ============================================================
// 공정 저장 (전처리/자숙/파쇄/포장/소스)
// ============================================================
var PF={
  preprocess:[{i:'pp_type',k:'type'},{i:'pp_cage',k:'cage'},{i:'pp_start',k:'start'},{i:'pp_end',k:'end'},{i:'pp_workers',k:'workers',n:1},{i:'pp_kg',k:'kg',n:1},{i:'pp_waste',k:'waste',n:1}],
  cooking:   [{i:'ck_type',k:'type'},{i:'ck_cage',k:'cage'},{i:'ck_tank',k:'tank'},{i:'ck_start',k:'start'},{i:'ck_end',k:'end'},{i:'ck_workers',k:'workers',n:1},{i:'ck_kg',k:'kg',n:1},{i:'ck_wOut',k:'wagonOut'},{i:'ck_note',k:'note'}],
  shredding: [{i:'sh_wIn',k:'wagonIn'},{i:'sh_start',k:'start'},{i:'sh_end',k:'end'},{i:'sh_workers',k:'workers',n:1},{i:'sh_kg',k:'kg',n:1},{i:'sh_waste',k:'waste',n:1},{i:'sh_wOut',k:'wagonOut'}],
  packing:   [{i:'pk_prod',k:'product'},{i:'pk_mach',k:'machine'},{i:'pk_wagon',k:'wagon'},{i:'pk_start',k:'start'},{i:'pk_end',k:'end'},{i:'pk_workers',k:'workers',n:1},{i:'pk_ea',k:'ea',n:1},{i:'pk_pouch',k:'pouch',n:1},{i:'pk_defect',k:'defect',n:1},{i:'pk_stank',k:'sauceTank'},{i:'pk_skg',k:'sauceKg',n:1},{i:'pk_subkg',k:'subKg',n:1},{i:'pk_subnm',k:'subName'}],
  sauce:     [{i:'sc_nm',k:'name'},{i:'sc_tank',k:'tank'},{i:'sc_kg',k:'kg',n:1},{i:'sc_note',k:'note'}],
};
var FBCOL={preprocess:'preprocess',cooking:'cooking',shredding:'shredding',packing:'packing',sauce:'sauce'};
var PNM={preprocess:'전처리',cooking:'자숙',shredding:'파쇄',packing:'포장',sauce:'소스'};

async function saveP(type){
  const d={id:gid(),date:DDATE||tod()};
  PF[type].forEach(f=>{
    const el=document.getElementById(f.i);
    if(!el) return;
    d[f.k]=f.n?(parseFloat(el.value)||0):el.value;
  });

  // 전처리: 선택 대차 목록 저장 + 잔여중량 차감
  if(type==='preprocess'){
    // 지금시작 시 저장한 대차 목록 우선, 없으면 현재 체크박스에서 읽기
    const curWagons = getSelectedWagons ? getSelectedWagons().map(t=>t.wagon||'').filter(Boolean) : [];
    d.wagons = (_ppSelectedWagons.length ? _ppSelectedWagons : curWagons).join(',');
    // 대차 번호 없으면 1~10 랜덤 자동 배정 + 방혈 기록에도 동일 번호 부여
    if(!d.wagons) {
      const ppDate = d.date;
      const prevDate = addDays(ppDate, -1);
      const relatedThaw = L.thawing.filter(t => {
        const td = String(t.date||'').slice(0,10);
        return td === ppDate || td === prevDate;
      });
      const usedNums = new Set(relatedThaw.map(t=>parseInt(t.wagon||0)).filter(n=>n>0));
      const available = [1,2,3,4,5,6,7,8,9,10].filter(n=>!usedNums.has(n));
      const rnd = String(available.length ? available[Math.floor(Math.random()*available.length)] : (Math.floor(Math.random()*10)+1));
      d.wagons = rnd;
      toast('대차 번호 미선택 → '+rnd+'번 자동 배정','w');
      const ppType = (d.type||'').split(',')[0].trim();
      relatedThaw
        .filter(t => !t.wagon || t.wagon==='' || t.wagon==='0')
        .filter(t => !ppType || !t.type || (t.type||'').includes(ppType))
        .forEach(async rec => {
          rec.wagon = rnd;
          if(d.start && (!rec.end || rec.end === '')) rec.end = d.start; // 전처리 시작 = 방혈 종료
          saveL();
          let fbId = rec.fbId;
          if(!fbId) {
            const rows = await fbGetByDate('thawing', String(rec.date||'').slice(0,10));
            const match = rows.find(r=>r.id===rec.id);
            if(match) { fbId=match.fbId; rec.fbId=fbId; saveL(); }
          }
          if(fbId) { const upd2={wagon:rnd}; if(d.start&&(!rec.end||rec.end==='')) upd2.end=d.start; fbUpdate('thawing', fbId, upd2); }
        });
    }
    const wagons = _ppSelectedWagons.length
      ? _ppSelectedWagons.map(w => L.thawing.find(t=>t.wagon===w)).filter(Boolean)
      : (getSelectedWagons ? getSelectedWagons() : []);
    // 저장 시에도 잔여중량 차감 (지금시작 안 눌렀을 때)
    wagons.forEach(async rec=>{
      if(!rec||(rec.end&&rec.end!=='')) return;
      const kgInp=document.querySelector('.pp-wagon-kg[data-id="'+rec.id+'"]');
      const deductKg=parseFloat(kgInp&&kgInp.value)||0;
      if(!deductKg) return;
      const cur=rec.remainKg!==undefined?rec.remainKg:rec.totalKg;
      const remain=r2(cur-deductKg);
      rec.remainKg=remain<0?0:remain;
      if(remain<=0) rec.end=d.start||nowHM();
      saveL();
      // fbId 없으면 Firebase에서 직접 찾아서 업데이트
      let fbId = rec.fbId;
      if(!fbId) {
        const rows = await fbGetByDate('thawing', String(rec.date||'').slice(0,10));
        const match = rows.find(r=>r.wagon===rec.wagon);
        if(match) { fbId=match.fbId; rec.fbId=fbId; saveL(); }
      }
      if(!rec.end||rec.end==='') rec.end=d.start||nowHM();
      saveL();
      if(fbId){
        const upd={remainKg:rec.remainKg, end:rec.end};
        fbUpdate('thawing', fbId, upd);
      }
    });
  }

  L[type].push(d); saveL();

  // 폼 초기화
  PF[type].forEach(f=>{
    const el=document.getElementById(f.i);
    if(el&&!f.h) el.value='';
  });
  if(type==='preprocess'){
    document.getElementById('pp_startBtn').textContent='지금 시작';
    document.getElementById('pp_startBtn').style.background='';
    document.getElementById('pp_startDisplay').textContent='';
    document.getElementById('pp_start').value='';
    document.querySelectorAll('.pp-wagon-ck').forEach(c=>c.checked=false);
    document.getElementById('ppWagonInfo').classList.add('hid');
    _ppSelectedWagons = [];
  }

  renderPL(type);

  // Firebase 저장 + 구글시트 백업
  const fbId = await fbSave(FBCOL[type], d);
  if(fbId){
    d.fbId=fbId; saveL();
    const gasAction = {preprocess:'savePreprocess',cooking:'saveCooking',shredding:'saveShredding',packing:'savePacking',sauce:'saveSauce'}[type];
    if(gasAction) gasRecord(gasAction, d);
    toast(PNM[type]+' 저장됨 ✓');
  } else {
    toast(PNM[type]+' 저장 실패 - 로컬에만 저장됨','d');
  }
}

// ============================================================
// 공정 리스트 렌더링
// ============================================================
var PH={
  preprocess:(r)=>`${r.type||'-'} · ${r.kg||0}kg`,
  cooking:   (r)=>`${r.type||'-'} · ${r.kg||0}kg · 탱크 ${r.tank||'-'}`,
  shredding: (r)=>`${r.wagonIn||'-'} → ${r.wagonOut||'-'} · ${r.kg||0}kg`,
  packing:   (r)=>`${r.product||'-'} · ${r.ea||0}EA`,
  sauce:     (r)=>`${r.name||'-'} · ${r.kg||0}kg`,
};
var PS={
  preprocess:(r)=>`케이지 ${r.cage||'-'} · ${r.start||'-'}~${r.end||'-'} · ${r.workers||0}명`,
  cooking:   (r)=>`케이지 ${r.cage||'-'} · ${r.start||'-'}~${r.end||'-'} · ${r.workers||0}명`,
  shredding: (r)=>`${r.start||'-'}~${r.end||'-'} · ${r.workers||0}명`,
  packing:   (r)=>`${r.start||'-'}~${r.end||'-'} · ${r.workers||0}명 · 파우치 ${r.pouch||0}`,
  sauce:     (r)=>`탱크 ${r.tank||'-'} · ${r.note||''}`,
};

function renderPL(type){
  const today=tod();
  const items=(L[type]||[]).filter(r=>String(r.date||'').slice(0,10)===today);
  const el=document.getElementById('list-'+type);
  if(!el) return;
  if(!items.length){el.innerHTML='<div class="emp">데이터 없음</div>';return;}
  el.innerHTML='<div class="rl">'+items.map(r=>{
    const editForm = type==='packing' ? `
    <div id="pkEdit_${r.id}" style="display:none;background:#f8f9fa;border-radius:6px;padding:10px;margin-top:6px;font-size:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
        <div><label style="font-size:11px;color:var(--g5);display:block">와건번호</label><input class="fc" style="padding:4px 8px;font-size:12px;width:100%" id="pkEd_wagon_${r.id}" value="${r.wagon||''}"></div>
        <div><label style="font-size:11px;color:var(--g5);display:block">생산 EA</label><input class="fc" type="number" style="padding:4px 8px;font-size:12px;width:100%" id="pkEd_ea_${r.id}" value="${r.ea||0}"></div>
        <div><label style="font-size:11px;color:var(--g5);display:block">불량 EA</label><input class="fc" type="number" style="padding:4px 8px;font-size:12px;width:100%" id="pkEd_defect_${r.id}" value="${r.defect||0}"></div>
        <div><label style="font-size:11px;color:var(--g5);display:block">시작</label><input class="fc" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" style="padding:4px 8px;font-size:12px;width:100%" id="pkEd_start_${r.id}" value="${r.start||''}"></div>
        <div><label style="font-size:11px;color:var(--g5);display:block">종료</label><input class="fc" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" style="padding:4px 8px;font-size:12px;width:100%" id="pkEd_end_${r.id}" value="${r.end||''}"></div>
        <div><label style="font-size:11px;color:var(--g5);display:block">인원</label><input class="fc" type="number" style="padding:4px 8px;font-size:12px;width:100%" id="pkEd_workers_${r.id}" value="${r.workers||0}"></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn bp bsm" onclick="savePkEdit('${r.id}','${r.fbId||''}')">✔ 저장</button>
        <button class="btn bo bsm" onclick="document.getElementById('pkEdit_${r.id}').style.display='none'">취소</button>
      </div>
    </div>` : '';
    return `
    <div class="ri">
      <div>
        <div class="rm">${(PH[type]||((r)=>r.id))(r)}</div>
        <div class="rs">${(PS[type]||((r)=>''))(r)}</div>
      </div>
      <div style="display:flex;gap:4px">
        ${type==='packing'?`<button class="btn bo bsm" onclick="document.getElementById('pkEdit_${r.id}').style.display=document.getElementById('pkEdit_${r.id}').style.display==='none'?'block':'none'">✏️</button>`:''}
        <button class="btn bo bsm" onclick="delR('${type}','${r.id}','${r.fbId||''}')">삭제</button>
      </div>
    </div>${editForm}`;
  }).join('')+'</div>';
}

function savePkEdit(id, fbId) {
  const rec = L.packing.find(r=>r.id===id);
  if(!rec){ toast('기록 없음','d'); return; }
  const wagon   = document.getElementById('pkEd_wagon_'+id)?.value||'';
  const ea      = parseFloat(document.getElementById('pkEd_ea_'+id)?.value)||0;
  const defect  = parseFloat(document.getElementById('pkEd_defect_'+id)?.value)||0;
  const start   = document.getElementById('pkEd_start_'+id)?.value||'';
  const end_    = document.getElementById('pkEd_end_'+id)?.value||'';
  const workers = parseFloat(document.getElementById('pkEd_workers_'+id)?.value)||0;
  Object.assign(rec, {wagon, ea, defect, start, end:end_, workers});
  saveL();
  renderPL('packing');
  renderDailyFromLocal_(tod());
  if(fbId) fbUpdate('packing', fbId, {wagon, ea, defect, start, end:end_, workers});
  toast('포장 기록 수정됨 ✓','s');
}

// ============================================================
// 삭제
// ============================================================
function delR(type,id,fbId){
  const rec = L[type].find(r=>r.id===id);
  L[type]=L[type].filter(r=>r.id!==id); saveL(); renderPL(type);
  if(fbId) fbDelete(FBCOL[type]||type, fbId);
  if(type==='thawing') renderThawList();

  // 전처리 삭제 시 → 연결된 방혈 대차 잔여중량 복원
  if(type==='preprocess' && rec) {
    const ppKg = parseFloat(rec.kg)||0;
    const wagonsStr = rec.wagons||'';
    wagonsStr.split(',').map(w=>w.trim()).filter(Boolean).forEach(async wagonNum => {
      // 로컬에서 해당 대차 찾기
      const th = L.thawing.find(t=>t.wagon===wagonNum);
      if(th) {
        th.remainKg = r2((parseFloat(th.remainKg)||0) + ppKg);
        th.end = ''; // 방혈 종료 취소
        saveL();
        // Firebase 업데이트
        let fbThId = th.fbId;
        if(!fbThId) {
          const rows = await fbGetByDate('thawing', String(th.date||'').slice(0,10));
          const match = rows.find(r=>r.wagon===wagonNum);
          if(match) { fbThId=match.fbId; th.fbId=fbThId; saveL(); }
        }
        if(fbThId) fbUpdate('thawing', fbThId, {remainKg:th.remainKg, end:''});
      }
    });
    updPpWagon();
    updateThawInfo();
  }

  // 구글시트에서도 삭제
  if(rec) gasRecord('deleteRecord', {
    type: FBCOL[type]||type,
    date: rec.date||tod(),
    importCode: rec.importCode||'',
    start: rec.start||'',
    wagon: rec.wagon||''
  });
}