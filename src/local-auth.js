(()=>{
'use strict';
const USERS='fund-local-users-v1',SESSION='fund-local-session-v1';
const read=()=>JSON.parse(localStorage.getItem(USERS)||'[]');
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
async function digest(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:210000,hash:'SHA-256'},key,256));}
let resolveReady;
const auth=window.FundLocal={ready:new Promise(resolve=>resolveReady=resolve),user:null,key:null};
const account=!!document.getElementById('local-account-root');
let users;
try{users=read();const session=JSON.parse(sessionStorage.getItem(SESSION)||'null');auth.user=users.find(u=>u.id===session?.id)||null;}catch{users=[];}
function activate(user){auth.user=user;auth.key='fund-study-local-'+user.id;}
if(auth.user)activate(auth.user);
if(auth.user&&!account){resolveReady();return;}
const root=document.getElementById('local-account-root')||document.getElementById('app');
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brand='<div class="account-brand"><span class="brandmark">基</span><strong>基金从业 · 本机学习账号</strong></div>';
const note='<p class="account-fine">账号与学习记录仅保存在当前浏览器，不会上传，也不会自动同步。清理浏览器数据会删除记录，请在学习室定期导出备份。本机密码只是访问门槛，学习记录未加密；请勿使用重要账号的密码。</p>';
function render(register=false){
 document.body.classList.add('account-body');root.classList.add('account-wrap');
 if(auth.user){root.innerHTML=brand+'<section class="account-card"><h1>'+esc(auth.user.name)+'</h1><p>已登录本机账号</p><a class="btn primary account-submit" href="./">继续学习</a><button class="btn" id="local-logout">退出并切换账号</button>'+note+'</section>';document.getElementById('local-logout').onclick=()=>{sessionStorage.removeItem(SESSION);auth.user=null;auth.key=null;render();};return;}
 root.innerHTML=brand+'<section class="account-card"><h1>'+(register?'注册本机账号':'登录本机账号')+'</h1><form id="local-form"><label class="account-field">用户名<input name="username" required minlength="2" maxlength="32" autocomplete="username"></label><label class="account-field">密码<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="'+(register?'new-password':'current-password')+'"></label>'+(register?'<label class="account-field">确认密码<input name="confirm" type="password" required autocomplete="new-password"></label>':'')+'<button class="btn primary account-submit" type="submit">'+(register?'注册并开始学习':'登录')+'</button></form><p id="local-message" role="status"></p><button class="btn" id="local-toggle">'+(register?'已有本机账号，登录':'第一次使用，注册本机账号')+'</button>'+note+'<p class="account-fine">旧版云端账号不能在此登录。忘记密码没有在线找回功能，可新建本机账号并导入自己的记录备份。</p></section>';
 document.getElementById('local-toggle').onclick=()=>render(!register);
 document.getElementById('local-form').onsubmit=async event=>{
  event.preventDefault();const form=event.target,button=form.querySelector('button'),message=document.getElementById('local-message');button.disabled=true;
  try{const fields=Object.fromEntries(new FormData(form)),name=fields.username.trim(),normalized=name.normalize('NFKC').toLowerCase();if(name.length<2)throw Error('用户名至少2个字符。');users=read();let user=users.find(u=>u.normalized===normalized);
   if(register){if(user)throw Error('用户名已存在，请登录。');if(fields.password!==fields.confirm)throw Error('两次密码不一致。');const salt=hex(crypto.getRandomValues(new Uint8Array(16)));const hash=await digest(fields.password,salt);users=read();if(users.some(u=>u.normalized===normalized))throw Error('用户名已存在，请登录。');user={id:crypto.randomUUID(),name,normalized,salt,hash};localStorage.setItem(USERS,JSON.stringify([...users,user]));}
   else if(!user||await digest(fields.password,user.salt)!==user.hash)throw Error('用户名或密码不正确。');
   sessionStorage.setItem(SESSION,JSON.stringify({id:user.id}));activate(user);location.assign('./');
  }catch(error){message.textContent=error.name==='QuotaExceededError'||error.name==='SecurityError'?'浏览器不允许保存，请使用普通窗口并允许网站存储。':error.message;}finally{button.disabled=false;}
 };
}
render();
})();
