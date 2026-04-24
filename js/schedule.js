// ============================================================
// 일정표  js/schedule.js  v4
// ============================================================
var _schYear  = new Date().getFullYear();
var _schMonth = new Date().getMonth();
var _schTab   = 'input';

function _schDocId(y,m){ return y+'-'+String(m+1).padStart(2,'0'); }

function initSchedule(){
  _schYear=new Date().getFullYear(); _schMonth=new Date().getMonth(); _schTab='input';
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

// ── 메인 렌더 ─────────────────────────────────────────────────
function renderSchedule(){
  var pg=document.getElementById('p-schedule'); if(!pg) return;
  var docId=_schDocId(_schYear,_schMonth);
  pg.innerHTML=
    '<div style="background:var(--bg);border-bottom:var(--br)">'
    +'<div style="padding:10px 14px 0;display:flex;align-items:center;gap:8px;justify-content:space-between">'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<button class="btn" style="padding:4px 10px" onclick="schPrevMonth()">◀</button>'
    +'<span style="font-size:16px;font-weight:700">'+_schYear+'년 '+(_schMonth+1)+'월</span>'
    +'<button class="btn" style="padding:4px 10px" onclick="schNextMonth()">▶</button>'
    +'</div><button class="btn" style="padding:4px 12px;font-size:12px" onclick="schGoToday()">오늘</button></div>'
    +'<div style="display:flex;gap:0;padding:0 14px;margin-top:6px">'
    +['input','view'].map(function(t){
      var on=_schTab===t, lb=t==='input'?'일정 저장':'일정 현황';
      return '<button onclick="schSwitchTab(\''+t+'\')" style="padding:8px 20px;font-size:13px;font-weight:'+(on?700:500)+';color:'+(on?'var(--p)':'var(--g5)')+';border-bottom:'+(on?'2px solid var(--p)':'2px solid transparent')+';background:none;border-top:none;border-left:none;border-right:none;cursor:pointer">'+lb+'</button>';
    }).join('')+'</div></div>'
    +'<div id="sch_body" style="padding:14px"></div>';

  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var data=doc.exists?doc.data():{days:{},summary:{}};
    if(_schTab==='input') _renderInput(data.days||{}, data.summary||{});
    else _renderView(data.days||{});
  }).catch(function(){
    if(_schTab==='input') _renderInput({},{});
    else _renderView({});
  });
}

