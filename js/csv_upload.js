// ============================================================
// CSV 업로드 → Firebase
// ============================================================
// 바코드 문자열 파싱 (수입코드+이력코드 연속 문자열)
function parseBarcodeString(str) {
  const clean = str.replace(/\s+/g,'').replace(/[^0-9]/g,'');
  const pairs = [];
  // 패턴: 01로 시작하는 수입코드 + 8로 시작하는 12자리 이력코드
  const re = /(01\d+?)(8\d{11})(?=01|$)/g;
  let m;
  while((m = re.exec(clean)) !== null) {
    pairs.push({ importCode: m[1], traceCode: m[2] });
  }
  return pairs;
}

function previewUpload() {
  const raw = document.getElementById('up_paste').value.trim();
  if(!raw) { toast('데이터를 붙여넣으세요','d'); return; }
  const pairs = parseBarcodeString(raw);
  const el = document.getElementById('up_preview');
  if(!pairs.length) {
    el.style.display='block';
    el.innerHTML='❌ 파싱 실패 - 바코드 형식을 확인하세요';
    return;
  }
  el.style.display='block';
  el.innerHTML=`✅ ${pairs.length}건 파싱됨<br>`+
    pairs.slice(0,3).map((p,i)=>`${i+1}. 수입코드: ...${p.importCode.slice(-8)} / 이력코드: ${p.traceCode}`).join('<br>')+
    (pairs.length>3 ? `<br>... 외 ${pairs.length-3}건` : '');
}

async function uploadBarcodes() {
  const raw = document.getElementById('up_paste').value.trim();
  const dateVal = document.getElementById('up_date').value || tod();
  if(!raw) { toast('데이터를 붙여넣으세요','d'); return; }

  const pairs = parseBarcodeString(raw);
  if(!pairs.length) { toast('파싱 실패','d'); return; }

  const el = document.getElementById('up_preview');
  el.style.display='block';
  el.innerHTML=`업로드 준비 중...`;

  // Firebase에서 해당 날짜 기존 데이터 조회 (중복 체크용)
  const existing = await fbGetByDate('barcode', dateVal);
  const existingCodes = new Set(existing.map(r=>r.importCode));

  el.innerHTML=`업로드 중... (0/${pairs.length})`;

  let count=0, skip=0;
  for(const p of pairs) {
    // Firebase 기준 중복 체크
    if(existingCodes.has(p.importCode)){ skip++; continue; }

    const imp = parseImp(p.importCode);
    const tr = parseTr(p.traceCode);
    const judge = judgeBC(imp, tr);

    const rec = {
      id: gid(), date: dateVal,
      importCode: p.importCode, traceCode: p.traceCode,
      status: judge.status, part: imp.part, origin: tr.origin,
      weightKg: imp.weightKg, packDate: imp.packDate,
      expiryDate: imp.expiryDate, reason: judge.reason,
      rfStart: '', rfEnd: ''
    };

    const docId = `bc_${dateVal.replace(/-/g,'')}_${p.importCode.slice(-10)}`;
    const fbId = await fbSave('barcode', rec, docId);
    if(fbId) {
      rec.fbId = fbId;
      existingCodes.add(p.importCode); // 같은 업로드 내 중복 방지
      count++;
      el.innerHTML=`업로드 중... (${count}/${pairs.length})`;
    }
  }

  // 업로드 완료 후 서버에서 다시 로드
  await loadFromServer(dateVal);
  saveL();
  renderBC();
  el.innerHTML=`✅ ${count}건 업로드 완료${skip>0?' · 중복 '+skip+'건 건너뜀':''}`;
  toast(`${count}건 업로드 완료`);
}

// ============================================================
// 일일 작업 일지 엑셀 출력 (SheetJS)