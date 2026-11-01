import {createOperation,loadOperation,persistOperation,recover,type Operation,type Section} from './operation';
import {loadHistory,saveOriginal,commitSwitch,commitRestore} from './history';
import {profileKey} from './storage';
import {interruptEducationProgress} from './educationProgress';
import {reconcileSnapshot} from './reconciliation';
import {snapshot,type Snapshot} from './snapshot';
import {runOperation,type SectionAdapter} from './runner';
import {candidate} from './contract';
import {z} from 'zod';
type Candidate=z.infer<typeof candidate>;
export type Selection={kind:'persona';id:string;candidate:Candidate}|{kind:'original'}|{kind:'undo'};
export interface SwitchDependencies {
 capture(profileUrl:string):Promise<Snapshot>;
 adapters(before:Snapshot,destination:Snapshot|undefined,operationId:string):Record<Section,SectionAdapter>;
 /** Lock must serialize all operations for the same profile, including recovery. */
 lock<T>(name:string,work:()=>Promise<T>):Promise<T>;
}
/** Call only when capture and all adapters can establish complete restoration data. */
export async function executeSwitch(profileUrl:string,selection:Selection,deps:SwitchDependencies):Promise<Operation>{
 return deps.lock(`larpdin:${profileKey(profileUrl)}`,async()=>{
  const previous=await loadOperation(profileUrl);if(previous && previous.status!=='complete')throw new Error('An earlier switch requires recovery before another can start');
  const before=snapshot.parse(await deps.capture(profileUrl));if(profileKey(before.profileUrl)!==profileKey(profileUrl))throw new Error('Captured profile does not match the requested profile');
  const history=await saveOriginal(before);let destination:Snapshot|undefined,personaId:string|null=null,target;
  if(selection.kind==='persona'){personaId=zodUuid(selection.id);target=candidate.parse(selection.candidate).content}
  else {const stored=await loadHistory(profileUrl);if(!stored)throw new Error('Original snapshot is missing');destination=selection.kind==='original'?stored.original:stored.undo??undefined;if(!destination)throw new Error('No previous switch to undo');if(destination.educationComplete===false||!destination.content.about.trim())throw new Error('This backup is incomplete; automatic restoration is unavailable. Restore from your separate backup.');personaId=selection.kind==='original'?null:stored.undoPersonaId;target=destination.content}
  const op=createOperation(profileUrl,target,before,{destination,personaId});await persistOperation(op);
  // Persist a distinct finalization state until history is updated. A crash here requires recovery.
  const persistProgress=async(value:Operation)=>persistOperation(value.status==='complete'?{...value,status:'committing'}:value);
  const result=await runOperation(op,deps.adapters(before,destination,op.id),persistProgress);
  if(result.status==='complete'){if(selection.kind==='persona')await commitSwitch(result,personaId!);else await commitRestore(result,personaId);await persistOperation(result)}
  return result;
 });
}
function zodUuid(value:string):string {return candidateId.parse(value)}
const candidateId=z.string().uuid();
export async function browserLock<T>(name:string,work:()=>Promise<T>):Promise<T>{return await navigator.locks.request(name,{mode:'exclusive'},async()=>await work())}

/** Recover by recapturing the actual state and starting a new restore; never replay the interrupted operation. */
export async function restoreInterrupted(profileUrl:string,deps:SwitchDependencies):Promise<Operation>{
 return deps.lock(`larpdin:${profileKey(profileUrl)}`,async()=>{
  let previous=await loadOperation(profileUrl);
  if(!previous || previous.status==='complete')throw new Error('There is no interrupted switch to restore');
  // The profile lock ensures no switch in this runtime is still executing.
  // Record uncertainty before attempting a fresh capture.
  if(previous.status==='running'){previous=recover(previous);await persistOperation(previous)}
  await interruptEducationProgress(profileUrl,previous.id);
  const history=await loadHistory(profileUrl);if(!history)throw new Error('Original snapshot is missing');
  const current=snapshot.parse(await deps.capture(profileUrl));
  if(profileKey(current.profileUrl)!==profileKey(profileUrl))throw new Error('Captured profile does not match the requested profile');
  const reconciliation=reconcileSnapshot(previous,current);
  await chrome.storage.local.set({[`reconciliation:${profileKey(profileUrl)}:${previous.id}`]:reconciliation});
  const destination=history.original;if(destination.educationComplete===false||!destination.content.about.trim())throw new Error('This backup is incomplete; automatic restoration is unavailable. Restore from your separate backup.');
  const op=createOperation(profileUrl,destination.content,current,{destination,personaId:null,recoveryOf:previous.id});
  // The old checkpoint must survive even if a new attempt is interrupted.
  await chrome.storage.local.set({[`operation-archive:${profileKey(profileUrl)}:${previous.id}`]:previous});
  await persistOperation(op);
  const persistProgress=async(value:Operation)=>persistOperation(value.status==='complete'?{...value,status:'committing'}:value);
  const result=await runOperation(op,deps.adapters(current,destination,op.id),persistProgress);
  if(result.status==='complete'){await commitRestore(result,null);await persistOperation(result)}
  return result;
 });
}