// ── 일정 저장 탭 ──────────────────────────────────────────────
function _renderInput(days, summary){
  var el=document.getElementById('sch_body'); if(!el) return;
  var lastDate=new Date(_schYear,_schMonth+1,0).getDate();
  var today=new Date();
  var dow=['일','월','화','수','목','금','토'];

  // 예상생산량 헤더 카드
  var items=summary.items||[];
  var sumHtml='<div style="background:var(--g1);border-radius:10px;padding:10px 14px;border:0.5px solid var(--g2);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">';
  sumHtml+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    +'<span style="font-size:12px;font-weight:700;color:var(--g6)">📊 '+_schYear+'년 '+(_schMonth+1)+'월 합계</span>';
  if(items.length){
    items.forEach(function(it){
      sumHtml+='<span style="font-size:11px;background:#eff6ff;color:#1a56db;border-radius:20px;padding:2px 10px;font-weight:600">'+it.name+' '+it.qty+'</span>';
    });
    if(summary.rawMeat) sumHtml+='<span style="font-size:11px;color:var(--g5)">원육 '+summary.rawMeat+'</span>';
  } else {
    sumHtml+='<span style="font-size:11px;color:var(--g4)">저장하면 자동 집계됩니다</span>';
  }
  sumHtml+='</div>';
  sumHtml+='<button class="btn" style="padding:3px 10px;font-size:11px;white-space:nowrap" onclick="schEditSummaryExtra()">⚙️ 원육/생산일 설정</button>';
  sumHtml+='</div>';

  // 날짜별 입력 리스트
  var listHtml='<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">';
  for(var d=1;d<=lastDate;d++){
    var ds=_schYear+'-'+String(_schMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var dt=new Date(_schYear,_schMonth,d);
    var dayName=dow[dt.getDay()];
    var isToday=d===today.getDate()&&_schMonth===today.getMonth()&&_schYear===today.getFullYear();
    var isSun=dt.getDay()===0, isSat=dt.getDay()===6;
    var dc=isSun?'var(--d)':isSat?'#1a56db':'var(--g7)';
    var rec=days[ds]||{note:'',prods:[]};
    var prods=rec.prods||[];
    // 저장된 제품 텍스트
    var prodText=prods.map(function(p){return p.name+(p.qty?' '+p.qty:'');}).join(', ');

    listHtml+='<div style="background:var(--bg);border-radius:8px;border:0.5px solid '+(isToday?'#1a56db33':'var(--g2)')+';padding:8px 12px;'+(isToday?'background:#f8fbff;':'')+'">'
      +'<div style="display:flex;align-items:center;gap:10px">'
      +'<div style="min-width:48px;font-size:14px;font-weight:'+(isToday?700:500)+';color:'+dc+'">'+d+'일<span style="font-size:11px;margin-left:3px">('+dayName+')</span></div>'
      // 일정(메모) 입력
      +'<input class="fc" id="sch_note_'+d+'" value="'+(rec.note||'').replace(/"/g,'&quot;')+'" placeholder="일정/메모" style="flex:1;padding:5px 8px;font-size:12px;color:var(--g6)">'
      +'</div>'
      // 제품+수량 입력
      +'<div style="display:flex;align-items:center;gap:8px;margin-top:6px">'
      +'<span style="font-size:11px;color:var(--g4);min-width:48px">생산계획</span>'
      +'<input class="fc" id="sch_prod_'+d+'" value="'+prodText.replace(/"/g,'&quot;')+'" placeholder="예) 시그니처130g 16000ea, 코코170g 9000ea" style="flex:1;padding:5px 8px;font-size:12px">'
      +'</div>'
      +'</div>';
  }
  listHtml+='</div>';

  var saveBtn='<button class="btn bp bblk" style="width:100%;padding:10px;font-size:14px;font-weight:700" onclick="schSaveAll()">💾 저장</button>';
  el.innerHTML=sumHtml+listHtml+saveBtn;
}

// ── 생산계획 텍스트 파싱 ──────────────────────────────────────
// "시그니처130g 16000ea, 코코 9000" → [{name:'시그니처130g', qty:'16,000ea'}, ...]
function _parseProdText(text){
  if(!text||!text.trim()) return [];
  return text.split(',').map(function(s){
    s=s.trim(); if(!s) return null;
    var m=s.match(/^(.+?)\s+([\d,]+\s*(?:ea|EA|kg|KG|개|박스|pk|PK|pt|PT)?)\s*$/);
    if(m) return {name:m[1].trim(), qty:m[2].trim()};
    return {name:s, qty:''};
  }).filter(Boolean);
}

// ── 일정 저장 ─────────────────────────────────────────────────
function schSaveAll(){
  var lastDate=new Date(_schYear,_schMonth+1,0).getDate();
  var days={};
  var totals={}; // 제품별 합산

  for(var d=1;d<=lastDate;d++){
    var ds=_schYear+'-'+String(_schMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var noteEl=document.getElementById('sch_note_'+d);
    var prodEl=document.getElementById('sch_prod_'+d);
    var note=noteEl?noteEl.value.trim():'';
    var prodText=prodEl?prodEl.value.trim():'';
    var prods=_parseProdText(prodText);
    if(note||prods.length) days[ds]={note:note, prods:prods};

    // 합산
    prods.forEach(function(p){
      if(!p.name) return;
      var num=parseInt((p.qty||'').replace(/[^0-9]/g,''))||0;
      if(!totals[p.name]) totals[p.name]={name:p.name,total:0,unit:''};
      totals[p.name].total+=num;
      var um=(p.qty||'').replace(/[\d,\s]/g,'');
      if(um) totals[p.name].unit=um;
    });
  }

  // summary.items 자동 업데이트
  var items=Object.values(totals).map(function(t){
    return {name:t.name, qty:t.total.toLocaleString()+(t.unit?t.unit:'')};
  });

  var docId=_schDocId(_schYear,_schMonth);
  var ref=firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    var data=doc.exists?doc.data():{days:{},summary:{}};
    data.days=days;
    if(items.length) data.summary=Object.assign(data.summary||{},{items:items});
    data.updatedAt=new Date().toISOString();
    return ref.set(data);
  }).then(function(){
    toast('저장 완료 ✓','s');
    _schTab='view';
    renderSchedule();
  });
}

// ── 일정 현황 탭 ──────────────────────────────────────────────
function _renderView(days){
  var el=document.getElementById('sch_body'); if(!el) return;

  // 제품 합산
  var totals={};
  Object.values(days).forEach(function(rec){
    (rec.prods||[]).forEach(function(p){
      if(!p.name) return;
      var num=parseInt((p.qty||'').replace(/[^0-9]/g,''))||0;
      if(!totals[p.name]) totals[p.name]={name:p.name,total:0,unit:'',days:0};
      totals[p.name].total+=num;
      var um=(p.qty||'').replace(/[\d,\s]/g,'');
      if(um) totals[p.name].unit=um;
      if(num>0) totals[p.name].days++;
    });
  });
  var totalItems=Object.values(totals);

  el.innerHTML='<div style="display:flex;gap:14px;align-items:flex-start">'
    +'<div style="flex:1;min-width:0" id="sch_cal_wrap"></div>'
    +'<div style="width:200px;min-width:180px" id="sch_sum_wrap"></div>'
    +'</div>';

  _renderCal(days);
  _renderSumPanel(totalItems);
}

function _renderCal(days){
  var el=document.getElementById('sch_cal_wrap'); if(!el) return;
  var today=new Date();
  var firstDay=new Date(_schYear,_schMonth,1).getDay();
  var lastDate=new Date(_schYear,_schMonth+1,0).getDate();
  var dow=['일','월','화','수','목','금','토'];
  var html='<table style="width:100%;border-collapse:collapse;table-layout:fixed">';
  html+='<tr>';
  dow.forEach(function(d,i){
    var c=i===0?'var(--d)':i===6?'#1a56db':'var(--g6)';
    html+='<th style="padding:8px 4px;font-size:12px;color:'+c+';font-weight:600;text-align:center;border-bottom:2px solid var(--g2)">'+d+'</th>';
  });
  html+='</tr>';
  var date=1;
  for(var wk=0;wk<6;wk++){
    if(date>lastDate) break;
    html+='<tr>';
    for(var dw=0;dw<7;dw++){
      if((wk===0&&dw<firstDay)||date>lastDate){
        html+='<td style="height:100px;border:0.5px solid var(--g2);background:var(--g1)"></td>';
      } else {
        var ds=_schYear+'-'+String(_schMonth+1).padStart(2,'0')+'-'+String(date).padStart(2,'0');
        var isT=date===today.getDate()&&_schMonth===today.getMonth()&&_schYear===today.getFullYear();
        var isSun=dw===0,isSat=dw===6;
        var dc=isSun?'var(--d)':isSat?'#1a56db':'var(--g7)';
        var rec=days[ds]||{};
        var prods=rec.prods||[];
        var note=rec.note||'';
        html+='<td style="height:100px;vertical-align:top;padding:4px;border:0.5px solid var(--g2);cursor:pointer;background:'+(isT?'#eff6ff':'var(--bg)')+'" onclick="schDayEdit(\''+ds+'\')">';
        html+='<div style="font-size:12px;font-weight:'+(isT?700:500)+';color:'+dc+';'+(isT?'width:22px;height:22px;background:#1a56db;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:2px;':'')+'">'+date+'</div>';
        if(note) html+='<div style="font-size:10px;color:var(--g5);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📌 '+note+'</div>';
        prods.slice(0,2).forEach(function(p){
          html+='<div style="font-size:10px;padding:1px 4px;background:#eff6ff;color:#1a56db;border-radius:3px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+p.name+(p.qty?' '+p.qty:'')+'</div>';
        });
        if(prods.length>2) html+='<div style="font-size:10px;color:var(--g4)">+'+( prods.length-2)+'</div>';
        html+='</td>';
        date++;
      }
    }
    html+='</tr>';
  }
  html+='</table>';
  el.innerHTML=html;
}

function _renderSumPanel(totalItems){
  var el=document.getElementById('sch_sum_wrap'); if(!el) return;
  var docId=_schDocId(_schYear,_schMonth);

  // 추가 정보 (rawMeat, workDays) 불러오기
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var summary=(doc.exists?doc.data():{}).summary||{};
    var html='<div style="position:sticky;top:14px">'
      +'<div style="background:var(--g1);border-radius:10px;padding:12px;border:0.5px solid var(--g2)">'
      +'<div style="font-size:13px;font-weight:700;color:var(--g6);margin-bottom:10px">📊 '+_schYear+'년 '+(_schMonth+1)+'월 합계</div>';

    if(totalItems.length){
      totalItems.forEach(function(t){
        html+='<div style="margin-bottom:8px;padding:8px 10px;background:#fff;border-radius:8px;border:0.5px solid var(--g2)">'
          +'<div style="font-size:12px;font-weight:700;color:#1a56db;margin-bottom:2px">'+t.name+'</div>'
          +'<div style="font-size:15px;font-weight:700;color:var(--g7)">'+t.total.toLocaleString()+(t.unit||'ea')+'</div>'
          +'<div style="font-size:10px;color:var(--g4)">'+t.days+'일 생산</div>'
          +'</div>';
      });
    } else {
      html+='<div style="font-size:12px;color:var(--g4);text-align:center;padding:20px 0">생산계획 없음</div>';
    }

    if(summary.rawMeat||summary.workDays){
      html+='<div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--g3)">';
      if(summary.rawMeat) html+='<div style="font-size:12px;color:var(--g6);margin-bottom:4px"><b>원육투입</b> '+summary.rawMeat+'</div>';
      if(summary.workDays) html+='<div style="font-size:12px;color:var(--g6)"><b>생산일</b> '+summary.workDays+'일</div>';
      html+='</div>';
    }
    html+='</div></div>';
    el.innerHTML=html;
  });
}

