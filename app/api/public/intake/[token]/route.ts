import { clientIp, SupabaseError, supabaseAdminRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const link=await activeLink((await params).token);
    return Response.json({ok:true,serviceType:link.service_type,label:link.label,expiresAt:link.expires_at},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return publicError(error);}
}

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const token=(await params).token;
    const body=await request.json() as Json;
    if(optional(body.website))return Response.json({ok:true});
    if(body.consent!=="on")throw new InputError("Consent is required before submitting this enquiry.");
    const name=required(body.name,"Full name");
    const email=validEmail(body.email);
    const mobile=required(body.mobile,"Mobile");
    const visaExpiry=validDay(body.visaExpiry,"Visa expiry date");
    const link=await claimLink(token);
    const existing=await adminGet(`clients?select=id&organisation_id=eq.${link.organisation_id}&email=eq.${encodeURIComponent(email)}&limit=1`);
    const clientId=String(existing[0]?.id||crypto.randomUUID());
    if(!existing[0])await adminInsert("clients",{id:clientId,organisation_id:link.organisation_id,branch_id:link.branch_id,crm_id:`WEB-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`,first_name:name.split(/\s+/)[0],last_name:name.split(/\s+/).slice(1).join(" ")||"—",email,mobile,nationality:optional(body.nationality),source:"secure_intake_link",current_lifecycle:"enquiry",privacy_consent_at:new Date().toISOString(),custom_fields:{submitted_via_intake_link:true}});
    const caseId=crypto.randomUUID();
    const caseNumber=`WEB-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
    await adminInsert("cases",{id:caseId,organisation_id:link.organisation_id,client_id:clientId,branch_id:link.branch_id,case_number:caseNumber,service_type:link.service_type,matter_type:optional(body.matterType),owner_id:link.created_by,health:"healthy",priority:"medium",progress:0,target:optional(body.destination),due_at:new Date(Date.now()+48*60*60*1000).toISOString(),lifecycle_stage:"enquiry",visa_expiry_on:visaExpiry,custom_fields:{intake_link_id:link.id,message:optional(body.message),submission_ip_hash:await tokenHash(`${link.id}:${clientIp(request)}`)}});
    await adminInsert("enquiries",{id:crypto.randomUUID(),organisation_id:link.organisation_id,client_id:clientId,case_id:caseId,branch_id:link.branch_id,assigned_to:link.created_by,source:"Secure enquiry link",priority:"medium",status:"new",score:45,next_follow_up_at:new Date(Date.now()+48*60*60*1000).toISOString()});
    await adminInsert("audit_events",{organisation_id:link.organisation_id,actor_id:link.created_by,action:"public_intake.submitted",resource_type:"case",resource_id:caseId,case_id:caseId,summary:`Secure intake submitted for ${name}`,after_data:{intake_link_id:link.id}});
    return Response.json({ok:true,reference:caseNumber});
  }catch(error){return publicError(error);}
}

async function activeLink(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new InputError("This intake link is invalid.");const hash=await tokenHash(token);const rows=await adminGet(`public_intake_links?select=*&token_hash=eq.${hash}&active=eq.true&limit=1`);const link=rows[0];if(!link||Date.parse(String(link.expires_at))<=Date.now()||Number(link.submission_count)>=Number(link.max_submissions))throw new InputError("This intake link has expired or is no longer available.");return link;}
async function claimLink(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new InputError("This intake link is invalid.");const rows=await supabaseAdminRequest<Json[]>("/rest/v1/rpc/claim_public_intake_link",{method:"POST",body:JSON.stringify({target_hash:await tokenHash(token)})});if(!rows[0])throw new InputError("This intake link has expired or is no longer available.");return rows[0];}
async function adminGet(query:string){return supabaseAdminRequest<Json[]>(`/rest/v1/${query}`,{method:"GET"});}
async function adminInsert(table:string,value:Json){await supabaseAdminRequest(`/rest/v1/${table}`,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(value)});}
async function tokenHash(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,"0")).join("");}
function optional(value:unknown){return typeof value==="string"&&value.trim()?value.trim():null;}
function required(value:unknown,label:string){const parsed=optional(value);if(!parsed)throw new InputError(`${label} is required.`);return parsed;}
function validEmail(value:unknown){const parsed=required(value,"Email").toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed))throw new InputError("Enter a valid email address.");return parsed;}
function validDay(value:unknown,label:string){const parsed=required(value,label);if(!/^\d{4}-\d{2}-\d{2}$/.test(parsed)||Number.isNaN(Date.parse(`${parsed}T00:00:00Z`)))throw new InputError(`${label} is invalid.`);return parsed;}
class InputError extends Error{}
function publicError(error:unknown){if(error instanceof InputError)return Response.json({ok:false,error:error.message},{status:400,headers:{"Cache-Control":"no-store"}});if(error instanceof SupabaseError&&error.status===501)return Response.json({ok:false,error:"Secure intake is temporarily unavailable."},{status:503});console.error(error);return Response.json({ok:false,error:"The enquiry could not be submitted."},{status:500,headers:{"Cache-Control":"no-store"}});}
