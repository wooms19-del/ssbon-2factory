// 소스저장실: 탱크별 잔량 = 실사 기준 + 제조(sauce) − 사용(packing.sauceTanks)

var SR_TANKS = ['1번탱크','2번탱크','3번탱크','4번탱크','5번탱크','6번탱크','7번탱크'];
var SR_CAP = 2000;          // 탱크 1대 용량(kg) — 게이지 기준
var SR_EMPTY = 30;          // 이 값 이하면 비어있음으로 본다

var _srBase = null;         // {date, tanks:{탱크:kg}}
var _srMake = null;         // {탱크:kg} 기준일 이후 제조
var _srUse = null;          // {탱크:kg} 기준일 이후 사용
var _srName = null;         // {탱크:소스명}
var _srVals = {};           // 실사 입력 중 값
var _srKinds = {};          // 실사 입력 중 소스 종류
var _srEditing = false;

function srTod(){ return (typeof tod === 'function') ? tod() : new Date().toISOString().slice(0,10); }
function _srAddDay(d, n){
  var p = String(d).split('-');
  var t = new Date(Date.UTC(+p[0], (+p[1])-1, +p[2]));
  t.setUTCDate(t.getUTCDate() + n);
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
  }catch(e){
    _srBase = { date: '', tanks: {} };
  }
  var today = srTod();
  // 실사한 날도 집계에 넣는다. 다음날부터 세면 실사 뒤에 친 소스가
  // 하루 동안 화면에 안 잡힌다. 대신 실사 시각보다 나중에 들어온 것만 센다.
  var from = _srBase.date || _srAddDay(today, -60);
  var baseAt = _srBase.updatedAt || '';

  // 실사일 당일 기록은 실사 시각 이후만 인정
  var afterCount = function(r){
    var d = String(r.date||'').slice(0,10);
    if(d !== _srBase.date) return true;          // 실사일이 아니면 그대로
    if(!baseAt) return false;                    // 실사 시각을 모르면 당일분 제외
    return String(r._createdAt||'') > baseAt;
  };

  var R = await Promise.all([
    fbGetRange('sauce', from, today).catch(function(){ return []; }),
    fbGetRange('packing', from, today).catch(function(){ return []; })
  ]);
  var mk = {}, us = {}, nm = {};
  (R[0]||[]).forEach(function(r){
    var t = r.tank; if(!t) return;
    if(!afterCount(r)) return;
    mk[t] = (mk[t]||0) + (parseFloat(r.kg)||0);
    if(r.name) nm[t] = r.name;
  });
  (R[1]||[]).forEach(function(r){
    if(!afterCount(r)) return;
    (r.sauceTanks||[]).forEach(function(x){
      if(!x || !x.tank) return;
      us[x.tank] = (us[x.tank]||0) + (parseFloat(x.kg)||0);
    });
  });
  _srMake = mk; _srUse = us; _srName = nm;
  _srPaint();
  // 제조 이력은 뒤이어 채운다 (잔량 카드가 먼저 뜨도록)
  _srLogLoad().then(function(){
    var b = document.getElementById('srLogBody');
    if(b) b.innerHTML = _srLogHtml();
  });
}

function _srRows(){
  return SR_TANKS.map(function(t){
    var base = parseFloat((_srBase.tanks||{})[t]);
    if(isNaN(base)) base = 0;
    var mk = _srMake[t]||0, us = _srUse[t]||0;
    // 소스 종류: 기준일 이후 제조 기록이 있으면 그것, 없으면 실사 때 지정한 값
    var kind = _srName[t] ? (String(_srName[t]).indexOf('FC') >= 0 ? 'FC' : 'FP')
                          : ((_srBase.kinds||{})[t] || '');
    return { tank:t, no:t.replace('번탱크',''), base:base, mk:mk, us:us, qty:base + mk - us,
             kind:kind, fromMake: !!_srName[t] };
  });
}

