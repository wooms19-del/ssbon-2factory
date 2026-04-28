// ============================================================
// 공정 연동: 자숙 완료 와건 → 파쇄 탭
// ============================================================
function renderShWagonList() {
  const today = tod();
  const ckList = L.cooking.filter(r => String(r.date||'').slice(0,10)===today && r.wagonOut && r.end);
  const usedWagons = new Set(L.shredding
    .filter(r=>String(r.date||'').slice(0,10)===today)
    .flatMap(r=>(r.wagonIn||'').split(',').map(w=>w.trim()).filter(Boolean)));
  const el = document.getElementById('sh_wagonList');
  if(!el) return;
  const wagons = [];
  ckList.forEach(ck => {
    (ck.wagonOut||'').split(',').map(w=>w.trim()).filter(Boolean).forEach(wNum => {
      if(!wagons.find(w=>w.num===wNum))
        wagons.push({ num: wNum, type: ck.type||'', cage: ck.cage||'', used: usedWagons.has(wNum) });
    });
  });
  if(!wagons.length) { el.innerHTML='<div class="emp">자숙 완료된 와건 없음</div>'; return; }
  const pending = wagons.filter(w=>!w.used);
  const done    = wagons.filter(w=>w.used);
  el.innerHTML =
    (pending.length ? '<div style="font-size:12px;font-weight:600;color:var(--g6);margin-bottom:8px">와건 선택 → 자동 입력</div>' : '') +
    pending.map(w => `
      <label style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--g1);border-radius:8px;margin-bottom:6px;cursor:pointer">
        <input type="checkbox" class="sh-wagon-cb" data-wagon="${w.num}" data-type="${w.type}"
          onchange="onShWagonChange()" style="width:18px;height:18px;accent-color:var(--p)">
        <span style="font-size:14px;font-weight:700">${w.num}번 와건</span>
        <span style="font-size:13px;color:var(--g5);margin-left:auto">${w.type||'-'} · 케이지 ${w.cage||'-'}</span>
      </label>`).join('') +
    done.map(w => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--g1);border-radius:8px;margin-bottom:6px;opacity:0.7">
        <span style="font-size:14px;font-weight:700">${w.num}번 와건</span>
        <span style="font-size:13px;color:var(--g5);margin-left:auto">${w.type||'-'} · 케이지 ${w.cage||'-'}</span>
        <span style="font-size:12px;color:#4caf50;font-weight:600">✅파쇄완료</span>
      </div>`).join('');
  // 입력 행 초기화 보장
  if(typeof initShRows==='function') initShRows();
}

function renderPkWagonList() {
  const today = tod();
  const shList = L.shredding.filter(r => String(r.date||'').slice(0,10)===today && r.wagonOut && r.end);
  const usedInPk = new Set([
    ...L.packing.filter(r=>String(r.date||'').slice(0,10)===today).flatMap(r=>(r.wagon||'').split(',').map(w=>w.trim()).filter(Boolean)),
    ...(L.packing_pending||[]).filter(r=>String(r.date||'').slice(0,10)===today).flatMap(r=>(r.wagon||'').split(',').map(w=>w.trim()).filter(Boolean))
  ]);
  const inPkDone = new Set(
    L.packing.filter(r=>String(r.date||'').slice(0,10)===today).flatMap(r=>(r.wagon||'').split(',').map(w=>w.trim()).filter(Boolean))
  );
  const inPkPending = new Set(
    (L.packing_pending||[]).filter(r=>String(r.date||'').slice(0,10)===today).flatMap(r=>(r.wagon||'').split(',').map(w=>w.trim()).filter(Boolean))
  );
  const el = document.getElementById('pk_wagonList');
  if(!el) return;
  const wagons = [];
  shList.forEach(sh => {
    (sh.wagonOut||'').split(',').map(w=>w.trim()).filter(Boolean).forEach(wNum => {
      if(!wagons.find(w=>w.num===wNum))
        wagons.push({ num: wNum, kg: sh.kg||0, used: usedInPk.has(wNum) });
    });
  });
  if(!wagons.length) { el.innerHTML='<div class="emp">파쇄 완료된 와건 없음</div>'; return; }

  const getBadge = (wNum) => {
    let badge = '<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#e0f2fe;color:#0369a1;font-weight:600">파쇄완료</span>';
    if(inPkDone.has(wNum)) badge += ' <span style="font-size:11px;padding:2px 8px;border-radius:12px;background:var(--sl);color:var(--s);font-weight:600">포장완료</span>';
    else if(inPkPending.has(wNum)) badge += ' <span style="font-size:11px;padding:2px 8px;border-radius:12px;background:var(--pl);color:var(--p);font-weight:600">포장중</span>';
    return badge;
  };

  el.innerHTML = wagons.map(w => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--g1);border-radius:8px;margin-bottom:6px;${w.used?'opacity:0.8':''}">
      <span style="font-size:14px;font-weight:700">${w.num}번 와건</span>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:13px;color:var(--g5)">${w.kg}kg</span>
        ${getBadge(w.num)}
      </div>
    </div>`).join('');
}
function onShWagonChange() {
  const checked = [...document.querySelectorAll('.sh-wagon-cb:checked')];
  const c = document.getElementById('sh_rows');
  if(!c) return;
  // 기존 행 입력값 보존
  const existingRows = [...c.querySelectorAll('.sh-row')].map(row => ({
    wagonIn: row.querySelector('.sh-wIn').value.trim(),
    wagonOut: row.querySelector('.sh-wOut').value.trim(),
    start: row.querySelector('.sh-start').value.trim(),
    end: row.querySelector('.sh-end').value.trim(),
    kg: row.querySelector('.sh-kg').value,
    waste: row.querySelector('.sh-waste').value,
    workers: row.querySelector('.sh-workers').value
  }));
  c.innerHTML = '';
  if(checked.length === 0){
    if(existingRows.length) existingRows.forEach(r => shAddRow(r));
    else shAddRow();
    return;
  }
  // 체크된 와건마다 행 생성 (기존 입력 매칭하여 보존)
  checked.forEach(cb => {
    const wNum = cb.dataset.wagon;
    const existing = existingRows.find(r => r.wagonIn === wNum);
    shAddRow(existing || { wagonIn: wNum });
  });
}

