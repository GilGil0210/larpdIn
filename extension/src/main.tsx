import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {generate,profile,candidate,type Profile} from './contract';
import type {z} from 'zod';
import {CandidateEditor} from './CandidateEditor';
import {loadPersonas,savePersona,profileKey,type SavedPersona} from './storage';
import {loadOperation, type Operation} from './operation';
import {inspectActiveTab, type Inspection} from './inspection';
import {importIntro} from './partialScan';
import {resolveOwnProfile,assertOwner} from './ownership';
import {scanIntro} from './scanIntro';
import {scanAbout} from './scanAbout';
import {scanEducation} from './scanEducation';
import {scanProfile} from './scanProfile';
import {saveScanDraft} from './scanDraft';
import type {Selection} from './switchCoordinator';
import {loadEducationProgress} from './educationProgress';
import type {EducationProgress} from './educationSwitch';
import './style.css';
const empty:Profile={headline:'',location:'',industry:'',about:'',education:[]};
function App(){
 const [url,setUrl]=useState('https://larpdin-backend.onrender.com'),[token,setToken]=useState(''),[profileUrl,setProfileUrl]=useState(''),[brief,setBrief]=useState(''),[input,setInput]=useState(JSON.stringify(empty,null,2)),[items,setItems]=useState<z.infer<typeof candidate>[]>([]),[saved,setSaved]=useState<SavedPersona[]>([]),[error,setError]=useState(''),[currentOperation,setCurrentOperation]=useState<Operation|null>(null),[inspection,setInspection]=useState<Inspection|null>(null),[scanStatus,setScanStatus]=useState(''),[scanning,setScanning]=useState(false),[switching,setSwitching]=useState(false),[loadedProfile,setLoadedProfile]=useState(''),[educationProgress,setEducationProgress]=useState<EducationProgress|null>(null);
 useEffect(()=>{chrome.storage.local.get('backendUrl').then(x=>x.backendUrl&&setUrl(x.backendUrl)); chrome.storage.session.get('token').then(x=>x.token&&setToken(x.token));},[]);
 async function scanAll(){if(scanning)return;setScanning(true);setError('');try{const result=await scanProfile(setScanStatus);if(!result.educationRecords)throw new Error('Education details are missing');await saveScanDraft({profileUrl:result.profileUrl,capturedAt:new Date().toISOString(),educationRecords:result.educationRecords,complete:false});setProfileUrl(result.profileUrl);setInput(JSON.stringify(result.content,null,2));setSaved([]);setCurrentOperation(null);setEducationProgress(null);setLoadedProfile('');}catch(e){setScanStatus('Scan stopped');setError(String(e));}finally{setScanning(false)}}
 async function scan(){try{setError('');const result=await scanIntro(profile.parse(JSON.parse(input)));if(profileUrl)assertOwner(profileUrl,result.profileUrl);setProfileUrl(result.profileUrl);setInput(JSON.stringify(result.content,null,2));}catch(e){setError(String(e));}}
 async function scanSummary(){try{setError('');const result=await scanAbout(profile.parse(JSON.parse(input)));if(profileUrl)assertOwner(profileUrl,result.profileUrl);setProfileUrl(result.profileUrl);setInput(JSON.stringify(result.content,null,2));}catch(e){setError(String(e));}}
 async function scanSchools(){try{setError('');const result=await scanEducation(profile.parse(JSON.parse(input)));if(profileUrl)assertOwner(profileUrl,result.profileUrl);await saveScanDraft({profileUrl:result.profileUrl,capturedAt:new Date().toISOString(),educationRecords:result.educationRecords,complete:false});setProfileUrl(result.profileUrl);setInput(JSON.stringify(result.content,null,2));}catch(e){setError(String(e));}}
 async function inspect(){try{setError('');setInspection(await inspectActiveTab());}catch(e){setError(String(e));}}
 async function useIntro(){try{if(!inspection)throw new Error('Inspect the intro form first');const result=importIntro(inspection,profile.parse(JSON.parse(input)));const owner=await resolveOwnProfile();assertOwner(result.profileUrl,owner);if(profileUrl)assertOwner(profileUrl,result.profileUrl);setProfileUrl(result.profileUrl);setInput(JSON.stringify(result.content,null,2));setError('');}catch(e){setError(String(e));}}
 async function run(){try{setError('');setItems(await generate(url,token,profile.parse(JSON.parse(input)),brief));}catch(e){setError(String(e));}}
 async function load(){try{setError('');setSaved(await loadPersonas(profileUrl));const op=await loadOperation(profileUrl);setCurrentOperation(op);setEducationProgress(op?await loadEducationProgress(profileUrl,op.id):null);setLoadedProfile(profileKey(profileUrl));}catch(e){setError(String(e));}}
 async function switchTo(selection:Selection|'recover'){
  if(switching)return;
  setSwitching(true);setError('');setScanStatus('Checking the current profile and snapshot');
  try {
   const request=selection==='recover'?{kind:'recover'}:selection.kind==='persona'?{kind:'persona',id:selection.id}:selection;
   const reply=await chrome.runtime.sendMessage({type:'start-switch',profileUrl,selection:request});
   if(!reply?.ok)throw new Error(reply?.error||'Could not start the switch');
  } catch(e){setError(String(e));setScanStatus('Switch stopped');setSwitching(false)}
 }
 useEffect(()=>{
  if(!profileUrl)return;
  let key:string;try{key=`switch-job:${profileKey(profileUrl)}`}catch{return}
  let cancelled=false;
  const refresh=async()=>{const job=(await chrome.storage.local.get(key))[key];if(cancelled||!job)return;setSwitching(job.status==='running');setScanStatus(job.status==='complete'?'Switch verified':job.status==='failed'||job.status==='interrupted'?'Switch stopped':job.message||'');if(job.status==='failed'||job.status==='interrupted')setError(job.message||'Switch stopped');try{const op=await loadOperation(profileUrl);if(cancelled)return;setCurrentOperation(op);setEducationProgress(op?await loadEducationProgress(profileUrl,op.id):null)}catch(e){if(!cancelled)setError(String(e))}};
  const listener=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{if(area==='local'&&(changes[key]||Object.keys(changes).some(k=>k.startsWith(`operation:${profileKey(profileUrl)}`)||k.startsWith(`education-progress:${profileKey(profileUrl)}:`))))void refresh()};
  chrome.storage.onChanged.addListener(listener);void chrome.runtime.sendMessage({type:'worker-ready'}).then(refresh).catch(()=>refresh());return()=>{cancelled=true;chrome.storage.onChanged.removeListener(listener)};
 },[profileUrl]);
 async function save(item:unknown){try{setError('');const value=candidate.parse(item);setSaved(await savePersona(profileUrl,{...value,id:crypto.randomUUID(),createdAt:new Date().toISOString()}));setLoadedProfile(profileKey(profileUrl));}catch(e){setError(String(e));}}
 return <main><h1>Larpdin</h1><p className="notice">Preview: scanning is experimental. Switching and restoration are blocked until a complete snapshot can be captured.</p><label>Backend URL<input value={url} onChange={e=>setUrl(e.target.value)} onBlur={()=>chrome.storage.local.set({backendUrl:url})}/></label><label>Demo access token<input type="password" value={token} onChange={e=>{setToken(e.target.value);void chrome.storage.session.set({token:e.target.value})}}/></label><label>LinkedIn profile URL<input value={profileUrl} disabled={switching} onChange={e=>{setProfileUrl(e.target.value);setSaved([]);setCurrentOperation(null);setLoadedProfile('')}}/></label><button onClick={load} disabled={switching}>Load saved personas</button><button onClick={scanAll} disabled={scanning||switching}>Scan profile</button><p role="status">{scanStatus}</p><p>Scan results are for generation and do not constitute a restoration snapshot.</p><button onClick={scan} disabled={scanning||switching}>Scan intro</button><button onClick={scanSummary} disabled={scanning||switching}>Scan About</button><button onClick={scanSchools} disabled={scanning||switching}>Scan education</button><button onClick={inspect} disabled={switching||scanning}>Inspect open LinkedIn form</button>{inspection&&<section><h2>Form inspection</h2><p>{inspection.url}</p><p>Read-only inspection; this is not a complete profile snapshot.</p><button onClick={useIntro}>Import intro fields</button><ul>{inspection.fields.map((f,i)=><li key={i}>{f.label || 'Unlabelled'} ({f.tag})</li>)}</ul></section>}<label>Profile JSON<textarea disabled={scanning||switching} value={input} onChange={e=>setInput(e.target.value)} rows={10}/></label><label>Brief<textarea value={brief} onChange={e=>setBrief(e.target.value)}/></label><button onClick={run} disabled={scanning||switching}>Generate</button>{error&&<p role="alert">{error}</p>}{items.map((item,i)=><CandidateEditor key={i} index={i} value={item} onChange={value=>setItems(items.map((x,j)=>j===i?value:x))} onSave={()=>save(item)}/>)}<h2>Switch progress</h2><button disabled={switching||!loadedProfile} onClick={()=>switchTo({kind:'original'})}>Restore original</button> <button disabled={switching||!loadedProfile} onClick={()=>switchTo({kind:'undo'})}>Undo last switch</button>{currentOperation ? <section><p>Status: {currentOperation.status}</p><ul>{Object.entries(currentOperation.sections).map(([name,state])=><li key={name}>{name}: {state}</li>)}</ul>{currentOperation.error&&<p>{currentOperation.error}</p>}{educationProgress&&<p>Education: {educationProgress.next} of {educationProgress.steps.length} changes verified. {educationProgress.inFlight?`Uncertain ${educationProgress.inFlight.kind} step.`:''}</p>}{currentOperation.status!=='complete'&&<button disabled={switching} onClick={()=>switchTo('recover')}>Restore original after interruption</button>}<p>Restoration requires a fresh complete snapshot. Uncertain submissions are not replayed.</p></section> : <p>No saved switch operation.</p>}<h2>Saved personas</h2>{saved.map(p=><section key={p.id}><h3>{p.name}</h3><p>{p.description}</p><pre>{JSON.stringify(p.content,null,2)}</pre><button disabled={switching||!loadedProfile} onClick={()=>switchTo({kind:'persona',id:p.id,candidate:{name:p.name,description:p.description,content:p.content}})}>Apply {p.name}</button></section>)}</main>
}
createRoot(document.getElementById('root')!).render(<App/>);
