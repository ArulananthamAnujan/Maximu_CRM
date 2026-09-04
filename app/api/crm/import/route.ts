import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { mask, protect, ProtectedFieldError } from "@/server/protected-fields";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    requireAdmin(session.identity.role);
    const batches = await get("import_batches?select=*&order=started_at.desc&limit=50",session.accessToken);
    return appendRefreshCookies(Response.json({ok:true,batches}),session.refreshed, request);
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
      const rows=Array.isArray(body.rows)?body.rows.filter(isObject):[];
      if(!rows.length)throw new InputError("Import rows are required.");
      if(rows.length>500)throw new InputError("Send the import in chunks of 500 rows or fewer.");
      const entityType=legacyEntity(body.entityType);
      const requestedBatchId=optional(body.batchId);
      const batchId=requestedBatchId?uuid(requestedBatchId,"Batch"):crypto.randomUUID();
      const existingBatch=requestedBatchId?(await get(`import_batches?select=*&id=eq.${batchId}&limit=1`,token) as Json[])[0]:null;
      if(requestedBatchId&&!existingBatch)throw new InputError("That import batch no longer exists.");
      if(existingBatch&&String((existingBatch.mapping as Json | null)?.entity_type)!==entityType)throw new InputError("Every chunk in an import batch must use the same export type.");
      const sourceTimezone=validTimezone(body.sourceTimezone??existingBatch?.source_timezone);
      const rowOffset=Math.max(0,numberValue(body.rowOffset,Number(existingBatch?.received_rows??0)));
      const branches=await branchLookup(body.branchId,session.identity.branchId,token);
      const priorKeys=new Set<string>((requestedBatchId?await getAll(`import_rows?select=source_key&batch_id=eq.${batchId}`,token):[]).map(row=>String(row.source_key||"")));
      const chunkKeys=new Set<string>();
      const normalized=await Promise.all(rows.map((row,index)=>normalizeRow(row,rowOffset+index+1,branches,entityType,sourceTimezone)));
      for(const row of normalized){if(priorKeys.has(row.sourceKey)||chunkKeys.has(row.sourceKey))row.errors.push("Duplicate source_key in this import batch");chunkKeys.add(row.sourceKey);}
      const invalid=normalized.filter(row=>row.errors.length);
      const declaredRows=Math.max(rows.length,numberValue(body.totalRows,rows.length));
      if(!existingBatch)await insert("import_batches",{id:batchId,organisation_id:org,source_system:optional(body.sourceSystem)||"legacy_maximus",source_file_name:optional(body.fileName),status:"validating",total_rows:declaredRows,declared_rows:declaredRows,received_rows:0,source_timezone:sourceTimezone,mapping:{...(isObject(body.mapping)?body.mapping:{}),entity_type:entityType},started_by:session.identity.profileId},token);
      for(let offset=0;offset<normalized.length;offset+=200)await insert("import_rows",normalized.slice(offset,offset+200).map(row=>({id:crypto.randomUUID(),organisation_id:org,batch_id:batchId,row_number:row.rowNumber,source_key:row.sourceKey,raw_data:row.raw,protected_data:row.protectedData,source_checksum:row.sourceChecksum,normalized_data:row.normalized,validation_errors:row.errors,status:row.errors.length?"invalid":"valid"})),token);
      const received=Number(existingBatch?.received_rows??0)+rows.length;
      const invalidTotal=Number(existingBatch?.invalid_rows??0)+invalid.length;
      const validTotal=Number(existingBatch?.valid_rows??0)+rows.length-invalid.length;
      const finalChunk=body.finalChunk===true;
      const countMismatch=finalChunk&&received!==declaredRows;
      const nextStatus=finalChunk&&!invalidTotal&&!countMismatch?"ready":"validating";
      await patch("import_batches",batchId,{status:nextStatus,total_rows:declaredRows,declared_rows:declaredRows,received_rows:received,valid_rows:validTotal,invalid_rows:invalidTotal,error_summary:countMismatch?`Expected ${declaredRows} rows but received ${received}`:invalidTotal?`${invalidTotal} rows require correction`:null},token);
      return Response.json({ok:true,batchId,total:declaredRows,received,valid:validTotal,invalid:invalidTotal,ready:nextStatus==="ready",errors:invalid.slice(0,100).map(row=>({row:row.rowNumber,errors:row.errors}))});
    }
    if(action==="commit"){
      const batchId=uuid(body.batchId,"Batch");
      const batches=await get(`import_batches?select=*&id=eq.${batchId}&limit=1`,token) as Json[];
      if(!batches[0]||Number(batches[0].invalid_rows)>0)throw new InputError("Resolve all invalid rows before importing.");
      if(!["ready","importing","failed"].includes(String(batches[0].status)))throw new InputError("Finish validating every chunk before importing.");
      // Keep each commit request comfortably below the serverless execution limit.
      // The client already repeats commit calls until `remaining` reaches zero,
      // so smaller pages retain the same resumable and idempotent behaviour.
      const rows=await get(`import_rows?select=id,row_number,normalized_data,raw_data,protected_data,source_checksum,status&batch_id=eq.${batchId}&status=eq.valid&order=row_number.asc&limit=10`,token) as Json[];
      await patch("import_batches",batchId,{status:"importing"},token);
      const entityType=legacyEntity((isObject(batches[0].mapping)?batches[0].mapping:{}).entity_type);
      const sourceSystem=String(batches[0].source_system||"legacy_maximus");
      const staffRows=await getAll("profiles?select=id,email,display_name",token) as Json[];
      const staffByLabel=new Map<string,string>();
      for(const profile of staffRows){const id=String(profile.id);for(const label of [profile.id,profile.email,profile.display_name]){const key=optional(label)?.toLowerCase();if(key)staffByLabel.set(key,id);}}
      const legacyStaff=await getAll("legacy_staff_directory?select=source_key,display_name,email,target_profile_id",token) as Json[];
      for(const profile of legacyStaff){const target=validUuid(profile.target_profile_id);if(!target)continue;for(const label of [profile.source_key,profile.email,profile.display_name]){const key=optional(label)?.toLowerCase();if(key)staffByLabel.set(key,target);}}
      let imported=0;
      for(const row of rows){
        const original=isObject(row.normalized_data)?row.normalized_data:{};
        const staffId=(value:unknown)=>{const label=optional(value);return label?staffByLabel.get(label.toLowerCase())??validUuid(label):null;};
        const ownerLabel=original.assigned_to??original.assigned_staff??original.case_officer??original.owner??original.owner_email;
        const data:Json={...original,resolved_owner_id:staffId(ownerLabel),resolved_author_id:staffId(original.author??original.created_by??original.added_by),resolved_assigned_by_id:staffId(original.assigned_by),resolved_completed_by_id:staffId(original.completed_by),resolved_actor_id:staffId(original.actor??original.updated_by??original.created_by)};
        const target=entityType==="study_records"||entityType==="direct_visa_records"
          ? await importLegacyCombined(entityType,data,org,sourceSystem,session.identity.profileId,token)
          : await importLegacyEntity(entityType,data,org,sourceSystem,session.identity.profileId,token);
        await saveSnapshot({org,sourceSystem,entityType,sourceKey:required(data.source_key,"Source key"),targetId:target,targetTable:targetTable(entityType),displayData:(row.raw_data as Json)??{},protectedData:optional(row.protected_data),sourceChecksum:required(row.source_checksum,"Source checksum"),actor:session.identity.profileId},token);
        await patch("import_rows",String(row.id),{status:"imported",target_client_id:entityType==="clients"?target:null,target_record_id:target,imported_at:new Date().toISOString()},token);
        imported+=1;
      }
      const importedTotal=Number(batches[0].imported_rows??0)+imported;
      const remaining=(await get(`import_rows?select=id&batch_id=eq.${batchId}&status=eq.valid&limit=1`,token) as Json[]).length;
      if(remaining){await patch("import_batches",batchId,{imported_rows:importedTotal},token);return Response.json({ok:true,imported,importedTotal,remaining:true});}
      const reconciliation=await reconcileBatch(batchId,org,sourceSystem,entityType,token);
      await patch("import_batches",batchId,{status:reconciliation.complete?"completed":"failed",imported_rows:importedTotal,completed_at:new Date().toISOString(),reconciliation,reconciled_at:new Date().toISOString(),source_checksum:reconciliation.sourceChecksum,error_summary:reconciliation.complete?null:reconciliation.summary},token);
      return Response.json({ok:reconciliation.complete,imported,importedTotal,remaining:false,reconciliation},{status:reconciliation.complete?200:409});
    }
    throw new InputError("Unsupported import action.");
  } catch(error){return apiError(error);}
}

type BranchLookup = { byKey: Map<string, string>; fallback: string | null };

// A legacy export carries a branch name or code -- "MEL", "Melbourne" -- never
// the Supabase UUID. Accept an id, a code or a name, and otherwise fall back to
// the branch chosen for the whole import.
function resolveRowBranch(raw: Json, branches: BranchLookup): string | null {
  const explicit = optional(raw.branch_id ?? raw.branchId);
  if (explicit && /^[0-9a-f-]{36}$/i.test(explicit)) return explicit;
  const label = optional(raw.branch_code ?? raw.branchCode ?? raw.branch ?? raw.branch_name ?? raw.branchName) ?? explicit;
  if (label) {
    const matched = branches.byKey.get(label.trim().toLowerCase());
    if (matched) return matched;
  }
  return branches.fallback;
}

