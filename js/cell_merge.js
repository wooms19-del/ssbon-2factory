// ============================================================
// cell_merge.js — Ctrl(⌘) + 클릭으로 셀 선택 → 엑셀처럼 병합
//   · 같은 열의 인접 행끼리만 병합 (세로 병합)
//   · 합계 / 평균 / 첫값 중 선택
//   · Firestore _config/cell_merges 에 저장 → 새로고침·다른 기기에서도 유지
//   · 병합된 칸 Ctrl+클릭 → 해제
//   · Alt(계산기)와 충돌 없음
// ============================================================
(function(){
  'use strict';

  var SEL = [];              // 선택된 td
  var BAR = null;            // 툴바
  var RULES = null;          // { key: {mode:'sum'|'avg'|'first'} }
  var LOADED = false;
  var APPLYING = false;

  // ── 숫자 추출 ───────────────────────────────────────────
  function num(td){
    if(!td) return null;
    var inp = td.querySelector('input[type="number"]');
    var t = inp ? inp.value : td.textContent;
    var c = String(t||'').replace(/,/g,'').replace(/%/g,'').replace(/\s/g,'').trim();
    if(!c) return null;
    var n = parseFloat(c);
    return isNaN(n) ? null : n;
  }
  function fmt(n){
    if(n == null) return '-';
    var r = Math.round(n*100)/100;
    return r.toLocaleString(undefined,{maximumFractionDigits:2});
  }

  // ── 행 서명 (데이터가 바뀌어도 같은 행을 찾기 위한 열쇠) ──
  // 숫자가 아닌 텍스트 셀만 이어붙임 (날짜 · 제품 · 부위 등)
  function rowSig(tr){
    if(!tr) return '';
    var parts = [];
    Array.prototype.forEach.call(tr.cells, function(td){
      var t = (td.textContent||'').replace(/\s+/g,' ').trim();
      if(!t) return;
      if(num(td) != null && !/[가-힣A-Za-z]/.test(t)) return;  // 순수 숫자 셀 제외
      parts.push(t);
    });
    return parts.join('~').slice(0,120);
  }
  function tableId(td){
    var tb = td.closest('table');
    if(!tb) return '';
    if(tb.id) return tb.id;
    var body = tb.querySelector('tbody[id]');
    return body ? body.id : (tb.className||'tbl');
  }
  // 화면상 열 위치 (rowspan 때문에 cellIndex는 신뢰 불가)
  function colX(td){
    var r = td.getBoundingClientRect();
    return Math.round(r.left + r.width/2);
  }
  // 열 이름 = 같은 x 위치의 헤더 텍스트 (저장 열쇠로 안정적)
  function colName(td){
    var tb = td.closest('table'); if(!tb) return String(td.cellIndex);
    var cx = colX(td);
    var best=null, bd=1e9;
    tb.querySelectorAll('thead th').forEach(function(th){
      var r=th.getBoundingClientRect();
      if(r.width===0) return;
      var d=Math.abs((r.left+r.width/2)-cx);
      if(cx>=r.left-2 && cx<=r.right+2 && d<bd){ bd=d; best=th; }
    });
    return best ? (best.textContent||'').replace(/\s+/g,' ').trim().slice(0,40) : String(td.cellIndex);
  }
  function keyOf(td){
    return tableId(td) + '||' + rowSig(td.parentElement) + '||' + colName(td);
  }

  // ── 저장소 ─────────────────────────────────────────────
  function loadRules(cb){
    if(LOADED){ cb && cb(); return; }
    var done = function(map){ RULES = map || {}; LOADED = true; cb && cb(); };
    try{
      if(typeof db === 'undefined'){ done({}); return; }
      db.collection('_config').doc('cell_merges').get().then(function(d){
        done((d.exists && d.data() && d.data().map) || {});
      }).catch(function(){ done({}); });
    }catch(e){ done({}); }
  }
  function saveRules(){
    try{
      if(typeof db === 'undefined') return;
      db.collection('_config').doc('cell_merges').set({map: RULES||{}}, {merge:true})
        .catch(function(e){ console.error('[병합] 저장 실패', e); });
    }catch(e){ console.error('[병합] 저장 실패', e); }
  }

  // ── 선택 표시 ──────────────────────────────────────────
  function paint(){
    document.querySelectorAll('.cm-sel').forEach(function(el){ el.classList.remove('cm-sel'); });
    SEL.forEach(function(td){ td.classList.add('cm-sel'); });
  }
  function clearSel(){ SEL = []; paint(); hideBar(); }

  // ── 툴바 ───────────────────────────────────────────────
  function showBar(x,y,merged){
    if(!BAR){
      BAR = document.createElement('div');
      BAR.id = 'cm-bar';
      document.body.appendChild(BAR);
    }
    BAR.innerHTML = merged
      ? '<span class="cm-lb">병합된 칸</span><button data-a="unmerge">병합 해제</button><button data-a="cancel">닫기</button>'
      : '<span class="cm-lb">'+SEL.length+'칸 선택</span>'
        + '<button data-a="sum">합계</button><button data-a="avg">평균</button>'
        + '<button data-a="first">첫값</button><button data-a="cancel">취소</button>';
    BAR.style.display = 'flex';
    BAR.style.left = Math.min(x, window.innerWidth-330)+'px';
    BAR.style.top  = Math.max(8, y-50)+'px';
  }
  function hideBar(){ if(BAR) BAR.style.display='none'; }

  // ── 병합 실행 (DOM) ────────────────────────────────────
  function applyMerge(tds, mode){
    if(!tds.length) return;
    var vals = tds.map(num).filter(function(v){ return v!=null; });
    var v = null;
    if(mode==='sum')   v = vals.reduce(function(a,b){return a+b;},0);
    if(mode==='avg')   v = vals.length ? vals.reduce(function(a,b){return a+b;},0)/vals.length : null;
    if(mode==='first') v = vals.length ? vals[0] : null;
    var head = tds[0];
    head.rowSpan = tds.length;
    head.innerHTML = fmt(v);
    head.classList.add('cm-merged');
    head.title = '병합됨 ('+(mode==='sum'?'합계':mode==='avg'?'평균':'첫값')+') — Ctrl+클릭으로 해제';
    for(var i=1;i<tds.length;i++){ tds[i].style.display='none'; tds[i].classList.add('cm-hidden'); }
  }

  // ── 저장된 규칙 재적용 ─────────────────────────────────
  function reapply(){
    if(!RULES || APPLYING) return;
    APPLYING = true;
    try{
      Object.keys(RULES).forEach(function(k){
        var rule = RULES[k];
        var p = k.split('||');
        if(p.length < 3) return;
        var tid = p[0], sig = p[1], cname = p[2];
        var tb = document.getElementById(tid);
        var scope = tb ? (tb.closest('table') || tb) : document;
        var trs = scope.querySelectorAll('tr');
        for(var i=0;i<trs.length;i++){
          if(rowSig(trs[i]) !== sig) continue;
          var group = [];
          for(var j=i; j<trs.length && group.length<(rule.span||2); j++){
            var td = null;
            Array.prototype.forEach.call(trs[j].cells, function(c){
              if(!td && colName(c) === cname && num(c) != null) td = c;
            });
            if(!td || td.classList.contains('cm-merged') || td.classList.contains('cm-hidden')) { group=[]; break; }
            group.push(td);
          }
          if(group.length >= 2) applyMerge(group, rule.mode||'sum');
          break;
        }
      });
    }catch(e){ console.error('[병합] 재적용 실패', e); }
    APPLYING = false;
  }

  // ── 이벤트 ─────────────────────────────────────────────
  document.addEventListener('click', function(e){
    var mod = e.ctrlKey || e.metaKey;
    if(!mod) return;
    var td = e.target.closest ? e.target.closest('td') : null;
    if(!td) return;
    if(e.target.tagName==='INPUT' || e.target.tagName==='BUTTON') return;
    e.preventDefault(); e.stopPropagation();

    // 이미 병합된 칸 → 해제 메뉴
    if(td.classList.contains('cm-merged')){
      SEL = [td];
      paint();
      showBar(e.clientX, e.clientY, true);
      return;
    }
    if(num(td) == null) return;
    var i = SEL.indexOf(td);
    if(i>=0) SEL.splice(i,1); else SEL.push(td);
    paint();
    if(SEL.length >= 2) showBar(e.clientX, e.clientY, false);
    else hideBar();
  }, true);

  document.addEventListener('click', function(e){
    if(!BAR || BAR.style.display==='none') return;
    var btn = e.target.closest ? e.target.closest('#cm-bar button') : null;
    if(!btn) return;
    e.preventDefault(); e.stopPropagation();
    var a = btn.dataset.a;

    if(a==='cancel'){ clearSel(); return; }

    if(a==='unmerge'){
      var td = SEL[0];
      if(td){
        var k = td.dataset.cmKey;
        td.rowSpan = 1;
        td.classList.remove('cm-merged');
        if(k && RULES && RULES[k]){ delete RULES[k]; saveRules(); }
        var tr = td.parentElement;
        var trs = tr.parentElement.querySelectorAll('tr');
        var st = Array.prototype.indexOf.call(trs, tr);
        for(var j=st+1;j<trs.length;j++){
          var found=null;
          Array.prototype.forEach.call(trs[j].cells, function(c){
            if(c.classList.contains('cm-hidden') && !found) found=c;
          });
          if(found){ found.style.display=''; found.classList.remove('cm-hidden'); }
          else break;
        }
      }
      clearSel();
      if(typeof toast==='function') toast('병합 해제됨');
      return;
    }

    // 병합 — 같은 열 · 인접 행만
    var tds = SEL.slice().sort(function(x,y){ return x.parentElement.rowIndex - y.parentElement.rowIndex; });
    var cx0 = colX(tds[0]);
    var sameCol = tds.every(function(t){ return Math.abs(colX(t)-cx0) <= 4; });
    if(!sameCol){ alert('같은 열의 칸만 병합할 수 있습니다.'); return; }
    var rows = tds.map(function(t){ return t.parentElement.rowIndex; });
    for(var q=1;q<rows.length;q++){
      if(rows[q] !== rows[q-1]+1){ alert('붙어 있는 행끼리만 병합할 수 있습니다.'); return; }
    }
    var key = keyOf(tds[0]);
    applyMerge(tds, a);
    tds[0].dataset.cmKey = key;
    RULES = RULES || {};
    RULES[key] = { mode:a, span: tds.length };
    saveRules();
    clearSel();
    if(typeof toast==='function') toast('병합됨 — 다음에 열어도 유지됩니다');
  }, true);

  document.addEventListener('keydown', function(e){ if(e.key==='Escape') clearSel(); });

  // ── CSS ────────────────────────────────────────────────
  var st = document.createElement('style');
  st.textContent =
    '.cm-sel{background:#fde68a !important;outline:1px solid #d97706 !important}'
   +'.cm-merged{background:#eef2ff !important;vertical-align:middle !important}'
   +'#cm-bar{position:fixed;display:none;gap:6px;align-items:center;z-index:99999;'
   +'background:#1f2430;color:#fff;padding:7px 10px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.28);font-size:12px}'
   +'#cm-bar .cm-lb{opacity:.8;margin-right:2px}'
   +'#cm-bar button{background:#374151;color:#fff;border:none;border-radius:5px;padding:5px 10px;font-size:12px;cursor:pointer}'
   +'#cm-bar button:hover{background:#4b5563}';
  document.head.appendChild(st);

  // ── 표가 다시 그려질 때마다 재적용 ─────────────────────
  var timer = null;
  function schedule(){ clearTimeout(timer); timer = setTimeout(reapply, 250); }
  loadRules(function(){
    schedule();
    var mo = new MutationObserver(function(muts){
      if(APPLYING) return;
      for(var i=0;i<muts.length;i++){
        var t = muts[i].target;
        if(t && t.closest && t.closest('table')){ schedule(); return; }
      }
    });
    mo.observe(document.body, {childList:true, subtree:true});
  });

  window.cmReapply = reapply;
})();
