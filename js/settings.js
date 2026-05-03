// ============================================================
// 설정 Firebase 동기화
// ============================================================

// Firebase에 설정 저장
async function saveSettings() {
  try {
    const cfg = {
      products: L.products || [],
      sauces: L.sauces || [],
      submats: L.submats || [],
      gtinMap: L.gtinMap || {},
      recipes: L.recipes || [],
      _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('settings').doc('config').set(cfg);
  } catch(e) {
    console.error('설정 Firebase 저장 오류:', e);
  }
}

// Firebase에서 설정 로드 (앱 시작 시 + 설정탭 진입 시)
async function loadSettings_(){
  try {
    const doc = await db.collection('settings').doc('config').get();
    if(doc.exists){
      const data = doc.data();
      if(data.products && data.products.length) L.products = data.products;
      if(data.sauces && data.sauces.length) L.sauces = data.sauces;
      if(data.submats && data.submats.length) L.submats = data.submats;
      if(data.gtinMap && Object.keys(data.gtinMap).length) L.gtinMap = data.gtinMap;
      if(data.recipes) L.recipes = data.recipes;
      saveL();
      updDD();
      renderSettings();
      toast('설정 로드됨 ✓', 'i');
    }
  } catch(e) {
    console.error('설정 로드 오류:', e);
  }
}

// ============================================================
// 설정 탭 - 제품/소스/부재료/GTIN 관리
// ============================================================

// 레시피 행 추가 (제품 관리 폼용)
function addProdRecipeRow(type, item='', qty='', unit='개'){
  const container = document.getElementById('np_recipe_'+type);
  if(!container) return;
  const row = document.createElement('div');
  row.style.cssText='display:flex;gap:4px;align-items:center';
  row.innerHTML=`
    <input class="fc rcp-item" style="flex:2;font-size:12px" placeholder="항목명 (예: 코스트코 170g 파우치)" value="${item}">
    <input class="fc rcp-qty" type="number" step="0.001" style="flex:1;font-size:12px" placeholder="수량" value="${qty}">
    <select class="fc rcp-unit" style="flex:1;font-size:12px">
      <option value="개" ${unit==='개'?'selected':''}>개</option>
      <option value="kg" ${unit==='kg'?'selected':''}>kg</option>
      <option value="g" ${unit==='g'?'selected':''}>g</option>
    </select>
    <button class="btn bd bsm" style="flex-shrink:0;font-size:11px" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(row);
}

// 레시피 폼 읽기
function getRecipeFromForm(){
  const readRows = id => [...document.querySelectorAll(`#${id} .rcp-item`)].map((el,i)=>{
    const row=el.parentElement;
    return {
      item: el.value.trim(),
      qty: parseFloat(row.querySelector('.rcp-qty').value)||0,
      unit: row.querySelector('.rcp-unit').value
    };
  }).filter(r=>r.item);
  return {
    inner: readRows('np_recipe_inner'),
    outer: readRows('np_recipe_outer'),
  };
}

// 레시피 폼 초기화
function clearRecipeForm(){
  const ci=document.getElementById('np_recipe_inner');
  const co=document.getElementById('np_recipe_outer');
  if(ci) ci.innerHTML='';
  if(co) co.innerHTML='';
}

// 레시피 폼 채우기
function fillRecipeForm(recipe){
  clearRecipeForm();
  if(!recipe) return;
  (recipe.inner||[]).forEach(r=>addProdRecipeRow('inner',r.item,r.qty,r.unit));
  (recipe.outer||[]).forEach(r=>addProdRecipeRow('outer',r.item,r.qty,r.unit));
}

function onNpNoMeatToggle(){
  const cb = document.getElementById('np_nomeat');
  const ke = document.getElementById('np_ke');
  if(!cb || !ke) return;
  if(cb.checked){
    ke.value = '0';
    ke.disabled = true;
    ke.style.background = '#f0f0f0';
  } else {
    ke.disabled = false;
    ke.style.background = '';
  }
}