// ── 날짜 클릭 → 수정 모달 ─────────────────────────────────────
function schDayEdit(ds){
  var parts=ds.split('-'), mm=parseInt(parts[1]), dd=parseInt(parts[2]);
  var docId=_schDocId(_schYear,_schMonth);
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var data=doc.exists?doc.data():{days:{},summary:{}};
    var rec=(data.days||{})[ds]||{note:'',prods:[]};
    var prodText=(rec.prods||[]).map(function(p){return p.name+(p.qty?' '+p.qty:'');}).join(', ');

    var body='<div style="display:flex;flex-direction:column;gap:10px">'
      +'<div>'
      +'<div style="font-size:12px;color:var(--g5);margin-bottom:4px">일정/메모</div>'
      +'<input class="fc" id="sch_edit_note" value="'+(rec.note||'').replace(/"/g,'&quot;')+'" placeholder="일정 메모" style="width:100%;padding:7px 10px;font-size:13px;box-sizing:border-box">'
      +'</div>'
      +'<div>'
      +'<div style="font-size:12px;color:var(--g5);margin-bottom:4px">생산계획 <span style="color:var(--g4)">(제품명 수량, 쉼표로 구분)</span></div>'
      +'<input class="fc" id="sch_edit_prod" value="'+prodText.replace(/"/g,'&quot;')+'" placeholder="예) 시그니처130g 16000ea, 코코170g 9000ea" style="width:100%;padding:7px 10px;font-size:13px;box-sizing:border-box">'
      +'</div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;margin-top:14px">'
      +'<button class="btn" style="flex:1;padding:8px;font-size:13px;color:var(--d)" onclick="schDayDelete(\''+docId+'\',\''+ds+'\')">삭제</button>'
      +'<button class="btn bp bblk" style="flex:2;padding:8px;font-size:13px" onclick="schDaySave(\''+docId+'\',\''+ds+'\')">저장</button>'
      +'</div>';

    _schShowModal(mm+'월 '+dd+'일 수정', body);
  });
}

