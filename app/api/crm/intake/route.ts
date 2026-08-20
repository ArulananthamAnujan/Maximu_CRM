import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const requested = new URL(request.url).searchParams.get("clientId");
    const clientId = requested || await ownClientId(session.identity.profileId, session.accessToken);
    if (!clientId) return Response.json({ ok: true, intake: null, completeness: 0 });
    const token = session.accessToken;
    const [client, education, employment, tests, preferences, visas, declarations, agreements, completeness] = await Promise.all([
      get(`clients?select=*&id=eq.${uuid(clientId,"Client")}&limit=1`, token),
      get(`client_education_history?select=*&client_id=eq.${clientId}&order=started_on.desc`, token),
      get(`client_employment_history?select=*&client_id=eq.${clientId}&order=started_on.desc`, token),
      get(`english_tests?select=*&client_id=eq.${clientId}&order=test_date.desc`, token),
      get(`study_preferences?select=*&client_id=eq.${clientId}&limit=1`, token),
      get(`visa_history?select=*&client_id=eq.${clientId}&order=applied_on.desc`, token),
      get(`client_declarations?select=*&client_id=eq.${clientId}&order=declaration_type.asc`, token),
      get(`service_agreements?select=*&client_id=eq.${clientId}&order=created_at.desc`, token),
      rpc("client_intake_completeness", { target_client: clientId }, token),
    ]);
    return appendRefreshCookies(Response.json({ ok: true, intake: { client: asRows(client)[0] || null, education, employment, tests, preferences: asRows(preferences)[0] || null, visas, declarations, agreements }, completeness: Number(completeness || 0) }), session.refreshed);
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    const body = await request.json() as Json;
    const action = required(body.action, "Action");
    const token = session.accessToken;
    const org = session.identity.organisationId;
    const linked = await ownClientId(session.identity.profileId, token);
    const clientId = uuid(body.clientId || linked, "Client");
    if (session.identity.role === "client" && clientId !== linked) throw new LiveAccessError(403, "You can only update your own intake.");

    if (action === "personal") {
      const allowed = ["title","gender","marital_status","country_of_birth","current_country","passport_country","preferred_language"];
      const changes: Json = {};
      for (const key of allowed) if (key in body) changes[key] = optional(body[key]);
      if ("email" in body) changes.email = validEmail(body.email);
      if ("mobile" in body) changes.mobile = optional(body.mobile);
      if ("dateOfBirth" in body) changes.date_of_birth = validDate(body.dateOfBirth);
      if ("passportExpiry" in body) changes.passport_expiry = validDate(body.passportExpiry);
      if (isObject(body.address)) changes.address = cleanObject(body.address);
      if (isObject(body.emergencyContact)) changes.emergency_contact = cleanObject(body.emergencyContact);
      if (typeof body.marketingConsent === "boolean") changes.marketing_consent = body.marketingConsent;
      if (body.privacyConsent === true) changes.privacy_consent_at = new Date().toISOString();
      changes.updated_at = new Date().toISOString();
      await patch("clients", clientId, changes, token);
    } else if (action === "education") {
      await insert("client_education_history", { id: crypto.randomUUID(), organisation_id: org, client_id: clientId, country_code: optional(body.countryCode), institution: required(body.institution,"Institution"), qualification: required(body.qualification,"Qualification"), field_of_study: optional(body.fieldOfStudy), started_on: validDate(body.startedOn), completed_on: validDate(body.completedOn), result: optional(body.result), currently_studying: body.currentlyStudying === true, details: isObject(body.details) ? cleanObject(body.details) : {} }, token);
    } else if (action === "employment") {
      await insert("client_employment_history", { id: crypto.randomUUID(), organisation_id: org, client_id: clientId, employer: required(body.employer,"Employer"), job_title: required(body.jobTitle,"Job title"), country_code: optional(body.countryCode), started_on: validDate(body.startedOn), ended_on: validDate(body.endedOn), currently_employed: body.currentlyEmployed === true, hours_per_week: optionalNumber(body.hoursPerWeek), duties: optional(body.duties), details: isObject(body.details) ? cleanObject(body.details) : {} }, token);
    } else if (action === "english_test") {
      await insert("english_tests", { id: crypto.randomUUID(), organisation_id: org, client_id: clientId, test_type: required(body.testType,"Test type"), test_date: validDate(body.testDate), overall: optionalNumber(body.overall), listening: optionalNumber(body.listening), reading: optionalNumber(body.reading), writing: optionalNumber(body.writing), speaking: optionalNumber(body.speaking), reference_number: optional(body.referenceNumber), expires_on: validDate(body.expiresOn), details: isObject(body.details) ? cleanObject(body.details) : {} }, token);
    } else if (action === "study_preferences") {
      await insert("study_preferences", { id: crypto.randomUUID(), organisation_id: org, client_id: clientId, destination_countries: stringList(body.destinationCountries), study_levels: stringList(body.studyLevels), fields_of_study: stringList(body.fieldsOfStudy), preferred_institutions: stringList(body.preferredInstitutions), preferred_cities: stringList(body.preferredCities), target_intakes: stringList(body.targetIntakes), annual_budget: optionalNumber(body.annualBudget), budget_currency: optional(body.budgetCurrency) || "AUD", funding_source: optional(body.fundingSource), accommodation_required: optionalBoolean(body.accommodationRequired), scholarship_required: optionalBoolean(body.scholarshipRequired), notes: optional(body.notes), updated_at: new Date().toISOString() }, token, "resolution=merge-duplicates,return=minimal");
    } else if (action === "visa_history") {
      await insert("visa_history", { id: crypto.randomUUID(), organisation_id: org, client_id: clientId, country_code: required(body.countryCode,"Country"), visa_type: required(body.visaType,"Visa type"), status: required(body.status,"Status"), applied_on: validDate(body.appliedOn), granted_on: validDate(body.grantedOn), expires_on: validDate(body.expiresOn), refusal_reason: optional(body.refusalReason), reference_number: optional(body.referenceNumber), details: isObject(body.details) ? cleanObject(body.details) : {} }, token);
    } else if (action === "declaration") {
      await insert("client_declarations", { id: crypto.randomUUID(), organisation_id: org, client_id: clientId, declaration_type: slug(body.declarationType,"Declaration"), response: optionalBoolean(body.response), details: optional(body.details), declared_by: session.identity.profileId, declared_at: new Date().toISOString() }, token, "resolution=merge-duplicates,return=minimal");
    } else if (action === "agreement") {
      if (session.identity.role === "client") throw new LiveAccessError(403,"Only staff can prepare service agreements.");
      await insert("service_agreements", { id: crypto.randomUUID(), organisation_id: org, client_id: clientId, case_id: optionalUuid(body.caseId), agreement_type: required(body.agreementType,"Agreement type"), version: required(body.version,"Version"), status: "draft", terms_snapshot: isObject(body.terms) ? cleanObject(body.terms) : {}, created_by: session.identity.profileId }, token);
    } else throw new InputError("Unsupported intake action.");

    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed);
  } catch (error) { return apiError(error); }
}

