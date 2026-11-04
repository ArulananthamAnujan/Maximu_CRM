import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash,generateKeyPairSync} from 'node:crypto';
const pem=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
const uid='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';
for(const scenario of ['valid','corrupt','unavailable','staff','complete']) test(`legacy readback ${scenario}`,async()=>{
 const writes=[]; const source=Buffer.from('original PDF bytes'); const hash=createHash('sha256').update(source).digest('hex');
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const path=new URL(req.url,'http://stub').pathname;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(path==='/auth/v1/user')return send(200,{id:uid,email:'owner@example.test'});
  if(path==='/rest/v1/profiles')return send(200,[{id:uid,email:'owner@example.test',organisation_id:org,level:scenario==='staff'?'staff':'super_admin',active:true}]);
  if(path==='/rest/v1/legacy_file_manifests'){
   if(req.method==='PATCH'){writes.push(JSON.parse(body));return send(200,[]);}
   return send(200,scenario==='complete'?[]:[{id:uid,document_id:uid,expected_checksum:hash}]);
  }
  if(path==='/rest/v1/documents')return send(200,[{drive_file_id:'stored-file',checksum:hash}]);
  if(path==='/token')return send(200,{access_token:'test-token',expires_in:3600});
  if(path==='/drive/v3/files/stored-file'){res.writeHead(scenario==='unavailable'?404:200);return res.end(scenario==='corrupt'?'wrong bytes':source);}
  return send(200,[]);
 });
 await new Promise(resolve=>server.listen(0,resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const oldApi=process.env.GOOGLE_API_BASE,oldToken=process.env.GOOGLE_TOKEN_BASE;
 process.env.GOOGLE_API_BASE=origin;process.env.GOOGLE_TOKEN_BASE=origin;
 try{
  const worker=(await import(`../dist/server/index.js?readback=${scenario}`)).default;
  const response=await worker.fetch(new Request('https://crm.test/api/crm/import/verify-files',{method:'POST',headers:{cookie:'maximus_access=test'}}),{SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'test',GOOGLE_SERVICE_ACCOUNT_EMAIL:'service@test',GOOGLE_PRIVATE_KEY:pem,GOOGLE_SHARED_DRIVE_ID:'drive',ASSETS:{fetch:async()=>new Response('',{status:404})}},{waitUntil(){},passThroughOnException(){}});
  assert.equal(response.status,{valid:200,corrupt:409,unavailable:503,staff:403,complete:200}[scenario]);
  assert.equal(writes.length,scenario==='valid'?1:0);
  if(scenario==='valid'){assert.equal(writes[0].copied_checksum,hash);assert.equal(writes[0].status,'verified');}
 }finally{if(oldApi===undefined)delete process.env.GOOGLE_API_BASE;else process.env.GOOGLE_API_BASE=oldApi;if(oldToken===undefined)delete process.env.GOOGLE_TOKEN_BASE;else process.env.GOOGLE_TOKEN_BASE=oldToken;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
