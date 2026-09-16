import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
const id='11111111-1111-4111-8111-111111111111';
async function fixture(run){
 let profile={id,organisation_id:id,branch_id:id,display_name:'Limited staff',email:'limited@example.test',level:'staff',active:true,function_access:{work:false,finance:false,communications:false}};
 const effects=[];
 const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const path=new URL(req.url,'http://stub').pathname;let data=[];
 if(path==='/auth/v1/user')data={id};else if(path==='/rest/v1/profiles'&&req.method==='GET')data=[profile];else if(req.method!=='GET')effects.push({path,body:raw?JSON.parse(raw):null});
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const worker=(await import('../dist/server/index.js')).default;const env={SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_PUBLISHABLE_KEY:'test',ASSETS:{fetch:async()=>new Response('',{status:404})}};
 const call=(path,body)=>worker.fetch(new Request(`https://crm.example${path}`,{method:body?'POST':'GET',headers:{cookie:'maximus_access=same-session','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){},passThroughOnException(){}});
 await run({call,effects,setProfile:next=>{profile={...profile,...next};}});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test('disabled task, finance and messages functions reject direct API calls without side effects',()=>fixture(async({call,effects})=>{
 for(const [path,body] of [['/api/crm/tasks',null],['/api/crm/tasks',{action:'create',id,values:{title:'No'}}],['/api/crm/workspace',{action:'task',title:'No'}],['/api/crm/workspace',{action:'bulk_mutate',resource:'task',ids:[id]}],['/api/crm/workspace',{action:'invoice'}],['/api/crm/workspace',{action:'record_payment'}],['/api/crm/mailbox',null]])assert.equal((await call(path,body)).status,403,path);
 assert.equal(effects.length,0);
}));
test('permission changes take effect on the existing session cookie',()=>fixture(async({call,setProfile})=>{
 setProfile({function_access:{work:true}});assert.equal((await call('/api/crm/tasks')).status,200);
 setProfile({function_access:{work:false}});assert.equal((await call('/api/crm/tasks')).status,403);
}));
test('branch administrators cannot modify per-person access',()=>fixture(async({call,setProfile,effects})=>{
 setProfile({level:'branch_admin'});assert.equal((await call('/api/crm/admin',{action:'set_function_access',profileId:id,access:{finance:true}})).status,403);assert.equal(effects.length,0);
}));
test('Super Admin can set per-person access',()=>fixture(async({call,setProfile,effects})=>{
 setProfile({level:'super_admin'});assert.equal((await call('/api/crm/admin',{action:'set_function_access',profileId:id,access:{finance:false}})).status,200);assert.equal(effects[0].path,'/rest/v1/rpc/set_function_access');
}));
test('unknown workspace actions fail closed',()=>fixture(async({call,effects})=>{
 assert.equal((await call('/api/crm/workspace',{action:'unmapped_action'})).status,403);assert.equal(effects.length,0);
}));

 test('personal Google connections use messages or calendar access, not integration administration',()=>fixture(async({call,setProfile})=>{
 setProfile({function_access:{communications:false,calendar:true}});assert.equal((await call('/api/crm/workspace-connection')).status,200);
 setProfile({function_access:{communications:false,calendar:false}});assert.equal((await call('/api/crm/workspace-connection')).status,403);
 }));

test('special permissions block direct action requests before external side effects',()=>fixture(async({call,setProfile,effects})=>{
 setProfile({function_access:{special_access:false}});
 for(const [path,body] of [
 ['/api/crm/tasks',{action:'delete',id}],['/api/crm/tasks',{action:'bulk',operation:'delete',items:[{id}]}],
 ['/api/crm/workspace',{action:'mutate',resource:'case',operation:'archive',id}],
 ['/api/crm/workspace',{action:'bulk_assign',ids:[id],ownerId:id}],
 ['/api/crm/workspace',{action:'message',channel:'email'}],['/api/crm/workspace',{action:'message',channel:'sms'}],
 ['/api/crm/mailbox',{action:'send_message',messageId:id}],['/api/crm/whatsapp',{action:'send_message',messageId:id}],
 ['/api/crm/operations',{action:'record_export'}],['/api/crm/campaigns',{action:'create',channel:'whatsapp'}],
 ])assert.equal((await call(path,body)).status,403,path+JSON.stringify(body));
 assert.equal(effects.length,0);
}));
test('workspace-specific module switches retain their independent values',()=>fixture(async({call,setProfile})=>{
 setProfile({function_access:{study_access:true,direct_visa_access:false,'study.work':false,'direct_visa.work':true}});
 assert.equal((await call('/api/crm/tasks')).status,403);
 setProfile({function_access:{study_access:false,direct_visa_access:true,'study.work':false,'direct_visa.work':true}});
 assert.equal((await call('/api/crm/tasks')).status,200);
}));
