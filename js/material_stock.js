// 자재재고: 기준 실사재고 − 생산 실적 차감 = 현재고 (원육·부자재·파우치·포장재)
// 데이터: _config/stock_baseline(기준일·실사값), _config/item_master(품목), thawing/packing/outerpacking(사용)

var _msBase = null;      // {date, items:{code:qty}, boxes:{part:qty}}
var _msMaster = null;    // {code:{name,unit,category}}
var _msUse = null;       // {code:qty}
var _msBoxUse = null;    // {part:qty}
var _msTo = '';          // 조회 종료일
var _msCat = '전체';

// 부위 → 냉동 원육 코드
var MS_PART = { '홍두깨':'100000', '홍두께':'100000', '설도':'100001', '우둔':'100025' };
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
  if(_msBase && _msMaster) return;
  var db = firebase.firestore();
  var b = await db.doc('_config/stock_baseline').get();
  var m = await db.doc('_config/item_master').get();
  _msBase = b.exists ? b.data() : null;
  _msMaster = (m.exists && m.data() && m.data().items) ? m.data().items : {};
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

  // 내포장 → 파우치(실측 pouch), 부재료(subKg)
  pk.forEach(function(r){
    var pc = MS_POUCH[r.product];
    var pouch = parseFloat(r.pouch)||0;
    if(pc && pouch) add(use, pc, pouch);
    var sub = parseFloat(r.subKg)||0;
    if(sub) add(use, '100015', sub);
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
  _msPaint();
}

function _msAddDay(d, n){
  var t = new Date(d + 'T00:00:00');
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0,10);
}

function _msPaint(){
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
    rows.push({ code:code, name:m.name||code, unit:m.unit||'', cat:cat, base:b, use:u, cur:b-u });
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
        var b = parseFloat(bx[p])||0, u = parseFloat((_msBoxUse||{})[p])||0;
        h += '<div style="flex:1;min-width:150px;background:var(--g1);border-radius:8px;padding:10px 12px">'
           + '<div style="font-size:12px;color:var(--g5)">' + p + '</div>'
           + '<div style="font-size:20px;font-weight:600;margin-top:2px">' + (b-u).toLocaleString() + '<span style="font-size:12px;font-weight:400;color:var(--g5)"> 박스</span></div>'
           + '<div style="font-size:11px;color:var(--g5);margin-top:2px">' + b.toLocaleString() + ' − ' + u.toLocaleString() + '</div>'
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
      h += '<tr><td colspan="7" style="padding:7px 10px;background:var(--g1);font-size:11px;font-weight:600;color:var(--g6)">' + r.cat + '</td></tr>';
      lastCat = r.cat;
    }
    h += '<tr style="border-bottom:0.5px solid var(--g2)">';
    h += '<td style="padding:8px 10px">' + r.name + '<span style="font-size:11px;color:var(--g4);margin-left:6px">' + r.code + '</span></td>';
    h += '<td style="padding:8px 10px;text-align:center;font-size:11px;color:var(--g5)">' + r.cat + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;color:var(--g5)">' + _msN(r.base) + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;' + (r.use > 0 ? 'color:#dc2626' : 'color:var(--g4)') + '">' + (r.use > 0 ? '−' + _msN(r.use) : '−') + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;font-weight:600;color:' + curColor + '">' + _msN(r.cur) + '<span style="font-size:11px;font-weight:400;color:var(--g5)"> ' + r.unit + '</span></td>';
    h += '<td style="padding:8px 10px;text-align:right;font-size:12px;color:var(--g5)">' + (per > 0 ? _msN(per) : '−') + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;font-size:12px;color:' + (left !== null && left < 14 ? '#dc2626' : 'var(--g5)') + '">' + (left !== null ? left + '일' : '−') + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';

  h += '<div style="font-size:11px;color:var(--g5);padding:10px 4px;line-height:1.7">'
     + '집계 기간 ' + _msAddDay(_msBase.date,1) + ' ~ ' + _msTo + ' (' + days + '일) · 사용 품목 ' + usedCnt + '건<br>'
     + '차감 근거는 현장 실측 기록입니다. 원육=해동 투입중량, 파우치=내포장 pouch, 포장재=외포장 실사용수량.<br>'
     + '소스(sauceKg)는 배합비가 없어 조미료 원료로 아직 환산되지 않습니다.'
     + '</div>';
  el.innerHTML = h;
}

function _msN(v){
  if(v === null || v === undefined) return '−';
  var n = Number(v);
  if(!isFinite(n)) return '−';
  return (Math.abs(n % 1) > 0.001) ? n.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1}) : Math.round(n).toLocaleString();
}
function msSetCat(c){ _msCat = c; _msPaint(); }
function msSetTo(v){ if(!v) return; _msTo = v; renderMaterialStock(); }
