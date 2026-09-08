import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const PROFILE = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const ORG = '33333333-3333-4333-8333-333333333333';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const id = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;

async function fixture(run, options = {}) {
  const requests = [];
  const client = { id: CLIENT, first_name: 'Test', last_name: 'Applicant', crm_id: 'TEST/001', email: 'applicant@example.test', mobile: '', branch_id: BRANCH, custom_fields: { legacy_data: { source_reference: 'keep-me' }, unrelated: 'retain' }, address: { city: 'Melbourne', country: 'AU', line1: 'Old street' } };
  const cases = Array.from({ length: 5119 }, (_, i) => ({ id: id(i + 1), client_id: CLIENT, branch_id: BRANCH, case_number: `TEST/${i + 1}`, service_type: i % 2 ? 'direct_visa' : 'study_abroad', lifecycle_stage: 'enquiry', opened_at: '2026-01-01T00:00:00Z', custom_fields: {}, target: 'Australia' }));
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    requests.push({ url, method: req.method, body });
    const send = (status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/auth/v1/user') return send(200, { id: PROFILE, email: 'staff@example.test' });
    const table = url.pathname.split('/').pop();
    if (table === 'profiles') return send(200, [{ id: PROFILE, organisation_id: ORG, branch_id: BRANCH, level: 'staff', active: true, display_name: 'Test officer' }]);
    if (table === 'invoice_ledger_action') {
      const message = options.invoiceState === 'void' ? 'This invoice is voided or refunded.'
        : body.p_currency && body.p_currency !== 'AUD' ? 'Transaction currency must match the invoice currency.'
        : body.p_amount > 100 ? 'Amount exceeds the outstanding balance after credit notes.' : null;
      return message ? send(400, { code: '22023', message }) : send(200, { ok: true, paymentId: id(31), paid: body.p_amount });
    }
    if (req.method !== 'GET') {
      if (table === 'clients') { if (options.denyClientWrite) return send(200, []); Object.assign(client, body); return send(200, [client]); }
      if (table === 'client_education_history' && req.method === 'PATCH') return send(200, [{ id: id(20), ...body }]);
      return send(200, []);
    }
    if (table === 'clients') return send(200, options.denyClient ? [] : [client]);
    if (table === 'cases') {
      // Reject the real schema defect that previously made all live search fail.
      if (/created_at/.test((url.searchParams.get('select') ?? '') + (url.searchParams.get('order') ?? ''))) return send(400, { message: 'cases.created_at does not exist' });
      if (options.failCases) return send(503, { message: 'Temporary database outage' });
      if (url.searchParams.get('id')?.startsWith('eq.')) return send(200, [{ ...cases[0], lifecycle_stage: 'application' }], { 'Content-Range': '0-0/1' });
      if (url.searchParams.get('select') === 'id' || url.searchParams.has('or')) return send(200, [cases[0]]);
      if (url.searchParams.get('id')?.startsWith('in.')) return send(200, [cases[0]], { 'Content-Range': '0-0/1' });
      if (url.searchParams.has('client_id')) return send(200, [cases[0]]);
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 50);
      return send(200, cases.slice(offset, offset + limit), { 'Content-Range': `${offset}-${offset + limit - 1}/5119` });
    }
    if (table === 'legacy_external_keys') return send(200, options.noteSources || []);
    if (table === 'legacy_activity_events') return send(200, options.legacyActivity || []);
    if (table === 'case_notes') return options.failNotes ? send(503, { message: 'Temporary notes outage' }) : send(200, options.notes || []);
    if (table === 'branches') return send(200, [{ id: BRANCH, name: 'Test office' }]);
    if (table === 'client_education_history') return send(200, options.denyHistory ? [] : [{ id: id(20), client_id: CLIENT, institution: 'Test institution', qualification: 'Degree', currently_studying: true, details: { legacy_data: { source: 'retained' } } }]);
    if (table === 'invoices') return send(200, [{ id: id(30), total: 100, paid: 0, currency: 'AUD', state: options.invoiceState ?? 'sent', client_id: CLIENT, case_id: id(1) }]);
    if (table === 'mailbox_connections') return send(200, [{ active: true, email: 'staff@example.test', token_reference: null }]);
    return send(200, []);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const worker = (await import(new URL(`../dist/server/index.js?agent=${Date.now()}-${Math.random()}`, import.meta.url))).default;
    const env = { SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'test-only', FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
    const call = (path, body) => worker.fetch(new Request(`https://crm.example${path}`, { method: body ? 'POST' : 'GET', headers: { cookie: 'maximus_access=test-token', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
    await run({ call, requests, client });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('live search uses real schema columns and supports split full names', async () => fixture(async ({ call, requests }) => {
  const response = await call('/api/crm/search?q=Test%20Applicant');
  assert.equal(response.status, 200);
  assert.ok((await response.json()).results.some(r => r.title === 'Test Applicant'));
  const query = requests.find(r => r.url.pathname === '/rest/v1/clients').url.searchParams.get('or');
  assert.match(query, /and\(or\(first_name\.ilike/);
  assert.match(query, /last_name\.ilike\."\*Applicant\*"/);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.match(response.headers.get('Server-Timing'), /search;dur=/);
}));

test('search punctuation cannot inject additional query parameters', async () => fixture(async ({ call, requests }) => {
  assert.equal((await call('/api/crm/search?q=' + encodeURIComponent('A&B, "Test"'))).status, 200);
  const query = requests.find(r => r.url.pathname === '/rest/v1/clients').url;
  assert.deepEqual([...query.searchParams.keys()].sort(), ['archived_at', 'limit', 'or', 'order', 'select']);
}));

test('search failure is an error, not a successful empty match list', async () => fixture(async ({ call }) => {
  const response = await call('/api/crm/search?q=Applicant');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
}, { failCases: true }));

test('5119 enquiries return only one visible page and an exact total', async () => fixture(async ({ call, requests }) => {
  const started = performance.now();
  const response = await call('/api/crm/enquiries?limit=50');
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.count, 5119);
  assert.equal(result.records.length, 50);
  assert.ok(result.records.some(r => r.serviceType === 'direct_visa'));
  const reads = requests.filter(r => r.url.pathname === '/rest/v1/cases');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].url.searchParams.get('limit'), '50');
  assert.match(response.headers.get('Server-Timing'), /enquiries;dur=/);
  console.log(`Fixture only: 5119-record directory, 50-row response, ${(performance.now() - started).toFixed(1)}ms. Not a production benchmark.`);
}));

test('a normal name search does not download the entire case directory', async () => fixture(async ({ call, requests }) => {
  const response = await call('/api/crm/enquiries?q=Test%20Applicant&limit=50');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
  const fullReads = requests.filter(r => r.url.pathname === '/rest/v1/cases' && r.url.searchParams.get('select') !== 'id');
  assert.equal(fullReads.length, 1);
  assert.match(fullReads[0].url.searchParams.get('id'), /^in\./);
  assert.equal(fullReads[0].url.searchParams.get('limit'), '50');
}));

test('enquiry name punctuation is encoded once and stays inside its filter', async () => fixture(async ({ call, requests }) => {
  assert.equal((await call('/api/crm/enquiries?q=' + encodeURIComponent('A&B, "Test"'))).status, 200);
  const query = requests.find(r => r.url.pathname === '/rest/v1/clients').url;
  assert.match(query.searchParams.get('or'), /A&B,/);
  assert.ok(!query.searchParams.get('or').includes('%26'));
  assert.deepEqual([...query.searchParams.keys()].sort(), ['archived_at', 'limit', 'offset', 'or', 'order', 'select']);
}));

test('deep-linked applications retain their stage rather than becoming enquiries', async () => fixture(async ({ call, requests }) => {
  const response = await call(`/api/crm/enquiries?caseId=${id(1)}&limit=1`);
  const result = await response.json();
  assert.equal(result.records[0].lifecycleStage, 'application');
  const read = requests.find(r => r.url.pathname === '/rest/v1/cases');
  assert.equal(read.url.searchParams.has('lifecycle_stage'), false);
}));

test('profile edits retain legacy values and encrypt new passport numbers', async () => fixture(async ({ call, client, requests }) => {
  const response = await call('/api/crm/intake', { action: 'personal', clientId: CLIENT, firstName: 'Updated', lastName: '', alternatePhone: '012345', address: { line1: 'Updated street' }, passportNumber: 'TEST-PASSPORT-001' });
  assert.equal(response.status, 200, await response.text());
  assert.equal(client.last_name, '');
  assert.equal(client.custom_fields.legacy_data.source_reference, 'keep-me');
  assert.equal(client.address.country, 'AU');
  assert.match(client.passport_number_encrypted, /^v1\./);
  const writes = requests.filter(r => r.method !== 'GET');
  assert.ok(writes.some(r => r.url.pathname === '/rest/v1/audit_events'));
  assert.ok(!JSON.stringify(writes.map(r => r.body)).includes('TEST-PASSPORT-001'));
}));

test('profile editor refuses clients outside the caller’s visible scope', async () => fixture(async ({ call, requests }) => {
  assert.equal((await call('/api/crm/intake', { action: 'personal', clientId: CLIENT, firstName: 'Changed' })).status, 403);
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 0);
}, { denyClient: true }));

test('impossible dates are rejected before updating a profile', async () => fixture(async ({ call, requests }) => {
  assert.equal((await call('/api/crm/intake', { action: 'personal', clientId: CLIENT, dateOfBirth: '2026-02-31' })).status, 400);
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 0);
}));

test('a read-only client cannot produce a false successful save', async () => fixture(async ({ call, requests }) => {
  assert.equal((await call('/api/crm/intake', { action: 'personal', clientId: CLIENT, firstName: 'Changed' })).status, 403);
  assert.equal(requests.filter(r => r.url.pathname === '/rest/v1/audit_events').length, 0);
}, { denyClientWrite: true }));

test('history corrections update the same row without removing imported details', async () => fixture(async ({ call, requests }) => {
  const response = await call('/api/crm/intake', { action: 'education', clientId: CLIENT, rowId: id(20), institution: 'Corrected institution', qualification: 'Degree', result: 'Distinction' });
  assert.equal(response.status, 200, await response.text());
  const writes = requests.filter(r => r.url.pathname === '/rest/v1/client_education_history' && r.method !== 'GET');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PATCH');
  assert.equal(writes[0].url.searchParams.get('client_id'), `eq.${CLIENT}`);
  assert.equal(writes[0].body.institution, 'Corrected institution');
  assert.equal(Object.hasOwn(writes[0].body, 'details'), false);
  assert.equal(Object.hasOwn(writes[0].body, 'currently_studying'), false);
}));

test('history corrections cannot target another client’s row', async () => fixture(async ({ call, requests }) => {
  const response = await call('/api/crm/intake', { action: 'education', clientId: CLIENT, rowId: id(20), institution: 'Test', qualification: 'Degree' });
  assert.equal(response.status, 403);
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 0);
}, { denyHistory: true }));

test('finance rejects overpayments before creating payment or receipt records', async () => fixture(async ({ call, requests }) => {
  assert.equal((await call('/api/crm/operations', { action: 'record_payment', invoiceId: id(30), amount: 101 })).status, 400);
  assert.equal(requests.filter(r => r.method !== 'GET' && !r.url.pathname.includes('/rpc/')).length, 0);
}));

test('finance rejects a mismatched currency rather than silently mixing totals', async () => fixture(async ({ call, requests }) => {
  assert.equal((await call('/api/crm/operations', { action: 'record_payment', invoiceId: id(30), amount: 10, currency: 'USD' })).status, 400);
  assert.equal(requests.filter(r => r.method !== 'GET' && !r.url.pathname.includes('/rpc/')).length, 0);
}));

test('voided invoices cannot receive new payments', async () => fixture(async ({ call, requests }) => {
  assert.equal((await call('/api/crm/operations', { action: 'record_payment', invoiceId: id(30), amount: 10 })).status, 400);
  assert.equal(requests.filter(r => r.method !== 'GET' && !r.url.pathname.includes('/rpc/')).length, 0);
}, { invoiceState: 'void' }));

test('Gmail does not claim connected when its saved authorization is missing', async () => fixture(async ({ call }) => {
  const response = await call('/api/crm/mailbox');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).connected, false);
}));

