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
      const rows=Array.isArray(body.rows)?body.rows.filter(isObject).slice(0,5000):[];
      if(!rows.length)throw new InputError("Import rows are required.");
      const entityType=legacyEntity(body.entityType);
      const batchId=crypto.randomUUID();
      const branches=await branchLookup(body.branchId,session.identity.branchId,token);
      const normalized=await Promise.all(rows.map((row,index)=>normalizeRow(row,index+1,branches,entityType)));
      const invalid=normalized.filter(row=>row.errors.length);
      await insert("import_batches",{id:batchId,organisation_id:org,source_system:optional(body.sourceSystem)||"legacy_maximus",source_file_name:optional(body.fileName),status:invalid.length?"validating":"ready",total_rows:rows.length,valid_rows:rows.length-invalid.length,invalid_rows:invalid.length,mapping:{...(isObject(body.mapping)?body.mapping:{}),entity_type:entityType},started_by:session.identity.profileId,error_summary:invalid.length?`${invalid.length} rows require correction`:null},token);
      for(let offset=0;offset<normalized.length;offset+=200)await insert("import_rows",normalized.slice(offset,offset+200).map(row=>({id:crypto.randomUUID(),organisation_id:org,batch_id:batchId,row_number:row.rowNumber,source_key:row.sourceKey,raw_data:row.raw,normalized_data:row.normalized,validation_errors:row.errors,status:row.errors.length?"invalid":"valid"})),token);
      return Response.json({ok:true,batchId,total:rows.length,valid:rows.length-invalid.length,invalid:invalid.length,errors:invalid.slice(0,100).map(row=>({row:row.rowNumber,errors:row.errors}))});
    }
    if(action==="commit"){
      const batchId=uuid(body.batchId,"Batch");
      const batches=await get(`import_batches?select=*&id=eq.${batchId}&limit=1`,token) as Json[];
      if(!batches[0]||Number(batches[0].invalid_rows)>0)throw new InputError("Resolve all invalid rows before importing.");
      const rows=await get(`import_rows?select=id,row_number,normalized_data,status&batch_id=eq.${batchId}&status=eq.valid&order=row_number.asc`,token) as Json[];
      await patch("import_batches",batchId,{status:"importing"},token);
      const entityType=legacyEntity((isObject(batches[0].mapping)?batches[0].mapping:{}).entity_type);
      const sourceSystem=String(batches[0].source_system||"legacy_maximus");
      const staffRows=await get("profiles?select=id,email,display_name&active=eq.true&limit=1000",token) as Json[];
      const staffByLabel=new Map<string,string>();
      for(const profile of staffRows){const id=String(profile.id);for(const label of [profile.id,profile.email,profile.display_name]){const key=optional(label)?.toLowerCase();if(key)staffByLabel.set(key,id);}}
      let imported=0;
      for(const row of rows){
        const original=isObject(row.normalized_data)?row.normalized_data:{};
        const ownerLabel=optional(original.assigned_to??original.assigned_staff??original.case_officer??original.owner??original.owner_email);
        const data:Json={...original,resolved_owner_id:ownerLabel?staffByLabel.get(ownerLabel.toLowerCase())??validUuid(ownerLabel):null};
        const target=entityType==="study_records"||entityType==="direct_visa_records"
          ? await importLegacyCombined(entityType,data,org,sourceSystem,session.identity.profileId,token)
          : await importLegacyEntity(entityType,data,org,sourceSystem,session.identity.profileId,token);
        await patch("import_rows",String(row.id),{status:"imported",target_client_id:entityType==="clients"?target:null,target_record_id:target},token);
        imported+=1;
      }
      await patch("import_batches",batchId,{status:"completed",imported_rows:imported,completed_at:new Date().toISOString()},token);
      return Response.json({ok:true,imported});
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

async function normalizeRow(raw:Json,rowNumber:number,branches:BranchLookup,entityType:string){
  const errors:string[]=[];
  const combinedIdName=optional(raw.id_name);
  const combinedKey=combinedIdName?.match(/(?:MAX|CRM)[\/A-Z0-9-]+/i)?.[0]??combinedIdName?.split(/\s+/)[0];
  const sourceKey=optional(raw.source_key??raw.legacy_id??raw.id??raw.crm_id??raw.crmId??raw.student_id??raw.client_id??combinedKey);
  if(!sourceKey)errors.push("A stable legacy id/source_key is required");
  const branch=resolveRowBranch(raw,branches);
  if(["clients","cases","study_records","direct_visa_records","commission_claims"].includes(entityType)&&!branch)errors.push("No branch matched. Add a branch_code column, or choose a default branch for this import.");
  const safeRaw=redactLegacyData(raw);
  const normalized:Json={...safeRaw,source_key:sourceKey,branch_id:branch,legacy_data:safeRaw};
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
    }
  }else if(entityType==="cases"){
    normalized.client_source_key=optional(raw.client_source_key??raw.client_id??raw.student_id??raw.crm_id);
    normalized.case_number=optional(raw.case_number??raw.case_id??raw.reference)??sourceKey;
    normalized.service_type=normaliseService(raw.service_type??raw.service??raw.mode);
    normalized.lifecycle_stage=normaliseLifecycle(raw.lifecycle_stage??raw.stage??raw.status);
    if(!normalized.client_source_key)errors.push("client_source_key/client_id is required");
  }else if(["applications","visa_matters","notes","tasks","appointments","communications","documents"].includes(entityType)){
    normalized.case_source_key=optional(raw.case_source_key??raw.case_id??raw.case_number??raw.student_id??raw.client_id);
    if(!normalized.case_source_key)errors.push("case_source_key/case_id is required");
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
  }
  return{rowNumber,sourceKey,raw:safeRaw,errors,normalized};
}