function addProd(){
  try {
  const n=document.getElementById('np_nm').value.trim();
  const noMeat = !!document.getElementById('np_nomeat')?.checked;
  const k = noMeat ? 0 : (parseFloat(document.getElementById('np_ke').value)||0);
  const c=parseInt(document.getElementById('np_cp').value)||0;
  const s=document.getElementById('np_sc').value;
  const sub=document.getElementById('np_sub')?.value||'';
  const subKe=parseFloat(document.getElementById('np_subke')?.value)||0;
  if(!n){toast('제품명 입력','d');return;}
  const recipe={inner:[],outer:[]};
  const prodObj = {name:n, kgea:k, capa:c, sauce:s, recipe};
  if(noMeat) prodObj.noMeat = true;
  if(sub) prodObj.subName = sub;
  if(subKe>0) prodObj.subKgea = subKe;

  if(_editProdIdx >= 0){
    L.products[_editProdIdx] = prodObj;
    toast('제품 수정됨 ✓');
    cancelEditProd();
  } else {
    L.products.push(prodObj);
    toast('제품 추가됨 ✓');
    document.getElementById('np_nm').value='';
    document.getElementById('np_ke').value='';
    document.getElementById('np_cp').value='';
    const npSc=document.getElementById('np_sc'); if(npSc) npSc.value='';
    const npSub=document.getElementById('np_sub'); if(npSub) npSub.value='';
    const npSubKe=document.getElementById('np_subke'); if(npSubKe) npSubKe.value='';
    const npNm=document.getElementById('np_nomeat'); if(npNm){ npNm.checked=false; onNpNoMeatToggle(); }
    clearRecipeForm();
  }
  saveL(); updDD(); renderSettings(); saveSettings();
  } catch(e){ toast('오류: '+e.message,'d'); console.error(e); }
}

function cancelEditProd(){
  _editProdIdx = -1;
  document.getElementById('np_nm').value='';
  document.getElementById('np_ke').value='';
  document.getElementById('np_cp').value='';
  const npSc=document.getElementById('np_sc'); if(npSc) npSc.value='';
  const npSub=document.getElementById('np_sub'); if(npSub) npSub.value='';
  const npSubKe=document.getElementById('np_subke'); if(npSubKe) npSubKe.value='';
  const npNm=document.getElementById('np_nomeat'); if(npNm){ npNm.checked=false; onNpNoMeatToggle(); }
  clearRecipeForm();
  const addBtn = document.querySelector('#p-settings .btn.bs[onclick="addProd()"]');
  if(addBtn){ addBtn.textContent='+ 제품 추가'; addBtn.style.background=''; }
  const cancelBtn = document.getElementById('prodEditCancel');
  if(cancelBtn) cancelBtn.style.display='none';
  document.querySelectorAll('[id^="pdItem_"]').forEach(el=>el.style.background='');
}

function delProd(i){ if(!confirm('삭제?'))return; L.products.splice(i,1); saveL(); updDD(); renderSettings(); saveSettings(); }

function addSc(){
  const n=document.getElementById('ns_nm').value.trim();
  const m=document.getElementById('ns_mo').value.trim();
  if(!n){toast('소스명 입력','d');return;}
  L.sauces.push({name:n,memo:m}); saveL(); renderSettings(); saveSettings(); toast('소스 추가됨');
  document.getElementById('ns_nm').value=''; document.getElementById('ns_mo').value='';
}
function delSc(i){ if(!confirm('삭제?'))return; L.sauces.splice(i,1); saveL(); renderSettings(); saveSettings(); }

function addSub(){
  const n=document.getElementById('nsub_nm').value.trim();
  if(!n){toast('부재료명 입력','d');return;}
  if(!L.submats) L.submats=[];
  L.submats.push(n); saveL(); renderSettings(); saveSettings(); toast('부재료 추가됨');
  document.getElementById('nsub_nm').value='';
}
function delSub(i){ L.submats.splice(i,1); saveL(); renderSettings(); saveSettings(); }

