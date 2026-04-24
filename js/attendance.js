// ============================================================
// 출퇴근 관리  js/attendance.js
// ============================================================

const ATT_EMP_KEY  = 'att_employees_v1';
const DEFAULT_EMPS = ['김구식','김수영','임혜경','한채현','김정희','안남정','심현주','홍안순',
  '박수경','하대성','홍유순','정현석','김성희','김영선','배현자','김미애','이용범','게이코',
  '유혜선','레티장','김진화','박재홍','드엉반담','르탄프엉','응우옌반동','응우옌민호앙',
  '응우옌반키','르판하이퐁','판투안안'];

const ATT_STATUS_LABEL = {
  normal:'정상', early:'조출', overtime:'연장',
  'half-am':'반차(오전)', 'half-pm':'반차(오후)',
  quarter:'반반차', annual:'연차', absent:'결근'
};

let _attDate    = '';   // 현재 입력 날짜 (YYYY-MM-DD)
let _attRecs    = {};   // { 이름: {status, inTime, outTime} }
let _attEmps    = [];   // [{name, annualDays, usedDays}]
let _attSubTab  = 'input'; // input | monthly | staff

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

function _saveAttEmps() {
  localStorage.setItem(ATT_EMP_KEY, JSON.stringify(_attEmps));
}

function _attDateKey(d) { return 'att_day_' + d; }

function _loadAttDate(date) {
  _attDate = date;
  const raw = localStorage.getItem(_attDateKey(date));
  const saved = raw ? JSON.parse(raw) : {};
  _attRecs = {};
  _attEmps.forEach(e => {
    _attRecs[e.name] = saved[e.name] || {status:'normal', inTime:'09:00', outTime:'18:00'};
  });
  document.getElementById('attDateLabel').textContent = _fmtDateLabel(date);
  _renderAttAll();
}

function _fmtDateLabel(d) {
  const days = ['일','월','화','수','목','금','토'];
  const dt = new Date(d);
  return d.slice(5).replace('-','/') + ' (' + days[dt.getDay()] + ')';
}

// ─────────────────────────────────────────────────────────
// 날짜 이동
// ─────────────────────────────────────────────────────────
function attChangeDay(delta) {
  const d = new Date(_attDate);
  d.setDate(d.getDate() + delta);
  _loadAttDate(d.toISOString().slice(0,10));
}

function attGoToday() {
  _loadAttDate(tod());
}

// ─────────────────────────────────────────────────────────
// 저장
// ─────────────────────────────────────────────────────────
function attSave() {
  localStorage.setItem(_attDateKey(_attDate), JSON.stringify(_attRecs));
  // Firebase 저장
  try {
    const db = firebase.firestore();
    db.collection('attendance').doc(_attDate).set({
      date: _attDate,
      records: _attRecs,
      updatedAt: new Date().toISOString()
    });
  } catch(e) {}
  toast('출퇴근 저장됨 ✓', 's');
  _renderAttSummary(); // 오늘이면 요약도 업데이트
}

// ─────────────────────────────────────────────────────────
// 전체 렌더
// ─────────────────────────────────────────────────────────
function _renderAttAll() {
  _renderAttSummary();
  if (_attSubTab === 'input')   _renderAttInput();
  else if (_attSubTab === 'monthly') _renderAttMonthly();
  else if (_attSubTab === 'staff')   _renderAttStaff();
}

function attShowSubTab(tab, el) {
  _attSubTab = tab;
  document.querySelectorAll('.att-sub-tab').forEach(t => t.classList.remove('on'));
  if (el) el.classList.add('on');
  // wrap 표시/숨김
  ['attInputWrap','attMonthlyWrap','attStaffWrap'].forEach(id => {
    const w = document.getElementById(id);
    if (w) w.style.display = 'none';
  });
  const activeWrap = {input:'attInputWrap', monthly:'attMonthlyWrap', staff:'attStaffWrap'}[tab];
  const w = document.getElementById(activeWrap);
  if (w) w.style.display = '';
  // 직원수 업데이트
  const sc = document.getElementById('attStaffCount');
  if (sc) sc.textContent = _attEmps.length;
  _renderAttAll();
}

