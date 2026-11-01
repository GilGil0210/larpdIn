import {candidate,generate} from './contract';
import {profileKey,loadPersonas,savePersona,savedPersona} from './storage';
import {resolveOwnProfile} from './ownership';
import {scanProfile} from './scanProfile';
import {loadHistory} from './history';
import {loadOperation} from './operation';
import type {AppState,Candidate,LarpdinClient,SectionProgress} from './public-api';
const defaultUrl='https://larpdin-backend.onrender.com';
export function createClient():LarpdinClient {
 let candidates:Candidate[]=[];
 const listeners=new Set<(state:AppState)=>void>();
 async function state():Promise<AppState>{
  await chrome.runtime.sendMessage({type:'worker-ready'});
  const local=await chrome.storage.local.get(['backendUrl','connectedProfile','profileScan']);
  const url=typeof local.connectedProfile==='string'?local.connectedProfile:null;
  const [personas,history,op,job]=url?await Promise.all([loadPersonas(url),loadHistory(url),loadOperation(url),chrome.storage.local.get(`switch-job:${profileKey(url)}`)]):[[],null,null,{}];
  const jobValue=url?(job as Record<string,any>)[`switch-job:${profileKey(url)}`]:null;
  const blockers:AppState['blockers']=[];
  if(!url)blockers.push({code:'profile_disconnected',message:'Connect your signed-in LinkedIn profile.',section:'profile',action:'connect'});
  if(jobValue?.blocker)blockers.push(jobValue.blocker);
  if(url)blockers.push({code:'snapshot_unchecked',message:'A complete restoration snapshot will be checked before any changes.',section:'education',action:'scan'});
  if(!local.profileScan||local.profileScan.profileUrl!==url)blockers.push({code:'scan_required',message:'Scan the connected profile before reviewing changes.',section:'profile',action:'scan'});
  if(jobValue?.status==='interrupted'||(op&&op.status!=='running'&&op.status!=='complete'))blockers.push({code:'recovery_required',message:'A previous switch needs recovery from a fresh scan.',section:'operation',action:'recover'});
  const scan=local.profileScan?.profileUrl===url?{content:local.profileScan.content,capturedAt:local.profileScan.capturedAt,freshness:((jobValue?.status==='running'||jobValue?.status==='interrupted'||(jobValue?.finishedAt&&local.profileScan.capturedAt<jobValue.finishedAt))?'stale':'fresh') as 'fresh'|'stale'}:null;
  const verifiedActive=history?.activePersonaId&&scan?.freshness==='fresh'&&personas.some(item=>item.id===history.activePersonaId&&JSON.stringify(item.content)===JSON.stringify(scan.content))?history.activePersonaId:null;
  const sections=op?Object.fromEntries(Object.entries(op.sections).map(([k,v])=>[k,v==='submitting'?'saving':v])) as Record<'intro'|'about'|'education',SectionProgress>:{intro:'pending',about:'pending',education:'pending'} as const;
  return {settings:{backendUrl:local.backendUrl||defaultUrl},connectedProfile:url,scan,snapshotReadiness:'unchecked',blockers,candidates,personas,activePersonaId:verifiedActive,restoration:{original:!!history,undo:!!history?.undo},operation:jobValue||op?{status:jobValue?.status||op!.status,message:jobValue?.message||op?.error||'',sections,recoveryAvailable:!!op&&op.status!=='complete'&&jobValue?.status!=='running'}:null};
 }
 async function emit(){const value=await state();listeners.forEach(fn=>fn(value))}
 async function connected(){const s=await state();if(!s.connectedProfile)throw Error('Connect your LinkedIn profile first');return s.connectedProfile}
 async function switchCommand(selection:object){const profileUrl=await connected();const result=await chrome.runtime.sendMessage({type:'start-switch',profileUrl,selection});if(!result?.ok)throw Error(result?.error||'Unable to start switch')}
 const storageListener=()=>{void emit()};
 return {
  getState:state,subscribe(fn){if(listeners.size===0)chrome.storage.onChanged.addListener(storageListener);listeners.add(fn);void state().then(value=>{if(listeners.has(fn))fn(value)});return()=>{listeners.delete(fn);if(listeners.size===0)chrome.storage.onChanged.removeListener(storageListener)}},
  async saveSettings(settings){const url=new URL(settings.backendUrl);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Backend must use HTTPS');if(url.username||url.password||url.search||url.hash)throw Error('Invalid backend URL');const origin=`${url.protocol}//${url.hostname}/*`;if(!await chrome.permissions.contains({origins:[origin]})&&!await chrome.permissions.request({origins:[origin]}))throw Error('Backend access was not granted');await chrome.storage.local.set({backendUrl:url.href.replace(/\/$/,'')})},
  async checkConnection(){const s=await state();const response=await fetch(new URL('/health',s.settings.backendUrl),{redirect:'error'});if(!response.ok)throw Error(`Backend unavailable (HTTP ${response.status})`)},
  async connectProfile(){const url=await resolveOwnProfile();await chrome.storage.local.set({connectedProfile:url})},
  async scanProfile(){const owner=await connected();const result=await scanProfile(()=>{});if(profileKey(result.profileUrl)!==profileKey(owner))throw Error('Signed-in profile changed');await chrome.storage.local.set({profileScan:{profileUrl:owner,content:result.content,capturedAt:new Date().toISOString()}})},
  async generate(brief){const s=await state();if(!s.scan)throw Error('Scan your profile first');candidates=await generate(s.settings.backendUrl,s.scan.content,brief);await emit()},
  async savePersona(value){const url=await connected();await savePersona(url,{...candidate.parse(value),id:crypto.randomUUID(),createdAt:new Date().toISOString()})},
  async editPersona(id,value){const url=await connected(),items=await loadPersonas(url),i=items.findIndex(x=>x.id===id);if(i<0)throw Error('Persona not found');items[i]=savedPersona.parse({...items[i],...candidate.parse(value)});await chrome.storage.local.set({[profileKey(url)]:items})},
  async deletePersona(id){const url=await connected(),items=await loadPersonas(url);if(!items.some(x=>x.id===id))throw Error('Persona not found');await chrome.storage.local.set({[profileKey(url)]:items.filter(x=>x.id!==id)})},
  async preview(id){const s=await state(),item=s.personas.find(x=>x.id===id);if(!s.scan||!item)throw Error('Scan or persona is missing');return {before:s.scan.content,after:item.content}},
  apply:id=>switchCommand({kind:'persona',id}),restoreOriginal:()=>switchCommand({kind:'original'}),undo:()=>switchCommand({kind:'undo'}),recover:()=>switchCommand({kind:'recover'}),
  async exportDiagnostics(){const s=await state();return JSON.stringify({version:chrome.runtime.getManifest().version,snapshotReadiness:s.snapshotReadiness,blockers:s.blockers.map(({code,section,action})=>({code,section,action})),operation:s.operation?{status:s.operation.status,sections:s.operation.sections}:null},null,2)}
 };
}