const LEGACY_ENTITIES=["study_records","direct_visa_records","clients","cases","applications","visa_matters","notes","tasks","appointments","communications","documents","invoices","payments","commission_claims","commission_payments"] as const;
function legacyEntity(value:unknown){const parsed=optional(value)||"clients";if(!(LEGACY_ENTITIES as readonly string[]).includes(parsed))throw new InputError("Unsupported legacy export type.");return parsed;}
function normaliseLifecycle(value:unknown){const text=String(value??"").trim().toLowerCase();if(/complete|closed|processed|granted|approved/.test(text))return"completed";if(/defer|waiting/.test(text))return"deferred";if(/visa|lodg/.test(text))return"visa";if(/application|offer|coe|enrol/.test(text))return"application";if(/student|client|confirmed/.test(text))return"student";return"enquiry";}
function normaliseService(value:unknown){const text=String(value??"").trim().toLowerCase();return /direct|migration|immigration/.test(text)?"direct_visa":"study_abroad";}
function numberValue(value:unknown,fallback=0){const parsed=Number(String(value??"").replace(/[^0-9.-]/g,""));return Number.isFinite(parsed)?parsed:fallback;}
function dateValue(value:unknown){const parsed=optional(value);if(!parsed)return null;const local=parsed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/i);if(local){let hour=Number(local[4]||12);if(local[6]?.toUpperCase()==="PM"&&hour<12)hour+=12;if(local[6]?.toUpperCase()==="AM"&&hour===12)hour=0;return new Date(Date.UTC(Number(local[3]),Number(local[2])-1,Number(local[1]),hour,Number(local[5]||0))).toISOString();}const date=new Date(parsed);return Number.isNaN(date.getTime())?null:date.toISOString();}
function dayValue(value:unknown){return dateValue(value)?.slice(0,10)??null;}

