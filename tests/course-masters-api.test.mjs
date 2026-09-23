import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const id='11111111-1111-4111-8111-111111111111';
async function save(level,body,institutionExists=true){
 const writes=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const path=new URL(req.url,'http://stub').pathname;
  let result=[];
  if(path==='/auth/v1/user')result={id};
  else if(path==='/rest/v1/profiles')result=[{id,organisation_id:id,branch_id:id,display_name:'Catalogue manager',email:'catalogue@example.test',active:true,level}];
  else if(path==='/rest/v1/institutions'&&req.method==='GET')result=institutionExists?[{id}]:[];
  else if(req.method==='POST'){writes.push({path,body:JSON.parse(raw)});result=[{id}];}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
 });
 await new Promise(resolve=>server.listen(0,resolve));
 try{
  const worker=(await import('../dist/server/index.js')).default;
  const response=await worker.fetch(new Request('https://crm.example/api/crm/course-finder',{method:'POST',headers:{cookie:'maximus_access=catalogue-test','Content-Type':'application/json'},body:JSON.stringify(body)}),{SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_PUBLISHABLE_KEY:'test',ASSETS:{fetch:async()=>new Response('',{status:404})}},{waitUntil(){},passThroughOnException(){}});
  return {status:response.status,writes};
 }finally{server.close();}
}
test('Admin can add a university and a course with catalogue fields',async()=>{
 const institution=await save('branch_admin',{action:'create_institution',name:'QA University',country:'Australia'});
 assert.equal(institution.status,200);assert.equal(institution.writes[0].body.name,'QA University');
 const course=await save('branch_admin',{action:'create_course',institutionId:id,name:'Master of Computing',durationMonths:'24',tuitionFee:'32000',intakeMonths:'February, July'});
 assert.equal(course.status,200);assert.equal(course.writes[0].body.duration_months,24);assert.equal(course.writes[0].body.institution_id,id);
});
test('Staff cannot modify catalogue masters',async()=>{
 const result=await save('staff',{action:'create_institution',name:'QA University',country:'Australia'});
 assert.equal(result.status,403);assert.equal(result.writes.length,0);
});
test('Course creation requires a visible active institution',async()=>{
 const result=await save('branch_admin',{action:'create_course',institutionId:id,name:'Invalid relationship'},false);
 assert.equal(result.status,400);assert.equal(result.writes.length,0);
});
