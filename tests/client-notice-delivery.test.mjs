import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverClientNotices} from '../netlify/lib/client-notice-delivery.mjs';
const values={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test-service',RESEND_API_KEY:'test-provider',RESEND_FROM_EMAIL:'Maximus <sender@example.test>',PRODUCTION_URL:'https://crm.example.test'};
const row={id:'notice-1',lock_token:'claim-1',payload:{from:values.RESEND_FROM_EMAIL,to:['student@example.test'],subject:'Please review',text:'Secure portal link'}};
for(const [http,status] of [[200,'sent'],[403,'failed'],[401,'failed'],[429,'queued'],[503,'queued']]){
 test(`client notice HTTP ${http} is persisted as ${status}`,async()=>{
 const calls=[];const result=await deliverClientNotices({env:k=>values[k],fetchImpl:async(url,options)=>{calls.push({url,...options});if(url.endsWith('claim_client_notices'))return Response.json([row]);if(url.includes('api.resend.com'))return Response.json(http===200?{id:'provider-receipt'}:{message:'sensitive provider details'}, {status:http});return new Response('');}});
 const send=calls.find(c=>c.url.includes('api.resend.com'));assert.equal(send.headers['Idempotency-Key'],'client-notice/notice-1');assert.deepEqual(JSON.parse(send.body),row.payload);
 const saved=JSON.parse(calls.at(-1).body);assert.equal(saved.p_status,status);assert.equal(saved.p_token,'claim-1');assert.equal(result.sent,http===200?1:0);assert.ok(!JSON.stringify(saved).includes('sensitive provider details'));
 });
}
test('missing sender leaves notices queued without claiming',async()=>{let called=false;const r=await deliverClientNotices({env:k=>k==='RESEND_FROM_EMAIL'?'':values[k],fetchImpl:async()=>{called=true;}});assert.equal(r.configured,false);assert.equal(called,false);});
test('uncertain delivery retries the same notice without claiming success',async()=>{let saved;await deliverClientNotices({env:k=>values[k],fetchImpl:async(url,options)=>{if(url.endsWith('claim_client_notices'))return Response.json([row]);if(url.includes('resend'))throw new Error('timeout');saved=JSON.parse(options.body);return new Response('');}});assert.equal(saved.p_status,'queued');assert.equal(saved.p_provider_id,null);});
