// The injected transport keeps retries testable without sending real emails.
export async function deliverTaskEmails({ env, fetchImpl = fetch }) {
  const base = env('SUPABASE_URL')?.replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = env('RESEND_API_KEY');
  const from = env('RESEND_FROM_EMAIL');
  const origin = (env('PRODUCTION_URL') || env('URL') || '').replace(/\/$/, '');
  const configured = Boolean(base && serviceKey && apiKey && from && !from.includes('example.invalid') && /^https:\/\/[^/]+$/.test(origin));
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
