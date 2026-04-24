// ============================================================
// 일정표  js/schedule.js
// ============================================================

var _schYear  = new Date().getFullYear();
var _schMonth = new Date().getMonth(); // 0-indexed

// ── Firebase 참조 ─────────────────────────────────────────────
function _schDocId(y, m){
  return y+'-'+String(m+1).padStart(2,'0');
}

// ── 초기화 ────────────────────────────────────────────────────
function initSchedule(){
  _schYear  = new Date().getFullYear();
  _schMonth = new Date().getMonth();
  renderSchedule();
}

// ── 월 이동 ────────────────────────────────────────────────────
function schPrevMonth(){
  _schMonth--;
  if(_schMonth < 0){ _schMonth=11; _schYear--; }
  renderSchedule();
}
function schNextMonth(){
  _schMonth++;
  if(_schMonth > 11){ _schMonth=0; _schYear++; }
  renderSchedule();
}
function schGoToday(){
  _schYear  = new Date().getFullYear();
  _schMonth = new Date().getMonth();
  renderSchedule();
}

// ── 메인 렌더 ─────────────────────────────────────────────────
function renderSchedule(){
  const pg = document.getElementById('p-schedule');
  if(!pg) return;
  const docId = _schDocId(_schYear, _schMonth);
  pg.innerHTML = '<div style="padding:14px 14px 0;display:flex;align-items:center;gap:8px;justify-content:space-between">'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<button class="btn" style="padding:4px 10px;font-size:13px" onclick="schPrevMonth()">◀</button>'
    +'<span style="font-size:17px;font-weight:700">'+_schYear+'년 '+(_schMonth+1)+'월</span>'
    +'<button class="btn" style="padding:4px 10px;font-size:13px" onclick="schNextMonth()">▶</button>'
    +'</div>'
    +'<button class="btn" style="padding:4px 12px;font-size:12px" onclick="schGoToday()">오늘</button>'
    +'</div>'
    +'<div style="display:flex;gap:0;padding:10px 14px 14px">'
    +'  <div style="flex:1;min-width:0" id="sch_cal"></div>'
    +'  <div style="width:200px;min-width:160px;margin-left:12px" id="sch_summary"></div>'
    +'</div>';

  // Firebase에서 데이터 로드 후 렌더
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    const data = doc.exists ? doc.data() : {events:{}, summary:{}};
    _renderSchCal(data.events||{});
    _renderSchSummary(data.summary||{});
  }).catch(function(){
    _renderSchCal({});
    _renderSchSummary({});
  });
}

// ── 캘린더 렌더 ───────────────────────────────────────────────
var SCH_CAT = {
  prod:   {label:'생산', color:'#1a56db', bg:'#eff6ff'},
  in:     {label:'입고', color:'#166534', bg:'#f0fdf4'},
  check:  {label:'점검', color:'#b45309', bg:'#fffbeb'},
  cert:   {label:'인증', color:'#7c3aed', bg:'#f5f3ff'},
  etc:    {label:'기타', color:'#374151', bg:'#f9fafb'},
};

