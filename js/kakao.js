// ============================================================
// 카카오톡 알림 - "나에게 보내기" API
// 본인 카카오 계정으로 로그인 후 토큰 발급 → 본인 카톡으로 알람 발송
// ============================================================
const KAKAO_JS_KEY = '3c36e1a3bb9ea2d4445a5cd30dd906c1';
const KAKAO_REDIRECT_URI = 'https://wooms19-del.github.io/ssbon-2factory/';
const KAKAO_LS_TOKEN_KEY = 'ssbon_v6_kakao_token';

// ============================================================
// 페이지 로드 시 OAuth callback 처리 (?code= 파라미터)
// ============================================================
async function _kakaoCheckCallback(){
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if(!code) return;

  try{
    const resp = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'},
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_JS_KEY,
        redirect_uri: KAKAO_REDIRECT_URI,
        code: code
      })
    });
    const data = await resp.json();
    if(data.access_token){
      const token = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in||21600)*1000,
        refresh_token_expires_at: Date.now() + (data.refresh_token_expires_in||5184000)*1000
      };
      localStorage.setItem(KAKAO_LS_TOKEN_KEY, JSON.stringify(token));
      // URL에서 code 제거 (브라우저 히스토리 깔끔하게)
      window.history.replaceState({}, document.title, window.location.pathname);
      if(typeof toast === 'function') toast('카카오 로그인 완료 · 카톡 알림 활성화','s');
      else alert('카카오 로그인 완료. 카톡 알림이 활성화되었습니다.');
      // 설정 페이지 갱신
      if(typeof _renderKakaoStatus === 'function') _renderKakaoStatus();
    } else if(data.error){
      console.error('카카오 토큰 교환 실패:', data);
      if(typeof toast === 'function') toast('카카오 로그인 실패: '+data.error_description,'d');
    }
  }catch(e){
    console.error('카카오 OAuth 처리 오류:', e);
  }
}
window.addEventListener('load', _kakaoCheckCallback);

// ============================================================
// 카카오 로그인 시작 (사용자 클릭)
// ============================================================
function kakaoLogin(){
  if(!window.Kakao){ alert('카카오 SDK 로드 실패. 새로고침 후 다시 시도하세요.'); return; }
  if(!Kakao.isInitialized()){ Kakao.init(KAKAO_JS_KEY); }
  Kakao.Auth.authorize({
    redirectUri: KAKAO_REDIRECT_URI,
    scope: 'talk_message'
  });
}

// ============================================================
// 토큰 조회 + 자동 갱신
// ============================================================
async function _getKakaoToken(){
  const raw = localStorage.getItem(KAKAO_LS_TOKEN_KEY);
  if(!raw) return null;
  let token;
  try{ token = JSON.parse(raw); }catch(e){ return null; }

  // refresh_token도 만료 → 재로그인 필요
  if(token.refresh_token_expires_at && Date.now() > token.refresh_token_expires_at){
    localStorage.removeItem(KAKAO_LS_TOKEN_KEY);
    return null;
  }

  // access_token 만료 임박 (1분 여유) → refresh
  if(Date.now() > token.expires_at - 60000){
    try{
      const resp = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'},
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: KAKAO_JS_KEY,
          refresh_token: token.refresh_token
        })
      });
      const data = await resp.json();
      if(data.access_token){
        token.access_token = data.access_token;
        token.expires_at = Date.now() + (data.expires_in||21600)*1000;
        if(data.refresh_token){
          token.refresh_token = data.refresh_token;
          token.refresh_token_expires_at = Date.now() + (data.refresh_token_expires_in||5184000)*1000;
        }
        localStorage.setItem(KAKAO_LS_TOKEN_KEY, JSON.stringify(token));
      } else { return null; }
    }catch(e){ console.error('카카오 토큰 갱신 실패:', e); return null; }
  }
  return token.access_token;
}

