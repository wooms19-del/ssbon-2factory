/* ===========================================================
 * monthly_production.js v7
 * - 월별현황(analysis.js)의 데이터 처리 로직 그대로 사용
 *   ▸ L.products의 kgea (제품 마스터) 사용
 *   ▸ getThKgByPP_ : 시차 매칭된 정확한 원육 사용량
 *   ▸ 외포장 EA 우선 (없으면 내포장 EA)
 *   ▸ 테스트 체인 완전 역추적 (wagon/cage 매칭)
 * - 표시 양식만 36컬럼 운영팀 월단위 생산량 양식
 * =========================================================== */

(function(){
  'use strict';

  /* ===== 상태 ===== */
  var _mpYm = null;
  var _mpData = null;
  var _mpPrevData = null;
  var _mpBusy = false;
  var _mpGrp = {
    inout: true, workers: false, hours: false, prod: false, yield: false
  };
  try {
    var saved = localStorage.getItem('ssbon_v6_mpGrp');
    if(saved) _mpGrp = Object.assign(_mpGrp, JSON.parse(saved));
  } catch(e){}

  /* ===== 유틸 ===== */
  function _ymToday(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function _prevYm(ym){ var p=ym.split('-').map(Number); var d=new Date(p[0],p[1]-2,1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function _r2(n){ if(!isFinite(+n)) return 0; return Math.round((+n)*100)/100; }
  function _num(v){ var n=parseFloat(v); return isFinite(n)?n:0; }
  function _today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function _t2m(t){ if(!t||typeof t!=='string') return 0; var p=t.split(':'); return (parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0); }
  function _hoursFromSE(start, end){
    var s=_t2m(start), e=_t2m(end);
    if(!s&&!e) return 0;
    if(e<s) e += 24*60;
    return Math.round((e-s)/60*100)/100;
  }
  function _prevDStr(date){
    var p=date.split('-').map(Number);
    var dt=new Date(p[0],p[1]-1,p[2]-1);
    return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  }

  // 무육 제품 판별 (메추리알 장조림 등)
  function _isNoMeat(name){
    return /메추리알/.test(name||'');
  }

  // 제품명에서 1봉당 전체 kg 파싱 (월별현황 _prodKgUnit 동일)
  function _prodKgUnit(name){
    var m = (name||'').match(/(\d+(?:\.\d+)?)\s*(g|KG)\b/i);
    if(!m) return 0;
    return m[2].toUpperCase()==='KG' ? parseFloat(m[1]) : parseFloat(m[1])/1000;
  }
  // L.products에서 1봉당 메인(고기) kg
  function _prodKgea(name){
    if(typeof L==='undefined' || !L || !L.products) return 0;
    var p = L.products.find(function(x){ return x.name===name; });
    return p ? (parseFloat(p.kgea)||0) : 0;
  }

  /* ===== 메인 메뉴 → 실적관리 ===== */
  function showPerf(){
    if(typeof setModePerf==='function') setModePerf();
    var pnav=document.getElementById('pnav'); if(pnav) pnav.classList.remove('hid');
    showPerfSub('daily');
  }

  function showPerfSub(name){
    var pnav=document.getElementById('pnav');
    if(pnav){
      pnav.querySelectorAll('.ti').forEach(function(t,i){
        t.classList.toggle('on', (i===0&&name==='daily') || (i===1&&name==='monthly'));
      });
    }
    var perfPg = document.getElementById('p-performance');
    var moPg   = document.getElementById('p-monthly-prod');
    if(name==='daily'){
      if(perfPg) perfPg.classList.add('on');
      if(moPg)   moPg.classList.remove('on');
    } else {
      if(perfPg) perfPg.classList.remove('on');
      if(moPg)   moPg.classList.add('on');
      if(!_mpYm) _mpYm = _ymToday();
      _mpRenderShell();
      _mpReload();
    }
    var ms=document.getElementById('mscroll'); if(ms) ms.scrollTop=0;
  }

  /* ===== 셸 렌더 ===== */
  function _mpRenderShell(){
    var pg = document.getElementById('p-monthly-prod');
    if(!pg) return;
    var ym = _mpYm || _ymToday();
    var y=ym.slice(0,4), mIdx=parseInt(ym.slice(5),10);
    var monthLbl = y+'년 '+mIdx+'월';

    var html = ''
      + '<style>'
      + '#mpToolbar{padding:12px 14px;background:#f5f6fa;border-bottom:1px solid #ddd;display:flex;flex-wrap:wrap;gap:8px;align-items:center}'
      + '#mpToolbar .btn{padding:7px 14px;border:1px solid #bbb;background:#fff;border-radius:5px;cursor:pointer;font-size:13px}'
      + '#mpToolbar .btn:hover{background:#eee}'
      + '#mpToolbar .btn.dl{background:#1f7a3a;color:#fff;border-color:#1f7a3a;font-weight:600}'
      + '#mpToolbar .btn.dl:hover{background:#176029}'
      + '#mpToolbar .lbl{font-weight:700;color:#1e293b;margin:0 8px;font-size:15px}'
      + '#mpToolbar2 .grp{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;background:#fff;border:1px solid #ddd;border-radius:5px;cursor:pointer;font-size:12px;user-select:none}'
      + '#mpToolbar2 .grp input{margin:0;cursor:pointer}'
      + '#mpToolbar2 .grp.on{background:#e7f0ff;border-color:#3b6fb8;color:#1e3a8a;font-weight:600}'
      + '#mpStatus{padding:10px 14px;color:#1b8a3a;font-size:13px;font-weight:500;background:#f0fdf4;border-bottom:1px solid #d1fae5}'
      + '#mpTblWrap{overflow:auto;background:#fff;padding-bottom:4px;max-height:calc(100vh - 320px);border:1px solid #e5e7eb;border-radius:6px}'
      + '#mpTbl{border-collapse:separate;border-spacing:0;font-size:12.5px;white-space:nowrap;min-width:100%;font-variant-numeric:tabular-nums}'
      + '#mpTbl th,#mpTbl td{border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db;padding:7px 8px;text-align:center;vertical-align:middle}'
      + '#mpTbl thead th{background:#374151;color:#fff;font-weight:600;position:sticky;top:0;z-index:10;padding:9px 8px;line-height:1.35;font-size:12px;border-color:#1f2937;box-shadow:inset 0 -2px 0 #1f2937}'
      // ── 왼쪽 3컬럼 sticky 고정 (생산일수 / 생산일자 / 제품명)
      + '#mpTbl th:nth-child(1),#mpTbl td:nth-child(1){position:sticky;left:0;min-width:55px;width:55px;z-index:5;background:#fff}'
      + '#mpTbl th:nth-child(2),#mpTbl td:nth-child(2){position:sticky;left:55px;min-width:90px;width:90px;z-index:5;background:#fff}'
      + '#mpTbl th:nth-child(3),#mpTbl td:nth-child(3){position:sticky;left:145px;min-width:220px;width:220px;z-index:5;background:#fff;box-shadow:4px 0 6px -3px rgba(0,0,0,0.12)}'
      // 좌상단 모서리 (헤더 + 좌측 고정의 교차) z-index 가장 높게
      + '#mpTbl thead th:nth-child(1),#mpTbl thead th:nth-child(2),#mpTbl thead th:nth-child(3){z-index:15;background:#374151}'
      // 짝수 행 zebra: sticky 셀도 같은 색
      + '#mpTbl tbody tr:nth-child(even):not(.sumRow):not(.avgRow):not(.prevRow):not(.diffRow) td{background:#fafbfc}'
      + '#mpTbl tbody tr:hover:not(.sumRow):not(.avgRow):not(.prevRow):not(.diffRow) td{background:#fef9c3}'
      // 합계/평균 등 sticky 셀 배경 일치
      + '#mpTbl tr.sumRow td{background:#fef3c7;font-weight:700;color:#78350f;border-top:2px solid #92400e;padding:9px 8px}'
      + '#mpTbl tr.avgRow td{background:#dcfce7;font-weight:600;color:#14532d;padding:9px 8px}'
      + '#mpTbl tr.prevRow td{background:#f1f5f9;color:#475569;padding:9px 8px}'
      + '#mpTbl tr.diffRow td{background:#fee2e2;font-style:normal;font-weight:600;padding:9px 8px;border-bottom:2px solid #b91c1c}'
      // 합계/평균 행은 colspan="3" 한 셀이 3컬럼 차지 → 그 셀에 left:0 + 더 큰 너비 부여
      + '#mpTbl tr.sumRow td:first-child,#mpTbl tr.avgRow td:first-child,#mpTbl tr.prevRow td:first-child,#mpTbl tr.diffRow td:first-child{position:sticky;left:0;z-index:5;width:auto;min-width:auto;box-shadow:4px 0 6px -3px rgba(0,0,0,0.12)}'
      + '#mpTbl td.product{font-weight:500;color:#1e40af}'
      + '#mpTbl td.dateCell{font-weight:600;color:#1e293b}'
      + '#mpTbl td.dayNoCell{color:#6b7280;font-size:11.5px}'
      // 빈 dateCell·dayNoCell (그룹 두 번째 행)의 위쪽 border 제거 → 시각적 그룹화
      + '#mpTbl td.dateCell:empty,#mpTbl td.dayNoCell:empty{border-top:1px dashed #f1f5f9}'
      + '#mpTbl td.eaSrc{font-size:10px;color:#9ca3af;margin-left:3px;font-weight:400}'
      + '#mpCmp{margin:14px;padding:14px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.04)}'
      + '#mpCmp h3{margin:0 0 10px 0;font-size:14px;color:#1e293b;font-weight:700}'
      + '#mpCmp table{border-collapse:collapse;font-size:13px;width:100%;font-variant-numeric:tabular-nums}'
      + '#mpCmp th,#mpCmp td{border:1px solid #d1d5db;padding:8px 14px;text-align:center}'
      + '#mpCmp th{background:#374151;color:#fff;font-weight:600}'
      + '#mpCmp tr:nth-child(even) td{background:#fafbfc}'
      + '</style>'
      + '<div id="mpToolbar">'
      + '<button class="btn" onclick="mpPrevMonth()">◀</button>'
      + '<span class="lbl" id="mpYmLbl">'+monthLbl+'</span>'
      + '<button class="btn" onclick="mpNextMonth()">▶</button>'
      + '<button class="btn" onclick="mpThisMonth()">이번달</button>'
      + '<input type="month" value="'+ym+'" onchange="mpPickMonth(this.value)" style="padding:6px 8px;border:1px solid #bbb;border-radius:4px;font-size:13px">'
      + '<span style="flex:1"></span>'
      + '<button class="btn dl" onclick="mpDownload()">📥 엑셀 다운로드</button>'
      + '</div>'
      + '<div id="mpToolbar2" style="padding:8px 14px;background:#fafafa;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid #e5e7eb">'
      + '<span style="font-size:12px;color:#555;font-weight:600">컬럼 표시:</span>'
      + _grpChip('inout','투입/배출')
      + _grpChip('workers','작업인원')
      + _grpChip('hours','작업시간')
      + _grpChip('prod','생산성')
      + _grpChip('yield','수율')
      + '</div>'
      + '<div id="mpStatus">데이터 불러오는 중…</div>'
      + '<div id="mpTblWrap" style="display:none"><table id="mpTbl"></table></div>'
      + '<div id="mpCmp" style="display:none"></div>';
    pg.innerHTML = html;
  }

  function _grpChip(key, lbl){
    var on = _mpGrp[key];
    return '<label class="grp'+(on?' on':'')+'" onclick="mpToggleGrp(\''+key+'\')">'
         + '<input type="checkbox" '+(on?'checked':'')+' onclick="event.stopPropagation()" onchange="mpToggleGrp(\''+key+'\')">'+lbl+'</label>';
  }

  /* ===== 데이터 로드 ===== */
  function _mpReload(){
    if(_mpBusy) return;
    _mpBusy = true;
    (async function(){
      try {
        var ym = _mpYm || _ymToday();
        var from = ym+'-01';
        var lastDay = new Date(parseInt(ym.slice(0,4),10), parseInt(ym.slice(5),10), 0).getDate();
        var to = ym+'-'+String(lastDay).padStart(2,'0');
        var today = _today();
        var effTo = to>today ? today : to;
        var prevFrom = _prevDStr(from);

        var pYm = _prevYm(ym);
        var pFrom = pYm+'-01';
        var pLast = new Date(parseInt(pYm.slice(0,4),10), parseInt(pYm.slice(5),10), 0).getDate();
        var pTo = pYm+'-'+String(pLast).padStart(2,'0');
        var pPrevFrom = _prevDStr(pFrom);

        if(typeof _cacheClear==='function'){ try{_cacheClear();}catch(e){} }

        var st=document.getElementById('mpStatus');
        if(st) st.textContent='Firebase에서 데이터 불러오는 중…';

        var R = await Promise.all([
          fbGetRange('packing',      from,     effTo),
          fbGetRange('outerpacking', from,     effTo),
          fbGetRange('preprocess',   from,     effTo),
          fbGetRange('thawing',      prevFrom, effTo),
          fbGetRange('shredding',    from,     effTo),
          fbGetRange('cooking',      from,     effTo),
          fbGetRange('packing',      pFrom,    pTo),
          fbGetRange('outerpacking', pFrom,    pTo),
          fbGetRange('preprocess',   pFrom,    pTo),
          fbGetRange('thawing',      pPrevFrom,pTo),
          fbGetRange('shredding',    pFrom,    pTo),
          fbGetRange('cooking',      pFrom,    pTo)
        ]);

        _mpData     = _mpProcess(R[0],R[1],R[2],R[3],R[4],R[5]);
        _mpPrevData = _mpProcess(R[6],R[7],R[8],R[9],R[10],R[11]);
        _mpRender();
      } catch(e){
        console.error('[mp] reload error', e);
        var st=document.getElementById('mpStatus');
        if(st){ st.style.display=''; st.textContent='로드 오류: '+(e.message||e); st.style.color='#c0392b'; }
      } finally {
        _mpBusy = false;
      }
    })();
  }

  /* ===== 데이터 처리 (월별현황 로직 카피) ===== */
  function _mpProcess(pk, op, ppMonth, thMonth, shMonth, ckMonth){
    pk = pk||[]; op = op||[]; ppMonth = ppMonth||[]; thMonth = thMonth||[];
    shMonth = shMonth||[]; ckMonth = ckMonth||[];

    // 외포장 정상분
    var opReal = op.filter(function(r){ return !r.testRun && !r.isTest; });

    // 테스트 packing 식별
    var testOpKeys = new Set();
    op.filter(function(r){ return r.testRun||r.isTest; }).forEach(function(r){
      testOpKeys.add(String(r.date||'').slice(0,10)+'_'+(r.product||''));
    });
    function isTestPk(r){
      return r.testRun || r.isTest || testOpKeys.has(String(r.date||'').slice(0,10)+'_'+(r.product||''));
    }

    // 테스트 체인 완전 역추적
    var testPpIds = new Set();
    var testShIds = new Set();
    var testCkIds = new Set();
    var testThWByDate = {};
    var testDates = [];
    var seenD = {};
    pk.filter(isTestPk).forEach(function(r){
      var d=String(r.date||'').slice(0,10);
      if(!seenD[d]){ seenD[d]=1; testDates.push(d); }
    });

    testDates.forEach(function(d){
      var tPkD = pk.filter(isTestPk).filter(function(r){return String(r.date||'').slice(0,10)===d;});
      var shD = shMonth.filter(function(r){return String(r.date||'').slice(0,10)===d;});
      var ckD = ckMonth.filter(function(r){return String(r.date||'').slice(0,10)===d;});
      var ppD = ppMonth.filter(function(r){return String(r.date||'').slice(0,10)===d;});

      var tPkW = new Set(), tPkC = new Set();
      tPkD.forEach(function(r){
        (r.wagon||'').split(',').map(function(w){return w.trim();}).filter(Boolean).forEach(function(w){tPkW.add(w);});
        (r.cart ||'').split(',').map(function(w){return w.trim();}).filter(Boolean).forEach(function(w){tPkC.add(w);});
      });

      var tSh = shD.filter(function(r){
        var woMatch = (r.wagonOut||'').split(',').map(function(w){return w.trim();}).some(function(w){return tPkW.has(w);});
        var coMatch = (r.cartOut ||'').split(',').map(function(w){return w.trim();}).some(function(w){return tPkC.has(w);});
        return woMatch || coMatch;
      });
      tSh.forEach(function(r){ testShIds.add(r.fbId||r.id); });
      var tShW = new Set();
      tSh.forEach(function(r){
        (r.wagonIn||'').split(',').map(function(w){return w.trim();}).filter(Boolean).forEach(function(w){tShW.add(w);});
      });

      var tCk = ckD.filter(function(r){
        return (r.wagonOut||'').split(',').map(function(w){return w.trim();}).some(function(w){return tShW.has(w);});
      });
      tCk.forEach(function(r){ testCkIds.add(r.fbId||r.id); });
      var tCkC = new Set();
      tCk.forEach(function(r){
        (r.cage||'').split(',').map(function(c){return c.trim();}).filter(Boolean).forEach(function(c){tCkC.add(c);});
      });

      var tPp = ppD.filter(function(r){
        return (r.cage||'').split(',').map(function(c){return c.trim();}).some(function(c){return tCkC.has(c);});
      });
      tPp.forEach(function(r){ testPpIds.add(r.fbId||r.id); });
      var tPpW = new Set();
      tPp.forEach(function(r){
        (r.wagons||'').split(',').map(function(w){return w.trim();}).filter(Boolean).forEach(function(w){tPpW.add(w);});
      });
      if(!testThWByDate[d]) testThWByDate[d] = new Set();
      tPpW.forEach(function(w){ testThWByDate[d].add(w); });
    });

    var pkClean = pk.filter(function(r){ return !isTestPk(r); });
    var ppClean = ppMonth.filter(function(r){ return !testPpIds.has(r.fbId||r.id); });
    var shClean = shMonth.filter(function(r){ return !testShIds.has(r.fbId||r.id); });
    var ckClean = ckMonth.filter(function(r){ return !testCkIds.has(r.fbId||r.id); });
    var thClean = thMonth.filter(function(r){
      var thD = String(r.date||'').slice(0,10);
      var w = (r.cart||'').trim();
      if(!w) return true;
      if(testThWByDate[thD] && testThWByDate[thD].has(w)) return false;
      var nextD = (function(){var dt=new Date(thD); dt.setDate(dt.getDate()+1); return dt.toISOString().slice(0,10);})();
      if(testThWByDate[nextD] && testThWByDate[nextD].has(w)) return false;
      return true;
    });

    // 외포장 EA 맵
    var opMap = {};
    opReal.forEach(function(r){
      var k = String(r.date||'').slice(0,10)+'|'+(r.product||'');
      opMap[k] = (opMap[k]||0) + (parseInt(r.outerEa,10)||0);
    });

    // 부위(type) 추출 헬퍼
    function recType(r){ return (r.type||'').trim(); }

    // shredding의 부위는 같은 날 cooking의 wagonOut과 매칭해서 결정
    function buildShTypeMap(shArr, ckArr){
      // 일자별 wagon→type 맵 (같은 wagon 번호가 다른 날 다른 부위로 쓰일 수 있어 일자별로 분리)
      var dayWagonType = {};
      ckArr.forEach(function(c){
        var t = recType(c);
        if(!t) return;
        var d = String(c.date||'').slice(0,10);
        if(!dayWagonType[d]) dayWagonType[d] = {};
        (c.wagonOut||'').split(',').map(function(w){return w.trim();}).filter(Boolean).forEach(function(w){
          dayWagonType[d][w] = t;
        });
      });
      return shArr.map(function(s){
        var t = recType(s);
        if(!t){
          var sd = String(s.date||'').slice(0,10);
          var dayMap = dayWagonType[sd] || {};
          var wIns = (s.wagonIn||'').split(',').map(function(w){return w.trim();}).filter(Boolean);
          for(var i=0;i<wIns.length;i++){
            if(dayMap[wIns[i]]){ t = dayMap[wIns[i]]; break; }
          }
        }
        return Object.assign({}, s, {_type: t});
      });
    }

    // 일자별, 부위별 합산 (인시 방식)
    function sumByDateType(arr, getType){
      // 키: date|type → {kg, hours, personHours, workers}
      var m = {};
      arr.forEach(function(r){
        var dt = String(r.date||'').slice(0,10);
        if(!dt) return;
        var t = (getType ? getType(r) : recType(r)) || '_';
        var k = dt+'|'+t;
        if(!m[k]) m[k] = {kg:0,hours:0,personHours:0,workers:0,date:dt,type:t};
        var h = _hoursFromSE(r.start, r.end);
        var w = _num(r.workers);
        m[k].kg += _num(r.kg);
        m[k].hours += h;
        m[k].personHours += h*w;
      });
      Object.keys(m).forEach(function(k){
        m[k].workers = m[k].hours>0 ? m[k].personHours/m[k].hours : 0;
      });
      return m;
    }

    // thawing은 일자별·부위별 totalKg
    var thByDateType = {};
    thClean.forEach(function(r){
      var dt = String(r.date||'').slice(0,10);
      var t = recType(r) || '_';
      if(!dt) return;
      var k = dt+'|'+t;
      thByDateType[k] = (thByDateType[k]||0) + _num(r.totalKg);
    });

    var ppByDT = sumByDateType(ppClean);
    var ckByDT = sumByDateType(ckClean);
    var shTagged = buildShTypeMap(shClean, ckClean);
    var shByDT = sumByDateType(shTagged, function(r){ return r._type; });

    // packing 그룹핑 (인시 방식) — type 정보 보존
    var byDP = {};
    pkClean.forEach(function(r){
      var dt = String(r.date||'').slice(0,10);
      var prod = r.product||'';
      if(!dt||!prod) return;
      var k = dt+'|'+prod;
      if(!byDP[k]) byDP[k] = {date:dt, product:prod, ea:0, hours:0, personHours:0, workers:0, types:{}};
      byDP[k].ea += _num(r.ea);
      var h = _hoursFromSE(r.start, r.end);
      var w = _num(r.workers);
      byDP[k].hours += h;
      byDP[k].personHours += h*w;
      // packing의 type 누적 (가장 많이 나온 type)
      var t = recType(r);
      if(t) byDP[k].types[t] = (byDP[k].types[t]||0) + _num(r.ea);
    });
    Object.keys(byDP).forEach(function(k){
      var p = byDP[k];
      p.workers = p.hours>0 ? p.personHours/p.hours : 0;
      var oe = opMap[k] || 0;
      p.eaDisp = oe>0 ? oe : p.ea;
      p.eaSrc  = oe>0 ? '외' : '내';
      // 1) packing 자체의 type — kg(EA) 큰 순으로 모두 typeList에 포함
      var typeList = Object.keys(p.types).sort(function(a,b){return (p.types[b]||0)-(p.types[a]||0);});
      // 2) packing에 type 없으면 → 그날 thawing 부위들 자동 추론
      if(typeList.length === 0){
        var thTypes = {};
        Object.keys(thByDateType).forEach(function(thk){
          var pp=thk.split('|');
          if(pp[0]===p.date && pp[1]!=='_' && thByDateType[thk]>0){
            thTypes[pp[1]] = (thTypes[pp[1]]||0) + thByDateType[thk];
          }
        });
        typeList = Object.keys(thTypes).sort(function(a,b){return thTypes[b]-thTypes[a];});
      }
      p.type = typeList[0] || null;
      p.typeList = typeList;
    });

    // 각 packing 행에 부위 매칭된 데이터 할당 (필요시 비율 분배)
    // 같은 (date,type) 그룹의 packing들 사이에서 EA*kgea 비율로 분배
    function _allocByRatio(packs, totalKg){
      // packs: [{p, kgea}], totalKg: 분배할 양
      var totalMeat = packs.reduce(function(s,x){return s + x.p.eaDisp * (x.kgea||1);}, 0);
      if(!totalMeat) return packs.map(function(){return 0;});
      return packs.map(function(x){ return totalKg * (x.p.eaDisp * (x.kgea||1) / totalMeat); });
    }

    // 일자별 그룹핑
    var byDate = {};
    Object.keys(byDP).forEach(function(k){
      var p = byDP[k];
      if(!byDate[p.date]) byDate[p.date] = [];
      byDate[p.date].push(p);
    });

    var allocMap = {};   // key 'date|product' → {rmKg, ppKg, ckKg, shKg, ppHours, ppPH, ppWorkers, ...}

    // 부위별 데이터 추출 함수 (재사용을 위해 외부 정의)
    function _dataByType(d, t){
      return {
        rmKg: thByDateType[d+'|'+t] || 0,
        pp:   ppByDT[d+'|'+t] || {kg:0,hours:0,personHours:0,workers:0},
        ck:   ckByDT[d+'|'+t] || {kg:0,hours:0,personHours:0,workers:0},
        sh:   shByDT[d+'|'+t] || {kg:0,hours:0,personHours:0,workers:0}
      };
    }
    function _dataAll(d){
      var rm=0, pp={kg:0,hours:0,personHours:0,workers:0}, ck={kg:0,hours:0,personHours:0,workers:0}, sh={kg:0,hours:0,personHours:0,workers:0};
      Object.keys(thByDateType).forEach(function(k){
        if(k.indexOf(d+'|')===0) rm += thByDateType[k];
      });
      function add(target, src){
        target.kg+=src.kg; target.hours+=src.hours; target.personHours+=src.personHours;
      }
      Object.keys(ppByDT).forEach(function(k){ if(k.indexOf(d+'|')===0) add(pp, ppByDT[k]); });
      Object.keys(ckByDT).forEach(function(k){ if(k.indexOf(d+'|')===0) add(ck, ckByDT[k]); });
      Object.keys(shByDT).forEach(function(k){ if(k.indexOf(d+'|')===0) add(sh, shByDT[k]); });
      pp.workers = pp.hours>0 ? pp.personHours/pp.hours : 0;
      ck.workers = ck.hours>0 ? ck.personHours/ck.hours : 0;
      sh.workers = sh.hours>0 ? sh.personHours/sh.hours : 0;
      return {rmKg:rm, pp:pp, ck:ck, sh:sh};
    }

    Object.keys(byDate).forEach(function(d){
      var packs = byDate[d];

      // packing들을 부위별로 그룹핑
      var byType = {};   // type or '_'
      packs.forEach(function(p){
        var t = p.type || '_';
        if(!byType[t]) byType[t] = [];
        byType[t].push(p);
      });

      Object.keys(byType).forEach(function(t){
        var group = byType[t];
        // 부위 데이터
        var src = (t==='_') ? _dataAll(d) : _dataByType(d, t);
        // 부위 데이터가 비어있으면 (type 명시했으나 그 부위 thawing 0) → 그날 전체 사용
        if(t!=='_' && src.rmKg===0 && src.pp.kg===0){
          src = _dataAll(d);
        }
        // 같은 부위에 여러 packing이면 EA*kgea 비율로 분배
        var totalMeat = group.reduce(function(s,p){return s + p.eaDisp * (_prodKgea(p.product)||0.05);}, 0);

        group.forEach(function(p){
          var kgea = _prodKgea(p.product);
          var ratio;
          if(group.length===1) ratio = 1;
          else if(totalMeat>0) ratio = (p.eaDisp * (kgea||0.05)) / totalMeat;
          else ratio = 1/group.length;

          allocMap[d+'|'+p.product] = {
            rmKg: src.rmKg * ratio,
            ppKg: src.pp.kg * ratio,
            ppHours: src.pp.hours * ratio,
            ppPersonHours: src.pp.personHours * ratio,
            ppWorkers: src.pp.workers,
            ckKg: src.ck.kg * ratio,
            ckHours: src.ck.hours * ratio,
            ckPersonHours: src.ck.personHours * ratio,
            ckWorkers: src.ck.workers,
            shKg: src.sh.kg * ratio,
            shHours: src.sh.hours * ratio,
            shPersonHours: src.sh.personHours * ratio,
            shWorkers: src.sh.workers
          };
        });
      });
    });

    var keys = Object.keys(byDP).sort();
    var dates = Array.from(new Set(keys.map(function(k){return k.split('|')[0];}))).sort();
    var dayNo = {};
    dates.forEach(function(d,i){ dayNo[d]=i+1; });

    var prodCnt = {};
    var rows = [];
    function r1(x){ return Math.round(x*10)/10; }

    keys.forEach(function(k){
      var p = byDP[k];
      var dt = p.date;
      var noMeat = _isNoMeat(p.product);
      var kgea = _prodKgea(p.product);
      var kgTot = _prodKgUnit(p.product);

      // 무육이거나 부위 0~1개면 단일 행
      if(noMeat || !p.typeList || p.typeList.length<=1){
        prodCnt[dt] = prodCnt[dt]||0;
        var idx = prodCnt[dt];
        prodCnt[dt] += 1;

        var alloc;
        if(noMeat){
          alloc = {rmKg:0, ppKg:0, ppHours:0, ppPersonHours:0, ppWorkers:0,
                   ckKg:0, ckHours:0, ckPersonHours:0, ckWorkers:0,
                   shKg:0, shHours:0, shPersonHours:0, shWorkers:0};
        } else {
          alloc = allocMap[dt+'|'+p.product] || {
            rmKg:0, ppKg:0, ppHours:0, ppPersonHours:0, ppWorkers:0,
            ckKg:0, ckHours:0, ckPersonHours:0, ckWorkers:0,
            shKg:0, shHours:0, shPersonHours:0, shWorkers:0
          };
        }

        rows.push({
          date: dt, dayNo: dayNo[dt], dateRowIdx: idx,
          product: p.product,
          rmKg: _r2(alloc.rmKg),
          ppKg: _r2(alloc.ppKg), ppHours: _r2(alloc.ppHours), ppWorkers: r1(alloc.ppWorkers), ppPersonHours: _r2(alloc.ppPersonHours),
          ckKg: _r2(alloc.ckKg), ckHours: _r2(alloc.ckHours), ckWorkers: r1(alloc.ckWorkers), ckPersonHours: _r2(alloc.ckPersonHours),
          shKg: _r2(alloc.shKg), shHours: _r2(alloc.shHours), shWorkers: r1(alloc.shWorkers), shPersonHours: _r2(alloc.shPersonHours),
          pkEa: p.eaDisp, pkEaSrc: p.eaSrc, pkEaInner: p.ea,
          pkHours: _r2(p.hours), pkWorkers: r1(p.workers), pkPersonHours: _r2(p.personHours),
          kgea: kgea, kgTot: kgTot,
          type: p.type || (noMeat ? '무육' : ''),
          typeList: p.typeList || [],
          noMeat: noMeat
        });
        return;
      }

      // 여러 부위 → 부위마다 별도 행
      // EA 분배 우선순위: (1) packing에 type 명시된 EA 비율 (2) thawing kg 비율
      var hasPkTypes = Object.keys(p.types).length > 0;
      var ratios;
      if(hasPkTypes){
        var totalPkType = p.typeList.reduce(function(s,t){return s+(p.types[t]||0);},0);
        ratios = p.typeList.map(function(t){
          return totalPkType>0 ? (p.types[t]||0)/totalPkType : 1/p.typeList.length;
        });
      } else {
        var thKgs = p.typeList.map(function(t){ return thByDateType[dt+'|'+t] || 0; });
        var totalTh = thKgs.reduce(function(a,b){return a+b;}, 0);
        ratios = totalTh>0
          ? thKgs.map(function(x){return x/totalTh;})
          : p.typeList.map(function(){return 1/p.typeList.length;});
      }

      p.typeList.forEach(function(t, i){
        var src = _dataByType(dt, t);
        // 부위 데이터 비어있으면 그날 전체 데이터로 폴백
        if(src.rmKg===0 && src.pp.kg===0) src = _dataAll(dt);
        var ratio = ratios[i];
        prodCnt[dt] = prodCnt[dt]||0;
        var idx2 = prodCnt[dt];
        prodCnt[dt] += 1;

        rows.push({
          date: dt, dayNo: dayNo[dt], dateRowIdx: idx2,
          product: p.product,
          rmKg: _r2(src.rmKg),
          ppKg: _r2(src.pp.kg),
          ppHours: _r2(src.pp.hours),
          ppWorkers: r1(src.pp.workers),
          ppPersonHours: _r2(src.pp.personHours),
          ckKg: _r2(src.ck.kg),
          ckHours: _r2(src.ck.hours),
          ckWorkers: r1(src.ck.workers),
          ckPersonHours: _r2(src.ck.personHours),
          shKg: _r2(src.sh.kg),
          shHours: _r2(src.sh.hours),
          shWorkers: r1(src.sh.workers),
          shPersonHours: _r2(src.sh.personHours),
          pkEa: Math.round(p.eaDisp * ratio),
          pkEaSrc: p.eaSrc,
          pkEaInner: Math.round(p.ea * ratio),
          pkHours: _r2(p.hours * ratio),
          pkWorkers: r1(p.workers),
          pkPersonHours: _r2(p.personHours * ratio),
          kgea: kgea, kgTot: kgTot,
          type: t,
          typeList: [t],
          noMeat: false
        });
      });
    });

    return {
      rows: rows,
      testCount: pk.filter(isTestPk).length
    };
  }

  /* ===== 합계 ===== */
  function _mpAggregate(rows){
    var sum = {rmKg:0,ppKg:0,ppHours:0,ppWorkers:0,ppTotal:0,
               ckKg:0,ckHours:0,ckWorkers:0,ckTotal:0,
               shKg:0,shHours:0,shWorkers:0,shTotal:0,
               pkEa:0,pkHours:0,pkWorkers:0,pkTotal:0,
               meatKg:0, prodKg:0};
    var ratioKeys = ['prodPp','prodCk','prodSh','prodPk','prodAll',
                     'yieldRmPp','yieldRmCk','yieldRmSh','yieldRmPk',
                     'yieldPp','yieldCk','yieldSh','yieldPk'];
    var ratioBucket = {};
    ratioKeys.forEach(function(k){ ratioBucket[k] = []; });

    var dates = {};
    rows.forEach(function(r){
      // 부위 분리·분배 적용 후 → 모든 행 합산 (각 행은 자기 부위 분배 몫만 가짐)
      sum.rmKg += r.rmKg;
      sum.ppKg += r.ppKg; sum.ppHours += r.ppHours; sum.ppWorkers += r.ppWorkers;
      sum.ppTotal += r.ppPersonHours;
      sum.ckKg += r.ckKg; sum.ckHours += r.ckHours; sum.ckWorkers += r.ckWorkers;
      sum.ckTotal += r.ckPersonHours;
      sum.shKg += r.shKg; sum.shHours += r.shHours; sum.shWorkers += r.shWorkers;
      sum.shTotal += r.shPersonHours;
      sum.pkEa += r.pkEa; sum.pkHours += r.pkHours; sum.pkWorkers += r.pkWorkers;
      sum.pkTotal += r.pkPersonHours;
      sum.meatKg += r.pkEa * (r.kgea||0);
      sum.prodKg += r.pkEa * (r.kgTot||0);
      ratioKeys.forEach(function(k){
        if(r[k]>0 && isFinite(r[k])) ratioBucket[k].push(r[k]);
      });
      if(r.date) dates[r.date]=true;
    });
    sum.dayCount = Object.keys(dates).length;
    ratioKeys.forEach(function(k){
      var arr = ratioBucket[k];
      sum[k] = arr.length ? arr.reduce(function(a,b){return a+b;},0)/arr.length : 0;
    });
    return sum;
  }

  /* ===== 화면 렌더 ===== */
  function _mpRender(){
    var pg = document.getElementById('p-monthly-prod');
    if(!pg) return;
    var st=document.getElementById('mpStatus');
    var tw=document.getElementById('mpTblWrap');
    var tbl=document.getElementById('mpTbl');
    var cmp=document.getElementById('mpCmp');

    var rows0 = (_mpData && _mpData.rows) || [];
    if(!rows0.length){
      if(st){ st.style.display=''; st.textContent='이 달의 데이터가 없습니다.'; st.style.color='#c0392b'; }
      if(tw) tw.style.display='none';
      if(cmp) cmp.style.display='none';
      return;
    }

    var COLS = [
      ['dayNo',     'base',    '생산\n일수'],
      ['date',      'base',    '생산일자'],
      ['product',   'base',    '제품명'],
      ['rmKg',      'base',    '원육 사용량\n(KG)'],
      ['ppKg',      'inout',   '전처리\n(KG)'],
      ['ppHours',   'hours',   '전처리\n작업시간'],
      ['ppWorkers', 'workers', '전처리\n작업인원'],
      ['ppPersonHours','hours','전처리\n총작업(인시)'],
      ['ckKg',      'inout',   '자숙\n(KG)'],
      ['ckHours',   'hours',   '자숙\n작업시간'],
      ['ckWorkers', 'workers', '자숙\n작업인원'],
      ['ckPersonHours','hours','자숙\n총작업(인시)'],
      ['shKg',      'inout',   '파쇄\n(KG)'],
      ['shHours',   'hours',   '파쇄\n작업시간'],
      ['shWorkers', 'workers', '파쇄\n작업인원'],
      ['shPersonHours','hours','파쇄\n총작업(인시)'],
      ['pkEa',      'base',    '내포장\n(EA)'],
      ['pkHours',   'hours',   '내포장\n작업시간'],
      ['pkWorkers', 'workers', '내포장\n작업인원'],
      ['pkPersonHours','hours','내포장\n총작업(인시)'],
      ['meatKg',    'base',    '완제품 고기\n중량(KG)'],
      ['prodKg',    'base',    '완제품 중량\n(KG)'],
      ['prodPp',    'prod',    '생산성\n전처리'],
      ['prodCk',    'prod',    '생산성\n자숙'],
      ['prodSh',    'prod',    '생산성\n파쇄'],
      ['prodPk',    'prod',    '생산성\n포장'],
      ['prodAll',   'prod',    '생산성\n전체'],
      ['yieldRmPp', 'yield',   '원료육수율\n전처리'],
      ['yieldRmCk', 'yield',   '원료육수율\n자숙'],
      ['yieldRmSh', 'yield',   '원료육수율\n파쇄'],
      ['yieldRmPk', 'yield',   '원료육수율\n포장'],
      ['yieldPp',   'yield',   '공정수율\n전처리'],
      ['yieldCk',   'yield',   '공정수율\n자숙'],
      ['yieldSh',   'yield',   '공정수율\n파쇄'],
      ['yieldPk',   'yield',   '공정수율\n포장']
    ];
    var visibleCols = COLS.filter(function(c){
      if(c[1]==='base') return true;
      return _mpGrp[c[1]];
    });

    var calcRows = rows0.map(function(r){
      var ppT = r.ppPersonHours || 0;
      var ckT = r.ckPersonHours || 0;
      var shT = r.shPersonHours || 0;
      var pkT = r.pkPersonHours || 0;
      var meatKg = r.pkEa * (r.kgea||0);
      var prodKg = r.pkEa * (r.kgTot||0);
      var rm = r.rmKg;
      return Object.assign({}, r, {
        meatKg:_r2(meatKg), prodKg:_r2(prodKg),
        prodPp: rm&&ppT?_r2(rm/ppT):0,
        prodCk: rm&&ckT?_r2(rm/ckT):0,
        prodSh: rm&&shT?_r2(rm/shT):0,
        prodPk: rm&&pkT?_r2(rm/pkT):0,
        prodAll: rm&&(ppT+ckT+shT+pkT)?_r2(rm/(ppT+ckT+shT+pkT)):0,
        yieldRmPp: rm?_r2(r.ppKg/rm*100)/100:0,
        yieldRmCk: rm?_r2(r.ckKg/rm*100)/100:0,
        yieldRmSh: rm?_r2(r.shKg/rm*100)/100:0,
        yieldRmPk: rm?_r2(meatKg/rm*100)/100:0,
        yieldPp:   rm?_r2(r.ppKg/rm*100)/100:0,
        yieldCk:   r.ppKg?_r2(r.ckKg/r.ppKg*100)/100:0,
        yieldSh:   r.ckKg?_r2(r.shKg/r.ckKg*100)/100:0,
        yieldPk:   r.shKg?_r2(meatKg/r.shKg*100)/100:0
      });
    });

    var sum = _mpAggregate(calcRows);
    var prevRows = (_mpPrevData && _mpPrevData.rows) || [];
    var prevSum = _mpAggregate(prevRows.map(function(r){
      var ppT=r.ppPersonHours||0, ckT=r.ckPersonHours||0, shT=r.shPersonHours||0, pkT=r.pkPersonHours||0;
      var meatKg = r.pkEa*(r.kgea||0);
      var rm=r.rmKg;
      return Object.assign({}, r, {
        meatKg:meatKg, prodKg:r.pkEa*(r.kgTot||0),
        prodPp: rm&&ppT?rm/ppT:0,
        prodCk: rm&&ckT?rm/ckT:0,
        prodSh: rm&&shT?rm/shT:0,
        prodPk: rm&&pkT?rm/pkT:0,
        prodAll: rm&&(ppT+ckT+shT+pkT)?rm/(ppT+ckT+shT+pkT):0,
        yieldRmPp: rm?r.ppKg/rm:0, yieldRmCk: rm?r.ckKg/rm:0,
        yieldRmSh: rm?r.shKg/rm:0, yieldRmPk: rm?meatKg/rm:0,
        yieldPp: rm?r.ppKg/rm:0, yieldCk: r.ppKg?r.ckKg/r.ppKg:0,
        yieldSh: r.ckKg?r.shKg/r.ckKg:0, yieldPk: r.shKg?meatKg/r.shKg:0
      });
    }));

    var thHtml = '<tr>'+visibleCols.map(function(c){
      return '<th>'+c[2].replace(/\n/g,'<br>')+'</th>';
    }).join('')+'</tr>';

    // 숫자 포맷터: 천단위 콤마 + 자리수
    function fmtCell(v, c){
      if(v==null) return '-';
      if(typeof v!=='number') return String(v);
      if(!isFinite(v)) return '-';
      if(v===0) return '-';
      var grp = c[1];
      // 수율: % 표시
      if(grp==='yield') return (v*100).toFixed(1) + '%';
      // 생산성: kg/인시
      if(grp==='prod') return v.toFixed(2);
      if(c[0]==='pkEa' || c[0]==='dayNo') return Math.round(v).toLocaleString();
      if(c[0]==='ppWorkers'||c[0]==='ckWorkers'||c[0]==='shWorkers'||c[0]==='pkWorkers') return v.toFixed(1);
      if(c[0]==='ppHours'||c[0]==='ckHours'||c[0]==='shHours'||c[0]==='pkHours') return v.toFixed(2);
      if(c[0]==='ppPersonHours'||c[0]==='ckPersonHours'||c[0]==='shPersonHours'||c[0]==='pkPersonHours') return v.toFixed(1);
      return v%1===0 ? v.toLocaleString() : v.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:2});
    }

    // 같은 날짜 행 수 계산 (병합용)
    var dateCntMap = {};
    calcRows.forEach(function(r){ dateCntMap[r.date] = (dateCntMap[r.date]||0)+1; });

    var bodyHtml = calcRows.map(function(r){
      return '<tr>'+visibleCols.map(function(c){
        var v = r[c[0]];
        // dayNo, date: 모든 행마다 td 출력. 두 번째 부위 행은 빈 td (sticky 정렬 위해)
        if(c[0]==='dayNo'){
          if(r.dateRowIdx===0){
            return '<td class="dayNoCell">'+(v||'')+'</td>';
          }
          // 두 번째 행: 빈 td (위 셀의 border-bottom 없애서 시각적 그룹화)
          return '<td class="dayNoCell" style="border-top:none"></td>';
        }
        if(c[0]==='date'){
          if(r.dateRowIdx===0){
            return '<td class="dateCell">'+(v||'').slice(5)+'</td>';
          }
          return '<td class="dateCell" style="border-top:none"></td>';
        }
        if(c[0]==='product') {
          // 부위별 색상 팔레트
          var typeColors = {
            '설도':   {bg:'#dbeafe', fg:'#1e40af'},  // 파랑
            '우둔':   {bg:'#ede9fe', fg:'#6d28d9'},  // 보라
            '홍두깨': {bg:'#ffedd5', fg:'#c2410c'},  // 주황
            '무육':   {bg:'#fee2e2', fg:'#b91c1c'}   // 빨강
          };
          var typeBadges = '';
          if(r.noMeat){
            var c0 = typeColors['무육'];
            typeBadges = '<span style="display:inline-block;background:'+c0.bg+';color:'+c0.fg+';border-radius:3px;padding:1px 6px;font-size:10px;font-weight:600;margin-left:4px">무육</span>';
          } else {
            var list = (r.typeList && r.typeList.length) ? r.typeList : (r.type ? [r.type] : []);
            typeBadges = list.map(function(t){
              var col = typeColors[t] || {bg:'#e5e7eb', fg:'#374151'};
              return '<span style="display:inline-block;background:'+col.bg+';color:'+col.fg+';border-radius:3px;padding:1px 6px;font-size:10px;font-weight:600;margin-left:4px">'+t+'</span>';
            }).join('');
          }
          return '<td class="product" style="text-align:center">'+(v||'')+typeBadges+'</td>';
        }
        if(c[0]==='pkEa') {
          var s = v ? Math.round(v).toLocaleString() : '-';
          return '<td>'+s+'<span class="eaSrc">('+(r.pkEaSrc||'')+')</span></td>';
        }
        if(typeof v==='number'){
          return '<td>'+fmtCell(v, c)+'</td>';
        }
        return '<td>'+(v==null?'-':v)+'</td>';
      }).join('')+'</tr>';
    }).join('');

    function fmtNum(v, c){
      if(v==null) return '';
      if(typeof v!=='number') return String(v);
      if(!isFinite(v)) return '';
      // 수율은 %, 생산성은 소수
      if(c && c[1]==='yield') return (v*100).toFixed(1) + '%';
      if(c && c[1]==='prod') return v.toFixed(2);
      var key = c ? c[0] : '';
      if(key==='pkEa' || key==='dayNo') return Math.round(v).toLocaleString();
      if(key==='ppWorkers'||key==='ckWorkers'||key==='shWorkers'||key==='pkWorkers') return v.toFixed(1);
      if(key==='ppHours'||key==='ckHours'||key==='shHours'||key==='pkHours') return v.toFixed(2);
      if(key==='ppPersonHours'||key==='ckPersonHours'||key==='shPersonHours'||key==='pkPersonHours') return v.toFixed(1);
      return v%1===0 ? v.toLocaleString() : v.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:2});
    }
    function isRatio(c){ return c[1]==='yield'||c[1]==='prod'; }

    var sumHtml = '<tr class="sumRow"><td colspan="3">합 계</td>'
      + visibleCols.slice(3).map(function(c){
          if(isRatio(c)) return '<td>—</td>';
          return '<td>'+fmtNum(sum[c[0]], c)+'</td>';
        }).join('')
      + '</tr>';

    var dc = sum.dayCount||1;
    var avgHtml = '<tr class="avgRow"><td colspan="3">일 평 균</td>'
      + visibleCols.slice(3).map(function(c){
          var v = sum[c[0]]; if(v==null||typeof v!=='number') return '<td>—</td>';
          if(isRatio(c)) return '<td>'+fmtNum(v, c)+'</td>';
          return '<td>'+fmtNum(v/dc, c)+'</td>';
        }).join('')
      + '</tr>';

    var pdc = prevSum.dayCount||1;
    var prevHtml = '<tr class="prevRow"><td colspan="3">전월 평균</td>'
      + visibleCols.slice(3).map(function(c){
          var v = prevSum[c[0]]; if(v==null||typeof v!=='number') return '<td>—</td>';
          if(isRatio(c)) return '<td>'+fmtNum(v, c)+'</td>';
          return '<td>'+fmtNum(v/pdc, c)+'</td>';
        }).join('')
      + '</tr>';

    var diffHtml = '<tr class="diffRow"><td colspan="3">전월 대비 증감</td>'
      + visibleCols.slice(3).map(function(c){
          var v = sum[c[0]]||0;
          var p = prevSum[c[0]]||0;
          if(!p) return '<td>—</td>';
          var thisV = isRatio(c) ? v : v/dc;
          var prevV = isRatio(c) ? p : p/pdc;
          if(!prevV) return '<td>—</td>';
          var pct = (thisV - prevV)/prevV*100;
          var color = pct>0?'#15803d':(pct<0?'#b91c1c':'#475569');
          var arrow = pct>0?'▲':(pct<0?'▼':'');
          return '<td style="color:'+color+'">'+arrow+' '+Math.abs(pct).toFixed(1)+'%</td>';
        }).join('')
      + '</tr>';

    tbl.innerHTML = '<thead>'+thHtml+'</thead><tbody>'+bodyHtml+sumHtml+avgHtml+prevHtml+diffHtml+'</tbody>';
    if(tw) tw.style.display='';

    if(st){
      st.style.display='';
      st.style.color='#1b8a3a';
      var msg = '✓ 데이터 로드 완료';
      if(_mpData.testCount>0) msg += ' (테스트 체인 '+_mpData.testCount+'건 역추적 제외)';
      st.textContent = msg;
    }

    var ymThis=(_mpYm||_ymToday()), ymPrev=_prevYm(ymThis);
    var thisAvg = sum.dayCount?(sum.rmKg/sum.dayCount):0;
    var prevAvg = prevSum.dayCount?(prevSum.rmKg/prevSum.dayCount):0;
    var diff = thisAvg-prevAvg;
    var diffPct = prevAvg?(diff/prevAvg*100):0;
    function nf(v, dec){ if(!isFinite(v)) return '-'; return v.toLocaleString(undefined,{minimumFractionDigits:dec||0,maximumFractionDigits:dec||0}); }
    function diffColor(d){ return d>0?'#15803d':(d<0?'#b91c1c':'#475569'); }
    function arr(d){ return d>0?'▲':(d<0?'▼':''); }
    cmp.innerHTML = '<h3>📊 전월 대비 비교</h3>'
      + '<table>'
      + '<thead><tr><th>구분</th><th>'+ymThis.replace('-','년 ')+'월</th><th>'+ymPrev.replace('-','년 ')+'월</th><th>차이</th><th>증감율</th></tr></thead>'
      + '<tbody>'
      + '<tr><td><strong>일평균 원육사용량</strong></td><td>'+nf(thisAvg,2)+' kg</td><td>'+nf(prevAvg,2)+' kg</td>'
      +   '<td style="color:'+diffColor(diff)+';font-weight:600">'+arr(diff)+' '+nf(Math.abs(diff),2)+' kg</td>'
      +   '<td style="color:'+diffColor(diffPct)+';font-weight:600">'+arr(diffPct)+' '+nf(Math.abs(diffPct),1)+'%</td></tr>'
      + '<tr><td><strong>생산일수</strong></td><td>'+sum.dayCount+'일</td><td>'+prevSum.dayCount+'일</td>'
      +   '<td style="color:'+diffColor(sum.dayCount-prevSum.dayCount)+';font-weight:600">'+arr(sum.dayCount-prevSum.dayCount)+' '+Math.abs(sum.dayCount-prevSum.dayCount)+'일</td><td>—</td></tr>'
      + '<tr><td><strong>월 누적 원육사용량</strong></td><td>'+nf(sum.rmKg,2)+' kg</td><td>'+nf(prevSum.rmKg,2)+' kg</td>'
      +   '<td style="color:'+diffColor(sum.rmKg-prevSum.rmKg)+';font-weight:600">'+arr(sum.rmKg-prevSum.rmKg)+' '+nf(Math.abs(sum.rmKg-prevSum.rmKg),2)+' kg</td><td>—</td></tr>'
      + '<tr><td><strong>월 누적 EA (외포장)</strong></td><td>'+nf(sum.pkEa,0)+'</td><td>'+nf(prevSum.pkEa,0)+'</td>'
      +   '<td style="color:'+diffColor(sum.pkEa-prevSum.pkEa)+';font-weight:600">'+arr(sum.pkEa-prevSum.pkEa)+' '+nf(Math.abs(sum.pkEa-prevSum.pkEa),0)+'</td><td>—</td></tr>'
      + '<tr><td><strong>완제품 고기중량</strong></td><td>'+nf(sum.meatKg,2)+' kg</td><td>'+nf(prevSum.meatKg,2)+' kg</td>'
      +   '<td style="color:'+diffColor(sum.meatKg-prevSum.meatKg)+';font-weight:600">'+arr(sum.meatKg-prevSum.meatKg)+' '+nf(Math.abs(sum.meatKg-prevSum.meatKg),2)+' kg</td><td>—</td></tr>'
      + '</tbody></table>';
    cmp.style.display='';
  }

  /* ===== 엑셀 다운로드 ===== */
  function _mpDownload(){
    var rows = (_mpData && _mpData.rows) || [];
    if(!rows.length){ alert('데이터가 없습니다.'); return; }
    if(typeof XLSX==='undefined'){ alert('XLSX 라이브러리 로딩 안됨'); return; }

    var ym = _mpYm||_ymToday();
    var y=ym.slice(0,4), mIdx=parseInt(ym.slice(5),10);
    var sheetName = y+'년 '+String(mIdx).padStart(2,'0')+'월';

    var aoa = [];
    aoa.push([y+'년 '+mIdx+'월 운영팀 월단위 생산량']);
    aoa.push([]); aoa.push([]);
    aoa.push(['','생산\n일수','생산일자','제품명','원육 사용량\n(KG)',
              '전처리(KG)','전처리\n작업시간','전처리\n작업인원','전처리\n총 작업시간',
              '자숙(KG)','자숙\n작업시간','자숙\n작업인원','자숙\n총 작업시간',
              '파쇄(KG)','파쇄\n작업시간','파쇄\n작업인원','파쇄\n총 작업시간',
              '내포장(EA)','내포장\n작업시간','내포장\n작업인원','내포장\n총 작업시간',
              '완제품 고기\n중량(KG)','완제품 중량\n(KG)',
              '생산성','','','','','원료육수율','','','','공정수율','','','']);
    aoa.push(['','','','','','','','','','','','','','','','','','','','','','','',
              '전처리(KG)','자숙(KG)','파쇄(KG)','포장(KG)','전체 생산성',
              '전처리','자숙','파쇄','포장','전처리','자숙','파쇄','포장']);

    var startRow = 6;
    rows.forEach(function(r,i){
      var rowN = startRow+i;
      var isFirst = (r.dateRowIdx===0 || r.dateRowIdx==null);
      var meatPerEa = r.kgea||0;
      var totalPerEa = r.kgTot||0;
      aoa.push([
        i+1, r.dayNo, r.date, r.product,
        isFirst ? (r.rmKg||'') : '',
        isFirst ? (r.ppKg||'') : '',
        isFirst ? (r.ppHours||'') : '',
        isFirst ? (r.ppWorkers||'') : '',
        isFirst ? {f:'IFERROR(G'+rowN+'*H'+rowN+',"")'} : '',
        isFirst ? (r.ckKg||'') : '',
        isFirst ? (r.ckHours||'') : '',
        isFirst ? (r.ckWorkers||'') : '',
        isFirst ? {f:'IFERROR(K'+rowN+'*L'+rowN+',"")'} : '',
        isFirst ? (r.shKg||'') : '',
        isFirst ? (r.shHours||'') : '',
        isFirst ? (r.shWorkers||'') : '',
        isFirst ? {f:'IFERROR(O'+rowN+'*P'+rowN+',"")'} : '',
        r.pkEa||'', r.pkHours||'', r.pkWorkers||'',
        {f:'IFERROR(S'+rowN+'*T'+rowN+',"")'},
        meatPerEa?{f:'R'+rowN+'*'+meatPerEa}:'',
        totalPerEa?{f:'R'+rowN+'*'+totalPerEa}:'',
        {f:'IFERROR(E'+rowN+'/I'+rowN+',"")'},
        {f:'IFERROR(E'+rowN+'/M'+rowN+',"")'},
        {f:'IFERROR(E'+rowN+'/Q'+rowN+',"")'},
        {f:'IFERROR(E'+rowN+'/U'+rowN+',"")'},
        {f:'IFERROR(E'+rowN+'/SUM(I'+rowN+',M'+rowN+',Q'+rowN+',U'+rowN+'),"")'},
        {f:'IFERROR(F'+rowN+'/E'+rowN+',"")'},
        {f:'IFERROR(J'+rowN+'/E'+rowN+',"")'},
        {f:'IFERROR(N'+rowN+'/E'+rowN+',"")'},
        {f:'IFERROR(V'+rowN+'/E'+rowN+',"")'},
        {f:'IFERROR(AC'+rowN+',"")'},
        {f:'IFERROR(J'+rowN+'/F'+rowN+',"")'},
        {f:'IFERROR(N'+rowN+'/J'+rowN+',"")'},
        {f:'IFERROR(V'+rowN+'/N'+rowN+',"")'}
      ]);
    });

    var lastDataRow = startRow + rows.length - 1;
    function subSum(col){ return {f:'SUBTOTAL(9,'+col+startRow+':'+col+lastDataRow+')'}; }
    function subAvg(col){ return {f:'SUBTOTAL(1,'+col+startRow+':'+col+lastDataRow+')'}; }
    aoa.push(['','월 합계','','',subSum('E'),subSum('F'),subSum('G'),subSum('H'),subSum('I'),
              subSum('J'),subSum('K'),subSum('L'),subSum('M'),subSum('N'),subSum('O'),subSum('P'),subSum('Q'),
              subSum('R'),subSum('S'),subSum('T'),subSum('U'),subSum('V'),subSum('W')]);
    aoa.push(['','월 평균','','',subAvg('E'),subAvg('F'),subAvg('G'),subAvg('H'),subAvg('I'),
              subAvg('J'),subAvg('K'),subAvg('L'),subAvg('M'),subAvg('N'),subAvg('O'),subAvg('P'),subAvg('Q'),
              subAvg('R'),subAvg('S'),subAvg('T'),subAvg('U'),subAvg('V'),subAvg('W')]);

    var aoaClean = aoa.map(function(row){
      return row.map(function(v){
        return (v && typeof v==='object' && v.f) ? null : v;
      });
    });
    var ws = XLSX.utils.aoa_to_sheet(aoaClean);
    for(var R=0;R<aoa.length;R++){
      for(var C=0;C<aoa[R].length;C++){
        var v = aoa[R][C];
        if(v && typeof v==='object' && v.f){
          var addr = XLSX.utils.encode_cell({r:R, c:C});
          ws[addr] = {t:'n', f:v.f};
        }
      }
    }
    ws['!ref'] = XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:aoa.length-1, c:35}});
    ws['!autofilter'] = { ref: 'A5:AJ'+lastDataRow };
    ws['!cols'] = [
      {wch:5},{wch:6},{wch:11},{wch:18},{wch:11},
      {wch:9},{wch:9},{wch:9},{wch:11},
      {wch:9},{wch:9},{wch:9},{wch:11},
      {wch:9},{wch:9},{wch:9},{wch:11},
      {wch:9},{wch:9},{wch:9},{wch:11},
      {wch:11},{wch:11},
      {wch:9},{wch:9},{wch:9},{wch:9},{wch:9},
      {wch:9},{wch:9},{wch:9},{wch:9},
      {wch:9},{wch:9},{wch:9},{wch:9}
    ];
    ws['!merges'] = [
      {s:{r:3,c:23},e:{r:3,c:27}},
      {s:{r:3,c:28},e:{r:3,c:31}},
      {s:{r:3,c:32},e:{r:3,c:35}}
    ];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, ym+'_운영팀_월단위_생산량.xlsx');
    if(typeof toast==='function') toast('엑셀 다운로드 완료 ✓','s');
  }

  /* ===== 월 이동 ===== */
  function mpPrevMonth(){ _mpYm = _prevYm(_mpYm||_ymToday()); _mpRenderShell(); _mpReload(); }
  function mpNextMonth(){
    var p=_mpYm.split('-').map(Number);
    var d=new Date(p[0],p[1],1);
    _mpYm=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    _mpRenderShell(); _mpReload();
  }
  function mpThisMonth(){ _mpYm=_ymToday(); _mpRenderShell(); _mpReload(); }
  function mpPickMonth(v){ if(!v) return; _mpYm=v; _mpRenderShell(); _mpReload(); }

  function mpToggleGrp(key){
    _mpGrp[key] = !_mpGrp[key];
    try{ localStorage.setItem('ssbon_v6_mpGrp', JSON.stringify(_mpGrp)); }catch(e){}
    _mpRenderShell(); _mpRender();
  }

  /* ===== window 노출 ===== */
  window.showPerf       = showPerf;
  window.showPerfSub    = showPerfSub;
  window.mpPrevMonth    = mpPrevMonth;
  window.mpNextMonth    = mpNextMonth;
  window.mpThisMonth    = mpThisMonth;
  window.mpPickMonth    = mpPickMonth;
  window.mpDownload     = _mpDownload;
  window.mpToggleGrp    = mpToggleGrp;

  ['setMode','setModeSchedule','setModeAtt'].forEach(function(fn){
    var orig = window[fn];
    if(typeof orig==='function'){
      window[fn] = function(){
        var pnav=document.getElementById('pnav'); if(pnav) pnav.classList.add('hid');
        var moPg=document.getElementById('p-monthly-prod'); if(moPg) moPg.classList.remove('on');
        return orig.apply(this, arguments);
      };
    }
  });

})();
