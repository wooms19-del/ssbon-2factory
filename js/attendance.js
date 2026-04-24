// ============================================================
// 출퇴근 관리  js/attendance.js  v2 - 인라인 빠른 입력
// ============================================================

const ATT_EMP_KEY = 'att_employees_v1';
const DEFAULT_EMPS = ['김구식','김수영','임혜경','한채현','김정희','안남정','심현주','홍안순',
  '박수경','하대성','홍유순','정현석','김성희','김영선','배현자','김미애','이용범','게이코',
  '유혜선','레티장','김진화','박재홍','드엉반담','르탄프엉','응우옌반동','응우옌민호앙',
  '응우옌반키','르판하이퐁','판투안안'];

const ATT_SL = { // status label
  normal:'정상', early:'조출', overtime:'연장',
  'half-am':'반차(오전)', 'half-pm':'반차(오후)',
  quarter:'반반차', annual:'연차', absent:'결근'
};
const ATT_ICON = {
  normal:'✅', early:'🌅', overtime:'⏰',
  'half-am':'🌓', 'half-pm':'🌓', quarter:'🌗', annual:'📅', absent:'❌'
};
const ATT_COLOR = {
  normal:'#2e7d32', early:'#1565c0', overtime:'#e65100',
  'half-am':'#6a1b9a', 'half-pm':'#6a1b9a', quarter:'#4a148c',
  annual:'#ad1457', absent:'#b71c1c'
};

let _attDate   = '';
let _attRecs   = {};   // { 이름: {status, inTime, outTime} }
let _attEmps   = [];
let _attSubTab = 'input';
let _attExpanded = {}; // 펼쳐진 행 { 이름: true }

// ─────────────────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────────────────
function initAttendance() {
  _attDate = tod();
  const raw = localStorage.getItem(ATT_EMP_KEY);
  _attEmps = raw ? JSON.parse(raw) : DEFAULT_EMPS.map(n => ({name:n, annualDays:15, usedDays:0}));
  if (!raw) _saveAttEmps();
  _loadAttDate(_attDate);
}

function _saveAttEmps() { localStorage.setItem(ATT_EMP_KEY, JSON.stringify(_attEmps)); }
function _attDateKey(d) { return 'att_day_' + d; }

function _loadAttDate(date) {
  _attDate = date;
  _attExpanded = {};
  const raw = localStorage.getItem(_attDateKey(date));
  const saved = raw ? JSON.parse(raw) : {};
  _attRecs = {};
  _attEmps.forEach(e => {
    _attRecs[e.name] = saved[e.name] || {status:'normal', inTime:'09:00', outTime:'18:00'};
  });
  const lbl = document.getElementById('attDateLabel');
  if (lbl) lbl.textContent = _attFmtLabel(date);
  _renderAttAll();
}

function _attFmtLabel(d) {
  const days=['일','월','화','수','목','금','토'];
  const dt = new Date(d);
  return d.slice(5).replace('-','/') + ' (' + days[dt.getDay()] + ')';
}

function attChangeDay(delta) {
  const d = new Date(_attDate); d.setDate(d.getDate()+delta);
  _loadAttDate(d.toISOString().slice(0,10));
}
function attGoToday() { _loadAttDate(tod()); }

// ─────────────────────────────────────────────────────────
// 저장
// ─────────────────────────────────────────────────────────
function attSave() {
  localStorage.setItem(_attDateKey(_attDate), JSON.stringify(_attRecs));
  try {
    firebase.firestore().collection('attendance').doc(_attDate).set({
      date:_attDate, records:_attRecs, updatedAt:new Date().toISOString()
    });
  } catch(e){}
  toast('출퇴근 저장됨 ✓','s');
  _renderAttSummary();
}

// ─────────────────────────────────────────────────────────
// 전체 렌더
// ─────────────────────────────────────────────────────────
function _renderAttAll() {
  _renderAttSummary();
  const iw = document.getElementById('attInputWrap');
  const mw = document.getElementById('attMonthlyWrap');
  const sw = document.getElementById('attStaffWrap');
  if (iw) iw.style.display = _attSubTab==='input'  ? '' : 'none';
  if (mw) mw.style.display = _attSubTab==='monthly' ? '' : 'none';
  if (sw) sw.style.display = _attSubTab==='staff'   ? '' : 'none';
  if (_attSubTab==='input')   _renderAttInput();
  if (_attSubTab==='monthly') _renderAttMonthly();
  if (_attSubTab==='staff')   _renderAttStaff();
}

