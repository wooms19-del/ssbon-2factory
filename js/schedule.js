// ============================================================
// 일정표  js/schedule.js  v3
// ============================================================
var _schYear  = new Date().getFullYear();
var _schMonth = new Date().getMonth();
var _schTab   = 'input'; // 'input' | 'view'

function _schDocId(y,m){ return y+'-'+String(m+1).padStart(2,'0'); }

function initSchedule(){
  _schYear  = new Date().getFullYear();
  _schMonth = new Date().getMonth();
  _schTab   = 'input';
  renderSchedule();
}
function setModeSchedule(){
  document.querySelectorAll('.mb').forEach(function(b){b.classList.remove('on');});
  var sb=document.getElementById('schHdBtn'); if(sb)sb.classList.add('on');
  var inav=document.getElementById('inav'); if(inav)inav.classList.add('hid');
  var dnav=document.getElementById('dnav'); if(dnav)dnav.classList.add('hid');
  document.querySelectorAll('.pg').forEach(function(p){p.classList.remove('on');});
  var ap=document.getElementById('p-schedule'); if(ap)ap.classList.add('on');
  var ms=document.getElementById('mscroll'); if(ms)ms.scrollTop=0;
  initSchedule();
}
function schPrevMonth(){ _schMonth--; if(_schMonth<0){_schMonth=11;_schYear--;} renderSchedule(); }
function schNextMonth(){ _schMonth++; if(_schMonth>11){_schMonth=0;_schYear++;} renderSchedule(); }
function schGoToday(){ _schYear=new Date().getFullYear(); _schMonth=new Date().getMonth(); renderSchedule(); }
function schSwitchTab(t){ _schTab=t; renderSchedule(); }

// ── 카테고리 ──────────────────────────────────────────────────
var SCH_CAT={
  prod: {label:'생산',color:'#1a56db',bg:'#eff6ff'},
  in:   {label:'입고',color:'#166534',bg:'#f0fdf4'},
  check:{label:'점검',color:'#b45309',bg:'#fffbeb'},
  cert: {label:'인증',color:'#7c3aed',bg:'#f5f3ff'},
  etc:  {label:'기타',color:'#374151',bg:'#f9fafb'},
};
function _autocat(t){
  if(/생산|포장|자숙|파쇄|전처리/.test(t))return'prod';
  if(/입고|납품|출고|배송/.test(t))return'in';
  if(/점검|청소|정비|수리|설비/.test(t))return'check';
  if(/HACCP|haccp|인증|심사|검사|허가/.test(t))return'cert';
  return'etc';
}

// ── 메인 렌더 ─────────────────────────────────────────────────
function renderSchedule(){
  var pg=document.getElementById('p-schedule');
  if(!pg) return;
  var docId=_schDocId(_schYear,_schMonth);

  // 헤더
  var html='<div style="background:var(--bg);border-bottom:var(--br)">'
    // 월 네비
    +'<div style="padding:10px 14px 0;display:flex;align-items:center;gap:8px;justify-content:space-between">'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<button class="btn" style="padding:4px 10px;font-size:13px" onclick="schPrevMonth()">◀</button>'
    +'<span style="font-size:16px;font-weight:700">'+_schYear+'년 '+(_schMonth+1)+'월</span>'
    +'<button class="btn" style="padding:4px 10px;font-size:13px" onclick="schNextMonth()">▶</button>'
    +'</div>'
    +'<button class="btn" style="padding:4px 12px;font-size:12px" onclick="schGoToday()">오늘</button>'
    +'</div>'
    // 서브탭
    +'<div style="display:flex;gap:0;padding:0 14px;margin-top:6px">'
    +['input','view'].map(function(t){
      var on=_schTab===t;
      var lb=t==='input'?'일정 저장':'일정 현황';
      return '<button onclick="schSwitchTab(\''+t+'\')" style="padding:8px 18px;font-size:13px;font-weight:'+(on?'700':'500')+';color:'+(on?'var(--p)':'var(--g5)')+';border-bottom:'+(on?'2px solid var(--p)':'2px solid transparent')+';background:none;border-top:none;border-left:none;border-right:none;cursor:pointer">'+lb+'</button>';
    }).join('')
    +'</div>'
    +'</div>'
    +'<div id="sch_body" style="padding:14px"></div>';

  pg.innerHTML=html;

  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var data=doc.exists?doc.data():{events:{},summary:{}};
    if(_schTab==='input') _renderSchInput(data.events||{}, data.summary||{});
    else _renderSchView(data.events||{});
  }).catch(function(){
    if(_schTab==='input') _renderSchInput({},{});
    else _renderSchView({});
  });
}

