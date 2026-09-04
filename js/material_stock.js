// 자재재고: 기준 실사재고 − 생산 실적 차감 = 현재고 (원육·부자재·파우치·포장재)
// 데이터: _config/stock_baseline(기준일·실사값), _config/item_master(품목), thawing/packing/outerpacking(사용)

var _msBase = null;      // {date, items:{code:qty}, boxes:{part:qty}}
var _msMaster = null;    // {code:{name,unit,category}}
var _msSauce = null;     // {소스코드:{원료코드:kg당비율}}
var _msUse = null;       // {code:qty}
var _msBoxUse = null;    // {part:qty}
var _msIn = null;        // {code:qty} 입고
var _msBoxIn = null;     // {part:qty} 입고 박스
var _msTo = '';          // 조회 종료일
var _msCat = '전체';
var _msView = 'status';  // 'status'(현황) | 'take'(재고조사)
var _msTakeDate = '';    // 재고조사 기준일
var _msTakeVals = {};    // {code: 실사값} — 입력 중 값
var _msDraftTimer = null;

// 소스 코드 — FC 제품은 FC소스, 나머지는 FP소스
var MS_SAUCE_FC = '200009';
var MS_SAUCE_FP = '200011';
var MS_WATER = '199999';   // 정제수 — 재고 관리 대상 아님

// 부위 → 냉동 원육 코드
var MS_PART = { '홍두깨':'100000', '홍두께':'100000', '설도':'100001', '우둔':'100025' };
// 원육 코드 → 박스 집계 키 (baseline.boxes 및 _msBoxUse의 키)
var MS_CODE2PART = { '100000':'홍두께', '100001':'설도', '100025':'우둔' };
// 제품 → 파우치 코드
var MS_POUCH = {
  '코스트코 장조림 170g':'400005',
  '시그니처 장조림 130g':'400007',
  '시그니처 장조림 130g 마트용':'400007',
  '미니쇠고기장조림 70g 5입':'400000',
  '미니쇠고기장조림 70g 낱개':'400000',
  '미니쇠고기 장조림 70g 리뉴얼':'400008',
  '미니쇠고기 장조림 70g 맥스용':'400008',
  '트레이더스 장조림 460g':'400006',
  'FC 장조림 3KG':'500006',
  '메추리알 장조림 180g':'500012',
  '쇠고기 장조림 120g':'400002'
};
var MS_CATS = ['전체','원육','원료부자재','파우치','포장재'];

function msTod(){ return (typeof tod === 'function') ? tod() : new Date().toISOString().slice(0,10); }

async function _msLoadMaster(){
  if(_msBase && _msMaster && _msSauce) return;
  var db = firebase.firestore();
  var b = await db.doc('_config/stock_baseline').get();
  var m = await db.doc('_config/item_master').get();
  var s = await db.doc('_config/sauce_recipe').get();
  _msBase = b.exists ? b.data() : null;
  _msMaster = (m.exists && m.data() && m.data().items) ? m.data().items : {};
  _msSauce = (s.exists && s.data() && s.data().recipes) ? s.data().recipes : {};
}

// 기준일 다음날 ~ to 까지의 실적을 모아 자재 사용량 집계
async function _msCollectUse(from, to){
  var use = {}, boxUse = {};
  var add = function(o,k,v){ if(!k) return; o[k] = (o[k]||0) + v; };
  var name2code = {};
  Object.keys(_msMaster).forEach(function(c){ name2code[_msMaster[c].name] = c; });

  var R = await Promise.all([
    fbGetRange('thawing', from, to).catch(function(){return [];}),
    fbGetRange('packing', from, to).catch(function(){return [];}),
    fbGetRange('outerpacking', from, to).catch(function(){return [];})
  ]);
  var th = R[0]||[], pk = R[1]||[], op = R[2]||[];

  // 해동 → 냉동 원육 차감 (부위별 kg, 박스는 importCodes 길이)
  th.forEach(function(r){
    if(r.test) return;
    var t = String(r.type||'').trim();
    var code = MS_PART[t];
    add(use, code, parseFloat(r.totalKg)||0);
    var nb = Array.isArray(r.importCodes) ? r.importCodes.length : 0;
    var pk2 = (t==='홍두깨'||t==='홍두께') ? '홍두께' : t;
    if(pk2 && nb) add(boxUse, pk2, nb);
  });

  // 내포장 → 파우치(실측 pouch), 부재료(subKg), 소스(sauceKg → 배합비로 원료 환산)
  pk.forEach(function(r){
    var pc = MS_POUCH[r.product];
    var pouch = parseFloat(r.pouch)||0;
    if(pc && pouch) add(use, pc, pouch);
    var sub = parseFloat(r.subKg)||0;
    if(sub) add(use, '100015', sub);
    var sauce = parseFloat(r.sauceKg)||0;
    if(sauce){
      var sc = (String(r.product||'').indexOf('FC') >= 0) ? MS_SAUCE_FC : MS_SAUCE_FP;
      var mix = _msSauce[sc];
      if(mix){
        Object.keys(mix).forEach(function(code){
          if(code === MS_WATER) return;           // 정제수는 재고 품목 아님
          add(use, code, sauce * (parseFloat(mix[code])||0));
        });
      }
    }
  });

  // 외포장 → 포장재(실측 actual)
  op.forEach(function(r){
    if(r.testRun) return;
    (r.materials||[]).forEach(function(m){
      if(!m || m.actual === null || m.actual === undefined || m.actual === '') return;
      var v = parseFloat(m.actual)||0;
      if(!v) return;
      var code = name2code[m.name];
      if(code) add(use, code, v);
    });
  });
  return { use: use, boxUse: boxUse };
}

