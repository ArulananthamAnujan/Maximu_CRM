import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/production-operations-preflight.mjs';
import {runtimeEnv} from '../netlify/lib/runtime-env.mjs';
import {operationsSecret} from '../netlify/lib/operations-auth.mjs';
test('worker preflight supports Node environment and rejects wrong credentials',async t=>{
 const prior={key:process.env.SUPABASE_SERVICE_ROLE_KEY,url:process.env.SUPABASE_URL,secret:process.env.OPERATIONS_JOB_SECRET,netlify:globalThis.Netlify};
 t.after(()=>{for(const [name,value] of [['SUPABASE_SERVICE_ROLE_KEY',prior.key],['SUPABASE_URL',prior.url],['OPERATIONS_JOB_SECRET',prior.secret]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}globalThis.Netlify=prior.netlify;});
 delete globalThis.Netlify;delete process.env.OPERATIONS_JOB_SECRET;
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';process.env.SUPABASE_URL='https://db.test';
 const request=secret=>new Request('https://crm.test/preflight',{headers:{'x-operations-secret':secret}});
 assert.equal((await handler(request('wrong'))).status,401);
 assert.equal((await handler(request(operationsSecret(runtimeEnv)))).status,200);
 delete process.env.SUPABASE_URL;
 assert.equal((await handler(request(operationsSecret(runtimeEnv)))).status,503);
});
