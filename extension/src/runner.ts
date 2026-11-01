import {perfMark} from './perf';
import {beginSection,finishSection,verifyUnchanged, type Operation, type Section} from './operation';
import type {Profile} from './contract';

export interface SectionAdapter {
  /** Reject unless the current page is the signed-in owner's profile and the expected form matches. */
  preflight(profileUrl:string, target:Profile):Promise<void>;
  /** Report a candidate no-op; verify still independently reads the live section. */
  isNoop?(target:Profile):boolean;
  /** Resolves only once LinkedIn acknowledges the save; rejection may still mean it was submitted. */
  submit(target:Profile):Promise<void>;
  /** Independently re-read saved state; false means the target was not verified. */
  verify(target:Profile):Promise<boolean>;
}
export type Persist = (operation:Operation)=>Promise<void>;
const order:Section[]=['intro','about','education'];
/** Runs once. A submitted operation is never automatically retried after an error. */
export type RunOptions={
 /** Re-run each section's preflight immediately before its own write. Off for live speed: the upfront pass ran seconds earlier and only this run writes. */
 revalidate?:boolean;
 /** Accept the just-captured snapshot as proof that a no-op section is already correct, instead of re-reading it. */
 trustCaptureForNoop?:boolean;
 /** Demo speed: skip the separate preflight pass (each submit still validates its form before saving) and run independent sections concurrently. */
 parallel?:boolean;
};
export async function runOperation(initial:Operation, adapters:Record<Section,SectionAdapter>, persist:Persist, options:RunOptions={}):Promise<Operation> {
 const revalidate=options.revalidate??true;
 if(options.parallel){
  if(initial.status!=='running' || Object.values(initial.sections).some(s=>s==='submitting'||s==='uncertain'||s==='failed')) throw new Error('Operation requires manual recovery');
  return runParallel(initial,adapters,persist,options);
 }
 let op=initial;
 if(op.status!=='running' || Object.values(op.sections).some(s=>s==='submitting'||s==='uncertain'||s==='failed')) throw new Error('Operation requires manual recovery');
 // Validate every section before the first write, then revalidate each immediately before its own submission.
 perfMark('preflight:start');
 const pending=order.filter(key=>op.sections[key]!=='verified');
 const checks=await Promise.allSettled(pending.map(key=>adapters[key].preflight(op.profileUrl,op.target)));
 for(let i=0;i<pending.length;i++){const check=checks[i];if(check.status==='rejected'){const key=pending[i];op={...op,sections:{...op.sections,[key]:'failed'},status:'failed',error:String(check.reason)};await persist(op);return op}}
 perfMark('preflight:done');
 for(const key of order){
  if(op.sections[key]==='verified') continue;
  if(revalidate) try {await adapters[key].preflight(op.profileUrl,op.target);} catch(error){
   op=beginSection(op,key); op=finishSection(op,key,'failed',String(error)); await persist(op); return op;
  }
  if(adapters[key].isNoop?.(op.target)){
   try {if(!options.trustCaptureForNoop&&!await adapters[key].verify(op.target))throw new Error('Unchanged section could not be verified');op=verifyUnchanged(op,key)}
   catch(error){op={...op,sections:{...op.sections,[key]:'failed'},status:'failed',error:String(error)}}
   await persist(op);if(op.status!=='running')return op;continue;
  }
  op=beginSection(op,key);
  // Persist before submission; if this fails no external change is attempted.
  await persist(op);
  perfMark(`${key}:submit`);
  try {await adapters[key].submit(op.target);} catch(error){
   op=finishSection(op,key,'uncertain',String(error)); await persist(op); return op;
  }
  try {
   perfMark(`${key}:verify`);const verified=await adapters[key].verify(op.target);perfMark(`${key}:done`);
   op=finishSection(op,key,verified?'verified':'uncertain',verified?undefined:'Saved value could not be verified');
  } catch(error){op=finishSection(op,key,'uncertain',String(error));}
  await persist(op);
  if(op.status!=='running') return op;
 }
 return op;
}

/** Independent LinkedIn forms (intro, About, education) are saved concurrently, then each is verified. */
async function runParallel(initial:Operation,adapters:Record<Section,SectionAdapter>,persist:Persist,options:RunOptions):Promise<Operation>{
 let op=initial;
 const pending=order.filter(key=>op.sections[key]!=='verified');
 const noop=new Set(pending.filter(key=>adapters[key].isNoop?.(op.target)));
 const writes=pending.filter(key=>!noop.has(key));
 // Persist every submitting state before the first write.
 op={...op,sections:{...op.sections,...Object.fromEntries(writes.map(key=>[key,'submitting']))}};await persist(op);
 perfMark('parallel:start');
 const outcomes=await Promise.all(pending.map(async key=>{
  try{
   if(noop.has(key)){if(options.trustCaptureForNoop||await adapters[key].verify(op.target))return {key,state:'verified' as const};return {key,state:'failed' as const,error:'Unchanged section could not be verified'}}
   await adapters[key].submit(op.target);perfMark(`${key}:saved`);
   const verified=await adapters[key].verify(op.target);perfMark(`${key}:verified`);
   return verified?{key,state:'verified' as const}:{key,state:'uncertain' as const,error:'Saved value could not be verified'};
  }catch(error){return {key,state:noop.has(key)?'failed' as const:'uncertain' as const,error:String(error)}}
 }));
 const sections={...op.sections};let error:string|undefined;
 for(const outcome of outcomes){sections[outcome.key]=outcome.state;if(outcome.state!=='verified'&&!error)error=`${outcome.key}: ${outcome.error}`}
 op={...op,sections,status:Object.values(sections).every(state=>state==='verified')?'complete':'failed',...(error?{error}:{})};
 await persist(op);return op;
}
