import {z} from 'zod';
import {profile} from './contract';
import {profileKey} from './storage';

export const section = z.enum(['intro','about','education']);
export type Section = z.infer<typeof section>;
import {snapshot,assertRestorable} from './snapshot';
export {snapshot} from './snapshot';
export type {Snapshot} from './snapshot';
const state = z.enum(['pending','submitting','verified','failed','uncertain']);
export const operation = z.object({id:z.string().uuid(),profileUrl:z.string(),target:profile,before:snapshot,sections:z.object({intro:state,about:state,education:state}).strict(),status:z.enum(['running','interrupted','failed','committing','complete']),destination:snapshot.optional(),personaId:z.string().uuid().nullable().optional(),recoveryOf:z.string().uuid().optional(),error:z.string().optional()}).strict();
export type Operation = z.infer<typeof operation>;
export function createOperation(profileUrl:string,target:unknown,before:unknown,options:{destination?:unknown;personaId?:string|null;recoveryOf?:string}={}):Operation {
 const original=snapshot.parse(before); assertRestorable(original); if(profileKey(profileUrl)!==profileKey(original.profileUrl)) throw new Error('Snapshot belongs to a different profile');
 const destination=options.destination===undefined?undefined:snapshot.parse(options.destination);if(destination)assertRestorable(destination);if(destination && profileKey(destination.profileUrl)!==profileKey(profileUrl))throw new Error('Destination belongs to a different profile');
 const desired=profile.parse(target);if(destination && JSON.stringify(destination.content)!==JSON.stringify(desired))throw new Error('Destination does not match target');
 return operation.parse({id:crypto.randomUUID(),profileUrl,target:desired,before:original,...(destination?{destination}:{}),...(options.personaId!==undefined?{personaId:options.personaId}:{}),...(options.recoveryOf?{recoveryOf:options.recoveryOf}:{}),sections:{intro:'pending',about:'pending',education:'pending'},status:'running'});
}
export function recover(op:Operation):Operation {
 const current=operation.parse(op); if(current.status!=='running') return current;
 const sections={...current.sections}; for(const key of section.options) if(sections[key]==='submitting') sections[key]='uncertain';
 return {...current,sections,status:'interrupted'};
}
export function beginSection(op:Operation,key:Section):Operation {
 if(op.status!=='running'||op.sections[key]!=='pending') throw new Error('Section cannot be submitted');
 const order:Section[]=['intro','about','education']; if(order.slice(0,order.indexOf(key)).some(s=>op.sections[s]!=='verified')) throw new Error('Previous sections are not verified');
 return {...op,sections:{...op.sections,[key]:'submitting'}};
}
/** Mark a section verified without a submission after an independent read. */
export function verifyUnchanged(op:Operation,key:Section):Operation {
 if(op.status!=='running'||op.sections[key]!=='pending')throw new Error('Section cannot be verified');
 const order:Section[]=['intro','about','education'];if(order.slice(0,order.indexOf(key)).some(s=>op.sections[s]!=='verified'))throw new Error('Previous sections are not verified');
 const sections={...op.sections,[key]:'verified' as const};return {...op,sections,status:Object.values(sections).every(value=>value==='verified')?'complete':'running'};
}
export function finishSection(op:Operation,key:Section,result:'verified'|'failed'|'uncertain',error?:string):Operation {
 if(op.status!=='running'||op.sections[key]!=='submitting') throw new Error('Section is not submitting');
 const sections={...op.sections,[key]:result}; return {...op,sections,status:result==='verified'?(Object.values(sections).every(v=>v==='verified')?'complete':'running'):'failed',...(error?{error}:{})};
}
export async function persistOperation(op:Operation):Promise<void> {await chrome.storage.local.set({[`operation:${profileKey(op.profileUrl)}`]:operation.parse(op)});}
export async function loadOperation(url:string):Promise<Operation|null> {const key=`operation:${profileKey(url)}`;const data=await chrome.storage.local.get(key);if(!data[key])return null;return operation.parse(data[key]);}
