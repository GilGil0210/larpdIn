import type {SectionAdapter} from '../runner';
import type {IntroValues} from './intro';
import {assertOwner,resolveOwnProfile} from '../ownership';
import type {Snapshot} from '../snapshot';

type Reply={ok:true;value?:IntroValues;submitted?:boolean}|{ok:false;error:string};
async function openIntro(owner:string):Promise<number>{
 const tab=await chrome.tabs.create({url:new URL('edit/intro/',owner).href,active:false});if(tab.id===undefined)throw new Error('Could not open intro editor');const id=tab.id;
 try {const end=Date.now()+15000;let last:unknown;while(Date.now()<end){try{const t=await chrome.tabs.get(id);if(t.status==='complete'&&t.url&&new URL(t.url).pathname===new URL('edit/intro/',owner).pathname){await chrome.scripting.executeScript({target:{tabId:id},files:['editBridge.js']});return id}}catch(e){last=e}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error(`Intro editor did not load${last instanceof Error?`: ${last.message}`:''}`)}catch(error){await chrome.tabs.remove(id).catch(()=>{});throw error}
}
async function send(id:number,message:object):Promise<Extract<Reply,{ok:true}>>{const reply=await chrome.tabs.sendMessage(id,message) as Reply;if(!reply || !reply.ok)throw new Error(reply && !reply.ok?reply.error:'Intro editor did not respond');return reply}
export async function readIntroValues(owner:string):Promise<IntroValues>{const id=await openIntro(owner);try{const reply=await send(id,{action:'readIntro',profileUrl:owner});if(!reply.value)throw new Error('Intro values missing');return reply.value}finally{await chrome.tabs.remove(id).catch(()=>{})}}
export function makeIntroAdapter(owner:string,before:IntroValues,destination?:Snapshot):SectionAdapter {
 const fields=(target:{headline:string;location:string;industry:string})=>{const parts=target.location.split(',').map(part=>part.trim()).filter(Boolean);return destination?{headline:destination.introDetails.headline,location:destination.introDetails.city,industry:destination.introDetails.industry,country:destination.introDetails.country}:{headline:target.headline,location:target.location,industry:target.industry,country:parts.length>=3?parts[parts.length-1]:before.country}};
 const verifyOwner=async()=>assertOwner(await resolveOwnProfile(),owner);
 return {
  isNoop(target){const desired=fields(target);return desired.headline===before.headline&&desired.location===before.city&&desired.industry===before.industry&&desired.country===before.country},
  async preflight(profileUrl,target){assertOwner(profileUrl,owner);if(destination){assertOwner(destination.profileUrl,owner);}await verifyOwner();const current=await readIntroValues(owner);if((Object.keys(before) as (keyof IntroValues)[]).some(key=>before[key]!==current[key]))throw new Error('Intro changed since the snapshot');const id=await openIntro(owner);try{await send(id,{action:'validateIntro',profileUrl:owner,before,target:fields(target)})}finally{await chrome.tabs.remove(id).catch(()=>{})}},
  async submit(target){await verifyOwner();const id=await openIntro(owner);try{const reply=await send(id,{action:'submitIntro',profileUrl:owner,before,target:fields(target)});if(!reply.submitted)throw new Error('Intro was not submitted');const end=Date.now()+15000;while(Date.now()<end){const tab=await chrome.tabs.get(id);if(tab.url&&!new URL(tab.url).pathname.includes('/edit/intro'))return;await new Promise(resolve=>setTimeout(resolve,250))}throw new Error('Intro save was not acknowledged')}finally{await chrome.tabs.remove(id).catch(()=>{})}},
  async verify(target){await verifyOwner();const current=await readIntroValues(owner);const expected=fields(target);return current.headline===expected.headline&&current.city===expected.location&&current.industry===expected.industry&&current.firstName===before.firstName&&current.lastName===before.lastName&&current.additionalName===before.additionalName&&current.pronouns===before.pronouns&&current.education===before.education&&current.country===expected.country}
 };
}
