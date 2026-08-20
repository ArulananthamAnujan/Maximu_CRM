import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    requireAdmin(session.identity.role);
    const batches = await get("import_batches?select=*&order=started_at.desc&limit=50",session.accessToken);
    return appendRefreshCookies(Response.json({ok:true,batches}),session.refreshed);
  } catch(error){return apiError(error);}
}

export async function POST(request: Request) {
  try {
    const session=await liveSession(request);
    requireAdmin(session.identity.role);
    const body=await request.json() as Json;
    const action=required(body.action,"Action");
    const token=session.accessToken;
    const org=session.identity.organisationId;
    if(action==="validate"){
      const rows=Array.isArray(body.rows)?body.rows.filter(isObject).slice(0,5000):[];
      if(!rows.length)throw new InputError("Import rows are required.");
      const batchId=crypto.randomUUID();
      const normalized=rows.map((row,index)=>normalizeRow(row,index+1));
      const invalid=normalized.filter(row=>row.errors.length);
      await insert("import_batches",{id:batchId,organisation_id:org,source_system:optional(body.sourceSystem)||"legacy_maximus",source_file_name:optional(body.fileName),status:invalid.length?"validating":"ready",total_rows:rows.length,valid_rows:rows.length-invalid.length,invalid_rows:invalid.length,mapping:isObject(body.mapping)?body.mapping:{},started_by:session.identity.profileId,error_summary:invalid.length?`${invalid.length} rows require correction`:null},token);
      for(let offset=0;offset<normalized.length;offset+=200)await insert("import_rows",normalized.slice(offset,offset+200).map(row=>({id:crypto.randomUUID(),organisation_id:org,batch_id:batchId,row_number:row.rowNumber,source_key:row.sourceKey,raw_data:row.raw,normalized_data:row.normalized,validation_errors:row.errors,status:row.errors.length?"invalid":"valid"})),token);
      return Response.json({ok:true,batchId,total:rows.length,valid:rows.length-invalid.length,invalid:invalid.length,errors:invalid.slice(0,100).map(row=>({row:row.rowNumber,errors:row.errors}))});
    }
    if(action==="commit"){
      const batchId=uuid(body.batchId,"Batch");
      const batches=await get(`import_batches?select=*&id=eq.${batchId}&limit=1`,token) as Json[];
      if(!batches[0]||Number(batches[0].invalid_rows)>0)throw new InputError("Resolve all invalid rows before importing.");
      const rows=await get(`import_rows?select=id,row_number,normalized_data,status&batch_id=eq.${batchId}&status=eq.valid&order=row_number.asc`,token) as Json[];
      await patch("import_batches",batchId,{status:"importing"},token);
      let imported=0;
      for(const row of rows){const data=isObject(row.normalized_data)?row.normalized_data:{};const id=crypto.randomUUID();await insert("clients",{id,organisation_id:org,branch_id:data.branch_id,crm_id:data.crm_id||`LEGACY-${id.slice(0,8).toUpperCase()}`,first_name:data.first_name,last_name:data.last_name,email:data.email,mobile:data.mobile,date_of_birth:data.date_of_birth,nationality:data.nationality,source:"legacy_import",current_lifecycle:data.current_lifecycle||"enquiry",custom_fields:{legacy_source_key:data.source_key},updated_at:new Date().toISOString()},token);await patch("import_rows",String(row.id),{status:"imported",target_client_id:id},token);imported+=1;}
      await patch("import_batches",batchId,{status:"completed",imported_rows:imported,completed_at:new Date().toISOString()},token);
      return Response.json({ok:true,imported});
    }
    throw new InputError("Unsupported import action.");
  } catch(error){return apiError(error);}
}

function normalizeRow(raw:Json,rowNumber:number){const errors:string[]=[];const first=optional(raw.first_name??raw.firstName);const last=optional(raw.last_name??raw.lastName);const email=optional(raw.email)?.toLowerCase()||null;const branch=optional(raw.branch_id??raw.branchId);if(!first)errors.push("First name is required");if(!last)errors.push("Last name is required");if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push("Email is invalid");if(!branch||!/^[0-9a-f-]{36}$/i.test(branch))errors.push("A valid branch ID is required");const date=optional(raw.date_of_birth??raw.dateOfBirth);if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))))errors.push("Date of birth is invalid");const sourceKey=optional(raw.crm_id??raw.crmId??raw.id);return{rowNumber,sourceKey,raw,errors,normalized:{source_key:sourceKey,crm_id:optional(raw.crm_id??raw.crmId),branch_id:branch,first_name:first,last_name:last,email,mobile:optional(raw.mobile??raw.phone),date_of_birth:date,nationality:optional(raw.nationality),current_lifecycle:optional(raw.current_lifecycle??raw.status)}};}
function requireAdmin(role:string){if(role!=="super_admin"&&role!=="admin")throw new LiveAccessError(403,"Administrator access is required.");}
async function get(query:string,token:string){return supabaseRequest(`/rest/v1/${query}`,{method:"GET"},token);}
async function insert(table:string,value:Json|Json[],token:string){await supabaseRequest(`/rest/v1/${table}`,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(value)},token);}
async function patch(table:string,id:string,value:Json,token:string){await supabaseRequest(`/rest/v1/${table}?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(value)},token);}
function optional(value:unknown){return typeof value==="string"&&value.trim()?value.trim():null;}
function required(value:unknown,label:string){const parsed=optional(value);if(!parsed)throw new InputError(`${label} is required.`);return parsed;}
function uuid(value:unknown,label:string){const parsed=required(value,label);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed))throw new InputError(`${label} is invalid.`);return parsed;}
function isObject(value:unknown):value is Json{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
class InputError extends Error{}
function apiError(error:unknown){if(error instanceof InputError)return Response.json({ok:false,error:error.message},{status:400});if(error instanceof LiveAccessError)return Response.json({ok:false,error:error.message},{status:error.status});if(error instanceof SupabaseError)return Response.json({ok:false,error:"The database rejected the import operation."},{status:error.status>=400&&error.status<500?error.status:503});console.error(error);return Response.json({ok:false,error:"The import operation failed."},{status:500});}
