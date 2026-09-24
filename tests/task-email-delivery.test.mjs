import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverTaskEmails } from '../netlify/lib/task-email-delivery.mjs';
import { config } from '../netlify/functions/task-email-notifications.mjs';

const values = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'server-key', RESEND_API_KEY: 'email-key', RESEND_FROM_EMAIL: 'CRM <tasks@crm.test>', URL: 'https://crm.test' };
const row = { id: 'queue-id', lock_token: 'claim-token', payload: { from: values.RESEND_FROM_EMAIL, to: ['staff@crm.test'], subject: 'Task assigned', text: 'Open CRM' } };
function fixture({ providerStatus = 200, networkError = false, failFinish = false, rows = [row] } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    if (url.endsWith('/claim_task_emails')) return Response.json(rows);
    if (url.endsWith('/finish_task_email')) return new Response(null, { status: failFinish ? 503 : 204 });
    if (url.includes('/task_email_worker_status?')) return new Response(null, { status: 201 });
    assert.equal(url, 'https://api.resend.com/emails');
    if (networkError) throw new Error('timeout');
    return Response.json(providerStatus === 200 ? { id: 'provider-id' } : {}, { status: providerStatus });
  };
  return { calls, fetchImpl, env: (name) => values[name] };
}
test('task email schedule runs every minute', () => assert.equal(config.schedule, '* * * * *'));
test('sends persisted payload and records provider acceptance using the claim token', async () => {
  const f = fixture();
  assert.deepEqual(await deliverTaskEmails(f), { claimed: 1, sent: 1 });
  const email = f.calls.find(c => c.url.includes('resend.com'));
  assert.deepEqual(email.body, row.payload);
  assert.equal(email.headers['Idempotency-Key'], 'task-email/queue-id');
  assert.deepEqual(f.calls.find(c => c.url.endsWith('/finish_task_email')).body,
    { p_id: row.id, p_token: row.lock_token, p_status: 'sent', p_provider_id: 'provider-id', p_error: null });
});
for (const status of [429, 409, 500]) test(`provider ${status} queues a retry`, async () => {
  const f = fixture({ providerStatus: status });
  await deliverTaskEmails(f);
  assert.equal(f.calls.find(c => c.url.endsWith('/finish_task_email')).body.p_status, 'queued');
});
test('invalid sender or recipient failure is held for review', async () => {
  const f = fixture({ providerStatus: 422 });
  await deliverTaskEmails(f);
  assert.equal(f.calls.find(c => c.url.endsWith('/finish_task_email')).body.p_status, 'failed');
});
test('uncertain network outcome retries with exactly the same payload and key', async () => {
  const first = fixture({ networkError: true }), retry = fixture();
  await deliverTaskEmails(first);
  await deliverTaskEmails(retry);
  const a = first.calls.find(c => c.url.includes('resend.com')), b = retry.calls.find(c => c.url.includes('resend.com'));
  assert.deepEqual(a.body, b.body);
  assert.equal(a.headers['Idempotency-Key'], b.headers['Idempotency-Key']);
  assert.equal(first.calls.find(c => c.url.endsWith('/finish_task_email')).body.p_status, 'queued');
});
test('failed receipt persistence does not claim delivery succeeded', async () => {
  await assert.rejects(deliverTaskEmails(fixture({ failFinish: true })), /finish_task_email failed/);
});
test('unconfigured email service records readiness without claiming tasks or exposing secrets', async () => {
  const f = fixture();
  f.env = name => name === 'RESEND_API_KEY' ? '' : values[name];
  await assert.rejects(deliverTaskEmails(f), /requires Supabase/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.configured, false);
  assert.equal(f.calls[0].body.status, 'not_configured');
  assert.ok(!JSON.stringify(f.calls[0].body).includes('server-key'));
});
test('empty queue never contacts email provider', async () => {
  const f = fixture({ rows: [] });
  assert.deepEqual(await deliverTaskEmails(f), { claimed: 0, sent: 0 });
  assert.ok(!f.calls.some(c => c.url.includes('resend.com')));
});
