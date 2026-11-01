import {scanIntro} from './scanIntro';
import {scanAbout} from './scanAbout';
import {scanEducation} from './scanEducation';
import {assertOwner} from './ownership';
import type {Profile} from './contract';
import type {z} from 'zod';
import type {educationRecord} from './snapshot';
export type ScanResult={profileUrl:string;content:Profile;educationRecords?:z.infer<typeof educationRecord>[]};
export type ScanStages={intro:(input:Profile)=>Promise<ScanResult>;about:(input:Profile)=>Promise<ScanResult>;education:(input:Profile)=>Promise<ScanResult>};
/** Build the generation input atomically. This does not create a restoration snapshot. */
export async function scanProfile(onProgress:(step:string)=>void,stages:ScanStages={intro:scanIntro,about:scanAbout,education:scanEducation}):Promise<ScanResult>{
 const empty:Profile={headline:'',location:'',industry:'',about:'',education:[]};
 onProgress('Reading intro');const intro=await stages.intro(empty);
 onProgress('Reading About');const about=await stages.about(intro.content);assertOwner(about.profileUrl,intro.profileUrl);
 onProgress('Reading education');const education=await stages.education(about.content);assertOwner(education.profileUrl,intro.profileUrl);
 onProgress('Scan finished');return education;
}
