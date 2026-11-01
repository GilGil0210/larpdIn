import {z} from 'zod';
import {education} from './contract';
import {snapshot,assertRestorable} from './snapshot';
import type {Snapshot} from './snapshot';
import {profileKey} from './storage';

type Education=z.infer<typeof education>;
export const educationValue=education.extend({startMonth:z.number().int().min(1).max(12).nullable(),endMonth:z.number().int().min(1).max(12).nullable()}).strict();
export type EducationValue=z.infer<typeof educationValue>;
export const generatedEducation=(items:Education[]):EducationValue[]=>z.array(education).parse(items).map(item=>({...item,startMonth:null,endMonth:null}));
export function snapshotEducation(raw:Snapshot):EducationValue[]{const snap=snapshot.parse(raw);assertRestorable(snap);return snap.educationRecords.map(({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description,startMonth,endMonth})=>({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description,startMonth,endMonth}))}
export type EducationStep={kind:'delete';id:string}|{kind:'edit';id:string;index:number;before:EducationValue;record:EducationValue}|{kind:'add';index:number;record:EducationValue};
export type EducationProgress={operationId:string;profileUrl:string;steps:EducationStep[];next:number;inFlight:EducationStep|null;status:'running'|'complete'|'uncertain';error?:string};
export interface EducationPort {
 /** Re-check current owner and compare the current education records with the expected list. */
 preflight(profileUrl:string,original:Snapshot):Promise<void>;
 deleteRecord(id:string):Promise<void>;
 editRecord(id:string,before:EducationValue,record:EducationValue):Promise<void>;
 addRecord(record:EducationValue):Promise<void>;
 /** Re-read the entire list after the operation, without assuming a submission succeeded. */
 readRecords():Promise<EducationValue[]>;
}
export function planEducation(operationId:string,profileUrl:string,original:Snapshot,target:EducationValue[]):EducationProgress {
 const snap=snapshot.parse(original); assertRestorable(snap); if(profileKey(profileUrl)!==profileKey(snap.profileUrl)) throw new Error('Snapshot belongs to a different profile');
 const records=z.array(educationValue).parse(target);
 const current=snapshotEducation(snap), used=new Set<number>(), matched=new Set<number>();
 // Match equal records first so retained data is never discarded unnecessarily.
 for(let i=0;i<records.length;i++){const j=current.findIndex((v,k)=>!used.has(k)&&JSON.stringify(v)===JSON.stringify(records[i]));if(j>=0){used.add(j);matched.add(i)}}
 const edits:EducationStep[]=[],adds:EducationStep[]=[],deletes:EducationStep[]=[];
 for(let i=0;i<records.length;i++)if(!matched.has(i)){
  const j=current.findIndex((_v,k)=>!used.has(k));
  if(j>=0){used.add(j);edits.push({kind:'edit',id:snap.educationRecordIds[j],index:i,before:current[j],record:records[i]})}
  else adds.push({kind:'add',index:i,record:records[i]});
 }
 current.forEach((_v,i)=>{if(!used.has(i))deletes.push({kind:'delete',id:snap.educationRecordIds[i]})});
 return {operationId,profileUrl,steps:[...edits,...adds,...deletes],next:0,inFlight:null,status:'running'};
}
/** A step is persisted as in-flight before submission. A failure is never retried automatically. */
/** Fast mode for live runs: skip the duplicate port preflight and check the list once after all steps instead of after each. */
export type EducationRunOptions={checkEachStep?:boolean};
export async function runEducation(plan:EducationProgress,original:Snapshot,target:EducationValue[],port:EducationPort,persist:(progress:EducationProgress)=>Promise<void>,options:EducationRunOptions={}):Promise<EducationProgress> {
 const checkEachStep=options.checkEachStep??true;
 if(plan.status!=='running'||plan.inFlight||plan.next!==0) throw new Error('Education operation requires manual recovery');
 const expected=planEducation(plan.operationId,plan.profileUrl,original,target);
 if(JSON.stringify(plan.steps)!==JSON.stringify(expected.steps)) throw new Error('Education plan does not match the snapshot and target');
 if(checkEachStep)await port.preflight(plan.profileUrl,original);
 let progress=plan;
 let expectedRecords=snapshotEducation(original);
 // LinkedIn may store a selected field of study in capitals ("PSYCHOLOGY"); compare case-insensitively.
 const canonical=(items:EducationValue[])=>items.map(x=>JSON.stringify(educationValue.parse(x)).toLowerCase()).sort();
 const assertRecords=async(expected:EducationValue[])=>{
  const actual=z.array(educationValue).parse(await port.readRecords());
  if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(expected))) throw new Error('Education list differs from the expected state');
 };
 // Check the baseline independently after preflight, before any submission.
 try {await assertRecords(expectedRecords);} catch(error){progress={...progress,status:'uncertain',error:String(error)};await persist(progress);return progress;}
 if(!checkEachStep&&progress.steps.length>1){
  // Each step touches a different record (or adds a new one) in its own tab, so they can run concurrently.
  progress={...progress,inFlight:progress.steps[0]};await persist(progress);
  try{
   await Promise.all(progress.steps.map(async step=>{
    if(step.kind==='delete')await port.deleteRecord(step.id);
    else if(step.kind==='edit')await port.editRecord(step.id,step.before,step.record);
    else await port.addRecord(step.record);
   }));
   await assertRecords(target.map(x=>educationValue.parse(x)));
  }catch(error){progress={...progress,status:'uncertain',error:String(error)};await persist(progress);return progress;}
  progress={...progress,next:progress.steps.length,inFlight:null};await persist(progress);
 } else
 for(const step of progress.steps){
  progress={...progress,inFlight:step};await persist(progress);
  try {
   if(step.kind==='delete') {
    const recordIndex=original.educationRecordIds.indexOf(step.id);
    if(recordIndex<0) throw new Error('Unknown education record');
    const item=snapshotEducation(original)[recordIndex];
    const index=expectedRecords.findIndex(x=>JSON.stringify(x)===JSON.stringify(item));
    if(index<0) throw new Error('Expected education record is missing');
    await port.deleteRecord(step.id);
    expectedRecords=expectedRecords.filter((_,i)=>i!==index);
   } else if(step.kind==='edit'){
    const index=expectedRecords.findIndex(x=>JSON.stringify(x)===JSON.stringify(step.before));
    if(index<0)throw new Error('Expected education record is missing');
    await port.editRecord(step.id,step.before,step.record);
    expectedRecords=expectedRecords.map((x,i)=>i===index?step.record:x);
   } else {await port.addRecord(step.record);expectedRecords=[...expectedRecords,step.record];}
   // Do not start another change until the prior change is independently observed (fast mode checks once at the end).
   if(checkEachStep||step===progress.steps[progress.steps.length-1])await assertRecords(expectedRecords);
  } catch(error){progress={...progress,status:'uncertain',error:String(error)};await persist(progress);return progress;}
  progress={...progress,next:progress.next+1,inFlight:null};await persist(progress);
 }
 try {const actual=z.array(educationValue).parse(await port.readRecords());if(JSON.stringify(actual).toLowerCase()!==JSON.stringify(target.map(x=>educationValue.parse(x))).toLowerCase())throw new Error('Education order differs from the requested order')} catch(error){progress={...progress,status:'uncertain',error:String(error)};await persist(progress);return progress}
 progress={...progress,status:'complete'};
 await persist(progress);return progress;
}

/** Use captured months when constructing a restore target. */
export function planEducationRestore(operationId:string,current:Snapshot,destination:Snapshot):{plan:EducationProgress;target:EducationValue[]}{const from=snapshot.parse(current),to=snapshot.parse(destination);if(profileKey(from.profileUrl)!==profileKey(to.profileUrl))throw new Error('Restore snapshot belongs to a different profile');const target=snapshotEducation(to);return {plan:planEducation(operationId,from.profileUrl,from,target),target};}
