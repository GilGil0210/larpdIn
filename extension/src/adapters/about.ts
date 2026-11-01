import type {Profile} from '../contract';
import type {SectionAdapter} from '../runner';
import {findSummaryEditor,scanAbout} from '../scanAbout';
import {resolveOwnProfile,assertOwner} from '../ownership';

/** Self-contained for chrome.scripting. Refuses to touch a different or ambiguous form. */
export async function submitAboutForm({owner,expected,target}:{owner:string;expected:string;target:string}):Promise<boolean> {
 const url=new URL(location.href), path=url.pathname.match(/^\/in\/([^/]+)\/edit\/forms\/summary\/[^/]+\/?$/);
 const expectedUrl=new URL(owner);
 if(url.origin!=='https://www.linkedin.com'||!path||expectedUrl.origin!==url.origin||expectedUrl.pathname.replace(/\/$/,'').toLowerCase()!==`/in/${path[1]}`.toLowerCase())throw new Error('Unexpected About editor');
 const root=document.querySelector('dialog[open], [role="dialog"]')??document.querySelector('main')??document.body;
 const fields=Array.from(root.querySelectorAll<HTMLTextAreaElement|HTMLElement>('textarea,[contenteditable]:not([contenteditable="false"])')).filter(el=>!('disabled' in el)||!el.disabled);
 const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(el=>!el.disabled&&(el.getAttribute('aria-label')||el.textContent||'').trim()==='Save');
 if(fields.length!==1||buttons.length!==1)throw new Error('About editor controls are ambiguous');
 const field=fields[0];const read=()=>{if(field instanceof HTMLTextAreaElement)return field.value;const paragraphs=Array.from(field.children);return paragraphs.length&&paragraphs.every(p=>p.tagName==='P')?paragraphs.map(p=>p.textContent||'').join('\n'):field.textContent||''};const same=(a:string,b:string)=>a.split(/\n+/).map(x=>x.trim()).filter(Boolean).join('\n')===b.split(/\n+/).map(x=>x.trim()).filter(Boolean).join('\n');if(!same(read(),expected))throw new Error('About changed since the snapshot');
 if(field instanceof HTMLTextAreaElement){const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(!setter)throw new Error('Text setter unavailable');setter.call(field,target)}else{const wait=()=>new Promise(resolve=>setTimeout(resolve,400));field.focus();document.getSelection()?.selectAllChildren(field);const data=new DataTransfer();data.setData('text/plain',target);field.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));await wait();if(!same(read(),target)){field.focus();document.getSelection()?.selectAllChildren(field);document.execCommand('insertText',false,target);await wait()}}
 field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
 if(!same(read(),target))throw new Error('About field did not accept the target');await new Promise(resolve=>setTimeout(resolve,300));
 buttons[0].click();return true;
}
/** True once the About dialog has rendered exactly one text field and one Save button. */
export function aboutEditorReady():boolean {
 const root=document.querySelector('dialog[open], [role="dialog"]');if(!root||!/\/edit\/forms\/summary\//.test(location.pathname))return false;
 const fields=root.querySelectorAll('textarea,[contenteditable]:not([contenteditable="false"])').length;
 const saves=Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(el=>!el.disabled&&(el.getAttribute('aria-label')||el.textContent||'').trim()==='Save').length;
 return fields===1&&saves===1;
}
/** Returns true only after the editor is no longer active. */
export function aboutEditorClosed():boolean {
 if(!/\/edit\/forms\/summary\//.test(location.pathname))return true;
 const root=document.querySelector('dialog[open], [role="dialog"]')??document.querySelector('main')??document.body;
 return !Array.from(root.querySelectorAll('textarea,[contenteditable]:not([contenteditable="false"])')).length;
}
async function poll<T>(id:number,read:()=>Promise<T>,accept:(value:T)=>boolean,timeout=15000):Promise<T>{const end=Date.now()+timeout;let last:unknown;while(Date.now()<end){try{const tab=await chrome.tabs.get(id);if(tab.status==='complete'){const result=await read();if(accept(result))return result}}catch(error){last=error}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error(`About editor did not become ready${last instanceof Error?`: ${last.message}`:''}`)}
async function openEditor(owner:string):Promise<number>{
 const tab=await chrome.tabs.create({url:owner,active:false});if(tab.id===undefined)throw new Error('Could not open profile');const id=tab.id;
 try {const url=await poll(id,async()=>{const r=await chrome.scripting.executeScript({target:{tabId:id},func:findSummaryEditor});if(!r[0]?.result)throw new Error('About editor missing');return r[0].result},()=>true);await chrome.tabs.update(id,{url});return id;}catch(error){await chrome.tabs.remove(id).catch(()=>{});throw error}
}
export function makeAboutAdapter(owner:string,before:Profile):SectionAdapter {
 return {
  isNoop(target){const norm=(text:string)=>text.split(/\n+/).map(line=>line.trim()).filter(Boolean).join('\n');return norm(target.about)===norm(before.about)},
  async preflight(profileUrl){assertOwner(profileUrl,owner);assertOwner(await resolveOwnProfile(),owner);const result=await scanAbout(before);assertOwner(result.profileUrl,owner);if(result.content.about!==before.about)throw new Error('About changed since the snapshot')},
  async submit(target){
   assertOwner(await resolveOwnProfile(),owner);const id=await openEditor(owner);
   try {
    // Wait until the expected editor URL is loaded before the single submission attempt.
    await poll(id,async()=>{const tab=await chrome.tabs.get(id);return tab.url||''},url=>new URL(url||owner).pathname.includes('/edit/forms/summary/'));
    await poll(id,async()=>{const r=await chrome.scripting.executeScript({target:{tabId:id},func:aboutEditorReady});return r[0]?.result===true},x=>x).catch(()=>{});
    // Save closes the editor; a result lost to that navigation is followed by the closed-editor poll and verification.
    const submitted=await chrome.scripting.executeScript({target:{tabId:id},func:submitAboutForm,args:[{owner,expected:before.about,target:target.about}]}).catch(error=>{if(error instanceof Error&&/Frame with ID|message port closed|Receiving end does not exist|page was navigated|No frame with id/.test(error.message))return [{result:true}];throw error});if(submitted[0]?.result!==true)throw new Error('About editor did not accept the new text');
    await poll(id,async()=>{const r=await chrome.scripting.executeScript({target:{tabId:id},func:aboutEditorClosed});return r[0]?.result===true},x=>x);
   } finally {await chrome.tabs.remove(id).catch(()=>{})}
  },
  async verify(target){const result=await scanAbout(target);assertOwner(result.profileUrl,owner);const norm=(text:string)=>text.split(/\n+/).map(line=>line.trim()).filter(Boolean).join('\n');return norm(result.content.about)===norm(target.about)}
 };
}
