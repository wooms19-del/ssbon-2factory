/* ===========================================================
 * monthly_production.js v1
 * - 실적관리 → [일별실적 / 월단위생산량] 서브탭
 * - 기존 performance.js 한 줄도 안 건드림
 * - 엑셀 양식(2공장_운영팀_월단위_생산량.xlsx) 36컬럼 그대로
 * =========================================================== */

(function(){
  'use strict';

  /* ===== 상태 ===== */
  var _mpYm = null;             // 'YYYY-MM'
  var _mpRows = [];             // 화면용 행 (일자×제품×부위)
  var _mpPrevRows = [];         // 전월 합계용
  var _mpBusy = false;
  var _mpInited = false;

  // 컬럼 그룹 표시 상태 (기본: 기본정보+투입배출 ON)
  var _mpGrp = {
    base: true,       // A,B,C,D,E,V,W,R   기본정보
    inout: true,      // F,J,N              투입/배출
    workers: false,   // H,L,P,T            인원
    hours: false,     // G,I,K,M,O,Q,S,U    작업시간
    prod: false,      // X-AB               생산성
    yield: false      // AC-AJ              수율
  };

  // localStorage에서 토글 복원
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

  // "07:30" 형식 → 분 단위
  function _t2m(t){ if(!t||typeof t!=='string') return 0; var p=t.split(':'); return (parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0); }
  // start/end → 시간(소수) (자정 넘기면 +24h)
  function _hoursFromSE(start, end){
    var s=_t2m(start), e=_t2m(end);
    if(!s&&!e) return 0;
    if(e<s) e += 24*60;
    return Math.round((e-s)/60*100)/100;  // 시간 단위 소수 2자리
  }

  // 제품명 → 1봉 g  (엑셀 키워드 매핑 그대로, 대소문자 무시)
  function _gramPerEa(name){
    if(!name) return 0;
    var n = name.toLowerCase();
    if(n.indexOf('미니')>=0) return 0.024;
    if(n.indexOf('코스트코')>=0) return 0.054;
    if(n.indexOf('130g')>=0) return 0.025;
    if(n.indexOf('460g')>=0) return 0.147;
    if(n.indexOf('3kg')>=0)  return 3;
    if(n.indexOf('120g')>=0) return 0.03;
    if(n.indexOf('180g')>=0) return 0.035;  // 메추리알 등
    if(n.indexOf('170g')>=0) return 0.054;  // 코스트코170g
    return 0;
  }
  // 1봉 전체중량(완제품 중량) kg
  function _totalGramPerEa(name){
    if(!name) return 0;
    var n = name.toLowerCase();
    if(n.indexOf('미니쇠고기장조림')>=0) return 0.07;
    if(n.indexOf('코스트코')>=0) return 0.17;
    if(n.indexOf('120g')>=0) return 0.12;
    if(n.indexOf('460g')>=0) return 0.46;
    if(n.indexOf('130g')>=0) return 0.13;
    if(n.indexOf('3kg')>=0)  return 3;
    if(n.indexOf('180g')>=0) return 0.18;
    if(n.indexOf('170g')>=0) return 0.17;
    return 0;
  }

  /* ===== 메인 메뉴 → 실적관리 ===== */
  function showPerf(){
    if(typeof setModePerf==='function') setModePerf();
    var pnav=document.getElementById('pnav'); if(pnav) pnav.classList.remove('hid');
    showPerfSub('daily');
  }

  function showPerfSub(name){
    // 서브탭 버튼 활성화
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

  /* ===== 셸 렌더 (헤더/툴바) ===== */
  function _mpRenderShell(){
    var pg = document.getElementById('p-monthly-prod');
    if(!pg) return;
    var ym = _mpYm || _ymToday();
    var y=ym.slice(0,4), mIdx=parseInt(ym.slice(5),10);
    var monthLbl = y+'년 '+mIdx+'월';

    var html = ''
      + '<style>'
      + '#mpToolbar{padding:10px;background:#f5f6fa;border-bottom:1px solid #ddd;display:flex;flex-wrap:wrap;gap:8px;align-items:center}'
      + '#mpToolbar .btn{padding:6px 12px;border:1px solid #bbb;background:#fff;border-radius:5px;cursor:pointer;font-size:13px}'
      + '#mpToolbar .btn:hover{background:#eee}'
      + '#mpToolbar .btn.dl{background:#1f7a3a;color:#fff;border-color:#1f7a3a}'
      + '#mpToolbar .btn.dl:hover{background:#176029}'
      + '#mpToolbar .lbl{font-weight:600;color:#333;margin:0 8px}'
      + '#mpToolbar .grp{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:4px 8px;background:#fff;border:1px solid #ddd;border-radius:5px;cursor:pointer;font-size:12px}'
      + '#mpToolbar .grp input{margin:0}'
      + '#mpToolbar .grp.on{background:#e7f0ff;border-color:#3b6fb8}'
      + '#mpStatus{padding:8px;color:#666;font-size:13px}'
      + '#mpTblWrap{overflow-x:auto;background:#fff}'
      + '#mpTbl{border-collapse:collapse;font-size:11px;white-space:nowrap;min-width:100%}'
      + '#mpTbl th,#mpTbl td{border:1px solid #999;padding:3px 6px;text-align:center}'
      + '#mpTbl thead th{background:#dfe6f0;font-weight:600;position:sticky;top:0;z-index:2}'
      + '#mpTbl tr.sumRow td{background:#fff8d8;font-weight:600}'
      + '#mpTbl tr.avgRow td{background:#e8f4e0;font-weight:500}'
      + '#mpTbl tr.prevRow td{background:#f0f0f0;color:#555}'
      + '#mpTbl tr.diffRow td{background:#ffe8e8;font-style:italic}'
      + '#mpTbl tr.cumRow td{background:#fff0d8;font-weight:600}'
      + '#mpTbl td.numL{text-align:right;padding-right:8px}'
      + '#mpTbl tr:hover td:not([class*="Row"]){background:#fffceb}'
      + '#mpCmp{margin:12px;padding:10px;background:#fff;border:1px solid #ccc;border-radius:6px}'
      + '#mpCmp table{border-collapse:collapse;font-size:13px}'
      + '#mpCmp th,#mpCmp td{border:1px solid #aaa;padding:6px 12px;text-align:center}'
      + '#mpCmp th{background:#dfe6f0}'
      + '</style>'
      + '<div id="mpToolbar">'
      + '<button class="btn" onclick="mpPrevMonth()">◀</button>'
      + '<span class="lbl" id="mpYmLbl">'+monthLbl+'</span>'
      + '<button class="btn" onclick="mpNextMonth()">▶</button>'
      + '<button class="btn" onclick="mpThisMonth()">이번달</button>'
      + '<input type="month" value="'+ym+'" onchange="mpPickMonth(this.value)" style="padding:5px;border:1px solid #bbb;border-radius:4px;font-size:13px">'
      + '<span style="flex:1"></span>'
      + '<button class="btn dl" onclick="mpDownload()">📥 엑셀 다운로드</button>'
      + '</div>'
      + '<div id="mpToolbar" style="border-top:0;padding:6px 10px;background:#fafafa">'
      + '<span style="font-size:12px;color:#555">컬럼:</span>'
      + _grpChip('base','기본정보')
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

        // 전월
        var pYm = _prevYm(ym);
        var pFrom = pYm+'-01';
        var pLast = new Date(parseInt(pYm.slice(0,4),10), parseInt(pYm.slice(5),10), 0).getDate();
        var pTo = pYm+'-'+String(pLast).padStart(2,'0');

        // 캐시 무효화
        if(typeof _cacheClear==='function'){ try{_cacheClear();}catch(e){} }

        var st=document.getElementById('mpStatus');
        if(st) st.textContent='Firebase에서 데이터 불러오는 중…';

        var R = await Promise.all([
          fbGetRange('thawing',    from,  effTo),
          fbGetRange('preprocess', from,  effTo),
          fbGetRange('cooking',    from,  effTo),
          fbGetRange('shredding',  from,  effTo),
          fbGetRange('packing',    from,  effTo),
          fbGetRange('thawing',    pFrom, pTo),
          fbGetRange('preprocess', pFrom, pTo),
          fbGetRange('cooking',    pFrom, pTo),
          fbGetRange('shredding',  pFrom, pTo),
          fbGetRange('packing',    pFrom, pTo)
        ]);

        _mpRows     = _mpBuildRows(R[0],R[1],R[2],R[3],R[4]);
        _mpPrevRows = _mpBuildRows(R[5],R[6],R[7],R[8],R[9]);
        _mpRender();
      } catch(e){
        console.error('[mp] reload error', e);
        var st=document.getElementById('mpStatus');
        if(st){ st.style.display=''; st.textContent='로드 오류: '+(e.message||e); }
      } finally {
        _mpBusy = false;
      }
    })();
  }

  /* ===== 행 빌드: 일자×제품 단위 ===== */
  function _mpBuildRows(th, pp, ck, sh, pk){
    var d = function(r){ return String(r.date||'').slice(0,10); };

    // 1) 일자별 thawing 입고량 합산 (E열: 원육사용량)
    //    필드명: totalKg
    var thKgByDate = {};
    (th||[]).forEach(function(r){
      var dt=d(r); if(!dt) return;
      var kg = _num(r.totalKg);
      thKgByDate[dt] = (thKgByDate[dt]||0) + kg;
    });

    // 2) 일자×제품 packing 그룹핑 — 인시 방식
    var byDP = {};   // key 'date|product'
    (pk||[]).forEach(function(r){
      var dt=d(r); var prod=r.product||''; if(!dt||!prod) return;
      var k = dt+'|'+prod;
      if(!byDP[k]) byDP[k] = {date:dt, product:prod, ea:0, hours:0, personHours:0, workers:0, recs:0};
      byDP[k].ea += _num(r.ea);
      var h = _hoursFromSE(r.start, r.end);
      var w = _num(r.workers);
      byDP[k].hours += h;
      byDP[k].personHours += h * w;
      byDP[k].recs += 1;
    });
    // 시간가중평균 인원
    Object.keys(byDP).forEach(function(k){
      var p = byDP[k];
      p.workers = p.hours>0 ? p.personHours/p.hours : 0;
    });

    // 3) 일자별 preprocess/cooking/shredding 합산
    //    인시(person-hour) 방식: 작업별로 시간×인원 계산해 합산
    //    인원 = 시간가중평균 (= 인시 ÷ 시간) → G×H = I 일치
    function sumByDate(arr){
      var m={};
      (arr||[]).forEach(function(r){
        var dt=d(r); if(!dt) return;
        if(!m[dt]) m[dt]={kg:0,hours:0,personHours:0,workers:0};
        m[dt].kg += _num(r.kg);
        var h = _hoursFromSE(r.start, r.end);
        var w = _num(r.workers);
        m[dt].hours += h;
        m[dt].personHours += h * w;
      });
      // 시간가중평균 인원
      Object.keys(m).forEach(function(dt){
        m[dt].workers = m[dt].hours>0 ? m[dt].personHours/m[dt].hours : 0;
      });
      return m;
    }
    var ppByDate = sumByDate(pp);
    var ckByDate = sumByDate(ck);
    var shByDate = sumByDate(sh);

    // 4) 행 만들기 — 일자별로 묶어서 순서대로
    var rows = [];
    var keys = Object.keys(byDP).sort(); // date|product 알파벳 정렬 (날짜 우선)

    // 일자 순서 산출
    var datesOrdered = Array.from(new Set(keys.map(function(k){return k.split('|')[0];}))).sort();
    var dayCnt = {}; // dayNo
    datesOrdered.forEach(function(dt,i){ dayCnt[dt]=i+1; });

    // 일자별 제품 메인 고기 무게 합산 (KG 분배용 비율)
    var dailyMainTotal = {};
    keys.forEach(function(k){
      var p = byDP[k];
      dailyMainTotal[p.date] = (dailyMainTotal[p.date]||0) + p.ea*_gramPerEa(p.product);
    });

    var prodCntPerDate = {}; // 그날 몇번째 제품인지
    keys.forEach(function(k){
      var p = byDP[k];
      var dt = p.date;
      prodCntPerDate[dt] = (prodCntPerDate[dt]||0);
      var dateRowIdx = prodCntPerDate[dt];
      prodCntPerDate[dt] += 1;

      var ppr = ppByDate[dt] || {kg:0,hours:0,personHours:0,workers:0};
      var ckr = ckByDate[dt] || {kg:0,hours:0,personHours:0,workers:0};
      var shr = shByDate[dt] || {kg:0,hours:0,personHours:0,workers:0};
      var thKg = thKgByDate[dt] || 0;

      // 제품별 분배 비율 (메인 고기 무게 기준)
      var myMain = p.ea * _gramPerEa(p.product);
      var totalMain = dailyMainTotal[dt] || 0;
      var ratio = totalMain > 0 ? (myMain/totalMain) : 1;

      // KG는 비율 분배, 시간/인원/인시는 그날 합 (라인 공유)
      function r1(x){ return Math.round(x*10)/10; }
      rows.push({
        date: dt,
        dayNo: dayCnt[dt],
        dateRowIdx: dateRowIdx,
        product: p.product,
        ratio: ratio,
        rmKg: _r2(thKg * ratio),
        ppKg: _r2(ppr.kg * ratio),
        ppHours: _r2(ppr.hours),
        ppWorkers: r1(ppr.workers),
        ppPersonHours: _r2(ppr.personHours),
        ckKg: _r2(ckr.kg * ratio),
        ckHours: _r2(ckr.hours),
        ckWorkers: r1(ckr.workers),
        ckPersonHours: _r2(ckr.personHours),
        shKg: _r2(shr.kg * ratio),
        shHours: _r2(shr.hours),
        shWorkers: r1(shr.workers),
        shPersonHours: _r2(shr.personHours),
        pkEa: p.ea,
        pkHours: _r2(p.hours),
        pkWorkers: r1(p.workers),
        pkPersonHours: _r2(p.personHours)
      });
    });

    return rows;
  }

  /* ===== 합계/평균/누적 ===== */
  function _mpAggregate(rows){
    var sum = {rmKg:0,ppKg:0,ppHours:0,ppWorkers:0,ppTotal:0,
               ckKg:0,ckHours:0,ckWorkers:0,ckTotal:0,
               shKg:0,shHours:0,shWorkers:0,shTotal:0,
               pkEa:0,pkHours:0,pkWorkers:0,pkTotal:0,
               meatKg:0,prodKg:0};
    // 비율 컬럼 (생산성·수율) — 합계 의미 없으므로 평균으로
    var ratioKeys = ['prodPp','prodCk','prodSh','prodPk','prodAll',
                     'yieldRmPp','yieldRmCk','yieldRmSh','yieldRmPk',
                     'yieldPp','yieldCk','yieldSh','yieldPk'];
    var ratioBucket = {};
    ratioKeys.forEach(function(k){ ratioBucket[k] = []; });

    var dates = {};
    rows.forEach(function(r){
      // KG는 모든 행 합산 (분배되어 있어 합치면 그날 전체값 = 정확)
      sum.rmKg+=r.rmKg;
      sum.ppKg+=r.ppKg;
      sum.ckKg+=r.ckKg;
      sum.shKg+=r.shKg;
      // 시간·인원·인시는 그날 첫 행만 (라인 공유 → 중복 카운트 방지)
      if(r.dateRowIdx===0 || r.dateRowIdx==null){
        sum.ppHours+=r.ppHours; sum.ppWorkers+=r.ppWorkers;
        sum.ppTotal += r.ppPersonHours;
        sum.ckHours+=r.ckHours; sum.ckWorkers+=r.ckWorkers;
        sum.ckTotal += r.ckPersonHours;
        sum.shHours+=r.shHours; sum.shWorkers+=r.shWorkers;
        sum.shTotal += r.shPersonHours;
      }
      // 제품별 데이터(내포장·완제품)는 모든 행 합산
      sum.pkEa+=r.pkEa; sum.pkHours+=r.pkHours; sum.pkWorkers+=r.pkWorkers;
      sum.pkTotal += r.pkPersonHours;
      sum.meatKg += r.pkEa*_gramPerEa(r.product);
      sum.prodKg += r.pkEa*_totalGramPerEa(r.product);
      // 비율 컬럼은 0이 아닌 값만 평균에 포함 (분모 0인 케이스 제외)
      ratioKeys.forEach(function(k){
        if(r[k]>0 && isFinite(r[k])) ratioBucket[k].push(r[k]);
      });
      if(r.date) dates[r.date]=true;
    });
    sum.dayCount = Object.keys(dates).length;
    // 비율 평균
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

    if(!_mpRows.length){
      if(st){ st.style.display=''; st.textContent='이 달의 데이터가 없습니다.'; }
      if(tw) tw.style.display='none';
      if(cmp) cmp.style.display='none';
      return;
    }

    // 컬럼 정의 (엑셀 36컬럼 순서 그대로, 번호 제외)
    var COLS = [
      // [key, group, label]
      ['dayNo',   'base',    '생산\n일수'],
      ['date',    'base',    '생산일자'],
      ['product', 'base',    '제품명'],
      ['rmKg',    'base',    '원육 사용량\n(KG)'],
      ['ppKg',    'inout',   '전처리\n(KG)'],
      ['ppHours', 'hours',   '전처리\n작업시간'],
      ['ppWorkers','workers','전처리\n작업인원'],
      ['ppTotal', 'hours',   '전처리\n총 작업시간'],
      ['ckKg',    'inout',   '자숙\n(KG)'],
      ['ckHours', 'hours',   '자숙\n작업시간'],
      ['ckWorkers','workers','자숙\n작업인원'],
      ['ckTotal', 'hours',   '자숙\n총 작업시간'],
      ['shKg',    'inout',   '파쇄\n(KG)'],
      ['shHours', 'hours',   '파쇄\n작업시간'],
      ['shWorkers','workers','파쇄\n작업인원'],
      ['shTotal', 'hours',   '파쇄\n총 작업시간'],
      ['pkEa',    'base',    '내포장\n(EA)'],
      ['pkHours', 'hours',   '내포장\n작업시간'],
      ['pkWorkers','workers','내포장\n작업인원'],
      ['pkTotal', 'hours',   '내포장\n총 작업시간'],
      ['meatKg',  'base',    '완제품 고기\n중량(KG)'],
      ['prodKg',  'base',    '완제품 중량\n(KG)'],
      ['prodPp',  'prod',    '생산성\n전처리'],
      ['prodCk',  'prod',    '생산성\n자숙'],
      ['prodSh',  'prod',    '생산성\n파쇄'],
      ['prodPk',  'prod',    '생산성\n포장'],
      ['prodAll', 'prod',    '생산성\n전체'],
      ['yieldRmPp','yield',  '원료육수율\n전처리'],
      ['yieldRmCk','yield',  '원료육수율\n자숙'],
      ['yieldRmSh','yield',  '원료육수율\n파쇄'],
      ['yieldRmPk','yield',  '원료육수율\n포장'],
      ['yieldPp', 'yield',   '공정수율\n전처리'],
      ['yieldCk', 'yield',   '공정수율\n자숙'],
      ['yieldSh', 'yield',   '공정수율\n파쇄'],
      ['yieldPk', 'yield',   '공정수율\n포장']
    ];

    // 표시할 컬럼만 필터
    var visibleCols = COLS.filter(function(c){ return _mpGrp[c[1]]; });

    // 행 계산 보강 (총 작업시간/생산성/수율)
    var calcRows = _mpRows.map(function(r){
      var ppT = r.ppPersonHours || 0;
      var ckT = r.ckPersonHours || 0;
      var shT = r.shPersonHours || 0;
      var pkT = r.pkPersonHours || 0;
      var meatKg = r.pkEa*_gramPerEa(r.product);
      var prodKg = r.pkEa*_totalGramPerEa(r.product);
      var rm = r.rmKg;
      return Object.assign({}, r, {
        ppTotal:_r2(ppT), ckTotal:_r2(ckT), shTotal:_r2(shT), pkTotal:_r2(pkT),
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

    // 합계
    var sum = _mpAggregate(calcRows);
    var prevSum = _mpAggregate((_mpPrevRows||[]).map(function(r){
      var ppT=r.ppPersonHours||0, ckT=r.ckPersonHours||0, shT=r.shPersonHours||0, pkT=r.pkPersonHours||0;
      var meatKg = r.pkEa*_gramPerEa(r.product);
      var rm = r.rmKg;
      return Object.assign({}, r, {
        ppTotal:ppT, ckTotal:ckT, shTotal:shT, pkTotal:pkT,
        meatKg:meatKg, prodKg:r.pkEa*_totalGramPerEa(r.product),
        prodPp: rm&&ppT?rm/ppT:0,
        prodCk: rm&&ckT?rm/ckT:0,
        prodSh: rm&&shT?rm/shT:0,
        prodPk: rm&&pkT?rm/pkT:0,
        prodAll: rm&&(ppT+ckT+shT+pkT)?rm/(ppT+ckT+shT+pkT):0,
        yieldRmPp: rm?r.ppKg/rm:0,
        yieldRmCk: rm?r.ckKg/rm:0,
        yieldRmSh: rm?r.shKg/rm:0,
        yieldRmPk: rm?meatKg/rm:0,
        yieldPp:   rm?r.ppKg/rm:0,
        yieldCk:   r.ppKg?r.ckKg/r.ppKg:0,
        yieldSh:   r.ckKg?r.shKg/r.ckKg:0,
        yieldPk:   r.shKg?meatKg/r.shKg:0
      });
    }));

    // 헤더
    var thHtml = '<tr>'+visibleCols.map(function(c){
      return '<th>'+c[2].replace(/\n/g,'<br>')+'</th>';
    }).join('')+'</tr>';

    // 데이터 행
    var bodyHtml = calcRows.map(function(r,i){
      return '<tr>'+visibleCols.map(function(c){
        var v = r[c[0]];
        if(c[0]==='date') return '<td>'+(v||'').slice(5)+'</td>';
        if(c[0]==='product') return '<td style="text-align:left;padding-left:8px">'+(v||'')+'</td>';
        if(typeof v==='number'){
          if(v===0) return '<td class="numL">-</td>';   // 진짜 0인 데이터는 - 표시
          var s = c[1]==='yield'||c[1]==='prod' ? v.toFixed(3) : (v%1===0?String(v):v.toFixed(2));
          return '<td class="numL">'+s+'</td>';
        }
        return '<td>'+(v==null?'':v)+'</td>';
      }).join('')+'</tr>';
    }).join('');

    // 합계행 (dayNo, date, product 3컬럼은 라벨 자리)
    function fmtNum(v, c){
      if(v==null) return '';
      if(typeof v!=='number') return String(v);
      if(!isFinite(v)) return '';
      if(c && (c[1]==='yield'||c[1]==='prod')) return v.toFixed(3);
      return v%1===0?String(v):v.toFixed(2);
    }
    function isRatio(c){ return c[1]==='yield'||c[1]==='prod'; }

    var sumHtml = '<tr class="sumRow"><td>합계</td><td colspan="2"></td>'
      + visibleCols.slice(3).map(function(c){
          // 비율 컬럼은 합계 의미 없음 → 빈칸
          if(isRatio(c)) return '<td></td>';
          return '<td class="numL">'+fmtNum(sum[c[0]], c)+'</td>';
        }).join('')
      + '</tr>';

    // 평균행 (생산일수로 나눔, 비율 컬럼은 sum이 이미 평균)
    var dc = sum.dayCount||1;
    var avgHtml = '<tr class="avgRow"><td>평균</td><td colspan="2"></td>'
      + visibleCols.slice(3).map(function(c){
          var v = sum[c[0]]; if(v==null||typeof v!=='number') return '<td></td>';
          if(isRatio(c)) return '<td class="numL">'+fmtNum(v, c)+'</td>';
          return '<td class="numL">'+fmtNum(v/dc, c)+'</td>';
        }).join('')
      + '</tr>';

    // 전월 평균행
    var pdc = prevSum.dayCount||1;
    var prevHtml = '<tr class="prevRow"><td>전월 평균</td><td colspan="2"></td>'
      + visibleCols.slice(3).map(function(c){
          var v = prevSum[c[0]]; if(v==null||typeof v!=='number') return '<td></td>';
          if(isRatio(c)) return '<td class="numL">'+fmtNum(v, c)+'</td>';
          return '<td class="numL">'+fmtNum(v/pdc, c)+'</td>';
        }).join('')
      + '</tr>';

    // 증감율
    var diffHtml = '<tr class="diffRow"><td>증감율(%)</td><td colspan="2"></td>'
      + visibleCols.slice(3).map(function(c){
          var v = sum[c[0]]||0;
          var p = prevSum[c[0]]||0;
          if(!p) return '<td></td>';
          // 비율 컬럼: 이미 평균 → 직접 비교
          var thisV = isRatio(c) ? v : v/dc;
          var prevV = isRatio(c) ? p : p/pdc;
          if(!prevV) return '<td></td>';
          var pct = (thisV - prevV)/prevV*100;
          var color = pct>0?'#1b8a3a':(pct<0?'#c0392b':'#666');
          return '<td class="numL" style="color:'+color+'">'+pct.toFixed(1)+'%</td>';
        }).join('')
      + '</tr>';

    tbl.innerHTML = '<thead>'+thHtml+'</thead><tbody>'+bodyHtml+sumHtml+avgHtml+prevHtml+diffHtml+'</tbody>';
    if(tw) tw.style.display='';
    if(st) st.style.display='none';

    // 비교 박스
    var ymThis=(_mpYm||_ymToday()), ymPrev=_prevYm(ymThis);
    var thisAvg = sum.dayCount?(sum.rmKg/sum.dayCount):0;
    var prevAvg = prevSum.dayCount?(prevSum.rmKg/prevSum.dayCount):0;
    var diff = thisAvg-prevAvg;
    var diffPct = prevAvg?(diff/prevAvg*100):0;
    cmp.innerHTML = '<table>'
      + '<thead><tr><th>구분</th><th>'+ymThis.replace('-','년 ')+'월</th><th>'+ymPrev.replace('-','년 ')+'월</th><th>차이</th><th>증감율(%)</th></tr></thead>'
      + '<tbody>'
      + '<tr><td>일평균 원육사용량</td><td class="numL">'+thisAvg.toFixed(2)+'</td><td class="numL">'+prevAvg.toFixed(2)+'</td><td class="numL" style="color:'+(diff>=0?'#1b8a3a':'#c0392b')+'">'+(diff>=0?'+':'')+diff.toFixed(2)+'</td><td class="numL">'+(diffPct>=0?'+':'')+diffPct.toFixed(1)+'%</td></tr>'
      + '<tr><td>생산일수</td><td>'+sum.dayCount+'</td><td>'+prevSum.dayCount+'</td><td>'+(sum.dayCount-prevSum.dayCount)+'</td><td></td></tr>'
      + '<tr><td>월 누적 원육사용량</td><td class="numL">'+sum.rmKg.toFixed(2)+'</td><td class="numL">'+prevSum.rmKg.toFixed(2)+'</td><td class="numL">'+(sum.rmKg-prevSum.rmKg).toFixed(2)+'</td><td></td></tr>'
      + '<tr><td>월 누적 내포장(EA)</td><td class="numL">'+sum.pkEa.toLocaleString()+'</td><td class="numL">'+prevSum.pkEa.toLocaleString()+'</td><td class="numL">'+(sum.pkEa-prevSum.pkEa).toLocaleString()+'</td><td></td></tr>'
      + '</tbody></table>';
    cmp.style.display='';
  }

  /* ===== 엑셀 다운로드 (36컬럼 풀양식 + 수식 + 자동필터) ===== */
  function _mpDownload(){
    if(!_mpRows.length){ alert('데이터가 없습니다.'); return; }
    if(typeof XLSX==='undefined'){ alert('XLSX 라이브러리 로딩 안됨'); return; }

    var ym = _mpYm||_ymToday();
    var y=ym.slice(0,4), mIdx=parseInt(ym.slice(5),10);
    var sheetName = y+'년 '+String(mIdx).padStart(2,'0')+'월';

    var aoa = [];
    // 행 1~3: 빈줄(타이틀 자리)
    aoa.push([y+'년 '+mIdx+'월 운영팀 월단위 생산량']);
    aoa.push([]);
    aoa.push([]);
    // 행 4: 헤더 1차 (메인)
    aoa.push(['','생산\n일수','생산일자','제품명','원육 사용량\n(KG)',
              '전처리(KG)','전처리\n작업시간','전처리\n작업인원','전처리\n총 작업시간',
              '자숙(KG)','자숙\n작업시간','자숙\n작업인원','자숙\n총 작업시간',
              '파쇄(KG)','파쇄\n작업시간','파쇄\n작업인원','파쇄\n총 작업시간',
              '내포장(EA)','내포장\n작업시간','내포장\n작업인원','내포장\n총 작업시간',
              '완제품 고기\n중량(KG)','완제품 중량\n(KG)',
              '생산성','','','','','원료육수율','','','','공정수율','','','']);
    // 행 5: 헤더 2차 (생산성/수율 하위)
    aoa.push(['','','','','','','','','','','','','','','','','','','','','','','',
              '전처리(KG)','자숙(KG)','파쇄(KG)','포장(KG)','전체 생산성',
              '전처리','자숙','파쇄','포장',
              '전처리','자숙','파쇄','포장']);

    // 데이터 행 시작 = 6행
    var startRow = 6;
    _mpRows.forEach(function(r,i){
      var rowN = startRow+i;
      var isFirst = (r.dateRowIdx===0 || r.dateRowIdx==null);  // 일자별 값은 첫 행에만
      var meatPerEa = _gramPerEa(r.product);
      var totalPerEa = _totalGramPerEa(r.product);

      aoa.push([
        i+1,                                                // A 번호
        r.dayNo,                                            // B 생산일수
        r.date,                                             // C 생산일자
        r.product,                                          // D 제품명
        r.rmKg||'',                                         // E 원육사용량 (분배됨)
        r.ppKg||'',                                         // F 전처리KG (분배됨)
        isFirst ? (r.ppHours||'') : '',                     // G 시간 (첫 행에만)
        isFirst ? (r.ppWorkers||'') : '',                   // H 인원 (첫 행에만)
        isFirst ? {f:'IFERROR(G'+rowN+'*H'+rowN+',"")'} : '', // I 인시
        r.ckKg||'',                                         // J 자숙KG (분배됨)
        isFirst ? (r.ckHours||'') : '',                     // K
        isFirst ? (r.ckWorkers||'') : '',                   // L
        isFirst ? {f:'IFERROR(K'+rowN+'*L'+rowN+',"")'} : '', // M
        r.shKg||'',                                         // N 파쇄KG (분배됨)
        isFirst ? (r.shHours||'') : '',                     // O
        isFirst ? (r.shWorkers||'') : '',                   // P
        isFirst ? {f:'IFERROR(O'+rowN+'*P'+rowN+',"")'} : '', // Q
        r.pkEa||'',                                         // R 내포장EA (제품별)
        r.pkHours||'',                                      // S
        r.pkWorkers||'',                                    // T
        {f:'IFERROR(S'+rowN+'*T'+rowN+',"")'},              // U
        meatPerEa?{f:'R'+rowN+'*'+meatPerEa}:'',           // V 완제품고기중량
        totalPerEa?{f:'R'+rowN+'*'+totalPerEa}:'',         // W 완제품중량
        {f:'IFERROR(E'+rowN+'/I'+rowN+',"")'},              // X 생산성 전처리
        {f:'IFERROR(E'+rowN+'/M'+rowN+',"")'},              // Y
        {f:'IFERROR(E'+rowN+'/Q'+rowN+',"")'},              // Z
        {f:'IFERROR(E'+rowN+'/U'+rowN+',"")'},              // AA
        {f:'IFERROR(E'+rowN+'/SUM(I'+rowN+',M'+rowN+',Q'+rowN+',U'+rowN+'),"")'},  // AB
        {f:'IFERROR(F'+rowN+'/E'+rowN+',"")'},              // AC 원료육수율 전처리
        {f:'IFERROR(J'+rowN+'/E'+rowN+',"")'},              // AD
        {f:'IFERROR(N'+rowN+'/E'+rowN+',"")'},              // AE
        {f:'IFERROR(V'+rowN+'/E'+rowN+',"")'},              // AF
        {f:'IFERROR(AC'+rowN+',"")'},                       // AG 공정수율
        {f:'IFERROR(J'+rowN+'/F'+rowN+',"")'},              // AH
        {f:'IFERROR(N'+rowN+'/J'+rowN+',"")'},              // AI
        {f:'IFERROR(V'+rowN+'/N'+rowN+',"")'}               // AJ
      ]);
    });

    // 합계 행 (SUBTOTAL 사용 → 자동필터와 연동)
    var lastDataRow = startRow + _mpRows.length - 1;
    var sumRowN = lastDataRow + 1;
    var sumRow = [
      '','월 합계','','','',
      {f:'SUBTOTAL(9,F'+startRow+':F'+lastDataRow+')'},
      {f:'SUBTOTAL(9,G'+startRow+':G'+lastDataRow+')'},
      {f:'SUBTOTAL(9,H'+startRow+':H'+lastDataRow+')'},
      {f:'SUBTOTAL(9,I'+startRow+':I'+lastDataRow+')'},
      {f:'SUBTOTAL(9,J'+startRow+':J'+lastDataRow+')'},
      {f:'SUBTOTAL(9,K'+startRow+':K'+lastDataRow+')'},
      {f:'SUBTOTAL(9,L'+startRow+':L'+lastDataRow+')'},
      {f:'SUBTOTAL(9,M'+startRow+':M'+lastDataRow+')'},
      {f:'SUBTOTAL(9,N'+startRow+':N'+lastDataRow+')'},
      {f:'SUBTOTAL(9,O'+startRow+':O'+lastDataRow+')'},
      {f:'SUBTOTAL(9,P'+startRow+':P'+lastDataRow+')'},
      {f:'SUBTOTAL(9,Q'+startRow+':Q'+lastDataRow+')'},
      {f:'SUBTOTAL(9,R'+startRow+':R'+lastDataRow+')'},
      {f:'SUBTOTAL(9,S'+startRow+':S'+lastDataRow+')'},
      {f:'SUBTOTAL(9,T'+startRow+':T'+lastDataRow+')'},
      {f:'SUBTOTAL(9,U'+startRow+':U'+lastDataRow+')'},
      {f:'SUBTOTAL(9,V'+startRow+':V'+lastDataRow+')'},
      {f:'SUBTOTAL(9,W'+startRow+':W'+lastDataRow+')'}
    ];
    // E 합계 (sum 표시용)
    sumRow[4] = {f:'SUBTOTAL(9,E'+startRow+':E'+lastDataRow+')'};
    aoa.push(sumRow);

    // 평균 행 (SUBTOTAL 1)
    var avgRowN = sumRowN+1;
    var avgRow = ['','월 평균','','','',
      {f:'SUBTOTAL(1,F'+startRow+':F'+lastDataRow+')'},
      {f:'SUBTOTAL(1,G'+startRow+':G'+lastDataRow+')'},
      {f:'SUBTOTAL(1,H'+startRow+':H'+lastDataRow+')'},
      {f:'SUBTOTAL(1,I'+startRow+':I'+lastDataRow+')'},
      {f:'SUBTOTAL(1,J'+startRow+':J'+lastDataRow+')'},
      {f:'SUBTOTAL(1,K'+startRow+':K'+lastDataRow+')'},
      {f:'SUBTOTAL(1,L'+startRow+':L'+lastDataRow+')'},
      {f:'SUBTOTAL(1,M'+startRow+':M'+lastDataRow+')'},
      {f:'SUBTOTAL(1,N'+startRow+':N'+lastDataRow+')'},
      {f:'SUBTOTAL(1,O'+startRow+':O'+lastDataRow+')'},
      {f:'SUBTOTAL(1,P'+startRow+':P'+lastDataRow+')'},
      {f:'SUBTOTAL(1,Q'+startRow+':Q'+lastDataRow+')'},
      {f:'SUBTOTAL(1,R'+startRow+':R'+lastDataRow+')'},
      {f:'SUBTOTAL(1,S'+startRow+':S'+lastDataRow+')'},
      {f:'SUBTOTAL(1,T'+startRow+':T'+lastDataRow+')'},
      {f:'SUBTOTAL(1,U'+startRow+':U'+lastDataRow+')'},
      {f:'SUBTOTAL(1,V'+startRow+':V'+lastDataRow+')'},
      {f:'SUBTOTAL(1,W'+startRow+':W'+lastDataRow+')'}
    ];
    avgRow[4] = {f:'SUBTOTAL(1,E'+startRow+':E'+lastDataRow+')'};
    aoa.push(avgRow);

    // SheetJS workbook 생성 (수식 객체는 null로 치환 후 수동 설정)
    var aoaClean = aoa.map(function(row){
      return row.map(function(v){
        return (v && typeof v==='object' && v.f) ? null : v;
      });
    });
    var ws = XLSX.utils.aoa_to_sheet(aoaClean);

    // 수식 셀 수동 삽입
    for(var R=0;R<aoa.length;R++){
      for(var C=0;C<aoa[R].length;C++){
        var v = aoa[R][C];
        if(v && typeof v==='object' && v.f){
          var addr = XLSX.utils.encode_cell({r:R, c:C});
          ws[addr] = {t:'n', f:v.f};
        }
      }
    }
    // !ref 갱신
    ws['!ref'] = XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:aoa.length-1, c:35}});

    // 자동필터 (헤더 5행~데이터 마지막행)
    ws['!autofilter'] = { ref: 'A5:AJ'+lastDataRow };

    // 컬럼 폭
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

    // 5행 헤더 병합 (4행 메인 헤더 X-AB, AC-AF, AG-AJ)
    ws['!merges'] = [
      {s:{r:3,c:23},e:{r:3,c:27}}, // X4:AB4 생산성
      {s:{r:3,c:28},e:{r:3,c:31}}, // AC4:AF4 원료육수율
      {s:{r:3,c:32},e:{r:3,c:35}}  // AG4:AJ4 공정수율
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

  // 다른 메인 메뉴(입력/분석/일정표/출퇴근) 클릭시 pnav 자동 숨김
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
