import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {generate,candidate,type Profile} from './contract';
import type {z} from 'zod';
import {loadPersonas,savePersona,profileKey,type SavedPersona} from './storage';
import {loadOperation,type Operation} from './operation';
import {loadHistory} from './history';
import {resolveOwnProfile} from './ownership';
import {dismissStuckOperation} from './switchCoordinator';
import './popup.css';

type Candidate=z.infer<typeof candidate>;
type Job={status:'running'|'complete'|'failed'|'interrupted';message?:string;startedAt?:string;finishedAt?:string};
type Marks={startedAt:string;marks:{label:string;ms:number}[]};
type Step='intro'|'about'|'education';
const STEPS:{key:Step;label:string}[]=[{key:'intro',label:'Headline & location'},{key:'about',label:'About'},{key:'education',label:'Education'}];
const DEFAULT_BACKEND='https://larpdin-backend.onrender.com';
const empty:Profile={headline:'',location:'',industry:'',about:'',education:[]};

/** Remember the signed-in profile so the popup opens instantly; refresh it in the background. */
async function ownerProfile():Promise<string>{
 const cached=(await chrome.storage.local.get('owner-url'))['owner-url'] as string|undefined;
 const refresh=resolveOwnProfile().then(async url=>{await chrome.storage.local.set({'owner-url':url});return url});
 if(cached){refresh.catch(()=>{});return cached}
 return refresh;
}

