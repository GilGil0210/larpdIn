import type {Profile} from '../contract';
import type {SectionAdapter} from '../runner';
import {findSummaryEditor,scanAbout} from '../scanAbout';
import {resolveOwnProfile,assertOwner} from '../ownership';

/** Self-contained for chrome.scripting. Refuses to touch a different or ambiguous form. */
export function submitAboutForm({owner,expected,target}:{owner:string;expected:string;target:string}):boolean {
 const url=new URL(location.href), path=url.pathname.match(/^\/in\/([^/]+)\/edit\/forms\/summary\/[^/]+\/?$/);
 const expectedUrl=new URL(owner);
 if(url.origin!=='https://www.linkedin.com'||!path||expectedUrl.origin!==url.origin||expectedUrl.pathname.replace(/\/$/,'').toLowerCase()!==`/in/${path[1]}`.toLowerCase())throw new Error('Unexpected About editor');
 const root=document.querySelector('dialog[open], [role="dialog"]')??document.querySelector('main')??document.body;
 const fields=Array.from(root.querySelectorAll<HTMLTextAreaElement>('textarea')).filter(el=>!el.disabled);
 const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(el=>!el.disabled&&(el.getAttribute('aria-label')||el.textContent||'').trim()==='Save');
 if(fields.length!==1||buttons.length!==1)throw new Error('About editor controls are ambiguous');
 const field=fields[0];if(field.value!==expected)throw new Error('About changed since the snapshot');
 const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(!setter)throw new Error('Text setter unavailable');
 setter.call(field,target);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
 if(field.value!==target)throw new Error('About field did not accept the target');
 buttons[0].click();return true;
}
/** Returns true only after the editor is no longer active. */
export function aboutEditorClosed():boolean {
 if(!/\/edit\/forms\/summary\//.test(location.pathname))return true;
 const root=document.querySelector('dialog[open], [role="dialog"]')??document.querySelector('main')??document.body;
 return !Array.from(root.querySelectorAll('textarea')).length;
}
async function poll<T>(id:number,read:()=>Promise<T>,accept:(value:T)=>boolean,timeout=15000):Promise<T>{const end=Date.now()+timeout;let last:unknown;while(Date.now()<end){try{const tab=await chrome.tabs.get(id);if(tab.status==='complete'){const result=await read();if(accept(result))return result}}catch(error){last=error}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error(`About editor did not become ready${last instanceof Error?`: ${last.message}`:''}`)}
async function openEditor(owner:string):Promise<number>{
 const tab=await chrome.tabs.create({url:owner,active:false});if(tab.id===undefined)throw new Error('Could not open profile');const id=tab.id;
 try {const url=await poll(id,async()=>{const r=await chrome.scripting.executeScript({target:{tabId:id},func:findSummaryEditor});if(!r[0]?.result)throw new Error('About editor missing');return r[0].result},()=>true);await chrome.tabs.update(id,{url});return id;}catch(error){await chrome.tabs.remove(id).catch(()=>{});throw error}
}
export function makeAboutAdapter(owner:string,before:Profile):SectionAdapter {
 return {
  isNoop(target){return target.about===before.about},
  async preflight(profileUrl){assertOwner(profileUrl,owner);assertOwner(await resolveOwnProfile(),owner);const result=await scanAbout(before);assertOwner(result.profileUrl,owner);if(result.content.about!==before.about)throw new Error('About changed since the snapshot')},
  async submit(target){
   assertOwner(await resolveOwnProfile(),owner);const id=await openEditor(owner);
   try {
    // Wait until the expected editor URL is loaded before the single submission attempt.
    await poll(id,async()=>{const tab=await chrome.tabs.get(id);return tab.url||''},url=>new URL(url||owner).pathname.includes('/edit/forms/summary/'));
    await chrome.scripting.executeScript({target:{tabId:id},func:submitAboutForm,args:[{owner,expected:before.about,target:target.about}]});
    await poll(id,async()=>{const r=await chrome.scripting.executeScript({target:{tabId:id},func:aboutEditorClosed});return r[0]?.result===true},x=>x);
   } finally {await chrome.tabs.remove(id).catch(()=>{})}
  },
  async verify(target){const result=await scanAbout(target);assertOwner(result.profileUrl,owner);return result.content.about===target.about}
 };
}
