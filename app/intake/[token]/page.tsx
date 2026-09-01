"use client";

import { FormEvent, useEffect, useState } from "react";

export default function SecureIntakePage({params}:{params:Promise<{token:string}>}){
  const [token,setToken]=useState("");
  const [service,setService]=useState<"study_abroad"|"direct_visa"|null>(null);
  const [error,setError]=useState("");
  const [sending,setSending]=useState(false);
  const [reference,setReference]=useState("");
  useEffect(()=>{void params.then(async({token:value})=>{setToken(value);const response=await fetch(`/api/public/intake/${value}`,{cache:"no-store"});const result=await response.json();if(!response.ok)setError(result.error||"This intake link is not available.");else setService(result.serviceType);});},[params]);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!token||sending)return;setSending(true);setError("");const data=new FormData(event.currentTarget);const body=Object.fromEntries(Array.from(data.entries()).filter(([,value])=>typeof value==="string"));try{const response=await fetch(`/api/public/intake/${token}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||"The enquiry could not be submitted.");setReference(result.reference);}catch(reason){setError(reason instanceof Error?reason.message:"The enquiry could not be submitted.");}finally{setSending(false);}};
  return <main style={{minHeight:"100vh",background:"#f4f7fb",padding:"40px 18px",fontFamily:"Arial, sans-serif",color:"#162238"}}>
    <section style={{maxWidth:760,margin:"0 auto",background:"white",borderRadius:20,padding:"32px",boxShadow:"0 18px 50px rgba(28,48,78,.12)"}}>
      <div style={{fontWeight:800,color:"#c41932",letterSpacing:1}}>MAXIMUS EDUCATION &amp; MIGRATION</div>
      <h1 style={{marginBottom:8}}>Secure {service==="direct_visa"?"Direct Visa":"Study Abroad"} enquiry</h1>
      <p style={{color:"#607089"}}>Send your details directly to the authorised Maximus case team. Fields marked required are needed to open the correct record.</p>
      {reference?<div role="status" style={{padding:20,background:"#ecf9f0",borderRadius:12}}><h2>Enquiry received</h2><p>Your reference is <b>{reference}</b>. The case team will contact you.</p></div>:
      error&&!service?<p role="alert" style={{padding:14,background:"#fff0f0",borderRadius:10,color:"#a11528"}}>{error}</p>:
      <form onSubmit={submit} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16,marginTop:24}}>
        <label style={{display:"none"}}>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label>Full name *<input name="name" required style={fieldStyle}/></label>
        <label>Email *<input name="email" type="email" required style={fieldStyle}/></label>
        <label>Mobile *<input name="mobile" required style={fieldStyle}/></label>
        <label>Nationality<input name="nationality" style={fieldStyle}/></label>
        <label>Destination country<input name="destination" style={fieldStyle}/></label>
        <label>{service==="direct_visa"?"Visa category":"Study level / course"}<input name="matterType" style={fieldStyle}/></label>
        <label>Current visa expiry *<input name="visaExpiry" type="date" required style={fieldStyle}/></label>
        <label style={{gridColumn:"1 / -1"}}>What help do you need?<textarea name="message" rows={4} style={fieldStyle}/></label>
        <label style={{gridColumn:"1 / -1",fontSize:13}}><input name="consent" type="checkbox" required/> I consent to Maximus storing these details to respond to my enquiry.</label>
        {error&&<p role="alert" style={{gridColumn:"1 / -1",color:"#a11528"}}>{error}</p>}
        <button disabled={!service||sending} style={{gridColumn:"1 / -1",border:0,borderRadius:10,padding:"14px 18px",background:"#c41932",color:"white",fontWeight:700,cursor:"pointer"}}>{sending?"Submitting…":"Submit secure enquiry"}</button>
      </form>}
    </section>
  </main>;
}

const fieldStyle={display:"block",width:"100%",boxSizing:"border-box" as const,marginTop:7,border:"1px solid #cbd5e1",borderRadius:9,padding:"11px 12px",font:"inherit"};