test('agent presentation keeps readable text and does not reintroduce sidebar offsets', async () => {
  const css = await readFile(new URL('../app/agent-workspace.css', import.meta.url), 'utf8');
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(css, /--agent-body: 1rem/);
  assert.match(css, /\.caseSectionHead h2 \{ display: block/);
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(css, /\.mainArea\s*\{/);
  assert.match(page, /globalSearchError/);
  assert.match(page, /Retry loading case/);
  assert.match(page, /<ClientProfileEditor/);
});


test('history detail corrections preserve unrelated imported values', async () => fixture(async ({ call, requests }) => {
  const response = await call('/api/crm/intake', { action: 'education', clientId: CLIENT, rowId: id(20), institution: 'Test', qualification: 'Degree', details: { yearOfPassing: 2020, backlogs: 0 } });
  assert.equal(response.status, 200);
  const patch = requests.find(r => r.method === 'PATCH' && r.url.pathname.endsWith('client_education_history'));
  assert.deepEqual(patch.body.details, { legacy_data: { source: 'retained' }, yearOfPassing: 2020, backlogs: 0 });
}));

test('payment request IDs reach the atomic operation unchanged', async () => fixture(async ({ call, requests }) => {
  const response = await call('/api/crm/operations', { action: 'record_payment', invoiceId: id(30), requestId: id(40), amount: 25, currency: 'AUD' });
  assert.equal(response.status, 200);
  const rpc = requests.find(r => r.url.pathname.endsWith('invoice_ledger_action'));
  assert.equal(rpc.body.p_request, id(40));
  assert.equal(rpc.body.p_invoice, id(30));
  assert.equal(rpc.body.p_action, 'payment');
  assert.equal(requests.filter(r => r.method !== 'GET' && !r.url.pathname.includes('/rpc/')).length, 0);
}));


test('enquiry summaries retain saved note text and distinguish an unavailable history', async () => {
  await fixture(async ({ call }) => {
    const response = await call('/api/crm/enquiries?limit=50');
    const result = await response.json();
    assert.equal(result.records[0].latestNote, 'Existing note must remain visible');
    assert.equal(result.records[0].notesUnavailable, false);
  }, { notes: [{ case_id: id(1), author_id: PROFILE, body: 'Existing note must remain visible', created_at: '2024-10-17T05:23:00Z' }] });
  await fixture(async ({ call }) => {
    const result = await (await call('/api/crm/enquiries?limit=50')).json();
    assert.equal(result.records[0].notesUnavailable, true);
  }, { failNotes: true });
});


test('recovered notes retain their source author and date and appear once in the case history', async () => fixture(async ({ call }) => {
  const directory = await (await call('/api/crm/enquiries')).json();
  assert.equal(directory.records[0].latestNoteAuthor, 'Original counsellor');
  assert.equal(directory.records[0].latestNoteDateLabel, '23/09/2024 02:05 pm');
  const response = await call('/api/crm/casefile?caseId=' + id(1));
  assert.equal(response.status, 200);
  const result = await response.json();
  const entries = result.timeline.filter(entry => entry.detail === 'Original conversation');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].actorName, 'Original counsellor');
  assert.equal(entries[0].dateLabel, '23/09/2024 02:05 pm');
}, {
  notes: [{ id: id(40), case_id: id(1), author_id: PROFILE, body: 'Original conversation', created_at: '2024-09-23T04:05:00Z' }],
  noteSources: [{ target_id: id(40), source_key: 'legacy:note:1', metadata: { legacy_data: { author: 'Original counsellor', source_created_at: '23/09/2024 02:05 pm' } } }],
  legacyActivity: [{ id: id(41), source_entity_type: 'notes', source_key: 'legacy:note:1', event_type: 'note', body: 'Original conversation', occurred_at: '2024-09-23T04:05:00Z' }],
}));
