// 소스저장실: 탱크별 잔량 = 실사 기준 + 제조(sauce) − 사용(packing.sauceTanks)
// 상태: 사용중(오늘 출고 있음) / 대기중(잔량 있고 오늘 출고 없음) / 비어있음

var SR_TANKS = ['1번탱크','2번탱크','3번탱크','4번탱크','5번탱크','6번탱크','7번탱크'];
var SR_CAP = 2000;          // 탱크 1대 용량(kg) — 게이지 기준
var SR_EMPTY = 30;          // 이 값 이하면 비어있음으로 본다

var _srBase = null;         // {date, tanks:{탱크:kg}}
var _srMake = null;         // {탱크:kg} 기준일 이후 제조
var _srUse = null;          // {탱크:kg} 기준일 이후 사용
var _srToday = null;        // {탱크:kg} 오늘 사용 — 사용중 판정
var _srName = null;         // {탱크:소스명}
var _srManual = null;       // {탱크:'사용중'|'대기중'} 현장 수동 지정
var _srVals = {};           // 실사 입력 중 값
var _srEditing = false;

function srTod(){ return (typeof tod === 'function') ? tod() : new Date().toISOString().slice(0,10); }
function _srAddDay(d, n){
  var t = new Date(d + 'T00:00:00');
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0,10);
}

async function renderSauceRoom(){
  var el = document.getElementById('p-sauceroom');
  if(!el) return;
  el.innerHTML = '<div class="card" style="padding:20px;color:var(--g5)">소스 탱크 상태를 불러오는 중…</div>';
  var db = firebase.firestore();
  try{
    var b = await db.doc('_config/sauce_tank_baseline').get();
    _srBase = (b.exists && b.data()) ? b.data() : { date: '', tanks: {} };
    var s = await db.doc('_config/sauce_tank_status').get();
    _srManual = (s.exists && s.data() && s.data().status) ? s.data().status : {};
  }catch(e){
    _srBase = { date: '', tanks: {} }; _srManual = {};
  }
  var today = srTod();
  var from = _srBase.date ? _srAddDay(_srBase.date, 1) : _srAddDay(today, -60);

  var R = await Promise.all([
    fbGetRange('sauce', from, today).catch(function(){ return []; }),
    fbGetRange('packing', from, today).catch(function(){ return []; })
  ]);
  var mk = {}, us = {}, td = {}, nm = {};
  (R[0]||[]).forEach(function(r){
    var t = r.tank; if(!t) return;
    mk[t] = (mk[t]||0) + (parseFloat(r.kg)||0);
    if(r.name) nm[t] = r.name;
  });
  (R[1]||[]).forEach(function(r){
    (r.sauceTanks||[]).forEach(function(x){
      if(!x || !x.tank) return;
      var v = parseFloat(x.kg)||0;
      us[x.tank] = (us[x.tank]||0) + v;
      if(String(r.date).slice(0,10) === today) td[x.tank] = (td[x.tank]||0) + v;
    });
  });
  _srMake = mk; _srUse = us; _srToday = td; _srName = nm;
  _srPaint();
}

function _srRows(){
  return SR_TANKS.map(function(t){
    var base = parseFloat((_srBase.tanks||{})[t]);
    if(isNaN(base)) base = 0;
    var mk = _srMake[t]||0, us = _srUse[t]||0;
    var qty = base + mk - us;
    var st;
    if(_srManual[t] === '사용중' || _srManual[t] === '대기중') st = _srManual[t];
    else if((_srToday[t]||0) > 0) st = '사용중';
    else if(qty > SR_EMPTY) st = '대기중';
    else st = '비어있음';
    return { tank:t, no:t.replace('번탱크',''), base:base, mk:mk, us:us, qty:qty,
             name:_srName[t] || '', st:st, manual: !!_srManual[t] };
  });
}