function _renderSchCal(events){
  const el = document.getElementById('sch_cal');
  if(!el) return;

  const today = new Date();
  const firstDay = new Date(_schYear, _schMonth, 1).getDay(); // 0=일
  const lastDate = new Date(_schYear, _schMonth+1, 0).getDate();
  const days = ['일','월','화','수','목','금','토'];

  let html = '<table style="width:100%;border-collapse:collapse">';
  // 헤더
  html += '<tr>';
  days.forEach(function(d,i){
    const c = i===0?'var(--d)':i===6?'#1a56db':'var(--g6)';
    html += '<th style="padding:4px 2px;font-size:11px;color:'+c+';font-weight:600;text-align:center;border-bottom:1px solid var(--g2)">'+d+'</th>';
  });
  html += '</tr>';

  let date = 1;
  for(var week=0; week<6; week++){
    if(date > lastDate) break;
    html += '<tr>';
    for(var dow=0; dow<7; dow++){
      if(week===0 && dow < firstDay || date > lastDate){
        html += '<td style="height:80px;border:0.5px solid var(--g2);background:var(--g1)"></td>';
      } else {
        const ds = _schYear+'-'+String(_schMonth+1).padStart(2,'0')+'-'+String(date).padStart(2,'0');
        const isToday = (date===today.getDate()&&_schMonth===today.getMonth()&&_schYear===today.getFullYear());
        const isSun = dow===0, isSat = dow===6;
        const dayColor = isSun?'var(--d)':isSat?'#1a56db':'var(--g7)';
        const dayEvts  = events[ds]||[];

        html += '<td style="height:80px;vertical-align:top;padding:3px;border:0.5px solid var(--g2);cursor:pointer;background:'+(isToday?'#eff6ff':'var(--bg)')+'" onclick="schDayClick(\''+ds+'\')">';
        html += '<div style="font-size:12px;font-weight:'+(isToday?'700':'500')+';color:'+dayColor+';'+(isToday?'background:#1a56db;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;':'')+'">'+date+'</div>';

        // 이벤트 최대 3개 표시
        dayEvts.slice(0,3).forEach(function(ev){
          const cat = SCH_CAT[ev.cat]||SCH_CAT.etc;
          html += '<div style="font-size:10px;padding:1px 4px;margin-top:2px;border-radius:3px;background:'+cat.bg+';color:'+cat.color+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+ev.title+'">'+ev.title+'</div>';
        });
        if(dayEvts.length>3){
          html += '<div style="font-size:10px;color:var(--g4);margin-top:1px">+'+( dayEvts.length-3)+'건 더</div>';
        }
        html += '</td>';
        date++;
      }
    }
    html += '</tr>';
  }
  html += '</table>';
  el.innerHTML = html;
}

// ── 요약 패널 렌더 ─────────────────────────────────────────────
function _renderSchSummary(summary){
  const el = document.getElementById('sch_summary');
  if(!el) return;

  const items = summary.items || [];
  const rawMeat = summary.rawMeat||'';
  const workDays = summary.workDays||'';
  const notes = summary.notes||'';

  let html = '<div style="background:var(--g1);border-radius:10px;padding:12px;height:100%;border:0.5px solid var(--g2)">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--g6);margin-bottom:10px">'+_schYear+'년 '+(_schMonth+1)+'월 예상생산량</div>';

  // 제품별
  items.forEach(function(it, i){
    html += '<div style="margin-bottom:8px">';
    html += '<div style="font-size:12px;font-weight:600;color:#1a56db">'+it.name+'</div>';
    html += '<div style="font-size:12px;color:var(--g6)">'+it.qty+'</div>';
    html += '</div>';
  });

  if(rawMeat){
    html += '<div style="margin-top:10px;padding-top:10px;border-top:0.5px solid var(--g3)">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--g6)">원육투입량(예상)</div>';
    html += '<div style="font-size:13px;color:var(--g7)">'+rawMeat+'</div>';
    html += '</div>';
  }
  if(workDays){
    html += '<div style="font-size:12px;color:var(--g5);margin-top:6px">생산일 - '+workDays+'일</div>';
  }
  if(notes){
    html += '<div style="margin-top:8px;font-size:11px;color:var(--g5);white-space:pre-wrap">'+notes+'</div>';
  }

  html += '<button class="btn" style="width:100%;margin-top:12px;padding:7px;font-size:12px" onclick="schEditSummary()">✏️ 수정</button>';
  html += '</div>';
  el.innerHTML = html;
}

// ── 날짜 클릭 → 일정 모달 ─────────────────────────────────────
function schDayClick(ds){
  const docId = _schDocId(_schYear, _schMonth);
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    const data   = doc.exists ? doc.data() : {events:{},summary:{}};
    const events = data.events || {};
    const dayEvts= events[ds] || [];
    _showDayModal(ds, dayEvts, events, docId);
  });
}