function addGt(){
  const g=document.getElementById('ng_gt').value.trim();
  const p=document.getElementById('ng_pt').value;
  if(!g){toast('GTIN 입력','d');return;}
  L.gtinMap[g]=p; saveL(); renderSettings(); saveSettings(); toast('GTIN 추가됨');
  document.getElementById('ng_gt').value='';
}
function delGt(g){ delete L.gtinMap[g]; saveL(); renderSettings(); saveSettings(); }

// ============================================================
// 레시피 관리
// ============================================================
var _rcType = 'inner'; // 현재 편집 섹션

function renderRecipeSelect() {
  const sel = document.getElementById('rc_prod');
  if(!sel) return;
  sel.innerHTML = '<option value="">제품을 선택하세요</option>' +
    L.products.map(p=>`<option>${p.name}</option>`).join('');
}

function loadRecipe() {
  const sel = document.getElementById('rc_prod');
  const prod = sel ? sel.value : '';
  const rc = (L.recipes||{})[prod] || {inner:[], outer:[]};
  _rcData = {inner:[...(rc.inner||[])], outer:[...(rc.outer||[])]};
  renderRecipeRows('inner', _rcData.inner);
  renderRecipeRows('outer', _rcData.outer);
  // 소스 선택 시 외포장 섹션 숨기기
  const isSauce = L.sauces.some(s=>s.name===prod);
  const outerSec = document.getElementById('rc_outer_section');
  if(outerSec) outerSec.style.display = isSauce ? 'none' : '';
  renderRcList();
}

const PKG_TYPES = ['외박스','RRP','트레이','기타'];
function renderRecipeRows(type, rows) {
  const tbody = document.getElementById('rc_'+type+'_rows');
  if(!tbody) return;
  const isOuter = type === 'outer';
  tbody.innerHTML = rows.map((r,i)=>`
    <tr>
      <td style="padding:4px"><input class="fc" style="padding:4px 6px" value="${r.name||''}" oninput="rcRowChange('${type}',${i},'name',this.value)" placeholder="품목명"></td>
      <td style="padding:4px"><input class="fc" style="padding:4px 6px;text-align:right" type="number" step="0.001" value="${r.qty||''}" oninput="rcRowChange('${type}',${i},'qty',this.value)" placeholder="0"></td>
      <td style="padding:4px"><select class="fc" style="padding:4px 6px" onchange="rcRowChange('${type}',${i},'unit',this.value)">${['kg','g','개','EA','장','Box'].map(u=>`<option${r.unit===u?' selected':''}>${u}</option>`).join('')}</select></td>
      ${isOuter ? `<td style="padding:4px"><select class="fc" style="padding:3px 5px;font-size:11px" onchange="rcRowChange('outer',${i},'pkgType',this.value)">${PKG_TYPES.map(t=>`<option${(r.pkgType||'외박스')===t?' selected':''}>${t}</option>`).join('')}</select></td>` : ''}
      <td style="padding:4px;text-align:center"><button class="btn bd bsm" onclick="delRecipeRow('${type}',${i})" style="padding:2px 8px">✕</button></td>
    </tr>`).join('') || `<tr><td colspan="${isOuter?5:4}" style="text-align:center;padding:8px;color:var(--g4);font-size:12px">재료 없음</td></tr>`;
}

// 임시 편집 상태
var _rcData = {inner:[], outer:[]};

function addRecipeRow(type) {
  const prod = document.getElementById('rc_prod').value;
  if(!prod){ toast('제품을 먼저 선택하세요','d'); return; }
  if(!_rcData[type]) _rcData[type] = [];
  _rcData[type].push({name:'', qty:'', unit:'개'});
  renderRecipeRows(type, _rcData[type]);
}

function delRecipeRow(type, i) {
  _rcData[type].splice(i,1);
  renderRecipeRows(type, _rcData[type]);
}

function rcRowChange(type, i, field, val) {
  if(!_rcData[type]) _rcData[type] = [];
  if(!_rcData[type][i]) _rcData[type][i] = {};
  _rcData[type][i][field] = field==='qty' ? parseFloat(val)||0 : val;
}