function _srPaint(){
  var el = document.getElementById('p-sauceroom');
  if(!el) return;
  var rows = _srRows();
  var total = rows.reduce(function(s,r){ return s + Math.max(0, r.qty); }, 0);
  var neg = rows.filter(function(r){ return r.qty < -SR_EMPTY; });
  var using = rows.filter(function(r){ return r.st === '사용중'; }).length;

  var h = '';
  h += '<div class="card" style="padding:14px 16px;margin-bottom:10px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">';
  h += '<div><div style="font-size:16px;font-weight:600">소스저장실</div>'
     + '<div style="font-size:12px;color:var(--g5);margin-top:3px">잔량 = 실사 + 제조 − 사용'
     + (_srBase.date ? ' · 마지막 실사 ' + _srBase.date : ' · 실사 기록 없음') + '</div></div>';
  h += '<div style="display:flex;align-items:center;gap:10px">'
     + '<span style="font-size:13px;color:var(--g5)">사용중 <strong style="color:var(--p)">' + using + '</strong>대 · 총 <strong style="color:var(--g7)">' + Math.round(total).toLocaleString() + '</strong> kg</span>'
     + (_srEditing
        ? '<button class="btn bp bsm" onclick="srSaveCount()" style="padding:6px 14px">실사 저장</button>'
          + '<button class="btn bo bsm" onclick="srCancelCount()" style="padding:6px 12px">취소</button>'
        : '<button class="btn bo bsm" onclick="srStartCount()" style="padding:6px 12px">잔량 실사</button>')
     + '</div></div>';
  if(_srEditing){
    h += '<div style="margin-top:12px;padding:10px 12px;background:#eff6ff;border-radius:8px;font-size:12px;color:#1e40af">'
       + '탱크마다 실제로 재신 잔량을 입력하세요. 계산값이 미리 채워져 있으니 맞는 탱크는 그대로 두시면 됩니다. 다 넣으신 뒤 <strong>실사 저장</strong>을 누르세요.</div>';
  }
  if(neg.length){
    h += '<div style="margin-top:12px;padding:9px 12px;background:#fef2f2;border-radius:8px;font-size:12px;color:#dc2626">'
       + neg.map(function(r){ return r.no + '번'; }).join(', ') + '번 탱크 잔량이 음수입니다. 실사 기준이 없거나 이전 소스가 남아 있던 경우입니다. 잔량 실사로 맞춰주세요.</div>';
  }
  h += '</div>';

  h += '<div class="card" style="padding:14px 16px">';
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">';
  rows.forEach(function(r, i){
    if(i === 4) h += '</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px">';
    h += _srCard(r);
  });
  h += '</div></div>';

  h += '<div style="font-size:11px;color:var(--g5);padding:10px 4px;line-height:1.7">'
     + '제조는 소스 탭, 사용은 포장 탭의 소스 탱크 기록에서 자동 반영됩니다.<br>'
     + '상태는 오늘 출고가 있으면 사용중, 소스가 남아 있으면 대기중으로 자동 판정합니다. 배지를 눌러 직접 바꿀 수 있습니다.'
     + '</div>';
  el.innerHTML = h;
}