async function normalizeRow(raw:Json,rowNumber:number,branches:BranchLookup,entityType:string,sourceTimezone:string){
  const errors:string[]=[];
  const combinedIdName=optional(raw.id_name);
  const combinedKey=combinedIdName?.match(/(?:MAX|CRM)[\/A-Z0-9-]+/i)?.[0]??combinedIdName?.split(/\s+/)[0];
  const sourceKey=optional(raw.source_key??raw.legacy_id??raw.id??raw.crm_id??raw.crmId??raw.student_id??raw.client_id??combinedKey);
  if(!sourceKey)errors.push("A stable legacy id/source_key is required");
  const branch=resolveRowBranch(raw,branches);
  if(["clients","cases","study_records","direct_visa_records","commission_claims"].includes(entityType)&&!branch)errors.push("No branch matched. Add a branch_code column, or choose a default branch for this import.");
  const safeRaw=redactLegacyData(raw);
  const sensitiveRaw=extractSensitiveData(raw);
  const protectedData=Object.keys(sensitiveRaw).length?await protect(JSON.stringify(sensitiveRaw)):null;
  const sourceChecksum=await sha256(stableStringify(raw));
  const normalized:Json={...safeRaw,source_key:sourceKey,branch_id:branch,legacy_data:safeRaw,__source_timezone:sourceTimezone};
  if(entityType==="clients"||entityType==="study_records"||entityType==="direct_visa_records"){
    const combinedName=combinedIdName&&combinedKey?combinedIdName.replace(combinedKey,"").trim():null;
    const full=optional(raw.student_name??raw.client_name??raw.name??combinedName);
    const parts=full?.split(/\s+/)??[];
    normalized.first_name=optional(raw.first_name??raw.firstName)??parts.shift()??null;
    normalized.last_name=optional(raw.last_name??raw.lastName)??parts.join(" ")??null;
    normalized.email=optional(raw.email)?.toLowerCase()||null;
    normalized.mobile=optional(raw.mobile??raw.phone);
    normalized.crm_id=optional(raw.crm_id??raw.crmId??raw.student_id??raw.client_id)??sourceKey;
    normalized.date_of_birth=optional(raw.date_of_birth??raw.dateOfBirth??raw.dob);
    normalized.nationality=optional(raw.nationality??raw.country);
    normalized.gender=optional(raw.gender??raw.sex);
    normalized.marital_status=optional(raw.marital_status??raw.maritalStatus);
    normalized.country_of_birth=optional(raw.country_of_birth??raw.birth_country);
    normalized.current_country=optional(raw.current_country??raw.residence_country??raw.country);
    normalized.preferred_language=optional(raw.preferred_language??raw.language);
    normalized.alternate_phone=optional(raw.alternate_phone??raw.alternate_no??raw.other_mobile);
    normalized.address_line=optional(raw.address??raw.residential_address??raw.street_address);
    normalized.city=optional(raw.city??raw.suburb);
    normalized.state=optional(raw.state??raw.province);
    normalized.postcode=optional(raw.postcode??raw.post_code??raw.zip);
    normalized.passport_country=optional(raw.passport_country??raw.country_of_passport);
    normalized.passport_expiry=optional(raw.passport_expiry??raw.passport_expiry_date);
    const passport=optional(raw.passport_number??raw.passport_no??raw.passport);
    if(passport){normalized.passport_number_encrypted=await protect(passport);normalized.passport_masked=mask(passport);}
    normalized.current_lifecycle=normaliseLifecycle(raw.current_lifecycle??raw.lifecycle??raw.status);
    if(!normalized.first_name)errors.push("First name or full name is required");
    if(!normalized.last_name)normalized.last_name="—";
    if(normalized.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(normalized.email)))errors.push("Email is invalid");
    if(entityType==="study_records"||entityType==="direct_visa_records"){
      normalized.case_number=optional(raw.case_number??raw.case_id??raw.reference??raw.student_id??raw.client_id)??sourceKey;
      normalized.service_type=entityType==="direct_visa_records"?"direct_visa":"study_abroad";
      normalized.lifecycle_stage=normaliseLifecycle(raw.lifecycle_stage??raw.main_status??raw.stage??raw.status);
      normalized.matter_type=optional(raw.matter_type??raw.visa_type??raw.apply_level??raw.application_type);
      normalized.target=optional(raw.target??raw.interested_country??raw.countries??raw.country??raw.int_country);
      const protectedDependants=rowList(raw,["dependant_rows_json","dependantrowsjson","dependants_json","dependants"]);for(const dependant of protectedDependants){const passport=optional(dependant.passport_number??dependant.passport_no);if(passport){dependant.passport_number_encrypted=await protect(passport);dependant.passport_masked=mask(passport);delete dependant.passport_number;delete dependant.passport_no;}}if(protectedDependants.length)normalized.dependantrowsprotected=protectedDependants;
      const spouseName=optional(raw.spouse_name??raw.partner_name);if(spouseName){const spousePassport=optional(raw.spouse_passport_number??raw.spouse_passport_no);normalized.spouse_dependant={full_name:spouseName,relationship:"spouse",date_of_birth:raw.spouse_date_of_birth??raw.spouse_dob,nationality:raw.spouse_nationality,passport_number_encrypted:spousePassport?await protect(spousePassport):null,passport_masked:spousePassport?mask(spousePassport):null,passport_expiry:raw.spouse_passport_expiry??raw.spouse_date_of_expiry};}
    }
  }else if(entityType==="cases"){
    normalized.client_source_key=optional(raw.client_source_key??raw.client_id??raw.student_id??raw.crm_id);
    normalized.case_number=optional(raw.case_number??raw.case_id??raw.reference)??sourceKey;
    normalized.service_type=normaliseService(raw.service_type??raw.service??raw.mode);
    normalized.lifecycle_stage=normaliseLifecycle(raw.lifecycle_stage??raw.stage??raw.status);
    if(!normalized.client_source_key)errors.push("client_source_key/client_id is required");
  }else if(["applications","visa_matters","notes","tasks","appointments","communications","documents","lifecycle_events","application_comments","visa_comments","task_comments","activity_events"].includes(entityType)){
    normalized.case_source_key=optional(raw.case_source_key??raw.case_id??raw.case_number??raw.student_id??raw.client_id);
    if(!normalized.case_source_key)errors.push("case_source_key/case_id is required");
  }else if(["dependants","education_history","employment_history","test_results","study_preferences","visa_history"].includes(entityType)){
    normalized.client_source_key=optional(raw.client_source_key??raw.client_id??raw.student_id??raw.crm_id);
    if(entityType==="dependants"){const passport=optional(raw.passport_number??raw.passport_no);if(passport){normalized.passport_number_encrypted=await protect(passport);normalized.passport_masked=mask(passport);}}
    if(!normalized.client_source_key)errors.push("client_source_key/client_id is required");
  }else if(entityType==="invoices"){
    normalized.client_source_key=optional(raw.client_source_key??raw.client_id??raw.student_id??raw.crm_id);
    normalized.case_source_key=optional(raw.case_source_key??raw.case_id??raw.case_number);
    if(!normalized.client_source_key)errors.push("client_source_key/client_id is required");
  }else if(entityType==="payments"){
    normalized.invoice_source_key=optional(raw.invoice_source_key??raw.invoice_id??raw.invoice_number);
    if(!normalized.invoice_source_key)errors.push("invoice_source_key/invoice_id is required");
  }else if(entityType==="commission_claims"){
    normalized.counterparty_type=/university|institution/i.test(String(raw.counterparty_type??raw.type??raw.account_type??""))?"university":"partner";
    normalized.partner_name=optional(raw.partner_name??raw.partner??raw.university??raw.institution??raw.counterparty);
    if(!normalized.partner_name)errors.push("Partner or university name is required");
  }else if(entityType==="commission_payments"){
    normalized.commission_source_key=optional(raw.commission_source_key??raw.commission_invoice_id??raw.invoice_id??raw.invoice_number);
    if(!normalized.commission_source_key)errors.push("commission_source_key/invoice_number is required");
    if(numberValue(raw.amount??raw.received??raw.payment_amount)<=0)errors.push("Payment amount must be greater than zero");
  }else if(entityType==="payment_receipts"){
    normalized.payment_source_key=optional(raw.payment_source_key??raw.payment_id??raw.reference_number??raw.receipt_number);
    if(!normalized.payment_source_key)errors.push("payment_source_key/payment_id is required");
  }else if(entityType==="finance_line_items"){
    normalized.commission_source_key=optional(raw.commission_source_key??raw.commission_invoice_id??raw.invoice_id??raw.invoice_number);
    normalized.invoice_source_key=optional(raw.invoice_source_key);
    if(!normalized.commission_source_key&&!normalized.invoice_source_key)errors.push("A commission or client invoice source key is required");
  }else if(entityType==="campaign_recipients"){
    normalized.campaign_source_key=optional(raw.campaign_source_key??raw.campaign_id??raw.campaign_name);
    normalized.case_source_key=optional(raw.case_source_key??raw.case_id??raw.case_number??raw.student_id??raw.client_id);
    if(!normalized.campaign_source_key)errors.push("campaign_source_key/campaign_id is required");
    if(!normalized.case_source_key)errors.push("case_source_key/case_id is required");
  }else if(entityType==="staff_history"){
    normalized.display_name=optional(raw.display_name??raw.staff_name??raw.name??[raw.first_name,raw.last_name].filter(Boolean).join(" "));
    if(!normalized.display_name)errors.push("Staff name is required");
  }else if(entityType==="email_templates"){
    if(!optional(raw.title??raw.name??raw.subject))errors.push("Template title is required");
  }else if(entityType==="standard_documents"){
    if(!optional(raw.document_name??raw.display_name??raw.name))errors.push("Document name is required");
  }else if(entityType==="master_records"){
    if(!optional(raw.category??raw.type))errors.push("Master category is required");
    if(!optional(raw.label??raw.name??raw.value))errors.push("Master label is required");
  }else if(entityType==="file_manifest"){
    normalized.case_source_key=optional(raw.case_source_key??raw.case_id??raw.case_number);
    if(!optional(raw.file_name??raw.filename??raw.document_name??raw.display_name??raw.name))errors.push("File name is required");
  }
  return{rowNumber,sourceKey,raw:safeRaw,protectedData,sourceChecksum,errors,normalized};
}

