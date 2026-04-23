// 24시간 드럼 피커
// ============================================================
(function(){
  let _tpTarget = null;
  const ITEM_H = 48;

  function _buildItems(){
    const hEl = document.getElementById('tpHourItems');
    const mEl = document.getElementById('tpMinItems');
    if(!hEl.children.length){
      for(let i=0;i<24;i++){
        const d = document.createElement('div');
        d.style.cssText = `height:${ITEM_H}px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;scroll-snap-align:center;color:#1f2937`;
        d.textContent = String(i).padStart(2,'0');
        hEl.appendChild(d);
      }
      for(let i=0;i<60;i++){
        const d = document.createElement('div');
        d.style.cssText = `height:${ITEM_H}px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;scroll-snap-align:center;color:#1f2937`;
        d.textContent = String(i).padStart(2,'0');
        mEl.appendChild(d);
      }
      // 스크롤바 숨기기
      const style = document.createElement('style');
      style.textContent = '#tpHours::-webkit-scrollbar,#tpMins::-webkit-scrollbar{display:none}';
      document.head.appendChild(style);
    }
  }

  function _scrollTo(colEl, idx){
    colEl.scrollTo({ top: idx * ITEM_H, behavior: 'instant' });
  }

  function _getIdx(colEl){
    return Math.round(colEl.scrollTop / ITEM_H);
  }

  window.openTimePicker = function(el){
    _tpTarget = el;
    _buildItems();
    const picker = document.getElementById('timePicker');
    picker.style.display = 'flex';
    const val = el.value || nowHM();
    const parts = val.match(/^(\d{1,2}):(\d{2})$/);
    const h = parts ? parseInt(parts[1]) : new Date().getHours();
    const m = parts ? parseInt(parts[2]) : new Date().getMinutes();
    setTimeout(()=>{
      _scrollTo(document.getElementById('tpHours'), Math.max(0,Math.min(23,h)));
      _scrollTo(document.getElementById('tpMins'),  Math.max(0,Math.min(59,m)));
    }, 50);
  };

  window.tpConfirm = function(){
    if(_tpTarget){
      const h = _getIdx(document.getElementById('tpHours'));
      const m = _getIdx(document.getElementById('tpMins'));
      _tpTarget.value = String(Math.min(23,Math.max(0,h))).padStart(2,'0') + ':' + String(Math.min(59,Math.max(0,m))).padStart(2,'0');
      _tpTarget.dispatchEvent(new Event('change',{bubbles:true}));
    }
    document.getElementById('timePicker').style.display = 'none';
    _tpTarget = null;
  };

  window.tpCancel = function(){
    document.getElementById('timePicker').style.display = 'none';
    _tpTarget = null;
  };

  // 배경 탭 시 닫기
  document.getElementById('timePicker').addEventListener('click', function(e){
    if(e.target === this) tpCancel();
  });

  // 모든 HH:MM 입력창에 피커 연결 (이벤트 위임)
  document.addEventListener('focus', function(e){
    if(e.target.placeholder === 'HH:MM'){
      e.target.blur();
      openTimePicker(e.target);
    }
  }, true);
  document.addEventListener('click', function(e){
    if(e.target.placeholder === 'HH:MM'){
      openTimePicker(e.target);
    }
  }, true);
})();

// ============================================================
// 자동 새로고침 (태블릿 항상 최신 유지)
// ① 매일 오전 6시 자동 새로고침
// ② 화면이 2시간 이상 꺼져있다 다시 켜지면 새로고침
// ============================================================
(function(){
  // ① 오전 6시 새로고침 예약
  function schedule6amReload(){
    var now = new Date();
    var next = new Date(now);
    next.setHours(6,0,0,0);
    if(next <= now) next.setDate(next.getDate()+1);
    setTimeout(function(){ location.reload(); }, next-now);
  }
  schedule6amReload();

  // ② 화면 꺼졌다 켜질 때 2시간 이상 지났으면 새로고침
  var hiddenAt = null;
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){
      hiddenAt = Date.now();
    } else {
      if(hiddenAt && Date.now()-hiddenAt > 2*60*60*1000){
        location.reload();
      }
      hiddenAt = null;
    }
  });
})();