// ============================================================
// 일정표  js/schedule.js  v2
// ============================================================
var _schYear  = new Date().getFullYear();
var _schMonth = new Date().getMonth();

function _schDocId(y,m){ return y+'-'+String(m+1).padStart(2,'0'); }

function initSchedule(){
  _schYear  = new Date().getFullYear();
  _schMonth = new Date().getMonth();
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

// ── 카테고리 ─────────────────────────────────────────────────
var SCH_CAT = {
  prod:  {label:'생산', color:'#1a56db', bg:'#eff6ff'},
  in:    {label:'입고', color:'#166534', bg:'#f0fdf4'},
  check: {label:'점검', color:'#b45309', bg:'#fffbeb'},
  cert:  {label:'인증', color:'#7c3aed', bg:'#f5f3ff'},
  etc:   {label:'기타', color:'#374151', bg:'#f9fafb'},
};

// ── 텍스트 파싱: "4/7 HACCP 심사\n4/8 원료 입고" → [{date,title,cat}] ──
function _parseSchText(text, year, month){
  var lines = text.split('\n');
  var result = {};
  lines.forEach(function(line){
    line = line.trim();
    if(!line) return;
    // 날짜 패턴: "4/7", "04/07", "7일", "4월7일" 등
    var m = line.match(/^(\d{1,2})[\/\.\-월](\d{1,2})[일]?\s*(.*)/);
    if(!m) m = line.match(/^(\d{1,2})[일]\s*(.*)/);
    var dateStr, title;
    if(m && m.length >= 3 && parseInt(m[1])<=12 && parseInt(m[2])<=31){
      // m/d 형식
      var mm = parseInt(m[1]), dd = parseInt(m[2]);
      title = m[3] ? m[3].trim() : '';
      // 월이 현재 월과 다르면 무시하거나 허용
      dateStr = year+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
    } else {
      // 월 없이 일만: "7일 내용"
      var m2 = line.match(/^(\d{1,2})[일\s]\s*(.*)/);
      if(m2){
        var dd2 = parseInt(m2[1]);
        title = m2[2] ? m2[2].trim() : '';
        dateStr = year+'-'+String(month+1).padStart(2,'0')+'-'+String(dd2).padStart(2,'0');
      } else {
        return; // 날짜 없는 줄 무시
      }
    }
    if(!title) return;
    // 카테고리 자동 감지
    var cat = 'etc';
    if(/생산|포장|자숙|파쇄|전처리/.test(title)) cat='prod';
    else if(/입고|납품|출고|배송/.test(title)) cat='in';
    else if(/점검|청소|정비|수리|설비/.test(title)) cat='check';
    else if(/HACCP|haccp|인증|심사|검사|허가/.test(title)) cat='cert';
    if(!result[dateStr]) result[dateStr]=[];
    result[dateStr].push({title:title, cat:cat});
  });
  return result;
}

// ── 이벤트 → 텍스트 변환 (수정용) ───────────────────────────
function _eventsToText(events, year, month){
  var lines = [];
  // 날짜 순 정렬
  var keys = Object.keys(events).sort();
  keys.forEach(function(ds){
    var parts = ds.split('-');
    var m = parseInt(parts[1]), d = parseInt(parts[2]);
    (events[ds]||[]).forEach(function(ev){
      lines.push(m+'/'+d+' '+ev.title);
    });
  });
  return lines.join('\n');
}

// ── 메인 렌더 ─────────────────────────────────────────────────
function renderSchedule(){
  var pg = document.getElementById('p-schedule');
  if(!pg) return;
  var docId = _schDocId(_schYear, _schMonth);

  pg.innerHTML = '<div style="padding:10px 14px 0;display:flex;align-items:center;gap:8px;justify-content:space-between">'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<button class="btn" style="padding:4px 10px;font-size:13px" onclick="schPrevMonth()">◀</button>'
    +'<span style="font-size:17px;font-weight:700">'+_schYear+'년 '+(_schMonth+1)+'월</span>'
    +'<button class="btn" style="padding:4px 10px;font-size:13px" onclick="schNextMonth()">▶</button>'
    +'</div>'
    +'<button class="btn" style="padding:4px 12px;font-size:12px" onclick="schGoToday()">오늘</button>'
    +'</div>'
    +'<div style="display:flex;gap:12px;padding:10px 14px 14px">'
    +'  <div style="flex:1;min-width:0" id="sch_cal"></div>'
    +'  <div style="width:220px;min-width:180px" id="sch_right"></div>'
    +'</div>';

  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var data = doc.exists ? doc.data() : {events:{}, summary:{}};
    _renderSchCal(data.events||{});
    _renderSchRight(data.events||{}, data.summary||{});
  }).catch(function(){ _renderSchCal({}); _renderSchRight({},{}); });
}

