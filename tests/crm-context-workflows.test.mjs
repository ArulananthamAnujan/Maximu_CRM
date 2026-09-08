import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

const profileId='11111111-1111-4111-8111-111111111111';
const clientId='22222222-2222-4222-8222-222222222222';
const organisationId='33333333-3333-4333-8333-333333333333';
const branchId='44444444-4444-4444-8444-444444444444';
const uuid=n=>`55555555-5555-4555-8555-${String(n).padStart(12,'0')}`;

async function fixture(run,{failTable='',wrongClient=false,finance=false}={}) {
  const writes=[];
  const cases=Array.from({length:1203},(_,i)=>({id:uuid(i+1),client_id:clientId,branch_id:branchId,service_type:i<1201?'study_abroad':'direct_visa',lifecycle_stage:'enquiry',health:'healthy'}));
  const templates=[{id:uuid(2001),category:'Identity',title:'Passport',active:true},{id:uuid(2002),category:'Education',title:'Transcript',active:true}];
  const documents=[{id:uuid(3001),case_id:uuid(1),state:'requested',metadata:{source:'visa_checklist',checklist_key:uuid(2001)}}];
  const datasets={cases,education_applications:[{id:uuid(4001),case_id:uuid(1101),status:'submitted'}],visa_matters:[],tasks:[],documents:[],invoices:finance?[{id:uuid(6001),currency:'AUD',state:'unpaid',total:100,paid:20},{id:uuid(6002),currency:'USD',state:'unpaid',total:200,paid:0},{id:uuid(6003),currency:'AUD',state:'void',total:900,paid:0}]:[],credit_notes:finance?[{id:uuid(7001),invoice_id:uuid(6001),amount:30}]:[],profiles:[{id:profileId,organisation_id:organisationId,branch_id:branchId,level:'staff',active:true,display_name:'Test officer'}],branches:[{id:branchId,name:'Test branch'}],enquiries:[],communication_campaigns:[]};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture');
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=chunks.length?JSON.parse(Buffer.concat(chunks)):null;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(url.pathname==='/auth/v1/user')return send(200,{id:profileId,email:'officer@example.test'});
    const table=url.pathname.split('/').pop();
    if(table===failTable)return send(503,{message:'Synthetic unavailable dataset'});
    if(req.method!=='GET'){writes.push({table,method:req.method,body,url});return send(200,[]);}
    if(table==='document_checklist_templates')return send(200,templates);
    if(table==='documents'&&url.searchParams.has('case_id'))return send(200,documents);
    if(table==='cases'&&url.searchParams.has('id'))return send(200,[{...cases[0],client_id:wrongClient?uuid(9000):clientId}]);
    const rows=datasets[table]??[];
    const offset=Number(url.searchParams.get('offset')??0);
    // Simulate a server imposing a smaller cap than the caller requested.
    return send(200,rows.slice(offset,offset+Math.min(137,Number(url.searchParams.get('limit')??137))));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const worker=(await import('../dist/server/index.js')).default;
    const env={SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_PUBLISHABLE_KEY:'fixture',ASSETS:{fetch:async()=>new Response('',{status:404})}};
    const call=(path,body)=>worker.fetch(new Request(`https://crm.example${path}`,{method:body?'POST':'GET',headers:{cookie:'maximus_access=test-token',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){},passThroughOnException(){}});
    await run({call,writes});
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('reports count all permitted cases and applications beyond the first server page',async()=>fixture(async({call})=>{
  const response=await call('/api/crm/reports?stream=study_abroad');
  assert.equal(response.status,200);
  const {report}=await response.json();
  assert.equal(report.pipeline.total,1201);
  assert.equal(report.conversion.applicationsSubmitted,1);
  assert.equal(report.pipeline.byStream.direct_visa,undefined);
}));

test('an unavailable report dataset produces an error rather than plausible zero totals',async()=>fixture(async({call})=>{
  const response=await call('/api/crm/reports?stream=study_abroad');
  assert.equal(response.status,503);
  const body=await response.json();assert.equal(body.ok,false);assert.equal(body.report,undefined);
},{failTable:'education_applications'}));

test('adding a checklist template in a case preserves unselected existing requests',async()=>fixture(async({call,writes})=>{
  const response=await call('/api/crm/workspace',{action:'visaChecklist',caseId:uuid(1),append:true,[`visaDoc_${uuid(2001)}`]:'on',[`visaDoc_${uuid(2002)}`]:'on'});
  assert.equal(response.status,200);
  assert.ok(writes.some(w=>w.table==='documents'&&w.method==='POST'&&w.body.display_name==='Transcript'));
  assert.equal(writes.filter(w=>w.table==='documents'&&w.method==='PATCH').length,0, 'Existing requests must retain their notes and deadlines');
}));

test('a direct upload cannot attach a document to another client’s case',async()=>fixture(async({call,writes})=>{
  const response=await call('/api/crm/workspace',{action:'document',caseId:uuid(1),clientId,title:'Evidence.pdf',uploading:true});
  assert.equal(response.status,403);
  assert.equal(writes.filter(w=>w.table==='documents').length,0);
},{wrongClient:true}));

test('contextual follow-ups preserve the chosen timestamp',async()=>fixture(async({call,writes})=>{
  const due='2026-10-10T03:30:00.000Z';
  const response=await call('/api/crm/workspace',{action:'task',caseId:uuid(1),taskType:'follow_up',title:'Follow up with applicant',due});
  assert.equal(response.status,200);
  const task=writes.find(w=>w.table==='tasks');
  assert.equal(task.body.due_at,due);assert.equal(task.body.case_id,uuid(1));
}));


test('fees retain currencies and subtract credit notes from outstanding balances',async()=>fixture(async({call})=>{
  const response=await call('/api/crm/reports');
  assert.equal(response.status,200);
  const {report}=await response.json();
  assert.equal(report.finance.outstanding,null);
  assert.deepEqual(report.finance.byCurrency,[{currency:'AUD',invoiced:100,collected:20,outstanding:50},{currency:'USD',invoiced:200,collected:0,outstanding:200}]);
},{finance:true}));
