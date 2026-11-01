import {education,type Profile} from './contract';
import {resolveOwnProfile,assertOwner} from './ownership';
import {educationRecord} from './snapshot';
import type {z} from 'zod';

/** Both functions below run in the LinkedIn tab and have no module dependencies. */
export function findEducationEditors():string[] {
 const url=new URL(location.href);const match=url.pathname.match(/^\/in\/([^/]+)\/details\/education\/?$/);
 if(url.origin!=='https://www.linkedin.com'||!match)throw new Error('Expected the education list');
 const prefix=`/in/${match[1]}/details/education/edit/forms/`;
 const urls=Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map(a=>{try{return new URL(a.href)}catch{return null}}).filter((u):u is URL=>!!u&&u.origin===url.origin&&u.pathname.startsWith(prefix)&&/^\d+\/?$/.test(u.pathname.slice(prefix.length)));
 const unique=[...new Set(urls.map(u=>u.origin+u.pathname))];
 if(!unique.length){const main=document.querySelector('main');const text=main?.textContent?.replace(/\s+/g,' ').trim().toLowerCase()||'';if(!/\bno education (?:records|entries)\b/.test(text))throw new Error('No education editors found; an empty list cannot yet be confirmed');}
 return unique;
}
/** Require complete ARIA set metadata for every linked record; unknown layouts are not proof. */
export function educationListIsComplete():boolean {
 const url=new URL(location.href),match=url.pathname.match(/^\/in\/([^/]+)\/details\/education\/?$/);
 if(url.origin!=='https://www.linkedin.com'||!match)return false;
 const prefix=`/in/${match[1]}/details/education/edit/forms/`;
 const main=document.querySelector('main');if(!main||main.querySelector('[aria-busy="true"], [role="progressbar"], [data-placeholder], [data-lazy-mount-id]:empty, [class*="skeleton" i]'))return false;
 if(Array.from(main.querySelectorAll<HTMLElement>('button,a')).some(el=>/^(show more|load more|next)$/i.test((el.getAttribute('aria-label')||el.textContent||'').trim())&&!el.hasAttribute('disabled')&&el.getAttribute('aria-disabled')!=='true'))return false;
 const links=Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(a=>{try{const u=new URL(a.href);return u.origin===url.origin&&u.pathname.startsWith(prefix)&&/^\d+\/?$/.test(u.pathname.slice(prefix.length))}catch{return false}});
 if(!links.length){const statuses=Array.from(document.querySelectorAll('[role="status"]')).filter(el=>/^no education (records|entries)[.!]?$/i.test((el.textContent||'').trim()));return statuses.length===1}
 const byPath=new Map<string,HTMLElement>();
 for(const link of links){const item=link.closest<HTMLElement>('[role="listitem"]');if(!item)return false;const path=new URL(link.href).pathname;const prior=byPath.get(path);if(prior&&prior!==item)return false;byPath.set(path,item)}
 const items=[...byPath.values()];if(new Set(items).size!==items.length)return false;
 const parent=items[0].parentElement;if(!parent||items.some(item=>item.parentElement!==parent))return false;
 if(parent.querySelector('button,[aria-label*="more" i],[aria-label*="next" i]'))return false;
 const size=Number(items[0].getAttribute('aria-setsize'));if(!Number.isInteger(size)||size!==items.length)return false;
 const positions=items.map(item=>Number(item.getAttribute('aria-posinset'))).sort((a,b)=>a-b);
 return items.every(item=>Number(item.getAttribute('aria-setsize'))===size)&&positions.every((pos,index)=>pos===index+1);
}
/** Advance one explicitly named collection control or scroll to trigger lazy loading. */
export function advanceEducationCollection():boolean {
 const main=document.querySelector('main');if(!main)throw new Error('Education collection is unavailable');
 if(main.querySelector('[aria-busy="true"], [role="progressbar"]'))return false;
 const controls=Array.from(main.querySelectorAll<HTMLButtonElement>('button')).filter(button=>!button.disabled&&/^(show more|load more)$/i.test((button.getAttribute('aria-label')||button.textContent||'').trim()));
 if(controls.length>1)throw new Error('Education pagination controls are ambiguous');
 if(controls.length===1){controls[0].click();return true}
 window.scrollTo(0,document.documentElement.scrollHeight);return false;
}
export function readEducationEditor(){
 const url=new URL(location.href),path=url.pathname.match(/^\/in\/([^/]+)\/details\/education\/edit\/forms\/(\d+)\/?$/);
 if(url.origin!=='https://www.linkedin.com'||!path)throw new Error('Expected an education editor');
 const root=document.querySelector('dialog[open], [role="dialog"]')??document.querySelector('main')??document.body;
 const fields=Array.from(root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')).filter(el=>el.type!=='hidden');
 const field=(name:string)=>{const found=fields.filter(el=>{const label=el.getAttribute('aria-label')||Array.from(el.labels??[]).map(l=>{const copy=l.cloneNode(true) as HTMLElement;copy.querySelectorAll('input,textarea,select').forEach(x=>x.remove());return copy.textContent?.trim()||''}).join(' ');return label.replace(/\s*\*\s*$/,'').trim().toLowerCase()===name.toLowerCase()});if(found.length!==1)throw new Error(`Expected one ${name} field, found ${found.length}`);return found[0].value};
 const selects=Array.from(root.querySelectorAll<HTMLSelectElement>('select'));
 if(selects.length!==4)throw new Error(`Expected four education date controls, found ${selects.length}`);
 const kinds=['month','year','month','year'];
 selects.forEach((el,i)=>{const label=(el.getAttribute('aria-label')||Array.from(el.labels??[]).map(x=>x.textContent||'').join(' ')).toLowerCase();if(!label.includes(kinds[i]))throw new Error(`Unexpected education date control ${i+1}`)});
 const selected=selects.map(el=>el.selectedOptions[0]?.textContent?.trim()||'');
 const year=(value:string)=>{if(!value||value.toLowerCase()==='year')return null;if(!/^\d{4}$/.test(value))throw new Error('Unexpected education year');return Number(value)};
 const month=(value:string)=>{if(!value||value.toLowerCase()==='month')return null;const months=['january','february','march','april','may','june','july','august','september','october','november','december'];const number=/^\d+$/.test(value)?Number(value):months.indexOf(value.toLowerCase())+1;if(number<1||number>12)throw new Error('Unexpected education month');return number};
 const data={school:field('School'),degree:field('Degree'),fieldOfStudy:field('Field of study'),startYear:year(selected[1]),endYear:year(selected[3]),grade:field('Grade'),activities:field('Activities and societies'),description:field('Description')};
 const explicitlyEmpty=(label:string)=>{const lists=Array.from(root.querySelectorAll<HTMLElement>('[role="list"]')).filter(el=>(el.getAttribute('aria-label')||'').trim().toLowerCase()===label.toLowerCase());return lists.length===1&&lists[0].getAttribute('aria-setsize')==='0'&&!(lists[0].textContent||'').trim()&&!lists[0].querySelector('[role="listitem"],li,a,img,video,button,input')};
 // This exact empty-state structure was observed in LinkedIn's English education editor.
 // Any unknown children or duplicated controls make the result incomplete.
 const skills=Array.from(root.querySelectorAll<HTMLElement>('ul[componentkey="skillsComponentRef"][data-component-type="LazyColumn"]'));
 const media=Array.from(root.querySelectorAll<HTMLElement>('div[data-component-type="LazyColumn"][data-testid$="education.dataAwareAddEducationFormComponent-education-mediaUiCollection"]'));
 const skillButtons=root.querySelectorAll('button[componentkey="addSkillButtonRef"]');
 const mediaButtons=root.querySelectorAll('button[componentkey$="_education_addMedia"]');
 const linkedInEmpty=skills.length===1&&media.length===1&&skillButtons.length===1&&mediaButtons.length===1&&
  Array.from(skills[0].children).every(child=>child.tagName==='DIV'&&(/^DndDescribedBy-\d+$/.test(child.id)||/^DndLiveRegion-\d+$/.test(child.id)))&&
  !skills[0].querySelector('li,[role="listitem"],a,button,input,img')&&media[0].children.length===0&&!(media[0].textContent||'').trim();
 const attachmentsInspected=linkedInEmpty||(explicitlyEmpty('Education skills')&&explicitlyEmpty('Education media'));
 return {profileUrl:`https://www.linkedin.com/in/${path[1]}/`,id:path[2],content:data,startMonth:month(selected[0]),endMonth:month(selected[2]),attachmentsInspected};
}
async function readWhenReady<T>(id:number,fn:()=>T,timeoutMs:number):Promise<T>{const end=Date.now()+timeoutMs;let error:unknown;while(Date.now()<end){try{const tab=await chrome.tabs.get(id);if(tab.status==='complete'){const result=await chrome.scripting.executeScript({target:{tabId:id},func:fn});if(result[0]?.result!==undefined)return result[0].result as T}}catch(e){error=e}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error(`Could not scan education${error instanceof Error?`: ${error.message}`:''}`)}
/** Imports visible records for generation only. It cannot establish restoration completeness. */
export async function scanEducation(current:Profile,timeoutMs=15000):Promise<{profileUrl:string;content:Profile;educationRecords:z.infer<typeof educationRecord>[];listComplete:boolean}> {
 const owner=await resolveOwnProfile();const tab=await chrome.tabs.create({url:new URL('details/education/',owner).href,active:false});if(tab.id===undefined)throw new Error('Could not open education list');const id=tab.id;
 try {let links:string[]=[],listComplete=false,prior:string[]|null=null;const end=Date.now()+timeoutMs;let lastError:unknown;
  while(Date.now()<end){try{
   links=await readWhenReady(id,findEducationEditors,Math.min(2000,Math.max(250,end-Date.now())));
   const complete=await readWhenReady(id,educationListIsComplete,Math.min(2000,Math.max(250,end-Date.now())));
   if(complete&&prior&&JSON.stringify(prior)===JSON.stringify(links)){listComplete=true;break}
   prior=complete?[...links]:null;
   await chrome.scripting.executeScript({target:{tabId:id},func:advanceEducationCollection});
  }catch(error){lastError=error;prior=null}
  await new Promise(resolve=>setTimeout(resolve,350));}
  if(!links.length&&!listComplete&&lastError)throw lastError;
  const records: z.infer<typeof educationRecord>[]=[];for(const link of links){await chrome.tabs.update(id,{url:link});const result=await readWhenReady(id,readEducationEditor,timeoutMs);assertOwner(result.profileUrl,owner);if(new URL(link).pathname!==new URL(`details/education/edit/forms/${result.id}/`,owner).pathname)throw new Error('Unexpected education record');const parsed=education.parse(result.content);records.push(educationRecord.parse({...parsed,id:result.id,startMonth:result.startMonth,endMonth:result.endMonth,skills:[],media:[],attachmentsInspected:result.attachmentsInspected}))}return {profileUrl:owner,content:{...current,education:records.map(({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description})=>({school,degree,fieldOfStudy,startYear,endYear,grade,activities,description}))},educationRecords:records,listComplete}} finally {await chrome.tabs.remove(id).catch(()=>{})}
}
