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
  if(!checked.length) return;
  const wagonNums = checked.map(w=>w.dataset.wagon).join(',');
  const el = document.getElementById('sh_wIn');
  if(el) el.value = wagonNums;
}

// ============================================================
// 파쇄 탭 - 지금시작 버튼
// ============================================================
var _shStartTime = '';

function onShStartBtn(){
  const existing = document.getElementById('sh_start').value;
  _shStartTime = existing || nowHM();
  document.getElementById('sh_start').value = _shStartTime;
  document.getElementById('sh_startDisplay').textContent = `✅ 파쇄 시작: ${_shStartTime}`;
  document.getElementById('sh_startBtn').textContent = `파쇄 시작됨 ${_shStartTime}`;
  document.getElementById('sh_startBtn').style.background = 'var(--s)';
}