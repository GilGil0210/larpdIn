import {describe,it,expect,vi} from 'vitest';
import {planEducation,planEducationRestore,runEducation,type EducationPort} from './educationSwitch';
const url='https://www.linkedin.com/in/example/';
const edu={school:'Old',degree:'',fieldOfStudy:'',startYear:2020,endYear:null,grade:'',activities:'',description:''};
const record={...edu,id:'old-id',startMonth:null,endMonth:null,skills:[],media:[],attachmentsInspected:true};
const original={profileUrl:url,capturedAt:'2026-01-01T00:00:00.000Z',content:{headline:'',location:'',industry:'',about:'',education:[edu]},introDetails:{firstName:'',lastName:'',additionalName:'',pronouns:'',education:'',headline:'',country:'',city:'',industry:''},educationRecordIds:['old-id'],educationRecords:[record],ownershipVerified:true as const,introCaptured:true as const,aboutCaptured:true as const,educationListCaptured:true as const};
const target=[{...edu,school:'New',startMonth:null,endMonth:null}];
const port=():EducationPort=>{let current=[{...edu,startMonth:null,endMonth:null}];return {preflight:vi.fn(async()=>{}),deleteRecord:vi.fn(async()=>{current=[]}),editRecord:vi.fn(async(_id,_before,item)=>{current=[item]}),addRecord:vi.fn(async item=>{current=[...current,item]}),readRecords:vi.fn(async()=>current)}};
describe('education replacement',()=>{
 it('persists an edit before submission and verifies the result',async()=>{const api=port(),events:string[]=[];const edit=api.editRecord;api.editRecord=vi.fn(async(id,before,item)=>{events.push('edit');await edit(id,before,item)});const result=await runEducation(planEducation('op',url,original,target),original,target,api,async p=>{events.push(`persist:${p.inFlight?.kind ?? p.status}`)});expect(result.status).toBe('complete');expect(events).toEqual(['persist:edit','edit','persist:running','persist:complete']);expect(api.deleteRecord).not.toHaveBeenCalled()});
 it('retains unchanged records and adds before deleting surplus records',()=>{const unchanged={...edu,startMonth:null,endMonth:null};const same=planEducation('op',url,original,[unchanged]);expect(same.steps).toEqual([]);const added=planEducation('op',url,original,[unchanged,{...unchanged,school:'New'}]);expect(added.steps.map(x=>x.kind)).toEqual(['add']);expect(planEducation('op',url,original,[]).steps.map(x=>x.kind)).toEqual(['delete'])});
 it('stops and refuses replay after an uncertain edit',async()=>{const api=port();api.editRecord=vi.fn(async()=>{throw Error('connection lost')});const result=await runEducation(planEducation('op',url,original,target),original,target,api,async()=>{});expect(result.status).toBe('uncertain');expect(result.inFlight?.kind).toBe('edit');expect(api.addRecord).not.toHaveBeenCalled();await expect(runEducation(result,original,target,api,async()=>{})).rejects.toThrow()});
 it('marks a verification mismatch uncertain',async()=>{const api=port();api.readRecords=vi.fn().mockResolvedValue([{...edu,startMonth:null,endMonth:null}]);const result=await runEducation(planEducation('op',url,original,target),original,target,api,async()=>{});expect(result.status).toBe('uncertain');expect(api.addRecord).not.toHaveBeenCalled()});
 it('does not submit when persistence fails',async()=>{const api=port();await expect(runEducation(planEducation('op',url,original,target),original,target,api,async()=>{throw Error('disk')})).rejects.toThrow();expect(api.editRecord).not.toHaveBeenCalled()});
});

it('builds a restore target with captured months',()=>{const destination={...original,educationRecords:[{...record,startMonth:9,endMonth:6}]};const {target,plan}=planEducationRestore('restore',original,destination);expect(target[0]).toMatchObject({startMonth:9,endMonth:6});expect(plan.steps[0]).toMatchObject({kind:'edit',record:{startMonth:9,endMonth:6}})});
it('does not declare completion when LinkedIn returns the same records in a different order',async()=>{
 const first={...edu,startMonth:null,endMonth:null},second={...first,school:'Second'};
 const two={...original,content:{...original.content,education:[edu,{...edu,school:'Second'}]},educationRecordIds:['old-id','two'],educationRecords:[record,{...record,id:'two',school:'Second'}]};
 const api:EducationPort={preflight:async()=>{},editRecord:async()=>{},deleteRecord:async()=>{},addRecord:async()=>{},readRecords:async()=>[second,first]};
 const result=await runEducation(planEducation('op',url,two,[first,second]),two,[first,second],api,async()=>{});expect(result.status).toBe('uncertain');expect(result.error).toContain('order');
});