function _srCard(r){
  var low = (r.qty > SR_EMPTY && r.qty < SR_CAP * 0.15);
  var isNeg = (r.qty < -SR_EMPTY);
  var empty = (r.st === '비어있음');
  var pct = Math.max(0, Math.min(100, r.qty / SR_CAP * 100));
  var qtyColor = isNeg ? '#dc2626' : (low ? '#dc2626' : (empty ? 'var(--g4)' : 'var(--g7)'));
  var barColor = isNeg ? '#dc2626' : (low ? '#dc2626' : (empty ? 'var(--g3)' : '#1d4ed8'));
  var stStyle = {
    '사용중': 'background:#1d4ed8;color:#fff',
    '대기중': 'background:#e0e7ff;color:#3730a3',
    '비어있음': 'background:var(--g1);color:var(--g5)'
  }[r.st];
  var isFC = (r.name.indexOf('FC') >= 0);

  var h = '<div style="background:var(--g0,#fff);border:' + (_srEditing ? '1.5px solid #1d4ed8' : '0.5px solid ' + (isNeg ? '#fecaca' : 'var(--g2)')) + ';border-radius:10px;padding:11px 12px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">';
  h += '<span style="font-size:14px;font-weight:600">' + r.no + '번</span>';
  h += '<button onclick="srToggle(\'' + r.tank + '\')" style="border:none;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:600;cursor:pointer;' + stStyle + '">'
     + r.st + (r.manual ? '<span style="font-size:9px;margin-left:3px">고정</span>' : '') + '</button>';
  h += '</div>';
  h += '<div style="font-size:11px;color:' + (isFC ? '#dc2626' : 'var(--p)') + ';margin-top:3px;height:14px">' + (r.name ? (isFC ? 'FC' : 'FP') : '') + '</div>';
  h += '<div style="font-size:22px;font-weight:600;margin-top:2px;color:' + qtyColor + '">'
     + Math.round(r.qty).toLocaleString() + '<span style="font-size:12px;font-weight:400;color:var(--g5)"> kg</span></div>';
  h += '<div style="height:5px;background:var(--g1);border-radius:3px;margin:7px 0 6px;overflow:hidden">'
     + '<div style="width:' + pct + '%;height:100%;background:' + barColor + '"></div></div>';
  h += '<div style="font-size:11px;color:var(--g5);line-height:1.5">실사 ' + Math.round(r.base).toLocaleString()
     + (r.mk ? ' <span style="color:#1d4ed8">+' + Math.round(r.mk).toLocaleString() + '</span>' : ' +0')
     + (r.us ? ' <span style="color:#dc2626">−' + Math.round(r.us).toLocaleString() + '</span>' : ' −0')
     + '</div>';
  if(_srEditing){
    var v = (_srVals[r.tank] !== undefined) ? _srVals[r.tank] : Math.round(r.qty);
    h += '<div style="margin-top:9px;padding-top:9px;border-top:1px dashed var(--g2)">'
       + '<div style="font-size:11px;font-weight:600;color:#1d4ed8;margin-bottom:4px">실제 잔량 입력</div>'
       + '<div style="position:relative">'
       + '<input type="number" step="any" inputmode="decimal" value="' + v + '" onfocus="this.select()" oninput="srSetVal(\'' + r.tank + '\',this.value)"'
       + ' style="width:100%;height:42px;box-sizing:border-box;text-align:right;font-size:17px;font-weight:600;'
       + 'padding:0 34px 0 10px;border:2px solid #1d4ed8;border-radius:8px;background:#fff;color:var(--g7)">'
       + '<span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--g5);pointer-events:none">kg</span>'
       + '</div></div>';
  }
  h += '</div>';
  return h;
}

function srStartCount(){
  _srEditing = true; _srVals = {};
  _srRows().forEach(function(r){ _srVals[r.tank] = Math.round(r.qty); });
  _srPaint();
}
function srCancelCount(){ _srEditing = false; _srVals = {}; _srPaint(); }
function srSetVal(tank, v){ _srVals[tank] = (v === '' ? '' : parseFloat(v)); }

async function srSaveCount(){
  var tanks = {};
  var bad = [];
  SR_TANKS.forEach(function(t){
    var v = _srVals[t];
    if(v === '' || v === undefined || v === null || isNaN(v)){ tanks[t] = 0; return; }
    if(v < 0) bad.push(t);
    tanks[t] = parseFloat(v);
  });
  if(bad.length){ if(typeof toast==='function') toast('잔량은 0보다 작을 수 없습니다','w'); return; }
  var today = srTod();
  if(!confirm(today + ' 기준으로 탱크 잔량을 확정합니다.\n\n이 값이 새 기준이 되고, 이후 제조·사용이 여기서 가감됩니다.')) return;
  try{
    await firebase.firestore().doc('_config/sauce_tank_baseline').set({
      date: today, tanks: tanks, updatedAt: new Date().toISOString()
    });
    _srEditing = false; _srVals = {};
    if(typeof toast==='function') toast('탱크 잔량 실사 완료','s');
    renderSauceRoom();
  }catch(e){
    if(typeof toast==='function') toast('저장에 실패했습니다','w');
  }
}

// 배지 클릭 — 자동 → 사용중 → 대기중 → 자동
async function srToggle(tank){
  var cur = _srManual[tank];
  var next = (!cur) ? '사용중' : (cur === '사용중' ? '대기중' : '');
  if(next) _srManual[tank] = next; else delete _srManual[tank];
  _srPaint();
  try{
    await firebase.firestore().doc('_config/sauce_tank_status').set({
      status: _srManual, updatedAt: new Date().toISOString()
    });
  }catch(e){}
}