// 기준일 다음날 ~ to 까지의 입고 (원육=바코드 스캔 자동, 그 외=materialIn 수기)
async function _msCollectIn(from, to){
  var inQty = {}, inBox = {};
  var add = function(o,k,v){ if(!k) return; o[k] = (o[k]||0) + v; };
  var R = await Promise.all([
    fbGetRange('barcode', from, to).catch(function(){return [];}),
    fbGetRange('materialIn', from, to).catch(function(){return [];})
  ]);
  (R[0]||[]).forEach(function(r){
    var code = MS_PART[String(r.part||'').trim()];
    if(!code) return;
    add(inQty, code, parseFloat(r.weightKg)||0);
    var pk = MS_CODE2PART[code];
    if(pk) add(inBox, pk, 1);
  });
  (R[1]||[]).forEach(function(r){
    if(!r.code) return;
    add(inQty, String(r.code), parseFloat(r.qty)||0);
    if(r.boxes){
      var pk2 = MS_CODE2PART[String(r.code)];
      if(pk2) add(inBox, pk2, parseFloat(r.boxes)||0);
    }
  });
  return { inQty: inQty, inBox: inBox };
}

async function renderMaterialStock(){
  var el = document.getElementById('p-mstock');
  if(!el) return;
  el.innerHTML = '<div class="card" style="padding:20px;color:var(--g5)">재고 불러오는 중…</div>';
  try{
    await _msLoadMaster();
  }catch(e){
    el.innerHTML = '<div class="card" style="padding:20px;color:#dc2626">재고 기준값을 불러오지 못했습니다.</div>';
    return;
  }
  if(!_msBase || !_msBase.items){
    el.innerHTML = '<div class="card" style="padding:20px;color:#dc2626">기준 실사재고(_config/stock_baseline)가 없습니다.</div>';
    return;
  }
  if(!_msTo) _msTo = msTod();
  var from = _msAddDay(_msBase.date, 1);
  var got = await _msCollectUse(from, _msTo);
  _msUse = got.use; _msBoxUse = got.boxUse;
  var gotIn = await _msCollectIn(from, _msTo);
  _msIn = gotIn.inQty; _msBoxIn = gotIn.inBox;
  _msPaint();
}

function _msAddDay(d, n){
  var t = new Date(d + 'T00:00:00');
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0,10);
}