// ============================================================
// 파쇄 다행 입력
// ============================================================
function _shRowHtml(idx, data){
  data = data || {};
  return `
    <div class="sh-row" data-idx="${idx}" style="border:1px solid var(--g3);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--g1)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <strong style="font-size:13px;color:var(--g7)">와건 #${idx+1}</strong>
        <button onclick="shRemoveRow(this)" style="font-size:12px;color:var(--d);background:none;border:none;cursor:pointer;padding:4px 8px">✕ 삭제</button>
      </div>
      <div class="fg">
        <div class="fgrp">
          <label class="fl">투입 와건번호</label>
          <input class="fc sh-wIn" type="text" value="${data.wagonIn||''}" placeholder="예: 22">
        </div>
        <div class="fgrp">
          <label class="fl">배출 와건번호</label>
          <input class="fc sh-wOut" type="text" value="${data.wagonOut||''}" placeholder="예: 30">
        </div>
        <div class="fgrp">
          <label class="fl">시작시간</label>
          <input class="fc sh-start" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" value="${data.start||''}">
        </div>
        <div class="fgrp">
          <label class="fl">종료시간</label>
          <input class="fc sh-end" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" value="${data.end||''}">
        </div>
        <div class="fgrp">
          <label class="fl">파쇄 KG</label>
          <input class="fc sh-kg" type="number" step="0.01" placeholder="0.00" value="${data.kg||''}">
        </div>
        <div class="fgrp">
          <label class="fl">비가식부 KG</label>
          <input class="fc sh-waste" type="number" step="0.01" placeholder="0.00" value="${data.waste||''}">
        </div>
        <div class="fgrp">
          <label class="fl">인원</label>
          <input class="fc sh-workers" type="number" placeholder="0" value="${data.workers||''}">
        </div>
      </div>
    </div>`;
}

function shAddRow(data){
  const c = document.getElementById('sh_rows');
  if(!c) return;
  const idx = c.children.length;
  const wrap = document.createElement('div');
  wrap.innerHTML = _shRowHtml(idx, data).trim();
  c.appendChild(wrap.firstChild);
}

function shRemoveRow(btn){
  const row = btn.closest('.sh-row');
  if(row) row.remove();
  document.querySelectorAll('#sh_rows .sh-row').forEach((r,i)=>{
    r.dataset.idx = i;
    const s = r.querySelector('strong'); if(s) s.textContent = '와건 #'+(i+1);
  });
  const c = document.getElementById('sh_rows');
  if(c && c.children.length===0) shAddRow();
}

async function saveShAll(){
  const rows = [...document.querySelectorAll('#sh_rows .sh-row')];
  if(!rows.length){ toast('입력된 와건이 없습니다','d'); return; }

  const recs = [];
  rows.forEach(row => {
    const d = {
      id: gid(),
      date: (typeof DDATE!=='undefined' && DDATE) || tod(),
      wagonIn: row.querySelector('.sh-wIn').value.trim(),
      wagonOut: row.querySelector('.sh-wOut').value.trim(),
      start: row.querySelector('.sh-start').value.trim(),
      end: row.querySelector('.sh-end').value.trim(),
      kg: parseFloat(row.querySelector('.sh-kg').value) || 0,
      waste: parseFloat(row.querySelector('.sh-waste').value) || 0,
      workers: parseFloat(row.querySelector('.sh-workers').value) || 0
    };
    if(!d.wagonIn && !d.kg && !d.start) return; // 빈 행 skip
    recs.push(d);
  });

  if(!recs.length){ toast('저장할 내용 없음','d'); return; }

  toast(`파쇄 ${recs.length}건 저장중...`,'i');
  let okCount = 0, failCount = 0;
  for(const d of recs){
    L.shredding.push(d); saveL();
    const fbId = await fbSave('shredding', d);
    if(fbId){
      d.fbId = fbId; saveL();
      if(typeof gasRecord==='function') gasRecord('saveShredding', d);
      okCount++;
    } else {
      failCount++;
    }
  }

  // 폼 초기화
  document.getElementById('sh_rows').innerHTML = '';
  shAddRow();
  document.querySelectorAll('.sh-wagon-cb:checked').forEach(cb => cb.checked = false);

  if(typeof renderPL==='function') renderPL('shredding');
  if(typeof renderShWagonList==='function') renderShWagonList();
  if(typeof renderPkWagonList==='function') renderPkWagonList();

  if(failCount===0) toast(`파쇄 ${okCount}건 저장됨 ✓`,'s');
  else toast(`파쇄 ${okCount}건 저장, ${failCount}건 실패`,'d');
}

// 초기 빈 행 보장
function initShRows(){
  const c = document.getElementById('sh_rows');
  if(c && c.children.length === 0) shAddRow();
}

// ============================================================
// 파쇄 탭 - 지금시작 버튼 (제거됨, 다행 구조에서는 카드별 시간 입력)
// ============================================================
var _shStartTime = '';

function onShStartBtn(){ /* deprecated */ }