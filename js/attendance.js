// ============================================================
// 출퇴근 관리  js/attendance.js  v4
// 상태 선택 → 체크박스 일괄 적용 방식
// ============================================================

const ATT_EMP_KEY = 'att_employees_v1';
const DEFAULT_EMPS = ['김구식','김수영','임혜경','한채현','김정희','안남정','심현주','홍안순',
  '박수경','하대성','홍유순','정현석','김성희','김영선','배현자','김미애','이용범','게이코',
  '유혜선','레티장','김진화','박재홍','드엉반담','르탄프엉','응우옌반동','응우옌민호앙',
  '응우옌반키','르판하이퐁','판투안안'];

const ATT_SL    = { normal:'정상', early:'조출', overtime:'연장', 'half-am':'반차(오전)', 'half-pm':'반차(오후)', quarter:'반반차', annual:'연차', absent:'결근' };
const ATT_ICON  = { normal:'✅', early:'🌅', overtime:'⏰', 'half-am':'🌓', 'half-pm':'🌓', quarter:'🌗', annual:'📅', absent:'❌' };
const ATT_COLOR = { normal:'#2e7d32', early:'#1565c0', overtime:'#e65100', 'half-am':'#6a1b9a', 'half-pm':'#6a1b9a', quarter:'#4a148c', annual:'#ad1457', absent:'#b71c1c' };
const ATT_NEEDS_TIME = { early:true, overtime:true };

let _attDate='', _attRecs={}, _attEmps=[], _attSubTab='input', _attSelStatus='';

function initAttendance(){
  _attDate=tod();
  const raw=localStorage.getItem(ATT_EMP_KEY);
  _attEmps=raw?JSON.parse(raw):DEFAULT_EMPS.map(n=>({name:n,annualDays:15,usedDays:0}));
  if(!raw)_saveAttEmps();
  _loadAttDate(_attDate);
}
function _saveAttEmps(){localStorage.setItem(ATT_EMP_KEY,JSON.stringify(_attEmps));}
function _attDateKey(d){return 'att_day_'+d;}

function _loadAttDate(date){
  _attDate=date; _attSelStatus='';
  const raw=localStorage.getItem(_attDateKey(date));
  _attRecs=raw?JSON.parse(raw):{};
  const lbl=document.getElementById('attDateLabel');
  if(lbl)lbl.textContent=_attFmtLabel(date);
  _renderAttAll();
}
function _attFmtLabel(d){
  const days=['일','월','화','수','목','금','토'];
  const dt=new Date(d);
  return d.slice(5).replace('-','/')+'('+days[dt.getDay()]+')';
}
function attChangeDay(delta){const d=new Date(_attDate);d.setDate(d.getDate()+delta);_loadAttDate(d.toISOString().slice(0,10));}
function attGoToday(){_loadAttDate(tod());}

function attSave(){
  localStorage.setItem(_attDateKey(_attDate),JSON.stringify(_attRecs));
  try{
    const full={};
    _attEmps.forEach(e=>{full[e.name]=_attRecs[e.name]||{status:'normal',inTime:'09:00',outTime:'18:00'};});
    firebase.firestore().collection('attendance').doc(_attDate).set({date:_attDate,records:full,updatedAt:new Date().toISOString()});
  }catch(e){}
  toast('출퇴근 저장됨 ✓','s');
  _renderAttSummary();
}

function _renderAttAll(){
  _renderAttSummary();
  ['attInputWrap','attMonthlyWrap','attStaffWrap'].forEach(id=>{const w=document.getElementById(id);if(w)w.style.display='none';});
  const wrap={input:'attInputWrap',monthly:'attMonthlyWrap',staff:'attStaffWrap'}[_attSubTab];
  const w=document.getElementById(wrap);if(w)w.style.display='';
  if(_attSubTab==='input')_renderAttInput();
  if(_attSubTab==='monthly')_renderAttMonthly();
  if(_attSubTab==='staff')_renderAttStaff();
}
function attShowSubTab(tab,el){
  _attSubTab=tab;_attSelStatus='';
  document.querySelectorAll('.att-sub-tab').forEach(t=>t.classList.remove('on'));
  if(el)el.classList.add('on');
  const sc=document.getElementById('attStaffCount');if(sc)sc.textContent=_attEmps.length;
  _renderAttAll();
}