function attShowSubTab(tab, el) {
  _attSubTab = tab;
  document.querySelectorAll('.att-sub-tab').forEach(t=>t.classList.remove('on'));
  if(el) el.classList.add('on');
  const sc = document.getElementById('attStaffCount');
  if(sc) sc.textContent = _attEmps.length;
  _renderAttAll();
}

// ─────────────────────────────────────────────────────────
// 오늘 요약
// ─────────────────────────────────────────────────────────
function _renderAttSummary() {
  const el = document.getElementById('attSummary');
  if (!el) return;
  const raw = localStorage.getItem(_attDateKey(tod()));
  if (!raw) { el.innerHTML=''; return; }
  const todayRecs = JSON.parse(raw);
  const groups = {early:[],annual:[],'half-am':[],'half-pm':[],quarter:[],absent:[]};
  let totalIn=0, totalAbsent=0;
  _attEmps.forEach(e => {
    const r = todayRecs[e.name];
    if (!r) return;
    if (r.status==='absent') { totalAbsent++; groups.absent.push(e.name); }
    else { totalIn++; if(groups[r.status]) groups[r.status].push({name:e.name,inTime:r.inTime}); }
  });
  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 14px 7px;background:var(--g1);border-radius:10px;margin-bottom:4px">`;
  html += `<span style="font-size:14px;font-weight:700;color:var(--p)">총 출근 ${totalIn}명</span>`;
  if(totalAbsent) html+=`<span style="font-size:13px;color:#e53935;font-weight:600">결근 ${totalAbsent}명</span>`;
  html += `</div>`;
  const rows=[
    {key:'early',icon:'🌅',label:'조출',showTime:true},
    {key:'annual',icon:'📅',label:'연차',showTime:false},
    {key:'half-am',icon:'🌓',label:'반차(오전)',showTime:false},
    {key:'half-pm',icon:'🌓',label:'반차(오후)',showTime:false},
    {key:'quarter',icon:'🌗',label:'반반차',showTime:false},
  ];
  rows.forEach(row=>{
    const arr=groups[row.key]; if(!arr||!arr.length) return;
    const names=row.showTime?arr.map(x=>`${x.name} ${x.inTime}`).join('  '):arr.map(x=>typeof x==='string'?x:x.name).join('  ');
    html+=`<div style="padding:5px 14px;font-size:12px;color:var(--g6);border-bottom:1px solid var(--g2)"><b>${row.icon} ${row.label} ${arr.length}명</b> — ${names}</div>`;
  });
  el.innerHTML = html;
}

