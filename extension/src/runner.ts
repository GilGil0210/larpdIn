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
export async function runOperation(initial:Operation, adapters:Record<Section,SectionAdapter>, persist:Persist):Promise<Operation> {
 let op=initial;
 if(op.status!=='running' || Object.values(op.sections).some(s=>s==='submitting'||s==='uncertain'||s==='failed')) throw new Error('Operation requires manual recovery');
 // Validate every section before the first write, then revalidate each immediately before its own submission.
 for(const key of order){
  if(op.sections[key]==='verified')continue;
  try{await adapters[key].preflight(op.profileUrl,op.target)}catch(error){op={...op,sections:{...op.sections,[key]:'failed'},status:'failed',error:String(error)};await persist(op);return op}
 }
 for(const key of order){
  if(op.sections[key]==='verified') continue;
  try {await adapters[key].preflight(op.profileUrl,op.target);} catch(error){
   op=beginSection(op,key); op=finishSection(op,key,'failed',String(error)); await persist(op); return op;
  }
  if(adapters[key].isNoop?.(op.target)){
   try {if(!await adapters[key].verify(op.target))throw new Error('Unchanged section could not be verified');op=verifyUnchanged(op,key)}
   catch(error){op={...op,sections:{...op.sections,[key]:'failed'},status:'failed',error:String(error)}}
   await persist(op);if(op.status!=='running')return op;continue;
  }
  op=beginSection(op,key);
  // Persist before submission; if this fails no external change is attempted.
  await persist(op);
  try {await adapters[key].submit(op.target);} catch(error){
   op=finishSection(op,key,'uncertain',String(error)); await persist(op); return op;
  }
  try {
   const verified=await adapters[key].verify(op.target);
   op=finishSection(op,key,verified?'verified':'uncertain',verified?undefined:'Saved value could not be verified');
  } catch(error){op=finishSection(op,key,'uncertain',String(error));}
  await persist(op);
  if(op.status!=='running') return op;
 }
 return op;
}