const LEGACY_ENTITIES=["study_records","direct_visa_records","clients","cases","applications","visa_matters","notes","tasks","appointments","communications","documents","invoices","payments","commission_claims","commission_payments","dependants","education_history","employment_history","test_results","study_preferences","visa_history","lifecycle_events","application_comments","visa_comments","task_comments","payment_receipts","finance_line_items","campaigns","campaign_recipients","email_templates","standard_documents","staff_history","login_activity","activity_events","master_records","file_manifest"] as const;
function legacyEntity(value:unknown){const parsed=optional(value)||"clients";if(!(LEGACY_ENTITIES as readonly string[]).includes(parsed))throw new InputError("Unsupported legacy export type.");return parsed;}
function normaliseLifecycle(value:unknown){const text=String(value??"").trim().toLowerCase();if(/complete|closed|processed|granted|approved/.test(text))return"completed";if(/defer|waiting/.test(text))return"deferred";if(/visa|lodg/.test(text))return"visa";if(/application|offer|coe|enrol/.test(text))return"application";if(/student|client|confirmed/.test(text))return"student";return"enquiry";}
function lifecycleProgress(value:unknown){return({enquiry:0,student:25,application:50,visa:75,deferred:50,completed:100} as Record<string,number>)[String(value??"")]??0;}
function normaliseService(value:unknown){const text=String(value??"").trim().toLowerCase();return /direct|migration|immigration/.test(text)?"direct_visa":"study_abroad";}
function numberValue(value:unknown,fallback=0){const parsed=Number(String(value??"").replace(/[^0-9.-]/g,""));return Number.isFinite(parsed)?parsed:fallback;}
function validTimezone(value:unknown){const zone=optional(value)||"Australia/Melbourne";try{new Intl.DateTimeFormat("en-AU",{timeZone:zone}).format();return zone;}catch{return"Australia/Melbourne";}}
function zonedDate(parts:{year:number;month:number;day:number;hour:number;minute:number},zone:string){let guess=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute);const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});for(let pass=0;pass<2;pass+=1){const shown=Object.fromEntries(formatter.formatToParts(new Date(guess)).filter(part=>part.type!=="literal").map(part=>[part.type,Number(part.value)]));const shownUtc=Date.UTC(shown.year,shown.month-1,shown.day,shown.hour,shown.minute);guess+=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute)-shownUtc;}return new Date(guess).toISOString();}
function dateValue(value:unknown,timezone="Australia/Melbourne"){const parsed=optional(value);if(!parsed)return null;if(/[zZ]$|[+-]\d\d:?\d\d$/.test(parsed)){const date=new Date(parsed);return Number.isNaN(date.getTime())?null:date.toISOString();}const local=parsed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/i);if(local){let hour=Number(local[4]||0);if(local[6]?.toUpperCase()==="PM"&&hour<12)hour+=12;if(local[6]?.toUpperCase()==="AM"&&hour===12)hour=0;return zonedDate({year:Number(local[3]),month:Number(local[2]),day:Number(local[1]),hour,minute:Number(local[5]||0)},validTimezone(timezone));}const isoLocal=parsed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);if(isoLocal)return zonedDate({year:Number(isoLocal[1]),month:Number(isoLocal[2]),day:Number(isoLocal[3]),hour:Number(isoLocal[4]||0),minute:Number(isoLocal[5]||0)},validTimezone(timezone));const date=new Date(parsed);return Number.isNaN(date.getTime())?null:date.toISOString();}
function dayValue(value:unknown,timezone="Australia/Melbourne"){return dateValue(value,timezone)?.slice(0,10)??null;}
function listValue(value:unknown){if(Array.isArray(value))return value.map(String).map(item=>item.trim()).filter(Boolean);return optional(value)?.split(/[,;|\n]/).map(item=>item.trim()).filter(Boolean)??[];}
function jsonList(value:unknown):unknown[]{if(Array.isArray(value))return value;if(isObject(value))return[value];const text=optional(value);if(!text)return[];try{const parsed=JSON.parse(text);return Array.isArray(parsed)?parsed:[parsed];}catch{return listValue(text);}}
function rowList(data:Json,keys:string[]):Json[]{for(const key of keys){const value=data[key];if(Array.isArray(value))return value.filter(isObject);const text=optional(value);if(text)try{const parsed=JSON.parse(text);if(Array.isArray(parsed))return parsed.filter(isObject);}catch{/* A non-JSON legacy cell is retained in the source snapshot. */}}return[];}
function normaliseTaskState(value:unknown){const text=String(value??"").toLowerCase();if(/complete|done|closed/.test(text))return"completed";if(/cancel|void/.test(text))return"cancelled";if(/progress|started/.test(text))return"in_progress";return"open";}
function normaliseDeliveryState(value:unknown,direction:string){const text=String(value??"").toLowerCase();if(/fail|bounce|error/.test(text))return"failed";if(/read|open/.test(text))return"read";if(/deliver/.test(text))return"delivered";if(/send|sent/.test(text))return"sent";return direction==="inbound"?"received":"queued";}