// ─────────────────────────────────────────────────────────
// 오늘 요약 대시보드
// ─────────────────────────────────────────────────────────
function _renderAttSummary() {
  const el = document.getElementById('attSummary');
  if (!el) return;

  const todayRaw = localStorage.getItem(_attDateKey(tod()));
  const todayRecs = todayRaw ? JSON.parse(todayRaw) : {};

  const groups = { early:[], annual:[], 'half-am':[], 'half-pm':[], quarter:[], absent:[], overtime:[] };
  let totalIn = 0, totalAbsent = 0;

  _attEmps.forEach(e => {
    const r = todayRecs[e.name];
    if (!r || r.status === 'normal') { if (r) totalIn++; return; }
    if (r.status === 'absent') { totalAbsent++; groups.absent.push(e.name); }
    else { totalIn++; if (groups[r.status]) groups[r.status].push({name:e.name, inTime:r.inTime}); }
  });

  // 저장된 오늘 데이터 없으면 숨김
  if (!todayRaw) { el.innerHTML = ''; return; }

  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px 8px;background:var(--g1);border-radius:10px;margin-bottom:4px">`;
  html += `<span style="font-size:14px;font-weight:700;color:var(--p)">총 출근 ${totalIn}명</span>`;
  if (totalAbsent) html += `<span style="font-size:13px;color:#e53935;font-weight:600">결근 ${totalAbsent}명</span>`;
  html += `</div>`;

  const rows = [
    { key:'early',    icon:'🌅', label:'조출',    showTime:true  },
    { key:'annual',   icon:'📅', label:'연차',    showTime:false },
    { key:'half-am',  icon:'🌓', label:'반차(오전)',showTime:false },
    { key:'half-pm',  icon:'🌓', label:'반차(오후)',showTime:false },
    { key:'quarter',  icon:'🌗', label:'반반차',  showTime:false },
  ];

  rows.forEach(row => {
    const arr = groups[row.key];
    if (!arr || !arr.length) return;
    const names = row.showTime
      ? arr.map(x => `${x.name} ${x.inTime}`).join('  ')
      : arr.map(x => typeof x === 'string' ? x : x.name).join('  ');
    html += `<div style="padding:5px 14px;font-size:12px;color:var(--g6);border-bottom:1px solid var(--g2)">
      <b>${row.icon} ${row.label} ${arr.length}명</b> — ${names}</div>`;
  });

  el.innerHTML = html;
}

// ─────────────────────────────────────────────────────────
// 출퇴근 입력 탭
// ─────────────────────────────────────────────────────────
function _renderAttInput() {
  const el = document.getElementById('attInputList');
  if (!el) return;

  el.innerHTML = _attEmps.map((e, i) => {
    const r = _attRecs[e.name] || {status:'normal', inTime:'09:00', outTime:'18:00'};
    const noTime = r.status === 'annual' || r.status === 'absent';
    const ext = !noTime ? _attCalcExt(r.outTime, r.inTime) : 0;
    const statusColor = {
      normal:'#2e7d32', early:'#1565c0', overtime:'#e65100',
      'half-am':'#6a1b9a', 'half-pm':'#6a1b9a', quarter:'#4a148c',
      annual:'#ad1457', absent:'#b71c1c'
    }[r.status] || '#333';

    return `<div style="padding:10px 14px;border-bottom:1px solid var(--g2);display:grid;grid-template-columns:24px 1fr auto;gap:10px;align-items:center">
      <span style="font-size:11px;color:var(--g4);text-align:right">${i+1}</span>
      <div>
        <span style="font-size:14px;font-weight:600">${e.name}</span>
        <span style="font-size:11px;color:var(--g4);margin-left:8px">
          ${noTime ? ATT_STATUS_LABEL[r.status] : `${r.inTime||'-'} → ${r.outTime||'-'}${ext>0?' <span style=color:#e65100>+'+ext+'분</span>':''}`}
        </span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        <span onclick="attOpenCard('${e.name}')" style="font-size:11px;padding:3px 9px;border-radius:12px;background:#f0f0f0;color:${statusColor};font-weight:600;cursor:pointer">${ATT_STATUS_LABEL[r.status]}</span>
        ${noTime ? '' : `
          <input class="fc" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM"
            value="${r.inTime||''}" style="width:54px;font-size:12px;padding:4px 6px;text-align:center"
            onchange="attSetIn('${e.name}',this.value)">
          <span style="font-size:11px;color:var(--g4)">→</span>
          <input class="fc" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM"
            value="${r.outTime||''}" style="width:54px;font-size:12px;padding:4px 6px;text-align:center"
            onchange="attSetOut('${e.name}',this.value)">`}
      </div>
    </div>`;
  }).join('');
}

function attSetIn(name, val) {
  val = _attFmt(val);
  if (!_attRecs[name]) _attRecs[name] = {status:'normal', inTime:'09:00', outTime:'18:00'};
  _attRecs[name].inTime = val;
  _attRecs[name].outTime = _attCalcOut(val);
  _renderAttInput();
}

