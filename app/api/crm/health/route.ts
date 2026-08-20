import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(request:Request){
  try{
    const session=await liveSession(request);
    if(session.identity.role!=="super_admin"&&session.identity.role!=="admin")throw new LiveAccessError(403,"Administrator access is required.");
    const token=session.accessToken;
    const started=Date.now();
    const readiness=await supabaseRequest(`/rest/v1/rpc/production_readiness`,{method:"POST",body:JSON.stringify({target_organisation:session.identity.organisationId})},token);
    const payload={ok:true,status:"healthy",database:"connected",latencyMs:Date.now()-started,readiness,checkedAt:new Date().toISOString()};
    return appendRefreshCookies(Response.json(payload,{headers:{"Cache-Control":"no-store"}}),session.refreshed);
  }catch(error){if(error instanceof LiveAccessError)return Response.json({ok:false,error:error.message},{status:error.status});if(error instanceof SupabaseError)return Response.json({ok:false,status:"degraded",database:"unavailable"},{status:503});console.error(error);return Response.json({ok:false,status:"degraded"},{status:500});}
}