async function importLegacyEntity(entity:string,data:Json,org:string,sourceSystem:string,actor:string,token:string):Promise<string>{
  const sourceKey=required(data.source_key,"Source key");
  const existing=await externalTarget(org,sourceSystem,entity,sourceKey,token);
  let id=existing??crypto.randomUUID();
  const at=(value:unknown)=>dateValue(value,data.__source_timezone);
  const day=(value:unknown)=>dayValue(value,data.__source_timezone);
  const write=async(table:string,value:Json)=>{if(existing){const{id:_ignored,...changes}=value;await patch(table,id,changes,token);}else await insert(table,value,token);};
  if(entity==="clients"){
    await write("clients",{id,organisation_id:org,branch_id:data.branch_id,crm_id:data.crm_id||`LEGACY-${id.slice(0,8).toUpperCase()}`,first_name:data.first_name,last_name:data.last_name,email:data.email,mobile:data.mobile,date_of_birth:day(data.date_of_birth),nationality:data.nationality,gender:data.gender,marital_status:optional(data.marital_status)?.toLowerCase(),country_of_birth:data.country_of_birth,current_country:data.current_country,preferred_language:data.preferred_language,passport_country:data.passport_country,passport_expiry:day(data.passport_expiry),address:{line1:data.address_line??null,city:data.city??null,state:data.state??null,postcode:data.postcode??null},source:"legacy_import",current_lifecycle:data.current_lifecycle||"enquiry",...(data.passport_number_encrypted?{passport_number_encrypted:data.passport_number_encrypted,passport_masked:data.passport_masked}:{}),custom_fields:{legacy_source_key:sourceKey,alternatePhone:data.alternate_phone??null,passportIssueDate:day(data.passport_issue_date??data.date_of_issue),legacy_data:data.legacy_data},created_at:at(data.created_at??data.created_date)??undefined,updated_at:at(data.updated_at??data.updated_date)??new Date().toISOString()});
  }else if(entity==="cases"){
    const clientId=await resolveLegacyReference(org,sourceSystem,"clients",required(data.client_source_key,"Client source key"),"clients","crm_id",token);
    const lifecycle=optional(data.lifecycle_stage)||"enquiry";
    const importedProgress=optional(data.progress);
    await write("cases",{id,organisation_id:org,client_id:clientId,branch_id:data.branch_id,case_number:data.case_number||sourceKey,service_type:data.service_type||"study_abroad",matter_type:optional(data.matter_type??data.visa_type??data.application_type),owner_id:validUuid(data.resolved_owner_id??data.owner_id),health:String(data.health??"").toLowerCase()==="critical"?"critical":"healthy",priority:optional(data.priority)||"medium",progress:importedProgress===null?lifecycleProgress(lifecycle):Math.min(100,Math.max(0,numberValue(importedProgress))),target:optional(data.target??data.country),next_action:optional(data.sub_status??data.enquiry_status??data.status),due_at:at(data.due_at??data.due_date),lifecycle_stage:lifecycle,visa_expiry_on:dayValue(data.visa_expiry_on??data.visa_expiry_date??data.current_visa_expiry??data.date_of_expiry,String(data.__source_timezone||"Australia/Melbourne")),opened_at:at(data.opened_at??data.created_at??data.created_date)??undefined,closed_at:at(data.closed_at??data.completed_at),outcome:optional(data.outcome),custom_fields:{legacy_source_key:sourceKey,mainStatus:optional(data.main_status),subStatus:optional(data.sub_status??data.enquiry_status),visaType:optional(data.visa_type),legacyCreatedBy:optional(data.created_by),legacyUpdatedBy:optional(data.updated_by),legacyAssignedBy:optional(data.assigned_by),legacyAssignedTo:optional(data.assigned_to),legacy_data:data.legacy_data}});
  }else if(entity==="applications"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    await write("education_applications",{id,organisation_id:org,case_id:caseId,institution:optional(data.institution??data.university)||"Not supplied",course:optional(data.course)||"Not supplied",campus:optional(data.campus),intake:optional(data.intake),application_reference:optional(data.application_reference??data.reference),status:optional(data.status)||"draft",submitted_at:at(data.submitted_at??data.submitted_on),offer_received_at:at(data.offer_received_at??data.offer_on),coe_received_at:at(data.coe_received_at??data.coe_on),deadline_at:at(data.deadline_at??data.deadline),created_at:at(data.created_at??data.created_date)??undefined,updated_at:at(data.updated_at??data.updated_date)??new Date().toISOString(),details:{legacy_source_key:sourceKey,country:optional(data.country??data.interested_country),apply_level:optional(data.apply_level??data.level),partner:data.partner??null,associate:data.associate??null,document_status:optional(data.document_status??data.doc_status),defer_intake:optional(data.defer_intake),defer_reason:optional(data.defer_reason),offer_letter:optional(data.offer_letter),coe:optional(data.coe??data.defer_coe),legacy_data:data.legacy_data}});
  }else if(entity==="visa_matters"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    await write("visa_matters",{id,organisation_id:org,case_id:caseId,destination_country:optional(data.destination_country??data.applied_country??data.country)||"Not supplied",visa_subclass:optional(data.visa_subclass??data.visa_type),visa_stream:optional(data.visa_stream??data.stream),lodgement_reference:optional(data.lodgement_reference??data.trn??data.reference),trn:optional(data.trn??data.lodgement_reference),responsible_agent_marn:optional(data.responsible_agent_marn??data.marn),bridging_visa:optional(data.bridging_visa),bridging_visa_granted_on:day(data.bridging_visa_granted_on),health_examination_status:optional(data.health_examination_status)||"not_started",biometrics_status:optional(data.biometrics_status)||"not_started",police_clearance_status:optional(data.police_clearance_status)||"not_started",skills_assessment_status:optional(data.skills_assessment_status)||"not_started",information_requested_at:at(data.information_requested_at),information_due_at:at(data.information_due_at),information_provided_at:at(data.information_provided_at),refusal_reason:optional(data.refusal_reason),visa_conditions:listValue(data.visa_conditions),status:optional(data.status??data.visa_status)||"assessment",agent_id:validUuid(data.resolved_owner_id??data.agent_id),lodged_at:at(data.lodged_at??data.lodged_on),decision_at:at(data.decision_at??data.decision_on),outcome:optional(data.outcome),current_visa_expiry:day(data.current_visa_expiry??data.visa_expiry),details:{legacy_source_key:sourceKey,university:optional(data.university),course:optional(data.course),intake:optional(data.intake),partner:optional(data.partner),document_status:optional(data.document_status??data.doc_status),legacy_data:data.legacy_data}});
  }else if(entity==="notes"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    const noteBody=required(data.body??data.note??data.remark,"Note");await write("case_notes",{id,organisation_id:org,case_id:caseId,author_id:validUuid(data.resolved_author_id??data.resolved_owner_id??data.author_id)||actor,body:noteBody,visibility:optional(data.visibility)||"case_team",created_at:at(data.created_at??data.created_date??data.date)||new Date().toISOString()});await saveLegacyActivity({org,caseId,sourceEntityType:"notes",sourceKey,eventType:"note",subject:"Legacy note",body:noteBody,actorLabel:optional(data.author??data.created_by??data.added_by),actorProfileId:validUuid(data.resolved_author_id),occurredAt:at(data.created_at??data.created_date??data.date),metadata:{legacy_data:data.legacy_data}},token);
  }else if(entity==="tasks"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    const completedAt=at(data.completed_at??data.completed_date);
    await write("tasks",{id,organisation_id:org,case_id:caseId,title:required(data.title??data.task,"Task title"),description:optional(data.description??data.details),task_type:optional(data.task_type??data.type)||"case_work",assigned_to:validUuid(data.resolved_owner_id??data.assigned_to),assigned_by:validUuid(data.resolved_assigned_by_id??data.assigned_by)||actor,priority:optional(data.priority)||"medium",status:normaliseTaskState(data.status),due_at:at(data.due_at??data.due_date),completed_at:completedAt,completed_by:completedAt?validUuid(data.resolved_completed_by_id??data.completed_by)||actor:null,created_at:at(data.created_at??data.created_date)??undefined,updated_at:at(data.updated_at??data.updated_date)??completedAt??new Date().toISOString()});
  }else if(entity==="appointments"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    const starts=at(data.starts_at??data.appointment_at??data.appointment_date_time??data.next_appointment_date_time??data.appointment_date);
    if(!starts)throw new InputError("Appointment date is required and must be valid.");
    await write("appointments",{id,organisation_id:org,case_id:caseId,owner_id:validUuid(data.resolved_owner_id??data.owner_id),title:optional(data.title??data.appointment_remarks??data.remarks)||"Legacy appointment",appointment_type:optional(data.appointment_type)||"Consultation",starts_at:starts,ends_at:at(data.ends_at)||new Date(new Date(starts).getTime()+60*60*1000).toISOString(),status:normaliseAppointmentState(data.status??data.appointment_status),requested_by:validUuid(data.resolved_requested_by_id??data.requested_by),responded_by:validUuid(data.resolved_responded_by_id??data.responded_by),responded_at:at(data.responded_at),response_note:optional(data.response_note??data.remarks??data.appointment_remarks),cancelled_at:at(data.cancelled_at),cancellation_reason:optional(data.cancellation_reason),created_at:at(data.created_at??data.created_date)??undefined});
  }else if(entity==="communications"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    const cases=await get(`cases?select=client_id,branch_id&id=eq.${caseId}&limit=1`,token) as Json[];
    const channel=String(data.channel??data.type??"email").toLowerCase();
    const direction=/inbound|received|incoming/.test(String(data.direction??data.status??"" ).toLowerCase())?"inbound":"outbound";
    if(channel.includes("whatsapp")||channel.includes("sms"))await write(channel.includes("sms")?"sms_messages":"whatsapp_messages",{id,organisation_id:org,branch_id:cases[0].branch_id,case_id:caseId,client_id:cases[0].client_id,direction,sender:optional(data.sender??data.from)||"Legacy CRM",recipient:optional(data.recipient??data.to)||"Legacy CRM",body:required(data.body??data.message??data.content,"Message"),template_name:optional(data.template_name??data.template),provider_message_id:optional(data.provider_message_id??data.message_id),delivery_state:normaliseDeliveryState(data.delivery_state??data.status,direction),provider_error:optional(data.provider_error??data.error),created_by:validUuid(data.resolved_owner_id)||actor,created_at:at(data.created_at??data.date)||new Date().toISOString(),sent_at:at(data.sent_at),received_at:at(data.received_at),attachments:jsonList(data.attachments??data.attachment),metadata:{legacy_source_key:sourceKey,legacy_channel:channel,legacy_data:data.legacy_data}});
    else {
      const existingMessages=existing?await get(`email_messages?select=thread_id&id=eq.${id}&limit=1`,token) as Json[]:[];
      const threadId=String(existingMessages[0]?.thread_id??crypto.randomUUID());
      const messageAt=at(data.sent_at??data.created_at??data.date);
      const threadValue={id:threadId,organisation_id:org,case_id:caseId,client_id:cases[0].client_id,provider_thread_id:optional(data.provider_thread_id??data.thread_id),subject:optional(data.subject)||"Legacy CRM communication",assigned_to:validUuid(data.resolved_owner_id),status:optional(data.thread_status)||"closed",awaiting_party:optional(data.awaiting_party),last_message_at:messageAt??new Date().toISOString()};
      if(existingMessages[0])await patch("email_threads",threadId,threadValue,token);else await insert("email_threads",threadValue,token);
      await write("email_messages",{id,organisation_id:org,thread_id:threadId,provider_message_id:optional(data.provider_message_id??data.message_id),sender:optional(data.sender??data.from)||"Legacy CRM",recipients:listValue(data.recipients??data.recipient??data.to),cc:listValue(data.cc),direction,body_preview:required(data.body_preview??data.body??data.message??data.content,"Message").slice(0,500),body_text:optional(data.body_text??data.body??data.message??data.content),body_html:optional(data.body_html??data.html),attachments:jsonList(data.attachments??data.attachment),sent_at:messageAt,delivery_state:normaliseDeliveryState(data.delivery_state??data.status,direction),created_by:validUuid(data.resolved_owner_id)||actor,created_at:at(data.created_at??data.date)??undefined,metadata:{legacy_source_key:sourceKey,legacy_data:data.legacy_data}});
    }
  }else if(entity==="documents"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    const cases=await get(`cases?select=client_id&id=eq.${caseId}&limit=1`,token) as Json[];
    await write("documents",{id,organisation_id:org,case_id:caseId,client_id:cases[0].client_id,document_type:optional(data.document_type??data.category??data.document_for)||"legacy_document",display_name:required(data.display_name??data.document_name??data.name??data.filename,"Document name"),state:normaliseDocumentState(data.state??data.status),drive_file_id:optional(data.drive_file_id),drive_folder_id:optional(data.drive_folder_id),mime_type:optional(data.mime_type),size_bytes:numberValue(data.size_bytes),version:Math.max(1,numberValue(data.version,1)),expires_on:day(data.expires_on??data.expiry_date),checksum:optional(data.checksum),created_at:at(data.created_at??data.uploaded_on??data.date)??undefined,metadata:{legacy_source_key:sourceKey,uploaded_by_label:optional(data.uploaded_by),source_path:optional(data.source_path??data.file_path),source_url:optional(data.source_url??data.file_url??data.url),original_name:optional(data.filename),legacy_data:data.legacy_data}});
    await saveFileManifest(data,{org,sourceSystem,sourceKey,caseId,clientId:String(cases[0].client_id),documentId:id,actor},token);
  }else if(entity==="invoices"){
    const clientId=await resolveLegacyReference(org,sourceSystem,"clients",required(data.client_source_key,"Client source key"),"clients","crm_id",token);
    const caseId=data.case_source_key?await resolveLegacyReference(org,sourceSystem,"cases",String(data.case_source_key),"cases","case_number",token):null;
    const subtotal=numberValue(data.subtotal??data.amount);const discount=numberValue(data.discount);const tax=numberValue(data.tax??data.gst);const total=numberValue(data.total,subtotal-discount+tax);
    await write("invoices",{id,organisation_id:org,client_id:clientId,case_id:caseId,invoice_number:optional(data.invoice_number??data.invoice_id??data.reference)||sourceKey,invoice_type:optional(data.invoice_type??data.service_type??data.type)||"professional_fee",currency:optional(data.currency)||"AUD",subtotal,discount,tax,total,paid:numberValue(data.paid??data.paid_amount),payment_method:optional(data.payment_method??data.payment_mode),description:optional(data.description??data.remarks),state:normaliseInvoiceState(data.state??data.status),issued_on:day(data.issued_on??data.invoice_date??data.date),due_on:day(data.due_on??data.due_date),created_by:validUuid(data.resolved_owner_id??data.created_by)||actor});
  }else if(entity==="payments"){
    const invoiceId=await resolveLegacyReference(org,sourceSystem,"invoices",required(data.invoice_source_key,"Invoice source key"),"invoices","invoice_number",token);
    const transactionType=/refund|reversal|credit/i.test(String(data.transaction_type??data.type??data.status??""))?"refund":"payment";await write("payments",{id,organisation_id:org,invoice_id:invoiceId,amount:numberValue(data.amount??data.paid_amount),currency:optional(data.currency)||"AUD",method:optional(data.method??data.payment_mode),reference:optional(data.reference??data.reference_number??data.cheque_number??data.order_number),external_reference:optional(data.external_reference??data.bank_reference),transaction_type:transactionType,paid_at:at(data.paid_at??data.payment_date??data.date)||new Date().toISOString(),recorded_by:validUuid(data.resolved_owner_id??data.recorded_by)||actor,reconciled_at:at(data.reconciled_at),description:optional(data.description),details:{bank_name:optional(data.bank_name),card_name:optional(data.card_name),cheque_number:optional(data.cheque_number),order_number:optional(data.order_number),outstanding_amount:numberValue(data.outstanding_amount),remaining_amount:numberValue(data.remaining_amount),legacy_data:data.legacy_data}});
  }else if(entity==="commission_claims"){
    const net=numberValue(data.net_amount??data.net_commission??data.commission_amount??data.amount);
    const taxRate=numberValue(data.tax_rate??data.tax_percent??data.tax_percentage);
    const tax=numberValue(data.tax_amount??data.tax,Math.round(net*taxRate)/100);
    const total=numberValue(data.total??data.total_commission,net+tax);
    const received=numberValue(data.received_amount??data.received);
    const caseLabels=String(data.case_source_keys??data.student_ids??data.client_ids??"").split(/[,;|]/).map(value=>value.trim()).filter(Boolean);
    const caseIds:string[]=[];
    for(const label of caseLabels)caseIds.push(await resolveLegacyReference(org,sourceSystem,"cases",label,"cases","case_number",token));
    await write("commission_claims",{id,organisation_id:org,branch_id:data.branch_id,counterparty_type:data.counterparty_type||"partner",partner_name:required(data.partner_name??data.partner??data.university??data.institution,"Partner or university"),institution:optional(data.institution),counterparty_email:optional(data.counterparty_email??data.email),invoice_number:optional(data.invoice_number??data.reference)||sourceKey,currency:optional(data.currency)||"AUD",net_amount:net,tax_rate:taxRate,tax_amount:tax,expected_amount:total,received_amount:received,status:received+0.001>=total?"received":received>0?"part_received":"expected",issued_on:day(data.issued_on??data.invoice_date??data.date),due_on:day(data.due_on??data.due_date),student_count:numberValue(data.student_count??data.number_of_students,caseIds.length),case_ids:caseIds,details:{legacy_source_key:sourceKey,legacy_data:data.legacy_data}});
  }else if(entity==="commission_payments"){
    const claimId=await resolveLegacyReference(org,sourceSystem,"commission_claims",required(data.commission_source_key,"Commission source key"),"commission_claims","invoice_number",token);
    const amount=numberValue(data.amount??data.received??data.payment_amount);
    await write("commission_payments",{id,organisation_id:org,claim_id:claimId,amount,currency:optional(data.currency)||"AUD",payment_reference:optional(data.payment_reference??data.reference),paid_at:at(data.paid_at??data.payment_date??data.date)||new Date().toISOString(),recorded_by:actor});
    const receipts=await get(`commission_receipts?select=id&payment_id=eq.${id}&limit=1`,token) as Json[];
    if(receipts[0]?.id)await patch("commission_receipts",String(receipts[0].id),{receipt_number:optional(data.receipt_number)||`LEGACY-CR-${sourceKey}`,issued_at:at(data.paid_at??data.payment_date??data.date)||new Date().toISOString()},token);
    else await insert("commission_receipts",{id:crypto.randomUUID(),organisation_id:org,payment_id:id,receipt_number:optional(data.receipt_number)||`LEGACY-CR-${sourceKey}`,issued_by:actor,issued_at:at(data.paid_at??data.payment_date??data.date)||new Date().toISOString()},token);
    const claims=await get(`commission_claims?select=expected_amount&id=eq.${claimId}&limit=1`,token) as Json[];
    const importedPayments=await get(`commission_payments?select=amount&claim_id=eq.${claimId}`,token) as Json[];
    const received=Math.round(importedPayments.reduce((sum,row)=>sum+numberValue(row.amount),0)*100)/100;
    await patch("commission_claims",claimId,{received_amount:received,status:received+0.001>=numberValue(claims[0]?.expected_amount)?"received":"part_received"},token);
  }else if(entity==="dependants"){
    const clientId=await resolveLegacyReference(org,sourceSystem,"clients",required(data.client_source_key,"Client source key"),"clients","crm_id",token);
    const passport=optional(data.passport_number??data.passport_no);const usablePassport=passport?.startsWith("[PROTECTED")?null:passport;await write("dependants",{id,organisation_id:org,client_id:clientId,relationship:optional(data.relationship??data.relation)||"dependant",full_name:required(data.full_name??data.name??data.dependant_name,"Dependant name"),date_of_birth:day(data.date_of_birth??data.dob),passport_number_encrypted:usablePassport?await protect(usablePassport):optional(data.passport_number_encrypted),details:{nationality:optional(data.nationality),gender:optional(data.gender),marital_status:optional(data.marital_status),passport_masked:usablePassport?mask(usablePassport):optional(data.passport_masked),passport_issue_date:day(data.passport_issue_date??data.date_of_issue),passport_expiry:day(data.passport_expiry??data.date_of_expiry),included_in_application:data.included_in_application??null,contact:optional(data.contact??data.mobile),legacy_data:data.legacy_data}});
  }else if(entity==="education_history"||entity==="employment_history"||entity==="test_results"||entity==="visa_history"){
    const clientId=await resolveLegacyReference(org,sourceSystem,"clients",required(data.client_source_key,"Client source key"),"clients","crm_id",token);
    if(entity==="education_history")await write("client_education_history",{id,organisation_id:org,client_id:clientId,country_code:optional(data.country_code??data.country),institution:optional(data.institution??data.school??data.college)||"Not supplied",qualification:optional(data.qualification??data.level)||"Not supplied",field_of_study:optional(data.field_of_study??data.subjects),started_on:day(data.started_on??data.start_date),completed_on:day(data.completed_on??data.end_date??data.year_passed),result:optional(data.result??data.grade??data.percentage),currently_studying:/yes|true|current/i.test(String(data.currently_studying??"")),details:{legacy_data:data.legacy_data}});
    if(entity==="employment_history")await write("client_employment_history",{id,organisation_id:org,client_id:clientId,employer:optional(data.employer??data.company_name)||"Not supplied",job_title:optional(data.job_title??data.position??data.designation)||"Not supplied",country_code:optional(data.country_code??data.country),started_on:day(data.started_on??data.start_date),ended_on:day(data.ended_on??data.end_date),currently_employed:/yes|true|current/i.test(String(data.currently_employed??"")),hours_per_week:numberValue(data.hours_per_week)||null,duties:optional(data.duties??data.main_duties),details:{legacy_data:data.legacy_data}});
    if(entity==="test_results")await write("english_tests",{id,organisation_id:org,client_id:clientId,test_type:optional(data.test_type??data.english_test)||"Not supplied",test_date:day(data.test_date??data.exam_date),overall:numberValue(data.overall??data.overall_score)||null,listening:numberValue(data.listening??data.listening_score)||null,reading:numberValue(data.reading??data.reading_score)||null,writing:numberValue(data.writing??data.writing_score)||null,speaking:numberValue(data.speaking??data.speaking_score)||null,reference_number:optional(data.reference_number),expires_on:day(data.expires_on??data.expiry_date),details:{legacy_data:data.legacy_data}});
    if(entity==="visa_history")await write("visa_history",{id,organisation_id:org,client_id:clientId,country_code:optional(data.country_code??data.country)||"Not supplied",visa_type:optional(data.visa_type??data.type)||"Not supplied",status:optional(data.status)||"unknown",applied_on:day(data.applied_on??data.application_date),granted_on:day(data.granted_on??data.grant_date),expires_on:day(data.expires_on??data.expiry_date),refusal_reason:optional(data.refusal_reason),reference_number:optional(data.reference_number??data.reference),details:{legacy_data:data.legacy_data}});
  }else if(entity==="study_preferences"){
    const clientId=await resolveLegacyReference(org,sourceSystem,"clients",required(data.client_source_key,"Client source key"),"clients","crm_id",token);const current=existing?[]:await get(`study_preferences?select=id&client_id=eq.${clientId}&limit=1`,token) as Json[];if(current[0]?.id)id=String(current[0].id);
    const value={id,organisation_id:org,client_id:clientId,destination_countries:listValue(data.destination_countries??data.countries??data.country),study_levels:listValue(data.study_levels??data.apply_level),fields_of_study:listValue(data.fields_of_study??data.course),preferred_institutions:listValue(data.preferred_institutions??data.university??data.institution),preferred_cities:listValue(data.preferred_cities??data.city),target_intakes:listValue(data.target_intakes??data.intake),annual_budget:numberValue(data.annual_budget??data.budget)||null,budget_currency:optional(data.budget_currency??data.currency)||"AUD",funding_source:optional(data.funding_source),accommodation_required:/yes|true|1/i.test(String(data.accommodation_required??"")),scholarship_required:/yes|true|1/i.test(String(data.scholarship_required??"")),notes:optional(data.notes??data.remarks),updated_at:at(data.updated_at??data.updated_date)??new Date().toISOString()};if(existing||current[0]?.id){const{ id:_ignored,...changes}=value;await patch("study_preferences",id,changes,token);}else await insert("study_preferences",value,token);
  }else if(["lifecycle_events","application_comments","visa_comments","task_comments","login_activity","activity_events"].includes(entity)){
    const caseId=data.case_source_key?await resolveLegacyReference(org,sourceSystem,"cases",String(data.case_source_key),"cases","case_number",token):null;
    await write("legacy_activity_events",{id,organisation_id:org,case_id:caseId,source_entity_type:entity,source_key:sourceKey,event_type:optional(data.event_type??data.action??data.status)||entity,subject:optional(data.subject??data.title),body:optional(data.body??data.comment??data.note??data.description),actor_label:optional(data.actor??data.created_by??data.updated_by??data.staff),actor_profile_id:validUuid(data.resolved_actor_id??data.resolved_owner_id),occurred_at:at(data.occurred_at??data.created_at??data.date),attachment_name:optional(data.attachment_name??data.filename),attachment_source:optional(data.attachment_source??data.file_path??data.url),metadata:{legacy_data:data.legacy_data}});
  }else if(entity==="payment_receipts"){
    const paymentId=await resolveLegacyReference(org,sourceSystem,"payments",required(data.payment_source_key,"Payment source key"),"payments","reference",token);await write("payment_receipts",{id,organisation_id:org,payment_id:paymentId,receipt_number:optional(data.receipt_number)||sourceKey,issued_by:validUuid(data.resolved_owner_id)||actor,issued_at:at(data.issued_at??data.date)??new Date().toISOString(),voided_at:at(data.voided_at)});
  }else if(entity==="finance_line_items"){
    const invoiceId=data.invoice_source_key?await resolveLegacyReference(org,sourceSystem,"invoices",String(data.invoice_source_key),"invoices","invoice_number",token):null;const claimId=data.commission_source_key?await resolveLegacyReference(org,sourceSystem,"commission_claims",String(data.commission_source_key),"commission_claims","invoice_number",token):null;const caseId=data.case_source_key?await resolveLegacyReference(org,sourceSystem,"cases",String(data.case_source_key),"cases","case_number",token):null;await write("legacy_finance_line_items",{id,organisation_id:org,source_system:sourceSystem,source_key:sourceKey,invoice_id:invoiceId,commission_claim_id:claimId,case_id:caseId,student_name:optional(data.student_name??data.name),contact_email:optional(data.email),contact_mobile:optional(data.mobile),course:optional(data.course),intake:optional(data.intake),tuition_fee:numberValue(data.tuition_fee??data.fee)||null,commission_rate:numberValue(data.commission_rate??data.percentage)||null,commission_amount:numberValue(data.commission_amount??data.amount)||null,metadata:{legacy_data:data.legacy_data}});
  }else if(entity==="campaigns"){
    await write("communication_campaigns",{id,organisation_id:org,branch_id:data.branch_id,created_by:validUuid(data.resolved_owner_id)||actor,name:required(data.name??data.campaign_name,"Campaign name"),channel:/whatsapp/i.test(String(data.channel))?"whatsapp":/sms/i.test(String(data.channel))?"sms":"email",subject:optional(data.subject),body:optional(data.body??data.message)||"Legacy campaign",audience_filter:isObject(data.audience_filter)?data.audience_filter:{legacy_data:data.legacy_data},status:normaliseCampaignState(data.status),scheduled_at:at(data.scheduled_at),launched_at:at(data.launched_at??data.sent_at),completed_at:at(data.completed_at),recipient_count:numberValue(data.recipient_count),sent_count:numberValue(data.sent_count),failed_count:numberValue(data.failed_count),created_at:at(data.created_at??data.date)??undefined,updated_at:at(data.updated_at)??new Date().toISOString()});
  }else if(entity==="campaign_recipients"){
    const campaignId=await resolveLegacyReference(org,sourceSystem,"campaigns",required(data.campaign_source_key,"Campaign source key"),"communication_campaigns","name",token);const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);const cases=await get(`cases?select=client_id&id=eq.${caseId}&limit=1`,token) as Json[];await write("campaign_recipients",{id,organisation_id:org,campaign_id:campaignId,case_id:caseId,client_id:cases[0].client_id,destination:optional(data.destination??data.email??data.mobile)||"Legacy destination",rendered_subject:optional(data.rendered_subject??data.subject),rendered_body:optional(data.rendered_body??data.body??data.message)||"Legacy message",status:normaliseRecipientState(data.status),provider_message_id:optional(data.provider_message_id??data.message_id),provider_error:optional(data.provider_error??data.error),sent_at:at(data.sent_at),created_at:at(data.created_at??data.date)??undefined});
  }else if(entity==="email_templates"){
    await write("content_templates",{id,organisation_id:org,name:required(data.name??data.title??data.subject,"Template title"),template_type:optional(data.template_type??data.type)||"email",subject:optional(data.subject),body:optional(data.body??data.content)||"Legacy template",version:Math.max(1,numberValue(data.version,1)),approval_status:/approve|active/i.test(String(data.status))?"approved":"draft",approved_by:/approve|active/i.test(String(data.status))?actor:null,updated_at:at(data.updated_at??data.date)??new Date().toISOString()});
  }else if(entity==="staff_history"){
    await write("legacy_staff_directory",{id,organisation_id:org,source_system:sourceSystem,source_key:sourceKey,display_name:required(data.display_name,"Staff name"),email:optional(data.email),mobile:optional(data.mobile??data.phone),branch_label:optional(data.branch??data.branch_name),role_label:optional(data.role??data.department),status:optional(data.status),target_profile_id:validUuid(data.target_profile_id),original_created_at:at(data.created_at),original_updated_at:at(data.updated_at),metadata:{legacy_data:data.legacy_data}});
  }else if(entity==="master_records"||entity==="standard_documents"){
    const category=entity==="standard_documents"?"standard_document":optional(data.category??data.type)||"legacy_master";await write("legacy_master_records",{id,organisation_id:org,source_system:sourceSystem,category,source_key:sourceKey,label:required(data.label??data.document_name??data.display_name??data.name??data.value,"Master label"),value:optional(data.value??data.description??data.body),status:optional(data.status),metadata:{legacy_data:data.legacy_data}});if(entity==="standard_documents")await saveFileManifest(data,{org,sourceSystem,sourceKey,actor,force:true},token);
  }else if(entity==="file_manifest"){
    const manifestId=await saveFileManifest(data,{org,sourceSystem,sourceKey,caseId:data.case_source_key?await resolveLegacyReference(org,sourceSystem,"cases",String(data.case_source_key),"cases","case_number",token):undefined,actor,force:true},token);if(manifestId)id=manifestId;
  }else throw new InputError("Unsupported legacy export type.");
  const external={organisation_id:org,source_system:sourceSystem,entity_type:entity,source_key:sourceKey,target_table:targetTable(entity),target_id:id,imported_by:actor,metadata:{legacy_data:data.legacy_data}};
  if(existing)await patch("legacy_external_keys",await externalKeyId(org,sourceSystem,entity,sourceKey,token),external,token);else await insert("legacy_external_keys",external,token);
  return id;
}

