import {createClient} from '@supabase/supabase-js';

const config=window.FUND_CONFIG||{};
const localPath=name=>new URL(name,new URL('./',location.href)).href;
const url=String(config.supabaseUrl||'').replace(/\/$/,'');
const publicKey=String(config.publishableKey||'');
function publicOnly(key){
  if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return true;
  try{return JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role==='anon';}catch{return false;}
}
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&publicOnly(publicKey);
const localMode=!configured||new URLSearchParams(location.search).get('local')==='1';
const client=configured?createClient(url,publicKey,{auth:{flowType:'pkce',storageKey:'fund-independent-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
const ready=client?client.auth.getSession().then(({error})=>{if(error)throw error;}):Promise.resolve();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function apiFetch(path,options={}){
  await ready;
  if(path!=='/api/progress')return json({error:'not_found'},404);
  let result=await client.auth.getSession();
  if(result.error||!result.data.session)return json({error:'sign_in_required'},401);
  for(let attempt=0;attempt<2;attempt++){
    const response=await fetch(url+'/functions/v1/fund-study',{...options,headers:{'Content-Type':'application/json',apikey:publicKey,Authorization:'Bearer '+result.data.session.access_token},credentials:'omit',mode:'cors'});
    if(response.status!==401||attempt===1)return response;
    result=await client.auth.refreshSession();
    if(result.error||!result.data.session)return json({error:'sign_in_required'},401);
  }
}
window.FundIndependent={configured,localMode,client,ready,path:localPath};
if(!localMode)window.FundAPI={ready,fetch:apiFetch,path:()=>localPath('account.html'),studyURL:localPath('./?local=1')};
ready.catch(()=>{});

const account=document.getElementById('account-root');
if(account){
  const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brand='<div class="account-brand"><span class="brandmark">基</span><strong>基金从业 · 冲刺学习室</strong></div>';
  let mode=new URLSearchParams(location.search).get('reset')==='1'?'password':'login',busy=false;
  const errors={invalid_credentials:'邮箱或密码不正确。',email_not_confirmed:'请先打开注册邮箱中的确认邮件。',user_already_exists:'该邮箱已有账号，请登录。',weak_password:'密码强度不足，请使用更长的密码。',over_email_send_rate_limit:'邮件发送次数已达限制，请稍后再试。'};
  function message(text){document.getElementById('account-message').textContent=text;}
  async function render(){
    if(!configured){account.innerHTML=brand+'<section class="account-card"><h1>先开始学习</h1><p>独立云端账号尚未开通。目前可以直接刷题，记录保存在当前浏览器。</p><a class="btn primary account-submit" href="./">进入学习室</a><p class="account-fine">可在学习室的“记录备份”中导出记录，之后再导入其他设备或云端账号。</p></section>';return;}
    let session;try{await ready;session=(await client.auth.getSession()).data.session;}catch{message('登录连接未完成，请重新打开账号页。');return;}
    if(session&&mode!=='password'){
      account.innerHTML=brand+`<section class="account-card"><h1>我的学习账号</h1><p>${esc(session.user.email)}</p><a class="btn primary account-submit" href="./">继续学习</a><div class="account-links"><button type="button" id="change-password">修改密码</button><button type="button" id="signout">退出登录</button></div><p id="account-message" role="status"></p></section>`;
      document.getElementById('change-password').addEventListener('click',()=>{mode='password';render();});
      document.getElementById('signout').addEventListener('click',async()=>{if(busy)return;busy=true;const {error}=await client.auth.signOut({scope:'local'});busy=false;if(error){message('退出失败，请稍后重试。');return;}render();});return;
    }
    const title={login:'登录学习账号',register:'注册学习账号',recover:'找回密码',password:'设置新密码'}[mode];
    account.innerHTML=brand+`<section class="account-card"><h1>${title}</h1><p class="account-note">使用邮箱和密码，错题与成绩随账号保存。</p><form id="account-form">${mode!=='password'?'<label class="account-field">邮箱<input type="email" name="email" autocomplete="email" required maxlength="254"></label>':''}${mode!=='recover'?'<label class="account-field">密码<input type="password" name="password" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" required minlength="12" maxlength="128"></label>':''}${mode==='register'||mode==='password'?'<label class="account-field">确认密码<input type="password" name="confirm" autocomplete="new-password" required minlength="12" maxlength="128"></label>':''}<button class="btn primary account-submit" type="submit">${title}</button></form><p id="account-message" role="status"></p><div class="account-links">${mode==='login'?'<button data-mode="register" type="button">注册账号</button><button data-mode="recover" type="button">忘记密码</button>':'<button data-mode="login" type="button">返回登录</button>'}<a href="./?local=1">本机学习</a></div></section>`;
    account.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{if(!busy){mode=button.dataset.mode;render();}}));
    document.getElementById('account-form').addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;const fields=Object.fromEntries(new FormData(event.target));
      if((mode==='register'||mode==='password')&&fields.password!==fields.confirm){message('两次密码不一致。');return;}
      const button=event.target.querySelector('button[type="submit"]');busy=true;button.disabled=true;message('正在处理…');
      try{
        let result;
        if(mode==='login')result=await client.auth.signInWithPassword({email:fields.email,password:fields.password});
        if(mode==='register')result=await client.auth.signUp({email:fields.email,password:fields.password,options:{emailRedirectTo:localPath('account.html')}});
        if(mode==='recover')result=await client.auth.resetPasswordForEmail(fields.email,{redirectTo:localPath('account.html?reset=1')});
        if(mode==='password')result=await client.auth.updateUser({password:fields.password});
        if(result.error)throw result.error;
        event.target.reset();
        if(mode==='recover'){message('如邮箱已注册，将收到密码重置邮件。请在当前浏览器打开链接。');return;}
        if(mode==='register'&&!result.data.session){message('请打开注册邮箱中的确认邮件，再回来登录。');return;}
        if(mode==='password'){mode='login';await render();return;}
        location.assign(localPath('./'));
      }catch(error){message(errors[error.code]||'暂时无法完成，请检查网络后重试。');}
      finally{busy=false;button.disabled=false;}
    });
  }
  account.innerHTML=brand+'<p id="account-message" role="status">正在打开账号页…</p>';render();
}
