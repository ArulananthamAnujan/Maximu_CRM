import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {restoreDrill, TABLES} from '../netlify/functions/production-operations-background.mjs';
import {operationsSecret} from '../netlify/lib/operations-auth.mjs';

test('operations auth is deterministic without exposing the service credential', () => {
  const env = k => k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'private-test-key' : '';
  assert.match(operationsSecret(env), /^[a-f0-9]{64}$/);
  assert.equal(operationsSecret(env), operationsSecret(env));
  assert.equal(operationsSecret(() => ''), '');
});
for (const scenario of ['valid', 'corrupt', 'unavailable']) test(`backup verification reads the stored archive: ${scenario}`, async t => {
  const previousFetch = globalThis.fetch, previousNetlify = globalThis.Netlify;
  t.after(() => { globalThis.fetch = previousFetch; globalThis.Netlify = previousNetlify; });
  globalThis.Netlify = {env: {get: k => ({SUPABASE_URL:'https://db.test', SUPABASE_SERVICE_ROLE_KEY:'test-key'})[k] || ''}};
  const tables = Object.fromEntries(TABLES.map(table => [table, []]));
  const payload = JSON.stringify({format:'maximus-crm-backup-v1',organisationId:'org',tables});
  const backup = {runId:'run', path:'org/archive.json', payload, checksum:createHash('sha256').update(payload).digest('hex'), counts:Object.fromEntries(TABLES.map(table => [table,0]))};
  const statuses = []; let downloads = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (url.includes('/storage/')) {
      downloads++;
      return new Response(scenario === 'corrupt' ? '{}' : payload, {status:scenario === 'unavailable' ? 404 : 200});
    }
    if (init.method === 'POST') return Response.json([{id:'drill'}]);
    statuses.push(JSON.parse(init.body).status);
    return new Response(null,{status:204});
  };
  if (scenario === 'valid') assert.equal((await restoreDrill({id:'org'},backup)).storedObjectReadback,true);
  else await assert.rejects(restoreDrill({id:'org'},backup));
  assert.equal(downloads,1);
  assert.deepEqual(statuses,[scenario === 'valid' ? 'passed' : 'failed']);
});