async function importLegacyCombined(entity:string,data:Json,org:string,sourceSystem:string,actor:string,token:string):Promise<string>{
  const sourceKey=required(data.source_key,"Source key");
  const existing=await externalTarget(org,sourceSystem,entity,sourceKey,token);
  const clientId=await importLegacyEntity("clients",data,org,sourceSystem,actor,token);
  const caseKey=`${sourceKey}:case`;
  const caseData:Json={...data,source_key:caseKey,client_source_key:sourceKey,case_number:data.case_number||sourceKey,service_type:data.service_type,lifecycle_stage:data.lifecycle_stage,owner_id:data.resolved_owner_id};
  const caseId=await importLegacyEntity("cases",caseData,org,sourceSystem,actor,token);
  const status=optional(data.status??data.enquiry_status??data.student_status??data.client_status)||"new";
  const existingEnquiries=await get(`enquiries?select=id&case_id=eq.${caseId}&limit=1`,token) as Json[];
  const enquiryValue={organisation_id:org,client_id:clientId,case_id:caseId,branch_id:data.branch_id,assigned_to:validUuid(data.resolved_owner_id??data.assigned_to),source:optional(data.source),campaign:optional(data.campaign??data.partner),priority:optional(data.priority)||"medium",status:status.toLowerCase().replace(/[^a-z0-9]+/g,"_"),score:Math.min(100,Math.max(0,numberValue(data.score))),next_follow_up_at:dateValue(data.next_follow_up_at??data.next_follow_up_date_time??data.next_follow_up_date??data.follow_up_date,String(data.__source_timezone||"Australia/Melbourne")),lost_reason:optional(data.lost_reason),converted_at:data.lifecycle_stage!=="enquiry"?dateValue(data.updated_at??data.updated_date,String(data.__source_timezone||"Australia/Melbourne"))??new Date().toISOString():null};
  if(existingEnquiries[0]?.id)await patch("enquiries",String(existingEnquiries[0].id),enquiryValue,token);else await insert("enquiries",{id:crypto.randomUUID(),...enquiryValue},token);
  const educationRows=rowList(data,["education_rows_json","educationrowsjson","education_history_json","education_history"]);const educationInstitution=optional(data.education_institution??data.college??data.board??data.school);const qualification=optional(data.qualification??data.highest_qualification??data.education_level);if(!educationRows.length&&(educationInstitution||qualification))educationRows.push({institution:educationInstitution,qualification,country:data.education_country??data.study_country,field_of_study:data.subjects??data.subject_stream??data.field_of_study??data.stream,started_on:data.education_start??data.started_on,completed_on:data.education_end??data.year_passed??data.year_of_passing,result:data.percentage??data.grade??data.result});for(const [index,item] of educationRows.entries())await importLegacyEntity("education_history",{...data,...item,source_key:`${sourceKey}:education:${index+1}`,client_source_key:sourceKey},org,sourceSystem,actor,token);
  const employmentRows=rowList(data,["employment_rows_json","employmentrowsjson","employment_history_json","employment_history"]);const employer=optional(data.company_name??data.employer??data.organization);const position=optional(data.position??data.job_title??data.designation);if(!employmentRows.length&&(employer||position))employmentRows.push({employer,job_title:position,country:data.employment_country??data.work_country,started_on:data.work_start_date??data.employment_start??data.started_on,ended_on:data.work_end_date??data.employment_end??data.ended_on,hours_per_week:data.hours_per_week,duties:data.duties??data.main_duties});for(const [index,item] of employmentRows.entries())await importLegacyEntity("employment_history",{...data,...item,source_key:`${sourceKey}:employment:${index+1}`,client_source_key:sourceKey},org,sourceSystem,actor,token);
  const testRows=rowList(data,["test_rows_json","testrowsjson","english_tests_json","test_results"]);const testType=optional(data.english_test??data.test_type??data.proficiency_test);if(!testRows.length&&testType)testRows.push({test_type:testType});for(const [index,item] of testRows.entries())await importLegacyEntity("test_results",{...data,...item,source_key:`${sourceKey}:test:${index+1}`,client_source_key:sourceKey},org,sourceSystem,actor,token);
  const dependantRows=rowList(data,["dependantrowsprotected","dependant_rows_json","dependantrowsjson","dependants_json","dependants"]);if(isObject(data.spouse_dependant)&&!dependantRows.some(item=>String(item.relationship).toLowerCase()==="spouse"))dependantRows.push(data.spouse_dependant);for(const [index,item] of dependantRows.entries())await importLegacyEntity("dependants",{...data,...item,source_key:`${sourceKey}:dependant:${index+1}`,client_source_key:sourceKey},org,sourceSystem,actor,token);
  if(entity==="study_records"&&(optional(data.interested_country??data.destination_country??data.country)||optional(data.university??data.institution??data.course)))await importLegacyEntity("study_preferences",{...data,source_key:`${sourceKey}:preferences`,client_source_key:sourceKey,destination_countries:data.interested_country??data.destination_country??data.country,study_levels:data.apply_level??data.study_level??data.qualification,preferred_institutions:data.university??data.institution,fields_of_study:data.course??data.interested_course,target_intakes:data.intake??data.suggested_intake,notes:data.preference_notes??data.remarks},org,sourceSystem,actor,token);
  const remark=optional(data.last_remark??data.remark??data.notes_remark??data.comment);
  if(remark)await importLegacyEntity("notes",{...data,source_key:`${sourceKey}:note`,case_source_key:caseKey,body:remark},org,sourceSystem,actor,token);
  const followUpAt=dateValue(data.next_follow_up_at??data.next_follow_up_date_time??data.next_follow_up_date??data.follow_up_date);
  if(followUpAt)await importLegacyEntity("tasks",{...data,source_key:`${sourceKey}:followup`,case_source_key:caseKey,title:`Legacy follow-up · ${data.first_name} ${data.last_name}`,description:remark,due_at:followUpAt},org,sourceSystem,actor,token);
  const appointmentAt=dateValue(data.next_appointment_at??data.next_appointment_date_time??data.appointment_date_time??data.appointment_date);
  if(appointmentAt)await importLegacyEntity("appointments",{...data,source_key:`${sourceKey}:appointment`,case_source_key:caseKey,starts_at:appointmentAt,title:optional(data.appointment_remarks)||`Legacy appointment · ${data.first_name} ${data.last_name}`},org,sourceSystem,actor,token);
  if(entity==="study_records"&&optional(data.university??data.institution)&&optional(data.course)){
    const appKey=`${sourceKey}:application`;
    await importLegacyEntity("applications",{...data,source_key:appKey,case_source_key:caseKey,institution:data.university??data.institution,course:data.course,intake:data.intake,partner:data.partner,associate:data.associate,deadline:data.deadline??data.deadline_date,status:data.application_status??data.status},org,sourceSystem,actor,token);
  }
  if(entity==="direct_visa_records"&&optional(data.visa_type??data.matter_type)){
    const visaKey=`${sourceKey}:visa`;
    await importLegacyEntity("visa_matters",{...data,source_key:visaKey,case_source_key:caseKey,destination_country:data.interested_country??data.country,visa_subclass:data.visa_type??data.matter_type,status:data.visa_status??data.status,current_visa_expiry:data.visa_expiry_date??data.date_of_expiry},org,sourceSystem,actor,token);
  }
  const external={organisation_id:org,source_system:sourceSystem,entity_type:entity,source_key:sourceKey,target_table:"cases",target_id:caseId,imported_by:actor,metadata:{client_id:clientId,legacy_data:data.legacy_data}};if(existing)await patch("legacy_external_keys",await externalKeyId(org,sourceSystem,entity,sourceKey,token),external,token);else await insert("legacy_external_keys",external,token);
  return caseId;
}