function attSetOut(name, val) {
  val = _attFmt(val);
  if (!_attRecs[name]) _attRecs[name] = {status:'normal', inTime:'09:00', outTime:'18:00'};
  _attRecs[name].outTime = val;
  _renderAttInput();
}

function attApplyAll() {
  _attEmps.forEach(e => {
    _attRecs[e.name] = {status:'normal', inTime:'09:00', outTime:'18:00'};
  });
  _renderAttInput();
}

// ─────────────────────────────────────────────────────────
// 근태 설정 카드
// ─────────────────────────────────────────────────────────
function attOpenCard(name) {
  const r = _attRecs[name] || {status:'normal', inTime:'09:00', outTime:'18:00'};
  document.getElementById('attCardName').textContent = name;
  document.getElementById('attCardStatus').value = r.status;
  document.getElementById('attCardIn').value = r.inTime || '';
  _attCardUpdateCalc();
  document.getElementById('attCardModal').style.display = 'flex';
}

function attCloseCard() {
  document.getElementById('attCardModal').style.display = 'none';
}

function attCardStatusChange() {
  const s = document.getElementById('attCardStatus').value;
  const noTime = s === 'annual' || s === 'absent';
  document.getElementById('attCardInRow').style.display = noTime ? 'none' : '';
  document.getElementById('attCardCalcRow').style.display = noTime ? 'none' : '';
  _attCardUpdateCalc();
}

function _attCardUpdateCalc() {
  const v = document.getElementById('attCardIn').value;
  const fmt = _attFmt(v);
  const out = _attCalcOut(fmt);
  document.getElementById('attCardCalcOut').textContent = fmt ? `${fmt} → 예상퇴근 ${out}` : '-';
}

function attCardConfirm() {
  const name = document.getElementById('attCardName').textContent;
  const s = document.getElementById('attCardStatus').value;
  let inT = _attFmt(document.getElementById('attCardIn').value);
  let outT = _attCalcOut(inT);

  if (s === 'half-am')  { outT = '13:00'; }
  if (s === 'half-pm')  { inT = '13:00'; outT = '18:00'; }
  if (s === 'quarter')  { outT = _attAddH(inT, 2); }
  if (s === 'annual' || s === 'absent') { inT = ''; outT = ''; }

  _attRecs[name] = { status: s, inTime: inT, outTime: outT };
  attCloseCard();
  _renderAttInput();
}