// ─────────────────────────────────────────────────────────
// 출퇴근 입력 탭 - 인라인 빠른 입력
// ─────────────────────────────────────────────────────────
function _renderAttInput() {
  const el = document.getElementById('attInputList');
  if (!el) return;

  el.innerHTML = _attEmps.map((e,i) => {
    const r = _attRecs[e.name] || {status:'normal',inTime:'09:00',outTime:'18:00'};
    const expanded = !!_attExpanded[e.name];
    const noTime = r.status==='annual'||r.status==='absent';
    const ext = !noTime ? _attCalcExt(r.outTime, r.inTime) : 0;
    const sc = ATT_COLOR[r.status]||'#333';
    const si = ATT_ICON[r.status]||'';
    const sl = ATT_SL[r.status]||'';

    // 상태 표시 행
    let statusInfo = '';
    if (noTime) {
      statusInfo = `<span style="font-size:12px;color:${sc}">${si} ${sl}</span>`;
    } else {
      statusInfo = `<span style="font-size:12px;color:${sc}">${si} ${sl}</span>
        <span style="font-size:12px;color:var(--g5);margin-left:8px">${r.inTime||'-'} → ${r.outTime||'-'}${ext>0?` <b style="color:#e65100">+${ext}분</b>`:''}</span>`;
    }

    // 펼쳐진 경우 빠른 버튼 + 시간 입력
    let expandedHtml = '';
    if (expanded) {
      const needTime = !['annual','absent'].includes(r.status);
      expandedHtml = `
      <div style="padding:8px 12px 10px;background:var(--g1);border-radius:8px;margin-top:6px">
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:${needTime?'8px':'0'}">
          <button onclick="attQuick('${e.name}','normal')" style="${_attQBtnStyle(r.status==='normal','#2e7d32')}">✅ 정상</button>
          <button onclick="attQuick('${e.name}','early')" style="${_attQBtnStyle(r.status==='early','#1565c0')}">🌅 조출</button>
          <button onclick="attQuick('${e.name}','half-am')" style="${_attQBtnStyle(r.status==='half-am','#6a1b9a')}">🌓 반차(오전)</button>
          <button onclick="attQuick('${e.name}','half-pm')" style="${_attQBtnStyle(r.status==='half-pm','#6a1b9a')}">🌓 반차(오후)</button>
          <button onclick="attQuick('${e.name}','quarter')" style="${_attQBtnStyle(r.status==='quarter','#4a148c')}">🌗 반반차</button>
          <button onclick="attQuick('${e.name}','overtime')" style="${_attQBtnStyle(r.status==='overtime','#e65100')}">⏰ 연장</button>
          <button onclick="attQuick('${e.name}','annual')" style="${_attQBtnStyle(r.status==='annual','#ad1457')}">📅 연차</button>
          <button onclick="attQuick('${e.name}','absent')" style="${_attQBtnStyle(r.status==='absent','#b71c1c')}">❌ 결근</button>
        </div>
        ${needTime ? `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;flex-direction:column;gap:3px">
            <span style="font-size:11px;color:var(--g4)">출근</span>
            <input id="attIn_${e.name.replace(/\s/g,'_')}" class="fc" type="text" inputmode="numeric" maxlength="5" placeholder="0900"
              value="${r.inTime||''}" style="width:68px;font-size:14px;font-weight:700;text-align:center;padding:6px 4px"
              oninput="attInInput('${e.name}',this.value)" onchange="attInChange('${e.name}',this.value)">
          </div>
          <span style="font-size:18px;color:var(--g4);margin-top:16px">→</span>
          <div style="display:flex;flex-direction:column;gap:3px">
            <span style="font-size:11px;color:var(--g4)">퇴근 <span style="color:var(--p)">(자동)</span></span>
            <input id="attOut_${e.name.replace(/\s/g,'_')}" class="fc" type="text" inputmode="numeric" maxlength="5" placeholder="1800"
              value="${r.outTime||''}" style="width:68px;font-size:14px;font-weight:700;text-align:center;padding:6px 4px"
              oninput="attOutInput('${e.name}',this.value)" onchange="attOutChange('${e.name}',this.value)">
          </div>
          ${ext>0?`<span style="font-size:12px;color:#e65100;margin-top:16px;font-weight:700">+${ext}분 연장</span>`:''}
        </div>` : `<div style="font-size:13px;color:${sc};padding:4px 0">${si} ${sl} — 시간 입력 불필요</div>`}
      </div>`;
    }

    return `<div style="padding:10px 14px;border-bottom:1px solid var(--g2)">
      <div onclick="attToggle('${e.name}')" style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none">
        <span style="font-size:11px;color:var(--g4);width:20px;text-align:right;flex-shrink:0">${i+1}</span>
        <span style="font-size:14px;font-weight:600;min-width:70px">${e.name}</span>
        <span style="flex:1">${statusInfo}</span>
        <span style="font-size:12px;color:var(--g4)">${expanded?'▲':'▼'}</span>
      </div>
      ${expandedHtml}
    </div>`;
  }).join('');
}

function attToggle(name) {
  _attExpanded[name] = !_attExpanded[name];
  _renderAttInput();
}

function _attQBtnStyle(active, color) {
  if (active) return `padding:5px 10px;border-radius:20px;border:2px solid ${color};background:${color};color:#fff;font-size:12px;cursor:pointer;font-weight:700`;
  return `padding:5px 10px;border-radius:20px;border:1.5px solid var(--g3);background:var(--g1);color:var(--g6);font-size:12px;cursor:pointer`;
}

function attQuick(name, status) {
  if (!_attRecs[name]) _attRecs[name] = {status:'normal',inTime:'09:00',outTime:'18:00'};
  const old = _attRecs[name];
  let inT = old.inTime || '09:00';
  let outT = '';

  switch(status) {
    case 'normal':   inT='09:00'; outT='18:00'; break;
    case 'early':    outT = _attCalcOut(inT); break;  // 출근시간 유지, 퇴근 재계산
    case 'overtime': outT = _attCalcOut(inT); break;  // 퇴근 직접 수정
    case 'half-am':  inT='09:00'; outT='13:00'; break;
    case 'half-pm':  inT='13:00'; outT='18:00'; break;
    case 'quarter':  inT=old.inTime||'09:00'; outT=_attAddH(inT,2); break;
    case 'annual':   inT=''; outT=''; break;
    case 'absent':   inT=''; outT=''; break;
  }
  _attRecs[name] = {status, inTime:inT, outTime:outT};
  _renderAttInput();
}