function Popup(){
 const [owner,setOwner]=useState('');
 const [saved,setSaved]=useState<SavedPersona[]>([]);
 const [activeId,setActiveId]=useState<string|null>(null);
 const [current,setCurrent]=useState<Profile>(empty);
 const [brief,setBrief]=useState('');
 const [generating,setGenerating]=useState(false);
 const [generated,setGenerated]=useState<Candidate[]>([]);
 const [error,setError]=useState('');
 const [job,setJob]=useState<Job|null>(null);
 const [op,setOp]=useState<Operation|null>(null);
 const [marks,setMarks]=useState<Marks|null>(null);
 const [applying,setApplying]=useState<string|null>(null);
 const [now,setNow]=useState(Date.now());
 const [loading,setLoading]=useState(true);
 const jobKey=useMemo(()=>owner?`switch-job:${profileKey(owner)}`:'',[owner]);

 // Initial load: profile, saved personas, active persona, and any stuck switch (dismissed automatically).
 useEffect(()=>{(async()=>{
  try{
   const url=await ownerProfile();setOwner(url);
   const [personas,history]=await Promise.all([loadPersonas(url),loadHistory(url).catch(()=>null)]);
   setSaved(personas);setActiveId(history?.activePersonaId??null);
   const active=personas.find(p=>p.id===history?.activePersonaId);
   setCurrent(active?.content??history?.original.content??empty);
   await dismissStuckOperation(url).catch(()=>{});
   const key=`switch-job:${profileKey(url)}`;const data=await chrome.storage.local.get([key,'perf-last']);
   setJob(data[key]??null);setMarks(data['perf-last']??null);setOp(await loadOperation(url).catch(()=>null));
  }catch(e){setError(message(e))}
  finally{setLoading(false)}
 })()},[]);

 // Live switch progress from the worker's storage writes.
 useEffect(()=>{
  if(!owner)return;
  const opKey=`operation:${profileKey(owner)}`,histKey=`history:${profileKey(owner)}`;
  const listener=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{
   if(area!=='local')return;
   if(changes[jobKey]){const next=changes[jobKey].newValue as Job|undefined;setJob(next??null);if(next&&next.status!=='running')setApplying(null);if(next?.status==='failed')setError(friendly(next.message));}
   if(changes[opKey])setOp((changes[opKey].newValue as Operation|undefined)??null);
   if(changes['perf-last'])setMarks((changes['perf-last'].newValue as Marks|undefined)??null);
   if(changes[histKey]){const h=changes[histKey].newValue as {activePersonaId:string|null}|undefined;setActiveId(h?.activePersonaId??null)}
  };
  chrome.storage.onChanged.addListener(listener);return()=>chrome.storage.onChanged.removeListener(listener);
 },[owner,jobKey]);

 const running=job?.status==='running'||applying!==null;
 useEffect(()=>{if(!running)return;const t=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(t)},[running]);
 useEffect(()=>{if(activeId){const p=saved.find(x=>x.id===activeId);if(p)setCurrent(p.content)}},[activeId,saved]);

 const onGenerate=useCallback(async()=>{
  if(generating)return;setError('');setGenerating(true);setGenerated([]);
  try{
   const backend=((await chrome.storage.local.get('backendUrl')).backendUrl as string|undefined)||DEFAULT_BACKEND;
   setGenerated(await generate(backend,current,brief));
  }catch(e){setError(message(e))}
  finally{setGenerating(false)}
 },[generating,current,brief]);

 const save=useCallback(async(item:Candidate)=>{
  const persona:SavedPersona={...candidate.parse(item),id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  setSaved(list=>[persona,...list]);setGenerated(list=>list.filter(x=>x!==item)); // optimistic
  try{setSaved(await savePersona(owner,persona))}catch(e){setError(message(e));setSaved(list=>list.filter(x=>x.id!==persona.id))}
  return persona;
 },[owner]);

 const apply=useCallback(async(persona:SavedPersona)=>{
  if(running)return;setError('');setApplying(persona.id);
  // Optimistic progress before the worker reports.
  setJob({status:'running',message:'Starting',startedAt:new Date().toISOString()});setMarks(null);setOp(null);
  try{
   await dismissStuckOperation(owner).catch(()=>{});
   const reply=await chrome.runtime.sendMessage({type:'start-switch',profileUrl:owner,selection:{kind:'persona',id:persona.id}});
   if(!reply?.ok)throw new Error(reply?.error||'Could not start the switch');
  }catch(e){setApplying(null);setJob({status:'failed',message:message(e)});setError(friendly(message(e)))}
 },[owner,running]);

 const applyGenerated=useCallback(async(item:Candidate)=>{const persona=await save(item);await apply(persona)},[save,apply]);

 const startedAt=job?.startedAt?Date.parse(job.startedAt):null;
 const finishedAt=job?.finishedAt?Date.parse(job.finishedAt):null;
 const elapsed=startedAt?((finishedAt??now)-startedAt)/1000:0;
 const applyingPersona=saved.find(p=>p.id===(applying??op?.personaId));

 return <div className="app">
  <header>
   <div className="brand"><span className="logo">L</span><div><h1>Larpdin</h1><p className="muted">{loading?'Connecting to LinkedIn…':owner?owner.replace('https://www.linkedin.com',''):'Sign in to LinkedIn'}</p></div></div>
  </header>

  {(job&&(job.status==='running'||applying)||(job&&job.status!=='running'&&op))&&<Progress job={job} op={op} marks={marks} elapsed={elapsed} name={applyingPersona?.name}/>}

  {error&&<div className="alert" role="alert"><span>{error}</span><button className="link" onClick={()=>setError('')} aria-label="Dismiss error">✕</button></div>}

  <section className="panel">
   <label className="field"><span>Describe a persona</span>
    <div className="composer">
     <input value={brief} placeholder="e.g. fintech founder in New York" onChange={e=>setBrief(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void onGenerate()}} disabled={generating}/>
     <button className="primary" onClick={()=>void onGenerate()} disabled={generating||loading}>{generating?<Spinner/>:'Generate'}</button>
    </div>
   </label>
   {generating&&<div className="cards">{[0,1,2].map(i=><div key={i} className="card skeleton"><div className="bar w60"/><div className="bar w90"/><div className="bar w40"/><div className="bar w80"/></div>)}<p className="muted center">Writing three personas…</p></div>}
   {!generating&&generated.length>0&&<div className="cards">{generated.map((item,i)=><PersonaCard key={i} persona={item} busy={running} actions={<><button className="primary" disabled={running} onClick={()=>void applyGenerated(item)}>Apply</button><button onClick={()=>void save(item)}>Save</button></>}/>)}</div>}
  </section>

  <section className="panel">
   <h2>Saved personas</h2>
   {loading&&<div className="card skeleton"><div className="bar w60"/><div className="bar w90"/></div>}
   {!loading&&!saved.length&&<p className="muted">Generate a persona to get started.</p>}
   <div className="cards">{saved.map(p=><PersonaCard key={p.id} persona={p} active={p.id===activeId} applying={applying===p.id} busy={running}
    actions={p.id===activeId&&applying!==p.id?<span className="badge ok">Live on LinkedIn</span>:<button className="primary" disabled={running} onClick={()=>void apply(p)}>{applying===p.id?<><Spinner/> Applying</>:'Apply'}</button>}/>)}</div>
  </section>
 </div>;
}

function PersonaCard({persona,actions,active,applying,busy}:{persona:Candidate;actions:React.ReactNode;active?:boolean;applying?:boolean;busy?:boolean}){
 const [open,setOpen]=useState(false);const c=persona.content;
 const initials=persona.name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
 return <article className={`card${active?' active':''}${applying?' applying':''}`} aria-busy={applying||undefined}>
  <div className="banner"/>
  <div className="card-body">
   <div className="avatar">{initials}</div>
   <h3>{persona.name}</h3>
   <p className="headline">{c.headline}</p>
   <p className="meta">{[c.location,c.industry].filter(Boolean).join(' · ')}</p>
   {c.about&&<p className={`about${open?' open':''}`} onClick={()=>setOpen(!open)}>{c.about}</p>}
   {c.education.length>0&&<ul className="edu">{c.education.map((e,i)=><li key={i}><span className="school">{e.school}</span><span className="muted">{[[e.degree,e.fieldOfStudy].filter(Boolean).join(', '),[e.startYear,e.endYear].filter(Boolean).join('–')].filter(Boolean).join(' · ')}</span></li>)}</ul>}
   <div className="actions" aria-disabled={busy||undefined}>{actions}</div>
  </div>
 </article>;
}

function Progress({job,op,marks,elapsed,name}:{job:Job|null;op:Operation|null;marks:Marks|null;elapsed:number;name?:string}){
 const labels=new Set(marks?.marks.map(m=>m.label)??[]);
 const captured=labels.has('capture:done')||!!op;
 const done=job?.status==='complete',failed=job?.status==='failed'||job?.status==='interrupted';
 const state=(key:Step)=>{const s=op?.sections[key];if(s==='verified')return 'done';if(s==='failed'||s==='uncertain')return 'error';if(s==='submitting')return labels.has(`${key}:saved`)?'verifying':'saving';return captured&&!failed?'waiting':'idle'};
 const pct=done?100:Math.min(95,(captured?25:8)+STEPS.filter(s=>op?.sections[s.key]==='verified').length*23);
 return <section className={`progress ${done?'ok':failed?'bad':''}`} aria-live="polite">
  <div className="progress-head"><strong>{done?'Profile updated':failed?'Switch stopped':`Applying${name?` ${name}`:''}`}</strong><span className="timer">{elapsed.toFixed(1)}s</span></div>
  <div className="track"><div className="fill" style={{width:`${pct}%`}}/></div>
  <ol className="steps">
   <li className={captured?'done':failed?'error':'active'}><Dot state={captured?'done':failed?'error':'saving'}/>Reading your profile</li>
   {STEPS.map(s=>{const st=state(s.key);return <li key={s.key} className={st}><Dot state={st}/>{s.label}<span className="muted">{st==='saving'?'Saving…':st==='verifying'?'Checking…':st==='done'?'Done':st==='error'?'Failed':''}</span></li>})}
  </ol>
 </section>;
}
const Dot=({state}:{state:string})=><span className={`dot ${state}`}>{state==='done'?'✓':state==='error'?'!':state==='saving'||state==='verifying'?<Spinner/>:''}</span>;
const Spinner=()=><span className="spinner" aria-hidden="true"/>;
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
/** Short, demo-friendly error text. */
function friendly(raw?:string){const text=(raw||'Something went wrong').replace(/^(Error:\s*)+/,'').replace(/^(intro|about|education):\s*(Error:\s*)*/i,'');return text.length>140?`${text.slice(0,140)}…`:text}

createRoot(document.getElementById('root')!).render(<Popup/>);
