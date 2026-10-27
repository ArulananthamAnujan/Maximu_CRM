export async function deliverClientNotices({env, fetchImpl=fetch}) {
  const base=(env('SUPABASE_URL')||'').replace(/\/$/,'');
  const key=env('SUPABASE_SERVICE_ROLE_KEY'), apiKey=env('RESEND_API_KEY'), from=env('RESEND_FROM_EMAIL');
  const origin=(env('PRODUCTION_URL')||env('URL')||'').replace(/\/$/,'');
  if(!base||!key||!apiKey||!from||from.includes('example.invalid')||!/^https:\/\/[^/]+$/.test(origin)) return {configured:false,claimed:0,sent:0};
  async function rpc(name,body) {
    const r=await fetchImpl(`${base}/rest/v1/rpc/${name}`,{method:'POST',signal:AbortSignal.timeout(2000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`Client notice ${name} failed (${r.status}).`);
    const text=await r.text(); return text?JSON.parse(text):null;
  }
  const rows=await rpc('claim_client_notices',{p_from:from,p_origin:origin});let sent=0;
  for(const row of rows){
    let status='queued', providerId=null, error=null;
    try {
      const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(2000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`client-notice/${row.id}`},body:JSON.stringify(row.payload)});
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