async function importLegacyEntity(entity:string,data:Json,org:string,sourceSystem:string,actor:string,token:string):Promise<string>{
  const sourceKey=required(data.source_key,"Source key");
  const existing=await externalTarget(org,sourceSystem,entity,sourceKey,token);
  if(existing)return existing;
  const id=crypto.randomUUID();
  if(entity==="clients"){
    await insert("clients",{id,organisation_id:org,branch_id:data.branch_id,crm_id:data.crm_id||`LEGACY-${id.slice(0,8).toUpperCase()}`,first_name:data.first_name,last_name:data.last_name,email:data.email,mobile:data.mobile,date_of_birth:dayValue(data.date_of_birth),nationality:data.nationality,source:"legacy_import",current_lifecycle:data.current_lifecycle||"enquiry",...(data.passport_number_encrypted?{passport_number_encrypted:data.passport_number_encrypted,passport_masked:data.passport_masked}:{}),custom_fields:{legacy_source_key:sourceKey,legacy_data:data.legacy_data},updated_at:new Date().toISOString()},token);
  }else if(entity==="cases"){
    const clientId=await resolveLegacyReference(org,sourceSystem,"clients",required(data.client_source_key,"Client source key"),"clients","crm_id",token);
    await insert("cases",{id,organisation_id:org,client_id:clientId,branch_id:data.branch_id,case_number:data.case_number||sourceKey,service_type:data.service_type||"study_abroad",matter_type:optional(data.matter_type??data.visa_type??data.application_type),owner_id:validUuid(data.resolved_owner_id??data.owner_id),health:String(data.health??"").toLowerCase()==="critical"?"critical":"healthy",priority:optional(data.priority)||"medium",progress:Math.min(100,Math.max(0,numberValue(data.progress))),target:optional(data.target??data.country),due_at:dateValue(data.due_at??data.due_date),lifecycle_stage:data.lifecycle_stage||"enquiry",custom_fields:{legacy_source_key:sourceKey,legacy_data:data.legacy_data}},token);
  }else if(entity==="applications"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    await insert("education_applications",{id,organisation_id:org,case_id:caseId,institution:optional(data.institution??data.university)||"Not supplied",course:optional(data.course)||"Not supplied",campus:optional(data.campus),intake:optional(data.intake),application_reference:optional(data.application_reference??data.reference),status:optional(data.status)||"draft",submitted_at:dateValue(data.submitted_at??data.submitted_on),offer_received_at:dateValue(data.offer_received_at??data.offer_on),coe_received_at:dateValue(data.coe_received_at??data.coe_on),deadline_at:dateValue(data.deadline_at??data.deadline),details:{legacy_source_key:sourceKey,partner:data.partner??null,associate:data.associate??null,legacy_data:data.legacy_data}},token);
  }else if(entity==="visa_matters"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    await insert("visa_matters",{id,organisation_id:org,case_id:caseId,destination_country:optional(data.destination_country??data.applied_country??data.country)||"Not supplied",visa_subclass:optional(data.visa_subclass??data.visa_type),visa_stream:optional(data.visa_stream??data.stream),lodgement_reference:optional(data.lodgement_reference??data.trn??data.reference),status:optional(data.status??data.visa_status)||"assessment",agent_id:validUuid(data.agent_id),lodged_at:dateValue(data.lodged_at??data.lodged_on),decision_at:dateValue(data.decision_at??data.decision_on),outcome:optional(data.outcome),current_visa_expiry:dayValue(data.current_visa_expiry??data.visa_expiry),details:{legacy_source_key:sourceKey,legacy_data:data.legacy_data}},token);
  }else if(entity==="notes"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    await insert("case_notes",{id,organisation_id:org,case_id:caseId,author_id:validUuid(data.author_id)||actor,body:required(data.body??data.note??data.remark,"Note"),visibility:optional(data.visibility)||"case_team",created_at:dateValue(data.created_at??data.date)||new Date().toISOString()},token);
  }else if(entity==="tasks"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    await insert("tasks",{id,organisation_id:org,case_id:caseId,title:required(data.title??data.task,"Task title"),description:optional(data.description??data.details),assigned_to:validUuid(data.resolved_owner_id??data.assigned_to),assigned_by:actor,priority:optional(data.priority)||"medium",status:optional(data.status)||"open",due_at:dateValue(data.due_at??data.due_date),completed_at:dateValue(data.completed_at)},token);
  }else if(entity==="appointments"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    const starts=dateValue(data.starts_at??data.appointment_at??data.appointment_date_time??data.next_appointment_date_time??data.appointment_date);
    if(!starts)throw new InputError("Appointment date is required and must be valid.");
    await insert("appointments",{id,organisation_id:org,case_id:caseId,owner_id:validUuid(data.resolved_owner_id??data.owner_id),title:optional(data.title??data.appointment_remarks??data.remarks)||"Legacy appointment",appointment_type:optional(data.appointment_type)||"Consultation",starts_at:starts,ends_at:dateValue(data.ends_at)||new Date(new Date(starts).getTime()+60*60*1000).toISOString(),status:normaliseAppointmentState(data.status??data.appointment_status),response_note:optional(data.remarks??data.appointment_remarks)},token);
  }else if(entity==="communications"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    const cases=await get(`cases?select=client_id,branch_id&id=eq.${caseId}&limit=1`,token) as Json[];
    const channel=String(data.channel??data.type??"email").toLowerCase();
    const direction=/inbound|received|incoming/.test(String(data.direction??data.status??"" ).toLowerCase())?"inbound":"outbound";
    if(channel.includes("whatsapp")||channel.includes("sms"))await insert(channel.includes("sms")?"sms_messages":"whatsapp_messages",{id,organisation_id:org,branch_id:cases[0].branch_id,case_id:caseId,client_id:cases[0].client_id,direction,sender:optional(data.sender??data.from)||"Legacy CRM",recipient:optional(data.recipient??data.to)||"Legacy CRM",body:required(data.body??data.message??data.content,"Message"),delivery_state:direction==="inbound"?"received":"sent",created_by:actor,created_at:dateValue(data.created_at??data.date)||new Date().toISOString(),metadata:{legacy_source_key:sourceKey,legacy_channel:channel}},token);
    else {const threadId=crypto.randomUUID();await insert("email_threads",{id:threadId,organisation_id:org,case_id:caseId,client_id:cases[0].client_id,subject:optional(data.subject)||"Legacy CRM communication",assigned_to:validUuid(data.resolved_owner_id),status:"closed",last_message_at:dateValue(data.created_at??data.date)||new Date().toISOString()},token);await insert("email_messages",{id,organisation_id:org,thread_id:threadId,sender:optional(data.sender??data.from)||"Legacy CRM",recipients:[optional(data.recipient??data.to)].filter(Boolean),direction,body_preview:required(data.body??data.message??data.content,"Message"),sent_at:dateValue(data.sent_at??data.created_at??data.date),delivery_state:"imported",created_by:actor,metadata:{legacy_source_key:sourceKey}},token);}
  }else if(entity==="documents"){
    const caseId=await resolveLegacyReference(org,sourceSystem,"cases",required(data.case_source_key,"Case source key"),"cases","case_number",token);
    const cases=await get(`cases?select=client_id&id=eq.${caseId}&limit=1`,token) as Json[];
    await insert("documents",{id,organisation_id:org,case_id:caseId,client_id:cases[0].client_id,document_type:optional(data.document_type??data.category)||"legacy_document",display_name:required(data.display_name??data.document_name??data.name,"Document name"),state:normaliseDocumentState(data.state??data.status),drive_file_id:optional(data.drive_file_id),drive_folder_id:optional(data.drive_folder_id),mime_type:optional(data.mime_type),size_bytes:numberValue(data.size_bytes),metadata:{legacy_source_key:sourceKey,legacy_data:data.legacy_data}},token);
  }else if(entity==="invoices"){
    const clientId=await resolveLegacyReference(org,sourceSystem,"clients",required(data.client_source_key,"Client source key"),"clients","crm_id",token);
    const caseId=data.case_source_key?await resolveLegacyReference(org,sourceSystem,"cases",String(data.case_source_key),"cases","case_number",token):null;
    const subtotal=numberValue(data.subtotal??data.amount);const tax=numberValue(data.tax??data.gst);const total=numberValue(data.total,subtotal+tax);
    await insert("invoices",{id,organisation_id:org,client_id:clientId,case_id:caseId,invoice_number:optional(data.invoice_number??data.reference)||sourceKey,invoice_type:optional(data.invoice_type??data.type)||"professional_fee",currency:optional(data.currency)||"AUD",subtotal,tax,total,paid:numberValue(data.paid),state:normaliseInvoiceState(data.state??data.status),issued_on:dayValue(data.issued_on??data.date),due_on:dayValue(data.due_on??data.due_date),created_by:actor},token);
  }else if(entity==="payments"){
    const invoiceId=await resolveLegacyReference(org,sourceSystem,"invoices",required(data.invoice_source_key,"Invoice source key"),"invoices","invoice_number",token);
    await insert("payments",{id,organisation_id:org,invoice_id:invoiceId,amount:numberValue(data.amount),currency:optional(data.currency)||"AUD",method:optional(data.method),reference:optional(data.reference),paid_at:dateValue(data.paid_at??data.date)||new Date().toISOString(),recorded_by:actor},token);
  }else if(entity==="commission_claims"){
    const net=numberValue(data.net_amount??data.net_commission??data.commission_amount??data.amount);
    const taxRate=numberValue(data.tax_rate??data.tax_percent??data.tax_percentage);
    const tax=numberValue(data.tax_amount??data.tax,Math.round(net*taxRate)/100);
    const total=numberValue(data.total??data.total_commission,net+tax);
    const received=numberValue(data.received_amount??data.received);
    const caseLabels=String(data.case_source_keys??data.student_ids??data.client_ids??"").split(/[,;|]/).map(value=>value.trim()).filter(Boolean);
    const caseIds:string[]=[];
    for(const label of caseLabels)caseIds.push(await resolveLegacyReference(org,sourceSystem,"cases",label,"cases","case_number",token));
    await insert("commission_claims",{id,organisation_id:org,branch_id:data.branch_id,counterparty_type:data.counterparty_type||"partner",partner_name:required(data.partner_name??data.partner??data.university??data.institution,"Partner or university"),institution:optional(data.institution),counterparty_email:optional(data.counterparty_email??data.email),invoice_number:optional(data.invoice_number??data.reference)||sourceKey,currency:optional(data.currency)||"AUD",net_amount:net,tax_rate:taxRate,tax_amount:tax,expected_amount:total,received_amount:received,status:received+0.001>=total?"received":received>0?"part_received":"expected",issued_on:dayValue(data.issued_on??data.invoice_date??data.date),due_on:dayValue(data.due_on??data.due_date),student_count:numberValue(data.student_count??data.number_of_students,caseIds.length),case_ids:caseIds,details:{legacy_source_key:sourceKey,legacy_data:data.legacy_data}},token);
  }else if(entity==="commission_payments"){
    const claimId=await resolveLegacyReference(org,sourceSystem,"commission_claims",required(data.commission_source_key,"Commission source key"),"commission_claims","invoice_number",token);
    const amount=numberValue(data.amount??data.received??data.payment_amount);
    await insert("commission_payments",{id,organisation_id:org,claim_id:claimId,amount,currency:optional(data.currency)||"AUD",payment_reference:optional(data.payment_reference??data.reference),paid_at:dateValue(data.paid_at??data.payment_date??data.date)||new Date().toISOString(),recorded_by:actor},token);
    const receiptId=crypto.randomUUID();
    await insert("commission_receipts",{id:receiptId,organisation_id:org,payment_id:id,receipt_number:optional(data.receipt_number)||`LEGACY-CR-${sourceKey}`,issued_by:actor,issued_at:dateValue(data.paid_at??data.payment_date??data.date)||new Date().toISOString()},token);
    const claims=await get(`commission_claims?select=expected_amount&id=eq.${claimId}&limit=1`,token) as Json[];
    const importedPayments=await get(`commission_payments?select=amount&claim_id=eq.${claimId}`,token) as Json[];
    const received=Math.round(importedPayments.reduce((sum,row)=>sum+numberValue(row.amount),0)*100)/100;
    await patch("commission_claims",claimId,{received_amount:received,status:received+0.001>=numberValue(claims[0]?.expected_amount)?"received":"part_received"},token);
  }else throw new InputError("Unsupported legacy export type.");
  await insert("legacy_external_keys",{organisation_id:org,source_system:sourceSystem,entity_type:entity,source_key:sourceKey,target_table:targetTable(entity),target_id:id,imported_by:actor,metadata:{legacy_data:data.legacy_data}},token);
  return id;
}