function schDaySave(docId, ds){
  var note=(document.getElementById('sch_edit_note')||{}).value||'';
  var prodText=(document.getElementById('sch_edit_prod')||{}).value||'';
  var prods=_parseProdText(prodText);
  var ref=firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    var data=doc.exists?doc.data():{days:{},summary:{}};
    if(!data.days) data.days={};
    if(note.trim()||prods.length) data.days[ds]={note:note.trim(),prods:prods};
    else delete data.days[ds];
    // summary items 재계산
    var totals={};
    Object.values(data.days).forEach(function(rec){
      (rec.prods||[]).forEach(function(p){
        if(!p.name) return;
        var num=parseInt((p.qty||'').replace(/[^0-9]/g,''))||0;
        if(!totals[p.name]) totals[p.name]={name:p.name,total:0,unit:''};
        totals[p.name].total+=num;
        var um=(p.qty||'').replace(/[\d,\s]/g,'');
        if(um) totals[p.name].unit=um;
      });
    });
    var items=Object.values(totals).map(function(t){
      return {name:t.name,qty:t.total.toLocaleString()+(t.unit||'')};
    });
    if(!data.summary) data.summary={};
    data.summary.items=items;
    data.updatedAt=new Date().toISOString();
    return ref.set(data);
  }).then(function(){
    toast('저장 완료 ✓','s');
    _schCloseModal();
    renderSchedule();
  });
}

