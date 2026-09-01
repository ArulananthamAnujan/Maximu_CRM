import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client") throw new LiveAccessError(403, "Intake links are available to staff only.");
    const body = await request.json() as Json;
    const serviceType = body.serviceType === "direct_visa" ? "direct_visa" : "study_abroad";
    const branches = await supabaseRequest<Array<{id:string}>>("/rest/v1/branches?select=id&active=eq.true&order=created_at.asc&limit=100", { method:"GET" }, session.accessToken);
    const requestedBranch = optional(body.branchId) ?? session.identity.branchId;
    const branchId = requestedBranch && branches.some((branch) => branch.id === requestedBranch) ? requestedBranch : branches[0]?.id;
    if (!branchId) throw new InputError("No active branch is available for this intake link.");
    const token = randomToken();
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabaseRequest("/rest/v1/public_intake_links", {
      method:"POST", headers:{Prefer:"return=minimal"}, body:JSON.stringify({
        id, organisation_id:session.identity.organisationId, branch_id:branchId,
        created_by:session.identity.profileId, token_hash:await tokenHash(token),
        service_type:serviceType, label:optional(body.label), expires_at:expiresAt,
        max_submissions:100, active:true,
      }),
    }, session.accessToken);
    const url = new URL(`/intake/${token}`, request.url).toString();
    return appendRefreshCookies(Response.json({ok:true,id,url,expiresAt}), session.refreshed, request);
  } catch (error) { return apiError(error); }
}

function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes,(byte)=>byte.toString(16).padStart(2,"0")).join("");}
async function tokenHash(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,"0")).join("");}
function optional(value:unknown){return typeof value==="string"&&value.trim()?value.trim():null;}
class InputError extends Error{}
function apiError(error:unknown){if(error instanceof InputError)return Response.json({ok:false,error:error.message},{status:400});if(error instanceof LiveAccessError)return Response.json({ok:false,error:error.message},{status:error.status});if(error instanceof SupabaseError)return Response.json({ok:false,error:"The intake link could not be created."},{status:error.status>=400&&error.status<500?error.status:503});console.error(error);return Response.json({ok:false,error:"The intake link could not be created."},{status:500});}