function _srPaint(){
  var el = document.getElementById('p-sauceroom');
  if(!el) return;
  _srLogInit();
  var rows = _srRows();
  var total = rows.reduce(function(s,r){ return s + Math.max(0, r.qty); }, 0);
  var neg = rows.filter(function(r){ return r.qty < -SR_EMPTY; });

  var h = '';
  h += '<div class="card" style="padding:14px 16px;margin-bottom:10px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">';
  h += '<div><div style="font-size:16px;font-weight:600">소스저장실</div>'
     + '<div style="font-size:12px;color:var(--g5);margin-top:3px">잔량 = 실사 + 제조 − 사용'
     + (_srBase.date ? ' · 마지막 실사 ' + _srBase.date : ' · 실사 기록 없음') + '</div></div>';
  h += '<div style="display:flex;align-items:center;gap:10px">'
     + '<span style="font-size:13px;color:var(--g5)">총 <strong style="color:var(--g7)">' + Math.round(total).toLocaleString() + '</strong> kg</span>'
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

  // 제조 이력 (기간 지정)
  h += '<div class="card" style="padding:14px 16px;margin-top:10px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">';
  h += '<div style="font-size:14px;font-weight:600">소스 제조 이력</div>';
  h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
     + '<input type="date" class="fc" value="' + _srLogFrom + '" onchange="srLogSet(\'from\',this.value)" style="padding:5px 7px;font-size:12px">'
     + '<span style="font-size:12px;color:var(--g5)">~</span>'
     + '<input type="date" class="fc" value="' + _srLogTo + '" onchange="srLogSet(\'to\',this.value)" style="padding:5px 7px;font-size:12px">'
     + '<button class="btn bo bsm" style="padding:4px 10px;font-size:12px" onclick="srLogQuick(7)">최근 7일</button>'
     + '<button class="btn bo bsm" style="padding:4px 10px;font-size:12px" onclick="srLogQuick(30)">30일</button>'
     + '<button class="btn bo bsm" style="padding:4px 10px;font-size:12px" onclick="srLogExcel()">엑셀</button>'
     + '</div></div>';
  h += '<div id="srLogBody" style="margin-top:10px">' + _srLogHtml() + '</div>';
  h += '</div>';

  h += '<div style="font-size:11px;color:var(--g5);padding:10px 4px;line-height:1.7">'
     + '제조는 소스 탭, 사용은 포장 탭의 소스 탱크 기록에서 자동 반영됩니다. 내포장이 종료될 때 해당 탱크에서 차감됩니다.<br>'
     + '소스 종류는 실사 이후 제조 기록이 있으면 그 소스로 바뀌고, 없으면 실사 때 지정한 값이 <span style="color:var(--g4)">지정</span> 표시와 함께 유지됩니다.'
     + '</div>';
  el.innerHTML = h;
}

function _srCard(r){
  var low = (r.qty > SR_EMPTY && r.qty < SR_CAP * 0.15);
  var isNeg = (r.qty < -SR_EMPTY);
  var empty = (r.qty <= SR_EMPTY && r.qty >= -SR_EMPTY);
  var pct = Math.max(0, Math.min(100, r.qty / SR_CAP * 100));
  var qtyColor = isNeg ? '#dc2626' : (low ? '#dc2626' : (empty ? 'var(--g4)' : 'var(--g7)'));
  var barColor = isNeg ? '#dc2626' : (low ? '#dc2626' : (empty ? 'var(--g3)' : '#1d4ed8'));
  var isFC = (r.kind === 'FC');

  var h = '<div style="background:var(--g0,#fff);border:' + (_srEditing ? '1.5px solid #1d4ed8' : '0.5px solid ' + (isNeg ? '#fecaca' : 'var(--g2)')) + ';border-radius:10px;padding:11px 12px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">';
  h += '<span style="font-size:14px;font-weight:600">' + r.no + '번</span>';
  h += (r.kind ? '<span style="font-size:11px;font-weight:600;color:' + (isFC ? '#dc2626' : 'var(--p)') + '">' + r.kind
        + (r.fromMake ? '' : '<span style="font-size:9px;color:var(--g4);margin-left:2px">지정</span>') + '</span>' : '');
  h += '</div>';
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
    var k = (_srKinds[r.tank] !== undefined) ? _srKinds[r.tank] : r.kind;
    h += '<div style="margin-top:9px;padding-top:9px;border-top:1px dashed var(--g2)">'
       + '<div style="font-size:11px;font-weight:600;color:#1d4ed8;margin-bottom:4px">소스 종류</div>'
       + '<div style="display:flex;gap:4px;margin-bottom:8px">'
       + ['FP','FC',''].map(function(opt){
           var on = (k === opt);
           var lbl = opt || '비움';
           var col = opt === 'FC' ? '#dc2626' : (opt === 'FP' ? '#1d4ed8' : 'var(--g5)');
           return '<button onclick="srSetKind(\'' + r.tank + '\',\'' + opt + '\')"'
                + ' style="flex:1;height:30px;font-size:12px;font-weight:600;cursor:pointer;border-radius:6px;'
                + (on ? 'background:' + col + ';color:#fff;border:1.5px solid ' + col
                      : 'background:#fff;color:' + col + ';border:1px solid var(--g3)') + '">' + lbl + '</button>';
         }).join('')
       + '</div>'
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
  _srEditing = true; _srVals = {}; _srKinds = {};
  _srRows().forEach(function(r){
    _srVals[r.tank] = Math.max(0, Math.round(r.qty));   // 음수는 0부터 시작
    _srKinds[r.tank] = r.kind;
  });
  _srPaint();
}
function srCancelCount(){ _srEditing = false; _srVals = {}; _srKinds = {}; _srPaint(); }
function srSetVal(tank, v){ _srVals[tank] = (v === '' ? '' : parseFloat(v)); }
function srSetKind(tank, k){ _srKinds[tank] = k; _srPaint(); }

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
  var kinds = {};
  SR_TANKS.forEach(function(t){
    var k = _srKinds[t];
    kinds[t] = (k === 'FP' || k === 'FC') ? k : '';
  });
  try{
    await firebase.firestore().doc('_config/sauce_tank_baseline').set({
      date: today, tanks: tanks, kinds: kinds, updatedAt: new Date().toISOString()
    });
    _srEditing = false; _srVals = {}; _srKinds = {};
    if(typeof toast==='function') toast('탱크 잔량 실사 완료','s');
    renderSauceRoom();
  }catch(e){
    if(typeof toast==='function') toast('저장에 실패했습니다','w');
  }
}