function saveRecipe() {
  const prod = document.getElementById('rc_prod').value;
  if(!prod){ toast('제품을 선택하세요','d'); return; }
  // 현재 입력값 수집
  const collectRows = (type) => {
    const rows = [];
    const tbody = document.getElementById('rc_'+type+'_rows');
    if(!tbody) return rows;
    tbody.querySelectorAll('tr').forEach(tr=>{
      const inputs = tr.querySelectorAll('input,select');
      if(inputs.length >= 3) {
        const name = inputs[0].value.trim();
        const qty = parseFloat(inputs[1].value)||0;
        const unit = inputs[2].value;
        const pkgType = (type==='outer' && inputs[3]) ? inputs[3].value : undefined;
        if(name) rows.push({name, qty, unit, ...(pkgType?{pkgType}:{})});
      }
    });
    return rows;
  };
  if(!L.recipes) L.recipes = {};
  L.recipes[prod] = {
    inner: collectRows('inner'),
    outer: collectRows('outer'),
    updatedAt: new Date().toISOString().slice(0,10)
  };
  _rcData = {inner:[...L.recipes[prod].inner], outer:[...L.recipes[prod].outer]};
  saveL(); saveSettings();
  renderRcList();
  toast(prod+' 레시피 저장됨','s');
}

function delRecipe() {
  const prod = document.getElementById('rc_prod').value;
  if(!prod || !confirm(prod+' 레시피를 삭제하시겠습니까?')) return;
  if(L.recipes) delete L.recipes[prod];
  _rcData = {inner:[], outer:[]};
  renderRecipeRows('inner',[]);
  renderRecipeRows('outer',[]);
  saveL(); saveSettings();
  renderRcList();
  toast('레시피 삭제됨');
}

function renderRcList() {
  const el = document.getElementById('rcList');
  if(!el) return;
  const entries = Object.entries(L.recipes||{});
  if(!entries.length){ el.innerHTML=''; return; }
  el.innerHTML = '<div class="dvd" style="margin-bottom:10px"></div>'+
    '<div style="font-size:12px;color:var(--g5);margin-bottom:6px">등록된 레시피 ('+entries.length+'개)</div>'+
    entries.map(([prod,rc])=>`
      <div class="si" style="cursor:pointer" onclick="selectRecipe('${prod.replace(/'/g,"\\'")}')">
        <div style="flex:1;min-width:0">
          <div class="sn">${prod}</div>
          <div class="ss">내포장 ${(rc.inner||[]).length}종 · 외포장 ${(rc.outer||[]).length}종${rc.updatedAt?' · '+rc.updatedAt:''}</div>
        </div>
        <span style="font-size:11px;color:var(--p)">선택</span>
      </div>`).join('');
}

function selectRecipe(prod) {
  const sel = document.getElementById('rc_prod');
  if(sel) sel.value = prod;
  const rc = (L.recipes||{})[prod] || {inner:[], outer:[]};
  _rcData = {inner:[...(rc.inner||[])], outer:[...(rc.outer||[])]};
  renderRecipeRows('inner', _rcData.inner);
  renderRecipeRows('outer', _rcData.outer);
}

function expAll(){
  const all=[];
  ['barcodes','thawing','preprocess','cooking','shredding','packing','sauce'].forEach(t=>
    L[t].forEach(r=>all.push({공정:t,...r})));
  if(!all.length){toast('데이터 없음','d');return;}
  const ks=[...new Set(all.flatMap(r=>Object.keys(r)))];
  dlCSV('생산데이터_전체.csv',[ks,...all.map(r=>ks.map(k=>r[k]??''))]);
}
function startEditProd(i){
  _editProdIdx = i;
  const p = L.products[i];
  if(!p) return;
  document.getElementById('np_nm').value = p.name;
  document.getElementById('np_ke').value = p.kgea||'';
  document.getElementById('np_cp').value = p.capa||'';
  const npSc = document.getElementById('np_sc');
  if(npSc) npSc.value = p.sauce||'';
  fillRecipeForm(p.recipe||null);
  const addBtn = document.querySelector('#p-settings .btn.bs[onclick="addProd()"]');
  if(addBtn){ addBtn.textContent='✔ 수정 저장'; addBtn.style.background='var(--w)'; }
  const cancelBtn = document.getElementById('prodEditCancel');
  if(cancelBtn) cancelBtn.style.display='';
  document.querySelectorAll('[id^="pdItem_"]').forEach(el=>el.style.background='');
  const item = document.getElementById('pdItem_'+i);
  if(item) item.style.background='var(--wl)';
  toast('수정 모드: '+p.name,'i');
  document.getElementById('np_nm').scrollIntoView({behavior:'smooth', block:'center'});
  document.getElementById('np_nm').focus();
}


