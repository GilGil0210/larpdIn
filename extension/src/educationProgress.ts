import {z} from 'zod';
import {educationValue,type EducationProgress} from './educationSwitch';
import {profileKey} from './storage';
const step=z.discriminatedUnion('kind',[z.object({kind:z.literal('delete'),id:z.string().min(1)}).strict(),z.object({kind:z.literal('edit'),id:z.string().min(1),index:z.number().int().nonnegative(),before:educationValue,record:educationValue}).strict(),z.object({kind:z.literal('add'),index:z.number().int().nonnegative(),record:educationValue}).strict()]);
const progressSchema=z.object({operationId:z.string().uuid(),profileUrl:z.string(),steps:z.array(step),next:z.number().int().nonnegative(),inFlight:step.nullable(),status:z.enum(['running','complete','uncertain']),error:z.string().optional()}).strict().superRefine((value,ctx)=>{
 if(value.next>value.steps.length)ctx.addIssue({code:'custom',message:'Invalid education progress position'});
 if(value.inFlight&&JSON.stringify(value.inFlight)!==JSON.stringify(value.steps[value.next]))ctx.addIssue({code:'custom',message:'Invalid in-flight education step'});
 if(value.status==='complete'&&(value.inFlight||value.next!==value.steps.length))ctx.addIssue({code:'custom',message:'Incomplete education operation'});
});
const key=(url:string,id:string)=>`education-progress:${profileKey(url)}:${z.string().uuid().parse(id)}`;
export async function persistEducationProgress(raw:EducationProgress):Promise<void>{const value=progressSchema.parse(raw);await chrome.storage.local.set({[key(value.profileUrl,value.operationId)]:value})}
/** Observing a checkpoint must never change the running operation. */
export async function loadEducationProgress(url:string,id:string):Promise<EducationProgress|null>{const storageKey=key(url,id);const data=await chrome.storage.local.get(storageKey);if(!data[storageKey])return null;const value=progressSchema.parse(data[storageKey]);if(profileKey(value.profileUrl)!==profileKey(url)||value.operationId!==id)throw new Error('Education checkpoint belongs to a different operation');return value}