function schDayDelete(docId,ds){
  if(!confirm('이 날짜 일정을 삭제할까요?')) return;
  var ref=firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    var data=doc.exists?doc.data():{days:{},summary:{}};
    if(data.days) delete data.days[ds];
    data.updatedAt=new Date().toISOString();
    return ref.set(data);
  }).then(function(){
    toast('삭제 완료','s');
    _schCloseModal();
    renderSchedule();
  });
}

// ── 원육/생산일 설정 모달 ─────────────────────────────────────
function schEditSummaryExtra(){
  var docId=_schDocId(_schYear,_schMonth);
  firebase.firestore().collection('schedules').doc(docId).get().then(function(doc){
    var data=doc.exists?doc.data():{days:{},summary:{}};
    var s=data.summary||{};
    var body='<div style="display:flex;flex-direction:column;gap:8px">'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:70px">원육투입량</span><input class="fc" id="sch_rm" value="'+(s.rawMeat||'')+'" placeholder="예) -13ton" style="flex:1;padding:5px 8px;font-size:12px"></div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:70px">생산일 수</span><input class="fc" id="sch_wd" value="'+(s.workDays||'')+'" placeholder="22" type="number" style="flex:1;padding:5px 8px;font-size:12px"></div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--g5);min-width:70px">특이사항</span><textarea class="fc" id="sch_nt" rows="3" style="flex:1;padding:5px 8px;font-size:12px;resize:vertical">'+(s.notes||'')+'</textarea></div>'
      +'</div>'
      +'<button class="btn bp bblk" style="width:100%;padding:8px;margin-top:12px" onclick="schSaveSummaryExtra(\''+docId+'\')">저장</button>';
    _schShowModal('원육/생산일 설정', body);
  });
}
function schSaveSummaryExtra(docId){
  var rm=(document.getElementById('sch_rm')||{}).value||'';
  var wd=(document.getElementById('sch_wd')||{}).value||'';
  var nt=(document.getElementById('sch_nt')||{}).value||'';
  var ref=firebase.firestore().collection('schedules').doc(docId);
  ref.get().then(function(doc){
    var data=doc.exists?doc.data():{days:{},summary:{}};
    if(!data.summary) data.summary={};
    Object.assign(data.summary,{rawMeat:rm,workDays:wd,notes:nt});
    data.updatedAt=new Date().toISOString();
    return ref.set(data);
  }).then(function(){
    toast('저장 완료 ✓','s'); _schCloseModal(); renderSchedule();
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
function _schCloseModal(){ var w=document.getElementById('sch_modal_wrap'); if(w)w.remove(); }

// ── window 바인딩 ─────────────────────────────────────────────
window.setModeSchedule     = setModeSchedule;
window.initSchedule        = initSchedule;
window.renderSchedule      = renderSchedule;
window.schPrevMonth        = schPrevMonth;
window.schNextMonth        = schNextMonth;
window.schGoToday          = schGoToday;
window.schSwitchTab        = schSwitchTab;
window.schSaveAll          = schSaveAll;
window.schDayEdit          = schDayEdit;
window.schDaySave          = schDaySave;
window.schDayDelete        = schDayDelete;
window.schEditSummaryExtra = schEditSummaryExtra;
window.schSaveSummaryExtra = schSaveSummaryExtra;
window._schCloseModal      = _schCloseModal;