// ============================================================
// 알람 임계값 관리 (Firebase + LocalStorage 캐시)
// ============================================================
const ALARM_LS_CACHE_KEY = 'ssbon_v6_alarm_thresholds_cache';
const ALARM_FB_COL = 'config';
const ALARM_FB_DOC = 'alarms';
const ALARM_DEFAULTS = {
  cooking:   { mean: 54.50, std: 1.27, enabled: true },
  shredding: { mean: 50.83, std: 2.77, enabled: true },
  packing:   { mean: 50.67, std: 7.23, enabled: true }
};

// 메모리 캐시 (페이지 시작 시 Firebase에서 로드된 값)
window._alarmThresholdsCache = null;

async function loadAlarmThresholdsFromFb(){
  try{
    const doc = await firebase.firestore().collection(ALARM_FB_COL).doc(ALARM_FB_DOC).get();
    if(doc.exists){
      const data = doc.data();
      window._alarmThresholdsCache = data;
      // LocalStorage에도 백업
      try{ localStorage.setItem(ALARM_LS_CACHE_KEY, JSON.stringify(data)); }catch(e){}
      return data;
    }
  }catch(e){ console.warn('알람 임계값 Firebase 로드 실패:', e.message); }
  // 폴백: LocalStorage 캐시 → 기본값
  try{
    const cached = localStorage.getItem(ALARM_LS_CACHE_KEY);
    if(cached){
      const data = JSON.parse(cached);
      window._alarmThresholdsCache = data;
      return data;
    }
  }catch(e){}
  window._alarmThresholdsCache = JSON.parse(JSON.stringify(ALARM_DEFAULTS));
  return window._alarmThresholdsCache;
}

function getAlarmThresholdsSync(){
  // renderDailyAlerts 등에서 쓸 동기 버전
  if(window._alarmThresholdsCache) return window._alarmThresholdsCache;
  try{
    const cached = localStorage.getItem(ALARM_LS_CACHE_KEY);
    if(cached) return JSON.parse(cached);
  }catch(e){}
  return JSON.parse(JSON.stringify(ALARM_DEFAULTS));
}

async function saveAlarmThresholds(){
  const data = {
    cooking: {
      mean: parseFloat(document.getElementById('al_ck_mean').value)||ALARM_DEFAULTS.cooking.mean,
      std:  parseFloat(document.getElementById('al_ck_std').value)||ALARM_DEFAULTS.cooking.std,
      enabled: document.getElementById('al_ck_on').checked
    },
    shredding: {
      mean: parseFloat(document.getElementById('al_sh_mean').value)||ALARM_DEFAULTS.shredding.mean,
      std:  parseFloat(document.getElementById('al_sh_std').value)||ALARM_DEFAULTS.shredding.std,
      enabled: document.getElementById('al_sh_on').checked
    },
    packing: {
      mean: parseFloat(document.getElementById('al_pk_mean').value)||ALARM_DEFAULTS.packing.mean,
      std:  parseFloat(document.getElementById('al_pk_std').value)||ALARM_DEFAULTS.packing.std,
      enabled: document.getElementById('al_pk_on').checked
    },
    _updatedAt: new Date().toISOString()
  };
  try{
    await firebase.firestore().collection(ALARM_FB_COL).doc(ALARM_FB_DOC).set(data);
    window._alarmThresholdsCache = data;
    try{ localStorage.setItem(ALARM_LS_CACHE_KEY, JSON.stringify(data)); }catch(e){}
    updAlarmThresholdLabels();
    const msg = document.getElementById('al_save_msg');
    if(msg){ msg.textContent = '✓ Firebase 저장 완료. 모든 디바이스에 적용됨 (다음 새로고침 시).'; setTimeout(()=>{msg.textContent='';},5000); }
    if(typeof toast === 'function') toast('알람 임계값 저장됨','s');
    if(typeof renderDaily === 'function') renderDaily();
  }catch(e){
    if(typeof toast==='function') toast('저장 실패: '+e.message,'d');
    console.error(e);
  }
}