// ── 소스 제조 이력 ────────────────────────────────────
// 탱크에 언제 무엇을 얼마나 쳤는지 되짚어 볼 수 있게 한다.
// 잔량 카드는 합계만 보여 주므로 개별 기록은 여기서 본다.
var _srLogFrom = '';
var _srLogTo   = '';
var _srLog     = null;   // [{date,name,kg,tank,note,at}]

function _srLogInit(){
  if(_srLogFrom && _srLogTo) return;
  var t = srTod();
  _srLogTo = t;
  _srLogFrom = _srAddDay(t, -6);
}

async function _srLogLoad(){
  _srLogInit();
  try{
    var rows = await fbGetRange('sauce', _srLogFrom, _srLogTo);
    _srLog = (rows||[]).slice().sort(function(a,b){
      var x = String(a.date||'') + String(a._createdAt||'');
      var y = String(b.date||'') + String(b._createdAt||'');
      return x < y ? 1 : -1;      // 최근 것이 위로
    });
  }catch(e){
    _srLog = [];
  }
}

function _srLogHtml(){
  if(_srLog === null) return '<div style="font-size:12px;color:var(--g5)">불러오는 중…</div>';
  if(!_srLog.length){
    return '<div style="font-size:12px;color:var(--g5);padding:14px 0;text-align:center">'
         + _srLogFrom + ' ~ ' + _srLogTo + ' 기간에 제조 기록이 없습니다.</div>';
  }
  var totFC = 0, totFP = 0;
  _srLog.forEach(function(r){
    var kg = parseFloat(r.kg)||0;
    if(String(r.name||'').indexOf('FC') >= 0) totFC += kg; else totFP += kg;
  });

  var h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    + '<div style="background:var(--g1);border-radius:8px;padding:8px 12px">'
      + '<span style="font-size:11px;color:var(--g5)">기간 제조</span> '
      + '<strong style="font-size:15px">' + Math.round(totFC+totFP).toLocaleString() + '</strong>'
      + '<span style="font-size:11px;color:var(--g5)"> kg · ' + _srLog.length + '회</span></div>'
    + '<div style="background:var(--g1);border-radius:8px;padding:8px 12px">'
      + '<span style="font-size:11px;color:#1d4ed8;font-weight:600">FP</span> '
      + '<strong style="font-size:15px">' + Math.round(totFP).toLocaleString() + '</strong>'
      + '<span style="font-size:11px;color:var(--g5)"> kg</span></div>'
    + '<div style="background:var(--g1);border-radius:8px;padding:8px 12px">'
      + '<span style="font-size:11px;color:#dc2626;font-weight:600">FC</span> '
      + '<strong style="font-size:15px">' + Math.round(totFC).toLocaleString() + '</strong>'
      + '<span style="font-size:11px;color:var(--g5)"> kg</span></div>'
    + '</div>';

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="background:var(--g1)">'
    + '<th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--g6)">제조일</th>'
    + '<th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--g6)">소스</th>'
    + '<th style="padding:7px 10px;text-align:right;font-size:11px;color:var(--g6);width:90px">제조량</th>'
    + '<th style="padding:7px 10px;text-align:center;font-size:11px;color:var(--g6);width:90px">탱크</th>'
    + '<th style="padding:7px 10px;text-align:center;font-size:11px;color:var(--g6);width:70px">입력시각</th>'
    + '<th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--g6)">특이사항</th>'
    + '</tr></thead><tbody>';

  var dow = ['일','월','화','수','목','금','토'];
  var lastDate = '';
  _srLog.forEach(function(r){
    var ds = String(r.date||'').slice(0,10);
    var isFC = String(r.name||'').indexOf('FC') >= 0;
    var at = String(r._createdAt||'');
    var hhmm = '';
    if(at){
      var d = new Date(at);
      if(!isNaN(d)) hhmm = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }
    var dLbl = '';
    if(ds !== lastDate){
      var dt = new Date(ds + 'T00:00:00');
      dLbl = ds.slice(5).replace('-','/') + (isNaN(dt) ? '' : '(' + dow[dt.getDay()] + ')');
      lastDate = ds;
    }
    h += '<tr style="border-bottom:0.5px solid var(--g2)">'
      + '<td style="padding:7px 10px;color:var(--g6)">' + dLbl + '</td>'
      + '<td style="padding:7px 10px"><span style="font-size:11px;font-weight:600;color:' + (isFC?'#dc2626':'#1d4ed8') + '">'
        + (isFC?'FC':'FP') + '</span> <span style="color:var(--g6)">' + (r.name||'') + '</span></td>'
      + '<td style="padding:7px 10px;text-align:right;font-weight:600">' + Math.round(parseFloat(r.kg)||0).toLocaleString()
        + '<span style="font-size:11px;font-weight:400;color:var(--g5)"> kg</span></td>'
      + '<td style="padding:7px 10px;text-align:center">' + (r.tank||'-') + '</td>'
      + '<td style="padding:7px 10px;text-align:center;font-size:11px;color:var(--g5)">' + hhmm + '</td>'
      + '<td style="padding:7px 10px;font-size:11px;color:var(--g5)">' + (r.note||'') + '</td>'
      + '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

function srLogSet(which, v){
  if(!v) return;
  if(which === 'from') _srLogFrom = v; else _srLogTo = v;
  if(_srLogFrom > _srLogTo){
    if(typeof toast === 'function') toast('시작일이 종료일보다 늦습니다','w');
    return;
  }
  _srLog = null;
  var b = document.getElementById('srLogBody');
  if(b) b.innerHTML = _srLogHtml();
  _srLogLoad().then(function(){
    var b2 = document.getElementById('srLogBody');
    if(b2) b2.innerHTML = _srLogHtml();
  });
}

function srLogQuick(days){
  var t = srTod();
  _srLogTo = t;
  _srLogFrom = _srAddDay(t, -(days-1));
  srLogSet('to', _srLogTo);
}

function srLogExcel(){
  if(typeof XLSX === 'undefined'){
    if(typeof toast === 'function') toast('엑셀 모듈을 불러오지 못했습니다','w');
    return;
  }
  if(!_srLog || !_srLog.length){
    if(typeof toast === 'function') toast('내보낼 기록이 없습니다','w');
    return;
  }
  var aoa = [['소스 제조 이력'], [_srLogFrom + ' ~ ' + _srLogTo], [],
             ['제조일','구분','소스명','제조량(kg)','탱크','입력시각','특이사항']];
  var totFC = 0, totFP = 0;
  _srLog.slice().reverse().forEach(function(r){
    var kg = parseFloat(r.kg)||0;
    var isFC = String(r.name||'').indexOf('FC') >= 0;
    if(isFC) totFC += kg; else totFP += kg;
    var at = String(r._createdAt||''), hhmm = '';
    if(at){
      var d = new Date(at);
      if(!isNaN(d)) hhmm = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }
    aoa.push([String(r.date||'').slice(0,10), isFC?'FC':'FP', r.name||'', kg, r.tank||'', hhmm, r.note||'']);
  });
  aoa.push([]);
  aoa.push(['합계','','', totFC+totFP, '', '', 'FP '+totFP+' / FC '+totFC]);

  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:12},{wch:6},{wch:20},{wch:12},{wch:10},{wch:10},{wch:20}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '소스제조이력');
  XLSX.writeFile(wb, '소스제조이력_' + _srLogFrom + '~' + _srLogTo + '.xlsx');
}