// ─────────────────────────────────────────────────────────
// 월별 조회 탭
// ─────────────────────────────────────────────────────────
function _renderAttMonthly() {
  const el = document.getElementById('attMonthlyBody');
  if (!el) return;
  const ym = _attDate.slice(0,7);
  const year = parseInt(ym.slice(0,4));
  const month = parseInt(ym.slice(5,7));
  const days = new Date(year, month, 0).getDate();

  // 헤더
  let headerHtml = '<tr style="background:var(--g1)">';
  headerHtml += '<th style="padding:5px 8px;text-align:left;font-size:12px;border:1px solid var(--g2);white-space:nowrap">이름</th>';
  for (let d = 1; d <= days; d++) {
    const dt = new Date(year, month-1, d);
    const isSun = dt.getDay() === 0;
    const isSat = dt.getDay() === 6;
    const isToday = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}` === tod();
    const color = isToday ? '#1a56db' : isSun ? '#e53935' : isSat ? '#1565c0' : '';
    headerHtml += `<th style="padding:5px 3px;font-size:10px;border:1px solid var(--g2);min-width:22px;text-align:center${color?';color:'+color:''}">${d}</th>`;
  }
  headerHtml += '<th style="padding:5px 5px;font-size:11px;border:1px solid var(--g2)">결근</th>';
  headerHtml += '<th style="padding:5px 5px;font-size:11px;border:1px solid var(--g2)">연차</th>';
  headerHtml += '</tr>';
  document.getElementById('attMonthlyHeader').innerHTML = headerHtml;

  const statusIcon = { normal:'', early:'조', overtime:'연', 'half-am':'반', 'half-pm':'반', quarter:'반반', annual:'연차', absent:'결' };
  const statusColor = { normal:'', early:'#1565c0', overtime:'#e65100', 'half-am':'#6a1b9a', 'half-pm':'#6a1b9a', quarter:'#4a148c', annual:'#ad1457', absent:'#e53935' };

  el.innerHTML = _attEmps.map(e => {
    let absent=0, annual=0;
    let rowHtml = `<tr><td style="padding:5px 8px;font-size:12px;border:1px solid var(--g2);white-space:nowrap">${e.name}</td>`;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const raw = localStorage.getItem(_attDateKey(dateStr));
      const recs = raw ? JSON.parse(raw) : {};
      const r = recs[e.name];
      const s = r ? r.status : '';
      if (s === 'absent') absent++;
      if (s === 'annual') annual++;
      const icon = statusIcon[s] || '';
      const color = statusColor[s] || '';
      const isToday = dateStr === tod();
      rowHtml += `<td style="padding:3px;font-size:9px;text-align:center;border:1px solid var(--g2)${isToday?';background:#e3f2fd':''}${color?';color:'+color:''}" onclick="attMonthlyClick('${dateStr}','${e.name}')">${icon}</td>`;
    }
    rowHtml += `<td style="padding:3px 5px;font-size:11px;text-align:center;border:1px solid var(--g2);color:#e53935">${absent||''}</td>`;
    rowHtml += `<td style="padding:3px 5px;font-size:11px;text-align:center;border:1px solid var(--g2);color:#ad1457">${annual||''}</td>`;
    rowHtml += '</tr>';
    return rowHtml;
  }).join('');
}

function attMonthlyClick(date, name) {
  _attSubTab = 'input';
  document.querySelectorAll('.att-sub-tab').forEach(t => t.classList.remove('on'));
  document.querySelector('.att-sub-tab[data-tab=input]')?.classList.add('on');
  _loadAttDate(date);
}

// ─────────────────────────────────────────────────────────
// 직원 관리 탭
// ─────────────────────────────────────────────────────────
function _renderAttStaff() {
  const el = document.getElementById('attStaffList');
  if (!el) return;
  el.innerHTML = _attEmps.map((e, i) => `
    <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--g2);gap:10px">
      <span style="font-size:12px;color:var(--g4);width:20px;text-align:right">${i+1}</span>
      <span style="flex:1;font-size:14px">${e.name}</span>
      <span style="font-size:12px;color:var(--g5)">연차 ${e.annualDays}일 / 잔여 <b style="color:var(--p)">${e.annualDays-(e.usedDays||0)}일</b></span>
      <button class="btn bo bsm" onclick="attEditStaff(${i})">수정</button>
      <button class="btn bo bsm" style="color:#e53935" onclick="attDeleteStaff(${i})">삭제</button>
    </div>`).join('');
}

function attAddStaff() {
  const name = prompt('직원 이름:');
  if (!name || !name.trim()) return;
  const days = parseInt(prompt('연차 일수 (기본 15):', '15')) || 15;
  _attEmps.push({ name: name.trim(), annualDays: days, usedDays: 0 });
  _saveAttEmps();
  _renderAttStaff();
}

function attEditStaff(i) {
  const e = _attEmps[i];
  const name = prompt('이름:', e.name);
  if (!name) return;
  const days = parseInt(prompt('연차 일수:', e.annualDays)) || e.annualDays;
  _attEmps[i] = { ...e, name: name.trim(), annualDays: days };
  _saveAttEmps();
  _renderAttStaff();
}

function attDeleteStaff(i) {
  if (!confirm(_attEmps[i].name + ' 삭제?')) return;
  _attEmps.splice(i, 1);
  _saveAttEmps();
  _renderAttStaff();
}

// ─────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────
function _attFmt(v) {
  v = (v||'').replace(/[^0-9]/g,'');
  if (v.length > 4) v = v.slice(0,4);
  if (v.length === 3) v = '0' + v;
  if (v.length === 4) return v.slice(0,2) + ':' + v.slice(2);
  return v;
}

function _attCalcOut(inTime) {
  if (!inTime || !inTime.includes(':')) return '18:00';
  const [h,m] = inTime.split(':').map(Number);
  const tot = h*60 + m + 9*60;
  return String(Math.floor(tot/60)).padStart(2,'0') + ':' + String(tot%60).padStart(2,'0');
}

function _attCalcExt(outTime, inTime) {
  if (!outTime || !inTime || !outTime.includes(':') || !inTime.includes(':')) return 0;
  const toMin = t => { const[h,m]=t.split(':').map(Number); return h*60+m; };
  return Math.max(0, toMin(outTime) - toMin(_attCalcOut(inTime)));
}

function _attAddH(t, h) {
  if (!t || !t.includes(':')) return '';
  const [hr,mn] = t.split(':').map(Number);
  const tot = hr*60 + mn + h*60;
  return String(Math.floor(tot/60)).padStart(2,'0') + ':' + String(tot%60).padStart(2,'0');
}
