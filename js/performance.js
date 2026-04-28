// ============================================================
// 실적관리 (월별 생산일지)  js/performance.js  v1
// ─ 외포장 testRun 기준 자동 역추적으로 테스트 제외
// ─ 월 선택 + 엑셀 다운로드 + 자동 갱신
// ============================================================
(function(){
'use strict';

var _perfYm = '';
var _perfTimer = null;
var _perfBusy = false;

function _perfTodayYm(){ return tod().slice(0,7); }
function _perfMonths(){ return ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']; }
function _perfDateWith(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function _perfPrevD(d){var p=d.split('-').map(Number);var dt=new Date(p[0],p[1]-1,p[2]-1);return _perfDateWith(dt.getFullYear(),dt.getMonth()+1,dt.getDate());}
function _perfSplit(s){return String(s||'').split(',').map(function(x){return x.trim();}).filter(Boolean);}
function _perfR2(v){return Math.round((parseFloat(v)||0)*100)/100;}

// ── 모드 진입 ─────────────────────────────────────────────────
function setModePerf(){
  document.querySelectorAll('.mb').forEach(function(b){b.classList.remove('on');});
  var pb=document.getElementById('modeP'); if(pb) pb.classList.add('on');
  var inav=document.getElementById('inav'); if(inav) inav.classList.add('hid');
  var dnav=document.getElementById('dnav'); if(dnav) dnav.classList.add('hid');
  document.querySelectorAll('.pg').forEach(function(p){p.classList.remove('on');});
  var pg=document.getElementById('p-performance'); if(pg) pg.classList.add('on');
  var ms=document.getElementById('mscroll'); if(ms) ms.scrollTop=0;
  if(typeof MODE!=='undefined') MODE='p';
  if(!_perfYm) _perfYm=_perfTodayYm();
  _perfRenderShell();
  _perfReload(true);
  _perfStartAutoRefresh();
}
window.setModePerf = setModePerf;

// ── 외부에서 부를 수 있게 ─────────────────────────────────────
function _perfStartAutoRefresh(){
  if(_perfTimer) clearInterval(_perfTimer);
  // 30초마다 백그라운드 갱신 (현재 탭이 실적관리인 동안만)
  _perfTimer = setInterval(function(){
    var pg=document.getElementById('p-performance');
    if(pg && pg.classList.contains('on')) _perfReload(false);
    else { clearInterval(_perfTimer); _perfTimer=null; }
  }, 30000);
}

// ── 월 이동 ───────────────────────────────────────────────────
function perfPrevMonth(){var p=_perfYm.split('-').map(Number);var d=new Date(p[0],p[1]-2,1);_perfYm=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');_perfRenderShell();_perfReload(true);}
function perfNextMonth(){var p=_perfYm.split('-').map(Number);var d=new Date(p[0],p[1],1);_perfYm=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');_perfRenderShell();_perfReload(true);}
function perfThisMonth(){_perfYm=_perfTodayYm();_perfRenderShell();_perfReload(true);}
function perfPickMonth(v){if(!v)return;_perfYm=v;_perfRenderShell();_perfReload(true);}
window.perfPrevMonth=perfPrevMonth; window.perfNextMonth=perfNextMonth;
window.perfThisMonth=perfThisMonth; window.perfPickMonth=perfPickMonth;

// ── 셸 렌더 (헤더/툴바) ────────────────────────────────────────
function _perfRenderShell(){
  var pg=document.getElementById('p-performance'); if(!pg) return;
  var ym=_perfYm||_perfTodayYm();
  var y=ym.slice(0,4), mIdx=parseInt(ym.slice(5))-1;
  var lbl=y+'년 '+_perfMonths()[mIdx];
  pg.innerHTML =
    '<div class="card" style="margin-bottom:8px">'+
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+
        '<button class="btn" onclick="perfPrevMonth()" style="padding:4px 10px">◀</button>'+
        '<div style="font-weight:700;font-size:1.05rem;min-width:130px;text-align:center" id="perfMonthLbl">'+lbl+'</div>'+
        '<button class="btn" onclick="perfNextMonth()" style="padding:4px 10px">▶</button>'+
        '<input type="month" value="'+ym+'" onchange="perfPickMonth(this.value)" style="padding:4px 8px;border:var(--br);border-radius:4px;font-size:.9rem">'+
        '<button class="btn" onclick="perfThisMonth()" style="padding:4px 10px">이번달</button>'+
        '<div style="flex:1"></div>'+
        '<button class="btn p" onclick="perfDownloadXlsx()" style="padding:6px 14px">📥 엑셀 다운로드</button>'+
        '<button class="btn" onclick="_perfReload(true)" title="새로고침" style="padding:4px 10px">🔄</button>'+
      '</div>'+
      '<div style="margin-top:6px;color:var(--g4);font-size:.8rem">테스트 생산은 외포장 testRun 기준으로 자동 식별되어 노란색으로 표시됩니다. 30초마다 자동 새로고침.</div>'+
    '</div>'+
    '<div class="card" style="padding:0;overflow:auto">'+
      '<div id="perfStatus" style="padding:1rem;text-align:center;color:var(--g4)">데이터 불러오는 중…</div>'+
      '<div id="perfTblWrap" style="display:none"></div>'+
    '</div>';
}

// ── 데이터 로드 + 렌더 ────────────────────────────────────────
async function _perfReload(showLoading){
  if(_perfBusy) return; _perfBusy=true;
  try{
    var ym=_perfYm||_perfTodayYm();
    var from=ym+'-01';
    var lastDay=new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(5)), 0).getDate();
    var to=ym+'-'+String(lastDay).padStart(2,'0');
    var today=tod();
    var effTo = to>today ? today : to;
    var prevFrom = _perfPrevD(from);

    if(showLoading){
      var st=document.getElementById('perfStatus');
      if(st){st.style.display='';st.textContent='데이터 불러오는 중…';}
      var tw=document.getElementById('perfTblWrap'); if(tw) tw.style.display='none';
    }

    // 캐시 무효화 (자동 갱신용)
    if(typeof _cacheClear==='function'){
      try{ _cacheClear(); }catch(e){}
    }

    var results = await Promise.all([
      fbGetRange('thawing', prevFrom, effTo),
      fbGetRange('preprocess', from, effTo),
      fbGetRange('cooking', from, effTo),
      fbGetRange('shredding', from, effTo),
      fbGetRange('packing', from, effTo),
      fbGetRange('outerpacking', from, effTo),
      fbGetRange('sauce', from, effTo)
    ]);
    var th=results[0], pp=results[1], ck=results[2], sh=results[3], pk=results[4], op=results[5], sc=results[6];

    var rows = _perfBuildRows(th, pp, ck, sh, pk, op, sc);
    window._perfRows = rows;        // 다운로드용
    window._perfMeta = {ym: ym, lbl: ym.slice(0,4)+'년 '+_perfMonths()[parseInt(ym.slice(5))-1]};
    _perfRenderTable(rows);
  } catch(e){
    console.error(e);
    var st2=document.getElementById('perfStatus');
    if(st2){st2.style.display='';st2.textContent='로드 오류: '+(e.message||e);}
  } finally {
    _perfBusy=false;
  }
}
window._perfReload = _perfReload;

// ── B방식 역추적 + 일자별 행 빌드 ──────────────────────────
function _perfBuildRows(th, pp, ck, sh, pk, op, sc){
  var d = function(r){return String(r.date||'').slice(0,10);};
  var idOf = function(r){return r.fbId||r.id||'';};

  // 1) 외포장 testRun 키 (date|product) 셋
  var opTestKeys = new Set();
  op.forEach(function(r){ if(r.testRun||r.isTest) opTestKeys.add(d(r)+'|'+(r.product||'')); });
  var isTestPk = function(r){
    if(r.testRun||r.isTest) return true;
    return opTestKeys.has(d(r)+'|'+(r.product||''));
  };

  // 2) 테스트 packing 식별
  var testPk = pk.filter(isTestPk);
  var testPkIds = new Set(testPk.map(idOf));

  // 3) 일자별 역추적 → th/pp/ck/sh 테스트 ID 셋
  var testThIds=new Set(), testPpIds=new Set(), testCkIds=new Set(), testShIds=new Set();
  var byDateTestPk = {};
  testPk.forEach(function(r){
    var k=d(r); if(!byDateTestPk[k]) byDateTestPk[k]=[]; byDateTestPk[k].push(r);
  });
  Object.keys(byDateTestPk).forEach(function(date){
    var rows=byDateTestPk[date];
    var pkW=new Set();
    rows.forEach(function(r){_perfSplit(r.wagon).forEach(function(w){pkW.add(w);});});

    var shDay=sh.filter(function(r){return d(r)===date && _perfSplit(r.wagonOut).some(function(w){return pkW.has(w);});});
    var shW=new Set();
    shDay.forEach(function(r){_perfSplit(r.wagonIn).forEach(function(w){shW.add(w);}); testShIds.add(idOf(r));});

    var ckDay=ck.filter(function(r){return d(r)===date && _perfSplit(r.wagonOut).some(function(w){return shW.has(w);});});
    var ckC=new Set();
    ckDay.forEach(function(r){_perfSplit(r.cage).forEach(function(c){ckC.add(c);}); testCkIds.add(idOf(r));});

    var ppDay=pp.filter(function(r){return d(r)===date && _perfSplit(r.cage).some(function(c){return ckC.has(c);});});
    var ppW=new Set();
    ppDay.forEach(function(r){_perfSplit(r.wagons).forEach(function(w){ppW.add(w);}); testPpIds.add(idOf(r));});

    var prevD=_perfPrevD(date);
    var thMatch=th.filter(function(r){return d(r)===date && ppW.has(String(r.cart||'').trim());});
    if(!thMatch.length) thMatch=th.filter(function(r){return d(r)===prevD && ppW.has(String(r.cart||'').trim());});
    thMatch.forEach(function(r){testThIds.add(idOf(r));});
  });

  // 4) 클린(non-test) 데이터
  var pkClean = pk.filter(function(r){return !testPkIds.has(idOf(r));});
  var ppClean = pp.filter(function(r){return !testPpIds.has(idOf(r));});
  var thClean = th.filter(function(r){return !testThIds.has(idOf(r));});

  // 5) 일자×제품 packing 집계
  var byDP={};
  pkClean.forEach(function(r){
    var key=d(r)+'|'+(r.product||'기타');
    if(!byDP[key]) byDP[key]={ea:0,pouch:0,defect:0,workers:0,subKg:0,subName:'',sauceKg:0};
    byDP[key].ea += parseFloat(r.ea)||0;
    byDP[key].pouch += parseFloat(r.pouch)||0;
    byDP[key].defect += parseFloat(r.defect)||0;
    byDP[key].workers = Math.max(byDP[key].workers, parseFloat(r.workers)||0);
    if(r.subKg) byDP[key].subKg += parseFloat(r.subKg)||0;
    if(r.subName && !byDP[key].subName) byDP[key].subName=r.subName;
    if(r.sauceKg) byDP[key].sauceKg += parseFloat(r.sauceKg)||0;
  });

  // 6) 외포장 매핑 (테스트 제외)
  var opMap={};
  op.forEach(function(r){
    if(r.testRun||r.isTest) return;
    var key=d(r)+'|'+(r.product||'');
    if(!opMap[key]) opMap[key]={ea:0,boxes:0,tray:0,trayDef:0,unitCnt:0,boxDef:0};
    opMap[key].ea += parseInt(r.outerEa)||0;
    opMap[key].boxes += parseInt(r.outerBoxes)||0;
    opMap[key].tray += parseInt(r.tray)||0;
    opMap[key].trayDef += parseInt(r.trayDefect)||0;
    opMap[key].unitCnt += parseInt(r.unitCount)||0;
    opMap[key].boxDef += parseInt(r.boxDefect)||0;
  });

  // 7) 일자별 자숙/파쇄/전처리 (테스트 제외)
  function sumKg(coll, idset){
    var m={};
    coll.forEach(function(r){
      if(idset.has(idOf(r))) return;
      var k=d(r); m[k]=(m[k]||0)+(parseFloat(r.kg)||0);
    });
    return m;
  }
  var ckMap=sumKg(ck, testCkIds);
  var shMap=sumKg(sh, testShIds);
  var ppMap=sumKg(pp, testPpIds);

  // 8) 원육 사용량 (전처리 wagons → 방혈 cart 매칭)
  function getThKg(date){
    var ppDay = ppClean.filter(function(r){return d(r)===date;});
    var wagons = new Set();
    ppDay.forEach(function(r){_perfSplit(r.wagons).forEach(function(w){wagons.add(w);});});
    var thList=thClean;
    var prevD=_perfPrevD(date);
    var matched=[];
    if(wagons.size){
      var sameTh = thList.filter(function(r){return d(r)===date && wagons.has(String(r.cart||'').trim());});
      if(sameTh.length){
        matched=sameTh;
      } else {
        var sameAny = thList.filter(function(r){return d(r)===date;});
        var prevTh = thList.filter(function(r){return d(r)===prevD && wagons.has(String(r.cart||'').trim());});
        if(sameAny.length) matched=sameAny;
        else if(prevTh.length) matched=prevTh;
      }
    } else {
      matched=thList.filter(function(r){return d(r)===date;});
      if(!matched.length) matched=thList.filter(function(r){return d(r)===prevD;});
    }
    var seen=new Set(); var ded=[];
    matched.forEach(function(r){
      var k=(r.cart||'')+'|'+d(r)+'|'+(r.type||'');
      if(seen.has(k)) return; seen.add(k); ded.push(r);
    });
    return _perfR2(ded.reduce(function(s,r){return s+(parseFloat(r.totalKg)||0);},0));
  }

  // 9) 원육 종류별 박스 (설도/홍두깨/우둔)
  function getThPartBoxes(date){
    var ppDay = ppClean.filter(function(r){return d(r)===date;});
    var wagons = new Set();
    ppDay.forEach(function(r){_perfSplit(r.wagons).forEach(function(w){wagons.add(w);});});
    var thList=thClean;
    var prevD=_perfPrevD(date);
    var matched=[];
    if(wagons.size){
      var sameTh=thList.filter(function(r){return d(r)===date && wagons.has(String(r.cart||'').trim());});
      if(sameTh.length){ matched=sameTh; }
      else {
        var sameAny=thList.filter(function(r){return d(r)===date;});
        var prevTh=thList.filter(function(r){return d(r)===prevD && wagons.has(String(r.cart||'').trim());});
        if(sameAny.length) matched=sameAny;
        else if(prevTh.length) matched=prevTh;
      }
    } else {
      matched=thList.filter(function(r){return d(r)===date;});
      if(!matched.length) matched=thList.filter(function(r){return d(r)===prevD;});
    }
    var seen=new Set(); var ded=[];
    matched.forEach(function(r){var k=(r.cart||'')+'|'+d(r)+'|'+(r.type||''); if(seen.has(k))return; seen.add(k); ded.push(r);});
    var partType={};
    ded.forEach(function(r){
      var p=r.part||r.type||'';
      var bx=parseInt(r.boxes)||0;
      partType[p]=(partType[p]||0)+bx;
    });
    return partType;
  }

  // 10) 일자별 행 빌드 (제품별)
  var unique = Object.keys(byDP).map(function(k){return k.split('|')[0];});
  var dates = [];
  unique.forEach(function(x){if(dates.indexOf(x)<0) dates.push(x);});
  dates.sort();

  var rows=[];
  var dayNo=0;
  dates.forEach(function(date){
    dayNo++;
    var prods=Object.keys(byDP).filter(function(k){return k.indexOf(date+'|')===0;}).map(function(k){return k.split('|')[1];}).sort();
    var rmKg = getThKg(date);
    var partBx = getThPartBoxes(date);
    var ckD=_perfR2(ckMap[date]||0);
    var shD=_perfR2(shMap[date]||0);
    var ppD=_perfR2(ppMap[date]||0);
    prods.forEach(function(prod, pi){
      var pkr=byDP[date+'|'+prod];
      var opR=opMap[date+'|'+prod]||{ea:0,boxes:0,tray:0,trayDef:0,unitCnt:0,boxDef:0};
      var innerEa = opR.ea>0 ? opR.ea : Math.round(pkr.ea);
      var defPouch = Math.max(0, Math.round(pkr.pouch) - innerEa);
      var boxUse = opR.boxes + opR.boxDef;
      // 메추리알: subName에 '메추리' 포함되거나 subKg>0
      var qaiKg = (pkr.subKg>0) ? _perfR2(pkr.subKg) : 0;
      // 소비기한 (제조일 + 9개월) 간단 계산
      var dt=new Date(date+'T00:00:00');
      dt.setMonth(dt.getMonth()+9);
      var expDate = dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
      // 제품에 따른 원육 종류 (대표값)
      var rmType = '';
      if(prod.indexOf('FC')>=0) rmType='홍두깨';
      else if(prod.indexOf('시그니처')>=0||prod.indexOf('코코')>=0) rmType='설도';
      else if(prod.indexOf('트레이더스')>=0) rmType='홍두깨';
      else if(prod.indexOf('미니')>=0) rmType='우둔';
      rows.push({
        date: date,
        dayNo: dayNo,
        product: prod,
        productIndex: pi,         // 0이면 일자 첫 행 (병합 표시용)
        expDate: expDate,
        workers: pi===0 ? Math.round(pkr.workers||0) : 0,
        rmType: rmType,
        rmKg: pi===0 ? rmKg : 0,
        boxSeoldo: pi===0 ? (partBx['설도']||0) : 0,
        boxHongdu: pi===0 ? (partBx['홍두깨']||partBx['홍두께']||0) : 0,
        boxUdun:   pi===0 ? (partBx['우둔']||0) : 0,
        ppKg: pi===0 ? ppD : 0,
        ckKg: pi===0 ? ckD : 0,
        shKg: pi===0 ? shD : 0,
        sauceKg: _perfR2(pkr.sauceKg),
        innerEa: innerEa,
        defPouch: defPouch,
        outerBoxes: opR.boxes,
        boxDef: opR.boxDef,
        tray: opR.tray,
        trayDef: opR.trayDef,
        unitCnt: opR.unitCnt,
        outBoxes: opR.boxes,
        sauceFP: '',
        qaiKg: qaiKg,
        pouch: Math.round(pkr.pouch),
        boxUse: boxUse,
        isTest: false
      });
    });
  });

  // 11) 테스트 행 (별도)
  var testPkByKey={};
  testPk.forEach(function(r){
    var key=d(r)+'|'+(r.product||'');
    if(!testPkByKey[key]) testPkByKey[key]={date:d(r),product:r.product||'',ea:0,pouch:0,defect:0};
    testPkByKey[key].ea+=parseFloat(r.ea)||0;
    testPkByKey[key].pouch+=parseFloat(r.pouch)||0;
    testPkByKey[key].defect+=parseFloat(r.defect)||0;
  });
  var testOpByKey={};
  op.filter(function(r){return r.testRun||r.isTest;}).forEach(function(r){
    var key=d(r)+'|'+(r.product||'');
    if(!testOpByKey[key]) testOpByKey[key]={ea:0,boxes:0};
    testOpByKey[key].ea+=parseInt(r.outerEa)||0;
    testOpByKey[key].boxes+=parseInt(r.outerBoxes)||0;
  });
  Object.keys(testPkByKey).sort().forEach(function(key){
    var r=testPkByKey[key];
    var opT=testOpByKey[key]||{ea:0,boxes:0};
    var innerEa = opT.ea>0 ? opT.ea : Math.round(r.ea);
    var defPouch = Math.max(0, Math.round(r.pouch)-innerEa);
    rows.push({
      date:r.date, dayNo:0, product:r.product+' (테스트)', productIndex:0,
      expDate:'', workers:0, rmType:'', rmKg:0,
      boxSeoldo:0, boxHongdu:0, boxUdun:0,
      ppKg:0, ckKg:0, shKg:0, sauceKg:0,
      innerEa:innerEa, defPouch:defPouch,
      outerBoxes:opT.boxes, boxDef:0, tray:0, trayDef:0, unitCnt:0,
      outBoxes:opT.boxes, sauceFP:'', qaiKg:0,
      pouch:Math.round(r.pouch), boxUse:opT.boxes,
      isTest:true
    });
  });

  return rows;
}

// ── 표 렌더 ───────────────────────────────────────────────────
function _perfRenderTable(rows){
  var wrap=document.getElementById('perfTblWrap');
  var st=document.getElementById('perfStatus');
  if(!wrap) return;
  if(!rows||!rows.length){
    if(st){st.style.display='';st.textContent='이 달의 생산 데이터가 없습니다.';}
    wrap.style.display='none'; return;
  }
  if(st) st.style.display='none';
  wrap.style.display='';

  var headers=[
    '일수','날짜','소비기한','제품명','작업인원',
    '원육종류','원육사용량(kg)','설도','홍두깨','우둔',
    '전처리(kg)','자숙(kg)','파쇄(kg)','소스사용량',
    '내포장(EA)','불량파우치','완박스','불량박스',
    '트레이','트레이불량','낱개','출고박스',
    'FP/FC소스','메추리알','파우치사용','박스사용'
  ];
  var html='<table style="border-collapse:collapse;width:100%;font-size:.78rem;min-width:1700px">';
  html+='<thead><tr style="background:#1F4E79;color:#fff">';
  headers.forEach(function(h){
    html+='<th style="padding:6px 4px;border:1px solid #999;font-weight:600;text-align:center;white-space:nowrap">'+h+'</th>';
  });
  html+='</tr></thead><tbody>';
  var prevDate=''; var dayBg=['#ffffff','#f8fafc'];
  rows.forEach(function(r){
    var bg = r.isTest ? '#fff3cd' : (dayBg[(r.dayNo)%2]);
    var fontStyle = r.isTest ? 'font-style:italic;color:#856404' : '';
    var cells=[
      r.dayNo>0 && r.productIndex===0 ? r.dayNo : '',
      r.productIndex===0 ? r.date.slice(5) : '',
      r.productIndex===0 && r.expDate ? r.expDate.slice(2).replace(/-/g,'.') : '',
      r.product,
      r.workers||'',
      r.rmType||'',
      r.rmKg||'', r.boxSeoldo||'', r.boxHongdu||'', r.boxUdun||'',
      r.ppKg||'', r.ckKg||'', r.shKg||'', r.sauceKg||'',
      r.innerEa.toLocaleString(), r.defPouch||'',
      r.outerBoxes||'', r.boxDef||'',
      r.tray||'', r.trayDef||'', r.unitCnt||'', r.outBoxes||'',
      r.sauceFP||'', r.qaiKg||'',
      r.pouch.toLocaleString(), r.boxUse||''
    ];
    html+='<tr style="background:'+bg+';'+fontStyle+'">';
    cells.forEach(function(c, i){
      var align=i<6?'center':'right';
      if(i===3) align='left';
      html+='<td style="padding:4px 6px;border:1px solid #ddd;text-align:'+align+';white-space:nowrap">'+(c==null?'':c)+'</td>';
    });
    html+='</tr>';
    prevDate=r.date;
  });
  html+='</tbody></table>';
  wrap.innerHTML=html;
}

// ── 엑셀 다운로드 ─────────────────────────────────────────────
function perfDownloadXlsx(){
  var rows=window._perfRows||[];
  if(!rows.length){ toast('데이터가 없습니다','d'); return; }
  var meta=window._perfMeta||{ym:_perfYm, lbl:_perfYm};
  var ym=meta.ym||_perfYm;

  var headers=[
    '일수','날짜','소비기한','제품명','작업인원',
    '원육종류','원육사용량(kg)','설도(박스)','홍두깨(박스)','우둔(박스)',
    '전처리(kg)','자숙(kg)','파쇄(kg)','소스사용량(kg)',
    '내포장수량(EA)','불량파우치(EA)','완박스','불량박스',
    '트레이(EA)','트레이불량(EA)','낱개수량','출고박스',
    'FP/FC소스배합','깐메추리알(kg)','파우치사용량','박스사용량'
  ];
  var aoa=[headers];
  rows.forEach(function(r){
    aoa.push([
      r.dayNo>0 && r.productIndex===0 ? r.dayNo : '',
      r.productIndex===0 ? r.date : '',
      r.productIndex===0 ? r.expDate : '',
      r.product,
      r.workers||'',
      r.rmType||'',
      r.rmKg||'', r.boxSeoldo||'', r.boxHongdu||'', r.boxUdun||'',
      r.ppKg||'', r.ckKg||'', r.shKg||'', r.sauceKg||'',
      r.innerEa, r.defPouch||'',
      r.outerBoxes||'', r.boxDef||'',
      r.tray||'', r.trayDef||'', r.unitCnt||'', r.outBoxes||'',
      r.sauceFP||'', r.qaiKg||'',
      r.pouch, r.boxUse||''
    ]);
  });

  var wb=XLSX.utils.book_new();
  var ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[
    {wch:5},{wch:11},{wch:11},{wch:24},{wch:7},
    {wch:8},{wch:11},{wch:7},{wch:8},{wch:7},
    {wch:10},{wch:9},{wch:9},{wch:11},
    {wch:12},{wch:10},{wch:8},{wch:8},
    {wch:9},{wch:11},{wch:8},{wch:9},
    {wch:11},{wch:10},{wch:11},{wch:9}
  ];
  ws['!freeze']={xSplit:5,ySplit:1};
  XLSX.utils.book_append_sheet(wb, ws, ym+' 실적');

  var fname='순수본2공장_실적관리_'+ym+'.xlsx';
  if(typeof _saveXlsx==='function'){
    _saveXlsx(wb, fname);
  } else {
    XLSX.writeFile(wb, fname);
  }
  toast('엑셀 다운로드 완료','s');
}
window.perfDownloadXlsx = perfDownloadXlsx;

})();
