import {describe,it,expect} from 'vitest';
import {createOperation,beginSection,finishSection,recover,snapshot} from './operation';
const content={headline:'',location:'',industry:'',about:'',education:[]};
const original={profileUrl:'https://www.linkedin.com/in/example/',capturedAt:'2026-01-01T00:00:00.000Z',content,introDetails:{firstName:'',lastName:'',additionalName:'',pronouns:'',education:'',headline:'',country:'',city:'',industry:''},educationRecordIds:[],educationRecords:[],ownershipVerified:true,introCaptured:true,aboutCaptured:true,educationListCaptured:true};
describe('switch recovery',()=>{
 it('blocks incomplete or mismatched snapshots',()=>{expect(()=>snapshot.parse({...original,educationListCaptured:false})).toThrow();expect(()=>createOperation('https://www.linkedin.com/in/other/',content,original)).toThrow()});
 it('marks an interrupted submission uncertain and does not replay it',()=>{const op=beginSection(createOperation(original.profileUrl,content,original),'intro');const resumed=recover(op);expect(resumed.sections.intro).toBe('uncertain');expect(()=>beginSection(resumed,'intro')).toThrow()});
 it('requires sequential verification and only completes after all sections',()=>{let op=createOperation(original.profileUrl,content,original);expect(()=>beginSection(op,'about')).toThrow();for(const section of ['intro','about','education'] as const){op=beginSection(op,section);op=finishSection(op,section,'verified')}expect(op.status).toBe('complete')});
 it('captures attachment metadata but blocks a switch that could discard it',()=>{const edu={school:'School',degree:'',fieldOfStudy:'',startYear:null,endYear:null,grade:'',activities:'',description:''};const captured={...original,content:{...content,education:[edu]},educationRecordIds:['1'],educationRecords:[{...edu,id:'1',startMonth:null,endMonth:null,skills:[{id:'skill-1',name:'Research'}],media:[{id:'media-1',title:'Paper',description:'',kind:'link',source:'https://example.com/paper'}],attachmentsInspected:true}]};expect(snapshot.safeParse(captured).success).toBe(true);expect(()=>createOperation(original.profileUrl,captured.content,captured)).toThrow('not supported')});
});
it('rejects an uninspected education attachment area',()=>{const edu={school:'School',degree:'',fieldOfStudy:'',startYear:null,endYear:null,grade:'',activities:'',description:''};expect(()=>snapshot.parse({...original,content:{...content,education:[edu]},educationRecordIds:['1'],educationRecords:[{...edu,id:'1',startMonth:null,endMonth:null,skills:[],media:[],attachmentsInspected:false}]})).toThrow()});
it('requires intro details to match the profile before a snapshot can be used',()=>{expect(snapshot.safeParse({...original,introDetails:{...original.introDetails,city:'Different'}}).success).toBe(false);const incomplete={...original};delete (incomplete as Partial<typeof original>).introDetails;expect(snapshot.safeParse(incomplete).success).toBe(false)});

it('reads a running operation without changing its checkpoint', async()=>{
 const op=beginSection(createOperation(original.profileUrl,content,original),'intro');
 const values:Record<string,unknown>={};
 const set=async (items:Record<string,unknown>)=>{Object.assign(values,items)};
 const get=async (key:string)=>({[key]:values[key]});
 const old=globalThis.chrome;
 Object.assign(globalThis,{chrome:{storage:{local:{get,set}}}});
 try {
  const {persistOperation,loadOperation}=await import('./operation');
  await persistOperation(op);
  expect(await loadOperation(original.profileUrl)).toEqual(op);
  expect(Object.values(values)).toEqual([op]);
 } finally {Object.assign(globalThis,{chrome:old})}
});
