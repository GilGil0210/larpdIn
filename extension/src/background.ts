import {z} from 'zod';
import {profileKey,loadPersonas} from './storage';
import {executeSwitch,restoreInterrupted,type Selection} from './switchCoordinator';
import {liveSwitch} from './liveSwitch';
import {loadOperation} from './operation';
import {classifyBlocker} from './blockers';
import {reconcileWorkerJobs} from './workerRecovery';

// The toolbar button opens the demo popup (popup.html); the full developer panel stays at index.html.
void chrome.sidePanel?.setPanelBehavior?.({openPanelOnActionClick:false})?.catch?.(()=>{});
const restricted=Promise.all([chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);

const command=z.object({type:z.literal('start-switch'),profileUrl:z.string(),selection:z.discriminatedUnion('kind',[
 z.object({kind:z.literal('persona'),id:z.string().uuid()}).strict(),
 z.object({kind:z.literal('original')}).strict(),z.object({kind:z.literal('undo')}).strict(),z.object({kind:z.literal('recover')}).strict()
])}).strict();
type Command=z.infer<typeof command>;
const active=new Set<string>();
const jobKey=(url:string)=>`switch-job:${profileKey(url)}`;
// A new worker cannot know whether an old submission reached LinkedIn. Never replay it.
const initialized=(async()=>{
 await restricted;
 await reconcileWorkerJobs();
})();
async function start(input:Command):Promise<void>{
 await initialized;
 const key=jobKey(input.profileUrl);
 if(active.has(key))throw new Error('A switch is already running for this profile');
 active.add(key);
 try {
  const current=(await chrome.storage.local.get(key))[key];
  if(current?.status==='running')throw new Error('A switch is already running for this profile');
  if(current?.status==='interrupted'){
   const op=await loadOperation(input.profileUrl);
   if(op&&op.status!=='complete'&&input.selection.kind!=='recover')throw new Error('The previous switch requires recovery');
   if((!op||op.status==='complete')&&input.selection.kind==='recover'){await chrome.storage.local.set({[key]:{status:'failed',message:'The interrupted preflight made no changes. You can retry.'}});active.delete(key);return}
  }
  await chrome.storage.local.set({[key]:{status:'running',message:'Checking profile and restoration snapshot',startedAt:new Date().toISOString()}});
  void run(input,key);
 } catch(error){active.delete(key);throw error}
}
async function run(input:Command,key:string):Promise<void>{
 try {
  let result;
  if(input.selection.kind==='recover') result=await restoreInterrupted(input.profileUrl,liveSwitch);
  else {
   let selection:Selection;
   if(input.selection.kind==='persona'){
    const saved=(await loadPersonas(input.profileUrl)).find(item=>item.id===(input.selection as {id:string}).id);
    if(!saved)throw new Error('Saved persona not found');
    selection={kind:'persona',id:saved.id,candidate:{name:saved.name,description:saved.description,content:saved.content}};
   } else selection=input.selection;
   result=await executeSwitch(input.profileUrl,selection,liveSwitch);
  }
  let message=result.error||`Switch ${result.status}`;
  if(result.recoveryOf){const reconciliationKey=`reconciliation:${profileKey(input.profileUrl)}:${result.recoveryOf}`;const observation=(await chrome.storage.local.get(reconciliationKey))[reconciliationKey];if(observation?.outcome)message+=`. Previous operation: ${observation.outcome==='unchanged'?'no content changes observed':observation.outcome==='target-content-observed'?'target content observed but not independently verified':'profile changes observed'}`;}
  await chrome.storage.local.set({[key]:{status:result.status==='complete'?'complete':'failed',message,operationId:result.id,finishedAt:new Date().toISOString(),...(result.error?{blocker:classifyBlocker(result.error)}:{})}});
  if(result.status==='complete')await reloadProfileTabs(input.profileUrl);
 } catch(error){const message=error instanceof Error?error.message:String(error);await chrome.storage.local.set({[key]:{status:'failed',message,finishedAt:new Date().toISOString(),blocker:classifyBlocker(message)}})}
 finally {active.delete(key)}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')))return false;
 if(message?.type==='worker-ready'){void initialized.then(()=>sendResponse({ok:true}),error=>sendResponse({ok:false,error:String(error)}));return true}
 const parsed=command.safeParse(message);if(!parsed.success)return false;
 void start(parsed.data).then(()=>sendResponse({ok:true}),error=>sendResponse({ok:false,error:error instanceof Error?error.message:String(error)}));
 return true;
});

/** Show the applied persona: reload open tabs on the owner's profile (only those, never other pages). */
async function reloadProfileTabs(profileUrl:string):Promise<void>{
 try{
  const slug=new URL(profileUrl).pathname.replace(/\/$/,'').toLowerCase();
  const tabs=await chrome.tabs.query({url:'https://www.linkedin.com/in/*'});
  await Promise.all(tabs.filter(tab=>{try{const path=new URL(tab.url||'').pathname.replace(/\/$/,'').toLowerCase();return path===slug||path.startsWith(`${slug}/details/`)}catch{return false}}).map(tab=>tab.id!==undefined?chrome.tabs.reload(tab.id).catch(()=>{}):undefined));
 }catch{/* Reloading is a convenience; never fail the switch over it. */}
}
