import './state-sync.js';
import './validate.js';
import content from './content.json' with {type:'json'};
const validate=globalThis.createFundValidator(content);
const ORIGIN='https://mozhu621.github.io';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Vary':'Origin'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const envelope=(row,user)=>({userId:user.id,account:{kind:'supabase',username:user.email},revision:row?.revision||0,state:row?.state||null,updatedAt:row?.updated_at||null});
async function readBody(request){
  const reader=request.body?.getReader();if(!reader)throw Error('empty_body');
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();throw Error('payload_too_large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));
}
export function createHandler(createClient,env){return async request=>{
  if(request.headers.get('Origin')!==ORIGIN)return json({error:'invalid_origin'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','PUT'].includes(request.method))return json({error:'method_not_allowed'},405);
  const authorization=request.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))return json({error:'sign_in_required'},401);
  try{
    const options={auth:{persistSession:false,autoRefreshToken:false}};
    const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{...options,global:{headers:{Authorization:authorization}}});
    const {data,error}=await userClient.auth.getUser(authorization.slice(7));
    if(error||!data.user)return json({error:'sign_in_required'},401);
    const user=data.user;
    if(request.method==='GET'){
      const result=await userClient.from('fund_study_progress').select('revision,state,updated_at').eq('user_id',user.id).maybeSingle();
      if(result.error)throw Error('read_failed');return json(envelope(result.data,user));
    }
    if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'json_required'},415);
    let body,state;
    try{body=await readBody(request);if(body.userId!==user.id)return json({error:'account_changed'},401);if(!Number.isInteger(body.revision)||body.revision<0)throw Error('invalid_revision');state=validate(body.state);}
    catch(error){return json({error:error.message==='payload_too_large'?'payload_too_large':'invalid_progress'},error.message==='payload_too_large'?413:400);}
    const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),options);
    const result=await admin.rpc('save_fund_progress',{p_user_id:user.id,p_revision:body.revision,p_state:state});
    if(result.error)throw Error('write_failed');
    return json(envelope(result.data.row,user),result.data.conflict?409:200);
  }catch{return json({error:'storage_unavailable'},503);}
};}
