import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { schemaStatus, schemaVersionFromRpc } from "@/lib/schema-version";

export const dynamic = "force-dynamic";

export async function GET(request:Request){
  try{
    const session=await liveSession(request);
    if(session.identity.role!=="super_admin"&&session.identity.role!=="admin")throw new LiveAccessError(403,"Administrator access is required.");
    const token=session.accessToken;
    const started=Date.now();
    const readiness=await supabaseRequest(`/rest/v1/rpc/production_readiness`,{method:"POST",body:JSON.stringify({target_organisation:session.identity.organisationId})},token);
    // Which migration the database is at. A database without schema_version() predates versioning and is reported as behind.
    let found:string|null=null;
    try{found=schemaVersionFromRpc(await supabaseRequest<unknown>(`/rest/v1/rpc/schema_version`,{method:"POST",body:"{}"},token));}catch{found=null;}
    const schema=schemaStatus(found);
    const payload={ok:true,status:schema.upToDate?"healthy":"update_required",database:"connected",latencyMs:Date.now()-started,readiness,schema,checkedAt:new Date().toISOString()};
    return appendRefreshCookies(Response.json(payload,{headers:{"Cache-Control":"no-store"}}),session.refreshed, request);
  }catch(error){if(error instanceof LiveAccessError)return Response.json({ok:false,error:error.message},{status:error.status});if(error instanceof SupabaseError)return Response.json({ok:false,status:"degraded",database:"unavailable"},{status:503});console.error(error);return Response.json({ok:false,status:"degraded"},{status:500});}
}
