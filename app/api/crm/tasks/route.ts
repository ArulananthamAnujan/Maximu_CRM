import {appendRefreshCookies,liveSession,LiveAccessError} from "@/server/supabase-session";
import {supabaseRequest,supabasePageRequest,SupabaseError} from "@/server/supabase";
export const dynamic="force-dynamic";
type Row=Record<string,unknown>;
const uuid=(value:unknown)=>{if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new Error("Choose a valid record.");return value;};
function fail(error:unknown){
 if(error instanceof LiveAccessError)return Response.json({ok:false,error:error.message},{status:error.status});
 if(error instanceof SupabaseError){let detail:{code?:string;message?:string}={};try{detail=JSON.parse(error.message);}catch{}return Response.json({ok:false,error:detail.message||"Task could not be saved. Refresh and try again."},{status:detail.code==="40001"?409:detail.code==="42501"?403:400});}
 return Response.json({ok:false,error:error instanceof Error?error.message:"Task could not be loaded."},{status:400});
}
export async function GET(request:Request){try{
 const session=await liveSession(request);if(session.identity.role==="client")throw new LiveAccessError(403,"Tasks are for staff.");
 const p=new URL(request.url).searchParams,token=session.accessToken,page=Math.max(1,Math.min(100000,Number(p.get("page"))||1));
 if(p.has("taskId")){const comments=await supabasePageRequest<Row[]>(`/rest/v1/task_comments?select=*&task_id=eq.${uuid(p.get("taskId"))}&order=created_at.asc,id.asc&limit=50&offset=${(page-1)*50}`,{},token);return appendRefreshCookies(Response.json({ok:true,...comments}),session.refreshed,request);}
 const base=new URLSearchParams();if(p.get("caseId"))base.set("case_id",`eq.${uuid(p.get("caseId"))}`);
 const q=new URLSearchParams(base);q.set("select","*");q.set("order","created_at.desc,id.desc");q.set("limit","50");q.set("offset",String((page-1)*50));
 const status=p.get("status");if(status==="open"||status==="completed")q.set("status",`eq.${status}`);
 if(status==="overdue"){q.set("status","eq.open");q.set("due_at",`lt.${new Date().toISOString()}`);}
 if(["low","medium","high","critical"].includes(p.get("priority")||""))q.set("priority",`eq.${p.get("priority")}`);
 if(p.get("assignedTo"))q.set("assigned_to",`eq.${uuid(p.get("assignedTo"))}`);
 if(p.get("type")==="mine")q.set("assigned_to",`eq.${session.identity.profileId}`);
 if(p.get("type")==="self"){q.set("assigned_to",`eq.${session.identity.profileId}`);q.set("created_by",`eq.${session.identity.profileId}`);}
 const search=(p.get("search")||"").replace(/[%_*\\]/g,"").slice(0,200).trim();if(search)q.set("title",`ilike.*${search}*`);
 for(const [key,column,end] of [["createdFrom","created_at",false],["createdTo","created_at",true],["dueFrom","due_at",false],["dueTo","due_at",true]] as const){const value=p.get(key);if(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const date=new Date(`${value}T00:00:00Z`);if(!Number.isNaN(date.getTime())){if(end)date.setUTCDate(date.getUTCDate()+1);q.append(column,`${end?"lt":"gte"}.${date.toISOString()}`);}}}
 const [result,staff,counts]=await Promise.all([
 supabasePageRequest<Row[]>(`/rest/v1/tasks?${q}`,{},token),
 supabaseRequest<Row[]>("/rest/v1/profiles?select=id,display_name,branch_id,active,level,function_access&level=neq.student&order=display_name.asc",{},token),
 Promise.all(["all","open","completed","overdue"].map(async key=>{const c=new URLSearchParams(base);c.set("select","id");c.set("limit","1");if(key!=="all")c.set("status",`eq.${key==="overdue"?"open":key}`);if(key==="overdue")c.set("due_at",`lt.${new Date().toISOString()}`);return [key,(await supabasePageRequest<Row[]>(`/rest/v1/tasks?${c}`,{},token)).count??0];})),
 ]);
 return appendRefreshCookies(Response.json({ok:true,...result,counts:Object.fromEntries(counts),staff,profileId:session.identity.profileId}),session.refreshed,request);
 }catch(error){return fail(error);}}
export async function POST(request:Request){try{
 const session=await liveSession(request);if(session.identity.role==="client")throw new LiveAccessError(403,"Tasks are for staff.");
 const b=await request.json() as Row;let result;
 if(b.action==="bulk")result=await supabaseRequest("/rest/v1/rpc/task_bulk_action",{method:"POST",body:JSON.stringify({p_items:b.items,p_operation:b.operation,p_assignee:b.assignedTo||null})},session.accessToken);
 else {if(!["create","edit","status","delete","comment"].includes(String(b.action)))throw new Error("Unknown task action.");result=await supabaseRequest("/rest/v1/rpc/task_action",{method:"POST",body:JSON.stringify({p_action:b.action,p_id:uuid(b.id),p_values:b.values??{},p_expected:b.expected??null})},session.accessToken);}
 return appendRefreshCookies(Response.json({ok:true,result}),session.refreshed,request);
 }catch(error){return fail(error);}}