// ── 일정 저장 탭 ──────────────────────────────────────────────
function _renderSchInput(events, summary){
  var el=document.getElementById('sch_body');
  if(!el) return;
  var lastDate=new Date(_schYear,_schMonth+1,0).getDate();
  var today=new Date();

  // 예상생산량 섹션
  var items=summary.items||[];
  var sumSection='<div style="background:var(--g1);border-radius:10px;padding:12px;border:0.5px solid var(--g2);margin-bottom:14px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    +'<span style="font-size:13px;font-weight:700">📊 예상생산량</span>'
    +'<button class="btn" style="padding:3px 10px;font-size:11px" onclick="schEditSummary()">✏️ 수정</button>'
    +'</div>';
  if(items.length){
    sumSection+='<div style="display:flex;flex-wrap:wrap;gap:8px">';
    items.forEach(function(it){
      sumSection+='<div style="background:#fff;border:0.5px solid var(--g2);border-radius:6px;padding:4px 10px">'
        +'<span style="font-size:11px;color:#1a56db;font-weight:600">'+it.name+'</span>'
        +' <span style="font-size:11px;color:var(--g6)">'+it.qty+'</span></div>';
    });
    sumSection+='</div>';
    if(summary.rawMeat) sumSection+='<div style="font-size:11px;color:var(--g5);margin-top:6px">원육투입량: '+summary.rawMeat+(summary.workDays?' · 생산일: '+summary.workDays+'일':'')+'</div>';
  } else {
    sumSection+='<div style="font-size:12px;color:var(--g4)">예상생산량 없음 — 수정 버튼으로 입력</div>';
  }
  sumSection+='</div>';

  // 날짜별 입력 테이블
  var tableHtml='<div style="background:var(--bg);border-radius:10px;border:0.5px solid var(--g2);overflow:hidden;margin-bottom:14px">';
  for(var d=1;d<=lastDate;d++){
    var ds=_schYear+'-'+String(_schMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var dt=new Date(_schYear,_schMonth,d);
    var dow=['일','월','화','수','목','금','토'][dt.getDay()];
    var isToday=d===today.getDate()&&_schMonth===today.getMonth()&&_schYear===today.getFullYear();
    var isSun=dt.getDay()===0, isSat=dt.getDay()===6;
    var dayColor=isSun?'var(--d)':isSat?'#1a56db':'var(--g7)';
    var dayEvts=events[ds]||[];
    var existing=dayEvts.map(function(e){return e.title;}).join(', ');

    tableHtml+='<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:0.5px solid var(--g2);background:'+(isToday?'#f0f7ff':'var(--bg)')+'">'
      // 날짜
      +'<div style="min-width:44px;text-align:center">'
      +'<span style="font-size:14px;font-weight:'+(isToday?'700':'500')+';color:'+dayColor+'">'+d+'</span>'
      +'<span style="font-size:11px;color:'+dayColor+';margin-left:3px">('+dow+')</span>'
      +'</div>'
      // 입력칸
      +'<input class="fc" id="sch_inp_'+d+'" value="'+existing.replace(/"/g,'&quot;')+'" placeholder="일정 입력..." '
      +'style="flex:1;padding:6px 8px;font-size:13px">'
      +'</div>';
  }
  tableHtml+='</div>';

  var saveBtn='<button class="btn bp bblk" style="width:100%;padding:10px;font-size:14px" onclick="schSaveAll()">💾 저장</button>';

  el.innerHTML=sumSection+tableHtml+saveBtn;
}

// ── 일정 저장 ─────────────────────────────────────────────────
function schSaveAll(){
  var lastDate=new Date(_schYear,_schMonth+1,0).getDate();
  var events={};
  for(var d=1;d<=lastDate;d++){
    var el2=document.getElementById('sch_inp_'+d);
    if(!el2) continue;
    var val=el2.value.trim();
    if(!val) continue;
    var ds=_schYear+'-'+String(_schMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    // 쉼표로 여러 일정 구분
    var parts=val.split(',').map(function(s){return s.trim();}).filter(Boolean);
    events[ds]=parts.map(function(t){return{title:t,cat:_autocat(t)};});
  }
  var docId=_schDocId(_schYear,_schMonth);
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var data=doc.exists?doc.data():{events:{},summary:{}};
    data.events=events;
    data.updatedAt=new Date().toISOString();
    return firebase.firestore().collection('schedules').doc(docId).set(data);
  }).then(function(){
    toast('일정 저장 완료 ✓','s');
    _schTab='view';
    renderSchedule();
  });
}

// ── 일정 현황 탭 (캘린더) ─────────────────────────────────────
function _renderSchView(events){
  var el=document.getElementById('sch_body');
  if(!el) return;
  var today=new Date();
  var firstDay=new Date(_schYear,_schMonth,1).getDay();
  var lastDate=new Date(_schYear,_schMonth+1,0).getDate();
  var days=['일','월','화','수','목','금','토'];

  var html='<table style="width:100%;border-collapse:collapse;table-layout:fixed">';
  // 요일 헤더
  html+='<tr>';
  days.forEach(function(d,i){
    var c=i===0?'var(--d)':i===6?'#1a56db':'var(--g6)';
    html+='<th style="padding:8px 4px;font-size:13px;color:'+c+';font-weight:600;text-align:center;border-bottom:2px solid var(--g2)">'+d+'</th>';
  });
  html+='</tr>';

  var date=1;
  for(var wk=0;wk<6;wk++){
    if(date>lastDate) break;
    html+='<tr>';
    for(var dw=0;dw<7;dw++){
      if((wk===0&&dw<firstDay)||date>lastDate){
        html+='<td style="height:110px;border:0.5px solid var(--g2);background:var(--g1)"></td>';
      } else {
        var ds=_schYear+'-'+String(_schMonth+1).padStart(2,'0')+'-'+String(date).padStart(2,'0');
        var isToday=date===today.getDate()&&_schMonth===today.getMonth()&&_schYear===today.getFullYear();
        var isSun=dw===0,isSat=dw===6;
        var dc=isSun?'var(--d)':isSat?'#1a56db':'var(--g7)';
        var dayEvts=events[ds]||[];
        html+='<td style="height:110px;vertical-align:top;padding:4px;border:0.5px solid var(--g2);background:'+(isToday?'#eff6ff':'var(--bg)')+'">';
        html+='<div style="font-size:13px;font-weight:'+(isToday?'700':'500')+';color:'+dc+';'
          +(isToday?'width:24px;height:24px;background:#1a56db;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;':'')+'">'+date+'</div>';
        dayEvts.forEach(function(ev){
          var cat=SCH_CAT[ev.cat]||SCH_CAT.etc;
          html+='<div style="font-size:11px;padding:2px 5px;margin-top:2px;border-radius:3px;background:'+cat.bg+';color:'+cat.color+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+ev.title+'">'+ev.title+'</div>';
        });
        html+='</td>';
        date++;
      }
    }
    html+='</tr>';
  }
  html+='</table>';
  el.innerHTML=html;
}

// ── 예상생산량 수정 모달 ───────────────────────────────────────
function schEditSummary(){
  var docId=_schDocId(_schYear,_schMonth);
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var data=doc.exists?doc.data():{events:{},summary:{}};
    var summary=data.summary||{};
    var items=summary.items||[];
    var rows=items.map(function(it,i){
      return '<div style="display:flex;gap:6px;margin-bottom:6px">'
        +'<input class="fc" value="'+it.name+'" placeholder="제품명" style="flex:1;padding:5px 8px;font-size:12px" id="sn'+i+'">'
        +'<input class="fc" value="'+it.qty+'"  placeholder="수량" style="flex:1;padding:5px 8px;font-size:12px" id="sq'+i+'">'
        +'<button class="btn" style="padding:2px 8px;font-size:12px;color:var(--d)" onclick="this.parentNode.remove()">×</button>'
        +'</div>';
    }).join('');
    var body='<div id="sch_sitems">'+rows+'</div>'
      +'<button class="btn" style="width:100%;padding:6px;font-size:12px;margin-bottom:10px" onclick="schAddSummaryRow()">+ 제품 추가</button>'
      +'<div style="display:flex;flex-direction:column;gap:6px">'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:80px">원육투입량</span><input class="fc" id="sch_rm" value="'+(summary.rawMeat||'')+'" placeholder="-13ton" style="flex:1;padding:5px 8px;font-size:12px"></div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:80px">생산일 수</span><input class="fc" id="sch_wd" value="'+(summary.workDays||'')+'" placeholder="22" type="number" style="flex:1;padding:5px 8px;font-size:12px"></div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:80px">특이사항</span><textarea class="fc" id="sch_nt" rows="3" style="flex:1;padding:5px 8px;font-size:12px;resize:vertical">'+(summary.notes||'')+'</textarea></div>'
      +'</div>'
      +'<button class="btn bp bblk" style="width:100%;padding:8px;margin-top:12px" onclick="schSaveSummary(\''+docId+'\')">저장</button>';
    _schShowModal(_schYear+'년 '+(_schMonth+1)+'월 예상생산량', body);
  });
}
function schAddSummaryRow(){
  var w=document.getElementById('sch_sitems'); if(!w) return;
  var i=w.children.length;
  var div=document.createElement('div');
  div.style.cssText='display:flex;gap:6px;margin-bottom:6px';
  div.innerHTML='<input class="fc" placeholder="제품명" style="flex:1;padding:5px 8px;font-size:12px" id="sn'+i+'">'
    +'<input class="fc" placeholder="수량" style="flex:1;padding:5px 8px;font-size:12px" id="sq'+i+'">'
    +'<button class="btn" style="padding:2px 8px;font-size:12px;color:var(--d)" onclick="this.parentNode.remove()">×</button>';
  w.appendChild(div);
}
function schSaveSummary(docId){
  var w=document.getElementById('sch_sitems');
  var items=[];
  if(w) Array.from(w.children).forEach(function(row){
    var ne=row.querySelector('[id^="sn"]'),qe=row.querySelector('[id^="sq"]');
    var n=ne?ne.value.trim():'',q=qe?qe.value.trim():'';
    if(n) items.push({name:n,qty:q});
  });
  var rm=(document.getElementById('sch_rm')||{}).value||'';
  var wd=(document.getElementById('sch_wd')||{}).value||'';
  var nt=(document.getElementById('sch_nt')||{}).value||'';
  var ref=firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    var data=doc.exists?doc.data():{events:{},summary:{}};
    data.summary={items:items,rawMeat:rm,workDays:wd,notes:nt};
    data.updatedAt=new Date().toISOString();
    return ref.set(data);
  }).then(function(){
    toast('저장 완료 ✓','s');
    _schCloseModal();
    renderSchedule();
  });
}