function attInInput(name, v) {
  // 자동 포맷 (0900 → 09:00)
  v = v.replace(/[^0-9]/g,'');
  if (v.length > 4) v = v.slice(0,4);
  const key = name.replace(/\s/g,'_');
  const el = document.getElementById('attIn_' + key);
  if (v.length === 4 && el) {
    const fmt = v.slice(0,2)+':'+v.slice(2);
    el.value = fmt;
    if (!_attRecs[name]) _attRecs[name] = {status:'normal',inTime:'09:00',outTime:'18:00'};
    _attRecs[name].inTime = fmt;
    _attRecs[name].outTime = _attCalcOut(fmt);
    const outEl = document.getElementById('attOut_' + key);
    if (outEl) outEl.value = _attRecs[name].outTime;
    _renderAttInput(); // ext 업데이트
  }
}

function attInChange(name, v) {
  v = _attFmt(v);
  if (!_attRecs[name]) _attRecs[name] = {status:'normal',inTime:'09:00',outTime:'18:00'};
  _attRecs[name].inTime = v;
  _attRecs[name].outTime = _attCalcOut(v);
  _renderAttInput();
}

function attOutInput(name, v) {
  v = v.replace(/[^0-9]/g,'');
  if (v.length > 4) v = v.slice(0,4);
  const key = name.replace(/\s/g,'_');
  const el = document.getElementById('attOut_' + key);
  if (v.length === 4 && el) {
    const fmt = v.slice(0,2)+':'+v.slice(2);
    el.value = fmt;
    if (!_attRecs[name]) _attRecs[name] = {status:'normal',inTime:'09:00',outTime:'18:00'};
    _attRecs[name].outTime = fmt;
    _renderAttInput();
  }
}

function attOutChange(name, v) {
  v = _attFmt(v);
  if (!_attRecs[name]) _attRecs[name] = {status:'normal',inTime:'09:00',outTime:'18:00'};
  _attRecs[name].outTime = v;
  _renderAttInput();
}

function attApplyAll() {
  _attEmps.forEach(e => { _attRecs[e.name] = {status:'normal',inTime:'09:00',outTime:'18:00'}; });
  _attExpanded = {};
  _renderAttInput();
}

