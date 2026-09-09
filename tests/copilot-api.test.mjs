import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
const USER='11111111-1111-4111-8111-111111111111';
const CASE='22222222-2222-4222-8222-222222222222';
const CLIENT='33333333-3333-4333-8333-333333333333';
const EMAIL='staff@maximus.test';
const SCOPES='https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email';
async function fixture(run, options={}) {
 const calls=[];
 const server=http.createServer(async(req,res)=>{
  let raw=''; for await (const chunk of req) raw+=chunk;
  const url=new URL(req.url,'http://stub');
  const body=raw && req.headers['content-type']?.includes('json')?JSON.parse(raw):raw;
  calls.push({path:url.pathname,query:url.search,method:req.method,body,authorization:req.headers.authorization});
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/auth/v1/user') return send(200,{id:USER,email:EMAIL});
  if(url.pathname==='/auth/v1/token') return send(200,{access_token:'session',refresh_token:'refresh',expires_in:3600,user:{id:USER,email:EMAIL}});
  if(url.pathname==='/rest/v1/profiles') return send(200,[{id:USER,email:EMAIL,active:true,display_name:'Staff',organisation_id:CLIENT,branch_id:CLIENT,level:options.client?'student':'staff'}]);
  if(url.pathname==='/rest/v1/cases') return send(200,options.hidden?[]:[{id:CASE,client_id:CLIENT,case_number:'CASE-1',lifecycle_stage:'application',next_action:'Request transcript'}]);
  if(url.pathname==='/rest/v1/clients') return send(200,[{id:CLIENT,first_name:'Test',last_name:'Client',email:'client@maximus.test'}]);
  if(url.pathname==='/rest/v1/case_notes') return send(200,[{id:'note',body:'Transcript is outstanding.',visibility:'case_team'}]);
  if(url.pathname==='/rest/v1/documents') return send(options.failDocuments?503:200,options.failDocuments?{message:'unavailable'}:[{id:'doc',display_name:'Transcript',state:'requested'}]);
  if(url.pathname==='/rest/v1/mailbox_connections') return send(200,req.method==='GET' && options.connected?['gmail','google_calendar'].map(provider=>({provider,email:EMAIL,active:true,token_reference:'encrypted'})):[]);
  if(url.pathname==='/v1/messages') return send(options.providerStatus||200,{stop_reason:'end_turn',content:[{type:'text',text:options.malformed?'bad JSON':JSON.stringify({text:'Please provide your transcript.',subject:'Outstanding transcript',sourceIds:['note-1','document-1','invented-source'],warnings:[]})}]});
  if(url.pathname==='/token') return send(200,{access_token:'google-access',refresh_token:'google-refresh',scope:options.scope??SCOPES});
  if(url.pathname==='/oauth2/v2/userinfo') return send(200,{email:options.googleEmail||EMAIL});
  return send(200,[]);
 });
 await new Promise(resolve=>server.listen(0,resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const oldApi=process.env.GOOGLE_API_BASE,oldToken=process.env.GOOGLE_TOKEN_BASE;
 process.env.GOOGLE_API_BASE=origin;process.env.GOOGLE_TOKEN_BASE=origin;
 try {
  const worker=(await import('../dist/server/index.js')).default;
  const env={SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'test-public',ANTHROPIC_API_KEY:'test-ai',ANTHROPIC_API_BASE:origin,GOOGLE_OAUTH_CLIENT_ID:'test-google',GOOGLE_OAUTH_CLIENT_SECRET:'test-secret',FIELD_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),ASSETS:{fetch:async()=>new Response('',{status:404})}};
  const call=(path,body,cookie='maximus_access=session')=>worker.fetch(new Request(`https://crm.test${path}`,{method:body?'POST':'GET',headers:{cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){},passThroughOnException(){}});
  await run({call,calls});
 } finally { if(oldApi===undefined)delete process.env.GOOGLE_API_BASE;else process.env.GOOGLE_API_BASE=oldApi;if(oldToken===undefined)delete process.env.GOOGLE_TOKEN_BASE;else process.env.GOOGLE_TOKEN_BASE=oldToken;server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
}
test('Copilot uses the caller token, allowed records and verified citation IDs',async()=>fixture(async({call,calls})=>{
 const response=await call('/api/crm/copilot',{caseId:CASE,instruction:'Write an email',mode:'email'});assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.subject,'Outstanding transcript');assert.deepEqual(body.sources.map(s=>s.id),['note-1','document-1']);
 const ai=calls.find(c=>c.path==='/v1/messages');assert.match(ai.body.messages[0].content,/Transcript is outstanding/);
 assert.ok(calls.filter(c=>c.path.startsWith('/rest/')).every(c=>c.authorization==='Bearer session'));
 assert.deepEqual(calls.filter(c=>c.method==='POST' && c.path.startsWith('/rest/')).map(c=>c.path),['/rest/v1/ai_interactions']);
}));
test('clients and inaccessible cases never reach the model or history',async()=>{
 for(const option of [{client:true},{hidden:true}]) await fixture(async({call,calls})=>{
  assert.equal((await call('/api/crm/copilot',{caseId:CASE,instruction:'Summarise'})).status,403);
  assert.equal((await call(`/api/crm/ai?caseId=${CASE}`)).status,403);
  assert.equal(calls.filter(c=>c.path==='/v1/messages'||c.path==='/rest/v1/ai_interactions').length,0);
 },option);
});
test('unavailable context is reported and general writing reads no client data',async()=>{
 await fixture(async({call})=>{const body=await(await call('/api/crm/copilot',{caseId:CASE,instruction:'What is missing?'})).json();assert.ok(body.warnings.some(w=>w.includes('Documents could not be loaded')));},{failDocuments:true});
 await fixture(async({call,calls})=>{assert.equal((await call('/api/crm/copilot',{instruction:'Improve this',draft:'Hello'})).status,200);assert.equal(calls.filter(c=>['/rest/v1/cases','/rest/v1/clients','/rest/v1/ai_interactions'].includes(c.path)).length,0);});
});
test('invalid input, provider failure and malformed output are explicit failures',async()=>{
 await fixture(async({call,calls})=>{assert.equal((await call('/api/crm/copilot',{caseId:'bad',instruction:'hello'})).status,400);assert.equal((await call('/api/crm/copilot',{instruction:'x'.repeat(4001)})).status,400);assert.equal(calls.filter(c=>c.path==='/v1/messages').length,0);});
 for(const [options,status] of [[{providerStatus:429},429],[{malformed:true},502]])await fixture(async({call})=>{assert.equal((await call('/api/crm/copilot',{instruction:'hello'})).status,status);},options);
});
test('staff login offers unified setup, clients do not, and existing connections skip consent',async()=>{
 for(const client of [false,true])await fixture(async({call})=>{const body=await(await call('/api/auth/login',{email:EMAIL,password:'password'})).json();assert.equal(body.next,client?'/':'/api/auth/gmail/start?workspace=1&auto=1');},{client});
 await fixture(async({call,calls})=>{const response=await call('/api/auth/gmail/start?workspace=1&auto=1');assert.equal(response.headers.get('location'),'https://crm.test/');assert.equal(calls.filter(c=>c.path==='/token').length,0);},{connected:true});
});
async function connect(call) {
 const start=await call('/api/auth/gmail/start?workspace=1');const url=new URL(start.headers.get('location'));
 assert.equal(url.searchParams.get('login_hint'),EMAIL);assert.match(url.searchParams.get('scope'),/calendar.events/);assert.equal(url.searchParams.get('access_type'),'offline');
 const cookies=['maximus_access=session',...start.headers.getSetCookie().map(c=>c.split(';')[0])].join('; ');
 return call(`/api/auth/gmail/callback?code=test-code&state=${encodeURIComponent(url.searchParams.get('state'))}`,null,cookies);
}
test('one Google consent saves encrypted personal Gmail and Calendar connections',async()=>fixture(async({call,calls})=>{
 const response=await connect(call);assert.equal(new URL(response.headers.get('location')).searchParams.get('gmail'),'connected');
 const writes=calls.filter(c=>c.path==='/rest/v1/mailbox_connections'&&c.method==='POST');assert.deepEqual(writes.map(c=>c.body.provider),['gmail','google_calendar']);
 for(const write of writes){assert.equal(write.body.profile_id,USER);assert.equal(write.body.email,EMAIL);assert.notEqual(write.body.token_reference,'google-refresh');assert.equal(write.authorization,'Bearer session');}
}));
test('account mismatch, forged state and partial consent cannot silently connect everything',async()=>{
 await fixture(async({call,calls})=>{const response=await connect(call);assert.match(new URL(response.headers.get('location')).searchParams.get('workspace_error'),/matching your CRM/);assert.equal(calls.filter(c=>c.path==='/rest/v1/mailbox_connections'&&c.method==='POST').length,0);},{googleEmail:'other@maximus.test'});
 await fixture(async({call,calls})=>{const response=await call('/api/auth/gmail/callback?code=test&state=forged');assert.match(new URL(response.headers.get('location')).searchParams.get('workspace_error'),/expired/);assert.equal(calls.filter(c=>c.path==='/token').length,0);});
 await fixture(async({call,calls})=>{const response=await connect(call);assert.match(new URL(response.headers.get('location')).searchParams.get('workspace_error'),/remaining Google permissions/);assert.deepEqual(calls.filter(c=>c.path==='/rest/v1/mailbox_connections'&&c.method==='POST').map(c=>c.body.provider),['google_calendar']);},{scope:'https://www.googleapis.com/auth/calendar.events'});
});
