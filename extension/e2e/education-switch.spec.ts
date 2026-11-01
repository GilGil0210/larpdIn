import {test,expect} from '@playwright/test';

test('education replacement verifies each simulated browser change',async({page})=>{
 await page.goto('/');
 await page.setContent('<main><ul id="education"><li data-id="old">Old school</li></ul><button id="delete">Delete</button><label>School<input id="school"></label><button id="add">Save education</button></main>');
 await page.evaluate(()=>{document.querySelector('#delete')!.addEventListener('click',()=>document.querySelector('[data-id="old"]')?.remove());document.querySelector('#add')!.addEventListener('click',()=>{const li=document.createElement('li');li.textContent=(document.querySelector('#school') as HTMLInputElement).value;document.querySelector('#education')!.append(li)});});
 const result=await page.evaluate(async()=>{
  const {planEducation,runEducation}=await import('/src/educationSwitch.ts');
  const make=(school:string)=>({school,degree:'',fieldOfStudy:'',startYear:null,endYear:null,grade:'',activities:'',description:''});
  const old=make('Old school'),target=[{...make('New school'),startMonth:null,endMonth:null}],url='https://www.linkedin.com/in/example/';
  const original={profileUrl:url,capturedAt:'2026-01-01T00:00:00.000Z',content:{headline:'',location:'',industry:'',about:'',education:[old]},introDetails:{firstName:'',lastName:'',additionalName:'',pronouns:'',education:'',headline:'',country:'',city:'',industry:''},educationRecordIds:['old'],educationRecords:[{...old,id:'old',startMonth:null,endMonth:null,skills:[],media:[],attachmentsInspected:true}],ownershipVerified:true as const,introCaptured:true as const,aboutCaptured:true as const,educationListCaptured:true as const};
  const events:string[]=[];
  const port={preflight:async()=>{},deleteRecord:async()=>{(document.querySelector('#delete') as HTMLButtonElement).click()},addRecord:async(item:ReturnType<typeof make>)=>{(document.querySelector('#school') as HTMLInputElement).value=item.school;(document.querySelector('#add') as HTMLButtonElement).click()},readRecords:async()=>Array.from(document.querySelectorAll('#education li')).map(el=>({...make(el.textContent||''),startMonth:null,endMonth:null}))};
  const progress=await runEducation(planEducation('fixture',url,original,target),original,target,port,async p=>{events.push(`${p.status}:${p.inFlight?.kind??'none'}:${p.next}`)});
  return {progress,events};
 });
 expect(result.progress.status).toBe('complete');expect(result.events).toEqual(['running:delete:0','running:none:1','running:add:1','running:none:2','complete:none:2']);
 await expect(page.locator('#education li')).toHaveText(['New school']);
});
