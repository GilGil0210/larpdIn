import {inspectLinkedInForm} from './inspection';
import {resolveOwnProfile,assertOwner} from './ownership';
import type {Profile} from './contract';

/** Executed in the profile tab; return only a unique same-profile summary editor. */
export function findSummaryEditor():string {
 const here=new URL(location.href);
 const root=here.pathname.match(/^\/in\/([^/]+)\/?$/);
 if(here.origin!=='https://www.linkedin.com'||!root) throw new Error('Expected a LinkedIn profile');
 const prefix=`/in/${root[1]}/edit/forms/summary/`;
 const links=Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map(a=>{try{return new URL(a.href)}catch{return null}}).filter((url):url is URL=>!!url && url.origin===here.origin && url.pathname.startsWith(prefix));
 const unique=[...new Set(links.map(x=>x.origin+x.pathname))];
 if(unique.length!==1) throw new Error(`Expected one About editor, found ${unique.length}`);
 return unique[0];
}
export function importAbout(inspection:ReturnType<typeof inspectLinkedInForm>,owner:string,current:Profile):Profile {
 const url=new URL(inspection.url);const match=url.pathname.match(/^\/in\/([^/]+)\/edit\/forms\/summary\/[^/]+\/?$/);
 if(url.origin!=='https://www.linkedin.com'||!match) throw new Error('Expected a LinkedIn About editor');
 assertOwner(`https://www.linkedin.com/in/${match[1]}/`,owner);
 const fields=inspection.fields.filter(field=>field.tag==='textarea');
 if(fields.length!==1) throw new Error(`Expected one About text field, found ${fields.length}`);
 return {...current,about:fields[0].value};
}
async function waitFor<T>(tabId:number,read:()=>Promise<T>,timeoutMs:number):Promise<T> {
 const end=Date.now()+timeoutMs;let error:unknown;
 while(Date.now()<end){try{const tab=await chrome.tabs.get(tabId);if(tab.status==='complete')return await read()}catch(e){error=e}await new Promise(resolve=>setTimeout(resolve,250));}
 throw new Error(`Could not scan About${error instanceof Error?`: ${error.message}`:''}`);
}
/** The caller receives partial profile content, never a restoration snapshot. */
export async function scanAbout(current:Profile,timeoutMs=15000):Promise<{profileUrl:string;content:Profile}> {
 const owner=await resolveOwnProfile();const tab=await chrome.tabs.create({url:owner,active:false});
 if(tab.id===undefined)throw new Error('Could not open LinkedIn profile');const id=tab.id;
 try {
  const editor=await waitFor(id,async()=>{const result=await chrome.scripting.executeScript({target:{tabId:id},func:findSummaryEditor});if(!result[0]?.result)throw new Error('No About editor');return result[0].result},timeoutMs);
  await chrome.tabs.update(id,{url:editor});
  const content=await waitFor(id,async()=>{const result=await chrome.scripting.executeScript({target:{tabId:id},func:inspectLinkedInForm});if(!result[0]?.result)throw new Error('No About form');return importAbout(result[0].result,owner,current)},timeoutMs);
  return {profileUrl:owner,content};
 } finally {await chrome.tabs.remove(id).catch(()=>{})}
}
