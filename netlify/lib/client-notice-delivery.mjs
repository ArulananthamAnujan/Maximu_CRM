// Delivers queued client notices (document requests and agreement events)
// from public.client_notice_outbox. Used two ways: the scheduled Netlify
// function drains the outbox every minute as the retry path, and the CRM
// itself calls this straight after queuing a notice so a client hears about
// a request within seconds rather than on the next tick. Both paths claim a
// row with a lock token, so a notice is never sent twice.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// `send` lets the CRM deliver a claimed row itself (from the case officer's
// connected Gmail, see server/staff-mail.ts); it resolves to {id} or throws.
// Without it the row goes to the system sender, which must then be configured.
export async function deliverClientNotices({env, fetchImpl=fetch, origin: originOverride, send}) {
  const base=(env('SUPABASE_URL')||'').replace(/\/$/,'');
  const key=env('SUPABASE_SERVICE_ROLE_KEY'), apiKey=env('RESEND_API_KEY');
  const systemFrom=env('RESEND_FROM_EMAIL');
  const systemReady=Boolean(apiKey&&systemFrom&&!systemFrom.includes('example.invalid'));
  const from=systemReady?systemFrom:'Maximus Education and Migration';
  const providerBase=(env('RESEND_API_BASE')||'https://api.resend.com').replace(/\/$/,'');
  const origin=(originOverride||env('PRODUCTION_URL')||env('URL')||'').replace(/\/$/,'');
  const originOk=/^https:\/\/[^/]+$/.test(origin)||LOCAL_ORIGIN.test(origin);
  if(!base||!key||!(send||systemReady)||!originOk) return {configured:false,claimed:0,sent:0};
  async function rpc(name,body) {
    const r=await fetchImpl(`${base}/rest/v1/rpc/${name}`,{method:'POST',signal:AbortSignal.timeout(2000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`Client notice ${name} failed (${r.status}).`);
    const text=await r.text(); return text?JSON.parse(text):null;
  }
  const rows=await rpc('claim_client_notices',{p_from:from,p_origin:origin});let sent=0;
  for(const row of rows){
    let status='queued', providerId=null, error=null;
    if(send){
      try {const result=await send(row);status='sent';providerId=result?.id||null;sent++;}
      catch(reason){error=String(reason?.message||'Delivery failed.').slice(0,300)+' Retrying.';}
      await rpc('finish_client_notice',{p_id:row.id,p_token:row.lock_token,p_status:status,p_provider_id:providerId,p_error:error});
      continue;
    }
    try {
      const r=await fetchImpl(`${providerBase}/emails`,{method:'POST',signal:AbortSignal.timeout(2000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`client-notice/${row.id}`},body:JSON.stringify(row.payload)});
      if(r.ok){const result=await r.json();if(!result.id)throw new Error('No receipt');status='sent';providerId=result.id;sent++;}
      else {
        error=`Email provider returned HTTP ${r.status}.`;
        if(r.status===403)error+=' Verify the sending domain, API-key domain permissions and test-recipient restrictions.';
        if(r.status===401)error+=' Replace the invalid email API key.';
        status=(r.status===429||r.status===409||r.status>=500)?'queued':'failed';
      }
    } catch {error='Delivery outcome unknown. Retrying with the same idempotency key.';}
    await rpc('finish_client_notice',{p_id:row.id,p_token:row.lock_token,p_status:status,p_provider_id:providerId,p_error:error});
  }
  return {configured:true,claimed:rows.length,sent};
}
