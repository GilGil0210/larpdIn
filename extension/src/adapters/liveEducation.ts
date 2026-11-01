import {scanEducation} from '../scanEducation';
import {assertOwner,resolveOwnProfile} from '../ownership';
import {snapshotEducation,educationValue,generatedEducation,planEducation,runEducation,type EducationPort,type EducationValue,type EducationProgress} from '../educationSwitch';
import type {Snapshot} from '../snapshot';
import type {SectionAdapter} from '../runner';
import type {Profile} from '../contract';
import {persistEducationProgress} from '../educationProgress';
const blank:Profile={headline:'',location:'',industry:'',about:'',education:[]};
const canonical=(items:EducationValue[])=>items.map(x=>JSON.stringify(educationValue.parse(x)));
async function checkOwner(owner:string){assertOwner(await resolveOwnProfile(),owner)}
async function scan(owner:string){const result=await scanEducation(blank);assertOwner(result.profileUrl,owner);if(!result.listComplete)throw new Error('Education list completeness could not be verified');return result.educationRecords}
async function open(owner:string,path:string):Promise<number>{
 const url=new URL(path,owner),tab=await chrome.tabs.create({url:url.href,active:false});if(tab.id===undefined)throw new Error('Could not open education editor');const id=tab.id;
 try{const end=Date.now()+15000;while(Date.now()<end){const state=await chrome.tabs.get(id);if(state.status==='complete'&&state.url&&new URL(state.url).pathname===url.pathname){await chrome.scripting.executeScript({target:{tabId:id},files:['editBridge.js']});return id}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error('Education editor did not load')}catch(error){await chrome.tabs.remove(id).catch(()=>{});throw error}
}
async function submit(owner:string,path:string,message:object){await checkOwner(owner);const id=await open(owner,path);try{const result=await chrome.tabs.sendMessage(id,message) as {ok:boolean;submitted?:boolean;error?:string};if(!result?.ok||!result.submitted)throw new Error(result?.error||'Education was not submitted');const end=Date.now()+15000;while(Date.now()<end){const tab=await chrome.tabs.get(id);if(tab.url&&new URL(tab.url).pathname!==new URL(path,owner).pathname)return;await new Promise(resolve=>setTimeout(resolve,250))}throw new Error('Education save was not acknowledged')}finally{await chrome.tabs.remove(id).catch(()=>{})}}
export function makeEducationPort(owner:string,before:Snapshot):EducationPort {
 return {
  async preflight(profileUrl,original){assertOwner(profileUrl,owner);await checkOwner(owner);const records=await scan(owner);if(records.some(record=>!record.attachmentsInspected))throw new Error('Education attachments could not be rechecked; switching is blocked');if(JSON.stringify(records.map(x=>x.id).sort())!==JSON.stringify([...original.educationRecordIds].sort()))throw new Error('Education record list changed since the snapshot');const actual=records.map(({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description,startMonth,endMonth})=>({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description,startMonth,endMonth}));const expected=snapshotEducation(original);for(let i=0;i<records.length;i++){const index=original.educationRecordIds.indexOf(records[i].id);if(index<0||JSON.stringify(educationValue.parse(actual[i]))!==JSON.stringify(educationValue.parse(expected[index])))throw new Error('Education changed since the snapshot')}},
  async editRecord(id,beforeValue,record){await submit(owner,`details/education/edit/forms/${id}/`,{action:'editEducation',profileUrl:owner,id,before:beforeValue,target:educationValue.parse(record)})},
  async deleteRecord(id){const index=before.educationRecordIds.indexOf(id);if(index<0)throw new Error('Unknown education record');const record=snapshotEducation(before)[index];await submit(owner,`details/education/edit/forms/${id}/`,{action:'deleteEducation',profileUrl:owner,id,before:record})},
  async addRecord(record){await submit(owner,'edit/forms/education/new/',{action:'submitEducation',profileUrl:owner,target:educationValue.parse(record)})},
  async readRecords(){await checkOwner(owner);const records=await scan(owner);return records.map(({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description,startMonth,endMonth})=>({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description,startMonth,endMonth}))}
 };
}
/** The destination snapshot supplies original months during restoration. */
export function makeEducationAdapter(owner:string,before:Snapshot,destination:Snapshot|undefined,operationId:string):SectionAdapter {
 const port=makeEducationPort(owner,before);let target:EducationValue[]=[];
 const persist=async(progress:EducationProgress)=>persistEducationProgress(progress);
 return {
  isNoop(){return JSON.stringify(canonical(target))===JSON.stringify(canonical(snapshotEducation(before)))},
  async preflight(profileUrl,profile){target=destination?snapshotEducation(destination):generatedEducation(profile.education);await port.preflight(profileUrl,before);const plan=planEducation(operationId,owner,before,target);for(const step of plan.steps){if(step.kind==='delete')continue;const path=step.kind==='edit'?`details/education/edit/forms/${step.id}/`:'edit/forms/education/new/';const id=await open(owner,path);try{const reply=await chrome.tabs.sendMessage(id,{action:'validateEducation',profileUrl:owner,...(step.kind==='edit'?{id:step.id,before:step.before}:{}),target:step.record}) as {ok:boolean;error?:string};if(!reply?.ok)throw new Error(reply?.error||'Education preflight failed')}finally{await chrome.tabs.remove(id).catch(()=>{})}}},
  async submit(){const plan=planEducation(operationId,owner,before,target);const result=await runEducation(plan,before,target,port,persist);if(result.status!=='complete')throw new Error(result.error||'Education replacement needs recovery')},
  async verify(){const current=await port.readRecords();return JSON.stringify(canonical(current))===JSON.stringify(canonical(target))}
 };
}