async function importLegacyCombined(entity:string,data:Json,org:string,sourceSystem:string,actor:string,token:string):Promise<string>{
  const sourceKey=required(data.source_key,"Source key");
  const existing=await externalTarget(org,sourceSystem,entity,sourceKey,token);
  if(existing)return existing;
  const clientId=await importLegacyEntity("clients",data,org,sourceSystem,actor,token);
  const caseKey=`${sourceKey}:case`;
  const caseData:Json={...data,source_key:caseKey,client_source_key:sourceKey,case_number:data.case_number||sourceKey,service_type:data.service_type,lifecycle_stage:data.lifecycle_stage,owner_id:data.resolved_owner_id};
  const caseId=await importLegacyEntity("cases",caseData,org,sourceSystem,actor,token);
  const status=optional(data.status??data.enquiry_status??data.student_status??data.client_status)||"new";
  const existingEnquiries=await get(`enquiries?select=id&case_id=eq.${caseId}&limit=1`,token) as Json[];
  if(!existingEnquiries[0])await insert("enquiries",{id:crypto.randomUUID(),organisation_id:org,client_id:clientId,case_id:caseId,branch_id:data.branch_id,assigned_to:validUuid(data.resolved_owner_id??data.assigned_to),source:optional(data.source),campaign:optional(data.campaign??data.partner),priority:optional(data.priority)||"medium",status:status.toLowerCase().replace(/[^a-z0-9]+/g,"_"),score:Math.min(100,Math.max(0,numberValue(data.score))),next_follow_up_at:dateValue(data.next_follow_up_at??data.next_follow_up_date_time??data.next_follow_up_date??data.follow_up_date),lost_reason:optional(data.lost_reason),converted_at:data.lifecycle_stage!=="enquiry"?dateValue(data.updated_at??data.updated_date)??new Date().toISOString():null},token);
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
  await insert("legacy_external_keys",{organisation_id:org,source_system:sourceSystem,entity_type:entity,source_key:sourceKey,target_table:"cases",target_id:caseId,imported_by:actor,metadata:{client_id:clientId,legacy_data:data.legacy_data}},token);
  return caseId;
}

