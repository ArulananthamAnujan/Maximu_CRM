import {canUse,canUseAny,caseFunctions,stageFunction,type AccessIdentity} from "@/lib/function-access";
export async function deniedFunction(request:Request,identity:AccessIdentity):Promise<boolean> {
 if(identity.role==="super_admin"||identity.role==="client")return false;
 const url=new URL(request.url),path=url.pathname;
 if(path.startsWith("/api/auth/gmail/"))return !canUseAny(identity,["communications"]);
 if(path.startsWith("/api/auth/calendar/"))return !canUseAny(identity,["calendar"]);
 if(!path.startsWith("/api/crm/"))return false;
 const body = request.method === "GET" || request.method === "HEAD" ? {} : await request.clone().json().catch(()=>({})) as Record<string,unknown>;
 const action=String(body.action??""), operation=String(body.operation??"");
 if(action === "transfer_branch") return !canUse(identity,"action_transfer_branch");
 const deleting=request.method==="DELETE" || ["delete","archive","remove_staff","remove_client_account","delete_invitation"].includes(action) || ["delete","archive"].includes(operation);
 if(deleting && (!canUse(identity,"action_delete") || ((action.startsWith("bulk") || Array.isArray(body.ids) || Array.isArray(body.items)) && !canUse(identity,"action_bulk_delete"))))return true;
 if((["assign","bulk_assign","add_collaborator","remove_collaborator"].includes(action) || operation==="assign") && !canUse(identity,"action_assign"))return true;
 if((action==="record_export" || url.searchParams.get("export")==="true") && !canUse(identity,"action_export"))return true;
 if(path.includes("/whatsapp") && !canUse(identity,"whatsapp"))return true;
 if(action==="create_staff" && body.level==="partner" && !canUse(identity,"partner_access"))return true;
 let channel:string|null=null;
 if(action==="message")channel=String(body.channel||"email");
 if(action==="send_message" || (request.method==="POST" && /\/(sms|whatsapp)$/.test(path)))channel=path.endsWith("/whatsapp")?"whatsapp":path.endsWith("/sms")?"sms":"email";
 if(["send_portal_access","queue_overdue_reminder","send_commission_invoice","send_commission_receipt"].includes(action))channel="email";
 if(path.endsWith("/campaigns") && action==="create")channel=String(body.channel||"email");
 if(channel && (!canUse(identity,`action_send_${channel}`) || (channel==="whatsapp" && !canUse(identity,"whatsapp"))))return true;
 const route=path.slice(9).split("/")[0],common=[...caseFunctions,"work","documents","finance","communications","calendar"];
 let required:string[]=[];
 if(["workspace","casefile","operations"].includes(route)) {
  if(request.method==="GET") {
   if(route==="workspace")return false;
   if(route==="casefile")required=common;
   else {const view=url.searchParams.get("view")||"notifications";if(view==="notifications")return false;
    required=({checklist:["documents"],notes:caseFunctions,integrations:["integrations"],report:["reports"]} as Record<string,string[]>)[view]??[];}
  } else {
   const body=await request.clone().json().catch(()=>({})) as Record<string,unknown>;
   let action=String(body.action??"");if(action==="read_notification")return false;
   if(["mutate","bulk_mutate"].includes(action))action=String(body.resource??"");
   const actions:Record<string,string[]>={task:["work"],appointment:["calendar"],appointment_response:["calendar"],document:["documents"],visaChecklist:["documents"],checklist_item:["documents"],complete_checklist_item:["documents"],message:["communications"],notify:["communications"],template:["templates"],workflow:["workflows"],role:["administration"],case:["enquiries"],update_case:caseFunctions,assign:caseFunctions,bulk_assign:caseFunctions,add_collaborator:caseFunctions,remove_collaborator:caseFunctions,case_note:caseFunctions,send_portal_access:caseFunctions,transfer_branch:["administration"],dependant_create:caseFunctions,dependant_update:caseFunctions,dependant_archive:caseFunctions,reveal_passport:caseFunctions,record_export:common,queue_integration:["integrations"],link_client_account:["administration"],unlink_client_account:["administration"]};
   required=actions[action]??[];
   if(/^(invoice|record_payment|record_refund|.*reconciliation|reconcile_payments|.*commission|queue_overdue_reminder)/.test(action))required=["finance"];
   if(/^application_/.test(action))required=["applications"];
   if(/^(visa_matter|set_visa_expiry)/.test(action))required=["visas","direct_visas"];
   if(["lifecycle","bulk_lifecycle"].includes(action))required=[stageFunction(body.stage??body.toStage??body.to_stage)];
   if(action==="transition_case")required=caseFunctions;
  }
 } else {
  const routes:Record<string,string[]>={admin:["administration"],tasks:["work"],ai:["ai"],copilot:["ai"],"calendar-connection":["calendar"],campaigns:["communications"],"course-finder":["courseFinder"],"document-checklist-templates":["templates","documents"],documents:["documents"],duplicates:["enquiries"],"email-templates":["templates"],enquiries:url.searchParams.has("caseId")?common:["enquiries"],health:["compliance"],import:["administration"],"intake-links":["enquiries"],intake:caseFunctions,integrations:["integrations"],mailbox:["communications"],reports:["reports"],"saved-views":common,search:common,sms:["communications"],whatsapp:["communications"],"workspace-connection":["communications","calendar"]};required=routes[route]??[];
 }
 return !canUseAny(identity,required);
}
