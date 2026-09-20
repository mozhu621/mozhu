'use strict';
(() => {
  const API='https://fund-exam-sprint-0922.mozhu621.chatgpt.site';
  const CALLBACK='https://mozhu621.github.io/mozhu/';
  const KEY='fund-github-session-v1',PENDING='fund-github-login-v1';
  const read=key=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
  let session=read(KEY);
  const validSession=()=>/^[a-f0-9]{64}$/.test(session?.token||'')&&Number.isFinite(session?.expiresAt)&&session.expiresAt>Date.now();
  const signedOut=()=>new Response(JSON.stringify({error:'sign_in_required'}),{status:401,headers:{'Content-Type':'application/json'}});
  const random=size=>Array.from(crypto.getRandomValues(new Uint8Array(size)),x=>x.toString(16).padStart(2,'0')).join('');
  const sha256=async text=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const localPath=name=>new URL(name,new URL('./',location.href)).href;
  async function signIn(){
    const verifier=random(32),state=random(16),challenge=await sha256(verifier);
    // Detect unavailable session storage before leaving this page.
    sessionStorage.setItem(PENDING,JSON.stringify({verifier,state,at:Date.now()}));
    location.assign(API+'/connect?'+new URLSearchParams({redirect_uri:CALLBACK,code_challenge:challenge,state}));
  }
  async function finish(){
    const hash=new URLSearchParams(location.hash.slice(1)),code=hash.get('code');
    if(!code)return;
    const pending=read(PENDING);
    // Clear the one-time code from browser history before any network request.
    history.replaceState(null,'',location.pathname+location.search);
    sessionStorage.removeItem(PENDING);
    if(!pending||pending.state!==hash.get('state')||Date.now()-pending.at>1800000)throw Error('登录连接已过期，请重新登录。');
    const response=await fetch(API+'/api/pages/exchange',{method:'POST',credentials:'omit',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,verifier:pending.verifier,redirect_uri:CALLBACK})});
    const data=await response.json();
    if(!response.ok||!/^[a-f0-9]{64}$/.test(data.token||''))throw Error('登录连接未完成，请重新登录。');
    session={token:data.token,expiresAt:data.expiresAt};
    sessionStorage.setItem(KEY,JSON.stringify(session));
  }
  const ready=finish();
  async function apiFetch(path,options={}){
    await ready;
    const headers=new Headers(options.headers||{});
    if(validSession())headers.set('Authorization','Bearer '+session.token);
    else{
      session=null;try{sessionStorage.removeItem(KEY);}catch{}
      // A visitor without a Pages session cannot read cloud records. Show the
      // sign-in screen locally, even when the account service is unreachable.
      if(path==='/api/progress'||path==='/api/pages/logout')return signedOut();
    }
    const response=await fetch(API+path,{...options,headers,credentials:'omit',mode:'cors'});
    if(response.status===401&&path==='/api/progress'){session=null;try{sessionStorage.removeItem(KEY);}catch{}}
    return response;
  }
  async function logout(){
    await apiFetch('/api/pages/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    session=null;sessionStorage.removeItem(KEY);
    for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('fund-study-2026-v1-cloud-draft'))localStorage.removeItem(key);}
    location.assign(localPath('login.html'));
  }
  window.FundAPI={fetch:apiFetch,signIn,logout,ready,path:name=>localPath(name==='account'?'account.html':'login.html'),accountURL:API+'/account',studyURL:API+'/'};
  if(document.getElementById('github-login')){
    const button=document.getElementById('github-login'),message=document.getElementById('login-message');
    button.addEventListener('click',async()=>{button.disabled=true;message.textContent='正在打开账号登录…';try{await signIn();}catch{button.disabled=false;message.textContent='请允许浏览器使用网站存储后重试。';}});
  }
  if(document.getElementById('github-account')){
    apiFetch('/api/progress').then(async response=>{
      if(!response.ok){location.assign(localPath('login.html'));return;}
      const data=await response.json();document.getElementById('account-name').textContent=data.account?.username||'学习账号';
      document.getElementById('github-account-settings').href=API+'/account';
      document.getElementById('github-logout').addEventListener('click',async e=>{e.target.disabled=true;try{await logout();}catch{document.getElementById('account-message').textContent='退出未完成，请检查网络后重试。';e.target.disabled=false;}});
    }).catch(()=>{document.getElementById('account-message').textContent='暂时无法读取账号，请检查网络后刷新页面。';});
  }
  ready.catch(error=>{const target=document.getElementById('login-message');if(target)target.textContent=error.message;});
})();