// ── 캘린더 ────────────────────────────────────────────────────
function _renderSchCal(events){
  var el = document.getElementById('sch_cal');
  if(!el) return;
  var today = new Date();
  var firstDay = new Date(_schYear,_schMonth,1).getDay();
  var lastDate = new Date(_schYear,_schMonth+1,0).getDate();
  var days = ['일','월','화','수','목','금','토'];
  var html = '<table style="width:100%;border-collapse:collapse">';
  html += '<tr>';
  days.forEach(function(d,i){
    var c = i===0?'var(--d)':i===6?'#1a56db':'var(--g6)';
    html += '<th style="padding:4px 2px;font-size:11px;color:'+c+';font-weight:600;text-align:center;border-bottom:1px solid var(--g2)">'+d+'</th>';
  });
  html += '</tr>';
  var date=1;
  for(var wk=0;wk<6;wk++){
    if(date>lastDate) break;
    html += '<tr>';
    for(var dw=0;dw<7;dw++){
      if((wk===0&&dw<firstDay)||date>lastDate){
        html += '<td style="height:72px;border:0.5px solid var(--g2);background:var(--g1)"></td>';
      } else {
        var ds = _schYear+'-'+String(_schMonth+1).padStart(2,'0')+'-'+String(date).padStart(2,'0');
        var isToday = date===today.getDate()&&_schMonth===today.getMonth()&&_schYear===today.getFullYear();
        var isSun=dw===0, isSat=dw===6;
        var dc = isSun?'var(--d)':isSat?'#1a56db':'var(--g7)';
        var dayEvts = events[ds]||[];
        html += '<td style="height:72px;vertical-align:top;padding:3px;border:0.5px solid var(--g2);cursor:pointer;background:'+(isToday?'#eff6ff':'var(--bg)')+'" onclick="schDayClick(\''+ds+'\')">';
        html += '<div style="font-size:12px;font-weight:'+(isToday?'700':'500')+';color:'+dc+';'+(isToday?'width:20px;height:20px;background:#1a56db;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;':'')+'">'+date+'</div>';
        dayEvts.slice(0,2).forEach(function(ev){
          var cat=SCH_CAT[ev.cat]||SCH_CAT.etc;
          html += '<div style="font-size:10px;padding:1px 4px;margin-top:1px;border-radius:3px;background:'+cat.bg+';color:'+cat.color+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+ev.title+'</div>';
        });
        if(dayEvts.length>2) html += '<div style="font-size:10px;color:var(--g4)">+'+( dayEvts.length-2)+'</div>';
        html += '</td>';
        date++;
      }
    }
    html += '</tr>';
  }
  html += '</table>';
  el.innerHTML = html;
}