function _showDayModal(ds, dayEvts, allEvents, docId){
  const parts = ds.split('-');
  const title = parts[0]+'년 '+parseInt(parts[1])+'월 '+parseInt(parts[2])+'일';
  const catOpts = Object.keys(SCH_CAT).map(function(k){
    return '<option value="'+k+'">'+SCH_CAT[k].label+'</option>';
  }).join('');

  let listHtml = dayEvts.length ? dayEvts.map(function(ev,i){
    const cat=SCH_CAT[ev.cat]||SCH_CAT.etc;
    return '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:'+cat.bg+';border-radius:6px;margin-bottom:4px">'
      +'<span style="flex:1;font-size:13px;color:'+cat.color+'">'+ev.title+'</span>'
      +'<span style="font-size:11px;color:var(--g4)">'+cat.label+'</span>'
      +'<button class="btn" style="padding:2px 8px;font-size:11px;color:var(--d)" onclick="schDelEvent(\''+docId+'\',\''+ds+'\','+i+')">삭제</button>'
      +'</div>';
  }).join('') : '<div style="color:var(--g4);font-size:12px;text-align:center;padding:12px">일정 없음</div>';

  const body = '<div style="margin-bottom:12px">'+listHtml+'</div>'
    +'<div style="font-size:12px;font-weight:600;color:var(--g6);margin-bottom:8px">일정 추가</div>'
    +'<div style="display:flex;gap:6px;margin-bottom:6px">'
    +'  <select class="fc" id="sch_new_cat" style="width:80px;padding:5px 6px;font-size:12px">'+catOpts+'</select>'
    +'  <input class="fc" id="sch_new_title" placeholder="일정 내용" style="flex:1;padding:5px 8px;font-size:13px">'
    +'</div>'
    +'<button class="btn bp bblk" style="width:100%;padding:8px" onclick="schAddEvent(\''+docId+'\',\''+ds+'\')">+ 추가</button>';

  _schShowModal(title, body);
}

function schAddEvent(docId, ds){
  const title = (document.getElementById('sch_new_title')||{}).value||'';
  const cat   = (document.getElementById('sch_new_cat')||{}).value||'etc';
  if(!title.trim()){ toast('일정 내용을 입력하세요','d'); return; }

  const ref = firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    const data   = doc.exists ? doc.data() : {events:{},summary:{}};
    const events = data.events||{};
    if(!events[ds]) events[ds]=[];
    events[ds].push({title:title.trim(), cat:cat});
    return ref.set(Object.assign(data,{events:events,updatedAt:new Date().toISOString()}));
  }).then(function(){
    toast('일정 추가 ✓','s');
    closeModal();
    renderSchedule();
  });
}

function schDelEvent(docId, ds, idx){
  if(!confirm('삭제하시겠습니까?')) return;
  const ref = firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    const data   = doc.data();
    const events = data.events||{};
    if(events[ds]) events[ds].splice(idx,1);
    if(events[ds]&&!events[ds].length) delete events[ds];
    return ref.set(Object.assign(data,{events:events,updatedAt:new Date().toISOString()}));
  }).then(function(){
    toast('삭제 완료','s');
    closeModal();
    renderSchedule();
  });
}

