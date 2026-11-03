import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverClientNotices} from '../netlify/lib/client-notice-delivery.mjs';

const values={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test-service',RESEND_API_KEY:'test-provider',RESEND_FROM_EMAIL:'Maximus <sender@example.test>',PRODUCTION_URL:'https://crm.example.test'};
const row={id:'notice-2',lock_token:'claim-2',payload:{from:values.RESEND_FROM_EMAIL,to:['student@example.com'],subject:'We need a document from you',text:'Body'}};

test('an explicit origin from the request is used instead of the deployment variable',async()=>{
  const calls=[];
  await deliverClientNotices({env:k=>values[k],origin:'https://agency.example.org',fetchImpl:async(url,options)=>{calls.push({url,...options});if(url.endsWith('claim_client_notices'))return Response.json([row]);if(url.includes('api.resend.com'))return Response.json({id:'receipt'});return new Response('');}});
  const claim=JSON.parse(calls[0].body);
  assert.equal(claim.p_origin,'https://agency.example.org');
});

test('a local http origin is accepted for a verification run, any other http origin is not',async()=>{
  let claimed=false;
  const fetchImpl=async(url)=>{if(url.endsWith('claim_client_notices')){claimed=true;return Response.json([]);}return new Response('');};
  const local=await deliverClientNotices({env:k=>values[k],origin:'http://127.0.0.1:8100',fetchImpl});
  assert.equal(local.configured,true);
  assert.equal(claimed,true);
  claimed=false;
  const remote=await deliverClientNotices({env:k=>values[k],origin:'http://crm.example.test',fetchImpl});
  assert.equal(remote.configured,false);
  assert.equal(claimed,false);
});

test('the provider base can point at a stand-in so delivery is verifiable end to end',async()=>{
  const calls=[];
  await deliverClientNotices({env:k=>k==='RESEND_API_BASE'?'http://127.0.0.1:8092':values[k],fetchImpl:async(url,options)=>{calls.push({url,...options});if(url.endsWith('claim_client_notices'))return Response.json([row]);if(url.startsWith('http://127.0.0.1:8092/emails'))return Response.json({id:'stub-receipt'});return new Response('');}});
  const send=calls.find(c=>c.url.startsWith('http://127.0.0.1:8092/emails'));
  assert.ok(send,'the stand-in provider was called');
  const saved=JSON.parse(calls.at(-1).body);
  assert.equal(saved.p_status,'sent');
  assert.equal(saved.p_provider_id,'stub-receipt');
});
