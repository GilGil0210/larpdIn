import {z} from 'zod';
import {profile} from './contract';
import {profileKey} from './storage';

/** Each education editor must be visited and recorded; list identities come from the profile's education list. */
export const educationRecord = z.object({
 id:z.string().min(1), school:z.string(), degree:z.string(), fieldOfStudy:z.string(),
 startYear:z.number().int().nullable(),endYear:z.number().int().nullable(),
 startMonth:z.number().int().min(1).max(12).nullable(),endMonth:z.number().int().min(1).max(12).nullable(),
 grade:z.string(),activities:z.string(),description:z.string(),
 skills:z.array(z.object({id:z.string().min(1),name:z.string().min(1)}).strict()),
 media:z.array(z.object({id:z.string().min(1),title:z.string(),description:z.string(),kind:z.enum(['link','file']),source:z.string().min(1)}).strict().superRefine((item,ctx)=>{if(item.kind==='link'){try{const url=new URL(item.source);if(!['https:','http:'].includes(url.protocol))throw Error()}catch{ctx.addIssue({code:'custom',message:'Invalid media link'})}}else if(!item.source.startsWith('data:'))ctx.addIssue({code:'custom',message:'File media data is missing'})})),
 // A collector must positively establish these; an absent DOM match is not evidence of an empty list.
 attachmentsInspected:z.boolean()
}).strict();
export const introDetails=z.object({firstName:z.string(),lastName:z.string(),additionalName:z.string(),pronouns:z.string(),education:z.string(),headline:z.string(),country:z.string(),city:z.string(),industry:z.string()}).strict();
export const snapshot = z.object({profileUrl:z.string(),capturedAt:z.string().datetime(),content:profile,introDetails,
 educationRecordIds:z.array(z.string().min(1)), educationRecords:z.array(educationRecord),
 ownershipVerified:z.literal(true), introCaptured:z.literal(true),aboutCaptured:z.literal(true),educationListCaptured:z.literal(true)
}).strict().superRefine((value,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 try {profileKey(value.profileUrl)} catch {fail('Invalid profile URL')}
 const intro=value.introDetails;if(intro.headline!==value.content.headline || intro.industry!==value.content.industry || (intro.city||intro.country)!==value.content.location)fail('Intro details do not match profile');
 const ids=value.educationRecordIds, records=value.educationRecords;
 if(new Set(ids).size!==ids.length || new Set(records.map(x=>x.id)).size!==records.length) fail('Duplicate education records');
 if(ids.length!==records.length || ids.some((id,i)=>id!==records[i]?.id)) fail('Education list and captured records differ');
 if(records.length!==value.content.education.length) fail('Education content is incomplete');
 records.forEach((record,i)=>{
  if(!record.attachmentsInspected) fail('Education attachments were not fully captured');
  const item=value.content.education[i];
  if(item && Object.entries(item).some(([key,val])=>record[key as keyof typeof item]!==val)) fail('Education snapshot does not match profile');
 });
});
export type Snapshot=z.infer<typeof snapshot>;

/** Captured attachments must not be discarded until their restoration is supported. */
export function assertRestorable(value:Snapshot):void {const checked=snapshot.parse(value);if(checked.educationRecords.some(record=>record.skills.length||record.media.length))throw new Error('Restoration of education skills or media is not supported yet');}
