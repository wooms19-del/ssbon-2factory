// ============================================================
async function exportDailyReport() {
  const dateEl = document.getElementById('exp_date');
  const date = dateEl ? dateEl.value : tod();
  if(!date) { toast('날짜를 선택하세요','d'); return; }
  toast('일지 생성 중...','i');

  const prevD = (()=>{const d=new Date(date+'T00:00:00');d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);})();

  let [bc,th,pp,ck,sh,pk,sc_] = await Promise.all([
    fbGetByDate('barcode',prevD), fbGetByDate('thawing',date),
    fbGetByDate('preprocess',date), fbGetByDate('cooking',date),
    fbGetByDate('shredding',date), fbGetByDate('packing',date),
    fbGetByDate('sauce',date),
  ]);

  const _dd=(a,fn)=>{const s=new Set();return a.filter(r=>{const k=fn(r);if(s.has(k))return false;s.add(k);return true;});};
  pp=_dd(pp,r=>(r.cage||'')+'|'+r.date+'|'+(r.start||'')+'|'+r.kg);
  ck=_dd(ck,r=>(r.tank||'')+'|'+r.date+'|'+(r.start||'')+'|'+r.kg);
  sh=_dd(sh,r=>(r.wagonIn||'')+'|'+r.date+'|'+(r.start||'')+'|'+r.kg);
  pk=_dd(pk,r=>(r.machine||'')+'|'+r.date+'|'+(r.start||'')+'|'+r.ea);

  const wb = XLSX.utils.book_new();

  // 스타일 헬퍼 (SheetJS CE는 스타일 미지원 → 데이터 중심)
  function aoa(data) { return XLSX.utils.aoa_to_sheet(data); }
  function addSheet(name, data, colWidths) {
    const ws = aoa(data);
    if(colWidths) ws['!cols'] = colWidths.map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  function r2(v){ return Math.round(parseFloat(v)*100)/100; }
  function dur2(s,e){ if(!s||!e)return 0; const tm=t=>{const p=t.split(':');return+p[0]*60+(+p[1]||0);}; let d=tm(e)-tm(s);if(d<0)d+=1440;return r2(d/60); }

  const rmKg = r2(bc.filter(b=>b.status==='적합').reduce((s,b)=>s+(parseFloat(b.weightKg)||0),0));
  const ppKg = r2(pp.reduce((s,r)=>s+(parseFloat(r.kg)||0),0));
  const ckKg = r2(ck.reduce((s,r)=>s+(parseFloat(r.kg)||0),0));
  const shKg = r2(sh.reduce((s,r)=>s+(parseFloat(r.kg)||0),0));
  const totalEA = pk.reduce((s,r)=>s+(parseFloat(r.ea)||0),0);
  const defEA = pk.reduce((s,r)=>s+(parseFloat(r.defect)||0),0);
  const pkKg2 = r2(pk.reduce((s,r)=>{ const p=L.products.find(x=>x.name===r.product); return s+(p?(parseFloat(r.ea)||0)*p.kgea:0); },0));

  // ── 시트1: 일일생산일지 ──────────────────────────
  const s1 = [
    [`순수본 2공장  일일 생산 작업 일지`],
    [`작업일자: ${date}`, '', '', '', '담당자:', '', '확인자:', ''],
    [],
    ['[ 원육 투입 현황 ]', '', `원육일자: ${prevD}`],
    ['부위', '박스수', '중량(kg)', '비고'],
    ...Object.entries(bc.filter(b=>b.status==='적합').reduce((m,b)=>{
      if(!m[b.part]) m[b.part]={cnt:0,kg:0};
      m[b.part].cnt++; m[b.part].kg+=parseFloat(b.weightKg)||0; return m;
    },{})).map(([p,v])=>[p, v.cnt, r2(v.kg), '']),
    ['합계', bc.filter(b=>b.status==='적합').length, rmKg, ''],
    [],
    ['[ 공정별 현황 ]'],
    ['공정', '품목', '투입 KG', '산출 KG', '수율(%)', '인시', '작업시간'],
    ...['전처리','자숙','파쇄'].flatMap(nm => {
      const recs = {전처리:pp,자숙:ck,파쇄:sh}[nm];
      const inKg = {전처리:rmKg,자숙:ppKg,파쇄:ckKg}[nm];
      const outKg= {전처리:ppKg,자숙:ckKg,파쇄:shKg}[nm];
      const types=[...new Set(recs.map(r=>r.type||'미분류'))];
      if(!recs.length) return [[nm,'-',inKg,outKg,inKg>0?r2(outKg/inKg*100).toFixed(2)+'%':'-','-','-']];
      return types.map(t=>{
        const tr=recs.filter(r=>(r.type||'미분류')===t);
        const tOut=r2(tr.reduce((s,r)=>s+(parseFloat(r.kg)||0),0));
        const tIn=nm==='전처리'?r2(bc.filter(b=>b.status==='적합'&&b.part===t).reduce((ss,b)=>ss+(parseFloat(b.weightKg)||0),0)):(nm==='자숙'?r2(pp.filter(p=>p.type===t).reduce((ss,p)=>ss+(parseFloat(p.kg)||0),0)):r2(ck.filter(k=>k.type===t).reduce((ss,k)=>ss+(parseFloat(k.kg)||0),0)));
        const mh=r2(tr.reduce((s,r)=>s+dur2(r.start,r.end)*(parseFloat(r.workers)||0),0));
        const h=r2(tr.reduce((s,r)=>s+dur2(r.start,r.end),0));
        const yld=inKg>0?r2(outKg/inKg*100).toFixed(2)+'%':'-';
        return [nm,t,inKg,outKg,yld,mh,h+'h'];
      });
    }),
    ...Object.entries(pk.reduce((m,r)=>{
      const key=r.product||'기타';
      if(!m[key]){m[key]={ea:0,kg:0,mh:0,h:0};}
      const p=L.products.find(x=>x.name===key);
      m[key].ea+=parseFloat(r.ea)||0;
      m[key].kg+=p?(parseFloat(r.ea)||0)*p.kgea:0;
      m[key].mh+=dur2(r.start,r.end)*(parseFloat(r.workers)||0);
      m[key].h+=dur2(r.start,r.end);
      return m;
    },{})).map(([prod,v])=>{
      const yld=rmKg>0?r2(r2(v.kg)/rmKg*100).toFixed(2)+'%':'-';
      return ['포장',prod,rmKg,r2(v.kg),yld,r2(v.mh),r2(v.h)+'h'];
    }),
    [],
    ['[ 포장 실적 ]'],
    ['제품명', '생산 EA', '파우치', '불량 EA', '불량률(%)'],
    ...Object.entries(pk.reduce((m,r)=>{
      const k=r.product||'기타';
      if(!m[k]) m[k]={ea:0,pouch:0,defect:0};
      m[k].ea+=parseFloat(r.ea)||0; m[k].pouch+=parseFloat(r.pouch)||0; m[k].defect+=parseFloat(r.defect)||0;
      return m;
    },{})).map(([p,v])=>[p,v.ea,v.pouch,v.defect,v.ea>0?r2(v.defect/v.ea*100).toFixed(2)+'%':'-']),
    ['합계', totalEA, '', defEA, totalEA>0?r2(defEA/totalEA*100).toFixed(2)+'%':'-'],
    [],
    ['작성자:', '', '확인자:', ''],
  ];
  addSheet('일일생산일지', s1, [14,14,12,12,10,8,10,8]);

  // ── 시트2: 해동·방혈 상세 ────────────────────────
  const s2 = [
    [`해동 및 방혈 공정 점검표 - ${prevD}`], [],
    ['NO','수입코드(LOT번호)','부위','원산지','중량(kg)','소비기한','판정','방혈대차','방혈시작','방혈종료'],
    ...bc.map((b,i)=>[i+1,b.importCode||'',b.part||'',b.origin||'',b.weightKg||'',b.expiryDate||'',b.status||'','',b.rfStart||'',b.rfEnd||'']),
    ['합계','','','',rmKg,'','',`총 ${bc.filter(b=>b.status==='적합').length}박스 적합`,'',''],
  ];
  addSheet('해동·방혈', s2, [5,48,8,8,10,14,8,12,10,10]);

  // ── 시트3: 전처리 ──────────────────────────────
  const s3 = [
    [`전처리 공정 점검표 - ${date}`], [],
    ['대차번호','케이지LOT','원육타입','시작시간','종료시간','인원','투입KG','전처리KG','비가식부KG','수율(%)'],
    ...pp.map(r=>[r.wagons||'',r.cage||'',r.type||'',r.start||'',r.end||'',r.workers||0,rmKg,r.kg||0,r.waste||0,
      rmKg>0?r2((parseFloat(r.kg)||0)/rmKg*100).toFixed(2)+'%':'-']),
    ['합계','','','','','',rmKg,ppKg,'', rmKg>0 ? r2(ppKg/rmKg*100).toFixed(2)+'%' : '-'],
  ];
  addSheet('전처리', s3, [12,10,8,10,10,6,10,10,10,10]);

  // ── 시트4: 자숙 ────────────────────────────────
  const s4 = [
    [`자숙 공정 점검표 - ${date}`], [],
    ['탱크번호','케이지LOT','원육타입','투입KG','시작시간','종료시간','자숙후KG','품온(℃)','인원','배출와건LOT'],
    ...ck.map(r=>[r.tank||'',r.cage||'',r.type||'',ppKg,r.start||'',r.end||'',r.kg||0,'',r.workers||0,r.wagonOut||'']),
    ['합계','','',ppKg,'','',ckKg,'','', ppKg>0 ? r2(ckKg/ppKg*100).toFixed(2)+'%' : '-'],
  ];
  addSheet('자숙', s4, [12,10,8,10,10,10,10,8,8,14]);

  // ── 시트5: 파쇄 ────────────────────────────────
  const s5 = [
    [`파쇄 공정 점검표 - ${date}`], [],
    ['투입와건LOT','시작시간','종료시간','인원','투입KG','파쇄후KG','비가식부KG','배출와건LOT'],
    ...sh.map(r=>[r.wagonIn||'',r.start||'',r.end||'',r.workers||0,ckKg,r.kg||0,r.waste||0,r.wagonOut||'']),
    ['합계','','','',ckKg,shKg,'',ckKg>0?r2(shKg/ckKg*100).toFixed(2)+'%':'-'],
  ];
  addSheet('파쇄', s5, [14,10,10,6,10,10,10,14]);

  // ── 시트6: 포장 ────────────────────────────────
  const s6 = [
    [`포장 공정 점검표 - ${date}`], [],
    ['설비','투입와건LOT','원육타입','제품명','시작시간','종료시간','생산EA','파우치','불량EA','불량률(%)','소스탱크','소스KG'],
    ...pk.map(r=>{
      const defR=parseFloat(r.ea)>0?r2(parseFloat(r.defect)/parseFloat(r.ea)*100).toFixed(2)+'%':'-';
      return [r.machine||'',r.wagon||'',r.type||'',r.product||'',r.start||'',r.end||'',r.ea||0,r.pouch||0,r.defect||0,defR,r.sauceTank||'',r.sauceKg||0];
    }),
    ['합계','','','','','',totalEA,'',defEA,totalEA>0?r2(defEA/totalEA*100).toFixed(2)+'%':'','',''],
  ];
  addSheet('포장', s6, [8,14,8,20,10,10,10,8,8,10,10,8]);

  // ── 시트7: 소스 ────────────────────────────────
  if(sc_.length) {
    const s7 = [
      [`소스 제조 공정 점검표 - ${date}`], [],
      ['소스명','저장탱크','제조량(KG)','시작시간','종료시간','특이사항'],
      ...sc_.map(r=>[r.name||'',r.tank||'',r.kg||0,'','',r.note||'']),
    ];
    addSheet('소스', s7, [16,12,12,10,10,20]);
  }

  // ── 시트8: 외포장 ─────────────────────────────
  const opRecs = await fbGetRange('outerpacking', date, date);
  if(opRecs.length) {
    const s8 = [
      [`외포장 공정 점검표 - ${date}`], [],
      ['제품명','내포장 EA','외박스','제품불량(EA)','불량률(%)','잔여 EA','샘플','비고'],
      ...opRecs.map(r=>{
        const defRate = (r.innerEa||0)>0 ? r2((r.productDefect||0)/(r.innerEa||1)*100).toFixed(2)+'%' : '-';
        return [r.product||'',r.innerEa||0,r.outerBoxes||0,r.productDefect||0,defRate,r.remainEa||0,r.sample||0,r.note||''];
      }),
      ['합계','',opRecs.reduce((s,r)=>s+(r.outerBoxes||0),0),opRecs.reduce((s,r)=>s+(r.productDefect||0),0),'','','',''],
    ];
    addSheet('외포장', s8, [20,12,10,12,10,10,8,20]);
  }

    XLSX.writeFile(wb, `순수본2공장_작업일지_${date}.xlsx`);
  toast('일지 다운로드 완료 ✓');
}



// HTML onclick에서 접근 가능하도록 전역 등록