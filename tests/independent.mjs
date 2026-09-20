import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createHandler} from '../supabase/functions/fund-study/handler.mjs';
const data=JSON.parse(fs.readFileSync('content.json','utf8'));
const bank=Object.fromEntries(data.questions.map(q=>[q.id,q]));
const logs=[];
async function test(name,fn){await fn();logs.push('PASS '+name);}
function browser({cache={},blocked=false}={}){
  const elements={},clock={now:Date.now()},requests=[],downloads=[];
  const element=id=>elements[id]||={innerHTML:'',textContent:id==='study-data'?JSON.stringify(data):'',classList:{toggle(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},showModal(){this.open=true;},close(){this.open=false;},scrollIntoView(){},remove(){},click(){if(this.download)downloads.push(this);},appendChild(){}};
  const document={getElementById:id=>id==='account-root'?null:element(id),querySelectorAll(){return[];},addEventListener(){},createElement:()=>element('created-'+Object.keys(elements).length),body:{appendChild(){}},activeElement:{tagName:'BODY'},hidden:false};
  const storage={getItem:key=>cache[key]??null,setItem(key,value){if(blocked)throw Error('blocked');cache[key]=value;},removeItem:key=>delete cache[key],key:i=>Object.keys(cache)[i],get length(){return Object.keys(cache).length;}};
  const window={FundLocal:{ready:Promise.resolve()},FUND_CONFIG:{supabaseUrl:'',publishableKey:''},document,addEventListener(){},scrollTo(){},location:{href:'https://mozhu621.github.io/mozhu/',search:'',pathname:'/mozhu/'}};
  const DateMock=class extends Date{static now(){return clock.now;}};
  const sandbox={window,document,location:window.location,localStorage:storage,sessionStorage:storage,navigator:{},URL,URLSearchParams,Headers,Response,Request,TextEncoder,TextDecoder,Uint8Array,crypto,atob,btoa,Blob,AbortController,AbortSignal,Date:DateMock,console,setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;},clearInterval(){},fetch:async(...args)=>{requests.push(args);throw Error('No network allowed');}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('independent-client.js','utf8'),sandbox);vm.runInContext(fs.readFileSync('study.js','utf8'),sandbox);
  return{sandbox,window,elements,requests,cache,clock,downloads};
}
async function ready(page){for(let i=0;i<30;i++){if(page.window.FundStudy)return page.window.FundStudy;await nextTurn();}throw Error('Study UI did not start');}
let page,api,qid;
await test('Bundled website starts without accounts, OpenAI, or any network request',async()=>{
  page=browser();api=await ready(page);assert.equal(page.requests.length,0);assert(page.elements.app.innerHTML.includes('学习概览'));
  assert(page.elements.app.innerHTML.includes('学习记录保存在当前浏览器'));assert.equal(page.window.__FUND_CLOUD__,false);
});
await test('Practice explains wrong answers and restores them after reload',async()=>{
  api.startPractice({subject:1,limit:20});let practice=api.getState().practice;qid=practice.ids[0];
  api.handle('practice-answer',(bank[qid].answer+1)%4,{});api.confirmPractice();
  assert.equal(api.getState().stats[qid].wrong,1);assert(page.elements.app.innerHTML.includes('解析'));
  const reloaded=browser({cache:page.cache});const again=await ready(reloaded);assert.equal(again.getState().stats[qid].wrong,1);
  again.navigate('wrong');assert(reloaded.elements.app.innerHTML.includes(bank[qid].stem.slice(0,10)));
});
await test('Both subjects draw 100 unique questions, run 120 minutes, and score one point per correct answer',async()=>{
  for(const subject of [1,3]){
    const p=browser(),a=await ready(p);a.startExam(subject);const exam=a.getState().activeExam;
    assert.equal(new Set(exam.ids).size,100);assert(exam.ids.every(id=>bank[id].subject===subject));assert.equal(exam.deadline-exam.start,7200000);
    exam.ids.slice(0,60).forEach(id=>exam.answers[id]=bank[id].answer);const result=a.submitExam();
    assert.equal(result.score,60);assert.equal(result.passed,true);assert.equal(result.unanswered,40);
  }
});
await test('Timed exams survive reload and automatically submit when time expires',async()=>{
  const p=browser(),a=await ready(p);a.startExam(3);a.chooseExam(1);const deadline=a.getState().activeExam.deadline;
  const reload=browser({cache:p.cache}),b=await ready(reload);assert.equal(b.getState().activeExam.deadline,deadline);
  reload.clock.now=deadline+1;b.checkDeadline();assert.equal(b.getState().activeExam,null);assert.equal(b.getState().history.length,1);
});
await test('Record backups contain only learning data and restore without duplicate answers',async()=>{
  api.handle('backup',null,{});page.elements['export-record'].listeners.click();assert.equal(page.downloads.length,1);
  const body=await (await fetch(page.downloads[0].href)).json();assert.equal(body.format,'fund-study-backup');assert.equal(body.state.stats[qid].wrong,1);
  const validation=globalThis.createFundValidator(data);const merged=validation(globalThis.FundState.merge(body.state,body.state,Object.fromEntries(data.questions.map(q=>[q.id,q.answer]))));
  assert.equal(merged.stats[qid].wrong,1);assert(!JSON.stringify(body).includes('access_token'));
  URL.revokeObjectURL(page.downloads[0].href);
});
await test('Blocked browser storage is reported instead of claiming records are saved',async()=>{
  const p=browser({blocked:true}),a=await ready(p);a.handle('learned','a01',{});assert(p.elements.app.innerHTML.includes('本次记录暂未保存'));
});
await test('Public files use local assets and CSP excludes the previous account provider',async()=>{
  for(const file of ['index.html','login.html','account.html','study.js','independent-client.js','pages-client.js','config.js']){
    const text=fs.readFileSync(file,'utf8');assert(!/https?:\/\/[^\s"'<>]*(?:chatgpt|openai)\./i.test(text));
  }
  const html=fs.readFileSync('index.html','utf8');assert(html.includes("connect-src 'self'"));
  assert(!/<script[^>]+src="https?:/i.test(html));assert.equal(data.questions.length,322);assert.equal(data.lessons.length,48);
});
const rows=new Map();let savedBy=null;
const handler=createHandler((url,key,options)=>{
  if(key==='server-only')return{rpc:async(name,args)=>{
    assert.equal(name,'save_fund_progress');savedBy=args.p_user_id;const current=rows.get(savedBy);
    const conflict=(current?.revision||0)!==args.p_revision;
    if(!conflict)rows.set(savedBy,{revision:args.p_revision+1,state:args.p_state,updated_at:Date.now()});
    return{data:{conflict,row:rows.get(savedBy)},error:null};
  }};
  const authorization=options.global.headers.Authorization;
  const id=authorization==='Bearer user-a'?'a':authorization==='Bearer user-b'?'b':null;
  return{auth:{getUser:async()=>({data:{user:id?{id,email:id+'@example.test'}:null},error:id?null:Error('invalid')})},from:()=>({select:()=>({eq:(column,user)=>({maybeSingle:async()=>{assert.equal(user,id);return{data:rows.get(id)||null,error:null};}})})})};
},name=>({SUPABASE_URL:'https://independent.supabase.co',SUPABASE_ANON_KEY:'public-only',SUPABASE_SERVICE_ROLE_KEY:'server-only'})[name]);
const req=(token,method='GET',body,origin='https://mozhu621.github.io')=>handler(new Request('https://independent.supabase.co/functions/v1/fund-study',{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));
await test('Independent backend rejects anonymous, foreign-origin and forged-account access',async()=>{
  assert.equal((await req(null)).status,401);assert.equal((await req('invalid')).status,401);assert.equal((await req('user-a','GET',null,'https://evil.test')).status,403);
  assert.equal((await req('user-a','PUT',{userId:'b',revision:0,state:{}})).status,401);assert.equal(savedBy,null);
});
await test('Independent backend grades exams on the server and isolates account records',async()=>{
  const p=browser(),a=await ready(p);a.startExam(1);const exam=a.getState().activeExam;exam.ids.slice(0,60).forEach(id=>exam.answers[id]=bank[id].answer);a.submitExam();
  const state=a.getState();state.history[0].score=100;state.history[0].passed=false;
  assert.equal((await req('user-a','PUT',{userId:'a',revision:0,state})).status,200);assert.equal(savedBy,'a');
  const saved=await (await req('user-a')).json();assert.equal(saved.state.history[0].score,60);assert.equal(saved.state.history[0].passed,true);
  assert.equal((await (await req('user-b')).json()).state,null);
  assert.equal((await req('user-a','PUT',{userId:'a',revision:0,state})).status,409);
});
await test('Database deployment restricts direct writes to the verified backend',async()=>{
  const sql=fs.readFileSync('supabase/migrations/202609200001_fund_progress.sql','utf8');
  assert(sql.includes('enable row level security'));assert(sql.includes('grant select on public.fund_study_progress to authenticated'));
  assert(sql.includes('using ((select auth.uid()) = user_id)'));assert(sql.includes('from public, anon, authenticated'));
  assert(sql.includes('grant execute on function public.save_fund_progress(uuid, bigint, jsonb) to service_role'));
});
console.log(logs.join('\n'));console.log(logs.length+' independent website checks passed. Live Supabase verification awaits connection.');
