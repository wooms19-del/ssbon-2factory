// ============================================================
// 공정 연동: 전처리 완료 케이지 → 자숙 탭
// ============================================================
function renderCkCageList() {
  const today = tod();
  const ppList = L.preprocess.filter(r =>
    String(r.date||'').slice(0,10)===today && r.cage && r.end
  );
  const usedCages = new Set([
    ...L.cooking.filter(r=>String(r.date||'').slice(0,10)===today)
      .flatMap(r=>(r.cage||'').split(',').map(c=>c.trim()).filter(Boolean)),
    ...(L.cooking_pending||[]).filter(r=>String(r.date||'').slice(0,10)===today)
      .flatMap(r=>(r.cage||'').split(',').map(c=>c.trim()).filter(Boolean))
  ]);
  const el = document.getElementById('ck_cageList');
  if(!el) return;
  const cages = [];
  ppList.forEach(pp => {
    (pp.cage||'').split(',').map(c=>c.trim()).filter(Boolean).forEach(cageNum => {
      if(!cages.find(c=>c.num===cageNum))
        cages.push({ num: cageNum, type: pp.type||'', used: usedCages.has(cageNum) });
    });
  });
  if(!cages.length) { el.innerHTML='<div class="emp">전처리 완료된 케이지 없음</div>'; return; }
  const pending = cages.filter(c=>!c.used);
  const done    = cages.filter(c=>c.used);
  el.innerHTML =
    (pending.length ? '<div style="font-size:12px;font-weight:600;color:var(--g6);margin-bottom:8px">케이지 선택 → 자동 입력</div>' : '') +
    pending.map(c => `
      <label style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--g1);border-radius:8px;margin-bottom:6px;cursor:pointer">
        <input type="checkbox" class="ck-cage-cb" data-cage="${c.num}" data-type="${c.type}"
          onchange="onCkCageChange()" style="width:18px;height:18px;accent-color:var(--p)">
        <span style="font-size:14px;font-weight:700">${c.num}번 케이지</span>
        <span style="font-size:13px;color:var(--g5);margin-left:auto">${c.type||'-'}</span>
      </label>`).join('') +
    done.map(c => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--g1);border-radius:8px;margin-bottom:6px;opacity:0.7">
        <span style="font-size:14px;font-weight:700">${c.num}번 케이지</span>
        <span style="font-size:13px;color:var(--g5);margin-left:auto">${c.type||'-'}</span>
        <span style="font-size:12px;color:#4caf50;font-weight:600">✅자숙완료</span>
      </div>`).join('');
}

function onCkCageChange() {
  const checked = [...document.querySelectorAll('.ck-cage-cb:checked')];
  if(!checked.length) return;
  const cageNums = checked.map(c=>c.dataset.cage).join(',');
  const type = checked[0].dataset.type;
  // 마지막 탱크 행에 자동 입력
  const rows = document.querySelectorAll('#ck_tankRows > div');
  if(rows.length){
    const lastRow = rows[rows.length-1];
    const cageEl = lastRow.querySelector('.ck-row-cage');
    const typeEl = lastRow.querySelector('.ck-row-type');
    if(cageEl) cageEl.value = cageNums;
    if(typeEl && type) typeEl.value = type;
  }
}

// ============================================================
// 자숙 탭 - 포장형식 pending (시작/진행중/종료)
// ============================================================
var _ckRowIdx = 0;

function addCkTankRow(){
  const idx = _ckRowIdx++;
  const row = document.createElement('div');
  row.id = 'ckRow_'+idx;
  row.style.cssText = 'background:var(--g1);border-radius:8px;padding:12px;margin-bottom:8px;position:relative';
  row.innerHTML = `
    <button onclick="removeCkRow(${idx})" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--g4);font-size:16px;cursor:pointer">✕</button>
    <div style="font-size:12px;font-weight:700;color:var(--g6);margin-bottom:8px">탱크 ${idx+1}</div>
    <div class="fg">
      <div class="fgrp">
        <label class="fl">탱크 번호 <span class="req">*</span></label>
        <select class="fc ck-row-tank" data-idx="${idx}">
          <option value="">선택</option>
          <option>1번탱크</option><option>2번탱크</option><option>3번탱크</option><option>4번탱크</option>
          <option>5번탱크</option><option>6번탱크</option><option>7번탱크</option>
        </select>
      </div>
      <div class="fgrp">
        <label class="fl">원육 타입</label>
        <select class="fc ck-row-type" data-idx="${idx}">
          <option value="">선택</option><option>설도</option><option>홍두깨</option><option>우둔</option>
        </select>
      </div>
      <div class="fgrp cs2">
        <label class="fl">케이지 번호</label>
        <input class="fc ck-row-cage" type="text" placeholder="예: 9,10" data-idx="${idx}">
      </div>
      <div class="fgrp">
        <label class="fl">인원</label>
        <input class="fc ck-row-workers" type="number" placeholder="0" data-idx="${idx}">
      </div>
      <div class="fgrp">
        <label class="fl">시작시간 <span class="req">*</span></label>
        <input class="fc ck-row-start" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" data-idx="${idx}">
      </div>
      <div class="fgrp" style="display:flex;align-items:flex-end">
        <button type="button" class="btn bo bsm" onclick="setCkRowNow(${idx})">🕐 지금으로</button>
      </div>
    </div>`;
  document.getElementById('ck_tankRows').appendChild(row);
}

function removeCkRow(idx){
  const el = document.getElementById('ckRow_'+idx);
  if(el) el.remove();
}

function setCkNow(){
  document.getElementById('ck_startTime').value = nowHM();
}
function setCkRowNow(idx){
  const row=document.getElementById('ckRow_'+idx);
  if(row){ const inp=row.querySelector('.ck-row-start'); if(inp) inp.value=nowHM(); }
}

function showCkStartCard(){
  document.getElementById('ck_startCard').style.display='';
  document.getElementById('ck_startCard').scrollIntoView({behavior:'smooth', block:'start'});
}

function onCkStartBtn(){
  const rows = document.querySelectorAll('#ck_tankRows > div');
  if(!rows.length){ toast('탱크를 먼저 추가하세요','d'); return; }
  if(!L.cooking_pending) L.cooking_pending = [];
  let added = 0;
  rows.forEach(row => {
    const tank = row.querySelector('.ck-row-tank').value;
    if(!tank){ toast('탱크번호를 선택하세요','d'); return; }
    const startTime = row.querySelector('.ck-row-start')?.value || '';
    if(!startTime){ toast('시작시간을 입력하세요','d'); return; }
    const type = row.querySelector('.ck-row-type').value;
    const cage = row.querySelector('.ck-row-cage').value.trim();
    const workers = parseFloat(row.querySelector('.ck-row-workers').value)||0;
    L.cooking_pending.push({ id:gid(), date:DDATE||tod(), tank, type, cage, workers, start:startTime, end:'', kg:0, wagonOut:'', note:'' });
    added++;
  });

  if(!added) return;
  saveL();
  document.getElementById('ck_tankRows').innerHTML='';
  document.getElementById('ck_startTime').value='';
  _ckRowIdx=0;
  document.querySelectorAll('.ck-cage-cb').forEach(c=>c.checked=false);

  document.getElementById('ck_startCard').style.display='none';
  document.getElementById('ck_pendingCard').style.display='';
  renderCkPending();
  toast(`자숙 시작 — ${added}개 탱크 진행중 ✓`,'i');
}

function renderCkPending(){
  if(!L.cooking_pending) L.cooking_pending=[];
  const pending = L.cooking_pending.filter(r=>String(r.date||'').slice(0,10)===tod());
  const el = document.getElementById('ck_pendingList');
  const cntEl = document.getElementById('ck_pendingCnt');
  const card = document.getElementById('ck_pendingCard');
  if(!el) return;
  if(cntEl) cntEl.textContent = pending.length+'개';
  if(!pending.length){ card.style.display='none'; el.innerHTML=''; return; }
  card.style.display='';

  el.innerHTML = pending.map(r=>`
    <div id="ckPend_${r.id}" style="border:1px solid var(--g2);border-radius:8px;margin-bottom:10px;overflow:hidden">
      <div style="background:#f0fdf4;padding:12px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--g8)">${r.tank} · ${r.type||'타입미정'} · 케이지 ${r.cage||'-'}</div>
          <div style="font-size:12px;color:var(--g5);margin-top:3px">시작 ${r.start} · ${r.workers}명</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn bs bsm" onclick="toggleCkEndForm('${r.id}')">종료 입력</button>
          <button class="btn bo bsm" style="color:var(--d);border-color:var(--d)" onclick="deleteCkPending('${r.id}')">삭제</button>
        </div>
      </div>
      <div id="ckEndForm_${r.id}" style="display:none;padding:12px;background:#fff">
        <div class="fg">
          <div class="fgrp">
            <label class="fl">종료시간 <span class="req">*</span></label>
            <input class="fc" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" id="ckEnd_t_${r.id}">
          </div>
          <div class="fgrp">
            <label class="fl">자숙 KG <span class="req">*</span></label>
            <input class="fc" type="number" step="0.01" id="ckEnd_kg_${r.id}" placeholder="0.00">
          </div>
          <div class="fgrp">
            <label class="fl">배출 와건번호</label>
            <input class="fc" type="text" id="ckEnd_wout_${r.id}" placeholder="예: 30,17">
          </div>
          <div class="fgrp">
            <label class="fl">특이사항</label>
            <input class="fc" type="text" id="ckEnd_note_${r.id}">
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn bs bblk" style="flex:1" onclick="saveCkEnd('${r.id}')">종료 저장</button>
          <button class="btn bo bsm" onclick="toggleCkEndForm('${r.id}')">취소</button>
        </div>
      </div>
    </div>`).join('');
}

function toggleCkEndForm(id){
  const form = document.getElementById('ckEndForm_'+id);
  if(form) form.style.display = form.style.display==='none'?'':'none';
}

async function deleteCkPending(id){
  if(!confirm('진행중인 자숙을 삭제하시겠습니까?')) return;
  if(!L.cooking_pending) L.cooking_pending=[];
  const rec = L.cooking_pending.find(r=>r.id===id);
  if(rec && rec.fbId){
    try { await db.collection('cooking').doc(rec.fbId).delete(); }
    catch(e){ console.error('Firebase 삭제 오류',e); }
  }
  L.cooking_pending = L.cooking_pending.filter(r=>r.id!==id);
  saveL();
  renderCkPending();
  toast('자숙 삭제됨','i');
}

async function saveCkEnd(id){
  if(!L.cooking_pending) L.cooking_pending=[];
  const rec = L.cooking_pending.find(r=>r.id===id);
  if(!rec){ toast('데이터 없음','d'); return; }
  const end = document.getElementById('ckEnd_t_'+id).value;
  const kg = parseFloat(document.getElementById('ckEnd_kg_'+id).value)||0;
  const wagonOut = document.getElementById('ckEnd_wout_'+id).value.trim();
  const note = document.getElementById('ckEnd_note_'+id).value.trim();
  if(!end){ toast('종료시간을 입력하세요','d'); return; }
  if(!kg){ toast('자숙 KG를 입력하세요','d'); return; }

  const completed = {...rec, end, kg, wagonOut, note};
  L.cooking_pending = L.cooking_pending.filter(r=>r.id!==id);
  L.cooking.push(completed);
  saveL();

  const fbId = await fbSave('cooking', completed);
  if(fbId){ completed.fbId=fbId; saveL(); gasRecord('saveCooking', completed); toast(`${completed.tank} 종료 저장됨 ✓`); }
  else { toast('저장 실패 - 로컬에만 저장됨','d'); }

  renderCkPending();
  renderPL('cooking');
  renderShWagonList();
}