function targetTable(entity:string){return({study_records:"cases",direct_visa_records:"cases",clients:"clients",cases:"cases",applications:"education_applications",visa_matters:"visa_matters",notes:"case_notes",tasks:"tasks",appointments:"appointments",communications:"email_messages",documents:"documents",invoices:"invoices",payments:"payments",commission_claims:"commission_claims",commission_payments:"commission_payments",dependants:"dependants",education_history:"client_education_history",employment_history:"client_employment_history",test_results:"english_tests",study_preferences:"study_preferences",visa_history:"visa_history",lifecycle_events:"legacy_activity_events",application_comments:"legacy_activity_events",visa_comments:"legacy_activity_events",task_comments:"legacy_activity_events",payment_receipts:"payment_receipts",finance_line_items:"legacy_finance_line_items",campaigns:"communication_campaigns",campaign_recipients:"campaign_recipients",email_templates:"content_templates",standard_documents:"legacy_master_records",staff_history:"legacy_staff_directory",login_activity:"legacy_activity_events",activity_events:"legacy_activity_events",master_records:"legacy_master_records",file_manifest:"legacy_file_manifests"} as Record<string,string>)[entity]??"legacy_record_snapshots";}
function validUuid(value:unknown){const parsed=optional(value);return parsed&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)?parsed:null;}
function normaliseInvoiceState(value:unknown){const text=String(value??"").toLowerCase();if(/refund/.test(text))return"refunded";if(/void|cancel/.test(text))return"void";if(/part/.test(text))return"part_paid";if(/paid|received/.test(text))return"paid";if(/overdue/.test(text))return"overdue";if(/draft/.test(text))return"draft";return"issued";}
function normaliseDocumentState(value:unknown){const text=String(value??"").toLowerCase();if(/request|pending|missing/.test(text))return"requested";if(/reject|invalid|expired/.test(text))return"rejected";if(/verify|approve|complete/.test(text))return"verified";return"uploaded";}
function normaliseAppointmentState(value:unknown){const text=String(value??"").toLowerCase();if(/declin|reject/.test(text))return"declined";if(/cancel/.test(text))return"cancelled";if(/complete|attended|done/.test(text))return"completed";return"scheduled";}
function normaliseCampaignState(value:unknown){const text=String(value??"").toLowerCase();if(/cancel/.test(text))return"cancelled";if(/fail/.test(text))return"failed";if(/complete|sent/.test(text))return"completed";if(/run|progress/.test(text))return"running";if(/queue/.test(text))return"queued";if(/schedule/.test(text))return"scheduled";return"draft";}
function normaliseRecipientState(value:unknown){const text=String(value??"").toLowerCase();if(/cancel/.test(text))return"cancelled";if(/fail|bounce|error/.test(text))return"failed";if(/read|open/.test(text))return"read";if(/deliver/.test(text))return"delivered";if(/sent|send/.test(text))return"sent";return"queued";}
const SENSITIVE_LEGACY_KEYS=/(passport|password|secret|token|credential|bank_account|card_number|cvv|tax_file|tfn)/i;
function transformLegacyData(value:unknown,protecting:boolean,key=""):unknown{if(Array.isArray(value))return value.map(item=>transformLegacyData(item,protecting,key));if(isObject(value))return Object.fromEntries(Object.entries(value).map(([child,item])=>[child,transformLegacyData(item,protecting,child)]));const sensitive=SENSITIVE_LEGACY_KEYS.test(key);if(protecting)return sensitive?value:undefined;return sensitive&&value!==null&&value!==""?"[PROTECTED DURING IMPORT]":value;}
function redactLegacyData(value:Json):Json{return transformLegacyData(value,false) as Json;}
function extractSensitiveData(value:Json):Json{const walk=(item:unknown):unknown=>{if(Array.isArray(item)){const values=item.map(walk).filter(value=>value!==undefined);return values.length?values:undefined;}if(isObject(item)){const entries=Object.entries(item).map(([key,value])=>[key,SENSITIVE_LEGACY_KEYS.test(key)?value:walk(value)] as const).filter(([,value])=>value!==undefined);return entries.length?Object.fromEntries(entries):undefined;}return undefined;};return (walk(value) as Json | undefined)??{};}
function stableStringify(value:unknown):string{if(Array.isArray(value))return`[${value.map(stableStringify).join(",")}]`;if(isObject(value))return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;return JSON.stringify(value??null);}
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");}
async function externalTarget(org:string,sourceSystem:string,entity:string,sourceKey:string,token:string){const rows=await get(`legacy_external_keys?select=target_id&organisation_id=eq.${org}&source_system=eq.${encodeURIComponent(sourceSystem)}&entity_type=eq.${encodeURIComponent(entity)}&source_key=eq.${encodeURIComponent(sourceKey)}&limit=1`,token) as Json[];return rows[0]?.target_id?String(rows[0].target_id):null;}
async function externalKeyId(org:string,sourceSystem:string,entity:string,sourceKey:string,token:string){const rows=await get(`legacy_external_keys?select=id&organisation_id=eq.${org}&source_system=eq.${encodeURIComponent(sourceSystem)}&entity_type=eq.${encodeURIComponent(entity)}&source_key=eq.${encodeURIComponent(sourceKey)}&limit=1`,token) as Json[];return required(rows[0]?.id,"Legacy mapping");}
async function resolveLegacyReference(org:string,sourceSystem:string,entity:string,sourceKey:string,table:string,fallbackColumn:string,token:string){const mapped=await externalTarget(org,sourceSystem,entity,sourceKey,token);if(mapped)return mapped;const rows=await get(`${table}?select=id&${fallbackColumn}=eq.${encodeURIComponent(sourceKey)}&limit=1`,token) as Json[];if(rows[0]?.id)return String(rows[0].id);if(entity==="cases"){const clients=await get(`clients?select=id&crm_id=eq.${encodeURIComponent(sourceKey)}&limit=1`,token) as Json[];if(clients[0]?.id){const cases=await get(`cases?select=id&client_id=eq.${clients[0].id}&order=opened_at.desc&limit=1`,token) as Json[];if(cases[0]?.id)return String(cases[0].id);}}throw new InputError(`No imported ${entity.replace(/_/g," ")} record matches ${sourceKey}. Import the parent export first.`);}