function resetAlarmThresholds(){
  if(!confirm('4월 기본값으로 초기화하시겠습니까?')) return;
  const d = ALARM_DEFAULTS;
  document.getElementById('al_ck_mean').value = d.cooking.mean;
  document.getElementById('al_ck_std').value = d.cooking.std;
  document.getElementById('al_ck_on').checked = true;
  document.getElementById('al_sh_mean').value = d.shredding.mean;
  document.getElementById('al_sh_std').value = d.shredding.std;
  document.getElementById('al_sh_on').checked = true;
  document.getElementById('al_pk_mean').value = d.packing.mean;
  document.getElementById('al_pk_std').value = d.packing.std;
  document.getElementById('al_pk_on').checked = true;
  saveAlarmThresholds();
}

function updAlarmThresholdLabels(){
  const update = (prefix)=>{
    const m = parseFloat(document.getElementById(prefix+'_mean').value)||0;
    const s = parseFloat(document.getElementById(prefix+'_std').value)||0;
    const yEl = document.getElementById(prefix+'_y');
    const rEl = document.getElementById(prefix+'_r');
    if(yEl) yEl.textContent = (m-2*s).toFixed(2)+'%↓';
    if(rEl) rEl.textContent = (m-3*s).toFixed(2)+'%↓';
  };
  update('al_ck'); update('al_sh'); update('al_pk');
}

async function loadAlarmThresholdsToUI(){
  // settings 페이지 진입 시 호출 - Firebase에서 최신 가져와서 UI에 채움
  let t = window._alarmThresholdsCache;
  if(!t){
    t = await loadAlarmThresholdsFromFb();
  }
  const set = (id, v)=>{ const el = document.getElementById(id); if(el && v != null) el.value = v; };
  const setChk = (id, v)=>{ const el = document.getElementById(id); if(el) el.checked = !!v; };
  set('al_ck_mean', t.cooking?.mean); set('al_ck_std', t.cooking?.std); setChk('al_ck_on', t.cooking?.enabled);
  set('al_sh_mean', t.shredding?.mean); set('al_sh_std', t.shredding?.std); setChk('al_sh_on', t.shredding?.enabled);
  set('al_pk_mean', t.packing?.mean); set('al_pk_std', t.packing?.std); setChk('al_pk_on', t.packing?.enabled);
  updAlarmThresholdLabels();
  // 입력 변경 시 라벨 자동 갱신 리스너 (1회만 등록)
  ['al_ck_mean','al_ck_std','al_sh_mean','al_sh_std','al_pk_mean','al_pk_std'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && !el._alarmListenerSet){
      el.addEventListener('input', updAlarmThresholdLabels);
      el._alarmListenerSet = true;
    }
  });
  // 마지막 저장 시각 표시
  if(t._updatedAt){
    const msg = document.getElementById('al_save_msg');
    if(msg){
      const dt = new Date(t._updatedAt);
      msg.textContent = '마지막 수정: ' + dt.toLocaleString('ko-KR');
      msg.style.color = 'var(--g5)';
    }
  }
}