// ── 오른쪽 패널 ───────────────────────────────────────────────
function _renderSchRight(events, summary){
  var el = document.getElementById('sch_right');
  if(!el) return;
  var items = summary.items||[];
  var rawMeat = summary.rawMeat||'';
  var workDays = summary.workDays||'';
  var notes = summary.notes||'';

  // ① 예상 생산량 패널
  var sumHtml = '<div style="background:var(--g1);border-radius:10px;padding:12px;border:0.5px solid var(--g2);margin-bottom:10px">';
  sumHtml += '<div style="font-size:12px;font-weight:700;color:var(--g6);margin-bottom:8px">'+_schYear+'년 '+(_schMonth+1)+'월 예상생산량</div>';
  items.forEach(function(it){
    sumHtml += '<div style="margin-bottom:6px"><div style="font-size:12px;font-weight:600;color:#1a56db">'+it.name+'</div>';
    sumHtml += '<div style="font-size:12px;color:var(--g6)">'+it.qty+'</div></div>';
  });
  if(rawMeat) sumHtml += '<div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--g3)"><div style="font-size:12px;font-weight:700;color:var(--g6)">원육투입량(예상)</div><div style="font-size:13px;color:var(--g7)">'+rawMeat+'</div></div>';
  if(workDays) sumHtml += '<div style="font-size:12px;color:var(--g5);margin-top:4px">생산일 - '+workDays+'일</div>';
  if(notes) sumHtml += '<div style="font-size:11px;color:var(--g5);margin-top:6px;white-space:pre-wrap">'+notes+'</div>';
  sumHtml += '<button class="btn" style="width:100%;margin-top:10px;padding:6px;font-size:12px" onclick="schEditSummary()">✏️ 수정</button>';
  sumHtml += '</div>';

  // ② 일정 일괄 입력 패널
  var existingText = _eventsToText(events, _schYear, _schMonth);
  var bulkHtml = '<div style="background:var(--g1);border-radius:10px;padding:12px;border:0.5px solid var(--g2)">';
  bulkHtml += '<div style="font-size:12px;font-weight:700;color:var(--g6);margin-bottom:6px">📅 일정 입력</div>';
  bulkHtml += '<div style="font-size:11px;color:var(--g4);margin-bottom:6px">예) 4/7 HACCP 심사<br>4/8 원료 입고<br>4/14 설비 점검</div>';
  bulkHtml += '<textarea id="sch_bulk_input" rows="8" style="width:100%;padding:6px 8px;font-size:12px;border-radius:6px;border:1px solid var(--g3);resize:vertical;box-sizing:border-box" placeholder="4/7 HACCP 심사&#10;4/8 원료 입고&#10;4/14 설비 점검">'+existingText+'</textarea>';
  bulkHtml += '<button class="btn bp bblk" style="width:100%;padding:8px;margin-top:8px;font-size:12px" onclick="schSaveBulk()">저장</button>';
  bulkHtml += '</div>';

  el.innerHTML = sumHtml + bulkHtml;
}

// ── 일괄 저장 ─────────────────────────────────────────────────
function schSaveBulk(){
  var text = (document.getElementById('sch_bulk_input')||{}).value||'';
  var events = _parseSchText(text, _schYear, _schMonth);
  var docId = _schDocId(_schYear, _schMonth);
  var ref = firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    var data = doc.exists ? doc.data() : {events:{}, summary:{}};
    data.events = events;
    data.updatedAt = new Date().toISOString();
    return ref.set(data);
  }).then(function(){
    toast('일정 저장 완료 ✓','s');
    renderSchedule();
  });
}

// ── 날짜 클릭 → 해당 날 수정 ─────────────────────────────────
function schDayClick(ds){
  var parts=ds.split('-'), mm=parseInt(parts[1]), dd=parseInt(parts[2]);
  var textarea=document.getElementById('sch_bulk_input');
  if(!textarea) return;
  // textarea에서 해당 날짜 줄로 스크롤 포커스
  var lines=textarea.value.split('\n');
  var prefix=mm+'/'+dd+' ';
  var found=lines.findIndex(function(l){return l.startsWith(prefix);});
  if(found>=0){
    // 해당 줄 선택
    var start=lines.slice(0,found).join('\n').length+(found>0?1:0);
    var end=start+lines[found].length;
    textarea.focus();
    textarea.setSelectionRange(start,end);
  } else {
    // 새 줄 추가
    var val=textarea.value;
    var newLine=prefix;
    textarea.value = val+(val&&!val.endsWith('\n')?'\n':'')+newLine;
    textarea.focus();
    var pos=textarea.value.length;
    textarea.setSelectionRange(pos,pos);
  }
}