// Branches can be addressed by code or name, so build a lookup once per batch.
async function branchLookup(requested: unknown, fallbackBranchId: string | null, token: string): Promise<BranchLookup> {
  const rows = await get("branches?select=id,code,name&active=eq.true&order=name.asc", token) as Array<{id:string;code:string;name:string}>;
  const byKey = new Map<string, string>();
  for (const row of rows) {
    if (row.code) byKey.set(String(row.code).trim().toLowerCase(), row.id);
    if (row.name) byKey.set(String(row.name).trim().toLowerCase(), row.id);
    byKey.set(String(row.id).toLowerCase(), row.id);
  }
  const asked = optional(requested);
  const chosen = asked
    ? (/^[0-9a-f-]{36}$/i.test(asked) ? asked : byKey.get(asked.toLowerCase()) ?? null)
    : null;
  return { byKey, fallback: chosen ?? fallbackBranchId ?? (rows.length === 1 ? rows[0].id : null) };
}
async function getAll(query:string,token:string){const all:Json[]=[];for(let offset=0;;offset+=1000){const separator=query.includes("?")?"&":"?";const page=await get(`${query}${separator}limit=1000&offset=${offset}`,token) as Json[];all.push(...page);if(page.length<1000)break;}return all;}
async function saveSnapshot(input:{org:string;sourceSystem:string;entityType:string;sourceKey:string;targetId:string;targetTable:string;displayData:Json;protectedData:string|null;sourceChecksum:string;actor:string},token:string){const query=`legacy_record_snapshots?select=id&organisation_id=eq.${input.org}&source_system=eq.${encodeURIComponent(input.sourceSystem)}&entity_type=eq.${encodeURIComponent(input.entityType)}&source_key=eq.${encodeURIComponent(input.sourceKey)}&limit=1`;const rows=await get(query,token) as Json[];const value={organisation_id:input.org,source_system:input.sourceSystem,entity_type:input.entityType,source_key:input.sourceKey,target_table:input.targetTable,target_id:input.targetId,display_data:input.displayData,protected_data:input.protectedData,source_checksum:input.sourceChecksum,imported_by:input.actor,updated_at:new Date().toISOString()};if(rows[0]?.id)await patch("legacy_record_snapshots",String(rows[0].id),value,token);else await insert("legacy_record_snapshots",{id:crypto.randomUUID(),...value},token);}
async function saveLegacyActivity(input:{org:string;caseId:string;sourceEntityType:string;sourceKey:string;eventType:string;subject:string;body:string;actorLabel:string|null;actorProfileId:string|null;occurredAt:string|null;metadata:Json},token:string){const query=`legacy_activity_events?select=id&organisation_id=eq.${input.org}&source_entity_type=eq.${encodeURIComponent(input.sourceEntityType)}&source_key=eq.${encodeURIComponent(input.sourceKey)}&limit=1`;const rows=await get(query,token) as Json[];const value={organisation_id:input.org,case_id:input.caseId,source_entity_type:input.sourceEntityType,source_key:input.sourceKey,event_type:input.eventType,subject:input.subject,body:input.body,actor_label:input.actorLabel,actor_profile_id:input.actorProfileId,occurred_at:input.occurredAt,metadata:input.metadata};if(rows[0]?.id)await patch("legacy_activity_events",String(rows[0].id),value,token);else await insert("legacy_activity_events",{id:crypto.randomUUID(),...value},token);}
async function saveFileManifest(data:Json,context:{org:string;sourceSystem:string;sourceKey:string;caseId?:string;clientId?:string;documentId?:string;actor:string;force?:boolean},token:string){const fileName=optional(data.file_name??data.filename??data.document_name??data.display_name??data.name);if(!fileName)return null;const sourcePath=optional(data.source_path??data.file_path);const sourceUrl=optional(data.source_url??data.file_url??data.url);const driveFile=optional(data.drive_file_id);const declaredFile=context.force||Boolean(sourcePath||sourceUrl||driveFile)||/upload|receiv|verif|approv|complete/i.test(String(data.state??data.status??""));if(!declaredFile)return null;const expected=optional(data.expected_checksum??data.checksum);const copied=optional(data.copied_checksum);const status=driveFile&&expected&&copied&&expected.toLowerCase()===copied.toLowerCase()?"verified":driveFile?"copied":optional(data.status)==="missing"?"missing":"pending";const query=`legacy_file_manifests?select=id&organisation_id=eq.${context.org}&source_system=eq.${encodeURIComponent(context.sourceSystem)}&source_key=eq.${encodeURIComponent(context.sourceKey)}&limit=1`;const rows=await get(query,token) as Json[];const value={organisation_id:context.org,source_system:context.sourceSystem,source_key:context.sourceKey,case_id:context.caseId??null,client_id:context.clientId??null,document_id:context.documentId??null,source_path:sourcePath,source_url:sourceUrl,file_name:fileName,mime_type:optional(data.mime_type),size_bytes:numberValue(data.size_bytes)||null,expected_checksum:expected,drive_file_id:driveFile,copied_checksum:copied,status,metadata:{imported_by:context.actor,legacy_data:data.legacy_data},verified_at:status==="verified"?new Date().toISOString():null};if(rows[0]?.id){await patch("legacy_file_manifests",String(rows[0].id),value,token);return String(rows[0].id);}const id=crypto.randomUUID();await insert("legacy_file_manifests",{id,...value},token);return id;}
async function reconcileBatch(batchId:string,org:string,sourceSystem:string,entityType:string,token:string){const [batchRows,snapshots,manifests]=await Promise.all([getAll(`import_rows?select=source_key,status,source_checksum&batch_id=eq.${batchId}&order=row_number.asc`,token),getAll(`legacy_record_snapshots?select=source_key,source_checksum&organisation_id=eq.${org}&source_system=eq.${encodeURIComponent(sourceSystem)}&entity_type=eq.${encodeURIComponent(entityType)}`,token),getAll(`legacy_file_manifests?select=source_key,status,file_name&organisation_id=eq.${org}&source_system=eq.${encodeURIComponent(sourceSystem)}`,token)]);const batches=await get(`import_batches?select=declared_rows,received_rows&id=eq.${batchId}`,token) as Json[];const expected=Number(batches[0]?.declared_rows??batchRows.length);const received=Number(batches[0]?.received_rows??batchRows.length);const imported=batchRows.filter(row=>row.status==="imported").length;const snapshotByKey=new Map(snapshots.map(row=>[String(row.source_key),String(row.source_checksum)]));const missingSnapshots=batchRows.filter(row=>snapshotByKey.get(String(row.source_key))!==String(row.source_checksum)).map(row=>row.source_key);const keys=new Set(batchRows.map(row=>String(row.source_key)));const pendingFiles=manifests.filter(row=>keys.has(String(row.source_key))&&row.status!=="verified").map(row=>({sourceKey:row.source_key,fileName:row.file_name,status:row.status}));const sourceChecksum=await sha256(batchRows.map(row=>String(row.source_checksum||"")).join("|"));const complete=expected===received&&received===imported&&!missingSnapshots.length&&!pendingFiles.length;const summary=complete?`Reconciled ${imported} of ${expected} source rows.`:`Reconciliation incomplete: expected ${expected}, received ${received}, imported ${imported}, missing snapshots ${missingSnapshots.length}, unverified files ${pendingFiles.length}. Copy and checksum every pending file, import its verified file manifest, then run reconciliation again.`;return{complete,summary,sourceChecksum,counts:{expected,received,imported,snapshots:batchRows.length-missingSnapshots.length},missingSnapshots:missingSnapshots.slice(0,100),pendingFiles:pendingFiles.slice(0,100)};}
function requireAdmin(role:string){if(role!=="super_admin"&&role!=="admin")throw new LiveAccessError(403,"Administrator access is required.");}
async function get(query:string,token:string){return supabaseRequest(`/rest/v1/${query}`,{method:"GET"},token);}
async function insert(table:string,value:Json|Json[],token:string){await supabaseRequest(`/rest/v1/${table}`,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(value)},token);}
async function patch(table:string,id:string,value:Json,token:string){await supabaseRequest(`/rest/v1/${table}?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(value)},token);}
function optional(value:unknown){if(typeof value==="string"&&value.trim())return value.trim();if(typeof value==="number"&&Number.isFinite(value))return String(value);return null;}
function required(value:unknown,label:string){const parsed=optional(value);if(!parsed)throw new InputError(`${label} is required.`);return parsed;}
function uuid(value:unknown,label:string){const parsed=required(value,label);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed))throw new InputError(`${label} is invalid.`);return parsed;}
function isObject(value:unknown):value is Json{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
class InputError extends Error{}
function apiError(error:unknown){if(error instanceof InputError)return Response.json({ok:false,error:error.message},{status:400});if(error instanceof ProtectedFieldError)return Response.json({ok:false,error:"Sensitive legacy fields cannot be imported until FIELD_ENCRYPTION_KEY is configured."},{status:503});if(error instanceof LiveAccessError)return Response.json({ok:false,error:error.message},{status:error.status});if(error instanceof SupabaseError)return Response.json({ok:false,error:"The database rejected the import operation."},{status:error.status>=400&&error.status<500?error.status:503});console.error(error);return Response.json({ok:false,error:"The import operation failed."},{status:500});}