function _renderAttSummary(){
  const el=document.getElementById('attSummary');if(!el)return;
  const raw=localStorage.getItem(_attDateKey(tod()));if(!raw){el.innerHTML='';return;}
  const recs=JSON.parse(raw);
  const groups={early:[],annual:[],'half-am':[],'half-pm':[],quarter:[],overtime:[],absent:[]};
  let totalIn=0,totalAbsent=0;
  _attEmps.forEach(e=>{
    const r=recs[e.name];if(!r)return;
    if(r.status==='absent'){totalAbsent++;groups.absent.push(e.name);}
    else{totalIn++;if(groups[r.status])groups[r.status].push({name:e.name,inTime:r.inTime,outTime:r.outTime});}
  });
  let html=\`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 14px 7px;background:var(--g1);border-radius:10px;margin-bottom:4px">
    <span style="font-size:14px;font-weight:700;color:var(--p)">총 출근 \${totalIn}명</span>
    \${totalAbsent?\`<span style="font-size:13px;color:#e53935;font-weight:600">결근 \${totalAbsent}명</span>\`:''}
  </div>\`;
  [{key:'early',icon:'🌅',label:'조출',t:true},{key:'annual',icon:'📅',label:'연차',t:false},
   {key:'half-am',icon:'🌓',label:'반차(오전)',t:false},{key:'half-pm',icon:'🌓',label:'반차(오후)',t:false},
   {key:'quarter',icon:'🌗',label:'반반차',t:false},{key:'overtime',icon:'⏰',label:'연장',t:true}
  ].forEach(row=>{
    const arr=groups[row.key];if(!arr||!arr.length)return;
    const names=row.t?arr.map(x=>\`\${x.name} \${x.inTime}\`).join('  '):arr.map(x=>typeof x==='string'?x:x.name).join('  ');
    html+=\`<div style="padding:5px 14px;font-size:12px;color:var(--g6);border-bottom:1px solid var(--g2)"><b>\${row.icon} \${row.label} \${arr.length}명</b> — \${names}</div>\`;
  });
  el.innerHTML=html;
}

function _renderAttInput(){
  const el=document.getElementById('attInputContent');if(!el)return;
  const STATUS_BTNS=[
    {s:'early',icon:'🌅',label:'조출',color:'#1565c0'},
    {s:'half-am',icon:'🌓',label:'반차(오전)',color:'#6a1b9a'},
    {s:'half-pm',icon:'🌓',label:'반차(오후)',color:'#6a1b9a'},
    {s:'quarter',icon:'🌗',label:'반반차',color:'#4a148c'},
    {s:'overtime',icon:'⏰',label:'연장',color:'#e65100'},
    {s:'annual',icon:'📅',label:'연차',color:'#ad1457'},
    {s:'absent',icon:'❌',label:'결근',color:'#b71c1c'},
  ];
  const btnHtml=STATUS_BTNS.map(b=>{
    const active=_attSelStatus===b.s;
    const cnt=_attEmps.filter(e=>(_attRecs[e.name]||{}).status===b.s).length;
    const style=active?\`background:\${b.color};color:#fff;border:2px solid \${b.color};\`:\`background:var(--g1);color:\${b.color};border:2px solid \${b.color};\`;
    return \`<button onclick="attSelectStatus('\${b.s}')" style="\${style}padding:8px 12px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:72px">
      <span style="font-size:18px">\${b.icon}</span>
      <span>\${b.label}</span>
      \${cnt>\`0\`?\`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,0.3)">\${cnt}명</span>\`:''}
    </button>\`;
  }).join('');

  let checkPanel='';
  if(_attSelStatus){
    const needTime=!!ATT_NEEDS_TIME[_attSelStatus];
    const sc=ATT_COLOR[_attSelStatus],si=ATT_ICON[_attSelStatus],sl=ATT_SL[_attSelStatus];
    const checkHtml=_attEmps.map((e,i)=>{
      const isChecked=(_attRecs[e.name]||{}).status===_attSelStatus;
      return \`<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;\${isChecked?'background:'+sc+'18':''}" onclick="event.stopPropagation()">
        <input type="checkbox" id="attChk_\${i}" \${isChecked?'checked':''} style="width:18px;height:18px;accent-color:\${sc};cursor:pointer;flex-shrink:0">
        <span style="font-size:14px;\${isChecked?'font-weight:700;color:'+sc:''}">\${e.name}</span>
      </label>\`;
    }).join('');
    const timeInput=needTime?\`
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--g1);border-radius:8px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-size:13px;color:var(--g5)">\${_attSelStatus==='early'?'조출 출근시간':'퇴근시간'}:</span>
        <input id="attBulkTime" class="fc" type="text" inputmode="numeric" maxlength="5"
          placeholder="\${_attSelStatus==='early'?'0700':'2000'}"
          style="width:80px;font-size:18px;font-weight:700;text-align:center;padding:6px"
          oninput="attBulkTimeInput(this.value)">
        <span id="attBulkCalcLabel" style="font-size:13px;color:var(--p)"></span>
      </div>\`:'';
    checkPanel=\`
    <div style="background:var(--bg);border:2px solid \${sc};border-radius:12px;padding:14px;margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:15px;font-weight:700;color:\${sc}">\${si} \${sl} 적용할 직원 체크</span>
        <div style="display:flex;gap:6px">
          <button onclick="attCheckAll(true)"  style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--g3);background:var(--g1);cursor:pointer">전체선택</button>
          <button onclick="attCheckAll(false)" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--g3);background:var(--g1);cursor:pointer">전체해제</button>
        </div>
      </div>
      \${timeInput}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:2px;max-height:280px;overflow-y:auto;margin-bottom:10px">
        \${checkHtml}
      </div>
      <button onclick="attApplyChecked()" style="width:100%;padding:10px;background:\${sc};color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">
        ✓ 적용
      </button>
    </div>\`;
  }

  const exByStatus={};
  Object.entries(_attRecs).forEach(([name,r])=>{
    if(!r||r.status==='normal')return;
    if(!exByStatus[r.status])exByStatus[r.status]=[];
    exByStatus[r.status].push({name,...r});
  });
  let exHtml='';
  Object.entries(exByStatus).forEach(([s,arr])=>{
    const color=ATT_COLOR[s];
    const chips=arr.map(x=>{
      const t=(s==='early'&&x.inTime)?x.inTime:(s==='overtime'&&x.outTime)?x.outTime:'';
      return \`<span style="display:inline-flex;align-items:center;gap:4px;background:\${color}20;color:\${color};border:1px solid \${color}50;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600">
        \${x.name}\${t?' '+t:''}
        <span onclick="attRemoveEx('\${x.name}')" style="cursor:pointer;font-size:14px;font-weight:700;margin-left:2px">✕</span>
      </span>\`;
    }).join('');
    exHtml+=\`<div style="margin-bottom:8px">
      <span style="font-size:12px;font-weight:700;color:\${color}">\${ATT_ICON[s]} \${ATT_SL[s]} \${arr.length}명</span>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px">\${chips}</div>
    </div>\`;
  });
  const exCnt=Object.values(_attRecs).filter(r=>r&&r.status!=='normal').length;
  const normalCnt=_attEmps.length-exCnt;

  el.innerHTML=\`
    <div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0 2px">\${btnHtml}</div>
    \${checkPanel}
    <div style="margin-top:14px;padding:12px 14px;background:var(--g1);border-radius:10px">
      <div style="font-size:12px;font-weight:700;color:var(--g5);margin-bottom:8px">등록된 예외 직원</div>
      \${exHtml||'<div style="font-size:12px;color:var(--g4)">없음</div>'}
      <div style="font-size:12px;color:var(--g4);margin-top:6px;padding-top:8px;border-top:1px solid var(--g2)">
        나머지 <b style="color:var(--g6)">\${normalCnt}명</b> → 자동 정상 (09:00~18:00)
      </div>
    </div>\`;
}

function attSelectStatus(s){
  _attSelStatus=_attSelStatus===s?'':s;
  _renderAttInput();
}
function attCheckAll(checked){_attEmps.forEach((_,i)=>{const cb=document.getElementById('attChk_'+i);if(cb)cb.checked=checked;});}

function attBulkTimeInput(v){
  v=v.replace(/[^0-9]/g,'');if(v.length>4)v=v.slice(0,4);
  const el=document.getElementById('attBulkTime'),lb=document.getElementById('attBulkCalcLabel');
  if(v.length===4){
    const fmt=v.slice(0,2)+':'+v.slice(2);
    if(el)el.value=fmt;
    if(lb&&_attSelStatus==='early')lb.textContent='→ 퇴근 '+_attCalcOut(fmt)+' 자동';
    else if(lb)lb.textContent='';
  }else{if(lb)lb.textContent='';}
}

function attApplyChecked(){
  const needTime=!!ATT_NEEDS_TIME[_attSelStatus];
  let timeVal='';
  if(needTime){const tEl=document.getElementById('attBulkTime');timeVal=tEl?_attFmt(tEl.value):'';}
  let cnt=0;
  _attEmps.forEach((e,i)=>{
    const cb=document.getElementById('attChk_'+i);if(!cb)return;
    if(cb.checked){
      let inT='09:00',outT='18:00';
      if(_attSelStatus==='early'){inT=timeVal||'07:00';outT=_attCalcOut(inT);}
      else if(_attSelStatus==='overtime'){inT='09:00';outT=timeVal||'19:00';}
      else if(_attSelStatus==='half-am'){inT='09:00';outT='13:00';}
      else if(_attSelStatus==='half-pm'){inT='13:00';outT='18:00';}
      else if(_attSelStatus==='quarter'){inT='09:00';outT='11:00';}
      else if(_attSelStatus==='annual'||_attSelStatus==='absent'){inT='';outT='';}
      _attRecs[e.name]={status:_attSelStatus,inTime:inT,outTime:outT};
      cnt++;
    }else{
      if((_attRecs[e.name]||{}).status===_attSelStatus)delete _attRecs[e.name];
    }
  });
  const sl=ATT_SL[_attSelStatus]||'';
  _attSelStatus='';
  toast(cnt+'명 '+sl+' 적용됨 ✓','s');
  _renderAttInput();
}

function attRemoveEx(name){delete _attRecs[name];_renderAttInput();}

function _renderAttMonthly(){
  const el=document.getElementById('attMonthlyBody');if(!el)return;
  const ym=_attDate.slice(0,7),year=parseInt(ym.slice(0,4)),month=parseInt(ym.slice(5,7));
  const days=new Date(year,month,0).getDate();
  let hdr=\`<tr style="background:var(--g1)"><th style="padding:5px 8px;text-align:left;font-size:12px;border:0.5px solid var(--g2);white-space:nowrap;position:sticky;left:0;background:var(--g1)">이름</th>\`;
  for(let d=1;d<=days;d++){
    const dt=new Date(year,month-1,d),ds=\`\${year}-\${String(month).padStart(2,'0')}-\${String(d).padStart(2,'0')}\`,isTd=ds===tod();
    const c=isTd?'#1a56db':dt.getDay()===0?'#e53935':dt.getDay()===6?'#1565c0':'';
    hdr+=\`<th style="padding:5px 3px;font-size:10px;border:0.5px solid var(--g2);min-width:22px;text-align:center\${c?';color:'+c:''}">\${d}</th>\`;
  }
  hdr+='<th style="padding:5px 4px;font-size:10px;border:0.5px solid var(--g2)">결</th><th style="padding:5px 4px;font-size:10px;border:0.5px solid var(--g2)">연</th></tr>';
  document.getElementById('attMonthlyHeader').innerHTML=hdr;
  const sI={early:'조',overtime:'연','half-am':'반','half-pm':'반',quarter:'반반',annual:'연',absent:'결'};
  const sC={early:'#1565c0',overtime:'#e65100','half-am':'#6a1b9a','half-pm':'#6a1b9a',quarter:'#4a148c',annual:'#ad1457',absent:'#e53935'};
  el.innerHTML=_attEmps.map(e=>{
    let ab=0,an=0,row=\`<tr><td style="padding:5px 8px;font-size:12px;border:0.5px solid var(--g2);white-space:nowrap;position:sticky;left:0;background:var(--bg)">\${e.name}</td>\`;
    for(let d=1;d<=days;d++){
      const ds=\`\${year}-\${String(month).padStart(2,'0')}-\${String(d).padStart(2,'0')}\`;
      const raw=localStorage.getItem(_attDateKey(ds)),r=raw?JSON.parse(raw)[e.name]:null,s=r?r.status:'';
      if(s==='absent')ab++;if(s==='annual')an++;
      const isTd=ds===tod();
      row+=\`<td style="padding:3px;font-size:9px;text-align:center;border:0.5px solid var(--g2)\${isTd?';background:#e3f2fd':''}\${sC[s]?';color:'+sC[s]:''}" onclick="attMonthClick('\${ds}')">\${sI[s]||''}</td>\`;
    }
    row+=\`<td style="padding:3px 5px;font-size:11px;text-align:center;border:0.5px solid var(--g2);color:#e53935">\${ab||''}</td><td style="padding:3px 5px;font-size:11px;text-align:center;border:0.5px solid var(--g2);color:#ad1457">\${an||''}</td></tr>\`;
    return row;
  }).join('');
}

function attMonthClick(date){
  _attSubTab='input';
  document.querySelectorAll('.att-sub-tab').forEach(t=>t.classList.remove('on'));
  document.querySelector('.att-sub-tab[data-tab="input"]')?.classList.add('on');
  _loadAttDate(date);
}

function _renderAttStaff(){
  const el=document.getElementById('attStaffList');if(!el)return;
  const sc=document.getElementById('attStaffCount');if(sc)sc.textContent=_attEmps.length;
  el.innerHTML=_attEmps.map((e,i)=>\`
    <div style="display:flex;align-items:center;padding:10px 0;border-bottom:0.5px solid var(--g2);gap:10px">
      <span style="font-size:12px;color:var(--g4);width:20px;text-align:right">\${i+1}</span>
      <span style="flex:1;font-size:14px">\${e.name}</span>
      <span style="font-size:12px;color:var(--g5)">연차 \${e.annualDays}일 / 잔여 <b style="color:var(--p)">\${e.annualDays-(e.usedDays||0)}일</b></span>
      <button class="btn bo bsm" onclick="attEditStaff(\${i})">수정</button>
      <button class="btn bo bsm" style="color:#e53935" onclick="attDeleteStaff(\${i})">삭제</button>
    </div>\`).join('');
}
function attAddStaff(){const n=prompt('직원 이름:');if(!n||!n.trim())return;const d=parseInt(prompt('연차 일수:','15'))||15;_attEmps.push({name:n.trim(),annualDays:d,usedDays:0});_saveAttEmps();_renderAttStaff();}
function attEditStaff(i){const e=_attEmps[i],n=prompt('이름:',e.name);if(!n)return;const d=parseInt(prompt('연차 일수:',e.annualDays))||e.annualDays;_attEmps[i]={...e,name:n.trim(),annualDays:d};_saveAttEmps();_renderAttStaff();}
function attDeleteStaff(i){if(!confirm(_attEmps[i].name+' 삭제?'))return;_attEmps.splice(i,1);_saveAttEmps();_renderAttStaff();}

function _attFmt(v){v=(v||'').replace(/[^0-9]/g,'');if(v.length>4)v=v.slice(0,4);if(v.length===3)v='0'+v;if(v.length===4)return v.slice(0,2)+':'+v.slice(2);return v;}
function _attCalcOut(t){if(!t||!t.includes(':'))return '18:00';const[h,m]=t.split(':').map(Number),tot=h*60+m+9*60;return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0');}