function targetTable(entity:string){return({clients:"clients",cases:"cases",applications:"education_applications",visa_matters:"visa_matters",notes:"case_notes",tasks:"tasks",appointments:"appointments",communications:"communications",documents:"documents",invoices:"invoices",payments:"payments",commission_claims:"commission_claims",commission_payments:"commission_payments"} as Record<string,string>)[entity];}
function validUuid(value:unknown){const parsed=optional(value);return parsed&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)?parsed:null;}
function normaliseInvoiceState(value:unknown){const text=String(value??"").toLowerCase();if(/refund/.test(text))return"refunded";if(/void|cancel/.test(text))return"void";if(/part/.test(text))return"part_paid";if(/paid|received/.test(text))return"paid";if(/overdue/.test(text))return"overdue";if(/draft/.test(text))return"draft";return"issued";}
function normaliseDocumentState(value:unknown){const text=String(value??"").toLowerCase();if(/request|pending|missing/.test(text))return"requested";if(/reject|invalid|expired/.test(text))return"rejected";if(/verify|approve|complete/.test(text))return"verified";return"uploaded";}
function normaliseAppointmentState(value:unknown){const text=String(value??"").toLowerCase();if(/declin|reject/.test(text))return"declined";if(/cancel/.test(text))return"cancelled";if(/complete|attended|done/.test(text))return"completed";return"scheduled";}
const SENSITIVE_LEGACY_KEYS=/(passport|password|secret|token|credential|bank_account|card_number|cvv|tax_file|tfn)/i;
function redactLegacyData(value:Json):Json{const redacted:Json={};for(const [key,item] of Object.entries(value)){redacted[key]=SENSITIVE_LEGACY_KEYS.test(key)?"[PROTECTED DURING IMPORT]":item;}return redacted;}
async function externalTarget(org:string,sourceSystem:string,entity:string,sourceKey:string,token:string){const rows=await get(`legacy_external_keys?select=target_id&organisation_id=eq.${org}&source_system=eq.${encodeURIComponent(sourceSystem)}&entity_type=eq.${encodeURIComponent(entity)}&source_key=eq.${encodeURIComponent(sourceKey)}&limit=1`,token) as Json[];return rows[0]?.target_id?String(rows[0].target_id):null;}
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
function requireAdmin(role:string){if(role!=="super_admin"&&role!=="admin")throw new LiveAccessError(403,"Administrator access is required.");}
async function get(query:string,token:string){return supabaseRequest(`/rest/v1/${query}`,{method:"GET"},token);}
async function insert(table:string,value:Json|Json[],token:string){await supabaseRequest(`/rest/v1/${table}`,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(value)},token);}
async function patch(table:string,id:string,value:Json,token:string){await supabaseRequest(`/rest/v1/${table}?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(value)},token);}
function optional(value:unknown){return typeof value==="string"&&value.trim()?value.trim():null;}
function required(value:unknown,label:string){const parsed=optional(value);if(!parsed)throw new InputError(`${label} is required.`);return parsed;}
function uuid(value:unknown,label:string){const parsed=required(value,label);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed))throw new InputError(`${label} is invalid.`);return parsed;}
function isObject(value:unknown):value is Json{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
class InputError extends Error{}
function apiError(error:unknown){if(error instanceof InputError)return Response.json({ok:false,error:error.message},{status:400});if(error instanceof ProtectedFieldError)return Response.json({ok:false,error:"Sensitive legacy fields cannot be imported until FIELD_ENCRYPTION_KEY is configured."},{status:503});if(error instanceof LiveAccessError)return Response.json({ok:false,error:error.message},{status:error.status});if(error instanceof SupabaseError)return Response.json({ok:false,error:"The database rejected the import operation."},{status:error.status>=400&&error.status<500?error.status:503});console.error(error);return Response.json({ok:false,error:"The import operation failed."},{status:500});}