// ── 요약 수정 모달 ─────────────────────────────────────────────
function schEditSummary(){
  var docId=_schDocId(_schYear,_schMonth);
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var data=doc.exists?doc.data():{events:{},summary:{}};
    var summary=data.summary||{};
    var items=summary.items||[];
    var itemRows=items.map(function(it,i){
      return '<div style="display:flex;gap:6px;margin-bottom:6px">'
        +'<input class="fc" value="'+it.name+'" placeholder="제품명" style="flex:1;padding:5px 8px;font-size:12px" id="sch_sname_'+i+'">'
        +'<input class="fc" value="'+it.qty+'" placeholder="수량" style="flex:1;padding:5px 8px;font-size:12px" id="sch_sqty_'+i+'">'
        +'<button class="btn" style="padding:2px 8px;font-size:11px;color:var(--d)" onclick="this.parentNode.remove()">×</button>'
        +'</div>';
    }).join('');
    var body='<div id="sch_sitems">'+itemRows+'</div>'
      +'<button class="btn" style="width:100%;padding:6px;font-size:12px;margin-bottom:10px" onclick="schAddSummaryRow()">+ 제품 추가</button>'
      +'<div style="display:flex;flex-direction:column;gap:6px">'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:80px">원육투입량</span><input class="fc" id="sch_rawmeat" value="'+(summary.rawMeat||'')+'" placeholder="-13ton" style="flex:1;padding:5px 8px;font-size:12px"></div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:80px">생산일 수</span><input class="fc" id="sch_workdays" value="'+(summary.workDays||'')+'" placeholder="22" type="number" style="flex:1;padding:5px 8px;font-size:12px"></div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:80px">특이사항</span><textarea class="fc" id="sch_notes" rows="3" style="flex:1;padding:5px 8px;font-size:12px;resize:vertical">'+(summary.notes||'')+'</textarea></div>'
      +'</div>'
      +'<button class="btn bp bblk" style="width:100%;padding:8px;margin-top:12px" onclick="schSaveSummary(\''+docId+'\')">저장</button>';
    _schShowModal(_schYear+'년 '+(_schMonth+1)+'월 예상생산량 수정', body);
  });
}
function schAddSummaryRow(){
  var wrap=document.getElementById('sch_sitems'); if(!wrap) return;
  var i=wrap.children.length;
  var div=document.createElement('div');
  div.style.cssText='display:flex;gap:6px;margin-bottom:6px';
  div.innerHTML='<input class="fc" placeholder="제품명" style="flex:1;padding:5px 8px;font-size:12px" id="sch_sname_'+i+'">'
    +'<input class="fc" placeholder="수량" style="flex:1;padding:5px 8px;font-size:12px" id="sch_sqty_'+i+'">'
    +'<button class="btn" style="padding:2px 8px;font-size:11px;color:var(--d)" onclick="this.parentNode.remove()">×</button>';
  wrap.appendChild(div);
}
function schSaveSummary(docId){
  var wrap=document.getElementById('sch_sitems');
  var items=[];
  if(wrap) Array.from(wrap.children).forEach(function(row){
    var ne=row.querySelector('[id^="sch_sname_"]'), qe=row.querySelector('[id^="sch_sqty_"]');
    var name=ne?ne.value.trim():'', qty=qe?qe.value.trim():'';
    if(name) items.push({name:name,qty:qty});
  });
  var rawMeat=(document.getElementById('sch_rawmeat')||{}).value||'';
  var workDays=(document.getElementById('sch_workdays')||{}).value||'';
  var notes=(document.getElementById('sch_notes')||{}).value||'';
  var ref=firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    var data=doc.exists?doc.data():{events:{},summary:{}};
    data.summary={items:items,rawMeat:rawMeat,workDays:workDays,notes:notes};
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
  wrap.innerHTML='<div style="background:#fff;border-radius:12px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto;padding:20px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<span style="font-size:15px;font-weight:700">'+title+'</span>'
    +'<button onclick="_schCloseModal()" style="font-size:18px;color:var(--g4);background:none;border:none;cursor:pointer">✕</button>'
    +'</div>'+body+'</div>';
  document.body.appendChild(wrap);
}
function _schCloseModal(){
  var w=document.getElementById('sch_modal_wrap'); if(w)w.remove();
}
