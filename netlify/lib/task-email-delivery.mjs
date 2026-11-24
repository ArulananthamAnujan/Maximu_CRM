// The injected transport keeps retries testable without sending real emails.
//
// Used two ways, like the client notices: the scheduled Netlify function
// drains the queue every minute through the system sender, and the CRM calls
// this straight after a task changes with `send`, which delivers a claimed row
// from a connected staff Gmail (see server/task-notices.ts). With `send` the
// system sender is optional, so task email works on a deployment that has
// only Google Workspace. Both paths claim a row with a lock token, so a
// notice is never sent twice.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export async function deliverTaskEmails({ env, fetchImpl = fetch, origin: originOverride, send }) {
  const base = env('SUPABASE_URL')?.replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = env('RESEND_API_KEY');
  const systemFrom = env('RESEND_FROM_EMAIL');
  const systemReady = Boolean(apiKey && systemFrom && !systemFrom.includes('example.invalid'));
  const from = systemReady ? systemFrom : 'Maximus CRM';
  const origin = (originOverride || env('PRODUCTION_URL') || env('URL') || '').replace(/\/$/, '');
  const originOk = /^https:\/\/[^/]+$/.test(origin) || (Boolean(send) && LOCAL_ORIGIN.test(origin));
  const configured = Boolean(base && serviceKey && (send || systemReady) && originOk);
  const heartbeat = async (status, counts = {}) => {
    if (!base || !serviceKey) return;
    const response = await fetchImpl(`${base}/rest/v1/task_email_worker_status?on_conflict=id`, {
      method: 'POST', signal: AbortSignal.timeout(1500),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: 1, checked_at: new Date().toISOString(), configured, status, claimed: 0, sent: 0, ...counts }),
    });
    if (!response.ok) throw new Error(`Task email heartbeat failed (${response.status}).`);
  };
  if (!configured) {
    await heartbeat('not_configured');
    throw new Error('Task email delivery requires Supabase, Resend sender/key and the production HTTPS URL.');
  }
  const rpc = async (name, body) => {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST', signal: AbortSignal.timeout(1500),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Task email ${name} failed (${response.status}).`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  await heartbeat('running');
  const rows = await rpc('claim_task_emails', { p_from: from, p_origin: origin });
  let sent = 0;
  // Five sequential sends plus bounded DB requests stay within the 30s schedule limit.
  for (const row of rows) {
    let status = 'queued', providerId = null, error = null;
    if (send) {
      try {
        const result = await send(row);
        status = 'sent';
        providerId = result?.id || null;
        sent++;
      } catch (reason) {
        // Left queued: the next task change, or the scheduled sender, tries again.
        error = String(reason?.message || 'Delivery failed.').slice(0, 300);
      }
      await rpc('finish_task_email', { p_id: row.id, p_token: row.lock_token, p_status: status, p_provider_id: providerId, p_error: error });
      continue;
    }
    try {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(2000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `task-email/${row.id}` },
        body: JSON.stringify(row.payload),
      });
      if (response.ok) {
        const result = await response.json();
        if (!result.id) throw new Error('Email provider response did not contain a message ID.');
        providerId = result.id;
        status = 'sent';
        sent++;
      } else {
        // Never persist provider response bodies: they may contain addresses.
        error = `Email provider returned HTTP ${response.status}.`;
        if (response.status === 403) error += ' Check the verified sender domain, API-key domain permissions and any test-mode recipient restriction.';
        if (response.status === 401) error += ' Check the email API key.';
        status = response.status === 429 || response.status === 409 || response.status >= 500 ? 'queued' : 'failed';
      }
    } catch {
      error = 'Email request timed out or delivery outcome is unknown; retry with the same idempotency key.';
    }
    await rpc('finish_task_email', { p_id: row.id, p_token: row.lock_token, p_status: status, p_provider_id: providerId, p_error: error });
  }
  const result = { claimed: rows.length, sent };
  await heartbeat(sent === rows.length ? 'healthy' : 'delivery_pending_or_failed', result);
  return result;
}