function _msPaint(){
  if(_msView === 'take') return _msPaintTake();
  if(_msView === 'in') return _msPaintIn();
  var el = document.getElementById('p-mstock');
  if(!el) return;
  var base = _msBase.items || {}, use = _msUse || {};
  var rows = [];
  Object.keys(base).forEach(function(code){
    var m = _msMaster[code] || {};
    var cat = m.category || '기타';
    if(_msCat !== '전체' && cat !== _msCat) return;
    var b = parseFloat(base[code])||0;
    var u = parseFloat(use[code])||0;
    var i = parseFloat((_msIn||{})[code])||0;
    var part = MS_CODE2PART[code];
    var bxB = null, bxU = null, bxI = null;
    if(part){
      var bxAll = _msBase.boxes || {};
      bxB = parseFloat(bxAll[part]);
      if(isNaN(bxB)) bxB = null;
      bxU = parseFloat((_msBoxUse||{})[part]) || 0;
      bxI = parseFloat((_msBoxIn||{})[part]) || 0;
    }
    rows.push({ code:code, name:m.name||code, unit:m.unit||'', cat:cat, base:b, use:u, inq:i, cur:b+i-u,
                part:part, bxBase:bxB, bxUse:bxU, bxIn:bxI });
  });
  rows.sort(function(a,b){
    if(a.cat !== b.cat) return MS_CATS.indexOf(a.cat) - MS_CATS.indexOf(b.cat);
    return b.use - a.use;
  });

  var days = Math.max(1, Math.round((new Date(_msTo) - new Date(_msBase.date)) / 86400000));
  var usedCnt = rows.filter(function(r){ return r.use > 0; }).length;

  var h = '';
  h += '<div class="card" style="padding:14px 16px;margin-bottom:10px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">';
  h += '<div><div style="font-size:16px;font-weight:600">자재 재고</div>'
     + '<div style="font-size:12px;color:var(--g5);margin-top:3px">기준 ' + _msBase.date + ' 실사 · 이후 생산 실적으로 차감</div></div>';
  h += '<div style="display:flex;align-items:center;gap:8px">'
     + '<span style="font-size:12px;color:var(--g5)">기준일 다음날 ~</span>'
     + '<input type="date" id="msTo" class="fc" value="' + _msTo + '" onchange="msSetTo(this.value)" style="padding:6px 8px">'
     + '<button class="btn bo bsm" onclick="msGoIn()" style="padding:6px 12px">입고 등록</button>'
     + '<button class="btn bo bsm" onclick="msGoTake()" style="padding:6px 12px">재고조사</button>'
     + '</div></div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">';
  MS_CATS.forEach(function(c){
    var on = (c === _msCat);
    h += '<button class="btn bsm" onclick="msSetCat(\'' + c + '\')" style="padding:5px 12px;'
       + (on ? 'background:#1d4ed8;color:#fff;border-color:#1d4ed8' : '') + '">' + c + '</button>';
  });
  h += '</div></div>';

  // 원육 박스
  if(_msCat === '전체' || _msCat === '원육'){
    var bx = _msBase.boxes || {};
    var bkeys = Object.keys(bx);
    if(bkeys.length){
      h += '<div class="card" style="padding:14px 16px;margin-bottom:10px">';
      h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px">원육 박스</div>';
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
      bkeys.forEach(function(p){
        var b = parseFloat(bx[p])||0, u = parseFloat((_msBoxUse||{})[p])||0, i = parseFloat((_msBoxIn||{})[p])||0;
        h += '<div style="flex:1;min-width:150px;background:var(--g1);border-radius:8px;padding:10px 12px">'
           + '<div style="font-size:12px;color:var(--g5)">' + p + '</div>'
           + '<div style="font-size:20px;font-weight:600;margin-top:2px">' + (b+i-u).toLocaleString() + '<span style="font-size:12px;font-weight:400;color:var(--g5)"> 박스</span></div>'
           + '<div style="font-size:11px;color:var(--g5);margin-top:2px">' + b.toLocaleString() + ' + ' + i.toLocaleString() + ' − ' + u.toLocaleString() + '</div>'
           + '</div>';
      });
      h += '</div></div>';
    }
  }

  h += '<div class="card" style="padding:0;overflow-x:auto">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  h += '<thead><tr style="background:var(--g1)">'
     + '<th style="padding:9px 10px;text-align:left;font-size:12px;color:var(--g6)">품목</th>'
     + '<th style="padding:9px 10px;text-align:center;font-size:12px;color:var(--g6);width:80px">분류</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:110px">' + _msBase.date + '</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:105px">입고</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:110px">사용</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:120px">현재고</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:100px">일평균</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:90px">소진예상</th>'
     + '</tr></thead><tbody>';

  var lastCat = '';
  rows.forEach(function(r){
    var per = r.use > 0 ? r.use / days : 0;
    var left = per > 0 ? Math.floor(r.cur / per) : null;
    var curColor = r.cur < 0 ? '#dc2626' : (left !== null && left < 14 ? '#dc2626' : 'inherit');
    if(r.cat !== lastCat){
      h += '<tr><td colspan="8" style="padding:7px 10px;background:var(--g1);font-size:11px;font-weight:600;color:var(--g6)">' + r.cat + '</td></tr>';
      lastCat = r.cat;
    }
    h += '<tr style="border-bottom:0.5px solid var(--g2)">';
    h += '<td style="padding:8px 10px">' + r.name + '<span style="font-size:11px;color:var(--g4);margin-left:6px">' + r.code + '</span></td>';
    h += '<td style="padding:8px 10px;text-align:center;font-size:11px;color:var(--g5)">' + r.cat + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;color:var(--g5)">' + _msN(r.base) + _msBox(r.bxBase) + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;' + (r.inq > 0 ? 'color:#1d4ed8' : 'color:var(--g4)') + '">'
       + (r.inq > 0 ? '+' + _msN(r.inq) : '−') + (r.part && r.bxIn > 0 ? _msBox(r.bxIn, '+') : '') + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;' + (r.use > 0 ? 'color:#dc2626' : 'color:var(--g4)') + '">'
       + (r.use > 0 ? '−' + _msN(r.use) : '−') + (r.bxUse > 0 ? _msBox(r.bxUse, '−') : (r.part ? _msBox(0) : '')) + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;font-weight:600;color:' + curColor + '">' + _msN(r.cur)
       + '<span style="font-size:11px;font-weight:400;color:var(--g5)"> ' + r.unit + '</span>'
       + (r.bxBase !== null && r.bxBase !== undefined ? _msBox(r.bxBase + r.bxIn - r.bxUse) : '') + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;font-size:12px;color:var(--g5)">' + (per > 0 ? _msN(per) : '−') + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;font-size:12px;color:' + (left !== null && left < 14 ? '#dc2626' : 'var(--g5)') + '">' + (left !== null ? left + '일' : '−') + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';

  h += '<div style="font-size:11px;color:var(--g5);padding:10px 4px;line-height:1.7">'
     + '집계 기간 ' + _msAddDay(_msBase.date,1) + ' ~ ' + _msTo + ' (' + days + '일) · 사용 품목 ' + usedCnt + '건<br>'
     + '현재고 = 기준 실사 + 입고 − 사용. 입고는 원육=바코드 스캔 중량, 그 외=입고 등록분.<br>'
     + '차감 근거는 현장 실측 기록입니다. 원육=해동 투입중량, 파우치=내포장 pouch, 포장재=외포장 실사용수량.<br>'
     + '조미료는 내포장 sauceKg에 소스 배합비(FC/FP)를 적용해 환산했습니다. 정제수는 재고 대상이 아니라 제외했습니다.'
     + '</div>';
  el.innerHTML = h;
}

/* ===== 자재 입고 등록 ===== */
var _msInList = [];

function msGoIn(){
  _msView = 'in';
  _msLoadInList().then(function(){ _msPaintIn(); });
}
async function _msLoadInList(){
  var from = _msAddDay(_msBase.date, 1);
  _msInList = await fbGetRange('materialIn', from, _msTo || msTod()).catch(function(){ return []; });
  _msInList.sort(function(a,b){ return String(b.date) < String(a.date) ? -1 : 1; });
}

function _msPaintIn(){
  var el = document.getElementById('p-mstock');
  if(!el) return;
  var opts = '';
  var byCat = {};
  Object.keys(_msBase.items||{}).forEach(function(code){
    var m = _msMaster[code] || {};
    var cat = m.category || '기타';
    if(!byCat[cat]) byCat[cat] = [];
    byCat[cat].push({ code:code, name:m.name||code, unit:m.unit||'' });
  });
  MS_CATS.slice(1).concat(['기타']).forEach(function(cat){
    if(!byCat[cat]) return;
    opts += '<optgroup label="' + cat + '">';
    byCat[cat].forEach(function(x){
      opts += '<option value="' + x.code + '">' + x.name + ' (' + x.unit + ')</option>';
    });
    opts += '</optgroup>';
  });

  var h = '';
  h += '<div class="card" style="padding:14px 16px;margin-bottom:10px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">';
  h += '<div><div style="font-size:16px;font-weight:600">자재 입고 등록</div>'
     + '<div style="font-size:12px;color:var(--g5);margin-top:3px">원육은 바코드 스캔으로 자동 반영됩니다. 여기서는 부자재·파우치·포장재를 등록하세요.</div></div>';
  h += '<button class="btn bo bsm" onclick="msGoStatus()" style="padding:6px 12px">현황으로</button>';
  h += '</div>';

  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:14px">';
  h += '<div><div style="font-size:12px;color:var(--g5);margin-bottom:4px">입고일</div>'
     + '<input type="date" id="msInDate" class="fc" value="' + msTod() + '" style="padding:7px 8px"></div>';
  h += '<div style="flex:1;min-width:220px"><div style="font-size:12px;color:var(--g5);margin-bottom:4px">품목</div>'
     + '<select id="msInCode" class="fc" style="width:100%;padding:7px 8px">' + opts + '</select></div>';
  h += '<div><div style="font-size:12px;color:var(--g5);margin-bottom:4px">수량</div>'
     + '<input type="number" step="any" id="msInQty" class="fc" placeholder="0" style="width:110px;padding:7px 8px;text-align:right"></div>';
  h += '<div style="flex:1;min-width:140px"><div style="font-size:12px;color:var(--g5);margin-bottom:4px">비고</div>'
     + '<input type="text" id="msInNote" class="fc" placeholder="거래처·로트 등" style="width:100%;padding:7px 8px"></div>';
  h += '<button class="btn bp" onclick="msSaveIn()" style="padding:8px 18px">등록</button>';
  h += '</div></div>';

  h += '<div class="card" style="padding:0;overflow-x:auto">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  h += '<thead><tr style="background:var(--g1)">'
     + '<th style="padding:9px 10px;text-align:center;font-size:12px;color:var(--g6);width:100px">입고일</th>'
     + '<th style="padding:9px 10px;text-align:left;font-size:12px;color:var(--g6)">품목</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:110px">수량</th>'
     + '<th style="padding:9px 10px;text-align:left;font-size:12px;color:var(--g6);width:160px">비고</th>'
     + '<th style="padding:9px 10px;text-align:center;font-size:12px;color:var(--g6);width:60px"></th>'
     + '</tr></thead><tbody>';
  if(!_msInList.length){
    h += '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--g5)">' + _msAddDay(_msBase.date,1) + ' 이후 등록된 자재 입고가 없습니다.</td></tr>';
  }
  _msInList.forEach(function(r){
    var m = _msMaster[r.code] || {};
    h += '<tr style="border-bottom:0.5px solid var(--g2)">';
    h += '<td style="padding:8px 10px;text-align:center;color:var(--g5)">' + (r.date||'') + '</td>';
    h += '<td style="padding:8px 10px">' + (m.name||r.code) + '<span style="font-size:11px;color:var(--g4);margin-left:6px">' + r.code + '</span></td>';
    h += '<td style="padding:8px 10px;text-align:right;font-weight:600;color:#1d4ed8">+' + _msN(r.qty)
       + '<span style="font-size:11px;font-weight:400;color:var(--g5)"> ' + (m.unit||'') + '</span></td>';
    h += '<td style="padding:8px 10px;font-size:12px;color:var(--g5)">' + (r.note||'') + '</td>';
    h += '<td style="padding:8px 10px;text-align:center">'
       + '<button class="btn bo bsm" style="padding:3px 9px;color:#dc2626" onclick="msDelIn(\'' + r.id + '\')">삭제</button></td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div style="font-size:11px;color:var(--g5);padding:10px 4px;line-height:1.7">'
     + '원육(홍두깨·설도·우둔)은 바코드 스캔 중량이 그대로 입고로 잡히므로 여기서 다시 넣지 마세요. 이중 반영됩니다.'
     + '</div>';
  el.innerHTML = h;
}

async function msSaveIn(){
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var date = g('msInDate'), code = g('msInCode'), qty = parseFloat(g('msInQty')), note = g('msInNote');
  if(!date){ if(typeof toast==='function') toast('입고일을 선택하세요','w'); return; }
  if(!code){ if(typeof toast==='function') toast('품목을 선택하세요','w'); return; }
  if(isNaN(qty) || qty === 0){ if(typeof toast==='function') toast('수량을 입력하세요','w'); return; }
  if(MS_CODE2PART[code]){
    if(!confirm('원육은 바코드 스캔으로 이미 입고가 잡힙니다.\n그래도 등록하면 이중 반영됩니다.\n\n계속할까요?')) return;
  }
  var id = 'mi_' + date.replace(/-/g,'') + '_' + Date.now();
  try{
    await firebase.firestore().collection('materialIn').doc(id).set({
      id: id, date: date, code: code, qty: qty, note: note || '',
      _createdAt: new Date().toISOString()
    });
    var qEl = document.getElementById('msInQty'); if(qEl) qEl.value = '';
    var nEl = document.getElementById('msInNote'); if(nEl) nEl.value = '';
    if(typeof fbClearCache === 'function') fbClearCache('materialIn');
    if(typeof toast==='function') toast('입고 등록 완료','s');
    await _msLoadInList(); _msPaintIn();
  }catch(e){
    if(typeof toast==='function') toast('등록에 실패했습니다','w');
  }
}
async function msDelIn(id){
  if(!confirm('이 입고 기록을 삭제할까요?')) return;
  try{
    await firebase.firestore().collection('materialIn').doc(id).delete();
    if(typeof fbClearCache === 'function') fbClearCache('materialIn');
    if(typeof toast==='function') toast('삭제됨','s');
    await _msLoadInList(); _msPaintIn();
  }catch(e){
    if(typeof toast==='function') toast('삭제에 실패했습니다','w');
  }
}

/* ===== 재고조사 ===== */
function msGoTake(){
  _msView = 'take';
  if(!_msTakeDate) _msTakeDate = _msTo || msTod();
  _msLoadDraft().then(function(){ _msPaint(); });
}
function msGoStatus(){ _msView = 'status'; _msPaint(); }

// 입력 중인 실사값은 Firestore 임시저장 — 다른 기기에서 이어서 작업 가능
async function _msLoadDraft(){
  try{
    var d = await firebase.firestore().doc('_config/stocktake_draft').get();
    if(d.exists && d.data()){
      var v = d.data();
      if(v.date === _msTakeDate && v.vals) _msTakeVals = v.vals;
    }
  }catch(e){}
}
function _msSaveDraft(){
  if(_msDraftTimer) clearTimeout(_msDraftTimer);
  _msDraftTimer = setTimeout(function(){
    firebase.firestore().doc('_config/stocktake_draft').set({
      date: _msTakeDate, vals: _msTakeVals, updatedAt: new Date().toISOString()
    }).catch(function(){});
  }, 1500);
}

// 전산재고 = 기준 실사 + 입고 − 사용
function _msSysQty(code){
  var b = parseFloat((_msBase.items||{})[code])||0;
  var i = parseFloat((_msIn||{})[code])||0;
  var u = parseFloat((_msUse||{})[code])||0;
  return b + i - u;
}
function _msTakeRows(){
  var rows = [];
  Object.keys(_msBase.items||{}).forEach(function(code){
    var m = _msMaster[code] || {};
    var cat = m.category || '기타';
    if(_msCat !== '전체' && cat !== _msCat) return;
    var sys = _msSysQty(code);
    var act = _msTakeVals[code];
    var has = (act !== undefined && act !== null && act !== '');
    var diff = has ? (parseFloat(act) - sys) : null;
    var rate = (has && sys !== 0) ? Math.abs(diff / sys * 100) : null;
    rows.push({ code:code, name:m.name||code, unit:m.unit||'', cat:cat,
                sys:sys, act:has?parseFloat(act):null, diff:diff, rate:rate });
  });
  rows.sort(function(a,b){
    if(a.cat !== b.cat) return MS_CATS.indexOf(a.cat) - MS_CATS.indexOf(b.cat);
    return a.code < b.code ? -1 : 1;
  });
  return rows;
}

// 일치 판정 — 소수 반올림 수준(0.05 또는 0.01%)의 차이는 같은 것으로 본다
function _msSame(r){
  if(r.diff === null) return false;
  if(Math.abs(r.diff) < 0.05) return true;
  return (r.sys !== 0 && Math.abs(r.diff / r.sys) < 0.0001);
}
function _msPaintTake(){
  var el = document.getElementById('p-mstock');
  if(!el) return;
  var rows = _msTakeRows();
  var done = rows.filter(function(r){ return r.act !== null; }).length;
  var gap  = rows.filter(function(r){ return r.diff !== null && !_msSame(r); }).length;
  var big  = rows.filter(function(r){ return r.rate !== null && r.rate > 5; }).length;
  var same = done - gap;

  var h = '';
  h += '<div class="card" style="padding:14px 16px;margin-bottom:10px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">';
  h += '<div><div style="font-size:16px;font-weight:600">재고조사</div>'
     + '<div style="font-size:12px;color:var(--g5);margin-top:3px">전산재고 = ' + _msBase.date + ' 실사 − 이후 생산 차감</div></div>';
  h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
     + '<span style="font-size:12px;color:var(--g5)">기준일</span>'
     + '<input type="date" class="fc" value="' + _msTakeDate + '" onchange="msSetTakeDate(this.value)" style="padding:6px 8px">'
     + '<button class="btn bo bsm" onclick="msDownloadForm()" style="padding:6px 12px">양식 받기</button>'
     + '<label class="btn bo bsm" style="padding:6px 12px;cursor:pointer;margin:0">업로드'
     + '<input type="file" accept=".xlsx,.xls" onchange="msUploadForm(this)" style="display:none"></label>'
     + '<button class="btn bp bsm" onclick="msConfirmTake()" style="padding:6px 14px">확정</button>'
     + '<button class="btn bo bsm" onclick="msGoStatus()" style="padding:6px 12px">현황으로</button>'
     + '</div></div>';

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-top:12px">';
  h += _msStat('입력 완료', done + '<span style="font-size:13px;color:var(--g4);font-weight:400"> / ' + rows.length + '</span>', '');
  h += _msStat('차이 발생', gap + '<span style="font-size:13px;color:var(--g4);font-weight:400"> 품목</span>', gap ? '#dc2626' : '');
  h += _msStat('5% 초과', big + '<span style="font-size:13px;color:var(--g4);font-weight:400"> 품목</span>', big ? '#dc2626' : '');
  h += _msStat('일치', same + '<span style="font-size:13px;color:var(--g4);font-weight:400"> 품목</span>', same ? '#1d4ed8' : '');
  h += '</div>';

  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">';
  MS_CATS.forEach(function(c){
    var on = (c === _msCat);
    h += '<button class="btn bsm" onclick="msSetCat(\'' + c + '\')" style="padding:5px 12px;'
       + (on ? 'background:#1d4ed8;color:#fff;border-color:#1d4ed8' : '') + '">' + c + '</button>';
  });
  h += '</div></div>';

  h += '<div class="card" style="padding:0;overflow-x:auto">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:640px">';
  h += '<thead><tr style="background:var(--g1)">'
     + '<th style="padding:9px 10px;text-align:left;font-size:12px;color:var(--g6)">품목</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:110px">전산재고</th>'
     + '<th style="padding:9px 10px;text-align:center;font-size:12px;color:var(--g6);width:120px">실사</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:100px">차이</th>'
     + '<th style="padding:9px 10px;text-align:right;font-size:12px;color:var(--g6);width:80px">차이율</th>'
     + '</tr></thead><tbody>';
  var lastCat = '';
  rows.forEach(function(r){
    if(r.cat !== lastCat){
      h += '<tr><td colspan="5" style="padding:7px 10px;background:var(--g1);font-size:11px;font-weight:600;color:var(--g6)">' + r.cat + '</td></tr>';
      lastCat = r.cat;
    }
    var over = (r.rate !== null && r.rate > 5);
    var dc = (r.diff === null) ? 'var(--g4)' : (_msSame(r) ? '#1d4ed8' : '#dc2626');
    h += '<tr style="border-bottom:0.5px solid var(--g2);' + (over ? 'background:#fef2f2' : '') + '">';
    h += '<td style="padding:8px 10px">' + r.name + '<span style="font-size:11px;color:var(--g4);margin-left:6px">' + r.code + '</span></td>';
    h += '<td style="padding:8px 10px;text-align:right;color:var(--g5)">' + _msN(r.sys) + '</td>';
    h += '<td style="padding:8px 10px;text-align:center">'
       + '<input type="number" step="any" value="' + (r.act !== null ? r.act : '') + '" placeholder="입력"'
       + ' oninput="msSetTakeVal(\'' + r.code + '\',this.value)"'
       + ' style="width:96px;height:30px;text-align:right;font-size:13px;padding:0 8px;border:0.5px solid var(--g3);border-radius:6px"></td>';
    h += '<td style="padding:8px 10px;text-align:right;color:' + dc + '">'
       + (r.diff === null ? '−' : (r.diff > 0 ? '+' : '') + _msN(r.diff)) + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;font-size:12px;color:' + (over ? '#dc2626' : 'var(--g5)') + '">'
       + (r.rate === null ? '−' : r.rate.toFixed(1) + '%') + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div style="font-size:11px;color:var(--g5);padding:10px 4px;line-height:1.7">'
     + '입력값은 자동 임시저장됩니다. 다른 기기에서 이어서 작업할 수 있습니다.<br>'
     + '확정하면 실사값이 새 기준재고가 되고, 이후 생산은 이 값에서 차감됩니다. 직전 기준은 stocktake 이력에 보관됩니다.'
     + '</div>';
  el.innerHTML = h;
}

function _msStat(label, val, color){
  return '<div style="background:var(--g1);border-radius:8px;padding:10px 12px">'
       + '<div style="font-size:12px;color:var(--g5)">' + label + '</div>'
       + '<div style="font-size:20px;font-weight:600;margin-top:2px;' + (color ? 'color:' + color : '') + '">' + val + '</div></div>';
}
function msSetTakeVal(code, v){
  if(v === '' || v === null) delete _msTakeVals[code];
  else _msTakeVals[code] = parseFloat(v);
  _msSaveDraft();
  _msRepaintDiff(code);
}
// 입력 중 전체 다시 그리면 포커스가 날아가므로 해당 행만 갱신
function _msRepaintDiff(code){
  var rows = _msTakeRows();
  var r = null;
  for(var i=0;i<rows.length;i++){ if(rows[i].code===code){ r=rows[i]; break; } }
  if(!r) return;
  var tds = document.querySelectorAll('#p-mstock tbody tr');
  for(var j=0;j<tds.length;j++){
    var inp = tds[j].querySelector('input');
    if(!inp || inp.getAttribute('oninput').indexOf("'"+code+"'") < 0) continue;
    var cells = tds[j].querySelectorAll('td');
    var over = (r.rate !== null && r.rate > 5);
    var dc = (r.diff === null) ? 'var(--g4)' : (_msSame(r) ? '#1d4ed8' : '#dc2626');
    cells[3].style.color = dc;
    cells[3].textContent = (r.diff === null ? '−' : (r.diff > 0 ? '+' : '') + _msN(r.diff));
    cells[4].style.color = over ? '#dc2626' : 'var(--g5)';
    cells[4].textContent = (r.rate === null ? '−' : r.rate.toFixed(1) + '%');
    tds[j].style.background = over ? '#fef2f2' : '';
    break;
  }
  _msUpdateStats();
}
function _msUpdateStats(){
  var rows = _msTakeRows();
  var done = rows.filter(function(r){ return r.act !== null; }).length;
  var gap  = rows.filter(function(r){ return r.diff !== null && !_msSame(r); }).length;
  var big  = rows.filter(function(r){ return r.rate !== null && r.rate > 5; }).length;
  var boxes = document.querySelectorAll('#p-mstock .card:first-child div[style*="grid-template-columns"] > div');
  if(boxes.length < 4) return;
  var set = function(i, v, color){
    var d = boxes[i].querySelectorAll('div')[1];
    if(d){ d.innerHTML = v; d.style.color = color || ''; }
  };
  set(0, done + '<span style="font-size:13px;color:var(--g4);font-weight:400"> / ' + rows.length + '</span>');
  set(1, gap + '<span style="font-size:13px;color:var(--g4);font-weight:400"> 품목</span>', gap ? '#dc2626' : '');
  set(2, big + '<span style="font-size:13px;color:var(--g4);font-weight:400"> 품목</span>', big ? '#dc2626' : '');
  set(3, (done-gap) + '<span style="font-size:13px;color:var(--g4);font-weight:400"> 품목</span>', (done-gap) ? '#1d4ed8' : '');
}
function msSetTakeDate(v){
  if(!v) return;
  _msTakeDate = v; _msTo = v; _msTakeVals = {};
  renderMaterialStock().then(function(){ _msLoadDraft().then(function(){ _msPaint(); }); });
}

/* 엑셀 양식 다운로드 */
function msDownloadForm(){
  if(typeof XLSX === 'undefined'){ if(typeof toast==='function') toast('엑셀 모듈을 불러오지 못했습니다','w'); return; }
  var rows = _msTakeRows();
  var aoa = [['품목코드','품목명','분류','단위','전산재고','실사']];
  rows.forEach(function(r){
    aoa.push([r.code, r.name, r.cat, r.unit, Math.round(r.sys*100)/100, (r.act!==null?r.act:'')]);
  });
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:10},{wch:34},{wch:11},{wch:6},{wch:12},{wch:12}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '재고조사');
  XLSX.writeFile(wb, '재고조사_' + _msTakeDate + '.xlsx');
}

/* 엑셀 업로드 — 품목코드 + 실사 열만 읽음 */
function msUploadForm(input){
  var file = input.files && input.files[0];
  if(!file) return;
  if(typeof XLSX === 'undefined'){ if(typeof toast==='function') toast('엑셀 모듈을 불러오지 못했습니다','w'); return; }
  var reader = new FileReader();
  reader.onload = function(e){
    try{
      var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      var ws = wb.Sheets[wb.SheetNames[0]];
      var aoa = XLSX.utils.sheet_to_json(ws, {header:1});
      var head = (aoa[0]||[]).map(function(x){ return String(x||'').trim(); });
      var ci = head.indexOf('품목코드'), vi = head.indexOf('실사');
      if(ci < 0 || vi < 0){
        if(typeof toast==='function') toast('양식이 다릅니다. 품목코드·실사 열이 필요합니다','w');
        input.value=''; return;
      }
      var n = 0, skip = 0;
      for(var i=1;i<aoa.length;i++){
        var row = aoa[i]; if(!row) continue;
        var code = String(row[ci]||'').trim();
        var v = row[vi];
        if(!code) continue;
        if(v === '' || v === null || v === undefined) continue;
        var num = parseFloat(String(v).replace(/,/g,''));
        if(isNaN(num)){ skip++; continue; }
        if(!(_msBase.items||{}).hasOwnProperty(code)){ skip++; continue; }
        _msTakeVals[code] = num; n++;
      }
      _msSaveDraft();
      _msPaint();
      if(typeof toast==='function') toast(n + '건 반영' + (skip ? ' · ' + skip + '건 건너뜀' : ''), 's');
    }catch(err){
      if(typeof toast==='function') toast('엑셀을 읽지 못했습니다','w');
    }
    input.value='';
  };
  reader.readAsArrayBuffer(file);
}

/* 확정 — 실사값을 새 기준재고로 */
async function msConfirmTake(){
  var rows = _msTakeRows();
  var filled = rows.filter(function(r){ return r.act !== null; });
  if(!filled.length){ if(typeof toast==='function') toast('입력된 실사값이 없습니다','w'); return; }
  var all = Object.keys(_msBase.items||{}).length;
  var msg = _msTakeDate + ' 기준으로 확정합니다.\n\n입력 ' + Object.keys(_msTakeVals).length + ' / ' + all + '건'
          + '\n입력하지 않은 품목은 전산재고 값을 그대로 씁니다.\n\n확정하면 이 값이 새 기준재고가 됩니다.';
  if(!confirm(msg)) return;
  var db = firebase.firestore();
  try{
    // 직전 기준 백업
    await db.collection('stocktake').doc('st_' + _msTakeDate).set({
      date: _msTakeDate,
      prevBase: _msBase,
      actual: _msTakeVals,
      confirmedAt: new Date().toISOString()
    });
    // 새 기준 = 실사값(없으면 전산재고)
    var items = {};
    Object.keys(_msBase.items||{}).forEach(function(code){
      var v = _msTakeVals[code];
      items[code] = (v !== undefined && v !== null && v !== '') ? parseFloat(v) : _msSysQty(code);
    });
    await db.doc('_config/stock_baseline').set({
      date: _msTakeDate,
      note: _msTakeDate + ' 재고조사 확정',
      items: items,
      boxes: _msBase.boxes || {},
      updatedAt: new Date().toISOString()
    });
    await db.doc('_config/stocktake_draft').set({ date:'', vals:{}, updatedAt:new Date().toISOString() });
    _msTakeVals = {}; _msBase = null; _msMaster = null; _msSauce = null;
    _msView = 'status'; _msTo = '';
    if(typeof toast==='function') toast('재고조사 확정 완료', 's');
    renderMaterialStock();
  }catch(e){
    if(typeof toast==='function') toast('확정에 실패했습니다', 'w');
  }
}

// 원육 행의 박스 수량 — kg 아래에 작게 병기
function _msBox(v, sign){
  if(v === null || v === undefined) return '';
  var n = Number(v);
  if(!isFinite(n)) return '';
  var txt = (n === 0 && sign) ? '0' : ((sign || '') + Math.round(n).toLocaleString());
  return '<br><span style="font-size:11px;font-weight:400;color:var(--g4)">' + txt + ' 박스</span>';
}
function _msN(v){
  if(v === null || v === undefined) return '−';
  var n = Number(v);
  if(!isFinite(n)) return '−';
  return (Math.abs(n % 1) > 0.001) ? n.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1}) : Math.round(n).toLocaleString();
}
function msSetCat(c){ _msCat = c; _msPaint(); }
function msSetTo(v){ if(!v) return; _msTo = v; renderMaterialStock(); }
