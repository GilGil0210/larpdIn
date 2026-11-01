import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createOperation,beginSection,finishSection} from './operation';
import {saveOriginal,loadHistory,commitSwitch} from './history';
const content={headline:'',location:'',industry:'',about:'',education:[]};
const url='https://www.linkedin.com/in/example/';
const snap={profileUrl:url,capturedAt:'2026-01-01T00:00:00.000Z',content,introDetails:{firstName:'',lastName:'',additionalName:'',pronouns:'',education:'',headline:'',country:'',city:'',industry:''},educationRecordIds:[],educationRecords:[],ownershipVerified:true as const,introCaptured:true as const,aboutCaptured:true as const,educationListCaptured:true as const};
const persona='00000000-0000-4000-8000-000000000000';
beforeEach(()=>{const data:Record<string,unknown>={};vi.stubGlobal('chrome',{storage:{local:{get:async(key:string)=>({[key]:data[key]}),set:async(values:Record<string,unknown>)=>{Object.assign(data,values)}}}})});
describe('profile history',()=>{
 it('preserves the first original and separates profiles',async()=>{await saveOriginal(snap);await saveOriginal({...snap,content:{...content,headline:'later'},introDetails:{...snap.introDetails,headline:'later'}});expect((await loadHistory(url))?.original.content.headline).toBe('');expect(await loadHistory('https://www.linkedin.com/in/other/')).toBeNull()});
 it('only records undo and active persona after verification',async()=>{await saveOriginal(snap);let op=createOperation(url,content,snap);await expect(commitSwitch(op,persona)).rejects.toThrow();for(const section of ['intro','about','education'] as const){op=beginSection(op,section);op=finishSection(op,section,'verified')}const result=await commitSwitch(op,persona);expect(result.activePersonaId).toBe(persona);expect(result.undo).toEqual(snap)});
});
