// ============================================================
// 포장 탭 - 시작/진행중/종료 3단계
// ============================================================

var _pkRowIdx = 0;

// 설비 시작 행 추가
function addPkMachRow(){
  const idx = _pkRowIdx++;
  const prodOpts = '<option value="">선택</option>'+L.products.map(p=>`<option>${p.name}</option>`).join('');
  const subOpts = '<option value="">없음</option>'+(L.submats||[]).map(s=>`<option>${s}</option>`).join('');

  // 파쇄 완료 와건 목록 생성 (kg 포함, wagonOutDist 우선)
  const today = tod();
  const yesterday = getYesterday_();
  const shWagonsMap = {}; // {와건번호: 총kg}
  L.shredding.filter(r=>{
    const d = String(r.date||'').slice(0,10);
    return (d===today||d===yesterday) && r.wagonOut && r.end;
  }).forEach(sh=>{
    if(sh.wagonOutDist){
      Object.entries(sh.wagonOutDist).forEach(([w,kg])=>{
        shWagonsMap[w] = (shWagonsMap[w]||0) + (parseFloat(kg)||0);
      });
    } else {
      // 호환: wagonOutDist 없으면 sh.kg을 와건들에 균등 분배 (추정)
      const ws = (sh.wagonOut||'').split(',').map(x=>x.trim()).filter(Boolean);
      if(ws.length){
        const each = (parseFloat(sh.kg)||0)/ws.length;
        ws.forEach(w => { shWagonsMap[w] = (shWagonsMap[w]||0) + each; });
      }
    }
  });
  const shWagons = Object.keys(shWagonsMap);
  // 완료/사용중 판정 - 잔여 ≤ 0 이면 차단
  // (today + yesterday 둘 다 봐야 어제 포장된 건도 잡힘)
  const usedMap = {};
  (L.packing||[]).filter(p => {
    const d = String(p.date||'').slice(0,10);
    return d===today || d===yesterday;
  }).forEach(p => {
    if(p.wagonDist){
      Object.entries(p.wagonDist).forEach(([w,kg])=>{ usedMap[w]=(usedMap[w]||0)+(parseFloat(kg)||0); });
    } else {
      (p.wagon||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(w=>{
        // wagonDist 없으면 와건의 총량을 다 썼다고 가정
        usedMap[w] = (usedMap[w]||0) + (shWagonsMap[w]||0);
      });
    }
  });
  (L.packing_pending||[]).filter(p => {
    const d = String(p.date||'').slice(0,10);
    return d===today || d===yesterday;
  }).forEach(p => {
    if(p.wagonDist){
      Object.entries(p.wagonDist).forEach(([w,kg])=>{ usedMap[w]=(usedMap[w]||0)+(parseFloat(kg)||0); });
    } else {
      (p.wagon||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(w=>{
        usedMap[w] = (usedMap[w]||0) + (shWagonsMap[w]||0);
      });
    }
  });
  const wagonOpts = '<option value="">직접입력</option>' + shWagons.map(w=>`<option value="${w}">${w}번 와건</option>`).join('');

  const row = document.createElement('div');
  row.id = 'pkRow_'+idx;
  row.style.cssText = 'background:var(--g1);border-radius:8px;padding:12px;margin-bottom:8px;position:relative';
  row.innerHTML = `
    <button onclick="removePkRow(${idx})" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--g4);font-size:16px;cursor:pointer">✕</button>
    <div class="fg">
      <div class="fgrp cs2">
        <label class="fl">제품명 <span class="req">*</span></label>
        <select class="fc pk-row-prod" data-idx="${idx}" onchange="onPkRowProd(${idx})">${prodOpts}</select>
      </div>
      <div class="fgrp">
        <label class="fl">설비 번호</label>
        <select class="fc pk-row-mach" data-idx="${idx}">
          <option value="">선택</option><option>1호기</option><option>2호기</option><option>3호기</option><option>4호기</option>
        </select>
      </div>
      <div class="fgrp cs2">
        <label class="fl">투입 와건번호 <span style="font-size:11px;color:var(--g4)">(버튼 토글 또는 직접입력 → 카드별 kg 분배)</span></label>
        <div id="pkWagonBtns_${idx}" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
          ${shWagons.map(w=>{
            const total = shWagonsMap[w]||0;
            const used = usedMap[w]||0;
            const remain = total - used;
            const isDone = remain < 0.01;
            const style = isDone
              ? 'padding:4px 10px;border-radius:16px;border:1.5px solid var(--g3);background:#f3f4f6;color:var(--g5);cursor:not-allowed;font-size:13px;text-decoration:line-through'
              : 'padding:4px 10px;border-radius:16px;border:1.5px solid var(--g3);background:#fff;cursor:pointer;font-size:13px';
            const onclick = isDone ? `toast('${w}번 와건은 이미 포장 완료됨','d')` : `togglePkWagon(${idx},'${w}')`;
            const remText = isDone ? '(완료)' : `(${remain.toFixed(0)}kg)`;
            return `<button type="button" class="pk-wagon-btn" data-idx="${idx}" data-w="${w}" data-total="${total}" data-done="${isDone}" onclick="${onclick}" style="${style}">${w}번 <span class="pk-w-rem" style="color:${isDone?'var(--g5)':'var(--g5)'}">${remText}</span></button>`;
          }).join('')}
        </div>
        <input type="hidden" class="pk-row-wagon" data-idx="${idx}" value="">
        <!-- 와건별 kg 분배 -->
        <div style="margin-top:6px;padding:6px;background:#fff;border-radius:6px;border:1px dashed var(--g3)">
          <div style="font-size:11px;color:var(--g5);margin-bottom:4px">투입 와건별 사용 kg</div>
          <div class="pk-wagon-dist" id="pkWagonDist_${idx}" style="display:flex;flex-direction:column;gap:4px"></div>
          <div style="display:flex;gap:4px;margin-top:4px;align-items:center;justify-content:space-between;font-size:11px">
            <button onclick="pkAddWagonRow(${idx})" style="padding:3px 8px;font-size:11px;border:1px dashed #1a56db;background:#fff;color:#1a56db;border-radius:4px;cursor:pointer">+ 와건 추가</button>
            <span id="pkWagonSum_${idx}" style="color:var(--g5);font-weight:500">합계 0kg</span>
          </div>
        </div>
      </div>
      <div class="fgrp cs2">
        <label class="fl">원육 타입 <span style="font-size:11px;color:var(--g4)">(와건 선택 시 자동, 여러 종류면 자동 분리)</span></label>
        <!-- 단일 셀렉트 (호환용) -->
        <select class="fc pk-row-type" data-idx="${idx}" style="display:none">
          <option value="">자동감지</option><option>설도</option><option>홍두깨</option><option>우둔</option>
        </select>
        <!-- 단일 표시 -->
        <div class="pk-type-single" id="pkTypeSingle_${idx}" style="background:var(--g2);padding:8px 10px;border-radius:6px;font-size:13px;color:var(--g6)">와건 선택 시 자동 감지</div>
        <!-- 다중(원육별 kg) -->
        <div class="pk-type-multi" id="pkTypeMulti_${idx}" style="display:none;padding:8px;background:#f0f7ff;border:1px dashed #1a56db;border-radius:6px">
          <div style="font-size:11px;color:#1a56db;font-weight:600;margin-bottom:4px">⚠ 와건 원육 2종 이상 — 원육별 사용량</div>
          <div class="pk-type-rows" id="pkTypeRows_${idx}" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
      </div>
      <div class="fgrp">
        <label class="fl">인원</label>
        <input class="fc pk-row-workers" type="number" placeholder="0" data-idx="${idx}">
      </div>
      <div class="fgrp">
        <label class="fl">시작시간 <span class="req">*</span></label>
        <input class="fc pk-row-start" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" data-idx="${idx}">
      </div>
      <div class="fgrp" style="display:flex;align-items:flex-end">
        <button type="button" class="btn bo bsm" onclick="setPkRowNow(${idx})">🕐 지금으로</button>
      </div>
      <div class="fgrp">
        <label class="fl">소스 탱크 <span style="font-size:11px;color:var(--g4)">(여러 탱크 가능)</span></label>
        <!-- 호환용 hidden (콤마 구분 탱크번호 모음) -->
        <select class="fc pk-row-stank" data-idx="${idx}" style="display:none">
          <option value="">선택</option>
          <option>1번탱크</option><option>2번탱크</option><option>3번탱크</option><option>4번탱크</option>
          <option>5번탱크</option><option>6번탱크</option><option>7번탱크</option>
        </select>
        <div class="pk-stank-list" id="pkStank_${idx}" style="display:flex;flex-direction:column;gap:4px"></div>
        <div style="display:flex;gap:4px;margin-top:4px;align-items:center;justify-content:space-between;font-size:11px">
          <button onclick="pkAddStankRow(${idx})" style="padding:3px 8px;font-size:11px;border:1px dashed #1a56db;background:#fff;color:#1a56db;border-radius:4px;cursor:pointer">+ 소스탱크 추가</button>
          <span id="pkStankSum_${idx}" style="color:var(--g5);font-weight:500">합계 0kg</span>
        </div>
      </div>
      <div class="fgrp">
        <label class="fl">부재료명</label>
        <select class="fc pk-row-subnm" data-idx="${idx}">${subOpts}</select>
      </div>
      <div class="fgrp cs2">
        <div class="fc" id="pkRowSi_${idx}" style="background:var(--g2);color:var(--g5);font-size:13px;margin-top:4px">제품 선택 후 원료육 자동 계산</div>
      </div>
    </div>`;
  document.getElementById('pk_machRows').appendChild(row);
}

// 와건 버튼 토글 (다중 선택)
function togglePkWagon(idx, w){
  const btn = document.querySelector(`#pkRow_${idx} .pk-wagon-btn[data-w="${w}"]`);
  const hidden = document.querySelector(`#pkRow_${idx} .pk-row-wagon`);
  const distC = document.getElementById('pkWagonDist_'+idx);
  if(!btn || !hidden) return;
  const cur = (hidden.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  const i = cur.indexOf(w);
  if(i>=0){
    cur.splice(i,1);
    btn.style.background='#fff'; btn.style.color=''; btn.style.borderColor='var(--g3)';
    if(distC){
      const row = distC.querySelector(`.pk-wd-row[data-w="${w}"]`);
      if(row) row.remove();
    }
  } else {
    cur.push(w);
    btn.style.background='var(--p)'; btn.style.color='#fff'; btn.style.borderColor='var(--p)';
    if(distC && !distC.querySelector(`.pk-wd-row[data-w="${w}"]`)){
      pkAddWagonRow(idx, w);
    }
  }
  hidden.value = cur.join(',');
  pkWagonSumChange(idx);
}

function pkAddWagonRow(idx, prefilledW){
  const c = document.getElementById('pkWagonDist_'+idx);
  if(!c) return;
  const row = document.createElement('div');
  row.className = 'pk-wd-row';
  row.dataset.w = prefilledW || '';
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;align-items:center';

  // 잔여만큼 기본값 (와건 토글로 추가된 경우)
  let defaultKg = '';
  if(prefilledW){
    const total = pkGetWagonTotal(prefilledW);
    const used = pkGetWagonGlobalUsed();
    const remain = total - (used[prefilledW]||0);
    if(remain > 0.01) defaultKg = remain.toFixed(2);
  }

  row.innerHTML = `
    <input class="fc pk-wd-num" type="text" value="${prefilledW||''}" placeholder="와건번호" oninput="this.closest('.pk-wd-row').dataset.w=this.value;pkWagonSumChange(${idx})" style="padding:5px 7px;font-size:12px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:2px">
      <input class="fc pk-wd-kg" type="number" step="0.01" value="${defaultKg}" placeholder="0" oninput="pkWagonSumChange(${idx})" style="padding:5px 7px;font-size:12px;box-sizing:border-box;flex:1;text-align:right">
      <span style="font-size:11px;color:var(--g5)">kg</span>
    </div>
    <button onclick="this.closest('.pk-wd-row').remove();pkWagonSumChange(${idx})" style="width:24px;height:28px;border:1px solid var(--g3);border-radius:4px;background:#fff;color:var(--d);font-size:13px;cursor:pointer;padding:0">−</button>`;
  c.appendChild(row);
  pkWagonSumChange(idx);
}

function pkWagonSumChange(idx){
  const c = document.getElementById('pkWagonDist_'+idx);
  if(!c) return;
  let sum = 0;
  // 와건별 kg + 와건의 원육 추적 → 원육별 합산
  const typeKg = {}; // {원육: kg}
  c.querySelectorAll('.pk-wd-row').forEach(r => {
    const wn = (r.querySelector('.pk-wd-num')||{}).value || '';
    const kg = parseFloat((r.querySelector('.pk-wd-kg')||{}).value) || 0;
    sum += kg;
    if(wn && kg){
      const t = pkResolveTypeFromWagon(String(wn).trim());
      if(t){
        typeKg[t] = (typeKg[t]||0) + kg;
      }
    }
  });
  const sumEl = document.getElementById('pkWagonSum_'+idx);
  if(sumEl) sumEl.textContent = `합계 ${sum.toFixed(2)}kg`;

  // 원육 타입 표시 갱신
  refreshPkTypeUI(idx, typeKg);

  // 전역 잔여 갱신 (모든 설비 카드 + pending 합산)
  pkRefreshWagonRemain();
}

// 와건번호 → 원육 타입 (cooking/preprocess 추적)
function pkResolveTypeFromWagon(wNum){
  // shredding.wagonOut에서 wagonIn 찾기 → cooking.wagonOut에서 매칭 → cooking.type
  const sh = (L.shredding||[]).find(r => (r.wagonOut||'').split(',').map(x=>x.trim()).includes(wNum));
  if(!sh) return '';
  const wIns = (sh.wagonIn||'').split(',').map(x=>x.trim()).filter(Boolean);
  for(const wIn of wIns){
    const ck = (L.cooking||[]).find(r => (r.wagonOut||'').split(',').map(x=>x.trim()).includes(wIn));
    if(ck && ck.type) return ck.type.split(',')[0].trim();
  }
  return '';
}

// 원육 단일/다중 자동 전환 + 사용자 수정 보존
function refreshPkTypeUI(idx, typeKg){
  const single = document.getElementById('pkTypeSingle_'+idx);
  const multi  = document.getElementById('pkTypeMulti_'+idx);
  const rows   = document.getElementById('pkTypeRows_'+idx);
  const hidden = document.querySelector(`#pkRow_${idx} .pk-row-type`);
  if(!single || !multi || !rows) return;

  const types = Object.keys(typeKg);

  // 0종 → 단일 안내
  if(types.length === 0){
    single.style.display = 'block';
    single.style.background = 'var(--g2)';
    single.style.color = 'var(--g6)';
    single.textContent = '와건 선택 시 자동 감지';
    multi.style.display = 'none';
    if(hidden) hidden.value = '';
    return;
  }

  // 1종 → 단일 표시
  if(types.length === 1){
    single.style.display = 'block';
    single.style.background = '#e6f4ea';
    single.style.color = '#1e7e34';
    single.textContent = `${types[0]} (자동 감지)`;
    multi.style.display = 'none';
    if(hidden) hidden.value = types[0];
    return;
  }

  // 2종 이상 → 다중 표시
  single.style.display = 'none';
  multi.style.display = 'block';
  if(hidden) hidden.value = '혼합';

  // 기존 입력값 보존
  const prev = {};
  rows.querySelectorAll('.pk-type-inp').forEach(i => prev[i.dataset.type] = i.value);

  rows.innerHTML = types.map(t => {
    const auto = typeKg[t];
    const v = prev[t] !== undefined ? prev[t] : auto.toFixed(2);
    return `
      <div style="display:grid;grid-template-columns:90px 1fr 30px;gap:4px;align-items:center">
        <span style="font-size:12px;color:var(--g6);font-weight:500">${t}</span>
        <input class="fc pk-type-inp" type="number" step="0.01" data-type="${t}" data-auto="${auto}" value="${v}" style="padding:4px 6px;font-size:12px;text-align:right">
        <span style="font-size:11px;color:var(--g5)">kg</span>
      </div>`;
  }).join('');
}

// 저장 시 원육별 사용량 (다중일 때만)
function getPkTypeKgs(idx){
  const rows = document.getElementById('pkTypeRows_'+idx);
  if(!rows) return null;
  const inps = rows.querySelectorAll('.pk-type-inp');
  if(inps.length < 2) return null;
  const m = {};
  inps.forEach(i => {
    const v = parseFloat(i.value) || 0;
    if(v) m[i.dataset.type] = v;
  });
  return Object.keys(m).length ? m : null;
}

function getPkWagonDist(idx){
  const c = document.getElementById('pkWagonDist_'+idx);
  if(!c) return null;
  const dist = {};
  c.querySelectorAll('.pk-wd-row').forEach(r => {
    const wn = (r.querySelector('.pk-wd-num')||{}).value || '';
    const kg = parseFloat((r.querySelector('.pk-wd-kg')||{}).value) || 0;
    if(wn && kg) dist[String(wn).trim()] = (dist[String(wn).trim()]||0) + kg;
  });
  return Object.keys(dist).length ? dist : null;
}

// ===== 와건 전역 사용량/잔여 추적 =====
// 모든 설비 카드 + pending에서 와건별 사용 kg 합산
function pkGetWagonGlobalUsed(){
  const used = {};
  const today = tod();
  const yesterday = (typeof getYesterday_==='function') ? getYesterday_() : '';
  // 1) 현재 입력 중인 카드들 (모든 설비 카드)
  document.querySelectorAll('.pk-wd-row').forEach(r => {
    const wn = (r.querySelector('.pk-wd-num')||{}).value || '';
    const kg = parseFloat((r.querySelector('.pk-wd-kg')||{}).value) || 0;
    if(wn && kg) used[String(wn).trim()] = (used[String(wn).trim()]||0) + kg;
  });
  // 2) pending (이미 시작된 다른 설비) - today+yesterday
  (L.packing_pending||[]).filter(r => {
    const d = String(r.date||'').slice(0,10);
    return d===today || d===yesterday;
  }).forEach(p => {
    if(p.wagonDist){
      Object.entries(p.wagonDist).forEach(([w,kg])=>{
        used[w] = (used[w]||0) + (parseFloat(kg)||0);
      });
    }
  });
  // 3) 완료된 packing - today+yesterday
  (L.packing||[]).filter(r => {
    const d = String(r.date||'').slice(0,10);
    return d===today || d===yesterday;
  }).forEach(p => {
    if(p.wagonDist){
      Object.entries(p.wagonDist).forEach(([w,kg])=>{
        used[w] = (used[w]||0) + (parseFloat(kg)||0);
      });
    } else if(p.wagon){
      // wagonDist 없으면 와건 전체 사용으로 간주
      (p.wagon||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(w=>{
        const total = pkGetWagonTotal(w);
        if(total > 0) used[w] = (used[w]||0) + total;
      });
    }
  });
  return used;
}

// 와건의 총량 (shredding 기준)
function pkGetWagonTotal(wNum){
  // 화면에 그려진 버튼의 data-total 우선
  const btn = document.querySelector(`.pk-wagon-btn[data-w="${wNum}"]`);
  if(btn && btn.dataset.total) return parseFloat(btn.dataset.total) || 0;
  // 없으면 직접 계산
  let total = 0;
  (L.shredding||[]).forEach(sh => {
    if(sh.wagonOutDist && sh.wagonOutDist[wNum]) total += parseFloat(sh.wagonOutDist[wNum])||0;
    else if((sh.wagonOut||'').split(',').map(x=>x.trim()).includes(wNum)){
      const ws = (sh.wagonOut||'').split(',').map(x=>x.trim()).filter(Boolean);
      total += (parseFloat(sh.kg)||0)/ws.length;
    }
  });
  return total;
}

// 모든 와건 버튼 라벨 갱신 (잔여 표시) + 매트릭스 색상
function pkRefreshWagonRemain(){
  const used = pkGetWagonGlobalUsed();
  document.querySelectorAll('.pk-wagon-btn').forEach(btn => {
    const w = btn.dataset.w;
    const total = parseFloat(btn.dataset.total) || 0;
    const u = used[w] || 0;
    const remain = total - u;
    const remEl = btn.querySelector('.pk-w-rem');
    const isDone = remain < 0.01 && total > 0;
    // 완료 상태 동적 갱신 (완전 소진되면 즉시 차단)
    if(isDone && btn.dataset.done !== 'true'){
      btn.dataset.done = 'true';
      btn.style.background = '#f3f4f6';
      btn.style.color = 'var(--g5)';
      btn.style.cursor = 'not-allowed';
      btn.style.textDecoration = 'line-through';
      btn.onclick = () => toast(w+'번 와건은 이미 포장 완료됨','d');
    }
    if(remEl){
      if(isDone) remEl.textContent = '(완료)';
      else if(u > 0) remEl.textContent = `(잔여 ${remain.toFixed(0)}kg)`;
      else remEl.textContent = `(${total.toFixed(0)}kg)`;
      remEl.style.color = remain < -0.01 ? 'var(--d)' : 'var(--g5)';
    }
  });
  // 매트릭스 행 색상 갱신
  document.querySelectorAll('.pk-wd-row').forEach(r => {
    const wn = (r.querySelector('.pk-wd-num')||{}).value || '';
    const kgInp = r.querySelector('.pk-wd-kg');
    if(!kgInp || !wn) return;
    const total = pkGetWagonTotal(wn);
    const totalUsed = used[wn] || 0;
    if(total > 0 && totalUsed > total + 0.01){
      kgInp.style.background = '#FBEAF0';
      kgInp.style.color = 'var(--d)';
      kgInp.title = `초과! 총 ${total}kg, 사용 ${totalUsed.toFixed(2)}kg`;
    } else {
      kgInp.style.background = '';
      kgInp.style.color = '';
      kgInp.title = '';
    }
  });
}
function pkAddStankRow(idx){
  const c = document.getElementById('pkStank_'+idx);
  if(!c) return;
  const row = document.createElement('div');
  row.className = 'pk-stank-row';
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;align-items:center';
  row.innerHTML = `
    <select class="fc pk-stank-sel" onchange="pkStankSumChange(${idx})" style="padding:5px 7px;font-size:12px">
      <option value="">탱크</option>
      <option value="1번탱크">1번</option>
      <option value="2번탱크">2번</option>
      <option value="3번탱크">3번</option>
      <option value="4번탱크">4번</option>
      <option value="5번탱크">5번</option>
      <option value="6번탱크">6번</option>
      <option value="7번탱크">7번</option>
    </select>
    <div style="display:flex;align-items:center;gap:2px">
      <input class="fc pk-stank-kg" type="number" step="0.01" placeholder="0" oninput="pkStankSumChange(${idx})" style="padding:5px 7px;font-size:12px;flex:1;text-align:right">
      <span style="font-size:11px;color:var(--g5)">kg</span>
    </div>
    <button onclick="this.closest('.pk-stank-row').remove();pkStankSumChange(${idx})" style="width:24px;height:28px;border:1px solid var(--g3);border-radius:4px;background:#fff;color:var(--d);font-size:13px;cursor:pointer;padding:0">−</button>`;
  c.appendChild(row);
  pkStankSumChange(idx);
}

function pkStankSumChange(idx){
  const c = document.getElementById('pkStank_'+idx);
  if(!c) return;
  let sum = 0;
  const tanks = [];
  c.querySelectorAll('.pk-stank-row').forEach(r => {
    const t = (r.querySelector('.pk-stank-sel')||{}).value || '';
    const kg = parseFloat((r.querySelector('.pk-stank-kg')||{}).value) || 0;
    if(t) tanks.push(t);
    sum += kg;
  });
  const sumEl = document.getElementById('pkStankSum_'+idx);
  if(sumEl) sumEl.textContent = `합계 ${sum.toFixed(2)}kg`;
  // 호환용 hidden select에 첫 탱크 또는 콤마 (string)
  const stkSel = document.querySelector(`#pkRow_${idx} .pk-row-stank`);
  if(stkSel){
    const joined = tanks.join(',');
    // select 옵션에 임시 추가
    if(joined && !stkSel.querySelector(`option[value="${joined}"]`)){
      const opt = document.createElement('option');
      opt.value = joined; opt.textContent = joined;
      stkSel.appendChild(opt);
    }
    stkSel.value = joined;
  }
}

function getPkSauceTanks(idx){
  const c = document.getElementById('pkStank_'+idx);
  if(!c) return null;
  const tanks = [];
  c.querySelectorAll('.pk-stank-row').forEach(r => {
    const t = (r.querySelector('.pk-stank-sel')||{}).value || '';
    const kg = parseFloat((r.querySelector('.pk-stank-kg')||{}).value) || 0;
    if(t) tanks.push({tank: t, kg: kg});
  });
  return tanks.length ? tanks : null;
}

function removePkRow(idx){
  const el = document.getElementById('pkRow_'+idx);
  if(el) el.remove();
}

function onPkRowProd(idx){
  const row = document.getElementById('pkRow_'+idx);
  if(!row) return;
  const p = L.products.find(x=>x.name===row.querySelector('.pk-row-prod').value);
  const si = document.getElementById('pkRowSi_'+idx);
  if(!si) return;
  if(p){ si.textContent=`원료육 ${p.kgea}kg/EA · Capa ${p.capa}EA · 소스 ${p.sauce||'-'}`; si.style.color='var(--p)'; }
  else { si.textContent='제품 선택 후 원료육 자동 계산'; si.style.color='var(--g5)'; }
}

// 지금 시간으로 자동 입력
function setPkNow(){
  document.getElementById('pk_startTime').value = nowHM();
}

function setPkRowNow(idx){
  const row = document.getElementById('pkRow_'+idx);
  if(row){ const inp = row.querySelector('.pk-row-start'); if(inp) inp.value = nowHM(); }
}

// 시작 → pending 레코드 생성
async function onPkStartBtn(){
  const rows = document.querySelectorAll('#pk_machRows > div');
  if(!rows.length){ toast('설비를 먼저 추가하세요','d'); return; }

  // 각 행별 시작시간은 행 내부에서 읽음
  if(!L.packing_pending) L.packing_pending = [];

  let added = 0;
  rows.forEach(row => {
    const product = row.querySelector('.pk-row-prod').value;
    const startTime = row.querySelector('.pk-row-start')?.value || '';
    if(!startTime){ toast('시작시간을 입력하세요','d'); return; }
    if(!product){ toast('제품명을 선택하세요','d'); return; }
    const machine = row.querySelector('.pk-row-mach').value;
    const wagonHidden = row.querySelector('.pk-row-wagon');
    const wagonDirect = row.querySelector('.pk-row-wagon-input');
    const wagon = (wagonHidden ? wagonHidden.value : (wagonDirect ? wagonDirect.value : '')).trim();
    const workers = parseFloat(row.querySelector('.pk-row-workers').value)||0;
    const type = row.querySelector('.pk-row-type')?.value||'';
    const sauceTank = row.querySelector('.pk-row-stank').value;
    const subName = row.querySelector('.pk-row-subnm').value;
    // 와건별 kg 분배
    const idxAttr = parseInt(row.id.replace('pkRow_',''));
    const wagonDist = (typeof getPkWagonDist==='function') ? getPkWagonDist(idxAttr) : null;
    const sauceTanks = (typeof getPkSauceTanks==='function') ? getPkSauceTanks(idxAttr) : null;
    const typeKgs = (typeof getPkTypeKgs==='function') ? getPkTypeKgs(idxAttr) : null;

    const rec = {
      id: gid(), date: DDATE||tod(),
      product, machine, wagon, workers, type,
      start: startTime,
      sauceTank, subName,
      end:'', ea:0, pouch:0, defect:0, sauceKg:0, subKg:0
    };
    if(wagonDist) rec.wagonDist = wagonDist;
    if(sauceTanks) rec.sauceTanks = sauceTanks;
    if(typeKgs) rec.typeKgs = typeKgs;
    L.packing_pending.push(rec);
    added++;
  });

  if(!added) return;
  saveL();

  // Firebase에 pending 저장 (다른 기기에서도 보이게)
  const pendingToSave = L.packing_pending.filter(r => !r.fbId && String(r.date||'').slice(0,10) === tod());
  for(const rec of pendingToSave) {
    const fbId = await fbSave('packing_pending', rec);
    if(fbId) { rec.fbId = fbId; }
  }
  saveL();

  document.getElementById('pk_machRows').innerHTML='';
  _pkRowIdx = 0;
  document.querySelectorAll('.pk-wagon-cb').forEach(c=>c.checked=false);

  document.getElementById('pk_startCard').style.display='none';
  document.getElementById('pk_pendingCard').style.display='';

  renderPkPending();
  toast(`포장 시작 — ${added}개 설비 진행중 ✓`,'i');
}

// + 추가 설비 시작 버튼
function showPkStartCard(){
  document.getElementById('pk_startCard').style.display='';
  document.getElementById('pk_startCard').scrollIntoView({behavior:'smooth', block:'start'});
}

// 진행중 설비 렌더링
function renderPkPending(){
  if(!L.packing_pending) L.packing_pending = [];
  const pending = L.packing_pending.filter(r => String(r.date||'').slice(0,10) === tod());
  const el = document.getElementById('pk_pendingList');
  const cntEl = document.getElementById('pk_pendingCnt');
  const card = document.getElementById('pk_pendingCard');
  if(!el) return;

  if(cntEl) cntEl.textContent = pending.length + '개';

  if(!pending.length){
    card.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  card.style.display = '';

  el.innerHTML = pending.map(r => `
    <div id="pkPend_${r.id}" style="border:1px solid var(--g2);border-radius:8px;margin-bottom:10px;overflow:hidden">
      <!-- 헤더 -->
      <div style="background:var(--pl);padding:12px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--g8)">${r.machine||'설비미정'} · ${r.product}</div>
          <div style="font-size:12px;color:var(--g5);margin-top:3px">
            와건 ${r.wagon||'-'} · 시작 ${r.start} · ${r.workers}명
            ${r.sauceTank ? ' · 소스 '+r.sauceTank : ''}
          </div>
        </div>
        <button class="btn bs bsm" onclick="togglePkEndForm('${r.id}')">종료 입력</button>
      </div>
      <!-- 종료 입력 폼 (숨김) -->
      <div id="pkEndForm_${r.id}" style="display:none;padding:12px;background:#fff">
        <div class="fg">
          <div class="fgrp">
            <label class="fl">종료시간 <span class="req">*</span></label>
            <input class="fc" type="text" inputmode="decimal" maxlength="5" placeholder="HH:MM" id="pkEnd_t_${r.id}">
          </div>
          <div class="fgrp">
            <label class="fl">생산 EA <span class="req">*</span></label>
            <input class="fc" type="number" id="pkEnd_ea_${r.id}" placeholder="0">
          </div>
          <div class="fgrp">
            <label class="fl">파우치 사용량</label>
            <input class="fc" type="number" id="pkEnd_pouch_${r.id}" placeholder="0">
          </div>
          <div class="fgrp">
            <label class="fl">불량 수량(EA)</label>
            <input class="fc" type="number" id="pkEnd_defect_${r.id}" placeholder="0">
          </div>
          <div class="fgrp">
            <label class="fl">소스 사용량(KG)</label>
            <input class="fc" type="number" step="0.01" id="pkEnd_skg_${r.id}" placeholder="0.00">
          </div>
          <div class="fgrp">
            <label class="fl">부재료량</label>
            <input class="fc" type="number" step="0.01" id="pkEnd_subkg_${r.id}" placeholder="0.00">
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn bs bblk" style="flex:1" onclick="savePkEnd('${r.id}')">종료 저장</button>
          <button class="btn bo bsm" onclick="togglePkEndForm('${r.id}')">취소</button>
        </div>
      </div>
    </div>`).join('');
}

function togglePkEndForm(id){
  const form = document.getElementById('pkEndForm_'+id);
  if(!form) return;
  const isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : '';
}

async function savePkEnd(id){
  if(!L.packing_pending) L.packing_pending = [];
  const rec = L.packing_pending.find(r=>r.id===id);
  if(!rec){ toast('데이터 없음','d'); return; }

  const end = document.getElementById('pkEnd_t_'+id).value;
  const ea = parseFloat(document.getElementById('pkEnd_ea_'+id).value)||0;
  const pouch = parseFloat(document.getElementById('pkEnd_pouch_'+id).value)||0;
  const defect = parseFloat(document.getElementById('pkEnd_defect_'+id).value)||0;
  const sauceKg = parseFloat(document.getElementById('pkEnd_skg_'+id).value)||0;
  const subKg = parseFloat(document.getElementById('pkEnd_subkg_'+id).value)||0;

  if(!end){ toast('종료시간을 입력하세요','d'); return; }
  if(!ea){ toast('생산 EA를 입력하세요','d'); return; }

  // 완성된 레코드
  const completed = {...rec, end, ea, pouch, defect, sauceKg, subKg};

  // pending에서 제거 → packing에 추가
  L.packing_pending = L.packing_pending.filter(r=>r.id!==id);
  L.packing.push(completed);
  saveL();

  // Firebase packing_pending 삭제
  if(rec.fbId) fbDelete('packing_pending', rec.fbId);

  // Firebase packing 저장
  const fbId = await fbSave('packing', completed);
  if(fbId){
    completed.fbId = fbId;
    saveL();
    gasRecord('savePacking', completed);
    toast(`${completed.machine||'설비'} 종료 저장됨 ✓`);
  } else {
    toast('저장 실패 - 로컬에만 저장됨','d');
  }

  renderPkPending();
  renderPL('packing');
}

// onPkWagonChange - 마지막 설비 행 와건에 자동 입력
function onPkWagonChange(){
  const checked = [...document.querySelectorAll('.pk-wagon-cb:checked')];
  if(!checked.length) return;
  const rows = document.querySelectorAll('#pk_machRows > div');
  if(rows.length){
    const lastRow = rows[rows.length-1];
    const wInput = lastRow.querySelector('.pk-row-wagon');
    if(wInput) wInput.value = checked.map(w=>w.dataset.wagon).join(',');
  }
}

// onProd - 레거시 호환 (pk_prod 없어도 에러 안 나게)
function onProd(){
  const el = document.getElementById('pk_prod');
  if(!el) return;
  const nm = el.value;
  const p = L.products.find(x=>x.name===nm);
  const siEl = document.getElementById('pkSi');
  if(!p||!siEl){ if(siEl) siEl.classList.add('hid'); return; }
  siEl.innerHTML=`<div class="al al-i">원료육 ${p.kgea}kg/EA · FullCapa ${p.capa}EA · 소스 ${p.sauce||'-'}</div>`;
  siEl.classList.remove('hid');
}