async function ownClientId(profileId: string, token: string) { const rows = await get(`client_user_links?select=client_id&profile_id=eq.${profileId}&limit=1`, token) as Array<{client_id:string}>; return rows[0]?.client_id || null; }
async function get(query: string, token: string) { return supabaseRequest(`/rest/v1/${query}`, { method:"GET" }, token); }
async function rpc(name: string, body: Json, token: string) { return supabaseRequest(`/rest/v1/rpc/${name}`, { method:"POST", body:JSON.stringify(body) }, token); }
async function insert(table: string, value: Json, token: string, prefer="return=minimal") { await supabaseRequest(`/rest/v1/${table}`, { method:"POST", headers:{Prefer:prefer}, body:JSON.stringify(value) }, token); }
async function patch(table: string, id: string, value: Json, token: string) { await supabaseRequest(`/rest/v1/${table}?id=eq.${id}`, { method:"PATCH", headers:{Prefer:"return=minimal"}, body:JSON.stringify(value) }, token); }
function asRows(value: unknown): Json[] { return Array.isArray(value) ? value as Json[] : []; }
function optional(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function required(value: unknown,label:string) { const parsed=optional(value); if(!parsed) throw new InputError(`${label} is required.`); return parsed; }
function uuid(value: unknown,label:string) { const parsed=required(value,label); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw new InputError(`${label} is invalid.`); return parsed; }
function optionalUuid(value:unknown){const parsed=optional(value);return parsed?uuid(parsed,"Identifier"):null;}
function validEmail(value:unknown){const parsed=optional(value);if(!parsed)return null;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed))throw new InputError("Email is invalid.");return parsed.toLowerCase();}
function validDate(value:unknown){const parsed=optional(value);if(!parsed)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(parsed)||Number.isNaN(Date.parse(`${parsed}T00:00:00Z`)))throw new InputError("Date is invalid.");return parsed;}
function optionalNumber(value:unknown){if(value===null||value===undefined||value==="")return null;const parsed=Number(value);if(!Number.isFinite(parsed))throw new InputError("Number is invalid.");return parsed;}
function optionalBoolean(value:unknown){return typeof value==="boolean"?value:null;}
function stringList(value:unknown){return Array.isArray(value)?value.map(optional).filter((item):item is string=>Boolean(item)).slice(0,50):[];}
function slug(value:unknown,label:string){return required(value,label).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");}
function isObject(value:unknown):value is Json{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function cleanObject(value:Json){return Object.fromEntries(Object.entries(value).filter(([key,item])=>/^[a-zA-Z0-9_ -]{1,80}$/.test(key)&&["string","number","boolean"].includes(typeof item)));}
class InputError extends Error{}
function apiError(error:unknown):Response{if(error instanceof InputError)return Response.json({ok:false,error:error.message},{status:400});if(error instanceof LiveAccessError)return Response.json({ok:false,error:error.message},{status:error.status});if(error instanceof SupabaseError)return Response.json({ok:false,error:"The database rejected this intake action."},{status:error.status>=400&&error.status<500?error.status:503});console.error(error);return Response.json({ok:false,error:"The intake action could not be completed."},{status:500});}