// ============================================================
// 카톡 메시지 전송 - 나에게 보내기
// ============================================================
async function sendKakaoAlert(label, value, mean){
  const token = await _getKakaoToken();
  if(!token){
    if(confirm('카카오 로그인이 필요합니다.\n지금 로그인하시겠습니까?')){
      kakaoLogin();
    }
    return;
  }

  const dt = new Date();
  const dateStr = `${dt.getMonth()+1}월 ${dt.getDate()}일 ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  const dev = (((value - mean) / Math.abs(mean - value > 0 ? 1 : 1))).toFixed(1);

  const template = {
    object_type: 'text',
    text: `🚨 순수본 2공장 이상 알림\n\n[${label}]\n평소 ${mean.toFixed(2)}% → 오늘 ${value.toFixed(2)}%\n\n${dateStr} 발생\n시스템에서 확인하세요.`,
    link: {
      web_url: 'https://wooms19-del.github.io/ssbon-2factory/',
      mobile_web_url: 'https://wooms19-del.github.io/ssbon-2factory/'
    },
    button_title: '시스템 열기'
  };

  try{
    const resp = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: 'template_object=' + encodeURIComponent(JSON.stringify(template))
    });
    const data = await resp.json();
    if(data.result_code === 0){
      if(typeof toast === 'function') toast('✓ 카톡 발송 완료','s');
      else alert('카톡 발송 완료');
    } else {
      const errMsg = data.msg || data.error_description || '알 수 없는 오류';
      if(typeof toast === 'function') toast('발송 실패: '+errMsg,'d');
      else alert('발송 실패: '+errMsg);
      console.error('카카오 메시지 전송 실패:', data);
    }
  }catch(e){
    if(typeof toast === 'function') toast('발송 오류: '+e.message,'d');
    console.error(e);
  }
}

// ============================================================
// 카카오 로그인 상태 확인
// ============================================================
function isKakaoLoggedIn(){
  const raw = localStorage.getItem(KAKAO_LS_TOKEN_KEY);
  if(!raw) return false;
  try{
    const t = JSON.parse(raw);
    return t && t.access_token && Date.now() < (t.refresh_token_expires_at || 0);
  }catch(e){ return false; }
}

function getKakaoExpiry(){
  const raw = localStorage.getItem(KAKAO_LS_TOKEN_KEY);
  if(!raw) return null;
  try{
    const t = JSON.parse(raw);
    return new Date(t.refresh_token_expires_at);
  }catch(e){ return null; }
}

// ============================================================
// 카카오 로그아웃 (토큰 삭제)
// ============================================================
function kakaoLogout(){
  if(!confirm('카카오 알림을 해제하시겠습니까?\n다시 사용하려면 재로그인 필요.')) return;
  localStorage.removeItem(KAKAO_LS_TOKEN_KEY);
  if(typeof toast === 'function') toast('카카오 로그아웃됨','i');
  if(typeof _renderKakaoStatus === 'function') _renderKakaoStatus();
}

// ============================================================
// 설정 페이지 카카오 알림 박스 렌더링
// ============================================================
function _renderKakaoStatus(){
  const box = document.getElementById('kakao_status_box');
  const stat = document.getElementById('acc-kakao-status');
  if(!box) return;
  if(isKakaoLoggedIn()){
    const exp = getKakaoExpiry();
    const expStr = exp ? exp.toLocaleDateString('ko-KR') : '?';
    if(stat) stat.textContent = '· 활성';
    box.innerHTML = `<div style="background:#ECFDF5;border:1px solid #10B981;border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="color:#10B981;font-size:14px">●</span>
      <div style="flex:1;min-width:200px">
        <div style="font-size:13px;color:#065F46;font-weight:600;margin-bottom:2px">카카오 알림 활성화됨</div>
        <div style="font-size:11px;color:#047857">빨간 알람 발생 시 본인 카톡으로 발송 가능 · 만료 ${expStr}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn bo bsm" onclick="sendKakaoAlert('테스트',95.5,96.0)">📱 테스트 발송</button>
        <button class="btn bd bsm" onclick="kakaoLogout()">로그아웃</button>
      </div>
    </div>`;
  } else {
    if(stat) stat.textContent = '· 비활성';
    box.innerHTML = `<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px">
      <div style="font-size:12px;color:#6B7280;margin-bottom:10px;line-height:1.5">
        카카오 로그인 후 빨간 알람 발생 시 본인 카톡으로 메시지 발송됩니다.<br>
        한 번 로그인하면 약 2개월 동안 자동 갱신됩니다.
      </div>
      <button onclick="kakaoLogin()" style="padding:9px 18px;background:#FEE500;color:#3C1E1E;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:6px">
        <span style="font-size:14px">💬</span> 카카오 로그인
      </button>
    </div>`;
  }
}
