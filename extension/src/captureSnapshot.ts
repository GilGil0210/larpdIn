import {z} from 'zod';
import {educationRecord,introDetails,snapshot,type Snapshot} from './snapshot';
import {assertOwner,resolveOwnProfile} from './ownership';
import {readIntroValues} from './adapters/liveIntro';
import {scanAbout} from './scanAbout';
import {scanEducation} from './scanEducation';
import type {Profile} from './contract';

type Intro=z.infer<typeof introDetails>;
type RecordValue=z.infer<typeof educationRecord>;
type EducationCapture={profileUrl:string;records:RecordValue[];listComplete:boolean};
export interface CaptureSources {
 owner():Promise<string>;
 intro(owner:string):Promise<Intro>;
 about():Promise<{profileUrl:string;about:string}>;
 education():Promise<EducationCapture>;
}
const blank:Profile={headline:'',location:'',industry:'',about:'',education:[]};
/** The live scanner reports list evidence separately from attachment evidence. */
export const liveCaptureSources:CaptureSources={
 owner:resolveOwnProfile,
 intro:readIntroValues,
 async about(){const result=await scanAbout(blank);return {profileUrl:result.profileUrl,about:result.content.about}},
 async education(){const result=await scanEducation(blank,undefined,undefined,{background:true});return {profileUrl:result.profileUrl,records:result.educationRecords,listComplete:result.listComplete}}
};
/** Capture twice and refuse to save a snapshot if ownership, content, or evidence changes. */
export async function captureSnapshot(profileUrl:string,sources:CaptureSources=liveCaptureSources,options:{passes?:1|2}={}):Promise<Snapshot>{
 const owner=await sources.owner();assertOwner(profileUrl,owner);
 async function collect(){
  // Independent LinkedIn pages: load them concurrently.
  const [introRaw,about,education]=await Promise.all([sources.intro(owner),sources.about(),sources.education()]);
  const intro=introDetails.parse(introRaw);assertOwner(about.profileUrl,owner);assertOwner(education.profileUrl,owner);
  const records=z.array(educationRecord).parse(education.records);
  if(records.some(record=>!record.attachmentsInspected))throw new Error('Education attachment capture is incomplete');
  return {intro,about:about.about,records,listComplete:education.listComplete};
 }
 const first=await collect();if((options.passes??2)===2){const second=await collect();assertOwner(await sources.owner(),owner);if(JSON.stringify(first)!==JSON.stringify(second))throw new Error('Profile changed during snapshot capture');}
 const content:Profile={headline:first.intro.headline,location:first.intro.city||first.intro.country,industry:first.intro.industry,about:first.about,education:first.records.map(({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description})=>({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description}))};
 return snapshot.parse({schemaVersion:1,educationComplete:first.listComplete,profileUrl:owner,capturedAt:new Date().toISOString(),content,introDetails:first.intro,educationRecordIds:first.records.map(record=>record.id),educationRecords:first.records,ownershipVerified:true,introCaptured:true,aboutCaptured:true,educationListCaptured:true});
}
