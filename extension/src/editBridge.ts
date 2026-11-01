import {z} from 'zod';
import {readCompleteIntro,prepareIntro} from './adapters/intro';
import {findButton} from './form';
import {prepareEducation} from './adapters/education';
import {educationValue} from './educationSwitch';
import {readEducationEditor} from './scanEducation';
const intro=z.object({firstName:z.string(),lastName:z.string(),additionalName:z.string(),pronouns:z.string(),education:z.string(),headline:z.string(),country:z.string(),city:z.string(),industry:z.string()}).strict();
const request=z.discriminatedUnion('action',[
 z.object({action:z.literal('readIntro'),profileUrl:z.string().url()}).strict(),
 z.object({action:z.literal('validateIntro'),profileUrl:z.string().url(),before:intro,target:z.object({headline:z.string(),location:z.string(),industry:z.string(),country:z.string().optional()}).strict()}).strict(),
 z.object({action:z.literal('submitIntro'),profileUrl:z.string().url(),before:intro,target:z.object({headline:z.string(),location:z.string(),industry:z.string(),country:z.string().optional()}).strict()}).strict(),
 z.object({action:z.literal('submitEducation'),profileUrl:z.string().url(),target:educationValue}).strict(),
 z.object({action:z.literal('validateEducation'),profileUrl:z.string().url(),id:z.string().regex(/^\d+$/).optional(),before:educationValue.optional(),target:educationValue}).strict(),
 z.object({action:z.literal('editEducation'),profileUrl:z.string().url(),id:z.string().regex(/^\d+$/),before:educationValue,target:educationValue}).strict(),
 z.object({action:z.literal('deleteEducation'),profileUrl:z.string().url(),id:z.string().regex(/^\d+$/),before:educationValue}).strict()
]);
function expectedRoot(profileUrl:string,kind:'intro'|'education-new'|'education-edit',id?:string):ParentNode {
 const expected=new URL(profileUrl),current=new URL(location.href);
 const path=current.pathname.match(kind==='intro'?/^\/in\/([^/]+)\/edit\/intro\/?$/:kind==='education-new'?/^\/in\/([^/]+)\/edit\/forms\/education\/new\/?$/:/^\/in\/([^/]+)\/details\/education\/edit\/forms\/(\d+)\/?$/);
 if(kind==='education-edit' && path?.[2]!==id)throw new Error('Unexpected education record');
 if(expected.origin!=='https://www.linkedin.com'||current.origin!==expected.origin||!path||expected.pathname.replace(/\/$/,'').toLowerCase()!==`/in/${path[1]}`.toLowerCase()||expected.search||expected.hash)throw new Error('Unexpected LinkedIn editor');
 return document.querySelector('dialog[open], [role="dialog"]')??document.querySelector('main')??document.body;
}
const marker=globalThis as typeof globalThis & {__larpdinEditBridge?:boolean};
if(!marker.__larpdinEditBridge){
 marker.__larpdinEditBridge=true;
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return false;
  const parsed=request.safeParse(message);if(!parsed.success)return false;
  void (async()=>{try{
   const data=parsed.data;
   if(data.action==='readIntro'||data.action==='submitIntro'||data.action==='validateIntro'){const root=expectedRoot(data.profileUrl,'intro');if(data.action==='readIntro'){respond({ok:true,value:readCompleteIntro(root)});return}await prepareIntro(root,data.before,data.target);if(data.action==='validateIntro'){respond({ok:true});return}findButton(root,'Save').click();respond({ok:true,submitted:true});return}
   if(data.action==='validateEducation' && ((data.id===undefined)!==(data.before===undefined)))throw new Error('Education preflight identity is incomplete');
   const root=expectedRoot(data.profileUrl,data.action==='submitEducation'||(data.action==='validateEducation'&&!data.id)?'education-new':'education-edit',data.action==='deleteEducation'||data.action==='editEducation'||data.action==='validateEducation'?data.id:undefined);
   const switches=Array.from(root.querySelectorAll<HTMLElement>('[role="switch"]')).filter(el=>(el.getAttribute('aria-label')||'').toLowerCase().includes('notify'));
   if(switches.length!==1)throw new Error('The education notification control is unavailable');if(switches[0].getAttribute('aria-checked')==='true'){switches[0].click();for(let n=0;n<10&&switches[0].getAttribute('aria-checked')!=='false';n++)await new Promise(resolve=>setTimeout(resolve,50))}if(switches[0].getAttribute('aria-checked')!=='false')throw new Error('Could not turn off network notifications for this education change');
   if(data.action==='deleteEducation'||data.action==='editEducation'||(data.action==='validateEducation'&&data.id)){const read=readEducationEditor();if(!read.attachmentsInspected)throw new Error('Education attachments could not be verified immediately before deletion');const actual=educationValue.parse({...read.content,startMonth:read.startMonth,endMonth:read.endMonth});if(JSON.stringify(actual)!==JSON.stringify(data.before))throw new Error('Education changed since the snapshot');if(data.action==='deleteEducation'){findButton(root,'Delete education').click();respond({ok:true,submitted:true});return}}
   const selects=Array.from(root.querySelectorAll<HTMLSelectElement>('select'));if(selects.length!==4)throw new Error('Expected four education date controls');const labels=['month','year','month','year'];selects.forEach((el,i)=>{const label=(el.getAttribute('aria-label')||Array.from(el.labels??[]).map(x=>x.textContent||'').join(' ')).toLowerCase();if(!label.includes(labels[i]))throw new Error('Unexpected education date control')});
   const {startMonth,endMonth,...content}=data.target;await prepareEducation(root,content,{startMonth:selects[0],startYear:selects[1],endMonth:selects[2],endYear:selects[3]},{startMonth,endMonth});if(data.action==='validateEducation'){respond({ok:true});return}findButton(root,'Save').click();respond({ok:true,submitted:true});
  }catch(error){respond({ok:false,error:error instanceof Error?error.message:String(error)})}})();
  return true;
 });
}