async function recalcAlarmFromData(){
  if(!confirm('최근 30일 데이터로 평균과 편차를 자동 계산하시겠습니까?')) return;
  if(typeof toast==='function') toast('계산 중...','i');
  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate()-30);
  const fmt = d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const sd = fmt(start), ed = fmt(today);

  const fetchCol = async (col)=>{
    const url = `https://firestore.googleapis.com/v1/projects/ssbon-factory/databases/(default)/documents:runQuery?key=AIzaSyA0Y6VK8EOahDE6O7LEWtyG9-U8YP3yqDE`;
    const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({structuredQuery:{from:[{collectionId:col}],where:{compositeFilter:{op:'AND',filters:[{fieldFilter:{field:{fieldPath:'date'},op:'GREATER_THAN_OR_EQUAL',value:{stringValue:sd}}},{fieldFilter:{field:{fieldPath:'date'},op:'LESS_THAN_OR_EQUAL',value:{stringValue:ed}}}]}}}})});
    const data = await r.json();
    return data.filter(d=>d.document).map(d=>{
      const fd = {};
      Object.entries(d.document.fields||{}).forEach(([k,v])=>{
        if(v.stringValue!==undefined) fd[k]=v.stringValue;
        else if(v.integerValue!==undefined) fd[k]=parseInt(v.integerValue);
        else if(v.doubleValue!==undefined) fd[k]=parseFloat(v.doubleValue);
      });
      return fd;
    });
  };

  try{
    const [th, ck, sh, pk] = await Promise.all([fetchCol('thawing'),fetchCol('cooking'),fetchCol('shredding'),fetchCol('packing')]);
    const byDate = (recs, key='kg')=>{ const m={}; recs.forEach(r=>{if(r.date){m[r.date]=(m[r.date]||0)+(parseFloat(r[key])||0);}}); return m; };
    const rmBy = byDate(th, 'totalKg');
    const ckBy = byDate(ck), shBy = byDate(sh);

    const pkRawBy = {};
    pk.forEach(r=>{
      if(!r.date) return;
      const p = (L.products||[]).find(x=>x.name===r.product);
      const kgea = p ? p.kgea : 0;
      pkRawBy[r.date] = (pkRawBy[r.date]||0) + (parseFloat(r.ea)||0)*kgea;
    });

    const ckYields=[], shYields=[], pkYields=[];
    Object.keys(rmBy).forEach(d=>{
      const rm = rmBy[d]; if(rm < 100) return;
      if(ckBy[d]>0){ const y = ckBy[d]/rm*100; if(20<y && y<100) ckYields.push(y); }
      if(shBy[d]>0){ const y = shBy[d]/rm*100; if(20<y && y<100) shYields.push(y); }
      if(pkRawBy[d]>0){ const y = pkRawBy[d]/rm*100; if(20<y && y<100) pkYields.push(y); }
    });

    const stat = arr=>{
      if(arr.length<3) return null;
      const m = arr.reduce((a,b)=>a+b,0)/arr.length;
      const v = arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length;
      return {mean: m, std: Math.sqrt(v), n: arr.length};
    };
    const sCk = stat(ckYields), sSh = stat(shYields), sPk = stat(pkYields);

    if(sCk){ document.getElementById('al_ck_mean').value = sCk.mean.toFixed(2); document.getElementById('al_ck_std').value = sCk.std.toFixed(2); }
    if(sSh){ document.getElementById('al_sh_mean').value = sSh.mean.toFixed(2); document.getElementById('al_sh_std').value = sSh.std.toFixed(2); }
    if(sPk){ document.getElementById('al_pk_mean').value = sPk.mean.toFixed(2); document.getElementById('al_pk_std').value = sPk.std.toFixed(2); }
    updAlarmThresholdLabels();
    const msg = document.getElementById('al_save_msg');
    if(msg){ msg.textContent = `✓ 자동계산 완료 (자숙 n=${sCk?.n||0}, 파쇄 n=${sSh?.n||0}, 포장 n=${sPk?.n||0}). 저장 버튼을 눌러야 적용됩니다.`; msg.style.color='var(--s)'; }
    if(typeof toast==='function') toast('자동계산 완료. 저장 누르세요.','s');
  }catch(e){
    if(typeof toast==='function') toast('자동계산 실패: '+e.message,'d');
    console.error(e);
  }
}