// ── 모달 ──────────────────────────────────────────────────────
function _schShowModal(title,body){
  var ex=document.getElementById('sch_modal_wrap'); if(ex)ex.remove();
  var wrap=document.createElement('div');
  wrap.id='sch_modal_wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  wrap.innerHTML='<div style="background:#fff;border-radius:12px;width:100%;max-width:460px;max-height:85vh;overflow-y:auto;padding:20px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<span style="font-size:15px;font-weight:700">'+title+'</span>'
    +'<button onclick="_schCloseModal()" style="font-size:18px;color:var(--g4);background:none;border:none;cursor:pointer">✕</button>'
    +'</div>'+body+'</div>';
  document.body.appendChild(wrap);
}
function _schCloseModal(){
  var w=document.getElementById('sch_modal_wrap'); if(w)w.remove();
}

// ── window 바인딩 ─────────────────────────────────────────────
window.setModeSchedule  = setModeSchedule;
window.initSchedule     = initSchedule;
window.renderSchedule   = renderSchedule;
window.schPrevMonth     = schPrevMonth;
window.schNextMonth     = schNextMonth;
window.schGoToday       = schGoToday;
window.schSwitchTab     = schSwitchTab;
window.schSaveAll       = schSaveAll;
window.schEditSummary   = schEditSummary;
window.schAddSummaryRow = schAddSummaryRow;
window.schSaveSummary   = schSaveSummary;
window._schCloseModal   = _schCloseModal;