// ─────────────────────────────────────────────────────────
// 월별 조회
// ─────────────────────────────────────────────────────────
function _renderAttMonthly() {
  const el = document.getElementById('attMonthlyBody');
  if (!el) return;
  const ym = _attDate.slice(0,7);
  const year=parseInt(ym.slice(0,4)), month=parseInt(ym.slice(5,7));
  const days = new Date(year,month,0).getDate();

  let hdr = '<tr style="background:var(--g1)"><th style="padding:5px 8px;text-align:left;font-size:12px;border:0.5px solid var(--g2);white-space:nowrap">이름</th>';
  for (let d=1;d<=days;d++) {
    const dt = new Date(year,month-1,d);
    const isTd = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}` === tod();
    const c = isTd?'#1a56db':dt.getDay()===0?'#e53935':dt.getDay()===6?'#1565c0':'';
    hdr+=`<th style="padding:5px 3px;font-size:10px;border:0.5px solid var(--g2);min-width:22px;text-align:center${c?';color:'+c:''}">${d}</th>`;
  }
  hdr+='<th style="padding:5px 4px;font-size:10px;border:0.5px solid var(--g2)">결근</th><th style="padding:5px 4px;font-size:10px;border:0.5px solid var(--g2)">연차</th></tr>';
  document.getElementById('attMonthlyHeader').innerHTML = hdr;

  const sIcon={normal:'',early:'조',overtime:'연','half-am':'반','half-pm':'반',quarter:'반반',annual:'연',absent:'결'};
  const sColor={early:'#1565c0',overtime:'#e65100','half-am':'#6a1b9a','half-pm':'#6a1b9a',quarter:'#4a148c',annual:'#ad1457',absent:'#e53935'};

  el.innerHTML = _attEmps.map(e => {
    let absent=0,annual=0,row=`<tr><td style="padding:5px 8px;font-size:12px;border:0.5px solid var(--g2);white-space:nowrap">${e.name}</td>`;
    for(let d=1;d<=days;d++){
      const ds=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const raw=localStorage.getItem(_attDateKey(ds));
      const r=raw?JSON.parse(raw)[e.name]:null;
      const s=r?r.status:'';
      if(s==='absent')absent++; if(s==='annual')annual++;
      const isTd=ds===tod();
      row+=`<td style="padding:3px;font-size:9px;text-align:center;border:0.5px solid var(--g2)${isTd?';background:#e3f2fd':''}${sColor[s]?';color:'+sColor[s]:''}" onclick="attMonthClick('${ds}')">${sIcon[s]||''}</td>`;
    }
    row+=`<td style="padding:3px 5px;font-size:11px;text-align:center;border:0.5px solid var(--g2);color:#e53935">${absent||''}</td>`;
    row+=`<td style="padding:3px 5px;font-size:11px;text-align:center;border:0.5px solid var(--g2);color:#ad1457">${annual||''}</td></tr>`;
    return row;
  }).join('');
}

function attMonthClick(date) {
  _attSubTab='input';
  document.querySelectorAll('.att-sub-tab').forEach(t=>t.classList.remove('on'));
  document.querySelector('.att-sub-tab[data-tab="input"]')?.classList.add('on');
  _loadAttDate(date);
}

// ─────────────────────────────────────────────────────────
// 직원 관리
// ─────────────────────────────────────────────────────────
function _renderAttStaff() {
  const el = document.getElementById('attStaffList');
  if (!el) return;
  const sc = document.getElementById('attStaffCount');
  if (sc) sc.textContent = _attEmps.length;
  el.innerHTML = _attEmps.map((e,i)=>`
    <div style="display:flex;align-items:center;padding:10px 0;border-bottom:0.5px solid var(--g2);gap:10px">
      <span style="font-size:12px;color:var(--g4);width:20px;text-align:right">${i+1}</span>
      <span style="flex:1;font-size:14px">${e.name}</span>
      <span style="font-size:12px;color:var(--g5)">연차 ${e.annualDays}일 / 잔여 <b style="color:var(--p)">${e.annualDays-(e.usedDays||0)}일</b></span>
      <button class="btn bo bsm" onclick="attEditStaff(${i})">수정</button>
      <button class="btn bo bsm" style="color:#e53935" onclick="attDeleteStaff(${i})">삭제</button>
    </div>`).join('');
}

function attAddStaff() {
  const name=prompt('직원 이름:'); if(!name||!name.trim()) return;
  const days=parseInt(prompt('연차 일수:','15'))||15;
  _attEmps.push({name:name.trim(),annualDays:days,usedDays:0});
  _saveAttEmps(); _renderAttStaff();
}
function attEditStaff(i) {
  const e=_attEmps[i];
  const name=prompt('이름:',e.name); if(!name) return;
  const days=parseInt(prompt('연차 일수:',e.annualDays))||e.annualDays;
  _attEmps[i]={...e,name:name.trim(),annualDays:days};
  _saveAttEmps(); _renderAttStaff();
}
function attDeleteStaff(i) {
  if(!confirm(_attEmps[i].name+' 삭제?')) return;
  _attEmps.splice(i,1); _saveAttEmps(); _renderAttStaff();
}

// ─────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────
function _attFmt(v) {
  v=(v||'').replace(/[^0-9]/g,'');
  if(v.length>4) v=v.slice(0,4);
  if(v.length===3) v='0'+v;
  if(v.length===4) return v.slice(0,2)+':'+v.slice(2);
  return v;
}
function _attFmtLabel(d) {
  const days=['일','월','화','수','목','금','토'];
  const dt=new Date(d);
  return d.slice(5).replace('-','/')+' ('+days[dt.getDay()]+')';
}
function _attCalcOut(t) {
  if(!t||!t.includes(':')) return '18:00';
  const[h,m]=t.split(':').map(Number);
  const tot=h*60+m+9*60;
  return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0');
}
function _attCalcExt(out,inT) {
  if(!out||!inT||!out.includes(':')||!inT.includes(':')) return 0;
  const toM=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
  return Math.max(0,toM(out)-toM(_attCalcOut(inT)));
}
function _attAddH(t,h) {
  if(!t||!t.includes(':')) return '';
  const[hr,mn]=t.split(':').map(Number);
  const tot=hr*60+mn+h*60;
  return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0');
}