// ── 요약 수정 모달 ─────────────────────────────────────────────
function schEditSummary(){
  const docId = _schDocId(_schYear, _schMonth);
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    const data    = doc.exists ? doc.data() : {events:{},summary:{}};
    const summary = data.summary||{};
    const items   = summary.items||[];

    let itemRows = items.map(function(it,i){
      return '<div style="display:flex;gap:6px;margin-bottom:6px" id="sch_sitem_'+i+'">'
        +'<input class="fc" value="'+it.name+'" placeholder="제품명" style="flex:1;padding:5px 8px;font-size:12px" id="sch_sname_'+i+'">'
        +'<input class="fc" value="'+it.qty+'" placeholder="수량 (예: 13,000ea)" style="flex:1;padding:5px 8px;font-size:12px" id="sch_sqty_'+i+'">'
        +'<button class="btn" style="padding:2px 8px;font-size:11px;color:var(--d)" onclick="this.parentNode.remove()">삭제</button>'
        +'</div>';
    }).join('');

    const body = '<div id="sch_sitems">'+itemRows+'</div>'
      +'<button class="btn" style="width:100%;padding:6px;font-size:12px;margin-bottom:12px" onclick="schAddSummaryRow()">+ 제품 추가</button>'
      +'<div style="display:flex;flex-direction:column;gap:6px">'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'  <span style="font-size:12px;color:var(--g5);min-width:80px">원육투입량</span>'
      +'  <input class="fc" id="sch_rawmeat" value="'+(summary.rawMeat||'')+'" placeholder="예: -13ton" style="flex:1;padding:5px 8px;font-size:12px">'
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'  <span style="font-size:12px;color:var(--g5);min-width:80px">생산일 수</span>'
      +'  <input class="fc" id="sch_workdays" value="'+(summary.workDays||'')+'" placeholder="예: 22" style="flex:1;padding:5px 8px;font-size:12px" type="number">'
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'  <span style="font-size:12px;color:var(--g5);min-width:80px">특이사항</span>'
      +'  <textarea class="fc" id="sch_notes" rows="3" style="flex:1;padding:5px 8px;font-size:12px;resize:vertical">'+(summary.notes||'')+'</textarea>'
      +'</div>'
      +'</div>'
      +'<button class="btn bp bblk" style="width:100%;padding:8px;margin-top:12px" onclick="schSaveSummary(\''+docId+'\')">저장</button>';

    showModal(_schYear+'년 '+(_schMonth+1)+'월 요약 수정', body);
  });
}

function schAddSummaryRow(){
  const wrap = document.getElementById('sch_sitems');
  if(!wrap) return;
  const i = wrap.children.length;
  const div = document.createElement('div');
  div.style.cssText='display:flex;gap:6px;margin-bottom:6px';
  div.innerHTML='<input class="fc" placeholder="제품명" style="flex:1;padding:5px 8px;font-size:12px" id="sch_sname_'+i+'">'
    +'<input class="fc" placeholder="수량 (예: 13,000ea)" style="flex:1;padding:5px 8px;font-size:12px" id="sch_sqty_'+i+'">'
    +'<button class="btn" style="padding:2px 8px;font-size:11px;color:var(--d)" onclick="this.parentNode.remove()">삭제</button>';
  wrap.appendChild(div);
}

function schSaveSummary(docId){
  const wrap = document.getElementById('sch_sitems');
  const items = [];
  if(wrap){
    Array.from(wrap.children).forEach(function(row,i){
      const nameEl = row.querySelector('[id^="sch_sname_"]');
      const qtyEl  = row.querySelector('[id^="sch_sqty_"]');
      const name   = nameEl ? nameEl.value.trim() : '';
      const qty    = qtyEl  ? qtyEl.value.trim()  : '';
      if(name) items.push({name:name, qty:qty});
    });
  }
  const rawMeat  = (document.getElementById('sch_rawmeat')||{}).value||'';
  const workDays = (document.getElementById('sch_workdays')||{}).value||'';
  const notes    = (document.getElementById('sch_notes')||{}).value||'';

  const ref = firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    const data = doc.exists ? doc.data() : {events:{},summary:{}};
    data.summary = {items:items, rawMeat:rawMeat, workDays:workDays, notes:notes};
    data.updatedAt = new Date().toISOString();
    return ref.set(data);
  }).then(function(){
    toast('저장 완료 ✓','s');
    closeModal();
    renderSchedule();
  });
}

function _schShowModal(title, body){
  var existing=document.getElementById('sch_modal_wrap');
  if(existing) existing.remove();
  var wrap=document.createElement('div');
  wrap.id='sch_modal_wrap';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  wrap.innerHTML='<div style="background:#fff;border-radius:12px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto;padding:20px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'+
    '<span style="font-size:15px;font-weight:700">'+title+'</span>'+
    '<button onclick="document.getElementById(\'sch_modal_wrap\').remove()" style="font-size:18px;color:var(--g4);background:none;border:none;cursor:pointer">✕</button>'+
    '</div>'+body+'</div>';
  document.body.appendChild(wrap);
}
